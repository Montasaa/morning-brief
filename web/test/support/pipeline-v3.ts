// Helpers for testing the v3 gathering tool (pipeline/v3/edition_v3.py) against
// the in-process test app. The tool is a separate program, as on the VPS, so the
// tests run it as a child process and let it talk HTTP to a local bridge that
// hands each request to the test app's route handlers. Nothing leaves 127.0.0.1.
import { execFile, type ExecFileException } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_BASE_PATH, type TestApp } from "./test-app";

export const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const pipelineTool = path.join(repoRoot, "pipeline", "v3", "edition_v3.py");

export interface Served {
  /** The app's URL including its base path, e.g. http://127.0.0.1:41234/brief */
  appUrl: string;
  /** How many requests reached the bridge, by "METHOD /path". */
  calls: string[];
  close(): Promise<void>;
}

/** Serve the test app over HTTP on 127.0.0.1, so a separate program can call its web API. */
export async function serveApp(app: TestApp): Promise<Served> {
  const calls: string[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const url = req.url ?? "/";
      calls.push(`${req.method} ${url.split("?")[0]}`);
      if (!url.startsWith(TEST_BASE_PATH + "/")) {
        res.writeHead(404).end("Not under the app");
        return;
      }
      const headers: Record<string, string> = {};
      for (const name of ["authorization", "content-type", "accept"]) {
        const value = req.headers[name];
        if (typeof value === "string") headers[name] = value;
      }
      const body = Buffer.concat(chunks).toString("utf8");
      app
        .request(req.method ?? "GET", url.slice(TEST_BASE_PATH.length), {
          headers,
          rawBody: body.length ? body : undefined,
        })
        .then((r) => {
          res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "text/plain" });
          res.end(r.text);
        })
        .catch((error: unknown) => {
          res.writeHead(500).end(String(error));
        });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    appUrl: `http://127.0.0.1:${port}${TEST_BASE_PATH}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface ToolRun {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run the gathering tool with `args`. The environment is minimal on purpose:
 * only PATH plus what the test passes, so a secret can only come from `env`.
 */
export function runTool(args: string[], env: Record<string, string> = {}): Promise<ToolRun> {
  return new Promise((resolve) => {
    execFile(
      "python3",
      [pipelineTool, ...args],
      {
        env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", PYTHONDONTWRITEBYTECODE: "1", ...env },
        timeout: 60_000,
        encoding: "utf8",
      },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

/** A scratch folder for one test's drafts, state and output; removed by `cleanup`. */
export function scratchDir(): { dir: string; write(name: string, data: unknown): string; read(name: string): any; cleanup(): void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "morning-brief-pipeline-"));
  return {
    dir,
    write(name, data) {
      const file = path.join(dir, name);
      writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 2));
      return file;
    },
    read(name) {
      return JSON.parse(readFileSync(path.join(dir, name), "utf8"));
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A gathered Item draft, as the agent writes it: no status (the tool sets it). */
export function draftItem(id: string, topics: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    topics,
    time: "2026-11-14T05:00:00+03:00",
    title: `Story ${id}`,
    title_ar: `خبر ${id}`,
    summary: `What happened in ${id}.`,
    summary_ar: `ما حدث في ${id}.`,
    sources: [{ title: "Example Daily", url: `https://example.com/news/${id}`, type: "independent" }],
    image: `https://example.com/img/${id}.jpg`,
    ...extra,
  };
}

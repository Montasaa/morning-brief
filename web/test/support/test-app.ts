// The API-seam test harness. Each test starts the app in-process against a
// fresh scratch SQLite database, with every outside service replaced by fakes,
// and drives it only through its web API (the route handlers under src/app/api).
//
//   const app = await startTestApp();
//   await app.postEdition(morningEdition());
//   const res = await app.request("GET", "/api/brief");
//
// See web/DEVELOPING.md for the conventions.
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAppContext, setAppContext, type AppContext } from "@/server/app";
import { fakeOutsideServices, type FakeOutsideServices } from "@/server/outside/fakes";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const apiRoot = path.join(webRoot, "src", "app", "api");

export const TEST_INGEST_TOKEN = "test-ingest-token";
export const TEST_BASE_PATH = "/brief";

export interface TestResponse {
  status: number;
  headers: Headers;
  /** Parsed JSON body, or null when the body is empty or not JSON. */
  body: any;
  text: string;
}

export interface RequestOptions {
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as-is (for malformed-body tests). */
  rawBody?: string;
  /** Sent as `Authorization: Bearer <token>`. */
  token?: string;
  headers?: Record<string, string>;
}

export interface TestApp {
  ctx: AppContext;
  services: FakeOutsideServices;
  ingestToken: string;
  /** Call the app's web API. `path` is relative to the base path, e.g. "/api/brief?x=1". */
  request(method: string, path: string, options?: RequestOptions): Promise<TestResponse>;
  /** Post an Edition to the ingest endpoint with the pipeline's bearer token. */
  postEdition(edition: unknown): Promise<TestResponse>;
  close(): void;
}

export interface TestAppOptions {
  /** Defaults to TEST_INGEST_TOKEN. Pass "" to run with no token configured. */
  ingestToken?: string;
}

const open: TestApp[] = [];

export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "morning-brief-test-"));
  const services = fakeOutsideServices();
  const ingestToken = options.ingestToken ?? TEST_INGEST_TOKEN;
  const ctx = createAppContext({
    config: { databasePath: path.join(dir, "brief.db"), ingestToken, basePath: TEST_BASE_PATH },
    services,
  });
  setAppContext(ctx);

  let closed = false;
  const app: TestApp = {
    ctx,
    services,
    ingestToken,
    request: (method, p, opts) => callRoute(method, p, opts),
    postEdition: (edition) => callRoute("POST", "/api/editions", { body: edition, token: ingestToken }),
    close() {
      if (closed) return;
      closed = true;
      setAppContext(null);
      ctx.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  open.push(app);
  return app;
}

/** Called after every test by test/support/setup.ts. */
export function closeAllTestApps(): void {
  while (open.length) open.pop()!.close();
}

// --- in-process routing over src/app/api/**/route.ts -------------------------

interface RouteFile {
  file: string;
  segments: string[]; // e.g. ["api", "items", "[id]", "reactions"]
}

let routeFiles: RouteFile[] | null = null;

function findRouteFiles(dir: string, segments: string[]): RouteFile[] {
  const found: RouteFile[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      // Route groups like (owner) do not add a URL segment.
      const next = /^\(.*\)$/.test(name) ? segments : [...segments, name];
      found.push(...findRouteFiles(full, next));
    } else if (name === "route.ts") {
      found.push({ file: full, segments });
    }
  }
  return found;
}

function matchRoute(urlPath: string): { route: RouteFile; params: Record<string, string | string[]> } | null {
  routeFiles ??= findRouteFiles(apiRoot, ["api"]);
  const parts = urlPath.split("/").filter(Boolean).map(decodeURIComponent);
  // Static segments win over dynamic ones, as in Next.js.
  const ranked = [...routeFiles].sort(
    (a, b) => a.segments.filter((s) => s.startsWith("[")).length - b.segments.filter((s) => s.startsWith("[")).length,
  );
  for (const route of ranked) {
    const params: Record<string, string | string[]> = {};
    let ok = true;
    let i = 0;
    for (const seg of route.segments) {
      const catchAll = /^\[\.\.\.(.+)\]$/.exec(seg);
      const dynamic = /^\[(.+)\]$/.exec(seg);
      if (catchAll) {
        params[catchAll[1]!] = parts.slice(i);
        i = parts.length;
        break;
      }
      const part = parts[i++];
      if (part === undefined) ok = false;
      else if (dynamic) params[dynamic[1]!] = part;
      else if (seg !== part) ok = false;
      if (!ok) break;
    }
    if (ok && i === parts.length) return { route, params };
  }
  return null;
}

async function callRoute(method: string, pathAndQuery: string, opts: RequestOptions = {}): Promise<TestResponse> {
  const url = new URL(TEST_BASE_PATH + pathAndQuery, "http://brief.test");
  const match = matchRoute(pathAndQuery.split("?")[0]!);
  if (!match) return toTestResponse(new Response("Not found", { status: 404 }));

  const mod: Record<string, unknown> = await import(match.route.file);
  const handler = mod[method.toUpperCase()];
  if (typeof handler !== "function") return toTestResponse(new Response("Method not allowed", { status: 405 }));

  const headers = new Headers(opts.headers);
  let body: string | undefined;
  if (opts.rawBody !== undefined) body = opts.rawBody;
  else if (opts.body !== undefined) body = JSON.stringify(opts.body);
  if (body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (opts.token !== undefined) headers.set("authorization", `Bearer ${opts.token}`);

  const req = new Request(url, { method: method.toUpperCase(), headers, body });
  const res: Response = await handler(req, { params: Promise.resolve(match.params) });
  return toTestResponse(res);
}

async function toTestResponse(res: Response): Promise<TestResponse> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, headers: res.headers, body, text };
}

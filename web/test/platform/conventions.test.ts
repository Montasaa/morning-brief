import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { basePathFrom, configFromEnv } from "@/server/config";
import { migrate, openDatabase } from "@/server/db";
import { startTestApp } from "../support/test-app";

describe("base path", () => {
  it("defaults to /brief and is configurable through BASE_PATH", () => {
    expect(basePathFrom({})).toBe("/brief");
    expect(basePathFrom({ BASE_PATH: "/news/" })).toBe("/news");
    expect(basePathFrom({ BASE_PATH: "morning" })).toBe("/morning");
    expect(basePathFrom({ BASE_PATH: "/" })).toBe("");
  });
});

describe("secrets", () => {
  it("come only from the environment, with no default ingest token", () => {
    expect(configFromEnv({}).ingestToken).toBe("");
    expect(configFromEnv({ INGEST_TOKEN: "from-env" }).ingestToken).toBe("from-env");
  });
});

describe("sign-in configuration", () => {
  it("reads the Owner's email and the public origin from the environment, normalised", () => {
    expect(configFromEnv({})).toMatchObject({ ownerEmail: "", publicOrigin: "" });
    expect(configFromEnv({ OWNER_EMAIL: " Owner@Example.com ", PUBLIC_ORIGIN: "https://example.com/" })).toMatchObject({
      ownerEmail: "owner@example.com",
      publicOrigin: "https://example.com",
    });
  });
});

describe("migrations", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  function tempDir(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "morning-brief-migrations-"));
    dirs.push(dir);
    return dir;
  }

  it("applies tNN_<slug>.sql files once each, in lexical order, tracked by filename", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "t02_b.sql"), "INSERT INTO log VALUES ('t02');");
    writeFileSync(path.join(dir, "t01_a.sql"), "CREATE TABLE log (name TEXT); INSERT INTO log VALUES ('t01');");
    writeFileSync(path.join(dir, "notes.txt"), "not a migration");
    const db = openDatabase(path.join(dir, "db.sqlite"), dir);

    writeFileSync(path.join(dir, "t10_c.sql"), "INSERT INTO log VALUES ('t10');");
    expect(migrate(db, dir)).toEqual(["t10_c.sql"]);
    expect(migrate(db, dir)).toEqual([]);

    expect(db.prepare("SELECT name FROM log").pluck().all()).toEqual(["t01", "t02", "t10"]);
    db.close();
  });

  it("rolls back a failing migration and leaves it unapplied", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "t01_a.sql"), "CREATE TABLE ok (x); CREATE TABLE broken (;");
    expect(() => openDatabase(path.join(dir, "db.sqlite"), dir)).toThrow();

    writeFileSync(path.join(dir, "t01_a.sql"), "CREATE TABLE ok (x);");
    const db = openDatabase(path.join(dir, "db.sqlite"), dir);
    expect(db.prepare("SELECT COUNT(*) FROM ok").pluck().get()).toBe(0);
    db.close();
  });

  it("applies the real migrations to a fresh database", () => {
    const db = openDatabase(":memory:");
    expect(migrate(db)).toEqual([]); // all already applied on open
    db.close();
  });
});

describe("outside services in tests", () => {
  it("are fakes that record calls, and any real network call fails the test", async () => {
    const app = await startTestApp();

    await app.ctx.services.email.send({ to: "reader@example.com", subject: "Hi", text: "Hello" });
    const reply = await app.ctx.services.claude.complete({ purpose: "ask", messages: [{ role: "user", content: "?" }] });

    expect(app.services.email.outbox).toHaveLength(1);
    expect(reply.text).toMatch(/Fake Claude/);
    expect(() => fetch("https://api.anthropic.com")).toThrow(/Real network call/);
  });
});

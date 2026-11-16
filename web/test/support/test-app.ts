// The API-seam test harness. Each test starts the app in-process against a
// fresh scratch SQLite database, with every outside service replaced by fakes,
// and drives it only through its web API (the route handlers under src/app/api).
//
//   const app = await startTestApp();
//   await app.postEdition(morningEdition());
//   const owner = await app.signInAsOwner();          // onboarded, following (and opted into) every Catalog Topic
//   const res = await owner.request("GET", "/api/brief");
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
/** The Owner every test app is set up with (OWNER_EMAIL). */
export const TEST_OWNER_EMAIL = "owner@example.com";
/**
 * The password the helpers use: the Owner chooses it on their first sign-in,
 * and addReader() gives it to every Reader it adds.
 */
export const TEST_PASSWORD = "correct horse battery";

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
  /** Sent as the `Cookie` header, e.g. a signed-in session's cookie. */
  cookie?: string;
}

/** A signed-in device: every request it makes carries its session cookie. */
export interface TestSession {
  email: string;
  /** `name=value` of the session cookie, as a browser would send it back. */
  cookie: string;
  request(method: string, path: string, options?: RequestOptions): Promise<TestResponse>;
}

export interface TestApp {
  ctx: AppContext;
  services: FakeOutsideServices;
  ingestToken: string;
  /** Call the app's web API. `path` is relative to the base path, e.g. "/api/brief?x=1". */
  request(method: string, path: string, options?: RequestOptions): Promise<TestResponse>;
  /** Post an Edition to the ingest endpoint with the pipeline's bearer token. */
  postEdition(edition: unknown): Promise<TestResponse>;
  /**
   * Sign in the way a Reader does: POST /api/auth/sign-in with `email` and its
   * password (TEST_PASSWORD unless `options.password` says otherwise), and keep
   * the session cookie. The Owner's first sign-in chooses their password on the
   * way (POST /api/auth/first-password), as the sign-in page offers. Throws if
   * the sign-in is refused.
   *
   * A Reader who has not been through onboarding yet finishes it straight away
   * (through PATCH /api/me), following every Catalog Topic (opted into the
   * Sensitive ones with the 18+ confirmation, as the Me tab does), so their Brief is
   * the whole Edition. Pass `{ onboarded: false }` to stay on the first visit.
   * A Reader who already finished onboarding is left as they are.
   */
  signIn(email: string, options?: SignInOptions): Promise<TestSession>;
  /** signIn() as the Owner (TEST_OWNER_EMAIL). */
  signInAsOwner(options?: SignInOptions): Promise<TestSession>;
  /**
   * The Owner adds `email` as a Reader with TEST_PASSWORD (or `options.password`) on the
   * Invites API, then that Reader signs in. The usual way to get a second Reader.
   */
  addReader(email: string, options?: SignInOptions): Promise<TestSession>;
  close(): void;
}

export interface SignInOptions {
  /** Finish onboarding (following every Catalog Topic) if this Reader has not yet. Default true. */
  onboarded?: boolean;
  /** The password to sign in with (and, for addReader, to give them). Default TEST_PASSWORD. */
  password?: string;
}

export interface TestAppOptions {
  /** Defaults to TEST_INGEST_TOKEN. Pass "" to run with no token configured. */
  ingestToken?: string;
  /** Defaults to TEST_OWNER_EMAIL. Pass "" to start with no Owner. */
  ownerEmail?: string;
  /** PUBLIC_ORIGIN. Defaults to "" (the request's origin, http://brief.test, decides on Secure cookies). */
  publicOrigin?: string;
}

const open: TestApp[] = [];

export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "morning-brief-test-"));
  const services = fakeOutsideServices();
  const ingestToken = options.ingestToken ?? TEST_INGEST_TOKEN;
  const ctx = createAppContext({
    config: {
      databasePath: path.join(dir, "brief.db"),
      ingestToken,
      basePath: TEST_BASE_PATH,
      ownerEmail: options.ownerEmail ?? TEST_OWNER_EMAIL,
      publicOrigin: options.publicOrigin ?? "",
      // Cheap hashes keep the suite fast; production uses PASSWORD_COST (2^15).
      passwordCost: 2 ** 10,
    },
    services,
  });
  setAppContext(ctx);

  const ownerEmail = options.ownerEmail ?? TEST_OWNER_EMAIL;
  let ownerHasPassword = false;
  const signIn = async (email: string, { onboarded = true, password = TEST_PASSWORD }: SignInOptions = {}): Promise<TestSession> => {
    const isOwner = !!ownerEmail && email.trim().toLowerCase() === ownerEmail;
    let res: TestResponse | null = null;
    if (isOwner && !ownerHasPassword) {
      // The Owner's first visit: choose the password on the sign-in page.
      const first = await callRoute("POST", "/api/auth/first-password", {
        body: { email, password, confirm_password: password },
      });
      if (first.status === 200) res = first;
    }
    res ??= await callRoute("POST", "/api/auth/sign-in", { body: { email, password } });
    if (isOwner && res.status === 200) ownerHasPassword = true;
    const cookie = sessionCookie(res);
    if (res.status !== 200 || !cookie) throw new Error(`Signing in ${email} failed: ${res.status} ${res.text}`);
    const session: TestSession = {
      email,
      cookie,
      request: (method, p, opts) => callRoute(method, p, { cookie, ...opts }),
    };
    if (onboarded) await finishOnboarding(session);
    return session;
  };

  let closed = false;
  const app: TestApp = {
    ctx,
    services,
    ingestToken,
    request: (method, p, opts) => callRoute(method, p, opts),
    postEdition: (edition) => callRoute("POST", "/api/editions", { body: edition, token: ingestToken }),
    signIn,
    signInAsOwner: (opts) => signIn(ownerEmail || TEST_OWNER_EMAIL, opts),
    async addReader(email, opts) {
      const owner = await signIn(ownerEmail || TEST_OWNER_EMAIL);
      const password = opts?.password ?? TEST_PASSWORD;
      const added = await owner.request("POST", "/api/invites", { body: { email, password } });
      if (added.status !== 201) throw new Error(`Adding ${email} failed: ${added.status} ${added.text}`);
      return signIn(email, opts);
    },
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

/**
 * A first-time Reader finishes onboarding following every Catalog Topic; anyone
 * else is left alone. Sensitive Topics cannot be picked in onboarding, so they
 * are opted into afterwards the way the Me tab does (with the 18+ confirmation).
 */
async function finishOnboarding(session: TestSession): Promise<void> {
  const me = await session.request("GET", "/api/me");
  if (me.status !== 200) throw new Error(`GET /api/me failed for ${session.email}: ${me.status} ${me.text}`);
  if (me.body.onboarded) return;
  const catalog = (await session.request("GET", "/api/topics")).body.topics as { id: string; sensitive: boolean }[];
  const topics = catalog.filter((t) => !t.sensitive).map((t) => t.id);
  const done = await session.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  if (done.status !== 200) throw new Error(`Onboarding ${session.email} failed: ${done.status} ${done.text}`);
  for (const topic of catalog.filter((t) => t.sensitive)) {
    const optIn = await session.request("POST", `/api/topics/${topic.id}/follow`, { body: { age_confirmed: true } });
    if (optIn.status !== 200) throw new Error(`Opting ${session.email} into ${topic.id} failed: ${optIn.status} ${optIn.text}`);
  }
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
  if (opts.cookie !== undefined) headers.set("cookie", opts.cookie);

  const req = new Request(url, { method: method.toUpperCase(), headers, body });
  const res: Response = await handler(req, { params: Promise.resolve(match.params) });
  return toTestResponse(res);
}

/** The `name=value` of a session cookie the response sets (not one it clears), or null. */
export function sessionCookie(res: TestResponse): string | null {
  for (const header of res.headers.getSetCookie()) {
    const [pair = "", ...attributes] = header.split(";").map((p) => p.trim());
    const cleared = attributes.some((a) => /^max-age=0$/i.test(a)) || pair.endsWith("=");
    if (/^mb_session=/.test(pair) && !cleared) return pair;
  }
  return null;
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

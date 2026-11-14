# Developing the Morning Brief app

The v3 app: Next.js (App Router, TypeScript) with SQLite, in `web/` ([ADR 0001](../docs/adr/0001-replace-glance-with-nextjs-sqlite.md)). The spec is [`docs/specs/morning-brief-v3.md`](../docs/specs/morning-brief-v3.md). Use the words in [`GLOSSARY.md`](../GLOSSARY.md) in code, tests and UI: Edition, Brief, Item, Topic, Reader, Owner, Story Thread, Reaction, Widget. Do not use feed, article, section, user or admin.

This is Next.js 16: check APIs against the docs that ship with the installed version in `node_modules/next/dist/docs/` rather than memory. (`next dev` writes an `AGENTS.md` saying the same; it is gitignored.)

Everything below is a convention every ticket follows.

## Commands

Run them from `web/`. Node 22.12 or newer.

| What | Command |
| --- | --- |
| Install | `npm ci` |
| Typecheck | `npm run typecheck` |
| One test file | `npm run test:file -- test/api/editions.test.ts` (add `-t "name"` for one test) |
| Full suite | `npm test` |
| Browser smoke (phone size) | `npm run test:e2e` |
| All of the above | `npm run check` |
| Dev server | `INGEST_TOKEN=dev OUTSIDE_SERVICES=fake npm run dev`, then open http://localhost:3000/brief |

Typecheck, the full suite and the browser smoke must pass before a ticket is done.

## Layout

```
web/
  migrations/           tNN_<slug>.sql, applied in order at start-up
  src/app/              pages and route handlers (src/app/api/**/route.ts)
  src/server/           the modules: app context, db, editions, brief, outside
  test/api/             API-seam tests, one file per area
  test/support/         the test harness (startTestApp) and fixture helpers
  test/fixtures/        hand-written Edition documents
  e2e/                  Playwright smoke tests
../schema/edition.v3.schema.json   the Edition v3 contract (next to the v2 schema)
```

Route handlers stay thin: they check access, parse the request, call one module and return JSON. Behaviour lives in `src/server/`.

## Configuration and secrets

All configuration comes from environment variables. `.env.example` lists them. Secrets (`INGEST_TOKEN`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, VAPID keys) are never committed, defaulted or logged.

- `BASE_PATH`: the path the app is served under (default `/brief`). It is read at build time, so links and assets must go through Next.js (`<Link>`, `next/image`, `basePath`-aware fetches) and never hard-code `/brief`.
- `DATABASE_PATH`: the SQLite file (default `data/brief.db`).
- `INGEST_TOKEN`: the bearer token for pipeline routes. Unset means every pipeline call is refused.
- `OUTSIDE_SERVICES=fake`: use the fakes instead of the real services (e2e server and local demos only).

## The database and migrations

- Migrations are hand-written SQL files in `web/migrations/`, named `tNN_<slug>.sql`, where `NN` is the ticket number (`t01_editions_items.sql`, `t06_readers_sessions.sql`). A ticket may add more than one (`t09_reactions.sql`, `t09_scores.sql`).
- They are applied in lexical filename order, each in its own transaction, when the database opens. Applied files are tracked by filename in `schema_migrations`, so branches built in parallel never collide.
- Never edit a migration that has been merged. Add a new file.
- A later ticket's migration may only rely on tables from tickets it is blocked by.

## Outside services

Claude, Resend (email), Open-Meteo (weather), Aladhan (prayer times) and Web Push sit behind one boundary: the `OutsideServices` interface in `src/server/outside/index.ts`. App code reaches them only through `getAppContext().services`, never by calling `fetch` or an SDK directly.

- `src/server/outside/fakes.ts` holds a fake for each: a Claude with canned replies by `purpose` (and a switch to make it fail), a Resend outbox, fixed weather and prayer times, and a push recorder. Tests read what the app sent from them (`app.services.email.outbox`, `app.services.push.sent`).
- The real adapters are not connected yet and throw `OutsideServiceNotConnected`. The ticket that first needs a service writes its real adapter in `src/server/outside/`, reading its secret from the environment, and may extend that service's interface additively, updating the fake in the same change.
- Tests make no real network calls. `test/support/setup.ts` replaces `fetch` with one that fails the test.

## Tests

Tests check behaviour you can see from outside, not implementation ([spec: Testing Decisions](../docs/specs/morning-brief-v3.md#testing-decisions)). They do not query tables, call internal functions or assert on scorer weights. Write them first (red, then green), one slice at a time.

### The API seam (primary)

Each test starts the whole app in-process against a fresh scratch SQLite database with every outside service faked, and drives it only through the web API:

```ts
import { morningEdition } from "../support/fixtures";
import { startTestApp } from "../support/test-app";

it("returns the latest Edition's Items newest first", async () => {
  const app = await startTestApp();
  await app.postEdition(morningEdition());          // POST /api/editions with the bearer token

  const res = await app.request("GET", "/api/brief"); // { status, body, headers, text }

  expect(res.body.items.map((i) => i.id)).toEqual([...]);
});
```

- `startTestApp()` creates a scratch database in a temp folder, applies the migrations, installs the fakes and returns the app. It is closed and deleted after each test.
- `app.request(method, path, { body, token, headers, rawBody })` calls the route handler under `src/app/api` that matches the path, in-process, just as Next.js would (dynamic `[id]` segments and route groups work). A new route file needs no registration.
- Set up state only through public endpoints: post Editions to the ingest endpoint, act as Readers through signed-in sessions (ticket 06 adds a helper for this).
- Fixtures: `test/fixtures/edition.morning.json` is a valid hand-written Edition (5 Items across 6 Topics, 1 Story Thread). Tests copy it with `morningEdition()` and change what they need.

### The browser seam (thin)

Playwright at phone size (Pixel 7, Chromium) in `e2e/`, against `next dev` with a fresh `.e2e/` database and `OUTSIDE_SERVICES=fake`. Tests set up data through the API (post an Edition with the e2e token from `playwright.config.ts`), then use the page. Only smoke flows go here, never ranking. Ticket 03 owns this harness and extends it.

## The Edition v3 contract

`schema/edition.v3.schema.json` (draft 2020-12, closed objects) is what the gathering side validates against and what `POST /api/editions` enforces, followed by cross-reference checks the schema cannot express (unique Item and Thread ids, `thread_id` and `top_stories` must point inside the Edition). `src/server/editions/types.ts` mirrors it in TypeScript. Change both together, and only additively, so Editions already posted stay valid.

Ingest is all-or-nothing and idempotent:

- A valid Edition is stored in one transaction and the response is `200 {accepted: true, edition_id, counts: {items, threads, topics}}`.
- An invalid one gets `422 {accepted: false, reasons: [...]}` and nothing is stored. A missing or wrong token gets `401`.
- Items are upserted by stable id. The stored version is the one from the newest Edition (by `generated_at`) that carried it, so posting an older Edition late never overwrites newer facts.
- A Brief is built from the latest Edition alone (each Edition is complete).

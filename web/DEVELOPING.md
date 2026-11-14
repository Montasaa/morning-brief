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
| Dev server | `INGEST_TOKEN=dev OWNER_EMAIL=you@example.com OUTSIDE_SERVICES=fake FAKE_OUTBOX_FILE=data/outbox.jsonl npm run dev`, then open http://localhost:3000/brief, ask for a sign-in link and open the one written to `data/outbox.jsonl` |

Typecheck, the full suite and the browser smoke must pass before a ticket is done.

## Layout

```
web/
  migrations/           tNN_<slug>.sql, applied in order at start-up
  src/app/              pages and route handlers (src/app/api/**/route.ts)
  src/app/_components/  UI components and their CSS modules (not routed)
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
- `OUTSIDE_SERVICES=fake`: use the fakes instead of the real services (e2e server and local demos only). `FAKE_OUTBOX_FILE` makes the fake Resend also append each email to a file, so you can open magic links locally.
- `OWNER_EMAIL`: the Owner, created at setup (when the database opens and no Owner exists yet). Never through an Invite.
- `PUBLIC_ORIGIN`: the origin magic links point at (e.g. `https://example.com`). Set it in production; without it, links use the request's Host header. An `https` origin makes the session cookie `Secure`.
- `RESEND_API_KEY` and `EMAIL_FROM`: the Resend adapter (sign-in and Invite emails). Unset means email is not connected.

## Access: who may call what

Every route handler checks access first, with the helpers in `src/server/access.ts`:

- **Reader routes** need a signed-in session: `const access = readerAccess(ctx, req); if (!access.ok) return access.response;` then use `access.reader` (`{ id, email, role }`). Signed out is `401`.
- **Owner routes** use `ownerAccess(ctx, req)` the same way: `401` signed out, `403` for other Readers.
- **Pipeline routes** (`/api/editions`, `/api/gathering-list`) keep the bearer token (`hasPipelineToken`), never a session.
- **Pages** call `requireReaderPage()` (`src/server/readers/page-session.ts`), which redirects signed-out visitors to `/sign-in`.

Sessions are an HttpOnly `mb_session` cookie (one per device, a year long, scoped to the base path); only token hashes are stored. Plain HTML forms posting to the auth routes get a `303` redirect back, JSON callers get JSON.

## The database and migrations

- Migrations are hand-written SQL files in `web/migrations/`, named `tNN_<slug>.sql`, where `NN` is the ticket number (`t01_editions_items.sql`, `t06_readers_sessions.sql`). A ticket may add more than one (`t09_reactions.sql`, `t09_scores.sql`).
- They are applied in lexical filename order, each in its own transaction, when the database opens. Applied files are tracked by filename in `schema_migrations`, so branches built in parallel never collide.
- Never edit a migration that has been merged. Add a new file.
- A later ticket's migration may only rely on tables from tickets it is blocked by.

## Outside services

Claude, Resend (email), Open-Meteo (weather), Aladhan (prayer times) and Web Push sit behind one boundary: the `OutsideServices` interface in `src/server/outside/index.ts`. App code reaches them only through `getAppContext().services`, never by calling `fetch` or an SDK directly.

- `src/server/outside/fakes.ts` holds a fake for each: a Claude with canned replies by `purpose` (and a switch to make it fail), a Resend outbox, fixed weather and prayer times, and a push recorder. Tests read what the app sent from them (`app.services.email.outbox`, `app.services.push.sent`).
- The real adapters are not connected yet and throw `OutsideServiceNotConnected`. The ticket that first needs a service writes its real adapter in `src/server/outside/`, reading its secret from the environment, and may extend that service's interface additively, updating the fake in the same change.
- Resend is connected (ticket 06, `src/server/outside/resend.ts`). Real adapters take an injected `fetch` so `test/platform/` can check the requests they make without the network.
- Claude is connected (ticket 16, `src/server/outside/claude.ts`, `ANTHROPIC_API_KEY`): the official `@anthropic-ai/sdk` on Claude Opus 5.5 with adaptive thinking and server-side refusal fallbacks. `webSearch: true` turns on web search and web fetch, and the reply's `citations` are the cited search results plus the pages Claude fetched. Later Claude features call `services.claude.complete` with their own `purpose`; they do not need a second adapter.
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
  const owner = await app.signInAsOwner();          // a signed-in device

  const res = await owner.request("GET", "/api/brief"); // { status, body, headers, text }

  expect(res.body.items.map((i) => i.id)).toEqual([...]);
});
```

- `startTestApp()` creates a scratch database in a temp folder, applies the migrations, installs the fakes and returns the app. It is closed and deleted after each test.
- `app.request(method, path, { body, token, headers, rawBody, cookie })` calls the route handler under `src/app/api` that matches the path, in-process, just as Next.js would (dynamic `[id]` segments and route groups work). A new route file needs no registration.
- Set up state only through public endpoints: post Editions to the ingest endpoint, act as Readers through signed-in sessions. `app.request` is signed out.
- Signed-in Readers: `app.signInAsOwner()` (the test app's Owner is `TEST_OWNER_EMAIL`), `app.addReader(email)` (the Owner invites them, then they sign in) and `app.signIn(email)` each go through the real magic-link flow and return a session whose `request(...)` sends its cookie. Each call is a new device. `app.lastMagicLink(email)` and `app.openLink(url)` drive the flow by hand.
- Time: magic links and sessions read `Date.now()`, so `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime()` move the clock (restore with `vi.useRealTimers()`).
- Fixtures: `test/fixtures/edition.morning.json` is a valid hand-written Edition (5 Items across 6 Topics, 1 Story Thread). Tests copy it with `morningEdition()` and change what they need.

### The browser seam (thin)

Playwright at phone size (Pixel 7, Chromium) in `e2e/`, against `next dev` with a fresh `.e2e/` database and `OUTSIDE_SERVICES=fake`. Tests set up data through the API, sign in, then use the page. Only smoke flows go here, never ranking.

- Import `test`, `expect`, `E2E_BASE_PATH`, `signIn` and the helpers from `e2e/support.ts`, not from `@playwright/test`. Its `test` aborts every request that is not to the app itself (Item images on example.com and so on), so the browser makes no real network calls.
- Every screen but `/sign-in` needs a session: call `await signIn(page)` first (from `e2e/support/sign-in.ts`, re-exported by `e2e/support.ts`). It signs in as the Owner by default by opening the magic link the fake Resend wrote to `.e2e/outbox.jsonl`, and leaves the page on the Brief. The Owner's account bar (email, Invites, Sign out) is on the Me tab.
- `postEdition(request, edition)` posts with the e2e token. `swipeEdition()` is the morning fixture plus a US Markets and a game Item (7 Items, every kind of card extra). The database is fresh per run, not per test, so post the Edition your test needs in the test or a `beforeEach`.
- Tap the Swipe Brief's tap zones up on the picture (`tap({ position: { x: 40, y: 200 } })`): the card text sits over their lower half on purpose. Match buttons with `exact: true`.
- Fix the clock with `page.clock.setFixedTime(...)` before `page.goto` when a test reads relative times ("50m ago"). They are filled in after the page loads.
- `devIndicators` is off in `next.config.ts` because the Next.js dev badge covers the bottom tabs.

## Arabic and right to left

Every screen works in English and in Arabic, laid out right to left (ticket 04). The Brief carries both languages (Items keep their `_ar` fields; `topic_names_ar` names Topics from the Catalog), so switching language re-renders in place and never fetches again.

- The root layout reads the `brief_lang` cookie, renders `<html lang dir>` to match, and wraps the app in `LanguageProvider` (`src/app/_components/language.tsx`). Until the Interest Profile holds the language (ticket 07), the cookie is the only place it is kept; that ticket should save it to the profile and seed `LanguageProvider` from there.
- Write UI text in both languages: `const { lang, t } = useLanguage(); t("Save", "حفظ")` in client components, `<T en="Threads" ar="القصص المتواصلة" />` inside server components.
- Show Edition text with `localized(item, "title", lang)` from `src/app/_components/i18n.ts`: the `_ar` field in Arabic, English when it is missing. Put `dir="auto"` on such text so an English fallback still reads left to right.
- Dates, times and numbers go through `format.ts` / `formatNumber` (Arabic uses `ar-SA` on the Gregorian calendar, with Arabic-Indic digits).
- Lay out with logical CSS (`inset-inline-start`, `margin-inline-end`, ...), not `left`/`right`, and do not letter-space Arabic text. Forward is the end side: the tap zone on the left in Arabic, so keyboard navigation should map ArrowLeft to forward when `dir` is `rtl`.

## The Edition v3 contract

`schema/edition.v3.schema.json` (draft 2020-12, closed objects) is what the gathering side validates against and what `POST /api/editions` enforces, followed by cross-reference checks the schema cannot express (unique Item and Thread ids, `thread_id` and `top_stories` must point inside the Edition). `src/server/editions/types.ts` mirrors it in TypeScript. Change both together, and only additively, so Editions already posted stay valid.

Ingest is all-or-nothing and idempotent:

- A valid Edition is stored in one transaction and the response is `200 {accepted: true, edition_id, counts: {items, threads, topics}}`.
- An invalid one gets `422 {accepted: false, reasons: [...]}` and nothing is stored. A missing or wrong token gets `401`.
- Items are upserted by stable id. The stored version is the one from the newest Edition (by `generated_at`) that carried it, so posting an older Edition late never overwrites newer facts.
- A Brief is built from the latest Edition alone (each Edition is complete).

## The Catalog and the legacy importer

- The Catalog starts with the 14 starting Topics, seeded by `migrations/t02_topics.sql` (`GET /api/topics` lists them). Their ids (`saudi`, `wider-middle-east`, `turn-based-rpg-tactics`, `adult-trending`, ...) are what Editions put in `items[].topics`. Later tickets add columns to `topics` with their own migrations.
- `POST /api/editions/legacy` (pipeline token) imports a v2 / rev 2.x `brief.json`: `src/server/legacy/` converts it to an Edition v3 document and sends it through Edition ingest, so the response and the guarantees are the same. Add `?dry_run=1` to get the converted Edition back without storing it. Section-to-Topic mapping is in `src/server/legacy/topics.ts`; the Edition id comes from `generated_at` (`2026-11-14-morning`, `2026-11-14-evening`), so re-importing a file changes nothing.
- To give a local or deployed app real history, post the files oldest first:

  ```sh
  for f in ../samples/brief.sample.json ../brief.json; do
    curl -fsS -H "Authorization: Bearer $INGEST_TOKEN" -H 'content-type: application/json' \
      --data-binary @"$f" http://localhost:3000/brief/api/editions/legacy; echo
  done
  ```

  Older files from git history work too (`git show <commit>:brief.json > /tmp/old.json`).
- Tests use snapshots of the two files in `test/fixtures/legacy/` (`legacySample()`, `legacyToday()`), not the live root `brief.json`, which the old pipeline rewrites twice a day.

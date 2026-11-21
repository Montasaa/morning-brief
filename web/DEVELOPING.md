# Developing the Morning Brief app

The v3 app: Next.js (App Router, TypeScript) with SQLite, in `web/` ([ADR 0001](../docs/adr/0001-replace-glance-with-nextjs-sqlite.md)). The spec is [`docs/specs/morning-brief-v3.md`](../docs/specs/morning-brief-v3.md). Use the words in [`GLOSSARY.md`](../GLOSSARY.md) in code, tests and UI: Edition, Brief, Item, Topic, Reader, Owner, Story Thread, Reaction, Widget, Display, Layout, Cover, Pinned Topic, Collapsed Topic. Do not use feed, article, section, user, admin, settings (for the Display) or view/mode (for a Layout).

The UI is being reworked to [spec #6](https://github.com/Montasaa/morning-brief/issues/6) (the Reels look, Layouts and Display), in tickets #7 to #11. It replaces the v3 spec's UI decisions; see [Display and the Reels look](#display-and-the-reels-look).

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
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`: Web Push (ticket 18). `.env.example` has the one-liner that makes a key pair.

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
- The rework tickets (#7 to #11, spec #6) are numbered by their GitHub issue, so their numbers repeat the build plan's (`t07_reader_displays.sql` sits next to `t07_interest_profiles.sql`). Lexical order is still the order on a fresh database: name the file so it sorts after every migration whose tables it uses (the test suite always starts from a fresh database, so a wrong order fails at once).

## Outside services

Claude, Resend (email), Open-Meteo (weather), Aladhan (prayer times) and Web Push sit behind one boundary: the `OutsideServices` interface in `src/server/outside/index.ts`. App code reaches them only through `getAppContext().services`, never by calling `fetch` or an SDK directly.

- `src/server/outside/fakes.ts` holds a fake for each: a Claude with canned replies by `purpose` (and a switch to make it fail; `DEFAULT_CLAUDE_REPLIES` holds a purpose's reply when no test set one, so the e2e server gets usable answers), a Resend outbox, fixed weather and prayer times, and a push recorder. Tests read what the app sent from them (`app.services.email.outbox`, `app.services.push.sent`).
- The real adapters are not connected yet and throw `OutsideServiceNotConnected`. The ticket that first needs a service writes its real adapter in `src/server/outside/`, reading its secret from the environment, and may extend that service's interface additively, updating the fake in the same change.
- Open-Meteo (weather, and `weather.findPlace` to look up a Reader's city) and Aladhan (prayer times) are connected (ticket 17, `open-meteo.ts`, `aladhan.ts`); both are free and keyless. Their fakes know a few cities (Riyadh, Jeddah, London, Liverpool, Sanaa, New York; add more to `app.services.weather.places`) and have a `failing` switch.
- Resend is connected (ticket 06, `src/server/outside/resend.ts`). Real adapters take an injected `fetch` so `test/platform/` can check the requests they make without the network.
- Web Push is connected (ticket 18, `src/server/outside/web-push.ts`): RFC 8291 encryption and RFC 8292 VAPID signing with `node:crypto`, no library. `services.push.publicKey` is the key browsers subscribe with (null when not connected). The fake records `push.sent`, and its `gone` and `failing` sets of endpoints make the push service report a device expired or fail.
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
- Onboarding: `signIn`, `signInAsOwner` and `addReader` finish a first-time Reader's onboarding through `PATCH /api/me`, following **every Catalog Topic**, then opt into the Sensitive ones the way the Me tab does (`POST /api/topics/{id}/follow`, with the 18+ confirmation), so their Brief is the whole Edition. A Reader already onboarded is left alone. Pass `{ onboarded: false }` for a Reader on their first visit (no Topics, an empty Brief), then set exactly what they follow with `PATCH /api/me {topics, onboarded: true}` or `POST /api/topics/{id}/follow|unfollow`. Items whose Topics are not in the Catalog never reach a Brief, because nobody can follow them.
- Fixtures: `test/fixtures/edition.morning.json` is a valid hand-written Edition (5 Items across 6 Topics, 1 Story Thread). Tests copy it with `morningEdition()` and change what they need.

### The browser seam (thin)

Playwright at phone size (Pixel 7, Chromium) in `e2e/`, against `next dev` with a fresh `.e2e/` database and `OUTSIDE_SERVICES=fake`. Tests set up data through the API, sign in, then use the page. Only smoke flows go here, never ranking.

- Import `test`, `expect`, `E2E_BASE_PATH`, `signIn` and the helpers from `e2e/support.ts`, not from `@playwright/test`. Its `test` aborts every request that is not to the app itself (Item images on example.com and so on), so the browser makes no real network calls.
- Every screen but `/sign-in` needs a session: call `await signIn(page)` first (from `e2e/support/sign-in.ts`, re-exported by `e2e/support.ts`). It signs in as the Owner by default by opening the magic link the fake Resend wrote to `.e2e/outbox.jsonl`, and leaves the page on the Brief. Because the database lasts the whole run, it also resets the Reader's language to English and, on their first sign-in, finishes onboarding following (and opted into) every Catalog Topic; `signIn(page, email, { onboard: false })` leaves a new Reader on `/onboarding`. Tests that change an Interest Profile (follows, city) use their own invited Reader, not the Owner. The Owner's account bar (email, Invites, Sign out) is on the Me tab.
- `postEdition(request, edition)` posts with the e2e token. `swipeEdition()` is the morning fixture plus a US Markets and a game Item (7 Items, every kind of card extra). The database is fresh per run, not per test, so post the Edition your test needs in the test or a `beforeEach`.
- Tap the Swipe Brief's tap zones up on the picture (`tap({ position: { x: 40, y: 200 } })`): the card text sits over their lower half on purpose. Match buttons with `exact: true`.
- Fix the clock with `page.clock.setFixedTime(...)` before `page.goto` when a test reads relative times ("50m ago"). They are filled in after the page loads.
- `devIndicators` is off in `next.config.ts` because the Next.js dev badge covers the bottom tabs.
- Desktop-only flows go in `e2e/desktop-*.spec.ts`: they run in the `desktop` project (Desktop Chrome, 1280×720) and not at phone size; every other spec runs only at phone size. The desktop layout (card plus side list) starts at 1024px wide.
- The e2e server listens on port 3210. Set `E2E_PORT` to use another one when several checkouts run e2e at once.
- `next.config.ts` turns off Turbopack's on-disk dev cache. With it on, its writes under `web/.next` made `next dev` keep reloading the page, and the Swipe Brief jumped back to the cover in the middle of a test.

## Arabic and right to left

Every screen works in English and in Arabic, laid out right to left (ticket 04). The Brief carries both languages (Items keep their `_ar` fields; `topic_names_ar` names Topics from the Catalog), so switching language re-renders in place and never fetches again.

- The root layout takes the language from the signed-in Reader's Interest Profile, or else the `brief_lang` cookie, renders `<html lang dir>` to match, and wraps the app in `LanguageProvider` (`src/app/_components/language.tsx`). Switching saves to both (the profile through `PATCH /api/me`).
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

## Following Topics and the Interest Profile

Ticket 07. A Reader's Brief covers only the Catalog Topics they follow (`topic_follows`); an Item appears once, under the first of its Topics (Edition order) that the Reader follows, with their other followed Topics as `tags`. `composeBrief(ctx, reader)` always takes the Reader.

- `GET /api/topics` marks each Topic `followed`; `POST /api/topics/{id}/follow|unfollow` are idempotent, `404` for a Topic not in the Catalog.
- `GET /api/me` returns `{reader, onboarded, language, city, topics, age_confirmed_at, notifications, display}`; `PATCH /api/me {topics?, language?, city?, onboarded?, notifications?, display?}` is all or nothing (`422 {error, reasons}`), `topics` replaces the follows, and `onboarded: true` needs at least one followed Topic. Server code reads it with `getProfile` / `isOnboarded` (`src/server/readers/profile.ts`); later tickets add their profile fields there.
- Until onboarding is finished the Brief is empty and the Brief page redirects to `/onboarding` (no tabs). Onboarding never offers Sensitive Topics; the Me tab lists the whole Catalog.
- Claude Topic suggestions (ticket 12, `src/server/topics/suggestions.ts`): `POST /api/me/topic-suggestions {note}` returns `{suggestions: [{topic, reason, reason_ar}], unavailable}`, at most 5 Catalog Topics the Reader does not follow yet, never Sensitive ones (filtered after Claude answers too). It follows nothing and stores no note: accepting a suggestion is `POST /api/topics/{id}/follow`. When Claude fails or answers unreadably it is still `200`, with no suggestions and `unavailable: true`. Onboarding (the optional "About you") and the Me tab ("Find more Topics") both use it.

## Display and the Reels look

Rework ticket 07 (issue #7, [spec #6](https://github.com/Montasaa/morning-brief/issues/6)). A Reader's **Display** is how their Brief looks and is arranged. It is theirs alone, follows them to every device, and **never affects ranking**: the Scorer and the top picker must not read it.

### The Display document

- `src/server/display/shape.ts` holds the shape, every option list and the defaults, with no server imports (client components import it). `src/server/display/display.ts` reads, checks and writes it. Storage is one row per Reader in `displays` (`migrations/t07_reader_displays.sql`): a JSON document holding only the keys the Reader set, so every other key reads as its default and existing Readers need no backfill.
- `GET /api/me` has `display`, every key filled in. Defaults: `layouts: {}`, `theme: "auto"`, `accent: "amber"`, `text_size: "m"`, `density: "comfortable"`, `topic_order`, `pinned`, `collapsed` and `unblurred` empty, `widgets` every Widget kind (`weather, prayer_times, next_match, countdown`; the Cover shows those the Reader is eligible for right now) and `dock: like, save, ask, hide`.
- `PATCH /api/me {display: {...}}` changes only the keys sent, inside the profile's all-or-nothing update: any bad value gets `422 {error, reasons}` (every reason at once) and nothing is stored. A key sent as `null` goes back to its default. `layouts` merges per screen class (`phone`, `tablet`, `pc`; "wide" uses `pc`), and `{layouts: {tablet: null}}` takes back just that pick.
- Validation: enums for `theme`, `accent`, `text_size`, `density` and each Layout; Topic lists (`topic_order`, `pinned`, `collapsed`) take only ids in the Reader's Catalog (`unknownTopicIds`), followed or not, and keep them after an unfollow; `widgets` takes Widget kinds; `dock` takes 1 to 5 of `like, save, ask, hide, share`; `unblurred` takes only Sensitive Topics the Reader has opted into (as of the end of the same request, so a request that drops one cannot unblur it). Lists are de-duplicated, keeping the first.
- Opting out of a Sensitive Topic, by any route, removes it from `unblurred` (a trigger on `topic_follows`), so opting in again starts blurred.
- Later tickets add only UI and behaviour: `layouts` (ticket 09), `topic_order`, `pinned`, `collapsed`, `widgets`, `dock` (ticket 11), `unblurred` (ticket 10). Add their controls to Me › Display (`src/app/me/display/page.tsx`, `_components/display-controls.tsx`).
- Tests: `test/api/display.test.ts` (defaults, partial updates, every validation reason, syncing between two sessions, another Reader untouched); `e2e/display.spec.ts` (changing theme and accent survives a reload and reaches another device; Arabic).

### In the browser

- The root layout reads the Display on the server (as it does the language) and renders it on `<html>` as `data-theme`, `data-accent`, `data-text-size` and `data-density` (`displayAttributes` in `_components/display-attributes.ts`). `globals.css` styles everything from those attributes, so the first paint is right with no script and no flash; `auto` follows `prefers-color-scheme` in CSS. Signed out, the defaults apply. The browser bar colour (`generateViewport`) follows the theme too. Ticket 09 adds the initial Layout the same way.
- `DisplayProvider` / `useDisplay()` (`_components/display.tsx`): `const { display, update } = useDisplay(); await update({ accent: "sky" })`. `update` changes the `<html>` attributes at once, saves with `PATCH /api/me {display}` and resolves `true` when saved; when the server refuses or the device is offline it undoes just those keys and resolves `false`. When the page comes back into view it fetches the Display again, so a change made on another device shows without a reload.

### The visual system

All in `src/app/globals.css`. Components style themselves with its tokens, never raw colours or pixel font sizes, so the Display reaches them.

- **Type**: Inter (variable, 400–800 used) and IBM Plex Sans Arabic (400–700), self-hosted at build time from the `@fontsource` npm packages through `next/font/local` (`src/app/fonts.ts`): nothing is fetched from a font service, at build or at run time. One stack (`--font-sans`): Inter, then Plex Arabic for Arabic letters. Hierarchy comes from size and weight only. The base is 15px = `1rem`, scaled by `--text-scale` (s, m, l, xl = 0.93, 1, 1.13, 1.27); use the `--fs-*` steps (`xs` 12px, `s` 13, `base` 15, `m` 16, `l` 18, `xl` 22, `h1` 28 at m) or `rem`. Arabic text is never letter-spaced (`:lang(ar)` resets it); `--tracking-tight` is for big Latin headings only.
- **Two colour scopes with the same token names** (`--bg`, `--fg`, `--mute`, `--faint`, `--line`, `--surf`, `--surf2`, `--acc`, `--on-acc`, `--danger`, `--like`, `--scrim`):
  - *Chrome* (the default: sidebar, sheets, Threads, Saved & Search, Me): light or dark per theme.
  - *The Brief canvas*: put the global class `brief-canvas` on the root of anything that is part of the Brief (Swipe, Front Page, List, the reader pane, the wide Widgets column; the tab bar gets it on the Brief). It is dark in every theme and adds `--canvas` and `--why` (the why-line over photos, `#ffd789`). A page showing it is dark around it too.
  - `--faint` is decoration only, never text. `--like` (`#f23a5e`) is for the canvas; it is under 3:1 on light chrome.
- **Ornament budget**: hairlines (`1px solid var(--line)`) only; no callout boxes, kicker labels or badges ("Updated" is plain text in the one-line meta: **Topic** · time · Updated). Colour only on actions and highlights: `--acc` is for the why-line, the selected card's outline, active controls, pins, countdowns, links and the focus ring. A chosen option is outlined in the accent, not filled. Radius: `--r-card` 18px, `--r-row` 12px, `--r-pill`. Touch targets at least `--tap` (44px).
- **Density** tokens (comfortable / compact): `--row-pad` 14 / 10px, `--gap` 12 / 8px, `--shelf-card-w` 196 / 168px, `--fp-row-thumb` 72 / 56px, `--list-row-thumb` 56 / 44px. `--page-pad` is 16px, 22px from 1280px wide.
- **Motion**: everything is off under `prefers-reduced-motion` (a global rule); never hide content behind an animation's start state. `--ease` and `--spring` are the prototype's curves.
- **Chrome screens** reuse `_components/chrome.module.css`: `.screen`, `.back`, `.sectionTitle`, `.rows` / `.row` (a plain hairline list with `.rowTitle` and `.rowSub`; `.rowsRuled` adds a top hairline) and `.status`, plus `<Chevron to="forward" | "back">` (`_components/chevron.tsx`), which mirrors in Arabic.
- **Not converted yet** (left to the tickets that rebuild them): the Swipe Brief's own components (`swipe-brief`, `side-list`, `cover-widgets`, `card-extras`, `reactions`, `ask-sheet`) still use fixed colours and pixel sizes, so the accent and text size do not reach the Brief, and its sheets (hide reasons, Ask) stay dark in Light theme. Ticket 08 rebuilds them on these tokens, with sheets in chrome colours. The bottom tabs keep a fixed 11px label on purpose, so their height never changes.

### Accents

Each accent has a value for the dark canvas (also dark chrome) and one for light chrome, set as `--acc-dark` / `--acc-light` on `[data-accent="..."]` (any element; Me › Display's swatches use that). `--acc` picks one by scope; `--on-acc` is the text colour on a filled accent (black on dark values, white on light ones). Every value carries text somewhere, so each is checked at **4.5:1** against every background it can sit on (dark: `#000`, `#060607`, `#121315`, `#1b1d20`; light: `#fff`, `#f4f5f7`, `#eceef1`). After changing any colour token run `node scripts/check-contrast.mjs` (it reads `globals.css` and exits 1 on a failure) and update this table:

| Accent | Dark value | Worst on dark | Black on it | Light-chrome value | Worst on light | White on it |
| --- | --- | --- | --- | --- | --- | --- |
| amber | `#ffc24b` | 10.51:1 | 13.07:1 | `#8a5300` | 5.45:1 | 6.33:1 |
| coral | `#ff8a6b` | 7.32:1 | 9.10:1 | `#c03a1c` | 4.68:1 | 5.44:1 |
| lime | `#b4e34a` | 11.28:1 | 14.03:1 | `#4a7012` | 4.99:1 | 5.80:1 |
| sky | `#5cc6ff` | 8.83:1 | 10.98:1 | `#0a69a8` | 5.02:1 | 5.84:1 |
| rose | `#ff7eaa` | 7.09:1 | 8.82:1 | `#c0215a` | 5.01:1 | 5.82:1 |
| mono | `#ffffff` | 16.89:1 | 21.00:1 | `#0e1013` | 16.39:1 | 19.05:1 |

Muted text: light chrome `#5d646d` is 5.15:1 at worst, dark `#8b9098` 5.26:1.

## Sensitive Topics

Ticket 08. Graphic and Adult Trending (`topics.sensitive`) are hidden from every Reader until they opt in. The rules live in `src/server/topics/sensitive.ts`.

- Opting in is following the Sensitive Topic with `POST /api/topics/{id}/follow`, which the Me tab's "Sensitive Topics" section does. Adult Trending also needs the body `{"age_confirmed": true}` (else `422 {error, reasons}`); each confirmation is recorded (`age_confirmations`) and `GET /api/me` shows the latest as `age_confirmed_at`. Unfollowing is opting out, and opting in again asks again.
- `PATCH /api/me {topics}` never adds a Sensitive Topic (`422`, "opt into it from the Me tab"); it may keep or drop ones already opted into. So onboarding can never pre-select one.
- A **sensitive Item** carries at least one Sensitive Topic. It reaches a Reader only if they opted into every Sensitive Topic it carries, even when it also carries a Topic they follow, and the Brief marks it `blurred: true`.
- Anything that lists Items to a Reader (Story Threads, Saved & Search, Widgets that name Items) must use the same rule: put `sensitiveItemVisibleSql("i.id")` (one `?`, the Reader's id) in its `WHERE` and `sensitiveItemSql("i.id") AS blurred` in its columns, and test it at the API seam.
- In the UI a blurred Item hides its picture and text (blurred and `inert`) behind its warning and a "Tap to reveal" button, every time it comes round; the tap zones still skip it. Any other place that shows an Item (the desktop side list, Threads, Search) keeps its title behind the warning until tapped.

## Reader-created Topics and Gathering Rules

Ticket 11. `src/server/topics/reader-topics.ts` (create, share) and `gathering-rules.ts` (drafting, Owner edits, the gathering list).

- **Visibility.** A Reader's Catalog is the starting Topics, every shared Topic and their own private ones. Another Reader's private Topic does not exist for them: `404` on follow and share, refused by `PATCH /api/me`, and stripped from Items' `topics` in their Brief. Anything that lists or accepts Topic ids for a Reader goes through `listCatalog` / `catalogTopic` / `unknownTopicIds(ctx, ids, readerId)` or the `VISIBLE_TO_READER` SQL in `catalog.ts`, never a bare `SELECT ... FROM topics`. Whether a Reader may see an Item at all (a Topic in their Catalog, and the sensitive opt-in rule) is `itemVisibleSql` / `readerCanSeeItem` in `topics/visibility.ts`: anything that takes an Item id from a Reader (Ask, Reactions) answers `404` for an Item they may not see, as if no Edition carried it. The Owner's Catalog follows the same rule; the Owner sees every Topic through `GET /api/owner/topics` and the `/gathering-rules` page.
- **Creating.** `POST /api/topics {name, note?, name_ar?}` → `201 {topic}`, private and followed by its creator; `409 {error, limit}` past 10 created Topics (the Owner has no limit), `409 {error, topic}` when a Topic of that name is already in their Catalog. The id is a slug of the name, as Editions use it in `items[].topics`.
- **Gathering Rules** are plain text (trusted outlets, what counts, exclude). Claude drafts them with `purpose: "gathering-rules"`; when Claude fails the Topic is still created with a template marked `rules_by: "fallback"`. The house source rules (`HOUSE_SOURCE_RULES`) are not copied into each Topic: they go to Claude's prompt and to the gathering list. The Owner edits any Topic's with `PATCH /api/topics/{id}/rules {rules}`.
- **The gathering list** (`GET /api/gathering-list`, pipeline token) is `{house_rules, topics: [{id, name, name_ar, sensitive, rules, followers}]}`: every Topic followed by at least one Reader whose Invite is not revoked, in Catalog order.

## Story Threads

Ticket 14, in `src/server/threads/threads.ts`. Ingest links Items to Threads by `thread_id`; a new development is always a new Item, so a Thread's timeline is every Item ever linked to it, across all Editions, newest first.

- `GET /api/threads` (the Threads tab: followed Threads first, then the other *active* ones, i.e. those the latest Edition carries), `GET /api/threads/{id}` (`{thread, items, topic_names, topic_names_ar}`, each Item with its Asia/Riyadh `date`), `POST /api/threads/{id}/follow|unfollow` (idempotent). The Brief carries `threads` (by id) for the chip on each card.
- A Reader sees a Thread's Item only under the Brief's rules: it carries a Topic they follow (in their Catalog; another Reader's private Topic never counts and is stripped from `topics`, and `topic_names` come from the Catalog), and every Sensitive Topic it carries is one they opted into (sensitive Items come back `blurred: true`, and so does a Thread's `latest` development, whose title the Threads tab keeps behind its warning until tapped). A Thread they can see no Item of is a `404` and is never listed. Later rules that hide Items from a Reader belong in its `VISIBLE_ITEMS` SQL too.

## Widgets

Ticket 17, `src/server/widgets/`. `GET /api/widgets` returns `{city, city_found, timezone, widgets}`; the Brief's `cover.widgets` is the same list (the `/api/brief` route and the Brief page add it with `withWidgets`, so `composeBrief` stays synchronous).

- Weather and prayer times are live for the Reader's city, cached about 30 minutes in `widget_cache` (shared by everyone in the same place; failures are not cached). No city, or one that cannot be found: neither is shown, and the cover card links to the Me tab.
- The next match belongs to the Liverpool Topic and countdowns name their Topic: only followers see them, and only while they are still to come. Times are also given in the Reader's time zone (their city's, else Asia/Riyadh).
- A failing service drops only its own Widget; the cover card always renders.
- Widget tests fix the clock (`vi.useFakeTimers({ toFake: ["Date"] })`), since what is "still to come" depends on now. The e2e server runs on the real clock, so e2e Editions put widget times relative to `Date.now()`.

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

## Reactions and ranking

Ticket 09. A Reader's Reactions are one row per Reader, Item and kind in `reactions` (`like`, `save`, `open`, `hide`; a hide may carry `reason` `not_interested`, `already_seen` or `bad_source`, NULL for "just hide"). `src/server/reactions/` reads and writes them, always for one Reader: never read another Reader's Reactions when building a Brief.

- `POST /api/items/{id}/reactions {kind, reason?}` sets one (again: no change, except a new hide reason replaces the old); `DELETE /api/items/{id}/reactions/{kind}` undoes it. Both return `{item_id, reactions: {like, save, open, hide: {reason} | null}}`; `404` for an Item no Edition carried or the Reader may not see, `422` for a bad kind or reason.
- The Brief leaves hidden Items out, marks opened ones `dimmed: true`, and gives each Item `reactions: {like, save}` for the dock.
- Order comes from the Scorer, `scoreItems` in `src/server/brief/score.ts`: a pure function of followed Topics, the Reader's Reactions, recency (against the Edition's `generated_at`, not the clock) and status. Within a group Items run by score, groups by their best Item, ties newest first. So the non-top part of `composeBrief(...).items` is already the highest-scored first.
- Test ranking through the order of `GET /api/brief` (see `test/api/ranking.test.ts`), never the weights.
- In the Swipe Brief, `useReactions` (`src/app/_components/reactions.tsx`) holds the dock, the hide-reason sheet and the Undo toast. Opening any link on a card records an `open`.

## The Owner console

Ticket 10. `/owner` (linked as "Console" from the Owner's account bar on the Me tab) shows ingest health and "bad source" reports; other Readers are redirected to their Brief. The data comes from `src/server/owner/`, also served as `GET /api/owner/health` and `GET /api/owner/reports` (Owner only).

- **Reports** are read from the Readers' current `bad_source` hides, so undoing the hide or changing its reason withdraws the report. They group by Item (with its Topics and sources) and by source title, and count Readers without naming them. Other hide reasons never reach the Owner.
- **Rejected ingests**: a pipeline route that refuses a document from a caller holding the token (invalid Edition, body not JSON, a brief.json the legacy importer cannot convert) records it with `recordIngestRejection(ctx, {endpoint, doc, reasons})`. A new pipeline route that ingests should do the same. Calls without the token and legacy dry runs are not recorded. The console lists the newest 20; only the newest 200 are kept.

## Top stories and why-lines

Ticket 13. After an Edition is ingested, the top picker (`src/server/brief/top-picker.ts`) asks Claude (purpose `top-picks`) to choose 1–3 top stories for every Reader from their own ranked Brief (`rankBrief` in `compose.ts`), each with a "why this matters to you" line in English and Arabic. They are stored per Reader and Edition (`top_stories`, `src/server/brief/top-stories.ts`) and lead the Brief as the `top` group, with `why_for_you` / `why_for_you_ar` on each Item (null elsewhere; show them with `localized(item, "why_for_you", lang)`).

- `POST /api/editions` and the legacy import pick before they answer, so the Briefs are ready when ingest returns. Only the latest Edition is picked for; posting the same Edition again does not ask Claude again for a Reader it already answered for.
- Claude's answer is filtered to the Reader's own Brief, and the Brief drops a top story the Reader has since hidden or unfollowed. When Claude fails or picks nothing usable, the tops are the Scorer's: the Edition's own `top_stories` in the Reader's Brief, then their highest-scored Items, up to 3, recomputed as their Reactions change, with no why-lines. A Reader with nothing picked (onboarded after the ingest) gets the Edition's own `top_stories`.
- So in tests, **a Reader who exists when an Edition is posted gets top stories picked for them**; one who signs in afterwards does not. The fake Claude's default `top-picks` reply picks the Edition's own top stories (or the Reader's first Item) with a canned why-line. Set `app.services.claude.replies.set("top-picks", ...)` for specific picks, or `app.services.claude.failing.add("top-picks")` to get the Scorer's tops (what `test/api/ranking.test.ts` does, so the whole Brief follows the score).

## Saved and Search

Ticket 15. `src/server/saved-search/` lists Items to one Reader from every Edition ever posted (nothing is pruned), as each Item's newest stored version.

- `GET /api/saved` returns `{items, topic_names, topic_names_ar}`: the Reader's `save` Reactions, newest-saved first, each with `saved_at`. Unsaving is `DELETE /api/items/{id}/reactions/save`.
- `GET /api/search?q=` returns `{query, results, topic_names, topic_names_ar}`: at most 50 Items whose title or summary (English or Arabic) contain every word of `q` (a word's beginning is enough), newest first. An empty query finds nothing; query text is always plain words, never FTS5 syntax.
- Each Item carries its date (`time`), the `topic` it is shown under (the first Topic the Reader follows, else its first Catalog Topic), its `thread` (`{id, title, title_ar}` or null), `blurred`, and the Reader's own `reactions: {like, save}`.
- Listing rules are `itemVisibleSql` (`src/server/topics/visibility.ts`): the sensitive opt-in rule, and at least one Topic in the Catalog as the Reader sees it (ticket 11: another Reader's private Topic does not count, and is stripped from the Item's `topics`).
- Search is SQLite FTS5 (`migrations/t15_search.sql`). Triggers on `items` only note which Items changed; `searchItems` folds the text (Arabic hamza forms, vowel marks, tatweel, ى/ة and a leading article; see `searchWords`) and indexes them before each search. So ingest needs no change, and the same folding is applied to queries.

## Pipeline v3 (the gathering side)

Ticket 19. Gathering stays outside the app: the agent follows [`pipeline/PIPELINE-v3.md`](../pipeline/PIPELINE-v3.md) and uses the Python tool `pipeline/v3/edition_v3.py` (stdlib plus `jsonschema`), which turns its drafts into an Edition, checks links, validates against the same schema as ingest and posts to `POST /api/editions`. The v2 `pipeline/PIPELINE.md` keeps running unchanged until the switch-over.

- `web/test/pipeline/` tests the tool from outside: it runs as a child process (`runTool` in `test/support/pipeline-v3.ts`) against the test app served on 127.0.0.1 (`serveApp`), and the tests check its files, output and the app's API. So `npm test` needs `python3` (3.10+) with `jsonschema` 4.x on the PATH.
- Tests pass `--no-link-check` (drafts use example.com links); only the link-check test checks links, against a local server. Never let the tool reach the real network in a test.
- A change to `schema/edition.v3.schema.json` is picked up by the tool too; keep the house rules in `pipeline/v3/gathering/validate.py` in step with `HOUSE_SOURCE_RULES`.

## Installable app and push

Ticket 18. The Brief installs to the home screen and sends two opt-in pushes.

- **Installable.** `src/app/manifest.ts` (served at `<base path>/manifest.webmanifest`) and the service worker `public/sw.js` are scoped to the base path itself (`/brief`, not `/brief/`, since that is the Brief's URL); `next.config.ts` serves `sw.js` with `Service-Worker-Allowed` for that. The root layout registers it on every page (`_components/service-worker.tsx`). It shows pushes and opens the app on tap; it does not cache or intercept requests. Icons are drawn by `node scripts/make-icons.mjs` into `public/icons/` and `src/app/{icon,apple-icon}.png`; links to them carry the base path.
- **Devices.** `GET /api/push/subscriptions` → `{public_key, subscriptions: [{endpoint, created_at}]}`; `POST` a browser `PushSubscription` (`{endpoint, keys: {p256dh, auth}}`) → `201`, `422` for anything else; `DELETE {endpoint}` → `{removed}`. A subscription belongs to the session that made it: signing out of (or revoking) a device stops its pushes. Subscribing an endpoint again moves it to whoever is signed in there now.
- **Preferences** are in the Interest Profile: `GET /api/me` has `notifications: {brief_ready, thread_updates}`, both `false` until turned on with `PATCH /api/me {notifications: {...}}`. The Me tab's "Notifications" section holds the switches, the device's on/off button and the install prompt.
- **Sending** (`src/server/push/edition-pushes.ts`): the ingest routes call `sendEditionPushes` after top picking, before they answer, and only for the latest Edition. "Brief ready" goes once per Reader and Edition to opted-in Readers whose Brief has Items, naming their top story (a sensitive one only as "has a content warning"), in their language. An Item linked to a Thread for the first time (`thread_developments`) pushes to that Thread's opted-in followers who may see it under the Brief's rules, one push per Reader and Thread. A device the push service reports gone is forgotten; a failing one never fails the ingest.
- In tests, subscribe a made-up device (`POST /api/push/subscriptions` with any `https` endpoint and base64url keys), opt in, post an Edition, then read `app.services.push.sent`. The browser smoke test never subscribes (that would reach a real push service); headless Chromium reports notifications as blocked.

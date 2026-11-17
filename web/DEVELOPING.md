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
| Dev server | `INGEST_TOKEN=dev OWNER_EMAIL=you@example.com OUTSIDE_SERVICES=fake npm run dev`, then open http://localhost:3000/brief and, on the first visit, choose the Owner's password on the sign-in page |

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

All configuration comes from environment variables. `.env.example` lists them. Secrets (`INGEST_TOKEN`, `ANTHROPIC_API_KEY`, `LLM_API_KEY`, `RESEND_API_KEY`, VAPID keys) are never committed, defaulted or logged.

- `BASE_PATH`: the path the app is served under (default `/brief`). It is read at build time, so links and assets must go through Next.js (`<Link>`, `next/image`, `basePath`-aware fetches) and never hard-code `/brief`.
- `DATABASE_PATH`: the SQLite file (default `data/brief.db`).
- `INGEST_TOKEN`: the bearer token for pipeline routes. Unset means every pipeline call is refused.
- `OUTSIDE_SERVICES=fake`: use the fakes instead of the real services (e2e server and local demos only). `FAKE_OUTBOX_FILE` makes the fake Resend also append each email to a file.
- `OWNER_EMAIL`: the Owner, created at setup (when the database opens and no Owner exists yet). Never through an Invite. The Owner chooses their password on the sign-in page on the first visit.
- `PUBLIC_ORIGIN`: the site's public origin (e.g. `https://example.com`). Set it in production: an `https` origin makes the session cookie `Secure`; without it, the request's origin decides.
- `RESEND_API_KEY` and `EMAIL_FROM`: the Resend adapter. Optional: sign-in does not use email (issue #17), and nothing else sends email yet. Unset means email is not connected.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`: Web Push (ticket 18). `.env.example` has the one-liner that makes a key pair.

## Access: who may call what

Every route handler checks access first, with the helpers in `src/server/access.ts`:

- **Reader routes** need a signed-in session: `const access = readerAccess(ctx, req); if (!access.ok) return access.response;` then use `access.reader` (`{ id, email, role }`). Signed out is `401`.
- **Owner routes** use `ownerAccess(ctx, req)` the same way: `401` signed out, `403` for other Readers.
- **Pipeline routes** (`/api/editions`, `/api/editions/legacy`, `/api/gathering-list`, `/api/gather/adult-trending`) keep the bearer token (`hasPipelineToken`), never a session.
- **Pages** call `requireReaderPage()` (`src/server/readers/page-session.ts`), which redirects signed-out visitors to `/sign-in`.

Sessions are an HttpOnly `mb_session` cookie (one per device, a year long, scoped to the base path); only token hashes are stored. Plain HTML forms posting to the auth routes get a `303` redirect back, JSON callers get JSON.

### Signing in with a password (issue #17)

Readers sign in with their email and a password; no email is ever sent to sign in. The code is in `src/server/readers/sign-in.ts` (sign-in, the Owner's first password, changing your own), `passwords.ts` (hashing) and `invites.ts` (the Owner adding Readers and resetting their passwords).

- **Sign in**: `POST /api/auth/sign-in {email, password}` → `200 {reader}` with the session cookie. A wrong password, an unknown email, a revoked Reader and a Reader with no password all get the same `401 {error: "Wrong email or password."}` (an unknown email is still hashed against a dummy, so the timing is the same). The form post redirects to the Brief, or to `/sign-in?error=wrong|limit`.
- **The Owner's first password**: while the Owner has no password, the sign-in page shows a "First visit: choose the Owner's password" form (Owner's email, New password, Type it again, "Set password and sign in") posting to `POST /api/auth/first-password {email, password, confirm_password}`. Only the Owner's email, and only while the Owner has no password: it sets it and signs in. Anything else is `403` (form: `/sign-in?first=refused`), and once it is set the form is gone. Until then, anyone who knows `OWNER_EMAIL` could claim it, so choose it as soon as the site is deployed.
- **Readers**: on the Invites page the Owner adds a Reader with an email and a password they choose (`POST /api/invites {email, password}` → `201 {invite}`, already `accepted` with its `reader_id`) and tells the person. "Reset password" on a Reader's row (`POST /api/invites/{id}/password {password}`) sets a new one and signs that Reader out everywhere. Revoke (`DELETE /api/invites/{id}`) signs them out, wipes the password and blocks sign-in; adding the same email again brings the Reader back (same id and history) with a new password. Readers from before issue #17 have no password until the Owner resets it.
- **Change your own**: Me › Password (`/me/password`), a plain form posting `{current_password, new_password, confirm_password}` to `POST /api/auth/password`. This device stays signed in; the Reader's other devices are signed out.
- **Rules**: at least 8 characters (at most 200). Stored only as `scrypt$N$r$p$salt$hash` in `readers.password_hash` (random 16-byte salt, N = 2^15, r = 8, p = 1, compared with `timingSafeEqual`). Each hash records its own parameters, so `PASSWORD_COST` (`src/server/config.ts`) can be raised later; the test app lowers it to keep the suite fast. Failed tries are limited per email: after 10 in 15 minutes the next ones get `429` (form: `?error=limit`), even with the right password. They are counted in `sign_in_failures` under a hash of the email, so a restart does not reset them; a good sign-in or a reset by the Owner clears them. Emails and passwords are never logged.

## The database and migrations

- Migrations are hand-written SQL files in `web/migrations/`, named `tNN_<slug>.sql`, where `NN` is the ticket number (`t01_editions_items.sql`, `t06_readers_sessions.sql`). A ticket may add more than one (`t09_reactions.sql`, `t09_scores.sql`).
- They are applied in lexical filename order, each in its own transaction, when the database opens. Applied files are tracked by filename in `schema_migrations`, so branches built in parallel never collide.
- Never edit a migration that has been merged. Add a new file.
- A later ticket's migration may only rely on tables from tickets it is blocked by.
- The rework tickets (#7 to #11, spec #6) are numbered by their GitHub issue, so their numbers repeat the build plan's (`t07_reader_displays.sql` sits next to `t07_interest_profiles.sql`). Lexical order is still the order on a fresh database: name the file so it sorts after every migration whose tables it uses (the test suite always starts from a fresh database, so a wrong order fails at once). When a rework migration changes something a later build ticket added, its issue number cannot sort late enough: name it `t18_r<issue>_<slug>.sql` (after the last build-plan file, `t18_push.sql`), as `t18_r10_adult_trending_rules.sql` does.

## Outside services

Claude, Resend (email), Open-Meteo (weather), Aladhan (prayer times), Web Push and Reddit sit behind one boundary: the `OutsideServices` interface in `src/server/outside/index.ts`. App code reaches them only through `getAppContext().services`, never by calling `fetch` or an SDK directly.

- `src/server/outside/fakes.ts` holds a fake for each: a Claude with canned replies by `purpose` (and a switch to make it fail; `DEFAULT_CLAUDE_REPLIES` holds a purpose's reply when no test set one, so the e2e server gets usable answers), a Resend outbox, fixed weather and prayer times, and a push recorder. Tests read what the app sent from them (`app.services.email.outbox`, `app.services.push.sent`).
- The real adapters are not connected yet and throw `OutsideServiceNotConnected`. The ticket that first needs a service writes its real adapter in `src/server/outside/`, reading its secret from the environment, and may extend that service's interface additively, updating the fake in the same change.
- Open-Meteo (weather, and `weather.findPlace` to look up a Reader's city) and Aladhan (prayer times) are connected (ticket 17, `open-meteo.ts`, `aladhan.ts`); both are free and keyless. Their fakes know a few cities (Riyadh, Jeddah, London, Liverpool, Sanaa, New York; add more to `app.services.weather.places`) and have a `failing` switch.
- Resend is connected (ticket 06, `src/server/outside/resend.ts`). Real adapters take an injected `fetch` so `test/platform/` can check the requests they make without the network.
- Reddit is connected (issue #19, `src/server/outside/reddit.ts`): `services.reddit.feed(url)` reads one public subreddit RSS feed (Atom) into posts (`RedditPost`: id, subreddit, title, url, author, published, text, image, media). No key; it sends a descriptive `User-Agent` (`REDDIT_USER_AGENT`; Reddit refuses generic ones) and spaces requests 2.5 s apart (Reddit answers `429` to quick ones). The fake serves `app.services.reddit.feeds` (a map from feed URL to posts), records `calls`, and refuses the URLs in `failing`.
- Web Push is connected (ticket 18, `src/server/outside/web-push.ts`): RFC 8291 encryption and RFC 8292 VAPID signing with `node:crypto`, no library. `services.push.publicKey` is the key browsers subscribe with (null when not connected). The fake records `push.sent`, and its `gone` and `failing` sets of endpoints make the push service report a device expired or fail.
- Claude is connected (ticket 16, `src/server/outside/claude.ts`, `ANTHROPIC_API_KEY`): the official `@anthropic-ai/sdk` on Claude Opus 5.5 with adaptive thinking and server-side refusal fallbacks. `webSearch: true` turns on web search and web fetch, and the reply's `citations` are the cited search results plus the pages Claude fetched. Later Claude features call `services.claude.complete` with their own `purpose`; they do not need a second adapter.
- Instead of Anthropic, the same adapter can talk to an Anthropic-compatible endpoint such as OpenCode Go: set `LLM_BASE_URL` (`https://opencode.ai/inference/go/anthropic`), `LLM_API_KEY` and optionally `ASK_MODEL` (default `claude-haiku-5-5`). Then every Claude feature (Ask, top picks, Topic suggestions, gathering rules) sends a plain Messages call with that model, a `morning-brief/3.0` user agent and a fresh `x-opencode-session` id per call. No web search or fetch, adaptive thinking or fallbacks, so Ask answers have no citations.
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
- Signed-in Readers: `app.signInAsOwner()` (the test app's Owner is `TEST_OWNER_EMAIL`), `app.addReader(email)` (the Owner adds them with a password on the Invites API, then they sign in) and `app.signIn(email)` each sign in through `POST /api/auth/sign-in` with `TEST_PASSWORD` and return a session whose `request(...)` sends its cookie. The Owner's first sign-in chooses `TEST_PASSWORD` through `POST /api/auth/first-password` on the way. Pass `{ password }` to use (or, for `addReader`, give) another. Each call is a new device.
- Time: sessions and the sign-in rate limit read `Date.now()`, so `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime()` move the clock (restore with `vi.useRealTimers()`).
- Onboarding: `signIn`, `signInAsOwner` and `addReader` finish a first-time Reader's onboarding through `PATCH /api/me`, following **every Catalog Topic**, then opt into the Sensitive ones the way the Me tab does (`POST /api/topics/{id}/follow`, with the 18+ confirmation), so their Brief is the whole Edition. A Reader already onboarded is left alone. Pass `{ onboarded: false }` for a Reader on their first visit (no Topics, an empty Brief), then set exactly what they follow with `PATCH /api/me {topics, onboarded: true}` or `POST /api/topics/{id}/follow|unfollow`. Items whose Topics are not in the Catalog never reach a Brief, because nobody can follow them.
- Fixtures: `test/fixtures/edition.morning.json` is a valid hand-written Edition (5 Items across 6 Topics, 1 Story Thread). Tests copy it with `morningEdition()` and change what they need.

### The browser seam (thin)

Playwright at phone size (Pixel 7, Chromium) in `e2e/`, against `next dev` with a fresh `.e2e/` database and `OUTSIDE_SERVICES=fake`. Tests set up data through the API, sign in, then use the page. Only smoke flows go here, never ranking.

- Import `test`, `expect`, `E2E_BASE_PATH`, `signIn` and the helpers from `e2e/support.ts`, not from `@playwright/test`. Its `test` aborts every request that is not to the app itself (Item images on example.com and so on), so the browser makes no real network calls.
- Every screen but `/sign-in` needs a session: call `await signIn(page)` first (from `e2e/support/sign-in.ts`, re-exported by `e2e/support.ts`). It signs in as the Owner by default with `E2E_PASSWORD` (which the Owner chose on the first visit, in `e2e/first-visit.setup.ts`: the `first-visit` project runs before every other project on the fresh database), and leaves the page on the Brief. Readers a spec adds get `E2E_PASSWORD` too (`POST /api/invites {email, password: E2E_PASSWORD}`); `signIn(page, email, { password })` uses another. Because the database lasts the whole run, it also resets the Reader's language to English and, on their first sign-in, finishes onboarding following (and opted into) every Catalog Topic; `signIn(page, email, { onboard: false })` leaves a new Reader on `/onboarding`. Tests that change an Interest Profile (follows, city) use their own invited Reader, not the Owner. The Owner's account bar (email, Invites, Sign out) is on the Me tab.
- `postEdition(request, edition)` posts with the e2e token. `swipeEdition()` is the morning fixture plus a US Markets and a game Item (7 Items, every kind of card extra). The database is fresh per run, not per test, so post the Edition your test needs in the test or a `beforeEach`.
- Drive the Swipe Brief with the `swipe` helpers in `e2e/support.ts` (see [The Swipe Brief](#the-swipe-brief-the-reels-look)), not by hand: `swipe.next(page)` / `swipe.back(page)` tap a third of the picture and wait for the move to land, `swipe.drag(page, px, { steps, pause })` drags a finger. Match buttons with `exact: true`.
- Fix the clock with `page.clock.setFixedTime(...)` before `page.goto` when a test reads relative times ("50m ago"). They are filled in after the page loads.
- `devIndicators` is off in `next.config.ts` because the Next.js dev badge covers the bottom tabs.
- Three projects, by screen class (see [Layouts, screen classes and the reader pane](#layouts-screen-classes-and-the-reader-pane)): `phone` (Pixel 7) runs every spec except `e2e/desktop-*.spec.ts` and `e2e/wide-*.spec.ts`; `desktop` (Desktop Chrome, 1280×720, a PC: Front Page by default) runs only `desktop-*`; `wide` (1728×1050) runs only `wide-*`. A spec can also resize its page (`page.setViewportSize`) to try a tablet either way up.
- The e2e server listens on port 3210. Set `E2E_PORT` to use another one when several checkouts run e2e at once.
- `next.config.ts` turns off Turbopack's on-disk dev cache. With it on, its writes under `web/.next` made `next dev` keep reloading the page, and the Swipe Brief jumped back to the cover in the middle of a test.

## Arabic and right to left

Every screen works in English and in Arabic, laid out right to left (ticket 04). The Brief carries both languages (Items keep their `_ar` fields; `topic_names_ar` names Topics from the Catalog), so switching language re-renders in place and never fetches again.

- The root layout takes the language from the signed-in Reader's Interest Profile, or else the `brief_lang` cookie, renders `<html lang dir>` to match, and wraps the app in `LanguageProvider` (`src/app/_components/language.tsx`). Switching saves to both (the profile through `PATCH /api/me`).
- Write UI text in both languages: `const { lang, t } = useLanguage(); t("Save", "حفظ")` in client components, `<T en="Threads" ar="القصص المتواصلة" />` inside server components.
- Show Edition text with `localized(item, "title", lang)` from `src/app/_components/i18n.ts`: the `_ar` field in Arabic, English when it is missing. Put `dir="auto"` on such text so an English fallback still reads left to right.
- Dates, times and numbers go through `format.ts` / `formatNumber` (Arabic uses `ar-SA` on the Gregorian calendar, with Arabic-Indic digits).
- Lay out with logical CSS (`inset-inline-start`, `margin-inline-end`, ...), not `left`/`right`, and do not letter-space Arabic text. Mirror only what is horizontal: in Arabic the end side (the rail, a shelf's forward chevron) is on the left, so a sideways key or gesture that means "forward" maps to ArrowLeft when `dir` is `rtl`. The Swipe Brief moves vertically, so its keys and tap thirds do not change.

## The Edition v3 contract

`schema/edition.v3.schema.json` (draft 2020-12, closed objects) is what the gathering side validates against and what `POST /api/editions` enforces, followed by cross-reference checks the schema cannot express (unique Item and Thread ids, `thread_id` and `top_stories` must point inside the Edition). `src/server/editions/types.ts` mirrors it in TypeScript. Change both together, and only additively, so Editions already posted stay valid.

Rework ticket 10 added three optional Item fields:

- `image_kind`: `photo` | `card` | `none`, what the picture is. Stored in `items.image_kind` (`migrations/t10_item_pictures.sql`). The Brief, Threads and Saved & Search return every Item's `image_kind`, read with `imageKindOf` (`editions/types.ts`): the stored value, else `photo` when there is an image, and `none` whenever there is no image.
- `nsfw_media: true` (Adult Trending): explicit media. Stored in `items.nsfw_media` and returned as `media_blurred` (see [Sensitive Topics](#sensitive-topics)).
- `claim_subject`: the named person a claim is about. Only the gathering tool uses it; ingest accepts it but does not store it (`IGNORED_ITEM_FIELDS`).

A bad value in any of them is a `422` like any other schema failure.

Ingest is all-or-nothing and idempotent:

- A valid Edition is stored in one transaction and the response is `200 {accepted: true, edition_id, counts: {items, threads, topics}}`.
- An invalid one gets `422 {accepted: false, reasons: [...]}` and nothing is stored. A missing or wrong token gets `401`.
- Items are upserted by stable id. The stored version is the one from the newest Edition (by `generated_at`) that carried it, so posting an older Edition late never overwrites newer facts.
- A Brief is built from the latest Edition alone (each Edition is complete), plus the Adult Trending Items the app gathers itself from Reddit (issue #19, see [Adult Trending from Reddit](#adult-trending-from-reddit-issue-19)), which no Edition carries.

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
- Later tickets add only UI and behaviour: `layouts` (ticket 09, see [Layouts](#layouts-screen-classes-and-the-reader-pane)), `topic_order`, `pinned`, `collapsed`, `widgets`, `dock` (ticket 11, see [Arranging the Brief](#arranging-the-brief-groups-and-edit-mode)), `unblurred` (ticket 10; its switches are in the Me tab's Sensitive Topics section, see [Sensitive Topics](#sensitive-topics), and in Edit mode and Me › Display since ticket 11). Every key has its controls in Me › Display (`src/app/me/display/page.tsx`, `_components/display-controls.tsx`).
- Tests: `test/api/display.test.ts` (defaults, partial updates, every validation reason, syncing between two sessions, another Reader untouched); `e2e/display.spec.ts` (changing theme and accent survives a reload and reaches another device; Arabic).

### In the browser

- The root layout reads the Display on the server (as it does the language) and renders it on `<html>` as `data-theme`, `data-accent`, `data-text-size` and `data-density` (`displayAttributes` in `_components/display-attributes.ts`). `globals.css` styles everything from those attributes, so the first paint is right with no script and no flash; `auto` follows `prefers-color-scheme` in CSS. Signed out, the defaults apply. The browser bar colour (`generateViewport`) follows the theme too. The Layout is not among them: it depends on the screen, which only the browser knows (see [Layouts](#layouts-screen-classes-and-the-reader-pane)).
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
- The Swipe Brief and its sheets are built on these tokens (ticket 08), so the accent and text size reach the Brief, and its sheets follow the theme. The canvas adds `--on-photo` / `--on-photo-mute` / `--on-photo-faint` (text over pictures) and `--why` (the why-line: the accent, or a lighter `#ffd789` for amber); `--plate` is the white plate under a logo badge in every scope, and `--on-photo` is defined in every scope too, for text over a picture in a sheet (the media veil, ticket 10). Gradients and shades over pictures (the bottom shade, the Cover glow) keep their own `rgb()` values. The bottom tabs keep a fixed 11px label on purpose, so their height never changes.

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

## The Swipe Brief (the Reels look)

Rework ticket 08 (issue #8, [spec #6](https://github.com/Montasaa/morning-brief/issues/6)). By default on a phone and an upright tablet (and wherever the Reader picks it; see [Layouts](#layouts-screen-classes-and-the-reader-pane)) the Brief is **Swipe**: the Cover, one Item per screen, then "You're caught up", on the dark Brief canvas.

### Pieces (`src/app/_components/`), shared with the other Layouts

- `swipe-brief.tsx`: the slides and their inputs. Each slide is full height in a CSS scroll-snap container (`scroll-snap-stop: always`), so a drag stops exactly one slide on. `useSnapSlides` tracks the slide on screen (`active`, from the scroll position) and moves with `go(i)` / `step(±1)`; a step taken before the last move lands builds on it.
- `reels-card.tsx`: **the Reels card**, one Item full-bleed: the picture by kind, the bottom shade, the text (why-line on top stories, **Topic** · time · Updated, headline, two-line summary, Story Thread chip), the rail, the veil and the double-tap heart. The reader pane shows the same component with `fit="pane"` (it fills the pane, rail over the picture, at every width; never dimmed there). Its `children` go over the picture, under the text: Swipe puts its tap thirds there. In Swipe from 1024px wide it is a centred 10:16 card with the rail beside it.
  - **Pictures**: `pictureKind(item)` is `item.image_kind` (graded by the pipeline and the legacy importer, ticket 10), else `photo` when there is an image, else `none`. `previewKind(item)` is the kind a small preview with no "Tap to view" may show (Up next, and the Front Page tiles and List rows): `none` for a blurred Item or explicit media. `photo` fills the frame (cover crop); `card` is a badge up to 88px tall on a white plate (`object-fit: contain`) over a plain card with a bigger headline; `none`, and any picture that fails to load, is a plain dark gradient. The card says which in `data-picture`.
  - **The veil**: a `blurred` Item has its picture and text blurred and `inert`, a light scrim under the tap thirds, and a centred button (eye, Topic name, warning, "Tap to view"). No red. Leaving the card veils it again; double-tap does nothing while veiled.
  - **The media veil** (ticket 10): a `media_blurred` Item keeps its picture (or card badge) blurred under `<MediaVeil>` (`item-image.tsx`: eye, "Explicit media", "Tap to view"; `data-testid="media-veil"`) even when it is not `blurred` and its text shows, and after the Item veil is tapped open. The card says so in `data-media-locked`. Leaving the card closes it again; the read sheet has the same veil. Any other place that shows an Item's picture must either use `<MediaVeil>` or `previewKind`.
- `reactions.tsx`: `useReactions` (the Brief with this page's Reactions applied), `<Rail>` (the Reader's Display `dock` buttons in order, from Like, Save, Ask, Hide and Share; Like and Save pop and give a light haptic tick through `navigator.vibrate`; Share hands the first source's link to `navigator.share`, else copies it), the hide-reason sheet and `<UndoToast>`. `DOCK_LABELS` names every dock button.
- `sheet.tsx`: `<Sheet>`, the bottom sheet every sheet uses. It renders into `<body>`, outside the canvas, so it is in chrome colours; it rises, closes by its Close button, Esc, the scrim or a drag down (by its handle, or anywhere that is not a control), and is a centred dialog from 1024px. While one is open the Swipe Brief ignores keys (`sheetOpen()`).
- `read-sheet.tsx` (tap the card's text, or Enter): the picture, meta, headline, why-line, full summary, extras (`card-extras.tsx`), "Also in", Like / Save / Ask and the sources. Opening it records an `open`, so the Item comes back dimmed (`data-dimmed`). `ask-sheet.tsx` is the Ask sheet.
- `topic-tabs.tsx`: `FOR_YOU` and `groupKey(group)` (a group's tab key), and `<TopicTabs>` ("For you", then the Topics in Brief order) with a sliding indicator; the caller says which is `current` (Swipe: the Item on screen; Front Page: its scroll spy). It scrolls its own strip, never the page.
- `cover.tsx`: the Cover's full-screen form (greeting, date, Edition and Item count, the Widgets, a drifting glow, the language switch) and `<CaughtUp>`. `<NothingToShow>` (ticket 10) is the note under the Edition line when `brief.nothing_to_show`, in the full-screen form and in the header form alike. `useCoverLines` gives the header form (Front Page and List) the same lines; both forms carry the Layout switch; `cover-widgets.tsx` draws the Widgets as quiet rows (`<WidgetRows>`).
- `item-image.tsx`: `<ItemImage>`, an Item's picture with `onFail`, which also catches a picture that failed before the page was running (React misses that error event). Use it for every Item picture so a failed one falls back to the plain gradient.
- `icons.tsx`: the line icons (`<Icon name="heart" filled />`).
- `client-time.ts`: `useNow()` (the time, once the page has loaded, for relative times and countdowns) and `prefersReducedMotion()` for motion driven by script.

### Inputs

- A vertical drag snaps one Item per stop. Tapping the **upper third** of the picture goes back, the **lower third** forward; the middle third is free for **double-tap to like** (the card's text and rail sit above the thirds). On the Cover only forward, on "You're caught up" only back.
- Keys (ignored while typing or with a sheet open): j, ArrowDown, Space, Page Down forward; k, ArrowUp, Shift+Space, Page Up back; Enter opens the read sheet; the PC shortcuts (s, l, h, a, /, ?) act on the Item on screen (see [Keyboard](#keyboard-pc)).
- Topic tabs jump to a group's first Item ("For you": the first top story). From 1280px the "Up next" list jumps too.
- Arabic mirrors only the horizontal parts: the tabs and their indicator, the rail and text sides. Moving stays vertical.
- Motion (the text settling in, the photo's zoom-settle, the like pop and burst, the tab indicator, sheets, the glow) is off under reduced motion, and no start state hides anything: the hidden-until-active text is only hidden under `prefers-reduced-motion: no-preference`. Under reduced motion, moves made by tap, key or tab jump instead of scrolling smoothly (a jump of more than one slide always does); a drag still settles on its slide, since snapping is what makes it stop one Item on.

### Testing it (browser seam)

- Only the slide on screen is exposed: the others are `inert` and `aria-hidden`. So `page.getByRole("article")` is the current Item and `getByRole("heading", { level: 2 })` its headline; `getByTestId` does not skip hidden slides, so scope it (`swipe.card(page).getByTestId("thread-chip")`).
- `e2e/support.ts` has `swipe`: `card`, `headline`, `cover`, `tabs`, `rail`, and `next` / `back` / `drag`. `next` and `back` wait for the move to land: Playwright scrolls a target back into view before tapping it, so a second tap made mid-move would undo the first. They tap near the start side, clear of the text and the rail (which is on the left in Arabic).
- Test drags by distance, not speed: a long drag (past half a screen) moves one Item however fast, a short slow one settles back. A fast short flick is judged by its speed, which CDP's event timing makes unreliable. Wait for `networkidle` before the first drag: the dev server can drop a gesture made while it is still loading the page.
- Selectors: the Cover is the region "Cover" ("الغلاف"), the end the region "End of the Brief"; the tap thirds are the buttons "Back" / "Next"; the rail the toolbar "Actions"; the tabs the navigation "Topics", the current one `aria-current="true"`; the veil's button contains "Tap to view"; the card's `data-picture`, `data-dimmed`; the scrolling column `data-testid="swipe-slides"`; the double-tap heart `data-testid="like-burst"`; a sheet's handle `data-testid="sheet-handle"`.
- Specs: `e2e/swipe-brief.spec.ts` (Cover, tap thirds, keys, drag, tabs, read sheet, pictures), `reactions.spec.ts` (rail, double-tap, hide and Undo; its own Reader, since likes change ranking), `sensitive-topics.spec.ts` (veil), `arabic-rtl.spec.ts`, `desktop-brief.spec.ts` ("Swipe on a PC": centred card, Up next).

## Layouts, screen classes and the reader pane

Rework ticket 09 (issue #9, [spec #6](https://github.com/Montasaa/morning-brief/issues/6)). This replaces the old desktop card-plus-side-list. The Brief page (`src/app/page.tsx`) renders `<BriefLayouts>` (`_components/brief-layouts.tsx`), which keeps the Reactions (so switching Layout keeps them) and shows one of three Layouts: **Swipe** (above), **Front Page** or **List** (`front-page.tsx`).

### Screen classes and which Layout

`_components/screen-class.ts`, read in the browser from the viewport (`useScreen()`, which follows resizes and rotation):

| Screen class | Width | No pick | Navigation | Reader pane |
| --- | --- | --- | --- | --- |
| phone | under 768px | Swipe | bottom tabs | full screen |
| tablet, upright (at least as tall as wide) | 768–1279px | Swipe | bottom tabs | full screen |
| tablet, sideways | 768–1279px | Front Page | sidebar | beside the page (430px) |
| PC | 1280–1599px | Front Page | sidebar | beside the page (430px) |
| wide | 1600px and over | the PC's | sidebar | always open (460px), plus a Widgets column (300px) |

- `layoutFor(display.layouts, screen)` is the pick for the class (`pickFor`: wide uses `pc`), else the default above. Once tablet has a pick it applies both ways up; without one, turning a tablet switches Layout.
- The Reader picks with the Layout switch on the Brief (`layout-switch.tsx`, on the Cover in Swipe and the Cover header in Front Page and List; it sets the pick for the screen class it is on) or per class in Me › Display ("Automatic" sends `null`). Validation is #7's (`422` for anything but `swipe`, `front_page`, `list` under `phone`, `tablet`, `pc`).
- The screen is unknown on the server, so the server sends the dark canvas and the Layout appears once the page is running (no wrong Layout flashes, but the Brief is blank for that moment).
- CSS repeats the same breakpoints: `@media (min-width: 1280px), (min-width: 768px) and (orientation: landscape)` is "the sidebar shows" (tablet landscape, PC, wide), `min-width: 1600px` is wide. In `globals.css` that query sets `--sidebar-w: 240px` and `--tabbar-h: 0px`; `body` keeps `padding-inline-start: var(--sidebar-w)`, and fixed-position screens (the Brief) use `inset-inline: var(--sidebar-w) 0` and `bottom: var(--tabbar-h)`, so every screen stays clear of whichever navigation shows.

### Navigation

`tab-bar.tsx` renders both the bottom tabs (navigation "Tabs") and the sidebar (navigation "Sidebar": Brief, Threads, Saved & Search, Me, in chrome colours); CSS shows one. While the Brief is open each Layout fills the sidebar's Topics slot with `<SidebarTopics>` (each Topic with its Item count; clicking one jumps to it like its Topic tab).

### Front Page and List

- Both are one scrolling page on the canvas: Topic tabs on top (a scroll spy marks the group at the top; a tab or sidebar jump keeps its tab until the scrolling stops), the Cover as a header (greeting, date, Edition, the Layout switch, the language switch and the Widgets as a row; on wide the row is left out and the Widgets get their own column, the complementary "Today"), then the groups in Brief order (`brief.groups`), then "You're caught up".
- **Front Page**: "For you" is up to 3 big 3:4 cards in one row (a third of the width each; sideways scrolling when narrow) with their why-lines; each Topic is a sideways shelf of 10:15 cards, `--shelf-card-w` wide (196px, 168px compact), with scroll snap and back/forward buttons shown on hover (always on touch screens; they scroll by 80% of the shelf, the other way in Arabic).
- **List**: rows (a square thumbnail, `--list-row-thumb` 56px / 44px compact, **Topic** · time · Updated, a one-line headline cut off with an ellipsis) under sticky group headings; the top stories first. At most 760px wide.
- A card or row is an `article` (`data-item`); its headline is the button that opens it (stretched over the whole card). It carries `data-selected` (open in the pane: outlined in the accent), `data-dimmed` (opened before and not open now: 45%, full on hover) and `data-picture`. Hover lifts a card 2px and zooms its photo 1.03.
- **Sensitive Items**: a card or row of a `blurred` Item has its picture and headline blurred and hidden from assistive tech, and a "Tap to view" button; tapping shows the headline on this page, and opening it then shows it unveiled in the pane (`ReelsCard`'s `initiallyRevealed`) and records the open. Reached with j/k without that tap, it is veiled in the pane as in Swipe.

### The reader pane

`reader-pane.tsx`, the complementary "Reader": the Reels card (`fit="pane"`) with its position ("3 / 7", in Arabic digits in Arabic) and the keys at the foot, or Ask (`<AskPanel>` from `ask-sheet.tsx`, the region "Ask Claude", with a "Back to the story" arrow).

- Opening an Item there (click, j/k, Enter) records an `open`, so it dims on the page; a veiled Item is not counted until it is seen. On wide the pane opens on the first top story when the page loads, without recording an open, and has no close button.
- Hiding the open Item moves the pane on to the Item that took its place.
- Motion (off under reduced motion): the pane slides in from the end side (the left in Arabic), and the card slides up or down on j/k (`data-dir`).

### Keyboard (PC)

Ignored while typing, with a modifier, or while a sheet is open (`isShortcut` in `shortcuts.tsx`).

- Front Page and List: j / ArrowDown and k / ArrowUp move the pane through the Brief's order (opening it on the first Item if closed); Enter opens the first Item, or the read sheet for the open one; Esc goes from Ask to the card, then closes the pane (it works from the question box too).
- Every Layout: s save, l like, h hide (asks why, as the rail does; with no Hide on the Reader's dock it just hides, with Undo), a Ask (in the pane, or the Ask sheet in Swipe), on the Item being read; `/` goes to Saved & Search with the search box focused (`/saved#search`); `?` lists the shortcuts; `e` turns Edit mode on and off (see [Edit mode](#edit-mode)). In Front Page and List, Esc also leaves Edit mode once the pane is closed.

### Testing it (browser seam)

- `e2e/support.ts` has `frontPage`: `group(page, name)` (the region for "For you" or a Topic), `open(page, title)` (the button that opens an Item), `pane`, `paneHeadline`, `sidebar` and `layouts` (the radiogroup "Layout"). The pane's position is `data-testid="pane-position"`.
- The e2e server keeps one database for the run, so a spec that picks a Layout resets it first (`PATCH /api/me {display: {layouts: …null}}`), or uses its own Reader.
- Specs: `desktop-brief.spec.ts` (Front Page, the pane and j/k, Ask in the pane, the sidebar and tabs, List and the switch surviving a reload, a sensitive card, `?` and `/`, Arabic, a tablet turned both ways, and "Swipe on a PC"), `wide-brief.spec.ts` (the pane open on the first top story, the Widgets column), `front-page.spec.ts` (phone: picking Front Page, the full-screen pane, Me › Display's Layout picks).

## Arranging the Brief (groups and Edit mode)

Rework ticket 11 (issue #11, [spec #6](https://github.com/Montasaa/morning-brief/issues/6)). The Reader arranges their Brief with their Display: Topic order, pins, collapse, the Cover's Widgets and the dock. **Display never changes what is in the Brief or how it ranks**: the Scorer and the top picker never read it; it only decides where groups sit and how they look.

### `groups`

`GET /api/brief` (and the Brief page) returns `groups` in Display order, and `items` in that same order (Swipe's order):

1. the top stories (`kind: "top"`, `topic: null`), when there are any;
2. Pinned Topics, in `pinned` order;
3. then `topic_order`;
4. then the remaining followed Topics by `rank`: groups by their best Item, then the followed Topics with nothing in this Edition, in Catalog order.

Topics in the lists that the Reader no longer follows are skipped (they stay in the Display and count again when followed). Each group is:

```ts
{
  kind: "top" | "topic";
  topic: string | null;
  pinned: boolean;           // in Display `pinned`: a small pin by its name
  collapsed: boolean;        // in Display `collapsed`: headlines only; its Items are still in item_ids
  item_ids: string[];        // by score, never changed by Display
  nothing_qualified: boolean; // a followed Topic no Item in this Brief carries: item_ids is empty
  note: string | null;       // the Edition's note on why nothing qualified (Edition v3 carries none yet: null)
  sensitive: boolean;        // a Sensitive Topic: Edit mode shows its blur switch
  rank: number;              // ranked place (0 = top stories), which Display never changes
}
```

- `src/server/brief/arrange.ts` does the arranging, with no server imports: `composeBrief` arranges with the stored Display, and `<BriefLayouts>` arranges the same Brief again with the Display on screen, so a change shows at once (before it is saved) and a change made on another device shows when the page comes back into view. `arrangeWidgets` orders `cover.widgets` by Display `widgets` (the server's `withWidgets` uses it too) and puts the eligible Widgets the Reader removed in `cover.more_widgets`, so Edit mode can add them back.
- **Nothing qualified** is a Topic that no Item in the Reader's Brief carries (an Item shown under another Topic, or as a top story, counts). The app adds these; the pipeline doesn't have to.
- **Never Sensitive first**, whatever the arrangement: with no top stories, if the first group with Items is led by a Sensitive Item, the first group led by a non-Sensitive one moves in front of it (pins included). When every group is led by a Sensitive Item but a lower Item is not, the composer makes the best non-Sensitive Item the top story first (this does not read the Display). Only a Brief of nothing but Sensitive Items opens on the nothing-to-show note.

### Edit mode

`<BriefLayouts>` keeps Edit mode (so it survives a Layout switch): the Edit button (on the Swipe Cover; in the Cover header of Front Page and List, `aria-pressed`) or `e` turns it on; Done (or `e`, or Esc in Front Page and List) leaves. Every change is a Display change through `useArrange()` (`_components/arrange.tsx`), shown at once and saved straight away; a failed save puts it back. The blur switch also refreshes the page's data, because `blurred` is decided on the server.

- **Front Page and List** (`front-page.tsx`): each Topic heading gets quiet controls (`<TopicControls>`): a drag handle (HTML drag and drop onto another heading of the same section), "Move X up" / "Move X down" (so keyboards and screen readers never need to drag), "Pin X" and "Collapse X" (`aria-pressed`), and "Blur X" (a switch) for a Sensitive Topic. The cards stay still. A bar under the tabs says Edit mode is on and holds Done. The Cover's Widgets are edited in place (`<WidgetPicks>`: move, remove, "Add X" for `more_widgets`; on wide in the Widgets column).
- **Swipe** (`swipe-brief.tsx`): Edit opens `<EditSheet>`, the dialog "Arrange your Brief": every Topic as a row with the same controls (`<TopicList>`), the Cover's Widgets and Done.
- **Me › Display** has the same Topic list and Widgets (every Widget kind, since eligibility depends on the day) plus the dock (`<PickList>`, 1 to 5 buttons). `arrangeableGroups` (compose.ts) gives it the Brief's groups plus a group for every followed Topic that has none in the Brief (its Items are all top stories or filed under another Topic, or there is no Edition yet), so every followed Topic can be arranged; the Brief's Sensitive Item ids keep its order identical to the Brief's.
- Reordering works inside a section: Pinned Topics among themselves (writes `pinned`), the rest among themselves (writes the whole on-screen order as `topic_order`). Pinning adds the Topic at the end of `pinned`; unpinning puts it first in `topic_order`, so it stays near the top. Swipe stays on the slide it was on when a change re-arranges the slides, and `e` closes the Edit sheet as it opened it.
- In the browser, `useReactions` keeps a Sensitive Item off the top after a hide too (`placeSensitive`), since hiding can empty the group that led.

### How each Layout shows it

- **Pinned**: first after the top stories, with a pin (`pushpin` icon, the accent) by the name in headings, Topic tabs, the sidebar and the digest card. Topic tabs and the sidebar follow the group order.
- **Collapsed**: Front Page and List show a one-row strip of headlines (a sensitive one says "Sensitive Item: Topic · Tap to view" until tapped) with an Expand button; hovering an expanded Topic's heading offers "Collapse X". Swipe shows one digest card (the article "X: headlines") listing the headlines; "Open X" or a headline puts its Items in its place for this visit only.
- **Nothing qualified**: Front Page and List show the heading and "Nothing qualified in this Edition." (no Topic tab; the scroll spy skips them, `data-no-tab`). Swipe has no slide for them; "You're caught up" names them (`data-testid="nothing-qualified"`), and the sidebar's entry jumps there.
- **Dock**: the rail on the Swipe card and in the reader pane.

### Testing it

- API seam: `test/api/arrange-brief.test.ts` (group order with pins and `topic_order`, collapse, unfollowed Topics skipped, the never-ranking check across every kind of Display change, nothing qualified, never Sensitive first under any arrangement, Widgets order and `more_widgets`, validation of the arranging keys).
- Browser: `e2e/desktop-arrange.spec.ts` (Edit mode pinning and collapsing, surviving a reload; move up/down from the keyboard and dragging a handle, in List where both headings fit on screen; Widgets in place; nothing qualified; hover collapse; the dock in the pane) and `e2e/arrange.spec.ts` (phone: the digest card, the Edit sheet, Me › Display in English and Arabic, the dock on the rail, nothing qualified at the end). Playwright's `dragTo` does not start an HTML drag here; the spec's `drag` helper moves the mouse in steps instead.
- Specs that arrange things reset the arranging keys first (`PATCH /api/me {display: {pinned: null, ...}}`): the e2e database lasts the whole run.

## Sensitive Topics

Ticket 08, reworked by rework ticket 10 (issue #10, spec #6). Graphic and Adult Trending (`topics.sensitive`) are hidden from every Reader until they opt in. The rules live in `src/server/topics/sensitive.ts`.

- Opting in is following the Sensitive Topic with `POST /api/topics/{id}/follow`, which the Me tab's "Sensitive Topics" section does. Adult Trending also needs the body `{"age_confirmed": true}` (else `422 {error, reasons}`); each confirmation is recorded (`age_confirmations`) and `GET /api/me` shows the latest as `age_confirmed_at`. Unfollowing is opting out, and opting in again asks again.
- `PATCH /api/me {topics}` never adds a Sensitive Topic (`422`, "opt into it from the Me tab"); it may keep or drop ones already opted into. So onboarding can never pre-select one.
- A **sensitive Item** carries at least one Sensitive Topic (the Brief marks it `sensitive: true`). It reaches a Reader only if they opted into every Sensitive Topic it carries, even when it also carries a Topic they follow.
- **The blur switch.** A sensitive Item is `blurred: true` unless the Reader turned the blur off for *every* Sensitive Topic it carries: Display `unblurred` (`PATCH /api/me {display: {unblurred: [...]}}`; only Sensitive Topics they opted into; opting out takes one back out). The Me tab has a "Blur <Topic>" switch for each one opted into.
- **Explicit media** (`nsfw_media` in the Edition) comes back as `media_blurred: true` whatever the switch says: its picture stays behind its own veil until tapped (see [The Swipe Brief](#the-swipe-brief-the-reels-look)).
- Anything that lists Items to a Reader (Story Threads, Saved & Search, Widgets that name Items) must use the same rules: put `sensitiveItemVisibleSql("i.id")` (one `?`, the Reader's id) in its `WHERE`, `blurredItemSql("i.id") AS blurred` (one `?`, the Reader's id) and `i.nsfw_media` (as `media_blurred`) in its columns, and test it at the API seam. `sensitiveItemSql("i.id")` (no parameters) is "is it sensitive", for the rules below.
- **Never first** (`compose.ts`, `top-picker.ts`): a sensitive Item is never a top story. Claude is not offered one, and the Scorer's fallback and the Edition's own `top_stories` skip them. A group led by a sensitive Item (every Sensitive Topic's group, and any group whose best Item is sensitive) moves after the first group led by one that is not (`placeSensitiveGroups`; Item order inside groups is unchanged). When no group is led by a non-sensitive Item (a Reader who follows only Sensitive Topics), the Brief says `nothing_to_show: true`: it opens on the Cover with the `<NothingToShow>` note, and the sensitive Items follow.
- **Never in a push** (`push/edition-pushes.ts`): "Brief ready" names the top story, else the first non-sensitive Item, else no Item at all; a Story Thread development that is a sensitive Item sends no push. This holds whatever the blur switch says.
- **Adult Trending is the Owner's alone** (`topics.owner_only`, `migrations/t10_owner_only_topics.sql`): `VISIBLE_TO_READER` (`topics/catalog.ts`) leaves it out of every other Reader's Catalog, so for them it is not in `GET /api/topics`, follow, unfollow and share are `404`, `PATCH /api/me` refuses it, it is stripped from Items' `topics`, and its Items never reach them (they cannot opt into it). The gathering list counts only the Owner as its follower. The migration removed any other Reader's opt-in.
- In the Swipe Brief a blurred Item sits behind the neutral veil (eye, Topic name, warning, "Tap to view"; see [The Swipe Brief](#the-swipe-brief-the-reels-look)) every time it comes round; moving past it never reveals it. Any other place that shows an Item ("Up next", Threads, Search) keeps its title behind the warning until tapped, and shows no picture of a blurred or `media_blurred` Item without a veil.
- Tests: `test/api/sensitive-topics.test.ts` (opt-in, the blur switch, `media_blurred`, never first, Owner-only), `test/api/push.test.ts`, `test/api/top-stories.test.ts`; `e2e/sensitive-topics.spec.ts` (the veil, the Me tab, blur off, the media veil).

## Reader-created Topics and Gathering Rules

Ticket 11. `src/server/topics/reader-topics.ts` (create, share) and `gathering-rules.ts` (drafting, Owner edits, the gathering list).

- **Visibility.** A Reader's Catalog is the starting Topics, every shared Topic and their own private ones, less any Owner-only Topic (Adult Trending, rework ticket 10) for everyone but the Owner. Another Reader's private Topic does not exist for them: `404` on follow and share, refused by `PATCH /api/me`, and stripped from Items' `topics` in their Brief. Anything that lists or accepts Topic ids for a Reader goes through `listCatalog` / `catalogTopic` / `unknownTopicIds(ctx, ids, readerId)` or the `VISIBLE_TO_READER` SQL in `catalog.ts`, never a bare `SELECT ... FROM topics`. Whether a Reader may see an Item at all (a Topic in their Catalog, and the sensitive opt-in rule) is `itemVisibleSql` / `readerCanSeeItem` in `topics/visibility.ts`: anything that takes an Item id from a Reader (Ask, Reactions) answers `404` for an Item they may not see, as if no Edition carried it. The Owner's Catalog follows the same rule; the Owner sees every Topic through `GET /api/owner/topics` and the `/gathering-rules` page.
- **Creating.** `POST /api/topics {name, note?, name_ar?}` → `201 {topic}`, private and followed by its creator; `409 {error, limit}` past 10 created Topics (the Owner has no limit), `409 {error, topic}` when a Topic of that name is already in their Catalog. The id is a slug of the name, as Editions use it in `items[].topics`.
- **Gathering Rules** are plain text (trusted outlets, what counts, exclude). Claude drafts them with `purpose: "gathering-rules"`; when Claude fails the Topic is still created with a template marked `rules_by: "fallback"`. The house source rules (`HOUSE_SOURCE_RULES`) are not copied into each Topic: they go to Claude's prompt and to the gathering list. The Owner edits any Topic's with `PATCH /api/topics/{id}/rules {rules}`.
- **The gathering list** (`GET /api/gathering-list`, pipeline token) is `{house_rules, topics: [{id, name, name_ar, sensitive, rules, followers}]}`: every Topic followed by at least one Reader whose Invite is not revoked, in Catalog order.

## Story Threads

Ticket 14, in `src/server/threads/threads.ts`. Ingest links Items to Threads by `thread_id`; a new development is always a new Item, so a Thread's timeline is every Item ever linked to it, across all Editions, newest first.

- `GET /api/threads` (the Threads tab: followed Threads first, then the other *active* ones, i.e. those the latest Edition carries), `GET /api/threads/{id}` (`{thread, items, topic_names, topic_names_ar}`, each Item with its Asia/Riyadh `date`), `POST /api/threads/{id}/follow|unfollow` (idempotent). The Brief carries `threads` (by id) for the chip on each card.
- A Reader sees a Thread's Item only under the Brief's rules: it carries a Topic they follow (in their Catalog; another Reader's private Topic never counts and is stripped from `topics`, and `topic_names` come from the Catalog), and every Sensitive Topic it carries is one they opted into (sensitive Items come back `blurred: true`, and so does a Thread's `latest` development, whose title the Threads tab keeps behind its warning until tapped). A Thread they can see no Item of is a `404` and is never listed. Later rules that hide Items from a Reader belong in its `VISIBLE_ITEMS` SQL too.

## Widgets

Ticket 17, `src/server/widgets/`. `GET /api/widgets` returns `{city, city_found, timezone, widgets}`; the Brief's `cover.widgets` is the same list (the `/api/brief` route and the Brief page add it with `withWidgets`, so `composeBrief` stays synchronous).

- Weather and prayer times are live for the Reader's city, cached about 30 minutes in `widget_cache` (shared by everyone in the same place; failures are not cached). No city, or one that cannot be found: neither is shown, and the Cover links to the Me tab.
- The next match belongs to the Liverpool Topic and countdowns name their Topic: only followers see them, and only while they are still to come. Times are also given in the Reader's time zone (their city's, else Asia/Riyadh).
- A failing service drops only its own Widget; the Cover always renders.
- Widget tests fix the clock (`vi.useFakeTimers({ toFake: ["Date"] })`), since what is "still to come" depends on now. The e2e server runs on the real clock, so e2e Editions put widget times relative to `Date.now()`.

## The Catalog and the legacy importer

- The Catalog starts with the 14 starting Topics, seeded by `migrations/t02_topics.sql` (`GET /api/topics` lists them). Their ids (`saudi`, `wider-middle-east`, `turn-based-rpg-tactics`, `adult-trending`, ...) are what Editions put in `items[].topics`. Later tickets add columns to `topics` with their own migrations.
- `POST /api/editions/legacy` (pipeline token) imports a v2 / rev 2.x `brief.json`: `src/server/legacy/` converts it to an Edition v3 document and sends it through Edition ingest, so the response and the guarantees are the same. It grades pictures (ticket 10): `image_kind: "card"` for the hosts in `CARD_HOSTS` (`legacy/convert.ts`: GitHub Open Graph cards and repository previews, Hugging Face thumbnails, Google Cloud Storage model cards), `photo` for other images; and it capitalises each title's first letter (not a first word that already has a capital inside, such as "iPhone"). Add `?dry_run=1` to get the converted Edition back without storing it. Section-to-Topic mapping is in `src/server/legacy/topics.ts`; the Edition id comes from `generated_at` (`2026-11-14-morning`, `2026-11-14-evening`), so re-importing a file changes nothing.
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
- The Brief leaves hidden Items out, marks opened ones `dimmed: true`, and gives each Item `reactions: {like, save}` for the rail.
- Order comes from the Scorer, `scoreItems` in `src/server/brief/score.ts`: a pure function of followed Topics, the Reader's Reactions, recency (against the Edition's `generated_at`, not the clock) and status. Within a group Items run by score, groups by their best Item, ties newest first. So the non-top part of `composeBrief(...).items` is already the highest-scored first.
- Test ranking through the order of `GET /api/brief` (see `test/api/ranking.test.ts`), never the weights.
- In the Swipe Brief, `useReactions` (`src/app/_components/reactions.tsx`) holds the rail, the hide-reason sheet and the Undo toast. Opening the read sheet or any link on a card records an `open`.

## The Owner console

Ticket 10. `/owner` (linked as "Console" from the Owner's account bar on the Me tab) shows ingest health and "bad source" reports; other Readers are redirected to their Brief. The data comes from `src/server/owner/`, also served as `GET /api/owner/health` and `GET /api/owner/reports` (Owner only).

- **Reports** are read from the Readers' current `bad_source` hides, so undoing the hide or changing its reason withdraws the report. They group by Item (with its Topics and sources) and by source title, and count Readers without naming them. Other hide reasons never reach the Owner.
- **Rejected ingests**: a pipeline route that refuses a document from a caller holding the token (invalid Edition, body not JSON, a brief.json the legacy importer cannot convert) records it with `recordIngestRejection(ctx, {endpoint, doc, reasons})`. A new pipeline route that ingests should do the same. Calls without the token and legacy dry runs are not recorded. The console lists the newest 20; only the newest 200 are kept.

## Top stories and why-lines

Ticket 13. After an Edition is ingested, the top picker (`src/server/brief/top-picker.ts`) asks Claude (purpose `top-picks`) to choose 1–3 top stories for every Reader from their own ranked Brief (`rankBrief` in `compose.ts`), each with a "why this matters to you" line in English and Arabic. They are stored per Reader and Edition (`top_stories`, `src/server/brief/top-stories.ts`) and lead the Brief as the `top` group, with `why_for_you` / `why_for_you_ar` on each Item (null elsewhere; show them with `localized(item, "why_for_you", lang)`).

- `POST /api/editions` and the legacy import pick before they answer, so the Briefs are ready when ingest returns. Only the latest Edition is picked for; posting the same Edition again does not ask Claude again for a Reader it already answered for.
- Claude's answer is filtered to the Reader's own Brief, and the Brief drops a top story the Reader has since hidden or unfollowed. A sensitive Item is never a top story (ticket 10): Claude is not offered one, and every fallback skips them. When Claude fails or picks nothing usable, the tops are the Scorer's: the Edition's own `top_stories` in the Reader's Brief, then their highest-scored Items, up to 3, recomputed as their Reactions change, with no why-lines. A Reader with nothing picked (onboarded after the ingest) gets the Edition's own `top_stories`.
- So in tests, **a Reader who exists when an Edition is posted gets top stories picked for them**; one who signs in afterwards does not. The fake Claude's default `top-picks` reply picks the Edition's own top stories (or the Reader's first Item) with a canned why-line. Set `app.services.claude.replies.set("top-picks", ...)` for specific picks, or `app.services.claude.failing.add("top-picks")` to get the Scorer's tops (what `test/api/ranking.test.ts` does, so the whole Brief follows the score).

## Saved and Search

Ticket 15. `src/server/saved-search/` lists Items to one Reader from every Edition ever posted (nothing is pruned), as each Item's newest stored version.

- `GET /api/saved` returns `{items, topic_names, topic_names_ar}`: the Reader's `save` Reactions, newest-saved first, each with `saved_at`. Unsaving is `DELETE /api/items/{id}/reactions/save`.
- `GET /api/search?q=` returns `{query, results, topic_names, topic_names_ar}`: at most 50 Items whose title or summary (English or Arabic) contain every word of `q` (a word's beginning is enough), newest first. An empty query finds nothing; query text is always plain words, never FTS5 syntax.
- Each Item carries its date (`time`), the `topic` it is shown under (the first Topic the Reader follows, else its first Catalog Topic), its `thread` (`{id, title, title_ar}` or null), `blurred`, and the Reader's own `reactions: {like, save}`.
- Listing rules are `itemVisibleSql` (`src/server/topics/visibility.ts`): the sensitive opt-in rule, and at least one Topic in the Catalog as the Reader sees it (ticket 11: another Reader's private Topic does not count, and is stripped from the Item's `topics`).
- Search is SQLite FTS5 (`migrations/t15_search.sql`). Triggers on `items` only note which Items changed; `searchItems` folds the text (Arabic hamza forms, vowel marks, tatweel, ى/ة and a leading article; see `searchWords`) and indexes them before each search. So ingest needs no change, and the same folding is applied to queries.

## Adult Trending from Reddit (issue #19)

The app gathers Adult Trending itself, next to the brief.json import: `src/server/gathering/adult-trending.ts`, called by `POST /api/gather/adult-trending` (pipeline token), which cron runs every 15 minutes (`deploy/gather-reddit.sh`, see [`deploy/README.md`](../deploy/README.md)). The answer is always `200` with a report: `{skipped, feeds, feed_errors, screened, kept: [item ids], dropped: {reason: count}, retry_later, waiting}`; `skipped` says why nothing ran (nobody follows Adult Trending, no feeds listed, no Edition yet, a run already going).

- **Who and what.** Only while at least one Reader (not revoked) follows Adult Trending (the gathering list's rule, so only the Owner counts). Only the feeds listed in its Gathering Rules: every line that is exactly a subreddit RSS URL (`https://www.reddit.com/r/<subreddit>/[new/].rss`, `old.reddit.com` is read as `www`); other text is ignored and never fetched, and at most 20 feeds are read. An empty list gathers nothing.
- **Freshness.** Posts from the last 24 hours, de-duplicated by post id, newest first, at most 25 screened per run (the rest wait for the next). Each post is decided once and remembered in `reddit_posts` (`migrations/t19_reddit_posts.sql`): `kept`, `dropped` (with its reason) or `retry`.
- **The fixed limits, failing closed.** First a keyword blocklist (`blockedBy`, English, with leetspeak undone) over the subreddit, title and text: minors (teen, school, young, an age under 18, ...), non-consensual (hidden cam, revenge, asleep, deepfake, ...), leaked (leak, stolen, hacked, ...) and named people (celebrity, influencer, actress, ...). Then Claude (purpose `adult-trending-screen`) reads the post as data and must answer exactly `{"minors", "non_consensual", "leaked", "named_person", "keep", "headline", "headline_ar", "summary", "summary_ar"}`: any flag `true`, a missing or non-boolean flag, `keep` not `true`, or anything that is not that one JSON object (` ```json ` fences allowed) drops the post. A claim about a named person is always dropped, since nothing here looks for an outlet to back it. Claude's own headline and summary go through the blocklist too. A Claude error is retried on the next runs and the post is dropped after 3 failures; with Claude not connected (`OutsideServiceNotConnected`) nothing is screened or kept and the posts wait.
- **The Item.** `reddit-<post id>`, Topic `adult-trending` only, `status: "new"`, the post's time, Claude's sentence-case headline (else the post title with its first letter capitalised) and summary in English and Arabic (Arabic left out when Claude gives none), the Reddit post as the one source (`{title: "r/<sub> on Reddit", url, type: "social"}`), `warning` / `warning_ar` ("Adult content from r/<sub>"), the post's thumbnail as `image` (`image_kind: "photo"`, else `none`), `nsfw_media: true` when it has a picture or video, and `platform: "reddit"`, `creator: "u/<name>"`. It is checked against the Edition v3 schema before it is stored.
- **Next to the Editions.** Gathered Items are stored like any Item (`itemWriter` in `editions/ingest.ts`, filed under the latest Edition's id) but are never in `edition_items`. `rankBrief` (`brief/compose.ts`) adds the kept ones posted in the last 24 hours (`GATHERED_ITEMS_SQL`) to the latest Edition's Items. So a brief.json import (or any Edition) never removes them, and gathering never changes an Edition. Every Brief rule applies to them as to any Item: Owner-only, sensitive (blurred, never a top story, never first, never in a push), Saved and Search.
- **Tests:** `test/api/adult-trending-gathering.test.ts` (fake Reddit feeds and Claude replies; the clock is fixed, since freshness depends on now) and `test/platform/reddit-adapter.test.ts` (the Atom parser and request against a stand-in fetch). Use placeholder subreddits and safe titles in tests.

## Pipeline v3 (the gathering side)

Ticket 19. Gathering stays outside the app: the agent follows [`pipeline/PIPELINE-v3.md`](../pipeline/PIPELINE-v3.md) and uses the Python tool `pipeline/v3/edition_v3.py` (stdlib plus `jsonschema`), which turns its drafts into an Edition, checks links, validates against the same schema as ingest and posts to `POST /api/editions`. The v2 `pipeline/PIPELINE.md` keeps running unchanged until the switch-over.

- `web/test/pipeline/` tests the tool from outside: it runs as a child process (`runTool` in `test/support/pipeline-v3.ts`) against the test app served on 127.0.0.1 (`serveApp`), and the tests check its files, output and the app's API. So `npm test` needs `python3` (3.10+) with `jsonschema` 4.x on the PATH.
- Tests pass `--no-link-check` (drafts use example.com links); only the link-check test checks links, against a local server. Never let the tool reach the real network in a test.
- A change to `schema/edition.v3.schema.json` is picked up by the tool too; keep the house rules in `pipeline/v3/gathering/validate.py` in step with `HOUSE_SOURCE_RULES`.
- Adult Trending is gathered by the app itself since issue #19 (above). When Pipeline v3 takes over, decide whether the agent still gathers it; if it does, its Reddit Items and the app's would both show.
- Rework ticket 10 rules in the tool (`gathering/assemble.py`, `validate.py`): every draft needs `image_kind` (else the run stops), and an Item graded `none` needs no `image`; an all-lowercase title prints a `warning:` line; an Adult Trending Item whose sources are not Reddit (`reddit.com`, `redd.it`), apart from one outlet report as the second source, is left out, and the Reddit post is put first; any Item with a `claim_subject` and no non-Reddit outlet source (`independent` or `wire`) is left out; `nsfw_media` passes through. Tests use placeholder `reddit.com` URLs that are never fetched (`--no-link-check`).

## Installable app and push

Ticket 18. The Brief installs to the home screen and sends two opt-in pushes.

- **Installable.** `src/app/manifest.ts` (served at `<base path>/manifest.webmanifest`) and the service worker `public/sw.js` are scoped to the base path itself (`/brief`, not `/brief/`, since that is the Brief's URL); `next.config.ts` serves `sw.js` with `Service-Worker-Allowed` for that. The root layout registers it on every page (`_components/service-worker.tsx`). It shows pushes and opens the app on tap; it does not cache or intercept requests. Icons are drawn by `node scripts/make-icons.mjs` into `public/icons/` and `src/app/{icon,apple-icon}.png`; links to them carry the base path.
- **Devices.** `GET /api/push/subscriptions` → `{public_key, subscriptions: [{endpoint, created_at}]}`; `POST` a browser `PushSubscription` (`{endpoint, keys: {p256dh, auth}}`) → `201`, `422` for anything else; `DELETE {endpoint}` → `{removed}`. A subscription belongs to the session that made it: signing out of (or revoking) a device stops its pushes. Subscribing an endpoint again moves it to whoever is signed in there now.
- **Preferences** are in the Interest Profile: `GET /api/me` has `notifications: {brief_ready, thread_updates}`, both `false` until turned on with `PATCH /api/me {notifications: {...}}`. The Me tab's "Notifications" section holds the switches, the device's on/off button and the install prompt.
- **Sending** (`src/server/push/edition-pushes.ts`): the ingest routes call `sendEditionPushes` after top picking, before they answer, and only for the latest Edition. "Brief ready" goes once per Reader and Edition to opted-in Readers whose Brief has Items, naming their top story (or else their first non-sensitive Item, or no Item at all; never a sensitive one, ticket 10), in their language. An Item linked to a Thread for the first time (`thread_developments`) pushes to that Thread's opted-in followers who may see it under the Brief's rules, one push per Reader and Thread; a sensitive development pushes nothing. A device the push service reports gone is forgotten; a failing one never fails the ingest.
- In tests, subscribe a made-up device (`POST /api/push/subscriptions` with any `https` endpoint and base64url keys), opt in, post an Edition, then read `app.services.push.sent`. The browser smoke test never subscribes (that would reach a real push service); headless Chromium reports notifications as blocked.

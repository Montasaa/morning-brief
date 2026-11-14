# Morning Brief v3: build plan

Implements [`SPEC-v3.md`](SPEC-v3.md). Each phase ends with something working that you can open. The current Glance site keeps running untouched until phase 9.

## Phase 0: foundations
- New Next.js (App Router, TypeScript) app in `web/`, with SQLite through `better-sqlite3` + Drizzle and a migrations folder.
- Tables: `readers`, `invites`, `topics` (with `gathering_rules`, `sensitive`, `owner_reader_id`, `shared`), `topic_follows`, `editions`, `items` (EN + AR fields, kind-specific extras as JSON), `item_topics`, `threads`, `item_threads`, `reactions`, `hide_reports`, `asks`, `push_subscriptions`, `reader_tops` (each Reader's top stories and why-lines per Edition).
- **Importer**: loads today's `brief.json` (v2 / rev 2.3) and `samples/brief.sample.json` into Editions, mapping sections to the starting Topics. This gives real data from day one.
- Seed the Catalog with the 14 starting Topics.

## Phase 1: the Swipe Brief (Owner only, local)
- Cover card (date, Edition, Widget slots), then the swipe stack with a progress bar per Topic, tap left/right, keyboard arrows, and the bottom dock.
- EN/AR with full RTL. Sensitive blur. Status badges.
- Desktop: the card plus a side list.
- Bottom tabs, with Threads, Saved and Me as placeholder screens.
- Usable test: read a whole real Edition on a phone over the LAN.

## Phase 2: Readers and sign-in
- Owner creates Invites, and Readers sign in with an email magic link sent through **Resend** (API key from env).
- Onboarding: pick Topics, write an optional line about yourself, Claude suggests more Topics. Sensitive Topics are opt-in, and Adult Trending needs an 18+ confirmation.
- Me tab: followed Topics, language, opt-ins, creating private Topics (cap 10) and sharing them to the Catalog.

## Phase 3: Reactions and ranking
- Like, save, open (dims the Item), and hide with a reason. *Bad source* creates a report for the Owner.
- Scoring for each Reader from followed Topics, Reactions, recency and status.
- Owner screen: hide reports, every Topic and its Gathering Rules (editable), and each Reader's Ask cap.

## Phase 4: Pipeline v3 (Editions into the app)
- Edition document v3: Items carry `topics[]`, optional `thread_id`, EN + AR, plus next-fixture and countdown data for Widgets.
- `schema/edition.v3.schema.json`, plus an authenticated ingest endpoint (`POST /api/editions`, token from env).
- `pipeline/PIPELINE-v3.md`: gather for every followed Topic using its Gathering Rules, link Items to Story Threads, check links, validate, and post the Edition.
- After ingest, Claude picks each Reader's top stories and writes the why-lines.
- Claude drafts Gathering Rules when a Topic is created.

## Phase 5: Threads, Saved and Search
- Threads tab: followed Threads plus active ones, each with a dated timeline. A Thread chip and Follow button on cards.
- Saved & Search tab: the saved list, and full-text search (SQLite FTS5) across every Edition.

## Phase 6: Ask Claude
- A sheet on each card. Answers draw on the Item's sources plus web search, cite their links, and are private to the Reader.
- Daily cap per Reader (default 20, unlimited for the Owner), with the count shown on the sheet.

## Phase 7: Widgets
- Weather (**Open-Meteo**) and prayer times (**Aladhan**, Umm al-Qura method) for each Reader's city, live. Neither needs an API key.
- Next Liverpool match and countdowns, taken from the Edition data.

## Phase 8: installable app and push
- PWA manifest and service worker.
- Web Push: "Brief ready" (personalised) and new developments on followed Threads, opt-in per Reader. This replaces the 3-line summary message.

## Phase 9: deploy and switch-over
- Deploy to the VPS on the **same domain as today**, under its own path (Next.js `basePath`, e.g. `/brief`) behind the existing HTTPS host, with nightly SQLite backups. The service worker and push are scoped to that path.
- Run alongside Glance for about a week, then retire `dashboard/`, the v1 `index.html` and the root `brief.json` publishing (update the README).

# Spec: Morning Brief v3, a personal swipe Brief for invited Readers

Sources: [`GLOSSARY.md`](../../GLOSSARY.md), [`SPEC-v3.md`](../SPEC-v3.md) (design decisions), [`PLAN-v3.md`](../PLAN-v3.md) (phase order), ADRs [0001](../adr/0001-replace-glance-with-nextjs-sqlite.md) and [0002](../adr/0002-one-shared-edition-ranked-per-reader.md). Look prototype: branch `prototype/brief-look`.

## Problem Statement

The Owner reads a daily news brief made by an agent and shown on a Glance dashboard. It covers nine fixed sections and looks the same to everyone. It has no idea what the Owner actually cares about and doesn't learn from what they read, skip or save. It can't be shared with family or friends, each with their own interests. Besides opening links, there is nothing to do with an Item: no asking about it, no saving it, no following a story as it develops, no searching past days. On a phone it is a long dashboard to scroll, not something quick to get through each morning. Every new interest means editing a fixed schema, and Arabic readers get English layouts.

## Solution

A private web app on the Owner's existing domain. It turns each shared Edition into a personal, swipeable Brief for every Reader. Readers sign in by Invite, follow Topics from the Catalog (or create their own), and get one Item per screen. Their top stories come first, each with a line on why it matters to them. Like, Save, Hide (with a reason) and Ask Claude are one tap away on every card. The Brief learns from Reactions, works fully in Arabic (RTL) or English, follows developing stories as Story Threads, keeps every past Edition searchable, shows Widgets for weather, prayer times, the next Liverpool match and countdowns, installs on the home screen, and sends opt-in push notifications. Gathering stays one shared run each morning and evening, so adding a Reader costs almost nothing.

## User Stories

### Signing in and onboarding
1. As the Owner, I want to invite a family member or friend by email, so that only people I choose can read my Brief.
2. As the Owner, I want to see pending and accepted Invites and revoke either, so that I control who has access.
3. As an invited person, I want to sign in with a link emailed to me, so that I never need a password.
4. As a Reader, I want my sign-in to last on my phone, so that I don't have to sign in every morning.
5. As a Reader, I want to sign out of a device, so that a shared or lost phone doesn't show my Brief.
6. As a new Reader, I want to pick Topics from the Catalog on my first visit, so that my first Brief is already relevant.
7. As a new Reader, I want to write a line about myself and get Topic suggestions from Claude, so that I find Topics I wouldn't have searched for.
8. As a new Reader, I want Sensitive Topics never to be pre-selected, so that I'm not shown graphic or adult-themed news I didn't ask for.
9. As a new Reader, I want to choose Arabic or English at the start, so that everything after that is in my language.
10. As a Reader, I want to set my city, so that weather and prayer times are local to me.

### Reading the Brief (swipe)
11. As a Reader, I want my Brief to open on a cover card with the date, the Edition (morning or evening) and my Widgets, so that I get my bearings before the stories.
12. As a Reader, I want to see one Item per screen with a full-bleed image, so that each story gets my full attention on a phone.
13. As a Reader, I want to tap the right side to go forward and the left side to go back, so that I can move through the Brief one-handed.
14. As a Reader, I want a progress bar per Topic at the top, so that I know where I am and how much is left.
15. As a Reader, I want a chip showing the current Topic and my position (e.g. "Yemen · 3/52"), so that I always know what I'm reading.
16. As a Reader, I want my top stories first with a "Top for you" badge, so that the most important news for me is never buried.
17. As a Reader, I want a short "why this matters to you" line on each top story, so that I can see why it was picked for me.
18. As a Reader, I want each card to show the title, summary, sources, and how long ago it happened, so that I can judge the story without leaving the app.
19. As a Reader, I want to open any source link, so that I can read the original reporting.
20. As a Reader, I want "new" and "updated" badges, so that in the evening Edition I can spot what changed since the morning.
21. As a Reader, I want Items I've already opened to look dimmed, so that I don't re-read them.
22. As a Reader, I want an Item that belongs to several of my Topics shown only once, under the Topic that fits best, with the others as tags, so that I never see duplicates.
23. As a Reader, I want a "You're caught up" screen at the end with the time of the next Edition, so that I know when to come back.
24. As a Reader, I want to start my Brief over from the beginning, so that I can review it again.
25. As a Reader, I want kind-specific extras on cards (AI "try it" link, game store link, price and genres, repo stars gained, Liverpool source reliability), so that each kind of Item is useful straight away.
26. As a Reader on desktop, I want the current card in the centre and a list of the rest of my Brief beside it, so that I can use the wider screen and jump around.
27. As a Reader on desktop, I want the arrow keys to move between cards, so that I can read without a mouse.

### Reacting
28. As a Reader, I want to Like an Item, so that I see more like it.
29. As a Reader, I want to Save an Item, so that I can come back to it later.
30. As a Reader, I want to Hide an Item and optionally say why (not interested, already seen, bad source), so that the Brief learns the right lesson.
31. As a Reader, I want "already seen" to hide the Item without lowering similar ones, so that a duplicate doesn't teach the Brief I dislike the subject.
32. As a Reader, I want "not interested" to lower similar Items in my future Briefs, so that the Brief gets more relevant over time.
33. As a Reader, I want "bad source" to reach the Owner, so that poor sources get fixed for everyone.
34. As a Reader, I want my Reactions to stay private, so that my interests don't affect or show up in anyone else's Brief.
35. As a Reader, I want to undo a Like, Save or Hide, so that a mis-tap doesn't stick.

### Topics and the Catalog
36. As a Reader, I want to browse the Catalog and follow or unfollow Topics, so that my Brief covers exactly what I care about.
37. As a Reader, I want to create a new Topic (e.g. "Formula 1") with a short note, so that the Brief can cover interests nobody else has.
38. As a Reader, I want my new Topic to be private until I choose to share it, so that my personal interests aren't visible to other Readers.
39. As a Reader, I want to share my Topic to the Catalog, so that others with the same interest can follow it.
40. As a Reader, I want to see when I've reached my limit of 10 created Topics, so that I understand why I can't add more.
41. As a Reader, I want a new Topic gathered from the next Edition onward, so that I don't wait for anyone to approve it.
42. As the Owner, I want Claude to draft Gathering Rules for every new Topic (outlets, what counts, exclusions) using the house source rules, so that new Topics are gathered well from day one.
43. As the Owner, I want to see and edit any Topic's Gathering Rules, including private ones, so that I can fix quality and control cost.
44. As the Owner, I want Topics that nobody follows dropped from gathering, so that the shared run doesn't waste effort.
45. As the Owner, I want the Catalog to start with the 14 agreed Topics, so that the new Brief covers at least what the old one did.

### Sensitive Topics
46. As a Reader, I want Graphic and Adult Trending off until I opt in from my profile, so that I'm never shown them by surprise.
47. As a Reader, I want opting into Adult Trending to require confirming I'm 18 or over, so that the Topic stays adults-only.
48. As a Reader who opted in, I want sensitive Items blurred with a short warning until I tap, so that I decide each time whether to look.
49. ~~As the Owner, I want Adult Trending to stay limited to mainstream-outlet news with no explicit images or adult-site links, so that the site stays safe to share with family.~~ **Superseded** by [spec #6](https://github.com/Montasaa/morning-brief/issues/6) (rework ticket 10, issue #10); see "Adult Trending (rework)" below.

#### Adult Trending (rework, spec #6)
- **Owner only.** Adult Trending is visible to the Owner alone: it is not in any other Reader's Catalog, they get `404` on follow and share, it is stripped from Items' `topics` for them, and it is never counted for them in the gathering list's followers. The Owner still opts in with the 18+ confirmation.
- **Reddit only.** It is gathered only from the public subreddit RSS feeds listed in its Gathering Rules (the Owner edits that list). It takes every new post from those feeds, NSFW included, and marks explicit media `nsfw_media: true`.
- **Fixed limits, not settings:** never anything involving minors, nothing non-consensual and nothing leaked, in this or any Topic. The gathering agent drops such posts; the procedure and the house rules say so.
- **Claims about real people.** A post making a claim about a named person carries `claim_subject` and needs a non-Reddit outlet report as its second source; the gathering tool drops it otherwise (in any Topic). The tool also drops an Adult Trending Item whose sources are not Reddit, apart from that one outlet.
- **In the app:** NSFW media stays blurred until tapped even when the Reader turned the blur off for the Topic (Display `unblurred`), and like every Sensitive Item it is never a top story, never the first Item after the Cover and never in a push.

### Story Threads
50. As a Reader, I want a card that belongs to a Story Thread to show a chip like "Iran war & Hormuz · 6", so that I know it's part of a bigger story.
51. As a Reader, I want to tap the Thread chip and see a dated timeline of its developments, so that I can catch up on the whole story.
52. As a Reader, I want to follow a Story Thread, so that new developments stand out and can notify me.
53. As a Reader, I want a Threads tab listing the Threads I follow and the active ones, so that I can track ongoing stories in one place.
54. As a Reader, I want each new development to appear as its own Item on the Thread with its own sources, so that earlier facts are never overwritten.

### Saved and Search
55. As a Reader, I want a Saved list, so that I can read saved Items later.
56. As a Reader, I want to search every past Edition in Arabic or English, so that I can find a story I half-remember.
57. As a Reader, I want search results to show the Item's date, Topic and Thread, so that I can tell matches apart.
58. As a Reader, I want Editions kept forever, so that search and Threads never lose history.

### Ask Claude
59. As a Reader, I want to ask Claude a question about the Item I'm reading, so that I can get background or another angle without leaving the app.
60. As a Reader, I want answers grounded in the Item's sources plus a web search, with cited links, so that I can check what Claude says.
61. As a Reader, I want my questions and answers private to me, so that I can ask anything.
62. As a Reader, I want to see how many questions I have left today, so that I'm not surprised by the limit.
63. As the Owner, I want no Ask limit myself and a default of 20 a day for others that I can change per Reader, so that costs stay predictable.
64. As a Reader, I want to come back to my earlier questions about an Item, so that I don't ask twice.

### Widgets
65. As a Reader, I want today's weather for my city on the cover card, so that I can plan my day.
66. As a Reader, I want today's prayer times for my city (Umm al-Qura method), so that the Brief fits my day.
67. As a Reader who follows Liverpool, I want the next match (opponent, competition, kickoff in my local time, countdown) on the cover card, so that I never miss a game.
68. As a Reader, I want countdowns for fixtures, game releases and earnings dates in my Topics, so that I can see what's coming.
69. As a Reader, I want Widgets tied to Topics I don't follow hidden, so that my cover card stays relevant.

### Language
70. As an Arabic-speaking Reader, I want the whole app in Arabic with a right-to-left layout, Arabic titles and summaries, and the swipe direction mirrored, so that it feels native.
71. As a Reader, I want to switch language at any time from the Me tab, so that I can read in whichever language suits the moment.

### Installable app and notifications
72. As a Reader, I want to add the Brief to my home screen, so that it opens like an app.
73. As a Reader, I want an optional "Your Brief is ready" push for each Edition, mentioning my top story, so that I know when to read.
74. As a Reader, I want an optional push when a Story Thread I follow has a new development, so that I hear about it without checking.
75. As a Reader, I want to turn each kind of notification on or off, so that I only get what I want.

### Navigation and profile
76. As a Reader, I want bottom tabs for Brief, Threads, Saved & Search and Me, so that every part of the app is one tap away.
77. As a Reader, I want the Me tab to hold my Topics, opt-ins, language, city and notification settings, so that my Interest Profile is all in one place.

### The Owner's operations
78. As the Owner, I want a report list of "bad source" hides, with the Item and Topic, so that I can fix Gathering Rules.
79. As the Owner, I want to see each Reader's Ask usage and change their limit, so that I can manage cost.
80. As the Owner, I want each Edition ingested safely (validated, idempotent, all-or-nothing), so that a broken gathering run never corrupts the Briefs.
81. As the Owner, I want to see the latest Edition's time and Item count, and any ingest that was rejected, so that I know the pipeline is healthy.
82. As the Owner, I want today's and past brief.json files imported as Editions, so that the new app starts with real history.
83. As the Owner, I want the new app to run alongside the Glance site for about a week before Glance is retired, so that I have a fallback while it settles in.
84. As the Owner, I want nightly database backups, so that Readers, Reactions and history survive a VPS failure.

## Implementation Decisions

**Platform** ([ADR 0001](../adr/0001-replace-glance-with-nextjs-sqlite.md))
- One Next.js app (App Router, TypeScript) with a SQLite database on the existing VPS. It is served from the **same domain as today** under its own base path (e.g. `/brief`), behind the existing HTTPS host. The service worker and push are scoped to that path.
- Gathering stays outside the app (agent + Python scripts). Its only contact with the app is the ingest endpoint and the gathering-list endpoint.

**Modules** (deep modules with small interfaces; names are conceptual)
- **Edition ingest**: accepts one Edition v3 document. It validates it against the v3 JSON Schema, then upserts Items by stable id, links Items to Topics and Story Threads, records the Edition, and triggers per-Reader top picking and push. The whole thing runs in one transaction and is idempotent for a repeated Edition id. It returns accepted/rejected with counts and reasons.
- **Legacy importer**: converts a v2 / rev 2.3 `brief.json` into an Edition v3 document and feeds it through Edition ingest (never writing to the database directly). Mapping: `middle_east` goes to Saudi / Yemen / Iran / Wider Middle East by keyword, with several tags allowed; `games` goes to Strategy Games / Turn-based RPG & Tactics / Trending Games by `genres`; every other section maps one-to-one; `graphic` goes to Graphic. Edition-level `top_stories` is kept as the fallback for tops.
- **Catalog & Topics**: create (cap 10 per creator, private by default), share to the Catalog, follow/unfollow, opt into Sensitive Topics (Adult Trending needs an 18+ confirmation), Owner edits to Gathering Rules. Claude drafts the Gathering Rules when a Topic is created. It also exposes the **gathering list**: every Topic with at least one follower, with its rules.
- **Readers & access**: Invites, magic-link sign-in through Resend, long-lived sessions per device, sign-out, Owner role, onboarding (Topic picks plus Claude-suggested Topics from the Reader's note), and the Interest Profile (Topics, opt-ins, language, city, notification preferences).
- **Brief composer**: given a Reader and the latest Edition, returns the ordered Brief: the cover card (Widgets), then the Reader's top stories, then the rest grouped by best-matching followed Topic and ordered by score. Each Item appears once. Hidden Items are excluded. Sensitive Items appear only if the Reader opted in, and are marked blurred. Opened Items are marked dimmed. It also returns the Topic groups the progress bars need.
- **Scorer**: a pure function of followed Topics, the Reader's Reaction history (likes and saves raise similar Items, "not interested" lowers them, "already seen" and "bad source" have no effect on similarity), recency and status. It is deterministic so it can be tested.
- **Top picker**: after ingest, asks Claude to choose 1–3 top stories per Reader from their composed Brief and write a "why this matters to you" line (EN + AR) for each. If Claude fails, it falls back to the highest-scored Items without why-lines.
- **Reactions**: like, save, open, hide with reason (`not_interested`, `already_seen`, `bad_source`, or none), all undoable. A `bad_source` hide also creates an Owner report. Reactions are never read when building another Reader's Brief.
- **Story Threads**: thread identity comes from the Edition. Readers can follow a Thread, which has a timeline (Items ordered by time). A new development is always a new Item. "Updated" status is only for the same event changing between Editions.
- **Saved & Search**: the saved list, and full-text search (SQLite FTS5) over Item titles and summaries in both languages across all Editions. Nothing is ever pruned.
- **Ask**: a question about one Item. Claude gets the Item, its sources and a web-search tool, and must cite links. Questions and answers are stored per Reader and are private. The daily limit is per Reader (Owner unlimited, default 20, Owner-editable) and resets at 00:00 Asia/Riyadh.
- **Widgets**: weather from Open-Meteo and prayer times from Aladhan (Umm al-Qura method), both live, by the Reader's city, and cached briefly. The next match and countdowns come from the Edition's widget data. A Widget is shown only if the Reader follows its Topic (weather and prayer times are always shown).
- **Push**: Web Push (VAPID) subscriptions per device. "Brief ready" goes out after top picking finishes for an Edition. Thread updates go out when ingest adds an Item to a followed Thread. Each kind is opt-in per Reader.
- **Outside services boundary**: one adapter interface wraps Claude, Resend, Open-Meteo, Aladhan and Web Push. Every module reaches the outside world only through it, so tests can swap in fakes.

**Edition v3 document** (new JSON Schema, draft 2020-12, versioned next to the v2 schema)
- Top level: `edition_id`, `kind` (`morning` | `evening`), `generated_at` (RFC 3339, +03:00), `items[]`, `threads[]`, `widgets`, optional fallback `top_stories[]`.
- **Each Edition is complete**: the evening Edition already includes the morning's Items that are carried over, plus new and updated ones. The app always builds Briefs from the latest Edition alone.
- Item: stable `id`; `topics[]` (at least one Topic id); optional `thread_id`; `status` (`new` | `updated` | empty); `time`; `title`/`summary` with `_ar` pairs; `sources[]` (title, url, type); `image`; `warning`/`warning_ar` for sensitive Items; and kind-specific extras carried over from v2 (AI `kind`/`try_url`/`pricing`, games `genres`/`store_url`/`price`/`platforms`/`release_date`, trending `rank`/`period`/`stars_gained`/`language`/`why_it_matters`, Liverpool `reliability`, markets `tag`, social `platform`/`creator`/`metric`).
- Thread: `id`, `title`, `title_ar`.
- Widgets: `next_match` (team, opponent, competition, kickoff RFC 3339, venue) and `countdowns[]` (label, label_ar, at, topic id).

**API contract** (all under the app's base path; Reader routes need a session, pipeline routes need the bearer token from env)
- Pipeline: `GET /api/gathering-list` → Topics with rules. `POST /api/editions` → ingest result.
- Reader: `GET /api/brief`; `POST /api/items/{id}/reactions`; `DELETE /api/items/{id}/reactions/{kind}`; `GET/POST /api/topics`; `POST /api/topics/{id}/follow|unfollow|share`; `GET /api/threads`, `GET /api/threads/{id}`, `POST /api/threads/{id}/follow`; `GET /api/saved`; `GET /api/search?q=`; `GET/POST /api/items/{id}/ask`; `GET/PATCH /api/me`; `POST /api/push/subscriptions`; `GET /api/widgets`.
- Access: `POST /api/invites` (Owner), `POST /api/auth/magic-link`, `GET /api/auth/callback`, `POST /api/auth/sign-out`.
- Owner: `GET /api/owner/reports`, `PATCH /api/topics/{id}/rules`, `PATCH /api/readers/{id}/ask-limit`, `GET /api/owner/health`.

**UI** (from the prototype verdict: variant B, Swipe)

> **Superseded.** The UI decisions below are replaced by [spec #6, the Morning Brief v3 rework](https://github.com/Montasaa/morning-brief/issues/6): the Reels look, three Layouts (Swipe, Front Page, List) and each Reader's Display. They are kept for history; where they disagree, spec #6 wins. The developer guide (`web/DEVELOPING.md`: "Display and the Reels look", "The Swipe Brief") describes what is built so far.

- Tabs: Brief · Threads · Saved & Search · Me. The Brief opens on a cover card, then one Item per screen with a full-bleed image, per-Topic progress bars, a Topic/position chip, tap zones on each side, and a bottom dock (Hide → reason sheet, Save, Like, Ask).
- RTL mirrors the layout and the tap direction. Sensitive cards blur until tapped. Desktop shows the centred card plus a side list, with arrow-key navigation.
- Hide reasons, encoded in the prototype as: `not interested` · `already seen` · `bad source` · *just hide* (no reason).

**Pipeline v3**: a new procedure that replaces `pipeline/PIPELINE.md` for v3. It reads the gathering list, gathers each Topic under its Gathering Rules (house source rules always apply), assigns Items to Topics and Threads, checks every link and image, validates against the v3 schema, and posts the Edition. It runs at 06:00 and 19:15 Asia/Riyadh. The Saudi TikTok scripts feed the Social Trends Topic. The old 3-line summary message is retired in favour of push.

**Switch-over**: the current Glance pipeline and the root `brief.json` publishing run unchanged in parallel for about a week. After that, Glance, the dashboard config, the v1 `index.html` and root `brief.json` publishing are retired, and the README is updated.

## Testing Decisions

- **Good tests check behaviour you can see from outside, not implementation.** Tests don't assert on tables, internal functions or the scorer's weights. They assert on what a Reader would get back: the order and contents of the Brief, what search returns, whether Ask is refused at the limit.
- **Primary seam: the app's web API, in process.** Each test starts the app against a fresh scratch SQLite database with the outside-services boundary replaced by fakes (a canned Claude, a Resend outbox, fixed weather and prayer times, a push recorder). Tests set up state only through the public endpoints: they post Editions to the ingest endpoint and act as Readers via signed-in sessions. That covers ingest and validation, idempotency, the legacy importer, the Brief (top stories, de-duplication, hidden and sensitive Items, dimming), how Reactions change ranking, Reaction privacy between Readers, Topic caps and privacy, Gathering Rules drafting, Threads, Search in both languages, Ask grounding/privacy/limits/reset, Widgets visibility, push triggers and Invite/sign-in flows.
- **Second, thin seam: browser tests at phone size** (Playwright) against the same app with fakes. They cover a handful of smoke flows: swiping through a Brief, the hide-reason sheet, sensitive blur and reveal, Arabic RTL layout with mirrored taps, and the desktop card-plus-side-list. Nothing ranking-related is tested here.
- **Edition v3 schema tests** reuse the repo's existing approach: Draft 2020-12 validation with format checks, as the README does today for `samples/brief.sample.json`. The v2 sample and today's rev 2.3 `brief.json` are fixtures for the legacy importer, which must produce Editions that pass v3 validation.
- **Prior art:** there is no test suite in the repo yet. The only prior art is the JSON Schema validation snippet and the sample Edition. Tests are written first (red-green) where practical.

## Out of Scope

- Life-dashboard features: calendar, email, portfolio or brokerage data, tasks, habits.
- A market quotes widget (dropped on purpose; US Markets is news only), and live match scores (only the next-match card).
- A separate gathering run per Reader, or personal extras gathered for one Reader ([ADR 0002](../adr/0002-one-shared-edition-ranked-per-reader.md)).
- Public or anonymous access. Readers join only by Invite.
- ~~Any explicit or pornographic content, links to adult sites, or gathering from adult sites for Adult Trending. It stays mainstream-outlet news only.~~ Superseded by spec #6 (rework ticket 10): Adult Trending is the Owner's alone and gathered from Reddit RSS feeds, NSFW included, under the fixed limits in "Adult Trending (rework)". Anything involving minors, non-consensual or leaked material stays out of scope in every Topic, ever.
- Reactions that affect other Readers (except "bad source" reports to the Owner), and shared or public Ask answers.
- Native iOS/Android apps (installable web app only).
- Hand-editing Items in the app. Items come only from Editions.
- Changing or moving the root `brief.json`, `brief.schema.json` or `index.html` before the switch-over ends.

## Further Notes

- **Defaults chosen during synthesis, not yet confirmed:** Ask limits reset at 00:00 Asia/Riyadh; 1–3 top stories per Reader; weather and prayer data cached for about 30 minutes; the Owner is the first Reader, created at setup and not through an Invite.
- **Open question:** today each section carries 2–3 `watch` videos. The swipe design has no place for them yet. Options are video Items in the stack or a "Watch" row on the cover card. Decide before Pipeline v3.
- The build order is [`PLAN-v3.md`](../PLAN-v3.md) (phases 0–9). Phase 0 (foundations + legacy importer) and Phase 1 (Swipe Brief for the Owner only) give a readable app on real data before sign-in exists.
- Secrets (Resend key, Claude key, VAPID keys, ingest token) come from environment variables only and are never committed or logged, as with the current publish token.

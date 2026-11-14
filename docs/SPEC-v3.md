# Morning Brief v3: spec

Status: agreed design, 2026-11-14 (grilling session). Vocabulary is in [`GLOSSARY.md`](../GLOSSARY.md). Decisions that are hard to reverse are in [`docs/adr/`](adr/).

## What it is

A smarter daily news brief, rebuilt from scratch as a private web app for the Owner plus invited family and friends. Each Reader follows Topics, reacts to Items, and gets their own ranked Brief out of one shared Edition. It is still a reading product: no calendar, portfolio, tasks or email.

## Readers and access

- **Owner** (Abdulrahman) plus Readers he invites. No public access.
- Sign-in: Owner sends an Invite, and the Reader signs in with an **email magic link**. No passwords. This needs an email sender.
- **Phone first**, with a full desktop layout too. Installable to the home screen (PWA).
- Language **per Reader: Arabic (full RTL) or English**. Every Item carries both (the pipeline already writes `*_ar` fields).

## Topics

- Readers follow **Topics**, not fixed sections. One Item can carry **several Topics**. It is shown once, under its best-matching followed Topic, with the others as tags.
- Starting Catalog (today's nine sections, split up):
  Saudi · Yemen · Iran · Wider Middle East · US Markets · AI · GitHub Trending · Liverpool · Strategy Games · Turn-based RPG & Tactics · Trending Games · Social Trends (incl. Saudi TikTok) · Graphic *(sensitive)* · Adult Trending *(sensitive)*.
- **Any Reader can create a Topic**, up to **10 each**. A new Topic is **private to its creator** until they share it to the Catalog. The Owner can see every Topic's Gathering Rules, because each Topic costs gathering.
- **Gathering Rules**: Claude drafts them from the Topic name and the Reader's note, using the house source rules (independent outlets first, state media only as a second source, no invented facts, every link checked). They go live straight away, and the Owner can edit them.
- Topics nobody follows are dropped from gathering.

### Sensitive Topics

- Graphic and Adult Trending are **off by default for every Reader**. Each Reader opts in from their own profile, and Adult Trending also needs an 18+ confirmation. Items stay blurred until tapped, even after opting in.
- **Adult Trending stays as it is today**: adult-world stories (scandals, platform-policy fights, creator and industry news) from mainstream outlets only. No explicit images, no links to porn or adult-content sites, no creator pages, nothing involving minors, non-consensual or leaked. The pipeline does not gather from porn sites. That is a fixed limit, not a setting.

## Gathering: Editions

- **One shared Edition per run**, covering every followed Topic ([ADR 0002](adr/0002-one-shared-edition-ranked-per-reader.md)). There is no gathering run per Reader.
- Cadence: **06:00 full run + 19:15 refresh** (Asia/Riyadh), as today. The evening Edition carries over the morning's Items plus new and updated ones.
- A new development in an ongoing story becomes a **new Item linked to a Story Thread**. "Updated" means the *same* event changed between Editions.
- Every Item: stable id, real image, checked sources, EN + AR text. Existing per-kind extras (AI `try_url`, games `store_url`, trending `stars_gained` and so on) carry over.
- **History is kept forever** (Editions, Items, Story Threads). Saved Items are never pruned.

## Each Reader's Brief

- Built from the latest Edition, filtered to the Topics the Reader follows.
- Ranking: **scoring** from the Interest Profile and Reactions orders the Items. **Claude picks each Reader's top stories** and writes a short "why this matters to you" for each.
- Opened Items are dimmed.

## Reactions

- Like, save, open, and **hide with an optional reason**: *not interested*, *already seen*, *bad source*. Only *not interested* lowers similar Items.
- Reactions are **private to that Reader**. Exception: *bad source* also sends the Owner a report so the Topic's Gathering Rules can be fixed.

## Interactive features

- **Ask Claude about an Item**: answers draw on the Item's checked sources plus a live web search, cite their links, and are **visible only to the Reader who asked**. Unlimited for the Owner, **20 a day** by default for other Readers (the Owner can change this per Reader).
- **Saved list + search** across all past Editions.
- **Story Threads**: a dated timeline page. Readers can follow a Thread.
- **Widgets** (each shown only to Readers following the related Topic, or set per Reader):
  - Weather & prayer times for the Reader's city
  - Next Liverpool match: opponent, competition, kickoff in the Reader's local time, countdown
  - Countdowns: fixtures, game releases, earnings dates for followed Topics
  - *No market quotes widget* (dropped on purpose).

## Onboarding

On a new Reader's first visit: tap Topics from the Catalog, optionally write a line about themselves, and Claude suggests more Topics to follow. Sensitive Topics are never pre-selected.

## Notifications

- Opt-in push for each Reader: **"Brief ready"** (personalised) and **new developments on Story Threads they follow**.
- Push **replaces** the pipeline's old 3-line summary message.

## Platform

- **Next.js + SQLite** on the existing VPS ([ADR 0001](adr/0001-replace-glance-with-nextjs-sqlite.md)). Gathering stays a separate step (agent + Python scripts) that writes Editions into the app.
- The app now holds state, so the VPS needs database backups.

## Switch-over

Run the current Glance site and its `brief.json` pipeline alongside the new app until the new app has run cleanly for about **a week**. Then retire Glance, `dashboard/`, and the v1 `index.html` + root `brief.json` publishing.

## Look and feel

Decided 2026-11-14 from the throwaway prototype (branch `prototype/brief-look`, file `prototype/look/index.html`, variants A Paper / B Swipe / C Radar): **B, Swipe**. The Brief is one Item per screen, with a full-bleed image and a progress bar per Topic at the top. Tap right or left to move between Items. A bottom dock holds Hide (which asks why), Save, Like and Ask. Each Reader's top stories come first, with a "Top for you" badge and the "why this matters to you" line.

- **Cover card first:** each Brief opens on a greeting card with the date, Edition, weather and prayer times, the next Liverpool match and countdowns. The Widgets live here.
- **Bottom tabs:** Brief (the swipe stack) · Threads · Saved & Search · Me (Interest Profile, Topics, opt-ins, language, notifications). Everything except Brief is an ordinary scrolling list.
- **Story Thread on a card:** a chip such as "Iran war & Hormuz · 6" with a Follow button. Tapping the chip opens the Thread's dated timeline.
- **Desktop:** the current card in the centre, with a list of the rest of the Brief beside it. Arrow keys move, and clicking a row in the list jumps to it.

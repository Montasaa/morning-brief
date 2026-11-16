# Pipeline v3: gathering Editions for the app

The procedure the Morning Brief agent runs to gather one **Edition** and post it to the v3 app. Vocabulary is in [`GLOSSARY.md`](../GLOSSARY.md); the design is [`docs/specs/morning-brief-v3.md`](../docs/specs/morning-brief-v3.md) and [ADR 0002](../docs/adr/0002-one-shared-edition-ranked-per-reader.md) (one shared Edition per run, ranked per Reader in the app).

It runs **alongside** the v2 procedure in [`PIPELINE.md`](PIPELINE.md), which keeps publishing `brief.json` for the Glance site, unchanged, until the switch-over (about a week). Do both runs; neither reads or writes the other's output.

## When

Twice a day, Asia/Riyadh (UTC+3, no daylight saving):

| Run | Time | Edition |
| --- | --- | --- |
| Morning, full run | 06:00 | `<date>-morning` |
| Evening refresh | 19:15 | `<date>-evening` |

Each Edition is **complete**: the app builds every Brief from the latest Edition alone. The evening Edition therefore carries over the morning's Items that are still current, plus new and updated ones. The tool does the carrying over; you only say what to drop.

## What you need

- `python3` (3.10 or newer) with `jsonschema` 4.x (`pip install jsonschema`), the same one the README uses for the v2 schema.
- These environment variables. Secrets come **only** from the environment:
  - `INGEST_TOKEN` (secret): the app's pipeline token. Never pass it as a flag, never `echo` it, never run with `set -x`, never write it to a file in the repository. The tool reads it from the environment and never prints it (errors show `[INGEST_TOKEN]` instead).
  - `BRIEF_APP_URL`: the app's URL with its base path, e.g. `https://<domain>/brief`.
  - `BRIEF_V3_STATE`: a folder outside the repository where the tool keeps every accepted Edition (for example `/home/box/services/morning-brief/pipeline-v3`). Carry-over, the new/updated status and stable Story Thread ids all come from it, so keep it between runs.
- A working folder for this run, e.g. `RUN=$BRIEF_V3_STATE/runs/$(date +%F-%H%M)`.

The tool is `pipeline/v3/edition_v3.py` (`--help` on any command). Every command exits non-zero and posts nothing when something is wrong, with the reason on stderr.

## Steps

1. **Read the gathering list.** It is every Topic at least one Reader follows, with its Gathering Rules, plus the house rules:

   ```sh
   python3 pipeline/v3/edition_v3.py gathering-list --app-url "$BRIEF_APP_URL" --out "$RUN/gathering-list.json"
   ```

   Gather **only** these Topics. A Topic nobody follows is not on the list and is not gathered, and the tool strips any Topic not on the list from the Items (and leaves out an Item left with none). New Reader-created Topics appear here from the next run on; gather them like any other.

2. **Look at what earlier runs published**, so you reuse ids:

   ```sh
   python3 pipeline/v3/edition_v3.py context --state-dir "$BRIEF_V3_STATE"
   ```

   It lists the previous Edition's Items (id, Topics, Story Thread, title) and every Story Thread id in use.

3. **Gather each Topic under its Gathering Rules.** The `house_rules` in the gathering list always apply on top of a Topic's own rules, whatever those say:
   - Independent outlets first. Government or state media is only ever a second source, typed `official`. (The tool also moves independent and wire sources ahead of official ones, because the first source is the card link.)
   - Never invent facts, quotes, links or numbers.
   - **Fixed limit, in every Topic, never a setting:** nothing involving minors, nothing non-consensual, nothing leaked. Drop any such post or story, whatever a Topic's rules say, and never gather from sources that carry them.
   - Every Item has checked sources (1 to 3) and English **and** Arabic text (`title`/`title_ar`, `summary`/`summary_ar`). The tool refuses an Item without them.
   - **Headlines in sentence case:** capitalise the first word and proper nouns only ("Liverpool sign a new midfielder", not "liverpool sign a new midfielder" or "Liverpool Sign A New Midfielder"). The tool prints a `warning:` line for an all-lowercase title (a repository name such as `example/terminal-agent` may warn; that is fine).
   - **Grade every picture** with `image_kind`; the tool refuses a draft without it:
     - `photo`: a real photo or video thumbnail. It fills the card.
     - `card`: a logo, an Open Graph card (GitHub, Hugging Face, a model card) or a screenshot of text. It is shown as a small badge on a white plate, never stretched.
     - `none`: no usable picture. The card is a plain gradient with the headline. Only then may `image` be left out; otherwise every Item has a real `image`.
   - **Claims about a named person:** an Item whose story is a claim about a named person carries `claim_subject` (the person's name) and needs a non-Reddit outlet report (an `independent` or `wire` source) among its sources. The tool leaves the Item out otherwise, in any Topic.
   - No cap on good Items. Give each the per-kind extras the card shows: AI `kind`, `try_url`, `pricing`; games `kind`, `genres`, `store_url`, `price`, `platforms`, `release_date`; GitHub Trending `rank`, `period`, `stars_gained`, `language`, `why_it_matters` (+ `_ar`), only repos on GitHub Trending; Liverpool `reliability` (`Official` is club or league only); US Markets `tag`; social `platform`, `creator`, `metric`; up to three real `voices`.
   - **Graphic**: war, crime and graphic news from established outlets. Each Item has `warning` and `warning_ar`; the image is an outlet logo or a neutral picture, never gore.
   - **Adult Trending** is visible to the Owner only, and is gathered from **Reddit only**:
     - Read the public subreddit **RSS** feeds listed in its Gathering Rules (for example `https://www.reddit.com/r/<subreddit>/new/.rss`); the Owner edits that list. Do not gather it from any other site, and do not add subreddits yourself.
     - Take every new post since the last run, NSFW included. Each Item's first source is the Reddit post (type `social`), with `warning` and `warning_ar`. Mark a post whose picture or video is explicit `nsfw_media: true`: the app keeps that media blurred until tapped, whatever the Reader's blur switch says.
     - At most one other source: a news outlet's report as the second source (required when the post makes a claim about a named person, with `claim_subject`). The tool leaves out an Adult Trending Item whose sources are not Reddit apart from that one outlet, and puts the Reddit post first.
     - The fixed limit above applies with no exception: drop anything involving minors, anything non-consensual and anything leaked.
     - When the feed list is empty or nothing is new, say so (step 5).
   - Watch videos (the v2 `watch` lists) have no place in the v3 Edition yet; that is an open decision in the spec. A video that is itself the story can be an Item.

4. **Assign Items to Topics and Story Threads.**
   - `topics`: every Topic on the gathering list the Item belongs to, best fit first. The app shows it once per Reader, under their best-matching followed Topic.
   - **Ids are stable.** The same event in a later run keeps its id; the tool marks it `updated` if its facts changed (title, summary, sources, image, time, warning) and leaves the status empty if not. Do not set `status` yourself.
   - **A new development is a new Item** with a new id, linked to its Story Thread with `thread_id`. Never reuse an earlier Item's id for a new development, so earlier facts are never overwritten. The tool refuses an Item id that moves to another Story Thread.
   - **Story Thread ids stay stable.** Reuse the id from `context`. Describe a new Thread in the drafts' `threads` (`id`, `title`, `title_ar`). If you name a known Thread with a new id but its title, the tool keeps the known id. An Item that keeps its earlier Thread can leave `thread_id` out.

5. **Write the drafts file(s)**, e.g. `$RUN/drafts.json` (several files are fine, one per Topic group; pass each with `--drafts`):

   ```json
   {
     "items": [ /* Edition v3 Items with image_kind, without status */ ],
     "threads": [ { "id": "iran-hormuz", "title": "Iran war & Hormuz", "title_ar": "..." } ],
     "widgets": {
       "next_match": { "team": "Liverpool", "opponent": "...", "competition": "...", "kickoff": "2026-11-15T18:00:00+03:00", "venue": "..." },
       "countdowns": [ { "label": "...", "label_ar": "...", "at": "2026-11-19T23:00:00+03:00", "topic": "us-markets" } ]
     },
     "top_stories": [ "lead-item-id" ],
     "nothing_found": { "adult-trending": "No new posts in the listed subreddit feeds." },
     "drop": [ "an-earlier-item-that-is-no-longer-current" ],
     "carry_over": [ "an-earlier-item-still-current" ]
   }
   ```

   - **Coverage:** every Topic on the gathering list needs at least one Item, or an entry in `nothing_found` saying why nothing qualified. Otherwise the run stops and names the Topics.
   - **Widgets:** the next Liverpool match (only kept while someone follows Liverpool) and countdowns to fixtures, game releases and earnings dates, each with the Topic it belongs to (kept only while that Topic is on the gathering list). Weather and prayer times are live in the app, not gathered.
   - `top_stories` (optional, 1 to 3): the fallback lead stories when the app's per-Reader top picking fails.
   - **Evening:** every Item of the previous Edition is carried over unless it is in `drop` or you gathered it again. **Morning (full run):** only Items named in `carry_over` are brought forward.

6. **Saudi TikTok trends** for Social Trends: run the scrape (the v2 pipeline runs the same script; running it once for both is fine):

   ```sh
   python3 scripts/tiktok_trends.py
   ```

   and pass its output with `--tiktok scripts/tiktok_trends.json` in step 7. The tool turns the top 10 into Social Trends Items (`tt-<kind>-<slug>`, the same ids as v2) with Arabic text, and leaves them out if the scrape did not switch to Saudi Arabia. Do not run `scripts/merge_tiktok.py` for v3: it belongs to the v2 `brief.json`.

7. **Assemble, check, validate and post** in one command:

   ```sh
   python3 pipeline/v3/edition_v3.py run --app-url "$BRIEF_APP_URL" \
     --gathering-list "$RUN/gathering-list.json" --drafts "$RUN/drafts.json" \
     --tiktok scripts/tiktok_trends.json --state-dir "$BRIEF_V3_STATE" --out "$RUN/edition.json"
   ```

   It sets `edition_id`, `kind` (before noon is morning) and `generated_at` (now, `+03:00`); carries over Items; sets every status; keeps Story Thread ids; strips Topics nobody follows; leaves out Adult Trending Items not from Reddit and claims about a named person with no outlet report (`left out ...` notes); checks coverage; **checks that every source, image, `try_url`, `store_url` and voice link loads**, removing broken sources and leaving out Items whose image or every source fails; validates against `schema/edition.v3.schema.json` (the same checks ingest runs) and the house rules; posts to `POST /api/editions`; and, once the app accepts it, keeps the Edition in `$BRIEF_V3_STATE`.

   Read the `note:` and `warning:` lines (a `warning:` names an all-lowercase headline: fix it in the drafts and run again). A link reported as **unverified** (the site refuses scripts with 401, 403 or 429) stays in: open it yourself and, if it does not load, drop the source and run again. Fix anything the run refused and run it again; re-posting the same Edition is idempotent.

8. **Check the result.** The run ends with `accepted: <edition_id> (N Items, ...)`. Ingest is all-or-nothing, so a refused Edition changes nothing in the app. If the post failed after a valid assemble, post the written file again with `python3 pipeline/v3/edition_v3.py post "$RUN/edition.json" --app-url "$BRIEF_APP_URL" --state-dir "$BRIEF_V3_STATE"`.

9. **No summary message.** The v2 pipeline's 3-line summary is not sent for v3. Readers get the app's opt-in "Brief ready" push instead, which the app sends after ingest.

## Local dry run (staging)

Use this to check the whole path without gathering anything. It posts a sample morning and evening Edition (`pipeline/v3/samples/`, example.com links, not real reporting) to a **staging or local app, never the live one**, with its own scratch state.

1. Start a local app as staging (see `web/DEVELOPING.md`): from `web/`, `INGEST_TOKEN=dev OWNER_EMAIL=you@example.com OUTSIDE_SERVICES=fake FAKE_OUTBOX_FILE=data/outbox.jsonl npm run dev`.
2. Sign in at http://localhost:3000/brief as the Owner (the link is in `web/data/outbox.jsonl`) and finish onboarding, so Topics have a follower and the gathering list is not empty.
3. Run:

   ```sh
   INGEST_TOKEN=dev python3 pipeline/v3/edition_v3.py dry-run --app-url http://localhost:3000/brief
   ```

   It fetches the staging gathering list, assembles today's morning Edition from the samples, posts it, then assembles and posts the evening one (one Item updated, one new development on the sample Story Thread, one new Item, one dropped, the rest carried over). Both must end in `accepted:`. Topics on the list the samples do not cover (ones a Reader created) are covered as "dry run: no sample Items". Link checks are skipped for the placeholders. The Editions are written to a new temporary folder (`--out-dir` to choose one).
4. Open the Brief and the Threads tab to see them.

`web/test/pipeline/pipeline-v3.test.ts` runs the same dry run, and every rule above, against the in-process app on each `npm test`.

## Scheduling

The agent is started at 06:00 and 19:15 Asia/Riyadh, for example with cron on the VPS:

```cron
CRON_TZ=Asia/Riyadh
0 6 * * *   <start the Morning Brief agent with the v2 and v3 procedures>
15 19 * * * <start the Morning Brief agent with the v2 and v3 procedures>
```

with `INGEST_TOKEN`, `BRIEF_APP_URL` and `BRIEF_V3_STATE` in the agent's environment (not in the crontab line, not in the repository).

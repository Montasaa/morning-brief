# Morning Brief

Abdulrahman's daily news brief: nine sections of checked reporting, rendered by a [Glance](https://github.com/glanceapp/glance) dashboard.

The dashboard reads one JSON document. It never writes that file. A daily pass (today an agent following `pipeline/PIPELINE.md`, not a single build script) gathers the items, checks every link, and publishes the document.

## Sections

Page order:

1. **`middle_east`** — Saudi Arabia, Yemen, Iran, and the regional stories that move them. Lead with reputable independent outlets (BBC, The Guardian, Middle East Eye, Al Jazeera, plus Reuters or AP when a wire is the right cite). A government or state outlet is only a second source, with `type: official`. Put the day's delta in `what_changed`. Use `voices` for real posts from people on the ground.
2. **`us_markets`** — movers, earnings, and macro. Optional `tag`: `EARNINGS`, `MACRO`, `FED`, `MOVERS`, `DEALS`, `HOUSING`, `GLOBAL`. Quotes and 21-day charts for S&P 500 futures, Nasdaq futures, the S&P 500, Nasdaq, VIX, and WTI come from Glance's markets widget, not from this JSON.
3. **`ai`** — models, tools, apps, and papers worth trying. Every item has `kind` (`MODEL`, `TOOL`, `APP`, `PAPER`), a `try_url`, and an image.
4. **`trending`** — repositories that are on GitHub Trending today or this week. Famous repos that are not on that list stay off. Every item has `rank`, `period` (`today` or `week`), `stars_gained` for that period, `language`, `why_it_matters`, and a GitHub Open Graph image.
5. **`liverpool`** — results, fixtures, injuries, lineups, and transfer talk. Every item has `reliability`: `Official` (club or league), `Tier 1` (BBC, Guardian, The Athletic), `Tier 2`, `Tier 3`, or `Rumour`.
6. **`games`** — strategy, turn-based RPG and tactics, plus what is trending or worth playing. Every item has `kind` and `genres`. Steam header art or the article's `og:image` is the card picture.
7. **`social`** — what is viral on X, TikTok, Instagram, YouTube, and Reddit. Saudi TikTok hashtags come from `scripts/tiktok_trends.py` and `scripts/merge_tiktok.py`.
8. **`graphic`** — war, crime, and graphic news from established outlets (Reuters, AP, BBC, Guardian, Al Jazeera, verified-footage reports). Each item carries a short `warning`. The image is an outlet logo or a neutral picture, never gore.
9. **`adult_trending`** — adult-themed news that is trending (scandals, controversies, creator or celebrity coverage, platform-policy fights) as reported by mainstream outlets, or non-explicit public text posts. Each item carries a short `warning`. Leave `items` empty when nothing qualifies.

`graphic` and `adult_trending` sit behind a tap-to-reveal blur. Glance gives those widgets the class `mb-cw`; `dashboard/assets/custom.css` blurs each card until its `<details>` element is opened. `adult_trending` is mainstream-news-only and non-explicit: no links to porn or adult-content sites, no creator pages, nothing involving minors, nothing non-consensual or leaked, and no nude or suggestive images.

## Rules for every edition

- Do not invent facts, links, quotes, or numbers.
- Check that every source, watch, voice, and image URL loads before publishing.
- `id` is a stable slug. A later edition replaces the item with that id. It does not append a duplicate.
- `status` is `new` on first appearance, `updated` after a material change, then empty.
- `top_stories` holds one to three refs. The first is the lead.
- `sample` is `false` on a real edition. `generated_at` is RFC 3339 with a `+03:00` offset (`Asia/Riyadh`).
- Write `brief.json.tmp`, then move it over the live file.

The field-by-field contract is `schema/BRIEF-SCHEMA.md`. The machine-readable form is `schema/brief.v2.schema.json` (JSON Schema draft 2020-12). `samples/brief.sample.json` is the 2026-11-14 edition used to check that schema.

`BRIEF-SCHEMA.md` suggests 5–8 items per section. The daily pipeline does not cap a good list, empty sections are allowed, and the sample runs from 4 items (`adult_trending`) to 25 (`middle_east`). The schema follows the pipeline and the sample: `items` may be empty and has no maximum. Headlines are aimed at about 80 characters; the schema accepts a longer title (the sample's longest is 89). Games `store_url` is optional in the schema, matching the field guide. The pipeline asks for one on every games item, and the sample includes it on all 18.

## Repository layout

```
brief.json                 published file (see below)
brief.schema.json          v1 JSON Schema; index.html links here
index.html                 v1 static dashboard GitHub Pages may serve
README.md
.gitignore
.gitattributes             keeps the .woff2 fonts binary
dashboard/
  glance.yml               Glance config (page slug morning-brief, port 8768)
  run.sh                   starts Glance from this directory
  assets/
    custom.css             layout, type, and the content-warning blur
    logo.svg
    fonts/                 self-hosted Inter and Fraunces (.woff2 + fonts.css)
schema/
  BRIEF-SCHEMA.md          v2 field guide (rev 2.1)
  brief.v2.schema.json     JSON Schema for that guide
scripts/
  tiktok_trends.py         Saudi TikTok Creative Center hashtags
  merge_tiktok.py          merges those hashtags into the social section
pipeline/
  PIPELINE.md              daily build steps the agent runs
samples/
  brief.sample.json        real v2 edition from 2026-11-14
legacy/
  build_brief.py           v1 builder
  check_links.py           v1 link checker
```

The Glance binary is not in this repository. `dashboard/assets/brief.json` is local-only (gitignored): it is the file Glance serves at `/assets/brief.json`.

## Published `brief.json`

`brief.json` at the repository root is the published v1-format file. An external server syncs `main/brief.json` every 15 minutes, and GitHub Pages may serve `index.html`, which fetches that file and links to `brief.schema.json`. Leave both files where they are.

`brief.schema.json` stays at the root for the same reason: `index.html` references `href="brief.schema.json"`. Moving it would break that dashboard. The v1 builder and link checker are in `legacy/` because nothing in `index.html` calls them. `legacy/build_brief.py` writes `legacy/brief.json` (next to the script). `legacy/check_links.py` reads `brief.json` from the current working directory and expects the v1 list-of-sections shape.

The v2 document to develop against is `samples/brief.sample.json`, validated with `schema/brief.v2.schema.json`.

The copy of root `brief.json` currently on `main` was produced later the same morning (`generated_at` 2026-11-14T06:41:15+03:00). Its `version` is `2` and it carries `schema_rev` `2.3` plus Arabic fields (`what_changed_ar`, `title_ar`, `summary_ar`, and similar). It has no `adult_trending` section. Those additions are outside rev 2.1, so that file does not validate against `schema/brief.v2.schema.json`. This repository leaves it untouched.

Raw JSON, unchanged by this layout:

```
https://raw.githubusercontent.com/Montasaa/morning-brief/main/brief.json
```

## Run the dashboard locally

Glance itself is not committed. Download a release for your machine from [github.com/glanceapp/glance/releases](https://github.com/glanceapp/glance/releases), then:

```bash
# from the repository root
install -m 755 /path/to/glance dashboard/glance
ln -sfn ../../samples/brief.sample.json dashboard/assets/brief.json
./dashboard/run.sh
```

`run.sh` changes into `dashboard/`, prefers `./glance`, and logs to `dashboard/glance.log` (gitignored). To watch it in the foreground:

```bash
cd dashboard
./glance --config glance.yml
```

Open [http://127.0.0.1:8768/morning-brief](http://127.0.0.1:8768/morning-brief).

Glance binds to `127.0.0.1:8768` and serves `dashboard/assets/` at `/assets/`. Widgets read `http://127.0.0.1:8768/assets/brief.json` (the `&brief-url` anchor in `glance.yml`) and cache it for 15 minutes. Fonts are the `.woff2` files under `dashboard/assets/fonts/`; the CSS refers to them as `/assets/fonts/...`, which matches that mount. The markets widget still calls out to Yahoo Finance, so quotes need a network.

On the dashboard host the live file is `/home/box/services/glance/data/brief.json`, and the public page is `https://<dashboard-host>:8443/morning-brief`.

## How `brief.json` is produced

`pipeline/PIPELINE.md` is the procedure. There is no v2 `build_brief.py`. Each morning at 06:00 Asia/Riyadh the agent:

1. Gathers real items for all nine sections, independent outlets first, GitHub Trending only for repos.
2. Attaches a real image to every item, `try_url` on AI items, and two or three specific watch videos per section (watch may be empty for `graphic` and `adult_trending`).
3. Runs `python3 scripts/tiktok_trends.py && python3 scripts/merge_tiktok.py` for Saudi TikTok hashtags. `merge_tiktok.py` reads `BRIEF_JSON`, which defaults to `/home/box/services/glance/data/brief.json`.
4. Keeps ids stable, marks items `new` or `updated`, and refuses invented facts.
5. Checks every link and image, validates the JSON, writes `brief.json.tmp`, and atomically replaces the live file with `sample: false`, a fresh `generated_at`, and new `top_stories`.
6. Publishes to the dashboard host and reads the file back. The publish token comes from the environment (`VPS_BRIEF_TOKEN` or similar) and is never written into the repo or the logs.
7. Sends a three-line lowercase summary of the top stories with the dashboard link.

Validate the sample (and any other v2 document) with draft 2020-12 and format checks:

```bash
python3 -m pip install jsonschema
python3 - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator
schema = json.loads(Path("schema/brief.v2.schema.json").read_text())
doc = json.loads(Path("samples/brief.sample.json").read_text())
Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER).validate(doc)
print("valid")
PY
```

`python3 -m json.tool samples/brief.sample.json` only checks that the file is JSON.

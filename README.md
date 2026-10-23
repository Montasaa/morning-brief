# morning brief

Abdulrahman's daily news brief, published as machine-readable JSON and a small static dashboard.

- **`brief.json`** — the data your site/app reads.
- **`brief.schema.json`** — JSON Schema (draft 2020-12) for `brief.json`.
- **`index.html`** — optional zero-build dashboard that fetches `brief.json`.

Raw JSON:

```
https://raw.githubusercontent.com/Montasaa/morning-brief/main/brief.json
```

## Fetch it

```js
const res = await fetch("https://raw.githubusercontent.com/Montasaa/morning-brief/main/brief.json");
const brief = await res.json();

for (const section of brief.sections) {
  console.log(section.id, section.items.length);
}
```

If you enable GitHub Pages for this repo, the dashboard is:

```
https://montasaa.github.io/morning-brief/
```

## Shape

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-10-23T20:23:10Z",
  "date": "2026-10-23",
  "edition": "evening",
  "timezone": "Asia/Riyadh",
  "next_build_at": "2026-10-24T03:30:00Z",
  "sections": [
    {
      "id": "middle_east",
      "title": "middle east",
      "items": [
        {
          "id": "hebron-west-bank-lockdown",
          "section": "middle_east",
          "title": "israel seals off hebron and the west bank after two soldiers killed",
          "summary": "first line\nsecond line",
          "sources": [{ "name": "BBC", "url": "https://..." }],
          "published_at": "2026-10-23T17:57:00Z",
          "status": "new",
          "updated": true,
          "change": "what changed since yesterday",
          "meta": {},
          "tags": ["israel", "west-bank"]
        }
      ],
      "watch": [
        { "title": "video title", "url": "https://youtube.com/watch?v=...", "channel": "BBC News" }
      ]
    }
  ],
  "top_stories": [{ "section": "middle_east", "id": "hebron-west-bank-lockdown" }]
}
```

Sections are always, in order:

1. `trending_repos` — GitHub Trending + trendshift.io; stars gained, language, why it matters.
2. `middle_east` — Saudi Arabia, Yemen, Iran-US war and regional catalysts. Every item has `change`.
3. `us_markets` — futures, indices, VIX, oil, earnings, macro calendar, movers. No videos.
4. `liverpool` — results, fixtures, injuries, lineups, transfer rumours labelled by reliability.

Each section carries 5–8 items. `watch` holds 1–3 checked YouTube links for `trending_repos` and `middle_east`, 2 for `liverpool`, and is empty for `us_markets`.

## Update rules

- `id` is stable. A later edition **replaces** the item with the same `id`; it never appends a duplicate.
- `status`: `new` (first appearance), `updated` (changed since the previous build), `steady` (unchanged).
- `updated` is true when the item is new or changed in this build.
- `generated_at` moves on every build. `next_build_at` is the next scheduled Riyadh build.
- `summary` is exactly two lines, separated by `\n`.
- `change` is required on every `middle_east` item.
- Every source and watch URL is fetched and checked before the commit. Some publisher links are Google News redirects when the publisher blocks direct reads; the `name` still identifies the publisher.

## Build schedule (Asia/Riyadh)

- **06:30** — morning build, ready by 07:00, then a three-line chat summary.
- **19:00** — evening refresh. Same ids, new items marked `new`, changed items marked `updated`.

## Run it locally

```bash
python3 build_brief.py   # writes brief.json and validates it
python3 check_links.py   # fetches every source and watch URL
python3 -m http.server 8000
# open http://localhost:8000/
```

The bot keeps its gather/dedupe/rank/summarize/video-pick/validate procedure in the `morning-brief` skill.

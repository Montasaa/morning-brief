# brief.json schema (version 2, rev 2.1)

The Morning Brief dashboard (Glance, `https://<dashboard-host>:8443/morning-brief`)
reads one JSON document. The dashboard never writes to it; the Morning Brief bot owns the file.

- File: `/home/box/services/glance/data/brief.json`, served by Glance at `/assets/brief.json`.
- Every widget reads the URL set once in `glance.yml` (`&brief-url`). To switch to a
  GitHub raw URL later, change that one line.
- Widgets cache for 15 minutes, so a new file shows up within 15 minutes.

## What changed from version 1

| Change | Where |
| --- | --- |
| `version` is now `2` | top level |
| New `top_stories` list (1-3 refs) drives the hero at the top | top level |
| New sections `ai`, `games`, `social` | `sections` |
| `image` on every item (shown as the card picture) | item |
| `type` on every source: `independent`, `wire`, `social`, `official` | `sources[]` |
| New `voices[]`: what people are posting about the story | item (any section) |
| Trending repos: `rank`, `period`, `stars_total`; `stars_gained` now means stars in that period | `trending` items |
| AI: `kind`, `try_url`, `pricing`, `metric` | `ai` items |
| Games: `kind`, `genres`, `platforms`, `price`, `discount`, `release_date`, `store_url` | `games` items |
| Social: `platform`, `creator`, `metric` | `social` items |
| `watch[]` entries take `channel` and optional `thumbnail`; every section should have 2-3 | section |

## Top level

```json
{
  "version": 2,
  "sample": false,
  "generated_at": "2026-10-22T07:00:00+03:00",
  "timezone": "Asia/Riyadh",
  "top_stories": [
    { "section": "middle_east", "id": "me-coalition-drones" },
    { "section": "us_markets", "id": "us-spacex-tesla" },
    { "section": "ai", "id": "ai-deepseek-v4.1-flash" }
  ],
  "sections": {
    "middle_east": {}, "us_markets": {}, "ai": {}, "trending": {},
    "liverpool": {}, "games": {}, "social": {}
  }
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | integer | yes | `2`. |
| `sample` | boolean | yes | `true` only for fixtures; shows a "Sample data" tag in the header. |
| `generated_at` | RFC 3339 | yes | With `+03:00`. Header shows "Updated N ago". |
| `timezone` | string | no | `Asia/Riyadh`. |
| `top_stories` | array | recommended | 1-3 `{ "section", "id" }` refs to items that exist in `sections`. First one is the big lead story; pick the most important thing of the day. Use items that have an `image`. |
| `sections` | object | yes | The seven keys below. A missing section renders "Nothing new". |

Page order: Middle East, US markets, AI, Trending repos, Liverpool FC, Games, Trending on social.

## Section object (all sections)

```json
{
  "what_changed": "Optional one-line delta since yesterday.",
  "items": [],
  "watch": []
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `what_changed` | string | no | 1-2 sentences. Rendered as a one-line strip (click to expand). Used by `middle_east`; works in any section. |
| `items` | array | yes | 5-8 items, newest/most important first. Empty renders "Nothing new". |
| `watch` | array | yes | 2-3 videos, see below. |

### `watch[]` entry

```json
{ "title": "Macron's surprise 'solidarity' visit to Saudi Arabia",
  "url": "https://www.youtube.com/watch?v=jPy7wRkKHko",
  "channel": "Al Jazeera English",
  "thumbnail": "https://..." }
```

Link to a specific video, not a channel page. For YouTube links the thumbnail is derived
automatically from the video id, so `thumbnail` is only needed for other sites.

## Item (common fields)

```json
{
  "id": "me-taiz-crisis",
  "title": "Besieged Yemeni city on verge of 'unmanageable' crisis, aid workers warn",
  "summary": "Water and fresh food running out in Taiz as fighting intensifies.",
  "sources": [
    { "title": "The Guardian", "url": "https://www.theguardian.com/...", "type": "independent" }
  ],
  "time": "2026-10-21T17:24:00+03:00",
  "section": "middle_east",
  "status": "new",
  "image": "https://i.guim.co.uk/...jpg",
  "voices": [
    { "platform": "x", "handle": "@someone", "text": "What they posted, one or two lines.",
      "metric": "12k likes", "url": "https://x.com/someone/status/..." }
  ]
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable slug, unique within the file. Used by `top_stories` and for de-duplication. |
| `title` | string | yes | Headline. Cards show 2 lines, so keep it under ~80 characters. |
| `summary` | string | yes | 1-2 sentences, shown when the card is clicked. |
| `sources` | array | yes | 1-3 `{ title, url, type }`. First source is the card's link and the name shown on the card. |
| `sources[].type` | string | yes | `independent` (reputable independent media), `wire` (Reuters/AP/AFP), `social` (a post or video), `official` (government, club or company channel). |
| `time` | RFC 3339 | yes | Shown as relative time. |
| `section` | string | yes | The section key. |
| `status` | string | no | `new`, `updated` or empty. Drives the NEW/UPDATED badges and the "N new" counts in the header. |
| `image` | URL | recommended | Card picture, shown 16:9. Use the article's `og:image`; for YouTube use `https://i.ytimg.com/vi/<id>/hqdefault.jpg`. Missing image shows a coloured placeholder with the section icon. |
| `voices` | array | optional | 0-3 social posts about the story. Shown as platform dots on the card and listed under "What people are saying" when opened. `platform`: `x`, `tiktok`, `instagram`, `youtube`, `reddit`. `metric` and `url` optional. |

### Source rules (owner's request)

- Do **not** use government or state outlets (e.g. SPA, WAM, IRNA, Saba) as the main or only
  source. If an official statement matters, cite it as a second source with `type: official`.
- Lead with reputable independent outlets. Suggested feeds that work from this box:
  - Middle East: BBC (`feeds.bbci.co.uk/news/world/middle_east/rss.xml`), The Guardian
    (`theguardian.com/world/middleeast/rss`), Middle East Eye (`middleeasteye.net/rss`),
    Al Jazeera (`aljazeera.com/xml/rss/all.xml`), plus Reuters/AP when available.
  - US markets: CNBC (`search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258`),
    Bloomberg TV and CNBC TV YouTube channels.
  - Liverpool: BBC Sport (`feeds.bbci.co.uk/sport/football/teams/liverpool/rss.xml`),
    The Guardian (`theguardian.com/football/liverpool/rss`), official LFC YouTube channel.
- Add the social perspective through `voices`: ground-level posts from X, TikTok, Instagram,
  YouTube or Reddit about the story (for example people posting from Yemen or the Saudi
  border). Pick posts with real reach, quote them briefly, and link the original.

## Section extras

### `trending` (Trending repos) — must be genuinely trending

Source: GitHub Trending (`github.com/trending?since=daily` and `?since=weekly`), optionally
trendshift.io. Do not list famous repos that are not on today's or this week's list.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `rank` | integer | yes | Position on the GitHub Trending list. Shown as "#1 today". |
| `period` | string | yes | `today` or `week`. |
| `stars_gained` | integer | yes | Stars gained in that period (from the trending page). |
| `stars_total` | integer | no | Total stars. |
| `language` | string | yes | Primary language. |
| `why_it_matters` | string | yes | One short sentence. |
| `image` | URL | yes | `https://opengraph.githubassets.com/1/<owner>/<repo>`. |

### `ai` (AI tools and models to try)

Sources: Hugging Face trending (`huggingface.co/api/models?sort=trendingScore` and
`/api/spaces?sort=trendingScore`), product launches, AI YouTube channels (Matt Wolfe,
Fireship, Two Minute Papers, AI Explained) for `watch`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `kind` | string | yes | `MODEL`, `TOOL`, `APP` or `PAPER`. Shown as a chip. |
| `try_url` | URL | yes | Where he can try it now (hosted demo, chat app, or model page). Rendered as a "Try it" button on the card. |
| `pricing` | string | no | `Free`, `Free demo`, `Free tier`, `Paid`, `Open weights`. |
| `metric` | string | no | Short signal, e.g. `#1 trending · 2,133 likes`. |
| `image` | URL | yes | For Hugging Face: `https://cdn-thumbnails.huggingface.co/social-thumbnails/models/<id>.png` (or `/spaces/<id>.png`). |

### `games` (strategy, turn-based RPG, trending)

Focus: strategy, turn-based RPG/tactics, plus whatever is trending or worth playing now.
Sources: Steam (`store.steampowered.com/search/results/?tags=1741&filter=popularnew&json=1`
for turn-based strategy, `tags=1677,122` for turn-based RPG; `api/appdetails?appids=<id>&cc=sa`
for details), PC Gamer and Rock Paper Shotgun RSS for news, GameSpot/IGN YouTube for trailers.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `kind` | string | yes | `NEWS`, `RELEASE`, `TRENDING`, `TRAILER`, `PREVIEW`, `UPDATE`, `DEAL`, `PICK`. |
| `genres` | array of strings | yes | First one is shown on the card, e.g. `Turn-based strategy`. |
| `platforms` | array of strings | no | `Windows`, `Mac`, `Linux`, `PS5`, `Xbox`, `Switch`. |
| `price` | string | no | Formatted local price, e.g. `112.46 SR`. |
| `discount` | integer | no | Percent off; shows a green `-40%` chip when > 0. |
| `release_date` | string | no | As given by the store. |
| `store_url` | URL | no | Store page. Put it in `sources` too. |
| `image` | URL | yes | Steam `header_image` or the article's `og:image`. |

### `social` (Trending on social)

What is viral right now on X, TikTok, Instagram and YouTube, plus fun things to watch.
Suggested sources: X trending in Saudi Arabia, TikTok Creative Center (trending hashtags and
sounds, region SA), Instagram Reels, YouTube trending / big creators.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `platform` | string | yes | `x`, `tiktok`, `instagram`, `youtube`, `reddit`. Drives the platform chip and placeholder colour. |
| `creator` | string | no | Account or channel name. |
| `metric` | string | no | e.g. `4.1M views`, `120k posts`. |
| `image` | URL | recommended | Video thumbnail or post image. |

### `us_markets`

Quotes and 21-day charts (S&P 500 and Nasdaq futures, S&P 500, Nasdaq, VIX, WTI) come from
Glance's built-in markets widget, not from this file. Use items for movers, earnings, macro.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `tag` | string | no | `EARNINGS`, `MACRO`, `FED`, `MOVERS`, `DEALS`, `HOUSING`, `GLOBAL`. |

### `liverpool`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `reliability` | string | yes | `Official` (club/league only), `Tier 1` (BBC, Guardian, The Athletic), `Tier 2`, `Tier 3`, `Rumour`. Colour-coded chip. |

### `middle_east`

No item extras. Put the daily delta in `what_changed`, and use `voices` for ground-level posts.

## Content-warning sections (rev 2.1, added 2026-10-24)

Two extra section keys, rendered after `social`, behind a tap-to-reveal warning (pure CSS:
widget class `mb-cw` blurs each card's `<summary>` until the card `<details>` is opened). `version`
stays `2` because the change is additive and the VPS validator accepts it.

| Key | Title | What goes in it |
| --- | --- | --- |
| `graphic` | Graphic news (content warning) | War/crime footage and graphic news from established outlets (Reuters, AP, BBC, Guardian, Al Jazeera, verified-footage reports). |
| `adult_trending` | 18+ trending (content warning) | Adult-themed news that is trending (scandals, controversies, creator/celebrity 18+ news, platform policy fights) as reported by mainstream outlets, or non-explicit public text posts. |

Extra fields: section-level `warning` (string) and item-level `warning` (short note, e.g. `violence, mass casualties`).

Hard rules:
- `image` must be an outlet logo or neutral picture, never gore, nude or suggestive imagery.
- `adult_trending`: no links to porn/adult-content sites or creator pages, nothing involving minors,
  nothing non-consensual or leaked. If nothing qualifies, leave `items` empty (renders "Nothing new").
- `watch` may be empty in these two sections when no suitable video exists.

## Producer checklist

1. Write valid JSON following this schema (`python3 -m json.tool brief.json`).
2. Write atomically: write `brief.json.tmp` next to it, then `mv` it over `brief.json`.
3. Set `"sample": false`, bump `generated_at`, and refresh `top_stories` on every publish.
4. Keep `status` short-lived: `new` on first appearance, `updated` after a material change,
   empty afterwards.
5. Every item should have an `image`, and every section 2-3 `watch` videos.
6. If switching to a remote URL, make sure it is reachable from this box and update
   `&brief-url` in `glance.yml`.

# daily build pipeline (as currently run by the Morning Brief agent)

Runs every day at 6:00 AM Asia/Riyadh.

1. Follow schema/BRIEF-SCHEMA.md exactly. Gather fresh, real items for all 9 sections (middle_east, us_markets, ai, trending, liverpool, games, social, graphic, adult_trending), with no cap on good items.
2. Use independent outlets first. State media is only allowed as a second source. Repos come only from GitHub Trending.
3. Every item needs a real image. ai items need a try_url and games items need a store_url. Each section gets 2-3 specific watch videos. Add social voices where they're real.
4. graphic: war, crime and graphic news from established outlets, each with a warning note, using the outlet logo or a neutral image (never gore), behind the tap-to-reveal blur.
5. adult_trending: adult-themed stories trending now (viral scandals, controversies, creator/platform news) from mainstream outlets or newsworthy non-explicit posts, behind the blur. Never explicit or nude images, never links to adult sites or creator pages, nothing involving minors, nothing non-consensual or leaked. Show an empty-state note when nothing qualifies.
6. TikTok: `python3 scripts/tiktok_trends.py && python3 scripts/merge_tiktok.py` (Saudi trending hashtags from TikTok Creative Center). `merge_tiktok.py` reads `BRIEF_JSON`, defaulting to `/home/box/services/glance/data/brief.json`. Do not point it at the repository-root `brief.json`.
7. Keep ids stable, replace items by id, never duplicate, and mark items new/updated.
8. Never invent facts, links, or numbers. Check that every link and image URL loads, then validate the JSON.
9. Write brief.json.tmp, then atomically move it over the live brief.json with `sample: false`, a fresh `generated_at` and `top_stories`.
10. Publish to the dashboard host and verify by reading it back. Auth tokens come from environment variables only (e.g. `VPS_BRIEF_TOKEN`) and are never committed or printed.
11. Send a 3-line lowercase summary of the top stories with the dashboard link.

# Verified sources (checked 2026-11-17, Asia/Riyadh)

Every URL below returned HTTP 200 from the OpenBot host unless marked otherwise. Re-run the checker before changing this list.

| Section | Source | URL | Method |
|---|---|---|---|
| middle_east | Al Jazeera (all) | https://www.aljazeera.com/xml/rss/all.xml | RSS |
| middle_east | BBC World | https://feeds.bbci.co.uk/news/world/rss.xml | RSS |
| middle_east | Arab News | https://www.arabnews.com/rss.xml | RSS |
| middle_east | Guardian World | https://www.theguardian.com/world/rss | RSS |
| us_markets | MarketWatch top stories | https://feeds.content.dowjones.io/public/rss/mw_topstories | RSS |
| us_markets | Investing.com news | https://www.investing.com/rss/news.rss | RSS |
| ai | Hugging Face blog | https://huggingface.co/blog/feed.xml | RSS |
| ai | arXiv cs.AI | http://export.arxiv.org/rss/cs.AI | RSS |
| ai | TechCrunch AI | https://techcrunch.com/category/artificial-intelligence/feed/ | RSS |
| ai | The Verge | https://www.theverge.com/rss/index.xml | RSS |
| trending | Hacker News front page | https://hnrss.org/frontpage | RSS |
| trending | GitHub new repos | https://api.github.com/search/repositories?q=created:>DATE&sort=stars&order=desc | JSON API |
| liverpool | BBC Sport football | https://feeds.bbci.co.uk/sport/football/rss.xml | RSS |
| liverpool | Liverpool FC official | https://www.liverpoolfc.com/rss | RSS |
| liverpool | This Is Anfield | https://www.thisisanfield.com/feed/ | RSS |
| games | PC Gamer | https://www.pcgamer.com/rss/ | RSS |
| games | Rock Paper Shotgun | https://www.rockpapershotgun.com/feed | RSS |
| social | YouTube channel feed | https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID | RSS |
| social | Reddit r/worldnews, r/stocks, r/LiverpoolFC, r/github | Composio REDDIT_GET_R_TOP (t=day) | Composio |

## Reddit

Direct Reddit RSS/JSON is blocked from datacenter IPs with a Cloudflare challenge (403); `old.reddit.com` redirects and public RSSHub mirrors return 403. Fetch Reddit through the Composio Reddit connection instead, which returned live top posts for all four subreddits on 2026-11-17.

## Do not add without a proxy

| Source | URL | Failure |
|---|---|---|
| CNBC RSS | https://www.cnbc.com/id/100003114/device/rss/rss.html | 403 |
| Yahoo Finance RSS | https://finance.yahoo.com/news/rssindex | 429 |
| Sky News Arabia | https://www.skynewsarabia.com/rss | 403 |
| Al Arabiya | https://www.alarabiya.net/.mrss/ar.xml | 403 |

## Notes

- Hacker News RSS intermittently times out; retry once before reporting it down.
- The GitHub search API is unauthenticated and shares a 60-request/hour limit; keep the `created:>DATE` window at 3 days or wider.
- Check every link before publishing: a source that fails should drop the item, not ship a dead link.

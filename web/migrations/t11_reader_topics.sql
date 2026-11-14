-- t11: Reader-created Topics and Gathering Rules.
--
-- A Topic a Reader creates has `created_by`; it is private to them until they
-- share it to the Catalog (`shared_at_ms`). The 14 starting Topics have no
-- creator and are always in the Catalog. Every Topic carries its Gathering
-- Rules (plain text: trusted outlets, what counts, what to exclude). Claude
-- drafts them when a Reader creates a Topic; the Owner can edit any Topic's.
-- The house source rules apply on top of every Topic's rules and live in code
-- (src/server/topics/gathering-rules.ts), not here.

ALTER TABLE topics ADD COLUMN created_by INTEGER REFERENCES readers (id);  -- null: a starting Topic
ALTER TABLE topics ADD COLUMN note TEXT;                                   -- the creator's short note
ALTER TABLE topics ADD COLUMN shared_at_ms INTEGER;                        -- set when shared to the Catalog
ALTER TABLE topics ADD COLUMN gathering_rules TEXT NOT NULL DEFAULT '';
-- Who wrote the current rules: 'starting' (seeded here), 'claude' (drafted at
-- creation), 'fallback' (Claude was unavailable; a template the Owner should
-- check) or 'owner' (edited by the Owner).
ALTER TABLE topics ADD COLUMN rules_by TEXT NOT NULL DEFAULT 'starting'
  CHECK (rules_by IN ('starting', 'claude', 'fallback', 'owner'));
ALTER TABLE topics ADD COLUMN rules_updated_at_ms INTEGER;

-- The cap of 10 created Topics per Reader counts by creator.
CREATE INDEX topics_created_by ON topics (created_by);

-- The starting Topics' rules, from the v2 sections (README.md "Sections").
UPDATE topics SET gathering_rules =
'Trusted outlets: BBC, The Guardian, Middle East Eye, Al Jazeera; Reuters or AP when a wire is the right cite. Saudi government or state outlets (SPA, Al Arabiya) only as a second source, typed official.
What counts: politics, economy, diplomacy, security and society in Saudi Arabia, and regional stories that move it. Say what changed today.
Exclude: press releases with no news in them, unverified social posts presented as fact.'
WHERE id = 'saudi';

UPDATE topics SET gathering_rules =
'Trusted outlets: BBC, The Guardian, Middle East Eye, Al Jazeera, Reuters, AP. Outlets of any side of the conflict (Saba, Al Masirah, government media) only as a second source, typed official.
What counts: the war and peace talks, Red Sea and Houthi actions, the humanitarian situation, economy and currency, people on the ground (real posts as voices).
Exclude: casualty figures from one side only without saying so, unverified footage.'
WHERE id = 'yemen';

UPDATE topics SET gathering_rules =
'Trusted outlets: BBC, The Guardian, Middle East Eye, Al Jazeera, Reuters, AP, Iran International when a second outlet confirms. Iranian state media (IRNA, Press TV, Tasnim) only as a second source, typed official.
What counts: politics, the nuclear file, sanctions, the economy, protests, Iran''s role in the region and the Gulf.
Exclude: single-source claims from any government, rumours of leaders'' health.'
WHERE id = 'iran';

UPDATE topics SET gathering_rules =
'Trusted outlets: BBC, The Guardian, Middle East Eye, Al Jazeera, Reuters, AP. State outlets only as a second source, typed official.
What counts: the regional stories that move Saudi Arabia, Yemen and Iran: Gaza, Lebanon, Syria, Iraq, the Gulf states, Egypt, shipping in Hormuz and the Red Sea.
Exclude: stories with no regional consequence, opinion pieces presented as news.'
WHERE id = 'wider-middle-east';

UPDATE topics SET gathering_rules =
'Trusted outlets: Reuters, AP, Bloomberg, CNBC, Financial Times, The Wall Street Journal, MarketWatch; company filings and Federal Reserve releases as primary sources.
What counts: index and sector movers, earnings, macro data, the Fed, deals, housing, global market shocks. Tag each Item (EARNINGS, MACRO, FED, MOVERS, DEALS, HOUSING, GLOBAL). News only: no quotes widget.
Exclude: stock tips, price targets without news, crypto promotion.'
WHERE id = 'us-markets';

UPDATE topics SET gathering_rules =
'Trusted outlets: the makers'' own announcements and papers (arXiv, official blogs), The Verge, Ars Technica, TechCrunch, MIT Technology Review, Hugging Face.
What counts: models, tools, apps and papers worth trying. Every Item has a kind (MODEL, TOOL, APP, PAPER), a try_url and an image.
Exclude: funding rounds with nothing to try, hype threads, listicles.'
WHERE id = 'ai';

UPDATE topics SET gathering_rules =
'Trusted outlets: the GitHub Trending page only (today or this week).
What counts: repositories on GitHub Trending today or this week, with rank, period, stars gained in that period, language, why it matters, and the GitHub Open Graph image.
Exclude: famous repositories that are not on the Trending list.'
WHERE id = 'github-trending';

UPDATE topics SET gathering_rules =
'Trusted outlets: Liverpool FC and the leagues (Official), BBC, The Guardian, The Athletic (Tier 1); then Tier 2, Tier 3 and Rumour, always labelled.
What counts: results, fixtures, injuries, lineups and transfer talk. Every Item has a reliability: Official, Tier 1, Tier 2, Tier 3 or Rumour. Fill the next-match widget.
Exclude: aggregator accounts that recycle rumours without a source.'
WHERE id = 'liverpool';

UPDATE topics SET gathering_rules =
'Trusted outlets: PC Gamer, Rock Paper Shotgun, Eurogamer, IGN, Steam and the studios'' own announcements.
What counts: strategy games (4X, grand strategy, RTS, city builders): releases, updates, reviews, deals worth playing. Every Item has a kind and genres; Steam header art or the article image; a store_url.
Exclude: sponsored lists, mobile gacha promotions.'
WHERE id = 'strategy-games';

UPDATE topics SET gathering_rules =
'Trusted outlets: PC Gamer, Rock Paper Shotgun, Eurogamer, RPG Site, IGN, Steam and the studios'' own announcements.
What counts: turn-based RPGs and tactics games: releases, updates, reviews, deals worth playing. Every Item has a kind and genres; Steam header art or the article image; a store_url.
Exclude: sponsored lists, mobile gacha promotions.'
WHERE id = 'turn-based-rpg-tactics';

UPDATE topics SET gathering_rules =
'Trusted outlets: Steam charts, PC Gamer, Eurogamer, IGN, The Verge, the studios'' own announcements.
What counts: what is trending or worth playing now across genres: big releases, surprise hits, notable updates. Every Item has a kind and genres; a store_url.
Exclude: leaks and datamines presented as fact, sponsored lists.'
WHERE id = 'trending-games';

UPDATE topics SET gathering_rules =
'Trusted outlets: the platforms themselves (X, TikTok, Instagram, YouTube, Reddit) for what is viral, confirmed by a news outlet when it is a news claim. Saudi TikTok hashtags come from scripts/tiktok_trends.py and scripts/merge_tiktok.py.
What counts: what is viral now, with the platform, creator and metric. Saudi trends first.
Exclude: explicit content, private individuals who did not choose to be public, unverified claims as fact.'
WHERE id = 'social-trends';

UPDATE topics SET gathering_rules =
'Trusted outlets: Reuters, AP, BBC, The Guardian, Al Jazeera, verified-footage reports.
What counts: war, crime and graphic news from established outlets. Each Item carries a short warning (English and Arabic). The image is an outlet logo or a neutral picture, never gore.
Exclude: gore images, unverified footage, anything glorifying violence.'
WHERE id = 'graphic';

UPDATE topics SET gathering_rules =
'Trusted outlets: mainstream outlets only (BBC, The Guardian, Reuters, AP, Variety, The Verge), or non-explicit public text posts that are newsworthy.
What counts: adult-themed news that is trending: scandals, controversies, creator and industry news, platform-policy fights. Each Item carries a short warning. Leave it empty when nothing qualifies.
Exclude (fixed limit): explicit or suggestive images, links to porn or adult-content sites, creator pages, anything involving minors, anything non-consensual or leaked. Never gather from porn sites.'
WHERE id = 'adult-trending';

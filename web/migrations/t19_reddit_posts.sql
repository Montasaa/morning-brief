-- t19 (GitHub issue #19): the app gathers Adult Trending itself, every 15
-- minutes, from the subreddit RSS feeds listed in its Gathering Rules
-- (src/server/gathering/adult-trending.ts, POST /api/gather/adult-trending).
--
-- One row per Reddit post the gathering has decided on, so a post is screened
-- once: `kept` (its Item is `item_id`), `dropped` (a fixed limit, or the
-- screening was unclear: never shown, never asked about again) or `retry`
-- (screening failed; tried again on the next runs, then dropped after a few
-- failed tries).
--
-- Editions never carry these Items. A Brief shows the kept ones posted in the
-- last 24 hours next to the latest Edition's Items (brief/compose.ts), so
-- neither the brief.json import nor this gathering removes the other's Items.
CREATE TABLE reddit_posts (
  post_id       TEXT PRIMARY KEY,                  -- Reddit's id without the t3_ prefix
  subreddit     TEXT NOT NULL,
  posted_at_ms  INTEGER NOT NULL,
  verdict       TEXT NOT NULL CHECK (verdict IN ('kept', 'dropped', 'retry')),
  reason        TEXT,                              -- why it was dropped, or why the last try failed
  attempts      INTEGER NOT NULL DEFAULT 0,        -- screening tries that failed
  item_id       TEXT REFERENCES items (id),        -- the Item, when kept
  decided_at_ms INTEGER NOT NULL,
  CHECK ((verdict = 'kept') = (item_id IS NOT NULL))
);
CREATE INDEX reddit_posts_recent ON reddit_posts (verdict, posted_at_ms);

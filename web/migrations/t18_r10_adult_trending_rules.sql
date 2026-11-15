-- Rework ticket 10 (GitHub issue #10, spec #6): Adult Trending is gathered
-- from Reddit only, through the public subreddit RSS feeds its Gathering Rules
-- list. This replaces its starting rules ("mainstream outlets only").
--
-- Numbered t18_r10 rather than t10: it changes `topics.gathering_rules`, which
-- t11_reader_topics.sql adds, so it must sort after every build-plan migration
-- (see DEVELOPING.md, "The database and migrations").
--
-- Only the starting rules are replaced: rules the Owner already edited stay
-- theirs. The feed list starts empty on purpose; the Owner fills it in on the
-- Gathering Rules page, and until then the gathering agent reports that
-- nothing qualified.
UPDATE topics SET gathering_rules =
'Subreddit RSS feeds (the Owner keeps this list; one per line, e.g. https://www.reddit.com/r/<subreddit>/new/.rss):
(none yet)
What counts: every new post in those feeds, NSFW included. Reddit only, read through the RSS feeds above: no other site. Mark explicit media nsfw_media: true. Each Item carries a short warning (English and Arabic).
Second source: a post making a claim about a named person needs a non-Reddit outlet report as its second source, with claim_subject set to that person, or it is dropped.
Exclude (fixed limit, never a setting): anything involving minors, anything non-consensual, anything leaked. Drop such posts.'
WHERE id = 'adult-trending' AND rules_by = 'starting';

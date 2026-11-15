-- t10 (rework ticket 10, GitHub issue #10, spec #6): Topics visible to the
-- Owner only. Adult Trending is one: it never appears in another Reader's
-- Catalog, cannot be followed or shared by them (404), is stripped from Items'
-- `topics` for them, and is never counted in the gathering list's followers.
-- The rule is in src/server/topics/catalog.ts (VISIBLE_TO_READER); this is a
-- fixed rule, not a setting.
--
-- Its name sorts after t07_reader_displays.sql, so deleting the follows below
-- also takes the Topic out of each Reader's Display `unblurred` (that file's
-- trigger).
ALTER TABLE topics ADD COLUMN owner_only INTEGER NOT NULL DEFAULT 0 CHECK (owner_only IN (0, 1));
UPDATE topics SET owner_only = 1 WHERE id = 'adult-trending';

-- Readers other than the Owner who opted in before this rule lose the Topic.
DELETE FROM topic_follows
 WHERE topic_id IN (SELECT id FROM topics WHERE owner_only = 1)
   AND reader_id NOT IN (SELECT id FROM readers WHERE role = 'owner');

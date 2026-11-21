-- t07 (rework ticket 07, GitHub issue #7, spec #6): each Reader's Display,
-- how their Brief looks and is arranged (Layouts, theme, accent, text size,
-- density, Topic order, pins, collapse, Widgets, dock, unblurred Sensitive
-- Topics). One document per Reader, read on every device they sign in on.
--
-- The rework's tickets are numbered by their GitHub issue, so this file shares
-- "t07" with the build plan's t07_interest_profiles.sql. Its name sorts after
-- that one on purpose: the trigger below needs `topic_follows` to exist.

-- The document holds only the keys the Reader has set; every other key reads as
-- its default (src/server/display/shape.ts), so existing Readers need no
-- backfill and a changed default reaches everyone who never chose. The app
-- validates the document before writing it.
CREATE TABLE displays (
  reader_id      INTEGER PRIMARY KEY REFERENCES readers (id) ON DELETE CASCADE,
  doc            TEXT NOT NULL CHECK (json_valid(doc) AND json_type(doc) = 'object'),
  updated_at_ms  INTEGER NOT NULL
);

-- Opting out of a Sensitive Topic (unfollowing it, by any route) takes it out of
-- `unblurred`, so opting in again starts blurred.
CREATE TRIGGER displays_forget_unblurred AFTER DELETE ON topic_follows
WHEN EXISTS (
  SELECT 1 FROM displays d, json_each(d.doc, '$.unblurred') u
   WHERE d.reader_id = OLD.reader_id AND u.value = OLD.topic_id
)
BEGIN
  UPDATE displays
     SET doc = json_set(doc, '$.unblurred', json((
           SELECT json_group_array(u.value) FROM json_each(displays.doc, '$.unblurred') u
            WHERE u.value <> OLD.topic_id))),
         updated_at_ms = CAST(unixepoch('subsec') * 1000 AS INTEGER)
   WHERE reader_id = OLD.reader_id;
END;

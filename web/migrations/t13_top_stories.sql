-- t13: each Reader's top stories for an Edition, picked after ingest.
-- Claude picks 1-3 from the Reader's own Brief with a "why this matters to
-- you" line in English and Arabic; when Claude fails the Scorer's best Items
-- are stored instead, with no why-lines. Private to the Reader, like Reactions.

CREATE TABLE top_stories (
  reader_id     INTEGER NOT NULL REFERENCES readers (id) ON DELETE CASCADE,
  edition_id    TEXT NOT NULL REFERENCES editions (id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES items (id),
  position      INTEGER NOT NULL,                 -- 0 first
  why           TEXT,                             -- NULL when the Scorer picked it
  why_ar        TEXT,
  picked_by     TEXT NOT NULL CHECK (picked_by IN ('claude', 'scorer')),
  picked_at_ms  INTEGER NOT NULL,
  PRIMARY KEY (reader_id, edition_id, item_id)
);
CREATE INDEX top_stories_edition ON top_stories (edition_id);

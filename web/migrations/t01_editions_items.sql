-- t01: Editions, Items, their Topics and Story Threads.
-- Times are kept as given (RFC 3339) plus a *_ms epoch column for ordering.

CREATE TABLE editions (
  id               TEXT PRIMARY KEY,               -- edition_id, e.g. 2026-11-14-morning
  kind             TEXT NOT NULL CHECK (kind IN ('morning', 'evening')),
  generated_at     TEXT NOT NULL,
  generated_at_ms  INTEGER NOT NULL,
  widgets          TEXT NOT NULL DEFAULT '{}',     -- JSON: next_match, countdowns
  top_stories      TEXT,                           -- JSON array of Item ids (fallback tops), or NULL
  received_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX editions_latest ON editions (generated_at_ms DESC);

CREATE TABLE threads (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  title_ar  TEXT NOT NULL
);

-- One row per Item id, holding the version from the newest Edition that carried it.
CREATE TABLE items (
  id          TEXT PRIMARY KEY,
  edition_id  TEXT NOT NULL REFERENCES editions (id),  -- the Edition this version came from
  thread_id   TEXT REFERENCES threads (id),
  status      TEXT NOT NULL DEFAULT '' CHECK (status IN ('new', 'updated', '')),
  time        TEXT NOT NULL,
  time_ms     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  title_ar    TEXT,
  summary     TEXT NOT NULL,
  summary_ar  TEXT,
  sources     TEXT NOT NULL,                     -- JSON array of {title, url, type}
  image       TEXT,
  warning     TEXT,
  warning_ar  TEXT,
  extras      TEXT NOT NULL DEFAULT '{}'         -- JSON: kind-specific extras and voices
);
CREATE INDEX items_thread ON items (thread_id);

-- Topic ids as the Edition gives them, in the Edition's order (first = primary).
-- No foreign key to a Topics table: the Catalog is a later ticket, and an
-- Edition may carry Topics the Catalog does not list yet.
CREATE TABLE item_topics (
  item_id   TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  topic_id  TEXT NOT NULL,
  position  INTEGER NOT NULL,
  PRIMARY KEY (item_id, topic_id)
);
CREATE INDEX item_topics_topic ON item_topics (topic_id);

-- Which Items each Edition carried. A Brief is built from the latest Edition alone.
CREATE TABLE edition_items (
  edition_id  TEXT NOT NULL REFERENCES editions (id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES items (id),
  position    INTEGER NOT NULL,
  PRIMARY KEY (edition_id, item_id)
);
CREATE INDEX edition_items_item ON edition_items (item_id);

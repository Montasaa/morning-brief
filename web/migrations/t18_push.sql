-- t18: Web Push. Each signed-in device a Reader turns push on for, the two
-- kinds of push they opt into, and what has been pushed already (so repeating
-- an Edition never pushes twice).

-- One row per subscribed device (a browser PushSubscription). It belongs to the
-- session that subscribed it, so signing out of a device stops its pushes.
CREATE TABLE push_subscriptions (
  endpoint       TEXT PRIMARY KEY,                -- the push service URL; unique per browser
  reader_id      INTEGER NOT NULL REFERENCES readers (id) ON DELETE CASCADE,
  session_hash   TEXT NOT NULL REFERENCES sessions (token_hash) ON DELETE CASCADE,
  p256dh         TEXT NOT NULL,
  auth           TEXT NOT NULL,
  created_at_ms  INTEGER NOT NULL
);
CREATE INDEX push_subscriptions_reader ON push_subscriptions (reader_id);
CREATE INDEX push_subscriptions_session ON push_subscriptions (session_hash);

-- The two kinds of push, each opt-in (off until the Reader turns it on).
ALTER TABLE interest_profiles ADD COLUMN push_brief_ready INTEGER NOT NULL DEFAULT 0;
ALTER TABLE interest_profiles ADD COLUMN push_thread_updates INTEGER NOT NULL DEFAULT 0;

-- "Brief ready" goes out once per Reader and Edition.
CREATE TABLE brief_ready_pushes (
  reader_id   INTEGER NOT NULL REFERENCES readers (id) ON DELETE CASCADE,
  edition_id  TEXT NOT NULL,
  sent_at_ms  INTEGER NOT NULL,
  PRIMARY KEY (reader_id, edition_id)
);

-- Items whose link to a Story Thread has already been announced (or was there
-- before push existed). An Item linked to a Thread that is not in here is a new
-- development: its Thread's followers get a push, once.
CREATE TABLE thread_developments (
  item_id       TEXT NOT NULL,
  thread_id     TEXT NOT NULL,
  seen_at_ms    INTEGER NOT NULL,
  PRIMARY KEY (item_id, thread_id)
);
INSERT INTO thread_developments (item_id, thread_id, seen_at_ms)
  SELECT id, thread_id, 0 FROM items WHERE thread_id IS NOT NULL;

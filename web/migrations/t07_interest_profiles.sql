-- t07: each Reader's Interest Profile (language, city, whether onboarding is
-- done) and the Topics they follow. Later tickets add opt-ins and notification
-- preferences with their own migrations.

-- One row per Reader once they have set anything; a Reader with no row has not
-- been through onboarding and has no language or city yet.
CREATE TABLE interest_profiles (
  reader_id        INTEGER PRIMARY KEY REFERENCES readers (id) ON DELETE CASCADE,
  language         TEXT CHECK (language IN ('en', 'ar')),
  city             TEXT,                          -- as the Reader typed it, trimmed (Widgets look it up)
  onboarded_at_ms  INTEGER                        -- set when onboarding is finished; never cleared
);

-- Which Catalog Topics each Reader follows. A Brief covers only these.
CREATE TABLE topic_follows (
  reader_id       INTEGER NOT NULL REFERENCES readers (id) ON DELETE CASCADE,
  topic_id        TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  followed_at_ms  INTEGER NOT NULL,
  PRIMARY KEY (reader_id, topic_id)
);
-- "Every Topic with at least one follower" (the gathering list) reads by Topic.
CREATE INDEX topic_follows_topic ON topic_follows (topic_id);

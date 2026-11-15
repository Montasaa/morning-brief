-- t14: Story Threads a Reader follows. Threads and the Items linked to them
-- (items.thread_id) come from Editions (t01); following one is the Reader's own.

CREATE TABLE thread_follows (
  reader_id       INTEGER NOT NULL REFERENCES readers (id) ON DELETE CASCADE,
  thread_id       TEXT NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  followed_at_ms  INTEGER NOT NULL,
  PRIMARY KEY (reader_id, thread_id)
);
-- Ticket 18 (push) reads who follows a Thread when ingest adds an Item to it.
CREATE INDEX thread_follows_thread ON thread_follows (thread_id);

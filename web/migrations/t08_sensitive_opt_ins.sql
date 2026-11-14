-- t08: Sensitive Topics. A Reader opts into a Sensitive Topic (topics.sensitive)
-- by following it from the Me tab; Adult Trending also needs an 18+
-- confirmation, and every confirmation is recorded here.

CREATE TABLE age_confirmations (
  reader_id        INTEGER NOT NULL REFERENCES readers (id) ON DELETE CASCADE,
  topic_id         TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,  -- the Topic being opted into
  confirmed_at_ms  INTEGER NOT NULL,
  PRIMARY KEY (reader_id, topic_id, confirmed_at_ms)
);

-- Before this ticket the Me tab let a Reader follow Adult Trending with no 18+
-- confirmation. Those follows are not valid opt-ins: the Reader opts in again.
DELETE FROM topic_follows
 WHERE topic_id = 'adult-trending'
   AND NOT EXISTS (SELECT 1 FROM age_confirmations a
                    WHERE a.reader_id = topic_follows.reader_id AND a.topic_id = topic_follows.topic_id);

-- t10: ingests the app refused (an invalid Edition, a body that is not JSON, a
-- brief.json the legacy importer could not convert), so the Owner console can
-- show whether the pipeline is healthy. Calls without the pipeline token are
-- not recorded. Only the newest rows are kept (see src/server/owner/health.ts).

CREATE TABLE ingest_rejections (
  id              INTEGER PRIMARY KEY,
  received_at_ms  INTEGER NOT NULL,
  endpoint        TEXT NOT NULL,                 -- e.g. /api/editions, /api/editions/legacy
  edition_id      TEXT,                          -- the document's edition_id when it had one
  reasons         TEXT NOT NULL                  -- JSON array of strings, as the 4xx response gave them
);
CREATE INDEX ingest_rejections_recent ON ingest_rejections (received_at_ms DESC, id DESC);

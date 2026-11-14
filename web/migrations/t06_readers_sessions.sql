-- t06: Readers, Invites, magic links and sessions.
-- Emails are stored trimmed and lowercased. Times are epoch milliseconds.
-- Nothing here is deleted on revoke: a revoked Reader keeps their history and
-- can be invited again.

CREATE TABLE readers (
  id             INTEGER PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  role           TEXT NOT NULL DEFAULT 'reader' CHECK (role IN ('owner', 'reader')),
  created_at_ms  INTEGER NOT NULL,
  revoked_at_ms  INTEGER                          -- set when the Owner revokes them; blocks sign-in
);
-- There is exactly one Owner, created at setup (OWNER_EMAIL), never through an Invite.
CREATE UNIQUE INDEX readers_one_owner ON readers (role) WHERE role = 'owner';

CREATE TABLE invites (
  id              INTEGER PRIMARY KEY,
  email           TEXT NOT NULL,
  invited_by      INTEGER NOT NULL REFERENCES readers (id),
  created_at_ms   INTEGER NOT NULL,
  accepted_at_ms  INTEGER,                        -- first sign-in through this Invite
  reader_id       INTEGER REFERENCES readers (id), -- the Reader it became
  revoked_at_ms   INTEGER
);
-- At most one live (not revoked) Invite per email.
CREATE UNIQUE INDEX invites_live_email ON invites (email) WHERE revoked_at_ms IS NULL;

-- Only a hash of each token is kept, so a database copy cannot sign anyone in.
CREATE TABLE magic_links (
  token_hash     TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  created_at_ms  INTEGER NOT NULL,
  expires_at_ms  INTEGER NOT NULL,
  used_at_ms     INTEGER                          -- single use
);
CREATE INDEX magic_links_email ON magic_links (email, created_at_ms);

-- One row per signed-in device.
CREATE TABLE sessions (
  token_hash     TEXT PRIMARY KEY,
  reader_id      INTEGER NOT NULL REFERENCES readers (id) ON DELETE CASCADE,
  created_at_ms  INTEGER NOT NULL,
  expires_at_ms  INTEGER NOT NULL
);
CREATE INDEX sessions_reader ON sessions (reader_id);

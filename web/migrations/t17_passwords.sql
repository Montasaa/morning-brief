-- Issue #17: sign in with an email and a password instead of emailed links.
-- Emails are stored trimmed and lowercased. Times are epoch milliseconds.

-- scrypt$N$r$p$salt$hash (salt and hash base64url). NULL: no password yet, so
-- this Reader cannot sign in (the Owner chooses theirs on the sign-in page; the
-- Owner sets every other Reader's on the Invites page).
ALTER TABLE readers ADD COLUMN password_hash TEXT;

-- Failed sign-ins, for the per-email rate limit. The email is kept only as a
-- SHA-256 hash, so addresses strangers type in are never stored.
CREATE TABLE sign_in_failures (
  email_hash  TEXT NOT NULL,
  at_ms       INTEGER NOT NULL
);
CREATE INDEX sign_in_failures_email ON sign_in_failures (email_hash, at_ms);

-- Magic links are gone.
DROP TABLE magic_links;

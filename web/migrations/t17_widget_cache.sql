-- t17: a short-lived cache for the live Widgets (Open-Meteo weather and place
-- lookups, Aladhan prayer times), shared by every Reader in the same city.
-- Rows are replaced when they expire; failures are never cached.

CREATE TABLE widget_cache (
  key            TEXT PRIMARY KEY,                -- e.g. weather:24.6877,46.7219 or prayer:...:2026-11-14
  value          TEXT NOT NULL,                   -- JSON
  expires_at_ms  INTEGER NOT NULL
);

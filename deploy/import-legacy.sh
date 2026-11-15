#!/bin/bash
# Side-by-side week (Phase 9): feed each new v2 brief.json from main into the v3 app
# through the legacy importer, so the old daily pipeline needs no change.
# Cron on the VPS, e.g. every 15 minutes. Posts only when the file changed.
# Reads INGEST_TOKEN from the stack's .env; never prints it.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
TOKEN=$(grep -m1 '^INGEST_TOKEN=' .env | cut -d= -f2-)
URL=${BRIEF_IMPORT_URL:-http://127.0.0.1:8769/brief/api/editions/legacy}
SRC=${BRIEF_SOURCE_URL:-https://raw.githubusercontent.com/Montasaa/morning-brief/main/brief.json}
STATE=data/last-legacy-import.sha256
TMP=$(mktemp) && OUT=$(mktemp) && trap 'rm -f "$TMP" "$OUT"' EXIT

curl -fsSL --max-time 30 "$SRC" -o "$TMP" || exit 0
SUM=$(sha256sum "$TMP" | cut -d' ' -f1)
[ -f "$STATE" ] && [ "$(cat "$STATE")" = "$SUM" ] && exit 0

CODE=$(curl -s -o "$OUT" -w '%{http_code}' --max-time 60 \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  --data-binary @"$TMP" "$URL")
# The app is down or restarting: try again next run.
[ "$CODE" = 000 ] || [ "${CODE:0:1}" = 5 ] && { echo "$(date -u +%FT%TZ) $CODE retry"; exit 0; }
echo "$(date -u +%FT%TZ) $CODE $(head -c 300 "$OUT")"
# Remember the file either way: a rejected file is already in the Owner console,
# and posting it again every 15 minutes would only repeat that.
echo "$SUM" > "$STATE"

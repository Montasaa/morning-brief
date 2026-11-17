#!/bin/bash
# Adult Trending gathering (issue #19): ask the app to read the subreddit RSS
# feeds listed in Adult Trending's Gathering Rules and add the new posts that
# pass the fixed limits to the Brief. Cron on the VPS, every 15 minutes.
# The app decides everything (who follows, which feeds, screening); this only
# calls it. Reads INGEST_TOKEN from the stack's .env; never prints it.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
TOKEN=$(grep -m1 '^INGEST_TOKEN=' .env | cut -d= -f2-)
URL=${GATHER_REDDIT_URL:-http://127.0.0.1:8769/brief/api/gather/adult-trending}
OUT=$(mktemp) && trap 'rm -f "$OUT"' EXIT

# One run at a time: a slow run (many feeds, slow Claude) must not overlap the next.
exec 9>data/gather-reddit.lock
flock -n 9 || { echo "$(date -u +%FT%TZ) still running, skipped"; exit 0; }

# Feeds are spaced 2.5 s apart and each post is screened by Claude, so allow a few minutes.
CODE=$(curl -s -o "$OUT" -w '%{http_code}' --max-time 600 -X POST \
  -H "Authorization: Bearer $TOKEN" "$URL")
# The app is down or restarting: the next run tries again.
[ "$CODE" = 000 ] || [ "${CODE:0:1}" = 5 ] && { echo "$(date -u +%FT%TZ) $CODE retry"; exit 0; }
echo "$(date -u +%FT%TZ) $CODE $(head -c 400 "$OUT")"

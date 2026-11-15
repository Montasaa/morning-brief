#!/bin/bash
# Nightly backup of the Morning Brief v3 database (cron on the VPS, see deploy/README.md).
# The copy lands in <stack>/backups/brief-YYYY-MM-DD.db; the newest 14 are kept.
set -euo pipefail
docker exec morning-brief node scripts/backup-db.mjs

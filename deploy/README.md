# Deploying Morning Brief v3

Phase 9 of [`docs/PLAN-v3.md`](../docs/PLAN-v3.md). The app runs on the VPS next to Glance, on the same domain: `https://news.montasaa.me/brief`.

## How it is wired

```
Cloudflare tunnel (cloudflared-glance, routes set in the Cloudflare dashboard)
  news.montasaa.me  path ^/brief  ->  http://morning-brief:3000   (v3 app)
  news.montasaa.me  (everything else)  ->  http://glance:8080       (Glance, unchanged)
```

- The app is one Docker container, `morning-brief`, built from `web/Dockerfile` with the repository root as context. It joins the `glance_default` network so the tunnel can reach it by name. It also listens on `127.0.0.1:8769` for local checks.
- The stack folder on the VPS is `~/stacks/morning-brief`. It holds `docker-compose.yml`, `backup.sh` and `import-legacy.sh` (copies of the files here), plus `.env`, `data/brief.db` and `backups/`.
- `.env` (mode 600, never committed) holds `REPO_DIR`, `APP_UID`/`APP_GID`, `PUBLIC_ORIGIN`, `OWNER_EMAIL`, `EMAIL_FROM`, `INGEST_TOKEN`, the VAPID key pair, `VAPID_SUBJECT`, `RESEND_API_KEY` and `ANTHROPIC_API_KEY`. `web/.env.example` explains each one.

## The Cloudflare route (one-time, in the dashboard)

Zero Trust → Networks → Tunnels → the tunnel serving `news.montasaa.me` → Public hostnames → **Add a public hostname**:

- Subdomain `news`, domain `montasaa.me`, path `^/brief`
- Service type `HTTP`, URL `morning-brief:3000`

Save it, then drag it **above** the existing `news.montasaa.me` → `http://glance:8080` row, because the first matching rule wins. Glance keeps every other path.

## Build and (re)start

```sh
cd ~/stacks/morning-brief
DOCKER_BUILDKIT=0 docker compose build   # this host has no buildx; the classic builder works
docker compose up -d
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8769/brief/api/brief   # 401 = up, signed out
```

Migrations run when the app starts. After changing `.env`, run `docker compose up -d` again.

## Feeding Editions during the side-by-side week

The old daily pipeline still writes the v2 `brief.json` to `main`. `import-legacy.sh` runs from cron every 15 minutes. It fetches that file and, if it changed, posts it to `POST /brief/api/editions/legacy`. Re-importing a file changes nothing. A rejected file shows up in the Owner console. The log is `backups/import.log`.

When Pipeline v3 ([`pipeline/PIPELINE-v3.md`](../pipeline/PIPELINE-v3.md)) takes over, it posts Edition v3 documents to `/brief/api/editions` directly, and this cron line goes away.

## Backups

`backup.sh` runs nightly at 00:30 UTC (03:30 Riyadh). It uses SQLite's online backup inside the container (`web/scripts/backup-db.mjs`), checks the copy with `integrity_check`, writes `backups/brief-YYYY-MM-DD.db` and keeps the newest 14. The log is `backups/backup.log`.

These copies sit on the same disk as the database. Copy `backups/` off the machine too (rclone, for example) to survive losing the VPS.

To restore: `docker compose stop`, copy a backup over `data/brief.db` (remove `data/brief.db-wal` and `data/brief.db-shm`), then `docker compose up -d`.

## Switch-over (after about a week)

Retire `dashboard/`, the v1 `index.html` and the root `brief.json` publishing. Point the Cloudflare hostname's root at the app or keep Glance. Update the README.

# The Morning Brief v3 app, for the VPS (see deploy/README.md).
# Build from the repository root, because the app imports ../schema:
#   docker build -f web/Dockerfile -t morning-brief:latest .
# BASE_PATH is baked in at build time (Next.js basePath).

FROM node:22-bookworm-slim AS build
WORKDIR /repo/web
# better-sqlite3 falls back to compiling if no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY schema/ /repo/schema/
COPY web/ ./
ARG BASE_PATH=/brief
ENV BASE_PATH=$BASE_PATH NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
ARG BASE_PATH=/brief
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 \
    DATABASE_PATH=/data/brief.db BASE_PATH=$BASE_PATH
# The standalone server sits at web/server.js (the tracing root is the repository root).
WORKDIR /app/web
COPY --from=build --chown=node:node /repo/web/.next/standalone/ /app/
COPY --from=build --chown=node:node /repo/web/.next/static ./.next/static
COPY --from=build --chown=node:node /repo/web/public ./public
# Migrations are read from <cwd>/migrations at start-up.
COPY --from=build --chown=node:node /repo/web/migrations ./migrations
COPY --chown=node:node web/scripts/backup-db.mjs ./scripts/backup-db.mjs
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000'+(process.env.BASE_PATH||'')+'/api/brief').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

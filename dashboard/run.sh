#!/bin/bash
# Glance (Morning Brief dashboard) on 127.0.0.1:8768
cd "$(dirname "$0")" || exit 1
if [[ -x ./glance ]]; then
  BIN=./glance
elif command -v glance >/dev/null 2>&1; then
  BIN=$(command -v glance)
else
  echo "glance binary not found. Download a release from https://github.com/glanceapp/glance/releases and place the executable at dashboard/glance." >&2
  exit 1
fi
mkdir -p assets
exec "$BIN" --config glance.yml >> glance.log 2>&1

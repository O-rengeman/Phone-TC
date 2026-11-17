#!/usr/bin/env bash
# macOS / Linux equivalent of start-dev.bat — Vite dev server exposed on the
# local network (--host) so other devices can reach it.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[INFO] node_modules not found. Installing dependencies..."
  npm install
fi

echo "[INFO] Starting development server (network-accessible)..."
exec npm run dev -- --host

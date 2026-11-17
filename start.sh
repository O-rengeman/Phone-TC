#!/usr/bin/env bash
# macOS / Linux equivalent of start.bat — installs deps if needed, then runs
# the Vite dev server (https://localhost:5173).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[INFO] node_modules not found. Installing dependencies..."
  npm install
fi

echo "[INFO] Starting development server..."
echo "Please access: https://localhost:5173"
exec npm run dev

#!/usr/bin/env bash
# Start an isolated Haven instance with demo data for manual/visual testing.
# Usage: scripts/dev-instance.sh <name> <port>
# Builds the web app into /tmp/haven-<name>/web and serves it with its own database.
set -euo pipefail
name=${1:?name}; port=${2:?port}
dir=/tmp/haven-$name
cd "$(dirname "$0")/.."
mkdir -p "$dir"
npx vite build --outDir "$dir/web" --emptyOutDir >/dev/null
if [ ! -f "$dir/data/haven.db" ]; then
  HAVEN_DATA_DIR="$dir/data" npx tsx src/server/seed.ts >/dev/null
fi
if [ -f "$dir/server.pid" ] && kill -0 "$(cat "$dir/server.pid")" 2>/dev/null; then kill "$(cat "$dir/server.pid")"; sleep 0.5; fi
HAVEN_DATA_DIR="$dir/data" HAVEN_WEB_DIR="$dir/web" PORT=$port nohup npx tsx src/server/index.ts >"$dir/server.log" 2>&1 &
echo $! >"$dir/server.pid"
for i in $(seq 1 40); do curl -sf "http://localhost:$port/api/health" >/dev/null && break; sleep 0.25; done
echo "Haven '$name' running at http://localhost:$port (log: $dir/server.log)"

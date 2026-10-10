#!/usr/bin/env bash
# Start an isolated Kunitz Coven instance with demo data for manual/visual testing.
# Usage: scripts/dev-instance.sh <name> <port>
# Builds the web app into /tmp/haven-<name>/web and serves it with its own database.
set -euo pipefail
name=${1:?name}; port=${2:?port}
dir=/tmp/haven-$name
cd "$(dirname "$0")/.."
mkdir -p "$dir"
npx vite build --outDir "$dir/web" --emptyOutDir >/dev/null
if [ ! -f "$dir/data/coven.db" ]; then
  COVEN_DATA_DIR="$dir/data" npx tsx src/server/seed.ts >/dev/null
fi
# Stop any previous server for this instance (npx/tsx spawn child processes, so match on the environment).
for p in /proc/[0-9]*; do
  if (tr '\0' '\n' <"$p/environ") 2>/dev/null | grep -qx "COVEN_DATA_DIR=$dir/data"; then kill "${p#/proc/}" 2>/dev/null || true; fi
done
sleep 0.5
COVEN_DATA_DIR="$dir/data" COVEN_WEB_DIR="$dir/web" PORT=$port nohup npx tsx src/server/index.ts >"$dir/server.log" 2>&1 &
echo $! >"$dir/server.pid"
for i in $(seq 1 40); do curl -sf "http://localhost:$port/api/health" >/dev/null && break; sleep 0.25; done
echo "Kunitz Coven '$name' running at http://localhost:$port (log: $dir/server.log)"

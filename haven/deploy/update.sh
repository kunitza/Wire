#!/usr/bin/env bash
# Pull the latest Haven code, rebuild and restart. Your data (haven/data) is untouched.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci --no-audit --no-fund
npm run build
sudo systemctl restart haven
echo "Haven updated."

#!/usr/bin/env bash
# Pull the latest Kunitz Coven code, rebuild and restart. Your data (kunitz-coven/data) is untouched.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci --no-audit --no-fund
npm run build
sudo systemctl restart kunitz-coven
echo "Kunitz Coven updated."

#!/usr/bin/env bash
# MED start.sh — install, build public/ -> dist/, publish deployment output, serve foreground.
set -euo pipefail
cd "$(dirname "$0")"
/usr/bin/time -p test -f package.json
/usr/bin/time -p test -f public/index.html
/usr/bin/time -p test -f serve-dist.mjs
PORT="${PORT:-3000}"
export PORT
# Install dependencies when missing or package.json changed.
if /usr/bin/time -p test ! -d node_modules; then
  /usr/bin/time -p npm install --no-audit --no-fund
fi
# Build: static output lives inside PROJECT_DIR at dist/.
/usr/bin/time -p rm -rf dist
/usr/bin/time -p mkdir -p dist
/usr/bin/time -p cp -a public/. dist/
/usr/bin/time -p test -f dist/index.html
# Publish deployment metadata (worker metadata dir only).
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({project: process.cwd(), directory: require('path').join(process.cwd(), 'dist')}))" "$WEB_DIR/deployment-output.json"
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"
/usr/bin/time -p echo "Serving MED dist/ on PORT=$PORT"
exec /usr/bin/time -p node serve-dist.mjs

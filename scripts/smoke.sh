#!/usr/bin/env bash
# End-to-end smoke: serves the fixture, launches Chrome for Testing with the
# unpacked extension, triggers page translation through the service worker,
# verifies DOM output, then restores.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME_BIN="${CHROME_BIN:-$HOME/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome}"
HTTP_PORT="${HTTP_PORT:-8125}"
CDP_PORT="${CDP_PORT:-9336}"
PROFILE="$(mktemp -d /tmp/tf-smoke-XXXXXX)"

if [ ! -x "$CHROME_BIN" ]; then
  echo "Chrome for Testing not found at $CHROME_BIN" >&2
  echo "Set CHROME_BIN to a Chrome for Testing / Chromium binary that supports --load-extension." >&2
  exit 1
fi

cd "$ROOT"
pnpm exec wxt build >/dev/null

python3 -m http.server "$HTTP_PORT" --bind 127.0.0.1 --directory tests/fixtures >/tmp/tf-smoke-http.log 2>&1 &
SERVER_PID=$!
node scripts/mock-ai.mjs >/tmp/tf-smoke-ai.log 2>&1 &
AI_PID=$!
"$CHROME_BIN" --headless=new --no-sandbox --disable-gpu \
  --disable-extensions-except="$ROOT/.output/chrome-mv3" \
  --load-extension="$ROOT/.output/chrome-mv3" \
  --remote-debugging-port="$CDP_PORT" --user-data-dir="$PROFILE" \
  "http://127.0.0.1:$HTTP_PORT/article.html" >/tmp/tf-smoke-chrome.log 2>&1 &
CHROME_PID=$!

cleanup() {
  kill "$CHROME_PID" "$SERVER_PID" "$AI_PID" 2>/dev/null || true
  sleep 1
  rm -rf "$PROFILE" 2>/dev/null || true
}
trap cleanup EXIT

sleep 5
CDP_URL="http://127.0.0.1:$CDP_PORT" node scripts/smoke-cdp.mjs

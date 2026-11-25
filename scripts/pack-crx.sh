#!/usr/bin/env bash
# Build a signed CRX with the stable local key so future versions update in place.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME_BIN="${CHROME_BIN:-$HOME/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome}"
KEY="${CRX_KEY:-$HOME/.secrets/transflow-extension.pem}"
VERSION="$(node -p "require('$ROOT/package.json').version")"

cd "$ROOT"
[ -f "$KEY" ] || { echo "missing CRX key: $KEY" >&2; exit 1; }
pnpm exec wxt build >/dev/null

"$CHROME_BIN" --headless=new --no-sandbox --disable-gpu \
  --pack-extension="$ROOT/.output/chrome-mv3" \
  --pack-extension-key="$KEY" >/tmp/tf-pack.log 2>&1 || true

if [ ! -f "$ROOT/.output/chrome-mv3.crx" ]; then
  echo "CRX pack failed; see /tmp/tf-pack.log" >&2
  exit 1
fi
mv "$ROOT/.output/chrome-mv3.crx" "$ROOT/.output/transflow-$VERSION.crx"
echo "built .output/transflow-$VERSION.crx"

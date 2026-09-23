#!/usr/bin/env bash
#
# Install / repair the NULLSHELL nginx site.
#
#   sudo bash deploy/install-nginx.sh [domain]
#
# Idempotent: safe to re-run. Backs up any existing config first, tests before
# reloading, and rolls back if the test fails.
#
set -euo pipefail

DOMAIN="${1:-nullshell.solorak.xyz}"
SITE="nullshell"
AVAIL="/etc/nginx/sites-available/${SITE}"
ENABLED="/etc/nginx/sites-enabled/${SITE}"
SRC="$(cd "$(dirname "$0")" && pwd)/nginx/nullshell.conf"
PORT="${PORT:-3099}"

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ run with sudo: sudo bash deploy/install-nginx.sh ${DOMAIN}" >&2
  exit 1
fi

echo "→ domain   ${DOMAIN}"
echo "→ upstream 127.0.0.1:${PORT}"

# --- 1. is the app even up? ------------------------------------------------
CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/healthz" || echo 000)"
if [ "$CODE" != "200" ]; then
  echo "✗ nothing healthy on 127.0.0.1:${PORT} (got HTTP ${CODE})."
  echo "  Start it first:  npm run pm2:start     (check: pm2 logs nullshell)"
  exit 1
fi
echo "✓ app healthy on 127.0.0.1:${PORT}"

# --- 2. back up whatever is there now --------------------------------------
if [ -f "$AVAIL" ]; then
  BACKUP="${AVAIL}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$AVAIL" "$BACKUP"
  echo "→ backed up existing config to ${BACKUP}"
  if grep -q "listen 443" "$AVAIL"; then
    echo "! the current config has a :443 block (certbot). Overwriting drops it —"
    echo "  re-run:  certbot --nginx -d ${DOMAIN}   after this script finishes."
  fi
fi

# --- 3. write + enable ------------------------------------------------------
sed "s#nullshell\.solorak\.xyz#${DOMAIN}#g; s#127\.0\.0\.1:3099#127.0.0.1:${PORT}#g" \
  "$SRC" > "$AVAIL"
ln -sf "$AVAIL" "$ENABLED"
echo "→ wrote ${AVAIL} and enabled it"

# nginx ships a default site that can shadow this one on port 80
if [ -e /etc/nginx/sites-enabled/default ]; then
  echo "! /etc/nginx/sites-enabled/default is still enabled; it can shadow this"
  echo "  site for unmatched hostnames. Remove it if the wrong page shows up:"
  echo "    sudo rm /etc/nginx/sites-enabled/default && sudo systemctl reload nginx"
fi

# --- 4. test, reload, roll back on failure ---------------------------------
if ! nginx -t; then
  echo "✗ nginx config test failed — rolling back"
  if [ -n "${BACKUP:-}" ] && [ -f "${BACKUP:-}" ]; then
    cp "$BACKUP" "$AVAIL"
    echo "→ restored ${BACKUP}"
  else
    rm -f "$AVAIL" "$ENABLED"
  fi
  exit 1
fi

systemctl reload nginx
echo "✓ nginx reloaded"

# --- 5. prove it end to end -------------------------------------------------
sleep 1
FAIL=0
for p in / /styles.css /scroll-cinematic.js /frames/orbit/frame_0001.jpg /healthz; do
  C="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN}" "http://127.0.0.1${p}" || echo 000)"
  if [ "$C" = "200" ]; then
    printf '  ✓ %-32s %s\n' "$p" "$C"
  else
    printf '  ✗ %-32s %s\n' "$p" "$C"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo "✓ all assets served through nginx for ${DOMAIN}"
  echo "  TLS:  sudo certbot --nginx -d ${DOMAIN}"
else
  echo "✗ some assets still fail. Check:"
  echo "    sudo tail -30 /var/log/nginx/nullshell.error.log"
  echo "    curl -sI http://127.0.0.1:${PORT}/styles.css   # is the APP serving it?"
  exit 1
fi

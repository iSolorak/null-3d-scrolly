#!/usr/bin/env bash
#
# NULLSHELL — VPS deploy: fetch, hard-reset to the remote branch, reload pm2.
#
#   npm run deploy              # deploys the current branch
#   BRANCH=main npm run deploy  # deploys an explicit branch
#
# WARNING: this does `git reset --hard`. Any uncommitted change or untracked
# build output on the VPS is discarded. That is the point — the server is a
# mirror of the remote, never an editing surface.
#
set -euo pipefail

cd "$(dirname "$0")/.."
APP_NAME="${APP_NAME:-nullshell}"

# current branch unless BRANCH is given
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
REMOTE="${REMOTE:-origin}"

echo "→ deploying ${APP_NAME} from ${REMOTE}/${BRANCH}"

OLD_REV="$(git rev-parse --short HEAD)"

git fetch --prune "$REMOTE" "$BRANCH"
git reset --hard "${REMOTE}/${BRANCH}"
# drop strays, but keep the things a deploy legitimately owns:
# node_modules (reinstalled below), dist (rebuilt below), logs, local media
git clean -fd -e logs -e clips -e img -e node_modules -e dist

NEW_REV="$(git rev-parse --short HEAD)"
echo "→ ${OLD_REV} .. ${NEW_REV}"

# install everything (the build needs devDependencies), build, then prune the
# dev tree back out so pm2 runs on production deps only
echo "→ installing dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "→ building dist/"
npm run build

echo "→ pruning dev dependencies"
npm prune --omit=dev

mkdir -p logs

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "→ reloading pm2 process ${APP_NAME}"
  pm2 reload ecosystem.config.js --update-env
else
  echo "→ starting pm2 process ${APP_NAME}"
  pm2 start ecosystem.config.js
fi

pm2 save

# smoke test the port pm2 is actually serving on
PORT="${PORT:-3099}"
sleep 2
CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/healthz" || echo 000)"
if [ "$CODE" = "200" ]; then
  curl -s "http://127.0.0.1:${PORT}/healthz"; echo
  echo "✓ ${APP_NAME} healthy on 127.0.0.1:${PORT} @ ${NEW_REV}"
else
  echo "✗ health check failed (HTTP ${CODE}) — check: pm2 logs ${APP_NAME}"
  exit 1
fi

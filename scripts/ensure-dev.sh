#!/bin/bash
# ensure-dev.sh — idempotent: makes sure postgres:5432 and a dev server on
# :3000 (with the dev.sh runtime env) are healthy, starting either if needed.
# Safe to call before every stage; cheap when everything is already up.
cd "$(dirname "$0")/.." || exit 1

export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/mudaala'
export AUTH_BEARER_FALLBACK='1'
export CRON_SECRET='dev-cron-secret'
export SETTINGS_ENC_KEY='dev-settings-enc-key'
export ADMIN_PHONES='+256712000001'
export CSRF_TRUSTED_HOSTS='.space-z.ai,.preview-platform.example'
export NODE_OPTIONS='--max-old-space-size=1536'

# --- postgres ---
if (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  echo "pg: up"
else
  echo "pg: starting embedded postgres"
  if [ ! -d .pgtool/node_modules ]; then
    mkdir -p .pgtool
    (cd .pgtool && { [ -f package.json ] || npm init -y >/dev/null 2>&1; } && npm i embedded-postgres --no-audit --no-fund >/dev/null 2>&1)
  fi
  nohup node .pgtool/start-pg.js > .pgtool/pg.log 2>&1 &
  for i in $(seq 1 60); do
    (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && break
    sleep 1
  done
  (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && echo "pg: up" || { echo "pg: FAILED"; exit 1; }
fi

# --- dev server ---
code=$(curl -s --max-time 4 -o /dev/null -w '%{http_code}' http://localhost:3000/api/health 2>/dev/null || true)
if [ "$code" = "200" ]; then
  echo "dev: already healthy"
  exit 0
fi
echo "dev: not healthy (last code: ${code:-none}) - restarting"
pkill -f 'next dev' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; sleep 2
# Console MUST land in dev.log: scripts/test-api.ts reads the SMS code from
# the dev server console in dev.log (the dev SMS provider prints it there).
nohup bunx next dev -p 3000 > dev.log 2>&1 &
for i in $(seq 1 60); do
  code=$(curl -s --max-time 4 -o /dev/null -w '%{http_code}' http://localhost:3000/api/health 2>/dev/null || true)
  if [ "$code" = "200" ]; then echo "dev: ready"; exit 0; fi
  sleep 2
done
echo "dev: FAILED to become healthy - dev.log tail:"
tail -20 dev.log
exit 1

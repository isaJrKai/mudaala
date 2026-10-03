#!/bin/bash
# verify-csp-change.sh — one-shot end-to-end verification for the CSP change
# (next.config.ts: 'unsafe-eval' now included only when NODE_ENV != production;
# 'unsafe-inline' kept). Runs: fresh dev server -> tsc -> eslint -> API behavior
# suite -> dev header check -> production standalone build -> prod header +
# smoke checks. Leaves the PRODUCTION server running on :3000.
#
# Usage: bash scripts/verify-csp-change.sh
cd "$(dirname "$0")/.." || exit 1

# Exact runtime env the sandbox dev server uses (mirrors .zscripts/dev.sh,
# confirmed via /proc of the running next-server; NOT the .env values).
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/mudaala'
export AUTH_BEARER_FALLBACK='1'
export CRON_SECRET='dev-cron-secret'
export SETTINGS_ENC_KEY='dev-settings-enc-key'
export ADMIN_PHONES='+256712000001'
export CSRF_TRUSTED_HOSTS='.space-z.ai,.preview-platform.example'
export NODE_OPTIONS='--max-old-space-size=1536'
# NOTE: NODE_ENV must NOT be exported here (next dev must see development;
# the prod server gets NODE_ENV=production explicitly at launch below).

FAIL=0
step() { echo; echo "=== $1 ==="; }

step "0. Postgres on 5432"
if (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  echo "postgres: up"
else
  echo "postgres: down - starting embedded postgres (.pgtool)"
  if [ ! -d .pgtool/node_modules ]; then
    mkdir -p .pgtool
    (cd .pgtool && { [ -f package.json ] || npm init -y >/dev/null 2>&1; } && npm i embedded-postgres --no-audit --no-fund >/dev/null 2>&1)
  fi
  nohup node .pgtool/start-pg.js > .pgtool/pg.log 2>&1 &
  for i in $(seq 1 60); do
    (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && break
    sleep 1
  done
  if (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then echo "postgres: up"; else
    echo "FATAL: postgres did not start - see .pgtool/pg.log"; exit 1
  fi
fi

step "1. Fresh dev server on :3000 (restarting so next.config.ts is re-evaluated)"
pkill -f 'next dev' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; sleep 2
nohup bunx next dev -p 3000 > dev-verify.log 2>&1 &
ok=0
for i in $(seq 1 90); do
  code=$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://localhost:3000/api/health 2>/dev/null || true)
  if [ "$code" = "200" ]; then ok=1; break; fi
  sleep 1
done
if [ "$ok" = "1" ]; then echo "dev ready"; else
  echo "FATAL: dev server failed - last 30 lines of dev-verify.log:"; tail -30 dev-verify.log; exit 1
fi

step "2. tsc --noEmit"
if bunx tsc --noEmit; then echo "tsc: PASS"; else echo "tsc: FAIL"; FAIL=1; fi

step "3. eslint"
if bun run lint; then echo "eslint: PASS"; else echo "eslint: FAIL"; FAIL=1; fi

step "4. API behavior suite (461 checks) against dev :3000"
if bun scripts/test-api.ts; then echo "suite: PASS"; else echo "suite: FAIL"; FAIL=1; fi
echo "--- cleanup-test-data ---"
bun scripts/cleanup-test-data.ts || echo "(cleanup reported issues - non-fatal, CI uses if:always too)"

step "5. DEV CSP header (expect unsafe-eval PRESENT under development)"
DEV_CSP=$(curl -sI http://localhost:3000/ | tr -d '\r' | grep -i '^content-security-policy:')
echo "$DEV_CSP" | tr ';' '\n' | grep -i 'script-src'
if echo "$DEV_CSP" | grep -q "unsafe-eval"; then echo "dev keeps unsafe-eval: PASS"; else echo "dev lost unsafe-eval: FAIL"; FAIL=1; fi

step "6. Production build (standalone)"
pkill -f 'next dev' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; sleep 2
if bun run build; then echo "build: PASS"; else echo "build: FAIL"; FAIL=1; fi

step "7. Production standalone server on :3000"
NODE_ENV=production nohup bun .next/standalone/server.js > server.log 2>&1 &
ok=0
for i in $(seq 1 60); do
  code=$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://localhost:3000/api/health 2>/dev/null || true)
  if [ "$code" = "200" ]; then ok=1; break; fi
  sleep 1
done
if [ "$ok" = "1" ]; then echo "prod server ready"; else
  echo "PROD SERVER FAILED - last 30 lines of server.log:"; tail -30 server.log; FAIL=1
fi

step "8. PROD CSP header (expect NO unsafe-eval, unsafe-inline kept)"
PROD_CSP=$(curl -sI http://localhost:3000/ | tr -d '\r' | grep -i '^content-security-policy:')
echo "$PROD_CSP" | tr ';' '\n' | grep -i 'script-src'
if echo "$PROD_CSP" | grep -q "unsafe-eval"; then echo "unsafe-eval leaked into prod: FAIL"; FAIL=1; else echo "no unsafe-eval in prod: PASS"; fi
if echo "$PROD_CSP" | grep -q "unsafe-inline"; then echo "unsafe-inline kept: PASS"; else echo "unsafe-inline missing: FAIL"; FAIL=1; fi

step "9. Prod smoke: homepage title + listings API"
curl -s --max-time 10 http://localhost:3000/ | grep -o '<title>[^<]*</title>' | head -1
curl -s --max-time 10 'http://localhost:3000/api/listings?limit=2' | head -c 500; echo

echo
if [ "$FAIL" = "0" ]; then echo "ALL VERIFY STEPS PASSED - prod server left running on :3000"; else echo "SOME STEPS FAILED - review output above"; fi
exit $FAIL

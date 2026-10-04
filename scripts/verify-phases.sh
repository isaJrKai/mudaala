#!/bin/bash
# verify-phases.sh — phase-based variant of verify-csp-change.sh.
# The all-in-one background run was killed mid-flight (sandbox reaps background
# jobs / possible VM restart), so verification is split into foreground phases,
# each sized to finish inside one tool-call timeout with no overlapping
# memory-heavy steps (tsc/lint run WITHOUT the dev server; build runs WITHOUT
# anything else).
#
# Usage:
#   DATABASE_URL_OVERRIDE="postgresql://..." bash scripts/verify-phases.sh check   # tsc + eslint
#   DATABASE_URL_OVERRIDE="postgresql://..." bash scripts/verify-phases.sh suite   # dev up + 461-check suite + cleanup + dev CSP assert
#   DATABASE_URL_OVERRIDE="postgresql://..." bash scripts/verify-phases.sh build   # dev down + standalone build
#   DATABASE_URL_OVERRIDE="postgresql://..." bash scripts/verify-phases.sh prod    # prod up + prod CSP assert + smoke (leaves server on :3000)
#
# Results append to verify-phases.log as "PH <phase> PASS|FAIL <detail>".
cd "$(dirname "$0")/.." || exit 1

# Same runtime env the sandbox dev server uses (mirrors .zscripts/dev.sh).
export DATABASE_URL="${DATABASE_URL_OVERRIDE:-postgresql://postgres:postgres@localhost:5432/mudaala}"
export AUTH_BEARER_FALLBACK='1'
export CRON_SECRET='dev-cron-secret'
export SETTINGS_ENC_KEY='dev-settings-enc-key'
export ADMIN_PHONES='+256712000001'
export CSRF_TRUSTED_HOSTS='.space-z.ai,.preview-platform.example'
export NODE_OPTIONS='--max-old-space-size=1536'
# NODE_ENV deliberately NOT exported here.

LOG=verify-phases.log
FAIL=0
rec() { echo "PH $1 $2 $3" >> "$LOG"; echo "[$1 -> $2] $3"; }
step() { echo; echo "=== $1 ==="; }

phase="${1:-check}"

case "$phase" in

check)
  step "tsc --noEmit"
  if bunx tsc --noEmit; then rec check PASS "tsc clean"; else rec check FAIL "tsc errors"; FAIL=1; fi
  step "eslint"
  if bun run lint; then rec check PASS "lint clean"; else rec check FAIL "lint errors"; FAIL=1; fi
  ;;

suite)
  step "Fresh dev server on :3000"
  pkill -f 'next dev' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; sleep 2
  nohup bunx next dev -p 3000 > dev-verify.log 2>&1 &
  ok=0
  for i in $(seq 1 90); do
    code=$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://localhost:3000/api/health 2>/dev/null || true)
    [ "$code" = "200" ] && { ok=1; break; }
    sleep 1
  done
  if [ "$ok" = 1 ]; then echo "dev ready"; else echo "FATAL: dev server not healthy"; rec suite FAIL "dev not healthy"; exit 1; fi

  step "API behavior suite (461 checks)"
  if bun scripts/test-api.ts > suite-out.log 2>&1; then
    tail -4 suite-out.log
    rec suite PASS "behavior suite"
  else
    tail -20 suite-out.log
    rec suite FAIL "behavior suite (see suite-out.log)"
    FAIL=1
  fi

  step "cleanup test data"
  bun scripts/cleanup-test-data.ts > cleanup-out.log 2>&1 || rec suite WARN "cleanup script nonzero (see cleanup-out.log)"

  step "DEV CSP header assertion"
  hdr=$(curl -sI http://localhost:3000/ | tr -d '\r')
  dev_csp=$(printf '%s' "$hdr" | grep -i '^content-security-policy:' | head -1)
  echo "$dev_csp"
  case "$dev_csp" in
    *unsafe-eval*) rec devcsp PASS "dev keeps unsafe-eval" ;;
    *) echo "DEV: unsafe-eval missing or no header"; rec devcsp FAIL "unsafe-eval absent/empty"; FAIL=1 ;;
  esac
  ;;

build)
  step "Stop dev server"
  pkill -f 'next dev' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; sleep 2
  step "Production standalone build"
  if bun run build > build-out.log 2>&1; then
    tail -6 build-out.log
    rec build PASS "standalone build"
  else
    tail -25 build-out.log
    rec build FAIL "build errors (see build-out.log)"
    FAIL=1
  fi
  ;;

prod)
  step "Launch production standalone server on :3000"
  # The app's instrumentation hook refuses to boot in production without a
  # canonical URL (NEXT_PUBLIC_APP_URL). Default to the local address here;
  # an explicitly provided value always wins.
  export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
  pkill -f 'next-server' 2>/dev/null; pkill -f 'standalone' 2>/dev/null; sleep 1
  NODE_ENV=production nohup bun .next/standalone/server.js > server.log 2>&1 &
  ok=0
  for i in $(seq 1 60); do
    code=$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://localhost:3000/api/health 2>/dev/null || true)
    [ "$code" = "200" ] && { ok=1; break; }
    sleep 1
  done
  if [ "$ok" != 1 ]; then echo "FATAL: prod server not healthy"; tail -15 server.log; rec prod FAIL "prod not healthy"; exit 1; fi
  echo "prod server healthy"

  step "PROD CSP header assertion"
  hdr=$(curl -sI http://localhost:3000/ | tr -d '\r')
  prod_csp=$(printf '%s' "$hdr" | grep -i '^content-security-policy:' | head -1)
  echo "$prod_csp"
  case "$prod_csp" in
    *unsafe-eval*) echo "PROD: unsafe-eval STILL PRESENT - regression"; rec prodcsp FAIL "unsafe-eval present in prod"; FAIL=1 ;;
    *unsafe-inline*) rec prodcsp PASS "no unsafe-eval, unsafe-inline kept" ;;
    *) echo "PROD: no CSP header or unsafe-inline missing"; rec prodcsp FAIL "header/unsafe-inline missing"; FAIL=1 ;;
  esac

  step "Smoke: homepage title + listings API"
  curl -s http://localhost:3000/ | grep -o '<title>[^<]*</title>' | head -1
  curl -s 'http://localhost:3000/api/listings?limit=2' | head -c 400; echo
  [ "$FAIL" = 0 ] && rec prod PASS "prod checks"
  ;;

*) echo "unknown phase: $phase"; exit 2 ;;
esac

exit $FAIL

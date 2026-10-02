#!/usr/bin/env bash
# TASK 3 — atomic apply + verify + commit on starter-launch.
# Doctrine (T1h/Task 2): the platform may flip the branch back to main between
# tool calls; only committed state is durable. Everything happens in THIS one
# call: guard-checkout → apply staged files → db push → tsc → eslint → restart
# server → full suite → commit. If any stage fails, nothing is committed.
set -uo pipefail
cd /home/z/my-project

BR=$(git rev-parse --abbrev-ref HEAD)
if [ "$BR" != "starter-launch" ]; then
  git checkout starter-launch || { echo "FATAL: cannot checkout starter-launch"; exit 1; }
fi
echo "[1] branch=$(git rev-parse --abbrev-ref HEAD)"

# --- apply staged (flip-proof) files -----------------------------------------
cp .t3stage/schema.prisma prisma/schema.prisma || exit 1
cp .t3stage/validation.ts src/lib/validation.ts || exit 1
cp .t3stage/test-api.ts scripts/test-api.ts || exit 1
cp .t3stage/.env.example .env.example || exit 1
# worklog: rebuild from the branch object, then append the Task 3 entry
git show starter-launch:worklog.md > worklog.md || exit 1
cat .t3stage/worklog-entry.md >> worklog.md || exit 1
echo "[2] staged files applied"

# --- db: apply schema + regenerate client ------------------------------------
npx prisma db push 2>&1 | tail -3 || { echo "FATAL: db push failed"; exit 1; }
echo "[3] prisma db push done"

# --- types + lint (fail fast before touching the server) ---------------------
npx tsc --noEmit || { echo "FATAL: tsc failed"; exit 1; }
echo "[4] tsc clean"
npx eslint . || { echo "FATAL: eslint failed"; exit 1; }
echo "[5] eslint clean"

# --- restart the dev server on fresh code + fresh prisma client --------------
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2
nohup bun run dev > dev.log 2>&1 &
echo "[6] dev server starting (pid $!)"
for i in $(seq 1 60); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ || true)
  if [ "$CODE" = "200" ]; then echo "[6] server ready after ${i}s (probe / -> 200)"; break; fi
  sleep 1
  if [ "$i" = "60" ]; then echo "FATAL: server not ready; last dev.log lines:"; tail -20 dev.log; exit 1; fi
done

# --- full suite ---------------------------------------------------------------
echo "[7] running full suite..."
npx tsx scripts/test-api.ts 2>&1 | tee /tmp/t3-suite.log | tail -45
SUITE_RC=${PIPESTATUS[0]}
if [ "$SUITE_RC" != "0" ]; then echo "FATAL: suite failed (rc=$SUITE_RC)"; exit 1; fi

# --- commit (explicit paths; no stray sweeps) ---------------------------------
git add prisma/schema.prisma prisma/migrations/20261002120000_password_reset \
        src/lib/password.ts src/lib/sms.ts src/lib/password-reset.ts src/lib/auth.ts \
        src/lib/rate-limit.ts src/lib/db.ts src/lib/validation.ts \
        src/app/api/auth/password src/app/api/cron/sweep/route.ts \
        src/components/commerce/auth-dialog.tsx \
        scripts/test-api.ts scripts/mint-reset-code.ts \
        .env.example worklog.md || exit 1
echo "[8] staged for commit:"
git status --short | head -25

git commit -m "Task 3: password reset by SMS code - SmsProvider interface (Africa's Talking production / console dev, failures logged without phone or code), PasswordReset with salted-hash 6-digit codes (10 min life, dead after 5 wrong tries), 3/phone/hour + 10/IP/hour budgets, byte-identical responses with or without an account (no enumeration), register-grade password rules now enforced at register too (min 8, not common, not the phone), success revokes every session, forgot-password flow in the sign-in dialog, prisma query logs off by default (phone-in-logs red line), sweep deletes stale codes; suite 311 -> 339" || exit 1

echo "[9] committed:"
git log --oneline -2
git rev-parse --abbrev-ref HEAD

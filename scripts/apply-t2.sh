#!/usr/bin/env bash
# Task 2 apply script — atomic: restore branch, apply staged files, migrate,
# restart dev server, then run the full gauntlet. Idempotent: safe to re-run
# after a platform flip.
set -u
cd /home/z/my-project

BR=$(git rev-parse --abbrev-ref HEAD)
if [ "$BR" != "starter-launch" ]; then
  echo "FLIP detected (on $BR) — checking out starter-launch"
  git checkout starter-launch || exit 1
fi
echo "branch: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"

# 1) Apply the staged task files over the tree.
cp -R .t2stage/src/app/. src/app/ 2>/dev/null
cp -R .t2stage/src/components/. src/components/ 2>/dev/null
cp -R .t2stage/src/lib/. src/lib/ 2>/dev/null
cp -R .t2stage/prisma/. prisma/ 2>/dev/null
cp .t2stage/scripts/test-api.ts scripts/test-api.ts
echo "staged files applied"

# 2) Schema push + client generate.
npx prisma db push --skip-generate >/tmp/t2-push.log 2>&1 || { echo "PRISMA PUSH FAILED"; tail -20 /tmp/t2-push.log; exit 1; }
npx prisma generate >/tmp/t2-gen.log 2>&1 || { echo "PRISMA GENERATE FAILED"; tail -20 /tmp/t2-gen.log; exit 1; }
echo "prisma db push + generate ok"

# 3) Fresh dev server (must reload the regenerated prisma client).
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2
nohup bun run dev > dev.log 2>&1 &
UP=0
for i in $(seq 1 120); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/ 2>/dev/null || true)
  if [ "$CODE" = "200" ]; then UP=1; break; fi
  sleep 1
done
if [ "$UP" != "1" ]; then echo "DEV SERVER DID NOT COME UP"; tail -30 dev.log; exit 1; fi
echo "dev server up (probe / -> 200)"

# 4) Typecheck + lint.
echo "--- tsc ---"
npx tsc --noEmit || { echo "TSC FAILED"; exit 1; }
echo "tsc clean"
echo "--- eslint ---"
npx eslint \
  src/app/admin \
  src/app/api/reports \
  src/app/api/admin \
  "src/app/api/listings/route.ts" \
  "src/app/api/listings/[id]/route.ts" \
  "src/app/l" "src/app/s" \
  src/lib/reports.ts src/lib/constants.ts src/lib/validation.ts src/lib/admin.ts \
  src/components/commerce/report-dialog.tsx \
  src/components/commerce/admin-reports-view.tsx \
  src/components/commerce/safety-tip.tsx \
  src/components/commerce/listing-detail.tsx \
  src/components/commerce/shop-view.tsx \
  scripts/test-api.ts || { echo "ESLINT FAILED"; exit 1; }
echo "eslint clean"

# 5) Full suite.
echo "--- suite ---"
npx tsx scripts/test-api.ts 2>&1 | tail -45

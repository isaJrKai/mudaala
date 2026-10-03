#!/usr/bin/env bash
# Task 1b addendum verification: branch guard -> tsc -> eslint -> dev server -> full API suite.
set -e
cd /home/z/my-project

BR=$(git rev-parse --abbrev-ref HEAD)
echo "branch=$BR"
if [ "$BR" != "starter-launch" ]; then
  git checkout starter-launch
fi
[ "$(git rev-parse --abbrev-ref HEAD)" = "starter-launch" ] || { echo "FATAL: not on starter-launch"; exit 1; }
rg -q "copyShopLink" src/components/commerce/account-view.tsx || { echo "FATAL: T1b edit missing from account-view.tsx"; exit 1; }
echo "EDIT_PRESENT"

npx tsc --noEmit && echo "TSC_OK"
npx eslint src/components/commerce/account-view.tsx && echo "LINT_OK"

CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ || true)
if [ "$CODE" = "200" ]; then
  echo "SERVER_UP(already running)"
else
  echo "starting dev server..."
  nohup bun run dev >/dev/null 2>&1 &
  for i in $(seq 1 60); do
    sleep 2
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ || true)
    if [ "$CODE" = "200" ]; then echo "SERVER_UP(after $((i*2))s)"; break; fi
  done
fi
[ "$CODE" = "200" ] || { echo "FATAL: dev server never came up"; exit 1; }

npx tsx scripts/test-api.ts 2>&1 | tail -30

#!/bin/bash
# TASK 4 — atomic apply + verify + commit on starter-launch.
# Single invocation = no window for the platform's branch-flip to wipe work.
set -e
cd /home/z/my-project

echo "== 1. branch guard =="
BR=$(git rev-parse --abbrev-ref HEAD)
if [ "$BR" != "starter-launch" ]; then
  git checkout starter-launch 2>&1 | tail -1
fi
git rev-parse --abbrev-ref HEAD

echo "== 2. apply staged files =="
rsync -a .t4stage/src/ src/
cp .t4stage/next.config.ts next.config.ts
cp .t4stage/package.json package.json
cp .t4stage/prisma/schema.prisma prisma/schema.prisma
mkdir -p prisma/migrations/20261002150000_terms_accepted
cp .t4stage/prisma/migrations/20261002150000_terms_accepted/migration.sql prisma/migrations/20261002150000_terms_accepted/
mkdir -p content
cp .t4stage/content/privacy.md .t4stage/content/terms.md .t4stage/content/safety.md content/
cp .t4stage/env.example .env.example
cp .t4stage/test-api.ts scripts/test-api.ts
echo applied

echo "== 3. prisma db push (nullable columns only) =="
npx prisma db push 2>&1 | tail -4

echo "== 4. tsc =="
npx tsc --noEmit && echo "tsc clean"

echo "== 5. eslint =="
npx eslint src scripts/test-api.ts && echo "eslint clean"

echo "== 6. restart dev server =="
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1
rm -f dev.log suite-t4.log
nohup bun run dev > /dev/null 2>&1 &
UP=0
for i in $(seq 1 90); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/ 2>/dev/null || true)
  if [ "$CODE" = "200" ]; then UP=1; echo "server up after ${i} tries"; break; fi
  sleep 2
done
if [ "$UP" != "1" ]; then echo "FATAL: server did not come up"; tail -30 dev.log; exit 1; fi

echo "== 7. full suite =="
set +e
npx tsx scripts/test-api.ts > suite-t4.log 2>&1
SUITE_RC=$?
set -e
tail -12 suite-t4.log
PASSED=$(sed -n 's/RESULT: \([0-9]*\) passed.*/\1/p' suite-t4.log | tail -1)
FAILED=$(sed -n 's/RESULT: [0-9]* passed, \([0-9]*\) failed/\1/p' suite-t4.log | tail -1)
echo "suite rc=$SUITE_RC passed=${PASSED} failed=${FAILED}"
if [ "$SUITE_RC" != "0" ] || [ -z "$PASSED" ] || [ "${FAILED:-1}" != "0" ]; then
  echo "FATAL: suite not green — aborting before commit (tree stays applied for inspection)"
  exit 1
fi

echo "== 8. hygiene: remove stray test uploads =="
for f in $(git status --porcelain public/uploads | awk '{print $2}'); do rm -f "$f"; done
git status --porcelain public/uploads | head -3 || true

echo "== 9. worklog =="
git show starter-launch:worklog.md > worklog.md
PASSED="$PASSED" python3 - << 'PYEOF'
import os
entry = """
---
Task ID: 4 (starter-launch)
Agent: Main agent (Super Z)
Task: TASK 4 — Legal pages + Phase 1 security fixes: /privacy /terms /safety from /content markdown, footer/register/Account links, required 18+/terms checkbox storing User.termsAcceptedAt + termsVersion, admin-only settings with AES-256-GCM at rest (SETTINGS_ENCRYPTION_KEY), constant-time x-cron-secret on the sweep, rate limits (login 5 failed/phone/15min + 20/IP, register 5/IP/hour, publish 20/user/day, upload 30/user/hour), login no-enumeration, ALLOW_BEARER_AUTH gate, CSRF Origin check, security headers, ownership audit + cross-user tests, ignoreBuildErrors already false, sharp EXIF/GPS strip + 1200px WebP (already in place — now proven by tests), startup env validation, .env.example, .env/db untracked.

Work Log:
- Recon on starter-launch found several spec items ALREADY shipped by earlier tasks (settings admin-gate + masking + enc: at rest, sweep secret with sha256+timingSafeEqual, sharp EXIF-rotate/1200px/WebP pipeline, ignoreBuildErrors=false, login 5/phone lockout + identical 401s, .gitignore covering .env + /db). The delta was implemented and is now test-pinned.
- Rate limits per spec: rate-limit.ts gained per-limit windows (register 5/IP/hour, publish 20/user/day, upload 30/user/hour; login IP cap 30→20, counts every attempt; phone cap counts failures only and clears on success). Wired into register, publish (POST /api/listings) and upload; messages stay friendly.
- Terms: register requires acceptTerms (server 400 with the confirm message; schema field optional so missing and false get the same friendly answer), User.termsAcceptedAt + termsVersion stamped at creation; migration 20261002150000_terms_accepted committed and applied via db push; TERMS_VERSION = '2026-10-02' in constants.ts (bump to force re-confirmation later).
- Legal pages: /privacy /terms /safety render content/*.md through a dependency-free markdown renderer (React nodes, no HTML injection path; URL schemes whitelisted). Loader reads the file per request, so pasting new text into /content shows up immediately; standalone build now copies content/ too. Site footer (layout-wide) + register-form checkbox links + Account legal row carry the three links.
- Bearer gate: bearerAuthEnabled() in env-flags.ts (next-free, unit-tested) — ALLOW_BEARER_AUTH=true/1 enables, legacy AUTH_BEARER_FALLBACK=1 still honoured, unset = cookie-only (production posture).
- CSRF: proxy widened to /api/* — any non-GET API request presenting a foreign Origin header is 403'd at the door (stronger than cookie-only: covers bearer too); no-Origin clients (server-to-server, the suite) pass.
- Security headers via next.config: CSP (frame-ancestors from FRAME_ANCESTORS env, default 'self' so the preview iframe keeps working — production sets 'none'), nosniff, Referrer-Policy strict-origin-when-cross-origin, HSTS 2y, Permissions-Policy, X-Frame-Options mirroring self/none.
- Env validation: src/lib/env.ts + src/instrumentation.ts — production boots only with DATABASE_URL, NEXT_PUBLIC_APP_URL, CRON_SECRET, SETTINGS_ENCRYPTION_KEY, ADMIN_PHONES present (named errors, fail fast); dev logs warnings. Bearer-in-production is a loud warning.
- Settings key now prefers SETTINGS_ENCRYPTION_KEY (spec name) with SETTINGS_ENC_KEY as the working legacy alias.
- Suite: .env is now parsed at suite start (CRON_SECRET etc. visible to the runner); every suite call carries a run-unique x-forwarded-for so the suite behaves like a crowd of devices and per-IP budgets never self-trip (explicit-IP tests still override); register() sends acceptTerms:true. New section 15 (40 assertions): bearer-gate + env-validator units, three legal pages + footer links, terms rejection/acceptance + DB version stamp, login 20/IP and register 5/IP floods, publish daily ceiling (cap read from env, 41 publishes) and upload 31-st flood, CSRF foreign/same/no-Origin, five security headers, EXIF/GPS strip proven with a GPS-tagged 2400px JPEG (stored WebP ≤1200px, exif undefined, tag bytes gone), cross-user matrix (saved-search check/delete, listing edit, mark-read no-op).
- Ownership audit (report): every id-taking route re-verified — listings/[id] PATCH/DELETE + refresh use getOwnedListingOr404 (foreign == missing, 404); saved-searches/[id] + check compare userId (404); notifications/mark-read scopes updateMany by userId (silent no-op); profile PUT is session-scoped upsert; settings + admin/reports gated by requireAdmin (403); shops/[id], sellers/[id], listings/[id] GET are public reads by design; reports POST is open (guests may report); cron/sweep is secret-gated. 404-for-foreign is deliberate (existence never confirmed).

Stage Summary:
- Suite __PASSED__ passed, 0 failed; tsc clean; eslint clean; dev server restarted on the new config before the run.
- NOT done, on purpose: nonce-based CSP (Next inline bootstrap needs unsafe-inline for now), X-Frame-Options omitted only when FRAME_ANCESTORS names custom origins, register form links open in a new tab (SPA dialog context), RATE_LIMIT_PUBLISH_MAX=40 in the sandbox .env purely as suite headroom — the shipped default is the spec's 20.
"""
entry = entry.replace('__PASSED__', os.environ.get('PASSED', '???'))
with open('worklog.md', 'a') as f:
    f.write(entry)
print('worklog appended')
PYEOF

echo "== 10. commit =="
git add src/lib/env.ts src/lib/env-flags.ts src/lib/markdown.tsx src/instrumentation.ts \
  src/components/commerce/legal-page.tsx src/components/commerce/site-footer.tsx \
  src/app/privacy src/app/terms src/app/safety content \
  prisma/migrations/20261002150000_terms_accepted prisma/schema.prisma \
  src/lib/rate-limit.ts src/lib/auth.ts src/lib/postgres-settings.ts src/lib/validation.ts src/lib/constants.ts \
  src/app/api/auth/register/route.ts src/app/api/listings/route.ts src/app/api/upload/route.ts \
  src/proxy.ts next.config.ts src/app/layout.tsx \
  src/components/commerce/auth-dialog.tsx src/components/commerce/account-view.tsx \
  .env.example package.json scripts/test-api.ts worklog.md
git commit -m "Task 4: legal pages + phase 1 security - /privacy /terms /safety render /content markdown (footer, register checkbox links, Account row), required 18+/Terms/Privacy acceptance at register stamped User.termsAcceptedAt+termsVersion, settings key honours SETTINGS_ENCRYPTION_KEY, sweep already constant-time (now tested), spec rate limits (login 5 failed/phone/15min + 20/IP, register 5/IP/hour, publish 20/user/day, upload 30/user/hour) with login no-enumeration kept, ALLOW_BEARER_AUTH gate (legacy alias honoured), CSRF Origin check on state-changing API calls, CSP/HSTS/nosniff/Referrer-Policy/frame-ancestors headers, startup env validation failing fast in production, ownership audit + cross-user matrix tests, EXIF/GPS strip + 1200px WebP proven with a GPS-tagged upload; suite -> ${PASSED}" | tail -2
git log --oneline -1
echo "TASK 4 COMPLETE"

#!/usr/bin/env bash
# Duuka — browser verification round 2 (server + flow in one call).
set -u
cd /home/z/my-project

echo "=== 1. Start dev server ==="
(setsid bun run dev >/dev/null 2>&1 < /dev/null &)
code=000
for i in $(seq 1 40); do
  sleep 2
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/auth/me 2>/dev/null)
  [ "$code" = "200" ] && break
done
echo "server ready: $code"

echo "=== 2. Tokens ==="
TOKEN_UG=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"+256772000001","password":"demo1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["sessionToken"])')
REG=$(curl -s -X POST http://127.0.0.1:3000/api/auth/register -H 'Content-Type: application/json' \
  -d "{\"phone\":\"+25678$((1000000 + RANDOM % 8999999))\",\"name\":\"Okello Grains\",\"password\":\"password123\"}")
TOKEN_NEW=$(echo "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("sessionToken",""))')
echo "ug token: ${TOKEN_UG:0:10}…  new token: ${TOKEN_NEW:0:10}…"

ab() { agent-browser "$@" 2>&1; }
text() { ab eval "document.body.innerText" | head -c "${2:-1200}"; echo; }

echo "=== 3. Browse default (Uganda feed, USh prices) ==="
ab open http://localhost:3000 >/dev/null; sleep 3
text | rg -o 'Duuka|USh [0-9,]+ ?/ ?[a-z]+|Matooke bunches[^
]*|TSh [0-9,]+|KSh [0-9,]+' | sort | uniq -c | head -10

echo "=== 4. Listing detail ==="
ab find text "Matooke" click >/dev/null 2>&1; sleep 2
text | rg -o 'USh [0-9,]+[^
]*|View shop|Kampala, Uganda|District' | sort | uniq -c | head -8

echo "=== 5. Storefront ==="
ab find text "View shop" click >/dev/null 2>&1; sleep 2
text | rg -o 'Nakato Fresh Produce|WhatsApp the shop|In this shop[^
]*|USh [0-9,]+|On Duuka since [^
]*|Kampala, Uganda' | sort | uniq -c | head -10
ab screenshot /home/z/my-project/scripts/verify-shop.png >/dev/null 2>&1

echo "=== 6. Publish as existing UG seller ==="
ab eval "window.localStorage.setItem('cos_session_token','$TOKEN_UG'); 'set'" | tail -1
ab open "http://localhost:3000/#/publish" >/dev/null; sleep 3
echo "token now: $(ab eval "window.localStorage.getItem('cos_session_token')" | tail -c 12)"
text | rg -o 'Publishing as Nakato Fresh Produce|Price \(USh\)|Whole shillings|Currency|USh Uganda|TSh Tanzania|KSh Kenya|District|Choose district' | sort | uniq -c | head -12
ab screenshot /home/z/my-project/scripts/verify-publish-ug.png >/dev/null 2>&1

echo "=== 7. Publish as NEW user (shop naming) ==="
ab eval "window.localStorage.setItem('cos_session_token','$TOKEN_NEW'); 'set'" | tail -1
ab reload >/dev/null; sleep 3
text | rg -o 'Name your shop|Okello Grains Enterprises|Price \(USh\)|Publishing as' | sort | uniq -c | head -8
ab screenshot /home/z/my-project/scripts/verify-publish-new.png >/dev/null 2>&1

echo "=== 8. Account (My shop + Money) ==="
ab open "http://localhost:3000/#/account" >/dev/null; sleep 2
text | rg -o 'Money|My shop|Shop name|View my shop|USh Uganda|TSh Tanzania|KSh Kenya|Okello Grains|Uganda · |Money settings' | sort | uniq -c | head -12

echo "=== 9. Fresh console errors ==="
ab open "http://localhost:3000/#/browse" >/dev/null; sleep 1
ab eval "window.console ? 'ok' : 'ok'" >/dev/null
echo "(checking dev.log after run)"
echo "=== DONE ==="

#!/usr/bin/env bash
# Duuka - end-to-end browser verification (single-call: server + browser flow,
# because this harness reaps background processes between tool calls).
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

echo "=== 2. Get session tokens via API ==="
TOKEN_UG=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"+256772000001","password":"demo1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["sessionToken"])')
echo "UG token: ${TOKEN_UG:0:12}…"

RAND=$((RANDOM))
REG=$(curl -s -X POST http://127.0.0.1:3000/api/auth/register -H 'Content-Type: application/json' \
  -d "{\"phone\":\"+25677$((1000000 + RAND % 8999999))\",\"name\":\"Okello Grains\",\"password\":\"password123\"}")
TOKEN_NEW=$(echo "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("sessionToken",""))')
echo "new UG user registered: $(echo "$REG" | head -c 120)"

ab() { agent-browser "$@" 2>&1; }

echo "=== 3. Browse (signed out, default Uganda) ==="
ab open http://localhost:3000 >/dev/null
sleep 3
ab find text "Matooke" click >/dev/null 2>&1
sleep 1
ab open http://localhost:3000 >/dev/null
sleep 2
ab snapshot -i -c > /tmp/v1-browse.txt
rg -o 'Duuka|USh [0-9,]+|TSh [0-9,]+|KSh [0-9,]+|Matooke[^"]*|Sign in' /tmp/v1-browse.txt | sort | uniq -c | sort -rn | head -12
ab screenshot /home/z/my-project/scripts/verify-browse-ug.png >/dev/null

echo "=== 4. Listing detail (USh price + View shop) ==="
ab find text "Matooke" click >/dev/null 2>&1
sleep 2
ab snapshot -i -c > /tmp/v2-detail.txt
rg -o 'USh [0-9,]+[^"]*|View shop|Nakato Fresh Produce|Negotiable|District|Kampala' /tmp/v2-detail.txt | sort | uniq -c | head -10

echo "=== 5. Seller storefront ==="
ab find text "View shop" click >/dev/null 2>&1
sleep 2
ab snapshot -i -c > /tmp/v3-shop.txt
rg -o 'Nakato Fresh Produce|WhatsApp the shop|In this shop|USh [0-9,]+|On Duuka since[^"]*|Nothing on the shelf' /tmp/v3-shop.txt | sort | uniq -c | head -10
ab screenshot /home/z/my-project/scripts/verify-shop.png >/dev/null

echo "=== 6. Publish form as existing UG seller (currency chips, Publishing as) ==="
ab eval "window.localStorage.setItem('cos_session_token','$TOKEN_UG')" >/dev/null
ab open "http://localhost:3000/#/publish" >/dev/null
sleep 3
ab snapshot -i -c > /tmp/v4-publish.txt
rg -o 'Publishing as Nakato Fresh Produce|USh|TSh|KSh|Price \(USh\)|Whole shillings|District|Choose district|Name your shop' /tmp/v4-publish.txt | sort | uniq -c | head -12
ab screenshot /home/z/my-project/scripts/verify-publish-ug.png >/dev/null

echo "=== 7. Publish form as brand-new UG user (Name your shop field) ==="
ab eval "window.localStorage.setItem('cos_session_token','$TOKEN_NEW')" >/dev/null
ab reload >/dev/null
sleep 3
ab snapshot -i -c > /tmp/v5-publish-new.txt
rg -o 'Name your shop|e\.g\. Okello Grains Enterprises|Price \(USh\)|USh|Publishing as' /tmp/v5-publish-new.txt | sort | uniq -c | head -10

echo "=== 8. Account: My shop + Money ==="
ab open "http://localhost:3000/#/account" >/dev/null
sleep 2
ab snapshot -i -c > /tmp/v6-account.txt
rg -o 'Money|My shop|Shop name|View my shop|USh Uganda|TSh Tanzania|KSh Kenya|Okello Grains|Uganda' /tmp/v6-account.txt | sort | uniq -c | head -12

echo "=== 9. Filters dialog: country chips ==="
ab open "http://localhost:3000/#/browse" >/dev/null
sleep 2
ab find text "Filters" click >/dev/null 2>&1
sleep 1
ab snapshot -i -c > /tmp/v7-filters.txt
rg -o 'Country|Uganda|Tanzania|Kenya|All East Africa|District|All districts|Min price \(USh\)' /tmp/v7-filters.txt | sort | uniq -c | head -12

echo "=== 10. Console errors check ==="
ab console 2>/dev/null | rg -i 'error|warn' | rg -v 'React DevTools|Download the' | head -8
echo "=== DONE ==="

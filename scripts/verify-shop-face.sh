#!/usr/bin/env bash
# Duuka — shop-face verification: storefront hero (cover + logo), Account
# shop-photo pickers, local greeting. Single-call: server + browser flow,
# because this harness reaps background processes between tool calls.
set -u
cd /home/z/my-project

ab() { agent-browser "$@" 2>&1; }

echo "=== 1. Server up? ==="
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/listings 2>/dev/null)
if [ "$code" != "200" ]; then
  (setsid bun run dev >/dev/null 2>&1 < /dev/null &)
  for i in $(seq 1 40); do
    sleep 2
    code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/listings 2>/dev/null)
    [ "$code" = "200" ] && break
  done
fi
echo "server ready: $code"

echo "=== 2. UG seller session token ==="
TOKEN_UG=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"+256772000001","password":"demo1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["sessionToken"])')
echo "UG token: ${TOKEN_UG:0:12}…"

echo "=== 3. Storefront of Nakato (has cover + logo) — mobile 375 ==="
ab set viewport 375 720 >/dev/null 2>&1
ab open "http://localhost:3000/#/seller" >/dev/null
sleep 2
ab eval "window.localStorage.setItem('cos_session_token','$TOKEN_UG')" >/dev/null
ab open "http://localhost:3000/#/account" >/dev/null
sleep 3
SHOP_URL=$(ab eval "fetch('/api/auth/me',{headers:{Authorization:'Bearer '+localStorage.getItem('cos_session_token')}}).then(r=>r.json()).then(d=>'http://localhost:3000/#/seller/'+d.user.id)" | tr -d '"')
echo "shop url: $SHOP_URL"
ab open "$SHOP_URL" >/dev/null
sleep 3
ab snapshot -i -c > /tmp/f1-shop.txt
rg -o 'Tukusanyukidde|Nakato Fresh Produce|WhatsApp the shop|In this shop|On Duuka since[^"]*|USh [0-9,]+' /tmp/f1-shop.txt | sort | uniq -c | head -10
ab eval "({covers: document.querySelectorAll('img[alt=\"Nakato Fresh Produce cover photo\"]').length, logos: document.querySelectorAll('img[alt=\"Nakato Fresh Produce logo\"]').length, dataImgs: [...document.querySelectorAll('section img')].filter(i=>i.src.startsWith('data:image')).length})" > /tmp/f1-imgs.txt
cat /tmp/f1-imgs.txt
ab screenshot /home/z/my-project/scripts/verify-shop-face-mobile.png >/dev/null

echo "=== 4. Account → My shop — Shop photo pickers ==="
ab open "http://localhost:3000/#/account" >/dev/null
sleep 3
ab snapshot -i -c > /tmp/f2-account.txt
rg -o 'Shop photo|My shop|Logo|Cover|Change|Remove|Shop name|Save shop|Buyers remember pictures[^"]*' /tmp/f2-account.txt | sort | uniq -c | head -12
ab screenshot /home/z/my-project/scripts/verify-shop-face-account.png >/dev/null

echo "=== 5. Desktop 1280 storefront ==="
ab set viewport 1280 900 >/dev/null 2>&1
ab open "$SHOP_URL" >/dev/null
sleep 3
ab screenshot /home/z/my-project/scripts/verify-shop-face-desktop.png >/dev/null
ab eval "({h: document.querySelector('img[alt=\"Nakato Fresh Produce cover photo\"]')?.clientHeight, horizOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth})" > /tmp/f3-desktop.txt
cat /tmp/f3-desktop.txt

echo "=== 6. Tanzania storefront (Neema, Karibu greeting) — sanity ==="
TOKEN_TZ=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"+255754000001","password":"demo1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["sessionToken"])')
ab set viewport 375 720 >/dev/null 2>&1
ab eval "window.localStorage.setItem('cos_session_token','$TOKEN_TZ')" >/dev/null
ab open "http://localhost:3000/#/account" >/dev/null
sleep 3
TZ_URL=$(ab eval "fetch('/api/auth/me',{headers:{Authorization:'Bearer '+localStorage.getItem('cos_session_token')}}).then(r=>r.json()).then(d=>'http://localhost:3000/#/seller/'+d.user.id)" | tr -d '"')
ab open "$TZ_URL" >/dev/null
sleep 3
ab snapshot -i -c > /tmp/f4-tzshop.txt
rg -o 'Karibu|Neema Dagaa Traders|TSh [0-9,]+|WhatsApp the shop' /tmp/f4-tzshop.txt | sort | uniq -c | head -8
ab screenshot /home/z/my-project/scripts/verify-shop-face-tz.png >/dev/null

echo "=== DONE ==="

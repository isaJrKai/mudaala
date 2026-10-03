#!/usr/bin/env bash
# Duuka - round 9: finish golden path (district combobox → publish → storefront).
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

ab() { agent-browser "$@" 2>&1; }
text() { ab eval "document.body.innerText" | head -c "${2:-1800}"; echo; }
refor() { echo "$1" | rg -o "$2 \[ref=([a-z0-9]+)\]" -r '$1' | head -1; }

echo "=== 2. Publish as Okello (session persisted from previous round) ==="
ab open "http://localhost:3000/#/publish" >/dev/null; sleep 3.5
text 2200 | rg -o 'Name your shop|Publishing as|Sign in to post' | head -3

ab fill "#p-shop" "Okello Grains Enterprises" >/dev/null 2>&1
ab fill "#p-title" "Sorghum grain, brewing grade" >/dev/null 2>&1
ab fill "#p-desc" "Dry sorghum from Lira, cleaned and graded for local brewers. Bring your bags or buy ours." >/dev/null 2>&1
ab find text "Farm Produce" click >/dev/null 2>&1; sleep 1
ab fill "#p-price" "25000" >/dev/null 2>&1
ab fill "#p-qty" "800" >/dev/null 2>&1

echo "=== 3. District via combobox ref ==="
SNAP=$(ab snapshot -i)
COMBO=$(echo "$SNAP" | rg -o 'combobox "[^"]*" \[ref=([a-z0-9]+)\]' -r '$1' | tail -1)
echo "combobox: $COMBO"
if [ -n "$COMBO" ]; then ab click "$COMBO" >/dev/null; sleep 1.2; fi
SNAP=$(ab snapshot -i)
KAMPREF=$(refor "$SNAP" 'option "Kampala"')
echo "kampala: $KAMPREF"
if [ -z "$KAMPREF" ]; then echo "$SNAP" | rg -i 'option|kampala' | head -6; fi
[ -n "$KAMPREF" ] && ab click "$KAMPREF" >/dev/null; sleep 1
ab fill "#p-area" "Nakasero" >/dev/null 2>&1
sleep 0.5
SNAP=$(ab snapshot -i)
PUBREF=$(refor "$SNAP" 'button "Publish listing"')
echo "publish: $PUBREF"
[ -n "$PUBREF" ] && ab click "$PUBREF" >/dev/null; sleep 4.5
text 3000 > /tmp/v12-detail.txt
rg -o 'Sorghum grain, brewing grade|USh 25,000 / bunch|Okello Grains Enterprises|View shop|Nakasero, Kampala|Listing published' /tmp/v12-detail.txt | sort | uniq -c | head -8
ab screenshot /home/z/my-project/scripts/verify-new-listing.png >/dev/null 2>&1

echo "=== 4. NEW shop storefront ==="
SNAP=$(ab snapshot -i)
SHOPREF=$(echo "$SNAP" | rg -o 'button "Visit this seller.s shop" \[ref=([a-z0-9]+)\]' -r '$1' | head -1)
echo "shopref: $SHOPREF"
[ -n "$SHOPREF" ] && ab click "$SHOPREF" >/dev/null; sleep 2.5
text 2200 | rg -o 'Okello Grains Enterprises|In this shop[^
]*|USh 25,000|WhatsApp the shop|Kampala, Uganda|On Duuka since [A-Za-z]+ [0-9]+' | sort | uniq -c | head -8
ab screenshot /home/z/my-project/scripts/verify-new-shop.png >/dev/null 2>&1

echo "=== 5. Mobile 375 final screenshot ==="
ab set viewport 375 720 >/dev/null 2>&1
ab open "http://localhost:3000/#/browse" >/dev/null; sleep 2.5
ab screenshot /home/z/my-project/scripts/verify-mobile-375.png >/dev/null 2>&1
echo "=== DONE ==="

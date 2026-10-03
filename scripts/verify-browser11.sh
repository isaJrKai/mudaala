#!/usr/bin/env bash
# Duuka — round 11: one-pass golden path with tolerant ref patterns.
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
refor() { echo "$1" | rg -o "$2" -r '$1' | head -1; }

echo "=== 2. One-pass golden path ==="
ab open "http://localhost:3000/#/publish" >/dev/null; sleep 3.5
ab fill "#p-shop" "Okello Grains Enterprises" >/dev/null 2>&1
ab fill "#p-title" "Sorghum grain, brewing grade" >/dev/null 2>&1
ab fill "#p-desc" "Dry sorghum from Lira, cleaned and graded for local brewers. Bring your bags or buy ours." >/dev/null 2>&1

SNAP=$(ab snapshot -i)
echo "--- how Farm Produce appears ---"
echo "$SNAP" | rg 'Farm Produce' | head -3
CATREF=$(refor "$SNAP" 'radio "Farm Produce[^"]*" \[[^]]*ref=([a-z0-9]+)\]')
echo "category: $CATREF"
[ -n "$CATREF" ] && ab click "$CATREF" >/dev/null; sleep 0.8
# Verify the selection took; retry via ref, then via JS dispatch.
SNAP=$(ab snapshot -i)
if ! echo "$SNAP" | rg -q 'radio "Farm Produce[^"]*" \[checked=true'; then
  echo "retry category click (ref)"
  CATREF=$(refor "$SNAP" 'radio "Farm Produce[^"]*" \[[^]]*ref=([a-z0-9]+)\]')
  [ -n "$CATREF" ] && ab click "$CATREF" >/dev/null; sleep 1
  SNAP=$(ab snapshot -i)
fi
if ! echo "$SNAP" | rg -q 'radio "Farm Produce[^"]*" \[checked=true'; then
  echo "retry category click (js)"
  ab eval "[...document.querySelectorAll('button[role=radio]')].find(b => b.textContent.includes('Farm Produce')).click(); 'js-clicked'" | tail -1
  sleep 1
  SNAP=$(ab snapshot -i)
fi
echo "$SNAP" | rg 'Farm Produce' | head -1

ab fill "#p-price" "25000" >/dev/null 2>&1
ab fill "#p-qty" "800" >/dev/null 2>&1

SNAP=$(ab snapshot -i)
COMBO=$(refor "$SNAP" 'combobox "District" \[[^]]*ref=([a-z0-9]+)\]')
echo "combobox: $COMBO"
[ -n "$COMBO" ] && ab click "$COMBO" >/dev/null; sleep 1.2
SNAP=$(ab snapshot -i)
KAMP=$(refor "$SNAP" 'option "Kampala" \[[^]]*ref=([a-z0-9]+)\]')
echo "kampala: $KAMP"
[ -n "$KAMP" ] && ab click "$KAMP" >/dev/null; sleep 1

# Unit is required whenever a price is set.
SNAP=$(ab snapshot -i)
UNITCOMBO=$(refor "$SNAP" 'combobox "Per" \[[^]]*ref=([a-z0-9]+)\]')
echo "unit combobox: $UNITCOMBO"
[ -n "$UNITCOMBO" ] && ab click "$UNITCOMBO" >/dev/null; sleep 1.2
SNAP=$(ab snapshot -i)
BUNCH=$(refor "$SNAP" 'option "per bunch" \[[^]]*ref=([a-z0-9]+)\]')
echo "per bunch: $BUNCH"
[ -n "$BUNCH" ] && ab click "$BUNCH" >/dev/null; sleep 1
echo "$SNAP" | rg 'combobox "(District|Per)"' | head -2
ab fill "#p-area" "Nakasero" >/dev/null 2>&1
sleep 0.5
SNAP=$(ab snapshot -i)
PUB=$(refor "$SNAP" 'button "Publish listing" \[[^]]*ref=([a-z0-9]+)\]')
echo "publish: $PUB"
if [ -z "$PUB" ]; then
  echo "--- publish button debug ---"
  echo "$SNAP" | rg -i 'publish' | head -4
  ab eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Publish listing').click(); 'submitted'" | tail -1
else
  ab click "$PUB" >/dev/null
fi
sleep 4.5
ab eval "document.body.innerText" 2>/dev/null | head -c 3400 > /tmp/v16.txt
echo "--- detail checks ---"
rg -o 'Sorghum grain, brewing grade|USh 25,000 / bunch|Okello Grains Enterprises|View shop|Nakasero, Kampala|Listing published|Title must be|Choose a category|Choose your district' /tmp/v16.txt | sort | uniq -c | head -10
ab screenshot /home/z/my-project/scripts/verify-new-listing.png >/dev/null 2>&1

echo "=== 3. Storefront of the NEW shop ==="
SNAP=$(ab snapshot -i)
SHOPREF=$(refor "$SNAP" 'button "Visit this seller.s shop" \[[^]]*ref=([a-z0-9]+)\]')
echo "shopref: $SHOPREF"
[ -n "$SHOPREF" ] && ab click "$SHOPREF" >/dev/null; sleep 2.5
ab eval "document.body.innerText" 2>/dev/null | head -c 2600 > /tmp/v17.txt
rg -o 'Okello Grains Enterprises|In this shop[^
]*|USh 25,000|WhatsApp the shop|Kampala, Uganda|On Duuka since [A-Za-z]+ [0-9]+' /tmp/v17.txt | sort | uniq -c | head -8
ab screenshot /home/z/my-project/scripts/verify-new-shop.png >/dev/null 2>&1

echo "=== 4. Mobile 375 screenshot ==="
ab set viewport 375 720 >/dev/null 2>&1
ab open "http://localhost:3000/#/browse" >/dev/null; sleep 2.5
ab screenshot /home/z/my-project/scripts/verify-mobile-375.png >/dev/null 2>&1
echo "=== DONE ==="

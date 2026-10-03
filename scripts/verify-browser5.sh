#!/usr/bin/env bash
# Duuka - round 5: clean session, register new UG seller, name shop, publish.
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
text() { ab eval "document.body.innerText" | head -c "${2:-1600}"; echo; }

echo "=== 2. Force signed-out state ==="
ab open http://localhost:3000 >/dev/null; sleep 3
ab eval "window.localStorage.removeItem('cos_session_token'); 'cleared'" | tail -1
ab reload >/dev/null; sleep 3
text 700 | rg -o 'Sign in' | head -1

echo "=== 3. Register brand-new Ugandan user (UI) ==="
ab find text "Sign in" click >/dev/null 2>&1; sleep 2
SNAP=$(ab snapshot -i)
REGTAB=$(echo "$SNAP" | rg -o 'tab "Create account" \[ref=([a-z0-9]+)\]' -r '$1' | head -1)
echo "register tab: $REGTAB"
[ -n "$REGTAB" ] && ab click "$REGTAB" >/dev/null; sleep 1.5
ab fill "reg-name" "Okello Grains" >/dev/null 2>&1
ab fill "reg-phone" "0781234567" >/dev/null 2>&1
sleep 1.2
echo "country hint: $(text 2400 | rg -o 'Uganda - your prices will show in USh' | head -1)"
ab fill "reg-password" "password123" >/dev/null 2>&1
SNAP=$(ab snapshot -i)
SUBREF=$(echo "$SNAP" | rg -o 'button "Create account" \[ref=([a-z0-9]+)\]' -r '$1' | tail -1)
echo "submit: $SUBREF"
[ -n "$SUBREF" ] && ab click "$SUBREF" >/dev/null; sleep 3.5
text 700 | rg -o 'welcome, Okello Grains|Okello Gr' | head -2

echo "=== 4. Publish with shop naming ==="
ab open "http://localhost:3000/#/publish" >/dev/null; sleep 3
text 2200 | rg -o 'Name your shop|Same account, same sign-in|Price \(USh\)|Whole shillings' | sort | uniq -c | head -6
ab fill "p-shop" "Okello Grains Enterprises" >/dev/null 2>&1
ab fill "p-title" "Sorghum grain, brewing grade" >/dev/null 2>&1
ab fill "p-desc" "Dry sorghum from Lira, cleaned and graded for local brewers. Bring your bags or buy ours." >/dev/null 2>&1
ab find text "Farm Produce" click >/dev/null 2>&1; sleep 1
ab fill "p-price" "25000" >/dev/null 2>&1
ab fill "p-qty" "800" >/dev/null 2>&1
ab find text "Choose district" click >/dev/null 2>&1; sleep 1.2
SNAP=$(ab snapshot -i)
KAMPREF=$(echo "$SNAP" | rg -o 'option "Kampala" \[ref=([a-z0-9]+)\]' -r '$1' | head -1)
echo "kampala: $KAMPREF"
[ -n "$KAMPREF" ] && ab click "$KAMPREF" >/dev/null; sleep 1
ab fill "p-area" "Nakasero" >/dev/null 2>&1
sleep 0.5
SNAP=$(ab snapshot -i)
PUBREF=$(echo "$SNAP" | rg -o 'button "Publish listing" \[ref=([a-z0-9]+)\]' -r '$1' | head -1)
echo "publish: $PUBREF"
[ -n "$PUBREF" ] && ab click "$PUBREF" >/dev/null; sleep 4
text 2600 > /tmp/v9-newdetail.txt
rg -o 'Sorghum grain, brewing grade|USh 25,000|Okello Grains Enterprises|View shop|Nakasero, Kampala|Listing published[^
]*' /tmp/v9-newdetail.txt | sort | uniq -c | head -8
ab screenshot /home/z/my-project/scripts/verify-new-listing.png >/dev/null 2>&1

echo "=== 5. The NEW shop storefront ==="
SNAP=$(ab snapshot -i)
SHOPREF=$(echo "$SNAP" | rg -o 'button "Visit this seller.s shop" \[ref=([a-z0-9]+)\]' -r '$1' | head -1)
echo "shop ref: $SHOPREF"
[ -n "$SHOPREF" ] && ab click "$SHOPREF" >/dev/null; sleep 2.5
text 1800 | rg -o 'Okello Grains Enterprises|In this shop[^
]*|USh 25,000|WhatsApp the shop|Kampala, Uganda|On Duuka since [A-Za-z]+ [0-9]+' | sort | uniq -c | head -8
ab screenshot /home/z/my-project/scripts/verify-new-shop.png >/dev/null 2>&1

echo "=== 6. Mobile 375px ==="
ab set viewport 375 720 >/dev/null 2>&1
ab open "http://localhost:3000/#/browse" >/dev/null; sleep 2.5
text 900 | rg -o 'Duuka|USh [0-9,]+ / [a-z]+' | sort | uniq -c | head -6
ab screenshot /home/z/my-project/scripts/verify-mobile-375.png >/dev/null 2>&1

echo "=== DONE ==="

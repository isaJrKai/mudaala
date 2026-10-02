#!/usr/bin/env bash
# Duuka — browser verification round 3: real UI sign-in via demo fixtures.
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
text() { ab eval "document.body.innerText" | head -c "${2:-1500}"; echo; }

echo "=== 2. Sign in as Nakato via UI (real flow) ==="
ab open http://localhost:3000 >/dev/null; sleep 3
ab find text "Sign in" click >/dev/null 2>&1; sleep 2
SNAP=$(ab snapshot -i)
SIGNIN_REF=$(echo "$SNAP" | rg -o 'button "Sign in" \[ref=([a-z0-9]+)\]' -r '$1' | head -1)
DEMO_REF=$(echo "$SNAP" | rg -o 'button "Nakato Fresh Produce \(Uganda\)" \[ref=([a-z0-9]+)\]' -r '$1' | head -1)
echo "dialog refs: signin=$SIGNIN_REF demo=$DEMO_REF"
[ -n "$DEMO_REF" ] && ab click "$DEMO_REF" >/dev/null && sleep 1
[ -n "$SIGNIN_REF" ] && ab click "$SIGNIN_REF" >/dev/null && sleep 3
text 800 | rg -o 'Signed in as [^
]*|Nakato Fresh Produce' | head -2
echo "token: $(ab eval "window.localStorage.getItem('cos_session_token')" | tail -c 14)"

echo "=== 3. Publish form (existing UG seller) ==="
ab open "http://localhost:3000/#/publish" >/dev/null; sleep 3
text 2600 | rg -o 'Publishing as Nakato Fresh Produce|Currency|USh Uganda|TSh Tanzania|KSh Kenya|Price \(USh\)|Whole shillings|District|Choose district|Quantity available|Contact phone' | sort | uniq -c | head -12
ab screenshot /home/z/my-project/scripts/verify-publish-ug.png >/dev/null 2>&1

echo "=== 4. Account view (Money + My shop) ==="
ab open "http://localhost:3000/#/account" >/dev/null; sleep 3
text 2600 | rg -o 'Money|My shop|Shop name|View my shop|USh Uganda|TSh Tanzania|KSh Kenya|Nakato Fresh Produce|Uganda|New listings you publish default' | sort | uniq -c | head -12
ab screenshot /home/z/my-project/scripts/verify-account-ug.png >/dev/null 2>&1

echo "=== 5. Filters dialog country chips ==="
ab open "http://localhost:3000/#/browse" >/dev/null; sleep 2
ab find text "Filters" click >/dev/null 2>&1; sleep 1.5
text 2200 | rg -o 'Country|Uganda|Tanzania|Kenya|All East Africa|District|All districts|Min price \(USh\)|Max price \(USh\)' | sort | uniq -c | head -12

echo "=== 6. Register NEW user via UI and name shop in publish ==="
ab find text "All East Africa" click >/dev/null 2>&1; sleep 1
ab find text "Filters" click >/dev/null 2>&1; sleep 1
ab find text "Sign out" click >/dev/null 2>&1; sleep 2
SNAP=$(ab snapshot -i)
SIREF=$(echo "$SNAP" | rg -o 'button "Sign in" \[ref=([a-z0-9]+)\]' -r '$1' | head -1)
[ -n "$SIREF" ] && ab click "$SIREF" >/dev/null; sleep 1.5
SNAP=$(ab snapshot -i)
REGREF=$(echo "$SNAP" | rg -o 'tab "Create account" \[ref=([a-z0-9]+)\]' -r '$1' | head -1)
[ -n "$REGREF" ] && ab click "$REGREF" >/dev/null; sleep 1.5
# fill registration: country should default Uganda; type phone + name + password
ab find text "Create account" click >/dev/null 2>&1
ab fill "reg-name" "Okello Grains" >/dev/null 2>&1
ab fill "reg-phone" "0781234567" >/dev/null 2>&1
ab fill "reg-password" "password123" >/dev/null 2>&1
text 1400 | rg -o 'Uganda — your prices will show in USh|Country|Phone number' | head -4
ab find text "Create account" click >/dev/null 2>&1; sleep 3
text 900 | rg -o 'Account created[^
]*|welcome, Okello Grains|Okello Grains' | head -3

ab open "http://localhost:3000/#/publish" >/dev/null; sleep 3
text 2400 | rg -o 'Name your shop|Okello Grains Enterprises|Same account, same sign-in|Price \(USh\)|Whole shillings|District|Choose district' | sort | uniq -c | head -10
ab screenshot /home/z/my-project/scripts/verify-publish-newshop.png >/dev/null 2>&1

echo "=== 7. dev.log compile errors ==="
rg -c 'Module not found|Failed to compile' dev.log || echo "none"
echo "=== DONE ==="

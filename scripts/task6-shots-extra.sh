#!/bin/bash
# TASK 6 - extra shots: signed-in home (fixture account) + browse re-check.
set -euo pipefail
BASE="http://localhost:3000"
OUT="/home/z/my-project/download/task6-screens/after"

agent-browser set viewport 390 844 >/dev/null
agent-browser open "$BASE/#/home" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1 || true
agent-browser find text "Sign in" click >/dev/null || agent-browser find role button click --name "Sign in" >/dev/null
agent-browser wait 800 >/dev/null
agent-browser snapshot -i >/dev/null
# Fill the sign-in form (fixture dev account)
agent-browser find label "Phone number" fill "0772123456" >/dev/null 2>&1 || agent-browser find first "input[type=tel]" fill "0772123456" >/dev/null
agent-browser find first "input[type=password]" fill "demo1234" >/dev/null
agent-browser find role button click --name "Sign in" >/dev/null || true
agent-browser wait --load networkidle >/dev/null 2>&1 || true
agent-browser wait 1500 >/dev/null
agent-browser screenshot "$OUT/home-signedin-mobile.png" >/dev/null
echo "shot home-signedin-mobile"

agent-browser set viewport 1440 900 >/dev/null
agent-browser wait 1200 >/dev/null
agent-browser screenshot "$OUT/home-signedin-desktop.png" >/dev/null
echo "shot home-signedin-desktop"

# browse re-check after overlay fix
agent-browser set viewport 390 844 >/dev/null
agent-browser open "$BASE/#/browse" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1 || true
agent-browser wait 1200 >/dev/null
agent-browser screenshot "$OUT/browse-mobile.png" >/dev/null
echo "re-shot browse-mobile"

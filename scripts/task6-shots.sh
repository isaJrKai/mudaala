#!/bin/bash
# TASK 6 - screenshot harness: home, browse, listing, shop at 390px + desktop.
# Usage: task6-shots.sh before|after
set -euo pipefail

MODE="${1:?usage: task6-shots.sh before|after}"
BASE="http://localhost:3000"
OUT="/home/z/my-project/download/task6-screens/$MODE"
LISTING_ID="cmus47hq3000ppsn6borndf8x"   # seed matooke ad (Nakato Fresh Produce)
SHOP_ID="cmus47hjq0000psn6d6gmixvg"      # Nakato Fresh Produce

mkdir -p "$OUT"

shoot() { # $1 name, $2 url, $3 w, $4 h
  agent-browser set viewport "$3" "$4" >/dev/null
  agent-browser open "$2" >/dev/null
  agent-browser wait --load networkidle >/dev/null 2>&1 || true
  agent-browser wait 1200 >/dev/null
  agent-browser screenshot "$OUT/$1.png" >/dev/null
  echo "shot $1 ($3x$4)"
}

# ---- mobile 390 ----
shoot "browse-mobile"      "$BASE/#/browse"            390 844
shoot "listing-mobile"     "$BASE/#/listing/$LISTING_ID" 390 844
shoot "shop-mobile"        "$BASE/#/shop/$SHOP_ID"     390 844
shoot "adpage-mobile"      "$BASE/l/$LISTING_ID"       390 844

# signed-out home (welcome) + signed-in dashboard via fixture account
shoot "home-mobile"        "$BASE/#/home"              390 844

# ---- desktop 1440x900 ----
shoot "browse-desktop"     "$BASE/#/browse"            1440 900
shoot "listing-desktop"    "$BASE/#/listing/$LISTING_ID" 1440 900
shoot "shop-desktop"       "$BASE/#/shop/$SHOP_ID"     1440 900
shoot "home-desktop"       "$BASE/#/home"              1440 900

echo "done -> $OUT"

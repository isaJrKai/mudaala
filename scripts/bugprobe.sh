#!/bin/bash
# Bug-probe harness: boots the app (if not already listening), waits for readiness,
# then runs everything passed as arguments (so it can wrap arbitrary probe scripts).
# Usage: bugprobe.sh <command-to-run-while-server-up...>
cd /home/z/my-project
export DATABASE_URL="postgresql://mudaala@127.0.0.1:5433/mudaala"

port_open() { curl -s -o /dev/null --max-time 2 http://localhost:3000/api/health && return 0 || return 1; }

need_boot=1
if port_open; then
  # Canonical boot tees to dev.log (suite reads SMS codes from it). If the
  # running server isn't the canonical one, restart it properly.
  if [ -f dev.log ] && tail -W -n 1 dev.log 2>/dev/null | grep -q .; then
    echo "[harness] server already up (canonical, dev.log live)"
    need_boot=0
  else
    echo "[harness] non-canonical server squatting :3000 — restarting with tee dev.log"
    pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 3
  fi
fi
if [ "$need_boot" = 1 ]; then
  echo "[harness] booting server (tee dev.log)..."
  setsid bash -c 'cd /home/z/my-project && DATABASE_URL="postgresql://mudaala@127.0.0.1:5433/mudaala" exec npx next dev -p 3000 2>&1 | tee dev.log' > /dev/null 2>&1 &
  for i in $(seq 1 90); do
    sleep 2
    if port_open; then echo "[harness] ready after ~$((i*2))s"; break; fi
  done
  port_open || { echo "[harness] SERVER FAILED TO BOOT"; tail -20 dev.log 2>/dev/null || tail -20 /tmp/devserver.log; exit 2; }
fi

"$@"
rc=$?
echo "[harness] wrapped command rc=$rc"
exit $rc

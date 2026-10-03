#!/bin/bash

set -euo pipefail

# 获取脚本所在目录（.zscripts）
# 使用 $0 获取脚本路径（与 build.sh 保持一致）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

log_step_start() {
	local step_name="$1"
	echo "=========================================="
	echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting: $step_name"
	echo "=========================================="
	export STEP_START_TIME
	STEP_START_TIME=$(date +%s)
}

log_step_end() {
	local step_name="${1:-Unknown step}"
	local end_time
	end_time=$(date +%s)
	duration=$((end_time - STEP_START_TIME))
	echo "=========================================="
	echo "[$(date '+%Y-%m-%d %H:%M:%S')] Completed: $step_name"
	echo "[LOG] Step: $step_name | Duration: ${duration}s"
	echo "=========================================="
	echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Mudaala preview runtime (Task 5 and later): the schema is PostgreSQL, but the
# platform rewrites .env at every boot with the SQLite sandbox URL
# (DATABASE_URL=file:...). dev.sh is therefore the single source of truth for
# the sandbox runtime: it boots a user-space PostgreSQL (.pgtool, no root
# needed) and exports the environment the app actually expects. Production
# never runs this script — production is systemd + a real Postgres
# (docs/deploy-cloudflare.md).
# ─────────────────────────────────────────────────────────────────────────────
export DATABASE_URL="${DATABASE_URL_OVERRIDE:-postgresql://postgres:postgres@localhost:5432/mudaala}"
export AUTH_BEARER_FALLBACK="1"
export CRON_SECRET="${CRON_SECRET:-dev-cron-secret}"
export SETTINGS_ENC_KEY="${SETTINGS_ENC_KEY:-dev-settings-enc-key}"
export ADMIN_PHONES="${ADMIN_PHONES:-+256712000001}"
export CSRF_TRUSTED_HOSTS="${CSRF_TRUSTED_HOSTS:-.space-z.ai,.preview-platform.example}"
# The 4GB sandbox OOM-killed next-server twice during hardening round 2
# (worklog: hardening-round-2). Cap the heap before it happens again.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

PG_TOOL_DIR="$PROJECT_DIR/.pgtool"

pg_port_open() {
	(exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && return 0 || return 1
}

start_postgres() {
	log_step_start "PostgreSQL (embedded, user-space)"
	if pg_port_open; then
		echo "[DEV] PostgreSQL already listening on 5432 — reusing it."
		log_step_end "PostgreSQL (already up)"
		return 0
	fi
	if [ ! -d "$PG_TOOL_DIR/node_modules" ]; then
		echo "[DEV] Installing embedded-postgres binaries..."
		mkdir -p "$PG_TOOL_DIR"
		(
			cd "$PG_TOOL_DIR"
			[ -f package.json ] || npm init -y >/dev/null 2>&1
			npm i embedded-postgres --no-audit --no-fund >/dev/null 2>&1
		) || true
	fi
	echo "[DEV] Starting PostgreSQL..."
	nohup node "$PG_TOOL_DIR/start-pg.js" >"$PG_TOOL_DIR/pg.log" 2>&1 </dev/null &
	for _ in $(seq 1 60); do
		if pg_port_open; then
			echo "[DEV] PostgreSQL is up on 5432."
			log_step_end "PostgreSQL (embedded)"
			return 0
		fi
		sleep 1
	done
	echo "[DEV] ERROR: PostgreSQL did not come up — see $PG_TOOL_DIR/pg.log"
	return 1
}

start_mini_services() {
	local mini_services_dir="$PROJECT_DIR/mini-services"
	local started_count=0

	log_step_start "Starting mini-services"
	if [ ! -d "$mini_services_dir" ]; then
		echo "Mini-services directory not found, skipping..."
		log_step_end "Starting mini-services"
		return 0
	fi

	echo "Found mini-services directory, scanning for sub-services..."

	for service_dir in "$mini_services_dir"/*; do
		if [ ! -d "$service_dir" ]; then
			continue
		fi

		local service_name
		service_name=$(basename "$service_dir")
		echo "Checking service: $service_name"

		if [ ! -f "$service_dir/package.json" ]; then
			echo "[$service_name] No package.json found, skipping..."
			continue
		fi

		if ! grep -q '"dev"' "$service_dir/package.json"; then
			echo "[$service_name] No dev script found, skipping..."
			continue
		fi

		echo "Starting $service_name in background..."
		(
			cd "$service_dir"
			echo "[$service_name] Installing dependencies..."
			bun install
			echo "[$service_name] Running bun run dev..."
			exec bun run dev
		) >"$PROJECT_DIR/.zscripts/mini-service-${service_name}.log" 2>&1 &

		local service_pid=$!
		echo "[$service_name] Started in background (PID: $service_pid)"
		echo "[$service_name] Log: $PROJECT_DIR/.zscripts/mini-service-${service_name}.log"
		disown "$service_pid" 2>/dev/null || true
		started_count=$((started_count + 1))
	done

	echo "Mini-services startup completed. Started $started_count service(s)."
	log_step_end "Starting mini-services"
}

wait_for_service() {
	local host="$1"
	local port="$2"
	local service_name="$3"
	local max_attempts="${4:-60}"
	local attempt=1

	echo "Waiting for $service_name to be ready on $host:$port..."

	while [ "$attempt" -le "$max_attempts" ]; do
		if curl -s --connect-timeout 2 --max-time 5 "http://$host:$port" >/dev/null 2>&1; then
			echo "$service_name is ready!"
			return 0
		fi

		echo "Attempt $attempt/$max_attempts: $service_name not ready yet, waiting..."
		sleep 1
		attempt=$((attempt + 1))
	done

	echo "ERROR: $service_name failed to start within $max_attempts seconds"
	return 1
}

cleanup() {
	if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" >/dev/null 2>&1; then
		echo "Stopping Next.js dev server (PID: $DEV_PID)..."
		kill "$DEV_PID" >/dev/null 2>&1 || true
	fi
}

trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"

if ! command -v bun >/dev/null 2>&1; then
	echo "ERROR: bun is not installed or not in PATH"
	exit 1
fi

start_postgres

log_step_start "bun install"
echo "[BUN] Installing dependencies..."
bun install
log_step_end "bun install"

log_step_start "bun run db:push"
echo "[BUN] Setting up database (Prisma schema -> PostgreSQL)..."
bun run db:push
log_step_end "bun run db:push"

log_step_start "Seed check"
# Seed only a truly empty database (idempotent across restarts).
USER_COUNT=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
process.stdout.write(String(await db.user.count()));
await db.\$disconnect();
" 2>/dev/null | tail -c 8 || true)
if [ "${USER_COUNT:-0}" = "0" ]; then
	echo "[DEV] Empty database - seeding development fixtures..."
	bun scripts/seed.ts || echo "[DEV] seed failed (continuing - the app still boots)"
else
	echo "[DEV] Database already has users (${USER_COUNT:-?}) - skipping seed"
fi
log_step_end "Seed check"

log_step_start "Starting Next.js dev server"
echo "[BUN] Starting development server..."
bun run dev &
DEV_PID=$!
log_step_end "Starting Next.js dev server"

log_step_start "Waiting for Next.js dev server"
wait_for_service "localhost" "3000" "Next.js dev server"
log_step_end "Waiting for Next.js dev server"

log_step_start "Health check"
echo "[BUN] Performing health check..."
curl -fsS localhost:3000 >/dev/null
echo "[BUN] Health check passed"
log_step_end "Health check"

start_mini_services

echo "Next.js dev server is running in background (PID: $DEV_PID)."
echo "Use 'kill $DEV_PID' to stop it."
disown "$DEV_PID" 2>/dev/null || true
unset DEV_PID

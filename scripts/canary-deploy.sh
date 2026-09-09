#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# استقرارِ مرحله‌ایِ پایش — Blue-Green و Canary
# سند: docs/CANARY_DEPLOYMENT.md
#   sudo bash scripts/canary-deploy.sh [--yes] [--cutover]
#   DRY_RUN=1 bash scripts/canary-deploy.sh --cutover   (تمرین: صفر اثر)
#
# قراردادها: set -euo pipefail؛ هر تغییرِ nginx با «nginx -t» گیت می‌شود؛
# هر گیتِ قرمز = abort خودکار به Blue؛ هیچ migrate:down خودکاری نیست؛
# smoke کاملاً read-only است (GET /api/health + GET /).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

BLUE_PORT="${BLUE_PORT:-3001}"
GREEN_PORT="${GREEN_PORT:-3002}"
BLUE_UNIT="${BLUE_UNIT:-payesh-blue}"
GREEN_UNIT="${GREEN_UNIT:-payesh-green}"
GREEN_DIR="${GREEN_DIR:-/home/payesh/p2-green}"
JSON_STORE="${JSON_STORE:-/home/payesh/data/payesh.json}"
BACKUP_DIR="${BACKUP_DIR:-/home/payesh/backups}"
GREEN_COPY="${GREEN_COPY:-/home/payesh/p2-green/smoke-store.json}"
GREEN_ENV_ACTIVE="${GREEN_ENV_ACTIVE:-/home/payesh/p2-green/.env.active}"
GREEN_ENV_SMOKE="${GREEN_ENV_SMOKE:-/home/payesh/p2-green/.env.smoke}"
GREEN_ENV_LIVE="${GREEN_ENV_LIVE:-/home/payesh/p2-green/.env.live}"
NGINX_SPLIT_CONF="${NGINX_SPLIT_CONF:-/etc/nginx/payesh-split.conf}"
NGINX_LOG="${NGINX_LOG:-/var/log/nginx/payesh-access.log}"
PUBLIC_URL="${PUBLIC_URL:-https://payesh.example}"
MONITOR_SECS="${MONITOR_SECS:-300}"
MIN_REQUESTS="${MIN_REQUESTS:-10}"
CANARY_STORE="${CANARY_STORE:-json}"
DRY_RUN="${DRY_RUN:-0}"
YES=0
CUTOVER=0

usage(){
  sed -n '2,9p' "$0"
  echo "env: CANARY_STORE=json|pg (default json)  MONITOR_SECS  MIN_REQUESTS  DRY_RUN=1"
  echo "  staged canary (1/10/50/100) requires CANARY_STORE=pg (shared JSON is single-writer)"
  echo "  --cutover works for both stores (JSON-safe blue-green)"
}

for a in "$@"; do
  case "$a" in
    --yes) YES=1 ;;
    --cutover) CUTOVER=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $a"; usage; exit 1 ;;
  esac
done

log(){ echo "▶ $*"; }
die(){ echo "❌ $*" >&2; exit 1; }
run(){ if [ "$DRY_RUN" = 1 ]; then echo "DRY-RUN: + $*"; else "$@"; fi; }
confirm(){
  if [ "$YES" = 1 ] || [ "$DRY_RUN" = 1 ]; then echo "DRY/auto-continue: $*"; return 0; fi
  read -r -p "$* [y/N] " ans
  [ "$ans" = y ] || [ "$ans" = Y ] || die "aborted by operator"
}

preflight(){
  local missing=0
  for t in nginx systemctl curl git node; do
    command -v "$t" >/dev/null 2>&1 || { echo "⚠️  missing tool: $t"; missing=1; }
  done
  [ -d "$GREEN_DIR" ] || { echo "⚠️  missing dir: $GREEN_DIR"; missing=1; }
  if [ "$missing" = 1 ] && [ "$DRY_RUN" != 1 ]; then die "preflight failed (see above)"; fi
  [ "$missing" = 1 ] && echo "DRY-RUN: continuing despite preflight warnings"
  if [ "$CANARY_STORE" != "pg" ] && [ "$CUTOVER" != 1 ]; then
    die "staged canary needs CANARY_STORE=pg (C1: shared JSON is single-writer) — use --cutover for JSON"
  fi
  if [ "$CANARY_STORE" = "pg" ] && [ -z "${DATABASE_URL:-}" ]; then
    die "CANARY_STORE=pg but DATABASE_URL is not set"
  fi
}

health(){
  # reads are real even in DRY_RUN (safe); returns 0 iff 200 + ok:true
  curl -fsS --max-time 10 "http://127.0.0.1:$1/api/health" 2>/dev/null | grep -q '"ok":true'
}
wait_healthy(){
  local port="$1" waited=0
  while [ "$waited" -lt 60 ]; do
    health "$port" && { echo "healthy: :$port"; return 0; }
    sleep 3; waited=$((waited + 3))
  done
  return 1
}
smoke(){
  local port="$1" label="$2"
  log "smoke (read-only): $label"
  if [ "$DRY_RUN" = 1 ]; then echo "DRY-RUN: + curl :$port/api/health + :$port/ (expects 200)"; return 0; fi
  health "$port" || die "smoke FAIL: $label /api/health"
  curl -fsS --max-time 10 "http://127.0.0.1:${port}/" -o /dev/null || die "smoke FAIL: $label /"
  echo "smoke OK: $label"
}

set_split(){
  local pct="$1" tmp
  tmp="$(mktemp)"
  {
    echo "upstream payesh_blue  { server 127.0.0.1:${BLUE_PORT} max_fails=2 fail_timeout=10s; }"
    echo "upstream payesh_green { server 127.0.0.1:${GREEN_PORT} max_fails=2 fail_timeout=10s; }"
    echo 'split_clients $remote_addr $payesh_backend {'
    if [ "$pct" -le 0 ]; then echo "  * payesh_blue;"
    elif [ "$pct" -ge 100 ]; then echo "  * payesh_green;"
    else echo "  ${pct}% payesh_green;"; echo "  * payesh_blue;"; fi
    echo "}"
  } > "$tmp"
  if [ "$DRY_RUN" = 1 ]; then
    echo "DRY-RUN: would write $NGINX_SPLIT_CONF:"; cat "$tmp"
    echo "DRY-RUN: + nginx -t && systemctl reload nginx"; rm -f "$tmp"; return 0
  fi
  cat "$tmp" > "$NGINX_SPLIT_CONF"; rm -f "$tmp"
  nginx -t && systemctl reload nginx   # reload only if config is valid
}

slo_gate(){
  # $1=stage $2=max_err_rate $3=max_p95_ms → 0 pass, 1 breach, 2 inconclusive
  local pct="$1" max_err="$2" max_p95="$3" lines0=0 lines1=0
  [ -f "$NGINX_LOG" ] && lines0="$(wc -l < "$NGINX_LOG")"
  if [ "$DRY_RUN" = 1 ]; then
    echo "DRY-RUN: monitor ${MONITOR_SECS}s @ ${pct}% then gate (err<${max_err}, p95<${max_p95}ms)"
  else
    log "monitoring ${MONITOR_SECS}s @ ${pct}% ..."
    sleep "$MONITOR_SECS"
  fi
  [ -f "$NGINX_LOG" ] || { echo "gate INCONCLUSIVE: no log $NGINX_LOG"; return 2; }
  lines1="$(wc -l < "$NGINX_LOG")"
  [ "$lines1" -lt "$lines0" ] && { echo "gate INCONCLUSIVE: log rotated mid-window"; return 2; }
  local sample total err p95
  sample="$(mktemp)"
  tail -n +"$((lines0 + 1))" "$NGINX_LOG" 2>/dev/null | grep -oE '" [0-9]{3} [0-9]+\.[0-9]+ "' > "$sample" || true
  total="$(wc -l < "$sample" | tr -d ' ')"
  if [ "${total:-0}" -lt "$MIN_REQUESTS" ]; then
    echo "gate INCONCLUSIVE: only $total requests (min $MIN_REQUESTS)"; rm -f "$sample"; return 2
  fi
  err="$(awk '$2 ~ /^5/' "$sample" | wc -l | tr -d ' ')"
  p95="$(awk '{print $3}' "$sample" | sort -n | awk -v n="$total" 'NR==int((n*95+99)/100){v=$1} END{print (v==""?0:v)}')"
  rm -f "$sample"
  echo "gate @ ${pct}%: total=$total 5xx=$err p95=${p95}s (budget err<$max_err p95<${max_p95}ms)"
  awk -v e="$err" -v t="$total" -v m="$max_err" 'BEGIN{exit !(t>0 && e/t < m)}' \
    || { echo "gate BREACH: error rate"; return 1; }
  awk -v p="$p95" -v m="$max_p95" 'BEGIN{exit !(p*1000 < m)}' \
    || { echo "gate BREACH: p95 latency"; return 1; }
  echo "gate PASS @ ${pct}%"
}

abort_to_blue(){
  echo "⛔ ABORT: $1 — rolling back to Blue"
  set_split 0
  run systemctl stop "$GREEN_UNIT" || true
  run systemctl start "$BLUE_UNIT" || true
  die "deploy aborted (traffic is 100% Blue)"
}

deploy_green(){
  log "deploying Green ($GREEN_DIR)"
  run git -C "$GREEN_DIR" pull --ff-only
  run node "$GREEN_DIR/build.js"
  if [ "$CANARY_STORE" = "pg" ]; then
    run npm run migrate:up --prefix "$GREEN_DIR"
  fi
}

snapshot(){
  local f="$BACKUP_DIR/pre-green-$(date +%Y%m%d-%H%M%S).json"
  # NOTE: trace lines go to stderr so $(snapshot) captures ONLY the path.
  if [ "$CANARY_STORE" = "pg" ]; then
    command -v pg_dump >/dev/null 2>&1 || die "pg snapshot needs pg_dump"
    if [ "$DRY_RUN" = 1 ]; then echo "DRY-RUN: + pg_dump \$DATABASE_URL -f '$f.sql'" >&2
    else pg_dump "$DATABASE_URL" -f "$f.sql"; fi
    echo "$f.sql"
  else
    [ -f "$JSON_STORE" ] || { [ "$DRY_RUN" = 1 ] && echo "DRY-RUN: JSON store not found here; prod would fail-closed" >&2; }
    [ -f "$JSON_STORE" ] || [ "$DRY_RUN" = 1 ] || die "JSON store not found: $JSON_STORE"
    if [ "$DRY_RUN" = 1 ]; then echo "DRY-RUN: + cp $JSON_STORE $f" >&2; else cp "$JSON_STORE" "$f"; fi
    echo "$f"
  fi
}

staged_canary(){
  # PG only (checked in preflight). Blue keeps serving throughout.
  deploy_green
  run systemctl restart "$GREEN_UNIT"
  wait_healthy "$GREEN_PORT" || abort_to_blue "green never became healthy"
  smoke "$GREEN_PORT" "green @0%"
  local stage gate_rc
  for stage in "1 0.001 200" "10 0.001 200" "50 0.005 300" "100 0.005 300"; do
    # shellcheck disable=SC2086
    set -- $stage
    confirm "advance Green to $1%?"
    set_split "$1"
    slo_gate "$1" "$2" "$3"; gate_rc=$?
    [ "$gate_rc" = 0 ] || abort_to_blue "SLO gate @ $1% (rc=$gate_rc)"
  done
  log "canary complete — stopping Blue (kept as fallback)"
  run systemctl stop "$BLUE_UNIT" || true
  log "public check:"; run curl -fsS "$PUBLIC_URL/api/health"
  echo "✅ Green is live @100%"
}

cutover(){
  local snap
  snap="$(snapshot)"
  log "snapshot: $snap"
  deploy_green
  if [ "$CANARY_STORE" = "pg" ]; then
    run systemctl restart "$GREEN_UNIT"
    wait_healthy "$GREEN_PORT" || abort_to_blue "green never became healthy"
    smoke "$GREEN_PORT" "green (live DB, read-only)"
    confirm "cutover: stop Blue, switch 100% to Green?"
    run systemctl stop "$BLUE_UNIT"
  else
    log "seeding Green with a COPY of the store (C1: never two writers)"
    run cp "$snap" "$GREEN_COPY"
    run ln -sfn "$GREEN_ENV_SMOKE" "$GREEN_ENV_ACTIVE"
    run systemctl restart "$GREEN_UNIT"
    wait_healthy "$GREEN_PORT" || abort_to_blue "green never became healthy (smoke env)"
    smoke "$GREEN_PORT" "green (store copy)"
    confirm "cutover: stop Blue, attach Green to REAL store, switch 100%?"
    run systemctl stop "$BLUE_UNIT"
    run ln -sfn "$GREEN_ENV_LIVE" "$GREEN_ENV_ACTIVE"
    run systemctl restart "$GREEN_UNIT"
    wait_healthy "$GREEN_PORT" || { run systemctl start "$BLUE_UNIT" || true; die "green unhealthy on real store — Blue restarted, nginx untouched (still Blue)"; }
    smoke "$GREEN_PORT" "green (real store)"
  fi
  set_split 100
  local gate_rc=0
  slo_gate 100 0.005 300 || gate_rc=$?
  [ "$gate_rc" = 0 ] || abort_to_blue "post-cutover SLO gate (rc=$gate_rc)"
  log "public check:"; run curl -fsS "$PUBLIC_URL/api/health"
  echo "✅ cutover complete — Blue stopped but kept as fallback"
}

preflight
if [ "$CUTOVER" = 1 ]; then cutover; else staged_canary; fi

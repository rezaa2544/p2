#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# failover-postgres.sh — ارتقایِ standby به primary + بازهدایتِ PgBouncer
# (DR §۱ از DR_RUNBOOK و RC-002 از RUNBOOK_CARDS/PG_PRIMARY_FAILOVER.md)
# ───────────────────────────────────────────────────────────────────
# گاردها (fail-closed):
#   ۱) split-brain: اگر standby خودش promote شده باشد ⇒ ابورت کامل
#   ۲) تأخیرِ replay بالاتر از آستانه ⇒ هشدارِ RPO و فقط با --force ادامه
#   ۳) عدم‌دسترسیِ primary تأییدِ چندباره (۳×۵s) قبلِ اقدام
# اقدام: SELECT pg_promote(wait=>true, wait_seconds=>60) رویِ standby؛
# سپس بازنویسیِ اتمیکِ pgbouncer.ini + RELOAD; + RECONNECT <db>; + تأییدِ
# SHOW DATABASES; (در هر دو حالتِ PGBOUNCER_INI محلی و COMPOSE_F کانتینری).
# مصرف:
#   tools/failover-postgres.sh [--live] [--dry-run] [--force] [--reroute-pgbouncer-only]
# خروجی: ۰ اقدام/آماده، ۱ گارد یا بازهدایت شکست خورد، ۲ پیش‌نیاز/آرگومان نامعتبر
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5433}" PGDATABASE="${PGDATABASE:-payesh}"
OLD_PGHOST="${OLD_PGHOST:-127.0.0.1}"; OLD_PGPORT="${OLD_PGPORT:-5432}"
MAX_LAG_BYTES="${MAX_LAG_BYTES:-67108864}" # 64MB ≈ پنجرهٔ RPO≤۵دقیقه در بارِ عادی
DRY=0; LIVE=0; FORCE=0; REROUTE_ONLY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1;;
    --live) LIVE=1;;
    --force) FORCE=1;;
    --reroute-pgbouncer-only) REROUTE_ONLY=1;;
    *) echo "ناشناخته: $a" >&2; exit 2;;
  esac
done
if [ "$DRY" = 1 ] && { [ "$LIVE" = 1 ] || [ "$REROUTE_ONLY" = 1 ]; }; then
  echo "FAIL: --dry-run با --live/--reroute-pgbouncer-only قابل ترکیب نیست" >&2
  exit 2
fi

validate_endpoint_tokens() {
  local host="$1" port="$2" db="$3"
  if [[ ! "$host" =~ ^[A-Za-z0-9_.-]{1,128}$ ]]; then
    echo "FAIL: host نامعتبر برای PgBouncer: $host" >&2
    exit 2
  fi
  if [[ ! "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    echo "FAIL: port نامعتبر برای PgBouncer: $port" >&2
    exit 2
  fi
  if [[ ! "$db" =~ ^[A-Za-z0-9_-]{1,63}$ ]]; then
    echo "FAIL: نام دیتابیسِ PgBouncer نامعتبر است: $db" >&2
    exit 2
  fi
}

reroute_pgbouncer() {
  local target_host="${PGBOUNCER_TARGET_HOST:-$PGHOST}"
  local target_port="${PGBOUNCER_TARGET_PORT:-$PGPORT}"
  local target_db="${PGBOUNCER_DB:-$PGDATABASE}"
  local admin_host="${PGBOUNCER_HOST:-127.0.0.1}"
  local admin_port="${PGBOUNCER_PORT:-6432}"
  local admin_user="${PGBOUNCER_ADMIN_USER:-pgbouncer}"
  local admin_pw="${PGBOUNCER_ADMIN_PASSWORD:-${PGPASSWORD:-}}"
  local service_name="${PGBOUNCER_SERVICE:-pgbouncer}"
  validate_endpoint_tokens "$target_host" "$target_port" "$target_db"

  if [ -n "${PGBOUNCER_INI:-}" ]; then
    command -v psql >/dev/null 2>&1 || { echo "FAIL: psql برای بازهدایتِ PgBouncer نیست" >&2; exit 2; }
    [ -f "$PGBOUNCER_INI" ] || { echo "FAIL: فایلِ PGBOUNCER_INI یافت نشد: $PGBOUNCER_INI" >&2; exit 1; }
    if ! grep -Eq "^${target_db}[[:space:]]*=" "$PGBOUNCER_INI"; then
      echo "FAIL: ورودیِ ${target_db} در $PGBOUNCER_INI یافت نشد" >&2
      exit 1
    fi
    umask 0077
    sed "s|^${target_db}[[:space:]]*=.*|${target_db}        = host=${target_host} port=${target_port} dbname=${target_db}|" \
      "$PGBOUNCER_INI" > "${PGBOUNCER_INI}.next"
    chmod 0600 "${PGBOUNCER_INI}.next"
    mv -f "${PGBOUNCER_INI}.next" "$PGBOUNCER_INI"
    PGPASSWORD="$admin_pw" psql -h "$admin_host" -p "$admin_port" -U "$admin_user" -d pgbouncer \
      -v ON_ERROR_STOP=1 -XAt -c "RELOAD;" >/dev/null
    PGPASSWORD="$admin_pw" psql -h "$admin_host" -p "$admin_port" -U "$admin_user" -d pgbouncer \
      -v ON_ERROR_STOP=1 -XAt -c "RECONNECT ${target_db};" >/dev/null
    if ! PGPASSWORD="$admin_pw" psql -h "$admin_host" -p "$admin_port" -U "$admin_user" -d pgbouncer \
      -v ON_ERROR_STOP=1 -XAt -c "SHOW DATABASES;" | grep -Eq "^${target_db}\|${target_host}\|${target_port}\|"; then
      echo "FAIL: SHOW DATABASES مسیرِ ${target_db}->${target_host}:${target_port} را تأیید نکرد" >&2
      exit 1
    fi
    echo "PGBOUNCER_REROUTE_OK: ${target_db} -> ${target_host}:${target_port} (mode=ini)"
    return 0
  fi

  if [ -n "${COMPOSE_F:-}" ]; then
    command -v docker >/dev/null 2>&1 || { echo "FAIL: docker برای بازهدایتِ COMPOSE_F نیست" >&2; exit 2; }
    local -a compose_args=()
    [ -n "${COMPOSE_PROJECT:-}" ] && compose_args+=(-p "$COMPOSE_PROJECT")
    [ -n "${COMPOSE_ENV_FILE:-}" ] && compose_args+=(--env-file "$COMPOSE_ENV_FILE")
    compose_args+=(-f "$COMPOSE_F")
    docker compose "${compose_args[@]}" exec -T "$service_name" sh -ec '
      target_db="$1"; target_host="$2"; target_port="$3"; admin_user="$4"
      ini_path="/var/run/pgbouncer/pgbouncer.ini"
      [ -f "$ini_path" ] || { echo "FAIL: missing $ini_path" >&2; exit 1; }
      grep -Eq "^${target_db}[[:space:]]*=" "$ini_path" || { echo "FAIL: missing entry ${target_db} in $ini_path" >&2; exit 1; }
      umask 0077
      sed "s|^${target_db}[[:space:]]*=.*|${target_db}        = host=${target_host} port=${target_port} dbname=${target_db}|" \
        "$ini_path" > "${ini_path}.next"
      chmod 0600 "${ini_path}.next"
      mv -f "${ini_path}.next" "$ini_path"
      psql -h 127.0.0.1 -p 6432 -U "$admin_user" -d pgbouncer -v ON_ERROR_STOP=1 -XAt -c "RELOAD;" >/dev/null
      psql -h 127.0.0.1 -p 6432 -U "$admin_user" -d pgbouncer -v ON_ERROR_STOP=1 -XAt -c "RECONNECT ${target_db};" >/dev/null
      psql -h 127.0.0.1 -p 6432 -U "$admin_user" -d pgbouncer -v ON_ERROR_STOP=1 -XAt -c "SHOW DATABASES;" \
        | grep -Eq "^${target_db}\|${target_host}\|${target_port}\|"
    ' sh "$target_db" "$target_host" "$target_port" "$admin_user"
    echo "PGBOUNCER_REROUTE_OK: ${target_db} -> ${target_host}:${target_port} (mode=compose)"
    return 0
  fi

  if [ "$REROUTE_ONLY" = 1 ]; then
    echo "FAIL: برای --reroute-pgbouncer-only باید PGBOUNCER_INI یا COMPOSE_F تنظیم شود" >&2
    exit 2
  fi
}

if [ "$REROUTE_ONLY" = 1 ]; then
  reroute_pgbouncer
  exit 0
fi

command -v psql >/dev/null 2>&1 || { echo "FAIL: psql نیست" >&2; exit 2; }
sq(){ PGPASSWORD="${PGPASSWORD:-}" psql -h "$1" -p "$2" -U "${PGUSER:-postgres}" -d "$3" -tAXc "$4" 2>/dev/null || true; }

echo "== failover-postgres: standby=$PGHOST:$PGPORT primary=($OLD_PGHOST:$OLD_PGPORT) dry=$DRY live=$LIVE force=$FORCE"

# ۱) گاردِ split-brain
inrec="$(sq "$PGHOST" "$PGPORT" "$PGDATABASE" "SELECT pg_is_in_recovery()")"
if [ "$inrec" != "t" ]; then
  echo "FAIL: مقصدِ انتخابی در recovery نیست (یا از قبل primary است یا دسترس‌پذیر نیست) — برایِ امنیتِ داده ادامه نمی‌دهم" >&2; exit 1
fi

# ۲) تاییدِ مرگِ primary (۳ تلاش) — مگر --force
if [ "$FORCE" != 1 ]; then
  PRIMARY_REACHABLE=0
  for i in 1 2 3; do
    if pg_isready -h "$OLD_PGHOST" -p "$OLD_PGPORT" -t 2 >/dev/null 2>&1; then
      PRIMARY_REACHABLE=1
      echo "FAIL: primary responded to death probe ${i}/3" >&2
      break
    fi
    if [ "$i" -lt 3 ]; then sleep 5; fi
  done
  if [ "$PRIMARY_REACHABLE" = 1 ]; then
    echo "FAIL: primary همچنان پاسخ می‌دهد — failover بدونِ مرگِ primary یعنی ریسکِ split-brain؛ یا قطعیِ شبکه را رفع کن یا --force (با مسئولیتِ اپراتور، پس از fence کردنِ primaryِ کهنه)" >&2
    exit 1
  fi
fi

# ۳) lagِ replay روی standby (تقریبی، بدونِ primary بی‌معناست؛ چکِ محلی)
lag_note="(غیرقابل‌سنجش بدونِ primary)"
if [ "$FORCE" != 1 ]; then
  pending="$(sq "$PGHOST" "$PGPORT" "$PGDATABASE" "SELECT coalesce(pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()),0)::bigint")"
  if [ -n "$pending" ] && [ "$pending" -gt "$MAX_LAG_BYTES" ] 2>/dev/null; then
    echo "FAIL: ${pending}B در صفِ replay است (آستانه ${MAX_LAG_BYTES}B) — صبر کن تا replay کامل شود یا --force" >&2; exit 1
  fi
  [ -n "$pending" ] && lag_note="(unreplayed=${pending}B)"
fi

if [ "$DRY" = 1 ]; then echo "DRY-RUN: آمادهٔ promote — گاردها پاس شدند $lag_note"; exit 0; fi

echo "در حالِ promote ..."
sq "$PGHOST" "$PGPORT" "$PGDATABASE" "SELECT pg_promote(wait := true, wait_seconds := 60)" >/dev/null
inrec2="$(sq "$PGHOST" "$PGPORT" "$PGDATABASE" "SELECT pg_is_in_recovery()")"
if [ "$inrec2" != "f" ]; then echo "FAIL: promote انجام نشد (هنوز در recovery)" >&2; exit 1; fi

# ۴) PgBouncer: بازنویسیِ اتمیکِ ini + RELOAD + RECONNECT + تأییدِ SHOW DATABASES (fail-closed)
reroute_pgbouncer

echo "════════════════════════════════════════════"
echo "PROMOTE_OK: $PGHOST:$PGPORT حالا primary است $lag_note"
echo "چک‌لیستِ پس از اقدام (DR_RUNBOOK §۱.۳):"
echo "  ۱) DATABASE_URL برنامه را به endpoint تازه هم‌راستا کن/بازبینی کن"
echo "  ۲) primaryِ کهنه را fence کن تا هرگز دو primary نماند"
echo "  ۳) standbyِ جدید را از رویِ primaryِ تازه rebuild کن (STANDBY_BOOTSTRAP=repo)"
echo "  ۴) pg_stat_archiver را رویِ new primary سبز کن (WAL archiving حیاتی است)"
echo "  ۵) رویداد را در ممیزیِ داخلی ثبت کن: incident=failover-postgres actor=${USER:-${PGUSER:-postgres}}"
echo "════════════════════════════════════════════"

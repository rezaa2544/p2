#!/usr/bin/env bash
# post-checks.sh — آزمونکِ سلامتِ خوشه (پس از up یا هر drill)
# مصرف: bash infra/postgres/post-checks.sh
# هر بند PASS/FAIL چاپ می‌کند؛ هر FAIL ⇒ خروجیِ غیرصفر (fail-closed).
set -euo pipefail
FAILED=0
note(){ if [ "$2" = "ok" ]; then echo "PASS: $1"; else echo "FAIL: $1"; FAILED=1; fi; }
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
pg(){ # pg <service> <sql>
  docker compose -f "$COMPOSE_DIR/docker-compose.ha.yml" exec -T "$1" \
    psql -U postgres -d payesh -tAc "$2" 2>/dev/null
}

r="$(pg pg-primary "SELECT count(*) FROM pg_stat_activity WHERE application_name='payesh-standby'" || echo 0)"
[ "${r:-0}" -ge 1 ] 2>/dev/null && note "walsender فعال روی primary" ok || note "walsender فعال روی primary" bad

s="$(pg pg-standby "SELECT count(*) FROM pg_stat_wal_receiver WHERE status='streaming'" || echo 0)"
[ "${s:-0}" -ge 1 ] 2>/dev/null && note "walreceiver در standby استریم می‌کند" ok || note "walreceiver در standby استریم می‌کند" bad

lag="$(pg pg-primary "SELECT COALESCE(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn),-1)::bigint FROM pg_stat_replication LIMIT 1" || echo -1)"
if [ "${lag:-1}" = "-1" ]; then note "سنجشِ تأخیرِ replay" bad; else note "تأخیرِ replay=${lag}B" ok; fi

a="$(pg pg-primary "SELECT archived_count FROM pg_stat_archiver" || echo -1)"
if [ "${a:-0}" -ge 0 ] 2>/dev/null; then note "pg_stat_archiver پاسخ داد (archived=${a})" ok; else note "pg_stat_archiver پاسخ داد" bad; fi

f="$(pg pg-primary "SELECT failed_count FROM pg_stat_archiver" || echo -1)"
if [ "${f:-1}" = "0" ]; then note "بدونِ شکستِ آرشیو" ok; else note "بدونِ شکستِ آرشیو (failed=${f})" bad; fi

pb="$(pg pg-standby "SELECT CASE WHEN NOT pg_is_in_recovery() THEN 'no' ELSE 'yes' END" || echo no)"
[ "$pb" = "yes" ] && note "standby در حالتِ ریکاوری است (منتظرِ replay)" ok || note "standby در حالتِ ریکاوری است (منتظرِ replay)" bad

exit "$FAILED"

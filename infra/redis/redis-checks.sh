#!/usr/bin/env bash
# redis-checks.sh — آزمونکِ سلامتِ خوشهٔ ردیس (پس از up یا drill)
# هر بند PASS/FAIL؛ هر FAIL ⇒ خروجیِ غیرصفر (fail-closed).
set -euo pipefail
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
FAILED=0
note(){ if [ "$2" = "ok" ]; then echo "PASS: $1"; else echo "FAIL: $1"; FAILED=1; fi; }
rc(){ docker compose -f "$COMPOSE_DIR/docker-compose.sentinel.yml" exec -T "$1" \
      sh -c 'redis-cli -a "$REDIS_PASSWORD" '"$2" 2>/dev/null; }

m="$(rc redis-master 'INFO replication' | grep -c 'role:master' || true)"
[ "${m:-0}" -ge 1 ] && note "redis-master نقشِ master دارد" ok || note "redis-master نقشِ master دارد" bad

for n in 1 2; do
  x="$(rc "redis-replica-$n" 'INFO replication' | grep -c 'role:slave' || true)"
  [ "${x:-0}" -ge 1 ] && note "replica-$n متصل و slave است" ok || note "replica-$n متصل و slave است" bad
done

for n in 1 2 3; do
  q="$(rc "sentinel-$n" "SENTINEL master mymaster" | grep -c 'name,mymaster' || true)"
  [ "${q:-0}" -ge 1 ] && note "sentinel-$n سرویسِ mymaster را می‌شناسد" ok || note "sentinel-$n سرویسِ mymaster را می‌شناسد" bad
done

reps="$(rc sentinel-1 'SENTINEL replicas mymaster' | grep -c 'address,redis-replica' || true)"
[ "${reps:-0}" -ge 2 ] && note "sentinel هر دو replica را ثبت کرده ($reps)" ok || note "sentinel هر دو replica را ثبت کرده" bad

exit "$FAILED"

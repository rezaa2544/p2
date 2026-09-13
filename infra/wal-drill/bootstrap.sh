#!/usr/bin/env bash
# WAL disk-full drill — infrastructure bootstrap.
#
# Brings up a real PostgreSQL 17 cluster on port 55432 whose pg_wal lives on a
# size-capped tmpfs, so WAL exhaustion is a genuine ENOSPC rather than a mock.
#
# Everything outside /home/user is ephemeral in this sandbox, so this script is
# written to be idempotent and re-runnable: install -> initdb -> configure ->
# migrate -> seed, in one shot.
#
#   PGPORT     default 55432
#   WAL_MB     tmpfs cap for pg_wal, default 100
#   PGDATA     default /var/tmp/pgdata-wal-drill
#   WAL_MNT    default /mnt/pgwal

set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
PGPORT="${PGPORT:-55432}"
WAL_MB="${WAL_MB:-100}"
WAL_SEG_MB="${WAL_SEG_MB:-1}"
PGDATA="${PGDATA:-/var/tmp/pgdata-wal-drill}"
WAL_MNT="${WAL_MNT:-/mnt/pgwal}"
REPO="${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
RUN="${RUN:-/var/tmp/wal-drill-run}"

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# ── گاردهای ایمنیِ مسیر (S9-6) ─────────────────────────────────────────────
# این اسکریپت `mount`, `rm -rf`, `chown -R` و `ln -s` روی مسیرهای متغیر اجرا
# می‌کند؛ اگر کسی WAL_MNT=/ یا PGDATA=/usr بدهد، فاجعه است. گاردها عمداً
# پیش از هر کارِ سنگین‌اند تا (الف) بی‌نیاز از PostgreSQL قابل آزمودن باشند و
# (ب) هیچ‌وقت بعد از نیمه‌کارِ مخرب متوقف نشویم.
guard_path() { # $1=قلمِ متغیر $2=مقدار
  local name="$1" raw="$2" canon
  case "$raw" in
    /*) ;;
    *) die "$name must be an absolute path (got: $raw)";;
  esac
  # Normalize trailing slashes, dot segments and existing symlinks before the
  # deny-list. A literal match on "$raw" lets /usr/ or /usr/. bypass the guard.
  canon=$(realpath -m -- "$raw" 2>/dev/null) || die "$name path cannot be canonicalized: $raw"
  case "$canon" in
    /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/opt|/proc|/root|/run|/sbin|/srv|/sys|/usr|/var)
      die "$name refuses to operate on a system path: $raw (canonical: $canon)";;
  esac
  # Use the canonical value for all later mkdir/rm/mount/chown operations and
  # for the containment check below; aliases must not change the safety result.
  printf -v "$name" '%s' "$canon"
}
guard_path PGDATA  "$PGDATA"
guard_path WAL_MNT "$WAL_MNT"
guard_path RUN     "$RUN"
[ "$PGDATA" != "$WAL_MNT" ] || die "PGDATA and WAL_MNT must be different directories (both: $PGDATA)"
case "$PGDATA/" in "$WAL_MNT"/*) die "PGDATA must not sit inside WAL_MNT ($PGDATA ⊂ $WAL_MNT)";; esac

[ -x "$PGBIN/postgres" ] || die "postgres 17 binaries not found at $PGBIN (run: apt-get install -y postgresql-17)"

log "1/6 tmpfs for pg_wal (${WAL_MB}MB at $WAL_MNT)"
mkdir -p "$WAL_MNT" "$RUN"
if ! mountpoint -q "$WAL_MNT" 2>/dev/null; then
  mount -t tmpfs -o "size=${WAL_MB}M,mode=700" tmpfs "$WAL_MNT"
fi
df -h "$WAL_MNT" | tail -1

log "2/6 initdb -> $PGDATA"
rm -rf "$PGDATA"
mkdir -p "$PGDATA" /var/run/postgresql "$RUN/sock"
chown postgres:postgres "$PGDATA" /var/run/postgresql "$WAL_MNT" "$RUN" "$RUN/sock"
chmod 700 "$PGDATA"
# WAL_SEG_MB=1 عمداً کوچک است. دلیلِ فنی: با سگمنتِ پیش‌فرضِ ۱۶MB و
# wal_recycle=on، PostgreSQL تا مدت‌ها داخلِ سگمنت‌هایِ از‌پیش‌تخصیص‌یافته
# می‌نویسد و سگمنت‌هایِ قدیمی را «بازیافت» می‌کند، پس حتی رویِ دیسکِ کاملاً
# پُر هم هیچ تخصیصِ تازه‌ای لازم ندارد و ENOSPC را حس نمی‌کند (این دقیقاً
# همان چیزی بود که سه اجرایِ اولِ مانور را سبزِ کاذب کرد). سگمنتِ کوچک،
# نیاز به تخصیصِ تازه را پیوسته می‌کند. این «شتاب‌دهیِ مانور» است، نه
# ادعایِ پیکربندیِ تولید — در گزارش صریح ذکر می‌شود.
sudo -n -u postgres "$PGBIN/initdb" -D "$PGDATA" -U postgres \
  --wal-segsize="${WAL_SEG_MB:-1}" \
  --auth-local=trust --auth-host=trust -E UTF8 --locale=C.UTF-8 >/dev/null 2>&1 \
  || die "initdb failed"
echo "    initdb ok (version: $("$PGBIN/postgres" --version), wal_segment_size=${WAL_SEG_MB:-1}MB)"

log "3/6 relocate pg_wal onto the tmpfs"
# Correct procedure for an existing cluster: stop, move, symlink, start.
# Running `initdb --waldir` a second time against the same PGDATA does not
# relocate an existing cluster, so we do the move by hand.
sudo -n -u postgres "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
rm -rf "$WAL_MNT"/./* "$WAL_MNT"/.[!.]* 2>/dev/null || true
cp -a "$PGDATA/pg_wal/." "$WAL_MNT/" 2>/dev/null || true
rm -rf "$PGDATA/pg_wal"
ln -s "$WAL_MNT" "$PGDATA/pg_wal"
chown -h postgres:postgres "$PGDATA/pg_wal"
chown -R postgres:postgres "$WAL_MNT"
echo "    pg_wal -> $(readlink -f "$PGDATA/pg_wal")"

log "4/6 postgresql.conf for the drill"
cat >> "$PGDATA/postgresql.conf" <<EOF

# --- WAL disk-full drill (Wave 19) ---
port = $PGPORT
listen_addresses = '127.0.0.1'
unix_socket_directories = '$RUN/sock'
max_connections = 60
shared_buffers = 64MB
wal_level = replica
max_wal_senders = 4
max_replication_slots = 4
# بازیافتِ سگمنت خاموش: PG باید برایِ هر سگمنتِ تازه واقعاً فایلِ جدید بسازد،
# وگرنه رویِ دیسکِ پُر هم با rename از کنارِ ENOSPC رد می‌شود.
wal_recycle = off
wal_keep_size = 0
min_wal_size = 8MB
max_wal_size = 16MB
checkpoint_timeout = 30s
checkpoint_completion_target = 0.5
fsync = on
synchronous_commit = on
full_page_writes = on
logging_collector = on
log_directory = '$RUN/logs'
log_filename = 'postgresql-%H%M%S.log'
log_min_messages = warning
log_statement = 'none'
log_line_prefix = '%m [%p] %q%u@%d '
EOF
mkdir -p "$RUN/logs"; chown postgres:postgres "$RUN/logs"

log "5/6 start cluster on port $PGPORT"
sudo -n -u postgres "$PGBIN/pg_ctl" -D "$PGDATA" -l "$RUN/pg-startup.log" -w -t 60 start >/dev/null 2>&1 \
  || { tail -20 "$RUN/pg-startup.log" >&2; die "pg_ctl start failed"; }
export PGHOST="$RUN/sock" PGPORT="$PGPORT" PGUSER=postgres
"$PGBIN/psql" -tAc 'select version()' | head -1
echo "    pg_wal on: $(df --output=target,size,avail "$WAL_MNT" | tail -1 | xargs)"

log "6/6 migrations (کشفِ پویا از $REPO/migrations)"
cd "$REPO"
# S9-6 (باگ‌هانت نشست ۹): نسخهٔ پیشین فهرستِ نام‌ها را hardcode کرده بود، و
# فایلِ ناموجود را با «skip (absent)» رد می‌کرد. پس از بازشماریِ ۰۰۴→۰۰۷ در
# main، دو نام از آن فهرست دیگر وجود نداشتند: مانور بدونِ ایندکس‌های wave3 و
# بدونِ ۰۰۵ بالا می‌آمد و **سبزِ کاذب** می‌شد. حالا دایرکتوری ملاک است.
shopt -s nullglob
migs=(migrations/[0-9][0-9][0-9]_*.sql)
shopt -u nullglob
[ "${#migs[@]}" -gt 0 ] || die "no migrations found under $REPO/migrations"
applied=0; skipped=0
for m in "${migs[@]}"; do
  case "$m" in *.down.sql) skipped=$((skipped+1)); continue;; esac
  if "$PGBIN/psql" -v ON_ERROR_STOP=1 -q -f "$m" >/dev/null 2>"$RUN/mig.err"; then
    applied=$((applied+1)); echo "    ok   $m"
  else
    echo "    FAIL $m" >&2; head -5 "$RUN/mig.err" >&2
    die "migration failed — stopping instead of continuing with a partial schema"
  fi
done
echo "    migrations applied: $applied (+$skipped rollback files skipped)"
[ "$applied" -gt 0 ] || die "no forward migrations were applied — schema is not ready"

echo
echo "TABLES: $("$PGBIN/psql" -tAc "select count(*) from information_schema.tables where table_schema='public'")"
echo "PG_READY=1 PGHOST=$RUN/sock PGPORT=$PGPORT PGBIN=$PGBIN PGDATA=$PGDATA WAL_MNT=$WAL_MNT" > "$RUN/env.sh"
echo "env written to $RUN/env.sh"

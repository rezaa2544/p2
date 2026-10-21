#!/usr/bin/env bash
# CI-only, disposable M15-01 E3 drill: current Compose PostgreSQL PITR/failover
# plus Redis Sentinel failover. This is single-runner evidence, never E4.
set -euo pipefail
umask 077

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${M15_RUNTIME_ALLOW_CI:-}" != "1" ]]; then
  echo "M15 DR runtime drill is CI-only" >&2
  exit 78
fi
: "${RUNNER_TEMP:?GitHub Actions RUNNER_TEMP is required}"
: "${GITHUB_RUN_ID:?GitHub Actions run id is required}"
: "${GITHUB_RUN_ATTEMPT:?GitHub Actions run attempt is required}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
RUN_KEY="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
if [[ ! "$RUN_KEY" =~ ^[0-9]+-[0-9]+$ ]]; then
  echo "invalid GitHub run identity" >&2
  exit 64
fi
EVIDENCE_DIR="$RUNNER_TEMP/m15-01-dr-${RUN_KEY}"
RAW_OUTPUT_DIR="$RUNNER_TEMP/m15-01-dr-raw-${RUN_KEY}"
mkdir -p "$EVIDENCE_DIR" "$RAW_OUTPUT_DIR"
chmod 700 "$EVIDENCE_DIR" "$RAW_OUTPUT_DIR"
COMMAND_LOG="$EVIDENCE_DIR/commands.log"
REPORT_PATH="$EVIDENCE_DIR/dr-runtime-evidence.json"
COMPOSE_ENV="$RUNNER_TEMP/m15-01-dr-compose-${RUN_KEY}.env"
PG_PROJECT="m15drpg-${RUN_KEY}"
REDIS_PROJECT="m15drrd-${RUN_KEY}"
PG_PROJECT_OWNED=0
REDIS_PROJECT_OWNED=0
PG_COMPOSE="infra/postgres/docker-compose.ha.yml"
REDIS_COMPOSE="infra/redis/docker-compose.sentinel.yml"
: > "$COMMAND_LOG"
chmod 600 "$COMMAND_LOG"
printf 'LOG_REDACTION: known secret values and sensitive assignments are replaced with [REDACTED].\n' >> "$COMMAND_LOG"

STATUS="RUNNING"
EXIT_STATUS=1
CLEANUP_STATUS=0
COMPOSE_ENV_CLEANUP="NOT_RUN"
RAW_OUTPUT_CLEANUP="NOT_RUN"
SOURCE_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
SOURCE_TREE_CLEAN="NOT_RUN"
PG_PASSWORD=""
PG_REPLICATION_PASSWORD=""
MINIO_USER=""
MINIO_PASSWORD=""
REDIS_PASSWORD=""
PITR_TARGET=""
ARCHIVE_AFTER_TS=""
PITR_BEFORE_MARKER=""
PITR_AFTER_MARKER=""
PITR_BEFORE_PRESENT="NOT_RUN"
PITR_AFTER_ABSENT="NOT_RUN"
PITR_VERIFY_EXIT="NOT_RUN"
PG_PROMOTION_STATE="NOT_RUN"
PG_POST_PROMOTION_WRITE="NOT_RUN"
PG_FAILOVER_RTO_MS="NOT_RUN"
REDIS_ORIGINAL_MASTER="NOT_RUN"
REDIS_PROMOTED_MASTER="NOT_RUN"
REDIS_FAILOVER_TOOL_EXIT="NOT_RUN"
REDIS_TOOL_PREEMPTED="false"
REDIS_DATA_SURVIVED="NOT_RUN"
REDIS_POST_PROMOTION_WRITE="NOT_RUN"
PG_VERSION_TEXT="NOT_RUN"
PG_SCHEMA_MIGRATION_COUNT="NOT_RUN"
PG_SCHEMA_LATEST_MIGRATION="NOT_RUN"
PG_SCHEMA_EXPECTED_CATALOG="NOT_RUN"
PG_SCHEMA_EXPECTED_CATALOG_SHA="NOT_RUN"
PG_SCHEMA_CATALOG_MATCH="NOT_RUN"
PITR_SCHEMA_MIGRATION_COUNT="NOT_RUN"
PITR_SCHEMA_LATEST_MIGRATION="NOT_RUN"
PITR_SCHEMA_CATALOG_MATCH="NOT_RUN"
PGBACKREST_VERSION="NOT_RUN"
PG_CONFIG_ACCESS="NOT_RUN"
PG_STANDBY_STREAMING="NOT_RUN"
PG_BACKUP_STATUS="NOT_RUN"
ARCHIVE_STATUS="NOT_RUN"

compose_pg() {
  docker compose -p "$PG_PROJECT" --env-file "$COMPOSE_ENV" -f "$PG_COMPOSE" "$@"
}
compose_redis() {
  docker compose -p "$REDIS_PROJECT" --env-file "$COMPOSE_ENV" -f "$REDIS_COMPOSE" "$@"
}

assert_compose_project_unused() {
  local project="$1" kind resources
  for kind in containers volumes networks; do
    case "$kind" in
      containers) resources="$(docker ps --all --quiet --filter "label=com.docker.compose.project=${project}")" || return 1 ;;
      volumes) resources="$(docker volume ls --quiet --filter "label=com.docker.compose.project=${project}")" || return 1 ;;
      networks) resources="$(docker network ls --quiet --filter "label=com.docker.compose.project=${project}")" || return 1 ;;
    esac
    if [[ -n "$resources" ]]; then
      echo "Refusing to reuse or remove an existing Docker Compose project" >&2
      return 1
    fi
  done
}

redact_file() {
  local file="$1"
  PG_PASSWORD="$PG_PASSWORD" PG_REPLICATION_PASSWORD="$PG_REPLICATION_PASSWORD" \
    MINIO_PASSWORD="$MINIO_PASSWORD" REDIS_PASSWORD="$REDIS_PASSWORD" \
    MINIO_USER="$MINIO_USER" node tools/m15-01-log-redactor.js redact-file "$file"
}

run_logged() {
  local label="$1"
  local output="$RAW_OUTPUT_DIR/${label}.log"
  local sanitized_output="$EVIDENCE_DIR/${label}.log"
  local command_status=0 redact_status=0 artifact_status=0 status=0 rendered
  shift
  rendered="$(node tools/m15-01-log-redactor.js format-command "$@")"
  printf '\nCOMMAND[%s]: %s\n' "$label" "$rendered" >> "$COMMAND_LOG"
  set +e
  "$@" > "$output" 2>&1
  command_status=$?
  chmod 600 "$output"
  redact_file "$output"
  redact_status=$?
  set -e
  if [[ "$redact_status" == 0 ]]; then
    if mv -- "$output" "$sanitized_output"; then
      cat "$sanitized_output" >> "$COMMAND_LOG"
    else
      printf 'REDACTED_OUTPUT_ARTIFACT_FAILED[%s]: sanitized command output could not be preserved\n' "$label" >> "$COMMAND_LOG"
      rm -f "$output"
      artifact_status=1
    fi
  else
    printf 'OUTPUT_REDACTION_FAILED[%s]: raw command output withheld\n' "$label" >> "$COMMAND_LOG"
    rm -f "$output"
  fi
  status="$command_status"
  if [[ "$redact_status" != 0 || "$artifact_status" != 0 ]]; then status=1; fi
  if [[ "$command_status" != 0 && "$label" == "pg-ha-start" && "$redact_status" == 0 && "$artifact_status" == 0 ]]; then
    local first_error tail_excerpt diagnostic
    first_error="$(grep -Eim1 '(^|[[:space:]])(E:|Err:)|error response from daemon|failed to solve|failed to (fetch|download|install|configure)|version .* (not found|was not found)|unable to locate package|no installation candidate|package .* has no installation candidate|denied|no such file|not found|invalid|permission denied|process .* did not complete successfully|exit code: [1-9]' "$sanitized_output" | sed -E 's/\x1B\[[0-9;]*[[:alpha:]]//g' | tr -d '\r' | cut -c1-500 || true)"
    tail_excerpt="$(tail -n 8 "$sanitized_output" | sed -E 's/\x1B\[[0-9;]*[[:alpha:]]//g' | tr -d '\r' | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g' | cut -c1-600)"
    diagnostic="first_error=${first_error:-not-matched}; tail=${tail_excerpt}"
    diagnostic="$(printf '%s' "$diagnostic" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g' | cut -c1-1200)"
    if [[ -n "$diagnostic" ]]; then
      diagnostic="${diagnostic//%/%25}"
      diagnostic="${diagnostic//$'\r'/%0D}"
      diagnostic="${diagnostic//$'\n'/%0A}"
      printf '::error title=M15-01 pg-ha-start sanitized failure excerpt::%s\n' "$diagnostic"
    fi
  fi
  printf '\nEXIT_CODE[%s]: %s\n' "$label" "$command_status" >> "$COMMAND_LOG"
  if [[ "$redact_status" != 0 ]]; then printf 'LOG_REDACTION_EXIT_CODE[%s]: %s\n' "$label" "$redact_status" >> "$COMMAND_LOG"; fi
  if [[ "$artifact_status" != 0 ]]; then printf 'OUTPUT_ARTIFACT_EXIT_CODE[%s]: %s\n' "$label" "$artifact_status" >> "$COMMAND_LOG"; fi
  return "$status"
}

wait_pg_ha_ready() {
  local i primary standby streaming
  for i in $(seq 1 180); do
    primary="$(compose_pg exec -T -u postgres pg-primary pg_isready -h 127.0.0.1 -p 5432 -d payesh 2>/dev/null || true)"
    standby="$(compose_pg exec -T -u postgres pg-standby pg_isready -h 127.0.0.1 -p 5432 -d payesh 2>/dev/null || true)"
    streaming="$(compose_pg exec -T -u postgres pg-standby psql -XAt -d payesh -c "SELECT count(*) FROM pg_stat_wal_receiver WHERE status = 'streaming';" 2>/dev/null || true)"
    if [[ "$primary" == *"accepting connections"* && "$standby" == *"accepting connections"* && "$streaming" == "1" ]]; then
      printf 'primary=%s\nstandby=%s\nstandby_streaming=%s\n' "$primary" "$standby" "$streaming"
      PG_STANDBY_STREAMING="true"
      return 0
    fi
    sleep 2
  done
  compose_pg ps || true
  echo "PostgreSQL primary/standby readiness or streaming replication timed out" >&2
  return 1
}

wait_archive_ready() {
  local i archived
  for i in $(seq 1 90); do
    archived="$(compose_pg exec -T -u postgres pg-primary psql -XAt -d payesh -c \
      "SELECT CASE WHEN last_archived_time >= '${ARCHIVE_AFTER_TS}'::timestamptz THEN 1 ELSE 0 END FROM pg_stat_archiver;" 2>/dev/null || true)"
    if [[ "$archived" == "1" ]]; then
      echo "pg_stat_archiver.last_archived_time reached ${ARCHIVE_AFTER_TS}"
      ARCHIVE_STATUS="true"
      return 0
    fi
    sleep 2
  done
  compose_pg exec -T -u postgres pg-primary psql -X -d payesh -c 'SELECT archived_count, failed_count, last_archived_wal, last_archived_time, last_failed_wal, last_failed_time FROM pg_stat_archiver;' || true
  echo "WAL archive did not reach the post-marker timestamp" >&2
  return 1
}

wait_standby_caught_up() {
  local required_lsn="$1" i caught_up
  for i in $(seq 1 90); do
    caught_up="$(compose_pg exec -T -u postgres pg-standby psql -XAt -d payesh -c \
      "SELECT CASE WHEN pg_last_wal_replay_lsn() >= '${required_lsn}'::pg_lsn THEN 1 ELSE 0 END;" 2>/dev/null || true)"
    if [[ "$caught_up" == "1" ]]; then
      echo "standby replay reached required primary LSN ${required_lsn}"
      return 0
    fi
    sleep 1
  done
  echo "standby did not replay the required LSN ${required_lsn}" >&2
  return 1
}

redis_master_addr() {
  compose_redis exec -T sentinel-1 sh -ec \
    'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -p 26379 --raw SENTINEL get-master-addr-by-name mymaster'
}

wait_redis_ready() {
  local service port output
  for service in redis-master redis-replica-1 redis-replica-2; do
    output="$(compose_redis exec -T "$service" sh -ec \
      'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -p 6379 ping' 2>/dev/null || true)"
    if [[ "$output" != "PONG" ]]; then echo "$service ping=$output" >&2; return 1; fi
    echo "$service ping=PONG"
  done
  for service in sentinel-1 sentinel-2 sentinel-3; do
    output="$(compose_redis exec -T "$service" sh -ec \
      'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -p 26379 ping' 2>/dev/null || true)"
    if [[ "$output" != "PONG" ]]; then echo "$service ping=$output" >&2; return 1; fi
    echo "$service ping=PONG"
  done
}

wait_redis_promoted() {
  local original="$1" i address host port role
  for i in $(seq 1 90); do
    address="$(redis_master_addr 2>/dev/null || true)"
    host="$(printf '%s\n' "$address" | sed -n '1p')"
    port="$(printf '%s\n' "$address" | sed -n '2p')"
    if [[ -n "$host" && -n "$port" && "$host,$port" != "$original" ]]; then
      role="$(compose_redis exec -T redis-replica-1 sh -ec \
        'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -h "$1" -p "$2" INFO replication | grep -E "^role:master"' \
        sh "$host" "$port" 2>/dev/null || true)"
      if [[ "$role" == "role:master" ]]; then
        printf 'ORIGINAL_MASTER=%s\nPROMOTED_MASTER=%s,%s\nNEW_MASTER_ROLE=%s\n' "$original" "$host" "$port" "$role"
        REDIS_PROMOTED_MASTER="$host,$port"
        return 0
      fi
    fi
    sleep 1
  done
  echo "Sentinel did not promote a new reachable master" >&2
  return 1
}

write_report() {
  export M15_DR_STATUS="$STATUS" M15_DR_EXIT_STATUS="$EXIT_STATUS" M15_DR_CLEANUP_STATUS="$CLEANUP_STATUS"
  export M15_DR_SOURCE_SHA="$SOURCE_SHA" M15_DR_COMMAND_LOG="$COMMAND_LOG" M15_DR_REPORT_PATH="$REPORT_PATH"
  export M15_DR_SOURCE_TREE_CLEAN="$SOURCE_TREE_CLEAN"
  export M15_DR_COMPOSE_ENV_CLEANUP="$COMPOSE_ENV_CLEANUP" M15_DR_RAW_OUTPUT_CLEANUP="$RAW_OUTPUT_CLEANUP"
  export M15_DR_PG_PROJECT="$PG_PROJECT" M15_DR_REDIS_PROJECT="$REDIS_PROJECT"
  export M15_DR_PITR_TARGET="$PITR_TARGET" M15_DR_PITR_BEFORE_MARKER="$PITR_BEFORE_MARKER"
  export M15_DR_PITR_AFTER_MARKER="$PITR_AFTER_MARKER" M15_DR_PITR_BEFORE_PRESENT="$PITR_BEFORE_PRESENT"
  export M15_DR_PITR_AFTER_ABSENT="$PITR_AFTER_ABSENT" M15_DR_PITR_VERIFY_EXIT="$PITR_VERIFY_EXIT"
  export M15_DR_PG_PROMOTION_STATE="$PG_PROMOTION_STATE" M15_DR_PG_POST_PROMOTION_WRITE="$PG_POST_PROMOTION_WRITE"
  export M15_DR_PG_FAILOVER_RTO_MS="$PG_FAILOVER_RTO_MS" M15_DR_PG_VERSION="$PG_VERSION_TEXT"
  export M15_DR_PG_SCHEMA_MIGRATION_COUNT="$PG_SCHEMA_MIGRATION_COUNT" M15_DR_PG_SCHEMA_LATEST_MIGRATION="$PG_SCHEMA_LATEST_MIGRATION"
  export M15_DR_PG_SCHEMA_EXPECTED_CATALOG="$PG_SCHEMA_EXPECTED_CATALOG" M15_DR_PG_SCHEMA_EXPECTED_CATALOG_SHA="$PG_SCHEMA_EXPECTED_CATALOG_SHA"
  export M15_DR_PG_SCHEMA_CATALOG_MATCH="$PG_SCHEMA_CATALOG_MATCH"
  export M15_DR_PITR_SCHEMA_MIGRATION_COUNT="$PITR_SCHEMA_MIGRATION_COUNT" M15_DR_PITR_SCHEMA_LATEST_MIGRATION="$PITR_SCHEMA_LATEST_MIGRATION"
  export M15_DR_PITR_SCHEMA_CATALOG_MATCH="$PITR_SCHEMA_CATALOG_MATCH"
  export M15_DR_PGBACKREST_VERSION="$PGBACKREST_VERSION" M15_DR_PG_CONFIG_ACCESS="$PG_CONFIG_ACCESS"
  export M15_DR_PG_STANDBY_STREAMING="$PG_STANDBY_STREAMING" M15_DR_PG_BACKUP_STATUS="$PG_BACKUP_STATUS"
  export M15_DR_ARCHIVE_STATUS="$ARCHIVE_STATUS" M15_DR_REDIS_ORIGINAL_MASTER="$REDIS_ORIGINAL_MASTER"
  export M15_DR_REDIS_PROMOTED_MASTER="$REDIS_PROMOTED_MASTER" M15_DR_REDIS_FAILOVER_TOOL_EXIT="$REDIS_FAILOVER_TOOL_EXIT"
  export M15_DR_REDIS_TOOL_PREEMPTED="$REDIS_TOOL_PREEMPTED" M15_DR_REDIS_DATA_SURVIVED="$REDIS_DATA_SURVIVED"
  export M15_DR_REDIS_POST_PROMOTION_WRITE="$REDIS_POST_PROMOTION_WRITE"
  node - "$REPORT_PATH" <<'NODE'
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { execFileSync } = require('child_process');
const file = process.argv[2];
let currentSha = process.env.M15_DR_SOURCE_SHA || null;
try { currentSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (_) {}
let commandBytes = 0;
let commandSha = null;
try {
  const data = fs.readFileSync(process.env.M15_DR_COMMAND_LOG);
  commandBytes = data.length;
  commandSha = crypto.createHash('sha256').update(data).digest('hex');
} catch (_) {}
const val = (key) => process.env[key] || null;
const evidence = {
  schema_version: 1,
  mission: 'M15-01',
  evidence_level: 'E3',
  status: val('M15_DR_STATUS') || 'FAIL',
  mission_disposition: 'SUBSET_ONLY_NOT_M15_01_CLOSURE',
  status_scope: 'disposable single-GitHub-runner Compose drill; not an operational or E4 certification',
  source_sha: currentSha,
  command: 'bash tools/m15-01-dr-runtime.sh',
  exit_code: Number(process.env.M15_DR_EXIT_STATUS || 1),
  environment: {
    runner_os: process.env.RUNNER_OS || os.platform(),
    runner_arch: process.env.RUNNER_ARCH || os.arch(),
    runner_image_os: process.env.ImageOS || null,
    runner_image_version: process.env.ImageVersion || null,
    host_cpu_model: (os.cpus()[0] && os.cpus()[0].model) || null,
    host_cpu_count: os.cpus().length,
    host_memory_bytes: os.totalmem(),
    node: process.version,
    source_tree_clean: val('M15_DR_SOURCE_TREE_CLEAN') === 'true',
    github_ref: process.env.GITHUB_REF || null,
    github_event_name: process.env.GITHUB_EVENT_NAME || null,
    github_run_id: process.env.GITHUB_RUN_ID || null,
    github_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    pg_compose_project: val('M15_DR_PG_PROJECT'),
    redis_compose_project: val('M15_DR_REDIS_PROJECT'),
    postgres_image_ref: 'postgres:16-bookworm + pgbackrest package 2.47-1 (Dockerfile build)',
    redis_image_ref: 'redis:7.4.2-bookworm',
    minio_endpoint_scope: 'local Compose service only; not offsite'
  },
  postgres: {
    version: val('M15_DR_PG_VERSION'),
    schema: {
      checked_database: 'primary before backup',
      migration_count: val('M15_DR_PG_SCHEMA_MIGRATION_COUNT'),
      latest_migration: val('M15_DR_PG_SCHEMA_LATEST_MIGRATION'),
      expected_current_catalog: val('M15_DR_PG_SCHEMA_EXPECTED_CATALOG'),
      current_migration_catalog_sha256: val('M15_DR_PG_SCHEMA_EXPECTED_CATALOG_SHA'),
      verified_against_current_migration_catalog: val('M15_DR_PG_SCHEMA_CATALOG_MATCH') === 'true'
    },
    pgbackrest_version: val('M15_DR_PGBACKREST_VERSION'),
    pgbackrest_config_readable_by_postgres: val('M15_DR_PG_CONFIG_ACCESS'),
    standby_streaming_before_failure: val('M15_DR_PG_STANDBY_STREAMING'),
    full_backup_status: val('M15_DR_PG_BACKUP_STATUS'),
    wal_archive_after_synthetic_markers: val('M15_DR_ARCHIVE_STATUS'),
    pitr: {
      verified_application_database: 'payesh',
      restored_application_schema: {
        migration_count: val('M15_DR_PITR_SCHEMA_MIGRATION_COUNT'),
        latest_migration: val('M15_DR_PITR_SCHEMA_LATEST_MIGRATION'),
        expected_current_catalog: val('M15_DR_PG_SCHEMA_EXPECTED_CATALOG'),
        current_migration_catalog_sha256: val('M15_DR_PG_SCHEMA_EXPECTED_CATALOG_SHA'),
        verified_against_current_migration_catalog: val('M15_DR_PITR_SCHEMA_CATALOG_MATCH') === 'true'
      },
      target_time: val('M15_DR_PITR_TARGET'),
      before_marker: val('M15_DR_PITR_BEFORE_MARKER'),
      after_marker: val('M15_DR_PITR_AFTER_MARKER'),
      before_marker_restored: val('M15_DR_PITR_BEFORE_PRESENT'),
      after_marker_excluded: val('M15_DR_PITR_AFTER_ABSENT'),
      verify_script_exit_code: val('M15_DR_PITR_VERIFY_EXIT'),
      command_and_output: 'commands.log and pitr-restore.log in this artifact'
    },
    failover: {
      primary_stopped_before_promotion: val('M15_DR_PG_PROMOTION_STATE'),
      promoted_standby_writable_after_promotion: val('M15_DR_PG_POST_PROMOTION_WRITE'),
      promotion_to_verified_direct_write_ms: val('M15_DR_PG_FAILOVER_RTO_MS'),
      measurement_scope: 'single-host stop to direct standby write/readback; no PgBouncer or application endpoint reroute',
      pgbouncer_endpoint_reroute_tested: false
    }
  },
  redis_sentinel: {
    original_master: val('M15_DR_REDIS_ORIGINAL_MASTER'),
    promoted_master: val('M15_DR_REDIS_PROMOTED_MASTER'),
    failover_helper_exit_code: val('M15_DR_REDIS_FAILOVER_TOOL_EXIT'),
    helper_preempted_by_automatic_sentinel_failover: val('M15_DR_REDIS_TOOL_PREEMPTED'),
    replicated_value_survived: val('M15_DR_REDIS_DATA_SURVIVED'),
    post_promotion_write_verified: val('M15_DR_REDIS_POST_PROMOTION_WRITE')
  },
  command_log: {
    path: 'commands.log',
    sha256: commandSha,
    bytes: commandBytes,
    cleanup_exit_code: Number(process.env.M15_DR_CLEANUP_STATUS || 0),
    compose_env_removed: val('M15_DR_COMPOSE_ENV_CLEANUP') === 'true',
    raw_output_directory_removed: val('M15_DR_RAW_OUTPUT_CLEANUP') === 'true'
  },
  limitations: [
    'The PostgreSQL Compose stack uses a local MinIO service on the same GitHub runner; this is not offsite backup evidence or an independent failure-domain test.',
    'Promotion interrupts one container on a single host; it is not multi-host or production failover, and no application/PgBouncer endpoint reroute is claimed.',
    'Redis Sentinel services run within one Compose network and one runner; no cross-zone, regional, or production RTO/SLO claim is made.',
    'The synthetic relational fixture and marker rows are disposable test data; no real user records are involved.',
    'A successful restore/failover drill does not establish national-scale capacity or E4 readiness.'
  ]
};
fs.mkdirSync(require('path').dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
NODE
}

finalize() {
  local original_status=$?
  trap - EXIT
  local pg_down=0 redis_down=0 env_cleanup=0 raw_cleanup=0
  if [[ -f "$COMPOSE_ENV" ]]; then
    if [[ "$PG_PROJECT_OWNED" == 1 ]]; then
      if run_logged cleanup-pg-compose compose_pg down --volumes --remove-orphans; then pg_down=0; else pg_down=$?; fi
    fi
    if [[ "$REDIS_PROJECT_OWNED" == 1 ]]; then
      if run_logged cleanup-redis-compose compose_redis down --volumes --remove-orphans; then redis_down=0; else redis_down=$?; fi
    fi
  fi
  if [[ -f "$COMPOSE_ENV" ]]; then
    if rm -f -- "$COMPOSE_ENV"; then COMPOSE_ENV_CLEANUP="true"; else COMPOSE_ENV_CLEANUP="false"; env_cleanup=1; fi
  else
    COMPOSE_ENV_CLEANUP="true"
  fi
  if [[ -d "$RAW_OUTPUT_DIR" ]]; then
    if rm -rf -- "$RAW_OUTPUT_DIR"; then RAW_OUTPUT_CLEANUP="true"; else RAW_OUTPUT_CLEANUP="false"; raw_cleanup=1; fi
  else
    RAW_OUTPUT_CLEANUP="true"
  fi
  printf 'CLEANUP compose_env_removed=%s raw_output_directory_removed=%s\n' \
    "$COMPOSE_ENV_CLEANUP" "$RAW_OUTPUT_CLEANUP" >> "$COMMAND_LOG"
  if [[ "$pg_down" != 0 || "$redis_down" != 0 || "$env_cleanup" != 0 || "$raw_cleanup" != 0 ]]; then CLEANUP_STATUS=1; fi
  local final_status="$original_status"
  if [[ "$final_status" == 0 && "$CLEANUP_STATUS" != 0 ]]; then final_status=1; fi
  EXIT_STATUS="$final_status"
  if [[ "$final_status" == 0 ]]; then STATUS="PASS"; else STATUS="FAIL"; fi
  write_report
  exit "$final_status"
}
trap finalize EXIT

if [[ -z "$SOURCE_SHA" || ( -n "${GITHUB_SHA:-}" && "$SOURCE_SHA" != "$GITHUB_SHA" ) ]]; then
  echo "checked-out SHA does not match GitHub event SHA" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "checked-out source tree is dirty; refusing to bind DR evidence to an incomplete SHA" >&2
  exit 1
fi
SOURCE_TREE_CLEAN="true"

PG_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
PG_REPLICATION_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
MINIO_USER="m15$(node -e "process.stdout.write(require('crypto').randomBytes(8).toString('hex'))")"
MINIO_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
REDIS_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
cat > "$COMPOSE_ENV" <<EOF
PGHA_SUPERUSER=postgres
PGHA_PASSWORD=$PG_PASSWORD
PGHA_REPLICATION_PASSWORD=$PG_REPLICATION_PASSWORD
MINIO_ROOT_USER=$MINIO_USER
MINIO_ROOT_PASSWORD=$MINIO_PASSWORD
PGHA_S3_KEY=$MINIO_USER
PGHA_S3_SECRET=$MINIO_PASSWORD
PB_REPO_S3_ENDPOINT=minio:9000
PB_REPO_S3_BUCKET=payesh-m15-dr
PB_REPO_S3_REGION=us-east-1
PB_REPO_S3_VERIFY_TLS=n
STANDBY_BOOTSTRAP=stream
REDIS_PASSWORD=$REDIS_PASSWORD
EOF
chmod 600 "$COMPOSE_ENV"

run_logged docker-compose-version docker compose version
run_logged postgres-compose-config-check compose_pg config --quiet
run_logged redis-compose-config-check compose_redis config --quiet
if ! assert_compose_project_unused "$PG_PROJECT"; then
  echo "PostgreSQL Compose project identity is not unused; refusing cleanup or reuse" >&2
  exit 78
fi
PG_PROJECT_OWNED=1
run_logged pg-ha-start compose_pg up -d --build
run_logged pg-ha-readiness wait_pg_ha_ready
PG_STANDBY_STREAMING="true"
run_logged pgbackrest-config-permissions compose_pg exec -T -u postgres pg-primary sh -ec \
  'test -r /etc/pgbackrest/pgbackrest.conf && stat -c "owner=%U:%G mode=%a" /etc/pgbackrest/pgbackrest.conf | grep -Fx "owner=postgres:postgres mode=600"'
PG_CONFIG_ACCESS="verified_readable_by_postgres_owner_mode_0600"
run_logged pg-server-version compose_pg exec -T -u postgres pg-primary psql -XAt -d payesh -c 'SELECT version();'
PG_VERSION_TEXT="$(tr -d '\r\n' < "$EVIDENCE_DIR/pg-server-version.log")"
run_logged pgbackrest-version compose_pg exec -T -u postgres pg-primary pgbackrest version
PGBACKREST_VERSION="$(tr -d '\r\n' < "$EVIDENCE_DIR/pgbackrest-version.log")"

export DATABASE_URL="postgres://postgres:${PG_PASSWORD}@127.0.0.1:5432/payesh"
run_logged migrate-current-schema node tools/migrate-ledger.js up
export M15_CI_SEED_PROFILE=dr
run_logged relational-fixture-seed node tools/m15-01-ci-seed.js
unset M15_CI_SEED_PROFILE
run_logged dr-current-schema-ledger-check compose_pg exec -T -u postgres pg-primary psql -XAt -d payesh -c \
  "SELECT version || '|' || name || '|' || checksum FROM schema_migrations ORDER BY version ASC;"
SCHEMA_LEDGER="$(tr -d '\r' < "$EVIDENCE_DIR/dr-current-schema-ledger-check.log")"
EXPECTED_SCHEMA_LEDGER="$(node -e "const files=require('./tools/migrate-ledger').discoverMigrationFiles(); process.stdout.write(files.map(f=>[f.version,f.name,f.checksum].join('|')).join('\n'))")"
PG_SCHEMA_MIGRATION_COUNT="$(printf '%s\n' "$EXPECTED_SCHEMA_LEDGER" | wc -l | tr -d ' ')"
PG_SCHEMA_LATEST_MIGRATION="$(printf '%s\n' "$EXPECTED_SCHEMA_LEDGER" | tail -n 1 | cut -d '|' -f 1)"
EXPECTED_SCHEMA="${PG_SCHEMA_MIGRATION_COUNT}|${PG_SCHEMA_LATEST_MIGRATION}"
PG_SCHEMA_EXPECTED_CATALOG="$EXPECTED_SCHEMA"
PG_SCHEMA_EXPECTED_CATALOG_SHA="$(printf '%s\n' "$EXPECTED_SCHEMA_LEDGER" | sha256sum | awk '{print $1}')"
printf 'CURRENT_MIGRATION_CATALOG rows=%s latest=%s sha256=%s\n' "$PG_SCHEMA_MIGRATION_COUNT" "$PG_SCHEMA_LATEST_MIGRATION" "$PG_SCHEMA_EXPECTED_CATALOG_SHA" | tee -a "$COMMAND_LOG"
if [[ "$SCHEMA_LEDGER" != "$EXPECTED_SCHEMA_LEDGER" ]]; then
  echo "DR schema ledger differs from the current migration catalog: expected_rows=$PG_SCHEMA_MIGRATION_COUNT expected_sha256=$PG_SCHEMA_EXPECTED_CATALOG_SHA" >&2
  exit 1
fi
PG_SCHEMA_CATALOG_MATCH="true"
unset DATABASE_URL
run_logged dr-core-table-counts compose_pg exec -T -u postgres pg-primary psql -XAt -d payesh -c \
  "SELECT 'users=' || (SELECT count(*) FROM users) || ',schools=' || (SELECT count(*) FROM schools) || ',classes=' || (SELECT count(*) FROM classes) || ',grades=' || (SELECT count(*) FROM grades) || ',attendance=' || (SELECT count(*) FROM attendance);"

run_logged pgbackrest-stanza-create compose_pg exec -T -u postgres pg-primary pgbackrest --stanza=payesh stanza-create
run_logged pgbackrest-check compose_pg exec -T -u postgres pg-primary pgbackrest --stanza=payesh check
run_logged pgbackrest-full-backup compose_pg exec -T -u postgres pg-primary pgbackrest --stanza=payesh backup --type=full
run_logged pgbackrest-backup-info compose_pg exec -T -u postgres pg-primary pgbackrest --stanza=payesh info
PG_BACKUP_STATUS="full_backup_completed_and_info_verified"

PITR_BEFORE_MARKER="m15-dr-before-${RUN_KEY}"
PITR_AFTER_MARKER="m15-dr-after-${RUN_KEY}"
run_logged pitr-before-marker-insert compose_pg exec -T -u postgres pg-primary psql -X -v ON_ERROR_STOP=1 -d payesh -c \
  "INSERT INTO server_outbox (type, collection, payload, status) VALUES ('m15.dr.before', 'm15_dr', jsonb_build_object('origin', '${PITR_BEFORE_MARKER}'), 'processed');"
run_logged pitr-target-time compose_pg exec -T -u postgres pg-primary psql -XAt -d payesh -c \
  "SELECT to_char(clock_timestamp(), 'YYYY-MM-DD HH24:MI:SS.USOF');"
PITR_TARGET="$(tr -d '\r\n' < "$EVIDENCE_DIR/pitr-target-time.log")"
if [[ ! "$PITR_TARGET" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}[+-][0-9]{2}(:[0-9]{2})?$ ]]; then
  echo "PostgreSQL returned an invalid PITR target timestamp" >&2
  exit 1
fi
run_logged pitr-after-marker-insert compose_pg exec -T -u postgres pg-primary psql -X -v ON_ERROR_STOP=1 -d payesh -c \
  "INSERT INTO server_outbox (type, collection, payload, status) VALUES ('m15.dr.after', 'm15_dr', jsonb_build_object('origin', '${PITR_AFTER_MARKER}'), 'processed');"
run_logged pitr-archive-target-time compose_pg exec -T -u postgres pg-primary psql -XAt -d payesh -c \
  "SELECT to_char(clock_timestamp(), 'YYYY-MM-DD HH24:MI:SS.USOF');"
ARCHIVE_AFTER_TS="$(tr -d '\r\n' < "$EVIDENCE_DIR/pitr-archive-target-time.log")"
run_logged pitr-force-checkpoint-and-wal-switch compose_pg exec -T -u postgres pg-primary psql -X -v ON_ERROR_STOP=1 -d payesh -c \
  'CHECKPOINT; SELECT pg_switch_wal();'
run_logged pitr-wal-archive-wait wait_archive_ready
run_logged pgbackrest-post-marker-check compose_pg exec -T -u postgres pg-primary pgbackrest --stanza=payesh check
ARCHIVE_STATUS="true"

run_logged pgbackup-render-config compose_pg exec -T -u root pg-backup /opt/payesh/entrypoints/render-config.sh
run_logged pgbackup-config-permissions compose_pg exec -T -u postgres pg-backup sh -ec \
  'test -r /etc/pgbackrest/pgbackrest.conf && stat -c "owner=%U:%G mode=%a" /etc/pgbackrest/pgbackrest.conf | grep -Fx "owner=postgres:postgres mode=600"'
PG_BACKUP_CONTAINER="$(compose_pg ps -q pg-backup)"
if [[ -z "$PG_BACKUP_CONTAINER" ]]; then echo "pg-backup container id unavailable" >&2; exit 1; fi
run_logged copy-pitr-restore-tool docker cp tools/pitr-restore.sh "${PG_BACKUP_CONTAINER}:/tmp/pitr-restore.sh"
run_logged copy-pitr-verify-tool docker cp tools/pitr-verify.sh "${PG_BACKUP_CONTAINER}:/tmp/pitr-verify.sh"
run_logged pitr-restore compose_pg exec -T -u postgres \
  -e PBR_DEST_ROOT=/tmp/m15-pitr -e PBR_PORT=54329 -e PBR_STANZA=payesh -e PBR_DATABASE=payesh -e PGUSER=postgres \
  pg-backup bash /tmp/pitr-restore.sh --time "$PITR_TARGET"
PITR_DIR="$(sed -n 's/^PITR_READY dir=\([^ ]*\).*/\1/p' "$EVIDENCE_DIR/pitr-restore.log" | tail -n 1)"
if [[ ! "$PITR_DIR" =~ ^/tmp/m15-pitr/pitr-[A-Za-z0-9-]+$ ]]; then
  echo "isolated PITR restore directory was not reported" >&2
  exit 1
fi
run_logged pitr-restore-verify compose_pg exec -T -u postgres pg-backup bash /tmp/pitr-verify.sh \
  --host-dir "$PITR_DIR/run" --port 54329 --stanza payesh --target-spec "--type=time --target=$PITR_TARGET --target-action=promote"
PITR_VERIFY_EXIT="0"
run_logged pitr-restored-marker-check compose_pg exec -T -u postgres pg-backup psql -XAt -h "$PITR_DIR/run" -p 54329 -d payesh -c \
  "SELECT (SELECT count(*) FROM server_outbox WHERE type = 'm15.dr.before' AND payload->>'origin' = '${PITR_BEFORE_MARKER}') || '|' || (SELECT count(*) FROM server_outbox WHERE type = 'm15.dr.after' AND payload->>'origin' = '${PITR_AFTER_MARKER}');"
RESTORED_MARKERS="$(tr -d '\r\n' < "$EVIDENCE_DIR/pitr-restored-marker-check.log")"
if [[ "$RESTORED_MARKERS" != "1|0" ]]; then
  echo "PITR marker boundary mismatch: expected before=1 after=0; got $RESTORED_MARKERS" >&2
  exit 1
fi
PITR_BEFORE_PRESENT="true"
PITR_AFTER_ABSENT="true"
run_logged pitr-restored-current-schema-ledger-check compose_pg exec -T -u postgres pg-backup psql -XAt \
  -h "$PITR_DIR/run" -p 54329 -d payesh -c \
  "SELECT version || '|' || name || '|' || checksum FROM schema_migrations ORDER BY version ASC;"
PITR_SCHEMA_LEDGER="$(tr -d '\r' < "$EVIDENCE_DIR/pitr-restored-current-schema-ledger-check.log")"
PITR_SCHEMA_MIGRATION_COUNT="$(printf '%s\n' "$PITR_SCHEMA_LEDGER" | wc -l | tr -d ' ')"
PITR_SCHEMA_LATEST_MIGRATION="$(printf '%s\n' "$PITR_SCHEMA_LEDGER" | tail -n 1 | cut -d '|' -f 1)"
if [[ "$PITR_SCHEMA_LEDGER" != "$EXPECTED_SCHEMA_LEDGER" ]]; then
  echo "PITR-restored application schema ledger differs from the current migration catalog: expected_rows=$PG_SCHEMA_MIGRATION_COUNT expected_sha256=$PG_SCHEMA_EXPECTED_CATALOG_SHA" >&2
  exit 1
fi
PITR_SCHEMA_CATALOG_MATCH="true"
run_logged pitr-stop-restored-instance compose_pg exec -T -u postgres pg-backup pg_ctl \
  -D "$PITR_DIR/data" -m fast -w stop

FAILOVER_MARKER="m15-dr-failover-${RUN_KEY}"
PG_BACKUP_CONTAINER="$(compose_pg ps -q pg-backup)"
run_logged copy-pg-failover-tool docker cp tools/failover-postgres.sh "${PG_BACKUP_CONTAINER}:/tmp/failover-postgres.sh"
run_logged pre-failover-marker-insert compose_pg exec -T -u postgres pg-primary psql -X -v ON_ERROR_STOP=1 -d payesh -c \
  "INSERT INTO server_outbox (type, collection, payload, status) VALUES ('m15.dr.failover', 'm15_dr', jsonb_build_object('origin', '${FAILOVER_MARKER}'), 'processed');"
PRIMARY_REQUIRED_LSN="$(compose_pg exec -T -u postgres pg-primary psql -XAt -d payesh -c 'SELECT pg_current_wal_lsn();' | tr -d '\r\n')"
run_logged standby-replay-barrier wait_standby_caught_up "$PRIMARY_REQUIRED_LSN"
FAILOVER_START_MS="$(date +%s%3N)"
run_logged stop-primary compose_pg stop pg-primary
if run_logged promote-standby compose_pg exec -T -u postgres \
  -e PGHOST=pg-standby -e PGPORT=5432 -e PGDATABASE=payesh -e PGUSER=postgres \
  -e OLD_PGHOST=pg-primary -e OLD_PGPORT=5432 pg-backup bash /tmp/failover-postgres.sh; then
  PG_PROMOTION_STATE="primary_stopped_standby_promoted_by_failover_tool"
else
  echo "PostgreSQL failover tool rejected or failed the isolated promotion" >&2
  exit 1
fi
run_logged promoted-standby-role-check compose_pg exec -T -u postgres pg-standby psql -XAt -d payesh -c 'SELECT pg_is_in_recovery();'
PG_RECOVERY_STATE="$(tr -d '\r\n' < "$EVIDENCE_DIR/promoted-standby-role-check.log")"
if [[ "$PG_RECOVERY_STATE" != "f" ]]; then echo "promoted standby is still in recovery" >&2; exit 1; fi
run_logged promoted-standby-write compose_pg exec -T -u postgres pg-standby psql -X -v ON_ERROR_STOP=1 -d payesh -c \
  "INSERT INTO server_outbox (type, collection, payload, status) VALUES ('m15.dr.post_promote', 'm15_dr', jsonb_build_object('origin', '${FAILOVER_MARKER}'), 'processed');"
run_logged promoted-standby-readback compose_pg exec -T -u postgres pg-standby psql -XAt -d payesh -c \
  "SELECT count(*) FROM server_outbox WHERE type='m15.dr.failover' AND payload->>'origin'='${FAILOVER_MARKER}';"
if [[ "$(tr -d '\r\n' < "$EVIDENCE_DIR/promoted-standby-readback.log")" != "1" ]]; then
  echo "promoted standby did not retain the replicated pre-failover marker" >&2
  exit 1
fi
PG_POST_PROMOTION_WRITE="true"
PG_FAILOVER_RTO_MS="$(( $(date +%s%3N) - FAILOVER_START_MS ))"

run_logged redis-compose-version docker compose version
if ! assert_compose_project_unused "$REDIS_PROJECT"; then
  echo "Redis Sentinel Compose project identity is not unused; refusing cleanup or reuse" >&2
  exit 78
fi
REDIS_PROJECT_OWNED=1
run_logged redis-ha-start compose_redis up -d
redis_ready=0
for _ in $(seq 1 90); do
  if wait_redis_ready >/dev/null 2>&1; then redis_ready=1; break; fi
  sleep 2
done
if [[ "$redis_ready" != 1 ]]; then echo "Redis Sentinel stack did not become ready" >&2; exit 1; fi
run_logged redis-ha-readiness wait_redis_ready
run_logged redis-original-master redis_master_addr
REDIS_ORIGINAL_MASTER="$(paste -sd, "$EVIDENCE_DIR/redis-original-master.log")"
if [[ ! "$REDIS_ORIGINAL_MASTER" =~ ^[^,]+,6379$ ]]; then echo "unexpected Sentinel master address: $REDIS_ORIGINAL_MASTER" >&2; exit 1; fi
REDIS_DR_KEY="m15:dr:${RUN_KEY}:before"
REDIS_DR_VALUE="e3-${RUN_KEY}-replicated"
run_logged redis-marker-write compose_redis exec -T redis-master sh -ec \
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli SET "$1" "$2"' sh "$REDIS_DR_KEY" "$REDIS_DR_VALUE"
for service in redis-replica-1 redis-replica-2; do
  replica_value=""
  for _ in $(seq 1 60); do
    replica_value="$(compose_redis exec -T "$service" sh -ec \
      'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli GET "$1"' sh "$REDIS_DR_KEY" 2>/dev/null || true)"
    if [[ "$replica_value" == "$REDIS_DR_VALUE" ]]; then break; fi
    sleep 1
  done
  if [[ "$replica_value" != "$REDIS_DR_VALUE" ]]; then echo "$service did not receive the pre-failover test value" >&2; exit 1; fi
done
REDIS_REPLICA_CONTAINER="$(compose_redis ps -q redis-replica-1)"
run_logged copy-redis-failover-tool docker cp tools/failover-redis.sh "${REDIS_REPLICA_CONTAINER}:/tmp/failover-redis.sh"
run_logged stop-redis-master compose_redis stop redis-master
if run_logged redis-failover-tool compose_redis exec -T \
  -e SENTINELS=sentinel-1:26379,sentinel-2:26379,sentinel-3:26379 -e MASTER_NAME=mymaster \
  redis-replica-1 bash /tmp/failover-redis.sh; then
  REDIS_FAILOVER_TOOL_EXIT="0"
else
  REDIS_FAILOVER_TOOL_EXIT="$?"
fi
run_logged redis-wait-promoted-master wait_redis_promoted "$REDIS_ORIGINAL_MASTER"
REDIS_CURRENT_MASTER="$(sed -n 's/^PROMOTED_MASTER=//p' "$EVIDENCE_DIR/redis-wait-promoted-master.log" | tail -n 1)"
if [[ -z "$REDIS_CURRENT_MASTER" || "$REDIS_CURRENT_MASTER" == "$REDIS_ORIGINAL_MASTER" ]]; then
  echo "Sentinel did not change the master address" >&2
  exit 1
fi
if [[ "$REDIS_FAILOVER_TOOL_EXIT" != "0" ]] && grep -q 'زنده است' "$EVIDENCE_DIR/redis-failover-tool.log"; then
  REDIS_TOOL_PREEMPTED="true"
fi
REDIS_PROMOTED_MASTER="$REDIS_CURRENT_MASTER"
REDIS_NEW_HOST="${REDIS_CURRENT_MASTER%,*}"
REDIS_NEW_PORT="${REDIS_CURRENT_MASTER##*,}"
run_logged redis-promoted-data-check compose_redis exec -T redis-replica-1 sh -ec \
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -h "$1" -p "$2" GET "$3"' sh \
  "$REDIS_NEW_HOST" "$REDIS_NEW_PORT" "$REDIS_DR_KEY"
if [[ "$(tr -d '\r\n' < "$EVIDENCE_DIR/redis-promoted-data-check.log")" != "$REDIS_DR_VALUE" ]]; then
  echo "replicated Redis marker did not survive failover" >&2
  exit 1
fi
REDIS_DATA_SURVIVED="true"
REDIS_AFTER_KEY="m15:dr:${RUN_KEY}:after"
REDIS_AFTER_VALUE="e3-${RUN_KEY}-post-promotion"
run_logged redis-promoted-write compose_redis exec -T redis-replica-1 sh -ec \
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -h "$1" -p "$2" SET "$3" "$4"' sh \
  "$REDIS_NEW_HOST" "$REDIS_NEW_PORT" "$REDIS_AFTER_KEY" "$REDIS_AFTER_VALUE"
run_logged redis-promoted-write-readback compose_redis exec -T redis-replica-1 sh -ec \
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -h "$1" -p "$2" GET "$3"' sh \
  "$REDIS_NEW_HOST" "$REDIS_NEW_PORT" "$REDIS_AFTER_KEY"
if [[ "$(tr -d '\r\n' < "$EVIDENCE_DIR/redis-promoted-write-readback.log")" != "$REDIS_AFTER_VALUE" ]]; then
  echo "Redis write after Sentinel promotion was not readable" >&2
  exit 1
fi
REDIS_POST_PROMOTION_WRITE="true"

# A synthetic-only human-readable end summary is duplicated in command log.
printf '\nM15 DR PRE-CLEANUP COMPONENTS: postgres_pitr=PASS postgres_promote=PASS redis_sentinel=PASS sha=%s\n' "$SOURCE_SHA" | tee -a "$COMMAND_LOG"
STATUS="PASS"
EXIT_STATUS=0

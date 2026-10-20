#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "M15 runtime orchestrator is CI-only" >&2
  exit 78
fi
export M15_RUNTIME_ALLOW_CI=1

RUN_KEY="${M15_EVIDENCE_RUN:-a}"
if [[ ! "$RUN_KEY" =~ ^[a-z0-9]{1,8}$ ]]; then
  echo "M15_EVIDENCE_RUN must be a short lowercase alphanumeric key" >&2
  exit 64
fi
: "${RUNNER_TEMP:?GitHub Actions RUNNER_TEMP is required}"
: "${GITHUB_RUN_ID:?GitHub Actions run id is required}"
: "${GITHUB_RUN_ATTEMPT:?GitHub Actions run attempt is required}"
if [[ ! "$GITHUB_RUN_ID" =~ ^[0-9]{1,20}$ || ! "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]{1,8}$ ]]; then
  echo "GitHub run id/attempt is not a valid numeric isolation key" >&2
  exit 64
fi
RUN_INSTANCE="${RUN_KEY}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
M15_RUN_LABEL_KEY="io.payesh.m15-01.run"

EVIDENCE_DIR="$RUNNER_TEMP/m15-01-${RUN_INSTANCE}"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"
COMMAND_LOG="$EVIDENCE_DIR/commands.log"
: > "$COMMAND_LOG"
chmod 600 "$COMMAND_LOG"
TOKEN_FILE="$RUNNER_TEMP/m15-${RUN_INSTANCE}-metrics.token"
PROMETHEUS_FILE_GID="$(id -g)"
export M15_PROMETHEUS_FILE_GID="$PROMETHEUS_FILE_GID"
POSTGRES_ENV="$RUNNER_TEMP/m15-${RUN_INSTANCE}-postgres.env"
COMPOSE_ENV="$RUNNER_TEMP/m15-${RUN_INSTANCE}-compose.env"
API_ENV="$RUNNER_TEMP/m15-${RUN_INSTANCE}-api.env"
ROUTE_SPEC_FILE="$RUNNER_TEMP/m15-${RUN_INSTANCE}-route-spec.json"
ROUTE_RESULT_FILE="$RUNNER_TEMP/m15-${RUN_INSTANCE}-route-result.json"
COMPOSE_PROJECT="m15-01-${RUN_INSTANCE}"
API_IMAGE="m15-01-runtime:${RUN_INSTANCE}"
POSTGRES_PASSWORD=""
PG_ADMIN_URL=""
DB_CONTAINER="m15-postgres-${RUN_INSTANCE}"
REDIS_CONTAINER="m15-redis-${RUN_INSTANCE}"
MAIN_DB="payesh_m15_${RUN_KEY}_evidence"
P11_DB="payesh_m15_${RUN_KEY}_p11"
API_IMAGE_CREATED=0
DB_CONTAINER_CREATED=0
REDIS_CONTAINER_CREATED=0
OBSERVABILITY_PROJECT_CLAIMED=0
export M15_API_IMAGE="$API_IMAGE"
export M15_API_ENV_FILE="$API_ENV"
export M15_DATABASE_CONTAINER="$DB_CONTAINER"
export M15_ARTIFACT_PATH="$EVIDENCE_DIR/runtime-evidence.json"
export M15_CLEANUP_REPORT="$EVIDENCE_DIR/infrastructure-cleanup.json"
P11_DB_CREATED=0
MAIN_DB_CREATED=0
printf 'LOG_REDACTION: known secret values and sensitive assignments are replaced with [REDACTED].\n' > "$COMMAND_LOG"

format_command() {
  node tools/m15-01-log-redactor.js format-command "$@"
}

redact_file() {
  node tools/m15-01-log-redactor.js redact-file "$1"
}

run_logged() {
  local label="$1"
  local output="$RUNNER_TEMP/m15-${RUN_INSTANCE}-${label}.log"
  local command_status=0 redact_status=0 status=0 rendered
  shift
  rendered="$(format_command "$@")"
  printf '\nCOMMAND[%s]: %s\n' "$label" "$rendered" | tee -a "$COMMAND_LOG"
  set +e
  "$@" >"$output" 2>&1
  command_status=$?
  set -e
  chmod 600 "$output"
  set +e
  redact_file "$output"
  redact_status=$?
  set -e
  if [[ "$redact_status" == 0 ]]; then
    cat "$output" | tee -a "$COMMAND_LOG"
  else
    printf 'OUTPUT_REDACTION_FAILED[%s]: raw command output withheld\n' "$label" | tee -a "$COMMAND_LOG"
  fi
  rm -f "$output"
  status="$command_status"
  if [[ "$redact_status" != 0 ]]; then status=1; fi
  printf 'EXIT_CODE[%s]: %s\n' "$label" "$command_status" | tee -a "$COMMAND_LOG"
  if [[ "$redact_status" != 0 ]]; then printf 'LOG_REDACTION_EXIT_CODE[%s]: %s\n' "$label" "$redact_status" | tee -a "$COMMAND_LOG"; fi
  return "$status"
}

assert_compose_project_unused() {
  local project="$1" resources
  resources="$(docker ps --all --quiet --filter "label=com.docker.compose.project=${project}")" || {
    echo "Compose project ownership preflight failed while listing containers" >&2
    return 1
  }
  if [[ -n "$resources" ]]; then
    echo "Refusing to reuse or remove an existing M15 Compose project" >&2
    return 78
  fi
  resources="$(docker volume ls --quiet --filter "label=com.docker.compose.project=${project}")" || {
    echo "Compose project ownership preflight failed while listing volumes" >&2
    return 1
  }
  if [[ -n "$resources" ]]; then
    echo "Refusing to reuse or remove an existing M15 Compose project" >&2
    return 78
  fi
  resources="$(docker network ls --quiet --filter "label=com.docker.compose.project=${project}")" || {
    echo "Compose project ownership preflight failed while listing networks" >&2
    return 1
  }
  if [[ -n "$resources" ]]; then
    echo "Refusing to reuse or remove an existing M15 Compose project" >&2
    return 78
  fi
}

cleanup() {
  local original_status=$?
  trap - EXIT
  set +e
  local cleanup_status=0
  local -a cleanup_steps=()

  cleanup_cmd() {
    local label="$1"
    shift
    local output="$RUNNER_TEMP/m15-${RUN_INSTANCE}-cleanup-${label}.log"
    local rendered command_status redact_status status
    rendered="$(format_command "$@")"
    printf '\nCOMMAND[cleanup-%s]: %s\n' "$label" "$rendered" >> "$COMMAND_LOG"
    "$@" >"$output" 2>&1
    command_status=$?
    chmod 600 "$output"
    redact_file "$output"
    redact_status=$?
    if [[ "$redact_status" == 0 ]]; then
      cat "$output" >> "$COMMAND_LOG"
    else
      printf 'OUTPUT_REDACTION_FAILED[cleanup-%s]: raw command output withheld\n' "$label" >> "$COMMAND_LOG"
    fi
    rm -f "$output"
    status="$command_status"
    if [[ "$redact_status" != 0 ]]; then status=1; fi
    printf 'EXIT_CODE[cleanup-%s]: %s\n' "$label" "$command_status" >> "$COMMAND_LOG"
    if [[ "$redact_status" != 0 ]]; then printf 'LOG_REDACTION_EXIT_CODE[cleanup-%s]: %s\n' "$label" "$redact_status" >> "$COMMAND_LOG"; fi
    cleanup_steps+=("${label}=${status}")
    if [[ "$status" != 0 ]]; then cleanup_status=1; fi
  }

  remove_container_if_present() {
    local name="$1" owner
    if docker inspect "$name" >/dev/null 2>&1; then
      owner="$(docker inspect --format="{{ index .Config.Labels \"${M15_RUN_LABEL_KEY}\" }}" "$name" 2>/dev/null || true)"
      if [[ "$owner" == "$RUN_INSTANCE" ]]; then
        cleanup_cmd "remove-${name}" docker rm -f "$name"
      else
        printf 'REFUSED_CONTAINER_CLEANUP[%s]: ownership label did not match this run; container left untouched\\n' "$name" >> "$COMMAND_LOG"
        cleanup_steps+=("refused-remove-${name}=1")
        cleanup_status=1
      fi
    fi
  }

  if [[ "$OBSERVABILITY_PROJECT_CLAIMED" == 1 && -f "$COMPOSE_ENV" ]]; then
    cleanup_cmd observability-compose-down docker compose -p "$COMPOSE_PROJECT" --env-file "$COMPOSE_ENV" \
      -f infra/observability/docker-compose.observability.yml \
      -f infra/observability/docker-compose.m15-ci.yml down --volumes --remove-orphans
  fi

  for name in \
    "m15-api-initial-${RUN_INSTANCE}" "m15-api-restart-${RUN_INSTANCE}" "m15-api-replay-${RUN_INSTANCE}" \
    "m15-load-${RUN_INSTANCE}-0" "m15-load-${RUN_INSTANCE}-1" "m15-load-${RUN_INSTANCE}-2" \
    "m15-load-${RUN_INSTANCE}-3" "m15-load-${RUN_INSTANCE}-4"; do
    remove_container_if_present "$name"
  done
  if [[ "$REDIS_CONTAINER_CREATED" == 1 ]]; then remove_container_if_present "$REDIS_CONTAINER"; fi

  if [[ "$P11_DB_CREATED" == 1 ]]; then
    cleanup_cmd drop-p11-database node tools/m15-01-ci-db.js drop "$P11_DB"
  fi
  if [[ "$MAIN_DB_CREATED" == 1 ]]; then
    cleanup_cmd drop-evidence-database node tools/m15-01-ci-db.js drop "$MAIN_DB"
  fi
  if [[ "$DB_CONTAINER_CREATED" == 1 ]]; then remove_container_if_present "$DB_CONTAINER"; fi
  if [[ "$API_IMAGE_CREATED" == 1 ]] && docker image inspect "$API_IMAGE" >/dev/null 2>&1; then
    local image_owner
    image_owner="$(docker image inspect --format="{{ index .Config.Labels \"${M15_RUN_LABEL_KEY}\" }}" "$API_IMAGE" 2>/dev/null || true)"
    if [[ "$image_owner" == "$RUN_INSTANCE" ]]; then
      cleanup_cmd remove-isolated-runtime-image docker image rm "$API_IMAGE"
    else
      printf 'REFUSED_IMAGE_CLEANUP[%s]: ownership label did not match this run; image left untouched\\n' "$API_IMAGE" >> "$COMMAND_LOG"
      cleanup_steps+=("refused-remove-image-${RUN_INSTANCE}=1")
      cleanup_status=1
    fi
  fi

  for secret_file in "$POSTGRES_ENV" "$COMPOSE_ENV" "$API_ENV" "$TOKEN_FILE"; do
    if [[ -f "$secret_file" ]]; then cleanup_cmd "remove-secret-$(basename "$secret_file")" rm -f "$secret_file"; fi
  done
  for transient_file in "$ROUTE_SPEC_FILE" "$ROUTE_RESULT_FILE"; do
    if [[ -f "$transient_file" ]]; then cleanup_cmd "remove-transient-$(basename "$transient_file")" rm -f "$transient_file"; fi
  done

  local cleanup_steps_text
  cleanup_steps_text="$(printf '%s\n' "${cleanup_steps[@]}")"
  M15_CLEANUP_STEPS="$cleanup_steps_text" M15_CLEANUP_STATUS="$cleanup_status" \
    M15_ORIGINAL_EXIT="$original_status" M15_RUN_KEY="$RUN_KEY" M15_SOURCE_SHA="$(git rev-parse HEAD 2>/dev/null)" \
    node - "$M15_CLEANUP_REPORT" "$M15_ARTIFACT_PATH" <<'NODE'
const fs = require('fs');
const path = require('path');
const cleanupPath = process.argv[2];
const runtimePath = process.argv[3];
const steps = String(process.env.M15_CLEANUP_STEPS || '').split(/\r?\n/).filter(Boolean).map((line) => {
  const i = line.lastIndexOf('=');
  return { action: i < 0 ? line : line.slice(0, i), exit_code: i < 0 ? null : Number(line.slice(i + 1)) };
});
const cleanupStatus = Number(process.env.M15_CLEANUP_STATUS) || 0;
const cleanup = {
  schema_version: 1,
  mission: 'M15-01',
  run_key: process.env.M15_RUN_KEY || null,
  source_sha: process.env.M15_SOURCE_SHA || null,
  recorded_at: new Date().toISOString(),
  status: cleanupStatus === 0 ? 'PASS' : 'FAIL',
  exit_code: cleanupStatus,
  runtime_command_exit_code: Number(process.env.M15_ORIGINAL_EXIT) || 0,
  actions: steps
};
fs.mkdirSync(path.dirname(cleanupPath), { recursive: true });
fs.writeFileSync(cleanupPath, JSON.stringify(cleanup, null, 2) + '\n', { mode: 0o600 });
if (fs.existsSync(runtimePath)) {
  try {
    const report = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
    report.infrastructure_cleanup = cleanup;
    if (cleanupStatus !== 0) {
      report.status = 'FAIL';
      report.exit_code = 1;
      report.failure = report.failure || {
        code: 'infrastructure_cleanup_failed',
        message: 'one or more isolated E3 containers, databases, or protected temporary files did not clean up'
      };
    }
    fs.writeFileSync(runtimePath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  } catch (error) {
    console.error('Could not update M15 runtime evidence after infrastructure cleanup');
    process.exitCode = 1;
  }
}
console.log('M15 infrastructure cleanup: ' + cleanup.status + ' · exit=' + cleanup.exit_code
  + ' · SHA=' + (cleanup.source_sha || 'unbound'));
NODE
  local report_status=$?
  if [[ "$report_status" != 0 ]]; then cleanup_status=1; fi
  if [[ "$original_status" == 0 && "$cleanup_status" != 0 ]]; then original_status=1; fi
  exit "$original_status"
}
trap cleanup EXIT

export TZ=UTC
export NODE_ENV=test
export PAYESH_ENV=test
export PAYESH_DEV_OTP_BYPASS=1
export PAYESH_METRICS_INTERVAL_MS=5000
export PAYESH_WORKER_INTERVAL_MS=3600000
export PAYESH_OUTBOX_RETENTION_INTERVAL_S=3600
export M15_RUN_INSTANCE="$RUN_INSTANCE"
export PAYESH_INSTANCE_ID="m15-e3-api-${RUN_INSTANCE}"
export PAYESH_CACHE_DURABLE_INVALIDATION=on
export HOST=0.0.0.0
export PORT=3000
export M15_ROUTE_SECONDS="${M15_ROUTE_SECONDS:-5}"
export M15_ROUTE_CONCURRENCY="${M15_ROUTE_CONCURRENCY:-2}"
export M15_REDIS_CONTAINER="$REDIS_CONTAINER"
export M15_BASE_URL=http://127.0.0.1:3000
export M15_PROMETHEUS_URL=http://127.0.0.1:9090
export M15_ALERTMANAGER_URL=http://127.0.0.1:9093
export M15_ALERT_RECEIVER_URL=http://127.0.0.1:18080/health
export M15_ALERT_EVENTS_FILE="$EVIDENCE_DIR/alertmanager-events.jsonl"
export M15_METRICS_TOKEN_FILE="$TOKEN_FILE"
export PAYESH_METRICS_TOKEN_FILE="$TOKEN_FILE"
export PAYESH_METRICS_TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
export PAYESH_JWT_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
export POSTGRES_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
export PG_ADMIN_URL="postgres://payesh:${POSTGRES_PASSWORD}@127.0.0.1:5432/payesh_ci"
printf '%s' "$PAYESH_METRICS_TOKEN" > "$TOKEN_FILE"
chmod 640 "$TOKEN_FILE"
cat > "$POSTGRES_ENV" <<EOF
POSTGRES_USER=payesh
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=payesh_ci
EOF
chmod 600 "$POSTGRES_ENV"

if docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "Refusing to reuse a pre-existing PostgreSQL container name for this M15 run" >&2
  exit 78
fi
if run_logged start-postgres docker run --detach --name "$DB_CONTAINER" --label "$M15_RUN_LABEL_KEY=$RUN_INSTANCE" \
  --cpus=0.5 --memory=1g --pids-limit=128 \
  --publish 127.0.0.1:5432:5432 --env-file "$POSTGRES_ENV" \
  --health-cmd 'pg_isready -U payesh -d payesh_ci' --health-interval 5s --health-timeout 5s --health-retries 20 \
  --restart=no postgres:17.11-bookworm; then
  DB_CONTAINER_CREATED=1
else
  if docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then DB_CONTAINER_CREATED=1; fi
  exit 1
fi
postgres_ready=0
for _ in $(seq 1 60); do
  if [[ "$(docker inspect --format='{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || true)" == healthy ]]; then postgres_ready=1; break; fi
  sleep 1
done
if [[ "$postgres_ready" != 1 ]]; then
  printf 'EXIT_CODE[postgres-health]: 1\n' | tee -a "$COMMAND_LOG"
  echo "PostgreSQL resource container did not become healthy" >&2
  exit 1
fi
printf 'COMMAND[postgres-health]: docker inspect --format={{.State.Health.Status}} %s\nhealthy\nEXIT_CODE[postgres-health]: 0\n' "$DB_CONTAINER" | tee -a "$COMMAND_LOG"

run_logged create-p11-database node tools/m15-01-ci-db.js create "$P11_DB"
P11_DB_CREATED=1
export P11_LIVE_PG="postgres://payesh:${POSTGRES_PASSWORD}@127.0.0.1:5432/${P11_DB}"
run_logged p11-phone-auth-live node tests/p11-phone-auth-live.js
unset P11_LIVE_PG
run_logged drop-p11-database node tools/m15-01-ci-db.js drop "$P11_DB"
P11_DB_CREATED=0

run_logged create-evidence-database node tools/m15-01-ci-db.js create "$MAIN_DB"
MAIN_DB_CREATED=1
export DATABASE_URL="postgres://payesh:${POSTGRES_PASSWORD}@127.0.0.1:5432/${MAIN_DB}"
export REDIS_URL=redis://127.0.0.1:6379/0
run_logged migrate-current-schema node tools/migrate-ledger.js up
run_logged generate-deterministic-demo-seed node server/seed.js
export M15_CI_SEED_PROFILE=runtime
run_logged seed-current-schema-relational-fixture node tools/m15-01-ci-seed.js
unset M15_CI_SEED_PROFILE

if docker inspect "$REDIS_CONTAINER" >/dev/null 2>&1; then
  echo "Refusing to reuse a pre-existing Redis container name for this M15 run" >&2
  exit 78
fi
if run_logged start-ephemeral-redis docker run --detach --name "$REDIS_CONTAINER" --label "$M15_RUN_LABEL_KEY=$RUN_INSTANCE" \
  --cpus=0.25 --memory=256m --pids-limit=128 \
  --publish 127.0.0.1:6379:6379 \
  --health-cmd 'redis-cli ping' --health-interval 2s --health-timeout 2s --health-retries 30 \
  --restart=no redis:8.0.2-alpine; then
  REDIS_CONTAINER_CREATED=1
else
  if docker inspect "$REDIS_CONTAINER" >/dev/null 2>&1; then REDIS_CONTAINER_CREATED=1; fi
  exit 1
fi
redis_ready=0
for _ in $(seq 1 30); do
  if docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; then redis_ready=1; break; fi
  sleep 1
done
if [[ "$redis_ready" != 1 ]]; then
  echo "EXIT_CODE[redis-health]: 1" | tee -a "$COMMAND_LOG"
  echo "Redis ephemeral container did not become ready" >&2
  exit 1
fi
printf 'COMMAND[redis-health]: docker exec %s redis-cli ping\nPONG\nEXIT_CODE[redis-health]: 0\n' "$REDIS_CONTAINER" | tee -a "$COMMAND_LOG"

cat > "$API_ENV" <<EOF
TZ=UTC
NODE_ENV=test
PAYESH_ENV=test
PAYESH_DEV_OTP_BYPASS=1
PAYESH_METRICS_INTERVAL_MS=5000
PAYESH_WORKER_INTERVAL_MS=3600000
PAYESH_OUTBOX_RETENTION_INTERVAL_S=3600
PAYESH_INSTANCE_ID=$PAYESH_INSTANCE_ID
PAYESH_CACHE_DURABLE_INVALIDATION=on
PAYESH_METRICS_TOKEN=$PAYESH_METRICS_TOKEN
PAYESH_JWT_SECRET=$PAYESH_JWT_SECRET
DATABASE_URL=$DATABASE_URL
REDIS_URL=$REDIS_URL
HOST=0.0.0.0
PORT=3000
EOF
chmod 600 "$API_ENV"

cat > "$COMPOSE_ENV" <<EOF
PAYESH_METRICS_TOKEN_FILE=$TOKEN_FILE
M15_PROMETHEUS_FILE_GID=$PROMETHEUS_FILE_GID
M15_RUN_INSTANCE=$RUN_INSTANCE
ALERTMANAGER_WEBHOOK_URL=http://host.docker.internal:18080/alerts
GRAFANA_PASSWORD=ci-only-not-a-secret
PAYESH_LOG_DIR=$RUNNER_TEMP
EOF
chmod 600 "$COMPOSE_ENV"

export M15_API_IMAGE="$API_IMAGE"
export M15_API_ENV_FILE="$API_ENV"
export M15_DATABASE_CONTAINER="$DB_CONTAINER"
export M15_API_CONTAINER="m15-api-initial-${RUN_INSTANCE}"
export M15_API_RESTART_CONTAINER="m15-api-restart-${RUN_INSTANCE}"
export M15_API_REPLAY_CONTAINER="m15-api-replay-${RUN_INSTANCE}"
export M15_ROUTE_SPEC_FILE="$ROUTE_SPEC_FILE"
export M15_ROUTE_RESULT_FILE="$ROUTE_RESULT_FILE"

if docker image inspect "$API_IMAGE" >/dev/null 2>&1; then
  echo "Refusing to reuse a pre-existing M15 runtime image tag" >&2
  exit 78
fi
if run_logged build-isolated-api-and-load-generator-image docker build --file tools/m15-01-runtime.Dockerfile \
  --build-arg "M15_RUN_INSTANCE=$RUN_INSTANCE" --tag "$API_IMAGE" .; then
  API_IMAGE_CREATED=1
else
  image_owner="$(docker image inspect --format="{{ index .Config.Labels \"${M15_RUN_LABEL_KEY}\" }}" "$API_IMAGE" 2>/dev/null || true)"
  if [[ "$image_owner" == "$RUN_INSTANCE" ]]; then API_IMAGE_CREATED=1; fi
  exit 1
fi
assert_compose_project_unused "$COMPOSE_PROJECT"
OBSERVABILITY_PROJECT_CLAIMED=1
run_logged start-prometheus-alertmanager docker compose -p "$COMPOSE_PROJECT" --env-file "$COMPOSE_ENV" \
  -f infra/observability/docker-compose.observability.yml \
  -f infra/observability/docker-compose.m15-ci.yml up -d --no-deps prometheus alertmanager
run_logged isolated-e3-runtime-evidence node tools/m15-01-runtime-evidence.js

echo "M15 E3 evidence files: $EVIDENCE_DIR"

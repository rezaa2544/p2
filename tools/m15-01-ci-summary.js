#!/usr/bin/env node
'use strict';

/* Render a deliberately bounded, secret-free Actions summary from M15 artifacts.
 * This is a status pointer only; it never upgrades evidence or changes the job result. */
const fs = require('fs');
const path = require('path');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}

function safeEnum(value, allowed, fallback = 'UNKNOWN') {
  const text = String(value == null ? '' : value);
  return allowed.includes(text) ? text : fallback;
}

function safeSha(value) {
  const text = String(value == null ? '' : value);
  return /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(text) ? text : 'unavailable';
}

function safeNumber(value) {
  const num = Number(value);
  return value != null && value !== '' && Number.isFinite(num) ? num : null;
}

function safeBool(value) {
  return typeof value === 'boolean' ? value : null;
}

function safeId(value) {
  const text = String(value == null ? '' : value);
  return /^[A-Za-z0-9_,.:/+~-]{1,80}$/.test(text) ? text : null;
}

function createDigest(kind, directory) {
  if (!['runtime', 'dr'].includes(kind)) throw new Error('summary_kind_invalid');
  const dir = path.resolve(String(directory || ''));
  const report = readJson(path.join(dir, kind === 'runtime' ? 'runtime-evidence.json' : 'dr-runtime-evidence.json'));
  const cleanup = kind === 'runtime' ? readJson(path.join(dir, 'infrastructure-cleanup.json')) : null;
  const failures = failedStages(path.join(dir, 'commands.log'));
  if (kind === 'runtime') {
    const queue = report && report.queue || {};
    const restart = queue.restart || {};
    const indep = queue.independent_replay || {};
    const plan = report && report.database && report.database.query_plans && report.database.query_plans.phone_auth_lookup || {};
    const scope = report && report.database && report.database.manager_principal_province_scope || {};
    const alert = report && report.alertmanager || {};
    const redis = report && report.redis || {};
    return {
      kind: 'runtime',
      status: safeEnum(report && report.status, ['PASS', 'FAIL', 'RUNNING']),
      evidence_level: safeEnum(report && report.evidence_level, ['E3'], 'UNKNOWN'),
      mission_disposition: safeId(report && report.mission_disposition),
      source_sha: safeSha(report && report.source_sha),
      exit_code: safeNumber(report && report.exit_code),
      failed_stages: failures.slice(0, 5),
      migrations: report && report.database && report.database.migrations || null,
      tenant_province_scope: {
        resolved: safeBool(scope.province_scope_resolved),
        policy_present: safeBool(scope.tenant_policy_present),
        policy_valid: safeBool(scope.tenant_policy_valid)
      },
      p11_plan: {
        index_used: safeBool(plan.index_used),
        users_seq_scan: safeBool(plan.users_sequential_scan),
        exec_ms: safeNumber(plan.execution_time_ms)
      },
      routes_count: Array.isArray(report && report.routes) ? report.routes.length : 0,
      routes: Array.isArray(report && report.routes) ? report.routes.slice(0, 6).map((r) => ({
        route: safeId(r && r.route_template),
        requests: safeNumber(r && r.successes),
        rps: safeNumber(r && r.rps),
        p95_ms: safeNumber(r && r.latency_ms && r.latency_ms.p95),
        counter_delta: safeNumber(r && r.server_counter_delta)
      })) : [],
      queue: {
        event_id: safeNumber(queue.event_id),
        event_persisted_pending: safeBool(queue.event_persisted_pending),
        timer_path_tested: safeBool(queue.timer_path_tested),
        process_restart_replay_tested: safeBool(queue.process_restart_replay_tested),
        status_after_restart_timer: safeId(queue.status_after_restart_timer),
        after_backlog_depth: safeNumber(queue.after_cache_outbox_backlog_depth),
        restart: {
          prior_host_pid: safeNumber(restart.prior_host_pid),
          restarted_host_pid: safeNumber(restart.restarted_host_pid),
          instance_id_preserved: safeBool(restart.instance_id_preserved),
          worker_instance_id: safeId(restart.worker_instance_id),
          worker_timer_active: safeBool(restart.worker_timer_active),
          worker_interval_ms: safeNumber(restart.worker_interval_ms),
          processed_total: safeNumber(restart.cache_replication_processed_total),
          watermark_target_id: safeNumber(restart.cache_replication_last_watermark_target_id),
          watermark_advance_ok: safeBool(restart.cache_replication_last_watermark_advance_ok),
          watermark: safeNumber(restart.watermark),
          event_status: safeId(restart.event_status),
          event_retry_count: safeNumber(restart.event_retry_count)
        },
        independent_replay: {
          consumers: safeNumber(indep.consumers),
          all_processed: safeBool(indep.all_processed),
          watermarks_reached_event_id: safeBool(indep.watermarks_reached_event_id),
          processes: Array.isArray(indep.api_processes) ? indep.api_processes.slice(0, 2).map((p) => ({
            instance_id: safeId(p && p.instance_id),
            worker_instance_id: safeId(p && p.worker_instance_id),
            host_pid: safeNumber(p && p.host_pid),
            worker_timer_active: safeBool(p && p.worker_timer_active),
            cache_replication_enabled: safeBool(p && p.cache_replication_enabled),
            processed_total: safeNumber(p && p.cache_replication_processed_total),
            watermark: safeNumber(p && p.watermark)
          })) : []
        }
      },
      alert_recovery: {
        redis_down_metric: safeNumber(redis.failure_injection && redis.failure_injection.down_metric),
        firing_webhook: safeBool(alert.webhook_delivered),
        redis_recovered_up: safeNumber(redis.recovery && redis.recovery.redis_up),
        rule_resolved: safeBool(alert.prometheus_rule_resolved),
        resolved_webhook: safeBool(alert.webhook_resolved_delivered)
      },
      cleanup_status: cleanup ? safeEnum(cleanup.status, ['PASS', 'FAIL', 'RUNNING']) : 'MISSING'
    };
  }
  const pg = report && report.postgres || {};
  const pitr = pg.pitr || {};
  const failover = pg.failover || {};
  const sentinel = report && report.redis_sentinel || {};
  const cmdLog = report && report.command_log || {};
  return {
    kind: 'dr',
    status: safeEnum(report && report.status, ['PASS', 'FAIL', 'RUNNING']),
    evidence_level: safeEnum(report && report.evidence_level, ['E3'], 'UNKNOWN'),
    mission_disposition: safeId(report && report.mission_disposition),
    source_sha: safeSha(report && report.source_sha),
    exit_code: safeNumber(report && report.exit_code),
    failed_stages: failures.slice(0, 5),
    postgres: {
      migration_count: safeId(pg.schema && pg.schema.migration_count),
      latest_migration: safeId(pg.schema && pg.schema.latest_migration),
      catalog_sha256: safeSha(pg.schema && pg.schema.current_migration_catalog_sha256),
      catalog_verified: safeBool(pg.schema && pg.schema.verified_against_current_migration_catalog),
      pgbackrest_debian_version: safeId(pg.pgbackrest_debian_package_version),
      pgbackrest_matches_build_record: safeBool(pg.pgbackrest_package_version_matches_build_record),
      standby_streaming: safeId(pg.standby_streaming_before_failure),
      full_backup_status: safeId(pg.full_backup_status),
      wal_archive_status: safeId(pg.wal_archive_after_synthetic_markers),
      pitr: {
        before_marker_restored: safeId(pitr.before_marker_restored),
        after_marker_excluded: safeId(pitr.after_marker_excluded),
        verify_exit_code: safeId(pitr.verify_script_exit_code),
        restored_catalog_verified: safeBool(pitr.restored_application_schema && pitr.restored_application_schema.verified_against_current_migration_catalog)
      },
      failover: {
        promotion_state: safeId(failover.primary_stopped_before_promotion),
        post_promotion_write: safeId(failover.promoted_standby_writable_after_promotion),
        rto_ms: safeId(failover.promotion_to_verified_direct_write_ms),
        pgbouncer_reroute_tested: safeBool(failover.pgbouncer_endpoint_reroute_tested)
      }
    },
    redis_sentinel: {
      original_master: safeId(sentinel.original_master),
      promoted_master: safeId(sentinel.promoted_master),
      failover_helper_exit_code: safeId(sentinel.failover_helper_exit_code),
      helper_preempted: safeId(sentinel.helper_preempted_by_automatic_sentinel_failover),
      replicated_value_survived: safeId(sentinel.replicated_value_survived),
      post_promotion_write_verified: safeId(sentinel.post_promotion_write_verified)
    },
    cleanup: {
      cleanup_exit_code: safeNumber(cmdLog.cleanup_exit_code),
      compose_env_removed: safeBool(cmdLog.compose_env_removed),
      raw_output_removed: safeBool(cmdLog.raw_output_directory_removed),
      commands_log_sha256: safeSha(cmdLog.sha256)
    }
  };
}

function failedStages(file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return []; }
  const found = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^EXIT_CODE\[([a-zA-Z0-9_.-]{1,100})\]:\s*(-?\d{1,3})\s*$/);
    if (match && Number(match[2]) !== 0) found.push({ name: match[1], exitCode: Number(match[2]) });
    const redaction = line.match(/^(?:LOG_REDACTION_EXIT_CODE|OUTPUT_REDACTION_EXIT_CODE)\[([a-zA-Z0-9_.-]{1,100})\]:\s*(-?\d{1,3})\s*$/);
    if (redaction && Number(redaction[2]) !== 0) found.push({ name: redaction[1] + '-redaction', exitCode: Number(redaction[2]) });
  }
  return found;
}

function createSummary(kind, directory) {
  if (!['runtime', 'dr'].includes(kind)) throw new Error('summary_kind_invalid');
  const dir = path.resolve(String(directory || ''));
  const report = readJson(path.join(dir, kind === 'runtime' ? 'runtime-evidence.json' : 'dr-runtime-evidence.json'));
  const cleanup = kind === 'runtime' ? readJson(path.join(dir, 'infrastructure-cleanup.json')) : null;
  const failures = failedStages(path.join(dir, 'commands.log'));
  const status = safeEnum(report && report.status, ['PASS', 'FAIL', 'RUNNING']);
  const sourceSha = safeSha(report && report.source_sha);
  const lines = [
    `## M15-01 ${kind === 'runtime' ? 'isolated runtime' : 'disposable DR'} status summary`,
    '',
    `- Evidence report: **${report ? status : 'MISSING'}**`,
    `- Source SHA: \`${sourceSha}\``,
    `- First failed command stage: ${failures.length ? `\`${failures[0].name}\` (exit ${failures[0].exitCode})` : 'none recorded'}`,
    `- Failed command stages recorded: ${failures.length}`
  ];
  if (report && report.exit_code != null && /^-?\d{1,3}$/.test(String(report.exit_code))) {
    lines.push(`- Evidence exit code: ${Number(report.exit_code)}`);
  }
  if (kind === 'runtime') {
    const code = report && report.failure ? String(report.failure.code || '') : '';
    lines.push(`- Failure code: ${/^[a-zA-Z0-9_.:-]{1,120}$/.test(code) ? `\`${code}\`` : report && status === 'FAIL' ? 'withheld/unavailable' : 'none'}`);
    lines.push(`- Cleanup report: **${cleanup ? safeEnum(cleanup.status, ['PASS', 'FAIL', 'RUNNING']) : 'MISSING'}**`);
  } else {
    const pitr = report && report.postgres && report.postgres.pitr;
    const pgFailover = report && report.postgres && report.postgres.failover;
    const redis = report && report.redis_sentinel;
    const short = (value) => safeEnum(value, ['true', 'false', 'NOT_RUN', 'PASS', 'FAIL', '0', '1']);
    lines.push(`- PITR before-marker restored / after-marker excluded: ${pitr ? `${short(pitr.before_marker_restored)} / ${short(pitr.after_marker_excluded)}` : 'not recorded'}`);
    lines.push(`- PostgreSQL promotion write verified: ${pgFailover ? short(pgFailover.promoted_standby_writable_after_promotion) : 'not recorded'}`);
    lines.push(`- Redis Sentinel post-promotion write verified: ${redis ? short(redis.post_promotion_write_verified) : 'not recorded'}`);
  }
  lines.push('', '> Single GitHub-runner CI summary only; not independent review, production readiness, or E4 evidence.');
  return lines.join('\n') + '\n';
}

function main(argv = process.argv) {
  const kind = argv[2];
  const directory = argv[3];
  const runnerTemp = process.env.RUNNER_TEMP && path.resolve(process.env.RUNNER_TEMP);
  const target = path.resolve(String(directory || ''));
  if (!runnerTemp || !target.startsWith(runnerTemp + path.sep)) throw new Error('summary_artifact_path_not_under_runner_temp');
  const summary = createSummary(kind, target);
  const digest = JSON.stringify(createDigest(kind, target))
    .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) fs.appendFileSync(summaryFile, summary, { mode: 0o600 });
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    const statusMatch = summary.match(/Evidence report: \*\*([A-Z]+)\*\*/);
    const stageMatch = summary.match(/First failed command stage: `([A-Za-z0-9_.-]{1,100})`/);
    const codeMatch = summary.match(/Failure code: `([A-Za-z0-9_.:-]{1,120})`/);
    const slug = (value, fallback = 'none') => /^[A-Za-z0-9_.-]{1,64}$/.test(String(value || '')) ? String(value) : fallback;
    const resolvedStatus = slug(statusMatch && statusMatch[1], 'UNKNOWN');
    const values = {
      status: resolvedStatus,
      failure_code: slug(codeMatch && codeMatch[1], resolvedStatus === 'PASS' ? 'none' : 'unknown'),
      failed_stage: slug(stageMatch && stageMatch[1], 'none')
    };
    fs.appendFileSync(outputFile, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
  }
  process.stdout.write(`::notice title=M15-01 ${kind} verified digest::${digest}\n`);
  process.stdout.write(summary);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('M15 CI status summary unavailable: ' + String(error && error.message || 'summary_error'));
    process.exitCode = 0; // diagnostic only; never masks the evidence job's result.
  }
}

module.exports = { createSummary, createDigest, failedStages, safeEnum, safeSha };

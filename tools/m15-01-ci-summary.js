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
    const code = report && report.failure && String(report.failure.code || '');
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
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) fs.appendFileSync(summaryFile, summary, { mode: 0o600 });
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    const statusMatch = summary.match(/Evidence report: \*\*([A-Z]+)\*\*/);
    const stageMatch = summary.match(/First failed command stage: `([A-Za-z0-9_.-]{1,100})`/);
    const codeMatch = summary.match(/Failure code: `([A-Za-z0-9_.:-]{1,120})`/);
    const slug = (value, fallback) => /^[A-Za-z0-9_.-]{1,64}$/.test(String(value || '')) ? String(value) : fallback;
    const values = {
      status: slug(statusMatch && statusMatch[1], 'UNKNOWN'),
      failure_code: slug(codeMatch && codeMatch[1], 'unknown'),
      failed_stage: slug(stageMatch && stageMatch[1], 'none')
    };
    fs.appendFileSync(outputFile, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
  }
  process.stdout.write(summary);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('M15 CI status summary unavailable: ' + String(error && error.message || 'summary_error'));
    process.exitCode = 0; // diagnostic only; never masks the evidence job's result.
  }
}

module.exports = { createSummary, failedStages, safeEnum, safeSha };

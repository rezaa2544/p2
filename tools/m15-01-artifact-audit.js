#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SECRET_PATTERNS = [
  /postgres(?:ql)?:\/\/[^:\s[\]]+:[^@\s[\]]+@/i,
  /redis:\/\/:[^@\s[\]]+@/i,
  /Authorization:\s*Bearer\s+(?!\[REDACTED)[A-Za-z0-9._~+/=-]{12,}/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/
];

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function githubHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'payesh-m15-01-artifact-audit'
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
}

async function fetchGithubJson(apiBase, endpointPath, token) {
  const res = await fetch(apiBase.replace(/\/+$/, '') + endpointPath, {
    redirect: 'follow',
    headers: githubHeaders(token)
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_err) {
    json = null;
  }
  return { status: res.status, ok: res.ok, json };
}

async function downloadArtifactZip(apiBase, repo, artifactId, token) {
  const url = apiBase.replace(/\/+$/, '') + '/repos/' + repo + '/actions/artifacts/' + artifactId + '/zip';
  const res = await fetch(url, {
    redirect: 'manual',
    headers: githubHeaders(token)
  });
  if (res.status === 200) {
    const ab = await res.arrayBuffer();
    return { ok: true, status: 200, redirect_host: null, buffer: Buffer.from(ab) };
  }
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get('location');
    if (!location) {
      return { ok: false, status: res.status, error: 'missing_redirect_location' };
    }
    const redirectHost = new URL(location).host;
    // Strip GitHub Authorization header when following pre-signed Azure Blob URL.
    const blobRes = await fetch(location, { redirect: 'follow' });
    if (!blobRes.ok) {
      return { ok: false, status: blobRes.status, redirect_host: redirectHost, error: 'blob_download_http_' + blobRes.status };
    }
    const ab = await blobRes.arrayBuffer();
    return { ok: true, status: blobRes.status, redirect_host: redirectHost, buffer: Buffer.from(ab) };
  }
  return { ok: false, status: res.status, error: 'artifact_metadata_http_' + res.status };
}

function walkFilesSorted(rootDir, currentDir) {
  const out = [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.resolve(currentDir, entry.name);
    if (!full.startsWith(path.resolve(rootDir) + path.sep)) {
      throw new Error('zip_slip_detected:' + entry.name);
    }
    if (entry.isDirectory()) {
      for (const child of walkFilesSorted(rootDir, full)) out.push(child);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function countSecretHits(text) {
  let hits = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (SECRET_PATTERNS.some((re) => re.test(line))) hits += 1;
  }
  return hits;
}

function auditZipBuffer(zipBuffer, meta, expectedShas) {
  if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
    throw new Error('empty_zip_buffer');
  }
  const allowedShas = Array.isArray(expectedShas)
    ? expectedShas.filter(Boolean)
    : (expectedShas ? [String(expectedShas)] : []);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm15-zip-audit-'));
  try {
    const zipPath = path.join(tmpRoot, 'artifact.zip');
    const extractDir = path.join(tmpRoot, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });
    fs.writeFileSync(zipPath, zipBuffer);
    execFileSync('unzip', ['-qq', '-o', zipPath, '-d', extractDir], { stdio: ['ignore', 'pipe', 'pipe'] });

    const absFiles = walkFilesSorted(extractDir, extractDir);
    const files = [];
    let secretHits = 0;
    let evidenceObj = null;
    let evidencePath = null;
    let cleanupObj = null;
    let commandsLogSha = null;

    for (const full of absFiles) {
      const rel = path.relative(extractDir, full).split(path.sep).join('/');
      const raw = fs.readFileSync(full);
      const digest = sha256Buffer(raw);
      files.push({ path: rel, bytes: raw.length, sha256: digest });
      const text = raw.toString('utf8');
      secretHits += countSecretHits(text);
      const baseName = path.posix.basename(rel);
      if (baseName.endsWith('evidence.json')) {
        evidenceObj = JSON.parse(text);
        evidencePath = rel;
      } else if (baseName === 'infrastructure-cleanup.json') {
        cleanupObj = JSON.parse(text);
      }
      if (baseName === 'commands.log') {
        commandsLogSha = digest;
      }
    }

    const manifestLines = files.map((f) => f.path + ':' + f.bytes + ':' + f.sha256).join('\n');
    const manifestSha256 = sha256Buffer(Buffer.from(manifestLines, 'utf8'));

    const sourceSha = evidenceObj && typeof evidenceObj.source_sha === 'string'
      ? evidenceObj.source_sha
      : null;
    const status = evidenceObj && typeof evidenceObj.status === 'string'
      ? evidenceObj.status
      : null;
    const failedStages = Array.isArray(evidenceObj && evidenceObj.failed_stages)
      ? evidenceObj.failed_stages
      : [];
    const expectedCmdSha = evidenceObj && typeof evidenceObj.commands_log_sha256 === 'string'
      ? evidenceObj.commands_log_sha256
      : (evidenceObj && evidenceObj.command_log && typeof evidenceObj.command_log.sha256 === 'string'
        ? evidenceObj.command_log.sha256
        : null);
    const cmdShaMatch = expectedCmdSha ? expectedCmdSha === commandsLogSha : null;
    const containersRemaining = cleanupObj && typeof cleanupObj.remaining_containers_count === 'number'
      ? cleanupObj.remaining_containers_count
      : (evidenceObj && typeof evidenceObj.containers_remaining === 'number'
        ? evidenceObj.containers_remaining
        : (evidenceObj && evidenceObj.cleanup && typeof evidenceObj.cleanup.containers_remaining === 'number'
          ? evidenceObj.cleanup.containers_remaining
          : 0));
    const sourceShaMatches = Boolean(sourceSha && allowedShas.includes(sourceSha));
    const drFailover = evidenceObj && evidenceObj.postgres && evidenceObj.postgres.failover;
    const pgbouncerRerouteTested = drFailover && typeof drFailover.pgbouncer_endpoint_reroute_tested === 'boolean'
      ? drFailover.pgbouncer_endpoint_reroute_tested
      : null;
    const pgbouncerRerouteRawMs = drFailover && drFailover.promotion_to_verified_pgbouncer_write_ms != null
      ? Number(drFailover.promotion_to_verified_pgbouncer_write_ms)
      : NaN;
    const pgbouncerRerouteRtoMs = Number.isFinite(pgbouncerRerouteRawMs) ? pgbouncerRerouteRawMs : null;
    const auditPass = Boolean(
      evidenceObj &&
      sourceShaMatches &&
      status === 'PASS' &&
      Array.isArray(failedStages) &&
      failedStages.length === 0 &&
      secretHits === 0 &&
      containersRemaining === 0 &&
      (cmdShaMatch === null || cmdShaMatch === true)
    );

    return {
      run_id: meta && meta.run_id ? Number(meta.run_id) : null,
      artifact_id: meta && meta.id ? Number(meta.id) : null,
      name: meta && meta.name ? String(meta.name) : null,
      redirect_host: meta && meta.redirect_host ? String(meta.redirect_host) : null,
      zip_bytes: zipBuffer.length,
      zip_sha256: sha256Buffer(zipBuffer),
      file_count: files.length,
      manifest_sha256: manifestSha256,
      evidence_file: evidencePath,
      files,
      source_sha: sourceSha,
      expected_shas: allowedShas,
      source_sha_matches: sourceShaMatches,
      status,
      failed_stages: failedStages,
      commands_log_sha256_expected: expectedCmdSha,
      commands_log_sha256_actual: commandsLogSha,
      commands_log_sha256_match: cmdShaMatch,
      containers_remaining: containersRemaining,
      secret_hits: secretHits,
      pgbouncer_endpoint_reroute_tested: pgbouncerRerouteTested,
      promotion_to_verified_pgbouncer_write_ms: pgbouncerRerouteRtoMs,
      audit_pass: auditPass
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function emitNotice(title, payload) {
  const singleLine = JSON.stringify(payload).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  process.stdout.write('::notice title=' + title + '::' + singleLine + '\n');
}

function emitBoundedAuditNotices(label, audited, includeFilePages) {
  const summary = Object.assign({}, audited);
  delete summary.files;
  emitNotice('M15-01 ZIP Summary (' + label + ')', summary);
  if (!includeFilePages) return;
  const pageSize = 15;
  for (let i = 0; i < audited.files.length; i += pageSize) {
    emitNotice('M15-01 ZIP Files (' + label + ' ' + (Math.floor(i / pageSize) + 1) + ')', {
      artifact_id: audited.artifact_id,
      page: Math.floor(i / pageSize) + 1,
      files: audited.files.slice(i, i + pageSize)
    });
  }
}

function appendStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    fs.appendFileSync(summaryPath, markdown + '\n', 'utf8');
  }
}

async function auditRunArtifacts(apiBase, repo, runId, expectedShas, token, label, includeFilePages) {
  const listing = await fetchGithubJson(
    apiBase,
    '/repos/' + repo + '/actions/runs/' + runId + '/artifacts?per_page=100',
    token
  );
  if (!listing.ok || !listing.json || !Array.isArray(listing.json.artifacts)) {
    throw new Error('list_artifacts_failed:' + runId + ':http_' + listing.status);
  }
  const active = listing.json.artifacts.filter((a) => !a.expired);
  const results = [];
  for (const art of active) {
    const dl = await downloadArtifactZip(apiBase, repo, art.id, token);
    if (!dl.ok) {
      const failure = {
        run_id: Number(runId),
        artifact_id: art.id,
        name: art.name,
        download_ok: false,
        http_status: dl.status,
        redirect_host: dl.redirect_host || null,
        error: dl.error,
        audit_pass: false
      };
      emitNotice('M15-01 ZIP Summary (' + label + ')', failure);
      results.push(failure);
      continue;
    }
    const audited = auditZipBuffer(
      dl.buffer,
      { run_id: Number(runId), id: art.id, name: art.name, redirect_host: dl.redirect_host },
      expectedShas
    );
    emitBoundedAuditNotices(label, audited, includeFilePages);
    results.push(audited);
  }
  return results;
}

async function main() {
  const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const githubSha = process.env.GITHUB_SHA || '';
  const checkoutHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  if (!repo || !runId || !checkoutHead || !token) {
    throw new Error('missing_github_audit_environment');
  }

  const histRunId = process.env.HISTORICAL_RUN_ID || '';
  const histExpectedSha = process.env.HISTORICAL_EXPECTED_SHA || '';
  const histAttempt1Ids = String(process.env.HISTORICAL_ATTEMPT1_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedCurrentShas = Array.from(new Set([checkoutHead, githubSha].filter(Boolean)));
  // Emit current-head ZIP summaries FIRST and keep total ::notice count per step <= 10
  // so GitHub Actions runner command quotas never drop current-SHA evidence annotations.
  const currentResults = await auditRunArtifacts(apiBase, repo, runId, allowedCurrentShas, token, 'current', false);

  const attempt1Probes = [];
  for (const id of histAttempt1Ids) {
    const res = await fetchGithubJson(apiBase, '/repos/' + repo + '/actions/artifacts/' + id, token);
    attempt1Probes.push({ artifact_id: Number(id), http_status: res.status });
  }
  if (attempt1Probes.length > 0) {
    emitNotice('M15-01 Historical Attempt1 IDs', {
      run_id: histRunId ? Number(histRunId) : null,
      probes: attempt1Probes
    });
  }

  let histResults = [];
  if (histRunId && histExpectedSha) {
    histResults = await auditRunArtifacts(apiBase, repo, histRunId, [histExpectedSha], token, 'run-' + histRunId, false);
  }
  const hasRuntimeA = currentResults.some((r) => r.audit_pass && String(r.name || '').startsWith('m15-01-runtime-a-'));
  const hasRuntimeB = currentResults.some((r) => r.audit_pass && String(r.name || '').startsWith('m15-01-runtime-b-'));
  const hasDr = currentResults.some((r) => (
    r.audit_pass
    && String(r.name || '').startsWith('m15-01-dr-')
    && r.pgbouncer_endpoint_reroute_tested === true
    && typeof r.promotion_to_verified_pgbouncer_write_ms === 'number'
  ));

  const lines = [
    '## M15-01 Independent ZIP Checksum & Content Audit',
    '',
    '### Current Run (`' + runId + '` @ `' + checkoutHead + '`)',
    '',
    '| Artifact ID | Name | ZIP Bytes | ZIP SHA-256 | Files | Secret Hits | Audit |',
    '| --- | --- | ---: | --- | ---: | ---: | --- |'
  ];
  for (const r of currentResults) {
    lines.push(
      '| `' + r.artifact_id + '` | `' + r.name + '` | ' + (r.zip_bytes || 0) +
      ' | `sha256:' + (r.zip_sha256 || 'n/a') + '` | ' + (r.file_count || 0) +
      ' | ' + (r.secret_hits != null ? r.secret_hits : 'n/a') +
      ' | ' + (r.audit_pass ? 'PASS' : 'FAIL') + ' |'
    );
  }
  if (histResults.length > 0) {
    lines.push('', '### Historical Run (`' + histRunId + '` @ `' + histExpectedSha + '`)', '');
    lines.push('| Artifact ID | Name | ZIP Bytes | ZIP SHA-256 | Files | Secret Hits | Audit |');
    lines.push('| --- | --- | ---: | --- | ---: | ---: | --- |');
    for (const r of histResults) {
      lines.push(
        '| `' + r.artifact_id + '` | `' + r.name + '` | ' + (r.zip_bytes || 0) +
        ' | `sha256:' + (r.zip_sha256 || 'n/a') + '` | ' + (r.file_count || 0) +
        ' | ' + (r.secret_hits != null ? r.secret_hits : 'n/a') +
        ' | ' + (r.audit_pass ? 'PASS' : 'FAIL') + ' |'
      );
    }
  }
  appendStepSummary(lines.join('\n'));

  if (!hasRuntimeA || !hasRuntimeB || !hasDr || currentResults.some((r) => !r.audit_pass)) {
    throw new Error('current_run_artifact_audit_failed');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
}

module.exports = {
  sha256Buffer,
  countSecretHits,
  downloadArtifactZip,
  auditZipBuffer,
  auditRunArtifacts,
  main
};

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/runner.js — Production RESTful API Test Suite Runner
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { parseSuiteResult, countOkLines } = require('./suite-contract');

/* Keep module import side-effect-free so CI inventory checks can inspect
   API_TESTS without changing caller environment or generating fixtures. */
function configureTestEnvironment() {
  /* Test harness execution flag: JSON-store REST tests, not live-PG tests. */
  process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';
  // CI service credentials must not silently redirect these suites to PostgreSQL and 503.
  for (const key of ['DATABASE_URL', 'PGURL', 'READ_DATABASE_URL', 'REDIS_URL']) delete process.env[key];

  const realStore = path.join(__dirname, '..', '..', 'server', 'data', 'payesh.json');
  if (!fs.existsSync(realStore)) {
    console.log('ℹ️ API test fixture missing; generating deterministic server/data/payesh.json via server/seed.js');
    execFileSync('node', [path.join(__dirname, '..', '..', 'server', 'seed.js')], { stdio: 'inherit' });
  }
}

const API_TESTS = [
  /* N-01 gate first: the entry point must parse before anything else runs.
     If this fails, every other suite cannot even boot the server. */
  'n01-server-entry.test.js',
  'bootstrap.test.js',
  'students.test.js',
  'classes.test.js',
  'attendance.test.js',
  'grades.test.js',
  'users.test.js',
  'cache.test.js',
  'quality-governance.test.js',
  'longitudinal-intelligence.test.js',
  'recommendation-action-planning.test.js',
  'feedback-learning-memory.test.js',
  'intelligence-governance.test.js',
  'policy-simulation.test.js',
  'decision-intelligence-command.test.js',
  'operational-intelligence-execution.test.js',
  'outcome-evaluation-optimization.test.js',
  'intelligence-platform.test.js',
  'intelligence-certification.test.js',
  'scalability-health.test.js',
  'event-processing-health.test.js',
  'observability-health.test.js',
  'disaster-recovery-health.test.js',
  'pilot-deployment-health.test.js',
  'security-health.test.js',
  'phase4-certification.test.js',
  'phase5-pilot.test.js',
  /* Nested aggregator (M15-01 / Chat 2): this suite lives in tests/api/phase5-pilot/
     and was invisible to BOTH gates before — scripts/run-all-tests.sh globs
     `tests/*.js` (flat only) and the parity inventory read tests/api/ flat only.
     It is now a registered suite and the parity contract walks tests/api recursively. */
  'phase5-pilot/index.test.js',
  'phase5-provincial-pilot.test.js',
  'phase5-national-infrastructure.test.js',
  'phase5-production-readiness.test.js',
  'phase5-national-capacity.test.js'
];

const DEFAULT_SUITE_TIMEOUT_MS = 300000;
const MAX_DIAGNOSTIC_CHARS = 6000;

function resolveTimeoutMs(options) {
  const raw = options && options.timeoutMs != null
    ? options.timeoutMs
    : (process.env.PAYESH_API_SUITE_TIMEOUT_MS != null ? Number(process.env.PAYESH_API_SUITE_TIMEOUT_MS) : undefined);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SUITE_TIMEOUT_MS;
}

/**
 * Verdict for one suite. Pure function so the negative-test battery can
 * exercise every rejection rule without spawning processes.
 *
 * A suite is GREEN only when ALL of the following hold:
 *   E1 the child exited 0 (no signal, no timeout)
 *   E2 stdout carries exactly ONE well-formed PAYESH_SUITE_RESULT marker
 *   E3 the marker belongs to this suite file (no copy-pasted markers)
 *   E4 marker.fail === 0     — a counted failure can never be green
 *   E5 marker.skip === 0     — a skipped assertion can never be green
 *   E6 marker.pass > 0       — zero executed assertions can never be green
 *   E7 marker.pass === number of ✅ lines printed (declared evidence must
 *      match printed evidence; a silent "all good" line is not evidence)
 */
function evaluateSuiteResult({ code, signal, stdout, stderr, expectedFile }) {
  const out = String(stdout || '');
  const err = String(stderr || '');
  if (signal === 'SIGKILL' || signal === 'SIGTERM') {
    return { ok: false, reason: 'TIMEOUT', detail: 'suite killed after the configured timeout (' + signal + ')', stdout: out, stderr: err };
  }
  if (code !== 0) {
    return { ok: false, reason: 'EXIT_NONZERO', detail: 'exit code ' + code, stdout: out, stderr: err };
  }
  const { markers, malformed } = parseSuiteResult(out);
  if (malformed.length > 0) {
    return { ok: false, reason: 'MALFORMED_EVIDENCE', detail: 'malformed PAYESH_SUITE_RESULT line(s): ' + malformed.slice(0, 3).join(' | '), stdout: out, stderr: err };
  }
  if (markers.length === 0) {
    return { ok: false, reason: 'NO_EVIDENCE', detail: 'suite exited 0 without a PAYESH_SUITE_RESULT marker — zero-execution green is not allowed (see tests/api/suite-contract.js)', stdout: out, stderr: err };
  }
  if (markers.length > 1) {
    return { ok: false, reason: 'DUPLICATE_EVIDENCE', detail: markers.length + ' markers printed; exactly one is required', stdout: out, stderr: err };
  }
  const m = markers[0];
  if (expectedFile && m.file !== expectedFile) {
    return { ok: false, reason: 'EVIDENCE_FILE_MISMATCH', detail: 'marker file="' + m.file + '" but ran ' + expectedFile, stdout: out, stderr: err };
  }
  if (m.fail > 0) {
    return { ok: false, reason: 'FAIL_REPORTED', detail: 'suite declared fail=' + m.fail + ' but exited 0', stdout: out, stderr: err };
  }
  if (m.skip > 0) {
    return { ok: false, reason: 'SKIP_REPORTED', detail: 'suite declared skip=' + m.skip + ' — a skipped test is NOT a pass', stdout: out, stderr: err };
  }
  if (m.pass <= 0) {
    return { ok: false, reason: 'ZERO_PASS', detail: 'suite declared pass=0 — zero executed assertions cannot be green', stdout: out, stderr: err };
  }
  const observed = countOkLines(out);
  if (observed !== m.pass) {
    return { ok: false, reason: 'EVIDENCE_MISMATCH', detail: 'declared pass=' + m.pass + ' but printed ' + observed + ' ✅ line(s)', stdout: out, stderr: err };
  }
  return { ok: true, reason: 'PASS', marker: m, detail: m.pass + ' assertion(s)', stdout: out, stderr: err };
}

function tail(text, n) {
  const s = String(text || '');
  return s.length <= n ? s : '…' + s.slice(s.length - n);
}

/* runSuites(suites, options) — runs the registry and RETURNS the process exit code.
   Issue #454 item 3 (fail-closed): zero discovered suites must never report
   green. Before this guard an empty registry printed "0/0" and exited 0 — a
   false-green that made the whole API layer invisible to every gate.

   M15-01 / Chat 2: exit code alone is no longer accepted as evidence. Each
   suite must declare its own counts (tests/api/suite-contract.js) and the
   declared evidence must agree with what the suite printed. A per-suite
   timeout turns a hanging suite into a bounded RED instead of a CI job that
   burns the full 180-minute workflow timeout and reports nothing. */
function runSuites(suites, options) {
  const opts = options || {};
  if (!Array.isArray(suites) || suites.length === 0) {
    console.error('❌ API runner: no suites discovered — refusing to report green (fail-closed).');
    console.error('   A zero-suite run proves nothing and must exit non-zero (issue #454 item 3).');
    return 1;
  }
  const dir = opts.dir ? path.resolve(opts.dir) : __dirname;
  const timeoutMs = resolveTimeoutMs(opts);
  const quiet = opts.quiet === true;
  const results = [];
  for (const testFile of suites) {
    const fullPath = path.join(dir, testFile);
    const startedAt = Date.now();
    let verdict;
    try {
      const stdout = execFileSync(process.execPath, [fullPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: 16 * 1024 * 1024
      });
      verdict = evaluateSuiteResult({ code: 0, signal: null, stdout, stderr: '', expectedFile: path.basename(testFile) });
    } catch (err) {
      const timedOut = err && (err.signal === 'SIGKILL' || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT');
      verdict = evaluateSuiteResult({
        code: timedOut ? null : (err && err.status != null ? err.status : 1),
        signal: timedOut ? (err.signal || 'SIGKILL') : null,
        stdout: (err && err.stdout) || '',
        stderr: (err && err.stderr) || (err && err.message) || '',
        expectedFile: path.basename(testFile)
      });
      if (timedOut) verdict.detail = 'exceeded ' + timeoutMs + 'ms per-suite timeout';
    }
    results.push({ file: testFile, ok: verdict.ok, reason: verdict.reason, detail: verdict.detail, ms: Date.now() - startedAt });
    if (!quiet) {
      if (verdict.stdout) console.log(verdict.stdout.trim());
      if (verdict.ok) {
        console.log(`✔ ${testFile} — ${verdict.detail} (${Date.now() - startedAt}ms)`);
      } else {
        console.error(`❌ Suite not green: ${testFile} [${verdict.reason}] ${verdict.detail}`);
        /* Both streams matter for diagnosis: assertions often print to stdout
           while crashes/log lines go to stderr. Previously stderr was dropped,
           so a RED suite could surface in CI with no visible cause. */
        if (verdict.stdout) console.error('--- stdout (tail) ---\n' + tail(verdict.stdout, MAX_DIAGNOSTIC_CHARS));
        if (verdict.stderr) console.error('--- stderr (tail) ---\n' + tail(verdict.stderr, MAX_DIAGNOSTIC_CHARS));
      }
    }
    if (!verdict.ok) {
      console.error(`\n❌ API runner: ${results.filter((r) => r.ok).length}/${suites.length} suites green — run aborted at ${testFile} (fail-closed).`);
      return 1;
    }
  }
  const passedSuites = results.filter((r) => r.ok).length;
  if (passedSuites !== suites.length) {
    console.error(`❌ API runner: ${passedSuites}/${suites.length} suites executed — incomplete run (fail-closed).`);
    return 1;
  }
  const totalAssertions = results.reduce((n, r) => n + (r.ok ? Number(String(r.detail).split(' ')[0]) || 0 : 0), 0);
  console.log('\n────────────────────────────────────────────────────');
  console.log(`✅ هر ${suites.length} سوئیت شاهدِ اجرای خود را اعلام کرد (PAYESH_SUITE_RESULT) و ${totalAssertions} assertion واقعی اجرا شد.`);
  console.log(`نتیجه کلی RESTful API Tests: ${passedSuites}/${suites.length} سوئیت موفق — بدون خطا ✅`);
  console.log('────────────────────────────────────────────────────');
  return 0;
}

if (require.main === module) {
  configureTestEnvironment();
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 اجرای آزمون‌های کامل RESTful API Backend (فاز ۳ و ۴)');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  if (runSuites(API_TESTS) !== 0) process.exit(1);
}

module.exports = { runSuites, evaluateSuiteResult, API_TESTS, DEFAULT_SUITE_TIMEOUT_MS };

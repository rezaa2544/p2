#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/runner.js — Production RESTful API Test Suite Runner
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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
  'phase5-provincial-pilot.test.js',
  'phase5-national-infrastructure.test.js',
  'phase5-production-readiness.test.js',
  'phase5-national-capacity.test.js'
];

/* runSuites(suites) — runs the registry and RETURNS the process exit code.
   Issue #454 item 3 (fail-closed): zero discovered suites must never report
   green. Before this guard an empty registry printed "0/0" and exited 0 — a
   false-green that made the whole API layer invisible to every gate. */
function runSuites(suites) {
  if (!Array.isArray(suites) || suites.length === 0) {
    console.error('❌ API runner: no suites discovered — refusing to report green (fail-closed).');
    console.error('   A zero-suite run proves nothing and must exit non-zero (issue #454 item 3).');
    return 1;
  }
  let passedSuites = 0;
  for (const testFile of suites) {
    const fullPath = path.join(__dirname, testFile);
    try {
      const output = execFileSync('node', [fullPath], { encoding: 'utf8' });
      console.log(output.trim());
      passedSuites++;
    } catch (err) {
      console.error(`❌ Suite failed: ${testFile}`);
      console.error(err.stdout || err.message);
      return 1;
    }
  }
  if (passedSuites !== suites.length) {
    console.error(`❌ API runner: ${passedSuites}/${suites.length} suites executed — incomplete run (fail-closed).`);
    return 1;
  }
  console.log('\n────────────────────────────────────────────────────');
  console.log(`نتیجه کلی RESTful API Tests: ${passedSuites}/${suites.length} سوئیت موفق — بدون خطا ✅`);
  console.log('────────────────────────────────────────────────────');
  return 0;
}

if (require.main === module) {
  configureTestEnvironment();
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 اجرای آزمون‌های کامل RESTful API Backend (فاز ۳ و ۴)');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  process.exit(runSuites(API_TESTS));
}

module.exports = { runSuites, API_TESTS };

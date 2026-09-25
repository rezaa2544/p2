#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/runner.js — Production RESTful API Test Suite Runner
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* Test harness execution flag: allows in-memory JSON store REST tests to run
   without attached PostgreSQL authority in dev/test only. */
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';
// These 30 suites are JSON-store REST contract tests, not live-PG tests.
// CI service credentials must not silently redirect them to PostgreSQL and 503.
for (const key of ['DATABASE_URL', 'PGURL', 'READ_DATABASE_URL', 'REDIS_URL']) delete process.env[key];

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REAL_STORE = path.join(__dirname, '..', '..', 'server', 'data', 'payesh.json');
if (!fs.existsSync(REAL_STORE)) {
  console.log('ℹ️ API test fixture missing; generating deterministic server/data/payesh.json via server/seed.js');
  execSync(`node ${JSON.stringify(path.join(__dirname, '..', '..', 'server', 'seed.js'))}`, { stdio: 'inherit' });
}

const API_TESTS = [
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

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🚀 اجرای آزمون‌های کامل RESTful API Backend (فاز ۳ و ۴)');
console.log('═══════════════════════════════════════════════════════════════════\n');

let totalSuites = API_TESTS.length;
let passedSuites = 0;

for (const testFile of API_TESTS) {
  const fullPath = path.join(__dirname, testFile);
  try {
    const output = execSync(`node ${fullPath}`, { encoding: 'utf8' });
    console.log(output.trim());
    passedSuites++;
  } catch (err) {
    console.error(`❌ Suite failed: ${testFile}`);
    console.error(err.stdout || err.message);
    process.exit(1);
  }
}

console.log('\n────────────────────────────────────────────────────');
console.log(`نتیجه کلی RESTful API Tests: ${passedSuites}/${totalSuites} سوئیت موفق — بدون خطا ✅`);
console.log('────────────────────────────────────────────────────');

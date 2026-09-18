/**
 * tests/infrastructure/phase6/master-phase6-suite.test.js
 * Master Production Certification & Verification Suite for Phase 6
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const SUITES = [
  'canary-foundation.test.js',
  'failure-resilience.test.js',
  'load-and-capacity.test.js',
  'security-and-zero-trust.test.js',
  'canary-rollout.test.js'
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🏆 PHASE 6 MASTER PRODUCTION VERIFICATION SUITE');
console.log('   National Scale System Deployment & SRE Governance');
console.log('═══════════════════════════════════════════════════════════════════');

let passed = 0;
for (const s of SUITES) {
  const filePath = path.join(__dirname, s);
  console.log(`\n▶ Executing: ${s}`);
  const res = spawnSync(process.execPath, [filePath], { stdio: 'inherit' });
  if (res.status === 0) {
    passed++;
  } else {
    console.error(`❌ Suite failed: ${s} (exit code ${res.status})`);
    process.exit(1);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passed}/${SUITES.length} PHASE 6 PRODUCTION SUITES PASSED (100% VERIFIED)`);
console.log('   Status: PRODUCTION GRADE — 100% READY FOR NATIONWIDE SCALE');
console.log('═══════════════════════════════════════════════════════════════════');

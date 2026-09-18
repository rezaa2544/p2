#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/infrastructure/certification/index.test.js
   Master Test Suite for Phase 4 Release Gate & Scalability Certification (P1-SC-07)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const { execSync } = require('child_process');

const SUITES = [
  'layer-completeness.test.js',
  'production-gates.test.js',
  'go-nogo-matrix.test.js',
  'human-sovereignty.test.js',
  'zero-ranking.test.js',
  'tenant-isolation.test.js',
  'deterministic.test.js',
  'rejection-handling.test.js',
  'certificate-digest.test.js'
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🏛️  اجرای آزمون‌های جامع گیت انتشار و گواهی مقیاس‌پذیری فاز ۴ (P1-SC-07)');
console.log('═══════════════════════════════════════════════════════════════════\n');

let passed = 0;
let total = SUITES.length;

for (const suite of SUITES) {
  const fullPath = path.join(__dirname, suite);
  try {
    const out = execSync(`node ${fullPath}`, { encoding: 'utf8' });
    console.log(out.trim());
    passed++;
  } catch (err) {
    console.error(`❌ شکست در اجرای آزمون: ${suite}`);
    console.error(err.stdout || err.message);
    process.exit(1);
  }
}

console.log('\n────────────────────────────────────────────────────');
console.log(`نتیجه آزمون‌های زیرساخت صدور گواهینامه فاز ۴: ${passed}/${total} سوئیت موفق (۱۰۰٪ سبز) ✅`);
console.log('────────────────────────────────────────────────────');

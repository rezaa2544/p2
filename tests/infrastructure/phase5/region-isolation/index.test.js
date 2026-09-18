#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/infrastructure/phase5/region-isolation/index.test.js
   Geographic Isolation Master Test Runner (P2-PL-01)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const { execSync } = require('child_process');

const SUITES = [
  'geographic-routing.test.js',
  'cross-region-leakage.test.js',
  'data-residency.test.js'
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🔒 اجرای آزمون‌های ایزولاسیون جغرافیایی و اقامت داده‌ها (P2-PL-01)');
console.log('═══════════════════════════════════════════════════════════════════\n');

let passed = 0;
for (const s of SUITES) {
  const p = path.join(__dirname, s);
  try {
    const out = execSync(`node ${p}`, { encoding: 'utf8' });
    console.log(out.trim());
    passed++;
  } catch (err) {
    console.error(`❌ Suite failed: ${s}`);
    console.error(err.stdout || err.message);
    process.exit(1);
  }
}

console.log('\n────────────────────────────────────────────────────');
console.log(`نتیجه آزمون‌های Isolation: ${passed}/${SUITES.length} سوئیت موفق (۱۰۰٪ سبز) ✅`);
console.log('────────────────────────────────────────────────────');

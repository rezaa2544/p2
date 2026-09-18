#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/infrastructure/phase5/pilot-scaling/index.test.js
   Provincial Pilot Scaling Master Test Runner (P2-PL-02)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const { execSync } = require('child_process');

const SUITES = [
  'provincial-registry.test.js',
  'traffic-distribution.test.js',
  'capacity-scaling.test.js',
  'rural-border-resilience.test.js'
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🏛️  اجرای آزمون‌های فعال‌سازی پایلوت استانی و مقیاس ظرفیت (P2-PL-02)');
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
console.log(`نتیجه آزمون‌های Provincial Pilot Scaling: ${passed}/${SUITES.length} سوئیت موفق (۱۰۰٪ سبز) ✅`);
console.log('────────────────────────────────────────────────────');

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/infrastructure/phase5/national/index.test.js
   National Infrastructure Master Test Runner (P2-NI-01)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const { execSync } = require('child_process');

const SUITES = [
  'national-region.test.js',
  'national-capacity.test.js',
  'traffic-fabric.test.js',
  'security-governance.test.js',
  'data-sovereignty.test.js',
  'observability.test.js',
  'disaster-recovery.test.js'
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🌐 اجرای آزمون‌های شالوده زیرساخت ملی و فابریک تولید (P2-NI-01)');
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
console.log(`نتیجه آزمون‌های National Infrastructure: ${passed}/${SUITES.length} سوئیت موفق (۱۰۰٪ سبز) ✅`);
console.log('────────────────────────────────────────────────────');

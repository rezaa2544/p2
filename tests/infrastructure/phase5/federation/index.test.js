#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/infrastructure/phase5/federation/index.test.js
   Multi-Region Federation Master Test Runner (P2-PL-01)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const { execSync } = require('child_process');

const SUITES = [
  'registry-lifecycle.test.js',
  'health-sync.test.js',
  'failover-awareness.test.js'
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🌐 اجرای آزمون‌های لایه فدراسیون کلاسترهای چندمنطقه‌ای (P2-PL-01)');
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
console.log(`نتیجه آزمون‌های Federation: ${passed}/${SUITES.length} سوئیت موفق (۱۰۰٪ سبز) ✅`);
console.log('────────────────────────────────────────────────────');

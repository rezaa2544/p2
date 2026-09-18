#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/infrastructure/phase5/resource-governance/index.test.js
   Resource Governance Master Test Runner (P2-PL-01)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const { execSync } = require('child_process');

const SUITES = [
  'quota-enforcement.test.js',
  'rural-border-support.test.js',
  'human-approval-gate.test.js',
  'zero-ranking-protection.test.js'
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('⚖️  اجرای آزمون‌های حاکمیت منابع، تاب‌آوری و منع رتبه‌بندی (P2-PL-01)');
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
console.log(`نتیجه آزمون‌های Governance: ${passed}/${SUITES.length} سوئیت موفق (۱۰۰٪ سبز) ✅`);
console.log('────────────────────────────────────────────────────');

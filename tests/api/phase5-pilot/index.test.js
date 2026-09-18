#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/phase5-pilot/index.test.js
   Phase 5 National Pilot API Master Suite (P2-PL-01)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const { execSync } = require('child_process');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🏛️  اجرای آزمون‌های یکپارچه API پایلوت ملی و فدراسیون (P2-PL-01)');
console.log('═══════════════════════════════════════════════════════════════════\n');

try {
  const runner = path.join(__dirname, '..', 'phase5-pilot.test.js');
  const out = execSync(`node ${runner}`, { encoding: 'utf8' });
  console.log(out.trim());
} catch (err) {
  console.error('❌ Phase 5 Pilot API Suite Failed');
  console.error(err.stdout || err.message);
  process.exit(1);
}

console.log('\n────────────────────────────────────────────────────');
console.log('نتیجه آزمون‌های Phase 5 Pilot API: ۱۰۰٪ موفق ✅');
console.log('────────────────────────────────────────────────────');

/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard/index.test.js
   -------------------------------------------------------------------
   P0-EI-05: School Health Dashboard & Decision Center Master Suite
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const s1 = require('./health-index.test');
const s2 = require('./critical-issues.test');
const s3 = require('./action-center.test');
const s4 = require('./aggregation.test');
const s5 = require('./executive-summary.test');
const s6 = require('./deterministic.test');
const s7 = require('./mutation-safety.test');
const s8 = require('./tenant-isolation.test');

function run() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  P0-EI-05: School Health Dashboard & Decision Center Suite');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  s1.run();
  s2.run();
  s3.run();
  s4.run();
  s5.run();
  s6.run();
  s7.run();
  s8.run();

  console.log('\n✅ تمامی ۸ سوئیت آزمون داشبورد سلامت و مرکز تصمیم‌گیری با موفقیت پاس شدند.');
}

if (require.main === module) {
  run();
}

module.exports = { run };

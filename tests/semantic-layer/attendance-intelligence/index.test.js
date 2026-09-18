/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/index.test.js
   -------------------------------------------------------------------
   P0-EI-04: Attendance Intelligence Engine Master Test Suite
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const s1 = require('./attendance-quality.test');
const s2 = require('./chronic-absence-detection.test');
const s3 = require('./consecutive-pattern.test');
const s4 = require('./weekly-pattern.test');
const s5 = require('./late-arrival.test');
const s6 = require('./risk-classification.test');
const s7 = require('./deterministic.test');
const s8 = require('./mutation-safety.test');
const s9 = require('./tenant-isolation.test');

function run() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  P0-EI-04: Attendance Intelligence Engine Comprehensive Suite');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  s1.run();
  s2.run();
  s3.run();
  s4.run();
  s5.run();
  s6.run();
  s7.run();
  s8.run();
  s9.run();

  console.log('\n✅ تمامی ۹ سوئیت آزمون هوشمندی حضور و غیاب با موفقیت پاس شدند.');
}

if (require.main === module) {
  run();
}

module.exports = { run };

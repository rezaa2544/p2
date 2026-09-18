/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/index.test.js
   -------------------------------------------------------------------
   P0-EI-03: Assessment Intelligence Engine Master Test Suite
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const s1 = require('./assessment-quality.test');
const s2 = require('./difficulty-index.test');
const s3 = require('./discrimination-index.test');
const s4 = require('./outlier-detection.test');
const s5 = require('./fairness.test');
const s6 = require('./teacher-profile.test');
const s7 = require('./deterministic.test');
const s8 = require('./mutation-safety.test');
const s9 = require('./tenant-isolation.test');

function run() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  P0-EI-03: Assessment Intelligence Engine Comprehensive Suite');
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

  console.log('\n✅ تمامی ۹ سوئیت آزمون هوشمندی سنجش و ارزیابی با موفقیت پاس شدند.');
}

if (require.main === module) {
  run();
}

module.exports = { run };

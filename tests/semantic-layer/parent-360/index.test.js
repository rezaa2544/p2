/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/index.test.js
   -------------------------------------------------------------------
   P0-EI-06: Parent 360 & Family Action Center Master Suite
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const s1 = require('./parent-access-guard.test');
const s2 = require('./profile-builder.test');
const s3 = require('./action-items.test');
const s4 = require('./absence-justification.test');
const s5 = require('./engagement-index.test');
const s6 = require('./deterministic.test');
const s7 = require('./mutation-safety.test');
const s8 = require('./tenant-isolation.test');

function run() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  P0-EI-06: Parent 360 & Family Action Center Comprehensive Suite');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  s1.run();
  s2.run();
  s3.run();
  s4.run();
  s5.run();
  s6.run();
  s7.run();
  s8.run();

  console.log('\n✅ تمامی ۸ سوئیت آزمون نمای ۳۶۰ والدین و مرکز اقدامات خانواده با موفقیت پاس شدند.');
}

if (require.main === module) {
  run();
}

module.exports = { run };

/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/tenant-isolation.test.js
   -------------------------------------------------------------------
   P0-EI-06: Multi-School Family Tenant Isolation & Anti-Leakage Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  buildParent360Profile,
  enforceParentChildAccessGuard
} = require('../../../server/analytics/parent-360');

function run() {
  console.log('▸ تست ۸: ایزولاسیون خانواده چندفرزندی بین مدارس مختلف (Multi-School Isolation)');

  const parent = { id: 10, full_name: 'ولی با دو فرزند در دو مدرسه متفاوت' };

  // فرزند ۱ در دبستان (مدرسه ۱)
  const child1 = { id: 101, school_id: 1, full_name: 'فرزند اول (دبستان)' };
  // فرزند ۲ در دبیرستان (مدرسه ۲)
  const child2 = { id: 102, school_id: 2, full_name: 'فرزند دوم (دبیرستان)' };

  const parentLinks = [
    { parent_id: 10, student_id: 101 },
    { parent_id: 10, student_id: 102 }
  ];

  // داده‌های حضور مدرسه ۱ و ۲
  const attSchool1 = [{ student_id: 101, school_id: 1, status: 'present' }];
  const attSchool2 = [{ student_id: 102, school_id: 2, status: 'present' }];

  // ۱. ساخت پرونده فرزند ۱ در مدرسه ۱ با ایزولاسیون کامل
  const profile1 = buildParent360Profile({
    parent,
    student: child1,
    parentLinks,
    attendance: attSchool1
  }, { expectedSchoolId: 1 });

  assert.strictEqual(profile1.student_id, 101);
  assert.strictEqual(profile1.school_id, 1);

  // ۲. ساخت پرونده فرزند ۲ در مدرسه ۲ با ایزولاسیون کامل
  const profile2 = buildParent360Profile({
    parent,
    student: child2,
    parentLinks,
    attendance: attSchool2
  }, { expectedSchoolId: 2 });

  assert.strictEqual(profile2.student_id, 102);
  assert.strictEqual(profile2.school_id, 2);

  // ۳. سقط قاطع در صورت نشت رکوردهای مدرسه ۲ به پرونده فرزند ۱
  const leakedAtt = [
    { student_id: 101, school_id: 1, status: 'present' },
    { student_id: 101, school_id: 2, status: 'absent' } // نشت رکورد مدرسه دیگر
  ];

  assert.throws(() => {
    buildParent360Profile({
      parent,
      student: child1,
      parentLinks,
      attendance: leakedAtt
    }, { expectedSchoolId: 1 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION');

  console.log('  ✅ تفکیک کامل مدارس در خانواده‌های چندفرزندی و مهار کامل نشت بین‌مدرسه‌ای');
}

if (require.main === module) run();
module.exports = { run };

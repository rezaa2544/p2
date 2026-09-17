/**
 * tests/semantic-layer/attendance-rate.test.js
 * تست‌های واحد و مرزی نرخ حضور
 */
'use strict';

const assert = require('assert');
const { calculateAttendanceRate, METRIC_REGISTRY } = require('../../server/analytics/semantic.js');

let pass = 0;
let fail = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ ${desc}:`, err.message);
    fail++;
  }
}

console.log('▸ تست‌های محاسباتی نرخ حضور (Attendance Rate)');

test('محاسبه تقویمی (Calendar) با داده‌های استاندارد انگلیسی', () => {
  const records = [
    { status: 'present', school_id: 1, student_id: 101 },
    { status: 'present', school_id: 1, student_id: 102 },
    { status: 'late', school_id: 1, student_id: 103 },
    { status: 'absent', school_id: 1, student_id: 104 },
    { status: 'excused', school_id: 1, student_id: 105 }
  ];
  // صورت = 2 حاضر + 1 تاخیر = 3
  // مخرج = 5
  // درصد = (3 / 5) * 100 = 60.0
  const res = calculateAttendanceRate(records, { formula: 'calendar', expectedSchoolId: 1 });
  assert.strictEqual(res.value, 60.0);
  assert.strictEqual(res.numerator, 3.0);
  assert.strictEqual(res.denominator, 5);
  assert.strictEqual(res.counts.present, 2);
  assert.strictEqual(res.counts.late, 1);
  assert.strictEqual(res.counts.absent, 1);
  assert.strictEqual(res.counts.excused, 1);
  assert.strictEqual(res.data_quality.status, 'COMPLETE');
});

test('محاسبه خالص (Net) با کسر غیبت‌های موجه از مخرج', () => {
  const records = [
    { status: 'present', school_id: 1, student_id: 101 },
    { status: 'present', school_id: 1, student_id: 102 },
    { status: 'late', school_id: 1, student_id: 103 },
    { status: 'absent', school_id: 1, student_id: 104 },
    { status: 'excused', school_id: 1, student_id: 105 }
  ];
  // صورت = 3
  // مخرج = 2 حاضر + 1 تاخیر + 1 غایب = 4 (موجه حذف شده)
  // درصد = (3 / 4) * 100 = 75.0
  const res = calculateAttendanceRate(records, { formula: 'net', expectedSchoolId: 1 });
  assert.strictEqual(res.value, 75.0);
  assert.strictEqual(res.numerator, 3.0);
  assert.strictEqual(res.denominator, 4);
});

test('اعمال ضریب وزنی تأخیر (lateWeight)', () => {
  const records = [
    { status: 'present', school_id: 2, student_id: 201 },
    { status: 'late', school_id: 2, student_id: 202 },
    { status: 'absent', school_id: 2, student_id: 203 },
    { status: 'absent', school_id: 2, student_id: 204 }
  ];
  // با lateWeight = 0.5:
  // صورت = 1 + (1 * 0.5) = 1.5
  // مخرج = 4
  // درصد = (1.5 / 4) * 100 = 37.5
  const res = calculateAttendanceRate(records, { lateWeight: 0.5, expectedSchoolId: 2 });
  assert.strictEqual(res.value, 37.5);
  assert.strictEqual(res.numerator, 1.5);
  assert.strictEqual(res.denominator, 4);
});

test('پشتیبانی از نام‌گذاری فارسی وضعیت‌ها', () => {
  const records = [
    { status: 'حاضر', school_id: 1 },
    { status: 'حاضر', school_id: 1 },
    { status: 'تأخیر', school_id: 1 },
    { status: 'غایب', school_id: 1 },
    { status: 'موجه', school_id: 1 }
  ];
  const res = calculateAttendanceRate(records, { formula: 'calendar' });
  assert.strictEqual(res.value, 60.0);
  assert.strictEqual(res.counts.present, 2);
  assert.strictEqual(res.counts.late, 1);
  assert.strictEqual(res.counts.absent, 1);
  assert.strictEqual(res.counts.excused, 1);
});

test('رفتار ایمن در برابر آرایه خالی (Null Safe)', () => {
  const res = calculateAttendanceRate([]);
  assert.strictEqual(res.value, null);
  assert.strictEqual(res.denominator, 0);
  assert.strictEqual(res.data_quality.status, 'NO_DATA');
});

test('گارد ایزولاسیون مستأجران (Tenant Isolation Violation)', () => {
  const records = [
    { status: 'present', school_id: 1 },
    { status: 'present', school_id: 2 } // مدرسه دیگر نشت کرده
  ];
  assert.throws(() => {
    calculateAttendanceRate(records, { expectedSchoolId: 1 });
  }, /Tenant isolation violation/);
});

if (fail > 0) process.exit(1);

/**
 * tests/semantic-layer/chronic-absence.test.js
 * تست‌های واحد و مرزی نرخ غیبت مزمن
 */
'use strict';

const assert = require('assert');
const { calculateChronicAbsence } = require('../../server/analytics/semantic.js');

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

console.log('▸ تست‌های محاسباتی نرخ غیبت مزمن (Chronic Absence Rate)');

test('تشخیص دانش‌آموز غایب مزمن با آستانه ۱۰ درصد', () => {
  // ۲ دانش‌آموز:
  // دانش‌آموز ۱: ۱۰ جلسه، ۱ جلسه غایب (۱۰٪ غیبت) -> مزمن
  // دانش‌آموز ۲: ۱۰ جلسه، صفر جلسه غایب (۰٪ غیبت) -> سالم
  const records = [
    // s1: 9 حاضر، 1 غایب
    ...Array(9).fill({ student_id: 1, status: 'present', school_id: 1 }),
    { student_id: 1, status: 'absent', school_id: 1 },
    // s2: 10 حاضر
    ...Array(10).fill({ student_id: 2, status: 'present', school_id: 1 })
  ];

  const res = calculateChronicAbsence(records, { chronicThreshold: 0.10, minRequiredSessions: 5, expectedSchoolId: 1 });
  assert.strictEqual(res.eligible_students_count, 2);
  assert.strictEqual(res.chronic_students_count, 1);
  assert.strictEqual(res.value, 50.0); // 1 از 2 واجد شرایط = 50%
  assert.strictEqual(res.students_detail[1].is_chronic, true);
  assert.strictEqual(res.students_detail[2].is_chronic, false);
});

test('کارت غیبت مزمن: احتساب غیبت موجه به عنوان زمان از دست رفته آموزش', () => {
  // دانش‌آموز با ۱۰ جلسه: ۸ حاضر، ۲ غیبت موجه -> ۲۰٪ از دست رفته آموزش -> مزمن
  const records = [
    ...Array(8).fill({ student_id: 10, status: 'present', school_id: 1 }),
    { student_id: 10, status: 'excused', school_id: 1 },
    { student_id: 10, status: 'excused', school_id: 1 }
  ];

  const res = calculateChronicAbsence(records, { chronicThreshold: 0.10, minRequiredSessions: 5 });
  assert.strictEqual(res.students_detail[10].missed_sessions, 2);
  assert.strictEqual(res.students_detail[10].absence_rate, 0.2);
  assert.strictEqual(res.students_detail[10].is_chronic, true);
  assert.strictEqual(res.value, 100.0);
});

test('محدودیت کف جلسات (minRequiredSessions): دانش‌آموز با داده ناکافی شمرده نمی‌شود', () => {
  // دانش‌آموز با ۲ جلسه غایب ولی زیر سقف ۵ جلسه
  const records = [
    { student_id: 99, status: 'absent', school_id: 1 },
    { student_id: 99, status: 'absent', school_id: 1 }
  ];

  const res = calculateChronicAbsence(records, { minRequiredSessions: 5 });
  assert.strictEqual(res.eligible_students_count, 0);
  assert.strictEqual(res.chronic_students_count, 0);
  assert.strictEqual(res.value, null);
  assert.strictEqual(res.data_quality.status, 'INSUFFICIENT_DATA');
});

test('ایزولاسیون مستأجران در غیبت مزمن', () => {
  const records = [
    { student_id: 1, status: 'present', school_id: 10 },
    { student_id: 2, status: 'present', school_id: 20 }
  ];
  assert.throws(() => {
    calculateChronicAbsence(records, { expectedSchoolId: 10 });
  }, /Tenant isolation violation/);
});

if (fail > 0) process.exit(1);

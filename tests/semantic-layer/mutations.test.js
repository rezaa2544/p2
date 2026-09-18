/**
 * tests/semantic-layer/mutations.test.js
 * آزمون مقاومت در برابر جهش‌های مهلک (Mutation Testing)
 * ─────────────────────────────────────────────────────────────
 * مأموریت: اثبات اینکه اگر در محاسبات لایه معنایی مخرج (denominator)،
 * فیلتر ایزولاسیون یا ضرایب دچار انحراف شوند، تست‌ها بلافاصله خطا می‌دهند (Killed).
 */
'use strict';

const assert = require('assert');
const semantic = require('../../server/analytics/semantic.js');

let pass = 0;
let fail = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅ [KILLED] ${desc}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ [SURVIVED] ${desc}:`, err.message);
    fail++;
  }
}

console.log('▸ آزمون‌های جهش لایه معنایی (Semantic Layer Mutation Resistance)');

test('جهش ۱: تغییر اشتباه مخرج در حضور تقویمی (حذف غیبت از مخرج)', () => {
  const records = [
    { status: 'present', school_id: 1 },
    { status: 'absent', school_id: 1 }
  ];
  // مقدار صحیح: (1 / 2) * 100 = 50.0
  const realRes = semantic.calculateAttendanceRate(records, { formula: 'calendar' });
  assert.strictEqual(realRes.value, 50.0);
  assert.strictEqual(realRes.denominator, 2);

  // جهش‌یافته: اگر مخرج فقط شامل حاضرین باشد (1)
  const mutantDenominator = 1;
  const mutantValue = (1 / mutantDenominator) * 100;
  // اطمینان از کشته شدن این جهش در صورت وقوع
  assert.notStrictEqual(realRes.value, mutantValue, 'Mutant denominator survived!');
});

test('جهش ۲: تغییر مخرج غیبت مزمن (محاسبه روی کل دانش‌آموزان به جای واجدین شرایط)', () => {
  // ۱ واجد شرایط مزمن + ۵ دانش‌آموز ثبت‌نامی با ۱ جلسه (غیر واجد شرایط)
  const records = [
    // s1: 10 جلسه (5 حاضر، 5 غایب -> 50% غیبت -> مزمن)
    ...Array(5).fill({ student_id: 1, status: 'present', school_id: 1 }),
    ...Array(5).fill({ student_id: 1, status: 'absent', school_id: 1 }),
    // s2..s6: هر کدام ۱ جلسه حاضر (زیر کف ۵ جلسه)
    { student_id: 2, status: 'present', school_id: 1 },
    { student_id: 3, status: 'present', school_id: 1 },
    { student_id: 4, status: 'present', school_id: 1 },
    { student_id: 5, status: 'present', school_id: 1 },
    { student_id: 6, status: 'present', school_id: 1 }
  ];

  const res = semantic.calculateChronicAbsence(records, { minRequiredSessions: 5 });
  // مخرج واقعی باید ۱ باشد (فقط s1 واجد شرایط است) -> نرخ = 100%
  assert.strictEqual(res.eligible_students_count, 1);
  assert.strictEqual(res.value, 100.0);

  // اگر جهش رخ دهد و مخرج کل دانش‌آموزان (6) فرض شود -> نرخ = (1 / 6) * 100 ≈ 16.67%
  const mutantValue = (1 / 6) * 100;
  assert.notStrictEqual(res.value, mutantValue, 'Mutant eligible denominator survived!');
});

test('جهش ۳: حذف نرمال‌سازی در توزیع نمرات (ترکیب مقیاس ۱۰ و ۲۰ بدون تبدیل)', () => {
  // یک نمره 5 از 10 (معادل 10 از 20) و یک نمره 10 از 20
  const records = [
    { score: 5, max_score: 10 },
    { score: 10, max_score: 20 }
  ];
  const res = semantic.calculateGradeDistribution(records);
  // میانگین نرمال‌شده صحیح: (10 + 10) / 2 = 10.0
  assert.strictEqual(res.mean, 10.0);

  // اگر جهش رخ دهد و نمرات خام جمع شوند: (5 + 10) / 2 = 7.5
  const mutantRawMean = 7.5;
  assert.notStrictEqual(res.mean, mutantRawMean, 'Mutant non-normalized score survived!');
});

test('جهش ۴: دور زدن یا خاموش کردن ایزولاسیون مستأجران', () => {
  const records = [
    { status: 'present', school_id: 10 },
    { status: 'present', school_id: 99 } // مستأجر بیگانه
  ];

  // تابع باید استثنا تولید کند
  let caught = false;
  try {
    semantic.calculateAttendanceRate(records, { expectedSchoolId: 10 });
  } catch (e) {
    if (e.code === 'TENANT_ISOLATION_VIOLATION') caught = true;
  }
  assert.strictEqual(caught, true, 'Mutant tenant bypass survived!');
});

test('جهش ۵: تغییر مخرج رگرسیون خطی روند یادگیری به طول آرایه', () => {
  const records = [
    { score: 10, date: '2026-09-01' },
    { score: 15, date: '2026-09-02' },
    { score: 20, date: '2026-09-03' }
  ];
  const res = semantic.calculateLearningProgressTrend(records);
  // شیب صحیح OLS با جلسات ۱, ۲, ۳ برابر با ۵.۰ است
  assert.strictEqual(res.slope, 5.0);

  // اگر جهش رخ دهد و دلتای ساده تقسیم بر N شود: (20 - 10) / 3 ≈ 3.33
  assert.notStrictEqual(res.slope, 3.33, 'Mutant trend formula survived!');
});

test('جهش ۶: سرکوب پرچم بحرانی در شاخص سلامت آموزشی', () => {
  const components = {
    attendance_rate: 90.0,
    chronic_absence_rate: 25.0, // بحرانی
    mean_grade: 16.0,
    failure_rate: 0
  };
  const res = semantic.calculateSchoolEducationalHealth(components);
  // پرچم بحرانی حتماً باید در critical_flags ثبت شود
  assert(res.critical_flags.includes('HIGH_CHRONIC_ABSENCE'), 'Critical flag suppressed!');
  assert.notStrictEqual(res.rating, 'EXCELLENT', 'Mutant masked critical rating!');
});

if (fail > 0) process.exit(1);

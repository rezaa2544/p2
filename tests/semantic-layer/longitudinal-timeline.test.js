/**
 * tests/semantic-layer/longitudinal-timeline.test.js
 * تست‌های واحد موتور خط زمانی طولی دانش‌آموز (P0-EI-02)
 */
'use strict';

const assert = require('assert');
const { buildStudentLongitudinalTimeline } = require('../../server/analytics/timeline.js');

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

console.log('▸ تست‌های خط زمانی چندساله دانش‌آموز (Longitudinal Student Timeline)');

test('تجمیع سوابق آرشیوشده با سوابق زنده در چند سال تحصیلی', () => {
  const student = { id: 10, name: 'علی رضایی', school_id: 1, grade: 9 };

  // سال گذشته در آرشیو (سال هشتم): معدل 16.0، حضور 95%
  const archive = [
    { student_id: 10, academic_year: '1402-1403', grade: 8, avg_score: 16.0, attendance_rate: '95%', school_id: 1 }
  ];

  // سال جاری (سال نهم): سه نمره 18, 19, 20 (میانگین 19.0)، حضور کامل
  const grades = [
    { student_id: 10, academic_year: '1403-1404', score: 18, max_score: 20, subject_id: 'math', school_id: 1 },
    { student_id: 10, academic_year: '1403-1404', score: 19, max_score: 20, subject_id: 'physics', school_id: 1 },
    { student_id: 10, academic_year: '1403-1404', score: 20, max_score: 20, subject_id: 'chemistry', school_id: 1 }
  ];

  const attendance = [
    { student_id: 10, academic_year: '1403-1404', status: 'present', school_id: 1 },
    { student_id: 10, academic_year: '1403-1404', status: 'present', school_id: 1 }
  ];

  const res = buildStudentLongitudinalTimeline({
    student,
    archive,
    grades,
    attendance
  }, { expectedSchoolId: 1 });

  assert.strictEqual(res.student_id, 10);
  assert.strictEqual(res.summary.total_years_recorded, 2);
  assert.strictEqual(res.summary.overall_gpa, 17.5); // (16 + 19) / 2 = 17.5
  assert.strictEqual(res.summary.multi_year_trend, 'IMPROVING'); // رشد از 16 به 19
  assert.strictEqual(res.summary.current_mastery_level, 'ADVANCED');

  // بررسی سال‌های تحصیلی
  assert.strictEqual(res.academic_years[0].academic_year, '1402-1403');
  assert.strictEqual(res.academic_years[0].source, 'archive');
  assert.strictEqual(res.academic_years[0].gpa, 16.0);

  assert.strictEqual(res.academic_years[1].academic_year, '1403-1404');
  assert.strictEqual(res.academic_years[1].source, 'live');
  assert.strictEqual(res.academic_years[1].gpa, 19.0);

  // بررسی کشف جهش تحصیلی (+3 نمره رشد)
  const spurt = res.milestones.find(m => m.type === 'GROWTH_SPURT');
  assert(spurt !== undefined, 'Growth spurt milestone not generated!');
  assert(spurt.description.includes('+3'));
});

test('تشخیص افت تحصیلی (GROWTH_DIP) و هشدار غیبت مزمن', () => {
  const student = { id: 20, name: 'سارا احمدی', school_id: 2 };

  // سال 1: معدل 18.5
  const archive = [
    { student_id: 20, academic_year: '1402-1403', avg_score: 18.5, attendance_rate: '98%', school_id: 2 }
  ];

  // سال 2: افت به معدل 14.0 (-4.5 نمره) و غیبت مزمن (2 غایب از 5 جلسه = 40%)
  const grades = [
    { student_id: 20, academic_year: '1403-1404', score: 14, max_score: 20, school_id: 2 }
  ];
  const attendance = [
    { student_id: 20, academic_year: '1403-1404', status: 'absent', school_id: 2 },
    { student_id: 20, academic_year: '1403-1404', status: 'absent', school_id: 2 },
    { student_id: 20, academic_year: '1403-1404', status: 'present', school_id: 2 },
    { student_id: 20, academic_year: '1403-1404', status: 'present', school_id: 2 },
    { student_id: 20, academic_year: '1403-1404', status: 'present', school_id: 2 }
  ];

  const res = buildStudentLongitudinalTimeline({
    student,
    archive,
    grades,
    attendance
  }, { expectedSchoolId: 2 });

  assert.strictEqual(res.summary.multi_year_trend, 'DECLINING');
  assert.strictEqual(res.summary.retention_risk, true);

  const dip = res.milestones.find(m => m.type === 'GROWTH_DIP');
  assert(dip !== undefined, 'Growth dip milestone not generated!');

  const chronic = res.milestones.find(m => m.type === 'CHRONIC_ABSENCE_ALERT');
  assert(chronic !== undefined, 'Chronic absence alert milestone not generated!');
});

test('گارد ایزولاسیون مستأجران در خط زمانی (Tenant Isolation Guard)', () => {
  const student = { id: 30, school_id: 1 };
  const grades = [
    { student_id: 30, score: 18, school_id: 2 } // مدرسه متناقض
  ];

  assert.throws(() => {
    buildStudentLongitudinalTimeline({ student, grades }, { expectedSchoolId: 1 });
  }, /Tenant isolation violation/);
});

test('گارد شناسه دانش‌آموز (Missing Student Object)', () => {
  assert.throws(() => {
    buildStudentLongitudinalTimeline({});
  }, /Valid student object is required/);
});

if (fail > 0) process.exit(1);

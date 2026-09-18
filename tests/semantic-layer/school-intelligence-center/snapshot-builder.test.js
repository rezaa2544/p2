/**
 * آزمون ساخت شناسنامه هوشمندی مدرسه (buildSchoolIntelligenceSnapshot)
 */

'use strict';

const assert = require('assert');
const { buildSchoolIntelligenceSnapshot } = require('../../../server/analytics/school-intelligence-center');

function runTest() {
  console.log('▸ تست ۱: ساخت شناسنامه جامع هوشمندی مدرسه (buildSchoolIntelligenceSnapshot)');

  const schoolId = 10;
  const mockData = {
    schoolId,
    academicYear: '1405-1406',
    grades: [
      { school_id: 10, student_id: 1, subject_id: 101, score: 18.0 },
      { school_id: 10, student_id: 2, subject_id: 101, score: 16.0 },
      { school_id: 10, student_id: 3, subject_id: 102, score: 8.5 } // 1 failing
    ],
    attendanceSessions: [
      { school_id: 10, student_id: 1, status: 'present', day: 'شنبه' },
      { school_id: 10, student_id: 2, status: 'present', day: 'شنبه' },
      { school_id: 10, student_id: 3, status: 'absent', day: 'چهارشنبه' }
    ],
    schedule: [
      { school_id: 10, teacher_id: 50, class_id: 1 },
      { school_id: 10, teacher_id: 50, class_id: 2 }
    ],
    classes: [
      { id: 1, school_id: 10, name: 'کلاس دهم الف' }
    ],
    cases: [
      { case_id: 'C1', school_id: 10, status: 'OPEN', priority: 'HIGH', assigned_to_id: null }
    ],
    teacherNotes: [
      { school_id: 10, teacher_id: 50, student_id: 1, body: 'بازخورد کلاسی' }
    ]
  };

  const snapshot = buildSchoolIntelligenceSnapshot(mockData);

  assert.strictEqual(snapshot.school_id, 10);
  assert.strictEqual(snapshot.academic_year, '1405-1406');
  assert.ok(snapshot.health_index, 'Health index should be computed');
  assert.ok(snapshot.risk_summary, 'Risk summary should be generated');
  assert.ok(snapshot.action_center.length > 0, 'Principal action items should be generated');
  assert.strictEqual(snapshot.academic_summary.average_gpa, 14.17); // (18 + 16 + 8.5) / 3 = 42.5 / 3 = 14.17
  assert.strictEqual(snapshot.attendance_summary.calendar_rate, 66.67); // 2 / 3 * 100
  assert.strictEqual(snapshot.attendance_summary.peak_absence_day, 'wednesday');
  assert.strictEqual(snapshot.teacher_summary.active_teachers_count, 1);
  assert.strictEqual(snapshot.intervention_summary.active_cases_count, 1);
  assert.strictEqual(snapshot.intervention_summary.unassigned_high_priority_count, 1);

  console.log('  ✅ صحت ساخت شناسنامه هوشمندی و تجمیع داده‌های چندگانه مدرسه');
}

module.exports = { runTest };
if (require.main === module) runTest();

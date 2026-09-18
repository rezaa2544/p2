/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard/critical-issues.test.js
   -------------------------------------------------------------------
   P0-EI-05: Critical Issues Detection Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { detectSchoolCriticalIssues } = require('../../../server/analytics/school-health-dashboard');

function run() {
  console.log('▸ تست ۲: کشف نقاط بحرانی و مخاطرات حاد آموزشی (detectSchoolCriticalIssues)');

  // آماده‌سازی داده‌های آزمون:
  // ۱۰ دانش‌آموز، ۵ نفر غایب مزمن، افت نمرات
  const students = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, school_id: 10 }));

  // حضور: ۵ دانش‌آموز اول تماماً غایب در ۵ جلسه
  const attendance = [];
  for (let sId = 1; sId <= 10; sId++) {
    for (let d = 1; d <= 5; d++) {
      attendance.push({
        id: sId * 10 + d,
        school_id: 10,
        student_id: sId,
        date: `2026-10-0${d}`,
        status: sId <= 5 ? 'absent' : 'present'
      });
    }
  }

  // نمرات: افت شدید تحصیلی برای ۵ دانش‌آموز (۲۰ -> ۱۴ -> ۷)
  const grades = [];
  for (let sId = 1; sId <= 5; sId++) {
    grades.push(
      { id: sId * 10 + 1, school_id: 10, student_id: sId, score: 20, max_score: 20, date: '2026-10-01' },
      { id: sId * 10 + 2, school_id: 10, student_id: sId, score: 14, max_score: 20, date: '2026-10-02' },
      { id: sId * 10 + 3, school_id: 10, student_id: sId, score: 7, max_score: 20, date: '2026-10-03' }
    );
  }

  // آزمون‌های با پایایی ضعیف
  const assessments = [
    { id: 101, school_id: 10, reliability_classification: 'POOR' },
    { id: 102, school_id: 10, reliability_classification: 'POOR' }
  ];

  const issues = detectSchoolCriticalIssues({
    students,
    attendance,
    grades,
    assessments
  });

  assert(issues.length >= 3, `باید حداقل ۳ مسأله بحرانی کشف شود (کشف‌شده: ${issues.length})`);
  assert(issues.some(i => i.issue_type === 'CHRONIC_ABSENCE_SURGE'));
  assert(issues.some(i => i.issue_type === 'COLLECTIVE_LEARNING_DECLINE'));
  assert(issues.some(i => i.issue_type === 'ASSESSMENT_QUALITY_DEGRADATION'));

  const chronicIssue = issues.find(i => i.issue_type === 'CHRONIC_ABSENCE_SURGE');
  assert.strictEqual(chronicIssue.affected_count, 5);
  assert(chronicIssue.evidence.length >= 2);

  console.log('  ✅ کشف دقیق طغیان غیبت مزمن، افت جمعی یادگیری و افت کیفیت آزمون‌ها');
}

if (require.main === module) run();
module.exports = { run };

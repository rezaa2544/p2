/**
 * آزمون تحلیل و احصای نیازمندی‌های منطقه‌ای (calculateRegionalNeeds)
 */

'use strict';

const assert = require('assert');
const { calculateRegionalNeeds } = require('../../../server/analytics/regional-intelligence-network');

function runTest() {
  console.log('▸ تست ۲: تحلیل و احصای نیازمندی‌های منابع منطقه‌ای در ۵ شاخه (calculateRegionalNeeds)');

  const mockSchools = [
    {
      school_id: 1,
      intervention_summary: { unassigned_high_priority_count: 3 }, // نیاز مشاوره‌ای
      attendance_summary: { chronic_absence_rate: 14.0 },           // نیاز حضور
      academic_summary: { at_risk_subjects_count: 2 },              // نیاز یادگیری
      assessment_summary: { hard_exams_count: 2 },                  // نیاز سنجش
      teacher_summary: { overloaded_teachers_count: 2 }             // نیاز توانمندسازی
    },
    {
      school_id: 2,
      intervention_summary: { unassigned_high_priority_count: 0 },
      attendance_summary: { chronic_absence_rate: 4.0 },
      academic_summary: { at_risk_subjects_count: 0 },
      assessment_summary: { hard_exams_count: 0 },
      teacher_summary: { overloaded_teachers_count: 0 }
    }
  ];

  const needs = calculateRegionalNeeds({ schools: mockSchools });

  assert.ok(Array.isArray(needs));
  assert.strictEqual(needs.length, 5, 'Should identify all 5 standard categories when triggers exist');

  // بررسی اولویت بحرانی برای پرونده‌های معوق مشاوره‌ای
  const counselingNeed = needs.find(n => n.category === 'COUNSELING_SUPPORT');
  assert.ok(counselingNeed);
  assert.strictEqual(counselingNeed.priority, 'CRITICAL');
  assert.strictEqual(counselingNeed.target_schools_count, 1);

  // بررسی نیاز حمایت حضور
  const attendanceNeed = needs.find(n => n.category === 'ATTENDANCE_SUPPORT');
  assert.ok(attendanceNeed);

  // بررسی نیاز حمایت یادگیری
  const learningNeed = needs.find(n => n.category === 'LEARNING_SUPPORT');
  assert.ok(learningNeed);

  // بررسی نیاز کیفیت سنجش و معلمان
  assert.ok(needs.some(n => n.category === 'ASSESSMENT_QUALITY_SUPPORT'));
  assert.ok(needs.some(n => n.category === 'TEACHER_DEVELOPMENT'));

  console.log('  ✅ تفکیک پنج‌گانه نیازهای منابع و اولویت‌بندی مداخله حمایتی');
}

module.exports = { runTest };
if (require.main === module) runTest();

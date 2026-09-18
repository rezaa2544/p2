/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/risk-classification.test.js
   -------------------------------------------------------------------
   P0-EI-04: Multi-Level Risk Classification & Actionable Insights Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  detectAttendanceRisk,
  generateAttendanceInsights
} = require('../../../server/analytics/attendance-intelligence');

function run() {
  console.log('▸ تست ۶: سطح‌بندی ریسک حضور و تولید بینش‌های هوشمند (Risk Classification & Insights)');

  // سطح LOW: دانش‌آموز منظم
  const lowData = [
    { student_id: 1, date: '2026-10-01', status: 'present' },
    { student_id: 1, date: '2026-10-02', status: 'present' },
    { student_id: 1, date: '2026-10-03', status: 'present' },
    { student_id: 1, date: '2026-10-04', status: 'present' },
    { student_id: 1, date: '2026-10-05', status: 'present' }
  ];
  const rLow = detectAttendanceRisk({ attendance: lowData, studentId: 1 });
  assert.strictEqual(rLow.risk_level, 'LOW');

  // سطح MEDIUM: نرخ غیبت بین ۵ تا ۱۰ درصد یا افت زمانی
  const medData = [
    { student_id: 2, date: '2026-10-01', status: 'present' },
    { student_id: 2, date: '2026-10-02', status: 'present' },
    { student_id: 2, date: '2026-10-03', status: 'present' },
    { student_id: 2, date: '2026-10-04', status: 'present' },
    { student_id: 2, date: '2026-10-05', status: 'present' },
    { student_id: 2, date: '2026-10-06', status: 'present' },
    { student_id: 2, date: '2026-10-07', status: 'present' },
    { student_id: 2, date: '2026-10-08', status: 'present' },
    { student_id: 2, date: '2026-10-09', status: 'present' },
    { student_id: 2, date: '2026-10-10', status: 'present' },
    { student_id: 2, date: '2026-10-11', status: 'present' },
    { student_id: 2, date: '2026-10-12', status: 'absent' } // ۱ غیبت از ۱۲ جلسه = ۸٫۳۳٪
  ];
  const rMed = detectAttendanceRisk({ attendance: medData, studentId: 2 });
  assert.strictEqual(rMed.risk_level, 'MEDIUM');

  // سطح HIGH: نرخ غیبت مزمن ۱۰٪ تا ۲۰٪
  const highData = [
    { student_id: 3, date: '2026-10-01', status: 'absent' },
    { student_id: 3, date: '2026-10-02', status: 'present' },
    { student_id: 3, date: '2026-10-03', status: 'present' },
    { student_id: 3, date: '2026-10-04', status: 'present' },
    { student_id: 3, date: '2026-10-05', status: 'present' },
    { student_id: 3, date: '2026-10-06', status: 'present' },
    { student_id: 3, date: '2026-10-07', status: 'present' },
    { student_id: 3, date: '2026-10-08', status: 'present' }
  ];
  const rHigh = detectAttendanceRisk({ attendance: highData, studentId: 3 });
  assert.strictEqual(rHigh.risk_level, 'HIGH');

  // سطح CRITICAL: غیبت بالای ۲۰٪
  const critData = [
    { student_id: 4, date: '2026-10-01', status: 'absent' },
    { student_id: 4, date: '2026-10-02', status: 'absent' },
    { student_id: 4, date: '2026-10-03', status: 'present' },
    { student_id: 4, date: '2026-10-04', status: 'present' },
    { student_id: 4, date: '2026-10-05', status: 'present' }
  ];
  const rCrit = detectAttendanceRisk({ attendance: critData, studentId: 4 });
  assert.strictEqual(rCrit.risk_level, 'CRITICAL');

  // آزمون تولید بینش‌های هوشمند اقدام‌محور (generateAttendanceInsights)
  const insights = generateAttendanceInsights({
    risk: rCrit,
    weeklyPattern: { pattern_detected: true, highest_risk_day: 'saturday' },
    lateArrival: { escalation_detected: true, average_delay_minutes: 25 },
    quality: { reliability_score: 65 }
  });

  assert(insights.length >= 3, 'باید حداقل ۳ بینش کاربردی صادر شود');
  assert(insights.some(i => i.type === 'CHRONIC_ABSENCE' && i.severity === 'CRITICAL'));
  assert(insights.some(i => i.type === 'WEEKDAY_PATTERN'));
  assert(insights.some(i => i.type === 'LATE_ARRIVAL_ESCALATION'));
  assert(insights.some(i => i.type === 'DATA_QUALITY_WARNING'));

  console.log('  ✅ تفکیک کامل سطوح چهارگانه ریسک (LOW, MEDIUM, HIGH, CRITICAL) و تولید بینش‌های هوشمند');
}

if (require.main === module) run();
module.exports = { run };

/**
 * آزمون کشف الگوهای سیستماتیک و توضیح‌پذیر آموزشی منطقه (detectRegionalPatterns)
 */

'use strict';

const assert = require('assert');
const { detectRegionalPatterns } = require('../../../server/analytics/regional-intelligence-network');

function runTest() {
  console.log('▸ تست ۳: کشف الگوهای سیستماتیک و توضیح‌پذیر آموزشی منطقه (detectRegionalPatterns)');

  const mockSchools = [
    {
      school_id: 1,
      attendance_summary: { peak_absence_day: 'wednesday' },
      assessment_summary: { total_exams_analyzed: 10, hard_exams_count: 3 },
      intervention_summary: { unassigned_high_priority_count: 2 }
    },
    {
      school_id: 2,
      attendance_summary: { peak_absence_day: 'wednesday' },
      assessment_summary: { total_exams_analyzed: 10, hard_exams_count: 2 },
      intervention_summary: { unassigned_high_priority_count: 1 }
    },
    {
      school_id: 3,
      attendance_summary: { peak_absence_day: 'saturday' },
      assessment_summary: { total_exams_analyzed: 10, hard_exams_count: 0 },
      intervention_summary: { unassigned_high_priority_count: 0 }
    }
  ];

  const patterns = detectRegionalPatterns({ schools: mockSchools });

  assert.ok(Array.isArray(patterns));
  assert.ok(patterns.length >= 2, 'Should discover systemic patterns');

  // ۱. بررسی الگوی تمرکز غیبت بر روز چهارشنبه
  const attPattern = patterns.find(p => p.domain === 'ATTENDANCE');
  assert.ok(attPattern);
  assert.ok(attPattern.description.includes('چهارشنبه'));
  assert.ok(attPattern.confidence >= 0.80);

  // ۲. بررسی الگوی انباشت پرونده‌های مداخله
  const intPattern = patterns.find(p => p.domain === 'INTERVENTION');
  assert.ok(intPattern);
  assert.ok(intPattern.confidence >= 0.85);

  console.log('  ✅ کشف الگوهای توضیح‌پذیر تقویمی، ارزیابی و ظرفیت مداخله');
}

module.exports = { runTest };
if (require.main === module) runTest();

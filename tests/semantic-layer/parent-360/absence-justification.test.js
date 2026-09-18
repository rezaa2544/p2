/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/absence-justification.test.js
   -------------------------------------------------------------------
   P0-EI-06: Two-Way Absence Justification Validation Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { validateAbsenceJustification } = require('../../../server/analytics/parent-360');

function run() {
  console.log('▸ تست ۴: اعتبارسنجی ثبت درخواست موجه‌سازی غیبت (validateAbsenceJustification)');

  const parentLinks = [{ parent_id: 10, student_id: 101 }];

  // ۱. درخواست معتبر با ادله و پیوند قانونی
  const resValid = validateAbsenceJustification({
    parentId: 10,
    studentId: 101,
    attendanceId: 501,
    date: '1403-07-14',
    reason: 'بیماری آنفلوآنزا و مراجعه به پزشک',
    attachmentRef: 'cert_file_123.pdf',
    parentLinks
  });

  assert.strictEqual(resValid.valid, true);
  assert.strictEqual(resValid.status, 'PENDING_SCHOOL_REVIEW');
  assert.strictEqual(resValid.submission.parent_id, 10);
  assert.strictEqual(resValid.submission.student_id, 101);
  assert.strictEqual(resValid.submission.attendance_id, 501);
  assert.strictEqual(resValid.submission.reason_sanitized, 'بیماری آنفلوآنزا و مراجعه به پزشک');

  // ۲. رد درخواست به دلیل دلیل کوتاه و نامعتبر
  assert.throws(() => {
    validateAbsenceJustification({
      parentId: 10,
      studentId: 101,
      attendanceId: 501,
      reason: '  ' // خالی یا کمتر از ۳ نویسه
    });
  }, err => err.code === 'VALIDATION_FAILED' || /Reason must be at least/i.test(err.message));

  // ۳. رد درخواست توسط والد غیرمجاز (IDOR)
  assert.throws(() => {
    validateAbsenceJustification({
      parentId: 99, // والد بیگانه
      studentId: 101,
      reason: 'دلیل ساختگی',
      parentLinks
    });
  }, err => err.code === 'PARENT_ACCESS_FORBIDDEN');

  console.log('  ✅ اعتبارسنجی دقیق ادله، پاکسازی متن و تضمین تأیید دوطرفه مدرسه');
}

if (require.main === module) run();
module.exports = { run };

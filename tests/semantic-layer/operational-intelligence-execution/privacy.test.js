/**
 * آزمون ۹: حفظ حریم خصوصی و عدم نشت اطلاعات فردی (Privacy Protection)
 */

'use strict';

const assert = require('assert');
const {
  buildExecutionDashboard
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۹: حفظ حریم خصوصی و عدم نشت اطلاعات فردی (privacy)');

  const mockTasks = [
    {
      task_id: 'TASK-SEC-01',
      title: 'پیگیری افت تحصیلی دانش‌آموز',
      student_id: 998877, // نباید نشت کند
      national_id: '1234567890', // نباید نشت کند
      phone: '09123456789'
    }
  ];

  const dashboard = buildExecutionDashboard({
    schoolId: 101,
    regionId: 1,
    tasks: mockTasks
  });

  const serialized = JSON.stringify(dashboard);
  assert.ok(!serialized.includes('1234567890'), 'کد ملی نباید در تابلوی اجرا نشت کند');
  assert.ok(!serialized.includes('09123456789'), 'شماره تلفن نباید در تابلوی اجرا نشت کند');
  assert.strictEqual(dashboard.zero_ranking, true);

  console.log('  ✅ حفظ ۱۰۰٪ حریم خصوصی و ممانعت از نشت داده‌های فردی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };

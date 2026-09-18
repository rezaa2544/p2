/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/parent-access-guard.test.js
   -------------------------------------------------------------------
   P0-EI-06: Parent-Child Anti-IDOR Access Guard Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { enforceParentChildAccessGuard } = require('../../../server/analytics/parent-360');

function run() {
  console.log('▸ تست ۱: گارد امنیتی دسترسی والد-فرزند و ضد نفوذ (Anti-IDOR Access Guard)');

  const parentLinks = [
    { id: 1, parent_id: 100, student_id: 201 },
    { id: 2, parent_id: 100, student_id: 202 } // والد ۱۰۰ دو فرزند دارد
  ];

  // ۱. دسترسی مجاز والد به فرزند خود
  assert.doesNotThrow(() => {
    enforceParentChildAccessGuard(100, 201, parentLinks);
    enforceParentChildAccessGuard(100, 202, parentLinks);
  }, 'والد مجاز باید دسترسی کامل به فرزندان خود داشته باشد');

  // ۲. سقط قاطع تلاش برای دسترسی به فرزند بیگانه (Anti-IDOR)
  assert.throws(() => {
    enforceParentChildAccessGuard(100, 999, parentLinks); // فرزند متعلق به دیگری
  }, err => err.code === 'PARENT_ACCESS_FORBIDDEN' || /Access forbidden/i.test(err.message));

  // ۳. سقط قاطع در صورت نشت مستأجر بین‌مدرسه‌ای
  assert.throws(() => {
    enforceParentChildAccessGuard(100, 201, parentLinks, {
      student: { id: 201, school_id: 15 },
      expectedSchoolId: 10 // مدرسه مورد انتظار ۱۰ است اما دانش‌آموز در مدرسه ۱۵
    });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  console.log('  ✅ جلوگیری قطعی از آسیب‌پذیری IDOR و تأیید پیوند رسمی والد-فرزند');
}

if (require.main === module) run();
module.exports = { run };

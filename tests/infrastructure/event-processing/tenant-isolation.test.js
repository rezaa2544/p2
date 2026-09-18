/**
 * آزمون ۱: تفکیک چندمستأجری در لایه پردازش رویدادها (tenant-isolation)
 */

'use strict';

const assert = require('assert');
const {
  enforceEventProcessingTenantIsolation,
  validateEventTenantBoundary,
  publishDomainEvent,
  consumeEvent
} = require('../../../server/infrastructure/event-processing-layer');

function runTests() {
  console.log('▸ تست ۱: تفکیک چندمستأجری و سقط Fail-Closed در پردازش رویداد (tenant-isolation)');

  // ۱. گارد دسترسی نقش و تفکیک مستأجر
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceEventProcessingTenantIsolation(superadmin, { school_id: 101 }), true);

  const manager = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforceEventProcessingTenantIsolation(manager, { school_id: 101 }), true);

  // سقط قاطع نفوذ IDOR به مدرسه دیگر
  assert.throws(() => {
    enforceEventProcessingTenantIsolation(manager, { school_id: 102 });
  }, /EVENT_PROCESSING_TENANT_ISOLATION_VIOLATION/);

  // سقط قاطع نفوذ اداره منطقه به منطقه دیگر
  const eduOffice = { id: 20, role: 'edu_office', region_id: 1 };
  assert.strictEqual(enforceEventProcessingTenantIsolation(eduOffice, { region_id: 1 }), true);
  assert.throws(() => {
    enforceEventProcessingTenantIsolation(eduOffice, { region_id: 2 });
  }, /EVENT_PROCESSING_TENANT_ISOLATION_VIOLATION/);

  // سقط نقش‌های غیرمجاز
  const student = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforceEventProcessingTenantIsolation(student, { school_id: 101 });
  }, /EVENT_PROCESSING_ROLE_ACCESS_DENIED/);

  assert.throws(() => {
    enforceEventProcessingTenantIsolation(null, { school_id: 101 });
  }, /EVENT_PROCESSING_ROLE_ACCESS_DENIED/);

  // ۲. انتشار رویداد بدون شناسه مستأجر ممنوع است
  assert.throws(() => {
    publishDomainEvent({ type: 'test.event', payload: {} });
  }, /EVENT_PROCESSING_TENANT_ISOLATION_VIOLATION/);

  // ۳. مصرف رویداد متعلق به مدرسه A توسط مدرسه B مسدود می‌شود
  const eventSchoolA = publishDomainEvent({
    school_id: 101,
    type: 'school.event',
    payload: { status: 'active' }
  });

  assert.throws(() => {
    validateEventTenantBoundary(eventSchoolA, { school_id: 102 });
  }, /EVENT_PROCESSING_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و کدهای خطای مصوب با موفقیت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };

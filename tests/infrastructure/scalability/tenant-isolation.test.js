/**
 * آزمون ۱: تفکیک چندمستأجری در لایه زیرساخت و فضای‌نام کش (tenant-isolation)
 */

'use strict';

const assert = require('assert');
const {
  generateTenantCacheKey,
  invalidateTenantCache,
  enforceInfrastructureTenantIsolation,
  TENANT_CACHE_PREFIX
} = require('../../../server/infrastructure/scalability-foundation');

function runTests() {
  console.log('▸ تست ۱: تفکیک چندمستأجری در لایه زیرساخت و فضای‌نام کش (tenant-isolation)');

  // ۱. اعتبارسنجی تولید کلید کش فضای‌نام ایزوله
  const key1 = generateTenantCacheKey(101, 'bootstrap', 'u:101');
  assert.strictEqual(key1, 'payesh:t:101:bootstrap:u:101');
  assert.ok(key1.startsWith(TENANT_CACHE_PREFIX));

  // پاکسازی کاراکترهای نامعتبر در کلید
  const keyDirty = generateTenantCacheKey('101@#$', 'analytics!', 'grade summary');
  assert.strictEqual(keyDirty, 'payesh:t:101:analytics:grade_summary');

  // سقط صریح در نبود شناسه مستأجر (Fail-Closed)
  assert.throws(() => {
    generateTenantCacheKey(null, 'bootstrap', 'key1');
  }, /INFRASTRUCTURE_TENANT_ISOLATION_VIOLATION/);

  assert.throws(() => {
    generateTenantCacheKey('', 'bootstrap', 'key1');
  }, /INFRASTRUCTURE_TENANT_ISOLATION_VIOLATION/);

  // ۲. الگوی ابطال کش مستأجر
  const patternAll = invalidateTenantCache(101);
  assert.strictEqual(patternAll, 'payesh:t:101:*');

  const patternNamespace = invalidateTenantCache(101, 'grades');
  assert.strictEqual(patternNamespace, 'payesh:t:101:grades:*');

  assert.throws(() => {
    invalidateTenantCache(null);
  }, /INFRASTRUCTURE_TENANT_ISOLATION_VIOLATION/);

  // ۳. گارد کنترل نقش و دسترسی چندمستأجری (enforceInfrastructureTenantIsolation)
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceInfrastructureTenantIsolation(superadmin, { school_id: 101 }), true);

  const manager = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforceInfrastructureTenantIsolation(manager, { school_id: 101 }), true);

  // سقط نفوذ IDOR بین مدارس
  assert.throws(() => {
    enforceInfrastructureTenantIsolation(manager, { school_id: 102 });
  }, /INFRASTRUCTURE_TENANT_ISOLATION_VIOLATION/);

  // سقط نفوذ اداره منطقه به منطقه دیگر
  const eduOffice = { id: 20, role: 'edu_office', region_id: 1 };
  assert.strictEqual(enforceInfrastructureTenantIsolation(eduOffice, { region_id: 1 }), true);
  assert.throws(() => {
    enforceInfrastructureTenantIsolation(eduOffice, { region_id: 2 });
  }, /INFRASTRUCTURE_TENANT_ISOLATION_VIOLATION/);

  // سقط نقش‌های غیرمجاز
  const student = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforceInfrastructureTenantIsolation(student, { school_id: 101 });
  }, /INFRASTRUCTURE_ROLE_ACCESS_DENIED/);

  assert.throws(() => {
    enforceInfrastructureTenantIsolation(null, { school_id: 101 });
  }, /INFRASTRUCTURE_ROLE_ACCESS_DENIED/);

  console.log('  ✅ تفکیک کامل چندمستأجری و ایمنی فضای‌نام کش با موفقیت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };

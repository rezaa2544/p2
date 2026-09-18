/**
 * tests/infrastructure/phase5/resource-governance/quota-enforcement.test.js
 * آزمون اعمال سهمیه‌بندی منابع و نظارت بر بار (Resource Quota Enforcement)
 */

'use strict';

const assert = require('assert');
const {
  allocateSchoolTenant,
  buildResourceGovernanceSnapshot
} = require('../../../../server/infrastructure/resource-governance');

console.log('--- آزمون سهمیه‌بندی منابع مدارس و کلاسترها ---');

// ۱. تخصیص سهمیه مدرسه عادی
const urbanSchool = {
  id: 101,
  name: 'دبیرستان شهید بهشتی',
  province: 'تهران',
  student_count: 500,
  is_rural: false,
  is_border: false
};
const urbanAlloc = allocateSchoolTenant(urbanSchool, 'ir-tehran-1');
assert.strictEqual(urbanAlloc.assigned_region, 'ir-tehran-1');
assert.strictEqual(urbanAlloc.support_tier, 'URBAN_STANDARD');
assert.strictEqual(urbanAlloc.low_bandwidth_mode, false);
assert.strictEqual(urbanAlloc.resource_quota.max_concurrent_sessions, 200);

// ۲. تابلوی جامع حاکمیت منابع ملی
const snapshot = buildResourceGovernanceSnapshot({
  'ir-tehran-1': { rps: 500, sessions: 35000 }
});
assert.strictEqual(snapshot.national_overview.total_regions, 7);
assert.strictEqual(snapshot.regions['ir-tehran-1'].current_rps, 500);
assert.strictEqual(snapshot.human_governance.requires_human_approval, true);
assert.strictEqual(snapshot.zero_ranking_guarantee.enforced, true);

console.log('✅ ۱/۴: اعمال سهمیه‌بندی منابع با موفقیت تایید شد');

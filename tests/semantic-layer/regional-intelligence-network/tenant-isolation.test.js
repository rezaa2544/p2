/**
 * آزمون ایزولاسیون چندمستأجری منطقه‌ای و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)
 */

'use strict';

const assert = require('assert');
const {
  enforceRegionalTenantIsolation,
  buildRegionalSnapshot
} = require('../../../server/analytics/regional-intelligence-network');

function runTest() {
  console.log('▸ تست ۹: ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Regional Tenant Isolation)');

  const regionA = 1;
  const regionB = 2;

  const eduOfficeRegionA = { id: 10, role: 'edu_office', region_id: regionA };
  const eduOfficeRegionB = { id: 20, role: 'edu_office', region_id: regionB };

  // ۱. کارشناس منطقه ب نباید به منطقه الف دسترسی داشته باشد
  assert.throws(
    () => enforceRegionalTenantIsolation(eduOfficeRegionB, { region_id: regionA }),
    /REGIONAL_TENANT_ISOLATION_VIOLATION/,
    'Cross-region access by edu_office must be rejected'
  );

  // ۲. مدیر مدرسه نباید به شبکه منطقه‌ای دسترسی داشته باشد
  const schoolManager = { id: 101, role: 'manager', school_id: 5, region_id: regionA };
  assert.throws(
    () => enforceRegionalTenantIsolation(schoolManager, { region_id: regionA }),
    /REGIONAL_TENANT_ISOLATION_VIOLATION/,
    'School manager must not access regional intelligence network'
  );

  // ۳. نشت مدارس منطقه دیگر در تجمیع منطقه‌ای
  const mixedSchools = [
    { school_id: 1, region_id: regionA },
    { school_id: 2, region_id: regionB } // مدرسه بیگانه
  ];

  assert.throws(
    () => buildRegionalSnapshot({ regionId: regionA, schools: mixedSchools }, { requester: eduOfficeRegionA }),
    /REGIONAL_TENANT_ISOLATION_VIOLATION/,
    'Cross-region school data in regional snapshot must trigger fail-closed exception'
  );

  console.log('  ✅ مسدودسازی قاطع نشت مستأجران منطقه‌ای (Fail-Closed) در تمامی مسیرها');
}

module.exports = { runTest };
if (require.main === module) runTest();

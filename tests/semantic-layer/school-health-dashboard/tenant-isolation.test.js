/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard/tenant-isolation.test.js
   -------------------------------------------------------------------
   P0-EI-05: Multi-Tenant Fail-Closed Isolation Guards Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  calculateSchoolHealthIndex,
  detectSchoolCriticalIssues,
  aggregateSchoolEducationalMetrics,
  enforceSchoolHealthTenantIsolation
} = require('../../../server/analytics/school-health-dashboard');

function run() {
  console.log('▸ تست ۸: ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)');

  const leakedAttendance = [
    { id: 1, school_id: 10, student_id: 1, date: '2026-10-01', status: 'present' },
    { id: 2, school_id: 99, student_id: 2, date: '2026-10-01', status: 'absent' } // مستأجر بیگانه ۹۹
  ];

  const leakedGrades = [
    { id: 1, school_id: 10, student_id: 1, score: 18 },
    { id: 2, school_id: 99, student_id: 2, score: 12 }
  ];

  // ۱. بررسی مستقیم تابع enforceSchoolHealthTenantIsolation
  assert.throws(() => {
    enforceSchoolHealthTenantIsolation(leakedAttendance, 10);
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۲. سقط در detectSchoolCriticalIssues
  assert.throws(() => {
    detectSchoolCriticalIssues({ attendance: leakedAttendance, grades: leakedGrades }, { expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۳. سقط در aggregateSchoolEducationalMetrics
  assert.throws(() => {
    aggregateSchoolEducationalMetrics({
      school_id: 10,
      attendance: leakedAttendance,
      grades: leakedGrades
    }, { expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  console.log('  ✅ مسدودسازی قاطع نشت مستأجران (Fail-Closed) در تمامی توابع داشبورد سلامت');
}

if (require.main === module) run();
module.exports = { run };

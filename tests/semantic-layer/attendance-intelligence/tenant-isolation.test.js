/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/tenant-isolation.test.js
   -------------------------------------------------------------------
   P0-EI-04: Multi-Tenant Fail-Closed Isolation Guards Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  analyzeAttendanceQuality,
  detectAttendanceRisk,
  analyzeWeeklyAttendancePattern,
  analyzeLateArrival,
  enforceAttendanceTenantIsolation
} = require('../../../server/analytics/attendance-intelligence');

function run() {
  console.log('▸ تست ۹: ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)');

  const leakedAttendance = [
    { id: 1, school_id: 10, student_id: 1, date: '2026-10-01', status: 'present' },
    { id: 2, school_id: 99, student_id: 2, date: '2026-10-01', status: 'absent' } // مستأجر بیگانه ۹۹
  ];
  const leakedStudents = [
    { id: 1, school_id: 10 },
    { id: 2, school_id: 99 }
  ];

  // ۱. بررسی مستقیم تابع enforceAttendanceTenantIsolation
  assert.throws(() => {
    enforceAttendanceTenantIsolation(leakedAttendance, 10);
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۲. سقط در analyzeAttendanceQuality
  assert.throws(() => {
    analyzeAttendanceQuality({ attendance: leakedAttendance, students: leakedStudents, school_id: 10 }, { expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۳. سقط در detectAttendanceRisk
  assert.throws(() => {
    detectAttendanceRisk({ attendance: leakedAttendance, studentId: 1 }, { expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۴. سقط در analyzeWeeklyAttendancePattern
  assert.throws(() => {
    analyzeWeeklyAttendancePattern({ attendance: leakedAttendance, studentId: 1 }, { expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۵. سقط در analyzeLateArrival
  assert.throws(() => {
    analyzeLateArrival({ attendance: leakedAttendance, studentId: 1 }, { expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  console.log('  ✅ مسدودسازی قاطع نشت مستأجران (Fail-Closed) در تمامی توابع هوشمندی حضور');
}

if (require.main === module) run();
module.exports = { run };

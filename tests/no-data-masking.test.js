#!/usr/bin/env node
/**
 * tests/no-data-masking.test.js
 * گیت رفع D1 — هیچ موتور هوشمندی نباید غیبت داده را با اعداد خوش‌بینانه پنهان کند.
 *
 * قبل از این اصلاح: مدرسه‌ای با صفر نمره و صفر جلسه، شاخص سلامت ۸۳.۲ و
 * وضعیت HEALTHY می‌گرفت، و دانش‌آموزی بدون هیچ داده‌ای has_critical_risk:false
 * برمی‌گرداند. این تست آن رفتار را برای همیشه قرمز می‌کند.
 */
'use strict';

const assert = require('assert');
const path = require('path');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

const {
  buildSchoolIntelligenceSnapshot,
  calculateSchoolHealthIndex
} = require(path.join(__dirname, '..', 'server', 'analytics', 'school-intelligence-center'));
const { evaluateQualityPillars, QUALITY_STATUS } = require(path.join(__dirname, '..', 'server', 'analytics', 'quality-governance'));
const { evaluateEarlyWarningRules } = require(path.join(__dirname, '..', 'server', 'analytics', 'intervention-case-management'));
const { buildRegionalSnapshot } = require(path.join(__dirname, '..', 'server', 'analytics', 'regional-intelligence-network'));

console.log('\n🛡️  گیت عدم پنهان‌سازی داده (D1 No-Masking Gate)\n');

// ۱. مدرسه کاملاً خالی
const emptySchool = buildSchoolIntelligenceSnapshot({
  schoolId: 1, grades: [], attendanceSessions: [], classes: [], schedule: [], cases: [], teacherNotes: []
});
check('مدرسه بدون داده، HEALTHY نمی‌شود', () => {
  assert.notStrictEqual(emptySchool.health_index.status, 'HEALTHY');
});
check('مدرسه بدون داده، score=null گزارش می‌دهد', () => {
  assert.strictEqual(emptySchool.health_index.score, null);
});
check('مدرسه بدون داده، data_quality=NO_DATA است', () => {
  assert.strictEqual(emptySchool.health_index.data_quality.status, 'NO_DATA');
});

// ۲. شاخص سلامت مستقیم
const noDataHealth = calculateSchoolHealthIndex({});
check('calculateSchoolHealthIndex({}) هیچ بُعدی را جعلی پر نمی‌کند', () => {
  assert.strictEqual(noDataHealth.components.academic, null);
  assert.strictEqual(noDataHealth.components.attendance, null);
  assert.strictEqual(noDataHealth.components.engagement, null);
  assert.strictEqual(noDataHealth.components.intervention, null);
});
check('calculateSchoolHealthIndex({}) هرگز HEALTHY نیست', () => {
  assert.notStrictEqual(noDataHealth.status, 'HEALTHY');
});

// ۳. داده ناقص: فقط حضور موجود
const partialHealth = calculateSchoolHealthIndex({
  attendance_summary: { calendar_rate: 95.0, chronic_absence_rate: 2.0 }
});
check('داده ناقص سقف وضعیت NEEDS_MONITORING را رعایت می‌کند', () => {
  assert.notStrictEqual(partialHealth.status, 'HEALTHY');
  assert.strictEqual(partialHealth.data_quality.status, 'PARTIAL');
});

// ۴. کیفیت حکمرانی
const noDataQuality = evaluateQualityPillars({});
check('evaluateQualityPillars({}) شاخص null و NOT_ASSESSED می‌دهد', () => {
  assert.strictEqual(noDataQuality.overall_quality_index, null);
  assert.strictEqual(noDataQuality.overall_quality_status, QUALITY_STATUS.NOT_ASSESSED);
});

// ۵. هشدار زودهنگام دانش‌آموز
const noDataStudent = evaluateEarlyWarningRules({ studentId: 1, schoolId: 1 });
check('دانش‌آموز بدون داده، ساکت گزارش نمی‌شود (INSUFFICIENT)', () => {
  assert.strictEqual(noDataStudent.data_sufficiency, 'INSUFFICIENT');
  assert.ok(noDataStudent.alerts.length >= 1, 'should raise an INSUFFICIENT_DATA alert');
});

// ۶. تجمیع منطقه‌ای: مدرسه بدون داده نباید میانگین را بالا ببرد
const region = buildRegionalSnapshot({
  regionId: 1,
  schools: [
    { school_id: 1, health_index: { status: 'HEALTHY', data_quality: { status: 'COMPLETE' } },
      attendance_summary: { calendar_rate: 60.0 }, academic_summary: { average_gpa: 10.0 } },
    { school_id: 2, health_index: { status: 'NEEDS_IMMEDIATE_ACTION', data_quality: { status: 'NO_DATA' } },
      attendance_summary: { calendar_rate: null }, academic_summary: { average_gpa: null } }
  ]
});
check('مدرسه بدون داده از میانگین منطقه‌ای حذف می‌شود، نه با ۹۰/۱۵ جایگزین', () => {
  const hs = region.educational_health_summary;
  assert.strictEqual(hs.average_attendance_rate, 60.0);
  assert.strictEqual(hs.average_gpa, 10.0);
  assert.strictEqual(hs.schools_with_no_data_count, 1);
});

console.log(`\nگیت عدم پنهان‌سازی: ${pass} pass / ${fail} fail`);
if (fail) process.exit(1);
console.log('✅ غیبت داده دیگر پنهان نمی‌شود.');

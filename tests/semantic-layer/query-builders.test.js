/**
 * tests/semantic-layer/query-builders.test.js
 * تست‌های کوئری‌سازهای لایه معنایی با تضمین Partition Pruning و Tenant Isolation
 */
'use strict';

const assert = require('assert');
const { buildAttendanceKpiQuery, buildGradesKpiQuery } = require('../../server/analytics/semantic.js');

let pass = 0;
let fail = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ ${desc}:`, err.message);
    fail++;
  }
}

console.log('▸ تست‌های کوئری‌سازهای دیتابیس (Partition Pruning & Tenant Isolation)');

test('ساخت کوئری حضور با اعمال شروط Partition Pruning بر created_at', () => {
  const q = buildAttendanceKpiQuery({
    schoolId: 10,
    startDate: '2026-09-23T00:00:00Z',
    endDate: '2027-06-21T23:59:59Z',
    classId: 101
  });

  assert(q.sql.includes('school_id = $1'));
  assert(q.sql.includes('created_at >= $2'));
  assert(q.sql.includes('created_at < $3'));
  assert(q.sql.includes('class_id = $4'));
  assert.strictEqual(q.partition_pruning_enabled, true);
  assert.deepStrictEqual(q.values, [10, '2026-09-23T00:00:00Z', '2027-06-21T23:59:59Z', 101]);
});

test('ساخت کوئری نمرات با شروط بازه زمانی و ایزولاسیون مدرسه', () => {
  const q = buildGradesKpiQuery({
    schoolId: 5,
    startDate: '2026-09-23T00:00:00Z',
    endDate: '2027-01-20T23:59:59Z',
    subjectId: 12
  });

  assert(q.sql.includes('school_id = $1'));
  assert(q.sql.includes('created_at >= $2'));
  assert(q.sql.includes('subject_id = $4'));
  assert.strictEqual(q.partition_pruning_enabled, true);
  assert.deepStrictEqual(q.values, [5, '2026-09-23T00:00:00Z', '2027-01-20T23:59:59Z', 12]);
});

test('مسدودسازی قاطع ساخت کوئری بدون schoolId (Fail-Closed Tenant Guard)', () => {
  assert.throws(() => {
    buildAttendanceKpiQuery({ startDate: '2026-09-01' });
  }, /schoolId is required to preserve tenant isolation/);

  assert.throws(() => {
    buildGradesKpiQuery({ subjectId: 1 });
  }, /schoolId is required to preserve tenant isolation/);
});

if (fail > 0) process.exit(1);

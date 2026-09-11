#!/usr/bin/env node
/* Session 8 / Wave 9 regression: class list enrichment must not rescan enrollments per class. */
'use strict';

const assert = require('assert');
const { createClassRoutes } = require('../server/routes/classes');

const enrollments = [];
for (let i = 1; i <= 100; i++) enrollments.push({ class_id: i, student_id: i });
let filterCalls = 0;
enrollments.filter = function () {
  filterCalls++;
  throw new Error('full enrollment scan per class is forbidden');
};

const store = {
  classes: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, school_id: 1, name: 'C' + (i + 1), homeroom_teacher_id: 10 })),
  enrollments,
  users: [{ id: 10, full_name: 'Teacher' }]
};
const routes = createClassRoutes({ store, db: null });

(async () => {
  const result = await routes.getClassesList({ user: { id: 1, role: 'superadmin' } }, new URLSearchParams('limit=200'));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.length, 100);
  assert.strictEqual(result.data[0].student_count, 1);
  assert.strictEqual(result.data[99].homeroom_teacher_name, 'Teacher');
  assert.strictEqual(filterCalls, 0, 'enrollments must be indexed with one pass');
  console.log('session8-classes-index: 5/5 checks ✅');
})().catch((err) => { console.error(err); process.exit(1); });

#!/usr/bin/env node
/* Session 8 / Wave 9 regression: grade enrichment must use lookup indexes. */
'use strict';

const assert = require('assert');
const { createGradeRoutes } = require('../server/routes/grades');

const subjects = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: 'S' + (i + 1) }));
const users = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, full_name: 'Student ' + (i + 1), role: 'student' }));
let findCalls = 0;
subjects.find = function () { findCalls++; throw new Error('subject scan per grade is forbidden'); };
users.find = function () { findCalls++; throw new Error('user scan per grade is forbidden'); };
const store = {
  grades: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, school_id: 1, student_id: i + 1, subject_id: i + 1, class_id: 1, score: 18 })),
  subjects,
  users
};
const routes = createGradeRoutes({ store, db: null });

(async () => {
  const result = await routes.getGradesList({ user: { id: 999, role: 'superadmin' } }, new URLSearchParams('limit=200'));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.length, 100);
  assert.strictEqual(result.data[0].subject_name, 'S100');
  assert.strictEqual(result.data[99].student_name, 'Student 1');
  assert.strictEqual(findCalls, 0, 'grade enrichment must not rescan subjects/users');
  console.log('session8-grades-index: 5/5 checks ✅');
})().catch((err) => { console.error(err); process.exit(1); });

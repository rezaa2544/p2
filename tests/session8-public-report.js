#!/usr/bin/env node
/* Session 8 / Wave 9 regression: public reports must aggregate meetings in one pass. */
'use strict';

const assert = require('assert');
const { computePublicReport } = require('../server/public-report-core');

let filterCalls = 0;
class CountingArray extends Array {
  filter(...args) {
    filterCalls++;
    return super.filter(...args);
  }
}

const minutes = new CountingArray(
  { school_id: 1, meeting_type: 'parent', meeting_date: '2026-09-01', archived: false },
  { school_id: 1, meeting_type: 'teacher', meeting_date: '2026-09-03', archived: false },
  { school_id: 1, meeting_type: 'parent', meeting_date: '2026-09-05', archived: false },
  { school_id: 1, meeting_type: 'assoc', meeting_date: '2026-09-02', archived: false }
);
const store = {
  schools: [{ id: 1, active: 1, name: 'School', county_id: 10, public_goals: 0 }],
  users: [
    { id: 1, school_id: 1, role: 'student' },
    { id: 2, school_id: 1, role: 'teacher' }
  ],
  classes: [{ id: 1, school_id: 1 }],
  counties: [{ id: 10, name: 'City' }],
  assoc_minutes: minutes
};

const report = computePublicReport(store, 1);
assert.ok(report.report, 'report exists');
assert.ok(filterCalls <= 1, 'meeting collection is filtered at most once');
assert.deepStrictEqual(report.report.meetings, [
  { key: 'parent', n: 2, last: '2026-09-05' },
  { key: 'teacher', n: 1, last: '2026-09-03' },
  { key: 'assoc', n: 1, last: '2026-09-02' }
]);

console.log('session8-public-report: 4/4 checks ✅');

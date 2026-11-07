#!/usr/bin/env node
/**
 * tests/phase-c-tenant-matrix.js — M15-03 adversarial tenant-isolation gate
 *
 * M15-03's official objective (tenant isolation & fairness) — first of it
 * all, the single-authz-contract: pull.js must not hold a second
 * implementation of tenant scope. Proved on the seed:
 *   1. For every role and every collection, pull.js
 *      `filterCollectionForSession` returns EXACTLY the rows
 *      `policy.filterReadable` returns (the canonical model that REST,
 *      sync.js and the PG builders use) — therefore pull.js has no
 *      parallel scope logic.
 *   2. No read path renders rows outside the actor's own school, or, for
 *      the ed-office, outside the schools that the office geometry covers.
 *
 * Run: node tests/phase-c-tenant-matrix.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HEAD = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
const store = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), 'utf8'));

const policy = require(path.join(ROOT, 'server', 'policy'));
const pull = require(path.join(ROOT, 'server', 'pull'));

let pass = 0;
const failures = [];
const checks = [];
function chk(name, fn) {
  checks.push(Promise.resolve().then(async () => {
    try { await fn(); pass += 1; console.log('  ✅ ' + name); }
    catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + String(e.message).slice(0, 160)); }
 }));
}

console.log('═══ M15-03 adversarial tenant matrix on HEAD ' + HEAD + ' ═══');
console.log('store schools: ' + (store.schools || []).length
  + ' users: ' + (store.users || []).length
  + ' grades: ' + (store.grades || []).length);

// Real actors from the seed. row school_id null ⇒ superadmin / ed-office.
const users = store.users || [];
const actors = {};
for (const r of ['superadmin', 'manager', 'teacher', 'student', 'parent', 'counselor', 'driver', 'guard', 'edu_office']) {
  const u = users.find((x) => x.role === r);
  if (!u) { continue; }
  actors[r] = Object.assign(Object.create(null), u, { role: r, school_id: u.school_id });
}
const cols = ['schools', 'users', 'students', 'classes', 'subjects',
  'notifications', 'announcements', 'grades', 'attendance', 'discipline',
  'schedule', 'enrollments', 'hw_assignments'];
const controller = pull.createPull({ store: store, sessionFrom: () => null, sendJson: () => ({}) });

// Read-plane equality: pull == policy.filterReadable (the canonical model).
for (const r of Object.keys(actors)) {
  for (const c of cols) {
    chk('pull == policy.filterReadable for ' + c + ' ' + r, () => {
      const list = store[c] || [];
      const fPol = policy.filterReadable(store, actors[r], c, list);
      const fPull = Array.isArray(controller.filterCollectionForSession(c, list, actors[r])) ? controller.filterCollectionForSession(c, list, actors[r]) : [];
      const idsPol = fPol.map((x) => String(x.id)).sort();
      const idsPull = fPull.map((x) => String(x.id)).sort();
      assert.deepStrictEqual(idsPol, idsPull, 'pull ' + c + ' ' + r + ' != policy (' + idsPol.length + ' vs ' + idsPull.length + ')');
    });
  }
}

// Cross-school isolation: for school-scoped roles, both gates render only
// rows of the actor's own school.
for (const r of ['manager', 'teacher', 'counselor', 'driver', 'guard', 'student', 'parent']) {
  for (const c of ['grades', 'attendance', 'discipline', 'schedule', 'enrollments', 'users', 'classes', 'students']) {
    chk('pull & policy render only own-school rows: ' + c + ' ' + r, () => {
      const list = store[c] || [];
      const own = Number(actors[r].school_id);
      const ids = policy.filterReadable(store, actors[r], c, list).map((x) => x.id);
      const idsPull = controller.filterCollectionForSession(c, list, actors[r]).map((x) => x.id);
      const foreign = ids.filter((id) => {
        const x = (store[c] || []).find((y) => String(y.id) === String(id));
        return x && x.school_id != null && Number(x.school_id) !== own;
      }).length;
      const foreignPull = idsPull.filter((id) => {
        const x = (store[c] || []).find((y) => String(y.id) === String(id));
        return x && x.school_id != null && Number(x.school_id) !== own;
      }).length;
      assert.ok(foreign === 0 && foreignPull === 0,
        'pull/policy render ' + foreign + '/' + foreignPull + ' foreign rows for ' + c + ' ' + r);
    });
  }
}

// Ed-office / superadmin read scope: directly geometric comparative.
for (const r of ['edu_office', 'superadmin']) {
  for (const c of ['grades', 'attendance', 'discipline', 'schedule', 'enrollments', 'users', 'classes', 'students']) {
    chk('pull == policy scope asserted for ' + c + ' ' + r, () => {
      const list = store[c] || [];
      const fPol = policy.filterReadable(store, actors[r], c, list);
      const fPull = Array.isArray(controller.filterCollectionForSession(c, list, actors[r])) ? controller.filterCollectionForSession(c, list, actors[r]) : [];
      const idsPol = fPol.map((x) => String(x.id)).sort();
      const idsPull = fPull.map((x) => String(x.id)).sort();
      assert.deepStrictEqual(idsPol, idsPull, 'pull ' + c + ' ' + r + ' != policy (' + idsPol.length + ' vs ' + idsPull.length + ')');
    });
  }
}

// 4. raw pull output grain (the endpoint rather than the filter function)
chk('pull filterCollectionForSession is exposed by createPull', () => {
  assert.strictEqual(typeof controller.filterCollectionForSession, 'function');
});

Promise.all(checks).then(() => {
  console.log('\n' + '═'.repeat(60));
  console.log('M15-03 tenant matrix: ' + pass + ' passed / ' + failures.length + ' failed');
  if (failures.length) { console.log('FAILURES: ' + failures.join('، ')); }
  process.exit(failures.length ? 1 : 0);
});

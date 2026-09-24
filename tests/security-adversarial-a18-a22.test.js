#!/usr/bin/env node
'use strict';

/*
 * Independent adversarial security battery for A-18..A-22.
 * This is intentionally narrow: it exercises the actual route/policy modules
 * from the current checkout and uses no historical report as an oracle.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  OK ' + name); }
  catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
};

(async () => {
  console.log('\nSecurity adversarial battery A-18..A-22');

  // A-18: conflict resolution must be fenced by the version captured in the conflict.
  {
    const { createConflicts } = require('../server/conflicts');
    const calls = [];
    const store = {
      sync_conflicts: [{
        id: 10, collection: 'grades', record_id: 7, school_id: 1,
        base_version: 1, server_version: 2,
        server_state: { id: 7, version: 2, score: 12 },
        incoming: { data: { score: 18 } }, status: 'open'
      }],
      grades: [{ id: 7, school_id: 1, version: 3, score: 17 }]
    };
    const routes = createConflicts({
      store, db: null, sessionFrom: async () => ({ id: 2, role: 'manager', school_id: 1 }),
      markDirty: () => {}, audit: () => {}
    });
    // apiResolve writes its HTTP result through the response object; that is
    // the observable contract for this direct route invocation.
    const probe = { statusCode: 200, setHeader() {}, end(b) { this.body = JSON.parse(b); } };
    await routes.apiResolve({}, probe, { conflict_id: 10, winner: 'incoming' });
    check('A-18 adversarial: version 3 target rejects conflict captured at v2', () => {
      assert.strictEqual(probe.statusCode, 409);
      assert.strictEqual(probe.body.code, 'conflict_stale');
      assert.strictEqual(store.grades[0].version, 3);
      assert.strictEqual(store.grades[0].score, 17);
    });
    // Positive: when target is still at captured version, resolution is allowed.
    store.grades[0].version = 2;
    const probe2 = { statusCode: 200, setHeader() {}, end(b) { this.body = JSON.parse(b); } };
    await routes.apiResolve({}, probe2, { conflict_id: 10, winner: 'incoming' });
    check('A-18 positive: current target at captured version resolves forward', () => {
      assert.strictEqual(probe2.statusCode, 200);
      assert.strictEqual(store.grades[0].version, 3);
      assert.strictEqual(store.grades[0].score, 18);
    });
  }

  // A-19: teacher must own the requested student, not merely the school.
  {
    const { createSemanticAnalyticsRoutes } = require('../server/routes/semantic-analytics');
    const store = {
      users: [
        { id: 4, role: 'teacher', school_id: 1 },
        { id: 16, role: 'student', school_id: 1 },
        { id: 18, role: 'student', school_id: 1 }
      ],
      classes: [{ id: 11, school_id: 1, homeroom_teacher_id: 4 }],
      enrollments: [{ id: 1, school_id: 1, student_id: 16, class_id: 11 }],
      schedule: [{ id: 1, school_id: 1, teacher_id: 4, class_id: 11 }],
      attendance: [], grades: [], discipline: [], exams: []
    };
    const routes = createSemanticAnalyticsRoutes({ store, db: null });
    const sp = o => new URLSearchParams(o);
    const own = await routes.studentTimelineReport({ user: { id: 4, role: 'teacher', school_id: 1 } },
      sp({ school_id: '1', student_id: '16' }));
    const other = await routes.studentTimelineReport({ user: { id: 4, role: 'teacher', school_id: 1 } },
      sp({ school_id: '1', student_id: '18' }));
    check('A-19 positive: teacher can read a student in a taught class', () => assert.strictEqual(own.status, 200));
    check('A-19 adversarial: forged same-school student_id is denied', () => {
      assert.strictEqual(other.status, 403);
      assert.strictEqual(other.body.code, 'forbidden');
    });
  }

  // A-20: every PATCH route must invoke strict OCC; production must reject missing base_version.
  {
    const { checkOcc } = require('../server/occ');
    const routeFiles = [
      'server/routes/classes.js',
      'server/routes/users.js',
      'server/routes/students.js',
      'server/routes/attendance.js',
      'server/routes/grades.js'
    ];
    for (const file of routeFiles) {
      const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      const entity = file.split('/').pop().replace('.js', '');
      check('A-20 inventory: strict OCC wired in ' + entity, () => {
        const re = /checkOcc\\([\\s\\S]{0,220}?,\\s*body,\\s*['"][^'"]+['"],\\s*true\\s*\\)/g;
        assert.ok(re.test(src), 'no checkOcc(..., true) found');
      });
    }
    const old = process.env.PAYESH_ENV;
    process.env.PAYESH_ENV = 'production';
    try {
      const missing = checkOcc({ id: 1, version: 4 }, { score: 19 }, 'نمره', true);
      const stale = checkOcc({ id: 1, version: 4 }, { base_version: 3, score: 19 }, 'نمره', true);
      const good = checkOcc({ id: 1, version: 4 }, { base_version: 4, score: 19 }, 'نمره', true);
      check('A-20 negative: production PATCH without base_version is rejected', () => assert.strictEqual(missing.status, 400));
      check('A-20 adversarial: stale base_version is rejected with 409', () => assert.strictEqual(stale.status, 409));
      check('A-20 positive: matching base_version passes', () => assert.strictEqual(good, null));
    } finally {
      if (old === undefined) delete process.env.PAYESH_ENV; else process.env.PAYESH_ENV = old;
    }
  }

  // A-21: relationship IDs must remain inside the actor's tenant.
  {
    const { createClassRoutes } = require('../server/routes/classes');
    const store = {
      classes: [{ id: 1, school_id: 1, name: 'A', grade: 10, capacity: 30, homeroom_teacher_id: 4, version: 1 }],
      users: [
        { id: 4, role: 'teacher', school_id: 1 },
        { id: 9, role: 'teacher', school_id: 2 }
      ],
      enrollments: [], schedule: []
    };
    const routes = createClassRoutes({
      store, db: null,
      ids: { nextId: async () => 99 },
      deleter: { softDelete: async () => ({ ok: true }) },
      audit: () => {}, markDirty: () => {}
    });
    const actor = { id: 2, role: 'manager', school_id: 1 };
    const bad = await routes.updateClass({ user: actor }, 1, { base_version: 1, homeroom_teacher_id: 9 });
    const good = await routes.updateClass({ user: actor }, 1, { base_version: 1, homeroom_teacher_id: 4 });
    check('A-21 adversarial: manager cannot bind class to foreign-school teacher', () => {
      assert.strictEqual(bad.status, 403);
      assert.strictEqual(bad.body.code, 'out_of_scope');
      assert.strictEqual(store.classes[0].homeroom_teacher_id, 4);
    });
    check('A-21 positive: same-school teacher binding succeeds', () => assert.strictEqual(good.status, 200));
  }

  // A-22: Redis outage must never be interpreted as "not revoked".
  {
    const redis = require('../server/redis');
    const revocation = require('../server/revocation');
    const failing = {
      async get() { throw new Error('redis-down'); },
      async incr() { throw new Error('redis-down'); },
      async set() { throw new Error('redis-down'); },
      disconnect() {}
    };
    redis.__setClientForTests(failing);
    try {
      let threw = false;
      try { await revocation.isRevoked('attacker-jti'); } catch (e) { threw = e && e.code === 'REVOCATION_UNAVAILABLE'; }
      check('A-22 adversarial: Redis outage cannot return isRevoked=false', () => assert.strictEqual(threw, true));

      threw = false;
      try { await revocation.getSessionVersion(77); } catch (e) { threw = e && e.code === 'REVOCATION_UNAVAILABLE'; }
      check('A-22 adversarial: Redis outage cannot become session version 0', () => assert.strictEqual(threw, true));

      threw = false;
      try { await revocation.revokeAllUserSessions(77); } catch (e) { threw = e && e.code === 'REVOCATION_UNAVAILABLE'; }
      check('A-22 negative: revoke-all fails closed instead of returning 0', () => assert.strictEqual(threw, true));
    } finally {
      redis.__setClientForTests(null);
    }
  }

  console.log('\nA-18..A-22 security battery: ' + pass + ' checks passed');
  if (process.exitCode) process.exit(1);
})().catch(e => { console.error(e.stack || e); process.exit(1); });

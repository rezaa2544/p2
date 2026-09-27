#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/n15-rest-phantom-columns.test.js
   -------------------------------------------------------------------
   N-15 — The REST create/update handlers for grades and attendance wrote
   fields that exist in NO schema and NO migration:

     · POST /api/v1/grades        wrote `grades.type`
     · POST /api/v1/attendance    wrote `attendance.late`

   db.js builds its INSERT column list straight from Object.keys(data)
   (server/db.js ~line 704), so in PostgreSQL mode every such write died
   with 42703 ("column ... does not exist") and the route answered 503
   pg_unavailable — while memory mode happily stored a field nothing ever
   reads back. The real columns are `exam_type` (used by the client's
   g_type select at src/js/18-modals.js:369 and by all 12,555 seed rows)
   and `late_at` / `late_minutes` (used by the client's own sync path at
   src/js/02-demo-data.js:196).

   Scenarios (a fix is not accepted until it survives 5 full runs):
     N15-1  a created grade persists only real columns, carries exam_type,
            and no longer carries the phantom type
     N15-2  a created attendance record persists only real columns and
            carries late_at/late_minutes instead of the phantom late
     N15-3  PATCH with the legacy body.type alias still lands on exam_type
            and never re-persists a phantom type
     N15-4  PATCH attendance maps a scalar body.late and the client's
            nested late event object onto the real columns only
     N15-5  live PostgreSQL: the pre-fix column list raises 42703, the
            post-fix list inserts cleanly — the defect and its fix proved
            against a real database built from migration 001's own DDL
     N15-6  invariant: both handlers' full emitted key sets are subsets of
            the authz model's column set (this is what makes PG mode safe,
            since db.js names columns from exactly those keys)
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const MIGRATION_001 = path.join(ROOT, 'migrations', '001_initial.sql');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n15-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });
const STORE_COPY = path.join(TMP, 'store.json');
fs.copyFileSync(REAL_STORE, STORE_COPY);

process.env.PAYESH_STORE = STORE_COPY;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_OTP_FILE = path.join(TMP, 'otp.json');
process.env.PAYESH_JWT_SECRET = 'n15-test-pepper-0123456789abcdef0123456789abcdef';
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

/* The authz model is the column source of truth; db.js derives its INSERT
   column list from exactly these record keys. version is runtime-managed. */
const model = require('../authz/model.json');
const realColumns = (coll) => new Set([].concat(model.collections[coll].fields, ['version']));

let pass = 0, fail = 0, skipped = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

/* only keys a real column set knows — this is precisely the set db.js will
   turn into an INSERT column list, so a phantom key here is a 42703 there */
function phantomKeys(rec, coll) {
  const allowed = realColumns(coll);
  return Object.keys(rec).filter(k => !allowed.has(k));
}

async function main() {
  console.log('\n🔍 N-15 regression: REST handlers write only real columns');

  const { server, store } = require('../server/index.js');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  const req = async (method, p, { body, cookie } = {}) => {
    const res = await fetch(BASE + p, {
      method,
      headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, json, headers: res.headers };
  };

  /* login as the school-1 manager */
  const manager = store.users.find(u => u.role === 'manager' && Number(u.school_id) === 1);
  const phone = String(manager.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  const code = r.json.demo_code;
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(manager.national_id) } });
  assert.strictEqual(r.status, 200, 'manager login failed');
  const cookie = (r.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/)[0];

  const student = store.users.find(u => u.role === 'student' && Number(u.school_id) === 1);
  const cls = store.classes.find(c => Number(c.school_id) === 1);
  const subject = store.subjects.find(x => Number(x.school_id) === 1);

  /* ── N15-1: POST /api/v1/grades ────────────────────────────────── */
  let createdGrade = null;
  await test('N15-1: a created grade carries exam_type and only real columns', async () => {
    const res = await req('POST', '/api/v1/grades', {
      cookie,
      body: { student_id: student.id, subject_id: subject.id, class_id: cls.id, score: 18.5, term: 'term1', exam_type: 'آزمون', date: '2026-09-25' }
    });
    assert.strictEqual(res.status, 201, 'grade create failed: ' + res.status + ' ' + JSON.stringify(res.json));
    assert.strictEqual(res.json.ok, true);
    createdGrade = res.json.data;
    assert.strictEqual(createdGrade.exam_type, 'آزمون', 'exam_type was not persisted');
    assert.ok(!('type' in createdGrade), 'phantom "type" key still present: ' + JSON.stringify(createdGrade));
    const phantoms = phantomKeys(createdGrade, 'grades');
    assert.deepStrictEqual(phantoms, [], 'grade record writes non-existent columns: ' + phantoms.join(', '));
  });

  /* ── N15-2: POST /api/v1/attendance ────────────────────────────── */
  let createdAttendance = null;
  await test('N15-2: a created attendance record carries late_at/late_minutes and only real columns', async () => {
    const res = await req('POST', '/api/v1/attendance', {
      cookie,
      body: { student_id: student.id, class_id: cls.id, date: '2026-09-25', status: 'late', late: 17, note: 'تست' }
    });
    assert.strictEqual(res.status, 201, 'attendance create failed: ' + res.status + ' ' + JSON.stringify(res.json));
    assert.strictEqual(res.json.ok, true);
    createdAttendance = res.json.data;
    assert.strictEqual(Number(createdAttendance.late_minutes), 17, 'body.late was not mapped onto late_minutes');
    assert.ok(!('late' in createdAttendance), 'phantom "late" key still present: ' + JSON.stringify(createdAttendance));
    const phantoms = phantomKeys(createdAttendance, 'attendance');
    assert.deepStrictEqual(phantoms, [], 'attendance record writes non-existent columns: ' + phantoms.join(', '));
  });

  /* ── N15-3: PATCH grade with the legacy body.type alias ────────── */
  await test('N15-3: PATCH /api/v1/grades maps the legacy body.type alias onto exam_type', async () => {
    const existing = store.grades.find(g => Number(g.student_id) === Number(student.id));
    assert.ok(existing, 'seed grade missing');
    const res = await req('PATCH', '/api/v1/grades/' + existing.id, {
      cookie,
      body: { type: 'final', score: 19, base_version: Number(existing.version) || 1 }
    });
    assert.strictEqual(res.status, 200, 'grade patch failed: ' + res.status + ' ' + JSON.stringify(res.json));
    assert.strictEqual(res.json.ok, true);
    const updated = res.json.data;
    assert.strictEqual(updated.exam_type, 'final', 'legacy body.type did not land on exam_type');
    assert.ok(!('type' in updated), 'phantom "type" re-persisted by the update path');
    const phantoms = phantomKeys(updated, 'grades');
    assert.deepStrictEqual(phantoms, [], 'grade update writes non-existent columns: ' + phantoms.join(', '));
  });

  /* ── N15-4: PATCH attendance, scalar and nested late shapes ────── */
  await test('N15-4: PATCH /api/v1/attendance maps scalar and nested late onto the real columns', async () => {
    const existing = store.attendance.find(a => Number(a.student_id) === Number(student.id));
    assert.ok(existing, 'seed attendance missing');

    /* scalar minute count */
    let res = await req('PATCH', '/api/v1/attendance/' + existing.id, {
      cookie,
      body: { late: 12, base_version: Number(existing.version) || 1 }
    });
    assert.strictEqual(res.status, 200, 'attendance patch (scalar) failed: ' + res.status + ' ' + JSON.stringify(res.json));
    assert.strictEqual(Number(res.json.data.late_minutes), 12, 'scalar body.late not mapped to late_minutes');
    assert.ok(!('late' in res.json.data), 'phantom "late" re-persisted by the update path');

    /* the client's event-object shape */
    res = await req('PATCH', '/api/v1/attendance/' + existing.id, {
      cookie,
      body: { late: { late_at: '2026-09-25T08:25:00.000Z', late_minutes: 25 }, base_version: Number(res.json.data.version) || 1 }
    });
    assert.strictEqual(res.status, 200, 'attendance patch (nested) failed: ' + res.status + ' ' + JSON.stringify(res.json));
    assert.strictEqual(Number(res.json.data.late_minutes), 25, 'nested late_minutes not mapped');
    assert.strictEqual(res.json.data.late_at, '2026-09-25T08:25:00.000Z', 'nested late_at not mapped');
    assert.ok(!('late' in res.json.data), 'phantom "late" re-persisted from the nested shape');
    const phantoms = phantomKeys(res.json.data, 'attendance');
    assert.deepStrictEqual(phantoms, [], 'attendance update writes non-existent columns: ' + phantoms.join(', '));
  });

  /* ── N15-6: invariant on the whole emitted key sets ────────────── */
  await test('N15-6: both handlers emit only authz-model columns (the PG INSERT column list)', () => {
    assert.ok(createdGrade && createdAttendance, 'create scenarios must have run first');
    for (const [rec, coll, label] of [[createdGrade, 'grades', 'grade'], [createdAttendance, 'attendance', 'attendance']]) {
      const phantoms = phantomKeys(rec, coll);
      assert.deepStrictEqual(phantoms, [], label + ' create emits non-model columns: ' + phantoms.join(', '));
    }
    /* and the pre-fix phantom names must genuinely not be model columns,
       otherwise this guard would be vacuous */
    assert.ok(!realColumns('grades').has('type'), '"type" is now a grades column — the guard is stale');
    assert.ok(!realColumns('attendance').has('late'), '"late" is now an attendance column — the guard is stale');
  });

  server.close();

  /* ── N15-5: live PostgreSQL proof ───────────────────────────────── */
  const PG_URL = 'postgresql://postgres@127.0.0.1:5433/payesh_n16';
  let pool = null;
  try {
    const mod = require('pg');
    pool = new mod.Pool({ connectionString: PG_URL, query_timeout: 60000 });
    const c = await pool.connect();
    await c.query('SELECT 1');
    c.release();
  } catch (e) {
    pool = null;
  }

  if (!pool) {
    console.log('  ⏭️ N15-5 skipped: no PostgreSQL at ' + PG_URL);
    skipped += 1;
  } else {
    await test('N15-5: live PostgreSQL — the pre-fix column list raises 42703, the post-fix list inserts', async () => {
      const c = await pool.connect();
      try {
        /* scratch tables carrying the REAL column names the routes now write
           (no FKs, so they stand alone in any database). Their column set is
           asserted against the authz model below, so the literal DDL cannot
           silently drift away from the authoritative schema. */
        const GRADES_DDL = 'CREATE TABLE n15_grades (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, student_id INTEGER, subject_id INTEGER, class_id INTEGER, teacher_id INTEGER, school_id INTEGER, score NUMERIC(12,2), term VARCHAR(255), exam_type VARCHAR(255), date VARCHAR(50), created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)';
        const ATT_DDL = 'CREATE TABLE n15_attendance (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, student_id INTEGER, class_id INTEGER, school_id INTEGER, date VARCHAR(50), status VARCHAR(255), late_at TIMESTAMPTZ, late_minutes VARCHAR(255), note TEXT, taken_at TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)';

        const columnNames = (ddl) => {
          /* split column definitions on top-level commas only — type
             declarations like NUMERIC(12,2) contain commas of their own */
          const inner = ddl.slice(ddl.indexOf('(') + 1, ddl.lastIndexOf(')'));
          const parts = [];
          let depth = 0, cur = '';
          for (const ch of inner) {
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
            else cur += ch;
          }
          if (cur.trim()) parts.push(cur);
          return parts.map(p => p.trim().split(/\s+/)[0].replace(/"/g, ''));
        };
        for (const name of columnNames(GRADES_DDL)) {
          assert.ok(realColumns('grades').has(name), 'n15_grades declares a column the authz model does not know: ' + name);
        }
        for (const name of columnNames(ATT_DDL)) {
          assert.ok(realColumns('attendance').has(name), 'n15_attendance declares a column the authz model does not know: ' + name);
        }

        await c.query('DROP TABLE IF EXISTS n15_grades');
        await c.query('DROP TABLE IF EXISTS n15_attendance');
        await c.query(GRADES_DDL);
        await c.query(ATT_DDL);

        /* ── pre-fix shape: phantom "type" on grades must be rejected ── */
        let preErr = null;
        try {
          await c.query('INSERT INTO n15_grades (id, student_id, subject_id, class_id, teacher_id, school_id, score, term, "type", date, created_at) VALUES (900001, $1, $2, $3, $4, 1, 18.5, $5, $6, $7, NOW())',
            [student.id, subject.id, cls.id, manager.id, 'term1', 'quiz', '2026-09-25']);
        } catch (e) { preErr = e; }
        assert.ok(preErr && preErr.code === '42703',
          'the pre-fix grades INSERT must fail with 42703 (column does not exist), got ' + (preErr ? preErr.code + ' ' + preErr.message : 'no error — the phantom column now exists'));

        /* ── post-fix shape: real exam_type inserts cleanly ── */
        await c.query('INSERT INTO n15_grades (id, student_id, subject_id, class_id, teacher_id, school_id, score, term, exam_type, date, created_at) VALUES (900002, $1, $2, $3, $4, 1, 18.5, $5, $6, $7, NOW())',
          [student.id, subject.id, cls.id, manager.id, 'term1', 'آزمون', '2026-09-25']);
        const g = await c.query('SELECT exam_type FROM n15_grades WHERE id = 900002');
        assert.strictEqual(g.rows[0].exam_type, 'آزمون');

        /* ── pre-fix shape: phantom "late" on attendance must be rejected ── */
        preErr = null;
        try {
          await c.query('INSERT INTO n15_attendance (id, student_id, class_id, school_id, date, status, "late", note, created_at) VALUES (900001, $1, $2, 1, $3, $4, 17, $5, NOW())',
            [student.id, cls.id, '2026-09-25', 'late', 'تست']);
        } catch (e) { preErr = e; }
        assert.ok(preErr && preErr.code === '42703',
          'the pre-fix attendance INSERT must fail with 42703, got ' + (preErr ? preErr.code + ' ' + preErr.message : 'no error'));

        /* ── post-fix shape: real late_at / late_minutes insert cleanly ── */
        await c.query('INSERT INTO n15_attendance (id, student_id, class_id, school_id, date, status, late_at, late_minutes, note, created_at) VALUES (900002, $1, $2, 1, $3, $4, $5, 17, $6, NOW())',
          [student.id, cls.id, '2026-09-25', 'late', '2026-09-25T08:25:00.000Z', 'تست']);
        const a = await c.query('SELECT late_minutes, late_at FROM n15_attendance WHERE id = 900002');
        assert.strictEqual(Number(a.rows[0].late_minutes), 17);
      } finally {
        try {
          await c.query('DROP TABLE IF EXISTS n15_grades');
          await c.query('DROP TABLE IF EXISTS n15_attendance');
        } catch (_) {}
        c.release();
      }
    });
    try { await pool.end(); } catch (_) {}
  }

  console.log('\nN-15 regression tests: ' + pass + '/' + (pass + fail) + ' passed' + (skipped ? ' (' + skipped + ' skipped)' : ''));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('suite crashed:', e); process.exit(2); });

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/seed-relational-small.js — small RELATIONAL seed on real PostgreSQL
   ───────────────────────────────────────────────────────────────────
   Purpose: prove the P0-1 production gate works against real relational
   data with real foreign keys, not a 3-row fixture. Correctness only —
   this is explicitly NOT a national-scale dataset (10M) and makes no
   performance claim.

   It applies the repository's own migration chain (migrations/001..NNN,
   in filename order, skipping *.down.sql) and then loads a small,
   fully-referential fixture across two tenants (schools).

   Row counts are DERIVED from the shape below, not hard-coded twice:
     schools      2      (tenant A, tenant B)
     users       15      1 superadmin + 2 managers + 2 teachers + 10 students
     subjects     6      3 per school
     classes      4      2 per school
     enrollments 20      5 students/tenant × 2 classes/tenant
     attendance  50      5 students/tenant × 5 days
     grades      30      5 students/tenant × 3 subjects/tenant

   NOTE on the requested "users = 10": it is not reachable together with
   enrollments = 20 under real foreign keys and tenant isolation — 20
   enrollments over 4 classes (2 per tenant) requires 10 students, which
   already exhausts a 10-user budget before any staff row exists. The
   shape above keeps every requested count except users, and says so.

   No schema is created or altered here — migrations only, 0 new migrations.

   Usage:
     NODE_PATH=~/pgws/node_modules \
       PG_LIVE_PG='postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1' \
       node tools/seed-relational-small.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'migrations');
const TABLES = ['schools', 'users', 'subjects', 'classes', 'enrollments', 'attendance', 'grades'];

function pgDriver() {
  try { return require('pg'); }
  catch (e) {
    throw new Error('pg driver not resolvable — set NODE_PATH to a node_modules containing pg');
  }
}

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS)
    .filter((f) => /^\d+_.+\.sql$/.test(f) && !/\.down\.sql$/.test(f))
    .sort();
}

/* A migration that uses a psql meta-command can ONLY be executed by psql;
   the `pg` driver sends it to the server as SQL and the server rejects it
   with `syntax error at or near "\"`. Detected explicitly so such a file is
   reported as NOT-RUN (requires psql) instead of being silently skipped or
   mistaken for a real failure. */
const PSQL_META = /(^|\s)\\(gset|gexec|echo|if|elif|else|endif|set|quit|i|ir|dt|timing)\b/;
function psqlOnly(sql) {
  const m = PSQL_META.exec(sql);
  return m ? m[0].trim() : null;
}

/* Apply the repository's migration chain, in order, on one connection.
   Returns a per-file outcome so nothing is silently swallowed:
     applied            — ran clean
     not_run_psql       — needs psql (meta-command); NOT executed here
     already_exists     — re-run of a non-idempotent statement; tolerated
     failed             — real error; caller must fail
*/
async function applyMigrations(client) {
  const files = migrationFiles();
  const results = [];
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
    const meta = psqlOnly(sql);
    if (meta) { results.push({ file: f, status: 'not_run_psql', detail: meta }); continue; }
    /* No savepoint here on purpose: every migration in this repo wraps
       itself in BEGIN; … COMMIT;, and SAVEPOINT outside a transaction block
       is rejected by the server. */
    try {
      await client.query(sql);
      results.push({ file: f, status: 'applied' });
    } catch (e) {
      const msg = String(e && e.message || e);
      /* a migration wraps itself in BEGIN;…COMMIT;, so an error inside it
         leaves the connection in "current transaction is aborted" and every
         later file would fail with commands-ignored. Clear it. */
      try { await client.query('ROLLBACK'); } catch (e2) {}
      if (/already exists/i.test(msg)) results.push({ file: f, status: 'already_exists', detail: msg });
      else results.push({ file: f, status: 'failed', detail: msg });
    }
  }
  return results;
}

/* Delete in FK-safe order (children first) so re-running is deterministic. */
async function clearFixture(client) {
  for (const t of ['grades', 'attendance', 'enrollments', 'classes', 'subjects', 'users', 'schools']) {
    await client.query('DELETE FROM ' + t);
  }
  /* identity columns keep climbing otherwise; reset so ids are stable */
  for (const t of ['schools', 'users', 'subjects', 'classes', 'enrollments', 'attendance', 'grades']) {
    await client.query('ALTER TABLE ' + t + ' ALTER COLUMN id RESTART WITH 1').catch(() => {});
  }
}

async function loadFixture(client) {
  /* ── tenants ── */
  const schools = [
    { name: 'دبیرستان نمونه الف', code: 'SCH-A', city: 'Tehran' },
    { name: 'دبیرستان نمونه ب', code: 'SCH-B', city: 'Shiraz' }
  ];
  const schoolIds = [];
  for (const s of schools) {
    const r = await client.query(
      'INSERT INTO schools (name, code, city, "active", created_at, updated_at) VALUES ($1,$2,$3,true,NOW(),NOW()) RETURNING id',
      [s.name, s.code, s.city]);
    schoolIds.push(r.rows[0].id);
  }

  /* ── users: 1 superadmin + 2 managers + 2 teachers + 10 students (5/tenant) ── */
  const users = [];
  const push = (role, full_name, school_id, i) => users.push({
    role, full_name, school_id,
    national_id: String(1000000000 + i).slice(0, 10),
    phone: '0912' + String(1000000 + i).slice(0, 7),
    status: 'active'
  });
  push('superadmin', 'مدیر سامانه', schoolIds[0], 1);
  schoolIds.forEach((sid, k) => push('manager', 'مدیر مدرسه ' + (k + 1), sid, 10 + k));
  schoolIds.forEach((sid, k) => push('teacher', 'دبیر ' + (k + 1), sid, 20 + k));
  schoolIds.forEach((sid, k) => {
    for (let n = 1; n <= 5; n++) push('student', 'دانش‌آموز ' + (k + 1) + '-' + n, sid, 100 + k * 10 + n);
  });

  const userIds = [];
  for (const u of users) {
    const r = await client.query(
      'INSERT INTO users (full_name, role, school_id, national_id, phone, status, "active", created_at, updated_at)'
      + ' VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW()) RETURNING id',
      [u.full_name, u.role, u.school_id, u.national_id, u.phone, u.status]);
    userIds.push({ id: r.rows[0].id, role: u.role, school_id: u.school_id });
  }

  const studentsBySchool = {};
  const teachersBySchool = {};
  for (const u of userIds) {
    if (u.role === 'student') (studentsBySchool[u.school_id] = studentsBySchool[u.school_id] || []).push(u.id);
    if (u.role === 'teacher') teachersBySchool[u.school_id] = u.id;
  }

  /* ── subjects: 3 per tenant (grades.subject_id → subjects.id) ── */
  const subjectIds = {};
  for (const sid of schoolIds) {
    subjectIds[sid] = [];
    for (let n = 1; n <= 3; n++) {
      const r = await client.query(
        'INSERT INTO subjects (name, code, school_id, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id',
        ['درس ' + n, 'SUB-' + sid + '-' + n, sid]);
      subjectIds[sid].push(r.rows[0].id);
    }
  }

  /* ── classes: 2 per tenant (classes.school_id → schools.id) ── */
  const classIds = {};
  for (const sid of schoolIds) {
    classIds[sid] = [];
    for (let n = 1; n <= 2; n++) {
      const r = await client.query(
        'INSERT INTO classes (name, school_id, grade, grade_level, created_at, updated_at)'
        + ' VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING id',
        ['کلاس ' + n + ' مدرسه ' + sid, sid, String(10 + n), '10']);
      classIds[sid].push(r.rows[0].id);
    }
  }

  /* ── enrollments: 10 students × 2 years = 20 ──
     enrollments carries UNIQUE (student_id, year) (uq_enrollments_student_year),
     so a student may appear only once per year. Two school years are used and
     the student advances to the tenant's second class in the later year, which
     keeps every row inside its own tenant. */
  const YEARS = ['1404', '1405'];
  let enrollments = 0;
  for (const sid of schoolIds) {
    for (const stu of studentsBySchool[sid]) {
      for (let y = 0; y < YEARS.length; y++) {
        await client.query(
          'INSERT INTO enrollments (student_id, class_id, school_id, year, created_at, updated_at)'
          + ' VALUES ($1,$2,$3,$4,NOW(),NOW())',
          [stu, classIds[sid][y % classIds[sid].length], sid, YEARS[y]]);
        enrollments++;
      }
    }
  }

  /* ── attendance: 5 days per student ── */
  let attendance = 0;
  for (const sid of schoolIds) {
    for (const stu of studentsBySchool[sid]) {
      for (let d = 1; d <= 5; d++) {
        await client.query(
          'INSERT INTO attendance (student_id, class_id, school_id, date, status, source, created_at, updated_at)'
          + ' VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())',
          [stu, classIds[sid][0], sid, '1405-07-' + String(d).padStart(2, '0'),
            d % 5 === 0 ? 'absent' : 'present', 'seed']);
        attendance++;
      }
    }
  }

  /* ── grades: 3 subjects per student, teacher of the same tenant ── */
  let grades = 0;
  for (const sid of schoolIds) {
    for (const stu of studentsBySchool[sid]) {
      for (let n = 0; n < 3; n++) {
        await client.query(
          'INSERT INTO grades (student_id, class_id, subject_id, teacher_id, school_id, score, max_score,'
          + ' exam_type, kind, term, date, source, created_at, updated_at)'
          + ' VALUES ($1,$2,$3,$4,$5,$6,20,$7,$8,$9,$10,$11,NOW(),NOW())',
          [stu, classIds[sid][0], subjectIds[sid][n], teachersBySchool[sid], sid,
            10 + n + (stu % 5), 'midterm', 'score', '1', '1405-07-10', 'seed']);
        grades++;
      }
    }
  }

  return { schoolIds, userIds, classIds, subjectIds, enrollments, attendance, grades };
}

async function counts(client) {
  const out = {};
  for (const t of TABLES) {
    const r = await client.query('SELECT count(*)::int AS n FROM ' + t);
    out[t] = r.rows[0].n;
  }
  return out;
}

const crypto = require('crypto');

/* ── Round 4: machine-readable manifest ───────────────────────────────
   The manifest is GENERATED from live database introspection, never typed
   by hand, so it cannot drift from what the schema actually enforces.
   It is the "reproducible dataset" building block for Package 1 and is
   deliberately checksummed.

   Self-hash recipe (verified by tests/pg-relational-seed.js):
     1. parse the file
     2. set artifacts.manifest.sha256 = ""
     3. JSON.stringify(obj, null, 2) + "\n"
     4. sha256 of those exact bytes
*/
function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function manifestBytes(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

async function buildManifest(client, rowCounts, fixture, migResults, pgUrl) {
  const SEED_TABLES = ['users', 'subjects', 'classes', 'enrollments', 'attendance', 'grades'];
  const list = '(' + SEED_TABLES.map((t) => "'" + t + "'").join(',') + ')';

  const fks = (await client.query(
    'SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def,'
    + ' condeferrable, condeferred FROM pg_constraint'
    + " WHERE contype='f' AND conrelid::regclass::text IN " + list + ' ORDER BY 1,2')).rows;
  const uqs = (await client.query(
    'SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def'
    + ' FROM pg_constraint'
    + " WHERE contype='u' AND conrelid::regclass::text IN " + list + ' ORDER BY 1,2')).rows;

  const ver = (await client.query('SELECT version() AS v')).rows[0].v;
  /* host() strips the netmask — inet_server_addr()::text yields 127.0.0.1/32,
     which is not a valid host component in a URL. */
  const addr = (await client.query('SELECT host(inet_server_addr()) AS a, inet_server_port() AS p')).rows[0];
  const dbName = (await client.query('SELECT current_database() AS d')).rows[0].d;

  const notRun = migResults.filter((r) => r.status === 'not_run_psql')
    .map((r) => ({ file: r.file, status: 'NOT-RUN', reason: 'psql meta-command ' + r.detail + ' — not executable through the pg driver; requires psql' }));

  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generated_by: 'tools/seed-relational-small.js (PG_SEED_MANIFEST=1)',
    scale_label: 'demo-scale — NOT a national dataset',
    benchmark_claim: 'NONE. No workload was run; no throughput, latency or capacity number is asserted here or anywhere from this file. Capacity Engineering belongs to chat 4.',
    database: {
      version: ver,
      server_addr: addr.a,
      server_port: addr.p,
      database: dbName,
      connection_env: 'PG_LIVE_PG (or DATABASE_URL)',
      url_without_credentials: 'postgres://<user>:<password>@' + addr.a + ':' + addr.p + '/' + dbName
    },
    migrations: {
      total: migResults.length,
      applied: migResults.filter((r) => r.status === 'applied').length,
      already_exists: migResults.filter((r) => r.status === 'already_exists').length,
      failed: migResults.filter((r) => r.status === 'failed').length,
      new_migrations_added: 0,
      not_run: notRun
    },
    row_counts: rowCounts,
    tenants: { count: fixture.schoolIds.length, ids: fixture.schoolIds },
    foreign_keys: fks.map((r) => ({
      table: r.tbl, name: r.conname, definition: r.def,
      deferrable: r.condeferrable, initially_deferred: r.condeferred
    })),
    unique_constraints: uqs.map((r) => ({ table: r.tbl, name: r.conname, definition: r.def })),
    deferred_validation: {
      method: 'SET CONSTRAINTS ALL IMMEDIATE',
      why: 'Every FK in this schema is DEFERRABLE INITIALLY DEFERRED, so a violation is only raised at COMMIT. A test that inserts an orphan and then ROLLBACKs never sees the error and would pass falsely; the check must be forced.',
      constraints_forced: fks.filter((r) => r.condeferred).map((r) => r.conname)
    },
    tenant_isolation: {
      assertions: [
        'a student of tenant A has 0 rows in grades / attendance / enrollments under tenant B',
        'enrollments.student_id -> users.school_id matches enrollments.school_id',
        'enrollments.class_id -> classes.school_id matches enrollments.school_id',
        'attendance.student_id -> users.school_id matches attendance.school_id',
        'grades.student_id -> users.school_id matches grades.school_id',
        'grades.subject_id -> subjects.school_id matches grades.school_id',
        'grades.teacher_id -> users.school_id matches grades.school_id'
      ],
      expected_cross_tenant_rows: 0
    },
    known_schema_gaps: [
      'enrollments and attendance carry a foreign key ONLY on school_id; class_id/student_id are unconstrained, so an orphan or cross-tenant value there is NOT rejected by the database. Fixing this needs a new migration — out of scope (no migration bump).',
      'enrollments is UNIQUE (student_id, year), which makes 20 enrollments over 4 classes require 10 students; that is why row_counts.users is 15 and not the 10 originally requested.'
    ],
    artifacts: {
      seeder: { path: 'tools/seed-relational-small.js', sha256: sha256File(path.join(ROOT, 'tools', 'seed-relational-small.js')) },
      manifest: { path: 'tools/relational-seed-manifest.json', sha256: '' }
    },
    verification: {
      self_hash_recipe: 'sha256 of JSON.stringify(manifest, null, 2) + "\\n" with artifacts.manifest.sha256 set to ""',
      reproduce: 'PG_SEED_FRESH=1 PG_SEED_MANIFEST=1 PG_LIVE_PG=<url> node tools/seed-relational-small.js',
      test: 'PG_LIVE_PG=<url> node tests/pg-relational-seed.js'
    }
  };

  const digest = crypto.createHash('sha256').update(manifestBytes(manifest)).digest('hex');
  manifest.artifacts.manifest.sha256 = digest;
  return manifest;
}

async function main() {
  const url = process.env.PG_LIVE_PG || process.env.DATABASE_URL || '';
  if (!url) {
    console.error('seed-relational-small: NOT-RUN — set PG_LIVE_PG (or DATABASE_URL) to a live PostgreSQL');
    process.exit(2);
  }
  const pg = pgDriver();
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
  } catch (e) {
    console.error('seed-relational-small: NOT-RUN — cannot reach PostgreSQL: ' + e.message);
    process.exit(2);
  }
  try {
    if (process.env.PG_SEED_FRESH === '1') {
      await client.query('DROP SCHEMA public CASCADE');
      await client.query('CREATE SCHEMA public');
      console.log('schema reset (PG_SEED_FRESH=1)');
    }
    const results = await applyMigrations(client);
    const applied = results.filter((r) => r.status === 'applied').length;
    const existed = results.filter((r) => r.status === 'already_exists').length;
    const psqlOnlyFiles = results.filter((r) => r.status === 'not_run_psql');
    const failed = results.filter((r) => r.status === 'failed');
    console.log('migrations: ' + results.length + ' total · ' + applied + ' applied · '
      + existed + ' already-exists (tolerated on re-run) · '
      + psqlOnlyFiles.length + ' NOT-RUN (requires psql)');
    for (const r of psqlOnlyFiles) console.log('  NOT-RUN  ' + r.file + '  (psql meta-command ' + r.detail + ')');
    for (const r of failed) console.log('  FAILED   ' + r.file + '  ' + r.detail);
    if (failed.length) { console.error('seed-relational-small: FAILED — ' + failed.length + ' migration(s) failed'); process.exit(1); }

    await clearFixture(client);
    const f = await loadFixture(client);
    const c = await counts(client);
    console.log('rows: ' + TABLES.map((t) => t + '=' + c[t]).join(' · '));
    console.log('tenants: ' + f.schoolIds.join(','));
    if (process.env.PG_SEED_MANIFEST === '1') {
      const man = await buildManifest(client, c, f, results, url);
      const out = path.join(ROOT, 'tools', 'relational-seed-manifest.json');
      fs.writeFileSync(out, manifestBytes(man));
      console.log('manifest: ' + path.relative(ROOT, out)
        + '  sha256=' + man.artifacts.manifest.sha256.slice(0, 16) + '…');
    }
    console.log('OK');
  } finally {
    try { await client.end(); } catch (e) {}
  }
}

module.exports = { applyMigrations, clearFixture, loadFixture, counts, migrationFiles, TABLES };

if (require.main === module) {
  main().catch((e) => {
    console.error('seed-relational-small: FAILED — ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}

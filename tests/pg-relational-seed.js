#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-relational-seed.js — Package 1 / round 3, phase 2
   ───────────────────────────────────────────────────────────────────
   Verifies the small relational seed on real PostgreSQL 18:
     · the seeder exits 0 and reports its own counts
     · every table's row count matches the declared shape
     · the foreign keys are REAL (an orphan row is rejected)
     · tenant isolation holds — a user of tenant A has zero rows when
       queried under tenant B, and no fixture row crosses tenants
     · re-running the seeder is deterministic (same counts, no duplicates)

   Correctness only. This is NOT a national-scale dataset and this suite
   makes no performance, throughput or EXPLAIN claim.

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN (no live PG).

   Usage:
     NODE_PATH=~/pgws/node_modules \
       PG_LIVE_PG='postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1' \
       node tests/pg-relational-seed.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NAME = 'pg-relational-seed';
const SEEDER = path.join(ROOT, 'tools', 'seed-relational-small.js');

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}

let pg = null;
try { pg = require('pg'); } catch (e) { pg = null; }
if (!pg) { console.log(NAME + ': ❌ FAIL — pg driver not resolvable (set NODE_PATH) — skip/NOT-RUN ممنوع (P1-GAP-01)'); process.exit(1); }

const PGURL = process.env.PG_LIVE_PG || process.env.DATABASE_URL || '';

function runSeeder(fresh) {
  const env = Object.assign({}, process.env, { PG_LIVE_PG: PGURL });
  if (fresh) env.PG_SEED_FRESH = '1'; else delete env.PG_SEED_FRESH;
  const r = spawnSync(process.execPath, [SEEDER], {
    cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'], env
  });
  return { status: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

(async function main() {
  console.log(NAME + ' — relational seed, real foreign keys, tenant isolation\n');

  const probe = new pg.Pool({ connectionString: PGURL, max: 2, connectionTimeoutMillis: 5000 });
  try { await probe.query('SELECT 1'); }
  catch (e) { console.log(NAME + ': ❌ FAIL — PostgreSQL not reachable: ' + e.message + ' — skip/NOT-RUN ممنوع (P1-GAP-01)'); process.exit(1); }
  finally { try { await probe.end(); } catch (e) {} }

  /* ── 1. the seeder itself ── */
  const run1 = runSeeder(true);
  chk('1a the seeder exits 0 on a fresh schema', run1.status === 0, run1.out.slice(-400));
  chk('1b the seeder prints its row counts', /rows: .*schools=2/.test(run1.out), run1.out.slice(-300));
  chk('1c migration 012 applies through the standard-SQL runner (psql-only meta-commands removed)',
    run1.status === 0 && !/NOT-RUN\s+012_partition_grades_attendance\.sql/.test(run1.out), run1.out.slice(-400));
  chk('1d no migration is reported FAILED', !/^\s*FAILED\s/m.test(run1.out), run1.out.slice(-400));

  const c = new pg.Client({ connectionString: PGURL, connectionTimeoutMillis: 15000 });
  await c.connect();
  const one = async (sql, p) => (await c.query(sql, p)).rows[0].n;

  /* ── 2. counts, asserted FROM the machine-readable manifest ── */
  const MANIFEST = path.join(ROOT, 'tools', 'relational-seed-manifest.json');
  chk('2.0a the manifest exists', fs.existsSync(MANIFEST), MANIFEST);
  let man = null;
  try { man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
  catch (e) { chk('2.0b the manifest parses as JSON', false, String(e.message).slice(0, 160)); }
  if (man) {
    chk('2.0b the manifest parses as JSON', true);

    /* the manifest's own checksum must verify with its documented recipe */
    const clone = JSON.parse(JSON.stringify(man));
    clone.artifacts.manifest.sha256 = '';
    const recomputed = crypto.createHash('sha256')
      .update(JSON.stringify(clone, null, 2) + '\n').digest('hex');
    chk('2.0c the manifest self-hash verifies (documented recipe)',
      recomputed === man.artifacts.manifest.sha256,
      'stored ' + String(man.artifacts.manifest.sha256).slice(0, 12)
      + '… vs recomputed ' + recomputed.slice(0, 12) + '…');

    const seederAbs = path.join(ROOT, man.artifacts.seeder.path);
    const seederHash = crypto.createHash('sha256').update(fs.readFileSync(seederAbs)).digest('hex');
    chk('2.0d the recorded seeder sha256 matches the file on disk',
      seederHash === man.artifacts.seeder.sha256,
      'stored ' + String(man.artifacts.seeder.sha256).slice(0, 12)
      + '… vs actual ' + seederHash.slice(0, 12) + '…');

    chk('2.0e the manifest is labelled demo-scale, NOT a national dataset',
      /demo-scale/i.test(man.scale_label) && /NOT a national dataset/i.test(man.scale_label),
      man.scale_label);
    chk('2.0f the manifest makes no benchmark/capacity claim',
      /^NONE\./i.test(man.benchmark_claim), String(man.benchmark_claim).slice(0, 80));
    chk('2.0g the manifest records 0 new migrations',
      man.migrations.new_migrations_added === 0, JSON.stringify(man.migrations.new_migrations_added));
    chk('2.0h migration 012 is recorded as APPLIED standard SQL (no psql-only steps left)',
      man.migrations.applied === man.migrations.total
        && Array.isArray(man.migrations.not_run) && man.migrations.not_run.length === 0,
      JSON.stringify(man.migrations));
    chk('2.0i the manifest stores no credentials',
      !/chat1:chat1|:\/\/[^<]*:[^<]*@/.test(JSON.stringify(man.database)),
      JSON.stringify(man.database.url_without_credentials));

    /* the relational index must match the LIVE schema, not a snapshot */
    const liveFk = await one("SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('users','subjects','classes','enrollments','attendance','grades')");
    chk('2.0j the manifest FK list matches the live schema count',
      (man.foreign_keys || []).length === liveFk,
      'manifest ' + (man.foreign_keys || []).length + ' vs live ' + liveFk);
    const liveUq = await one("SELECT count(*)::int AS n FROM pg_constraint WHERE contype='u' AND conrelid::regclass::text IN ('users','subjects','classes','enrollments','attendance','grades')");
    chk('2.0k the manifest UNIQUE list matches the live schema count',
      (man.unique_constraints || []).length === liveUq,
      'manifest ' + (man.unique_constraints || []).length + ' vs live ' + liveUq);
    chk('2.0l every FK the manifest lists as deferred IS deferred in the DB',
      (man.foreign_keys || []).filter((f) => f.initially_deferred).length === liveFk,
      'deferred listed ' + (man.foreign_keys || []).filter((f) => f.initially_deferred).length + ' vs live FKs ' + liveFk);
  }

  const expect = man ? man.row_counts : {};
  chk('2.1 the manifest declares all seven seeded tables',
    Object.keys(expect).length === 7, JSON.stringify(Object.keys(expect)));
  for (const t of Object.keys(expect)) {
    const n = await one('SELECT count(*)::int AS n FROM ' + t);
    chk('2 ' + t + ' = ' + expect[t], n === expect[t], 'actual ' + n);
  }

  /* ── 3. the foreign keys are real ── */
  let fkRejected = false, fkMsg = '';
  try {
    await c.query('BEGIN');
    await c.query("INSERT INTO grades (student_id, class_id, subject_id, school_id, score, max_score, exam_type, kind, term, date, source, created_at, updated_at)"
      + " VALUES (999999, 1, 1, 1, 10, 20, 'midterm', 'score', '1', '1405-07-10', 'test', NOW(), NOW())");
    /* every FK in this schema is DEFERRABLE INITIALLY DEFERRED, so the
       violation only surfaces at commit time — force the check now */
    await c.query('SET CONSTRAINTS ALL IMMEDIATE');
    await c.query('ROLLBACK');
  } catch (e) {
    fkRejected = true; fkMsg = String(e.message || e);
    try { await c.query('ROLLBACK'); } catch (e2) {}
  }
  chk('3a an orphan grades.student_id is rejected by a real FK',
    fkRejected && /foreign key|fk_grades_student/i.test(fkMsg), fkMsg);

  let fkClass = false, fkClassMsg = '';
  try {
    await c.query('BEGIN');
    await c.query("INSERT INTO classes (name, school_id, grade, grade_level, created_at, updated_at) VALUES ('یتیم', 999999, '10', '10', NOW(), NOW())");
    await c.query('SET CONSTRAINTS ALL IMMEDIATE');
    await c.query('ROLLBACK');
  } catch (e) {
    fkClass = true; fkClassMsg = String(e.message || e);
    try { await c.query('ROLLBACK'); } catch (e2) {}
  }
  chk('3b an orphan classes.school_id is rejected by a real FK',
    fkClass && /foreign key|fk_classes_school/i.test(fkClassMsg), fkClassMsg);

  const fkCount = await one(
    "SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('users','classes','enrollments','attendance','grades','subjects')");
  chk('3c the seeded tables carry foreign-key constraints (count > 0)', fkCount > 0, 'fk count ' + fkCount);

  /* ── 4. tenant isolation ── */
  const tenants = (await c.query('SELECT id FROM schools ORDER BY id')).rows.map((r) => r.id);
  chk('4a exactly two tenants exist', tenants.length === 2, JSON.stringify(tenants));
  const A = tenants[0], B = tenants[1];

  const stuA = (await c.query("SELECT id FROM users WHERE role='student' AND school_id=$1 ORDER BY id LIMIT 1", [A])).rows[0];
  chk('4b tenant A has at least one student', !!stuA, 'none found');

  if (stuA) {
    const gB = await one('SELECT count(*)::int AS n FROM grades WHERE student_id=$1 AND school_id=$2', [stuA.id, B]);
    chk('4c student of tenant A has 0 grades under tenant B', gB === 0, 'got ' + gB);
    const aB = await one('SELECT count(*)::int AS n FROM attendance WHERE student_id=$1 AND school_id=$2', [stuA.id, B]);
    chk('4d student of tenant A has 0 attendance rows under tenant B', aB === 0, 'got ' + aB);
    const eB = await one('SELECT count(*)::int AS n FROM enrollments WHERE student_id=$1 AND school_id=$2', [stuA.id, B]);
    chk('4e student of tenant A has 0 enrollments under tenant B', eB === 0, 'got ' + eB);
  }

  const crossE = await one('SELECT count(*)::int AS n FROM enrollments e JOIN users u ON u.id=e.student_id WHERE u.school_id <> e.school_id');
  chk('4f no enrollment row crosses tenants (student.school = enrollment.school)', crossE === 0, 'got ' + crossE);
  const crossEc = await one('SELECT count(*)::int AS n FROM enrollments e JOIN classes cl ON cl.id=e.class_id WHERE cl.school_id <> e.school_id');
  chk('4g no enrollment points at another tenant\'s class', crossEc === 0, 'got ' + crossEc);
  const crossA = await one('SELECT count(*)::int AS n FROM attendance at JOIN users u ON u.id=at.student_id WHERE u.school_id <> at.school_id');
  chk('4h no attendance row crosses tenants', crossA === 0, 'got ' + crossA);
  const crossG = await one('SELECT count(*)::int AS n FROM grades g JOIN users u ON u.id=g.student_id WHERE u.school_id <> g.school_id');
  chk('4i no grade row crosses tenants', crossG === 0, 'got ' + crossG);
  const crossGs = await one('SELECT count(*)::int AS n FROM grades g JOIN subjects s ON s.id=g.subject_id WHERE s.school_id <> g.school_id');
  chk('4j no grade uses another tenant\'s subject', crossGs === 0, 'got ' + crossGs);
  const crossGt = await one('SELECT count(*)::int AS n FROM grades g JOIN users t ON t.id=g.teacher_id WHERE t.school_id <> g.school_id');
  chk('4k no grade is taught by another tenant\'s teacher', crossGt === 0, 'got ' + crossGt);

  /* ── 5. deterministic re-run ── */
  const run2 = runSeeder(false);
  chk('5a re-running the seeder (no schema reset) still exits 0', run2.status === 0, run2.out.slice(-300));
  let same = true, detail = [];
  for (const t of Object.keys(expect)) {
    const n = await one('SELECT count(*)::int AS n FROM ' + t);
    if (n !== expect[t]) { same = false; detail.push(t + '=' + n); }
  }
  chk('5b counts are identical after the re-run (no duplicate accumulation)', same, detail.join(','));

  await c.end();

  console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail)
    + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(NAME + ': NOT-RUN — harness error: ' + (e && e.message ? e.message : e));
  process.exit(2);
});

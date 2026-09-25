#!/usr/bin/env node
/* E3 benchmark fixture (probe tool — NOT project code):
 * inserts scale rows for the A-01..A-04 runtime benchmarks.
 * usage: node tools/ap-fixture.js <startId> <endId> [gradesPerSchool]
 * idempotent: ON CONFLICT DO NOTHING on explicit ids.
 */
'use strict';
const { Client } = require('pg');
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL required'); process.exit(2); }
const [a, b] = process.argv.slice(2).map(Number);
const G = Number(process.argv[4] || 20);
if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) { console.error('usage: start end [gradesPerSchool]'); process.exit(2); }

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    // province fix for /api/v1 guard (resolveActorProvince -> school1.province_id)
    await c.query('UPDATE schools SET province_id = 1, updated_at = now() WHERE id = 1 AND province_id IS DISTINCT FROM 1');
    await c.query(`INSERT INTO schools (id, name, district_id, county_id, province_id, active, created_at, updated_at)
      SELECT g, 'Bench S' || g, 777, 77, 1, true, now(), now() FROM generate_series($1::int, $2::int) g
      ON CONFLICT (id) DO NOTHING`, [a, b]);
    await c.query(`INSERT INTO classes (id, school_id, grade_level, name, capacity, created_at, updated_at, version)
      SELECT s * 10 + 1, s, 1, 'C1', 30, now(), now(), 1 FROM generate_series($1::int, $2::int) s
      ON CONFLICT (id) DO NOTHING`, [a, b]);
    await c.query(`INSERT INTO classes (id, school_id, grade_level, name, capacity, created_at, updated_at, version)
      SELECT s * 10 + 2, s, 2, 'C2', 30, now(), now(), 1 FROM generate_series($1::int, $2::int) s
      ON CONFLICT (id) DO NOTHING`, [a, b]);
    await c.query(`INSERT INTO grades (id, school_id, class_id, student_id, subject_id, teacher_id, score, date, created_at, updated_at, version, chg_id)
      SELECT s * 10000 + g, s, s * 10 + 1, 6, 1, 4, 10 + (g % 11), now() - interval '1 day', now(), now(), 1, 0
      FROM generate_series($1::int, $2::int) s, generate_series(1, $3::int) g
      WHERE NOT EXISTS (SELECT 1 FROM grades x WHERE x.id = s * 10000 + g)`, [a, b, G]);
    await c.query(`INSERT INTO attendance (id, school_id, class_id, student_id, date, status, created_at, updated_at, version, chg_id)
      SELECT s * 20000 + g, s, s * 10 + 1, 6, now() - interval '1 day', 'present', now(), now(), 1, 0
      FROM generate_series($1::int, $2::int) s, generate_series(1, $3::int) g
      WHERE NOT EXISTS (SELECT 1 FROM attendance x WHERE x.id = s * 20000 + g)`, [a, b, G]);
    const q = async (t) => (await c.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
    console.log(JSON.stringify({ ok: true, range: [a, b], gradesPerSchool: G,
      counts: { schools: await q('schools'), classes: await q('classes'), grades: await q('grades'), attendance: await q('attendance') } }));
  } finally { await c.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

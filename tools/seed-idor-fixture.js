#!/usr/bin/env node
'use strict';

/*
 * tools/seed-idor-fixture.js
 * Reproducible provisioning of the A-35 two-school PostgreSQL database
 * (payesh_db_idor) documented in docs/audit/a35-idor/A35_REPORT.md and
 * docs/audit/a35-idor/fixture-overlay.js.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const RAW_URL = process.env.DATABASE_URL || 'postgres://payesh:payesh@127.0.0.1:5432/payesh_ci';
const ADMIN_URL = RAW_URL.replace(/\/[^/?]+(\?.*)?$/, (_, q) => '/postgres' + (q || ''));
const IDOR_DB = process.env.IDOR_DB_NAME || 'payesh_db_idor';
const IDOR_URL = RAW_URL.replace(/\/[^/?]+(\?.*)?$/, (_, q) => '/' + IDOR_DB + (q || ''));

async function main() {
  const adm = new Client({ connectionString: ADMIN_URL });
  await adm.connect();
  await adm.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [IDOR_DB]).catch(() => {});
  await adm.query(`DROP DATABASE IF EXISTS "${IDOR_DB}"`);
  await adm.query(`CREATE DATABASE "${IDOR_DB}"`);
  await adm.end();

  const c = new Client({ connectionString: IDOR_URL });
  await c.connect();
  const schemaDdl = fs.readFileSync(path.join(ROOT, 'server', 'schema.sql'), 'utf8');
  await c.query(schemaDdl);
  await c.end();

  const r = spawnSync(process.execPath, ['tools/migrate-ledger.js', 'up'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { DATABASE_URL: IDOR_URL }),
    stdio: 'inherit'
  });
  if (r.status !== 0) throw new Error('migrate-ledger.js up failed on ' + IDOR_DB);

  const client = new Client({ connectionString: IDOR_URL });
  await client.connect();
  try {
    const steps = [
      `INSERT INTO provinces (id, code, name) VALUES (1,'01','اصفهان'),(2,'02','البرز') ON CONFLICT (id) DO NOTHING`,
      `INSERT INTO counties (id, province_id, name) VALUES (1,1,'شهرستان تست ۱'),(2,2,'شهرستان تست ۲') ON CONFLICT (id) DO NOTHING`,
      `INSERT INTO schools (id, name, province_id, county_id, active) VALUES
        (1, 'مدرسه تست ۱', 1, 1, true),
        (2, 'مدرسه تست ۲', 2, 2, true)
       ON CONFLICT (id) DO UPDATE SET province_id = EXCLUDED.province_id, county_id = EXCLUDED.county_id, active = true`,
      `INSERT INTO subjects (id, school_id, name) VALUES
        (1, 1, 'ریاضی'),
        (2, 2, 'فیزیک')
       ON CONFLICT (id) DO NOTHING`,
      `INSERT INTO users (id, phone, national_id, role, school_id, full_name, active, status) VALUES
        (1,  '09121000001', '1000000001', 'superadmin', NULL, 'سوپرادمین', true, 'active'),
        (2,  '09121000010', '1000000010', 'manager',    1,    'مدیر مدرسه ۱', true, 'active'),
        (3,  '09121000011', '1000000011', 'manager',    2,    'مدیر مدرسه ۲', true, 'active'),
        (4,  '09121000020', '1000000020', 'teacher',    1,    'دبیر ۱', true, 'active'),
        (5,  '09121000021', '1000000021', 'teacher',    2,    'دبیر ۲', true, 'active'),
        (6,  '09121000101', '1000000101', 'student',    1,    'دانش‌آموز 1-1', true, 'active'),
        (7,  '09121000102', '1000000102', 'student',    1,    'دانش‌آموز 1-2', true, 'active'),
        (8,  '09121000103', '1000000103', 'student',    1,    'دانش‌آموز 1-3', true, 'active'),
        (9,  '09121000104', '1000000104', 'student',    1,    'دانش‌آموز 1-4', true, 'active'),
        (10, '09121000105', '1000000105', 'student',    1,    'دانش‌آموز 1-5', true, 'active'),
        (11, '09122000101', '2000000101', 'student',    2,    'دانش‌آموز 2-1', true, 'active'),
        (12, '09122000102', '2000000102', 'student',    2,    'دانش‌آموز 2-2', true, 'active'),
        (13, '09122000103', '2000000103', 'student',    2,    'دانش‌آموز 2-3', true, 'active'),
        (14, '09122000104', '2000000104', 'student',    2,    'دانش‌آموز 2-4', true, 'active'),
        (15, '09122000105', '2000000105', 'student',    2,    'دانش‌آموز 2-5', true, 'active'),
        (16, '09121000019', '1000000004', 'edu_office', NULL, 'دفتر الف', true, 'active'),
        (17, '09121000016', '1000000201', 'parent',     1,    'Parent A (S1)', true, 'active'),
        (18, '09121000017', '1000000202', 'parent',     1,    'Parent B (S1)', true, 'active'),
        (19, '09121000018', '1000000203', 'parent',     2,    'Parent C (S2)', true, 'active'),
        (20, '09121000106', '1000000106', 'student',    1,    'دانش‌آموز 1-6', true, 'active')
       ON CONFLICT (id) DO NOTHING`,
      `INSERT INTO offices (id, name, province_id, county_id, user_id, level, active)
         SELECT 1, 'اداره تست', 1, 1, 16, 'province', true
         WHERE NOT EXISTS (SELECT 1 FROM offices WHERE id = 1)`,
      `UPDATE users SET office_id = 1 WHERE id = 16`,
      `INSERT INTO classes (id, school_id, name, grade, homeroom_teacher_id) VALUES
        (1, 1, 'کلاس 1-1', 10, 4),
        (2, 1, 'کلاس 1-2', 10, NULL),
        (3, 2, 'کلاس 2-1', 10, 5),
        (4, 2, 'کلاس 2-2', 10, NULL),
        (5, 1, 'کلاس 1-3', 11, NULL)
       ON CONFLICT (id) DO NOTHING`,
      `INSERT INTO schedule (teacher_id, class_id, school_id, subject_id, day, period) VALUES
        (4, 2, 1, 1, '1', 1),
        (5, 3, 2, 1, '2', 1),
        (5, 4, 2, 2, '3', 1)`,
      `INSERT INTO enrollments (student_id, class_id, school_id) VALUES
        (6, 1, 1), (7, 1, 1), (8, 2, 1), (9, 2, 1), (10, 2, 1),
        (11, 3, 2), (12, 3, 2), (13, 4, 2), (14, 4, 2), (15, 4, 2),
        (20, 5, 1)`,
      `INSERT INTO parent_links (parent_id, student_id, relation) VALUES
        (17, 6, 'father'),
        (17, 7, 'father'),
        (19, 11, 'father')`,
      `INSERT INTO attendance (id, student_id, class_id, school_id, status, date) VALUES
        (5,  6,  1, 1, 'present', '1405-01-01'),
        (11, 11, 3, 2, 'present', '1405-01-01'),
        (51, 20, 5, 1, 'present', '1405-01-01')`,
      `INSERT INTO grades (student_id, class_id, school_id, subject_id, teacher_id, score, max_score) VALUES
        (6, 1, 1, 1, 4, 19, 20),
        (11, 3, 2, 1, 5, 17, 20),
        (20, 5, 1, 1, NULL, 18, 20)`,
    ];
    for (const s of steps) await client.query(s);
    for (const t of ['schools', 'subjects', 'users', 'offices', 'classes', 'schedule', 'enrollments', 'parent_links', 'attendance', 'grades']) {
      await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT max(id) FROM "${t}"), 1))`, [t]).catch(() => {});
    }
    console.log('[seed-idor-fixture] Ready at ' + IDOR_URL.replace(/:[^:@]+@/, ':***@'));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed-idor-fixture] FATAL:', err);
  process.exit(1);
});

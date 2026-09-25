#!/usr/bin/env node
/* A-35: idempotent audit overlay for payesh_db_idor (same SQL as tests/idor-runtime-r4.js ensureFixture). */
'use strict';
const path = require('path');
const { Client } = require('/home/user/p2/node_modules/pg');
(async () => {
  const c = new Client({ connectionString: 'postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor' });
  await c.connect();
  const steps = [
    `INSERT INTO provinces (id, code, name) VALUES (1,'01','اصفهان'),(2,'02','البرز') ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO counties (id, province_id, name) VALUES (1,1,'شهرستان تست ۱'),(2,2,'شهرستان تست ۲') ON CONFLICT (id) DO NOTHING`,
    `UPDATE schools SET county_id=1 WHERE id=1`,
    `UPDATE schools SET province_id=2, county_id=2 WHERE id=2`,
    `INSERT INTO users (id, phone, national_id, role, school_id, full_name, active) VALUES
      (16,'09121000019','1000000004','edu_office',NULL,'دفتر الف',true),
      (17,'09121000016','1000000201','parent',1,'Parent A (S1)',true),
      (18,'09121000017','1000000202','parent',1,'Parent B (S1)',true),
      (19,'09121000018','1000000203','parent',2,'Parent C (S2)',true),
      (20,'09121000106','1000000106','student',1,'دانش‌آموز 1-6',true)
    ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO offices (id, name, province_id, county_id, user_id, level, active)
      SELECT 1,'اداره تست',1,1,16,'province',true WHERE NOT EXISTS (SELECT 1 FROM offices WHERE id=1)`,
    `UPDATE users SET office_id=1 WHERE id=16`,
    `INSERT INTO classes (id, school_id, name, grade) VALUES (5,1,'کلاس 1-3',11) ON CONFLICT (id) DO NOTHING`,
    `UPDATE classes SET homeroom_teacher_id=4 WHERE id=1 AND homeroom_teacher_id IS NULL`,
    `INSERT INTO schedule (teacher_id, class_id, school_id, subject_id)
      SELECT v.t, v.c, v.s, v.sub FROM (VALUES (4,2,1,1),(5,3,2,1),(5,4,2,2)) AS v(t,c,s,sub)
    WHERE NOT EXISTS (SELECT 1 FROM schedule)`,
    `INSERT INTO enrollments (student_id, class_id, school_id)
      SELECT 20,5,1 WHERE NOT EXISTS (SELECT 1 FROM enrollments WHERE student_id=20 AND class_id=5)`,
    `INSERT INTO attendance (student_id, class_id, school_id, status, date)
      SELECT 20,5,1,'present','1405-01-01' WHERE NOT EXISTS (SELECT 1 FROM attendance WHERE student_id=20)`,
    `INSERT INTO parent_links (parent_id, student_id, relation)
      SELECT v.p, v.s, 'father' FROM (VALUES (17,6),(17,7),(19,11)) AS v(p,s)
    WHERE NOT EXISTS (SELECT 1 FROM parent_links)`,
    `INSERT INTO grades (student_id, class_id, school_id, subject_id, score, max_score)
      SELECT 20,5,1,1,18,20 WHERE NOT EXISTS (SELECT 1 FROM grades WHERE student_id=20)`,
    `SELECT setval('users_id_seq', (SELECT max(id) FROM users))`,
    `SELECT setval('classes_id_seq', (SELECT max(id) FROM classes))`,
    `SELECT setval('enrollments_id_seq', (SELECT max(id) FROM enrollments))`,
    `SELECT setval('attendance_id_seq', (SELECT max(id) FROM attendance))`,
    `SELECT setval('grades_id_seq', (SELECT max(id) FROM grades))`,
  ];
  for (const s of steps) { await c.query(s); }
  const v = await c.query(`SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM classes) c,
    (SELECT count(*) FROM parent_links) pl, (SELECT count(*) FROM schedule) sc, (SELECT count(*) FROM provinces) pr`);
  console.log('overlay done:', JSON.stringify(v.rows[0]));
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

#!/usr/bin/env node
'use strict';
/* After the bootstrap has seeded schools/users/attendance, why were grades
 * (and classes) skipped? Replicate the repo's fallback per-row insert. */
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';
(async () => {
  const infra = await L.Infra.start();
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const st = infra.store();
  const ps = (q) => infra.psql(q);
  console.log('schools after boot:', ps('SELECT COUNT(*) FROM schools'));
  const g0 = st.grades[0];
  console.log('grade g0:', JSON.stringify(g0));
  // per-row ON CONFLICT (id) DO UPDATE path (non-partitioned form)
  const fields2 = ['school_id','student_id','class_id','subject_id','teacher_id','term','exam_type','score','created_at','id'];
  const r = ps("INSERT INTO grades (\"school_id\",\"student_id\",\"class_id\",\"subject_id\",\"teacher_id\",\"term\",\"exam_type\",\"score\",\"created_at\",\"id\") VALUES (1,16,1,1,4,'نوبت اول','کلاسی',13.25,'2026-07-04',1) ON CONFLICT (id) DO UPDATE SET school_id=EXCLUDED.school_id");
  console.log('grades per-row upsert:', r.replace(/\n/g,' | ').slice(0,200));
  console.log('grades count:', ps('SELECT COUNT(*) FROM grades'));
  // classes (non-partitioned) with integer grade fix
  const ci = ps("INSERT INTO classes (school_id,name,grade,field,room,capacity,homeroom_teacher_id,id) VALUES (1,'x',10,'a','b',30,4,1) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name");
  console.log('classes upsert int-grade:', ci.replace(/\n/g,' | ').slice(0,160));
  // confirm the grades partition FK trick: insert into parent with school 1 works?
  const pkq = ps("SELECT c.conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname='grades_y2026'");
  console.log('grades_y2026 constraints:', JSON.stringify(pkq));
  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });

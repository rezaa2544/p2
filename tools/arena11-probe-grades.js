#!/usr/bin/env node
'use strict';
/* Why does bootstrap seed skip grades/classes? Isolate the exact failing statement. */
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const infra = await L.Infra.start();
  const st = infra.store();
  const ps = (q) => infra.psql(q);
  const g = st.grades[0];
  console.log('grade sample:', JSON.stringify(g));
  const cols = ps("SELECT string_agg(column_name||':'||data_type, ', ') FROM information_schema.columns WHERE table_name='grades'");
  console.log('grades cols:', cols);
  // direct single-row insert mirroring seedPgFromBootstrap field filtering
  const fields = Object.keys(g).filter((k) => /[a-z_]/.test(k));
  console.log('fields:', JSON.stringify(fields));
  const ins = ps("INSERT INTO grades (\"school_id\",\"student_id\",\"class_id\",\"subject_id\",\"teacher_id\",\"term\",\"exam_type\",\"score\",\"max_score\",\"created_at\",\"id\") VALUES (1,16,1,1,4,'نوبت اول','کلاسی',13.25,20,'2026-07-04',1)");
  console.log('single insert:', ins.replace(/\n/g, ' | '));
  // classes sample + single insert
  const c = st.classes[0];
  const cIns = ps("INSERT INTO classes (\"school_id\",\"name\",\"grade\",\"field\",\"room\",\"capacity\",\"homeroom_teacher_id\",\"id\") VALUES (1,'دهم ریاضی فیزیک','دهم','ریاضی فیزیک','کلاس 101',30,4,1)");
  console.log('class insert (grade string):', cIns.replace(/\n/g, ' | '));
  infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });

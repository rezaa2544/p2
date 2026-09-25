#!/usr/bin/env node
'use strict';
/* Reproduce seedPgFromBootstrap's exact path for a single table and capture
 * the true failure. Uses the real store + real db module internals. */
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const runSqlFile = require('child_process').execFileSync;

(async () => {
  const infra = await L.Infra.start();
  const st = infra.store();
  const ps = (q) => infra.psql(q);

  // is grades partitioned?
  console.log('grades partitioned?', ps("SELECT relname, relispartition FROM pg_class WHERE relname LIKE 'grades%'"));
  console.log('classes partitioned?', ps("SELECT relname, relispartition FROM pg_class WHERE relname LIKE 'classes%'"));

  // bulk insert grades ON CONFLICT DO NOTHING (repo path) — capture error
  const g = st.grades.slice(0, 3);
  const cols = ['school_id','student_id','class_id','subject_id','teacher_id','term','exam_type','score','max_score','created_at','id'];
  const tuples = g.map((r) => '(' + cols.map((c) => {
    const v = r[c];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }).join(',') + ')').join(',');
  const bulkRes = ps('INSERT INTO grades ("' + cols.join('","') + '") VALUES ' + tuples + ' ON CONFLICT DO NOTHING');
  console.log('grades bulk insert result:', bulkRes.replace(/\n/g, ' | ').slice(0, 220));
  console.log('grades count after bulk:', ps('SELECT COUNT(*) FROM grades'));

  // per-row upsert path (persistOpsBatch fallback): ON CONFLICT (id) DO UPDATE
  const g0 = g[0];
  const fields2 = cols.filter((c) => c !== 'updated_at' && c !== 'version' && c !== 'chg_id' && c !== 'deleted_at' && c !== 'max_score');
  const placeholders = fields2.map((_, i) => '$' + (i + 1));
  const updSet = fields2.filter((f) => f !== 'id').map((f) => '"' + f + '" = EXCLUDED."' + f + '"').join(', ');
  const vals = fields2.map((f) => { const v = g0[f]; return (v === null || v === undefined) ? null : v; });
  const single = ps('INSERT INTO grades ("' + fields2.join('","') + '") VALUES (' + placeholders.join(',') + ') ON CONFLICT (id) DO UPDATE SET ' + updSet);
  console.log('grades per-row ON CONFLICT(id) result:', single.replace(/\n/g, ' | ').slice(0, 220));

  // classes: bulk + single
  const c0 = st.classes[0];
  const clsCols = ['school_id','name','grade','field','room','capacity','homeroom_teacher_id','id'];
  const clBulk = ps('INSERT INTO classes ("' + clsCols.join('","') + '") VALUES (1,\'دهم ریاضی فیزیک\',\'دهم\',\'ریاضی فیزیک\',\'کلاس 101\',30,4,1) ON CONFLICT DO NOTHING');
  console.log('classes bulk result:', clBulk.replace(/\n/g, ' | ').slice(0, 200));
  infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });

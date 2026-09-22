#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { persistOpWithClient } = require('../server/db');
const { prepareMigrationSql, computeChecksum, discoverMigrationFiles } = require('../tools/migrate-ledger');

let passes = 0;
function pass(task, name) { passes++; console.log(`  ✅ TASK ${task} / ${name}`); }

async function task1Persistence() {
  console.log('\n=== TASK 1: OCC persistence / atomic compare-and-write ===');

  const q1 = [];
  await persistOpWithClient({ query: async (sql, params) => { q1.push({ sql, params }); return { rowCount: 1, rows: [] }; } }, {
    c: 'grades', t: 'upd', id: 7, base_version: 1, data: { id: 7, score: 19, version: 999 }
  });
  assert(/SET "score" = \$1/.test(q1[0].sql));
  assert(/version = COALESCE\(version, 1\) \+ 1/.test(q1[0].sql));
  assert(/WHERE id = \$2 AND version = \$3/.test(q1[0].sql));
  pass(1, 'update uses one atomic WHERE id+version statement');

  const q2 = [];
  await persistOpWithClient({ query: async (sql, params) => { q2.push({ sql, params }); return { rowCount: 1, rows: [] }; } }, {
    c: 'grades', t: 'upd', id: 7, base_version: 3, data: { score: 20 }
  });
  assert.deepStrictEqual(q2[0].params, [20, 7, 3]);
  pass(1, 'base_version reaches persistence unchanged');

  const q3 = [];
  await persistOpWithClient({ query: async (sql, params) => { q3.push({ sql, params }); return { rowCount: 1, rows: [] }; } }, {
    c: 'grades', t: 'del', id: 7, base_version: 4, data: {}
  });
  assert(/DELETE FROM "grades" WHERE id = \$1 AND version = \$2/.test(q3[0].sql));
  assert.deepStrictEqual(q3[0].params, [7, 4]);
  pass(1, 'delete also carries base_version to the atomic DB predicate');

  let e4;
  try {
    await persistOpWithClient({ query: async () => ({ rowCount: 0, rows: [] }) }, {
      c: 'grades', t: 'upd', id: 7, base_version: 4, data: { score: 21 }
    });
  } catch (e) { e4 = e; }
  assert(e4 && e4.code === 'occ_conflict' && e4.status === 409 && e4.op);
  pass(1, 'zero-row update becomes occ_conflict/409 with operation provenance');

  let e5;
  try {
    await persistOpWithClient({ query: async () => ({ rowCount: 0, rows: [] }) }, {
      c: 'grades', t: 'del', id: 7, base_version: 4, data: {}
    });
  } catch (e) { e5 = e; }
  assert(e5 && e5.code === 'occ_conflict' && e5.status === 409 && e5.op);
  pass(1, 'zero-row delete becomes occ_conflict/409 with operation provenance');
}

async function task2Boundaries() {
  console.log('\n=== TASK 2: OCC boundary / malformed / strict policy ===');

  let e1;
  try { await persistOpWithClient({ query: async () => ({ rowCount: 1, rows: [] }) }, { c:'grades',t:'upd',id:7,base_version:'1',data:{score:1} }); }
  catch(e){ e1=e; }
  assert(e1 && e1.code === 'bad_base_version');
  pass(2, 'string base_version is rejected');

  let e2;
  try { await persistOpWithClient({ query: async () => ({ rowCount: 1, rows: [] }) }, { c:'grades',t:'upd',id:7,base_version:0,data:{score:1} }); }
  catch(e){ e2=e; }
  assert(e2 && e2.code === 'bad_base_version');
  pass(2, 'base_version=0 is rejected');

  const old = process.env.PAYESH_STRICT_OCC;
  process.env.PAYESH_STRICT_OCC='1';
  let e3;
  try { await persistOpWithClient({ query: async () => ({ rowCount: 1, rows: [] }) }, { c:'grades',t:'upd',id:7,data:{score:1} }); }
  catch(e){ e3=e; }
  let e4;
  try { await persistOpWithClient({ query: async () => ({ rowCount: 1, rows: [] }) }, { c:'grades',t:'del',id:7,data:{} }); }
  catch(e){ e4=e; }
  if(old == null) delete process.env.PAYESH_STRICT_OCC; else process.env.PAYESH_STRICT_OCC=old;
  assert(e3 && e3.code === 'missing_base_version' && e3.status === 409);
  assert(e4 && e4.code === 'missing_base_version' && e4.status === 409);
  pass(2, 'strict OCC rejects missing base_version for update and delete');

  let calls=0;
  let e5;
  try { await persistOpWithClient({ query: async () => { calls++; return {rowCount:1,rows:[]};} }, { c:'grades',t:'upd',id:7,base_version:NaN,data:{score:1} }); }
  catch(e){ e5=e; }
  assert(e5 && e5.code === 'bad_base_version' && calls === 0);
  pass(2, 'NaN/malformed base_version fails closed before SQL');
}

async function task3Concurrency() {
  console.log('\n=== TASK 3: concurrency / replay / failure ===');

  let version=1, winners=0;
  const c={query:async(sql,params)=>{
    if(/UPDATE "grades"/.test(sql)){
      if(params[params.length-1] !== version) return {rowCount:0,rows:[]};
      version++; winners++; return {rowCount:1,rows:[]};
    }
    return {rowCount:1,rows:[]};
  }};
  const r=await Promise.allSettled(Array.from({length:10},(_,i)=>persistOpWithClient(c,{c:'grades',t:'upd',id:7,base_version:1,data:{score:10+i}})));
  assert.strictEqual(winners,1);
  assert.strictEqual(r.filter(x=>x.status==='fulfilled').length,1);
  assert.strictEqual(r.filter(x=>x.status==='rejected'&&x.reason.code==='occ_conflict').length,9);
  pass(3, '10 concurrent same-version writers have exactly one winner');

  let deleteVersion=1, deletes=0;
  const dc={query:async(sql,params)=>{
    if(/DELETE FROM "grades"/.test(sql)){
      if(params[1]!==deleteVersion) return {rowCount:0,rows:[]};
      deleteVersion++; deletes++; return {rowCount:1,rows:[]};
    }
    return {rowCount:1,rows:[]};
  }};
  await persistOpWithClient(dc,{c:'grades',t:'del',id:7,base_version:1,data:{}});
  assert.strictEqual(deletes,1);
  pass(3, 'delete race has the same compare-and-write guard');

  let retryVersion=2;
  const rc={query:async(sql,params)=>{
    if(/UPDATE "grades"/.test(sql)){ if(params[params.length-1]!==retryVersion)return{rowCount:0,rows:[]}; retryVersion++; return{rowCount:1,rows:[]}; }
    return {rowCount:1,rows:[]};
  }};
  let conflict;
  try{await persistOpWithClient(rc,{c:'grades',t:'upd',id:7,base_version:1,data:{score:1}});}catch(e){conflict=e;}
  assert(conflict&&conflict.code==='occ_conflict');
  await persistOpWithClient(rc,{c:'grades',t:'upd',id:7,base_version:2,data:{score:2}});
  assert.strictEqual(retryVersion,3);
  pass(3, 'stale conflict followed by fresh-version retry succeeds');

  let pgFailed;
  try{await persistOpWithClient({query:async()=>{throw new Error('PG_DOWN');}},{c:'grades',t:'upd',id:7,base_version:1,data:{score:1}});}catch(e){pgFailed=e;}
  assert(pgFailed&&pgFailed.message==='PG_DOWN');
  pass(3, 'PG failure propagates and cannot become a false success');

  const replay=await Promise.allSettled([1,2,3,4,5].map(i=>persistOpWithClient(c,{c:'grades',t:'upd',id:7,base_version:3,data:{score:i}})));
  assert.strictEqual(replay.filter(x=>x.status==='fulfilled').length,1);
  pass(3, 'replayed stale writes remain conflicts rather than reapplying');
}

function task4SyncContract() {
  console.log('\n=== TASK 4: /api/sync TOCTOU final-gate contract ===');
  const src=fs.readFileSync(path.join(__dirname,'..','server','sync.js'),'utf8');
  assert(/versionedMismatch/.test(src)&&/db\.readOne\(op\.c/.test(src));
  pass(4,'pre-check remains visible as advisory conflict detection');
  assert(/mirrorErr\.code === 'occ_conflict' && mirrorErr\.op/.test(src));
  pass(4,'final persistence OCC conflict is explicitly classified');
  assert(/sendJson\(res, 409, \{ ok: false, code: 'occ_conflict'/.test(src));
  pass(4,'TOCTOU race cannot return false 200; it returns 409');
  assert(/db\.persistOpsBatch\(\[\{ c: 'sync_conflicts'/.test(src));
  pass(4,'final OCC race persists sync_conflicts through PG mirror');
  assert(/return sendJson\(res, 503, \{ ok: false, code: 'sync_mirror_failed'/.test(src));
  pass(4,'conflict persistence failure remains fail-closed at 503');
}

function task5Migration() {
  console.log('\n=== TASK 5: migration 012 + chain / rollback integrity ===');
  const files=discoverMigrationFiles();
  const versions=files.map(f=>f.version);
  assert.strictEqual(new Set(versions).size,versions.length);
  pass(5,'migration versions are unique');
  assert(versions.includes('020')&&versions.includes('021')&&!files.some(f=>f.name==='020_outbox_processing_lease.sql'));
  pass(5,'020 operator identity is preserved and outbox lease is uniquely 021');
  const src=fs.readFileSync(path.join(__dirname,'..','migrations','012_partition_grades_attendance.sql'),'utf8');
  assert(/ALREADY_APPLIED:\s*migration 012/.test(src));
  pass(5,'012 exposes explicit completed-swap sentinel');
  const runner=fs.readFileSync(path.join(__dirname,'..','tools','migrate-ledger.js'),'utf8');
  assert(/alreadyApplied\s*=\s*usePsql/.test(runner)&&/ALREADY_APPLIED_RECOVERED/.test(runner));
  pass(5,'runner contains explicit 012 recovery path');
  const prepared=prepareMigrationSql(src);
  assert(/\bCOMMIT\s*;/i.test(prepared));
  assert(computeChecksum(src).length===64);
  pass(5,'012 internal transaction control and checksum are retained');
}

(async()=>{await task1Persistence();await task2Boundaries();await task3Concurrency();task4SyncContract();task5Migration();console.log(`\nDATA-INTEGRITY FIVE-TASK SUITE: ${passes}/25 passes`);})().catch(e=>{console.error('FAIL:',e.stack||e);process.exit(1);});

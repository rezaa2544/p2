#!/usr/bin/env node
'use strict';

const { createSync, attach } = require('../server/sync');
let ok = 0, total = 0;
async function test(name, fn){
  total++;
  try{ await fn(); ok++; console.log('  ✅ ' + name); }
  catch(e){ console.error('  ❌ ' + name + ': ' + e.stack); process.exitCode = 1; }
}
function assert(x,msg){ if(!x) throw new Error(msg); }

function makeStore(){
  return {
    __processed_uids: {},
    users: [
      { id: 10, role: 'teacher', active: true, school_id: 1, full_name: 'دبیر' },
      { id: 20, role: 'manager', active: true, school_id: 1, full_name: 'مدیر' },
      { id: 100, role: 'student', active: true, school_id: 1, full_name: 'دانش‌آموز' }
    ],
    schools: [{ id: 1, name: 'مدرسه' }],
    classes: [{ id: 5, school_id: 1, name: 'کلاس' }],
    subjects: [{ id: 7, school_id: 1, name: 'ریاضی' }],
    enrollments: [{ id: 1, school_id: 1, class_id: 5, student_id: 100 }],
    schedule: [{ id: 1, school_id: 1, class_id: 5, subject_id: 7, teacher_id: 10, day: 0, period: 1 }],
    grades: [{ id: 1, school_id: 1, class_id: 5, subject_id: 7, teacher_id: 10, student_id: 100, score: 12, version: 1, version_vector: { server: 1 } }],
    attendance: [], discipline: [], sync_conflicts: [], notifications: []
  };
}

async function syncOne(store, op, user){
  attach(store);
  let status = 0, body = null;
  const sync = createSync({
    store,
    db: { isUidProcessed: async () => false, persistOpsBatch: async () => ({ ok: true }) },
    MAX_BATCH: 500,
    AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: () => {},
    markDirty: () => { store.__dirty = true; },
    sessionFrom: async () => user || store.users[0],
    sendJson: (res, st, b) => { status = st; body = b; return b; }
  });
  await sync.apiSync({}, {}, { ops: [Object.assign({ by: (user || store.users[0]).id, uid: 'u' + Math.random().toString(36).slice(2), t: 'upd', c: 'grades', id: 1 }, op)] });
  return { status, body };
}

console.log('\n▸ Version vector sync integration');

(async () => {
  await test('base_vector برابر با سرور → update اعمال و vector bump می‌شود', async () => {
    const store = makeStore();
    const r = await syncOne(store, { base_version: 1, base_vector: { server: 1 }, data: { score: 18 } });
    assert(r.status === 200 && r.body.results[0].ok, JSON.stringify(r.body));
    assert(store.grades[0].score === 18, 'score not updated');
    assert(store.grades[0].version === 2, 'version not bumped');
    assert(store.grades[0].version_vector.server === 2, 'server vector not bumped');
  });

  await test('base_vector کهنه → conflict_preserved و رکورد اعمال نمی‌شود', async () => {
    const store = makeStore();
    store.grades[0].version = 2;
    store.grades[0].version_vector = { server: 2 };
    const r = await syncOne(store, { base_version: 1, base_vector: { server: 1 }, data: { score: 19 } });
    const res = r.body.results[0];
    assert(!res.ok && res.code === 'conflict_preserved' && res.vector_conflict, JSON.stringify(res));
    assert(store.grades[0].score === 12, 'conflicting score applied');
    assert(store.sync_conflicts.length === 1, 'conflict row missing');
    assert(store.sync_conflicts[0].base_vector.server === 1, 'base_vector not stored');
    assert(store.sync_conflicts[0].server_vector.server === 2, 'server_vector not stored');
    assert(store.notifications.length === 1, 'manager notification missing');
  });

  await test('base_vector بدشکل → validation_failed و conflict نمی‌سازد', async () => {
    const store = makeStore();
    const r = await syncOne(store, { base_version: 1, base_vector: { 'bad node': 1 }, data: { score: 15 } });
    const res = r.body.results[0];
    assert(!res.ok && res.code === 'validation_failed' && res.field === 'base_vector', JSON.stringify(res));
    assert(store.sync_conflicts.length === 0, 'bad vector created conflict');
    assert(store.grades[0].score === 12, 'bad vector applied');
  });

  await test('بدون base_vector رفتار قدیمی base_version حفظ می‌شود', async () => {
    const store = makeStore();
    store.grades[0].version = 2;
    store.grades[0].version_vector = { server: 2 };
    const r = await syncOne(store, { base_version: 1, data: { score: 16 } });
    const res = r.body.results[0];
    assert(!res.ok && res.code === 'conflict_preserved' && !res.vector_conflict, JSON.stringify(res));
  });

  await test('فیلد version_vector خام در data توسط fieldGate رد می‌شود', async () => {
    const store = makeStore();
    const r = await syncOne(store, { base_version: 1, base_vector: { server: 1 }, data: { score: 14, version_vector: { evil: 9 } } });
    const res = r.body.results[0];
    assert(!res.ok && (res.code === 'unknown_field' || res.code === 'field_denied'), JSON.stringify(res));
    assert(store.grades[0].version_vector.server === 1, 'client forged vector accepted');
  });

  await test('مجموعه ساختاری با vector کهنه stale_base می‌شود نه conflict دستی', async () => {
    const store = makeStore();
    store.subjects[0].version = 2;
    store.subjects[0].version_vector = { server: 2 };
    attach(store);
    let status, body;
    const sync = createSync({
      store,
      db: { isUidProcessed: async () => false, persistOpsBatch: async () => ({ ok: true }) },
      MAX_BATCH: 500, AT_DRIFT_MS: 1e9, audit: () => {}, markDirty: () => {},
      sessionFrom: async () => store.users[1],
      sendJson: (res, st, b) => { status = st; body = b; return b; }
    });
    await sync.apiSync({}, {}, { ops: [{ uid: 'struct1', by: 20, t: 'upd', c: 'subjects', id: 7, base_version: 1, base_vector: { server: 1 }, data: { weekly_hours: 4 } }] });
    const res = body.results[0];
    assert(status === 200 && !res.ok && res.code === 'stale_base' && res.vector_conflict, JSON.stringify(res));
    assert(store.sync_conflicts.length === 0, 'structural made manual conflict');
  });
})().catch(e => { console.error(e); process.exit(1); });

process.on('beforeExit', () => {
  if(ok !== total){ console.error(`\nversion-vector-sync: ${ok}/${total} سبز — خطا دارد ❌`); process.exitCode = 1; }
  else console.log(`\nversion-vector-sync: ${ok}/${total} سبز ✅`);
});

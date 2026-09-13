#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   conflicts-list-cap.js — بازخورد بازبین #143 (باگ ۱):
   پس از resolve⇒keep (#143)، آرایهٔ sync_conflicts می‌تواند resolvedهای
   بسیار داشته باشد؛ apiList با slice(-50) دقیقاً «ابتدای» آرایهٔ
   مرتب‌شده (بازها اول) را می‌بُرید ⇒ با ۵۰+ resolved، مدیرِ داور
   هیچ تعارضِ بازی نمی‌دید. قرارداد: بازها هرگز قربانیِ سقف نشوند.
   اجرا: node tests/conflicts-list-cap.js
   ───────────────────────────────────────────────────────────── */
'use strict';
const { createConflicts } = require('../server/conflicts.js');

let okc = 0, failc = 0;
function chk(name, cond, extra){
  if(cond){ okc++; console.log('  ✅ ' + name); }
  else { failc++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function mkApi(store){
  return createConflicts({ store, db: null, audit: () => {},
    sessionFrom: async () => ({ id: 5, role: 'manager', school_id: 1 }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    markDirty: () => {} });
}

(async () => {
  console.log('\n▸ بازبین #143 — سقفِ فهرستِ تعارض‌ها نباید بازها را ببلعد');

  /* ── L1: ۶۰ resolved + ۳ open → هر ۳ باز در پاسخِ ۵۰تایی حاضرند و اول‌اند ── */
  {
    const store = { users: [], sync_conflicts: [] };
    for(let i = 0; i < 60; i++)
      store.sync_conflicts.push({ id: 1000 + i, school_id: 1, status: 'resolved',
        created_at: '2026-09-01T00:00:0' + (i % 10) + 'Z', resolved_at: '2026-09-10T00:00:00Z' });
    for(let i = 0; i < 3; i++)
      store.sync_conflicts.push({ id: 1 + i, school_id: 1, status: 'open',
        created_at: '2026-09-1' + i + 'T00:00:00Z' });
    const api = mkApi(store);
    const res = {}; await api.apiList({}, res);
    const out = res._cap.body.conflicts;
    const opens = out.filter(c => c.status === 'open');
    chk('L1a پاسخ سقفِ ۵۰ را نگه می‌دارد', out.length === 50, 'len=' + out.length);
    chk('L1b هر ۳ تعارضِ باز در پاسخ حاضرند (قربانیِ سقف نشدند)', opens.length === 3, 'opens=' + opens.length);
    chk('L1c بازها پیش از resolvedها می‌آیند', out.findIndex(c => c.status === 'resolved') >= 3
      && out.slice(0, 3).every(c => c.status === 'open'),
      'اولین resolved در ' + out.findIndex(c => c.status === 'resolved'));
    chk('L1d ترتیبِ بازها: تازه‌ترین اول', opens[0].id === 3 && opens[2].id === 1,
      opens.map(c => c.id).join(','));
  }

  /* ── L2: زیر سقف (۵ باز + ۵ resolved) → همه برمی‌گردند، بازها اول ── */
  {
    const store = { users: [], sync_conflicts: [] };
    for(let i = 0; i < 5; i++)
      store.sync_conflicts.push({ id: 100 + i, school_id: 1, status: 'resolved',
        created_at: '2026-09-01T00:00:00Z', resolved_at: '2026-09-10T00:00:00Z' });
    for(let i = 0; i < 5; i++)
      store.sync_conflicts.push({ id: 1 + i, school_id: 1, status: 'open',
        created_at: '2026-09-0' + (1 + i) + 'T00:00:00Z' });
    const api = mkApi(store);
    const res = {}; await api.apiList({}, res);
    const out = res._cap.body.conflicts;
    chk('L2a همهٔ ۱۰ ردیف زیر سقف برمی‌گردند', out.length === 10, 'len=' + out.length);
    chk('L2b بازها اول، resolvedها بعد', out.slice(0, 5).every(c => c.status === 'open')
      && out.slice(5).every(c => c.status === 'resolved'));
  }

  /* ── L3: محدودهٔ مدرسه دست‌نخورده — مدیرِ مدرسهٔ ۱، تعارضِ مدرسهٔ ۲ را نمی‌بیند ── */
  {
    const store = { users: [], sync_conflicts: [
      { id: 1, school_id: 1, status: 'open', created_at: '2026-09-01T00:00:00Z' },
      { id: 2, school_id: 2, status: 'open', created_at: '2026-09-02T00:00:00Z' }
    ] };
    const api = mkApi(store);
    const res = {}; await api.apiList({}, res);
    const out = res._cap.body.conflicts;
    chk('L3 محدودهٔ مدرسه پابرجا (فقط مدرسهٔ خود)', out.length === 1 && out[0].id === 1,
      JSON.stringify(out.map(c => c.id)));
  }

  /* ── L4 (بازبین #143 باگ ۲): هرسِ resolvedها سنگ‌قبر می‌گذارد تا دلتا
     بسته‌شدنِ تعارض را به کلاینتِ آفلاین اعلام کند ── */
  {
    const store = { users: [], sync_conflicts: [], __deleted_records: [] };
    /* cap=2: سه resolvedِ موجود + یک resolveِ تازه ⇒ دو کهنه‌ترین هرس می‌شوند */
    process.env.PAYESH_RESOLVED_CONFLICTS_MAX = '2';
    for(let i = 0; i < 3; i++)
      store.sync_conflicts.push({ id: 500 + i, school_id: 1, status: 'resolved',
        created_at: '2026-09-01T00:00:00Z',
        resolved_at: '2026-09-0' + (2 + i) + 'T00:00:00Z', updated_at: '2026-09-0' + (2 + i) + 'T00:00:00Z' });
    store.sync_conflicts.push({ id: 900, school_id: 1, status: 'open',
      base_version: 2, server_version: 4, winner: null,
      server_state: { id: 55, score: 18, version: 4 },
      incoming: null, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z' });
    const api = mkApi(store);
    const res = {}; await api.apiResolve({}, res, { conflict_id: 900, winner: 'server' });
    delete process.env.PAYESH_RESOLVED_CONFLICTS_MAX;
    const resolvedLeft = store.sync_conflicts.filter(c => c.status === 'resolved').map(c => c.id).sort();
    const tombs = store.__deleted_records.filter(t => t.c === 'sync_conflicts');
    chk('L4a resolve موفق و هرس تا سقف (۲ resolved ماند)',
      res._cap.code === 200 && resolvedLeft.length === 2, 'left=' + resolvedLeft.join(','));
    chk('L4b کهنه‌ترین‌ها هرس شدند (500، 501)؛ تازه‌ترها ماندند',
      resolvedLeft.indexOf(500) === -1 && resolvedLeft.indexOf(501) === -1
      && resolvedLeft.indexOf(502) > -1 && resolvedLeft.indexOf(900) > -1,
      'left=' + resolvedLeft.join(','));
    chk('L4c هر هرس یک سنگ‌قبر در __deleted_records گذاشت (c=sync_conflicts، id، school_id، at)',
      tombs.length === 2 && tombs.every(t => t.at && t.school_id === 1)
      && tombs.map(t => t.id).sort().join(',') === '500,501',
      JSON.stringify(tombs));
  }

  console.log('\nconflicts-list-cap: ' + (okc + failc) + ' بررسی — ✅ ' + okc + ' · ❌ ' + failc);
  process.exit(failc ? 1 : 0);
})();

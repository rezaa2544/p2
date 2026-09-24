#!/usr/bin/env node
// tests/phase-c-conflict-resolution.js — رگرسیونِ A-18
// (۱) رفعِ تعارض نباید نسخهٔ رکورد را به گذشته برگرداند.
// (۲) تعارضِ سراسری (school_id == null) نباید به مدیرِ یک مدرسه اجازهٔ
//     بازنویسیِ رکوردِ مدرسه‌ای دیگر را بدهد.
'use strict';

const assert = require('assert');
const path = require('path');
const { createConflicts } = require('../server/conflicts');

let pass = 0;
const failures = [];
const checks = [];
function chk(name, fn) {
  checks.push(Promise.resolve().then(async () => {
    try { await fn(); pass += 1; console.log('  ✅ ' + name); }
    catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
  }));
}

/* ساختِ یک ctxِ حداقلی، دقیقاً مثلِ tests/offline-sync-drill.js — فقط
   آنچه apiResolve واقعاً لمس می‌کند. */
function makeCtx(session) {
  const store = {
    users: [
      { id: 5, role: 'manager', school_id: 5, full_name: 'مدیرِ ۵' },
      { id: 6, role: 'manager', school_id: 99, full_name: 'مدیرِ ۹۹' },
      { id: 7, role: 'superadmin', full_name: 'مدیرکل' }
    ],
    schools: [{ id: 5 }, { id: 99 }],
    /* رکوردِ زنده در نسخهٔ ۱۰ — تعارضِ قدیمیِ server_version:3 است. */
    grades: [{ id: 42, school_id: 99, student_id: 1, score: 95, version: 10 }],
    sync_conflicts: []
  };
  const audits = [];
  const ctx = {
    store,
    db: {
      isPostgres: () => false, /* حالتِ JSON — همان جایی که rewind دیده می‌شود */
      persistOpsBatch: async () => ({ ok: true })
    },
    audit: (ev, meta) => { audits.push({ ev, meta }); },
    markDirty: () => {},
    sessionFrom: async () => session,
    sendJson: (res, code, body) => { res._cap = { code, body }; }
  };
  return { ctx, store, audits };
}

function callResolve(ctx, body) {
  const res = {
    setHeader: () => {},
    end: (payload) => { res._body = payload; }
  };
  const api = createConflicts(ctx);
  return api.apiResolve({}, res, body).then(() => {
    try { res._cap = { code: res.statusCode, body: JSON.parse(res._body) }; }
    catch (e) { res._cap = { code: res.statusCode, body: res._body }; }
    return res._cap;
  });
}

/* تعارضِ سراسری که رکوردِ مدرسهٔ ۹۹ را هدف می‌گیرد. */
function seedGlobalConflict(store, serverVersion) {
  const c = {
    id: 900,
    collection: 'grades',
    record_id: 42,
    school_id: null,                 /* سراسری — کلیدِ بازتولید */
    status: 'open',
    server_version: serverVersion,   /* قدیمی */
    incoming: { data: { score: 12.5 } }
  };
  store.sync_conflicts.push(c);
  return c;
}

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  console.log('▸ A-18 · بازگشتِ نسخه');
  {
    const { ctx, store } = makeCtx({ id: 7, role: 'superadmin' });
    seedGlobalConflict(store, 3);
    const cap = await callResolve(ctx, { conflict_id: 900, winner: 'incoming' });
    const g = store.grades.find((x) => Number(x.id) === 42);
    chk('مشکل: رفع با موفقیت انجام شد', () => assert.strictEqual(cap.code, 200, JSON.stringify(cap)));
    chk('امتیازِ ورودی اعمال شد', () => assert.strictEqual(Number(g.score), 12.5, 'score=' + g.score));
    chk('نسخه جلو می‌رود (max(10,3)+1 = 11)، نه ۴', () => assert.strictEqual(Number(g.version), 11, 'version=' + g.version));
  }

  console.log('▸ A-18 · نوشتنِ بین‌دامنه‌ای از طریقِ تعارضِ سراسری');
  {
    const { ctx, store } = makeCtx({ id: 5, role: 'manager', school_id: 5 });
    seedGlobalConflict(store, 1);
    const before = JSON.parse(JSON.stringify(store.grades));
    const cap = await callResolve(ctx, { conflict_id: 900, winner: 'incoming' });
    chk('مدیرِ ۵ باید رد شود (403)', () => assert.strictEqual(cap && cap.code, 403, JSON.stringify(cap)));
    chk('رکوردِ مدرسهٔ ۹۹ دست‌نخورده ماند',
      () => assert.deepStrictEqual(store.grades, before, JSON.stringify(store.grades)));
    chk('پیامِ خطا خارج از دامنه است',
      () => assert.strictEqual(cap && cap.body && cap.body.code, 'out_of_scope'));
    chk('تعارض هنوز open است (resolve نشد)',
      () => assert.strictEqual(store.sync_conflicts[0].status, 'open', 'status=' + store.sync_conflicts[0].status));
  }

  console.log('▸ A-18 · مدیرِ همان مدرسه مجاز است');
  {
    const { ctx, store } = makeCtx({ id: 6, role: 'manager', school_id: 99 });
    seedGlobalConflict(store, 8);
    const cap = await callResolve(ctx, { conflict_id: 900, winner: 'incoming' });
    const g = store.grades.find((x) => Number(x.id) === 42);
    chk('مدیرِ ۹۹ مجاز است (200)', () => assert.strictEqual(cap && cap.code, 200, JSON.stringify(cap)));
    chk('نسخه جلو رفت (max(10,8)+1 = 11)', () => assert.strictEqual(Number(g.version), 11, 'version=' + g.version));
  }

  console.log('▸ A-18 · تعارضِ درون‌دامنه‌ایِ عادی هنوز کار می‌کند');
  {
    const { ctx, store } = makeCtx({ id: 5, role: 'manager', school_id: 5 });
    store.grades.push({ id: 43, school_id: 5, student_id: 2, score: 14, version: 2 });
    store.sync_conflicts.push({
      id: 901, collection: 'grades', record_id: 43, school_id: 5, status: 'open',
      server_version: 2, incoming: { data: { score: 18 } }
    });
    const cap = await callResolve(ctx, { conflict_id: 901, winner: 'incoming' });
    const g = store.grades.find((x) => Number(x.id) === 43);
    chk('تعارضِ هم‌مدرسه مجاز است (200)', () => assert.strictEqual(cap && cap.code, 200, JSON.stringify(cap)));
    chk('امتیاز اعمال شد', () => assert.strictEqual(Number(g.score), 18, 'score=' + g.score));
    chk('نسخه ۳ شد', () => assert.strictEqual(Number(g.version), 3, 'version=' + g.version));
  }

  await Promise.all(checks);
  console.log('\n──────────────────────────────────────────');
  if (failures.length) {
    console.log('phase-c-conflict-resolution: ' + pass + ' موفق، ' + failures.length + ' ناموفق');
    console.log('ناموفق‌ها: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('phase-c-conflict-resolution: ' + pass + '/' + pass + ' موفق ✅');
}

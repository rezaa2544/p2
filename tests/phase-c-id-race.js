#!/usr/bin/env node
// tests/phase-c-id-race.js — رگرسیونِ A-04: مسابقهٔ تولید شناسهٔ تکراری
'use strict';

const assert = require('assert');
const { createIds } = require('../server/ids');

let pass = 0;
const failures = [];
const checks = [];
function chk(name, fn) {
  checks.push(Promise.resolve().then(async () => {
    try { await fn(); pass += 1; console.log('  ✅ ' + name); }
    catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
  }));
}

/* شبیه‌سازیِ دقیقِ الگوی فراخوانِ واقعی (server/routes/students.js:150-181):
     const id = await ids.nextId('users', store.users);
     await db.persistOpsBatch(...);          ← await بینِ id و push
     store.users.push(record);               ← push دیرتر از nextId
   دو درخواستِ همزمان نباید هرگز یک شناسهٔ یکسان بگیرند. */
function simulateConcurrentCreates(list, n) {
  const ids = createIds({ db: null, cache: null });
  const inFlight = [];
  const startLen = list.length;

  const makeRequest = async () => {
    const id = await ids.nextId('users', list);
    // همانجا یک رکوردِ موقت push نمی‌کنیم — این دقیقاً نقصِ پیشینه است:
    // درخواستِ دوم list را می‌بیند در حالی که درجِ اول هنوز رخ نداده.
    await new Promise((r) => setImmediate(r));   // جایِ await persistOpsBatch
    return id;
  };

  for (let i = 0; i < n; i++) inFlight.push(makeRequest());
  return Promise.all(inFlight).then((out) => {
    // pushها بعد از بازگشتِ همهٔ nextIdها اتفاق می‌افتند (بدونِ اصلاح،
    // هر دو درخواست یک max یکسان دیدند و یک id یکسان گرفتند)
    out.forEach((id, i) => { list.push({ id, name: 's' + i }); });
    void startLen;
    return out;
  });
}

chk('دو درخواستِ همزمان شناسهٔ یکتا می‌گیرند (نه یکسان)', async () => {
  const list = [{ id: 100 }, { id: 101 }];
  const out = await simulateConcurrentCreates(list, 3);
  assert.strictEqual(new Set(out).size, out.length, 'duplicate ids: ' + JSON.stringify(out));
});

chk('شناسه‌ها صعودی و یکتا می‌مانند در چند موجِ همزمان', async () => {
  const list = [{ id: 1 }, { id: 2 }, { id: 5 }];
  const all = [];
  for (let wave = 0; wave < 4; wave++) {
    const out = await simulateConcurrentCreates(list, 5);
    all.push(...out);
  }
  assert.strictEqual(new Set(all).size, all.length, 'duplicates across waves');
  // همهٔ شناسه‌ها باید از بزرگترین id موجود شروع به صعود کنند
  const min = Math.min(...all);
  assert.ok(min > 5, 'ids must exceed the pre-existing max (5), got ' + min);
});

chk('پس از یک درجِ ناموفق، شناسه باز هم تکراری نمی‌شود (رفتارِ دنباله)', async () => {
  const list = [{ id: 10 }];
  const ids = createIds({ db: null, cache: null });
  const a = await ids.nextId('users', list);        // ۱۱ — فرض کنیم درج شکست می‌خورد
  const b = await ids.nextId('users', list);        // باید ۱۲ باشد، نه ۱۱
  assert.notStrictEqual(a, b);
  assert.ok(b > a, 'b must advance past the issued-but-unpushed id');
});

Promise.all(checks).then(() => {
  console.log('\n' + '═'.repeat(60));
  console.log('نتیجهٔ Phase C id-race: ' + pass + ' موفق / ' + failures.length + ' ناموفق');
  if (failures.length) console.log('ناموفق‌ها: ' + failures.join('، '));
  process.exit(failures.length ? 1 : 0);
});

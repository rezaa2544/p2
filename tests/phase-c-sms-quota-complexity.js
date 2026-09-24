#!/usr/bin/env node
// tests/phase-c-sms-quota-complexity.js — رگرسیونِ A-06
// (۱) سقفِ روزانه همچنان به درستی اعمال می‌شود و شمارش دقیق است.
// (۲) هزینهٔ بررسیِ سقف دیگر وابسته به اندازهٔ batch × اندازهٔ sms_log نیست:
//     قبلاً usedToday به ازایِ هر آیتمِ دسته (تا ۵۰۰) کلِ log را پیمایش
//     می‌کرد و log فقط append است → ۴.۱ ثانیه رویِ ۲۰۰هزار ردیف، و با هر
//     ارسال یکنواخت بدتر. اکنون یک پازش به ازایِ مدرسه.
'use strict';

const assert = require('assert');
const { createSms } = require('../server/sms');

let pass = 0;
const failures = [];
const checks = [];
function chk(name, fn) {
  checks.push(Promise.resolve().then(async () => {
    try { await fn(); pass += 1; console.log('  ✅ ' + name); }
    catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
  }));
}

process.env.PAYESH_SMS_PROVIDER = 'mock';
process.env.PAYESH_SMS_MAX_PER_DAY = '100';

const TODAY = new Date().toISOString().slice(0, 10);

function makeCtx(){
  const store = {
    users: [
      { id: 1, role: 'superadmin' },
      { id: 10, role: 'parent', phone: '09120000010' },
      { id: 11, role: 'parent', phone: '09120000011' }
    ],
    sms_wallet: [{ id: 1, school_id: 5, balance: 100000 }],
    sms_log: [],
    notify_queue: []
  };
  const audits = [];
  return {
    store,
    audits,
    db: { persistOpsBatch: async () => ({ ok: true }) },
    audit: (ev, meta) => { audits.push({ ev, meta }); },
    markDirty: () => {},
    sessionFrom: async () => ({ id: 1, role: 'superadmin' }),
    sendJson: (res, code, body) => { res._cap = { code, body }; }
  };
}

function seedQueue(store, n, schoolId){
  for(let i = 0; i < n; i++){
    store.notify_queue.push({
      id: 1000 + i, school_id: schoolId, status: 'pending',
      parent_ids: [10], body: 'پیامِ تست', parts: 1
    });
  }
}

function seedLog(store, n, schoolId, status){
  for(let i = 0; i < n; i++){
    store.sms_log.push({
      id: 5000 + i, school_id: schoolId, status: status || 'sent',
      created_at: TODAY, parts: 1, user_id: 10,
      queue_id: 900000 + i /* بازهٔ جدا ازِ queue_idهایِ ارسالی — تا
        ایدمپوتانسِ درونی (sms.js) با شمارشِ سقف تداخل نکند */
    });
  }
}

function callSend(ctx, queueIds){
  const res = {};
  const api = createSms(ctx);
  return api.apiSend({}, res, { queue_ids: queueIds }).then(() => res._cap);
}

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  console.log('▸ A-06 · سقفِ روزانه همچنان دقیق است');
  {
    const ctx = makeCtx();
    seedQueue(ctx.store, 3, 5);
    /* ۹۰ قطعهٔ مصرف‌شده + این دسته (۳ آیتم × ۱ والد × ۱ قطعه = ۳) = ۹۳ < ۱۰۰ ⇒ عبور */
    seedLog(ctx.store, 90, 5, 'sent');
    const cap = await callSend(ctx, [1000, 1001, 1002]);
    chk('دستهٔ زیرِ سقف ارسال می‌شود (200)',
      () => assert.strictEqual(cap.code, 200, JSON.stringify(cap)));
    chk('هر ۳ آیتم ارسال شد',
      () => assert.strictEqual(cap.body.sent, 3, JSON.stringify(cap.body)));
    chk('رکوردهایِ sent نوشته شد',
      () => assert.strictEqual(ctx.store.sms_log.filter((l) => l.status === 'sent').length, 93));
  }

  console.log('▸ A-06 · عبور از سقف → ۴۲۹');
  {
    const ctx = makeCtx();
    seedQueue(ctx.store, 3, 5);
    seedLog(ctx.store, 98, 5, 'sent'); /* ۹۸ مصرف‌شده */
    const cap = await callSend(ctx, [1000, 1001, 1002]); /* ۹۸ + ۳ = ۱۰۱ > ۱۰۰ */
    chk('دستهٔ بالایِ سقف ۴۲۹ می‌گیرد',
      () => assert.strictEqual(cap.code, 429, JSON.stringify(cap)));
    chk('کد daily_cap است',
      () => assert.strictEqual(cap.body && cap.body.code, 'daily_cap'));
    chk('مدرسهٔ متجاوز در پاسخ هست',
      () => assert.strictEqual(cap.body && cap.body.school, 5));
    chk('هیچ ارسالی انجام نشد',
      () => assert.strictEqual(ctx.store.notify_queue.filter((q) => q.status === 'sent').length, 0));
    chk('هیچ رکوردِ sent جدیدی نوشته نشد',
      () => assert.strictEqual(ctx.store.sms_log.filter((l) => l.status === 'sent').length, 98));
    chk('رخدادِ sms_cap ثبت شد',
      () => assert.ok(ctx.audits.some((a) => a.ev === 'sms_cap'), JSON.stringify(ctx.audits)));
  }

  console.log('▸ A-06 · رکوردهایِ failed و رکوردهایِ روزهای دیگر در سقف نمی‌شمارند');
  {
    const ctx = makeCtx();
    seedQueue(ctx.store, 2, 5);
    seedLog(ctx.store, 50, 5, 'failed');          /* failed — نمی‌شمارد */
    seedLog(ctx.store, 50, 9, 'sent');            /* مدرسهٔ دیگر — نمی‌شمارد */
    ctx.store.sms_log.push({ id: 1, school_id: 5, status: 'sent', created_at: '2020-01-01', parts: 5, user_id: 10 }); /* روزِ دیگر */
    const cap = await callSend(ctx, [1000, 1001]);
    chk('فقط مصرفِ امروزِ همین مدرسه می‌شمارد (200)',
      () => assert.strictEqual(cap.code, 200, JSON.stringify(cap)));
    chk('دو آیتم ارسال شد',
      () => assert.strictEqual(cap.body.sent, 2, JSON.stringify(cap.body)));
  }

  console.log('▸ A-06 · هزینه دیگر وابسته به batch × log نیست');
  {
    /* همان سناریویِ ۴.۱ثانیه‌ایِ گزارششده: ۲۰۰هزار ردیفِ log + دستهٔ ۵۰۰.
       قبل از اصلاح: ۵۰۰ × ۲۰۰۰۰۰ = ۱۰۰ میلیون پیمایش.
       بعد از اصلاح: ۱ پازش به ازایِ مدرسه = ۲۰۰ هزار پیمایش.
       نکته: log برایِ مدرسه‌ای دیگر seed می‌شود و سقف بالا گرفته می‌شود تا
       حلقهٔ پیش‌بازرسی رویِ همهٔ ۵۰۰ آیتم اجرا شود وگرنه از همان آیتمِ
       اول ۴۲۹ برمی‌گردد و مسیرِ درجه‌دو اصلاً طی نمی‌شود. */
    const savedCap = process.env.PAYESH_SMS_MAX_PER_DAY;
    process.env.PAYESH_SMS_MAX_PER_DAY = '100000';
    const ctx = makeCtx();
    ctx.store.sms_wallet[0].balance = 1000000;
    seedQueue(ctx.store, 500, 5);
    seedLog(ctx.store, 200000, 99, 'sent'); /* مدرسهٔ دیگر: در سقف نمی‌شمارد، ولی پازش را گران می‌کند */
    const t0 = Date.now();
    const cap = await callSend(ctx, ctx.store.notify_queue.map((q) => q.id));
    const ms = Date.now() - t0;
    process.env.PAYESH_SMS_MAX_PER_DAY = savedCap;
    console.log('    (زمان: ' + ms + ' ms — قبل از اصلاح ~۴۱۰۰ ms گزارش شده بود)');
    chk('دستهٔ ۵۰۰تایی رویِ ۲۰۰هزار ردیفِ log در زمانِ متعارف انجام شد',
      () => assert.ok(ms < 1500, 'too slow: ' + ms + ' ms'));
    chk('همهٔ ۵۰۰ آیتم از پیش‌بازرسیِ سقف عبور کردند و ارسال شدند (۴۲۹ زودتر برنمی‌گردد)',
      () => assert.ok(cap.code === 200 && cap.body.sent === 500, JSON.stringify(cap)));
    chk('شناسه‌هایِ صادرشده یکتا و صعودی هستند (nextId دیگر بازپیمایش نمی‌کند)',
      () => {
        const newIds = ctx.store.sms_log.filter((l) => l.school_id === 5 && l.status === 'sent').map((l) => l.id);
        assert.strictEqual(newIds.length, 500, 'new sent rows: ' + newIds.length);
        const uniq = new Set(newIds);
        assert.strictEqual(uniq.size, 500, 'duplicate ids issued: ' + (500 - uniq.size));
        assert.ok(Math.max.apply(null, newIds) > 200000, 'ids must exceed the seeded range');
      });
  }

  console.log('▸ A-06 · ایدمپوتانس: گیرندهٔ ازقبل‌ارسال‌شده دوباره ارسال نمی‌شود');
  {
    /* ایندکسِ جدیدِ ایدمپوتانس رفتارِ dedup را حفظ می‌کند: یک گیرنده که
       از قبل برایِ همین queue_id ارسال شده، نباید دوباره برود. */
    const ctx = makeCtx();
    ctx.store.notify_queue.push({
      id: 7000, school_id: 5, status: 'pending', parent_ids: [10, 11], body: 'پیام', parts: 1
    });
    ctx.store.sms_log.push({ id: 9001, school_id: 5, status: 'sent', created_at: TODAY,
      parts: 1, user_id: 10, queue_id: 7000 });
    const cap = await callSend(ctx, [7000]);
    const sent = ctx.store.sms_log.filter((l) => l.status === 'sent' && l.queue_id === 7000);
    chk('فقط گیرندهٔ دوم ارسال شد (گیرندهٔ اول dedupe شد)',
      () => assert.strictEqual(sent.length, 2, 'sent rows: ' + JSON.stringify(sent.map((l) => l.user_id))));
    chk('ردیفِ جدید برایِ user_id=11 است',
      () => assert.ok(sent.some((l) => l.user_id === 11), JSON.stringify(sent.map((l) => l.user_id))));
    chk('ردیفِ موجود برایِ user_id=10 دست‌نخورده ماند',
      () => assert.ok(sent.some((l) => l.user_id === 10 && l.id === 9001)));
    chk('رکوردِ تکراری برایِ user_id=10 ساخته نشد',
      () => assert.strictEqual(sent.filter((l) => l.user_id === 10).length, 1));
  }

  await Promise.all(checks);
  console.log('\n──────────────────────────────────────────');
  if (failures.length) {
    console.log('phase-c-sms-quota-complexity: ' + pass + ' موفق، ' + failures.length + ' ناموفق');
    console.log('ناموفق‌ها: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('phase-c-sms-quota-complexity: ' + pass + '/' + pass + ' موفق ✅');
}

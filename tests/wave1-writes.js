#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   wave1-writes.js — Wave 1 (بخش دوم): انتقال Writes به PostgreSQL
   ─────────────────────────────────────────────────────────────
   W1  sms آیتمِ موفق: log+wallet+queue در یک تراکنش (BEGIN…COMMIT)
   W2  sms آیتمِ شکست‌خورده: رکوردِ failed در تراکنش
   W3  sms شکستِ آینه: برای کلاینت نامرئی (200) + audit
   W4  sync نوتیفیکیشنِ مشتق (hookِ پیام) در همان تراکنشِ mirror
   W5  delete-service: DELETE + رویدادِ outbox در یک تراکنش
   W6  حالتِ حافظه (بدون PG): هیچ SQL + همه ok
   W7  delete-service شکست: ROLLBACK + انتشارِ خطا
   نکته: اتمی‌بودنِ واقعی PG برعهدهٔ خودِ PG است؛ اینجا انضباطِ
   فراخوانی (تراکنش/فراخوانیِ آینه) با pool/client جعلی آزموده می‌شود.
   ───────────────────────────────────────────────────────────── */
'use strict';
const db = require('../server/db.js');
const { createSync, attach } = require('../server/sync.js');
const { createSms } = require('../server/sms.js');
const { createOutbox } = require('../server/outbox.js');
const { createDeleteService } = require('../server/delete-service.js');
const { opX } = require('./helpers/opx');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
/* client جعلی — SELECTها rowCount=0 می‌گیرند تا isUidProcessed «فرآیندشده»
   نبیند؛ INSERT/UPDATE/DELETE rowCount=1. */
function fakeClient(failWord) {
  return {
    queries: [], releaseCount: 0,
    query: async function (t) {
      this.queries.push(t);
      if (failWord && String(t).indexOf(failWord) >= 0) throw new Error('boom:' + String(t).slice(0, 40));
      return { rows: [], rowCount: /^SELECT/i.test(String(t)) ? 0 : 1 };
    },
    release: function () { this.releaseCount++; }
  };
}
function fakePool(failWord) {
  /* هر connect یک client جدا می‌دهد (مثل PG) — تا «خارج تراکنش» قابل‌مشاهده باشد */
  const clients = [];
  const make = () => { const c = fakeClient(failWord); clients.push(c); return c; };
  return {
    connect: async () => make(),
    query: async (t) => { const c = make(); const r = await c.query(t); return r; },
    end: async () => {},
    clients,
    /* اگر تراکنشی باز نشده باشد (خودِ جهشِ هدف)، stub خالی → چکِ ❌ چاپ می‌شود */
    txClient: () => clients.find(c => c.queries.indexOf('BEGIN') >= 0) || { queries: [] }
  };
}
const txStats = (qs) => ({
  begin: qs.filter(q => q === 'BEGIN').length,
  commit: qs.filter(q => q === 'COMMIT').length,
  rollback: qs.filter(q => q === 'ROLLBACK').length
});
const quiet = (fn) => { const e0 = console.error; console.error = () => {}; return Promise.resolve().then(fn).finally(() => { console.error = e0; }); };
const PHONE = '09123456789';

(async () => {
  console.log('\n▸ Wave1-W — انتقال Writes به PostgreSQL (تراکنش‌ها، بدون PG واقعی)');

  /* ── W1: sms آیتمِ موفق → یک تراکنش با سه نوشت ── */
  {
    process.env.PAYESH_SMS_PROVIDER = 'mock';
    delete process.env.PAYESH_SMS_MOCK_FAIL;
    delete process.env.PAYESH_SMS_DRY_RUN;
    const pool = fakePool(null);
    db.__setPoolForTests(pool);
    const store = {
      users: [{ id: 101, role: 'parent', school_id: 1, phone: PHONE, full_name: 'P' }],
      notify_queue: [{ id: 1, status: 'pending', school_id: 1, parent_ids: [101], parts: 1, body: 'سلام، جلسه ساعت ۱۰' }],
      sms_wallet: [{ id: 1, school_id: 1, balance: 10 }],
      sms_log: []
    };
    const audits = [];
    const sms = createSms({ store, db, audit: (ev, d) => audits.push({ ev, d }),
      sessionFrom: async () => ({ id: 999, role: 'superadmin' }),
      sendJson: (res, code, body) => { res._cap = { code, body }; }, markDirty: () => {} });
    const res = {};
    await sms.apiSend({}, res, { queue_ids: [1] });
    const cap = res._cap || {};
    const c = pool.txClient();
    const st = txStats(c.queries);
    chk('W1a پاسخ 200 و ارسالِ موفق', cap.code === 200 && cap.body && cap.body.sent === 1, JSON.stringify(cap.body));
    chk('W1b sms: یک تراکنشِ کامل (BEGIN…COMMIT، بدون ROLLBACK) صادر شود',
      st.begin === 1 && st.commit === 1 && st.rollback === 0, JSON.stringify(st));
    const up = c.queries.filter(q => String(q).indexOf('ON CONFLICT') >= 0);
    const tables = up.map(q => String(q).match(/INSERT INTO (\w+)/)[1]);
    chk('W1c sms: log + wallet + queue در همان تراکنش (۳ upsert)',
      up.length === 3 && tables.sort().join(',') === 'notify_queue,sms_log,sms_wallet', tables.join(','));
    db.__setPoolForTests(null);
  }

  /* ── W2: sms آیتمِ شکست → رکوردِ failed در تراکنش ── */
  {
    process.env.PAYESH_SMS_MOCK_FAIL = PHONE;
    const pool = fakePool(null);
    db.__setPoolForTests(pool);
    const store = {
      users: [{ id: 101, role: 'parent', school_id: 1, phone: PHONE, full_name: 'P' }],
      notify_queue: [{ id: 2, status: 'pending', school_id: 1, parent_ids: [101], parts: 1, body: 'پیامِ شکست‌خورده' }],
      sms_wallet: [{ id: 1, school_id: 1, balance: 10 }],
      sms_log: []
    };
    const audits = [];
    const sms = createSms({ store, db, audit: (ev, d) => audits.push({ ev, d }),
      sessionFrom: async () => ({ id: 999, role: 'superadmin' }),
      sendJson: (res, code, body) => { res._cap = { code, body }; }, markDirty: () => {} });
    const res = {};
    await sms.apiSend({}, res, { queue_ids: [2] });
    const cap = res._cap || {};
    const c = pool.txClient();
    const st = txStats(c.queries);
    const up = c.queries.filter(q => String(q).indexOf('ON CONFLICT') >= 0);
    chk('W2a پاسخ 200 با failed=1', cap.code === 200 && cap.body && cap.body.failed === 1, JSON.stringify(cap.body));
    chk('W2b sms: تراکنشِ رکوردِ failed صادر شود (یک upsertِ sms_log)',
      st.begin === 1 && st.commit === 1 && up.length === 1
      && String(up[0]).indexOf('INSERT INTO sms_log') === 0
      && store.sms_log.length === 1 && store.sms_log[0].status === 'failed',
      'up=' + up.length + ' log=' + store.sms_log.map(x => x.status).join('|'));
    delete process.env.PAYESH_SMS_MOCK_FAIL;
    db.__setPoolForTests(null);
  }

  /* ── W3: sms شکستِ آینه → نامرئی برای کلاینت + audit ── */
  {
    const pool = fakePool('sms_wallet'); /* upsertِ wallet می‌شکند */
    db.__setPoolForTests(pool);
    const store = {
      users: [{ id: 101, role: 'parent', school_id: 1, phone: PHONE, full_name: 'P' }],
      notify_queue: [{ id: 3, status: 'pending', school_id: 1, parent_ids: [101], parts: 1, body: 'پیامِ آینه‌شکن' }],
      sms_wallet: [{ id: 1, school_id: 1, balance: 10 }],
      sms_log: []
    };
    const audits = [];
    const sms = createSms({ store, db, audit: (ev, d) => audits.push({ ev, d }),
      sessionFrom: async () => ({ id: 999, role: 'superadmin' }),
      sendJson: (res, code, body) => { res._cap = { code, body }; }, markDirty: () => {} });
    const res = {};
    try { await sms.apiSend({}, res, { queue_ids: [3] }); }
    catch (e) { /* MW5 هدف: خطایِ نشت‌شده باید همین‌جا دیده شود */ }
    const cap = res._cap || {};
    const c = pool.txClient();
    const st = txStats(c.queries);
    chk('W3a sms: شکستِ آینه پاسخ را عوض نکند (200، sent=1)',
      cap.code === 200 && cap.body && cap.body.sent === 1, 'code=' + cap.code + ' body=' + JSON.stringify(cap.body));
    chk('W3b sms: ROLLBACK صادر + auditِ sms_mirror_failed',
      st.rollback >= 1 && audits.some(a => a.ev === 'sms_mirror_failed'),
      'rollback=' + st.rollback + ' audits=' + audits.map(a => a.ev).join(','));
    db.__setPoolForTests(null);
  }

  /* ── W4: sync — نوتیفیکیشنِ مشتق (hookِ پیام) در همان تراکنش ── */
  {
    const pool = fakePool(null);
    db.__setPoolForTests(pool);
    const store = {
      users: [
        { id: 201, role: 'teacher', school_id: 1, full_name: 'T' },
        { id: 202, role: 'student', school_id: 1, full_name: 'S' }
      ],
      messages: [], notifications: [],
      __processed_uids: {}, __server_version: 0
    };
    const audits = [];
    attach(store);
    const sync = createSync({
      store, db, MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
      audit: (ev, d) => audits.push({ ev, d }),
      sessionFrom: async () => ({ id: 201, role: 'teacher', school_id: 1 }),
      sendJson: (res, code, body) => { res._cap = { code, body }; },
      markDirty: () => {}
    });
    const res = {};
    await sync.apiSync({}, res, { ops: [opX({
      uid: 'w4-msg-1', by: 201, collection: 'messages', type: 'ins',
      data: { from_id: 201, to_id: 202, school_id: 1, body: 'سلام دانش‌آموز' }
    })] });
    const cap = res._cap || {};
    const c = pool.txClient();
    const st = txStats(c.queries);
    const up = c.queries.filter(q => String(q).indexOf('ON CONFLICT') >= 0);
    const tables = up.map(q => String(q).match(/INSERT INTO (\w+)/)[1]).sort();
    chk('W4a sync: op اعمال + 200', cap.code === 200 && cap.body && cap.body.results[0] && cap.body.results[0].ok === true, JSON.stringify(cap.body && cap.body.results));
    chk('W4b sync: نوتیفیکیشنِ مشتق در همان تراکنش (messages + notifications)',
      st.begin === 1 && st.commit === 1
      && tables.indexOf('messages') >= 0 && tables.indexOf('notifications') >= 0,
      'tables=' + tables.join(',') + ' tx=' + JSON.stringify(st));
    chk('W4c sync: نوتیفیکیشن در store هم هست (برای کلاینتِ بعدی)',
      store.notifications.length === 1 && store.notifications[0].user_id === 202,
      'n=' + store.notifications.length);
    db.__setPoolForTests(null);
    attach({});
  }

  /* ── W5: delete-service — DELETE + outbox در یک تراکنش ── */
  {
    const pool = fakePool(null);
    db.__setPoolForTests(pool);
    const store = { attendance: [{ id: 7, student_id: 3, class_id: 2, school_id: 1, date: '2026-09-09', status: 'present', version: 1 }], tombstones: [] };
    const outbox = createOutbox({ store, db });
    const deleter = createDeleteService({ store, db, markDirty: () => {}, outbox });
    const r = await quiet(async () => deleter.softDelete('attendance', { id: 7 }, { actor: { id: 5 }, audit: () => {} }));
    const c = pool.txClient();
    const st = txStats(c.queries);
    const del = c.queries.find(q => String(q).indexOf('DELETE FROM attendance') === 0);
    const obx = c.queries.find(q => String(q).indexOf('INSERT INTO server_outbox') === 0);
    const delIdx = del ? c.queries.indexOf(del) : -1;
    const obxIdx = obx ? c.queries.indexOf(obx) : -1;
    const beginIdx = c.queries.indexOf('BEGIN'), commitIdx = c.queries.lastIndexOf('COMMIT');
    chk('W5a delete: موفق + رکورد از زنده خارج', r && r.ok === true && store.attendance.length === 0 && store.tombstones.length === 1, JSON.stringify(r));
    chk('W5b delete: DELETE و outbox در یک تراکنش (BEGIN < هر دو < COMMIT)',
      st.begin === 1 && st.commit === 1 && st.rollback === 0
      && delIdx > beginIdx && obxIdx > beginIdx && delIdx < commitIdx && obxIdx < commitIdx,
      'tx=' + JSON.stringify(st) + ' idx del=' + delIdx + ' obx=' + obxIdx);
    db.__setPoolForTests(null);
  }

  /* ── W6: حالتِ حافظه — هیچ SQL + همه ok ── */
  {
    db.__setPoolForTests(null);
    const store = {
      users: [{ id: 101, role: 'parent', school_id: 1, phone: PHONE, full_name: 'P' }],
      notify_queue: [{ id: 4, status: 'pending', school_id: 1, parent_ids: [101], parts: 1, body: 'حالتِ حافظه' }],
      sms_wallet: [{ id: 1, school_id: 1, balance: 10 }],
      sms_log: [],
      attendance: [{ id: 8, school_id: 1, version: 1 }]
    };
    const sms = createSms({ store, db, audit: () => {},
      sessionFrom: async () => ({ id: 999, role: 'superadmin' }),
      sendJson: (res, code, body) => { res._cap = { code, body }; }, markDirty: () => {} });
    const res = {};
    await sms.apiSend({}, res, { queue_ids: [4] });
    const cap = res._cap || {};
    const outbox = createOutbox({ store, db });
    const deleter = createDeleteService({ store, db, markDirty: () => {}, outbox });
    const r = await deleter.softDelete('attendance', { id: 8 }, {});
    chk('W6 حافظه: sms 200/sent + delete ok بدونِ هیچ فراخوانیِ PG',
      cap.code === 200 && cap.body && cap.body.sent === 1 && r.ok === true
      && store.sms_log[0].status === 'sent' && store.attendance.length === 0,
      'sms=' + JSON.stringify(cap.body) + ' del=' + JSON.stringify(r));
  }

  /* ── W7: delete-service شکست → ROLLBACK + انتشار ── */
  {
    const pool = fakePool('DELETE FROM attendance');
    db.__setPoolForTests(pool);
    const store = { attendance: [{ id: 9, school_id: 1, version: 1 }], tombstones: [] };
    const outbox = createOutbox({ store, db });
    const deleter = createDeleteService({ store, db, markDirty: () => {}, outbox });
    let threw = false;
    try { await deleter.softDelete('attendance', { id: 9 }, {}); }
    catch (e) { threw = true; }
    const c = pool.txClient();
    const st = txStats(c.queries);
    chk('W7 delete: شکستِ تراکنش → ROLLBACK + throw (نه COMMIT)',
      threw && st.rollback === 1 && st.commit === 0, 'threw=' + threw + ' tx=' + JSON.stringify(st));
    db.__setPoolForTests(null);
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`wave1-writes: ${okc + failc} بررسی — ✅ ${okc} · ❌ ${failc}`);
  if (failc) process.exit(1);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

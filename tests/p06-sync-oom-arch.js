/* ─────────────────────────────────────────────────────────────
   p06-sync-oom-arch.js — P0-6: ریشه‌یابی OOM معماری sync
   ─────────────────────────────────────────────────────────────
   یافتهٔ کمّی Wave 18 §۵-۲/۵-۳: هر درخواستِ sync در PG-live کلِ
   کالکشنِ درگیر را clone می‌کرد (O(collection)؛ ~۱MB/درخواستِ هم‌زمان)
   و آینه/uidها بی‌سقف رشد می‌کردند (۱۰,۴۸۸B/نوشتن). این تست قفل می‌کند:

   U1  کانترکت سورس: undo-log حاضر؛ clone کل کالکشن حذف؛ سقف‌های
       PAYESH_PG_MIRROR_GROWTH_CAP / PAYESH_UID_DEDUP_MAX حاضرند
   U2  rollback رفتاریِ batch مخلوط (ins+upd+del) — دقیق، فیلد‌به‌فیلد،
       شامل unmarkUid و __server_version و __deleted_records و replay
   U3  سقف dedup: __processed_uids بعد از prune ≤ cap؛ پنجرهٔ اخیر
       سالم؛ duplicate_ignored هنوز کار می‌کند
   U4  سقف رشد آینه: بعد از ۳۰ نوشتن، رشدِ post-boot ≤ cap؛ رکوردهای
       اخیر موجود و قدیمی‌های رشد prune شده‌اند
   U5  کران کپی: در sync موفقِ روی آینهٔ ۳۰۰۰ رکوردی، هیچ
       JSON.stringify بزرگی (>&thinsp;200KB) رخ نمی‌دهد

   جهش‌ها (اجرای مستقیم این فایل با env P06_MUTATE=<id>):
   M1 حذف ثبتِ undo برای upd   M2 حذف فراخوانِ prune
   M3 حذف mirrorAppend در ins   M4 حذف uPush (ثبتِ undo برای push)

   اجرا: node tests/p06-sync-oom-arch.js
   ───────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const path = require('path');

/* جهش‌کشی: سورس sync.js را با یک تغییرِ هدفمند بازنویسی و require پاک می‌کنیم */
const MUT = process.env.P06_MUTATE || '';
if (MUT) {
  const real = path.join(__dirname, '..', 'server', 'sync.js');
  const src = fs.readFileSync(real, 'utf8');
  const mangled = path.join(__dirname, '..', 'server', 'sync.p06-mutated.js');
  const muts = {
    M1: [/const uRec = undo \? undo\.items\.push\(\{ k: 'rec'[\s\S]*?\}\) - 1 : -1;/g, 'const uRec = -1;'],
    M2: [/    pruneProcessedUids\(\);   \/\* P0-6[^*]*\*\//, ''],
    M3: [/mirrorAppend\(op\.c, data\);/, 'store[op.c].push(data);'],
    M5: [/&& u\.after && JSON\.stringify\(r\) === JSON\.stringify\(u\.after\)/, ''],
    M6: [/if\(Array\.isArray\(store\.__deleted_records\) && store\.__deleted_records\.length > 5000\)\{[\s\S]*?\}/, ''],
    M4: [/if\(!ex\) uPush\(op\.c, data\);/, ''],
    /* عینِ خطرِ واقعیِ var مانده: در op برخوردی هم مدخلِ pop با رکوردِ واقعیِ ex
       ساخته می‌شود (after دقیقاً state است → مچ می‌شود و rollback رکورد را حذف می‌کند) */
    M7: [/if\(!ex\) uPush\(op\.c, data\);/, 'uPush(op.c, ex || data);'],
    M8: [/if\(pgHas\) store\[u\.c\]\.push\(u\.rec\);/, 'store[u.c].push(u.rec);'],
    M9: [/dr\.indexOf\(u\.ref\)/, 'dr.findIndex((x) => x && x.id === u.id)'],
    /* P1-2: */
    N1: [/    \/\* P1-2 \(Wave 18 §۵-۳\): قطعِ آینه از مسیرِ نوشتن در PG-live[\s\S]*?\n    \}\n/, ''],
    N2: [/if\(u\.k !== 'pop' \|\| safeSet\.indexOf\(u\.c\) !== -1\) continue;/, "if(u.k !== 'pop') continue;"],
    N3: [/    \/\* P1-2: اول TTL[\s\S]*?\n    \}/, ''],
    /* بازبین دور ۱ #124: */
    N4: [/(function uidDedupTtlMs\(\)\{)[\s\S]*?if\(!\(db && typeof db\.isPostgres === 'function' && db\.isPostgres\(\)\)\) return 0;/, '$1'],
    N5: [/uPush\('sync_conflicts', mirrorAppend\('sync_conflicts', cf\)\);/, 'store.sync_conflicts.push(cf);'],
    N6: [/      if\(undo && undo\.items\.length\) await rollbackUndo\(\);\n/, ''],
    N7: [/idx: store\[c\]\.length - 1,\n            after: JSON\.parse\(JSON\.stringify\(row\)\) \}\);/, 'idx: store[c].length - 1 });'],
  };
  if (!muts[MUT]) { console.error('جهش ناشناخته: ' + MUT); process.exit(2); }
  fs.writeFileSync(mangled, src.replace(muts[MUT][0], muts[MUT][1]));
  process.on('exit', () => { try { fs.unlinkSync(mangled); } catch (_) {} });
}

const { newDb } = require('pg-mem');
const db = require('../server/db.js');
const { createSync, attach } = require(MUT ? '../server/sync.p06-mutated.js' : '../server/sync.js');
const { createIds } = require('../server/ids.js');
const { opX } = require('./helpers/opx');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
async function quiet(fn) {
  const e0 = console.error; console.error = () => {};
  try { return await fn(); } finally { console.error = e0; }
}

function makeInstance(session) {
  const sess = session || { id: 5, role: 'manager', school_id: 1 };
  const store = {
    announcements: [], notifications: [], sync_conflicts: [],
    users: [{ id: 5, role: 'manager', school_id: 1, full_name: 'M', active: true }],
    __deleted_records: [], __processed_uids: {}, __server_version: 7
  };
  const audits = [];
  const ids = createIds({ db, cache: null });
  const sync = createSync({
    store, db, ids, MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: (ev, d) => audits.push({ ev, d }),
    sessionFrom: async () => sess,
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    markDirty: () => {}
  });
  return { store, audits, sync };
}
async function apiSyncOf(inst, ops) {
  attach(inst.store);
  const res = {};
  await inst.sync.apiSync({}, res, { ops });
  return (res._cap || {});
}

(async () => {
  console.log('\n▸ P0-6 — معماریٔ OOM مسیر sync (undo-log + سقف‌ها)');

  /* ══ U1 — کانترکت سورس ══ */
  const srcPath = path.join(__dirname, '..', 'server', 'sync.js');
  const src = fs.readFileSync(srcPath, 'utf8');
  chk('U1a undo-log به‌جای snapshot (سازندهٔ journal: bumps + items)',
    /\{ bumps: 0, items: \[\] \}/.test(src));
  chk('U1b clone کل کالکشن در مسیر sync حذف شد',
    !/=\s*JSON\.parse\(JSON\.stringify\(store\[k\]/.test(src)
    && !/snap\[k\]/.test(src));
  chk('U1c rollback با undo runner (k:pop/rec/reinsert/unmarkUid)',
    /k === 'pop'/.test(src) && /k === 'rec'/.test(src) && /k === 'reinsert'/.test(src) && /k === 'unmarkUid'/.test(src));
  chk('U1d سقف رشد آینه (env + mirrorAppend)',
    /PAYESH_PG_MIRROR_GROWTH_CAP/.test(src) && /function mirrorAppend/.test(src));
  chk('U1e سقف dedup (env + pruneProcessedUids)',
    /PAYESH_UID_DEDUP_MAX/.test(src) && /function pruneProcessedUids/.test(src));

  /* ══ PG مشترک (pg-mem) ══ */
  const pg = newDb();
  try {
    pg.public.registerFunction({
      name: 'pg_get_serial_sequence', args: ['text', 'text'], returns: 'text',
      implementation: () => null
    });
  } catch (e) {}
  const { Pool } = pg.adapters.createPg();
  const pool = new Pool();
  await pool.query(`CREATE TABLE announcements
    (id INTEGER PRIMARY KEY, school_id INTEGER, title TEXT, body TEXT,
     scope TEXT, version INTEGER, updated_at TEXT, created_at TEXT)`);
  await pool.query(`CREATE TABLE notifications
    (id INTEGER PRIMARY KEY, school_id INTEGER, user_id INTEGER, type TEXT,
     title TEXT, body TEXT, link TEXT, "read" INTEGER, created_at TEXT)`);
  await pool.query('CREATE TABLE users (id INTEGER PRIMARY KEY)');
  await pool.query('CREATE TABLE sync_conflicts (id INTEGER PRIMARY KEY)');
  for (const s of ['users', 'announcements', 'notifications'])
    await pool.query('CREATE SEQUENCE payesh_' + s + '_id_seq');
  /* fail کنترل‌شده: pg-mem با DROP TABLE ایندکس pkey را نگه می‌دارد و CREATE
     مجدد نمی‌شود؛ به‌جایش پرچمِ pgDown اولین کوئری (یعنی BEGIN آینه) را می‌اندازد. */
  let pgDown = false;
  const origQuery = pool.query.bind(pool);
  pool.query = (...args) => (pgDown ? Promise.reject(new Error('pg down (p06 test)')) : origQuery(...args));
  db.__setPoolForTests(pool);
  chk('U1f pool تزریق شد: PG-live فعال', db.isPostgres() === true);

  /* ══ U2 — rollback رفتاری batch مخلوط ══ */
  const A = makeInstance();
  /* seed: دو رکورد موجود (یکی برای upd، یکی برای del) */
  A.store.announcements.push(
    { id: 101, school_id: 1, title: 'برای-تغییر', body: 'اصلی', version: 1 },
    { id: 102, school_id: 1, title: 'برای-حذف', body: 'قربانی', version: 1 });
  await pool.query(`INSERT INTO announcements (id, school_id, title, body, version)
    VALUES (101, 1, 'برای-تغییر', 'اصلی', 1), (102, 1, 'برای-حذف', 'قربانی', 1)`);
  const beforeLen = A.store.announcements.length;
  const beforeVer = A.store.__server_version;
  const beforeDelRec = A.store.__deleted_records.length;

  pgDown = true;   /* mirror از این‌جا به بعد fail — کوئری‌های قبل از آینه از store خوانده می‌شوند */
  const cap2 = await quiet(() => apiSyncOf(A, [
    opX({ uid: 'u2-ins', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1,
      data: { school_id: 1, title: 'تازه' } }),
    opX({ uid: 'u2-upd', by: 5, collection: 'announcements', type: 'upd', user_id: 5, school_id: 1,
      id: 101, data: { school_id: 1, title: 'تغییر‌یافته', body: 'دست‌کاری' } }),
    opX({ uid: 'u2-del', by: 5, collection: 'announcements', type: 'del', user_id: 5, school_id: 1,
      id: 102, data: { school_id: 1 } })
  ]));
  chk('U2a شکست آینه: 503 + sync_mirror_failed', cap2.code === 503 && cap2.body.code === 'sync_mirror_failed');
  chk('U2b طول آرایه بازگشت (ins حذف شد)',
    A.store.announcements.length === beforeLen, 'n=' + A.store.announcements.length);
  const r101 = A.store.announcements.find(x => x.id === 101);
  chk('U2c upd دقیق rollback شد (فیلد‌به‌فیلد)',
    r101 && r101.title === 'برای-تغییر' && r101.body === 'اصلی' && r101.version === 1,
    JSON.stringify(r101));
  const r102 = A.store.announcements.find(x => x.id === 102);
  chk('U2d del rollback شد (reinsert)', r102 && r102.title === 'برای-حذف');
  chk('U2e __deleted_records بازگشت', A.store.__deleted_records.length === beforeDelRec);
  chk('U2f uidها unmark شدند (قابلِ replay)',
    !A.store.__processed_uids['u2-ins'] && !A.store.__processed_uids['u2-upd'] && !A.store.__processed_uids['u2-del']);
  chk('U2g __server_version بازگشت', A.store.__server_version === beforeVer,
    'v=' + A.store.__server_version);
  /* بازیابی PG و replay موفق — هر سه op یک‌بار اعمال شوند */
  pgDown = false;
  const cap2b = await quiet(() => apiSyncOf(A, [
    opX({ uid: 'u2-ins', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1,
      data: { school_id: 1, title: 'تازه' } }),
    opX({ uid: 'u2-upd', by: 5, collection: 'announcements', type: 'upd', user_id: 5, school_id: 1,
      id: 101, data: { school_id: 1, title: 'تغییر‌یافته', body: 'دست‌کاری' } }),
    opX({ uid: 'u2-del', by: 5, collection: 'announcements', type: 'del', user_id: 5, school_id: 1,
      id: 102, data: { school_id: 1 } })
  ]));
  chk('U2h replay پس از رفع خطا: ۲۰۰ و هر سه op ok',
    cap2b.code === 200 && cap2b.body.results.every(r => r.ok === true),
    JSON.stringify(cap2b.body && cap2b.body.results));
  const r101b = A.store.announcements.find(x => x.id === 101);
  const r102b = A.store.announcements.find(x => x.id === 102);
  /* P1-2: مجموعهٔ خارجِ لیستِ سفید پس از commit از آینه بریده می‌شود —
     اعمالِ نهایی را مرجع (PG) می‌سنجیم، نه آینه را */
  const insCountPg = (await pool.query("SELECT count(*)::int AS n FROM announcements WHERE title = 'تازه'")).rows[0].n;
  const insCountMirror = A.store.announcements.filter(x => x.title === 'تازه').length;
  chk('U2i اعمالِ نهایی صحیح: upd زد، del برد، ins یک‌بار (در PG؛ آینه بریده شد — P1-2)',
    r101b && r101b.title === 'تغییر‌یافته' && !r102b && insCountPg === 1 && insCountMirror === 0,
    'pg=' + insCountPg + ' mirror=' + insCountMirror);

  /* ══ U3 — سقف dedup uid ══ */
  const B = makeInstance();
  const CAP3 = 8;
  process.env.PAYESH_UID_DEDUP_MAX = String(CAP3);
  for (let i = 0; i < 30; i++) {
    await quiet(() => apiSyncOf(B, [opX({ uid: 'u3-' + i, by: 5, collection: 'announcements',
      type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'p-' + i } })]));
  }
  const puKeys = Object.keys(B.store.__processed_uids);
  chk('U3a __processed_uids سقف‌دار (≤ ' + CAP3 + ')', puKeys.length <= CAP3, 'n=' + puKeys.length);
  chk('U3b پنجرهٔ اخیر سالم است (آخرین uid علامت خورده)',
    !!B.store.__processed_uids['u3-29'], 'keys=' + puKeys.slice(-4).join(','));
  const cap3 = await quiet(() => apiSyncOf(B, [opX({ uid: 'u3-29', by: 5, collection: 'announcements',
    type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'dup' } })]));
  chk('U3c duplicate_ignored برای uid تازه هنوز کار می‌کند',
    cap3.code === 200 && cap3.body.results[0].code === 'duplicate_ignored',
    JSON.stringify(cap3.body && cap3.body.results));
  delete process.env.PAYESH_UID_DEDUP_MAX;

  /* ══ U4 — سقف رشد آینه ══ */
  const C = makeInstance();
  const CAP4 = 8;
  process.env.PAYESH_PG_MIRROR_GROWTH_CAP = String(CAP4);
  process.env.PAYESH_PG_MIRROR_PRUNE_SAFE = 'announcements';   /* باگ ۱: هرس فقط با لیست سفید */
  for (let i = 0; i < 30; i++) {
    await quiet(() => apiSyncOf(C, [opX({ uid: 'u4-' + i, by: 5, collection: 'announcements',
      type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'g-' + i } })]));
  }
  const grown = C.store.announcements.filter(x => x.title && x.title.startsWith('g-')).length;
  chk('U4a رشد آینه پس از ۳۰ نوشتن ≤ سقف (~' + CAP4 + ')', grown <= CAP4 + 2, 'grown=' + grown);
  chk('U4b رکوردهای اخیر موجودند (آخرین نوشتن در آینه)',
    C.store.announcements.some(x => x.title === 'g-29'));
  chk('U4c قدیمی‌های رشد prune شدند',
    !C.store.announcements.some(x => x.title === 'g-0') && !C.store.announcements.some(x => x.title === 'g-1'));
  delete process.env.PAYESH_PG_MIRROR_GROWTH_CAP;
  delete process.env.PAYESH_PG_MIRROR_PRUNE_SAFE;

  /* ══ U5 — کران کپی: sync موفق روی آینهٔ بزرگ بدون stringify بزرگ ══ */
  const D = makeInstance();
  for (let i = 0; i < 3000; i++)
    D.store.announcements.push({ id: 1000 + i, school_id: 1, title: 'seed-' + i, body: 'x'.repeat(40), version: 1 });
  const bigBefore = D.store.announcements.length;
  let bigStringifies = 0;
  const origStringify = JSON.stringify;
  JSON.stringify = function (...args) {
    const out = origStringify.apply(this, args);
    if (typeof out === 'string' && out.length > 200 * 1024) bigStringifies++;
    return out;
  };
  const cap5 = await quiet(() => apiSyncOf(D, [
    opX({ uid: 'u5-ins', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1,
      data: { school_id: 1, title: 'تازه-۵' } }),
    opX({ uid: 'u5-upd', by: 5, collection: 'announcements', type: 'upd', user_id: 5, school_id: 1,
      id: 1000, data: { school_id: 1, title: 'seed-0-تغییر' } })
  ]));
  JSON.stringify = origStringify;
  chk('U5a sync موفق روی آینهٔ ۳۰۰۰ رکوردی', cap5.code === 200 && cap5.body.results.every(r => r.ok === true));
  chk('U5b هیچ clone بزرگ (>200KB) رخ نداد — O(batch) نه O(collection)',
    bigStringifies === 0, 'big=' + bigStringifies);
  const u5insPg = (await pool.query("SELECT count(*)::int AS n FROM announcements WHERE title = 'تازه-۵'")).rows[0].n;
  chk('U5c اعمال شد (ins+upd): اعمال در PG، آینهٔ بدونِ رشد (P1-2)',
    D.store.announcements.length === bigBefore
    && D.store.announcements.find(x => x.id === 1000).title === 'seed-0-تغییر'
    && u5insPg === 1,
    'len=' + D.store.announcements.length + ' (انتظار ' + bigBefore + ') pg-ins=' + u5insPg);

  /* ══ U6 — باگ ۳ بازبین: rollback نباید سنگ‌قبری گم کند (برش = post-commit) ══ */
  const F = makeInstance();
  F.store.announcements.push({ id: 301, school_id: 1, title: 'قربانی-۶', version: 1 });
  await pool.query(`INSERT INTO announcements (id, school_id, title, body, version) VALUES (301, 1, 'قربانی-۶', 'x', 1)`);
  const seed5000 = [];
  for (let i = 0; i < 5000; i++) seed5000.push({ c: 'grades', id: 900000 + i, school_id: 1, at: '2026-09-01T00:00:00Z' });
  F.store.__deleted_records = JSON.parse(JSON.stringify(seed5000));
  const drBefore = JSON.stringify(F.store.__deleted_records);
  pgDown = true;
  const cap6 = await quiet(() => apiSyncOf(F, [opX({ uid: 'u6-del', by: 5, collection: 'announcements',
    type: 'del', user_id: 5, school_id: 1, id: 301, data: { school_id: 1 } })]));
  chk('U6a حذفِ ناموفق: 503', cap6.code === 503);
  chk('U6b آرایهٔ سنگ‌قبرها دقیقاً به قبل بازگشت (۵۰۰۰ عضو، مقایسهٔ کامل)',
    JSON.stringify(F.store.__deleted_records) === drBefore,
    'n=' + F.store.__deleted_records.length);
  pgDown = false;
  const cap6b = await quiet(() => apiSyncOf(F, [opX({ uid: 'u6-del2', by: 5, collection: 'announcements',
    type: 'del', user_id: 5, school_id: 1, id: 301, data: { school_id: 1 } })]));
  chk('U6c حذفِ موفق: ۲۰۰ و برشِ post-commit آرایه را در ۵۰۰۰ نگه داشت',
    cap6b.code === 200 && F.store.__deleted_records.length === 5000
    && F.store.__deleted_records.some(x => x.id === 301),
    'n=' + F.store.__deleted_records.length);

  /* ══ U7 — باگ ۲ بازبین: rollback نباید تغییرِ هم‌زمانِ موفقِ درخواستِ دیگر را پاک کند ══ */
  const E = makeInstance();
  E.store.announcements.push({ id: 200, school_id: 1, title: 'اصلی', body: 'v0', version: 1 });
  await pool.query(`INSERT INTO announcements (id, school_id, title, body, version) VALUES (200, 1, 'اصلی', 'v0', 1)`);
  const v0 = E.store.__server_version;
  /* wrapper: اولین BEGIN (پیشانیِ persistOpsBatch دستهٔ A) → اول B کامل اجرا می‌شود
     (موفق)، سپس برای A خطا. fired تضمین می‌کند کوئری‌های B مستقیم بروند. */
  const wrappedQuery = pool.query;
  let inter = { fired: false, fn: null };
  pool.query = async (...args) => {
    if (inter.fn && !inter.fired && String(args[0]).indexOf('BEGIN') === 0) {
      inter.fired = true;
      const fn = inter.fn; inter.fn = null;
      await fn();
      throw new Error('pg down (A mirror — U7)');
    }
    return wrappedQuery(...args);
  };
  inter.fn = async () => {
    await quiet(() => apiSyncOf(E, [opX({ uid: 'u7-B', by: 5, collection: 'announcements',
      type: 'upd', user_id: 5, school_id: 1, id: 200, data: { school_id: 1, title: 'پیروزی-ب' } })]));
  };
  const cap7 = await quiet(() => apiSyncOf(E, [opX({ uid: 'u7-A', by: 5, collection: 'announcements',
    type: 'upd', user_id: 5, school_id: 1, id: 200, data: { school_id: 1, title: 'شکست-آ' } })]));
  pool.query = wrappedQuery;   /* برگرداندن wrapper برای ادامهٔ تست */
  chk('U7a دستهٔ A (شکستِ آینه): 503', cap7.code === 503);
  const r200 = E.store.announcements.find(x => x.id === 200);
  chk('U7b تغییرِ موفقِ هم‌زمانِ B حفظ شد (آینه با PG هم‌گام)',
    r200 && r200.title === 'پیروزی-ب', JSON.stringify(r200 && r200.title));
  chk('U7c __server_version فقط افزایش‌های A معکوس شد (سهم B ماند)',
    E.store.__server_version === v0 + 1, 'v=' + E.store.__server_version + ' (انتظار ' + (v0 + 1) + ')');
  const pg200 = (await pool.query('SELECT * FROM announcements WHERE id = 200')).rows[0];
  chk('U7d رکورد PG دست‌نخورده ماند (مرجع)',
    pg200 && pg200.title === 'پیروزی-ب', JSON.stringify(pg200 && pg200.title));

  /* ══ U8 — باگ ۱ بازبین: هرس فقط لیست سفید؛ مجوزِ والد پس از عبور از سقف سالم ══ */
  /* بدون لیست سفید: هیچ هرسی — آینه کامل می‌ماند (مجموعه‌های مجوزی مصون) */
  const G = makeInstance();
  const CAP8 = 4;
  process.env.PAYESH_PG_MIRROR_GROWTH_CAP = String(CAP8);
  for (let i = 0; i < 12; i++) {
    await quiet(() => apiSyncOf(G, [opX({ uid: 'u8-' + i, by: 5, collection: 'announcements',
      type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'ns-' + i } })]));
  }
  /* P1-2 (Wave 18 §۵-۳): بدون لیست سفید، مجموعه از مسیرِ نوشتن بریده می‌شود —
     رشدِ آینه = صفر؛ داده در PG کامل است؛ seed/آینهٔ موجود دست‌نخورده می‌ماند
     (برشِ نهفته نیست: فقط تازه‌ها وارد نمی‌شوند) */
  const u8aPg = (await pool.query("SELECT count(*)::int AS n FROM announcements WHERE title LIKE 'ns-%'")).rows[0].n;
  chk('U8a بدون لیست سفید: آینه پس از ۱۲ نوشتن رشد نکرد (قطع از مسیر نوشتن) و داده کامل در PG است',
    G.store.announcements.filter(x => x.title && x.title.startsWith('ns-')).length === 0
    && G.store.users.length === 1 && u8aPg === 12,
    'mirror=' + G.store.announcements.filter(x => x.title && x.title.startsWith('ns-')).length + ' pg=' + u8aPg);
  /* با لیست سفید: هرس فقط همان مجموعه؛ نوشتنِ والد روی رابطهٔ هرس‌نشده موفق */
  const H = makeInstance({ id: 9, role: 'parent', school_id: 1 });
  H.store.users.push(
    { id: 9, role: 'parent', school_id: 1, full_name: 'والد', active: true },
    { id: 10, role: 'student', school_id: 1, full_name: 'فرزند', active: true });
  H.store.parent_links = [{ id: 1, parent_id: 9, student_id: 10, relation: 'پدر' }];
  process.env.PAYESH_PG_MIRROR_PRUNE_SAFE = 'announcements';
  for (let i = 0; i < 12; i++) {
    await quiet(() => apiSyncOf(H, [opX({ uid: 'u8h-' + i, by: 9, collection: 'announcements',
      type: 'ins', user_id: 9, school_id: 1, data: { school_id: 1, title: 'h-' + i } })]));
  }
  const hGrown = H.store.announcements.filter(x => x.title && x.title.startsWith('h-')).length;
  chk('U8b با لیست سفید، فقط مجموعهٔ لیست‌شده هرس شد (≤ ' + (CAP8 + 2) + ')',
    hGrown <= CAP8 + 2, 'grown=' + hGrown);
  /* نوشتن والد (leaves) پس از عبور از سقف — روابط مجوز (parent_links/users) هرس‌نشده */
  await pool.query(`CREATE TABLE IF NOT EXISTS leaves
    (id INTEGER PRIMARY KEY, school_id INTEGER, student_id INTEGER, status TEXT,
     from_date TEXT, to_date TEXT, version INTEGER, updated_at TEXT, created_at TEXT)`);
  const cap8 = await quiet(() => apiSyncOf(H, [opX({ uid: 'u8-leave', by: 9, collection: 'leaves',
    type: 'ins', user_id: 9, school_id: 1,
    data: { school_id: 1, student_id: 10, from_date: '2026-09-13', to_date: '2026-09-14', status: 'pending' } })]));
  chk('U8c نوشتنِ والد روی رابطهٔ فرزند پس از عبور از سقف موفق است (باگ ۱ رفع)',
    cap8.code === 200 && cap8.body.results[0].ok === true,
    JSON.stringify(cap8.body && cap8.body.results));
  delete process.env.PAYESH_PG_MIRROR_GROWTH_CAP;
  delete process.env.PAYESH_PG_MIRROR_PRUNE_SAFE;

  /* ══ U9 — باگ ۱ (بازبین، دور ۲): var مانده → uPush تکراری/نامالک در درج برخوردی ══
     P1-2: این سناریو روی آینهٔ پُر بنا شده (seed sync اول باید در آینه بماند تا
     op برخوردی از مسیرِ ex برود) — با لیستِ سفید write-through اجرا می‌شود. */
  process.env.PAYESH_PG_MIRROR_PRUNE_SAFE = 'announcements';
  const H2 = makeInstance();
  await quiet(() => apiSyncOf(H2, [opX({ uid: 'u9-seed', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1,
    data: { school_id: 1, id: 55, title: 'پایه' } })]));
  const v9 = H2.store.__server_version;
  chk('U9a فیکس در کد است: uPush فقط برای درجِ خودِ op (var حذف شد)',
    src.indexOf('if(!ex) uPush(op.c, data);') !== -1 && src.indexOf('var insRec') === -1);
  pgDown = true;
  const cap9 = await quiet(() => apiSyncOf(H2, [
    opX({ uid: 'u9-a', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1,
      data: { school_id: 1, title: 'درج-جدید' } }),
    opX({ uid: 'u9-b', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1,
      data: { school_id: 1, id: 55, title: 'برخوردی' } }),
  ]));
  pgDown = false;
  const r55 = H2.store.announcements.find(x => x.id === 55);
  chk('U9b دستهٔ [ins + ins برخوردی]: شکست آینه ⇒ 503', cap9.code === 503);
  chk('U9c رکورد برخوردشده به before بازگشت (مدخلِ تکراریِ pop او را حذف نمی‌کند)',
    r55 && r55.title === 'پایه', JSON.stringify(r55 && r55.title));
  chk('U9d رکوردِ درجِ همین دسته rollback شد (فقط 55 ماند)',
    H2.store.announcements.filter(x => x.id !== 55).length === 0);
  chk('U9e version فقط bumps همین دسته کم شد (سهم sync موفق اول ماند)',
    H2.store.__server_version === v9, 'v=' + H2.store.__server_version + ' (انتظار ' + v9 + ')');
  delete process.env.PAYESH_PG_MIRROR_PRUNE_SAFE;

  /* ══ U10 — باگ ۲ (بازبین، دور ۲): reinsert بی‌قید، حذفِ قطعی‌شدهٔ دیگری را زنده می‌کند ══ */
  const E2 = makeInstance();
  E2.store.announcements.push({ id: 210, school_id: 1, title: 'reinsert-q', version: 1 });
  await pool.query(`INSERT INTO announcements (id, school_id, title, version) VALUES (210, 1, 'reinsert-q', 1)`);
  const wrap10 = pool.query;
  let inter10 = { fired: false, fn: null };
  pool.query = async (...args) => {
    if(inter10.fn && !inter10.fired && String(args[0]).indexOf('BEGIN') === 0){
      inter10.fired = true;
      const fn = inter10.fn; inter10.fn = null;
      await fn();
      throw new Error('pg down (A mirror — U10)');
    }
    return wrap10(...args);
  };
  inter10.fn = async () => {   /* ب: همان حذف را کامل و commit می‌کند */
    await quiet(() => apiSyncOf(E2, [opX({ uid: 'u10-B', by: 5, collection: 'announcements', type: 'del', user_id: 5, school_id: 1, id: 210, data: { school_id: 1 } })]));
  };
  const cap10 = await quiet(() => apiSyncOf(E2, [opX({ uid: 'u10-A', by: 5, collection: 'announcements', type: 'del', user_id: 5, school_id: 1, id: 210, data: { school_id: 1 } })]));
  pool.query = wrap10;
  const pgHas200 = (await pool.query('SELECT count(*)::int AS n FROM announcements WHERE id = 210')).rows[0].n;
  chk('U10a حذفِ هم‌زمانِ ب قطعی شد؛ شکست آینهٔ الف ⇒ 503', cap10.code === 503);
  chk('U10b rollbackِ الف رکوردِ حذف‌شدهٔ قطعیِ ب را زنده نکرد (آینه با PG سازگار)',
    !E2.store.announcements.some(x => x.id === 210) && pgHas200 === 0);
  /* حالت معکوس: بدون commitِ دیگری، reinsert باید انجام شود (PG هم پایین است → هیچ هم‌زمانی ممکن نبوده) */
  const F2 = makeInstance();
  F2.store.announcements.push({ id: 211, school_id: 1, title: 'reinsert-r', version: 1 });
  await pool.query(`INSERT INTO announcements (id, school_id, title, version) VALUES (211, 1, 'reinsert-r', 1)`);
  pgDown = true;
  const cap10b = await quiet(() => apiSyncOf(F2, [opX({ uid: 'u10b', by: 5, collection: 'announcements', type: 'del', user_id: 5, school_id: 1, id: 211, data: { school_id: 1 } })]));
  pgDown = false;
  chk('U10c بدونِ هم‌زمانی: rollback رکورد را بازدرج کرد (reinsert معتبر)',
    cap10b.code === 503 && F2.store.announcements.some(x => x.id === 211));

  /* ══ U11 — باگ ۳ (بازبین، دور ۲): popDelRec با id تنها، سنگ‌قبرِ مجموعهٔ دیگر را می‌پاکید ══ */
  const G2 = makeInstance();
  G2.store.announcements.push(
    { id: 90042, school_id: 1, title: 'قربانی-الف', version: 1 },
    { id: 90043, school_id: 1, title: 'قربانی-ب', version: 1 });
  await pool.query(`INSERT INTO announcements (id, school_id, title, version) VALUES (90042, 1, 'قربانی-الف', 1), (90043, 1, 'قربانی-ب', 1)`);
  const seedTomb = [];
  for(let i = 0; i < 5000; i++) seedTomb.push({ c: 'grades', id: 600 + i, school_id: 1, at: '2026-09-01T00:00:00Z' });
  seedTomb[3] = { c: 'grades', id: 90042, school_id: 1, at: '2026-08-01T00:00:00Z' };   /* هم‌شناسه با tomb الف — دشمن */
  G2.store.__deleted_records = seedTomb;
  const wrap11 = pool.query;
  let inter11 = { fired: false, fn: null };
  pool.query = async (...args) => {
    if(inter11.fn && !inter11.fired && String(args[0]).indexOf('BEGIN') === 0){
      inter11.fired = true;
      const fn = inter11.fn; inter11.fn = null;
      await fn();
      throw new Error('pg down (A mirror — U11)');
    }
    return wrap11(...args);
  };
  inter11.fn = async () => {   /* ب: حذفِ دیگر + commit → برشِ post-commit جایگاه‌ها را می‌جابه‌جا کند */
    await quiet(() => apiSyncOf(G2, [opX({ uid: 'u11-B', by: 5, collection: 'announcements', type: 'del', user_id: 5, school_id: 1, id: 90043, data: { school_id: 1 } })]));
  };
  const cap11 = await quiet(() => apiSyncOf(G2, [opX({ uid: 'u11-A', by: 5, collection: 'announcements', type: 'del', user_id: 5, school_id: 1, id: 90042, data: { school_id: 1 } })]));
  pool.query = wrap11;
  const dr11 = G2.store.__deleted_records;
  chk('U11a حذفِ الف شکست خورد ⇒ 503', cap11.code === 503);
  chk('U11b سنگ‌قبرِ هم‌شناسهٔ مجموعهٔ دیگر (grades:90042) ماند',
    dr11.some(x => x.c === 'grades' && x.id === 90042));
  chk('U11c سنگ‌قبرِ خودِ الف (announcements:90042) دقیقاً حذف شد',
    !dr11.some(x => x.c === 'announcements' && x.id === 90042));
  chk('U11d سنگ‌قبرِ حذفِ موفقِ ب (announcements:90043) ماند',
    dr11.some(x => x.c === 'announcements' && x.id === 90043));
  /* ۵۰۰۰ (برشِ ب) منهایِ tomb الف که rollback شد = ۴۹۹۹؛ سنگ‌قبرِ الف هرگز commit نشد */
  chk('U11e شمارش دقیق: ۵۰۰۰ (برشِ ب) − ۱ (tomb الف) = ۴۹۹۹', dr11.length === 4999, 'n=' + dr11.length);

  /* ════════════════════════════════════════════════════════════════════
     V — P1-2 (Wave 18 §۵-۳ بند ۳): قطعِ آینه از مسیرِ نوشتن در PG-live
     مجموعهٔ غیرِ لیست‌سفید = cacheیِ bounded: پس از commitِ موفق به
     آینهٔ پیش از دسته بازمی‌گردد؛ رکورد فقط در PG (مرجع). whitelist =
     write-through (رفتارِ پیشین). dedup با TTL + سقف.
     ════════════════════════════════════════════════════════════════════ */

  /* ══ V1 — blocked بین‌دسته‌ای: هر دسته پس از commit بریده می‌شود، نه فقط آخرین ══ */
  const P1 = makeInstance();
  await quiet(() => apiSyncOf(P1, [
    opX({ uid: 'v1-a1', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v1-1' } }),
    opX({ uid: 'v1-a2', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v1-2' } }),
    opX({ uid: 'v1-a3', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v1-3' } })]));
  await quiet(() => apiSyncOf(P1, [
    opX({ uid: 'v1-b1', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v1-4' } }),
    opX({ uid: 'v1-b2', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v1-5' } })]));
  const v1pg = (await pool.query("SELECT count(*)::int AS n FROM announcements WHERE title LIKE 'v1-%'")).rows[0].n;
  chk('V1 بدونِ لیستِ سفید: پس از ۲ دستهٔ موفق، رشدِ آینه = صفر و دادهٔ کامل در PG',
    P1.store.announcements.length === 0 && v1pg === 5,
    'mirror=' + P1.store.announcements.length + ' pg=' + v1pg);

  /* ══ V2 — درونِ دسته و درجِ id-دارِ موجود در PG روی آینهٔ سرد (هیدراتاسیون ⇒ مسیرِ ex، نه شکست) ══ */
  await pool.query(`INSERT INTO announcements (id, school_id, title, version) VALUES (701, 1, 'v2-پایه', 1)`);
  const P2 = makeInstance();   /* آینهٔ سرد: 701 در PG هست، در آینه نیست */
  const cap2v = await quiet(() => apiSyncOf(P2, [
    opX({ uid: 'v2-ins', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, id: 701, title: 'v2-برخوردی' } }),
    opX({ uid: 'v2-upd', by: 5, collection: 'announcements', type: 'upd', user_id: 5, school_id: 1, id: 701, data: { school_id: 1, title: 'v2-نهایی' } })]));
  const v2row = (await pool.query('SELECT title FROM announcements WHERE id = 701')).rows[0];
  chk('V2 دستهٔ [ins با id موجود در PG، upd همان]: موفق و اعمال در مرجع، آینه پس از commit بدونِ رکورد',
    cap2v.code === 200 && cap2v.body.results.every(r => r.ok === true)
    && v2row && v2row.title === 'v2-نهایی'
    && !P2.store.announcements.some(x => x.id === 701),
    'code=' + cap2v.code + ' pg=' + JSON.stringify(v2row && v2row.title) + ' mirror-has-701=' + P2.store.announcements.some(x => x.id === 701));

  /* ══ V3 — whitelist = write-through: رکورد پس از commit در آینه می‌ماند ══ */
  process.env.PAYESH_PG_MIRROR_PRUNE_SAFE = 'announcements';
  const P3 = makeInstance();
  await quiet(() => apiSyncOf(P3, [
    opX({ uid: 'v3-a', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v3-x' } }),
    opX({ uid: 'v3-b', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v3-y' } })]));
  const v3pg = (await pool.query("SELECT count(*)::int AS n FROM announcements WHERE title LIKE 'v3-%'")).rows[0].n;
  chk('V3 لیستِ سفید: write-through — رکورد در آینه ماند و در PG هم هست',
    P3.store.announcements.filter(x => x.title && x.title.startsWith('v3-')).length === 2 && v3pg === 2,
    'mirror=' + P3.store.announcements.filter(x => x.title && x.title.startsWith('v3-')).length + ' pg=' + v3pg);
  delete process.env.PAYESH_PG_MIRROR_PRUNE_SAFE;

  /* ══ V4 — rollbackِ دستهٔ شکست‌خورده در حالتِ blocked (رفتارِ دور ۲ دست‌نخورده) ══ */
  const P4 = makeInstance();
  pgDown = true;
  const cap4v = await quiet(() => apiSyncOf(P4, [
    opX({ uid: 'v4-a', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v4-z' } })]));
  pgDown = false;
  chk('V4 شکستِ PG در حالتِ blocked: 503 + آینه به پیش از دسته (rollback کامل)',
    cap4v.code === 503 && P4.store.announcements.length === 0 && !P4.store.__processed_uids['v4-a'],
    'code=' + cap4v.code + ' mirror=' + P4.store.announcements.length);

  /* ══ V5 — هیدراتاسیونِ findForApply هم بریده می‌شود (upd از PG، آینه پس از commit خالی) ══ */
  await pool.query(`INSERT INTO announcements (id, school_id, title, version) VALUES (505, 1, 'v5-کهنه', 1)`);
  const P5 = makeInstance();
  const cap5v = await quiet(() => apiSyncOf(P5, [
    opX({ uid: 'v5-upd', by: 5, collection: 'announcements', type: 'upd', user_id: 5, school_id: 1, id: 505, data: { school_id: 1, title: 'v5-تازه' } })]));
  const v5row = (await pool.query('SELECT title FROM announcements WHERE id = 505')).rows[0];
  chk('V5 upd روی رکوردِ فقط-PG (بدون آینه): موفق در مرجع؛ ردیفِ هیدراته‌شده پس از commit از آینه رفت',
    cap5v.code === 200 && v5row && v5row.title === 'v5-تازه'
    && !P5.store.announcements.some(x => x.id === 505),
    'code=' + cap5v.code + ' pg=' + JSON.stringify(v5row && v5row.title) + ' mirror-has-505=' + P5.store.announcements.some(x => x.id === 505));

  /* ══ V6 — dedup با TTL: uidهای بیرونِ پنجره پس از sync بعدی جارو می‌شوند ══ */
  const P6 = makeInstance();
  P6.store.__processed_uids['v6-old'] = Date.now() - 2 * 3600 * 1000;   /* ۲ ساعت پیش */
  process.env.PAYESH_UID_DEDUP_TTL_MS = String(3600 * 1000);            /* پنجره: ۱ ساعت */
  await quiet(() => apiSyncOf(P6, [
    opX({ uid: 'v6-fresh', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v6-t' } })]));
  const pu6 = P6.store.__processed_uids;
  chk('V6 TTL: uid منقضی (۲h) جارو شد؛ uid همین دسته (تازه) در پنجره ماند',
    pu6['v6-old'] === undefined && typeof pu6['v6-fresh'] === 'number',
    'old=' + pu6['v6-old'] + ' fresh=' + pu6['v6-fresh']);
  delete process.env.PAYESH_UID_DEDUP_TTL_MS;

  /* ══ V7 — باگ ۱ (بازبین دور ۱ #124): TTL فقط در PG-live — در memory-mode،
     __processed_uids تنها مرجعِ idempotency است و TTL نمی‌سوزد ══ */
  db.__setPoolForTests(null);
  const P7 = makeInstance();
  const cap7a = await quiet(() => apiSyncOf(P7, [opX({ uid: 'v7-ok', by: 5, collection: 'announcements',
    type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v7-t' } })]));
  P7.store.__processed_uids['v7-old'] = Date.now() - 48 * 3600 * 1000;   /* ۴۸ ساعت پیش */
  await quiet(() => apiSyncOf(P7, [opX({ uid: 'v7-ok2', by: 5, collection: 'announcements',
    type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v7-t2' } })]));
  const cap7c = await quiet(() => apiSyncOf(P7, [opX({ uid: 'v7-old', by: 5, collection: 'announcements',
    type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'v7-replay' } })]));
  chk('V7 memory-mode: uid قدیمی (۴۸h) جارو نشد و replay آن duplicate_ignored ماند (TTL فقط PG-live)',
    cap7a.code === 200 && cap7c.code === 200
    && cap7c.body.results[0].ok === true && cap7c.body.results[0].code === 'duplicate_ignored'
    && typeof P7.store.__processed_uids['v7-old'] === 'number',
    JSON.stringify(cap7c.body && cap7c.body.results));
  db.__setPoolForTests(pool);

  /* ══ V8 — باگ ۲ (بازبین دور ۱ #124): صف تعارض سقف‌دار (mirrorAppend + هرس ring + resolve ⇒ del) ══ */
  process.env.PAYESH_PG_MIRROR_GROWTH_CAP = '5';
  const P8 = makeInstance();
  for(let i = 0; i < 12; i++){
    await quiet(() => apiSyncOf(P8, [opX({ uid: 'v8-ins-' + i, by: 5, collection: 'grades',
      type: 'ins', user_id: 5, school_id: 1,
      data: { school_id: 1, id: 800 + i, student_id: 9 + i, subject_id: 3, score: 10 } })]));
    const r8 = await quiet(() => apiSyncOf(P8, [opX({ uid: 'v8-upd-' + i, by: 5, collection: 'grades',
      type: 'upd', user_id: 5, school_id: 1, id: 800 + i, base_version: 99,
      data: { school_id: 1, score: 11 } })]));
    if(!r8 || r8.code !== 200) { chk('V8 پیش‌شرط تعارض ' + i, false, JSON.stringify(r8 && r8.body)); break; }
  }
  chk('V8a دوازده تعارض OCC → صفِ آینهٔ sync_conflicts سقف‌دار ماند (هرس ring از mirrorAppend)',
    P8.store.sync_conflicts.length >= 4 && P8.store.sync_conflicts.length <= 6
    && P8.store.sync_conflicts.every(x => x.status === 'open'),
    'len=' + P8.store.sync_conflicts.length);
  delete process.env.PAYESH_PG_MIRROR_GROWTH_CAP;
  /* resolve ⇒ del */
  const { createConflicts } = require('../server/conflicts.js');
  const confApi = createConflicts({ store: P8.store, db, audit: () => {},
    sessionFrom: async () => ({ id: 5, role: 'manager', school_id: 1 }),
    sendJson: (res, code, body) => { res._cap = { code, body }; }, markDirty: () => {} });
  const before8 = P8.store.sync_conflicts.length;
  const target8 = P8.store.sync_conflicts[0] && P8.store.sync_conflicts[0].id;
  const res8 = {}; await confApi.apiResolve({}, res8, { conflict_id: target8, winner: 'server' });
  chk('V8b resolve ⇒ del: تعارضِ داوری‌شده از صف حذف شد (پاسخ resolved برمی‌گردد)',
    res8._cap.code === 200 && res8._cap.body.ok === true
    && res8._cap.body.conflict.status === 'resolved'
    && !P8.store.sync_conflicts.some(x => x.id === target8)
    && P8.store.sync_conflicts.length === before8 - 1,
    'code=' + res8._cap.code + ' len=' + P8.store.sync_conflicts.length + '/' + before8);

  /* ══ V9 — باگ ۳ (بازبین دور ۱ #124): خروج زودهنگام هیچ اثرِ آینه‌ای نمی‌گذارد ══ */
  await pool.query(`INSERT INTO announcements (id, school_id, title, version) VALUES (801, 2, 'v9-مدرسه-دگر', 1)`);
  const P9 = makeInstance();
  const cap9a = await quiet(() => apiSyncOf(P9, [opX({ uid: 'v9-a', by: 5, collection: 'announcements',
    type: 'upd', user_id: 5, school_id: 1, id: 801, data: { title: 'v9-x' } })]));
  chk('V9a ردِ خارج از scope (id معتبرِ مدرسهٔ دیگر): 403 و آینه بدونِ رشد — هیدراتاسیونِ گِیت برگشت',
    cap9a.code === 403 && cap9a.body.code === 'out_of_scope' && P9.store.announcements.length === 0,
    'code=' + cap9a.code + ' mirror=' + P9.store.announcements.length);
  const pgB9 = (await pool.query('SELECT count(*)::int AS n FROM announcements')).rows[0].n;
  const cap9b = await quiet(() => apiSyncOf(P9, [
    opX({ uid: 'v9-b-ins', by: 5, collection: 'announcements', type: 'ins', user_id: 5, school_id: 1,
      data: { school_id: 1, title: 'v9-b' } }),
    opX({ uid: 'v9-b-upd', by: 5, collection: 'announcements', type: 'upd', user_id: 5, school_id: 1,
      id: 801, data: { title: 'v9-b2' } })]));
  const pgA9 = (await pool.query('SELECT count(*)::int AS n FROM announcements')).rows[0].n;
  chk('V9b ردِ پایِ زودهنگام کلِ دسته: آینه و PG به پیش از درخواست (insِ اعمال‌شدهٔ همان دسته هم برگشت)',
    cap9b.code === 403 && P9.store.announcements.length === 0 && pgA9 === pgB9,
    'code=' + cap9b.code + ' mirror=' + P9.store.announcements.length + ' pg=' + pgB9 + '→' + pgA9);
  await pool.query(`INSERT INTO announcements (id, school_id, title, version) VALUES (506, 1, 'v9-کهنه', 1)`);
  const P9c = makeInstance();
  /* pgDownِ ساده قبل از هیدراتاسیون می‌ایستد (readOne هم می‌میرد) — برایِ
     سنجشِ rollbackِ ردیفِ هیدراته، فقط BEGINِ commit می‌اندازد (الگوی U10) */
  const wrap9 = pool.query; let fired9 = false;
  pool.query = async (...args) => {
    if(!fired9 && String(args[0]).indexOf('BEGIN') === 0){ fired9 = true; throw new Error('pg down (V9c)'); }
    return wrap9(...args);
  };
  const cap9c = await quiet(() => apiSyncOf(P9c, [opX({ uid: 'v9-c', by: 5, collection: 'announcements',
    type: 'upd', user_id: 5, school_id: 1, id: 506, data: { school_id: 1, title: 'v9-تازه' } })]));
  pool.query = wrap9;
  chk('V9c شکستِ commit با هیدراتاسیون: rollback ردیفِ هیدراته را هم برگرداند (pop با after)',
    cap9c.code === 503 && !P9c.store.announcements.some(x => x.id === 506),
    'code=' + cap9c.code + ' mirror-has-506=' + P9c.store.announcements.some(x => x.id === 506));

  console.log('────────────────────────────────────────────');
  if (failc === 0) console.log('P0-6 Sync OOM Arch: ' + okc + '/' + (okc + failc) + ' موفق  —  بدون خطا ✅');
  else { console.log('P0-6 Sync OOM Arch: ' + okc + ' سبز / ' + failc + ' قرمز ❌'); fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
})().catch(e => { console.error('CRASH:', e); process.exit(1); });

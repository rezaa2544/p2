/* ─────────────────────────────────────────────────────────────
   wave1-multi-instance.js — موج ۱ (P0): دو نمونه، یک پستگرس
   ─────────────────────────────────────────────────────────────
   نمونه‌ها (store/sync/ids جدا) به یک PostgreSQL مشترک وصل‌اند؛ در این
   سندباکس، pg-mem جایِ PG واقعی است (تزریق از درزِ __setPoolForTests —
   همان seams که برای همین کار ساخته شد). کدِ اجرایی واقعی است:
   server/db.js ،server/sync.js ،server/ids.js ،routes/grades.js،
   delete-service.js و outbox.js بدونِ فیک فراخوانی می‌شوند.

   T1  دیده‌شدنِ نوشتِ نمونهٔ دیگر (hydrate-on-miss + اعمال)
   T2  عدمِ برخوردِ شناسه‌ها (دنباله‌هایِ PG)
   T3  شکستِ آینه → 503 + rollback + پخشِ دوبارهٔ موفق
   T4  OCC میان‌نمونه‌ای در sync (base_version کهنه → conflict_preserved)
   T5  OCC میان‌نمونه‌ای در REST (base_version کهنه → 409)
   T6  حذفِ میان‌نمونه‌ای + خوانشِ PG-first تکی + همگرایی با hydrate
   T7  یکتاییِ شناسه‌های outbox میانِ نمونه‌ها
   T8  delete-service: hydrate کردنِ miss از PG پیش از 404

   اجرا: node tests/wave1-multi-instance.js
   ───────────────────────────────────────────────────────────── */
'use strict';
const { newDb } = require('pg-mem');
const db = require('../server/db.js');
const { createSync, attach } = require('../server/sync.js');
const { createIds } = require('../server/ids.js');
const { createOutbox } = require('../server/outbox.js');
const { createDeleteService } = require('../server/delete-service.js');
const { createGradeRoutes } = require('../server/routes/grades.js');
const { opX } = require('./helpers/opx');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
async function quiet(fn) {
  const e0 = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = e0; }
}

const MGR = { id: 5, role: 'manager', school_id: 1 };

function makeInstance(tag) {
  const store = {
    announcements: [], grades: [], notifications: [], sync_conflicts: [],
    users: [{ id: 5, role: 'manager', school_id: 1, full_name: 'M', active: true }],
    tombstones: [], outbox: [], __deleted_records: [],
    __processed_uids: {}, __server_version: 0
  };
  const audits = [];
  const ids = createIds({ db, cache: null });
  const outbox = createOutbox({ store, db });
  const deleter = createDeleteService({ store, db, markDirty: () => {}, outbox });
  const sync = createSync({
    store, db, ids, MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: (ev, d) => audits.push({ ev, d }),
    sessionFrom: async () => ({ id: 5, role: 'manager', school_id: 1 }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    markDirty: () => {}
  });
  const grades = createGradeRoutes({ store, db, ids, deleter, audit: () => {}, markDirty: () => {} });
  return { tag, store, audits, ids, outbox, deleter, sync, grades };
}

async function apiSyncOf(inst, ops) {
  attach(inst.store); /* store_ref تک‌نمونه‌ای است — هر درخواست با store خودش */
  const res = {};
  await inst.sync.apiSync({}, res, { ops });
  return (res._cap || {});
}

(async () => {
  console.log('\n▸ موج ۱ — دو نمونه، یک پستگرس (pg-mem)');

  /* ── PG مشترک ── */
  const pg = newDb();
  try {
    /* catalog واقعی: sequence وابسته به id — در pg-mem نیست؛ null یعنی
       «schema قدیمی» و مسیرِ payesh_* طی می‌شود (بدونِ spam در stderr). */
    pg.public.registerFunction({
      name: 'pg_get_serial_sequence', args: ['text', 'text'], returns: 'text',
      implementation: () => null
    });
  } catch (e) { /* نبودش هم فقط noise است — رفتار عوض نمی‌شود */ }
  const { Pool } = pg.adapters.createPg();
  const pool = new Pool();
  const ANN_DDL = `CREATE TABLE announcements
    (id INTEGER PRIMARY KEY, school_id INTEGER, title TEXT, body TEXT,
     scope TEXT, version INTEGER, updated_at TEXT, created_at TEXT)`;
  await pool.query(ANN_DDL);
  await pool.query(`CREATE TABLE grades
    (id INTEGER PRIMARY KEY, school_id INTEGER, student_id INTEGER, teacher_id INTEGER,
     subject_id INTEGER, score NUMERIC, type TEXT, term TEXT,
     version INTEGER, updated_at TEXT, created_at TEXT)`);
  await pool.query(`CREATE TABLE notifications
    (id INTEGER PRIMARY KEY, school_id INTEGER, user_id INTEGER, type TEXT,
     title TEXT, body TEXT, link TEXT, "read" INTEGER, created_at TEXT)`);
  await pool.query(`CREATE TABLE server_outbox
    (id INTEGER PRIMARY KEY, type TEXT, collection TEXT, record_id INTEGER,
     actor_id INTEGER, version INTEGER, payload TEXT, created_at TIMESTAMPTZ)`);
  /* stub tables: hydrate iterates every store key — these exist only to keep the
     stand-in quiet (empty SELECTs); assertions never depend on them. */
  await pool.query('CREATE TABLE users (id INTEGER PRIMARY KEY)');
  await pool.query('CREATE TABLE sync_conflicts (id INTEGER PRIMARY KEY)');
  for (const s of ['users', 'grades', 'attendance', 'classes'])
    await pool.query('CREATE SEQUENCE payesh_' + s + '_id_seq');
  await pool.query('CREATE SEQUENCE payesh_outbox_id_seq');
  db.__setPoolForTests(pool);
  chk('T0 تزریقِ pool: حالتِ PG فعال است', db.isPostgres() === true);

  /* T0b: بوتِ اسکلتی — store بدونِ کلیدِ دامین از PG پر می‌شود (نه خالی می‌ماند).
     روی جدولِ خالی: کلید ساخته + آرایهٔ خالی؛ سپس یک ردیف می‌کاریم و دوباره. */
  const skel = { __processed_uids: {} };
  await pool.query(`INSERT INTO "announcements" (id, school_id, title, version) VALUES (900, 1, 'skel', 1)`);
  const h0 = await db.hydrateStoreFromPg(skel);
  chk('T0b بوتِ اسکلتی: کلیدِ دامین از PG ساخته شد',
    Array.isArray(skel.announcements) && skel.announcements.some(r => r.id === 900)
    && !('outbox' in skel) && h0.skipped.indexOf('announcements') === -1,
    'hydrated=' + h0.hydrated);
  await pool.query(`DELETE FROM "announcements" WHERE id = 900`);

  const A = makeInstance('A');
  const B = makeInstance('B');
  const pgRows = async (t) => (await pool.query(`SELECT * FROM "${t}"`)).rows;

  /* ── T1: نوشتِ A برایِ B دیده می‌شود ── */
  const cap1 = await apiSyncOf(A, [opX({ uid: 't1-ins', by: 5, collection: 'announcements',
    type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'سلام' } })]);
  chk('T1a ایجاد در A: ۲۰۰', cap1.code === 200 && cap1.body.results[0].ok === true,
    JSON.stringify(cap1.body && cap1.body.results));
  /* P1-2: مجموعهٔ announcements پس از commit از آینه بریده می‌شود —
     شناسه را از مرجع می‌خوانیم، نه از آینهٔ A */
  const pgAnn1 = await pgRows('announcements');
  const idX = pgAnn1.length ? pgAnn1[0].id : null;
  chk('T1b ردیف در PG نشست', pgAnn1.length === 1 && pgAnn1[0].id === idX, 'n=' + pgAnn1.length);
  const cap1u = await apiSyncOf(B, [opX({ uid: 't1-upd', by: 5, collection: 'announcements',
    type: 'upd', id: idX, user_id: 5, school_id: 1, data: { title: 'سلام!' } })]);
  chk('T1c به‌روزرسانی در B (کشِ خالی): ۲۰۰', cap1u.code === 200 && cap1u.body.results[0].ok === true,
    JSON.stringify(cap1u.body));
  const pgAnn1u = await pgRows('announcements');
  chk('T1d مقدارِ PG عوض شد', pgAnn1u.length === 1 && pgAnn1u[0].title === 'سلام!',
    JSON.stringify(pgAnn1u));
  const bCopy = B.store.announcements.find(r => r.id === idX);
  chk('T1e B روی آینهٔ سرد موفق شد (هیدراتاسیون از مرجع) و آینه پس از commit بریده شد — P1-2',
    cap1u.code === 200 && pgAnn1u.length === 1 && pgAnn1u[0].title === 'سلام!' && !bCopy,
    'pg=' + JSON.stringify(pgAnn1u[0] && pgAnn1u[0].title) + ' mirror-has=' + !!bCopy);

  /* ── T2: شناسه‌ها برخورد نمی‌کنند ── */
  await apiSyncOf(A, [opX({ uid: 't2-a', by: 5, collection: 'announcements',
    type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'a' } })]);
  await apiSyncOf(B, [opX({ uid: 't2-b', by: 5, collection: 'announcements',
    type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 'b' } })]);
  const ids2 = (await pgRows('announcements')).map(r => r.id);
  chk('T2 هر دو ردیف با شناسهٔ یکتا در PG', ids2.length === 3 && new Set(ids2).size === 3,
    JSON.stringify(ids2));

  /* ── T3: شکستِ آینه → 503 + rollback + پخشِ دوباره ── */
  const beforeT3 = A.store.announcements.length;
  await pool.query('DROP TABLE announcements');
  const opsT3 = [1, 2].map(i => opX({ uid: 't3-' + i, by: 5, collection: 'announcements',
    type: 'ins', user_id: 5, school_id: 1, data: { school_id: 1, title: 't3-' + i } }));
  const cap3 = await quiet(() => apiSyncOf(A, opsT3));
  chk('T3a با مرگِ PG: 503 + sync_mirror_failed',
    cap3.code === 503 && cap3.body.code === 'sync_mirror_failed'
    && cap3.body.results.every(r => r.ok === false), JSON.stringify(cap3.body));
  chk('T3b کش rollback شد', A.store.announcements.length === beforeT3,
    'n=' + A.store.announcements.length);
  chk('T3c uidها علامت نخوردند (قابلِ پخشِ دوباره)',
    !A.store.__processed_uids['t3-1'] && !A.store.__processed_uids['t3-2']);
  chk('T3d شکست audit شد', A.audits.some(a => a.ev === 'sync_mirror_failed'));
  /* NOTE: pg-mem keeps the dropped table's pkey index relation alive, so the
     recreate names its PK constraint explicitly (quirk of the stand-in, not PG). */
  await pool.query(ANN_DDL.replace('id INTEGER PRIMARY KEY',
    'id INTEGER CONSTRAINT announcements_pkey2 PRIMARY KEY'));
  const cap3r = await apiSyncOf(A, opsT3);
  chk('T3e پخشِ دوباره پس از زنده‌شدن: ۲۰۰',
    cap3r.code === 200 && cap3r.body.results.every(r => r.ok === true),
    JSON.stringify(cap3r.body));
  chk('T3f هر ۲ ردیف در PG', (await pgRows('announcements')).length === 2);

  /* ── T4: OCC میان‌نمونه‌ای در sync ── */
  const cap4i = await apiSyncOf(A, [opX({ uid: 't4-ins', by: 5, collection: 'grades',
    type: 'ins', user_id: 5, school_id: 1,
    data: { school_id: 1, student_id: 9, subject_id: 3, score: 15 } })]);
  const idG = (await pgRows('grades')).length ? (await pgRows('grades'))[0].id : null;   /* P1-2: از مرجع */
  chk('T4a ایجادِ نمره در A (در PG — آینه بریده می‌شود، P1-2)', cap4i.code === 200 && idG != null);
  await apiSyncOf(A, [opX({ uid: 't4-upd-a', by: 5, collection: 'grades',
    type: 'upd', id: idG, user_id: 5, school_id: 1, data: { score: 16 } })]);
  const pgG1 = (await pgRows('grades')).find(r => r.id === idG);
  chk('T4b به‌روزرسانیِ A: نسخهٔ PG شد ۲', Number(pgG1.version) === 2 && Number(pgG1.score) === 16,
    JSON.stringify(pgG1));
  B.store.grades.push(await db.readOne('grades', idG)); /* B تازه‌سازی کرد: نسخهٔ ۲ را دید */
  const cap4s = await apiSyncOf(B, [opX({ uid: 't4-upd-b', by: 5, collection: 'grades',
    type: 'upd', id: idG, base_version: 1, user_id: 5, school_id: 1, data: { score: 18 } })]);
  chk('T4c base کهنه → conflict_preserved',
    cap4s.code === 200 && cap4s.body.results[0].ok === false
    && cap4s.body.results[0].code === 'conflict_preserved',
    JSON.stringify(cap4s.body.results));
  chk('T4d تعارض در کشِ B محفوظ شد', B.store.sync_conflicts.length === 1);
  const pgG2 = (await pgRows('grades')).find(r => r.id === idG);
  chk('T4e مقدارِ PG دست‌نخورده (۱۶/نسخهٔ ۲)', Number(pgG2.score) === 16 && Number(pgG2.version) === 2,
    JSON.stringify(pgG2));

  /* ── T5: OCC میان‌نمونه‌ای در REST ── */
  const r5a = await A.grades.updateGrade({ user: MGR }, idG, { score: 17, base_version: 2 });
  chk('T5a به‌روزرسانیِ A با base تازه: ۲۰۰', r5a.status === 200, JSON.stringify(r5a.body));
  const pgG3 = (await pgRows('grades')).find(r => r.id === idG);
  chk('T5b نسخهٔ PG شد ۳', Number(pgG3.version) === 3 && Number(pgG3.score) === 17,
    JSON.stringify(pgG3));
  const r5b = await B.grades.updateGrade({ user: MGR }, idG, { score: 10, base_version: 2 });
  chk('T5c به‌روزرسانیِ B با base کهنه: ۴۰۹', r5b.status === 409, JSON.stringify(r5b.body));
  const pgG4 = (await pgRows('grades')).find(r => r.id === idG);
  chk('T5d مقدارِ PG همانِ A ماند', Number(pgG4.score) === 17 && Number(pgG4.version) === 3);

  /* ── T6: حذفِ میان‌نمونه‌ای + همگرایی ── */
  const del6 = await A.deleter.softDelete('grades', { id: idG }, { actor: MGR, audit: () => {} });
  chk('T6a حذف در A: ok', del6.ok === true, JSON.stringify(del6));
  chk('T6b ردیف از PG رفت', (await pgRows('grades')).length === 0);
  chk('T6c سنگ‌قبر در A نشست',
    A.store.tombstones.some(t => t.collection === 'grades' && t.record && t.record.id === idG));
  const r6b = await B.grades.updateGrade({ user: MGR }, idG, { score: 5 });
  chk('T6d خوانشِ تکیِ PG-first در B: ۴۰۴', r6b.status === 404, JSON.stringify(r6b.body));
  await db.hydrateStoreFromPg(B.store);
  chk('T6e پس از hydrate، کشِ B همگرا شد (خالی)',
    (B.store.grades || []).filter(g => g.id === idG).length === 0);

  /* ── T7: شناسه‌های outbox یکتا ── */
  const eA = await A.outbox.append({ type: 't', collection: 'grades', record_id: 1, actor_id: 5, version: 1 });
  const eB = await B.outbox.append({ type: 't', collection: 'grades', record_id: 1, actor_id: 5, version: 1 });
  chk('T7a دو نمونه شناسهٔ متفاوت گرفتند', eA.id !== eB.id, eA.id + ' vs ' + eB.id);
  const pgOb = await pgRows('server_outbox');
  chk('T7b هر دو رویداد در PG', pgOb.some(r => r.id === eA.id) && pgOb.some(r => r.id === eB.id),
    'n=' + pgOb.length);

  /* ── T8: حذفِ رکوردِ نمونهٔ دیگر با کشِ خالی ── */
  await apiSyncOf(A, [opX({ uid: 't8-ins', by: 5, collection: 'grades',
    type: 'ins', user_id: 5, school_id: 1,
    data: { school_id: 1, student_id: 9, subject_id: 3, score: 12 } })]);
  const pgG8 = await pgRows('grades');
  const idN = pgG8.length ? pgG8[pgG8.length - 1].id : null;   /* P1-2: از مرجع — آینه پس از commit بریده می‌شود */
  chk('T8a پیش‌شرط: B رکورد را ندارد',
    !(B.store.grades || []).some(r => r.id === idN));
  const del8 = await B.deleter.softDelete('grades', { id: idN }, { actor: MGR, audit: () => {} });
  chk('T8b حذف در B با hydrate: ok', del8.ok === true, JSON.stringify(del8));
  chk('T8c ردیف از PG رفت', !(await pgRows('grades')).some(r => r.id === idN));

  db.__setPoolForTests(null);
  await pool.end();

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); try { db.__setPoolForTests(null); } catch (_) {} process.exit(2); });

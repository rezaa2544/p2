#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/partitioning.js — Wave 10: اجرای پارتیشن‌بندی grades/attendance
   ─────────────────────────────────────────────────────────────────
   بخشِ واحد (همیشه اجرا می‌شود — بدونِ PG):
     U1  پرچم خاموش ⇒ مسیرِ legacy ‏ON CONFLICT (id) دست‌نخورده
     U2  پرچم روشن + id موجود ⇒ فقط UPDATE (بدونِ INSERT)
     U3  پرچم روشن + id جدید ⇒ فقط INSERT
     U4  رقابتِ هم‌زمان (23505) ⇒ UPDATE دوباره — idempotency حفظ می‌شود
     U5  بدونِ id ⇒ INSERT خالص
     U6  قراردادِ مهاجرتِ ۰۰۹ (+down): ساختار، PK (id, created_at)،
         پارتیشن‌های سالانه + DEFAULT، تریگرِ chg، تراکنش

   بخشِ زنده (وقتی PG در دسترس است — چینِ کامل 001→009 روی دیتابیسِ تازه):
     L1  چینِ ۰۰۱..۰۰۹ سبز می‌شود
     L2  ساختار: والدِ پارتیشن‌شده + پارتیشن‌های سالانه + DEFAULT + PK
     L3  پریتیِ داده: شمار/بیشینهٔ id/chg_id بینِ قدیم و جدید یکی
     L4  تریگرِ chg روی جدولِ پارتیشن‌شده می‌پرد (UPDATE ⇒ chg_id تازه)
     L5  persistOp از طریقِ db.js روی جدولِ پارتیشن‌شده: درجِ جدید،
         به‌روزرسانیِ موجود، idempotencyِ پوشِ دوباره، حذف
     L6  EXPLAIN: هرسِ پارتیشن با فیلترِ created_at؛ فیدِ chg از
         ایندکسِ (chg_id) می‌خواند
     L7  دلتای chg از طریقِ pull.js (کالکشنِ scoped) درست می‌آید
     L8  وارون‌سازیِ ۰۰۹: جدول‌ها برمی‌گردند، داده سالم، سطرِ تازه
         بازیافت می‌شود (grades_recovered)

   Run: node tests/partitioning.js
   PG زنده: PAYESH_W10_PG_URL (پیش‌فرض postgres://w10:w10@127.0.0.1:5432/payesh_w10)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const db = require(path.join(ROOT, 'server', 'db'));

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

/* ─── کلاینتِ جعلی برای بخشِ واحد ─── */
function fakeClient() {
  const calls = [];
  const rowsById = new Map(); /* id -> rowCount of UPDATE */
  return {
    calls,
    updateRowCount: 0,
    insertError: null, /* اگر ست شود، INSERT یک‌بار این خطا را می‌دهد */
    query: async function (sql, params) {
      calls.push({ sql: String(sql), params: params || [] });
      if (/^UPDATE/i.test(String(sql).trim())) {
        return { rowCount: this.updateRowCount, rows: [] };
      }
      if (/^INSERT/i.test(String(sql).trim()) && this.insertError) {
        const e = this.insertError; this.insertError = null; throw e;
      }
      return { rowCount: 1, rows: [] };
    }
  };
}
const withFlag = (v, fn) => {
  const had = process.env.PAYESH_PARTITIONED_TABLES;
  if (v == null) delete process.env.PAYESH_PARTITIONED_TABLES; else process.env.PAYESH_PARTITIONED_TABLES = v;
  try { return fn(); } finally {
    if (had != null) process.env.PAYESH_PARTITIONED_TABLES = had; else delete process.env.PAYESH_PARTITIONED_TABLES;
  }
};
const opIns = { t: 'ins', c: 'grades', data: { id: 7, school_id: 1, score: 18, created_at: '2026-09-01T00:00:00Z' } };

(async () => {
  console.log('\n▸ Wave 10 — پارتیشن‌بندی grades/attendance (واحد)');

  /* ── U1: پرچم خاموش ⇒ legacy ── */
  const c1 = fakeClient();
  await withFlag(null, () => db.persistOpWithClient(c1, opIns));
  chk('U1 پرچم خاموش ⇒ ON CONFLICT (id) DO UPDATE (مسیرِ legacy دست‌نخورده)',
    c1.calls.length === 1 && /ON CONFLICT \(id\) DO UPDATE/.test(c1.calls[0].sql), c1.calls[0] && c1.calls[0].sql.slice(0, 70));

  /* ── U2: id موجود ⇒ فقط UPDATE ── */
  const c2 = fakeClient(); c2.updateRowCount = 1;
  await withFlag('grades,attendance', () => db.persistOpWithClient(c2, opIns));
  chk('U2 id موجود ⇒ UPDATE بدونِ INSERT',
    c2.calls.length === 1 && /^UPDATE "grades" SET/i.test(c2.calls[0].sql) && c2.calls[0].params[c2.calls[0].params.length - 1] === 7,
    JSON.stringify(c2.calls.map((x) => x.sql.slice(0, 30))));

  /* ── U3: id جدید ⇒ فقط INSERT ── */
  const c3 = fakeClient(); c3.updateRowCount = 0;
  await withFlag('grades,attendance', () => db.persistOpWithClient(c3, opIns));
  chk('U3 id جدید ⇒ INSERT خالص',
    c3.calls.length === 2 && /UPDATE/.test(c3.calls[0].sql) && /INSERT INTO "grades"/.test(c3.calls[1].sql),
    JSON.stringify(c3.calls.map((x) => x.sql.slice(0, 30))));

  /* ── U4: رقابت 23505 ⇒ UPDATE دوباره ── */
  const c4 = fakeClient(); c4.updateRowCount = 0;
  c4.insertError = Object.assign(new Error('duplicate key'), { code: '23505' });
  c4.query = async function (sql, params) {
    this.calls.push({ sql: String(sql), params: params || [] });
    if (/^UPDATE/i.test(String(sql).trim())) {
      /* اولین UPDATE صفر می‌زند؛ بعد از 23505 دومی می‌گیرد */
      const n = this.calls.filter((x) => /^UPDATE/i.test(x.sql)).length;
      return { rowCount: n >= 2 ? 1 : 0, rows: [] };
    }
    if (/^INSERT/i.test(String(sql).trim())) { const e = this.insertError; this.insertError = null; throw e; }
    return { rowCount: 1, rows: [] };
  };
  await withFlag('grades,attendance', () => db.persistOpWithClient(c4, opIns));
  chk('U4 رقابتِ 23505 ⇒ UPDATE دوباره (idempotency حفظ)',
    c4.calls.length === 3 && c4.calls.filter((x) => /^UPDATE/i.test(x.sql)).length === 2,
    JSON.stringify(c4.calls.map((x) => x.sql.slice(0, 30))));

  /* ── U5: بدونِ id ⇒ INSERT بدونِ تلاشِ UPDATE ── */
  const c5 = fakeClient(); c5.updateRowCount = 1;
  await withFlag('grades,attendance', () => db.persistOpWithClient(c5, { t: 'ins', c: 'grades', data: { school_id: 1, score: 20 } }));
  chk('U5 بدونِ id ⇒ INSERT مستقیم (هیچ UPDATEای نیست)',
    c5.calls.length === 1 && /INSERT INTO "grades"/.test(c5.calls[0].sql),
    JSON.stringify(c5.calls.map((x) => x.sql.slice(0, 30))));

  /* ── U6: قرارداد مهاجرت ۰۰9 ── */
  const up9 = fs.readFileSync(path.join(ROOT, 'migrations', '009_partition_grades_attendance.sql'), 'utf8');
  const down9 = fs.readFileSync(path.join(ROOT, 'migrations', '009_partition_grades_attendance.down.sql'), 'utf8');
  chk('U6a هر دو جدولِ پارتیشن‌شده ساخته می‌شوند', /CREATE TABLE IF NOT EXISTS attendance_p/.test(up9) && /CREATE TABLE IF NOT EXISTS grades_p/.test(up9));
  chk('U6b PARTITION BY RANGE (created_at)', /PARTITION BY RANGE \(created_at\)/.test(up9));
  chk('U6c PK جدید (id, created_at)', /PRIMARY KEY \(id, created_at\)/.test(up9));
  chk('U6d پارتیشنِ DEFAULT برایِ آیندهٔ ناشناخته', /PARTITION OF attendance_p DEFAULT/.test(up9) && /PARTITION OF grades_p DEFAULT/.test(up9));
  chk('U6e تریگرِ chg روی والدِ پارتیشن‌شده', /CREATE TRIGGER trg_grades_chg BEFORE INSERT OR UPDATE ON grades_p/.test(up9));
  chk('U6f ایندکسِ غیر یکتایِ id (برایِ UPDATE WHERE id)', /ON grades_p \(id\)/.test(up9) && /ON attendance_p \(id\)/.test(up9));
  chk('U6g کوپیش دسته‌ای با id-range', /batch CONSTANT BIGINT := 50000/.test(up9) && /WHILE lo <= maxid LOOP/.test(up9));
  chk('U6h ستون‌های 004 (version) و 008 (chg_id) منتقل می‌شوند', /"version", "chg_id"/.test(up9));
  chk('U6i swap با نگهداریِ *_old برایِ rollback', /RENAME TO attendance_old/.test(up9) && /RENAME TO grades_old/.test(up9));
  chk('U6j down: وارون‌سازی + بازیابیِ سطرهای پس از swap', /RENAME TO attendance;/.test(down9) && /attendance_recovered/.test(down9));
  chk('U6k تراکنشِ کامل در هر دو', /^\s*BEGIN;/m.test(up9) && /^\s*COMMIT;/m.test(up9) && /^\s*BEGIN;/m.test(down9) && /^\s*COMMIT;/m.test(down9));

  /* ═══════════ بخشِ زنده ═══════════ */
  const LIVE_URL = process.env.PAYESH_W10_PG_URL || 'postgres://w10:w10@127.0.0.1:5432/payesh_w10';
  let live = null;
  try {
    const { Client } = require('pg');
    live = new Client({ connectionString: LIVE_URL, connectionTimeoutMillis: 4000 });
    await live.connect();
  } catch (e) {
    live = null;
  }
  if (!live) {
    console.log('\n  ⏭️  PG زنده در دسترس نیست (PAYESH_W10_PG_URL) — بخشِ L رد شد؛ واحد: ' + okc + '/' + (okc + failc));
    console.log('\n────────────────────────────────────────────');
    console.log(failc ? `partitioning: ${okc}/${okc + failc} — ${failc} خطا ❌` : `partitioning: ${okc}/${okc} — بدون خطا ✅ (بخشِ زنده رد شد)`);
    process.exit(failc ? 1 : 0);
  }

  console.log('\n▸ Wave 10 — پارتیشن‌بندی (PG زنده: چینِ کامل 001→009)');
  const q = (sql) => live.query(sql);
  const psql = (file) => execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', file, LIVE_URL], { stdio: 'pipe' }).toString();

  /* چین را روی همین دیتابیسِ کار می‌کنیم؛ اگر جدولی ماند، پاک کن */
  try {
    await q('DROP TABLE IF EXISTS grades_old, attendance_old, grades_recovered, attendance_recovered CASCADE');
    await q('DROP TABLE IF EXISTS grades, attendance CASCADE');
  } catch (e) { /* اولِ کار خالی است */ }

  try {
    /* شبیهٔ تولید: اول 001→008 (هیپ)، فیکسچر روی هیپ، بعد 009 با دادهٔ واقعی */
    const files = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => /^\d{3}_.*\.sql$/.test(f) && !/\.down\.sql$/.test(f) && !f.startsWith('009')).sort();
    for (const f of files) psql(path.join(ROOT, 'migrations', f));
    chk('L1 چینِ 001→008 سبز شد (' + files.length + ' مهاجرت؛ هیپ)', true);
  } catch (e) {
    chk('L1 چینِ مهاجرت‌ها', false, String(e.message || e).slice(0, 120));
  }

  /* فیکسچر: FKها را ارضا کن + دادهٔ دو ساله */
  try {
    await q("INSERT INTO schools (id, name, created_at, updated_at, version) VALUES (1, 'مدرسه ۱', now(), now(), 1) ON CONFLICT (id) DO NOTHING");
    await q("INSERT INTO users (id, username, role, school_id, created_at, updated_at, version) VALUES (100, 's100', 'student', 1, now(), now(), 1), (200, 't200', 'teacher', 1, now(), now(), 1) ON CONFLICT (id) DO NOTHING");
    await q("INSERT INTO classes (id, school_id, name, created_at, updated_at, version) VALUES (10, 1, 'کلاس ۱۰', now(), now(), 1) ON CONFLICT (id) DO NOTHING");
    await q("INSERT INTO subjects (id, school_id, name, created_at, updated_at, version) VALUES (20, 1, 'ریاضی', now(), now(), 1) ON CONFLICT (id) DO NOTHING");
    const t0 = Date.now();
    await q(`INSERT INTO attendance (school_id, student_id, class_id, date, status, created_at, updated_at, version)
             SELECT 1, 100, 10, '2026-09-01', 'present',
                    make_timestamp(2025 + (g % 2), 1 + (g % 12), 1 + (g % 28), 8, 0, 0), now(), 1
             FROM generate_series(1, 60000) g`);
    await q(`INSERT INTO grades (school_id, student_id, class_id, subject_id, teacher_id, score, created_at, updated_at, version)
             SELECT 1, 100, 10, 20, 200, (g % 20)::numeric,
                    make_timestamp(2025 + (g % 2), 1 + (g % 12), 1 + (g % 28), 9, 0, 0), now(), 1
             FROM generate_series(1, 120000) g`);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('     فیکسچر روی هیپ: 60k حضور + 120k نمره در ' + secs + 's');
    chk('L1b فیکسچر روی هیپ درج شد (تریگرهای chg فعال)', true);
  } catch (e) {
    chk('L1b فیکسچر', false, String(e.message || e).slice(0, 120));
  }

  /* ۰۰۹ با دادهٔ واقعی — مسیرِ کپیِ دسته‌ای واقعاً تست می‌شود */
  try {
    const t9 = Date.now();
    psql(path.join(ROOT, 'migrations', '009_partition_grades_attendance.sql'));
    console.log('     009 (کپیِ 180k + swap): ' + ((Date.now() - t9) / 1000).toFixed(1) + 's');
    chk('L1c مهاجرتِ 009 با دادهٔ 180k سطری سبز شد', true);
  } catch (e) {
    chk('L1c مهاجرتِ 009', false, String(e.message || e).slice(0, 160));
  }

  /* L2: ساختار */
  try {
    const part = await q("SELECT count(*)::int AS n FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid WHERE c.relname IN ('grades','attendance')");
    chk('L2a هر دو جدول پارتیشن‌شده‌اند', part.rows[0].n === 2, JSON.stringify(part.rows[0]));
    const attParts = await q("SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'attendance'::regclass ORDER BY 1");
    const names = attParts.rows.map((r) => r.relname);
    chk('L2b پارتیشن‌های سالانه + default (attendance)', names.includes('attendance_y2025') && names.includes('attendance_y2026') && names.includes('attendance_default'), JSON.stringify(names));
    const pk = await q("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='grades'::regclass AND contype='p'");
    chk('L2c PK جدید (id, created_at)', /PRIMARY KEY \(id, created_at\)/.test(pk.rows[0].d), pk.rows[0].d);
    const idx = await q("SELECT indexname FROM pg_indexes WHERE tablename='grades' AND indexname IN ('idx_grades_chg_id','idx_grades_id','idx_grades_school_id','idx_grades_updated_at')");
    chk('L2d ایندکس‌ها با نامِ نهایی روی والد', idx.rows.length === 4, JSON.stringify(idx.rows.map((r) => r.indexname)));
    const trg = await q("SELECT tgname FROM pg_trigger WHERE tgrelid='grades'::regclass AND NOT tgisinternal");
    chk('L2e تریگرِ chg روی والدِ جدید', trg.rows.some((r) => r.tgname === 'trg_grades_chg'), JSON.stringify(trg.rows));
  } catch (e) { chk('L2 ساختار', false, String(e.message || e).slice(0, 120)); }

  /* L3: پریتی */
  try {
    const pc = await q('SELECT (SELECT count(*) FROM grades) AS g_new, (SELECT count(*) FROM grades_old) AS g_old, (SELECT count(*) FROM attendance) AS a_new, (SELECT count(*) FROM attendance_old) AS a_old');
    const r = pc.rows[0];
    chk('L3a پریتیِ شمار (نمره/حضور)', Number(r.g_new) === Number(r.g_old) && Number(r.a_new) === Number(r.a_old), JSON.stringify(r));
    const mx = await q('SELECT (SELECT COALESCE(MAX(id),0) FROM grades) AS g_new, (SELECT COALESCE(MAX(id),0) FROM grades_old) AS g_old');
    chk('L3b بیشینهٔ id حفظ شد', Number(mx.rows[0].g_new) === Number(mx.rows[0].g_old), JSON.stringify(mx.rows[0]));
    const chg = await q("SELECT COUNT(*)::int AS n FROM grades WHERE chg_id IS NULL");
    chk('L3c همهٔ سطرها chg_id دارند (کپی + تریگر)', chg.rows[0].n === 0, String(chg.rows[0].n));
    const nullCa = await q("SELECT COUNT(*)::int AS n FROM grades WHERE created_at IS NULL");
    chk('L3d created_at هرگز NULL نیست (NOT NULL + COALESCE)', nullCa.rows[0].n === 0, String(nullCa.rows[0].n));
  } catch (e) { chk('L3 پریتی', false, String(e.message || e).slice(0, 120)); }

  /* L4: تریگر روی والد می‌پرد */
  try {
    const before = await q('SELECT chg_id FROM grades ORDER BY id LIMIT 1');
    const b = before.rows[0].chg_id;
    await q('UPDATE grades SET score = 19 WHERE id = (SELECT MIN(id) FROM grades)');
    const after = await q('SELECT chg_id FROM grades ORDER BY id LIMIT 1');
    chk('L4 UPDATE ⇒ chg_id تازه (تریگرِ روی والد)', Number(after.rows[0].chg_id) > Number(b), b + ' → ' + after.rows[0].chg_id);
  } catch (e) { chk('L4 تریگر', false, String(e.message || e).slice(0, 120)); }

  /* L5: persistOp از طریقِ db.js روی جدولِ پارتیشن‌شده */
  try {
    process.env.PAYESH_PARTITIONED_TABLES = 'grades,attendance';
    process.env.DATABASE_URL = LIVE_URL;
    delete require.cache[require.resolve(path.join(ROOT, 'server', 'db'))];
    const liveDb = require(path.join(ROOT, 'server', 'db'));
    await liveDb.init();
    /* درجِ جدید با id صریح */
    await liveDb.persistOpsBatch([{ t: 'ins', c: 'grades', uid: 'w10-a', data: { id: 900001, school_id: 1, student_id: 100, class_id: 10, subject_id: 20, teacher_id: 200, score: 20, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' } }]);
    let row = await q('SELECT score FROM grades WHERE id = 900001');
    chk('L5a درجِ جدید روی جدولِ پارتیشن‌شده', row.rows.length === 1 && Number(row.rows[0].score) === 20, JSON.stringify(row.rows));
    /* به‌روزرسانیِ همان id (upsert) */
    await liveDb.persistOpsBatch([{ t: 'ins', c: 'grades', uid: 'w10-b', data: { id: 900001, school_id: 1, student_id: 100, class_id: 10, subject_id: 20, teacher_id: 200, score: 17, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' } }]);
    const cnt = await q('SELECT COUNT(*)::int AS n FROM grades WHERE id = 900001');
    row = await q('SELECT score FROM grades WHERE id = 900001');
    chk('L5b upsert: id موجود به‌روزرسانی شد نه سطرِ دوم', cnt.rows[0].n === 1 && Number(row.rows[0].score) === 17, 'n=' + cnt.rows[0].n + ' score=' + row.rows[0].score);
    /* idempotency: همان op دوباره */
    await liveDb.persistOpsBatch([{ t: 'ins', c: 'grades', uid: 'w10-b', data: { id: 900001, school_id: 1, student_id: 100, class_id: 10, subject_id: 20, teacher_id: 200, score: 17, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' } }]);
    const cnt2 = await q('SELECT COUNT(*)::int AS n FROM grades WHERE id = 900001');
    chk('L5c پوشِ دوباره ⇒ همان یک سطر (idempotent)', cnt2.rows[0].n === 1, 'n=' + cnt2.rows[0].n);
    /* حذف */
    await liveDb.persistOpsBatch([{ t: 'del', c: 'grades', uid: 'w10-c', id: 900001 }]);
    const cnt3 = await q('SELECT COUNT(*)::int AS n FROM grades WHERE id = 900001');
    chk('L5d حذف روی جدولِ پارتیشن‌شده', cnt3.rows[0].n === 0, 'n=' + cnt3.rows[0].n);
    await liveDb.close();
  } catch (e) {
    chk('L5 persistOp روی پارتیشن‌شده', false, String(e.message || e).slice(0, 160));
  } finally {
    delete process.env.DATABASE_URL;
    delete process.env.PAYESH_PARTITIONED_TABLES;
  }

  /* L6: EXPLAIN — هرس و ایندکس */
  try {
    const ex1 = await q("EXPLAIN SELECT * FROM grades WHERE created_at >= '2026-06-01' AND created_at < '2026-09-01'");
    const plan1 = ex1.rows.map((r) => Object.values(r)[0]).join('\n');
    chk('L6a هرسِ پارتیشن (فقط 2026)', /grades_y2026/.test(plan1) && !/grades_y2025/.test(plan1) && !/Seq Scan on grades/.test(plan1), plan1.split('\n')[0]);
    await q('ANALYZE grades');
    const wmMax = await q('SELECT COALESCE(MAX(chg_id), 0)::bigint AS v FROM grades');
    const ex2 = await q('EXPLAIN SELECT * FROM grades WHERE chg_id > ' + (Number(wmMax.rows[0].v) - 50) + ' ORDER BY chg_id ASC, id ASC');
    const plan2 = ex2.rows.map((r) => Object.values(r)[0]).join('\n');
    /* ایندکسِ chg روی والد به هر پارتیشن کلون می‌شود؛ نامِ فرزند «…_chg_id_idx» است */
    chk('L6b فیدِ chg از ایندکس می‌خواند', /chg_id_idx|idx_grades_chg_id|Bitmap Index Scan/.test(plan2), plan2.split('\n').slice(0, 2).join(' | '));
  } catch (e) { chk('L6 EXPLAIN', false, String(e.message || e).slice(0, 120)); }

  /* L7: دلتای chg از طریقِ pull.js */
  try {
    delete require.cache[require.resolve(path.join(ROOT, 'server', 'db'))];
    const liveDb2 = require(path.join(ROOT, 'server', 'db'));
    process.env.DATABASE_URL = LIVE_URL;
    await liveDb2.init();
    const { createPull } = require(path.join(ROOT, 'server', 'pull'));
    const { createCursor } = require(path.join(ROOT, 'server', 'cursor'));
    const cursor = createCursor({ secret: 'w'.repeat(64) });
    /* فول‌پول: نشانگرِ آب را بگیر */
    let cap = { _cap: null };
    const controller = createPull({
      store: { __deleted_records: [], __server_version: 3 },
      db: liveDb2,
      sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
      sendJson: (res, code, body) => { res._cap = { code, body }; },
      cursor
    });
    await controller.apiPull({ url: '/api/v1/pull?collections=grades', headers: {} }, cap);
    const wm = cap._cap.body.chg_watermark;
    chk('L7a فول‌پول ⇒ chg_watermark در پاسخ', Number.isFinite(wm) && wm > 0, String(wm));
    /* یک تغییر تازه بعد از نشانگر */
    await q("UPDATE grades SET score = 20 WHERE id = (SELECT MIN(id) FROM grades)");
    const tok = cursor.sign(new Date().toISOString(), null, wm);
    const cap2 = { _cap: null };
    await controller.apiPull({ url: '/api/v1/pull?cursor=' + encodeURIComponent(tok) + '&collections=grades', headers: {} }, cap2);
    const deltaRows = (cap2._cap.body.collections && cap2._cap.body.collections.grades) || [];
    chk('L7b دلتای v3: فقط ردیفِ تازه‌تغییرکرده (نه کلِ ۱۲۰k)', deltaRows.length >= 1 && deltaRows.length <= 5, 'rows=' + deltaRows.length);
    chk('L7c سطرهای دلتا بدونِ chg_id (پریتیِ شکل)', deltaRows.every((r) => !('chg_id' in r)));
    const pl = JSON.parse(Buffer.from(cap2._cap.body.next_cursor.split('.')[1], 'base64url').toString());
    chk('L7d توکنِ بعدی v3 با cw', pl.v === 3 && Number.isFinite(pl.cw) && pl.cw >= wm, 'v=' + pl.v + ' cw=' + pl.cw);
    await liveDb2.close();
  } catch (e) {
    chk('L7 دلتای pull', false, String(e.message || e).slice(0, 160));
  } finally { delete process.env.DATABASE_URL; }

  /* L8: وارون‌سازی */
  try {
    /* یک سطرِ پس از swap واقعی — مسیرِ بازیافتِ down را واقعاً تست کن */
    await q("INSERT INTO grades (school_id, student_id, class_id, subject_id, teacher_id, score, created_at, updated_at, version) VALUES (1, 100, 10, 20, 200, 19, '2026-09-05 09:00:00+00', now(), 1)");
    const before = await q('SELECT (SELECT count(*) FROM grades) AS g, (SELECT count(*) FROM grades_old) AS go, (SELECT count(*) FROM grades WHERE id NOT IN (SELECT id FROM grades_old)) AS extra');
    psql(path.join(ROOT, 'migrations', '009_partition_grades_attendance.down.sql'));
    const notPart = await q("SELECT count(*)::int AS n FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid WHERE c.relname IN ('grades','attendance')");
    chk('L8a وارون‌سازی: جدول‌ها دیگر پارتیشن‌شده نیستند', notPart.rows[0].n === 0, String(notPart.rows[0].n));
    const after = await q('SELECT (SELECT count(*) FROM grades) AS g');
    chk('L8b دادهٔ قدیمی سالم برگشت', Number(after.rows[0].g) === Number(before.rows[0].go), JSON.stringify({ b: before.rows[0], a: after.rows[0] }));
    const rec = await q("SELECT to_regclass('grades_recovered') AS t");
    const nExtra = Number(before.rows[0].extra);
    /* اگر سطرِ پس از swap بود ⇒ جدولِ بازیافت با همان شمار؛ اگر نبود ⇒ نبودنش درست است (چیزی گم نشده) */
    let recOk;
    if (nExtra > 0) {
      const rc = rec.rows[0].t === 'grades_recovered' ? await q('SELECT count(*)::int AS n FROM grades_recovered') : { rows: [{ n: -1 }] };
      recOk = rec.rows[0].t === 'grades_recovered' && rc.rows[0].n === nExtra;
    } else {
      recOk = rec.rows[0].t === null;
    }
    chk('L8c سطرهای پس از swap بازیافت/پوشش داده شدند (extra=' + nExtra + ')', recOk, JSON.stringify(rec.rows[0]));
    /* چین را برای اجرای دوبارهٔ تست تمیز کن */
    await q('DROP TABLE IF EXISTS grades_recovered, attendance_recovered');
    await q('DROP TABLE IF EXISTS grades, attendance, schools, users, classes, subjects CASCADE');
  } catch (e) { chk('L8 وارون‌سازی', false, String(e.message || e).slice(0, 160)); }

  try { await live.end(); } catch (e) {}

  console.log('\n────────────────────────────────────────────');
  if (failc === 0) console.log(`partitioning: ${okc}/${okc} — بدون خطا ✅`);
  else {
    console.log(`partitioning: ${okc}/${okc + failc} — ${failc} خطا ❌`);
    fails.forEach((f) => console.log('  ✗ ' + f));
  }
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });

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
     U7  کچ‌آپِ swap (یافتهٔ استیجینگ): تنها تراکنشِ قفل‌دار = پنجرهٔ
         کوتاهِ swap + ضدالحاقِ (id, created_at, chg_id) + ON CONFLICT ⇒
         هیچ نوشتهٔ حینِ کپی در *_old اسیر نمی‌ماند
     U8  یافته‌هایِ مانورِ ۲۵M (۲۰۲۶-۰۹-۱۲): FKها با NOT VALID+VALIDATE
         پس از کپی (نه داخلِ CREATE — قفلِ والد) · کپیِ chunk-commitِ
         قابلِ ازسرگیری (PROCEDURE، نه تک‌تراکنشِ حافظه‌خوار)

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
     L9  نویسندهٔ هم‌زمان حینِ ۰۰۹: هر درج/به‌روزرسانیِ حینِ کپی بعد از
         swap در جدولِ نو با آخرین مقدار هست (کچ‌آپ)
     L10 FKهای جدول‌های نهایی validated اند (NOT VALID موقتی نبوده)
     L11 کرش وسطِ کپی (kill بعد از اولین چانکِ کامیت‌شده) ⇒ رانِ مجدد
         از مرزِ MAX(id) ازسرگیری می‌کند و کامل سبز می‌شود

   Run: node tests/partitioning.js
   PG زنده: PAYESH_W10_PG_URL (پیش‌فرض postgres://w10:w10@127.0.0.1:5432/payesh_w10)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { execFile } = require('child_process');
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
  /* U7 — کچ‌آپِ swap (یافتهٔ استیجینگ ۲۰۲۶-۰۹-۱۲): تک‌تراکنش بودن، سطرهای
     حینِ کپی را در *_old اسیر می‌کرد و پنجرهٔ قفل تا کامیتِ کلِ کپی طولانی
     بود. قراردادِ تازه: (۱) دو تراکنش؛ (۲) قفلِ انحصاری قبل از rename؛
     (۳) ضدالحاقِ (id, created_at, chg_id) برای هر دو جدول؛ (۴) آپسرتِ
     ON CONFLICT (id, created_at) برای تازه‌کردنِ کپیِ کهنه. */
  chk('U7a تنها یک جفتِ BEGIN/COMMIT صریح = پنجرهٔ کوتاهِ swap (کپی با چانک‌هایِ CALL)', (up9.match(/^COMMIT;$/gm) || []).length === 1 && (up9.match(/^BEGIN;$/gm) || []).length === 1);
  chk('U7b قفلِ انحصاری هر دو جدول قبل از rename', /LOCK TABLE attendance IN ACCESS EXCLUSIVE MODE;/.test(up9) && /LOCK TABLE grades IN ACCESS EXCLUSIVE MODE;/.test(up9) && up9.indexOf('LOCK TABLE grades') < up9.indexOf('ALTER TABLE grades RENAME TO grades_old'));
  const catchA = /INSERT INTO attendance_p[\s\S]*?NOT EXISTS \(SELECT 1 FROM attendance_p p[\s\S]*?ON CONFLICT \(id, created_at\) DO UPDATE/.test(up9);
  const catchG = /INSERT INTO grades_p[\s\S]*?NOT EXISTS \(SELECT 1 FROM grades_p p[\s\S]*?ON CONFLICT \(id, created_at\) DO UPDATE/.test(up9);
  chk('U7c ضدالحاقِ کچ‌آپ برایِ هر دو جدول + آپسرتِ PK', catchA && catchG, 'att=' + catchA + ' grades=' + catchG);
  chk('U7d ادغام با شرطِ تازگیِ chg_id (last-writer-wins؛ نه تساوی که نوشتهٔ نو را بازنویسیِ معکوس می‌کند)', !/IS NOT DISTINCT FROM o\.chg_id/.test(up9) && (up9.match(/p\.chg_id >= o\.chg_id/g) || []).length >= 6);
  chk('U7e فازِ D — ادغامِ سرگردان‌ها بعد از کامیتِ swap (idempotent)', /STRAY-MERGE:BEGIN/.test(up9) && /STRAY-MERGE:END/.test(up9) && /FROM grades o[\s\S]*?STRAY-MERGE:END/.test(up9));
  chk('U7f تریگرِ chg حینِ کپی خاموش است (chg_id حفظ می‌شود؛ کچ‌آپ سبک می‌ماند)', /ALTER TABLE attendance_p DISABLE TRIGGER trg_attendance_chg;/.test(up9) && /ALTER TABLE grades_p DISABLE TRIGGER trg_grades_chg;/.test(up9) && /ALTER TABLE attendance_p ENABLE TRIGGER trg_attendance_chg;/.test(up9) && /ALTER TABLE grades_p ENABLE TRIGGER trg_grades_chg;/.test(up9));
  /* U8 — یافته‌هایِ مانورِ ۲۵M سطر (۲۰۲۶-۰۹-۱۲) */
  chk('U8a FKها با ALTER رویِ جدولِ خالی قبل از کپی (قفلِ والد میلی‌ثانیه‌ای؛ نه داخلِ CREATE تا پایانِ کپی؛ NOT VALID رویِ partitioned ممنوعِ PG 17 است)', (up9.match(/ADD CONSTRAINT fk_/g) || []).length === 6 && !/ADD CONSTRAINT[^;]*NOT VALID/s.test(up9) && !/VALIDATE CONSTRAINT/.test(up9) && !/PRIMARY KEY \(id, created_at\),/.test(up9) && up9.indexOf('ADD CONSTRAINT fk_') < up9.indexOf('CALL payesh_copy_attendance_009'));
  chk('U8b کپیِ chunk-commitِ قابلِ ازسرگیری (PROCEDURE + COMMIT پریودیک + ازسرگیری از MAX(id))', /CREATE OR REPLACE PROCEDURE payesh_copy_grades_009\(\)/.test(up9) && /CREATE OR REPLACE PROCEDURE payesh_copy_attendance_009\(\)/.test(up9) && (up9.match(/^\s+COMMIT;$/gm) || []).length >= 4 && /GREATEST\(minid, COALESCE\(\(SELECT MAX\(id\) FROM grades_p\), 0\) \+ 1\)/.test(up9));
  chk('U7g کچ‌آپِ فازِ C با پیشیکیتِ chg به‌صورتِ ثابتِ زمانِ پلان — \\gset + لیترالِ :w0 (زیرپلانِ مجهول‌مقدار ⇒ overestimate ⇒ Hash Anti-Joinِ کلِ جدولِ نو زیرِ قفل؛ رانِ چهارمِ ۲۵M: ۳۸.۸s)', /CREATE TABLE IF NOT EXISTS mig009_w0/.test(up9) && /ON CONFLICT \(id\) DO NOTHING/.test(up9) && /^SELECT w0 FROM mig009_w0 WHERE id = 1 \\gset$/m.test(up9) && (up9.match(/o\.chg_id > :w0\b/g) || []).length === 2 && !/o\.chg_id > \(SELECT w0/.test(up9) && !/DROP TABLE/.test(up9) && up9.indexOf('INSERT INTO mig009_w0') < up9.indexOf('CALL payesh_copy_attendance_009') && /DROP TABLE IF EXISTS mig009_w0;/.test(down9));

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
  const psqlF = (file) => new Promise((res) => {
    execFile('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', file, LIVE_URL],
      { env: Object.assign({}, process.env, { PGPASSWORD: process.env.PGPASSWORD || 'w10' }) },
      (err, so, se) => res({ code: err ? (err.code || 1) : 0, so: String(so), se: String(se) }));
  });
  const psql = (file) => execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', file, LIVE_URL], { stdio: 'pipe' }).toString();

  /* چین را روی همین دیتابیسِ کار می‌کنیم؛ مستقل از وضعیتِ قبلی (رانِ شکست‌خورده،
     مهاجرتِ ناتمام و…) همهٔ جدول‌های مرتبط را پاک کن */
  try {
    await q('DROP TABLE IF EXISTS grades, attendance, grades_old, attendance_old, grades_p, attendance_p, grades_recovered, attendance_recovered, schools, users, classes, subjects CASCADE');
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

  /* ۰۰۹ با دادهٔ واقعی + نویسندهٔ هم‌زمان (شبیهٔ تولید) — کپیِ دسته‌ای و
     کچ‌آپِ swap واقعاً تست می‌شوند. نویسنده همان مسیرِ persistOp پارتیشن‌ساز
     است: UPDATE by id → 0 ⇒ INSERT (آپسرتِ idempotent). */
  let ledger = new Map(); /* id -> score نهایی */
  let writerErrs = 0;
  let stopW = false; let writerP = Promise.resolve(); /* بایستد حتی اگر مهاجرت شکست بخورد (عرضِ L11) */
  try {
    const t9 = Date.now();
    let wTick = 0, nextId = 800001;
    const upsert = async (id, score) => {
      /* همان قراردادِ persistOp پارتیشن‌ساز (db.js) */
      const u = await live.query('UPDATE grades SET score = $2, updated_at = now() WHERE id = $1', [id, score]);
      if (u.rowCount === 0) await live.query('INSERT INTO grades (id, school_id, student_id, class_id, subject_id, teacher_id, score, created_at, updated_at, version) VALUES ($1, 1, 100, 10, 20, 200, $2, $3, now(), 1)', [id, score, '2026-09-10T09:00:00Z']);
      ledger.set(id, score);
    };
    writerP = (async () => {
      while (!stopW) {
        try {
          const k = wTick++ % 3;
          if (k === 0) await upsert(nextId++, nextId % 20);
          else if (k === 1 && ledger.size) await upsert(Math.max(...ledger.keys()), 20 - (nextId % 17));
          /* k===2: تنفس — فرصتِ تغییرِ فازِ مهاجرت */
        } catch (e) { writerErrs++; }
        await new Promise((r) => setTimeout(r, 120));
      }
    })();
    const mig = await new Promise((res, rej) => {
      execFile('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', path.join(ROOT, 'migrations', '009_partition_grades_attendance.sql'), LIVE_URL],
        { env: Object.assign({}, process.env, { PGPASSWORD: (LIVE_URL.match(/\/\/[^:]+:([^@]+)@/) || [])[1] || process.env.PGPASSWORD }) },
        (err, so, se) => err ? rej(new Error(String(se || err.message).split('\n').filter((l) => /ERROR|FATAL/.test(l)).join(' | ').slice(0, 160) || err.message)) : res());
    });
    console.log('     009 (کپیِ 180k + کچ‌آپ + swap؛ نویسندهٔ هم‌زمان: ' + ledger.size + ' سطر): ' + ((Date.now() - t9) / 1000).toFixed(1) + 's');
    chk('L1c مهاجرتِ 009 با دادهٔ 180k + ترافیکِ هم‌زمان سبز شد (خطای نویسنده: ' + writerErrs + ')', writerErrs === 0);
  } catch (e) {
    chk('L1c مهاجرتِ 009', false, String(e.message || e).slice(0, 160));
  } finally {
    stopW = true; await writerP; /* در هر دو مسیر — نویسنده هرگز نشت نمی‌کند */
  }

  /* L9: هیچ نوشتهٔ حینِ کپی در *_old اسیر نشده و کپیِ کهنه نمانده */
  try {
    /* گامِ ران‌بوک: یک پاسِ ادغامِ سرگردان (فازِ D مهاجرت دو پاس زده؛
       این پاسِ سوم برای قطعیتِ تست است — بیداریِ نویسندهٔ بلاک می‌تواند
       از پاس‌های مهاجرت دیرتر باشد). */
    {
      const pd = up9.slice(up9.indexOf('-- STRAY-MERGE:BEGIN') + '-- STRAY-MERGE:BEGIN'.length, up9.indexOf('-- STRAY-MERGE:END'));
      await live.query(pd);
    }
    let missing = 0, wrong = 0;
    const ids = [...ledger.keys()];
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const r = await live.query('SELECT id, score FROM grades WHERE id = ANY($1)', [chunk]);
      const got = new Map(r.rows.map((x) => [Number(x.id), Number(x.score)]));
      for (const id of chunk) { if (!got.has(id)) missing++; else if (got.get(id) !== ledger.get(id)) wrong++; }
    }
    chk('L9a هر سطرِ نویسنده (حینِ کپی و بعد از swap) در جدولِ نو با آخرین نمره هست', missing === 0 && wrong === 0, 'missing=' + missing + ' wrong=' + wrong + ' total=' + ids.length);
    const stranded = await q('SELECT count(*)::int AS n FROM grades_old o WHERE NOT EXISTS (SELECT 1 FROM grades n WHERE n.id = o.id AND n.created_at = o.created_at)');
    chk('L9b هیچ سطرِ قدیمی در جدولِ نو گم نشده (ضدالحاقِ کچ‌آپ)', stranded.rows[0].n === 0, 'n=' + stranded.rows[0].n);
    /* کهنه‌بودن یعنی: سطرِ قدیمی از کپیِ نو تازه‌تر باشد (کچ‌آپ/ادغام جا مانده).
       سطرِ نوِ تازه‌تر (نوشتهٔ پس از swap) سالم است — فقط در جدولِ نو است. */
    const stale = await q('SELECT count(*)::int AS n FROM grades_old o JOIN grades n ON n.id = o.id AND n.created_at = o.created_at WHERE o.chg_id > n.chg_id');
    chk('L9c کپیِ کهنه نمانده (کچ‌آپ/ادغام، قدیمی را تازه کرده)', stale.rows[0].n === 0, 'n=' + stale.rows[0].n);
    /* L9d: سرگردانِ حقیقی — نویسنده‌ای که لحظهٔ swap بلاک بود و بعد از کامیت
       روی *_old نشست. یک سطرِ صوری در grades_old می‌سازیم و فازِ D واقعیِ
       مهاجرت (متنی که خودِ فایل دارد) را اجرا می‌کنیم. */
    const strayId = 899999;
    await live.query("INSERT INTO grades_old (id, school_id, student_id, class_id, subject_id, teacher_id, score, created_at, updated_at, version, chg_id) VALUES ($1, 1, 100, 10, 20, 200, 13, '2026-09-10T09:00:00Z', now(), 1, nextval('payesh_chg_seq'))", [strayId]);
    const phaseD = up9.slice(up9.indexOf('-- STRAY-MERGE:BEGIN') + '-- STRAY-MERGE:BEGIN'.length, up9.indexOf('-- STRAY-MERGE:END'));
    await live.query(phaseD);
    await live.query(phaseD); /* idempotencyِ دوباره‌اجرا */
    const stray = await live.query('SELECT score FROM grades WHERE id = $1', [strayId]);
    const strayCnt = await live.query('SELECT count(*)::int AS n FROM grades WHERE id = $1', [strayId]);
    chk('L9d فازِ D سرگردانِ پس از swap را ادغام می‌کند (idempotent)', strayCnt.rows[0].n === 1 && Number(stray.rows[0].score) === 13, 'n=' + strayCnt.rows[0].n + ' score=' + (stray.rows[0] && stray.rows[0].score));
    /* L9e — رگرسیونِ بازنویسیِ معکوس (یافتهٔ استیجینگ). سناریوی واقعی:
       نوشتهٔ پس از swap روی جدولِ نو (chg تازه C) در برابرِ نسخهٔ old با
       chg کهنه‌تر (پیش از swap). شرطِ تازگی باید نو را نگه دارد (skip) و
       اگر old واقعاً تازه‌تر باشد (chg بزرگ‌تر)، ادغام کند. آپدیتِ عادیِ old
       تریگرِ chg را هم می‌پرد و old را «تازه‌ترین» می‌کند — پس برایِ
       شبیه‌سازیِ chg کهنه، تریگرِ old موقتاً خاموش می‌شود. */
    {
      await live.query('UPDATE grades SET score = 19 WHERE id = $1', [strayId]); /* نو: score=19، chg می‌پرد (تازه‌ترین) */
      await live.query('ALTER TABLE grades_old DISABLE TRIGGER trg_grades_chg');
      await live.query('UPDATE grades_old SET score = 1 WHERE id = $1', [strayId]); /* old: score عوض ولی chg کهنه ماند */
      await live.query('ALTER TABLE grades_old ENABLE TRIGGER trg_grades_chg');
      await live.query(phaseD);
      const keep = await live.query('SELECT score FROM grades WHERE id = $1', [strayId]);
      chk('L9e-1 نوشتهٔ تازهٔ جدولِ نو با کهنهٔ *_old بازنویسی نمی‌شود (تازگی ⇒ skip)', Number(keep.rows[0].score) === 19, 'score=' + keep.rows[0].score);
      /* جهتِ درستِ ادغام: old حالا واقعاً تازه‌تر شود (تریگر فعال ⇒ chg جدید) */
      await live.query('UPDATE grades_old SET score = 2 WHERE id = $1', [strayId]); /* chg می‌پرد ⇒ تازه‌ترین */
      await live.query(phaseD);
      const merged = await live.query('SELECT score FROM grades WHERE id = $1', [strayId]);
      chk('L9e-2 تازه‌تر بودنِ *_old ⇒ ادغام (last-writer-wins)', Number(merged.rows[0].score) === 2, 'score=' + merged.rows[0].score);
    }
  } catch (e) { chk('L9 کچ‌آپ', false, String(e.message || e).slice(0, 160)); }

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
    /* L10 — یافتهٔ مانورِ ۲۵M: FKها باید وجود داشته باشند و validated باشند
       (NOT VALID فقط موقتیِ بینِ ADD و VALIDATE است؛ بعد از مهاجرت باید
       convalidated=true باشد — وگرنه یکپارچگیِ ارجاعی تضمین نشده است). */
    const fks = await q("SELECT conname, convalidated FROM pg_constraint WHERE conrelid IN ('grades'::regclass, 'attendance'::regclass) AND contype='f' ORDER BY 1");
    chk('L10 هر ۶ FK روی جدول‌های نهایی موجود و validated', fks.rows.length === 6 && fks.rows.every((r) => r.convalidated), JSON.stringify(fks.rows.map((r) => r.conname + ':' + r.convalidated)));
  } catch (e) { chk('L2 ساختار', false, String(e.message || e).slice(0, 120)); }

  /* L3: پریتی — روی بازهٔ فیکسچر (id ≤ 800000)؛ سطرهای نویسندهٔ هم‌زمانِ L9
     (id ≥ 800001) خودشان در L9 اثبات می‌شوند. */
  try {
    const pc = await q('SELECT (SELECT count(*) FROM grades WHERE id <= 800000) AS g_new, (SELECT count(*) FROM grades_old WHERE id <= 800000) AS g_old, (SELECT count(*) FROM attendance) AS a_new, (SELECT count(*) FROM attendance_old) AS a_old');
    const r = pc.rows[0];
    chk('L3a پریتیِ شمار (نمره/حضور)', Number(r.g_new) === Number(r.g_old) && Number(r.a_new) === Number(r.a_old), JSON.stringify(r));
    const mx = await q('SELECT (SELECT COALESCE(MAX(id),0) FROM grades WHERE id <= 800000) AS g_new, (SELECT COALESCE(MAX(id),0) FROM grades_old WHERE id <= 800000) AS g_old');
    chk('L3b بیشینهٔ id (بازهٔ فیکسچر) حفظ شد', Number(mx.rows[0].g_new) === Number(mx.rows[0].g_old), JSON.stringify(mx.rows[0]));
    const chg = await q("SELECT COUNT(*)::int AS n FROM grades WHERE chg_id IS NULL");
    chk('L3c همهٔ سطرها chg_id دارند (کپی + تریگر)', chg.rows[0].n === 0, String(chg.rows[0].n));
    /* با تریگرِ خاموشِ کپی، chg_id سطرهای کپی‌شده باید عیناً یکی باشد —
       این همان چیزی است که کچ‌آپ را سبک نگه می‌دارد. */
    const chgEq = await q('SELECT count(*)::int AS n FROM grades_old o JOIN grades n ON n.id = o.id AND n.created_at = o.created_at WHERE o.chg_id = n.chg_id');
    chk('L3e chg_id سطرهای کپی‌شده حفظ می‌شود (نه nextval تازه)', chgEq.rows[0].n >= 119500, 'n=' + chgEq.rows[0].n);
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
    /* هرس یعنی فقط پارتیشنِ 2026 خوانده شود. نوعِ اسکنِ درونِ پارتیشن
       (Index یا Seq) به گزینش‌پذیری بستگی دارد — با آمارِ تازه و ~۳۹٪
       تطابق، Seq Scan روی همان یک پارتیشن پلنِ درست است (ادعای «نه Seq»
       بیش‌از حد سخت‌گیرانه و وابسته به بی‌آماریِ جدول بود). */
    chk('L6a هرسِ پارتیشن (فقط y2026؛ نه y2025، نه default)', /grades_y2026/.test(plan1) && !/grades_y2025/.test(plan1) && !/grades_default/.test(plan1) && !/Seq Scan on grades_y2025/.test(plan1), plan1.split('\n')[0]);
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
    const insRow = await q("INSERT INTO grades (school_id, student_id, class_id, subject_id, teacher_id, score, created_at, updated_at, version) VALUES (1, 100, 10, 20, 200, 19, '2026-09-05 09:00:00+00', now(), 1) RETURNING id");
    const dbg = await q("SELECT id, created_at FROM grades n WHERE NOT EXISTS (SELECT 1 FROM grades_old o WHERE o.id = n.id AND o.created_at = n.created_at) ORDER BY id LIMIT 6");
    console.log('     [L8c-debug] inserted id=' + insRow.rows[0].id + ' · سطرهای نو-تنها: ' + JSON.stringify(dbg.rows));
    const before = await q('SELECT (SELECT count(*) FROM grades) AS g, (SELECT count(*) FROM grades_old) AS go, (SELECT count(*) FROM grades WHERE id NOT IN (SELECT id FROM grades_old)) AS extra, (SELECT count(*) FROM grades n WHERE NOT EXISTS (SELECT 1 FROM grades_old o WHERE o.id = n.id AND o.created_at = n.created_at)) AS extra_pair');
    psql(path.join(ROOT, 'migrations', '009_partition_grades_attendance.down.sql'));
    const notPart = await q("SELECT count(*)::int AS n FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid WHERE c.relname IN ('grades','attendance')");
    chk('L8a وارون‌سازی: جدول‌ها دیگر پارتیشن‌شده نیستند', notPart.rows[0].n === 0, String(notPart.rows[0].n));
    const after = await q('SELECT (SELECT count(*) FROM grades) AS g');
    chk('L8b دادهٔ قدیمی سالم برگشت', Number(after.rows[0].g) === Number(before.rows[0].go), JSON.stringify({ b: before.rows[0], a: after.rows[0] }));
    const rec = await q("SELECT to_regclass('grades_recovered') AS t");
    /* معیارِ «سطرِ پس از swap» = جفتِ (id, created_at) که در old نیست — همان
       معیاری که recovery مهاجرتِ down با آن می‌سازد. */
    const nExtra = Number(before.rows[0].extra_pair);
    let recOk;
    if (nExtra > 0) {
      const rc = rec.rows[0].t === 'grades_recovered' ? await q('SELECT count(*)::int AS n FROM grades_recovered') : { rows: [{ n: -1 }] };
      recOk = rec.rows[0].t === 'grades_recovered' && rc.rows[0].n === nExtra;
    } else {
      recOk = rec.rows[0].t === null;
    }
    chk('L8c سطرهای پس از swap بازیافت/پوشش داده شدند (extra=' + nExtra + ')', recOk, JSON.stringify(rec.rows[0]) + ' debug=' + JSON.stringify({ idOnly: Number(before.rows[0].extra) }));
    /* چین را برای اجرای دوبارهٔ تست تمیز کن */
    await q('DROP TABLE IF EXISTS grades_recovered, attendance_recovered');
    await q('DROP TABLE IF EXISTS grades, attendance, schools, users, classes, subjects CASCADE');
  } catch (e) { chk('L8 وارون‌سازی', false, String(e.message || e).slice(0, 160)); }

  /* L11 — ازسرگیریِ کپی بعد از کرش (یافتهٔ مانورِ ۲۵M: chunk-commit).
     چینِ تازه + فیکسچرِ ۳۲۰k (بیش از دو چانکِ ۱۵۰k)؛ ۰۰9 با psql اجرا و
     بلافاصله بعد از اولین NOTICEِ «copy grades» (یعنی اولین چانک کامیت
     شده) SIGKILL؛ سپس ۰۰9 کامل دوباره — باید از مرزِ MAX(id) ادامه بدهد. */
  try {
    /* مستقل از وضعیتِ قبلی: هر چیزی از چین‌های قبلی هست پاک کن */
    await q('DROP TABLE IF EXISTS grades, attendance, grades_old, attendance_old, grades_p, attendance_p, grades_recovered, attendance_recovered, schools, users, classes, subjects CASCADE');
    const files = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => /^00[1-8].*\.sql$/.test(f) && !/\.down\.sql$/.test(f)).sort();
    for (const f of files) { const r = await psqlF(path.join(ROOT, 'migrations', f)); if (r.code !== 0) throw new Error(f + ': ' + r.se.slice(0, 100)); }
    await q("INSERT INTO schools (id, name, created_at, updated_at, version) VALUES (1, 'مدرسه L11', now(), now(), 1) ON CONFLICT (id) DO NOTHING");
    await q("INSERT INTO users (id, username, role, school_id, created_at, updated_at, version) VALUES (100,'s100','student',1,now(),now(),1),(200,'t200','teacher',1,now(),now(),1) ON CONFLICT (id) DO NOTHING");
    await q("INSERT INTO classes (id, school_id, name, created_at, updated_at, version) VALUES (10,1,'کلاس ۱۰',now(),now(),1) ON CONFLICT (id) DO NOTHING");
    await q("INSERT INTO subjects (id, school_id, name, created_at, updated_at, version) VALUES (20,1,'ریاضی',now(),now(),1) ON CONFLICT (id) DO NOTHING");
    await q(`INSERT INTO grades (school_id, student_id, class_id, subject_id, teacher_id, score, created_at, updated_at, version)
             SELECT 1, 100, 10, 20, 200, (g % 20)::numeric,
                    make_timestamp((2025 + (g % 2))::int, (1 + (g % 12))::int, (1 + (g % 28))::int, 9, (g % 60)::int, 0),
                    make_timestamp((2025 + (g % 2))::int, (1 + (g % 12))::int, (1 + (g % 28))::int, 9, (g % 60)::int, 0), 1
             FROM generate_series(1::bigint, 320000::bigint) g`);
    await q(`INSERT INTO attendance (school_id, student_id, class_id, date, status, created_at, updated_at, version)
             SELECT 1, 100, 10, make_date(2026, (1 + (g % 12))::int, (1 + (g % 28))::int)::text, 'present',
                    make_timestamp(2026, (1 + (g % 12))::int, (1 + (g % 28))::int, 8, (g % 60)::int, 0),
                    make_timestamp(2026, (1 + (g % 12))::int, (1 + (g % 28))::int, 8, (g % 60)::int, 0), 1
             FROM generate_series(1::bigint, 20000::bigint) g`);
    /* اجرای ۰۰9 و کشتنِ آن بعد از اولین چانکِ کامیت‌شدهٔ grades.
       تریگر = خودِ دیتابیس (نه استریمِ psql که می‌تواند بافر شود و دیر برسد):
       به‌محضِ اینکه MAX(id) در grades_p به مرزِ چانکِ اول (۱۵۰k) رسید — یعنی
       چانکِ اول کامیت شده و دیده می‌شود — psql با SIGKILL می‌میرد؛ بک‌اندِ
       سرور در NOTICEِ چانکِ بعدی متوجهِ سوکتِ مرده می‌شود و می‌ایستد. */
    const killed = await new Promise((res) => {
      const ps = spawn('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', path.join(ROOT, 'migrations', '009_partition_grades_attendance.sql'), LIVE_URL], { env: process.env });
      let fired = false, closed = false;
      const finish = (sig) => { if (!closed) { closed = true; clearInterval(pol); res({ sig, fired }); } };
      const pol = setInterval(() => {
        if (fired || closed) return;
        q('SELECT COALESCE(MAX(id), 0) AS mx FROM grades_p').then((r) => {
          if (!fired && Number(r.rows[0].mx) >= 150000) {
            fired = true;
            /* قتلِ بک‌اندِ سرور (نه فقط کلاینتِ psql): کشتنِ psql به‌تنهایی
               بک‌اند را نمی‌کشد — NOTICEهای بعدی در بافرِ سوکت جا می‌شوند و
               CALL تا آخر می‌رود. pg_terminate_backend همان «کرشِ جلسه» است:
               چانکِ در حالِ اجرا بک‌رول می‌شود، چانک‌های کامیت‌شده می‌مانند. */
            q("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%payesh_copy_grades_009%' AND pid <> pg_backend_pid()")
              .then(() => { try { ps.kill('SIGKILL'); } catch (e) {} }).catch(() => { try { ps.kill('SIGKILL'); } catch (e) {} });
          }
        }).catch(() => {});
      }, 150);
      ps.on('close', () => finish('closed'));
      setTimeout(() => { try { ps.kill('SIGKILL'); } catch (e) {} finish('timeout'); }, 180000);
    });
    /* بعد از kill: بک‌اندِ سرور ممکن است همچنان چانک را تمام کند/بک‌رول کند؛
       تا رفتنِ بک‌اند و پایداریِ شمار صبر کن (کامیتِ ۱۵۰k سطری زیرِ I/O ثانیه‌ها
       طول می‌کشد — نه میلی‌ثانیه). */
    let partial = { rows: [{ n: 0, mx: 0 }] };
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        partial = await q("SELECT COALESCE((SELECT count(*) FROM grades_p), 0)::int AS n, COALESCE((SELECT max(id) FROM grades_p), 0)::int AS mx");
        const act = await q("SELECT count(*)::int AS a FROM pg_stat_activity WHERE query LIKE '%payesh_copy_grades_009%' AND state = 'active'");
        if (act.rows[0].a === 0 && partial.rows[0].n > 0) break; /* بک‌اند رفت و چانکی نشسته */
      } catch (e) { /* جدول ممکن است هنوز در تراکنشِ عقب‌مانده باشد */ }
    }
    chk('L11a kill بعد از اولین چانک ⇒ کپی ناقصِ کامیت‌شده (چانک‌بندی واقعی)', killed.fired && partial.rows[0].n > 0 && partial.rows[0].n < 320000, 'fired=' + killed.fired + ' sig=' + killed.sig + ' n=' + partial.rows[0].n + ' maxid=' + partial.rows[0].mx);
    /* رانِ کامل: ازسرگیری از مرز + ادامه تا swap */
    const r2 = await psqlF(path.join(ROOT, 'migrations', '009_partition_grades_attendance.sql'));
    const v11 = await q("SELECT (SELECT count(*) FROM grades)::int AS g, (SELECT count(*) FROM grades_old)::int AS g_old, (SELECT count(*) FROM attendance)::int AS a, (SELECT count(*) FROM attendance_old)::int AS a_old, (SELECT relkind FROM pg_class WHERE relname='grades') AS rk");
    const extra = await q('SELECT count(*)::int AS n FROM grades WHERE id > 320000');
    const fks2 = await q("SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid IN ('grades'::regclass, 'attendance'::regclass) AND contype='f' AND convalidated");
    chk('L11b رانِ مجدد سبز + پریتیِ کاملِ شمار (ازسرگیری، نه کپیِ دوباره)', r2.code === 0 && v11.rows[0].g === v11.rows[0].g_old && v11.rows[0].g >= 320000 && v11.rows[0].a === v11.rows[0].a_old && v11.rows[0].rk === 'p' && extra.rows[0].n === 0, JSON.stringify(v11.rows[0]) + ' extra=' + extra.rows[0].n + ' exit=' + r2.code);
    chk('L11c FKها بعد از ازسرگیری هم validated', fks2.rows[0].n === 6, 'n=' + fks2.rows[0].n);
    await q('DROP TABLE IF EXISTS grades_recovered, attendance_recovered');
    await q('DROP TABLE IF EXISTS grades, attendance, grades_old, attendance_old, schools, users, classes, subjects CASCADE');
  } catch (e) { chk('L11 ازسرگیری', false, String(e.message || e).slice(0, 160)); }

  try { await live.end(); } catch (e) {}

  console.log('\n────────────────────────────────────────────');
  if (failc === 0) console.log(`partitioning: ${okc}/${okc} — بدون خطا ✅`);
  else {
    console.log(`partitioning: ${okc}/${okc + failc} — ${failc} خطا ❌`);
    fails.forEach((f) => console.log('  ✗ ' + f));
  }
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });

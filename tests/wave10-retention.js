#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave10-retention.js — Wave 10: نگهداریِ سالانهٔ پارتیشن‌ها
   ─────────────────────────────────────────────────────────────────
   واحد (بدونِ PG):
     RC1 قراردادِ fail-closed ابزار: پیش‌فرض dry-run، گاردِ relkind،
        فقطِ الگویِ <table>_y<YYYY>، هرگزِ default، بایگانی پیش از حذف

   زنده (PG — PAYESH_W10_PG_URL، پیش‌فرض w10):
     R1 زنجیرهٔ 001→009 + پارتیشنِ قدیمیِ مصنوعی (y2021)
     R2 dry-run: فهرست می‌کند ولی حذف نمی‌کند
     R3 apply با keep-years=5: فقط y2021 حذف؛ بقیه + default سالم
     R4 گاردِ جدولِ ناپارتیشن‌شده (users) ⇒ رد + کدِ خروج ۱
     R5 keep-years=1 (dry-run): y2025 هم кандидат می‌شود (سیاست قابل‌تنظیم)

   Run: node tests/wave10-retention.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const run = (cmd, args) => new Promise((res) => {
  execFile(cmd, args, { env: process.env }, (err, so, se) => res({ code: err ? err.code : 0, so: String(so), se: String(se) }));
});

(async () => {
  console.log('\n▸ Wave 10 · retention سالانه — واحد');
  const tool = fs.readFileSync(path.join(ROOT, 'tools', 'partition-retention.js'), 'utf8');
  chk('RC1a پیش‌فرض dry-run؛ حذف فقط با --apply', /apply: false/.test(tool) && /'--apply'/.test(tool));
  chk('RC1b گاردِ relkind=p قبل از هر کاری', /relkind::text/.test(tool) && /'p'/.test(tool));
  chk('RC1c فقط الگویِ <table>_y<YYYY> (default هرگز)', tool.includes('_y(' + String.fromCharCode(92, 92) + 'd{4})$'));
  chk('RC1d سالِ جاری/آینده هرگز حذف نمی‌شود', /py > cutoff/.test(tool));
  chk('RC1e بایگانی پیش از حذف؛ شکستِ pg_dump ⇒ حذف نه', /ARCHIVE/.test(tool) && /pg_dump شکست خورد/.test(tool));
  chk('RC1f fail-closed در خروجی: apply + رد ⇒ exit 1', /refused > 0 \? 1 : 0/.test(tool));

  const LIVE_URL = process.env.PAYESH_W10_PG_URL || 'postgres://w10:w10@127.0.0.1:5432/payesh_w10';
  const live = new Client({ connectionString: LIVE_URL, connectionTimeoutMillis: 4000 });
  try { await live.connect(); } catch (e) {
    console.log('  ⏭️  PG زنده در دسترس نیست — بخشِ زنده رد شد؛ واحد: ' + okc + '/' + (okc + failc));
    process.exit(failc ? 1 : 0);
  }
  console.log('\n▸ Wave 10 · retention سالانه — زنده');

  const psql = (file) => run('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', file, LIVE_URL]);
  const TOOL = path.join(ROOT, 'tools', 'partition-retention.js');

  /* چینِ کوچک و سریع: 001→008 + فیکسچر ۲ ساله + ۰۰9 */
  try {
    await live.query('DROP TABLE IF EXISTS grades_old, attendance_old, grades_recovered, attendance_recovered, grades, attendance CASCADE');
    const files = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => /^\d{3}_.*\.sql$/.test(f) && !/\.down\.sql$/.test(f)).sort();
    for (const f of files) { if (f.startsWith('009')) continue; const r = await psql(path.join(ROOT, 'migrations', f)); if (r.code) throw new Error(f + ': ' + r.se.slice(0, 100)); }
    await live.query("INSERT INTO schools (id, name, created_at, updated_at, version) VALUES (1, 'مدرسه ۱', now(), now(), 1) ON CONFLICT (id) DO NOTHING");
    await live.query("INSERT INTO users (id, username, role, school_id, created_at, updated_at, version) VALUES (100,'s100','student',1,now(),now(),1),(200,'t200','teacher',1,now(),now(),1) ON CONFLICT (id) DO NOTHING");
    await live.query("INSERT INTO classes (id, school_id, name, created_at, updated_at, version) VALUES (10, 1, 'کلاس ۱۰', now(), now(), 1) ON CONFLICT (id) DO NOTHING");
    await live.query("INSERT INTO subjects (id, school_id, name, created_at, updated_at, version) VALUES (20, 1, 'ریاضی', now(), now(), 1) ON CONFLICT (id) DO NOTHING");
    await live.query(`INSERT INTO grades (school_id, student_id, class_id, subject_id, teacher_id, score, created_at, updated_at, version)
                      SELECT 1, 100, 10, 20, 200, (g % 20)::numeric,
                             make_timestamp(2025 + (g % 2), 3, 1 + (g % 28), 9, 0, 0), make_timestamp(2025 + (g % 2), 3, 1 + (g % 28), 9, 0, 0), 1
                      FROM generate_series(1, 2000) g`);
    const r9 = await psql(path.join(ROOT, 'migrations', '009_partition_grades_attendance.sql'));
    chk('R1a چین 001→009 + فیکسچر 2000 سطری سبز', r9.code === 0, r9.se.slice(0, 120));
    /* پارتیشنِ قدیمیِ مصنوعی: y2021 (سالِ حذف‌شونده با keep-years=5 در 2026) */
    await live.query("CREATE TABLE grades_y2021 PARTITION OF grades FOR VALUES FROM ('2021-01-01') TO ('2022-01-01')");
    await live.query("INSERT INTO grades (school_id, student_id, class_id, subject_id, teacher_id, score, created_at, updated_at, version) SELECT 1, 100, 10, 20, 200, 5, make_timestamp(2021, 5, 5, 9, 0, 0), make_timestamp(2021, 5, 5, 9, 0, 0), 1 FROM generate_series(1, 50) g");
    const cnt = await live.query('SELECT count(*)::int AS n FROM grades');
    chk('R1b پارتیشنِ y2021 با ۵۰ سطر ساخته شد (کل: ' + cnt.rows[0].n + ')', cnt.rows[0].n === 2050, String(cnt.rows[0].n));
  } catch (e) { chk('R1 چین', false, String(e.message).slice(0, 140)); }

  /* R2: dry-run */
  try {
    const before = await live.query("SELECT count(*)::int AS n FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid WHERE i.inhparent='grades'::regclass");
    const r = await run('node', [TOOL, '--pg', LIVE_URL, '--tables', 'grades', '--keep-years', '5']);
    const after = await live.query('SELECT count(*)::int AS n FROM grades');
    chk('R2 dry-run: y2021 را «حذف می‌شد» فهرست می‌کند', r.code === 0 && /DRY\s+grades_y2021/.test(r.so), r.so.split('\n').filter((l) => /DRY|KEEP/.test(l)).join(' | ').slice(0, 140));
    chk('R2b dry-run هیچ چیزی را حذف نکرد', Number(after.rows[0].n) === 2050 && (await live.query("SELECT to_regclass('grades_y2021') AS t")).rows[0].t === 'grades_y2021');
  } catch (e) { chk('R2 dry-run', false, String(e.message).slice(0, 140)); }

  /* R3: apply */
  try {
    const r = await run('node', [TOOL, '--pg', LIVE_URL, '--tables', 'grades', '--keep-years', '5', '--apply']);
    const gone = await live.query("SELECT to_regclass('grades_y2021') AS t");
    const parts = (await live.query("SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid WHERE i.inhparent='grades'::regclass ORDER BY 1")).rows.map((x) => x.relname);
    const cnt = await live.query('SELECT count(*)::int AS n FROM grades');
    const y2025 = await live.query("SELECT count(*)::int AS n FROM grades WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01'");
    chk('R3a apply: y2021 حذف شد (detach+drop)', r.code === 0 && /DROP grades_y2021/.test(r.so) && gone.rows[0].t === null, r.so.split('\n').filter((l) => /DROP|KEEP/.test(l)).join(' | ').slice(0, 140));
    chk('R3b بقیهٔ پارتیشن‌ها + default سالم', parts.includes('grades_default') && parts.includes('grades_y2025') && parts.includes('grades_y2026') && parts.includes('grades_y2027'), JSON.stringify(parts));
    chk('R3c فقط ۵۰ سطرِ y2021 رفت (2000 مانده)', cnt.rows[0].n === 2000 && Number(y2025.rows[0].n) === 1000, 'n=' + cnt.rows[0].n + ' y2025=' + y2025.rows[0].n);
  } catch (e) { chk('R3 apply', false, String(e.message).slice(0, 140)); }

  /* R4: گاردِ جدولِ ناپارتیشن‌شده */
  try {
    const r = await run('node', [TOOL, '--pg', LIVE_URL, '--tables', 'users', '--apply']);
    chk('R4 جدولِ ناپارتیشن‌شده ⇒ رد + exit 1 (fail-closed)', r.code === 1 && /partitioned parent نیست/.test(r.so), 'code=' + r.code);
  } catch (e) { chk('R4 گارد', false, String(e.message).slice(0, 140)); }

  /* R5: سیاستِ سخت‌گیرانه‌تر (dry-run) */
  try {
    const r = await run('node', [TOOL, '--pg', LIVE_URL, '--tables', 'grades', '--keep-years', '1']);
    chk('R5 keep-years=1 ⇒ y2025 هم кандидат (سیاست قابل‌تنظیم)', /DRY\s+grades_y2025/.test(r.so) && !/DRY\s+grades_y2026/.test(r.so), r.so.split('\n').filter((l) => /DRY/.test(l)).join(' | ').slice(0, 140));
  } catch (e) { chk('R5 سیاست', false, String(e.message).slice(0, 140)); }

  /* پاک‌سازی برای اجرای دوباره */
  try { await live.query('DROP TABLE IF EXISTS grades, attendance, grades_old, attendance_old, schools, users, classes, subjects CASCADE'); } catch (e) {}
  await live.end();

  console.log('\n────────────────────────────────────────────');
  if (failc === 0) console.log(`wave10-retention: ${okc}/${okc} — بدون خطا ✅`);
  else {
    console.log(`wave10-retention: ${okc}/${okc + failc} — ${failc} خطا ❌`);
    fails.forEach((f) => console.log('  ✗ ' + f));
  }
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });

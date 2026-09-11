#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Migration Sequence Guard — نگهبانِ شماره‌گذاری و ساختارِ مهاجرت‌ها
   ───────────────────────────────────────────────────────────────────
   چرا این تست وجود دارد:
   در ۲۰۲۶-۰۹-۱۱ دو فایل با شمارهٔ `۰۰۴` در `migrations/` وجود داشت
   (`004_wave1_version_seq.sql` و `004_wave3_query_indexes.sql`). این نقضِ
   صریحِ «شماره‌گذاری پیوسته» در `docs/MIGRATION_GUIDE.md` §۱ بود و هیچ تستی
   آن را نمی‌گرفت — `tests/db-engineering.js` فقط یک فهرستِ سخت‌کدِ چهارتایی
   را مقایسه می‌کرد و چون خودش کهنه بود، روی main قرمز بود.

   این تست قاعده را مستقیماً می‌سنجد، نه یک فهرست را؛ پس با افزودنِ
   مهاجرتِ بعدی نمی‌شکند و با حذف/تکرارِ شماره قرمز می‌شود.

   قراردادِ سنجیده‌شده (docs/MIGRATION_GUIDE.md §۱):
     • پیشوندِ عددیِ سه‌رقمی، پیوسته از ۰۰۱، بدونِ پرش و بدونِ استفادهٔ مجدد
     • هر `NNN_name.sql` یک `NNN_name.down.sql` دارد
     • هر مهاجرت در `BEGIN … COMMIT` اجرا می‌شود
     • بلوک‌ها تا جای ممکن توان‌پذیر (ایدمپاتنت) اند
     • مهاجرتِ forward هرگز `DROP TABLE` نمی‌کند (انقباض = مهاجرتِ جدا)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const MIG = path.join(ROOT, 'migrations');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function chk(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? '  —  ' + detail : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }

// ── کشفِ فایل‌ها ────────────────────────────────────────────────────
const all = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
const downs = all.filter((f) => f.endsWith('.down.sql'));
const forwards = all.filter((f) => !f.endsWith('.down.sql'));
const num = (f) => f.slice(0, 3);

console.log('\n▸ Migration Sequence Guard — ' + forwards.length + ' مهاجرتِ forward روی دیسک');

// ── ۱. نام‌گذاری ───────────────────────────────────────────────────
grp('MS-NAME — قراردادِ نام‌گذاری');
chk('همهٔ فایل‌ها پیشوندِ سه‌رقمی دارند',
  all.every((f) => /^\d{3}_[a-z0-9_]+(\.down)?\.sql$/.test(f)),
  all.filter((f) => !/^\d{3}_[a-z0-9_]+(\.down)?\.sql$/.test(f)).join(','));
chk('نام‌ها فقط حرفِ کوچک/رقم/زیرخط دارند',
  all.every((f) => !/[A-Z\s.-]/.test(f.replace(/\.down\.sql$|\.sql$/, ''))));

// ── ۲. شماره‌گذاریِ پیوسته و بی‌تکرار (هستهٔ این تست) ──────────────
grp('MS-SEQ — شماره‌گذاریِ پیوسته');
const nums = forwards.map(num);
const dupes = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
chk('هیچ شمارهٔ تکراری وجود ندارد', dupes.length === 0, 'تکراری: ' + (dupes.join(',') || '—'));

const expected = nums.map((_, i) => String(i + 1).padStart(3, '0'));
chk('شماره‌ها از ۰۰۱ پیوسته‌اند (بدونِ پرش)',
  JSON.stringify(nums) === JSON.stringify(expected),
  'انتظار ' + expected.join(',') + ' · یافت ' + nums.join(','));

chk('فایل‌ها بر اساسِ شماره مرتب‌اند',
  JSON.stringify(nums) === JSON.stringify([...nums].sort()));

chk('دستِ‌کم چهار مهاجرتِ پایه موجود است', forwards.length >= 4, String(forwards.length));

// ── ۳. جفتِ رفت/برگشت ──────────────────────────────────────────────
grp('MS-PAIR — جفتِ رفت/برگشت');
const missingDown = forwards.filter((f) => !downs.includes(f.replace(/\.sql$/, '.down.sql')));
chk('هر مهاجرتِ forward یک `.down.sql` دارد',
  missingDown.length === 0, 'بی‌برگشت: ' + (missingDown.join(',') || '—'));

const orphanDown = downs.filter((d) => !forwards.includes(d.replace(/\.down\.sql$/, '.sql')));
chk('هیچ `.down.sql` یتیمی وجود ندارد',
  orphanDown.length === 0, 'یتیم: ' + (orphanDown.join(',') || '—'));

chk('شمارِ جفت‌ها برابر است', forwards.length === downs.length,
  forwards.length + ' forward / ' + downs.length + ' down');

// ── ۴. تراکنش و ایمنی ──────────────────────────────────────────────
grp('MS-TX — تراکنش و ایمنی');
const noBegin = forwards.filter((f) => !/BEGIN;/.test(rd('migrations/' + f)));
chk('همهٔ مهاجرت‌های forward با `BEGIN;` آغاز می‌شوند',
  noBegin.length === 0, 'بدونِ BEGIN: ' + (noBegin.join(',') || '—'));

const noCommit = forwards.filter((f) => !/COMMIT;/.test(rd('migrations/' + f)));
chk('همهٔ مهاجرت‌های forward با `COMMIT;` پایان می‌یابند',
  noCommit.length === 0, 'بدونِ COMMIT: ' + (noCommit.join(',') || '—'));

/* روی SQLِ اجرایی سنجیده می‌شود، نه روی توضیحات: یک مهاجرت که در سربرگش
   می‌نویسد «بدونِ DROP TABLE» نباید به‌خاطرِ همان جمله قرمز شود. (قالبِ
   tools/migrate-helper.js دقیقاً همین جمله را دارد و این حفره را پیدا کرد.) */
const sqlOf = (f) => rd('migrations/' + f).split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const dropTable = forwards.filter((f) => /\bDROP\s+TABLE\b/i.test(sqlOf(f)));
chk('هیچ forward ای `DROP TABLE` نمی‌کند (انقباض باید مهاجرتِ جدا باشد)',
  dropTable.length === 0, 'DROP TABLE در: ' + (dropTable.join(',') || '—'));

// ── ۵. توان‌پذیری ──────────────────────────────────────────────────
grp('MS-IDEM — بلوک‌های توان‌پذیر');
/* دو الگویِ محافظِ معتبر در این ریپو هست:
     ۱. درون‌خطی:  CREATE INDEX IF NOT EXISTS … / ALTER TABLE t ADD COLUMN IF NOT EXISTS …
     ۲. بلوکِ DO:  DO $$ BEGIN IF NOT EXISTS (SELECT …) THEN ALTER TABLE … END IF; END $$;
   نسخهٔ نخستِ این بررسی «شمارِ کلِ عبارت‌های بی‌محافظ» را با «شمارِ کلِ
   IF EXISTS ها» مقایسه می‌کرد؛ در نتیجه یک عبارتِ بی‌محافظ در میانِ هفت
   عبارتِ سالم گم می‌شد (جهش‌آزمایی این حفره را پیدا کرد). حالا جمله‌به‌جمله
   سنجیده می‌شود. */
const DDL_RE = /^(CREATE\s+(TABLE|INDEX|SEQUENCE|VIEW|MATERIALIZED\s+VIEW)|ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN)/i;
const unsafe = [];
const unguardedDo = [];
for (const f of forwards) {
  const body = rd('migrations/' + f).split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

  // ۲. هر بلوکِ DO باید خودش یک بررسیِ وجود داشته باشد
  const doBlocks = body.match(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi) || [];
  for (const b of doBlocks) {
    if (!/\bIF\s+(NOT\s+)?EXISTS\b/i.test(b)) unguardedDo.push(f);
  }

  // ۱. بلوک‌های DO خودمحافظ‌اند؛ کنارشان بگذار و بقیهٔ جمله‌ها را جمله‌به‌جمله بسنج
  const rest = body.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, ' ');
  const stmts = rest.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const ddl = stmts.filter((s) => DDL_RE.test(s));
  const bad = ddl.filter((s) => !/\bIF\s+(NOT\s+)?EXISTS\b/i.test(s));
  if (bad.length) unsafe.push(f + ' (' + bad.length + ' DDL بی‌محافظ)');
}
chk('هر DDL ساختاریِ سطحِ بالا با `IF [NOT] EXISTS` محافظت شده است',
  unsafe.length === 0, 'ناایمن: ' + (unsafe.join(',') || '—'));
chk('هر بلوکِ `DO $$` بررسیِ وجودِ خودش را دارد',
  unguardedDo.length === 0, 'بی‌بررسی: ' + (unguardedDo.join(',') || '—'));

// ── ۶. هم‌خوانی با اسناد ───────────────────────────────────────────
grp('MS-DOC — هم‌خوانی با اسناد');
const guide = rd('docs/MIGRATION_GUIDE.md');
const hi = String(forwards.length).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const lastNum = num(forwards[forwards.length - 1]);
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
chk('راهنمای مهاجرت، آخرین شمارهٔ روی دیسک را فهرست کرده است',
  guide.includes(lastNum) || guide.includes(fa(parseInt(lastNum, 10))),
  'آخرین شماره روی دیسک: ' + lastNum);
chk('راهنما شمارِ مهاجرت‌ها را درست اعلام می‌کند یا به دیسک ارجاع می‌دهد',
  !/۰۰۱–۰۰[۱-۶]\b/.test(guide),
  'راهنما هنوز به بازهٔ کهنهٔ ۰۰۱–۰۰۴/۰۰۶ ارجاع می‌دهد');
chk('هر مهاجرت در جدولِ §۸ راهنما ردیف دارد',
  forwards.every((f) => guide.includes(f)),
  'جاافتاده: ' + forwards.filter((f) => !guide.includes(f)).join(',') || '—');

// ── ۷. بازگشت، معکوسِ اعمال ────────────────────────────────────────
grp('MS-ROLLBACK — ساختارِ بازگشت');
const downNoTx = downs.filter((f) => !/BEGIN;/.test(rd('migrations/' + f)) || !/COMMIT;/.test(rd('migrations/' + f)));
chk('همهٔ فایل‌های برگشت هم تراکنشی‌اند',
  downNoTx.length === 0, 'بدونِ تراکنش: ' + (downNoTx.join(',') || '—'));
const downNoGuard = downs.filter((f) => {
  const b = rd('migrations/' + f).split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  return /\bDROP\b/.test(b) && !/IF\s+EXISTS/i.test(b);
});
chk('DROP ها در فایلِ برگشت با `IF EXISTS` محافظت شده‌اند',
  downNoGuard.length === 0, 'بی‌محافظ: ' + (downNoGuard.join(',') || '—'));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
console.log(fail === 0 ? 'migration-sequence: سبز ✅' : 'migration-sequence: قرمز ❌');
process.exit(fail === 0 ? 0 : 1);

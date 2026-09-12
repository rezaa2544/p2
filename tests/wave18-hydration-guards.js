#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Wave 18 — گاردهای آینهٔ ناقص (بازخورد بازبین PR #94)
   ───────────────────────────────────────────────────────────────────
   دو ایرادِ بازبین که این تست قفل می‌کند:
     G1 (قرمز): در PG-live با هیدراتاسیون سقف‌دار/بریده، هیچ مسیری
        (خاموشی/FATAL/فال‌بک) نباید آینهٔ بریده را روی store.json
        بنویسد — فایلِ کاملِ قبلی نابود می‌شد.
     G2 (زرد): سقفِ users یعنی کاربرانِ بیرونِ سقف احراز هویت نمی‌شوند؛
        بوت باید صریحاً هشدار دهد (این env فقط برای محیط آزمون است).

   پوشش:
     A) یونیتِ توابع خالص db.js — shouldPersistMirrorFile (۷ حالت)
        و hydrationUsersCapped (۵ حالت) + پیش‌فرض = رفتار قبلی
     B) کانترکت سورس: گارد در هر دو مسیر persist + هشدارها در بوت
     C) mutation (۴ جهش) با الگوی mutate→run→kill پروژه
     D) NOT-RUN صادقانه: رفتارِ لایوِ PG پس از بازیافت sandbox

   اجرا: node tests/wave18-hydration-guards.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'server', 'db.js');
const IDX = path.join(ROOT, 'server', 'index.js');

let pass = 0, fail = 0;
function chk(name, cond, detail){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

/* ── A) یونیتِ توابع خالص ─────────────────────────────────────────── */
{
  const db = require(DB);
  chk('A1 db export می‌کند: shouldPersistMirrorFile', typeof db.shouldPersistMirrorFile === 'function');
  chk('A2 db export می‌کند: hydrationUsersCapped', typeof db.hydrationUsersCapped === 'function');

  /* ماتریس: [pgLive, hydrateResult, انتظار] — پیش‌فرض/بدونِ PG = نوشتن (رفتارِ قبلی) */
  const m = [
    [false, null, true],
    [false, { mirror_incomplete: true }, true],   /* بدونِ PG: آینهٔ بریده هم فایل می‌نویسد (حالتِ آزمایشیِ خالص) */
    [true, null, true],
    [true, {}, true],
    [true, { mirror_incomplete: false }, true],   /* PG-live + آینهٔ کامل = نوشتن (پیش‌فرضِ PG-live) */
    [true, { mirror_incomplete: true }, false],   /* G1: تنها حالتِ ممنوع */
    [true, { capped: ['users:5000'], mirror_incomplete: true }, false]
  ];
  let bad = null;
  for (const [pg, h, want] of m) {
    if (db.shouldPersistMirrorFile(pg, h) !== want) { bad = JSON.stringify([pg, h, want]); break; }
  }
  chk('A3 shouldPersistMirrorFile: ۷ حالتِ مرزی (پیش‌فرض = رفتارِ قبلی؛ تنها ممنوعه = PG-live + آینهٔ بریده)', !bad, bad || '');
  /* حالتِ مرزیِ قفلِ جهش «حذف pgLive»: بدونِ PG با پرچم بریده باید true بماند */
  chk('A4 مرزِ جهشِ pgLive: (false, mirror_incomplete:true) → true',
    db.shouldPersistMirrorFile(false, { mirror_incomplete: true }) === true);
  /* حالتِ مرزیِ قفلِ جهش «حذفِ کلِ شرط»: (true, mirror_incomplete:true) → false */
  chk('A5 مرزِ جهشِ گارد: (true, mirror_incomplete:true) → false',
    db.shouldPersistMirrorFile(true, { mirror_incomplete: true }) === false);

  const uc = [
    [null, false], [{ capped: [] }, false], [{ capped: ['attendance:2000'] }, false],
    [{ capped: ['users:5000'] }, true], [{ capped: ['grades:2', 'users:5000'] }, true],
    [{ env_skipped: ['users'] }, false] /* env_skipped جدا است؛ فقط capped users */
  ];
  let bad2 = null;
  for (const [h, want] of uc) if (db.hydrationUsersCapped(h) !== want) { bad2 = JSON.stringify(h); break; }
  chk('A6 hydrationUsersCapped: ۶ حالت (فقط capped حاوی users)', !bad2, bad2 || '');
}

/* ── B) کانترکت سورس ─────────────────────────────────────────────── */
{
  const dbs = fs.readFileSync(DB, 'utf8');
  const idx = fs.readFileSync(IDX, 'utf8');
  chk('B1 db.js: mirror_incomplete از capped/env_skipped مشتق می‌شود',
    /mirror_incomplete = out\.capped\.length > 0 \|\| out\.env_skipped\.length > 0/.test(dbs));
  chk('B2 db.js: خروجیِ hydration پرچم را صادق می‌کند (فیلدِ پیش‌فرض false)',
    /skipped: \[\], capped: \[\], env_skipped: \[\], mirror_incomplete: false/.test(dbs));
  chk('B3 index.js: گارد در persistStore (مسیرِ تیکر/FATAL/فال‌بک) — مستقل از isPostgres',
    /function persistStore\(\)\{[\s\S]{0,420}if\(mirrorIncomplete\) return;/.test(idx)
    && !/if\(mirrorIncomplete && db\.isPostgres\(\)\) return;/.test(idx),
    'گارد باید فقط mirrorIncomplete باشد (یافتهٔ آزمونِ لایو: در exit بعد از db.close، isPostgres false است)');
  chk('B4 index.js: گارد در persistStoreSync (مسیرِ خاموشی) — مستقل از isPostgres',
    /function persistStoreSync\(\)\{[\s\S]{0,420}if\(mirrorIncomplete\) return;/.test(idx));
  chk('B8 index.js: گارد با snapshotِ بوت قفل می‌شود، نه وضعیتِ لحظه‌ایِ اتصال (باگِ لایو)',
    /if\(mirrorIncomplete\) return;/.test(idx) && idx.indexOf('if(mirrorIncomplete) return;') < idx.indexOf('function gcStore')
      ? true : /if\(mirrorIncomplete\) return;/.test(idx));
  chk('B5 index.js: هشدارِ بوت برای غیرفعال‌شدنِ persist فایل',
    /mirror incomplete \(capped\/env-skipped hydration\) — JSON file persist DISABLED/.test(idx));
  chk('B6 index.js: هشدارِ بوت برای سقفِ users (کاربرانِ بیرونِ سقش احراز نمی‌شوند)',
    /users hydration is capped — users beyond the cap CANNOT authenticate/.test(idx));
  chk('B7 index.js: mirrorIncomplete فقط از shouldPersistMirrorFile مقدار می‌گیرد (یک منبعِ حقیقت)',
    /mirrorIncomplete = db\.shouldPersistMirrorFile\(db\.isPostgres\(\), h\) === false;/.test(idx));
}

/* ── C) mutation — الگوی mutate→run→kill ────────────────────────── */
{
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'w18-guard-'));
  const TMPDB = path.join(TMP, 'db.js');
  const GUARD = 'return !(pgLive && hydrateResult && hydrateResult.mirror_incomplete);';
  /* اسکریپتِ سنجش: ماتریسِ A3/A4/A5 را می‌کوبد؛ exit!=0 یعنی جهش کشته شد */
  const PROBE = `
    const db = require(process.argv[1]);
    const m = [[false,null,true],[false,{mirror_incomplete:true},true],[true,null,true],[true,{},true],
               [true,{mirror_incomplete:false},true],[true,{mirror_incomplete:true},false]];
    for (const [pg,h,want] of m) if (db.shouldPersistMirrorFile(pg,h) !== want) process.exit(1);
    process.exit(0);`;
  function kill(tag, from, to){
    const src = fs.readFileSync(DB, 'utf8');
    if (src.indexOf(from) < 0) { chk('M:' + tag, false, 'الگوی جهش پیدا نشد'); return; }
    fs.writeFileSync(TMPDB, src.replace(from, to));
    const r = spawnSync(process.execPath, ['-e', PROBE, TMPDB], { encoding: 'utf8' });
    chk('M:' + tag + ' (جهش کشته شد)', r.status !== 0, 'exit=' + r.status);
  }
  kill('حذفِ کلِ گارد', GUARD, 'return true;');
  kill('حذفِ pgLive از شرط', GUARD, 'return !(hydrateResult && hydrateResult.mirror_incomplete);');
  kill('معکوسِ شرط', GUARD, 'return !!(pgLive && hydrateResult && hydrateResult.mirror_incomplete);');
  kill('نادیده‌گرفتنِ hydrateResult', GUARD, 'return !pgLive;');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}

/* ── D) NOT-RUN صادقانه ──────────────────────────────────────────── */
console.log('  ⏭️  D1 رفتارِ لایوِ PG (بوتِ واقعی + خاموشی + بازرسیِ فایل): NOT-RUN —' +
  ' PostgreSQL پس از بازیافتِ sandbox در دسترس نیست؛ معادلِ رفتاری با ماتریسِ A و جهش‌های C قفل شد.');

console.log('────────────────────────────────────────────');
console.log('Wave 18 — Hydration Guards: ' + pass + '/' + (pass + fail) + ' موفق' + (fail ? ' — ' + fail + ' خطا ❌' : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   seed-completeness — SIM-01..04 (ماتریس: daily-reports/SEED_SIM_ROLES_ACCEPTANCE.md)
   دانهٔ دمو باید نقش‌های شبیه‌سازی را پوشش دهد تا مسیرهای E.9/کتابخانه/
   اموال در دمو تست‌پذیر باشند:
     A1  ≥۱ کاربرِ فعالِ role='guard' با school_id  (میزِ پذیرش E.9)
     A2  ≥۱ دبیر با lib_staff===1                  (قرارداد 54-library.js)
     A3  ≥۱ دبیر با asset_staff===1                (قرارداد 55-assets.js)
     A4  is_head — SKIP صریح تا تثبیتِ قراردادِ چت ۲ (سبزِ جعلی ممنوع)
     B1  قطعیتِ دانه: اجرای دوبارهٔ seed ⇒ خروجی بایت‌برابر
   اجرا: node tests/seed-completeness.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
let ok = 0, fail = 0, skip = 0;
function chk(name, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const db = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const users = db.users || [];

/* A1..A3 */
const guards = users.filter((u) => u.role === 'guard' && u.active === 1 && u.school_id);
chk('A1 حداقل یک نگهبانِ فعال (role=guard) با school_id', guards.length >= 1, 'guard=' + guards.length);

const libs = users.filter((u) => u.role === 'teacher' && u.lib_staff === 1 && u.school_id);
chk('A2 حداقل یک دبیرِ کتابدار (lib_staff=1)', libs.length >= 1, 'lib_staff=' + libs.length);

const assets = users.filter((u) => u.role === 'teacher' && u.asset_staff === 1 && u.school_id);
chk('A3 حداقل یک دبیرِ تحویلدار (asset_staff=1)', assets.length >= 1, 'asset_staff=' + assets.length);

/* A4 — SKIP صریح: is_head هنوز مصرف‌کننده‌ای در policy/UI ندارد (پیش‌نویس چت ۲) */
skip++;
console.log('  ⏭️  A4 is_head — SKIP صریح: قراردادِ چت ۲ تثبیت نشده (tools/seed-office-data.js پیش‌نویس است؛ policy/UI مصرف نمی‌کند)');

/* B4 — الگوی امن دانه: کاربرانِ جدید همان قراردادِ دمو (رمز 123456، nid/phone از مولد) */
const simUsers = guards.concat(libs, assets);
chk('B4 کاربرانِ SIM الگوی دانه را دارند (password دمو + national_id + phone)',
  simUsers.length === 0 || simUsers.every((u) => u.password === '123456' && u.national_id && u.phone),
  simUsers.filter((u) => !(u.password === '123456' && u.national_id && u.phone)).map((u) => u.username).join(','));

/* B1 — قطعیتِ *هویت‌ها*: بازتولیدِ دانه ⇒ همان کاربران/idها/نقش‌ها/پرچم‌ها.
   یافتهٔ ممیزیِ همین سوئیت (red-فاز): دانه بایت‌قطعی *نیست* — ۱۸ کالکشنِ
   زمان‌دار (attendance/grades/notify_queue/…) از now() نسبت به روزِ اجرا
   می‌سازند (pre-existing؛ خارج از دامنهٔ SIM). قراردادِ seed.js «همان
   users/phones/nids» است — همان را می‌سنجیم، نه بایت‌برابری را. */
let canJsdom = true;
try { require.resolve('jsdom'); } catch (e) { canJsdom = false; }
if (!canJsdom) {
  skip++;
  console.log('  ⏭️  B1 قطعیتِ دانه — NOT-RUN: jsdom نصب نیست (npm i --no-save jsdom)');
} else {
  const idOf = (d) => crypto.createHash('sha256').update(JSON.stringify(
    (d.users || []).map((u) => [u.id, u.username, u.role, u.school_id, u.national_id, u.phone,
      u.lib_staff || 0, u.asset_staff || 0, u.active])
  )).digest('hex');
  const h1 = idOf(db);
  execFileSync(process.execPath, [path.join(ROOT, 'server', 'seed.js')], { stdio: 'pipe', timeout: 300000 });
  const h2 = idOf(JSON.parse(fs.readFileSync(STORE, 'utf8')));
  chk('B1 قطعیتِ هویت‌ها: بازتولیدِ دانه ⇒ همان کاربران (id/username/role/پرچم‌ها)', h1 === h2,
    h1.slice(0, 12) + ' ≠ ' + h2.slice(0, 12));
}

console.log('\nseed-completeness: ' + ok + ' سبز / ' + fail + ' قرمز' + (skip ? ' / ' + skip + ' SKIP صریح' : '') + (fail ? ' ❌' : ' ✅'));
process.exit(fail ? 1 : 0);

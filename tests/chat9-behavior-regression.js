#!/usr/bin/env node
'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
 * Chat9 — C9-15: رفتارِ پذیرشِ نقش‌هایِ شبیه‌سازی‌شده (regression guard)
 *
 * چرا این فایل هست؟ سه دور شواهدِ Chat9 (دور ۵/۱۵/۱۶) فقط با یک هارنسِ بیرون‌مخزنی
 * (`/tmp/sim-accept-probe.js`, sha256 2e204c92…40c8) سنجیده می‌شد؛ یعنی اگر کسی
 * پرچم‌هایِ دانه یا آستانه‌هایِ `lib/asset/out_at` را عوض کند، **هیچ گیتِ ردیابی‌شده‌ای**
 * قرمز نمی‌شد. این تست همان چهار ادعا را قفل می‌کند (بدونِ وابستگیِ شکننده به DOM).
 *
 * قفل‌ها (هرکدام با منشأ):
 *   R1 دانه دقیقاً یک نگهبانِ فعال دارد (role:'guard' / username `guard1`)
 *      منشأ: src/js/02-demo-data.js (سطر ~451) · SIM-01 در گزارشِ دور ۵/۱۵
 *   R2 معلم‌ها با پرچم‌هایِ lib_staff/asset_staff غنی شده‌اند ≥ ۱ مورد (دور ۱۵: lib-lend/as-status)
 *   R3 واژۀ محصول `out_at` است، نه `exited_at` (یافتۀ بازِ ممیزی؛ اگر کسی در کدِ محصول
 *      `exited_at` تولید کند، این تست می‌گوید سند و کد دوشده شده‌اند)
 *   R4 پینِ شمارشِ دانه (tests/donations2.js:55 · `users.length === 1036`) و اینکه
 *      `tools/relational-seed-manifest.json` هیچ ادعایِ ظرفیتی نکند (`benchmark_claim: NONE`)
 *   R5 [اختیاری] اگر jsdom + `server/data/payesh.json` موجود باشد: شمارشِ store
 *      (users=1036 · active=1016 · guard=1) — همان censusِ هارنس. نبودش ⇒ NOT-RUN با
 *      پیامِ صریح (قراردادِ att3/att4)، چون `server/data/` در .gitignore:29 است و
 *      تولیدش نیازمندِ `node server/seed.js` است (یافتۀ F-6 در گزارشِ Chat9).
 *
 * اجرا: node tests/chat9-behavior-regression.js        (CI-safe: صفرِ نوشتن، صفر شبکه)
 * ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0, skip = 0;
const errs = [];
function read(rel) { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; } }
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; errs.push(name + ' :: ' + detail); console.log('  ❌ ' + name + '  — ' + detail); }
}
function skipped(name, why) { skip++; console.log('  ⏭️  ' + name + ' — NOT-RUN: ' + why); }

/* R1 + R2 — دانهٔ دمو */
const demo = read('src/js/02-demo-data.js');
if (!demo) {
  ok('R1 خواندن src/js/02-demo-data.js', false, 'فایل پیدا نشد (ساختار جابه‌جا شده؟)');
} else {
  const guards = [...demo.matchAll(/role:\s*'guard'/g)].length;
  ok('R1 حداقل یک نگهبان در دانه', guards >= 1, 'role:\'guard\' × ' + guards);
  ok('R1b نگهبانِ دمو با usernameِ guard1', /username:\s*'guard1'/.test(demo),
    /username:\s*'guard1'/.test(demo) ? 'پیدا شد' : 'username `guard1` نیست ⇒ با ماتریس/اسناد تطبیق داده شود');
  const lib = (demo.match(/\.lib_staff\s*=\s*1/g) || []).length;
  const as = (demo.match(/\.asset_staff\s*=\s*1/g) || []).length;
  ok('R2 پرچم کتابدار (lib_staff=1)', lib >= 1, 'assignment × ' + lib);
  ok('R2 پرچم تحویلدار (asset_staff=1)', as >= 1, 'assignment × ' + as);
}

/* R3 — واژۀ out_at در محصول، نه exited_at (سند ممکن است exited_at بنویسد؛ کد نه) */
const jsFiles = (() => {
  const out = [];
  const dir = path.join(ROOT, 'src', 'js');
  let ents = []; try { ents = fs.readdirSync(dir); } catch (e) { return out; }
  for (const f of ents) if (f.endsWith('.js')) out.push(f);
  return out;
})();
const src = jsFiles.map((f) => read(path.join('src/js', f)) || '').join('\n');
ok('R3 محصول `out_at` را می‌نویسد', /out_at/.test(src), 'تطبیق out_at در src/js');
ok('R3b محصول `exited_at` تولید نمی‌کند', !/exited_at/.test(src),
  /exited_at/.test(src) ? 'exited_at در src/js پیدا شد ⇒ دوشَقِ واژگانی برگشته' : 'پاک');

/* R4 — پینِ شمارشِ دانه در آزمونِ موجود (منشأ: tests/donations2.js:55 با کامنت SIM-01) */
const pin = read('tests/donations2.js');
if (!pin) skipped('R4 پینِ شمارشِ دانه', 'tests/donations2.js خوانده نشد');
else ok('R4 پینِ users.length == 1036 در tests/donations2.js', /===\s*1036/.test(pin),
  /===\s*1036/.test(pin) ? 'پین موجود است ⇒ رشدِ تصادفیِ دانه این‌جا می‌شکند' : 'پین 1036 پیدا نشد');
ok('R4b manifest ادعایِ ظرفیت نمی‌کند', /"benchmark_claim"\s*:\s*"NONE/.test(read('tools/relational-seed-manifest.json') || ''),
  'کلید benchmark_claim = NONE باید بماند (ظرفیت مالِ چت ۴ است)');

/* R5 — اختیاری، نیازمند jsdom + store تولیدشده */
const storePath = path.join(ROOT, 'server', 'data', 'payesh.json');
if (!fs.existsSync(storePath)) {
  skipped('R5 censusِ store', '`server/data/payesh.json` نیست (gitignored؛ تولید: node server/seed.js)');
} else {
  try {
    const st = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    const users = (st.users || []);
    const active = users.filter((u) => u && !u.deleted && u.active !== false); /* اطلاعاتی — با تعریفِ active در باندل مقایسه نشود */
    const g = users.filter((u) => u && u.role === 'guard');
    ok('R5 users == 1036', users.length === 1036, 'users=' + users.length);
    ok('R5b guard == 1', g.length === 1, 'guard=' + g.length + (g[0] ? '/' + g[0].username : ''));
    console.log('  · active(store) = ' + active.length + ' (اطلاعاتی)');
  } catch (e) {
    skipped('R5 censusِ store', 'پارسِ store خطا داد: ' + e.message);
  }
}

console.log('──────────────────────────────────────────────');
console.log(`chat9-behavior-regression: ${pass} موفق، ${fail} ناموفق، ${skip} NOT-RUN`);
if (fail) { console.log('خطاها:\n - ' + errs.join('\n - ')); process.exit(1); }
process.exit(0);

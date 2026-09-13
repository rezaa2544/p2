#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   staff-gap-mutations.js — بند د.۴: آزمون جهشِ کمبود نیروی انسانی
   ───────────────────────────────────────────────────────────────────
   M1  حذف شمارش معلمانِ متمایز              ⇒ ❌ G1
   M2  بدون هنجار صفر شود (به‌جای تعریف‌نشده) ⇒ ❌ G2
   M3  حذف دروازهٔ دامنهٔ سمت سرور            ⇒ ❌ W6
   M4  حذف گارد نقشِ نما                      ⇒ ❌ G5
   M5  حذف اعتبارسنجی ورودی هنجار            ⇒ ❌ G6
   اجرا:  node tests/staff-gap-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانی حذف شد (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('sgap-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */
const SUITE = path.join(ROOT, 'tests', 'staff-gap.js');
const F = path.join(ROOT, 'src', 'js', '75-staff-gap.js');
const SF = path.join(ROOT, 'server', 'sync.js');
const PF = path.join(ROOT, 'server', 'policy.js'); /* ترمیم لنگر: دروازهٔ د.۴ اینجاست */

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}

console.log('▸ خطِّ پایه');
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const base = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
chk('خطِّ پایهٔ staff-gap سبز است', base.status === 0, (base.stdout || '').slice(-160));
if (base.status !== 0) { console.log((base.stdout || '') + (base.stderr || '')); process.exit(1); }

function mutate(file, find, replace, killRe, tag, rebuild) {
  const orig = fs.readFileSync(file, 'utf8');
  try {
    if (!orig.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false); return; }
    const mcopy = kit.mutant(file, orig.replace(find, replace)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(file).mode); } catch (_) {}
    if (rebuild) execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() }); /* build در سایه */
    const r = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000, env: kit.env() });
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-240).replace(/\n/g, ' '));
  } finally {
    kit.clear(file); /* نقشهٔ خالی؛ پاک‌سازیِ واقعی در exit */
  }
}

console.log('\n▸ جهش‌ها');
mutate(F,
  'have[sl.school_id][sl.subject_id].add(sl.teacher_id);',
  'void 0; /* معلم شمرده نشد */',
  /❌ G1/, 'M1 حذف شمارش معلمان', true);

mutate(F,
  'const gap = req == null ? null : Math.max(0, req - haveC);',
  'const gap = req == null ? 0 : Math.max(0, req - haveC);',
  /❌ G2/, 'M2 بی‌هنجار⇒صفر', true);

mutate(PF,
  /* ترمیم لنگر (BH-mut فاز ۲): دروازهٔ د.۴ از sync.js به policy.js منتقل شد
     (ویو ۵ — استخراج policy)؛ schoolInOfficeScope همان اجراکنندهٔ دروازه است —
     حذفِ صدایش = حذفِ دروازه. */
  `return schoolInOfficeScope(store, u, sid);`,
  `return true; /* دروازهٔ د.۴ حذف شد */`,
  /❌ W6/, 'M3 حذف دروازهٔ سرور', false);

mutate(F,
  "if (u.role !== 'superadmin' && u.role !== 'edu_office') return viewForbidden();",
  '/* گارد نقش حذف شد */',
  /❌ G5/, 'M4 حذف گارد نقش', true);

mutate(F,
  `if (raw === '' || !Number.isFinite(required) || required < 0 || required !== Math.floor(required) || required > 500) {
      toast('تعداد موردنیاز باید عدد صحیح بین ۰ تا ۵۰۰ باشد', 'err'); return;
    }`,
  `/* اعتبارسنجی حذف شد */`,
  /❌ G6/, 'M5 حذف اعتبارسنجی', true);

/* بازسازی نهایی + بازگشت به خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const fin = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0);

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های د.۴: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تست جهش راهنمای کاربر (E.11) — اثبات اینکه tests/user-guide.js
   واقعاً کهنگی/بازگشتِ غلط را می‌گیرد (سبزِ جعلی ممنوع).
   ─────────────────────────────────────────────────────────────
   BH-mut فاز ۲ / چت ۸ دور ۵ (الگوی امن p06/p11): نسخهٔ خراب‌شده در
   کپیِ جدا (mutant-kit) — USER_GUIDE.html اصلی هرگز بازنویسی نمی‌شود
   (پروندهٔ درگیرِ حادثهٔ P1-2!). */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { session } = require('./helpers/mutant-kit');
const kit = session('ug-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs();

const GUIDE = path.join(ROOT, 'USER_GUIDE.html');
const original = fs.readFileSync(GUIDE, 'utf8');

const mutations = [
  {
    name: 'عدد منوی مدیر کهنه شود (۴۷ → ۳۳)',
    mutate: (s) => s.replace(/[۰-۹]+ بخشِ منو/, '۳۳ بخشِ منو'),
  },
  {
    name: 'غلط تایپی «گمگ» برگردد',
    mutate: (s) => s.replace('انجمن و کمک‌ها', 'انجمن و گمگ‌ها'),
  },
  {
    name: 'فصل «تازه‌های سامانه» حذف شود',
    mutate: (s) => s.replace('id="whatsnew"', 'id="whatsnew-removed"'),
  },
  {
    name: 'بخش فنی توسعه‌دهنده برگردد',
    mutate: (s) => s.replace('</body>',
      '<section><h2>🔁 قاعدهٔ همگامی</h2><p>با node build.js بسازید</p></section></body>'),
  },
  {
    name: 'حساب دمو از جدول ورود حذف شود',
    mutate: (s) => s.replace('<code>parent_multi</code>', '<code>parent_gone</code>'),
  },
];

const run = (env, timeout) => {
  try {
    const o = execSync(process.execPath + ' tests/user-guide.js', { stdio: 'pipe', timeout: timeout || 180000, cwd: ROOT, env });
    return { code: 0, out: String(o) };
  } catch (e) {
    return { code: e.status === null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) };
  }
};

let killed = 0, envFails = 0;
for (const m of mutations) {
  const mutated = m.mutate(original);
  if (mutated === original) {
    console.log('  ⚠️ جهش «' + m.name + '» اعمال نشد (الگو پیدا نشد)');
    continue;
  }
  const copy = kit.mutant(GUIDE, mutated); /* کپیِ جدا؛ USER_GUIDE.html اصلی دست‌نخورده */
  let r = run(kit.env());
  if (r.out.trim() === '') { r = run(kit.env()); } /* R89 */
  const envFail = r.out.trim() === '' || /JavaScript heap out of memory|FATAL|aborting/.test(r.out);
  if (envFail) { envFails++; console.log('  ❌ ' + m.name + ' — خطای محیطی — نه کشته و نه زنده شمرده شد'); continue; }
  const dead = r.code !== 0;
  console.log('  ' + (dead ? '🗡️ کشته شد' : '❌ زنده ماند') + ': ' + m.name);
  if (dead) killed++;
  kit.clear(GUIDE); /* پایانِ این جهش — بدونِ آلودگیِ بعدی */
  try { fs.unlinkSync(copy); } catch (_) { /* بهترین تلاش */ }
}

/* بازبینیِ خطِ پایه (بدون env) — R97: یک retry. جارویِ سایه‌هایِ بازمانده قبلش. */
kit.sweepStrays();
let base = run(undefined);
if (base.code !== 0) base = run(undefined);
const backGreen = base.code === 0;
console.log(`user-guide-mutations: ${killed}/${mutations.length} کشته؛ سبزِ نهایی: ${backGreen && envFails === 0 ? '✅' : '❌'} (env-fails=${envFails})`);
if (!backGreen) console.log(base.out.split('\n').slice(-12).join('\n'));
process.exit(killed === mutations.length && envFails === 0 && backGreen ? 0 : 1);

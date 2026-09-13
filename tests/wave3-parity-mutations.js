#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave3-parity-mutations.js — اثباتِ اینکه گیتِ برابریِ JS↔SQL واقعاً
   واگرایی را می‌گیرد (سبزِ جعلی ممنوع).
   هر جهش: یک واگراییِ عمدی بین دو مسیر در فایلِ سرور تزریق می‌شود،
   tests/wave3-parity.js اجرا می‌شود و باید قرمز شود؛ بعد فایل برمی‌گردد.
   بدون DATABASE_URL: self-skip (مثل خودِ گیت).
   اجرا:
     DATABASE_URL=... node tests/wave3-parity-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

if (!process.env.DATABASE_URL) {
  console.log('  ⏭️  parity mutations — DATABASE_URL is not set');
  console.log('wave3-parity-mutations: 0/0 (skip)؛ سبزِ نهایی: ✅');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const DBQ = path.join(ROOT, 'server', 'dbquery.js');
const PAG = path.join(ROOT, 'server', 'middleware', 'pagination.js');
const GRD = path.join(ROOT, 'server', 'routes', 'grades.js');

/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ هم‌جوارِ جدا (mutant-kit)؛
   سورس اصلی هرگز بازنویسی نمی‌شود — restore/بازگردانیِ درجا حذف شد. */
const { session } = require('./helpers/mutant-kit');
const kit = session('w3p-');

const originals = new Map();
for (const f of [DBQ, PAG, GRD]) originals.set(f, fs.readFileSync(f, 'utf8'));
/* originals فقط خوانده می‌شود (بذرِ جهش‌ها)؛ نوشتن در کپیِ kit انجام می‌شود */

const mutations = [
  {
    name: 'ترتیبِ SQLِ students برعکس شود (id ASC → DESC)',
    file: DBQ,
    mutate: (s) => s.replace(
      "return _finalize({ from, parts, params, orderBy: 'u.id ASC', cursorRef: 'u.id', limit, cursor });",
      "return _finalize({ from, parts, params, orderBy: 'u.id DESC', cursorRef: 'u.id', orderDir: 'DESC', limit, cursor });")
  },
  {
    name: 'مهارِ مدرسه از SQLِ grades حذف شود (نشتِ اجاره‌ای)',
    file: DBQ,
    mutate: (s) => s.replace(
      "parts.push(`g.school_id = $${i}`); /* Wave 5 — strict anchor, no NULL escape */",
      "parts.push(`(g.school_id = $${i} OR TRUE)`); /* MUTANT: leak */")
  },
  {
    name: 'غنی‌سازیِ JSِ grades خراب شود (subject_name همیشه null)',
    file: GRD,
    mutate: (s) => s.replace(
      'subject_name: sub ? sub.name : null,',
      'subject_name: null, /* MUTANT */')
  },
  {
    name: 'کرسرِ مرکبِ JS خراب شود (پیمایشِ attendance ناقص)',
    file: PAG,
    mutate: (s) => s.replace(
      "filtered = items.filter(item => (String(item.date || '') < cd) || (String(item.date || '') === cd && Number(item[key]) > ci));",
      "filtered = items.filter(item => Number(item[key]) > ci); /* MUTANT: single-column */")
  },
  {
    name: 'has_moreِ SQL همیشه false شود (walk زود می‌ایستد)',
    file: DBQ,
    mutate: (s) => s.replace(
      'const hasMore = got.length > limit;',
      'const hasMore = false; /* MUTANT */')
  }
];

let killed = 0, applied = 0;
for (const m of mutations) {
  const src = originals.get(m.file);
  const mutated = m.mutate(src);
  if (mutated === src) { console.error('  ⚠️ جهش «' + m.name + '» اعمال نشد (الگو پیدا نشد)'); continue; }
  applied++;
  const mcopy = kit.mutant(m.file, mutated); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
  try { fs.chmodSync(mcopy, fs.statSync(m.file).mode); } catch (_) {}
  let red = false;
  try {
    execFileSync('node', [path.join(ROOT, 'tests', 'wave3-parity.js')],
      { stdio: 'pipe', env: kit.env(), timeout: 300000 });
  } catch (e) { red = true; }
  kit.clear(m.file);
  if (red) { killed++; console.log('  🗡️ کشته شد: ' + m.name); }
  else console.error('  ❌ زنده ماند: ' + m.name);
}

/* نیازی به restore نیست: هر جهش کپیِ خودش را داشت و نگاشتش را باز کرد */
const ok = applied === mutations.length && killed === applied;
console.log(`wave3-parity-mutations: ${killed}/${mutations.length} کشته؛ سبزِ نهایی: ${ok ? '✅' : '❌'}`);
process.exit(ok ? 0 : 1);

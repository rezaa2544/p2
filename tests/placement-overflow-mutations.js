#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   placement-overflow-mutations.js — جهش‌مندیِ سرریز (دور ۱۰۰، نقصِ ۴)
   ─────────────────────────────────────────────────────────────
   M1 سرریز به کلاسِ اول برگردد ← O1 (تجاوز از ظرفیت)
   M2 شکلِ خروجی برگردد به آرایه ← O1 (شکل)
   M3 شمارشِ پیش‌نمایش صفر شود ← O4 (بج غایب)
   M4 اعمال از buckets به unplaced برود ← O5 (هیچ‌کس چیده نشود)
   M5 شمارشِ چیده‌نشده‌ها در enroll-paid صفر شود ← O6 (توست)
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('po-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const SUITE = 'tests/placement-overflow.js';
const MUTS = [
  { file: 'src/js/39-school-year.js',
    bad: 'if(tries >= buckets.length) unplaced.push(s);',
    mut: 'if(tries >= buckets.length) buckets[0].list.push(s);',
    name: 'M1 سرریز به کلاسِ اول برگشت', expectFail: 'O1' },
  { file: 'src/js/39-school-year.js',
    bad: 'return { buckets: buckets, unplaced: unplaced };',
    mut: 'return buckets;',
    name: 'M2 خروجی آرایه شد (بی unplaced)', expectFail: 'O1' },
  { file: 'src/js/39-school-year.js',
    bad: 'var prevUn = cls.length ? autoPlacement(g.list, cls).unplaced.length : g.list.length;',
    mut: 'var prevUn = 0;',
    name: 'M3 بجِ پیش‌نمایش خاموش شد', expectFail: 'O4' },
  { file: 'src/js/19-actions-core.js',
    bad: 'prev.buckets.forEach(b=>b.list.forEach(s=>pairs.push({studentId:s.user.id,classId:b.cls.id})));',
    mut: 'prev.unplaced.forEach(s=>pairs.push({studentId:s.user.id,classId:0}));',
    name: 'M4 اعمال از جا‌نشده‌ها رفت (هیچ‌کس چیده نشد)', expectFail: 'O5' },
  { file: 'src/js/19-actions-core.js',
    bad: 'skipped+=r.unplaced.length;',
    mut: 'skipped+=0;',
    name: 'M5 شمارشِ چیده‌نشده‌ها گم شد', expectFail: 'O6' },
];

let killed = 0, prevFile = null, envFails = 0;
for (const m of MUTS) {
  const abs = path.join(ROOT, m.file);
  if (prevFile && prevFile !== abs) kit.clear(prevFile); /* فقط جهشِ جاری فعال */
  prevFile = abs;
  const src0 = fs.readFileSync(abs, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد در ${m.file}`); continue; }
  kit.mutant(abs, src0.replace(m.bad, m.mut)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  execSync('node build.js', { stdio: 'pipe', env: kit.env(), cwd: ROOT });
  let out = '', crashed = false;
  const cmd = 'node --max-old-space-size=1500 ' + SUITE;
  try { execSync(cmd, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') {
      try { execSync(cmd, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  if (crashed) {
    envFails++;
    console.log(`  ⚠️ ${m.name} — خطایِ محیطی (کرش/بی‌خروجی)، نه «زنده ماندن»`);
    continue;
  }
  const killedThis = /❌/.test(out) && out.includes(m.expectFail);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + ((out.split('\n').find(l => l.includes('❌')) || out.slice(0, 140))) + ')'}`);
  if (killedThis) killed++;
}
let backGreen = false, finalOut = '';
try {
  finalOut = execSync('node --max-old-space-size=1500 ' + SUITE, { stdio: 'pipe' }).toString(); /* پایه: بدون env */
  backGreen = /placement-overflow: \d+\/\d+  ✅/.test(finalOut);
} catch (e) { finalOut = String(e.stdout || '') + String(e.stderr || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته · خطِ پایه: ${backGreen ? 'سبز ✅' : 'قرمز ❌'} · خطایِ محیطی: ${envFails}`);
if (!backGreen || killed !== MUTS.length) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-14).join('\n'));
}
const pass = killed === MUTS.length && backGreen && envFails === 0;
console.log(pass ? 'همهٔ جهش‌ها کشته شدند ✅' : 'جهش‌مندی ناقص ❌');
process.exit(pass ? 0 : 1);

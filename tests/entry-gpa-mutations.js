#!/usr/bin/env node
/* entry-gpa-mutations.js — S4 فرناز: جهش‌های اعتبارسنجی معدل ورودی
   M1 سقف ۲۰→۲۱ (کلاینت) ← E4
   M2 کف ۰→-۱ (کلاینت) ← E5
   M3 حذف چک NaN (کلاینت) ← E6
   M4 حذف گیت دانش‌آموز (کلاینت) ← E8
   M5 حذف قانون سرور (validate.js) ← E11a
   M6 خالی→۰ به‌جای null (کلاینت) ← E7
   اجرا: node tests/entry-gpa-mutations.js */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('eg-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const SUITE = 'tests/entry-gpa.js';
const MUTS = [
  { file: 'src/js/19-actions-admin.js',
    bad: 'isNaN(_eg)||_eg<0||_eg>20', mut: 'isNaN(_eg)||_eg<0||_eg>21',
    name: 'M1 سقف به ۲۱ رفت', expectFail: 'E4' },
  { file: 'src/js/19-actions-admin.js',
    bad: 'isNaN(_eg)||_eg<0||_eg>20', mut: 'isNaN(_eg)||_eg<-1||_eg>20',
    name: 'M2 کف به ۱- رفت', expectFail: 'E5' },
  { file: 'src/js/19-actions-admin.js',
    bad: 'isNaN(_eg)||_eg<0||_eg>20', mut: '_eg<0||_eg>20',
    name: 'M3 چک NaN حذف شد', expectFail: 'E6' },
  { file: 'src/js/19-actions-admin.js',
    bad: "if(V('u_role')==='student')data.entry_gpa=_eg;", mut: 'data.entry_gpa=_eg;',
    name: 'M4 گیت دانش‌آموز حذف شد', expectFail: 'E8' },
  { file: 'server/validate.js',
    bad: "if(key === 'entry_gpa') return { type: 'score' };", mut: "if(key === 'entry_gpa') return { type: 'string', max: 32 };",
    name: 'M5 قانون سرور به string برگشت', expectFail: 'E11a' },
  { file: 'src/js/19-actions-admin.js',
    bad: "const _eg=_egRaw===''?null:_egNum;", mut: "const _eg=_egRaw===''?0:_egNum;",
    name: 'M6 خالی به ۰ نشست', expectFail: 'E7' },
];

let killed = 0, prevFile = null, envFails = 0;
for (const m of MUTS) {
  const abs = path.join(ROOT, m.file);
  if (prevFile && prevFile !== abs) kit.clear(prevFile); /* فقط جهشِ جاری فعال */
  prevFile = abs;
  const src0 = fs.readFileSync(abs, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log('  NO-PATTERN ' + m.name + ' در ' + m.file); continue; }
  kit.mutant(abs, src0.replace(m.bad, m.mut)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  execSync('node build.js', { stdio: 'pipe', env: kit.env(), cwd: ROOT });
  let out = '', crashed = false;
  const cmd = 'node --max-old-space-size=1500 ' + SUITE;
  try { execSync(cmd, { stdio: 'pipe', timeout: 120000, env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String((e.stdout || '') + String(e.stderr || ''));
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  if (crashed) {
    envFails++;
    console.log('  ENV-FAIL ' + m.name + ' — کرش/بی‌خروجی، نه زنده‌ماندن');
    continue;
  }
  const killedThis = /FAIL/.test(out) && out.indexOf(m.expectFail) > -1;
  console.log('  ' + (killedThis ? 'KILLED' : 'SURVIVED!') + ' ' + m.name);
  if (killedThis) killed++;
}
let backGreen = false;
try { execSync('node --max-old-space-size=1500 ' + SUITE, { stdio: 'pipe', timeout: 120000 }); backGreen = true; }
catch (e) { backGreen = false; }
console.log('entry-gpa-mutations: ' + killed + '/' + MUTS.length + ' killed, baseline-green=' + backGreen + ', env-fail=' + envFails);
process.exit(killed === MUTS.length && backGreen && envFails === 0 ? 0 : 1);

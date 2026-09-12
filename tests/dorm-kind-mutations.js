#!/usr/bin/env node
/* dorm-kind-mutations.js — S5 فرناز
   M1 حذف اعتبارسنجی kind (کلاینت) ← D4
   M2 پیش‌فرض legacy به pansion رفت ← D5
   M3 حذف pansion از enum سرور ← D9b
   M4 نادیده‌گرفتن سلکت (همیشه full) ← D3
   M5 نمایش kind خام به‌جای برچسب ← D7
   اجرا: node tests/dorm-kind-mutations.js */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('dk-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const SUITE = 'tests/dorm-kind.js';
const MUTS = [
  { file: 'src/js/19-actions-dorm.js',
    bad: "if(kind!=='full'&&kind!=='pansion'){toast('نوع اسکان نامعتبر است','err');return;}",
    mut: 'if(false){toast("x","err");return;}',
    name: 'M1 اعتبارسنجی kind حذف شد', expectFail: 'D4' },
  { file: 'src/js/65-dorm.js',
    bad: "function dormKindOf(a){ return (a && a.kind) || 'full'; }",
    mut: "function dormKindOf(a){ return (a && a.kind) || 'pansion'; }",
    name: 'M2 پیش‌فرض legacy عوض شد', expectFail: 'D5' },
  { file: 'server/validate.js',
    bad: "if(key === 'kind' && coll === 'dorm_assignments') return { type: 'enum', values: ['full', 'pansion'] };",
    mut: "if(key === 'kind' && coll === 'dorm_assignments') return { type: 'enum', values: ['full'] };",
    name: 'M3 enum سرور pansion را خط زد', expectFail: 'D9b' },
  { file: 'src/js/19-actions-dorm.js',
    bad: "const kind=V('dorm_kind')||'full';",
    mut: "const kind='full';",
    name: 'M4 سلکت نادیده گرفته شد', expectFail: 'D3' },
  { file: 'src/js/65-dorm.js',
    bad: '${esc(dormKindLabel(x.a))}',
    mut: '${esc(x.a.kind)}',
    name: 'M5 برچسب به kind خام برگشت', expectFail: 'D7' },
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
console.log('dorm-kind-mutations: ' + killed + '/' + MUTS.length + ' killed, baseline-green=' + backGreen + ', env-fail=' + envFails);
process.exit(killed === MUTS.length && backGreen && envFails === 0 ? 0 : 1);

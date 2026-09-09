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

let killed = 0, envFails = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log('  NO-PATTERN ' + m.name + ' در ' + m.file); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  const cmd = 'node --max-old-space-size=1500 ' + SUITE;
  try { execSync(cmd, { stdio: 'pipe', timeout: 120000 }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String((e.stdout || '') + String(e.stderr || ''));
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  fs.writeFileSync(m.file, src0);
  if (crashed) {
    envFails++;
    console.log('  ENV-FAIL ' + m.name + ' — کرش/بی‌خروجی، نه زنده‌ماندن');
    continue;
  }
  const killedThis = /FAIL/.test(out) && out.indexOf(m.expectFail) > -1;
  console.log('  ' + (killedThis ? 'KILLED' : 'SURVIVED!') + ' ' + m.name);
  if (killedThis) killed++;
}
execSync('node build.js', { stdio: 'pipe' });
let backGreen = false;
try { execSync('node --max-old-space-size=1500 ' + SUITE, { stdio: 'pipe', timeout: 120000 }); backGreen = true; }
catch (e) { backGreen = false; }
console.log('dorm-kind-mutations: ' + killed + '/' + MUTS.length + ' killed, baseline-green=' + backGreen + ', env-fail=' + envFails);
process.exit(killed === MUTS.length && backGreen && envFails === 0 ? 0 : 1);

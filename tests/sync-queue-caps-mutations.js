#!/usr/bin/env node
/* sync-queue-caps-mutations.js — جهش‌های سقف و نگهداشتِ صف (P1-10)
   M1 سقفِ تعدادی ۱۰۰۰→۹۹۹۹۹۹ ← Q1a
   M2 هرسِ قدمت خنثی شد (همه می‌مانند) ← Q3a
   M3 سقفِ تلاش ۵→۵۰۰ ← Q4a
   M4 ترتیبِ تخلیه وارونه شد (rejected آخر) ← Q1c
   M5 آستانهٔ هشدار ۰.۸→۲.۰ (هرگز هشدار نمی‌دهد) ← Q5a
   اجرا (با نودِ ۲۲ در PATH): node tests/sync-queue-caps-mutations.js
   نکته: برخلافِ entry-gpa، این سوئیت ❌ چاپ می‌کند نه FAIL. */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const SUITE = 'tests/sync-queue-caps.js';
const MUTS = [
  { file: 'src/js/27-sync.js',
    bad: 'maxOperations : 1000,', mut: 'maxOperations : 999999,',
    name: 'M1 سقفِ تعدادی به ۹۹۹۹۹۹ رفت', expectFail: 'Q1a' },
  { file: 'src/js/27-sync.js',
    bad: 'return t >= cutoff;', mut: 'return true;',
    name: 'M2 هرسِ قدمت خنثی شد', expectFail: 'Q3a' },
  { file: 'src/js/27-sync.js',
    bad: 'maxTries      : 5,', mut: 'maxTries      : 500,',
    name: 'M3 سقفِ تلاش به ۵۰۰ رفت', expectFail: 'Q4a' },
  { file: 'src/js/27-sync.js',
    bad: 'var rank = { rejected: 0, failed: 1,', mut: 'var rank = { rejected: 9, failed: 1,',
    name: 'M4 ترتیبِ تخلیه وارونه شد', expectFail: 'Q1c' },
  { file: 'src/js/27-sync.js',
    bad: 'warnRatio     : 0.8,', mut: 'warnRatio     : 2.0,',
    name: 'M5 هشدار هرگز روشن نمی‌شود', expectFail: 'Q5a' },
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
  const killedThis = /❌/.test(out) && out.indexOf(m.expectFail) > -1;
  console.log('  ' + (killedThis ? 'KILLED' : 'SURVIVED!') + ' ' + m.name);
  if (killedThis) killed++;
}
execSync('node build.js', { stdio: 'pipe' });
let backGreen = false;
try { execSync('node --max-old-space-size=1500 ' + SUITE, { stdio: 'pipe', timeout: 120000 }); backGreen = true; }
catch (e) { backGreen = false; }
console.log('sync-queue-caps-mutations: ' + killed + '/' + MUTS.length + ' killed, baseline-green=' + backGreen + ', env-fail=' + envFails);
process.exit(killed === MUTS.length && backGreen && envFails === 0 ? 0 : 1);

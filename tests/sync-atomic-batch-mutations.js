#!/usr/bin/env node
/* sync-atomic-batch-mutations.js — جهش‌های آینهٔ اتمیک (P1-14)
   M1 بلعِ خطا در دسته (به‌جایِ انتشار) ← B4b2
   M2 حذفِ میان‌بُرِ حافظه ← B1
   M3 فراخوانیِ persistOp تکی به‌جایِ batch در sync.js ← B7b
   M4 آینه دادهٔ خامِ کلاینت را برد (بی‌شناسه) ← B7c
   M5 COMMIT به‌جایِ ROLLBACK در شکست ← B4b2
   بدونِ بیلد (فایل‌هایِ سرور باندل نمی‌شوند) و بدونِ PG واقعی.
   اجرا: node tests/sync-atomic-batch-mutations.js */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const SUITE = 'tests/sync-atomic-batch.js';
const MUTS = [
  { file: 'server/db.js',
    bad: '    await persistOpWithClient(client, op);',
    mut: '    await persistOpWithClient(client, op).catch(() => {});',
    name: 'M1 بلعِ خطا در دسته', expectFail: 'B4b2' },
  { file: 'server/db.js',
    bad: "return { ok: true, driver: 'memory', count: list.length };",
    mut: "return { ok: false, driver: 'memory', count: list.length };",
    name: 'M2 میان‌بُرِ حافظه شکست گزارش کرد', expectFail: 'B1' },
  { file: 'server/sync.js',
    bad: '        await db.persistOpsBatch(mirror);',
    mut: '        await db.persistOp(mirror);',
    name: 'M3 فراخوانیِ تکی به‌جایِ batch', expectFail: 'B7b' },
  { file: 'server/sync.js',
    bad: 'mirror.push({ uid: op.uid, c: op.c, t: \'ins\', data: (ex || data) });',
    mut: 'mirror.push({ uid: op.uid, c: op.c, t: \'ins\', data: op.data });',
    name: 'M4 آینهٔ بی‌شناسه', expectFail: 'B7c' },
  { file: 'server/db.js',
    bad: '    try { await client.query(\'ROLLBACK\'); }',
    mut: '    try { await client.query(\'COMMIT\'); }',
    name: 'M5 COMMIT به‌جایِ ROLLBACK', expectFail: 'B4b2' },
];

let killed = 0, envFails = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log('  NO-PATTERN ' + m.name + ' در ' + m.file); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut));
  let out = '', crashed = false;
  try { execSync('node ' + SUITE, { stdio: 'pipe', timeout: 120000 }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String((e.stdout || '') + String(e.stderr || ''));
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  fs.writeFileSync(m.file, src0);
  if (crashed) { envFails++; console.log('  ENV-FAIL ' + m.name + ' — کرش/بی‌خروجی، نه زنده‌ماندن'); continue; }
  const killedThis = /❌/.test(out) && out.indexOf(m.expectFail) > -1;
  console.log('  ' + (killedThis ? 'KILLED' : 'SURVIVED!') + ' ' + m.name);
  if (killedThis) killed++;
}
let backGreen = false;
try { execSync('node ' + SUITE, { stdio: 'pipe', timeout: 120000 }); backGreen = true; }
catch (e) { backGreen = false; }
console.log('sync-atomic-batch-mutations: ' + killed + '/' + MUTS.length + ' killed, baseline-green=' + backGreen + ', env-fail=' + envFails);
process.exit(killed === MUTS.length && backGreen && envFails === 0 ? 0 : 1);

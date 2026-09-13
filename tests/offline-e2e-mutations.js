#!/usr/bin/env node
/* offline-e2e-mutations.js — جهش‌سنجیِ P0-3 (زنجیرهٔ آفلاین E2E)
   هر جهش یک ضمانتِ زنجیره را می‌شکند؛ سوئیتِ offline-e2e.js باید آن را بکشد:
   M1 حذفِ dedupe سرور (ادعایِ uid) ← E11/E12
   M2 حذفِ retry کلاینت (شکستِ گذرا ⇒ rejected بی‌بازگشت) ← E13
   M3 شکستنِ persistence صف (saveQueue هیچ‌جا نمی‌نویسد) ← E2/E4
   M4 حذفِ گاردِ tenant سرور (school_mismatch) ← E21/E22
   M5 بلعِ conflict (OCC خنثی ⇒ آخرین نوشتن برنده) ← E17/E18
   M6 حذفِ backoff نمایی (تأخیر ثابتِ صفر) ← E15
   M7 حذفِ گاردِ ادغامِ پیش-از-load (رگرسیونِ باگِ بازنویسیِ بوت) ← E4
   اجرا: node tests/offline-e2e-mutations.js */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — restore/بازگردانی و rebuildِ پایانی حذف
   شدند. همهٔ ویرایش‌های یک جهش (حتی چندتایی در یک فایل) در همان کپیِ واحد
   تجمیع می‌شوند؛ همیشه فقط جهشِ جاری نگاشتِ فعال دارد. */
const path = require('path');
const { session } = require('./helpers/mutant-kit');
const kit = session('oe2e-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const SUITE = 'tests/offline-e2e.js';
const MUTS = [
  { name: 'M1 dedupe سرور حذف شد (هر دو لایهٔ idempotency)', expectFail: ['E11', 'E12'],
    /* دو لایه دفاعی: چکِ حلقهٔ اعتبارسنجی + ادعایِ اتمیکِ حلقهٔ apply (S2-1)
       — حذفِ مفهومِ dedupe یعنی هر دو؛ حذفِ تکی را لایهٔ دیگر می‌پوشاند
       (همان defense-in-depth ی که tests/sync-dup-claim.js تثبیت کرده). */
    edits: [
      { file: 'server/sync.js', bad: 'if(isProcessed){', mut: 'if(false && isProcessed){' },
      { file: 'server/sync.js',
        bad: 'if(store.__processed_uids && store.__processed_uids[op.uid]){',
        mut: 'if(false){' },
    ] },
  { file: 'src/js/27-sync.js',
    bad: 'noteOpFailed(item, r.message || \'خطای نامشخص\');',
    mut: "item.status = 'rejected'; item.error = 'MUT';",
    name: 'M2 retry کلاینت حذف شد (گذرا ⇒ rejected)', expectFail: ['E13'] },
  { file: 'src/js/27-sync.js',
    bad: 'return Store.setJSON(SYNC_QUEUE_KEY, SYNC.queue);',
    mut: 'return true;',
    name: 'M3 persistence صف شکست (saveQueue نمی‌نویسد)', expectFail: ['E2', 'E4'] },
  { name: 'M4 گاردِ tenant سرور حذف شد (fieldGate + inScope)', expectFail: ['E21', 'E22'],
    /* سه لایه: fieldGate (school_mismatch) + قیدِ سطحِ op + inScope ی policy —
       حذفِ مفهومِ tenant-guard یعنی هر سه؛ تکی را لایه‌های دیگر می‌گیرند. */
    edits: [
      { file: 'server/sync.js',
        bad: "if(d.school_id != null && Number(d.school_id) !== Number(s.school_id))\n      return { code: 'school_mismatch', msg: 'school_id باید همان مدرسهٔ شما باشد' };\n    d.school_id = s.school_id;",
        mut: '/*MUT*/' },
      { file: 'server/sync.js',
        bad: "if(op.school_id != null && s.school_id != null && Number(op.school_id) !== s.school_id) return all('school_mismatch');",
        mut: '/*MUT*/' },
      { file: 'server/sync.js',
        bad: "if(!inScope(s, op.c, recId, op.data)) return all('out_of_scope');",
        mut: '/*MUT*/' },
    ] },
  { file: 'server/sync.js',
    bad: 'if(versionedMismatch){',
    mut: 'if(false && versionedMismatch){',
    name: 'M5 conflict بلعیده شد (OCC خنثی)', expectFail: ['E17', 'E18'] },
  { file: 'src/js/27-sync.js',
    bad: 'return Math.min(2000 * Math.pow(2, Math.min(SYNC.attempts, 8)), 300000);',
    mut: 'return 0;',
    name: 'M6 backoff نمایی حذف شد', expectFail: ['E15'] },
  { file: 'src/js/27-sync.js',
    bad: 'if(_disk[_j] && !_have[_disk[_j].uid]) SYNC.queue.push(_disk[_j]);',
    mut: '/*MUT*/',
    name: 'M7 ادغامِ پیش-از-load حذف شد (بازنویسیِ بوت برگشت)', expectFail: ['E4'] },
];

let killed = 0, envFails = 0;
let active = []; /* فایل‌های دارای نگاشتِ فعال — همیشه فقط جهشِ جاری */
for (const m of MUTS) {
  const edits = m.edits || [{ file: m.file, bad: m.bad, mut: m.mut }];
  const originals = new Map();
  let missing = null;
  for (const ed of edits) {
    const src = originals.has(ed.file) ? originals.get(ed.file) : fs.readFileSync(ed.file, 'utf8');
    if (!originals.has(ed.file)) originals.set(ed.file, src);
    if (fs.readFileSync(ed.file, 'utf8').indexOf(ed.bad) < 0) { missing = ed; break; }
  }
  if (missing) {
    console.log('  NO-PATTERN ' + m.name + ' در ' + missing.file);
    continue;
  }
  /* همهٔ ویرایش‌های این جهش (احتمالاً چندتایی در یک فایل) در یک کپیِ جدا تجمیع می‌شوند */
  const byFile = new Map();
  for (const ed of edits) {
    const cur = byFile.has(ed.file) ? byFile.get(ed.file) : originals.get(ed.file);
    byFile.set(ed.file, cur.replace(ed.bad, ed.mut));
  }
  for (const f of active) kit.clear(path.join(ROOT, f));
  active = [...byFile.keys()];
  for (const f of active) {
    const abs = path.join(ROOT, f);
    const mcopy = kit.mutant(abs, byFile.get(f)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(abs).mode); } catch (_) {}
  }
  try { execSync('node build.js', { stdio: 'pipe', cwd: ROOT, env: kit.env() }); } catch (e) {}
  let out = '', crashed = false;
  try { execSync('node ' + SUITE, { stdio: 'pipe', timeout: 180000, cwd: ROOT, env: kit.env() }); out = 'PASSED'; }
  catch (e) {
    out = String((e.stdout || '') + String(e.stderr || ''));
    if (out.trim() === '' || /FATAL(?!.*❌)/.test(out) && !/❌/.test(out)) crashed = /❌/.test(out) ? false : true;
  }
  for (const f of active) kit.clear(path.join(ROOT, f));
  active = [];
  const killedThis = /❌/.test(out) && m.expectFail.some((t) => {
    const re = new RegExp('❌[^\\n]*' + t + '\\b');
    return re.test(out);
  });
  if (killedThis) { killed++; console.log('  KILLED    ' + m.name); }
  else if (crashed) {
    /* کرشِ کامل هم یعنی جهش زنده نماند — اما جدا می‌شمریم تا صادق بماند */
    envFails++; console.log('  CRASHED   ' + m.name + ' (سوئیت کرش کرد؛ زنده‌ماندن نیست)');
  }
  else console.log('  SURVIVED! ' + m.name);
}
let backGreen = false;
try { execSync('node ' + SUITE, { stdio: 'pipe', timeout: 180000 }); backGreen = true; } catch (e) {}
console.log('offline-e2e-mutations: ' + killed + '/' + MUTS.length + ' killed'
  + (envFails ? ' (+' + envFails + ' crashed)' : '') + ', baseline-green=' + backGreen);
process.exit((killed + envFails) === MUTS.length && backGreen ? 0 : 1);

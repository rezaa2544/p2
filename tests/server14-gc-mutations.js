#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — GCِ وضعیتِ داخلیِ سرور (AD 85.2)
   هر جهش باید tests/server14-gc.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — restore/بازگردانیِ درجا حذف شد. همیشه فقط یک جهشِ
   فعال است (نگاشتِ فایلِ قبلی پیش از جهشِ تازه پاک می‌شود). بیتِ اجراییِ
   کپی از اصلی حفظ می‌شود تا چک‌های bash -n/X_OK معنای خود را نگه دارند. */
const path = require('path');
const { session } = require('./helpers/mutant-kit');
const kit = session('s14gc-mut-');
const ROOT = path.join(__dirname, '..');

const FILES = {
  'server/index.js': fs.readFileSync('server/index.js', 'utf8'),
  'server/otp-store.js': fs.readFileSync('server/otp-store.js', 'utf8'), /* R101 */
};

const MUTS = [
  {
    file: 'server/index.js',
    name: 'M1 GCِ uidهایِ کهنه بی‌اثر شود (30 روز پاک نشوند)',
    /* ترمیم لنگر (BH-mut فاز ۲): شرطِ GC با helperِ expired() بازنویسی شده
       (timestampOf + not-finite) — لنگرِ قدیمی روی main پوششِ صفر داشت. */
    bad: 'if(expired(store.__processed_uids[k], UID_GC_MS)){ delete store.__processed_uids[k]; n++; }',
    mut: 'if(false){ delete store.__processed_uids[k]; n++; }',
    expectFail: 'GC: uidِ کهنه (31 روز) پاک شد',
  },
  {
    file: 'server/index.js',
    name: 'M2 GCِ jtiهایِ منقضی بی‌اثر شود (8 ساعت پاک نشوند)',
    /* ترمیم لنگر (BH-mut فاز ۲): همان بازنویسیِ expired() — بند M1. */
    bad: 'if(expired(store.__revoked_jti[k], JTI_GC_MS)){ delete store.__revoked_jti[k]; n++; }',
    mut: 'if(false){ delete store.__revoked_jti[k]; n++; }',
    expectFail: 'GC: jtiِ کهنه (9 ساعت) پاک شد',
  },
  {
    file: 'server/otp-store.js', /* R101: جارویِ کدها به otp-store رفت */
    name: 'M3 GCِ کدهایِ منقضی بی‌اثر شود',
    bad: 'if(!r || now - (r.at || 0) >= ttlMs) delete data.codes[p];',
    mut: 'if(false) delete data.codes[p];',
    expectFail: 'GC: کدِ منقضی (10 دقیقه) پاک شد',
  },
  {
    file: 'server/index.js',
    name: 'M4 GC در حلقهٔ persist فراخوانی نشود',
    bad: 'const gc = gcStore();',
    mut: 'const gc = 0;',
    expectFail: 'GC: uidِ کهنه (31 روز) پاک شد',
  },
];

let killed = 0;
let prevAbs = null;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
    const abs = path.join(ROOT, m.file);
  if (prevAbs && prevAbs !== abs) kit.clear(prevAbs);
  const mcopy = kit.mutant(abs, src.replace(m.bad, m.mut)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
  try { fs.chmodSync(mcopy, fs.statSync(abs).mode); } catch (_) {} /* حفظِ مود (بیتِ اجرایی) */
  prevAbs = abs;
  let out = '', crashed = false;
  const __r89cmd = 'node tests/server14-gc.js';
  try { execSync(__r89cmd, { stdio: 'pipe', cwd: ROOT, env: kit.env() }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
      try { execSync(__r89cmd, { stdio: 'pipe', cwd: ROOT, env: kit.env() }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0622\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u00ab\u0632\u0646\u062f\u0647 \u0645\u0627\u0646\u062f\u0646\u00bb \u062c\u0647\u0634 \u0646\u06cc\u0633\u062a';
  }
  const killedThis = crashed ? (m.crashOK === true) : (/❌/.test(out) && out.includes(m.expectFail));
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}
if (prevAbs) kit.clear(prevAbs); /* نقشهٔ خالی برای شفافیت؛ پاک‌سازیِ واقعی در exit */
let finalOut = '', backGreen = false;
try {
  finalOut = execSync('node tests/server14-gc.js', { stdio: 'pipe' }).toString();
  backGreen = finalOut.includes('همه سبز');
} catch (e) {
  finalOut = String(e.stdout || '');
}
/* R97 — تحتِ بارِ موازیِ رجیسیون (۴ لِین) سرورِ پایه گاه در میانیِ اجرا می‌میرد
   (G9=null / oldKeys پاک نمی‌شوند؛ تکرارِ تکی همواره سبز — کلاسِ R89):
   یک‌بار retry. باگِ واقعیِ GC هر دو بار می‌شکست. */
if (!backGreen) {
  try {
    finalOut = execSync('node tests/server14-gc.js', { stdio: 'pipe' }).toString();
    backGreen = finalOut.includes('همه سبز');
  } catch (e) {
    finalOut = String(e.stdout || '');
  }
}
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-10).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);

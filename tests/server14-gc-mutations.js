#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — GCِ وضعیتِ داخلیِ سرور (AD 85.2)
   هر جهش باید tests/server14-gc.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'server/index.js': fs.readFileSync('server/index.js', 'utf8'),
};

const MUTS = [
  {
    file: 'server/index.js',
    name: 'M1 GCِ uidهایِ کهنه بی‌اثر شود (30 روز پاک نشوند)',
    bad: 'if(now - store.__processed_uids[k] > UID_GC_MS){ delete store.__processed_uids[k]; n++; }',
    mut: 'if(false){ delete store.__processed_uids[k]; n++; }',
    expectFail: 'GC: uidِ کهنه (31 روز) پاک شد',
  },
  {
    file: 'server/index.js',
    name: 'M2 GCِ jtiهایِ منقضی بی‌اثر شود (8 ساعت پاک نشوند)',
    bad: 'if(now - store.__revoked_jti[k] > JTI_GC_MS){ delete store.__revoked_jti[k]; n++; }',
    mut: 'if(false){ delete store.__revoked_jti[k]; n++; }',
    expectFail: 'GC: jtiِ کهنه (9 ساعت) پاک شد',
  },
  {
    file: 'server/index.js',
    name: 'M3 GCِ کدهایِ منقضی بی‌اثر شود',
    bad: 'if(!rec || now - (rec.at || 0) >= CODE_TTL_MS){ delete store.__auth.codes[k]; n++; }',
    mut: 'if(false){ delete store.__auth.codes[k]; n++; }',
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
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  let out = '', crashed = false;
  const __r89cmd = 'node tests/server14-gc.js';
  try { execSync(__r89cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
      try { execSync(__r89cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0622\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u00ab\u0632\u0646\u062f\u0647 \u0645\u0627\u0646\u062f\u0646\u00bb \u062c\u0647\u0634 \u0646\u06cc\u0633\u062a';
  }
  const killedThis = crashed ? (m.crashOK === true) : (/❌/.test(out) && out.includes(m.expectFail));
  for (const f of Object.keys(FILES)) fs.writeFileSync(f, FILES[f]);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}
let finalOut = '', backGreen = false;
try {
  finalOut = execSync('node tests/server14-gc.js', { stdio: 'pipe' }).toString();
  backGreen = finalOut.includes('همه سبز');
} catch (e) {
  finalOut = String(e.stdout || '');
}
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-10).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);

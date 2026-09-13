#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   server15-mutations.js — جهش‌مندیِ R95 بند ۲.۵ (نسخه + تعارض + داوری)
   ─────────────────────────────────────────────────────────────
   M1: نگارشِ sync_conflicts حذف شود        → C3b باید شکست بخورد
   M2: چرخشِ نسخهِٔ apply حذف شود          → C2b باید شکست بخورد
   M3: داوریِ incoming داده را اعمال نکند   → C15b باید شکست بخورد
   M4: گاردِ نقشِ resolve حذف شود           → C14 باید شکست بخورد
   M5: دامنهِٔ مدرسهِٔ resolve حذف شود      → C13 باید شکست بخورد
   M6: base_version روی LWW هم الزام شود    → C6b باید شکست بخورد
   هر جهش: جایگزینی، اجرای tests/server15.js، بررسیِ شکست، بازگشت.
   ─────────────────────────────────────────────────────────────
   BH-mut فاز ۲ / چت ۸ دور ۵ (الگوی امن p06/p11): جهش در کپیِ جدا
   (mutant-kit)؛ سورس اصلی هرگز بازنویسی نمی‌شود — بازگردانیِ دستی و
   rebuildِ پایانی حذف شدند. برای حفظِ معنای اصلی («همیشه فقط یک جهشِ
   فعال»)، نگاشتِ فایلِ تکرارِ قبلی پیش از هر جهشِ تازه پاک می‌شود.
   لنگرهایِ پوسیده پس از #143/پیکربندیِ فعلی تازه شدند:
   · M1: pushِ مستقیم حذف شده بود (P1-2: درج از mirrorAppend) ⇒
     `uPush('sync_conflicts', mirrorAppend('sync_conflicts', cf));`
   · M6: بلوکِVERSIONED به دو ثابتِ versionedMismatch/structuralMismatch
     بازتوزیع شده بود ⇒ همان جهش (الزامِ base_version برای
     announcements/LWW) روی versionedMismatch.
   ─────────────────────────────────────────────────────────── */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { session } = require('./helpers/mutant-kit');
const kit = session('srv15-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const MUTS = [
  {
    file: 'server/sync.js', suite: 'tests/server15.js', heap: 1500,
    /* ری‌تارگت (BH-mut چت ۸ دور ۵): P1-2 درج را از mirrorAppend رد می‌کند؛
       همان جهش (رکوردِ sync_conflicts نوشته نمی‌شود) در خانهٔ جدید. */
    bad: "uPush('sync_conflicts', mirrorAppend('sync_conflicts', cf));",
    mut: "if(false) uPush('sync_conflicts', mirrorAppend('sync_conflicts', cf));",
    name: 'M1 رکوردِ sync_conflicts نوشته نمی‌شود',
    expectFail: 'C3b'
  },
  {
    file: 'server/sync.js', suite: 'tests/server15.js', heap: 1500,
    bad: 'if(VERSION_TRACKED[op.c]) rec.version = (rec.version || 1) + 1;',
    mut: 'if(false && VERSION_TRACKED[op.c]) rec.version = (rec.version || 1) + 1;',
    name: 'M2 نسخهِٔ رکورد چرخانده نمی‌شود',
    expectFail: 'C2b'
  },
  {
    file: 'server/conflicts.js', suite: 'tests/server15.js', heap: 1500,
    bad: 'Object.assign(rec, c.incoming.data, { id: rec.id, updated_at: nowIso });',
    mut: 'if(false) Object.assign(rec, c.incoming.data, { id: rec.id, updated_at: nowIso });',
    name: 'M3 داوریِ incoming دادهٔ کلاینت را اعمال نمی‌کند',
    expectFail: 'C15b'
  },
  {
    file: 'server/conflicts.js', suite: 'tests/server15.js', heap: 1500,
    bad: "if(s.role !== 'manager' && s.role !== 'superadmin')\n      return sendJson(res, 403, { ok: false, code: 'role_denied' });\n    /* لایهٔ مقدار",
    mut: "if(false && s.role !== 'manager' && s.role !== 'superadmin')\n      return sendJson(res, 403, { ok: false, code: 'role_denied' });\n    /* لایهٔ مقدار",
    name: 'M4 گاردِ نقشِ resolve حذف شد (دبیر داوری می‌کند)',
    expectFail: 'C14'
  },
  {
    file: 'server/conflicts.js', suite: 'tests/server15.js', heap: 1500,
    bad: "if(s.role === 'manager' && c.school_id != null && Number(c.school_id) !== Number(s.school_id))",
    mut: "if(false && s.role === 'manager' && c.school_id != null && Number(c.school_id) !== Number(s.school_id))",
    name: 'M5 دامنهِٔ مدرسهِٔ resolve حذف شد (بین‌مدرسه‌ای داوری می‌کند)',
    expectFail: 'C13'
  },
  {
    file: 'server/sync.js', suite: 'tests/server15.js', heap: 1500,
    /* ری‌تارگت (BH-mut چت ۸ دور ۵): بلوکِ VERSIONED قدیمی به
       versionedMismatch/structuralMismatch بازتوزیع شده بود؛ همان جهش
       (الزامِ base_version برای مجموعهٔ LWW) در خانهٔ جدید. */
    bad: 'const versionedMismatch = !!VERSIONED[op.c] && Number(op.base_version) !== cur;',
    mut: "const versionedMismatch = (VERSIONED[op.c] || op.c === 'announcements') && Number(op.base_version) !== cur;",
    name: 'M6 base_version روی مجموعهٔ LWW هم الزام شد',
    expectFail: 'C6b'
  }
];

let killed = 0;
let envFails = 0;
let prevAbs = null;
for (const m of MUTS) {
  const abs = path.join(ROOT, m.file);
  /* فقط جهشِ جاری فعال بماند (معنای اصلیِ «هر بار یک جهش»):
     نگاشتِ فایلِ جهشِ قبلی را بردار — فایلِ تکراری همان مسیرِ کپی را تازه می‌نویسد. */
  if (prevAbs && prevAbs !== abs) kit.clear(prevAbs);
  const src0 = fs.readFileSync(abs, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log(`  ❌ ${m.name}: الگوی اصلی پیدا نشد در ${m.file}`); continue; }
  kit.mutant(abs, src0.replace(m.bad, m.mut, 1)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
  prevAbs = abs;
  execSync('node build.js', { stdio: 'pipe', cwd: ROOT, env: kit.env() }); /* build در سایه */
  let out = '', crashed = false;
  const __r89cmd = `node --max-old-space-size=${m.heap} ${m.suite}`;
  const __run = () => {
    try { execSync(__r89cmd, { stdio: 'pipe', cwd: ROOT, env: kit.env() }); return 'PASSED (no failure)'; }
    catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
  };
  out = __run();
  if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
    out = __run();
  }
  if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0627\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u0698\u0634\u062a \u0646\u06cc\u0633\u062a';
  /* R92: env early-death — تست قبل از چاپِ چکِ موردِ انتظار مرد (EADDRINUSE/OOM در استارت) → retry یک‌بار؛ هرگز «زنده ماند»ِ کاذب */
  if (m.crashOK !== true && out !== 'PASSED (no failure)' && /\u274c/.test(out) && !out.includes(m.expectFail)) {
    const out2 = __run();
    if (!(out2 !== 'PASSED (no failure)' && /\u274c/.test(out2) && !out2.includes(m.expectFail))) {
      out = out2;
      crashed = /JavaScript heap out of memory|FATAL|aborting/.test(out2) || out2.trim() === '';
    }
  }
  const failed = /\u274c/.test(out);
  const envFailed = m.crashOK !== true && out !== 'PASSED (no failure)' && failed && !out.includes(m.expectFail);
  const killedThis = envFailed ? false : (crashed ? (m.crashOK === true) : (failed && out.includes(m.expectFail)));
  /* بدونِ بازگردانی — سورس اصلی هرگز جهش نگرفت */
  const line = (out.split('\n').find(l => l.includes('\u274c')) || out.slice(0, 150)).trim();
  if (envFailed) {
    envFails++;
    console.log(`  ❌ ${m.name} — خطای محیطی: چکِ ${m.expectFail} هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد`);
  } else {
    console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' + (crashed ? ' (مرگِ فرآیند)' : '') : 'زنده ماند! (خروجی: ' + line + ')'}`);
    if (killedThis) killed++;
  }
}
if (prevAbs) kit.clear(prevAbs); /* نقشهٔ خالی برای شفافیت؛ پاک‌سازیِ واقعی در exit */
console.log('\nبازبینیِ خطِ پایه (بدون جهش و بدون env — سورس‌های اصلی):');
/* R97 — اجرایِ پایانه (بدونِ جهش) تحتِ بار گاهی می‌مرد و استیسهٔ execSync
   کلِ سویت را می‌انداخت (کلاسِ R89): try + یک‌بار retry. baseline هیچ env
   جهش نمی‌گیرد (درسِ baseline تورفته در try — دستهٔ ۳). */
const runBase = (cmd) => {
  try { return execSync(cmd, { stdio: 'pipe', cwd: ROOT }).toString(); }
  catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
};
let o1 = runBase('node --max-old-space-size=1500 tests/server15.js');
if (o1.indexOf('بدون خطا') < 0 && o1.indexOf('✅ 40') < 0) o1 = runBase('node --max-old-space-size=1500 tests/server15.js');
console.log('  server15: ' + (o1.split('\n').find(l => l.includes('server15')) || o1.slice(-140)).trim());
console.log(killed === MUTS.length && envFails === 0 ? `همهٔ ${MUTS.length} جهش کشته شدند ✅` : `فقط ${killed}/${MUTS.length} جهش کشته شد${envFails ? ` + ${envFails} خطای محیطی` : ''} ❌`);
process.exit(killed === MUTS.length && envFails === 0 ? 0 : 1);

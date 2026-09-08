#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   server15-mutations.js — جهش‌مندیِ R95 بند ۲.۵ (نسخه + تعارض + داوری)
   ─────────────────────────────────────────────────────────────
   M1: نگارشِ sync_conflicts حذف شود        → C3b باید شکست بخورد
   M2: چرخشِ نسخهِٔ apply حذف شود          → C2b باید شکست بخورد
   M3: داوریِ incoming داده را اعمال نکند   → C15b باید شکست بخورد
   M4: گاردِ نقشِ resolve حذف شود           → C14 باید شکست بخورد
   M5: دامنهِٔ مدرسهِٔ resolve حذف شود      → C13 باید شکست بخورد
   M6: base_version روی LWW هم الزام شود    → C6b باید شکست بخورد
   هر جهش: جایگزینی، اجرای tests/server15.js، بررسیِ شکست، بازگشت.
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'server/sync.js', suite: 'tests/server15.js',
    bad: 'store.sync_conflicts.push(cf);',
    mut: 'if(false) store.sync_conflicts.push(cf);',
    name: 'M1 رکوردِ sync_conflicts نوشته نمی‌شود',
    expectFail: 'C3b'
  },
  {
    file: 'server/sync.js', suite: 'tests/server15.js',
    bad: 'if(VERSION_TRACKED[op.c]) rec.version = (rec.version || 1) + 1;',
    mut: 'if(false && VERSION_TRACKED[op.c]) rec.version = (rec.version || 1) + 1;',
    name: 'M2 نسخهِٔ رکورد چرخانده نمی‌شود',
    expectFail: 'C2b'
  },
  {
    file: 'server/conflicts.js', suite: 'tests/server15.js',
    bad: 'Object.assign(rec, c.incoming.data, { id: rec.id, updated_at: nowIso });',
    mut: 'if(false) Object.assign(rec, c.incoming.data, { id: rec.id, updated_at: nowIso });',
    name: 'M3 داوریِ incoming دادهٔ کلاینت را اعمال نمی‌کند',
    expectFail: 'C15b'
  },
  {
    file: 'server/conflicts.js', suite: 'tests/server15.js',
    /* ری‌تارگت (لایهٔ مقدار): پس از گاردِ نقش حالا بلوکِ validate می‌آید نه const cid */
    bad: "if(s.role !== 'manager' && s.role !== 'superadmin')\n      return sendJson(res, 403, { ok: false, code: 'role_denied' });\n    /* لایهٔ مقدار",
    mut: "if(false && s.role !== 'manager' && s.role !== 'superadmin')\n      return sendJson(res, 403, { ok: false, code: 'role_denied' });\n    /* لایهٔ مقدار",
    name: 'M4 گاردِ نقشِ resolve حذف شد (دبیر داوری می‌کند)',
    expectFail: 'C14'
  },
  {
    file: 'server/conflicts.js', suite: 'tests/server15.js',
    bad: "if(s.role === 'manager' && c.school_id != null && Number(c.school_id) !== Number(s.school_id))",
    mut: "if(false && s.role === 'manager' && c.school_id != null && Number(c.school_id) !== Number(s.school_id))",
    name: 'M5 دامنهِٔ مدرسهِٔ resolve حذف شد (بین‌مدرسه‌ای داوری می‌کند)',
    expectFail: 'C13'
  },
  {
    file: 'server/sync.js', suite: 'tests/server15.js',
    bad: 'if(VERSIONED[op.c] && Number(op.base_version) !== cur){',
    mut: "if((VERSIONED[op.c] || op.c === 'announcements') && Number(op.base_version) !== cur){",
    name: 'M6 base_version روی مجموعهٔ LWW هم الزام شد',
    expectFail: 'C6b'
  }
];

let killed = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log('  ❌ ' + m.name + ': الگوی اصلی پیدا نشد در ' + m.file); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut, 1));
  let out = '', crashed = false;
  const __cmd = 'node --max-old-space-size=1500 ' + m.suite;
  try { execSync(__cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
      try { execSync(__cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0627\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u0698\u0634\u062a \u0646\u06cc\u0633\u062a';
  }
  const failed = /\u274c/.test(out);
  const firstFail = (out.split('\n').find(l => l.includes('\u274c')) || '').trim();
  const killedThis = crashed ? (m.crashOK === true) : (failed && firstFail.includes(m.expectFail));
  fs.writeFileSync(m.file, src0);
  console.log('  ' + (killedThis ? '\u2705' : '\u274c') + ' ' + m.name + ' — ' + (killedThis ? '\u06a9\u0634\u062a\u0647 \u0634\u062f' : '\u0698\u0646\u062f\u0647 \u0645\u0627\u0646\u062f! (\u062e\u0631\u0648\u062c\u06cc: ' + firstFail + ')'));
  if (killedThis) killed++;
}
console.log('\n\u0628\u0627\u0632\u0628\u06cc\u0646\u06cc_\u062e\u0637_\u067e\u0627\u06cc\u0647 (\u0628\u062f\u0648\u0646 \u0698\u0634\u062a):');
const o = execSync('node --max-old-space-size=1500 tests/server15.js', { stdio: 'pipe' }).toString();
console.log('  server15: ' + (o.split('\n').find(l => l.includes('\u0686\u06a9\u0634\u0634')) || o.slice(-140)).trim());
console.log(killed === MUTS.length ? '\u0647\u0645\u0647\u200c' + MUTS.length + ' \u0698\u0634\u062a \u06a9\u0634\u062a\u0647 \u0634\u062f\u0646\u062f \u2705' : '\u0641\u0642\u0637 ' + killed + '/' + MUTS.length + ' \u0698\u0634\u062a \u06a9\u0634\u062a\u0647 \u0634\u062f \u274c');
process.exit(killed === MUTS.length ? 0 : 1);

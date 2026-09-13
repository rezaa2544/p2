#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — رفعِ race در sim_full3 (دور ۸۷)
   ───────────────────────────────────────────────────────────────────
   رفع = waitForDisk (خوانشِ مکرر تا شرط روی فایلِ disk برقرار شود).
   هر جهش باید sim_full3.js را بشکند؛ وگرنه رفع پنهان/بی‌اثر است:
   M1  هیچ صبر نشود (نخستین snapshot بازگردد)
   M2  فایل هرگز دوباره خوانده نشود (snapshotِ نخست کش می‌ماند)
   M3  timeoutِ صبر به ۱ میلی‌ثانیه برسد
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   بازنویسی نمی‌شود — بازگردانیِ دستی و rebuildِ پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('sf3-mut-');

const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'tests/sim_full3.js');
const ORIG = fs.readFileSync(FILE, 'utf8');

const MUTS = [
  {
    name: 'M1 صبر حذف شود (نخستین snapshot بدونِ تلاشِ دوباره)',
    bad: 'if (predicate(snap)) return snap;',
    mut: 'if (predicate(snap) || true) return snap;',
  },
  {
    name: 'M2 فایل هرگز دوباره خوانده نشود (کشِ snapshotِ نخست)',
    bad: "snap = JSON.parse(fs.readFileSync(file, 'utf8'));",
    mut: "if (!snap) snap = JSON.parse(fs.readFileSync(file, 'utf8'));",
  },
  {
    name: 'M3 timeoutِ صبر به ۱ms برسد',
    bad: 'timeoutMs = 6000',
    mut: 'timeoutMs = 1',
  },
];

function runSim(e) {
  let r;
  try {
    const out = execSync('node tests/sim_full3.js', { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: e });
    r = { code: 0, out };
  } catch (e) {
    r = { code: e.status || 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
  /* R90 — empty output = process killed (env/memory): retry once, and never
     count that as a mutation kill (reverse false-positive of the 15 suites) */
  if (String(r.out || '').trim() === '') {
    try {
      const out = execSync('node tests/sim_full3.js', { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: e });
      r = { code: 0, out };
    } catch (e2) {
      r = { code: e2.status || 1, out: String(e2.stdout || '') + String(e2.stderr || '') };
    }
  }
  return r;
}

let killed = 0;
let envFails = 0;
for (const m of MUTS) {
  if (ORIG.indexOf(m.bad) < 0) { console.log('  ❌ ' + m.name + ' — الگو پیدا نشد'); continue; }
  kit.mutant(path.resolve(FILE), ORIG.replace(m.bad, m.mut)); /* کپی جدا */
  const r = runSim(kit.env());
  const emptyOut = String(r.out || '').trim() === '';
  const dead = !emptyOut && r.code !== 0;
  if (emptyOut) envFails++;
  console.log('  ' + (dead ? '✅' : '❌') + ' ' + m.name + ' — '
    + (emptyOut ? '\u062e\u0637\u0627: \u0641\u0631\u0622\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u0645\u062d\u0634\u0648\u0628 \u0634\u062f'
                : (dead ? 'کشته شد (exit ' + r.code + ')' : 'زنده ماند!')));
  if (dead) killed++;
}

const final = runSim();
const backGreen = final.code === 0 && final.out.includes('❌ 0');
if (String(final.out || '').trim() === '') console.log('\u062e\u0637\u0627: \u062e\u0631\u0648\u062c\u06ccِ \u067e\u0627\u06cc\u0627\u0646 \u062e\u0627\u0644\u06cc (\u0641\u0631\u0622\u06cc\u0646\u062f \u06a9\u0634\u062a\u0647 \u0634\u062f \u2014 \u0645\u062d\u06cc\u0637)');
console.log('\nجهش: ' + killed + '/' + MUTS.length + ' کشته' + (killed === MUTS.length && backGreen && envFails === 0 ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen || envFails > 0) {
  console.log('خروجیِ پایانی:');
  console.log(String(final.out).split('\n').slice(-12).join('\n'));
}
process.exit(killed === MUTS.length && backGreen && envFails === 0 ? 0 : 1);

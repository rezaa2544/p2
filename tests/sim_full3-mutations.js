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

function runSim() {
  try {
    const out = execSync('node tests/sim_full3.js', { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status || 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

let killed = 0;
for (const m of MUTS) {
  if (ORIG.indexOf(m.bad) < 0) { console.log('  ❌ ' + m.name + ' — الگو پیدا نشد'); continue; }
  fs.writeFileSync(FILE, ORIG.replace(m.bad, m.mut));
  const r = runSim();
  const dead = r.code !== 0;
  console.log('  ' + (dead ? '✅' : '❌') + ' ' + m.name + ' — ' + (dead ? 'کشته شد (exit ' + r.code + ')' : 'زنده ماند!'));
  if (dead) killed++;
  fs.writeFileSync(FILE, ORIG);
}

const final = runSim();
const backGreen = final.code === 0 && final.out.includes('❌ 0');
console.log('\nجهش: ' + killed + '/' + MUTS.length + ' کشته' + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ پایانی:');
  console.log(final.out.split('\n').slice(-12).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);

#!/usr/bin/env node
/**
 * تست‌های جهشیِ شاخصِ سلامت (G.1)
 *  M1 — جابه‌جاییِ مرزِ سبز (۳۰ → ۲۰) → H1
 *  M2 — تضعیفِ نمرهٔ تیکت (۲۵ → ۱۰) → H1
 *  M3 — خنثیِ ۵۰ → ۰ (سکوت = سالمِ دروغین) → H1
 *  M4 — برداشتنِ گاردِ سوپرادمین → H4/H5
 *  M5 — تضعیفِ وزنِ تیکت (۰٫۳۰ → ۰٫۱۰) → H2
 *
 * اجرا:  node tests/health-index-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(from, to, killRe, tag) {
  const f = path.join(ROOT, 'server/health-index.js');
  const orig = fs.readFileSync(f, 'utf8');
  if (orig.indexOf(from) < 0) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, orig.replace(from, to), 'utf8');
  try {
    const r = spawnSync(NODE, [path.join(ROOT, 'tests/health-index.js')], { cwd: ROOT, encoding: 'utf8' });
    const done = /سوئیت سلامت:/.test(r.stdout || '');
    chk(done && r.status !== 0 && killRe.test(r.stdout || ''), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate("if (score <= 30) return 'green';", "if (score <= 20) return 'green';",
  /❌ مرزِ رنگ/, 'M1 جابه‌جاییِ مرزِ سبز');

mutate('return clampScore(open * 25);', 'return clampScore(open * 10);',
  /❌ تیکت:/, 'M2 تضعیفِ نمرهٔ تیکت');

mutate('return { score: 50, noBaseline: true, noData: true };', 'return { score: 0, noBaseline: true, noData: true };',
  /❌/, 'M3 سکوت = سالمِ دروغین');

mutate("if (s.role !== 'superadmin') {", 'if (false) {',
  /❌ مدیر → ۴۰۳/, 'M4 برداشتنِ گاردِ سوپرادمین');

mutate('tickets: 0.30', 'tickets: 0.10',
  /❌ بازتوزیعِ وزن/, 'M5 تضعیفِ وزنِ تیکت');

/* خطِّ پایه */
const fin = spawnSync(NODE, [path.join(ROOT, 'tests/health-index.js')], { cwd: ROOT, encoding: 'utf8' });
const green = fin.status === 0 && /بدون خطا ✅/.test(fin.stdout || '');
console.log(`\nhealth-index-mutations: ${pass}/5 کشته؛ سبزِ نهایی: ${green ? '✅' : '❌'}`);
process.exit(pass === 5 && green ? 0 : 1);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — WAF فقط-تشخیص (P-WAF)
   هر جهش باید tests/waf-ddos.js را بشکاند؛ وگرنه تست بی‌اثر است.
   اجرا (از ریشهٔ ریپو): node tests/waf-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'server/waf.js': fs.readFileSync('server/waf.js', 'utf8'),
};

const UNIT = 'node tests/waf-ddos.js --unit-only';
const FULL = 'node tests/waf-ddos.js';

const MUTS = [
  {
    file: 'server/waf.js', cmd: UNIT,
    name: 'M1 قانونِ sqli بی‌اثر شود (id/field خراب)',
    bad: "  { id: 'sqli', field: 'url', res: [",
    mut: "  { id: 'sqli-never', field: 'nope', res: [ /* MUT */",
    expectFail: 'DET-a',
  },
  {
    file: 'server/waf.js', cmd: FULL,
    name: 'M2 مهارِ ممیزی برداشته شود (سیلِ audit)',
    bad: 'if (r && r.allowed && typeof am.audit',
    mut: 'if (r && true && typeof am.audit /* MUT */',
    expectFail: 'INT-g ممیزی',
  },
  {
    file: 'server/waf.js', cmd: FULL,
    name: 'M3 سرآیندِ verdict خراب شود',
    bad: "res.setHeader('X-WAF-Verdict', w.verdict);",
    mut: "res.setHeader('X-WAF-Nothing', w.verdict); /* MUT */",
    expectFail: 'INT-a',
  },
  {
    file: 'server/waf.js', cmd: UNIT,
    name: 'M4 سقفِ نرخ صفر شود',
    bad: 'var RATE_LIMIT = 100;',
    mut: 'var RATE_LIMIT = 0; /* MUT */',
    expectFail: 'LIM-a',
  },
];

function restore() {
  Object.keys(FILES).forEach((f) => fs.writeFileSync(f, FILES[f]));
}

let killed = 0;
console.log('\n▸ جهش‌های WAF (M1–M4)');
MUTS.forEach((m) => {
  const src = fs.readFileSync(m.file, 'utf8');
  if (src.indexOf(m.bad) < 0) {
    console.log(`  ⚠️ ${m.name}: لنگر یافت نشد — جهش اعمال نشد`);
    return;
  }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  let out = '';
  let crashed = false;
  try {
    out = execSync(m.cmd, { stdio: 'pipe', timeout: 240000 }).toString();
  } catch (e) {
    crashed = true;
    out = String((e.stdout || '') + (e.stderr || ''));
  }
  restore();
  const dead = out.indexOf(m.expectFail) >= 0 && /❌|ناموفق/.test(out);
  if (dead) { killed++; console.log(`  ✅ ${m.name}: کشته شد (${m.expectFail})`); }
  else {
    console.log(`  ❌ ${m.name}: زنده ماند! (crash=${crashed})`);
    console.log('     ' + out.split('\n').slice(-6).join('\n     ').slice(0, 500));
  }
});

restore();
let backGreen = false, finalOut = '';
try {
  finalOut = execSync(FULL, { stdio: 'pipe', timeout: 420000 }).toString();
  backGreen = /0 ناموفق/.test(finalOut);
} catch (e) {
  finalOut = String(e.stdout || '');
}
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-12).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);

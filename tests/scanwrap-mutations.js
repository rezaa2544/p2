#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندیِ لفافِ اسکنِ راز — هر جهش باید tests/scanwrap.js را بشکند.
   اجرا:  node tests/scanwrap-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const FILE = 'tools/secret-scan.js';
const MUTS = [
  {
    name: 'SM1 خروج همیشه ۰ (نفوذ پنهان می‌ماند)',
    bad: 'process.exit(typeof r.status === \'number\' ? r.status : 1);',
    mut: 'process.exit(0);',
    expectFail: 'SW2',
  },
  {
    name: 'SM2 مسیرِ اسکنرِ واقعی خراب شود',
    bad: "'tests', 'secret-scan.js'",
    mut: "'tests', 'secret-scan-NOPE.js'",
    expectFail: 'SW1',
  },
];

function runBase(){
  try {
    const out = execSync('node tests/scanwrap.js', { stdio: 'pipe' }).toString();
    return { code: 0, out };
  } catch(e){
    return { code: 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

let killed = 0;
for(const m of MUTS){
  const src = fs.readFileSync(FILE, 'utf8');
  if(src.indexOf(m.bad) < 0){ console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(FILE, src.replace(m.bad, m.mut));
  const r = runBase();
  const dead = r.code !== 0 && r.out.indexOf('❌') > -1 && r.out.indexOf(m.expectFail) > -1;
  fs.writeFileSync(FILE, src);
  if(dead){ killed++; console.log(`  ✅ ${m.name} کشته شد (شکستِ ${m.expectFail})`); }
  else console.log(`  ❌ ${m.name} زنده ماند!`);
}

const fin = runBase();
const green = fin.code === 0 && fin.out.indexOf('2/2') > -1;
console.log(green
  ? `\nهمهٔ ${MUTS.length} جهش کشته شدند و سوئیتِ پایه سبز است ✅`
  : `\nفقط ${killed}/${MUTS.length} جهش کشته شد یا سوئیتِ پایه سبز نیست ❌`);
process.exit(killed === MUTS.length && green ? 0 : 1);

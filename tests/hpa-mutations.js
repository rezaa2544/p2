#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندیِ گاردِ HPA — هر جهش باید tests/hpa.js را بشکند.
   اجرا:  node tests/hpa-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'k8s/hpa-payesh-api.yaml',
    name: 'HM1 آستانهٔ CPU از ۷۰ به ۷۱ بلغزد',
    bad: 'averageUtilization: 70',
    mut: 'averageUtilization: 71',
    expectFail: 'H2',
  },
  {
    file: 'k8s/hpa-payesh-redis.yaml',
    name: 'HM2 قفلِ رپلیکایِ redis باز شود (‏max ۱←۲‏)',
    bad: 'maxReplicas: 1',
    mut: 'maxReplicas: 2',
    expectFail: 'H5',
  },
];

function runBase(){
  try {
    const out = execSync('node tests/hpa.js', { stdio: 'pipe' }).toString();
    return { code: 0, out };
  } catch(e){
    return { code: 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

let killed = 0;
for(const m of MUTS){
  const src = fs.readFileSync(m.file, 'utf8');
  if(src.indexOf(m.bad) < 0){ console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  const r = runBase();
  const dead = r.code !== 0 && r.out.indexOf('❌') > -1 && r.out.indexOf(m.expectFail) > -1;
  fs.writeFileSync(m.file, src);
  if(dead){ killed++; console.log(`  ✅ ${m.name} کشته شد (شکستِ ${m.expectFail})`); }
  else console.log(`  ❌ ${m.name} زنده ماند!`);
}

const fin = runBase();
const green = fin.code === 0 && fin.out.indexOf('6/6') > -1;
console.log(green
  ? `\nهمهٔ ${MUTS.length} جهش کشته شدند و سوئیتِ پایه سبز است ✅`
  : `\nفقط ${killed}/${MUTS.length} جهش کشته شد یا سوئیتِ پایه سبز نیست ❌`);
process.exit(killed === MUTS.length && green ? 0 : 1);

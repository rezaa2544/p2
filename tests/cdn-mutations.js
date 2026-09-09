#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندیِ گاردِ CDN — هر جهش باید tests/cdn.js را بشکند.
   اجرا:  node tests/cdn-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

function runBase(){
  try {
    const out = execSync('node tests/cdn.js', { stdio: 'pipe' }).toString();
    return { code: 0, out };
  } catch(e){
    return { code: 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* جهش‌ها برنامه‌ای ساخته می‌شوند تا به هشِ امروزِ بیلد قفل نشوند. */
const manifest = JSON.parse(fs.readFileSync('cdn-manifest.json', 'utf8'));
const seal = manifest.seal12;
const flipped = seal.slice(0, 11) + (seal[11] === '0' ? '1' : '0');

const MUTS = [
  {
    file: 'cloudflare/worker.js',
    name: 'CM1 TTL یک‌ساله به ۱ ثانیه بلغزد',
    bad: 'max-age=31536000',
    mut: 'max-age=1',
    expectFail: 'C1',
  },
  {
    file: 'cdn-manifest.json',
    name: 'CM2 مُهرِ مانیفست خراب شود',
    bad: seal,
    mut: flipped,
    expectFail: 'C3',
  },
];

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
const green = fin.code === 0 && fin.out.indexOf('5/5') > -1;
console.log(green
  ? `\nهمهٔ ${MUTS.length} جهش کشته شدند و سوئیتِ پایه سبز است ✅`
  : `\nفقط ${killed}/${MUTS.length} جهش کشته شد یا سوئیتِ پایه سبز نیست ❌`);
process.exit(killed === MUTS.length && green ? 0 : 1);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — ابزارِ migration نسخه‌دار
   هر جهش باید tests/migration.js را بشکاند؛ وگرنه تست بی‌اثر است.
   اجرا:  node tests/migration-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'scripts/migrate.js',
    name: 'MM1 گاردِ DATABASE_URL برداشته شود (fail-closed بی‌اثر)',
    bad: '  if(!u){',
    mut: '  if(false){',
    expectFail: 'MG6',
  },
  {
    file: 'scripts/migrate.js',
    name: 'MM2 ماسکِ رمز در لاگ برداشته شود (نشتِ اعتبار)',
    bad: "  return String(u || '').replace(/(:\\/\\/[^:/@]+:)[^@]+(@)/, '$1***$2');",
    mut: "  return String(u || '');",
    expectFail: 'MG7',
  },
  {
    file: 'migrations/001_initial.sql',
    name: 'MM3 مارکرِ Down در 001 خراب شود',
    bad: '-- Down Migration',
    mut: '-- Down MigrationX',
    expectFail: 'MG1',
  },
];

function runBase(){
  try {
    const out = execSync('node tests/migration.js', { stdio: 'pipe' }).toString();
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
const green = fin.code === 0 && fin.out.indexOf('8/8') > -1;
console.log(green
  ? `\nهمهٔ ${MUTS.length} جهش کشته شدند و سوئیتِ پایه سبز است ✅`
  : `\nفقط ${killed}/${MUTS.length} جهش کشته شد یا سوئیتِ پایه سبز نیست ❌`);
process.exit(killed === MUTS.length && green ? 0 : 1);

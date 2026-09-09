#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — سیاستِ یکپارچهٔ دسترسیِ REST (P0-03)
   هر جهش باید tests/policy.js را بشکاند؛ وگرنه تست بی‌اثر است.
   (جهش‌ها سمتِ سرورند؛ نیازی به node build.js نیست.)
   اجرا:  node tests/policy-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'server/policy.js',
    name: 'M1 گیتِ نقش در authorize برداشته شود (canOp همیشه‌عبور)',
    bad: '    if(!exc && !sync.canOp(user.role, coll, op))',
    mut: '    if(false && !sync.canOp(user.role, coll, op))',
    expectFail: 'POL1',
  },
  {
    file: 'server/routes/students.js',
    name: 'M2 فراخوانیِ authorize از createStudent حذف شود (bypass)',
    bad: "    const pa = policy.authorize(user, 'ins', { coll: COLL }, { role: 'student', school_id: schoolId });\n    if(!pa.ok) return denied(pa);",
    mut: '    const pa = { ok: true };',
    expectFail: 'POL1',
  },
  {
    file: 'server/tenancy.js',
    name: 'M3 قلمروِ اداره همیشه‌روشن شود (inOfficeScope=true)',
    bad: '  return ids.indexOf(Number(schoolId)) > -1;',
    mut: '  return true; /* mutation: office sees everything */',
    expectFail: 'POL9',
  },
  {
    file: 'server/policy.js',
    name: 'M4 ردِ فیلدِ ناشناخته در validate برداشته شود',
    bad: '      if(!inModel && !inAlias)',
    mut: '      if(false)',
    expectFail: 'POL4',
  },
  {
    file: 'server/routes/users.js',
    name: 'M5 ممنوعیتِ IEP از مسیر users برداشته شود',
    bad: "    if(pa.exc === 'iep')",
    mut: '    if(false)',
    expectFail: 'POL5',
  },
];

function runBase(){
  try {
    const out = execSync('node tests/policy.js', { stdio: 'pipe' }).toString();
    return { code: 0, out };
  } catch(e){
    return { code: 1, out: String((e.stdout || '')) + String((e.stderr || '')) };
  }
}

let killed = 0;
for(const m of MUTS){
  const src = fs.readFileSync(m.file, 'utf8');
  if(src.indexOf(m.bad) < 0){ console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  const r = runBase();
  const dead = r.code !== 0 && r.out.indexOf('❌') > -1 && r.out.indexOf(m.expectFail) > -1;
  fs.writeFileSync(m.file, src); /* بازگشت */
  if(dead){ killed++; console.log(`  ✅ ${m.name} کشته شد (شکستِ ${m.expectFail})`); }
  else console.log(`  ❌ ${m.name} زنده ماند!`);
}

/* سبزِ نهایی پس از بازگشت */
const fin = runBase();
const green = fin.code === 0 && fin.out.indexOf('10/10') > -1;
console.log(green
  ? `\nهمهٔ ${MUTS.length} جهش کشته شدند و سوئیتِ پایه سبز است ✅`
  : `\nفقط ${killed}/${MUTS.length} جهش کشته شد یا سوئیتِ پایه سبز نیست ❌`);
process.exit(killed === MUTS.length && green ? 0 : 1);

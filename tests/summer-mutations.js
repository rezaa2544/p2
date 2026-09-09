#!/usr/bin/env node
/**
 * E.8 — تست جهش کلاس‌های تابستانی
 * M1: حذف فیلتر دبیر در نمای کلاس‌های خودش → U5
 * M2: حذف کنترل ظرفیت ثبت‌نام → U4
 * M3: حذف نقش دبیر از اکشن ثبت حضور → U5
 * M4: حذف کنترل دبیر همان کلاس در scope سرور → B8
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
let pass=0, fail=0, envFails=0;
function chk(c,m){ if(c){pass++;console.log('  ✅ '+m);} else {fail++;console.log('  ❌ '+m);} }
function runSuite(suite){ return spawnSync('node',[path.join(ROOT,suite)],{cwd:ROOT,encoding:'utf8',timeout:180000}); }
function completed(out){ return /بررسی — /.test(out||'') || /summer[23] \(E\.8/.test(out||''); }
function mutate(file, from, to, suite, killRe, tag){
  const f=path.join(ROOT,file); const orig=fs.readFileSync(f,'utf8'); const bad=orig.replace(from,to);
  if(bad===orig){ chk(false, tag+' — نماد جهش پیدا نشد'); return; }
  fs.writeFileSync(f,bad,'utf8');
  try{
    execFileSync('node',['build.js'],{cwd:ROOT,stdio:'ignore'});
    if(suite==='tests/summer3.js') execFileSync('node',['server/seed.js'],{cwd:ROOT,stdio:'ignore'});
    let r=runSuite(suite);
    if(r.status!==0 && !killRe.test(r.stdout) && !completed(r.stdout)){
      const r2=runSuite(suite);
      if(r2.status===0 || killRe.test(r2.stdout) || completed(r2.stdout)) r=r2;
    }
    if(r.status!==0 && !killRe.test(r.stdout) && !completed(r.stdout)){
      envFails++; chk(false, tag+' — خطای محیطی/مرگ زودهنگام، نه کشته نه زنده'); return;
    }
    chk(r.status!==0 && killRe.test(r.stdout), tag+' کشته شد');
  } finally { fs.writeFileSync(f,orig,'utf8'); execFileSync('node',['build.js'],{cwd:ROOT,stdio:'ignore'}); }
}

mutate('src/js/64-summer-classes.js',
  "if(u.role==='teacher') return all.filter(c=>Number(c.teacher_id)===Number(u.id));",
  "if(u.role==='teacher') return all.filter(c=>Number(c.school_id)===Number(u.school_id));",
  'tests/summer2.js', /❌ U5/, 'M1 حذف فیلتر دبیر');

mutate('src/js/19-actions-core.js',
  "if(sel.length>cap){toast('تعداد دانش‌آموزان از ظرفیت کلاس بیشتر است','err');return;}",
  "if(false&&sel.length>cap){toast('تعداد دانش‌آموزان از ظرفیت کلاس بیشتر است','err');return;}",
  'tests/summer2.js', /❌ U4/, 'M2 حذف کنترل ظرفیت');

mutate('src/js/30-authz.js',
  "'summer-att-save': ['manager','teacher'],",
  "'summer-att-save': ['manager'],",
  'tests/summer2.js', /❌ U5/, 'M3 حذف نقش دبیر از ثبت حضور');

mutate('server/sync.js',
  "if(u.role === 'teacher') return Number(cls.teacher_id) === Number(u.id);",
  "if(u.role === 'teacher') return true;",
  'tests/summer3.js', /❌ B8/, 'M4 حذف scope دبیر');

execFileSync('node',['build.js'],{cwd:ROOT,stdio:'ignore'});
let b=runSuite('tests/summer2.js'); chk(b.status===0,'خط پایه summer2 سبز است');
execFileSync('node',['server/seed.js'],{cwd:ROOT,stdio:'ignore'});
b=runSuite('tests/summer3.js'); chk(b.status===0,'خط پایه summer3 سبز است');
console.log(`\nsummer-mutations: ${pass+fail} بررسی — ✅ ${pass} · ❌ ${fail}${envFails?' · envFails='+envFails:''}`);
process.exit(fail?1:0);

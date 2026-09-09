#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   urgent-ann-mutations.js — بند د.۳: آزمون جهشِ اطلاعیه فوری/بحرانی
   ───────────────────────────────────────────────────────────────────
   M1  حذف فیلتر دامنهٔ دفتر در نمایش کلاینت  ⇒ ❌ U3
   M2  حذف دروازهٔ سمت سرور (بین‌اداره‌ای)     ⇒ ❌ V6
   M3  حذف مرتب‌سازی بحرانی/فوری               ⇒ ❌ U2
   M4  ann-save بدون office_id برای اداره      ⇒ ❌ U4
   اجرا:  node tests/urgent-ann-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE = path.join(ROOT, 'tests', 'urgent-ann.js');
const QF = path.join(ROOT, 'src', 'js', '04-queries.js');
const SF = path.join(ROOT, 'server', 'sync.js');
const AF = path.join(ROOT, 'src', 'js', '19-actions-core.js');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}

console.log('▸ خطِّ پایه');
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const base = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
chk('خطِّ پایهٔ urgent-ann سبز است', base.status === 0, (base.stdout || '').slice(-160));
if (base.status !== 0) { console.log((base.stdout || '') + (base.stderr || '')); process.exit(1); }

function mutate(file, find, replace, killRe, tag, rebuild) {
  const orig = fs.readFileSync(file, 'utf8');
  try {
    if (!orig.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false); return; }
    fs.writeFileSync(file, orig.replace(find, replace), 'utf8');
    if (rebuild) execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-240).replace(/\n/g, ' '));
  } finally {
    fs.writeFileSync(file, orig, 'utf8');
  }
}

console.log('\n▸ جهش‌ها');
mutate(QF,
  `if(a.office_id!=null){
      if(u.role==='superadmin')return true;
      if(u.role==='edu_office')return Number(a.office_id)===Number(u.office_id);
      return !!myOffice&&Number(a.office_id)===myOffice.id;
    }`,
  `if(a.office_id!=null){ return true; }`,
  /❌ U3/, 'M1 نشت دامنهٔ دفتر', true);

mutate(SF,
  `if(coll === 'announcements' && u.role === 'edu_office'){
    if(!rec){
      const oid = data && data.office_id;
      if(oid != null && Number(oid) !== Number(u.office_id)) return false;
    } else if(rec.office_id != null && Number(rec.office_id) !== Number(u.office_id)){
      return false;
    }
  }`,
  `/* دروازهٔ د.۳ حذف شد */`,
  /❌ V6/, 'M2 حذف دروازهٔ سرور', false);

mutate(QF,
  `.sort((a,b)=>((ANN_SEV_RANK[b.severity]||0)-(ANN_SEV_RANK[a.severity]||0))||(b.created_at||'').localeCompare(a.created_at||''));`,
  `.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));`,
  /❌ U2/, 'M3 حذف اولویت بحرانی/فوری', true);

mutate(AF,
  `const base=S.user.role==='edu_office'
         ?{school_id:null,office_id:S.user.office_id||null,created_by:S.user.id,created_at:todayISO()}
         :{school_id:S.user.school_id||null,office_id:null,created_by:S.user.id,created_at:todayISO()};`,
  `const base={school_id:S.user.school_id||null,office_id:null,created_by:S.user.id,created_at:todayISO()};`,
  /❌ U4/, 'M4 حذف دفتر از انتشار اداره', true);

/* بازسازی نهایی + بازگشت به خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const fin = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0);

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های د.۳: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);

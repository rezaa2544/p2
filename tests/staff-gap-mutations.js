#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   staff-gap-mutations.js — بند د.۴: آزمون جهشِ کمبود نیروی انسانی
   ───────────────────────────────────────────────────────────────────
   M1  حذف شمارش معلمانِ متمایز              ⇒ ❌ G1
   M2  بدون هنجار صفر شود (به‌جای تعریف‌نشده) ⇒ ❌ G2
   M3  حذف دروازهٔ دامنهٔ سمت سرور            ⇒ ❌ W2
   M4  حذف گارد نقشِ نما                      ⇒ ❌ G5
   M5  حذف اعتبارسنجی ورودی هنجار            ⇒ ❌ G6
   اجرا:  node tests/staff-gap-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE = path.join(ROOT, 'tests', 'staff-gap.js');
const F = path.join(ROOT, 'src', 'js', '75-staff-gap.js');
const SF = path.join(ROOT, 'server', 'sync.js');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}

console.log('▸ خطِّ پایه');
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const base = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
chk('خطِّ پایهٔ staff-gap سبز است', base.status === 0, (base.stdout || '').slice(-160));
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
mutate(F,
  'have[sl.school_id][sl.subject_id].add(sl.teacher_id);',
  'void 0; /* معلم شمرده نشد */',
  /❌ G1/, 'M1 حذف شمارش معلمان', true);

mutate(F,
  'const gap = req == null ? null : Math.max(0, req - haveC);',
  'const gap = req == null ? 0 : Math.max(0, req - haveC);',
  /❌ G2/, 'M2 بی‌هنجار⇒صفر', true);

mutate(SF,
  `if(coll === 'staff_posts' && u.role === 'edu_office'){
    const sid = (data && data.school_id != null) ? data.school_id
              : (rec && rec.school_id != null) ? rec.school_id : null;
    if(sid != null){
      const school = store_get('schools').find(s => s.id === Number(sid));
      const office = store_get('offices').find(o => o.id === Number(u.office_id));
      if(!school || !office) return false; /* fail-closed */
      if(office.province_id && school.province_id !== office.province_id) return false;
      if(office.county_id && school.county_id !== office.county_id) return false;
      if(office.district_id && school.district_id !== office.district_id) return false;
    }
  }`,
  `/* دروازهٔ د.۴ حذف شد */`,
  /❌ W2/, 'M3 حذف دروازهٔ سرور', false);

mutate(F,
  "if (u.role !== 'superadmin' && u.role !== 'edu_office') return viewForbidden();",
  '/* گارد نقش حذف شد */',
  /❌ G5/, 'M4 حذف گارد نقش', true);

mutate(F,
  `if (raw === '' || !Number.isFinite(required) || required < 0 || required !== Math.floor(required) || required > 500) {
      toast('تعداد موردنیاز باید عدد صحیح بین ۰ تا ۵۰۰ باشد', 'err'); return;
    }`,
  `/* اعتبارسنجی حذف شد */`,
  /❌ G6/, 'M5 حذف اعتبارسنجی', true);

/* بازسازی نهایی + بازگشت به خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const fin = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0);

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های د.۴: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * تست‌های جهشی فاز ۰.۱ — نوع ساختاری مدرسه (school_type)
 *  SM1 — دست‌کاری سطر rural (چندپایه ۱→۰) → ST1
 *  SM2 — عوض شدن پیش‌فرض fail-closed به non_profit → ST2
 *  SM3 — تقدم نوعی بر صریح (وارونه شدن زنجیره) → ST3
 *  SM4 — تهی شدن enum سرور → ST6
 *  SM5 — از کار افتادن flip خودکار مودال → ST4
 *
 * اجرا:  node tests/school-type-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8' });
    const completed = (o) => /نوع مدرسه \(school_type\): /.test(o || '');
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    let r = runOnce();
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      const r2 = runOnce();
      if (r2.status === 0 || killRe.test(r2.stdout) || completed(r2.stdout)) r = r2;
    }
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      envFails++;
      chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد — نه کشته و نه زنده شمرده شد');
      return;
    }
    chk(r.status !== 0 && killRe.test(r.stdout), tag);
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/09-schools.js',
  "['rural','روستایی / عشایری',{tuition:0,dorm:0,iep:0,multigrade:1,workshop:0,entrance_exam:0}]",
  "['rural','روستایی / عشایری',{tuition:0,dorm:0,iep:0,multigrade:0,workshop:0,entrance_exam:0}] /* SM1 */",
  'tests/school-type.js', /❌ ST1/, 'SM1 دست‌کاری سطر rural');

mutate('src/js/09-schools.js',
  "return SCHOOL_TYPE_IDS.indexOf(t)>-1?t:'governmental';",
  "return SCHOOL_TYPE_IDS.indexOf(t)>-1?t:'non_profit'; /* SM2 */",
  'tests/school-type.js', /❌ ST2/, 'SM2 عوض شدن پیش‌فرض fail-closed');

mutate('src/js/09-schools.js',
  'out[k[0]]=c[k[0]]==null?(row&&row[k[0]]!=null?row[k[0]]:CAP_DEFAULTS[k[0]]):Number(c[k[0]]);',
  'out[k[0]]=(row&&row[k[0]]!=null)?row[k[0]]:(c[k[0]]==null?CAP_DEFAULTS[k[0]]:Number(c[k[0]])); /* SM3 */',
  'tests/school-type.js', /❌ ST3/, 'SM3 وارونه شدن زنجیرهٔ تقدم');

mutate('server/validate.js',
  "return { type: 'enum', values: SCHOOL_TYPE_IDS };",
  "return { type: 'enum', values: [] }; /* SM4 */",
  'tests/school-type.js', /❌ ST6/, 'SM4 تهی شدن enum سرور');

mutate('src/js/19-actions-core.js',
  "if(id==='m_school_type'){",
  "if(false){ /* SM5 */",
  'tests/school-type.js', /❌ ST4/, 'SM5 از کار افتادن flip خودکار مودال');

execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
console.log(`جهش‌های نوع مدرسه: ${pass}/${pass + fail} کشته` + (envFails ? ` (${envFails} خطای محیطی)` : ''));
process.exit(fail || envFails ? 1 : 0);

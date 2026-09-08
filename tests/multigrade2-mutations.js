#!/usr/bin/env node
/**
 * تست‌های جهشیِ کلاسِ چندپایه (بند ۲.۱)
 *  M1 — classSubjectMembers ردیف‌ها را نادیده بگیرد (همیشه همهٔ کلاس) → G4
 *  M2 — ذخیرهٔ عضویت هیچ ردیفی ننویسد → G4
 *  M3 — برداشتنِ گاردِ has_multigrade از دکمه → G1
 *
 * اجرا:  node tests/multigrade2-mutations.js
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
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (o) => /بررسی — /.test(o || '');
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
  let r = runOnce();
  if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
    const r2 = runOnce();
    if (r2.status === 0 || killRe.test(r2.stdout) || completed(r2.stdout)) r = r2;
  }
  if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
    envFails++;
    chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد');
    return;
  }
  chk(r.status !== 0 && killRe.test(r.stdout), tag);
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/04-queries.js',
  "const rows=(db.class_subject_members||[]).filter(function(x){return x.class_id===cid&&x.subject_id===sid;});",
  "const rows=[];",
  'tests/multigrade2.js', /❌ G4/, 'M1 نادیده‌گرفتنِ ردیف‌ها در classSubjectMembers');

mutate('src/js/19-actions-admin.js',
  "chosen.forEach(function(k){insert('class_subject_members',{class_id:cls.id,subject_id:s,student_id:k});});",
  "chosen.forEach(function(k){/* جهش: نوشته نمی‌شود */});",
  'tests/multigrade2.js', /❌ G4/, 'M2 ذخیرهٔ عضویت بدون نوشتنِ ردیف');

mutate('src/js/11-classes-subjects.js',
  "${canEdit&&(typeof hasCap==='function'&&hasCap(c.school_id,'has_multigrade'))?`",
  "${canEdit?`",
  'tests/multigrade2.js', /❌ G1/, 'M3 برداشتنِ گاردِ has_multigrade');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/multigrade2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ multigrade2 سبز است');

console.log(`\nmultigrade2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);

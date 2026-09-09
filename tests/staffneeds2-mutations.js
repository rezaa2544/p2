#!/usr/bin/env node
/**
 * تست‌های جهشیِ کمبودِ نیروی انسانی (بند D.4)
 *  M1 — حذفِ فیلترِ محدوده (اداره همهٔ مدارس را ببیند)        → R5
 *  M2 — حذفِ اعتبارسنجیِ «درس از همان مدرسه»                  → R2
 *  M3 — حذفِ guardِ «رکورد از مدرسهٔ خودم»                     → R8
 *  M4 — تأمین‌شده هم جزوِ نیازهایِ باز شمرده شود              → R6
 *  M5 — حذفِ esc از توضیح در نمای اداره (XSS)                 → R9
 *  M6 — اداره بتواند بنویسد (نقشِ edu_office به ins اضافه شود) → R3
 *
 * اجرا:  node tests/staffneeds2-mutations.js
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
    const completed = (o) => /بررسی — /.test(o || '');
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

const NEED = 'src/js/71-staff-needs.js';
const S = 'tests/staffneeds2.js';

mutate(NEED,
  "  var rows = (db.staff_needs || []).filter(function(n){ return ids[n.school_id]; })",
  "  var rows = (db.staff_needs || []).filter(function(n){ return true; })",
  S, /❌ R5/, 'M1 حذفِ فیلترِ محدوده');

mutate(NEED,
  "    if(!s || s.school_id !== sid){ toast('درس نامعتبر است', 'err'); return; }",
  "    if(!s){ toast('درس نامعتبر است', 'err'); return; }",
  S, /❌ R2/, 'M2 حذفِ اعتبارسنجیِ «درس از همان مدرسه»');

mutate(NEED,
  "  return n.school_id === S.user.school_id;\n}",
  "  return true;\n}",
  S, /❌ R8/, 'M3 حذفِ guardِ «رکورد از مدرسهٔ خودم»');

mutate(NEED,
  "  rows.forEach(function(r){\n    if(!r.open) return;",
  "  rows.forEach(function(r){\n    if(false) return;",
  S, /❌ R6/, 'M4 تأمین‌شده هم باز شمرده شود');

mutate(NEED,
  "+ '<td class=\"small muted\">' + esc(r.need.note || '—') + '</td>'",
  "+ '<td class=\"small muted\">' + (r.need.note || '—') + '</td>'",
  S, /❌ R9/, 'M5 حذفِ esc از توضیح در نمای اداره');

/* M6: نقشِ اداره به نویسندگان اضافه شود — باید R3 را بشکند */
const MODEL = 'authz/model.json';
const origModel = fs.readFileSync(path.join(ROOT, MODEL), 'utf8');
const badModel = origModel.replace(
  '"ins": ["manager", "superadmin"],\n    "upd": ["manager", "superadmin"],\n    "del": ["manager", "superadmin"],\n    "note": "D.4',
  '"ins": ["manager", "superadmin", "edu_office"],\n    "upd": ["manager", "superadmin"],\n    "del": ["manager", "superadmin"],\n    "note": "D.4');
if (badModel === origModel) chk(false, 'M6: جهش اعمال نشد (نماد پیدا نشد)');
else {
  fs.writeFileSync(path.join(ROOT, MODEL), badModel, 'utf8');
  try {
    execFileSync('node', ['tools/generate-write-perms.js'], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [S], { cwd: ROOT, encoding: 'utf8' });
    chk(r.status !== 0 && /❌ R3/.test(r.stdout), 'M6 اداره بتواند بنویسد');
  } finally {
    fs.writeFileSync(path.join(ROOT, MODEL), origModel, 'utf8');
    execFileSync('node', ['tools/generate-write-perms.js'], { cwd: ROOT, stdio: 'ignore' });
  }
}

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, S)], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ staffneeds2 سبز است');

console.log(`\nstaffneeds2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}` + (envFails ? ` · خطای محیطی: ${envFails}` : ''));
process.exit(fail ? 1 : 0);

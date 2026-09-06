#!/usr/bin/env node
/**
 * تست‌های جهشیِ صورت‌جلسهٔ انجمن (بند ۶.۲)
 *  M1 — برداشتنِ دامنهٔ مدرسه در assocMinutes → A1
 *  M2 — ثابت‌کردنِ archived:true در toggle → A4
 *  M3 — برداشتنِ assoc_minutes از WRITE_PERMS (سرور) → B1
 *
 * اجرا:  node tests/assocmin2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8' });
    chk(r.status !== 0 && killRe.test(r.stdout), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/60-association.js',
  'function(m){return m.school_id===schoolId;}',
  'function(m){return true;}',
  'tests/assocmin2.js', /❌ A1/, 'M1 برداشتنِ دامنهٔ مدرسه');

mutate('src/js/19-actions.js',
  "update('assoc_minutes',m.id,{archived:!m.archived,updated_at:todayISO()});",
  "update('assoc_minutes',m.id,{archived:true,updated_at:todayISO()});",
  'tests/assocmin2.js', /❌ A4/, 'M2 ثابت‌کردنِ archived:true');

mutate('server/sync.js',
  "'reexams','assoc_minutes']",
  "'reexams']",
  'tests/assocmin3.js', /❌ B1/, 'M3 برداشتنِ assoc_minutes از WRITE_PERMS');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/assocmin2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ assocmin2 سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/assocmin3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ assocmin3 سبز است');

console.log(`\nassocmin2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);

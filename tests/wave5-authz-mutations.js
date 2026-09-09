#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave5-authz-mutations.js — ویو ۵: آزمون جهشِ دروازهٔ ایزولاسیون
   ───────────────────────────────────────────────────────────────────
   M1  حذف دروازهٔ دامنه (همه‌چیز برای اداره آزاد)   ⇒ ❌ T2/T4/T6/T7
   M2  آزادشدنِ ساختِ دفتر برای اداره                 ⇒ ❌ T5
   M3  حذف حلِّ مهار از گیرنده (user_id)               ⇒ ❌ T7
   اجرا:  node tests/wave5-authz-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE = path.join(ROOT, 'tests', 'wave5-authz.js');
const F = path.join(ROOT, 'server', 'sync.js');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}

console.log('▸ خطِّ پایه');
const base = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
chk('خطِّ پایهٔ wave5-authz سبز است', base.status === 0, (base.stdout || '').slice(-160));
if (base.status !== 0) { console.log((base.stdout || '') + (base.stderr || '')); process.exit(1); }

function mutate(find, replace, killRe, tag) {
  const orig = fs.readFileSync(F, 'utf8');
  try {
    if (!orig.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false); return; }
    fs.writeFileSync(F, orig.replace(find, replace), 'utf8');
    const r = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-240).replace(/\n/g, ' '));
  } finally {
    fs.writeFileSync(F, orig, 'utf8');
  }
}

console.log('\n▸ جهش‌ها');
mutate(
  `return schoolInOfficeScope(sid);`,
  `return true; /* دروازهٔ دامنه حذف شد */`,
  /❌ T2|❌ T4|❌ T6|❌ T7/, 'M1 حذف دروازهٔ دامنه');

mutate(
  `if(coll === 'offices') return false;`,
  `if(coll === 'offices') return true; /* ساخت دفتر آزاد شد */`,
  /❌ T5b/, 'M2 ساخت دفتر برای اداره');

mutate(
  `if(sid == null && t.user_id != null){
        const rcp = store_get('users').find(x => x.id === Number(t.user_id));
        sid = rcp ? rcp.school_id : null;
      }`,
  `/* حلِّ مهار از گیرنده حذف شد */`,
  /❌ T7/, 'M3 حذف مهار گیرنده');

const fin = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0);

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های ویو ۵: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);

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
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانی حذف شد (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('uann-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */
const SUITE = path.join(ROOT, 'tests', 'urgent-ann.js');
const QF = path.join(ROOT, 'src', 'js', '04-queries.js');
const SF = path.join(ROOT, 'server', 'sync.js');
const PF = path.join(ROOT, 'server', 'policy.js'); /* ترمیم لنگر: دروازهٔ د.۳ اینجاست */
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
    const mcopy = kit.mutant(file, orig.replace(find, replace)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(file).mode); } catch (_) {}
    if (rebuild) execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() }); /* build در سایه */
    const r = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240000, env: kit.env() });
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-240).replace(/\n/g, ' '));
  } finally {
    kit.clear(file); /* نقشهٔ خالی؛ پاک‌سازیِ واقعی در exit */
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

mutate(PF,
  /* ترمیم لنگر (BH-mut فاز ۲): دروازهٔ د.۳ از sync.js به policy.js منتقل شد
     (ویو ۵ — استخراج policy) و فرمِ ساده‌تری گرفت؛ لنگر با جانشینِ منبعِ فعلی. */
  `if (coll === 'announcements') {
      const t0 = rec || data || {};
      if (t0.office_id != null && Number(t0.office_id) !== Number(u.office_id)) return false;
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

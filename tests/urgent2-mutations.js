#!/usr/bin/env node
/**
 * تست‌های جهشیِ پیامِ «فوری / بحرانی» (بند D.3)
 *  M1 — بی‌اثر کردنِ اولویت در صف               → R5
 *  M2 — حذفِ عبورِ فوری از صفِ تأیید             → R6
 *  M3 — نادیده‌گرفتنِ تنظیمِ مدرسه (همیشه بی‌درنگ) → R7
 *  M4 — کوتاه‌کردنِ مهلت حتی وقتی خودکار نمی‌رود  → R10
 *  M5 — بی‌اثر کردنِ گاردِ نقش در ثبتِ فوری        → R3
 *  M6 — از کار انداختنِ تشخیصِ فوری              → R1
 *
 * اجرا:  node tests/urgent2-mutations.js
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

const URG = 'src/js/70-urgent-notice.js';
const SMS = 'src/js/44-sms-notify.js';
const S = 'tests/urgent2.js';

mutate(URG,
  'function notifyQueueCmp(a, b){\n  var pa = notifyPriority(a), pb = notifyPriority(b);',
  'function notifyQueueCmp(a, b){\n  var pa = 2, pb = 2;',
  S, /❌ R5/, 'M1 بی‌اثر کردنِ اولویت در صف');

mutate(SMS,
  "if(q.kind === 'urgent' && notifyUrgentAutoOn(cfg)){ out.push(q.id); return; }",
  "if(false){ out.push(q.id); return; }",
  S, /❌ R6/, 'M2 حذفِ عبورِ فوری از صفِ تأیید');

mutate(URG,
  'return !!cfg.enabled && cfg.urgentAutoSend !== false;',
  'return true;',
  S, /❌ R7/, 'M3 نادیده‌گرفتنِ تنظیمِ مدرسه');

mutate(URG,
  'if(q && q.kind === URGENT_KIND && notifyUrgentAutoOn(cfg)) return Math.min(grace, URGENT_GRACE_MIN);',
  'if(q && q.kind === URGENT_KIND) return Math.min(grace, URGENT_GRACE_MIN);',
  S, /❌ R10/, 'M4 کوتاه‌کردنِ مهلتِ اصلاح در حالتِ دستی');

mutate('src/js/18-modals.js',
  "const _canUrg=['manager','edu_office','superadmin'].indexOf(S.user.role)>-1;",
  "const _canUrg=true;",
  S, /❌ R3/, 'M5 بی‌اثر کردنِ گاردِ نقشِ ناشر (ساختِ انتخابگر برای همه)');

mutate(URG,
  "function isUrgent(x){ return !!(x && (x.urgent === 1 || x.urgent === true || x.type === URGENT_KIND || x.kind === URGENT_KIND)); }",
  "function isUrgent(x){ return false; }",
  S, /❌ R1/, 'M6 از کار انداختنِ تشخیصِ فوری');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, S)], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ urgent2 سبز است');

console.log(`\nurgent2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}` + (envFails ? ` · خطای محیطی: ${envFails}` : ''));
process.exit(fail ? 1 : 0);

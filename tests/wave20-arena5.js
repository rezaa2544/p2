#!/usr/bin/env node
/* tests/wave20-arena5.js — ویو ۲۰: قراردادِ آرنا ۵ (تضمین کیفیت و اطمینان)
   ─────────────────────────────────────────────────────────────────────
   گروه‌ها:
   - DOC: سندِ آرنا ۵ و بخش‌های الزامی‌اش
   - SCR: اسکریپتِ رگرسیون (نحو، پوششِ کامل، گاردها)
   - CIN: گیت‌های سریع در نقطهٔ ورودِ CI و بستهٔ نود
   اجرا:  node tests/wave20-arena5.js
   هر تغییری در سند/اسکریپتِ آرنا ۵ باید این سوئیت را سبز نگه دارد. */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'ARENA5_QA_RELIABILITY.md');
const SCRIPT = path.join(ROOT, 'scripts', 'run-all-tests.sh');
const PKG = path.join(ROOT, 'package.json');
const CI_NODE = path.join(ROOT, '.github', 'workflows', 'node.js.yml');
const CI_SEC = path.join(ROOT, '.github', 'workflows', 'security.yml');

let pass = 0, fail = 0;
const failures = [];
function grp(t) { console.log('\n▸ ' + t); }
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (extra ? '\n     ' + String(extra).slice(0, 300) : '')); }
}

/* ── DOC: سندِ آرنا ۵ ─────────────────────────────────────────── */
function docGroup() {
  grp('DOC — سندِ آرنا ۵');
  let d = '';
  try { d = fs.readFileSync(DOC, 'utf8'); } catch (e) {}
  chk('DOC-0 سند هست', d.length > 2000, 'n=' + d.length);
  if (!d) return;
  chk('DOC-1 مسئولیت‌ها: جدولِ حوزه‌ها', /مسئولیت/.test(d) && /دروازهٔ انتشار/.test(d));
  chk('DOC-2 استراتژی: همهٔ هفت لایه نام برده شده',
    ['واحد', 'دودی', 'مجوز', 'امنیت', 'یکپارچگی', 'جهش', 'بار'].every((t) => d.indexOf(t) >= 0));
  chk('DOC-3 نقشهٔ CI: هر دو گردشِ کار نام برده شده',
    d.indexOf('node.js.yml') >= 0 && d.indexOf('security.yml') >= 0);
  chk('DOC-4 دروازهٔ انتشار: ده بند و معیارهای کلیدی',
    /دروازهٔ انتشار/.test(d) && /547\/547|۵۴۷\/۵۴۷/.test(d) && d.indexOf('check-authz') >= 0 &&
    d.indexOf('secret-scan') >= 0 && d.indexOf('run-all-tests.sh') >= 0 &&
    (d.match(/^\s*\d+\./gm) || []).length >= 10);
  chk('DOC-5 آشوب/بازیابی: فیل‌کلوزدِ پروداکشن و کرشِ کارگر',
    /فال‌بک.*ممنوع|فیل‌کلوزد/.test(d) && /اوت‌باکس|کارگر/.test(d));
  chk('DOC-6 قانون جهش ثبت شده', /جهش.*کشته|جهشِ زنده/.test(d));
}

/* ── SCR: اسکریپتِ رگرسیون ────────────────────────────────────── */
function scrGroup() {
  grp('SCR — اسکریپتِ رگرسیون');
  let s = '';
  try { s = fs.readFileSync(SCRIPT, 'utf8'); } catch (e) {}
  chk('SCR-0 اسکریپت هست', s.length > 1000);
  if (!s) return;
  let syntaxOk = false;
  try { syntaxOk = cp.spawnSync('bash', ['-n', SCRIPT], { stdio: 'pipe' }).status === 0; } catch (e) {}
  chk('SCR-1 نحوِ بش معتبر است', syntaxOk);
  chk('SCR-2 پوششِ سابت‌های REST (tests/api)', s.indexOf('tests/api/runner.js') >= 0);
  chk('SCR-3 کنارگذاشتِ طراحی فقط اسکریپتِ کارگر است',
    s.indexOf("grep -v 'server11-child.js'") >= 0);
  chk('SCR-4 گاردِ درختِ کثیف (خروجی ۳)', /DIRTY/.test(s) && /exit 3/.test(s));
  chk('SCR-5 گاردِ فضای موقت (خروجی ۴)', /exit 4/.test(s));
  chk('SCR-6 خوددرمانی: جی‌اس‌دام/سید/هویت/ریپو',
    /jsdom missing/.test(s) && /payesh\.json missing/.test(s) && /git identity missing/.test(s));
  chk('SCR-7 کشتنِ سرورهای زامبی پیش از اجرا (پورت ثابت)', /pkill -f 'node .*server\/index/.test(s));
  /* پوششِ کامل: هر پروندهٔ مستقیمی که اسکریپت ندیده باشد = قراردادِ شکسته */
  const all = fs.readdirSync(path.join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.js') && !f.endsWith('-mutations.js') && f !== 'server11-child.js');
  const muts = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('-mutations.js'));
  const apiRunner = fs.existsSync(path.join(ROOT, 'tests', 'api', 'runner.js'));
  chk('SCR-8 شمارِ زندهٔ سوئیت‌ها از حداقلِ سند بیشتر است',
    all.length >= 150 && muts.length >= 75, 'base=' + all.length + ' mut=' + muts.length);
  chk('SCR-9 دوندهٔ سابت‌های REST روی دیسک است', apiRunner);
}

/* ── CIN: گیت‌های سریعِ ورودی ─────────────────────────────────── */
function cinGroup() {
  grp('CIN — گیت‌های سریعِ ورودی');
  let pkg = '', ci = '', sec = '';
  try { pkg = JSON.parse(fs.readFileSync(PKG, 'utf8')); } catch (e) { pkg = { scripts: {} }; }
  try { ci = fs.readFileSync(CI_NODE, 'utf8'); } catch (e) {}
  try { sec = fs.readFileSync(CI_SEC, 'utf8'); } catch (e) {}
  chk('CIN-0 npm test = run.js + دودی',
    /tests\/run\.js/.test(pkg.scripts.test || '') && /smoke/.test(pkg.scripts.test || ''));
  /* 19ea463 (main, PR #45): ماتریسِ صادق — engines >=22 و jsdom 30 نیازمندِ >=22 است؛
     لن‌های 18/20 دودی را خاموش-اسکیپ می‌کردند (exit 0) = سبزِ دروغ. گیت: فقط 22.x. */
  chk('CIN-1 CI اصلی روی نسخهٔ صادقِ نود (honest matrix: 22.x فقط)',
    /22\.x/.test(ci) && !/18\.x/.test(ci) && !/20\.x/.test(ci));
  chk('CIN-2 CI اصلی بیلد و تست را اجرا می‌کند', /npm run build/.test(ci) && /npm test/.test(ci));
  chk('CIN-3 CI امنیتی: نشت‌یاب + نحوی نگینکس + واحدِ WAF',
    /secret-scan\.js/.test(sec) && /nginx -t/.test(sec) && /waf-ddos\.js --unit-only/.test(sec));
  chk('CIN-4 کلیدهای بیلد/بررسی در بسته هست', !!pkg.scripts['build:check'] && !!pkg.scripts.test);
}

/* ── main ────────────────────────────────────────────── */
(function main() {
  try {
    docGroup();
    scrGroup();
    cinGroup();
  } catch (e) {
    fail++;
    failures.push('crash: ' + String((e && e.message) || e));
    console.log('  ❌ کرش: ' + String((e && e.stack) || e).slice(0, 400));
  }
  console.log('\n' + '─'.repeat(52));
  console.log('ویو ۲۰ — آرنا ۵: ' + pass + '/' + (pass + fail) + ' موفق' + (fail ? ' — ' + fail + ' ناموفق ❌' : ' — بدون خطا ✅'));
  if (failures.length) console.log('ناموفق‌ها: ' + failures.join(' | ').slice(0, 400));
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})();

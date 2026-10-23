#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   server13-mutations.js — جهش‌مندیِ fail-fastِ TLS (دور 85, P1-4)
   ─────────────────────────────────────────────────────────────
   M1: گاردِ production خاموش شود → سرور با self-signed بالا می‌آید
       (T1 باید شکست بخورد)
   ─────────────────────────────────────────────────────────────
   M15-01 / `CI-FLAKE-01` (دو نقصِ ساختاریِ همین هارنس در CI فعال شد):
     ۱) بازبینیِ خطِ پایه با `execFileSync`ِ بدونِ try/catch بود؛ هر قرمزیِ
        سوئیتِ پایه (مثلاً `connect ECONNREFUSED 127.0.0.1:5432`) به‌شکلِ
        استثنایِ مدیریت‌نشده و دمپِ `Buffer(846) [Uint8Array]` در لاگِ step
        تمام می‌شد — بدونِ حکم، بدونِ تشخیصِ ریشه.
     ۲) «کشته شد» با `firstFail.includes('T1')` سنجیده می‌شد و 'T1' زیررشتهٔ
        'T1b' است؛ یعنی قرمزیِ T1b به هر دلیلیِ محیطی، جهش را «کشته» و
        دروازه را سبز می‌کرد (سبزِ دروغین).
   حالا: (الف) خطِ پایه **پیش از** هر جهش سنجیده می‌شود و قرمزبودنش سوئیت را
   با پیامِ `BASELINE-RED` قرمز می‌کند (نه با کرش)، (ب) قضاوتِ جهش در
   `tests/helpers/mutation-verdict.js` با تطبیقِ مرزِ واژه انجام می‌شود، و
   (پ) پس ازِ جهش‌ها خطِ پایه دوباره سبز‌سنجی می‌شود تا بقایایِ جهش به
   سرِ خطِ اصلی برنگردد. هیچ آستانه‌ای پایین نیامده است.
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const { runNode, judgeMutation, parseSuiteSummary, tail } = require('./helpers/mutation-verdict.js');
const kit = session('s13-mut-');
const ROOT = path.join(__dirname, '..');

const BASE_ARGS = ['--max-old-space-size=1500', 'tests/server13.js'];
const BASE_TIMEOUT_MS = Math.max(60000, Number(process.env.S13_BASE_TIMEOUT_MS || 300000) || 300000);
const CHILD_TIMEOUT_MS = Math.max(60000, Number(process.env.S13_CHILD_TIMEOUT_MS || 300000) || 300000);

const MUTS = [
  {
    file: 'server/index.js', suite: 'tests/server13.js',
    bad: "  if(process.env.PAYESH_ENV === 'production'){",
    mut: '  if(false){',
    name: 'M1 fail-fastِ production خاموش شد',
    expectFail: 'T1'
  }
];

/* اجرایِ خطِ پایه با capturaِ کامل — قرمزی به‌جایِ استثنا، به‌شکلِ داده برمی‌گردد. */
function baseline(label, env) {
  const res = runNode(BASE_ARGS, { cwd: ROOT, env, timeoutMs: BASE_TIMEOUT_MS });
  const sum = parseSuiteSummary(res.out);
  const green = res.ok === true && sum.suite === 'server13' && sum.total > 0 && sum.complete === true;
  console.log('  ' + (green ? '✅' : '❌') + ' ' + label + ' — ' +
    (sum.suite ? sum.pass + '/' + sum.total : 'بدونِ حکمِ قابلِ اتکا') +
    (green ? '' : ' :: ' + tail(res.out, 6)));
  return { green, res, sum };
}

function baselineRed(which, pre) {
  console.log('\n❌ BASELINE-RED — ' + which + ' بدونِ جهش سبز نشد؛ حکمِ جهش‌ها بی‌اعتبار است (تبدیلِ قرمزِ محیطی به سبز انجام نمی‌شود).');
  console.log('   علت‌هایِ ممکن: وابستگیِ محیط (پیش‌سنجِ `P0-PG ENVIRONMENT` در خودِ سوئیت) یا نقصِ واقعیِ fail-fast.');
  console.log('   دنبالهٔ خروجیِ پایه: ' + tail(pre.res.out, 10));
  process.exit(1);
}

/* ۱) خطِ پایه، پیش ازِ هر جهش. */
console.log('\nپیش‌سنجیِ خطِ پایه (پیش ازِ هر جهش):');
const pre = baseline('baseline-pre', undefined);
if (!pre.green) baselineRed('خطِ پایه (پیش ازِ جهش)', pre);

let killed = 0, prevFile = null;
for (const m of MUTS) {
  const abs = path.join(ROOT, m.file);
  if (prevFile && prevFile !== abs) kit.clear(prevFile); /* فقط جهشِ جاری فعال */
  prevFile = abs;
  const src0 = fs.readFileSync(abs, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log('  ❌ ' + m.name + ': الگوی اصلی پیدا نشد در ' + m.file); continue; }
  kit.mutant(abs, src0.replace(m.bad, m.mut, 1)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  const childArgs = ['--max-old-space-size=1500', m.suite];
  let res = runNode(childArgs, { cwd: ROOT, env: kit.env(), timeoutMs: CHILD_TIMEOUT_MS });
  if (res.out.trim() === '') { /* R89: خروجیِ خالی = فرزند کشته شد (محیط/حافظه) — یک تلاشِ مجدد */
    res = runNode(childArgs, { cwd: ROOT, env: kit.env(), timeoutMs: CHILD_TIMEOUT_MS });
  }
  const verdict = judgeMutation(res, m.expectFail, m.crashOK === true);
  console.log('  ' + (verdict.killed ? '✅' : '❌') + ' ' + m.name + ' — ' +
    (verdict.killed ? 'کشته شد (' + verdict.status + ')' : 'زنده ماند! (' + verdict.status + ': ' + verdict.note + ')'));
  if (verdict.killed) killed++;
}

/* ۲) بازبینیِ خطِ پایه پس ازِ جهش‌ها — این‌بار با guards، نه استثنایِ باز. */
console.log('\nبازبینیِ خطِ پایه (پس ازِ پاک‌شدنِ جهش):');
const post = baseline('baseline-post', undefined);
if (!post.green) baselineRed('خطِ پایه (پس ازِ جهش)', post);

const allKilled = killed === MUTS.length;
console.log('\nنتیجه: ' + killed + '/' + MUTS.length + ' جهش کشته شد · خطِ پایه سبز (پیش و پس ازِ جهش: ' +
  (pre.sum.pass + '/' + pre.sum.total) + ' و ' + (post.sum.pass + '/' + post.sum.total) + ')');
console.log(allKilled ? 'همهٔ ' + MUTS.length + ' جهش کشته شد ✅' : 'فقط ' + killed + '/' + MUTS.length + ' جهش کشته شد ❌');
process.exit(allKilled ? 0 : 1);

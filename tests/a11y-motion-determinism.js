#!/usr/bin/env node
'use strict';
/**
 * a11y-motion-determinism.js — نگهبانِ قطعی‌بودنِ اسکنِ a11y (A11Y-MOTION-01)
 * ═══════════════════════════════════════════════════════════════════════════
 * یافتهٔ متناوبِ `serious: color-contrast` در tests/a11y-runtime.js ریشه‌اش
 * حرکت بود، نه رنگ: axe-core نسبتِ کنتراست را از رنگِ محاسبه‌شدهٔ همان لحظه
 * می‌سازد و اسکن می‌توانست وسطِ `pop`/`fslide`/`transition`, یا درست پس از
 * یک repaintِ تایمری بیفتد ⇒ رنگِ آمیختهٔ نیمه‌کاره ⇒ serious.
 *
 * این تست (بدونِ مرورگر) سه چیز را قطعی می‌کند و mutation-verify است:
 *   ۱) قاعدهٔ prefers-reduced-motion کلِ حرکت را خاموش می‌کند (و در آرتیفکتِ
 *      ساخته‌شدهٔ index.html هم حاضر است).
 *   ۲) هارنس بی‌استثنا پیش از هر اسکن سدِ حرکت را می‌زند و هیچ انتظارِ
 *      جادوییِ waitForTimeout ندارد.
 *   ۳) خودِ سد (tests/helpers/a11y-quiescence.js) در محیطِ ساختگی واقعاً
 *      کار می‌کند: متناهی→finish، بی‌پایان→cancel، لجباز→شکستِ صریح
 *      (نه skip)، مرورگرِ بی‌getAnimations→شکست.
 *
 * هیچ‌جا شدتِ یافته پایین آورده یا قاعدهٔ axe خفه نمی‌شود؛ خروجی ۱ اگر
 * هر شرطی بشکند.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const {
  settleMotionInPage, isQuiescent, describeNotQuiescent, quiesce, DEFAULT_BUDGET_MS,
} = require('./helpers/a11y-quiescence');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }

/* ─────────────────────────────────────────────────────────────
   بخشِ ۱ — قاعدهٔ CSS (به‌صورتِ تابع تا mutation-verify شود)
   ───────────────────────────────────────────────────────────── */
const RM_MEDIA = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/;

/** بدنهٔ همهٔ بلوک‌های @media (prefers-reduced-motion:reduce) را برمی‌گرداند. */
function reducedMotionBodies(css) {
  const out = [];
  let i = 0;
  while ((i = css.indexOf('prefers-reduced-motion', i)) !== -1) {
    const open = css.indexOf('{', i);
    if (open === -1) break;
    let depth = 0, j = open;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') { depth--; if (depth === 0) break; }
    }
    out.push({ at: i, body: css.slice(open + 1, j) });
    i = j + 1;
  }
  return out;
}

/**
 * آیا قاعدهٔ reduced-motion تمامِ حرکت را خاموش می‌کند؟
 * لازم است: انتخابگرِ عمومی (`*,*::before,*::after`) + صفرکردنِ
 * animation-duration و transition-duration با !important + تک‌تکرار کردنِ
 * انیمیشن‌های بی‌پایان.
 */
function checkCssMotionGuard(css) {
  const problems = [];
  if (!RM_MEDIA.test(css)) problems.push('هیچ بلوکِ @media (prefers-reduced-motion:reduce) نیست');
  const bodies = reducedMotionBodies(css).map((b) => b.body).join('\n');
  const flat = bodies.replace(/\s+/g, ' ').replace(/\s*([{};:,])\s*/g, '$1');
  if (!/\*,\*::before,\*::after\{/.test(flat)) problems.push('انتخابگرِ عمومیِ *,*::before,*::after نیست (فقط چند کلاس خاموش می‌شود)');
  if (!/animation-duration:\s*\.?0*(\.001)?m?s\s*!important/.test(flat)) problems.push('animation-duration صفر/!important نیست');
  if (!/transition-duration:\s*\.?0*(\.001)?m?s\s*!important/.test(flat)) problems.push('transition-duration صفر/!important نیست');
  if (!/animation-iteration-count:\s*1\s*!important/.test(flat)) problems.push('animation-iteration-count:1 نیست (انیمیشن‌های بی‌پایان زنده می‌مانند)');
  return { ok: problems.length === 0, problems };
}

/**
 * آیا هارنسِ runtime پیش از هر اسکن سدِ حرکت را می‌زند و انتظارِ جادویی ندارد؟
 */
function checkHarnessMotionGuard(src) {
  const problems = [];
  if (!/require\(['"]\.\/helpers\/a11y-quiescence['"]\)/.test(src)) problems.push('هارنس ماژولِ سد را require نمی‌کند');
  /* بدنهٔ scan را با تطبیقِ آکولاد جدا می‌کنیم؛ بریدن تا اولین «await scan(»
     بدنهٔ تابع را شامل نمی‌شود (فراخوانیِ login بیرونِ تابع است) و نگهبان را
     بی‌اثر می‌کرد. */
  const scanStart = src.indexOf('async function scan(');
  let scanBody = '';
  if (scanStart !== -1) {
    const open = src.indexOf('{', scanStart);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    scanBody = end === -1 ? '' : src.slice(open, end + 1);
  }
  if (!/await quiesce\(page,/.test(scanBody)) problems.push('بدنهٔ scan سدِ حرکت را صدا نمی‌زند (اسکن می‌تواند وسطِ transition بیفتد)');
  if (/waitForTimeout\(\s*\d+\s*\)/.test(src)) problems.push('انتظارِ جادوییِ waitForTimeout هنوز در هارنس است');
  if (!/reducedMotion:\s*'reduce'/.test(src)) problems.push("context با reducedMotion:'reduce' ساخته نمی‌شود (لایهٔ دومِ دفاع)");
  if (!/new AxeBuilder\(\{ page \}\)/.test(src)) problems.push('AxeBuilder پیدا نشد (ساختارِ هارنس عوض شده)');
  return { ok: problems.length === 0, problems };
}

/* ─────────────────────────────────────────────────────────────
   بخشِ ۲ — بررسیِ زندهٔ سورس و آرتیفکت
   ───────────────────────────────────────────────────────────── */
const cssFiles = ['src/styles/fonts.css', 'src/styles/base.css', 'src/styles/mobile.css'];
const cssAll = cssFiles.map(read).join('\n');
const cssGuard = checkCssMotionGuard(cssAll);
const harnessSrc = read('tests/a11y-runtime.js');
const harnessGuard = checkHarnessMotionGuard(harnessSrc);
const built = read('index.html');

grp('قاعدهٔ prefers-reduced-motion در سورس');
chk('بلوکِ @media (prefers-reduced-motion:reduce) وجود دارد', RM_MEDIA.test(cssAll));
chk('همهٔ حرکت با انتخابگرِ عمومی خاموش می‌شود', !cssGuard.problems.some((p) => p.includes('انتخابگرِ عمومی')), cssGuard.problems.join(' | '));
chk('مدتِ انیمیشن صفر و !important است', !cssGuard.problems.some((p) => p.includes('animation-duration')));
chk('مدتِ گذار صفر و !important است', !cssGuard.problems.some((p) => p.includes('transition-duration')));
chk('انیمیشن‌های بی‌پایان تک‌تکرار می‌شوند', !cssGuard.problems.some((p) => p.includes('iteration-count')));
chk('نگهبانِ CSS بی‌نقص است (بدونِ مشکل)', cssGuard.ok, cssGuard.problems.join(' | '));
const keyframes = [...cssAll.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
chk('شیت واقعاً انیمیشن دارد (نگهبان رویِ فایلِ خالی سبز نمی‌شود)', keyframes.length >= 8, String(keyframes.length));

grp('آرتیفکتِ ساخته‌شده (index.html) همان قاعده را دارد');
chk('index.html بلوکِ reduced-motion را دارد', RM_MEDIA.test(built) || /prefers-reduced-motion:\s*reduce/.test(built));
chk('index.html انتخابگرِ عمومی و تک‌تکرار را دارد', /\*,\*::before,\*::after\{/.test(built.replace(/\s+/g, '')) || /\*,\*::before,\*::after\{/.test(built), 'آرتیفکت کهنه است — node build.js');
chk('index.html قاعدهٔ animation-iteration-count:1 را دارد', /animation-iteration-count:1\s*!important/.test(built));
chk('index.html قاعدهٔ transition-duration را دارد', /transition-duration:\s*\.001ms\s*!important/.test(built));

grp('هارنسِ runtime');
chk('سدِ حرکت در هارنس سیم‌کشی شده', harnessGuard.ok, harnessGuard.problems.join(' | '));
chk('هیچ waitForTimeoutِ جادویی نمانده', !/waitForTimeout\(\s*\d+\s*\)/.test(harnessSrc));
chk('اسکنِ صفحهٔ ورود هم سد دارد', /await quiesce\(page, 'login'\)/.test(harnessSrc));
chk('سیاستِ خروجی دست‌نخورده است (۱=شکست، ۳=نبودِ پیش‌نیاز، نه سبزِ جعلی)',
  /process\.exit\(1\)/.test(harnessSrc) && /process\.exit\(3\)/.test(harnessSrc));
chk('شدت‌ها پایین آورده نشده‌اند (critical/serious همچنان شرطِ قبولی‌اند)',
  /tot\.critical \|\| tot\.serious/.test(harnessSrc) && !/serious\s*=\s*0/.test(harnessSrc));
chk('هیچ قاعده‌ای از axe خفه نشده (بدونِ disableRules/withRules)', !/disableRules|withRules\(/.test(harnessSrc));

/* ─────────────────────────────────────────────────────────────
   بخشِ ۳ — سد در محیطِ ساختگی (رفتارِ واقعی، بدونِ مرورگر)
   ───────────────────────────────────────────────────────────── */
/* یک مدلِ کوچک از Web Animations API: playState و effect.getComputedTiming. */
function fakeAnim(opts) {
  const o = opts || {};
  const a = {
    playState: o.state || 'running',
    animationName: o.name || undefined,
    transitionProperty: o.transitionProperty || undefined,
    finished: 0,
    canceled: 0,
    effect: { getComputedTiming: () => ({ endTime: o.endTime === undefined ? 300 : o.endTime }) },
    finish() { a.finished++; if (o.finishThrows) throw new Error('finish() ناموفق'); if (!o.stubborn) a.playState = 'finished'; },
    cancel() { a.canceled++; if (!o.stubborn) a.playState = 'idle'; },
  };
  return a;
}

function withFakeDom(animations, fn) {
  const saved = { document: global.document, raf: global.requestAnimationFrame };
  const list = animations.slice();
  global.document = { getAnimations: () => list.slice() };
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (saved.document === undefined) delete global.document; else global.document = saved.document;
      if (saved.raf === undefined) delete global.requestAnimationFrame; else global.requestAnimationFrame = saved.raf;
    });
}

(async () => {
  grp('سدِ حرکت — رفتارِ واحد (محیطِ ساختگی)');

  /* M1: صفحهٔ ساکن */
  await withFakeDom([], async () => {
    const r = await settleMotionInPage(200);
    chk('M1 صفحهٔ ساکن ⇒ ok و هیچ کاری لازم نیست', r.ok === true && r.finished === 0 && r.canceled === 0 && r.still.length === 0, JSON.stringify(r));
  });

  /* M2: انیمیشنِ متناهی */
  const finite = fakeAnim({ endTime: 300, name: 'pop' });
  await withFakeDom([finite], async () => {
    const r = await settleMotionInPage(300);
    chk('M2 انیمیشنِ متناهی finish() می‌شود', finite.finished === 1 && r.finished === 1, JSON.stringify({ f: finite.finished, r }));
    chk('M2 پس از finish صفحه آرام است', r.ok === true && r.still.length === 0, JSON.stringify(r));
    chk('M2 نامِ انیمیشن در گزارش نیست (چون آرام شد)', !r.still.includes('animation:pop'));
  });

  /* M3: انیمیشنِ بی‌پایان (pulse/spin/sh) */
  const infinite = fakeAnim({ endTime: Infinity, name: 'pulse' });
  await withFakeDom([infinite], async () => {
    const r = await settleMotionInPage(200);
    chk('M3 انیمیشنِ بی‌پایان cancel() می‌شود', infinite.canceled === 1 && r.canceled === 1, JSON.stringify(r));
    chk('M3 صفحه آرام می‌شود (بدونِ حلقهٔ بی‌پایانِ انتظار)', r.ok === true, JSON.stringify(r));
  });

  /* M4: finish() خطا می‌دهد ⇒ cancel جایگزین می‌شود */
  const broken = fakeAnim({ endTime: 200, name: 'fslide', finishThrows: true });
  await withFakeDom([broken], async () => {
    const r = await settleMotionInPage(200);
    chk('M4 خطای finish() با cancel() جبران می‌شود', broken.canceled >= 1 && r.ok === true, JSON.stringify({ c: broken.canceled, r }));
  });

  /* M5: انیمیشنِ لجباز ⇒ شکستِ صریح، نه عبورِ بی‌صدا */
  const stubborn = fakeAnim({ endTime: 300, name: 'stuck', stubborn: true });
  const t5 = Date.now();
  await withFakeDom([stubborn], async () => {
    const r = await settleMotionInPage(120);
    chk('M5 انیمیشنِ لجباز ⇒ ok=false (لاپوشانی نمی‌شود)', r.ok === false && r.still.includes('animation:stuck'), JSON.stringify(r));
    chk('M5 بودجه رعایت می‌شود (بین ۱۲۰ms تا ۳s)', Date.now() - t5 >= 100 && Date.now() - t5 < 3000);
    chk('M5 فریم‌ها شمرده می‌شوند', r.frames >= 2);
  });

  grp('سدِ حرکت — توابعِ کمکی');
  chk('isQuiescent: finished/idle/paused آرام‌اند',
    isQuiescent([{ playState: 'finished' }, { playState: 'idle' }, { playState: 'paused' }, null]) === true);
  chk('isQuiescent: running/pending در حرکت‌اند',
    isQuiescent([{ playState: 'finished' }, { playState: 'running' }]) === false
    && isQuiescent([{ playState: 'pending' }]) === false);
  chk('describeNotQuiescent برچسب و نام‌ها را می‌آورد',
    /login:manager/.test(describeNotQuiescent('login:manager', { still: ['animation:pop', 'transition:background'], ms: 42 }))
    && /animation:pop/.test(describeNotQuiescent('x', { still: ['animation:pop'], ms: 1 })));
  chk('DEFAULT_BUDGET_MS کران‌دار و معقول است', Number.isFinite(DEFAULT_BUDGET_MS) && DEFAULT_BUDGET_MS >= 500 && DEFAULT_BUDGET_MS <= 10000);

  grp('سدِ حرکت — quiesce() باید fail-closed باشد');
  await (async () => {
    let threw = null;
    try {
      await quiesce({}, 'stuck-case', { budgetMs: 80, evaluate: async () => ({ ok: false, still: ['animation:stuck'], ms: 80 }) });
    } catch (e) { threw = e; }
    chk('Q1 ok=false ⇒ Promise رد می‌شود (نه skip)', !!threw && /آرام نشد/.test(String(threw.message)), threw && threw.message);

    threw = null;
    try {
      await quiesce({}, 'no-api', { evaluate: async () => ({ ok: true, still: [], supported: false }) });
    } catch (e) { threw = e; }
    chk('Q2 مرورگرِ بی‌getAnimations ⇒ رد می‌شود (سبزِ جعلی ممنوع)', !!threw && /getAnimations/.test(String(threw.message)), threw && threw.message);

    threw = null;
    try {
      await quiesce({}, 'undefined-report', { evaluate: async () => undefined });
    } catch (e) { threw = e; }
    chk('Q3 گزارشِ undefined ⇒ رد می‌شود', !!threw);

    const okReport = await quiesce({}, 'fine', { evaluate: async () => ({ ok: true, still: [], supported: true, finished: 2 }) });
    chk('Q4 گزارشِ سالم ⇒ عبور با همان گزارش', okReport.ok === true && okReport.finished === 2);
  })();

  /* ─────────────────────────────────────────────────────────────
     بخشِ ۴ — mutation: هر نگهبان واقعاً همان چیز را می‌گیرد
     (in-process؛ هیچ فیچری کامیت نمی‌شود)
     ───────────────────────────────────────────────────────────── */
  grp('mutation-verify — نگهبانِ CSS');
  const oldNarrow = cssAll.replace(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[\s\S]*?\n\}/, '@media (prefers-reduced-motion:reduce){\n  .hgt-needle,.hgt-dot,.hgt-fill{ animation:none; }\n}');
  chk('X1 قاعدهٔ قدیمیِ محدود (فقط .hgt-*) رد می‌شود', checkCssMotionGuard(oldNarrow).ok === false
    && checkCssMotionGuard(oldNarrow).problems.some((p) => p.includes('انتخابگرِ عمومی')), JSON.stringify(checkCssMotionGuard(oldNarrow).problems));
  const noIter = cssAll.replace(/animation-iteration-count:1\s*!important;?/, '');
  chk('X2 حذفِ animation-iteration-count ⇒ رد می‌شود', checkCssMotionGuard(noIter).ok === false);
  const noTrans = cssAll.replace(/transition-duration:\.001ms\s*!important;?/, '');
  chk('X3 حذفِ transition-duration ⇒ رد می‌شود', checkCssMotionGuard(noTrans).ok === false);
  const noMedia = cssAll.replace(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[\s\S]*?\n\}/, '');
  chk('X4 حذفِ کلِ بلوک ⇒ رد می‌شود', checkCssMotionGuard(noMedia).ok === false);
  const noBang = cssAll.replace(/transition-duration:\.001ms\s*!important/, 'transition-duration:.001ms');
  chk('X5 برداشتنِ !important ⇒ رد می‌شود', checkCssMotionGuard(noBang).ok === false);
  chk('X6 سورسِ دست‌نخورده سبز است (نگهبان رویِ همه‌چیز سرخ نیست)', checkCssMotionGuard(cssAll).ok === true);

  grp('mutation-verify — نگهبانِ هارنس');
  const noScanGuard = harnessSrc.replace('    await quiesce(page, role + \':\' + route);\n', '');
  chk('Y1 حذفِ سد از بدنهٔ scan ⇒ رد می‌شود', checkHarnessMotionGuard(noScanGuard).ok === false
    && checkHarnessMotionGuard(noScanGuard).problems.some((p) => p.includes('بدنهٔ scan')), JSON.stringify(checkHarnessMotionGuard(noScanGuard).problems));
  const backToMagic = harnessSrc.replace('      await scan(R.role, route);', '      await page.waitForTimeout(150);\n      await scan(R.role, route);');
  chk('Y2 بازگشتِ waitForTimeout(150) ⇒ رد می‌شود', checkHarnessMotionGuard(backToMagic).ok === false);
  const noRequire = harnessSrc.replace("const { quiesce } = require('./helpers/a11y-quiescence');", '');
  chk('Y3 حذفِ require سد ⇒ رد می‌شود', checkHarnessMotionGuard(noRequire).ok === false);
  const noReduce = harnessSrc.replace("reducedMotion: 'reduce', ", '');
  chk('Y4 برداشتنِ reducedMotion ⇒ رد می‌شود', checkHarnessMotionGuard(noReduce).ok === false);
  chk('Y5 هارنسِ دست‌نخورده سبز است', checkHarnessMotionGuard(harnessSrc).ok === true);

  console.log('');
  console.log(`CHECKS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });

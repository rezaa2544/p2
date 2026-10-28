#!/usr/bin/env node
'use strict';
/**
 * a11y-quiescence.js — سدِ قطعیِ «حرکت» پیش از هر اسکنِ axe-core
 * ═══════════════════════════════════════════════════════════════════
 * ریشهٔ یافتهٔ متناوبِ serious:color-contrast در tests/a11y-runtime.js
 * ------------------------------------------------------------------
 * axe-core نسبتِ کنتراست را از رنگِ **محاسبه‌شده** (getComputedStyle) در
 * همان لحظهٔ نمونه‌برداری می‌سازد. اگر در آن لحظه یک CSS animation/transition
 * در جریان باشد (opacity، background، color)، axe رنگِ آمیختهٔ «نیمه‌کاره»
 * را می‌خواند — مثلاً toast که با `animation:pop` از opacity:0 بالا می‌آید
 * یا nav-item که با `transition:background .15s,color .15s` میانِ دو رنگ است.
 * نسبتِ محاسبه‌شده در آن قاب می‌تواند زیرِ ۴٫۵:۱ بیفتد و color-contrast
 * «serious» گزارش شود؛ قابِ بعدی دوباره سبز است. همین «وابستگی به میلی‌ثانیه»
 * یعنی یافتهٔ متناوب، نه نقصِ قطعیِ رنگ‌ها.
 *
 * دو عاملِ تقویت‌کننده در هارنسِ قبلی:
 *   ۱) `reducedMotion:'reduce'` برقرار بود ولی شیتِ سبک فقط سه انیمیشنِ
 *      `.hgt-*` را خاموش می‌کرد (۹ keyframe و ۳۸ transition دیگر زنده بودند).
 *   ۲) اسکنِ صفحهٔ ورود هیچ انتظاری نداشت و بقیهٔ نماها
 *      `waitForTimeout(150)` داشتند — عددی جادویی که هم کوتاه‌تر از
 *      `pop .18s`/`fslide .16s`/`sh 1.3s` است و هم به سرعتِ ماشین وابسته.
 *      تایمرهایِ دوره‌ایِ برنامه (attTimerPaint هر ۱s، bellLiveTick، …) هم
 *      می‌توانند درست پیش از نمونه‌برداری یک transition تازه شروع کنند.
 *
 * راهِ‌حل (بدونِ خفه‌کردنِ آزمون): پیش از هر اسکن، مرورگر تا «آرامشِ حرکتی»
 * می‌رسد — هر انیمیشن/گذارِ متناهی `finish()` و هر انیمیشنِ بی‌پایان
 * `cancel()` می‌شود، بعد دو فریم انتظار تا حالتِ نهایی رنگ شود، سپس با
 * سقفِ زمانیِ محدود بازبینی می‌شود. اگر چیزی هنوز در حرکت بود، اسکن
 * انجام نمی‌شود و تست **شکست** می‌دهد (exit≠0) — نه skip، نه نادیده‌گرفتن.
 */

const DEFAULT_BUDGET_MS = 2000;

/* وضعیت‌هایی که «در حرکت» حساب می‌شوند. */
const RUNNING_STATES = ['running', 'pending'];

/**
 * این تابع داخلِ صفحه اجرا می‌شود (Playwright آن را serialize می‌کند)، پس
 * نباید به هیچ شناسهٔ بیرونی وابسته باشد. برای آزمون‌پذیری در Node هم
 * فقط از globalThis (document/performance/requestAnimationFrame) می‌خواند.
 * @returns {{ok:boolean, still:string[], finished:number, canceled:number,
 *            frames:number, ms:number, supported:boolean}}
 */
async function settleMotionInPage(budgetMs) {
  /* همهٔ ثابت‌ها داخلِ خودِ تابع‌اند: Playwright فقط همین بدنه را داخلِ صفحه
     می‌فرستد و مرجع به scopeِ ماژول آن‌جا وجود ندارد. */
  const STATES = ['running', 'pending'];
  const budget = Number.isFinite(budgetMs) ? budgetMs : 2000;
  const hasPerf = (typeof performance !== 'undefined' && typeof performance.now === 'function');
  const now = () => (hasPerf ? performance.now() : Date.now());
  const raf = (typeof requestAnimationFrame === 'function')
    ? requestAnimationFrame
    : (cb) => setTimeout(() => cb(now()), 16);
  const frame = () => new Promise((r) => raf(() => r()));
  const supported = (typeof document !== 'undefined' && typeof document.getAnimations === 'function');
  const grab = () => (supported ? document.getAnimations() : []);
  const running = () => grab().filter((a) => a && STATES.indexOf(a.playState) !== -1);
  const nameOf = (a) => {
    try {
      if (a.animationName) return 'animation:' + a.animationName;
      if (a.transitionProperty) return 'transition:' + a.transitionProperty;
      if (a.effect && a.effect.target && a.effect.target.tagName) return 'animation@' + a.effect.target.tagName;
    } catch (e) { /* پایین: anon */ }
    return 'anon';
  };

  const t0 = now();
  const report = { finished: 0, canceled: 0, frames: 0, still: [], supported };

  /* ۱) پایان‌دادنِ قطعیِ هر چیزی که همین حالا در حرکت است. */
  for (const a of running()) {
    let end = Infinity;
    try {
      if (a.effect && typeof a.effect.getComputedTiming === 'function') end = a.effect.getComputedTiming().endTime;
    } catch (e) { end = Infinity; }
    try {
      if (Number.isFinite(end)) { a.finish(); report.finished++; }
      else { a.cancel(); report.canceled++; }
    } catch (e) {
      try { a.cancel(); report.canceled++; } catch (e2) { /* بازبینیِ پایین می‌گیرد */ }
    }
  }

  /* ۲) دو فریم تا حالتِ نهایی رنگ شود. */
  await frame(); await frame(); report.frames += 2;

  /* ۳) بازبینیِ محدود: هر چیزی که دوباره شروع شده باید در بودجه تمام شود. */
  while (now() - t0 < budget) {
    if (!running().length) break;
    await frame(); report.frames++;
  }
  report.still = running().map(nameOf);
  report.ms = Math.round(now() - t0);
  report.ok = report.still.length === 0;
  return report;
}

/** آیا فهرستِ داده‌شده «آرام» است؟ (خالص، برای آزمونِ واحد) */
function isQuiescent(list) {
  return (list || []).every((a) => !a || RUNNING_STATES.indexOf(a.playState) === -1);
}

/** پیامِ خوانا برای گزارشِ سرخ — شاملِ نامِ انیمیشن‌هایی که آرام نشدند. */
function describeNotQuiescent(label, report) {
  const still = (report && report.still) || [];
  return `حرکت پیش از اسکنِ «${label}» آرام نشد — ${still.length} انیمیشن/گذار هنوز در جریان: `
    + (still.slice(0, 6).join(', ') || '(نامشخص)')
    + ` — بودجه ${report ? report.ms : '?'}ms. اسکن انجام نشد تا یافتهٔ color-contrast وسطِ transition ساخته نشود.`;
}

/**
 * سدِ Node-side: صفحه را آرام می‌کند و در صورتِ شکست **خطا می‌دهد**.
 * @param {object} page صفحهٔ Playwright
 * @param {string} label برچسبِ مرحله (login / role:route) برای پیامِ خطا
 * @param {{budgetMs?:number, evaluate?:(fn:Function, arg:any)=>Promise<any>}} [opts]
 */
async function quiesce(page, label, opts) {
  const o = opts || {};
  const budgetMs = Number.isFinite(o.budgetMs) ? o.budgetMs : DEFAULT_BUDGET_MS;
  const evaluate = o.evaluate || ((fn, arg) => page.evaluate(fn, arg));
  const report = await evaluate(settleMotionInPage, budgetMs);
  if (report && report.supported === false) {
    /* fail-closed: مرورگری که getAnimations ندارد نمی‌تواند «آرام‌بودن» را
       اثبات کند؛ عبورِ بی‌صدا یعنی همان سبزِ جعلی. */
    const err = new Error('سدِ حرکت: document.getAnimations در این مرورگر نیست —'
      + ' نمی‌توان آرام‌بودن را اثبات کرد (اسکن انجام نشد).');
    err.quiescence = report;
    throw err;
  }
  if (!report || !report.ok) {
    const err = new Error(describeNotQuiescent(label, report || {}));
    err.quiescence = report;
    throw err;
  }
  return report;
}

module.exports = {
  DEFAULT_BUDGET_MS,
  RUNNING_STATES,
  settleMotionInPage,
  isQuiescent,
  describeNotQuiescent,
  quiesce,
};

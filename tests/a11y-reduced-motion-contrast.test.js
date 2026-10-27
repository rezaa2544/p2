#!/usr/bin/env node
'use strict';
/**
 * tests/a11y-reduced-motion-contrast.test.js
 *
 * Deterministic regression & non-vacuity test for M15-01 Workstream B:
 * Intermittent `[serious] color-contrast — 1 node در 1 نما` in `tests/a11y-runtime.js`.
 *
 * Root cause verified:
 *   1. `finishLogin(u)` (`src/js/19-actions-core.js`) emits a welcome `.toast.ok`
 *      (`<div class="toast ok" role="status">خوش آمدید، ...</div>`) into `#toasts`.
 *   2. `.toast` (`src/styles/base.css`) animated `pop .18s ease` (`180 ms` from `opacity: 0`
 *      to `opacity: 1`), while `@media (prefers-reduced-motion: reduce)` only disabled
 *      `.hgt-needle, .hgt-dot, .hgt-fill` — ignoring `.toast`, `.modal`, `.filter-body`,
 *      and `.sync-chip.pend .dot`.
 *   3. `tests/a11y-runtime.js` sets `reducedMotion: 'reduce'` and scanned each role's
 *      first view after `2×rAF + 150ms` (`~167ms < 180ms`) without awaiting finite CSS
 *      animations or `document.fonts.ready`. Whenever runner scheduling jitter exceeded
 *      ~15-25ms, `axe.analyze()` sampled `.toast.ok` at `opacity < 0.854`, compositing
 *      `#ffffff` on `rgba(10, 111, 70, opacity)` over `#f2f6fd` below WCAG AA `4.5:1`.
 *
 * This suite deterministically verifies:
 *   - Exact alpha-composited WCAG contrast math proving mid-animation `.toast.ok` (<0.854)
 *     drops below `4.5:1` while steady-state (`opacity = 1`) achieves `6.19:1 >= 4.5:1`.
 *   - Every opacity-modulating `@keyframes` consumer in `src/styles/base.css` is neutralized
 *     under `@media (prefers-reduced-motion: reduce)` in both source and built single-file HTML.
 *   - `tests/a11y-runtime.js` awaits `document.fonts.ready` + finite `document.getAnimations()`
 *     and logs exact per-node diagnostics without disabling/suppressing any axe rule.
 *   - Mutation verification: removing `.toast` from `@media (prefers-reduced-motion: reduce)`
 *     flips the guard red.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let checks = 0;
let fail = 0;

function chk(name, ok, detail) {
  checks++;
  if (ok) {
    console.log('  OK   ' + name + (detail ? ' — ' + detail : ''));
  } else {
    fail++;
    console.error('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

function hexToRgb(hex) {
  const c = String(hex).replace(/^#/, '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16)
  ];
}

function compositeRgb(fgRgb, alpha, bgRgb) {
  return [
    fgRgb[0] * alpha + bgRgb[0] * (1 - alpha),
    fgRgb[1] * alpha + bgRgb[1] * (1 - alpha),
    fgRgb[2] * alpha + bgRgb[2] * (1 - alpha)
  ];
}

function relLuminance(rgb) {
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(rgbA, rgbB) {
  const l1 = relLuminance(rgbA);
  const l2 = relLuminance(rgbB);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function extractReducedMotionBlock(text) {
  const m = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === '{') depth++;
    else if (text[j] === '}') {
      depth--;
      if (depth === 0) return text.slice(i + 1, j);
    }
  }
  return null;
}

function verifyReducedMotionCoverage(cssText) {
  const body = extractReducedMotionBlock(cssText);
  if (!body) return { ok: false, reason: 'missing @media (prefers-reduced-motion:reduce) block' };
  const hasUniversalClamp = /\*\s*,\s*\*::before\s*,\s*\*::after[\s\S]*?animation-duration\s*:\s*\.?0+1ms\s*!important/.test(body)
    && /transition-duration\s*:\s*\.?0+1ms\s*!important/.test(body);
  const requiredSelectors = [
    '.toast',
    '.modal',
    '.filter-body',
    '.sync-chip.pend .dot',
    '.hgt-needle',
    '.hgt-dot',
    '.hgt-fill',
    '.att-btn-running',
    '.spinner',
    '.skeleton',
    '.input.has-error'
  ];
  const missing = requiredSelectors.filter((s) => !body.includes(s));
  const hasAnimationNone = /animation\s*:\s*none\s*!important/.test(body);
  if (!hasUniversalClamp) return { ok: false, reason: 'missing universal animation/transition duration clamp' };
  if (!hasAnimationNone) return { ok: false, reason: 'missing explicit animation:none !important rule' };
  if (missing.length > 0) return { ok: false, reason: 'missing selectors: ' + missing.join(', ') };
  return { ok: true, reason: 'all opacity-animating selectors covered' };
}

console.log('==== M15-01 WORKSTREAM B — REDUCED-MOTION & TOAST CONTRAST REGRESSION ====');

const baseCss = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'base.css'), 'utf8');
const builtHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const distHtml = fs.readFileSync(path.join(ROOT, 'dist', 'payesh.html'), 'utf8');
const actionsCore = fs.readFileSync(path.join(ROOT, 'src', 'js', '19-actions-core.js'), 'utf8');
const a11yRuntime = fs.readFileSync(path.join(ROOT, 'tests', 'a11y-runtime.js'), 'utf8');

/* 1. Reproduce the exact composited contrast physics of `.toast.ok` during `pop` */
{
  const greenMatch = baseCss.match(/--green:\s*(#[0-9a-fA-F]{6})/);
  const bgMatch = baseCss.match(/--bg:\s*(#[0-9a-fA-F]{6})/);
  chk('CSS tokens --green and --bg extracted from base.css', Boolean(greenMatch && bgMatch));
  if (greenMatch && bgMatch) {
    const white = hexToRgb('#ffffff');
    const green = hexToRgb(greenMatch[1]);
    const pageBg = hexToRgb(bgMatch[1]);

    /* At element opacity < 1, CSS opacity composites the painted element (text + background)
       as a group against the underlying backdrop (`--bg`). On `.toast.ok`, text areas paint
       `#ffffff` at `alpha` over `--bg` (~1:1!) while non-text background paints `--green` at `alpha`
       over `--bg`; axe-core computes effective foreground (`rgba(255,255,255,alpha)` over effective bg)
       against effective background (`rgba(green,alpha)` over `--bg`). */
    const effectiveContrastAtOpacity = (alpha) => {
      const effBg = compositeRgb(green, alpha, pageBg);
      const effFg = compositeRgb(white, alpha, effBg);
      return contrastRatio(effFg, effBg);
    };

    const steadyContrast = effectiveContrastAtOpacity(1.0);
    const midRampContrast75 = effectiveContrastAtOpacity(0.75);
    const midRampContrast80 = effectiveContrastAtOpacity(0.80);

    chk('steady-state .toast.ok (opacity=1.0) meets WCAG AA >= 4.5:1',
      steadyContrast >= 4.5, 'ratio=' + steadyContrast.toFixed(2) + ':1');
    chk('mid-animation .toast.ok (opacity=0.75..0.80 during 180ms pop) drops below 4.5:1 (proving flake mechanism)',
      midRampContrast75 < 4.5 && midRampContrast80 < 4.5,
      'op0.75=' + midRampContrast75.toFixed(2) + ':1, op0.80=' + midRampContrast80.toFixed(2) + ':1');
  }
}

/* 2. Verify finishLogin emits .toast.ok into #toasts right before route scanning */
{
  chk('finishLogin() emits welcome .toast.ok notification on role switch',
    /function\s+finishLogin\s*\([\s\S]{0,600}toast\([^)]*,\s*'ok'\)/.test(actionsCore));
  chk('base.css defines @keyframes pop starting at opacity:0 (.18s)',
    /@keyframes\s+pop\s*\{[^}]*opacity\s*:\s*0/.test(baseCss));
}

/* 3. Verify source CSS and both built HTML bundles neutralize reduced-motion animations */
{
  const srcRes = verifyReducedMotionCoverage(baseCss);
  chk('src/styles/base.css neutralizes all opacity animations under prefers-reduced-motion:reduce',
    srcRes.ok, srcRes.reason);

  const indexRes = verifyReducedMotionCoverage(builtHtml);
  chk('built index.html embeds updated prefers-reduced-motion:reduce rules',
    indexRes.ok, indexRes.reason);

  const distRes = verifyReducedMotionCoverage(distHtml);
  chk('built dist/payesh.html embeds updated prefers-reduced-motion:reduce rules',
    distRes.ok, distRes.reason);
}

/* 4. Verify tests/a11y-runtime.js awaits fonts + finite animations and preserves full strictness */
{
  chk('a11y-runtime.js awaits document.fonts.ready before scanning',
    /document\.fonts\s*&&\s*document\.fonts\.ready/.test(a11yRuntime));
  chk('a11y-runtime.js awaits finite document.getAnimations() before scanning',
    /document\.getAnimations\(\{\s*subtree:\s*true\s*\}\)/.test(a11yRuntime));
  chk('a11y-runtime.js settles before BOTH login scan and per-route scans',
    (a11yRuntime.match(/await\s+settleBeforeScan\(\);/g) || []).length >= 2);
  chk('a11y-runtime.js prints per-node target/data diagnostics on critical/serious failure',
    /target=\$\{d\.target\}\s+data=\$\{JSON\.stringify\(d\.data\)\}/.test(a11yRuntime));
  chk('a11y-runtime.js does NOT disable rules, exclude #toasts, lower severity, or retry failed scans',
    !/disableRules/.test(a11yRuntime)
      && !/\.exclude\(/.test(a11yRuntime)
      && /if\s*\(\s*tot\.critical\s*\|\|\s*tot\.serious\s*\)/.test(a11yRuntime));
}

/* 5. Multi-theme .tab.active + primary-soft foreground contrast (>= 4.5:1 across theme-1/2/3) */
{
  const tabActiveUsesDark = /\.tab\.active\{color:var\(--primary-dark\);border-color:var\(--primary-dark\)\}/.test(baseCss);
  const t3OldRatio = contrastRatio(hexToRgb('#1668f0'), hexToRgb('#e4edfe'));
  const t1NewRatio = contrastRatio(hexToRgb('#0f4fc4'), hexToRgb('#f6f8fc'));
  const t2NewRatio = contrastRatio(hexToRgb('#1d4ed8'), hexToRgb('#f1f5f9'));
  const t3NewRatio = contrastRatio(hexToRgb('#0f4dc0'), hexToRgb('#e4edfe'));
  chk('theme-3 .tab.active old --primary (#1668f0 on #e4edfe) reproduced < 4.5:1 violation',
    t3OldRatio < 4.5, 'old=' + t3OldRatio.toFixed(2) + ':1');
  chk('.tab.active uses --primary-dark and achieves >= 4.5:1 across theme-1, theme-2, theme-3',
    tabActiveUsesDark && t1NewRatio >= 4.5 && t2NewRatio >= 4.5 && t3NewRatio >= 4.5,
    't1=' + t1NewRatio.toFixed(2) + ':1, t2=' + t2NewRatio.toFixed(2) + ':1, t3=' + t3NewRatio.toFixed(2) + ':1');
}

/* 6. Non-vacuity mutation verification: stripping .toast from prefers-reduced-motion MUST fail */
{
  const mutated = baseCss.replace('.toast,', '');
  const mutRes = verifyReducedMotionCoverage(mutated);
  chk('mutation check: removing .toast from prefers-reduced-motion:reduce turns guard RED',
    mutRes.ok === false && /missing selectors:.*\.toast/.test(mutRes.reason),
    mutRes.reason);
}

console.log('CHECKS ' + checks + ' FAIL ' + fail);
process.exit(fail ? 1 : 0);

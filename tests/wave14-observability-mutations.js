#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave14-observability-mutations.js — Wave 14 mutation testing
   ───────────────────────────────────────────────────────────────────
   Each mutation removes one of the Wave 14 safety properties from
   server/metrics.js. A mutation that SURVIVES means the base suite does
   not actually protect that property, so the suite is the thing under
   test here.

   X1  cardinality cap removed (unbounded memory from a caller)   ⇒ ❌ M5a
   X2  routeTemplate returns the raw path (PII in labels)         ⇒ ❌ M2c
   X3  scrape gate open in production (unauthenticated /metrics)  ⇒ ❌ M8a
   X4  token compare without the length guard (throws)            ⇒ ❌ M8f
   X5  counter accepts negative increments (corrupt counters)     ⇒ ❌ M4b
   X6  histogram buckets exclusive instead of cumulative          ⇒ ❌ M1d
   X7  exposition drops the +Inf bucket (broken Prometheus parse) ⇒ ❌ M1e
   X8  dropped observations no longer counted (silent data loss)  ⇒ ❌ M7b
   X9  unknown label keys accepted (undeclared cardinality)       ⇒ ❌ M7a

   اجرا:  node tests/wave14-observability-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE = path.join(ROOT, 'tests', 'wave14-observability.js');
const F = path.join(ROOT, 'server', 'metrics.js');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}

function runSuite() {
  return spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
}

console.log('▸ خطِّ پایه');
const base = runSuite();
chk('خطِّ پایهٔ wave14-observability سبز است', base.status === 0, (base.stdout || '').slice(-200));
if (base.status !== 0) { console.log((base.stdout || '') + (base.stderr || '')); process.exit(1); }

function mutate(find, replace, killRe, tag) {
  const orig = fs.readFileSync(F, 'utf8');
  try {
    if (!orig.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false, 'anchor missing'); return; }
    fs.writeFileSync(F, orig.replace(find, replace), 'utf8');
    const r = runSuite();
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-240).replace(/\n/g, ' '));
  } finally {
    fs.writeFileSync(F, orig, 'utf8');
  }
}

console.log('\n▸ جهش‌ها');

/* X1 — the availability guard: a caller must not be able to grow the registry */
mutate(
  `    if (m.series.size >= maxSeries) { bumpDrop(m.name, 'series_overflow'); return null; }`,
  `    /* جهش: سقف cardinality حذف شد — رشدِ بی‌کرانِ حافظه */`,
  /❌ M5a/, 'X1 حذف سقفِ cardinality');

/* X2 — R3: raw paths must never become label values */
mutate(
  `  return p.indexOf('/api/') === 0 ? 'api_unmatched' : 'static_other';`,
  `  return p; /* جهش: مسیرِ خام به‌عنوانِ label — نشتِ PII و cardinality بی‌کران */`,
  /❌ M2c/, 'X2 مسیرِ خام در label');

/* X3 — R4: production must not serve /metrics without a token */
mutate(
  `  if (isProd) return { ok: false, status: 404, code: 'not_found' };`,
  `  if (isProd) return { ok: true }; /* جهش: /metrics بدونِ توکن در تولید */`,
  /❌ M8a/, 'X3 بازکردنِ دروازهٔ scrape در تولید');

/* X4 — the length guard keeps timingSafeEqual from throwing on a short token */
mutate(
  `    const ok = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);`,
  `    const ok = crypto.timingSafeEqual(a, b); /* جهش: بدونِ نگهبانِ طول */`,
  /❌ M8f/, 'X4 حذفِ نگهبانِ طولِ توکن');

/* X5 — counters must never go backwards (rate() would go negative) */
mutate(
  `      if (!Number.isFinite(d) || d < 0) { bumpDrop(name, 'bad_value'); return; }`,
  `      if (!Number.isFinite(d)) { bumpDrop(name, 'bad_value'); return; } /* جهش: incr منفی مجاز */`,
  /❌ M4b/, 'X5 پذیرشِ incr منفی');

/* X6 — Prometheus buckets are cumulative by definition */
mutate(
  `      for (let i = 0; i < m.buckets.length; i++) if (v <= m.buckets[i]) s.counts[i]++;`,
  `      for (let i = 0; i < m.buckets.length; i++) if (v <= m.buckets[i]) { s.counts[i]++; break; } /* جهش: سطل‌هایِ انحصاری */`,
  /❌ M1d/, 'X6 سطل‌هایِ غیرتجمعی');

/* X7 — a histogram without +Inf is rejected by Prometheus */
mutate(
  `          out.push(m.name + '_bucket{' + inf + '} ' + s.count);`,
  `          /* جهش: سطلِ +Inf حذف شد */`,
  /❌ M1e/, 'X7 حذفِ سطلِ +Inf');

/* X8 — a dropped observation must be observable, not silent */
mutate(
  `      if (names.indexOf(k) < 0) { bumpDrop(m.name, 'unknown_label'); return null; }`,
  `      if (names.indexOf(k) < 0) { return null; } /* جهش: حذفِ بی‌صدا، بدونِ شمارش */`,
  /❌ M7b/, 'X8 حذفِ بی‌صدایِ مشاهده');

/* X9 — undeclared label keys must not create series */
mutate(
  `    for (const k of Object.keys(src)) {
      if (names.indexOf(k) < 0) { bumpDrop(m.name, 'unknown_label'); return null; }
    }`,
  `    /* جهش: کلیدِ اعلام‌نشده پذیرفته می‌شود */`,
  /❌ M7a/, 'X9 پذیرشِ label اعلام‌نشده');

console.log('\n▸ بازگردانی');
const fin = runSuite();
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0, (fin.stdout || '').slice(-160));
chk('server/metrics.js بدونِ باقی‌ماندهٔ جهش است',
  fs.readFileSync(F, 'utf8').indexOf('جهش:') < 0);

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های ویو ۱۴: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);

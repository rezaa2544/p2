#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/truncation-telemetry-mutations.js — جهش‌کشی تله‌متری بریدگی/resume
   + خودآزمون هارنس. هر جهش نقض عمدی؛ گیت truncation-telemetry باید قرمز
   شود؛ سپس restore + rebuild.
   اجرا: node tests/truncation-telemetry-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILES = {
  srv: path.join(ROOT, 'server', 'pull.js'),
  met: path.join(ROOT, 'server', 'metrics.js'),
  bench: path.join(ROOT, 'tools', 'bench-reports-scale.js')
};
const orig = {};

/* BH-mut (الگوی امن p06/p11 — درسِ حادثهٔ P1-2): جهش در کپیِ هم‌جوارِ جدا
   (mutant-kit)؛ سورس‌ها و خروجی‌های build هرگز بازنویسی نمی‌شوند —
   restore/rebuildِ درجا و process.on(exit) حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('tct-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

for (const k of Object.keys(FILES)) orig[k] = fs.readFileSync(FILES[k], 'utf8');
/* بازگردانی درجا حذف شد: هر جهش کپیِ خودش را دارد (kit)؛
   سقفِ timeout دیگر هرگز سورس را آلوده نمی‌کند (درسِ P1-2) */

const mutations = [
  {
    name: 'TM1 حذف افزایش کانتر partial',
    edits: [{ file: 'srv',
      from: "      metrics.inc('payesh_pull_partial_collections_total', { collection: boundedLabel(c) });",
      to: "      /* TM: no partial inc */" }]
  },
  {
    name: 'TM2 حذف افزایش کانتر full_snapshot_required',
    edits: [{ file: 'srv',
      from: "      metrics.inc('payesh_pull_full_snapshot_required_total', { collection: boundedLabel(c) });",
      to: "      /* TM: no fsr inc */" }]
  },
  {
    name: 'TM3 حذف افزایش کانتر resume',
    edits: [{ file: 'srv',
      from: "        metrics.inc('payesh_pull_resume_snapshot_total', { collection: boundedLabel(c) });",
      to: "        /* TM: no resume inc */" }]
  },
  {
    name: 'TM4 حذف کرانِ کاردینالیته (برچسب آزاد از ورودی کاربر)',
    edits: [{ file: 'srv',
      from: "    const boundedLabel = (c) => (HEAVY_REPORT_COLS.includes(c) ? c : 'other');",
      to: "    const boundedLabel = (c) => c; /* TM: unbounded label */" }]
  },
  {
    name: 'TM5 resume روی دلتا هم می‌شمارد (شرط snapshot حذف)',
    edits: [{ file: 'srv',
      from: "    if (String(query.resume || '') === '1' && (!isDelta || forceFull)) {",
      to: "    if (String(query.resume || '') === '1') { /* TM: counts deltas too */" }]
  },
  {
    name: 'TM6 حذف اعلام کانترها از رجیستری (declare) — /metrics بی‌نام می‌ماند',
    edits: [{ file: 'met',
      from: "  r.counter('payesh_pull_partial_collections_total',",
      to: "  if (false) r.counter('payesh_pull_partial_collections_total'," }]
  },
  {
    name: 'TM7 هارنس: p95 به p50 تقلیل (آمار غلط)',
    edits: [{ file: 'bench',
      from: "    p95: Number(percentile(s, 95).toFixed(2)),",
      to: "    p95: Number(percentile(s, 50).toFixed(2)), /* TM */" }]
  },
  {
    name: 'TM8 هارنس: حذف اجبار برچسب مقیاس measured (Target=Measured جعلی)',
    edits: [{ file: 'bench',
      from: "  if (!scaleLabel || !/measured/i.test(scaleLabel)) {\n    throw new Error('برچسبِ مقیاس اجباری است و باید «measured» باشد (Target ≠ Measured)');\n  }",
      to: "  /* TM: no scale label guard */" }]
  },
  {
    name: 'TM9 هارنس: حذف خود-skip (بدون PG هم می‌دود و خطا می‌دهد)',
    edits: [{ file: 'bench',
      from: "  if (!process.env.DATABASE_URL) {\n    console.log('bench-reports-scale: DATABASE_URL نیست — خود-skip (محل اجرا: استیجینگ). ✅');\n    process.exit(0);\n  }",
      to: "  /* TM: no self-skip */" }]
  }
];

let killed = 0, survived = 0;
console.log('\n▸ پ۳ — جهش‌کشی تله‌متری بریدگی/resume + هارنس (' + mutations.length + ' جهش)');
for (const m of mutations) {
  const texts = {}; for (const k of Object.keys(FILES)) texts[k] = orig[k];
  let applied = true;
  for (const e of m.edits) {
    if (!texts[e.file].includes(e.from)) { applied = false; break; }
    texts[e.file] = texts[e.file].replace(e.from, e.to);
  }
  if (!applied) { console.log('  ❌ ' + m.name + ' — الگوی جهش پیدا نشد'); survived++; continue; }
  for (const k of Object.keys(FILES)) {
    const mcopy = kit.mutant(FILES[k], texts[k]); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(FILES[k]).mode); } catch (_) {}
  }
  cp.execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'ignore', env: kit.env() });
  let red = false;
  try {
    cp.execFileSync(process.execPath, [path.join(ROOT, 'tests', 'truncation-telemetry.js')],
      { stdio: 'ignore', timeout: 120000, env: kit.env() });
  } catch (e) { red = true; }
  if (red) { killed++; console.log('  ✅ کشته: ' + m.name); }
  else { survived++; console.log('  ❌ زنده ماند: ' + m.name); }
}

for (const k of Object.keys(FILES)) kit.clear(FILES[k]);
console.log('\n────────────────────────────────────────────────────');
console.log(`truncation-telemetry-mutations: ${killed} کشته / ${survived} زنده ${survived === 0 ? '✅' : '❌'}`);
process.exit(survived === 0 ? 0 : 1);

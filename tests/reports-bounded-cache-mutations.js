#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/reports-bounded-cache-mutations.js — جهش‌کشی P0-2 (کش کراندار)
   ───────────────────────────────────────────────────────────────────
   هر جهش نقضی عمدی در server/pull.js یا src/js/29-pull.js یا
   src/js/77-reports.js تزریق می‌کند؛ گیت reports-bounded-cache باید
   قرمز شود؛ سپس restore + build.

   درس M1/M4 دور قبل — جهش چندویرایشی: defense-in-depth دولایه فقط با
   حذفِ «هم‌زمانِ» هر دو لایه سنجیده می‌شود (BM1). حذف تک‌لایه (BM2/BM3)
   جدا هم سنجیده می‌شود تا اثبات شود هر لایه به‌تنهایی هم گیت دارد.

   اجرا: node tests/reports-bounded-cache-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRV = path.join(ROOT, 'server', 'pull.js');
const CLI = path.join(ROOT, 'src', 'js', '29-pull.js');
const RPT = path.join(ROOT, 'src', 'js', '77-reports.js');

const orig = {
  srv: fs.readFileSync(SRV, 'utf8'),
  cli: fs.readFileSync(CLI, 'utf8'),
  rpt: fs.readFileSync(RPT, 'utf8'),
};
function restore() {
  fs.writeFileSync(SRV, orig.srv, 'utf8');
  fs.writeFileSync(CLI, orig.cli, 'utf8');
  fs.writeFileSync(RPT, orig.rpt, 'utf8');
  cp.execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'ignore' });
}
process.on('exit', restore);

/* هر جهش: {name, edits:[{file, from, to}]} — چندویرایشی مجاز. */
const SRV_CAP_OFF = {
  file: 'srv',
  from: "      if (HEAVY_REPORT_COLS.includes(c) && resultCollections[c].length > pullRowCap) {",
  to: "      if (false && HEAVY_REPORT_COLS.includes(c) && resultCollections[c].length > pullRowCap) { /* BM: server cap off */"
};
const CLI_CAP_OFF = {
  file: 'cli',
  from: "  if (!Array.isArray(db[c]) || db[c].length <= RPT_CACHE_MAX_ROWS) return false;",
  to: "  if (true || !Array.isArray(db[c])) return false; /* BM: client cap off */"
};

const mutations = [
  {
    name: 'BM1 چندلایه: حذف هم‌زمان کران سرور + کران کلاینت (هر دو لایهٔ دفاع)',
    edits: [SRV_CAP_OFF, CLI_CAP_OFF]
  },
  {
    name: 'BM2 حذف کران سرور به‌تنهایی (لایهٔ سرور باید گیت مستقل داشته باشد)',
    edits: [SRV_CAP_OFF]
  },
  {
    name: 'BM3 حذف کران کلاینت به‌تنهایی (لایهٔ کلاینت باید گیت مستقل داشته باشد)',
    edits: [CLI_CAP_OFF]
  },
  {
    name: 'BM4 حذف بودجهٔ بایت سرور',
    edits: [{
      file: 'srv',
      from: "        if (total <= pullByteCap || !heavies.length) break;",
      to: "        if (true) break; /* BM: byte budget off */"
    }]
  },
  {
    name: 'BM5 حذف اعلام partial_collections (سرور ساکت می‌بُرد)',
    edits: [{
      file: 'srv',
      from: "      partial_collections: partialCollections.length ? partialCollections : undefined,",
      to: "      partial_collections: undefined, /* BM: silent truncation */"
    }]
  },
  {
    name: 'BM6 حذف TTL کلاینت (کش گزارشی هرگز کهنه نمی‌شود)',
    edits: [{
      file: 'cli',
      from: "    stale: (Date.now() - (meta.at || 0)) > RPT_CACHE_TTL_MS",
      to: "    stale: false /* BM: TTL off */"
    }]
  },
  {
    name: 'BM7 حذف نشانگر «دادهٔ جزئی» از UI',
    edits: [{
      file: 'rpt',
      from: "  return tabs + rptPartialBanner() + body;",
      to: "  return tabs + body; /* BM: banner off */"
    }]
  },
  {
    name: 'BM8 کران دلخواه به‌جای تازه‌ترین‌ها (سرور sort حذف)',
    edits: [{
      file: 'srv',
      from: "        const sorted = resultCollections[c].slice().sort((a, b) => rowRecency(b) - rowRecency(a));",
      to: "        const sorted = resultCollections[c].slice(); /* BM: arbitrary order */"
    }]
  },
  {
    name: 'BM9 کران کلاینت جدیدترین‌ها را نگه نمی‌دارد (sort جهت وارونه)',
    edits: [{
      file: 'cli',
      from: "  db[c].sort(function(a, b){ return rptCacheRecency(b) - rptCacheRecency(a); });",
      to: "  db[c].sort(function(a, b){ return rptCacheRecency(a) - rptCacheRecency(b); }); /* BM: oldest kept */"
    }]
  },
  {
    name: 'BM10 چندلایه: خاموشی ساکت — partial سرور + ثبت متای کلاینت هم‌زمان حذف',
    edits: [
      {
        file: 'srv',
        from: "      partial_collections: partialCollections.length ? partialCollections : undefined,",
        to: "      partial_collections: undefined, /* BM */"
      },
      {
        file: 'cli',
        from: "  rptCacheSetMeta(partialCols);",
        to: "  /* BM: meta not recorded */"
      }
    ]
  }
];

const FILES = { srv: SRV, cli: CLI, rpt: RPT };
let killed = 0, survived = 0;

console.log('\n▸ P0-2 — جهش‌کشی کش کراندار (' + mutations.length + ' جهش، BM1/BM10 چندویرایشی)');
for (const m of mutations) {
  /* اعمال ویرایش‌ها */
  const texts = { srv: orig.srv, cli: orig.cli, rpt: orig.rpt };
  let applied = true;
  for (const e of m.edits) {
    if (!texts[e.file].includes(e.from)) { applied = false; break; }
    texts[e.file] = texts[e.file].replace(e.from, e.to);
  }
  if (!applied) {
    console.log('  ❌ ' + m.name + ' — الگوی جهش پیدا نشد (تست بی‌اعتبار)');
    survived++;
    continue;
  }
  for (const k of Object.keys(FILES)) fs.writeFileSync(FILES[k], texts[k], 'utf8');
  /* کلاینت داخل index.html زندگی می‌کند — rebuild لازم */
  cp.execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'ignore' });

  let red = false;
  try {
    cp.execFileSync(process.execPath, [path.join(ROOT, 'tests', 'reports-bounded-cache.js')],
      { stdio: 'ignore', timeout: 120000 });
  } catch (e) { red = true; }

  if (red) { killed++; console.log('  ✅ کشته: ' + m.name); }
  else { survived++; console.log('  ❌ زنده ماند: ' + m.name); }
}

restore();
console.log('\n────────────────────────────────────────────────────');
console.log(`bounded-cache-mutations: ${killed} کشته / ${survived} زنده ${survived === 0 ? '✅' : '❌'}`);
process.exit(survived === 0 ? 0 : 1);

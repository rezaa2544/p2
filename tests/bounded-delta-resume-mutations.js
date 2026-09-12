#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/bounded-delta-resume-mutations.js — جهش‌کشی resume دلتای بریده
   هر جهش نقض عمدی؛ گیت bounded-delta-resume باید قرمز شود؛ سپس restore
   + rebuild. RM1 چندویرایشی سرور+کلاینت است (درس BM1/BM10).
   اجرا: node tests/bounded-delta-resume-mutations.js
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
const FILES = { srv: SRV, cli: CLI, rpt: RPT };
function restore() {
  for (const k of Object.keys(FILES)) fs.writeFileSync(FILES[k], orig[k], 'utf8');
  cp.execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'ignore' });
}
process.on('exit', restore);

const SRV_FLAG_OFF = {
  file: 'srv',
  from: "      full_snapshot_required_collections: truncatedDeltaCols.length ? truncatedDeltaCols : undefined,",
  to: "      full_snapshot_required_collections: undefined, /* RM: flag off */"
};
const CLI_IGNORE_FLAG = {
  file: 'cli',
  from: "    if (needFull.length && !options._resume) {",
  to: "    if (false && needFull.length && !options._resume) { /* RM: client ignores flag */"
};

const mutations = [
  {
    name: 'RM1 چندلایه (سرور+کلاینت): حذف اعلام پرچم + نادیده‌گرفتن پرچم — دلتای بریده ساکت گم می‌شود',
    edits: [SRV_FLAG_OFF, CLI_IGNORE_FLAG]
  },
  {
    name: 'RM2 حذف پرچم سرور به‌تنهایی',
    edits: [SRV_FLAG_OFF]
  },
  {
    name: 'RM3 نادیده‌گرفتن پرچم در کلاینت به‌تنهایی',
    edits: [CLI_IGNORE_FLAG]
  },
  {
    name: 'RM4 resume با دلتا به‌جای snapshot (since پاک نمی‌شود — همان شکاف باقی می‌ماند)',
    edits: [{
      file: 'cli',
      from: "    forceSnapshot: true,       /* بدونِ since/cursor ⇒ full snapshot کران‌دار */",
      to: "    forceSnapshot: false, /* RM: resume as delta */"
    }]
  },
  {
    /* حلقه‌شکن دولایه است (_resume + RPT_RESUME_IN_FLIGHT) — حذف تک‌لایه را
       لایهٔ دیگر جبران می‌کند (همان درس BM1): جهش باید هر دو را بردارد. */
    name: 'RM5 چندلایه: حذف هر دو حلقه‌شکن (_resume + IN_FLIGHT) — سرور بدخیم حلقه می‌سازد',
    edits: [{
      file: 'cli',
      from: "    _resume: true,             /* حلقه‌شکن: پاسخِ resume دوباره resume نمی‌کند */",
      to: "    _resume: false, /* RM: loop breaker off */"
    }, {
      file: 'cli',
      from: "  if (RPT_RESUME_IN_FLIGHT || !cols || !cols.length) return Promise.resolve({ ok: false, skipped: true });",
      to: "  if (!cols || !cols.length) return Promise.resolve({ ok: false, skipped: true }); /* RM: in-flight guard off */"
    }]
  },
  {
    name: 'RM6 union شکسته: دلتا متادیتا را بازنویسی می‌کند (پرچم پاک + TTL تازه)',
    edits: [{
      file: 'cli',
      from: "    merged = prevPartial.slice();\n    for (var j = 0; j < nowPartial.length; j++) {\n      if (merged.indexOf(nowPartial[j]) === -1) merged.push(nowPartial[j]);\n    }",
      to: "    merged = nowPartial.slice(); /* RM: overwrite instead of union */"
    }]
  },
  {
    name: 'RM7 دلتا TTL را تازه می‌کند (at همیشه Date.now)',
    edits: [{
      file: 'cli',
      from: "    at: opts.fullSnapshot ? Date.now() : (prev.at || Date.now()),",
      to: "    at: Date.now(), /* RM: delta refreshes TTL */"
    }]
  },
  {
    name: 'RM8 حذف نشانگر resume از UI گزارش‌ها',
    edits: [{
      file: 'rpt',
      from: "  if (st.resuming) msgs.push('در حال تکمیلِ داده‌های همگام‌سازی (دلتای بریده — resume در جریان است)');",
      to: "  /* RM: no resume indicator */"
    }, {
      file: 'rpt',
      from: "  return '<div class=\"card\" role=\"status\" data-rpt-partial=\"1\"' + (st.resuming ? ' data-rpt-resuming=\"1\"' : '')",
      to: "  return '<div class=\"card\" role=\"status\" data-rpt-partial=\"1\"'"
    }]
  },
  {
    name: 'RM9 حذف بنر نمای عملیاتی (کامنت ۳)',
    edits: [{
      file: 'rpt',
      from: "  if (!st || !st.partial.length) return '';\n  if (typeof S === 'undefined' || !RPT_PARTIAL_AFFECTED_ROUTES[S.route]) return '';",
      to: "  return ''; /* RM: shell banner off */"
    }]
  },
  {
    name: 'RM10 برگرداندن sizeOf به length (کامنت ۴ — کم‌شماری UTF-8)',
    edits: [{
      file: 'srv',
      from: "      const sizeOf = (c) => Buffer.byteLength(JSON.stringify(resultCollections[c] || []), 'utf8');",
      to: "      const sizeOf = (c) => JSON.stringify(resultCollections[c] || []).length; /* RM */"
    }]
  }
];

let killed = 0, survived = 0;
console.log('\n▸ پ۳ — جهش‌کشی resume دلتای بریده (' + mutations.length + ' جهش، RM1/RM8 چندویرایشی)');
for (const m of mutations) {
  const texts = { srv: orig.srv, cli: orig.cli, rpt: orig.rpt };
  let applied = true;
  for (const e of m.edits) {
    if (!texts[e.file].includes(e.from)) { applied = false; break; }
    texts[e.file] = texts[e.file].replace(e.from, e.to);
  }
  if (!applied) { console.log('  ❌ ' + m.name + ' — الگوی جهش پیدا نشد'); survived++; continue; }
  for (const k of Object.keys(FILES)) fs.writeFileSync(FILES[k], texts[k], 'utf8');
  cp.execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'ignore' });

  let red = false;
  try {
    cp.execFileSync(process.execPath, [path.join(ROOT, 'tests', 'bounded-delta-resume.js')],
      { stdio: 'ignore', timeout: 120000 });
  } catch (e) { red = true; }

  if (red) { killed++; console.log('  ✅ کشته: ' + m.name); }
  else { survived++; console.log('  ❌ زنده ماند: ' + m.name); }
}

restore();
console.log('\n────────────────────────────────────────────────────');
console.log(`bounded-delta-resume-mutations: ${killed} کشته / ${survived} زنده ${survived === 0 ? '✅' : '❌'}`);
process.exit(survived === 0 ? 0 : 1);

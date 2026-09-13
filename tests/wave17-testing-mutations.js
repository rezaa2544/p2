#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave17-testing-mutations.js — Wave 17 mutation testing
   ───────────────────────────────────────────────────────────────────
   Wave 17 is a test suite, so the mutations target the PRODUCT code the
   suite claims to protect. A mutation that survives means the pyramid
   level does not actually catch that regression.

   Z1  MAX_BATCH 500 → 5000      (oversized batch accepted)   ⇒ ❌ ST1  [index.js]
   Z2  sync body limit lifted    (>1 MB body accepted)        ⇒ ❌ ST2  [index.js]
   Z3  idempotency check removed (duplicate uid re-applied)   ⇒ ❌ IN5  [sync.js]
   Z4  base_version gate removed (concurrent write clobbers)  ⇒ ❌ IN7  [sync.js]
   Z5  http counter not recorded (metrics blind)              ⇒ ❌ LD5  [metrics.js]

   اجرا:  node tests/wave17-testing-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE = path.join(ROOT, 'tests', 'wave17-testing.js');
const INDEX = path.join(ROOT, 'server', 'index.js');
const SYNC = path.join(ROOT, 'server', 'sync.js');
const METRICS = path.join(ROOT, 'server', 'metrics.js');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 260) : '')); }
}
function runSuite() {
  return spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
}

console.log('▸ خطِّ پایه');
const base = runSuite();
chk('خطِّ پایهٔ wave17-testing سبز است', base.status === 0, (base.stdout || '').slice(-220));
if (base.status !== 0) { console.log((base.stdout || '') + (base.stderr || '')); process.exit(1); }

function mutate(file, find, replace, killRe, tag) {
  const orig = fs.readFileSync(file, 'utf8');
  try {
    if (!orig.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false, 'anchor missing in ' + path.basename(file)); return; }
    fs.writeFileSync(file, orig.replace(find, replace), 'utf8');
    const r = runSuite();
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-300).replace(/\n/g, ' '));
  } finally {
    fs.writeFileSync(file, orig, 'utf8');
  }
}

/* جهشِ چندجایگاهی — وقتی دفاع لایه‌ای است (مثلِ ایدمپوتانسِ پیش-اعمال + sweep)،
   برداشتنِ یک لایه به‌تنهایی چیزی را ضعیف نمی‌کند؛ همهٔ لایه‌ها با هم برداشته
   می‌شوند تا تستِ کشتن صادق بماند. */
function mutateMulti(file, pairs, killRe, tag) {
  const orig = fs.readFileSync(file, 'utf8');
  try {
    let mutated = orig;
    for (const [find, replace] of pairs) {
      if (!mutated.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false, 'anchor missing: ' + find.slice(0, 60)); return; }
      mutated = mutated.replace(find, replace);
    }
    fs.writeFileSync(file, mutated, 'utf8');
    const r = runSuite();
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-300).replace(/\n/g, ' '));
  } finally {
    fs.writeFileSync(file, orig, 'utf8');
  }
}

console.log('\n▸ جهش‌ها');

/* Z1 — the documented batch ceiling must actually be enforced */
mutate(INDEX,
  `const MAX_BATCH = 500;                 /* contract §3.3 */`,
  `const MAX_BATCH = 5000;                /* جهش: سقفِ دسته ده برابر شد */`,
  /❌ ST1/, 'Z1 بزرگ‌کردنِ سقفِ دسته (index.js)');

/* Z2 — the body-size limit is what turns a huge payload into a 413 */
mutate(INDEX,
  `      const b = await readBody(req, 1024 * 1024);`,
  `      const b = await readBody(req, 512 * 1024 * 1024); /* جهش: سقفِ بدنه برداشته شد */`,
  /❌ ST2/, 'Z2 برداشتنِ سقفِ حجمِ بدنه (index.js)');

/* Z3 — idempotency is what makes an offline retry safe. main (چت ۵، W7) لایهٔ
   دوم دارد: ادعای اتمیکِ پیش از اعمال در حلقهٔ sweep — جهشِ تک‌خطی دیگر
   کافی نیست؛ هر دو لایه جدا جهش می‌شوند و هر کدام باید کشته شوند. */
/* Z3 — idempotency is what makes an offline retry safe. main (چت ۵، W7) دفاعِ
   لایه‌ای دارد: بررسیِ پیش-اعمال (cache/db/store) + ادعای اتمیک در حلقهٔ sweep.
   جهشِ تک‌خطی لایهٔ دیگر را زنده می‌گذارد و تست بی‌معنا سبز می‌ماند؛ پس هر دو
   با هم برداشته می‌شوند (mutateMulti). */
mutateMulti(SYNC, [
  [`      if(store.__processed_uids && store.__processed_uids[op.uid]){`,
   `      if(false){ /* جهش: لایهٔ sweep ایدمپوتانس برداشته شد */`],
  [`      const isProcessed = (await cache.isProcessedUid(op.uid)) ||
        ((db && typeof db.isUidProcessed === 'function') ? await db.isUidProcessed(op.uid) : false) ||
        !!(store.__processed_uids && store.__processed_uids[op.uid]);`,
   `      const isProcessed = false; /* جهش: ایدمپوتانس پیش-اعمال غیرفعال شد */`]
], /❌ (IN5|CC4)/, 'Z3 غیرفعال‌کردنِ هر دو لایهٔ ایدمپوتانس (sync.js)');
/* Z4 — without the version gate a concurrent write silently clobbers */
/* ری‌تارگت (ممیزی دور ۲): شرط به versionedMismatch/structuralMismatch
   بازآرایی شده (delta hardening phase 2) — همان جهش، لنگرِ جاری. */
mutate(SYNC,
  `        const versionedMismatch = !!VERSIONED[op.c] && Number(op.base_version) !== cur;`,
  `        const versionedMismatch = false; /* جهش: دروازهٔ base_version برداشته شد */`,
  /❌ (IN7|CC5)/, 'Z4 برداشتنِ دروازهٔ base_version (sync.js)');

/* Z5 — if the counter is not recorded, every accounting assertion is blind */
mutate(METRICS,
  `    registry.inc('payesh_http_requests_total', { route, method, code });`,
  `    /* جهش: شمارِ درخواست‌ها ثبت نمی‌شود */`,
  /❌ (LD5|IN10|CC2)/, 'Z5 ثبت‌نکردنِ شمارِ درخواست‌ها (metrics.js)');

console.log('\n▸ بازگردانی');
const fin = runSuite();
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0, (fin.stdout || '').slice(-180));
for (const f of [INDEX, SYNC, METRICS]) {
  chk(path.basename(f) + ' بدونِ باقی‌ماندهٔ جهش است', fs.readFileSync(f, 'utf8').indexOf('جهش:') < 0);
}

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های ویو ۱۷: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);

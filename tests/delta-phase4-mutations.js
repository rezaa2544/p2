#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/delta-phase4-mutations.js — جهش‌های فاز ۴ (قانون SKILLS_MASTER §۵)
   هر جهش باید حداقل یک تستِ delta-phase4.js را بکشد (exit != 0)؛
   جهشِ زنده = تست ناکافی. پس از هر جهش، سورس عیناً برمی‌گردد.
   ─────────────────────────────────────────────────────────────────
   M1  سرور: دروازهٔ ۴۲۹ هرگز رد نمی‌کند        → BP3/BP4 باید بمیرند
   M2  سرور: fail-open حذف می‌شود (پرتاب)      → BP5 باید بمیرد
   M3  کلاینت: شاخهٔ ۴۲۹ در sendBatch حذف      → BP6 باید بمیرد
   M4  کلاینت: sendChunked دیگر re-throw       → BP6 باید بمیرد
   M5  سرور: وزنِ op حذف می‌شود (weight=1)     → BP3 باید بمیرد
   M6  فشرده‌سازی: مذاکره همیشه null          → CM1/CM2/CM6 باید بمیرند
   M7  pull.js: فراخوانیِ فشرده‌ساز حذف        → CM1/CM6 باید بمیرند
   M8  فشرده‌سازی: آستانهٔ حجم حذف            → CM4 باید بمیرد
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE = 'tests/delta-phase4.js';
let pass = 0, fail = 0;
const chk = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

function mutate(file, old, newTxt) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  if (src.indexOf(old) === -1) throw new Error('anchor not found in ' + file + ': ' + old.slice(0, 50));
  fs.writeFileSync(p, src.replace(old, newTxt), 'utf8');
  return src;
}
function runSuite() {
  try {
    execFileSync('node', [path.join(ROOT, SUITE)], { stdio: 'pipe', timeout: 120000 });
    return 0;
  } catch (e) { return (e.status != null ? e.status : -1); }
}
function buildClient() {
  try { execFileSync('node', [path.join(ROOT, 'build.js')], { stdio: 'pipe', timeout: 120000 }); }
  catch (e) { throw new Error('build failed after mutation: ' + (e.stderr || '')); }
}

(async () => {
  console.log('\n▸ جهش‌های گپ ۱ — Backpressure');

  /* M1: گیتِ ۴۲۹ هرگز رد نمی‌کند */
  let orig = mutate('server/sync.js',
    "if (r && r.allowed === false) {",
    "if (false && r && r.allowed === false) { /*MUT*/");
  chk('M1 جهشِ «دروازهٔ ۴۲۹ خاموش» کشته شد', runSuite() !== 0, 'suite stayed green — test insufficient');
  fs.writeFileSync(path.join(ROOT, 'server/sync.js'), orig, 'utf8');

  /* M2: fail-open حذف — خطای موتور پرتاب می‌شود */
  orig = mutate('server/sync.js',
    "} catch (_) { r = null; /* fail-open — همان قراردادِ rate-limit.js */ }",
    "} catch (e) { throw e; /*MUT: fail-open حذف*/ }");
  chk('M2 جهشِ «fail-open حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/sync.js'), orig, 'utf8');

  /* M3: شاخهٔ ۴۲۹ کلاینت در sendBatch حذف */
  orig = mutate('src/js/27-sync.js',
    "if(raw.status === 429 || code === 'sync_backpressure'){",
    "if(false && (raw.status === 429 || code === 'sync_backpressure')){ /*MUT*/");
  buildClient();
  chk('M3 جهشِ «شاخهٔ ۴۲۹ کلاینت» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'src/js/27-sync.js'), orig, 'utf8');
  buildClient();

  /* M4: sendChunked دیگر backpressure را re-throw نمی‌کند */
  orig = mutate('src/js/27-sync.js',
    "if(err && err.code === 'sync_backpressure') throw err;",
    "if(false && err && err.code === 'sync_backpressure') throw err; /*MUT*/");
  buildClient();
  chk('M4 جهشِ «re-throw حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'src/js/27-sync.js'), orig, 'utf8');
  buildClient();

  /* M5: وزنِ op حذف — هر درخواست ۱ واحد مصرف می‌کند */
  orig = mutate('server/sync.js',
    "        weight: ops.length",
    "        weight: 1 /*MUT*/");
  chk('M5 جهشِ «وزنِ op حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/sync.js'), orig, 'utf8');


  /* ── جهش‌های گپ ۲ — فشرده‌سازی ── */
  console.log('\n▸ جهش‌های گپ ۲ — فشرده‌سازی');

  /* M6: مذاکره هرگز encoding برنمی‌گرداند */
  orig = mutate('server/compress.js',
    "  const enc = raw.length >= minBytes() ? negotiateEncoding(headers['accept-encoding']) : null;",
    "  const enc = null; /*MUT*/");
  chk('M6 جهشِ «مذاکرهٔ خاموش» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/compress.js'), orig, 'utf8');

  /* M7: pull.js به sendJson خام برمی‌گردد */
  orig = mutate('server/pull.js',
    "    const encInfo = sendJsonCompressed(res, req, 200, body, sendJson);",
    "    sendJson(res, 200, body); const encInfo = { encoding: null, rawBytes: 0, wireBytes: 0 }; /*MUT*/");
  chk('M7 جهشِ «فراخوانی حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/pull.js'), orig, 'utf8');

  /* M8: آستانهٔ حجم حذف — حتی بدنهٔ کوچک فشرده می‌شود */
  orig = mutate('server/compress.js',
    "  const enc = raw.length >= minBytes() ? negotiateEncoding(headers['accept-encoding']) : null;",
    "  const enc = raw.length >= 0 ? negotiateEncoding(headers['accept-encoding']) : null; /*MUT*/");
  chk('M8 جهشِ «آستانهٔ حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/compress.js'), orig, 'utf8');

  /* سلامت پایه پس از بازگردانی‌ها */
  chk('پایه پس از بازگردانی سبز است', runSuite() === 0);

  console.log('\n────────────────────────────────────────────');
  console.log(`جهش‌های فاز ۴: ${pass}/${pass + fail}` + (fail ? ' — ❌' : ' — همه کشته شدند ✅'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });

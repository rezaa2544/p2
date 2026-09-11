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
   M9  کرسر: چکِ TTL در verify حذف           → CW1 باید بمیرد
   M10 کرسر: keySource همیشه 'none'          → CW2 باید بمیرد
   M11 health: persistent همیشه false        → CW3 باید بمیرد
   M12 pull: شمارندهٔ pulls حذف                → MX2 باید بمیرد
   M13 sync: شمارندهٔ pushes حذف               → MX3 باید بمیرد
   M14 metrics: syncHealthStats خالی برمی‌گرداند → MX1/MX4 باید بمیرند
   M15 pull: شمارندهٔ cursor_expired حذف       → MX3 باید بمیرد
   M16 کرسر: چکِ rg حذف                        → MR2 باید بمیرد
   M17 کرسر: امضا v1 بدونِ rg                   → MR1 باید بمیرد
   M18 pull: شمارندهٔ region_mismatch حذف       → MR2 باید بمیرد
   M19 کرسر: دورهٔ گذارِ v1 حذف                 → MR3 باید بمیرد
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

  /* M7: pull.js به sendJson خام برمی‌گردد.
     S9-3 (باگ‌هانت نشست ۹): لنگر به خطِ تازه به‌روز شد — فراخوانی حالا
     await دارد (فشرده‌سازی ناهمگام شد). جهش همان معنا را دارد: حذفِ مسیرِ
     فشرده‌سازی از pull. */
  orig = mutate('server/pull.js',
    "    const encInfo = await sendJsonCompressed(res, req, 200, body, sendJson);",
    "    sendJson(res, 200, body); const encInfo = { encoding: null, rawBytes: 0, wireBytes: 0 }; /*MUT*/");
  chk('M7 جهشِ «فراخوانی حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/pull.js'), orig, 'utf8');

  /* M8: آستانهٔ حجم حذف — حتی بدنهٔ کوچک فشرده می‌شود */
  orig = mutate('server/compress.js',
    "  const enc = raw.length >= minBytes() ? negotiateEncoding(headers['accept-encoding']) : null;",
    "  const enc = raw.length >= 0 ? negotiateEncoding(headers['accept-encoding']) : null; /*MUT*/");
  chk('M8 جهشِ «آستانهٔ حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/compress.js'), orig, 'utf8');


  /* ── جهش‌های گپ ۳ — کلیدِ کرسرِ پایدار ── */
  console.log('\n▸ جهش‌های گپ ۳ — کلیدِ کرسرِ پایدار');

  /* M9: انقضای TTL دیگر چک نمی‌شود */
  orig = mutate('server/cursor.js',
    "      if (payload.exp <= t) return { ok: false, code: 'cursor_expired' };",
    "      /*MUT: TTL check removed*/");
  chk('M9 جهشِ «TTL حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/cursor.js'), orig, 'utf8');

  /* M10: keySource همیشه none گزارش می‌شود */
  orig = mutate('server/cursor.js',
    "    keySource: resolved.source,",
    "    keySource: 'none' /*MUT*/,");
  chk('M10 جهشِ «keySource دروغ» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/cursor.js'), orig, 'utf8');

  /* M11: سلامتِ cursor پایدار را false گزارش می‌کند */
  orig = mutate('server/index.js',
    "        cursor: { enabled: pullRoute.cursor.enabled, persistent: pullRoute.cursor.enabled, key_source: CURSOR_KEY_SOURCE }",
    "        cursor: { enabled: pullRoute.cursor.enabled, persistent: false /*MUT*/, key_source: CURSOR_KEY_SOURCE }");
  chk('M11 جهشِ «persistent=false» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/index.js'), orig, 'utf8');


  /* ── جهش‌های گپ ۴ — سنجه‌های sync ── */
  console.log('\n▸ جهش‌های گپ ۴ — سنجه‌های sync');

  orig = mutate('server/pull.js',
    "    metrics.inc('payesh_sync_pulls_total', { mode: (isDelta && !forceFull) ? 'delta' : 'full' });",
    "    /*MUT*/");
  chk('M12 جهشِ «pulls حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/pull.js'), orig, 'utf8');

  orig = mutate('server/sync.js',
    "    metrics.inc('payesh_sync_pushes_total');",
    "    /*MUT*/");
  chk('M13 جهشِ «pushes حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/sync.js'), orig, 'utf8');

  orig = mutate('server/metrics.js',
    "function syncHealthStats(snap) {",
    "function syncHealthStats(snap) { if (true) { return {}; } /*MUT*/ snap = snap || {};");
  chk('M14 جهشِ «helper خالی» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/metrics.js'), orig, 'utf8');

  orig = mutate('server/pull.js',
    "        if (v.code === 'cursor_expired') metrics.inc('payesh_cursor_expired_total');",
    "        /*MUT*/");
  chk('M15 جهشِ «cursor_expired حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/pull.js'), orig, 'utf8');


  /* ── جهش‌های گپ ۵ — کرسرِ region-aware ── */
  console.log('\n▸ جهش‌های گپ ۵ — کرسرِ region-aware');

  /* S9-1 (باگ‌هانت نشست ۹): چکِ منطقه پس از امضا آمد و شرطش v2-محور شد؛
     لنگر به‌روز شد، معنا همان: خنثی‌کردنِ داوریِ منطقه. */
  orig = mutate('server/cursor.js',
    "      if (payload.v === 2 && payload.rg !== regionName()) {",
    "      if (false && payload.v === 2 && payload.rg !== regionName()) { /*MUT*/");
  chk('M16 جهشِ «چکِ rg حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/cursor.js'), orig, 'utf8');

  orig = mutate('server/cursor.js',
    "        v: 2,",
    "        v: 1, /*MUT*/");
  chk('M17 جهشِ «امضای v1» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/cursor.js'), orig, 'utf8');

  orig = mutate('server/pull.js',
    "        if (v.code === 'region_mismatch') metrics.inc('payesh_cursor_region_mismatch_total');",
    "        /*MUT*/");
  chk('M18 جهشِ «شمارندهٔ mismatch حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/pull.js'), orig, 'utf8');

  orig = mutate('server/cursor.js',
    "      if (payload.v !== 1 && payload.v !== 2) {",
    "      if (payload.v !== 2) { /*MUT: v1 grace removed */");
  chk('M19 جهشِ «گذارِ v1 حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server/cursor.js'), orig, 'utf8');

  /* سلامت پایه پس از بازگردانی‌ها */
  chk('پایه پس از بازگردانی سبز است', runSuite() === 0);

  console.log('\n────────────────────────────────────────────');
  console.log(`جهش‌های فاز ۴: ${pass}/${pass + fail}` + (fail ? ' — ❌' : ' — همه کشته شدند ✅'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });

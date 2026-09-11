#!/usr/bin/env node
/**
 * bughunt-session9-mutations.js — جهش‌آزماییِ رفع‌هایِ نشست ۹
 * ══════════════════════════════════════════════════════════════════
 * هر جهش باید tests/bughunt-session9.js را سرخ کند؛ جهشی که زنده بماند
 * یعنی آن ادعا فقط «سبزِ تصادفی» است.
 *
 *   M1 کرسر: داوریِ منطقه دوباره *پیش از* امضا (تغییرِ شرط) ⇒ A1/A4
 *   M2 کرسر: مقایسهٔ منطقه کاملاً حذف (تغییرِ شرط) ⇒ A2
 *   M3 فشرده‌سازی: نگارشِ q=0 نادیده گرفته شود ⇒ B1/B2/B3
 *   M4 فشرده‌سازی: ناهمگام → همگام (gzipSync) ⇒ C1
 *   M5 فشرده‌سازی: حذفِ fallbackِ catch (شبیه‌سازیِ کرشِ میانهٔ نوشتن) ⇒ C5
 *   M6 فشرده‌سازی: حذفِ سرآیندِ Vary ⇒ C2
 *   M7 pull: حذفِ await (نتیجهٔ Promise به‌جای بدنه) ⇒ C-های pull
 *   LS حذفِ تصادفیِ خط (بذردار) روی compress.js و cursor.js: نرخِ کشتن
 * اجرا: node tests/bughunt-session9-mutations.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE = path.join(ROOT, 'tests', 'bughunt-session9.js');
let pass = 0, fail = 0;
const notes = [];
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const runSuite = () => spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });

function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  const before = sha(f);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (لنگر پیدا نشد — به‌روز کن)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    const r = runSuite();
    const out = (r.stdout || '') + (r.stderr || '');
    if (!/bughunt-session9: /.test(out)) { chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار چاپ نشد'); return; }
    chk(r.status !== 0 && killRe.test(out), tag);
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
    if (sha(f) !== before) chk(false, tag + ' — فایل پس از بازگردانی یکسان نیست!');
  }
}

console.log('\n▸ جهش‌های نشست ۹ — S9-1/S9-2/S9-3');

/* ── M1b: چکِ منطقه *قبل از* تأییدِ امضا اجرا شود ── */
mutate('server/cursor.js',
  "      let sigOk = false;\n      try {",
  "      if (payload.v === 2 && payload.rg !== regionName()) return { ok: false, code: 'region_mismatch' }; /*MUT: قبل از امضا*/\n      let sigOk = false;\n      try {",
  /❌ A1|❌ A4/, 'M1 بازگشتِ داوریِ منطقه به پیش از امضا ⇒ A1/A4 کشته شد');

/* ── M2: مقایسهٔ منطقه (برای توکنِ اصیل) حذف شود ── */
mutate('server/cursor.js',
  "      if (payload.v === 2 && payload.rg !== regionName()) {",
  "      if (payload.v === 2 && false) { /*MUT*/",
  /❌ A2/, 'M2 حذفِ مقایسهٔ منطقه ⇒ A2 کشته شد');

/* ── M3: نادیده گرفتنِ q=0 در مذاکره ── */
mutate('server/compress.js',
  "  if (allowed('gzip') > 0) return 'gzip';",
  "  if (allowed('gzip') >= 0) return 'gzip'; /*MUT: q=0 نادیده */",
  /❌ B1|❌ B3|❌ B5/, 'M3 نادیده‌گرفتنِ q=0 ⇒ B1/B3/B5 کشته شد');

/* ── M4: بازگشت به فشرده‌سازیِ همگام (قفلِ حلقهٔ رویداد) ── */
mutate('server/compress.js',
  "    const out = enc === 'gzip'\n      ? await gzipAsync(raw, { level: 6 })",
  "    const out = enc === 'gzip'\n      ? zlib.gzipSync(raw, { level: 6 }) /*MUT*/",
  /❌ C1/, 'M4 برگشتِ gzipSync ⇒ C1 کشته شد');

/* ── M5: fallbackِ catch حذف شود (کرشِ میانهٔ نوشتن پاسخ را می‌کشد) ── */
mutate('server/compress.js',
  "  } catch (e) {\n    /* شکستِ فشرده‌سازی هرگز پاسخ را نمی‌کشد */\n    return { encoding: null, rawBytes: raw.length, wireBytes: raw.length, reply: sendJson(res, status, obj) };",
  "  } catch (e) {\n    throw e; /*MUT*/",
  /❌ C5/, 'M5 حذفِ fallbackِ خطا ⇒ C5 کشته شد');

/* ── M6: حذفِ سرآیندِ Vary (کش‌های میانی بدنهٔ اشتباه را سرو می‌کنند) ── */
mutate('server/compress.js',
  "'Vary': 'Accept-Encoding'",
  "/*MUT: Vary حذف شد*/",
  /❌ C2/, 'M6 حذفِ Vary ⇒ C2 کشته شد');

/* ── M7: حذفِ await در pull (نتیجهٔ Promise به‌جای بدنهٔ کامل) ── */
mutate('server/pull.js',
  "    const encInfo = await sendJsonCompressed(res, req, 200, body, sendJson);",
  "    const encInfo = sendJsonCompressed(res, req, 200, body, sendJson); /*MUT*/",
  /❌ A|❌ C/, 'M7 حذفِ await در pull ⇒ تست‌ها می‌شکنند');

/* ── LS: حذفِ تصادفیِ خط با بذرِ ثابت (کارایی: ۲۰ خط از هر فایل) ── */
console.log('\n▸ حذفِ تصادفیِ خط (بذرِ ثابت ۰xS9 = 20260911) — نرخِ کشتن');
{
  let killed = 0, total = 0, env = 0;
  const rnd = (() => { let s = 20260911; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  for (const file of ['server/compress.js', 'server/cursor.js']) {
    const f = path.join(ROOT, file);
    const before = sha(f);
    const orig = fs.readFileSync(f, 'utf8');
    const lines = orig.split('\n');
    const idxs = new Set();
    const tried = [];
    /* خطوطِ بی‌اثر کنار گذاشته می‌شوند: خالی، خطِ //، خطِ *، و هر خطی که
       درونِ کامنتِ بلوکی است (شمارشِ باز/بستهٔ بلوک تا آن خط). */
    const inBlock = (() => {
      const arr = new Array(lines.length).fill(false); let open = false;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]; arr[i] = open;
        const starts = (l.match(/\/\*/g) || []).length, ends = (l.match(/\*\//g) || []).length;
        if (starts > ends) open = true; else if (ends > starts) open = false;
      }
      return arr;
    })();
    for (let i = 0; i < 400 && idxs.size < 20; i++) {
      const k = 1 + Math.floor(rnd() * (lines.length - 1));
      const l = lines[k];
      if (!l.trim() || /^\s*(#|\/\/|\*|\/\*)/.test(l) || inBlock[k]) continue;
      idxs.add(k); tried.push(k);
    }
    let fileKilled = 0, fileValid = 0, fileSkipped = 0;
    for (const k of tried) {
      const mutated = lines.slice(0, k).concat(lines.slice(k + 1)).join('\n');
      fs.writeFileSync(f, mutated, 'utf8');
      /* جهشِ غیرقابل‌تجزیه (SyntaxError) جهشِ معنادار نیست: برنامه‌ای وجود
         ندارد که رفتاری داشته باشد. کنارش می‌گذاریم و در مخرج نمی‌شماریم. */
      const parse = spawnSync('node', ['--check', f], { encoding: 'utf8' });
      if (parse.status !== 0) { fileSkipped++; fs.writeFileSync(f, orig, 'utf8'); continue; }
      const r = runSuite();
      const out = (r.stdout || '') + (r.stderr || '');
      const isRed = r.status !== 0 && /bughunt-session9: /.test(out);
      if (!/bughunt-session9: /.test(out)) { env++; fs.writeFileSync(f, orig, 'utf8'); continue; }
      fileValid++; total++;
      if (isRed) { killed++; fileKilled++; }
      fs.writeFileSync(f, orig, 'utf8');
    }
    if (sha(f) !== before) chk(false, file + ' پس از جاروبِ حذفِ خط بازگردانی نشد!');
    notes.push(`${file}: ${fileKilled}/${fileValid}`);
    console.log('   ' + file + ' — جهشِ معتبر ' + fileValid + ' · کشته ' + fileKilled
      + ' · غیرقابل‌تجزیه (کنارگذاشته) ' + fileSkipped + ' · خطوطِ آزموده: ' + tried.join(','));
  }
  chk(total > 0 && killed / total >= 0.5,
    'LS نرخِ کشتنِ حذفِ تصادفیِ خط: ' + killed + '/' + total + ' = ' + Math.round(100 * killed / total) + '% (آستانه ۵۰٪)؛ خطاهای محیطی: ' + env);
}

console.log('\n────────────────────────────────────────────');
console.log(`جهش‌های نشست ۹: ${pass}/${pass + fail}` + (fail ? ' — ❌' : ' — همه کشته شدند ✅'));
if (notes.length) console.log('   ' + notes.join(' · '));
console.log('────────────────────────────────────────────');
process.exit(fail ? 1 : 0);

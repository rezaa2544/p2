#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/docs-refs-check.js — سنجشِ ابزارِ ارجاع‌های کهنه

   این تست خودِ tools/docs-refs-check.js را می‌سنجد، نه فقط خروجی‌اش را:
   ابزار باید ارجاعِ کهنهٔ **تازه** را بگیرد و بدهیِ تاریخیِ خطِ پایه را
   قرمز نکند. بدونِ این تست، ابزاری که ساکت شده باشد سبز می‌ماند.

   اجرا: node tests/docs-refs-check.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'docs-refs-check.js');
const BASELINE = path.join(ROOT, 'tools', 'docs-refs-baseline.json');
const mod = require(TOOL);

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; const e = name + (extra ? ' — ' + extra : ''); errors.push(e); console.log('  ❌ ' + e); }
}
function grp(t) { console.log('\n▸ ' + t); }
/* نکته: ابزار ROOT را از __dirname خودش می‌گیرد، نه از cwd. پس برای
   آزمودنِ رفتار روی یک درختِ موقت باید **کپیِ همان درخت** اجرا شود؛
   اجرای مسیرِ اصلی با cwd موقت، مخزنِ واقعی را می‌سنجد و نتیجهٔ کاذب
   می‌دهد. (این باگ در نخستین نسخهٔ همین تست بود.) */
function run(args, opts = {}) {
  const bin = opts.bin || TOOL;
  try {
    const out = execFileSync(process.execPath, [bin, ...args],
      { cwd: opts.cwd || ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

grp('RC-STRUCT — ابزار و خطِ پایه');
chk('ابزار وجود دارد', fs.existsSync(TOOL));
chk('خطِ پایه وجود دارد', fs.existsSync(BASELINE));
let base = null;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { /* پایین سنجیده می‌شود */ }
chk('خطِ پایه JSONِ معتبر است', !!base);
chk('خطِ پایه دلیلِ خود را ثبت کرده', !!base && typeof base._why === 'string' && base._why.length > 40);
chk('خطِ پایه با شمارِ خود هم‌خوان است', !!base && Array.isArray(base.known) && base.known.length === base.count,
  base ? `${base.known && base.known.length} در برابر ${base.count}` : '—');
chk('کلیدهای خطِ پایه قالبِ «سند → ارجاع» دارند',
  !!base && base.known.every((k) => typeof k === 'string' && k.includes(' → ')));

grp('RC-STATE — وضعیتِ جاریِ مخزن');
const now = run(['--check']);
chk('هیچ ارجاعِ کهنهٔ تازه‌ای روی مخزن نیست', now.code === 0, now.out.split('\n').filter((l) => l.includes('•')).slice(0, 3).join(' | '));
const js = run(['--json']);
let data = null;
try { data = JSON.parse(js.out); } catch (e) { /* پایین سنجیده می‌شود */ }
chk('--json خروجیِ معتبر می‌دهد', !!data && typeof data.totalMissing === 'number');
chk('شمارِ «تازه» صفر است', !!data && data.fresh.length === 0, data ? String(data.fresh.length) : '—');

grp('RC-BEHAV — رفتارِ ابزار روی ارجاعِ کهنهٔ تازه');
/* در یک کپیِ موقت، تا مخزنِ واقعی دست‌نخورده بماند */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-probe-'));
try {
  fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
  const tmpTool = path.join(tmp, 'tools', 'docs-refs-check.js');
  fs.copyFileSync(TOOL, tmpTool);
  fs.writeFileSync(path.join(tmp, 'tools', 'docs-refs-baseline.json'),
    JSON.stringify({ _why: 'probe', count: 0, known: [] }), 'utf8');
  fs.writeFileSync(path.join(tmp, 'docs', 'A.md'), '# الف\n\nاجرا: `node tests/ghost-probe.js`\n', 'utf8');

  const r1 = run(['--check'], { cwd: tmp, bin: tmpTool });
  chk('ارجاعِ کهنهٔ تازه → exit 1', r1.code === 1, 'exit=' + r1.code);
  chk('نامِ سند و ارجاع را گزارش می‌کند',
    r1.out.includes('docs/A.md') && r1.out.includes('tests/ghost-probe.js'));
  chk('دستورِ رفع را نشان می‌دهد', r1.out.includes('--baseline'));

  const r2 = run(['--baseline'], { cwd: tmp, bin: tmpTool });
  chk('--baseline با موفقیت می‌نویسد', r2.code === 0, 'exit=' + r2.code);
  const r3 = run(['--check'], { cwd: tmp, bin: tmpTool });
  chk('پس از ثبت در خطِ پایه، سبز می‌شود', r3.code === 0, 'exit=' + r3.code + ' ' + r3.out.slice(0, 120));

  /* ارجاعِ کهنهٔ تازهٔ دوم باید دوباره قرمز کند — یعنی خطِ پایه همه‌چیز را نمی‌بلعد */
  fs.appendFileSync(path.join(tmp, 'docs', 'A.md'), '\nو `tools/another-ghost.js`\n', 'utf8');
  const r4 = run(['--check'], { cwd: tmp, bin: tmpTool });
  chk('ارجاعِ کهنهٔ تازهٔ دوم دوباره قرمز می‌کند', r4.code === 1, 'exit=' + r4.code);

  /* مسیرِ قالب نباید قرمز کند */
  fs.writeFileSync(path.join(tmp, 'docs', 'B.md'),
    '# ب\n\nماژولِ خود را در `src/js/77-my-feature.js` بسازید.\n', 'utf8');
  fs.writeFileSync(path.join(tmp, 'tools', 'docs-refs-baseline.json'),
    JSON.stringify({ _why: 'probe', count: 2, known: ['docs/A.md → tests/ghost-probe.js', 'docs/A.md → tools/another-ghost.js'] }), 'utf8');
  const r5 = run(['--check'], { cwd: tmp, bin: tmpTool });
  chk('مسیرِ قالب (my-feature) قرمز نمی‌کند', r5.code === 0, 'exit=' + r5.code + ' ' + r5.out.slice(0, 160));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

grp('RC-IGNORE — قاعدهٔ «تولیدی» از .gitignore');
/* باگی که این بخش می‌بندد: روی یک **کلونِ تازه** ‏`docs/_metadata.json` و
   ‏`server/data/*.json` هنوز ساخته نشده‌اند، چون تولیدی‌اند و در `.gitignore`‌اند.
   نسخهٔ نخست آن‌ها را «ارجاعِ کهنه» می‌شمرد و گیت را روی مخزنِ سالم قرمز
   می‌کرد — و در درختِ کاریِ خودم سبز بود، چون آن فایل‌ها از اجرای قبلی
   ابزار حضور داشتند. سبزی که به فایلِ بیرون از گیت وابسته باشد، سبزِ جعلی است. */
const tmpG = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-ignore-'));
try {
  fs.mkdirSync(path.join(tmpG, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(tmpG, 'docs'), { recursive: true });
  const tTool = path.join(tmpG, 'tools', 'docs-refs-check.js');
  fs.copyFileSync(TOOL, tTool);
  const tBase = path.join(tmpG, 'tools', 'docs-refs-baseline.json');
  fs.writeFileSync(tBase, JSON.stringify({ _why: 'probe', count: 0, known: [] }), 'utf8');
  const gi = path.join(tmpG, '.gitignore');
  fs.writeFileSync(gi, 'server/data/\ndocs/_meta.json\ntests/gen-out/\n', 'utf8');
  /* سندی که فقط به خروجی‌های تولیدی ارجاع می‌دهد */
  fs.writeFileSync(path.join(tmpG, 'docs', 'C.md'),
    '# ج\n\n`server/data/payesh.json` و `docs/_meta.json` و `tests/gen-out/x.js`\n', 'utf8');

  const g1 = run(['--check'], { cwd: tmpG, bin: tTool });
  chk('ارجاع به خروجیِ ignore‌شده قرمز نمی‌کند (کلونِ تازه)', g1.code === 0,
    'exit=' + g1.code + ' ' + g1.out.slice(0, 200));

  const g2 = run(['--json'], { cwd: tmpG, bin: tTool });
  let gd = null; try { gd = JSON.parse(g2.out); } catch (e) { /* پایین سنجیده می‌شود */ }
  chk('مواردِ ردشده در --json دیده می‌شوند (ساکت قورت داده نمی‌شوند)',
    !!gd && Array.isArray(gd.generatedSkipped) && gd.generatedSkipped.length === 3,
    gd ? JSON.stringify(gd.generatedSkipped) : '—');
  chk('قاعده پوشهٔ ignore‌شده را هم می‌گیرد (server/data/ → server/data/x.json)',
    !!gd && gd.generatedSkipped.includes('server/data/payesh.json'));
  chk('شمارِ ردشده‌ها در خروجیِ انسان‌خوان هست', g1.out.includes('تولیدی'), g1.out.slice(0, 200));

  /* قاعده باید از خودِ .gitignore بیاید، نه از یک فهرستِ سخت‌کدشده */
  fs.unlinkSync(gi);
  const g3 = run(['--check'], { cwd: tmpG, bin: tTool });
  chk('بدونِ .gitignore همان ارجاع‌ها دوباره قرمز می‌شوند (قاعده سخت‌کد نیست)',
    g3.code === 1, 'exit=' + g3.code);
  fs.writeFileSync(gi, 'server/data/\ndocs/_meta.json\ndist/\n', 'utf8');

  /* قاعده نباید بدهیِ واقعی را ببلعد */
  fs.appendFileSync(path.join(tmpG, 'docs', 'C.md'), '\nو `tests/real-ghost.js`\n', 'utf8');
  const g4 = run(['--check'], { cwd: tmpG, bin: tTool });
  chk('ارجاعِ کهنهٔ واقعی کنارِ تولیدی‌ها هنوز قرمز می‌کند', g4.code === 1, 'exit=' + g4.code);
  chk('فقط همان ارجاعِ واقعی را نام می‌برد',
    g4.out.includes('tests/real-ghost.js') && !g4.out.includes('docs/_meta.json'), g4.out.slice(0, 240));
} finally {
  fs.rmSync(tmpG, { recursive: true, force: true });
}

grp('RC-SCOPE — دامنهٔ پویش');
const docs = mod.allDocs();
chk('docs/ و ریشهٔ مخزن را می‌پوید',
  docs.some((d) => d.includes(`${path.sep}docs${path.sep}`)) && docs.some((d) => path.dirname(d) === ROOT));
chk('node_modules را نمی‌پوید', !docs.some((d) => d.includes('node_modules')));
chk('کمینه یک سند پیدا می‌کند', docs.length > 100, String(docs.length));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ ابزارِ ارجاع‌های کهنه سالم است.');

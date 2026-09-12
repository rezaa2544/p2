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

grp('RC-SCOPE — دامنهٔ پویش');
const mod = require(TOOL);
const docs = mod.allDocs();
chk('docs/ و ریشهٔ مخزن را می‌پوید',
  docs.some((d) => d.includes(`${path.sep}docs${path.sep}`)) && docs.some((d) => path.dirname(d) === ROOT));
chk('node_modules را نمی‌پوید', !docs.some((d) => d.includes('node_modules')));
chk('کمینه یک سند پیدا می‌کند', docs.length > 100, String(docs.length));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ ابزارِ ارجاع‌های کهنه سالم است.');

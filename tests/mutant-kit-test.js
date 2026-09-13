#!/usr/bin/env node
/* tests/mutant-kit-test.js — خودآزمِ الگوی امن جهش (BH-mut فاز ۱).
   ثابت می‌کند: بازمپِ require/fs.read/fs.write/دو-مسیره‌ها، مسیر نسبی،
   به‌ارث‌رسانی به نوه‌ها، بی‌اثریِ بدونِ map، و گارانتیِ حادثهٔ P1-2
   (مرگِ ناگهانیِ فرآیند وسطِ جهش ⇒ درختِ ریپو سالم می‌ماند). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const { session } = require('./helpers/mutant-kit');
const ROOT = path.join(__dirname, '..');
const PRELOAD = path.join(__dirname, 'helpers', 'mutant-preload.js');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
let pass = 0, fail = 0, total = 0;
function check(name, ok, extra) {
  total++;
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function child(script, env, cwd) {
  const r = cp.spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8', env, cwd: cwd || ROOT, timeout: 30000,
  });
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

/* ── صحنهٔ مشترک: سندباکسِ فایل‌ها در tmpdir (نه در ریپو) ── */
const box = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-selftest-'));
fs.writeFileSync(path.join(box, 'mod.js'), "module.exports = 'ORIGINAL';\n");
fs.writeFileSync(path.join(box, 'a.txt'), 'original-a\n');
fs.writeFileSync(path.join(box, 'b.txt'), 'original-b\n');
fs.mkdirSync(path.join(box, 'sub'));
fs.writeFileSync(path.join(box, 'sub', 'rel.txt'), 'original-rel\n');

const kit = session('kit-selftest-');

/* T1: require به کپی جهش‌یافته هدایت می‌شود (کلاس سرور) */
{
  const target = path.join(box, 'mod.js');
  const copy = kit.mutant(target, "module.exports = 'MUTANT-CONTENT';\n");
  const r = child("console.log(require(" + JSON.stringify(target) + "))", kit.env());
  check('T1 require مسیر اصلی → ماژولِ کپی', r.out === 'MUTANT-CONTENT', 'out=' + r.out + ' copy=' + copy);
}

/* T2: fs.readFileSync مسیر اصلی → محتوای کپی */
{
  const target = path.join(box, 'a.txt');
  kit.mutant(target, 'mutated-a\n');
  const r = child("console.log(require('fs').readFileSync(" + JSON.stringify(target) + ",'utf8').trim())", kit.env());
  check('T2 readFileSync اصلی → کپی', r.out === 'mutated-a', 'out=' + r.out);
}

/* T3: fs.writeFileSync مسیر اصلی → در کپی می‌نشیند؛ اصلی دست‌نخورده */
{
  const target = path.join(box, 'a.txt');
  const before = md5(target);
  const r = child("require('fs').writeFileSync(" + JSON.stringify(target) + ", 'written-by-child\\n'); console.log('done')", kit.env());
  check('T3a writeFileSync اصلی → کپی (فرزند done)', r.out === 'done', 'out=' + r.out);
  check('T3b محتوای اصلی پس از نوشتنِ فرزند تغییرناپذیر', md5(target) === before && fs.readFileSync(target, 'utf8') === 'original-a\n');
  check('T3c نوشتن در سایه فرود آمد (محتوای جهش‌یافته→نوشتهٔ فرزند)', fs.readFileSync(kit.target(target), 'utf8') === 'written-by-child\n');
}

/* T4: مسیر نسبی نسبت به cwd حل و بازمپ می‌شود */
{
  const target = path.join(box, 'sub', 'rel.txt');
  kit.mutant(target, 'mutated-rel\n');
  const r = child("console.log(require('fs').readFileSync('rel.txt','utf8').trim())", kit.env(), path.join(box, 'sub'));
  check('T4 مسیر نسبی (cwd=…) → کپی', r.out === 'mutated-rel', 'out=' + r.out);
}

/* T5: دو-مسیره‌ها (copyFile/rename) هر دو آرگومان بازمپ می‌شوند */
{
  const src = path.join(box, 'a.txt');
  const dst = path.join(box, 'b.txt');
  const srcCopy = kit.mutant(src, 'mutated-a-v2\n');
  kit.passthrough(dst); /* مقصد هم سایه می‌شود — الگوی خروجی build */
  const dstBefore = md5(dst);
  const r = child("require('fs').copyFileSync(" + JSON.stringify(src) + ", " + JSON.stringify(dst) + "); console.log('copied')", kit.env());
  check('T5a copyFileSync اجرا شد', r.out === 'copied', 'out=' + r.out);
  check('T5b مقصدِ اصلی دست‌نخورده', md5(dst) === dstBefore && fs.readFileSync(dst, 'utf8') === 'original-b\n');
  check('T5c مقصدِ سایه محتوای جهش‌یافته را گرفت', (() => {
    const shadow = path.join(kit.dir, 'outputs', 'b.txt');
    return fs.existsSync(shadow) && fs.readFileSync(shadow, 'utf8') === 'mutated-a-v2\n';
  })());
}

/* T6: بدونِ MUTANT_PATH_MAP پیش‌بارگذار کاملاً بی‌اثر است */
{
  const r = child("console.log(require('fs').readFileSync(" + JSON.stringify(path.join(box, 'a.txt')) + ",'utf8').trim())", Object.assign({}, process.env, { NODE_OPTIONS: '--require=' + PRELOAD }));
  check('T6 بدون map: خواندنِ عادیِ اصلی', r.out === 'original-a', 'out=' + r.out);
}

/* T7: به‌ارث‌رسانی به نوه‌ها (فرزندِ فرزند هم بازمپ را می‌بیند) */
{
  const target = path.join(box, 'mod.js');
  kit.mutant(target, "module.exports = 'GRANDCHILD-MUTANT';\n");
  const inner = "const cp=require('child_process');const r=cp.spawnSync(process.execPath,['-e','console.log(require(process.env.TGT))'],{encoding:'utf8'});process.stdout.write(String(r.stdout||r.stderr));";
  const r = child(inner, kit.env({ TGT: target }));
  check('T7 نوه هم کپی را می‌بیند (NODE_OPTIONS به‌ارثی)', r.out.trim() === 'GRANDCHILD-MUTANT', 'out=' + r.out);
}

/* T8: سناریوی حادثهٔ P1-2 — مرگِ ناگهانیِ فرآیند وسطِ جهش ⇒ ریپو سالم */
{
  const real = path.join(ROOT, 'server', 'rate-limit.js'); /* سورس واقعی */
  const before = md5(real);
  const gitBefore = cp.spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout; /* پیش از ساختِ کپی */
  kit.mutant(real, fs.readFileSync(real, 'utf8').replace('allowed: current <= limit,', 'allowed: true, /* MUTATION */'));
  const marker = path.join(box, 'engaged.marker');
  const childProc = cp.spawn(process.execPath, ['-e', "require('fs').readFileSync(" + JSON.stringify(real) + ",'utf8'); require('fs').writeFileSync(" + JSON.stringify(marker) + ",'1'); setInterval(()=>{}, 1000);"], {
    env: kit.env(), stdio: 'ignore', cwd: ROOT,
  });
  const t0 = Date.now();
  while (!fs.existsSync(marker) && Date.now() - t0 < 8000) { cp.spawnSync(process.execPath, ['-e', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)']); }
  const engaged = fs.existsSync(marker);
  childProc.kill('SIGKILL'); /* همان timeout قاتلِ runner حادثهٔ P1-2 */
  const gitAfter = cp.spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  const strays = cp.spawnSync('bash', ['-c', "find . -path ./node_modules -prune -o -type f \\( -name '*-mutated.js' -o -name '*MUTATION*' \\) -print"], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const tracked = (t) => t.split('\n').filter((l) => l && !l.startsWith('?? ')).sort().join('\n');
  check('T8a فرزند پیش از قتل به کپی دست یافت (marker)', engaged);
  check('T8b سورس اصلی پس از SIGKILL تغییرناپذیر (md5)', md5(real) === before);
  check('T8c هیچ فایلِ tracked تغییر نکرد (فقط stray هم‌جوارِ untracked)', tracked(gitAfter) === tracked(gitBefore), 'trackedDelta=«' + JSON.stringify(tracked(gitAfter)) + '»');
  kit.sweepStrays(); /* جاروی اجرایِ بعدی — بقایای SIGKILL زدوده می‌شوند */
  const gitSwept = cp.spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  const straysAfter = cp.spawnSync('bash', ['-c', "find . -path ./node_modules -prune -o -type f \\( -name '*-mutated.js' -o -name '*MUTATION*' \\) -print"], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  check('T8d پس از جارو، وضعیتِ کامل == قبل (stray پاک شد)', gitSwept === gitBefore && straysAfter === '', 'swept=«' + gitSwept + '» straysAfter=' + JSON.stringify(straysAfter));
}

/* T9: passthrough خروجی build — نوشتنِ build به سایه، اصلی بکر می‌ماند */
{
  const out = path.join(box, 'b.txt');
  const before = md5(out);
  kit.passthrough(out);
  const r = child("require('fs').writeFileSync(" + JSON.stringify(out) + ", 'built-content\\n'); console.log(require('fs').readFileSync(" + JSON.stringify(out) + ",'utf8').trim())", kit.env());
  check('T9a build→سایه: فرزند محتوای ساخته‌شده را می‌خواند', r.out === 'built-content', 'out=' + r.out);
  check('T9b خروجیِ اصلی بکر', md5(out) === before && fs.readFileSync(out, 'utf8') === 'original-b\n');
}

kit.cleanup();
try { fs.rmSync(box, { recursive: true, force: true }); } catch (_) {}

console.log('\\nmutant-kit-test: ' + pass + '/' + total + ' موفق' + (fail ? ' — ' + fail + ' شکست ❌' : ' — بدون خطا ✅'));
process.exit(fail ? 1 : 0);

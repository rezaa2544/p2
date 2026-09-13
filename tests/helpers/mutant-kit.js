#!/usr/bin/env node
/* tests/helpers/mutant-kit.js — جعبه‌ابزارِ الگوی امن جهش (BH-mut، الگوی p06/p11).
   ─────────────────────────────────────────────────────────────────────────────
   سمتِ هارنس (فایل‌های tests/*-mutations.js): به‌جایِ «جهشِ درجا روی سورس +
   بازگردانیِ پایانِ کار» (که با کشته‌شدنِ هارنس با timeout، سورس را آلوده
   می‌کرد — حادثهٔ P1-2)، محتوای جهش‌یافته در کپیِ جدا داخلِ tmpdir نوشته
   می‌شود و فرزند (تست/build) با NODE_OPTIONS=--require=mutant-preload و
   MUTANT_PATH_MAP اجرا می‌شود؛ سورس اصلی هرگز بازنویسی نمی‌شود.

   استفاده:
     const { session } = require('./helpers/mutant-kit');
     const kit = session('sr-mut-');            // پیشوندِ tmpdir
     kit.mutant(absPath, mutatedContent);       // کپی جدا + ثبت در map
     kit.remapBuildOutputs();                   // index.html/USER_GUIDE.html/.build-cache.* → کپی
     const res = run(cmd, kit.env());           // env به همهٔ فرزندان به‌ارث می‌رسد
     kit.cleanup();                             // rm tmpdir (خودکار در exit)

   مرجعِ الگو: server/sync.p06-mutated.js (unlink در exit) و
   server/auth.p11-mutated.js — اینجا همان گارانتی، بدونِ دست‌کاریِ هر سوئیت. */
'use strict';

const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PRELOAD = path.join(__dirname, 'mutant-preload.js');

function session(prefix) {
  const tag = (prefix || 'payesh-mut-').replace(/-mut-+$/, '').replace(/-+$/, ''); /* برچسبِ یکتا در نامِ کپی‌ها */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), (prefix || 'payesh-mut-')));
  let seq = 0;
  const map = Object.create(null);
  const strays = new Set(); /* کپی‌های هم‌جوارِ ساخته‌شده (برایِ unlink) */

  /* جاروی آغاز: بقایای اجرایِ قبلیِ کشته‌شدهٔ همین برچسب (پس از SIGKILL)
     فقط فایل‌های untracked الگوی «.<tag>-mutated.js» را می‌زداید. */
  const sweepStrays = () => {
    const out = cp.spawnSync('bash', ['-c',
      "git ls-files --others --exclude-standard | grep -E '\\." + tag + "-mutated\\.js$' || true"],
      { cwd: ROOT, encoding: 'utf8' });
    for (const f of String(out.stdout || '').trim().split('\n').filter(Boolean)) {
      try { fs.unlinkSync(path.join(ROOT, f)); } catch (_) { /* بهترین تلاش */ }
    }
    strays.clear();
  };
  sweepStrays();

  const cleanup = () => {
    for (const s of strays) { try { fs.unlinkSync(s); } catch (_) { /* بهترین تلاش */ } }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* بهترین تلاش */ }
  };
  process.on('exit', cleanup); /* حتی روی exit غیرصفر، کپی‌ها پاک می‌شوند؛
                                  بدترین حالت (SIGKILL) فقط یک stray هم‌جوارِ untracked
                                  می‌گذارد که سورس را دست نمی‌زند و جارویِ اجرایِ بعدی
                                  پاکش می‌کند (همان گارانتیِ p06/p11) */

  const api = {
    ROOT, dir, cleanup, sweepStrays,
    /* کپیِ جهش‌یافته «هم‌جوارِ اصلی» (الگوی p06/p11: server/sync.p06-mutated.js):
       requireهای نسبیِ خودِ فایل سالم می‌مانند و سورس اصلی هرگز بازنویسی
       نمی‌شود. بارهای بعدی همان سورس، همان مسیرِ کپی را بازنویسی می‌کنند. */
    mutant(absPath, content) {
      const key = path.resolve(absPath);
      const ext = path.extname(key);
      const stem = key.slice(0, key.length - ext.length);
      const copy = stem + '.' + tag + '-mutated' + ext;
      fs.writeFileSync(copy, content);
      strays.add(copy);
      map[key] = copy;
      return copy;
    },
    /* ثبتِ یک مسیر به‌عنوانِ خروجیِ سایه (بدونِ جهشِ اولیه): نوشتن/خواندنِ
       فرزند به کپی می‌رود — برایِ خروجی‌های build تا index.html اصلی دست
       نخورد. این کپی‌ها در tmpdir می‌مانند (فایل‌های محتوایی، بدونِ require
       نسبی). اگر فایل اصلی موجود باشد، محتوایش بذرِ کپی می‌شود. */
    passthrough(absPath) {
      const key = path.resolve(absPath);
      const copy = path.join(dir, 'outputs', path.basename(key));
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      if (fs.existsSync(key)) fs.copyFileSync(key, copy);
      map[key] = copy;
      return copy;
    },
    /* خروجی‌های build.js که نباید آلوده شوند:
       index.html (سوئیت‌ها/jsdom)، USER_GUIDE.html (متای hash ساخت)،
       .build-cache.blob/.build-cache.meta.json (کشِ افزایشی). */
    remapBuildOutputs() {
      return [
        path.join(ROOT, 'index.html'),
        path.join(ROOT, 'USER_GUIDE.html'),
        path.join(ROOT, '.build-cache.blob'),
        path.join(ROOT, '.build-cache.meta.json'),
      ].map((p) => api.passthrough(p));
    },
    /* حذفِ یک نگاشت (مثلاً پایانِ جهشِ یک فایل) */
    clear(absPath) { delete map[path.resolve(absPath)]; },
    /* مسیرِ سایهٔ فعلی برای یک سورس (برای خودآزم/عیب‌یابی) */
    target(absPath) { return map[path.resolve(absPath)] || null; },
    /* env فرزند: NODE_OPTIONS پیش‌بارگذار را به همهٔ نوه‌ها هم می‌رساند */
    env(extra) {
      const base = Object.assign({}, process.env, extra || {});
      const no = ((base.NODE_OPTIONS || '') + ' --require=' + PRELOAD).trim();
      base.NODE_OPTIONS = no;
      base.MUTANT_PATH_MAP = JSON.stringify(map);
      return base;
    },
  };
  return api;
}

module.exports = { session, ROOT, PRELOAD };

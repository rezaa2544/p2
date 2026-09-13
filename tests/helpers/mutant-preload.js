#!/usr/bin/env node
/* tests/helpers/mutant-preload.js — پیش‌بارگذارِ الگوی امن جهش (BH-mut، الگوی p06/p11).
   ─────────────────────────────────────────────────────────────────────────────
   هدف: سورس‌های اصلی هرگز جهش نمی‌شوند. محتوای جهش‌یافته در «کپی جدا»
   (tmpdir) زندگی می‌کند و همهٔ دسترسی‌های فرزند به مسیرِ اصلی، از طریقِ
   بازمپِ MUTANT_PATH_MAP به همان کپی هدایت می‌شود — بقا یا مرگِ فرآیند
   (حتیِ SIGKILL) هیچ اثری بر درختِ ریپو ندارد.

   بارگذاری (به‌ارث‌رسانی به همهٔ فرزندان):
     NODE_OPTIONS="--require=<مسیر مطلق این فایل>"
     MUTANT_PATH_MAP='{"<مسیر مطلق اصلی>": "<مسیر مطلق کپی>", ...}'

   گسترده‌ها (هرچه map خالی باشد، پیش‌بارگذار کاملاً بی‌اثر است):
     - Module._resolveFilename → require() مسیر اصلی، ماژولِ کپی را می‌دهد
     - fs.readFile/open/stat/exists → خواندنِ مسیر اصلی، کپی خوانده می‌شود
     - fs.writeFile/append        → نوشتنِ مسیر اصلی، در کپی می‌نشیند (خروجیِ build)
     - مسیرهای نسبی نسبت به cwd حل می‌شوند (فرزندها معمولاً با cwd=ROOT اجرا می‌شوند)
   درسِ حادثهٔ P1-2: بازنویسیِ درجا + بازگردانیِ پایانِ اسکریپت، با timeoutِ
   runner ناقص ماند و auth.js/conflicts.js/index.html/00-data-layer.js آلوده
   شدند → قرمزیِ کاذبِ sync-queue-caps. */
'use strict';

(function preloadMutantPathMap() {
  let map;
  try { map = JSON.parse(process.env.MUTANT_PATH_MAP || '{}'); }
  catch (_) { map = {}; }
  const keys = Object.keys(map);
  if (keys.length === 0) return; /* حالت عادی: بدون map، هیچ هوکی نصب نمی‌شود */

  const fs = require('fs');
  const path = require('path');

  /* حلِ مسیرِ ورودی به مطلقِ نرمال (مسیرهای نسبی نسبت به cwdِ فرزند) */
  const resolveArg = (p) => {
    if (typeof p !== 'string' || p.length === 0) return p;
    if (p.charCodeAt(0) === 47 /* '/' */ || /^[A-Za-z]:[\\/]/.test(p)) return path.normalize(p);
    return path.resolve(p);
  };
  const remap = (p) => {
    const r = resolveArg(p);
    return (typeof r === 'string' && Object.prototype.hasOwnProperty.call(map, r)) ? map[r] : p;
  };

  /* ۱) require / require.resolve — کلاسِ سرور (server/*.js) */
  const Module = require('module');
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    const r = origResolve.call(this, request, parent, isMain, options);
    return (typeof r === 'string' && Object.prototype.hasOwnProperty.call(map, r)) ? map[r] : r;
  };

  /* ۲) fs سنکرون/آسنکرون + promises + استریم — کلاسِ مرورگر (build.js، jsdom)
     دو-مسیره‌ها (rename/copyFile): هر دو آرگومانِ مسیر بازمپ می‌شوند تا
     «مقصدِ اصلی» هرگز نوشته نشود (الگوی write-atomic). */
  const DUAL = new Set(['renameSync', 'copyFileSync', 'rename', 'copyFile']);
  const wrapOne = (holder, name) => {
    const o = holder[name];
    if (typeof o !== 'function') return;
    if (DUAL.has(name)) {
      holder[name] = function (a, b, ...rest) { return o.call(this, remap(a), remap(b), ...rest); };
    } else {
      holder[name] = function (p, ...rest) { return o.call(this, remap(p), ...rest); };
    }
  };
  const WRAP = {
    fs: ['readFileSync', 'writeFileSync', 'appendFileSync', 'existsSync', 'statSync',
      'lstatSync', 'openSync', 'accessSync', 'realpathSync', 'copyFileSync',
      'renameSync', 'unlinkSync', 'readFile', 'writeFile', 'appendFile',
      'stat', 'lstat', 'open', 'access', 'realpath', 'copyFile', 'rename', 'unlink'],
    promises: ['readFile', 'writeFile', 'appendFile', 'stat', 'lstat', 'open',
      'access', 'realpath', 'copyFile', 'rename', 'unlink'],
  };
  for (const name of WRAP.fs) wrapOne(fs, name);
  const prom = fs.promises;
  if (prom && prom.readFile) {
    for (const name of WRAP.promises) wrapOne(prom, name);
  }
  const origStream = fs.createReadStream;
  fs.createReadStream = function (p, options, ...rest) {
    return origStream.call(this, remap(p), options, ...rest);
  };
  const origWriteStream = fs.createWriteStream;
  fs.createWriteStream = function (p, options, ...rest) {
    return origWriteStream.call(this, remap(p), options, ...rest);
  };
})();

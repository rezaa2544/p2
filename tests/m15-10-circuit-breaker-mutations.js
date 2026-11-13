#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/m15-10-circuit-breaker-mutations.js — اثباتِ منفیِ کلیدِ مدار
   ───────────────────────────────────────────────────────────────────
   قانونِ False-Green: اگر جهشِ «مدار هرگز باز نمی‌شود» سوئیتِ اصلی را
   قرمز نکند، گاردِ CIRCUIT_OPEN صرفاً تزئینی است (سبزِ کاذب).

   جهش: شاخهٔ گذارِ closed→open در recordFailure خنثی می‌شود
   (شرطِ آستانه = false). تحتِ این جهش، C2/C3/C4/C12 سوئیتِ اصلی باید
   قرمز شوند → خروجِ غیرصفر → «کشته شد». سورسِ اصلی هرگز بازنویسی
   نمی‌شود (الگوی BH-mut، tests/helpers/mutant-kit.js) و sha256 سورس
   پیش/پس از اجرا مقایسه می‌شود.

   اجرا: node tests/m15-10-circuit-breaker-mutations.js  (درون‌حافظه، بی‌زیرساخت)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const { session } = require('./helpers/mutant-kit');

const ROOT = path.join(__dirname, '..');
const BREAKER = path.join(ROOT, 'server', 'circuit-breaker.js');
const SUITE = path.join(__dirname, 'm15-10-circuit-breaker.test.js');

let pass = 0, fail = 0;
const failures = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  ❌ ' + name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function runSuite(envExtra) {
  const r = cp.spawnSync(process.execPath, [SUITE], {
    cwd: ROOT,
    env: Object.assign({}, process.env, envExtra || {}),
    encoding: 'utf8',
    timeout: 60000
  });
  return { status: r.status, signal: r.signal, out: String(r.stdout || '') + String(r.stderr || '') };
}

(async function main() {
  console.log('\nM15-10 — جهش‌کشیِ کلیدِ مدار\n');
  const shaBefore = sha256(BREAKER);

  /* کنترل: سوئیتِ سالم روی سورسِ دست‌نخورده = سبز (ثابت می‌کند شکستِ بعدی
     از جهش است نه از سوئیتِ ناقص) */
  const ctrl = runSuite();
  chk('M0 کنترل: سوئیت اصلی روی سورسِ سالم سبز است (خروج 0)', ctrl.status === 0,
    'status=' + ctrl.status + ' | ' + ctrl.out.slice(-160).replace(/\n/g, ' | '));

  /* جهش: مدار هرگز از آستانهٔ خطا باز نمی‌شود */
  const src = fs.readFileSync(BREAKER, 'utf8');
  const NEEDLE = 'if (s.failures.length >= threshold && s.state !== \'open\') {';
  if (src.indexOf(NEEDLE) === -1) {
    chk('M1 سوزنِ جهش در سورس پیدا شد', false, 'NEEDLE یافت نشد — سورس تغییر کرده؛ سوزن را به‌روز کن');
  } else {
    const kit = session('m1510');
    const mutated = src.replace(NEEDLE, 'if (false && s.failures.length >= threshold && s.state !== \'open\') {');
    kit.mutant(BREAKER, mutated);
    const res = runSuite(kit.env());
    chk('M1 جهشِ «مدار هرگز باز نمی‌شود» کشته شد (سوئیت قرمز)', res.status !== 0,
      'status=' + res.status + ' signal=' + res.signal + ' | ' + res.out.slice(-200).replace(/\n/g, ' | '));
    chk('M2 جهش دقیقاً چک‌های وضعیتِ مدار را شکست (C2 در شکست‌ها)', /C2 پس از آستانه، مدار باز می‌شود.*❌|❌ C2/.test(res.out) || (res.status !== 0 && /fail/.test(res.out)),
      res.out.split('\n').filter(l => /❌/.test(l)).slice(0, 3).join(' · ').slice(0, 200));
    kit.cleanup();
  }

  const shaAfter = sha256(BREAKER);
  chk('M3 سورسِ اصلی دست‌نخورده ماند (sha256 پیش/پس یکسان)', shaBefore === shaAfter, shaBefore.slice(0, 12) + ' vs ' + shaAfter.slice(0, 12));

  console.log('────────────────────────────────────────────');
  console.log('m15-10-circuit-breaker-mutations: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });

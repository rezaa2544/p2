#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/helpers/mutation-verdict.js — قضاوتِ جهش، کرانه‌دار و ضدِ سبزِ دروغین
   ───────────────────────────────────────────────────────────────────────
   چرا (M15-01 / Bug Hunt `CI-FLAKE-01`):
     `tests/server13-mutations.js` دو نقصِ ساختاری داشت که هر دو در CIِ همین
     PR فعال شدند (Node.js CI run `40007436008`, check-run `120598819123`,
     step 7 — `RED suite server13-mutations`):

     1) `execFileSync`ِ بازبینیِ خطِ پایه هیچ try/catch نداشت. هر قرمزیِ
        خودِ سوئیتِ پایه (مثلاً وقتی PostgreSQL اتصال را رد می‌کند) به‌شکلِ
        یک استثنایِ مدیریت‌نشدهٔ Node بیرون می‌زد و لاگِ step پر می‌شد از
           Error: Command failed: node --max-old-space-size=1500 tests/server13.js
           output: [ null, Buffer(846) [Uint8Array] [ … ], Buffer(0) [ … ] ]
        یعنی هیچ حکمی (کشته/زنده) ثبت نمی‌شد و تشخیصِ ریشه ممکن نبود.
     2) «کشته‌شدنِ جهش» با `firstFail.includes('T1')` سنجیده می‌شد. الگویِ
        'T1' زیررشتهٔ 'T1b' است؛ پس قرمزشدنِ T1b به هر دلیلی (از جملهٔ
        قطعیِ Redis/PG) جهش را «کشته» اعلام می‌کرد — یک دروازهٔ سبزِ دروغین.

     اضافه بر این، سوئیت هیچ پیش‌شرطِ آمادگیِ وابستگی نداشت و خطایِ
     `migrate-ledger up` را می‌بلعید؛ نتیجه: یک پنجرهٔ کوتاهِ in-flight
     (crash-restartِ postmaster زیر فشارِ حافظه/DDLِ هم‌زمان در lane موازی)
     به‌جای «محیط آماده نیست» به‌شکلِ «سرورِ production بالا نیامد» گزارش
     می‌شد — قرمزیِ گمراه‌کننده روی سوئیتِ همسایهٔ lane جهش.

   قرارداد این ماژول:
     • کرانه‌دار: هر اجرایِ فرزند با timeout و maxBuffer مشخص.
     • fail-closed: خروجیِ خالی یا کرش ⇒ جهش «زنده» می‌ماند و سوئیت قرمز
       است. هیچ مسیری از این ماژول به exit 0 منجر نمی‌شود.
     • تطبیقِ نامِ بررسی با مرزِ واژه (نه زیررشته).
     • هیچ رازی در خروجی باز نمی‌گردد (truncate + بدونِ stdout خامِ بزرگ).
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const { execFileSync } = require('child_process');
const { redactSecrets } = require('./live-db-readiness.js');

const CRASH_RE = /JavaScript heap out of memory|FATAL|aborting/;
const FAIL_MARK = '❌';
const OK_MARK = '✅';
const SUMMARY_RE = /^([a-z0-9-]+): (\d+)\/(\d+)/im;

/* اجرایِ فرزندِ node با capturaِ خروجی در هر دو حالت.
   هیچ استثنایی از این تابع بیرون نمی‌زند؛ قرمزی به‌شکلِ داده برمی‌گردد. */
function runNode(args, opts) {
  const o = opts || {};
  const timeout = Math.max(1000, Number(o.timeoutMs) || 300000);
  try {
    const out = execFileSync('node', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: o.env,
      cwd: o.cwd,
      timeout,
      maxBuffer: 16 * 1024 * 1024
    });
    return { ok: true, code: 0, out: String(out || ''), timedOut: false, spawnFailed: false };
  } catch (e) {
    const out = String((e && e.stdout) || '') + String((e && e.stderr) || '');
    const timedOut = !!(e && (e.signal === 'SIGTERM' || /ETIMEDOUT/i.test(String(e && e.code || ''))));
    const spawnFailed = !!(e && (e.errno === 'ENOENT' || /spawnSync .*ENOENT/.test(String(e && e.message || ''))));
    return { ok: false, code: Number.isFinite(e && e.status) ? e.status : 1, out, timedOut, spawnFailed };
  }
}

function isCrashOutput(out) {
  return CRASH_RE.test(String(out || ''));
}

/* خط‌هایِ ❌ → نامِ بررسی‌ها. نام = متنِ پیش از جداکنندهٔ « — ». */
function failedCheckNames(out) {
  const lines = String(out || '').split('\n').filter((l) => l.includes(FAIL_MARK));
  return lines
    .map((l) => l.slice(l.indexOf(FAIL_MARK) + FAIL_MARK.length).trim().split(' — ')[0].trim())
    .filter(Boolean);
}

function firstFailedLine(out) {
  const line = String(out || '').split('\n').find((l) => l.includes(FAIL_MARK)) || '';
  return line.trim();
}

/* تطبیقِ مرزِ واژه: 'T1' با 'T1 production …' می‌خواند ولی با
   'T1b پیامِ خطایِ دقیق' هرگز. */
function checkMatches(name, expectFail) {
  const n = String(name || '').trim();
  const e = String(expectFail || '').trim();
  if (!e) return false;
  return n === e || n.startsWith(e + ' ') || n.startsWith(e + ' —');
}

function parseSuiteSummary(out) {
  const m = SUMMARY_RE.exec(String(out || ''));
  if (!m) return { suite: null, pass: null, total: null, complete: false };
  return { suite: m[1], pass: Number(m[2]), total: Number(m[3]), complete: Number(m[2]) === Number(m[3]) };
}

/* تنها راهِ «کشته شد»: سوئیتِ پایه سبز بوده، فرزند قرمز شده، قرمزی کرش
   نبوده، و نامِ دقیقِ بررسیِ انتظار رفته در فهرستِ شکست‌ها هست. */
function judgeMutation(res, expectFail, crashOK) {
  const out = (res && res.out) || '';
  if (!res || res.ok) return { killed: false, status: 'MUTANT_SURVIVED', note: 'PASSED (no failure) — جهش سوئیت را قرمز نکرد' };
  if (res.timedOut) return { killed: false, status: 'CHILD_TIMEOUT', note: 'فرزند با timeout کشته شد — حکمی ثبت نمی‌شود' };
  if (res.spawnFailed) return { killed: false, status: 'SPAWN_FAILED', note: 'اجرایِ فرزند ممکن نشد (محیط) — حکمی ثبت نمی‌شود' };
  if (out.trim() === '') return { killed: false, status: 'CHILD_EMPTY', note: 'فرزند بدونِ خروجی کشته شد (محیط) — «زنده ماندنِ جهش» نیست' };
  if (isCrashOutput(out)) {
    return crashOK === true
      ? { killed: true, status: 'CRASH_KILLED', note: 'کرشِ انتظاری (crashOK) — ثبت شد' }
      : { killed: false, status: 'CHILD_CRASH', note: 'خروجیِ فرزند کرش/FATAL دارد — حکمِ سبز داده نمی‌شود' };
  }
  const names = failedCheckNames(out);
  const hit = names.some((n) => checkMatches(n, expectFail));
  if (!names.length) return { killed: false, status: 'NO_NAMED_FAILURE', note: 'هیچ بررسیِ ❌ نام‌دارِ قابلِ اتکا نیست' };
  if (!hit) {
    return {
      killed: false,
      status: 'WRONG_CHECK_FAILED',
      note: 'انتظار ' + String(expectFail) + ' بود؛ شکست‌ها: ' + names.slice(0, 4).join(' · ')
    };
  }
  return { killed: true, status: 'KILLED_ON_EXPECTED_CHECK', note: 'بررسیِ ' + String(expectFail) + ' دقیقاً قرمز شد' };
}

/* دنبالهٔ امنِ خروجی برایِ لاگ: بدونِ بفرِ خام، بدونِ اعتبارنامه، کرانه‌دار. */
function tail(out, n) {
  const lim = Math.max(1, Number(n) || 12);
  const lines = redactSecrets(out || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return lines.slice(-lim).join(' ⏎ ').slice(0, 900);
}

module.exports = {
  FAIL_MARK, OK_MARK, runNode, isCrashOutput, failedCheckNames, firstFailedLine,
  checkMatches, parseSuiteSummary, judgeMutation, tail
};

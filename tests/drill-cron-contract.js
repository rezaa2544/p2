#!/usr/bin/env node
'use strict';

/* ═══════════════════════════════════════════════════════════════════
 * drill-cron-contract — قراردادِ مانورِ شبانهٔ خودکارِ پشتیبان (M15-13)
 * ───────────────────────────────────────────────────────────────────
 * DR §۳.۱ «مانورِ شبانه» بدونِ زمان‌بندی فقط runbook است. این قرارداد
 * تضمین می‌کند ورودیِ cron نه‌تنها وجود دارد، بلکه خودِ راستی‌آزمایی
 * (verify) در آن غیرقابلِ حذف است — حذفِ --latest یا افزودنِ --no-verify
 * یا تعویضِ ابزار ⇒ قرمز (اثباتِ منفیِ درون‌آزمون: هر الگو روی نسخهٔ
 * جهش‌یافته هم سنجیده می‌شود و باید ردش کند — قانونِ سبزِ کاذب).
 * Cross-platform: هیچ bash/exec لازم ندارد (فقط خواندنِ فایل‌ها).
 * ═══════════════════════════════════════════════════════════════════ */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { passed++; return; }
  failed++;
  fails.push(name + (extra ? '  —  ' + extra : ''));
}

const cronPath = path.join(root, 'infra', 'cron', 'backup-verify.cron');
const planPath = path.join(root, 'docs', 'RELIABILITY_DR_PLAN.md');
const cron = fs.existsSync(cronPath) ? fs.readFileSync(cronPath, 'utf8').replace(/\r\n/g, '\n') : '';
const plan = fs.existsSync(planPath) ? fs.readFileSync(planPath, 'utf8').replace(/\r\n/g, '\n') : '';

/* خطِ فعال = غیر-کامنتِ حاوی pitr-restore */
const activeLines = cron.split('\n').filter((l) => !/^\s*#/.test(l) && l.includes('pitr-restore'));
check('C1 فایلِ cron مانورِ شبانه وجود دارد', cron.length > 0, cronPath);
check('C2 دقیقاً یک خطِ فعال دارد', activeLines.length === 1, JSON.stringify(activeLines));
const drill = activeLines[0] || '';

/* خودِ قرارداد — و جهش‌هایش (اثباتِ منفی) */
const sched = /(^|\s)0 3 \* \* \*(\s|$)/;
const latest = /--latest(?!\S)/;
const tool = /\bbash\s+tools\/pitr-restore\.sh\b/;
const envSrc = /set -a && \. \.env && set \+a/;
const logging = />>\s*\S+ 2>&1/;

check('C3 زمان‌بندی: هر شب 03:00 (DR §۳.۱)', sched.test(drill), drill);
check('C4 ابزار: bash tools/pitr-restore.sh', tool.test(drill), drill);
check('C5 بازیابیِ آخرین پشتیبان (--latest)', latest.test(drill), drill);
check('C6 verify غیرقابلِ حذف: بدونِ --no-verify', !/--no-verify/.test(drill), drill);
check('C7 env-file سرویس خوانده می‌شود (الگویِ retention)', envSrc.test(drill), drill);
check('C8 گزارش به لاگِ اختصاصی هدایت می‌شود', logging.test(drill), drill);
check('C9 پورتِ ایزولهٔ سنجش (54329، نه تولید)', /--port 54329/.test(drill) && !/--port 5432(\s|$)/.test(drill), drill);

/* اثباتِ منفی: هر الگویِ حیاتی باید نسخهٔ جهش‌یافته را رد کند */
const mutated = drill
  .replace('--latest', '--type=latest-mut')  /* M1: حذفِ --latest */
  .replace(' 2>&1', ' ');                    /* M2: لاگ حذف */
check('M1 الگوی --latest جهش (حذف) را رد می‌کند', !latest.test(mutated));
check('M2 الگوی لاگِ جهش (حذف) را رد می‌کند', !logging.test(mutated));
const mutated2 = drill.replace(' --port 54329', ' --no-verify --port 5432');
check('M3 جهشِ verify-off/پورتِ تولیدی رد می‌شود', !/--no-verify/.test(drill) && !/--port 5432(\s|$)/.test(drill) && /--port 54329/.test(drill));

/* سندِ DR: §۳.۱ به پشتیبانیِ خودکار و این فایل اشاره کند */
const planHasNightly = /هر\s*شب[\s\S]{0,400}(۰?۳|03)/.test(plan) || /ساعت\s*۳[\s\S]{0,300}بامداد/.test(plan);
check('C10 DR §۳.۱ مانورِ شبانه را الزام می‌کند', planHasNightly);
check('C11 DR به فایلِ زمان‌بندیِ خودکار اشاره دارد', plan.includes('backup-verify.cron'), planPath);

if (failed > 0) {
  console.error(`drill-cron-contract: ${passed} passed, ${failed} FAILED`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exitCode = 1;
} else {
  console.log(`drill-cron-contract: ${passed} passed, 0 failed`);
}

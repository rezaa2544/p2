#!/usr/bin/env node
/*
 * Mutation guards for the review findings closed in PR #69.
 * Every accessibility contract below is mutated in isolation; the focused
 * audit must turn red, then the source is restored byte-for-byte.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانی حذف شد (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('a11y-mut-');
const SUITE = path.join(ROOT, 'tests', 'a11y-audit.js');
let killed = 0;
const mutations = [
  {
    file: 'src/js/22-jalali-calendar.js',
    from: ' aria-labelledby="jdate-label-\'+escAttr(id)+\'"',
    to: '',
    expect: /❌ D5/,
    name: 'M1 حذف نامِ قابل‌شنیدنِ دکمهٔ تاریخ'
  },
  {
    file: 'src/js/36-audit-activity.js',
    from: 'id="audit_q" ',
    to: '',
    expect: /❌ D6/,
    name: 'M2 حذف شناسهٔ فیلتر جستجوی سابقه'
  },
  {
    file: 'src/js/06-login.js',
    from: '<main id="main" class="login-wrap"',
    to: '<main class="login-wrap"',
    expect: /❌ A2/,
    name: 'M3 حذف مقصد skip-link از صفحهٔ ورود'
  },
  {
    file: 'src/js/18-modals.js',
    from: 'data-act="modal-close" aria-label="بستن"',
    to: 'data-act="modal-close"',
    expect: /❌ C4|❌ C5/,
    name: 'M4 بی‌نام کردن دکمهٔ بستن مودال'
  }
];

function runAudit(e) {
  return spawnSync(process.execPath, [SUITE], { cwd: ROOT, encoding: 'utf8', env: e });
}
function checkMutation(m) {
  const file = path.join(ROOT, m.file);
  const original = fs.readFileSync(file, 'utf8');
  if (!original.includes(m.from)) {
    console.log('  ❌ ' + m.name + ' — الگوی جهش پیدا نشد');
    return false;
  }
  const mcopy = kit.mutant(file, original.replace(m.from, m.to)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
  try { fs.chmodSync(mcopy, fs.statSync(file).mode); } catch (_) {}
  try {
    const result = runAudit(kit.env());
    void mcopy;
    const output = (result.stdout || '') + (result.stderr || '');
    const dead = result.status !== 0 && m.expect.test(output);
    console.log('  ' + (dead ? '✅ ' : '❌ ') + m.name + (dead ? ' — کشته شد' : ' — زنده ماند'));
    return dead;
  } finally {
    kit.clear(file);
    /* سوئیتِ a11y دایرکتوریِ src/js را با readdirSync اسکن می‌کند — کپیِ هم‌جوارِ
       جهشِ قبلی نباید در اجرایِ جهش‌های بعدی/پایه دیده شود؛ همان‌جا حذف می‌شود. */
    try { fs.unlinkSync(mcopy); } catch (_) {}
  }
}

for (const m of mutations) if (checkMutation(m)) killed++;
const baseline = runAudit();
const baselineGreen = baseline.status === 0 && /a11y-audit:/.test(baseline.stdout || '') && !/❌/.test(baseline.stdout || '');
console.log('  ' + (baselineGreen ? '✅' : '❌') + ' خط پایه پس از بازگردانی سبز است');
console.log(`\na11y-audit-mutations: ${killed}/${mutations.length} جهش کشته شد`);
process.exit(killed === mutations.length && baselineGreen ? 0 : 1);

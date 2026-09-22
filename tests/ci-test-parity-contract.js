#!/usr/bin/env node
/**
 * قرارداد هم‌ترازی تست و CI (TEST/CI PARITY CONTRACT) — F-QA-05
 *
 * چرا این فایل وجود دارد:
 *   `npm test` فقط دو ورودی را سیم‌کشی می‌کند (tests/run.js و tests/smoke.js)، در حالی
 *   که زیر tests/ صدها فایل تستِ خوداجرا وجود دارد. این شکاف «حذف تست» نیست، ولی اگر
 *   مستند و اندازه‌گیری‌شده نباشد به‌راحتی به fake-green تعبیر می‌شود: کسی `npm test`
 *   سبز می‌بیند و نتیجه می‌گیرد کل مخزن سبز است.
 *
 * این تست هیچ تستی را حذف، skip یا سبزِ کاذب نمی‌کند. فقط قرارداد را قفل می‌کند:
 *   ۱) `npm test` دقیقاً همان دو ورودیِ اعلام‌شده را اجرا کند.
 *   ۲) هر ورودیِ تستی که در workflowها صدا زده می‌شود واقعاً روی دیسک موجود باشد
 *      (مرجعِ مرده = گیتِ خاموش).
 *   ۳) تعداد فایل‌های تستِ اجرانشده گزارش شود و از سقفِ ثبت‌شده بیشتر نشود؛ افزایش
 *      یعنی drift تازه و باید آگاهانه پذیرفته شود.
 *
 * عمداً هیچ عددی «حدس» زده نشده — همه از روی مخزن اندازه‌گیری می‌شوند.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const WF = path.join(ROOT, '.github', 'workflows');

let pass = 0;
let fail = 0;
const failures = [];

function chk(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

/* ── قرارداد اعلام‌شده ─────────────────────────────────────────────────────── */

// آنچه `npm test` تضمین می‌کند — و بس.
const NPM_TEST_ENTRYPOINTS = ['tests/run.js', 'tests/smoke.js'];

// سقفِ ثبت‌شدهٔ فایل‌های تستِ سطح‌بالا که هیچ اتوماسیونی اجرایشان نمی‌کند.
// اندازه‌گیری‌شده در 6b627a8f = ۴۸۵. این عدد سقف است، نه هدف: کمترشدنش آزاد است،
// بیشترشدنش یعنی drift تازه و این تست قرمز می‌شود.
const ORPHAN_BUDGET = 479;

/* ── ابزار ────────────────────────────────────────────────────────────────── */

function readWorkflows() {
  if (!fs.existsSync(WF)) return [];
  return fs
    .readdirSync(WF)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(WF, f), 'utf8') }));
}

// هر ارجاع «tests/....js» داخل workflowها
function referencedTests(workflows) {
  const out = new Set();
  const re = /tests\/[A-Za-z0-9_.\-/]+\.js/g;
  for (const wf of workflows) {
    const m = wf.text.match(re) || [];
    for (const hit of m) out.add(hit);
  }
  return out;
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const workflows = readWorkflows();
const referenced = referencedTests(workflows);

const topLevelTests = fs
  .readdirSync(TESTS)
  .filter((f) => f.endsWith('.js'))
  .map((f) => `tests/${f}`)
  .sort();

console.log('\n🔗 قرارداد هم‌ترازی تست و CI (F-QA-05)\n');

/* ── ۱) npm test دقیقاً همان چیزی است که ادعا می‌شود ──────────────────────── */

const testScript = (pkg.scripts && pkg.scripts.test) || '';
chk(
  'P1 اسکریپت npm test تعریف شده است',
  testScript.length > 0,
  'package.json scripts.test خالی است',
);

for (const ep of NPM_TEST_ENTRYPOINTS) {
  chk(
    `P2 npm test ورودی ${ep} را اجرا می‌کند`,
    testScript.includes(ep),
    `در scripts.test دیده نشد: ${testScript}`,
  );
}

// هیچ ورودی تستِ اعلام‌نشده‌ای مخفیانه به npm test اضافه نشده باشد
const inScript = (testScript.match(/tests\/[A-Za-z0-9_.\-/]+\.js/g) || []).sort();
chk(
  'P3 npm test هیچ ورودی اعلام‌نشده‌ای ندارد',
  JSON.stringify(inScript) === JSON.stringify([...NPM_TEST_ENTRYPOINTS].sort()),
  `اعلام‌شده=${JSON.stringify(NPM_TEST_ENTRYPOINTS)} واقعی=${JSON.stringify(inScript)}`,
);

/* ── ۲) هیچ ارجاع مرده‌ای در workflowها نباشد ─────────────────────────────── */

const dead = [...referenced].filter((t) => !fs.existsSync(path.join(ROOT, t)));
chk(
  'P4 هر تستی که workflowها صدا می‌زنند روی دیسک وجود دارد',
  dead.length === 0,
  dead.length ? `ارجاع مرده: ${dead.join(', ')}` : '',
);

chk(
  'P5 حداقل یک workflow واقعاً تست اجرا می‌کند',
  referenced.size > 0,
  'هیچ ارجاع tests/*.js در .github/workflows پیدا نشد',
);

/* ── ۳) شکاف را بشمار و سقف را نگه دار ────────────────────────────────────── */

const executed = new Set([...referenced, ...NPM_TEST_ENTRYPOINTS]);
const orphans = topLevelTests.filter((t) => !executed.has(t));

console.log(
  `\n  📊 اندازه‌گیری جاری: ${topLevelTests.length} فایل تستِ سطح‌بالا | ` +
    `${executed.size} اجراشونده توسط npm test + CI | ${orphans.length} اجرانشده\n`,
);

chk(
  `P6 تعداد تست‌های اجرانشده از سقف ثبت‌شده (${ORPHAN_BUDGET}) بیشتر نشده`,
  orphans.length <= ORPHAN_BUDGET,
  `اجرانشده=${orphans.length} > سقف=${ORPHAN_BUDGET}. ` +
    'یعنی فایل تست تازه‌ای اضافه شده که هیچ‌جا اجرا نمی‌شود. ' +
    'یا آن را به یک workflow اضافه کنید یا سقف را آگاهانه و مستند بالا ببرید.',
);

// قرارداد باید در سند هم ثبت شده باشد تا «دانش شفاهی» نماند
const contractDoc = path.join(ROOT, 'docs', 'TEST_CI_PARITY_CONTRACT.md');
chk(
  'P7 سند قرارداد هم‌ترازی موجود است',
  fs.existsSync(contractDoc),
  'docs/TEST_CI_PARITY_CONTRACT.md وجود ندارد',
);

if (fs.existsSync(contractDoc)) {
  const doc = fs.readFileSync(contractDoc, 'utf8');
  chk(
    'P8 سند قرارداد، محدودیت npm test را صریح اعلام می‌کند',
    doc.includes('npm test') && /tests\/run\.js/.test(doc) && /tests\/smoke\.js/.test(doc),
    'سند باید صراحتاً بگوید npm test فقط run.js و smoke.js را اجرا می‌کند',
  );
  chk(
    'P9 سند قرارداد عدد اجرانشده‌ها را ثبت کرده است',
    doc.includes(String(ORPHAN_BUDGET)),
    `سند باید عدد سقف (${ORPHAN_BUDGET}) را ثبت کند تا drift قابل ردیابی باشد`,
  );
}

/* ── نتیجه ────────────────────────────────────────────────────────────────── */

console.log('\n' + '─'.repeat(60));
console.log(`نتیجه قرارداد هم‌ترازی: ${pass} موفق / ${fail} ناموفق (از ${pass + fail})`);
if (fail > 0) {
  console.log('ناموفق‌ها:');
  for (const f of failures) console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}
console.log('✅ قرارداد هم‌ترازی تست و CI برقرار است.');

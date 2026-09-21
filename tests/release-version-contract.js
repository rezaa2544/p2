#!/usr/bin/env node
/**
 * اجرای قرارداد نسخه و انتشار (RELEASE VERSION CONTRACT ENFORCEMENT) — F-QA-07
 *
 * چرا این فایل وجود دارد:
 *   نسخه در چند جا اعلام می‌شود (package.json، package-lock.json، تگ‌های گیت،
 *   RELEASE_NOTES) و این‌ها با هم نمی‌خوانند. هیچ گیتی نسخه را نمی‌خواند، پس این
 *   ناهمخوانی تا امروز بی‌صدا بوده است.
 *
 * این تست:
 *   ۱) ناهمخوانی‌هایی را که **قطعاً غلط‌اند** (مثل package.json ≠ package-lock)
 *      قرمز می‌کند.
 *   ۲) ناهمخوانی‌هایی را که **تصمیم مالک می‌خواهند** (عدد نسخه در برابر آخرین تگ)
 *      فقط گزارش می‌کند و قرمز نمی‌کند — چون بالابردن خودسرانهٔ نسخه دقیقاً همان
 *      «release کاذب»ی است که این ممیزی علیه آن است.
 *   ۳) قرارداد را قفل می‌کند تا از این به بعد drift تازه بی‌صدا نماند.
 *
 * هیچ عددی حدس زده نشده — همه از روی مخزن خوانده می‌شوند.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;
const failures = [];
const advisories = [];

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

function note(name, detail) {
  advisories.push({ name, detail });
  console.log(`  ⚠️  ${name}\n     ${detail}`);
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

console.log('\n📦 قرارداد نسخه و انتشار (F-QA-07)\n');

/* ── منابع نسخه ───────────────────────────────────────────────────────────── */

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

const pkgVersion = pkg.version;
const lockVersion = lock.version;
const lockRootVersion = (lock.packages && lock.packages[''] && lock.packages[''].version) || null;

/* ── ۱) قواعدی که قطعاً باید برقرار باشند (قرمز می‌کنند) ──────────────────── */

chk('V1 package.json دارای نسخهٔ semver معتبر است', SEMVER_RE.test(String(pkgVersion)), `version=${pkgVersion}`);

chk(
  'V2 package-lock.json با package.json یکسان است',
  lockVersion === pkgVersion,
  `package.json=${pkgVersion} ولی package-lock.json=${lockVersion}`,
);

chk(
  'V3 ریشهٔ packages در lock با package.json یکسان است',
  lockRootVersion === null || lockRootVersion === pkgVersion,
  `package.json=${pkgVersion} ولی packages[""]=${lockRootVersion}`,
);

chk(
  'V4 نام بستهٔ lock با package.json یکسان است',
  !lock.name || lock.name === pkg.name,
  `package.json=${pkg.name} ولی lock=${lock.name}`,
);

/* ── ۲) قرارداد تگ: تگ vX.Y.Z فقط روی کامیتی با همان نسخه ────────────────── */

const semverTags = git(['tag', '-l', 'v*', '--sort=-v:refname'])
  .split('\n')
  .map((t) => t.trim())
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));

chk('V5 حداقل یک تگ semver وجود دارد', semverTags.length > 0, 'هیچ تگ vX.Y.Z پیدا نشد');

// قاعدهٔ الزام‌آور قرارداد: هر تگ vX.Y.Z باید روی کامیتی باشد که package.json آن
// دقیقاً همان X.Y.Z را داشته باشد. این قابل بررسی ماشینی است و نقضش یعنی تگ دروغ می‌گوید.
//
// نقض‌های تاریخیِ شناخته‌شده و ثبت‌شده. این‌ها **بخشیده نمی‌شوند تا مسئله پنهان شود** —
// در docs/RELEASE_VERSION_CONTRACT.md مستندند و جابه‌جاکردن تگ منتشرشده طبق قاعدهٔ ۳
// همان قرارداد ممنوع است. هدف این لیست فقط این است که گیت، نقض‌های *تازه* را بگیرد
// و زیر نویزِ تاریخ دفن نشود. هر تگ تازه‌ای که اینجا نباشد باعث قرمزی می‌شود.
const KNOWN_HISTORICAL_TAG_MISMATCHES = {
  // تگ v1.0.1 روی 522afe8f زده شده ولی package.json آن کامیت 1.0.0 است.
  // نسخهٔ 1.0.1 هرگز در تاریخچهٔ package.json وجود نداشته است (git log -S تأیید کرد).
  'v1.0.1': '1.0.0',
};

const tagMismatches = [];
const tolerated = [];
for (const tag of semverTags) {
  const want = tag.slice(1);
  const blob = git(['show', `${tag}:package.json`], '');
  if (!blob) {
    tagMismatches.push(`${tag}: package.json در آن تگ خوانده نشد`);
    continue;
  }
  let got = null;
  try {
    got = JSON.parse(blob).version;
  } catch {
    tagMismatches.push(`${tag}: package.json قابل تجزیه نبود`);
    continue;
  }
  if (got === want) continue;
  if (KNOWN_HISTORICAL_TAG_MISMATCHES[tag] === got) {
    tolerated.push(`${tag} (package.json=${got})`);
  } else {
    tagMismatches.push(`${tag} -> package.json آن کامیت = ${got}`);
  }
}

chk(
  'V6 هیچ تگ semver *تازه‌ای* با package.json ناهمخوان نیست',
  tagMismatches.length === 0,
  tagMismatches.join(' | '),
);

if (tolerated.length) {
  note(
    'A0 نقض تاریخیِ ثبت‌شده در تگ‌ها',
    `${tolerated.join(', ')} — تگ منتشرشده طبق قرارداد جابه‌جا نمی‌شود؛ ` +
      'فقط مستند شده تا تگ‌های آینده تکرارش نکنند.',
  );
}

/* ── ۳) قرارداد سند: RELEASE_NOTES نباید نسخهٔ متناقض «اعلام» کند ─────────── */

const notesPath = path.join(ROOT, 'docs', 'RELEASE_NOTES.md');
if (fs.existsSync(notesPath)) {
  const notes = fs.readFileSync(notesPath, 'utf8');
  const head = notes.split('\n').slice(0, 12).join('\n');
  const declared = head.match(/`(v[0-9][^`]*)`/);
  const declaredVer = declared ? declared[1] : null;

  // اگر سند نسخه‌ای اعلام می‌کند که با package.json فرق دارد، باید صراحتاً آن را
  // «کاندیدای انتشار / پیش‌تولید» بنامد. در غیر این صورت خواننده آن را نسخهٔ جاری می‌خواند.
  if (declaredVer && declaredVer !== `v${pkgVersion}`) {
    const isMarkedRC =
      /کاندیدای انتشار|پیش‌تولید|release candidate|-rc/i.test(head) || /-rc\d*/i.test(declaredVer);
    chk(
      'V7 نسخهٔ متفاوت در RELEASE_NOTES صراحتاً «کاندیدای انتشار» علامت خورده است',
      isMarkedRC,
      `سند ${declaredVer} اعلام می‌کند ولی package.json ${pkgVersion} است و برچسب RC ندارد`,
    );
  } else {
    chk('V7 نسخهٔ RELEASE_NOTES با package.json سازگار است', true);
  }
} else {
  chk('V7 سند RELEASE_NOTES موجود است', false, 'docs/RELEASE_NOTES.md پیدا نشد');
}

/* ── ۴) سند قرارداد باید وجود داشته باشد ─────────────────────────────────── */

const contractDoc = path.join(ROOT, 'docs', 'RELEASE_VERSION_CONTRACT.md');
chk('V8 سند قرارداد نسخه موجود است', fs.existsSync(contractDoc), 'docs/RELEASE_VERSION_CONTRACT.md وجود ندارد');

/* ── ۵) مواردی که فقط گزارش می‌شوند (تصمیم مالک، نه خطا) ─────────────────── */

const newestTag = semverTags[0] || null;
if (newestTag) {
  const behind = git(['rev-list', '--count', `${newestTag}..HEAD`], '?');
  if (newestTag !== `v${pkgVersion}`) {
    note(
      'A1 نسخهٔ package.json با جدیدترین تگ semver یکسان نیست',
      `package.json=${pkgVersion} · جدیدترین تگ=${newestTag} · ${behind} کامیت از آن تگ فاصله. ` +
        'این عمداً خطا نیست: تغییر عدد نسخه تصمیم سیاست انتشار است. ' +
        'به docs/RELEASE_VERSION_CONTRACT.md §۵ مراجعه کنید.',
    );
  }
}

const changelog = ['CHANGELOG.md', 'CHANGELOG', 'docs/CHANGELOG.md'].find((p) =>
  fs.existsSync(path.join(ROOT, p)),
);
if (!changelog) {
  note(
    'A2 هیچ CHANGELOG در مخزن وجود ندارد',
    'ساختنش توصیه می‌شود ولی تصمیم مالک است؛ نبودش باعث قرمزی این گیت نمی‌شود.',
  );
}

/* ── نتیجه ────────────────────────────────────────────────────────────────── */

console.log('\n' + '─'.repeat(64));
console.log(`نتیجه قرارداد نسخه: ${pass} موفق / ${fail} ناموفق (از ${pass + fail})`);
if (advisories.length) {
  console.log(`هشدار (تصمیم مالک، بدون قرمزی): ${advisories.length}`);
  for (const a of advisories) console.log(`  • ${a.name}`);
}
if (fail > 0) {
  console.log('ناموفق‌ها:');
  for (const f of failures) console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}
console.log('✅ قرارداد نسخه برقرار است (موارد هشدار نیازمند تصمیم مالک‌اند).');

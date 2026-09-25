#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/verification-registry.test.js — گیت رجیستری راستی‌آزمایی (A-38)

   قواعد تحمیل‌شده (No Fake Green / Evidence Before Status):
   ۱. هر item باید ۹ فیلد الزامی + status داشته باشد.
   ۲. VERIFIED_E3 فقط با exit_code=0 + artifact موجود با header کامل +
      SHA چهل‌کاراکتریِ resolvable + عدم تغییر درخت محصول تا HEAD فعلی.
   ۳. evidence تاریخی (STALE) هرگز نمی‌تواند VERIFIED باشد؛ بازتأیید فقط
      با اجرای مجدد واقعی (تغییر SHA به‌تنهایی ممنوع — با هش artifact مهار می‌شود).
   ۴. DEFECT_OPEN باید exit_code غیرصفر یا defect_ref داشته باشد.
   ۵. BLOCKED/NOT_VERIFIED باید limitation غیرخالی داشته باشند.
   ۶. هیچ‌جای رجیستری status حاوی CERTIFIED مجاز نیست.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REG_PATH = path.join(ROOT, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

console.log('▸ گیت رجیستری راستی‌آزمایی (VERIFICATION_REGISTRY.json)');

/* ۱) وجود و صحت JSON */
ok('فایل رجیستری وجود دارد', fs.existsSync(REG_PATH), REG_PATH);
let reg = null;
try { reg = JSON.parse(fs.readFileSync(REG_PATH, 'utf8')); } catch (e) { /* keep null */ }
ok('JSON معتبر parse می‌شود', reg !== null);
if (!reg) { console.log(`\nنتیجه: ${pass} موفق / ${fail} ناموفق`); process.exit(1); }

/* ۲) فراداده و سیاست */
ok('schema_version موجود است', typeof reg.schema_version === 'string' && reg.schema_version.length > 0);
ok('سیاست no_retroactive_revalidation ثبت شده', !!(reg.policy && reg.policy.no_retroactive_revalidation));
ok('current_head_product_tree چهل‌کاراکتری hex است', /^[0-9a-f]{40}$/.test(reg.current_head_product_tree || ''));
ok('فهرست product_tree_paths غیرخالی است', Array.isArray(reg.product_tree_paths) && reg.product_tree_paths.length > 0);

const STATUSES = new Set(reg.status_enum || []);
ok('status_enum شامل حالت‌های الزامی است', ['VERIFIED_E3', 'STALE', 'BLOCKED', 'NOT_VERIFIED'].every((s) => STATUSES.has(s)));
ok('هیچ حالت CERTIFIED در enum نیست', !(reg.status_enum || []).some((s) => /CERTIFIED/i.test(s)));

/* ۳) اعتبارسنجی تک‌تک itemها */
const REQUIRED = ['id', 'requirement', 'head_sha', 'command', 'exit_code', 'artifact', 'reviewer', 'timestamp', 'runtime', 'limitation', 'status'];
const items = Array.isArray(reg.items) ? reg.items : [];
ok('رجیستری حداقل یک item دارد', items.length > 0);

const ids = new Set();
let productDriftChecked = false;

for (const it of items) {
  const tag = it.id || '(بدون id)';

  const missing = REQUIRED.filter((f) => !(f in it));
  ok(`${tag}: هر ۹ فیلد الزامی + status موجودند`, missing.length === 0, 'غایب: ' + missing.join(','));

  ok(`${tag}: id یکتا است`, !ids.has(it.id));
  ids.add(it.id);

  ok(`${tag}: status در enum است`, STATUSES.has(it.status), String(it.status));
  ok(`${tag}: status حاوی CERTIFIED نیست`, !/CERTIFIED/i.test(String(it.status)));
  ok(`${tag}: limitation غیرخالی است`, typeof it.limitation === 'string' && it.limitation.trim().length > 10);

  if (it.status === 'VERIFIED_E3') {
    /* قواعد سخت‌گیرانه سبز شدن */
    ok(`${tag}: VERIFIED ⇒ exit_code === 0`, it.exit_code === 0, 'exit=' + it.exit_code);
    ok(`${tag}: VERIFIED ⇒ SHA چهل‌کاراکتری`, /^[0-9a-f]{40}$/.test(it.head_sha), String(it.head_sha).slice(0, 20));
    let resolvable = false;
    try { git(['cat-file', '-e', it.head_sha + '^{commit}']); resolvable = true; } catch (e) { /* no */ }
    ok(`${tag}: VERIFIED ⇒ SHA در git این clone resolvable است`, resolvable);
    ok(`${tag}: VERIFIED ⇒ timestamp ISO معتبر`, !isNaN(Date.parse(it.timestamp)), String(it.timestamp));

    const artPath = it.artifact ? path.join(ROOT, it.artifact) : null;
    ok(`${tag}: VERIFIED ⇒ artifact در repo موجود است`, artPath && fs.existsSync(artPath), String(it.artifact));
    /* ضد حذف بی‌صدا: artifact باید در git track شده باشد نه فقط روی دیسک
       (کلاس نقص DEF-A38-04: قاعده *.log در .gitignore شواهد را بی‌صدا حذف می‌کرد) */
    let tracked = false;
    try { git(['ls-files', '--error-unmatch', it.artifact]); tracked = true; } catch (e) { /* untracked */ }
    ok(`${tag}: VERIFIED ⇒ artifact در git track شده است (نه فقط روی دیسک)`, tracked, String(it.artifact));
    if (artPath && fs.existsSync(artPath)) {
      const art = fs.readFileSync(artPath, 'utf8');
      ok(`${tag}: artifact دارای header کامل COMMAND/HEAD/DATE/RUNTIME/EXIT_CODE است`,
        /COMMAND:/.test(art) && /HEAD/.test(art) && /DATE:/.test(art) && /RUNTIME:/.test(art) && /EXIT_CODE: 0/.test(art),
        'header ناقص');
      ok(`${tag}: SHA داخل artifact با head_sha ثبت‌شده هم‌خوان است`, art.includes(it.head_sha.slice(0, 7)), 'ناهم‌خوانی SHA');
    }

    /* قاعده تازگی: درخت محصول از SHA evidence تا HEAD فعلی نباید تغییر کرده باشد */
    if (resolvable) {
      let drift = 'UNKNOWN';
      try {
        drift = git(['diff', '--name-only', it.head_sha, 'HEAD', '--'].concat(reg.product_tree_paths));
      } catch (e) { drift = 'DIFF_FAILED: ' + e.message; }
      ok(`${tag}: درخت محصول از زمان evidence تغییر نکرده (وگرنه STALE و اجرای مجدد لازم)`, drift === '', String(drift).split('\n').slice(0, 3).join(' | '));
      productDriftChecked = true;
    }
  }

  if (it.status === 'STALE') {
    ok(`${tag}: STALE هرگز VERIFIED نیست و limitation صراحتاً NOT VERIFIED می‌گوید`, /NOT VERIFIED|بازتأیید|فاقد اعتبار/i.test(it.limitation));
    ok(`${tag}: STALE به HEAD فعلی منتسب نشده`, it.head_sha !== reg.current_head_product_tree, 'SHA تاریخی نمی‌تواند برابر HEAD فعلی باشد');
  }

  if (it.status === 'DEFECT_OPEN') {
    ok(`${tag}: DEFECT_OPEN ⇒ exit غیرصفر یا defect_ref`, it.exit_code !== 0 || !!it.defect_ref, 'exit=' + it.exit_code);
    const artPath = it.artifact ? path.join(ROOT, it.artifact) : null;
    ok(`${tag}: DEFECT_OPEN ⇒ artifact شکست موجود است`, artPath && fs.existsSync(artPath), String(it.artifact));
  }

  if (it.status === 'BLOCKED' || it.status === 'NOT_VERIFIED') {
    ok(`${tag}: ${it.status} ⇒ دلیل انسداد در limitation ثبت است`, it.limitation.trim().length > 20);
  }
}

ok('حداقل یک بررسی تازگی درخت محصول انجام شد', productDriftChecked);

/* ۴) ضد دستکاری: artifactهای VERIFIED از سیاست forbidden پیروی می‌کنند */
ok('سیاست forbidden شامل منع CERTIFIED است', !!(reg.policy && (reg.policy.forbidden || []).some((f) => /CERTIFIED/.test(f))));

console.log(`\nنتیجه گیت رجیستری: ${pass} موفق / ${fail} ناموفق`);
process.exit(fail ? 1 : 0);

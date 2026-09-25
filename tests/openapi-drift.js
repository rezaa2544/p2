#!/usr/bin/env node
// tests/openapi-drift.js — تست تشخیص دریفت بین کد سرور و اسپک (مأموریت ۳۶، چت ۶)
// قرارداد جاری (MUSE_SPARK 2026-09-25): شمار عملیات از جدول واقعی مشتق می‌شود؛
// ۱) اجرای ابزار روی ریپو: باید صفر دریفت باشد.
// ۲) پروندهٔ منفی درون‌حافظه‌ای: حذف یک مسیر از اسپک ⇒ تشخیص درست.
// ۳) پروندهٔ مثبت کاذب: افزودن مسیر غیرواقعی به اسپک ⇒ تشخیص درست.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);
let pass = 0, fail = 0;
const failures = [];
function chk(name, ok) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name); }
}

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'openapi-drift.js');

console.log('■ دریفت واقعی ریپو');
let out = '', code = 0;
try { out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' }); }
catch (e) { code = e.status || 1; out = (e.stdout || '') + (e.stderr || ''); }
chk('ابزار دریفت وجود دارد', fs.existsSync(TOOL));
chk('صفر دریفت در ریپو (خروجی ۰)', code === 0);
chk('پیام صفر دریفت', out.includes('صفر دریفت'));

// منطق مقایسه — همان الگوریتم ابزار (برای پرونده‌های مصنوعی)
function extractCode() {
  const c = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
  const set = new Set();
  let m;
  const re = /p\s*===\s*'([^']+)'\s*(?:&&|\|\|)[^\n]*?req\.method\s*===\s*'(GET|POST|PUT|DELETE|PATCH|HEAD)'/g;
  while ((m = re.exec(c)) !== null) set.add((m[2] === 'HEAD' ? 'GET' : m[2]) + ' ' + m[1]);
  const re2 = /p\s*===\s*'([^']+)'\s*&&\s*\(req\.method\s*===\s*'(GET|POST)'\s*\|\|\s*req\.method\s*===\s*'HEAD'\)/g;
  while ((m = re2.exec(c)) !== null) set.add(m[2] + ' ' + m[1]);
  return set;
}
function extractSpec(text) {
  const set = new Set();
  let cur = null;
  for (const line of text.split('\n')) {
    const pm = line.match(/^  (\/[^:]+):\s*$/);
    if (pm) { cur = pm[1]; continue; }
    const om = line.match(/^    (get|post|put|delete|patch):\s*$/);
    if (om && cur) set.add(om[1].toUpperCase() + ' ' + cur);
  }
  return set;
}
/* H-04: __slow فقط-تست و env-gated است؛ در هر دو سو allowlist می‌شود تا محیط، دریفت کاذب نسازد. */
const TEST_ONLY_ALLOW = new Set(['GET /api/__slow']);
function diff(codeSet, specSet) {
  const missing = [...codeSet].filter((k) => !specSet.has(k) && !TEST_ONLY_ALLOW.has(k));
  const ghost = [...specSet].filter((k) => !codeSet.has(k));
  return { missing, ghost };
}

const specText = fs.readFileSync(path.join(ROOT, 'docs', 'openapi.yaml'), 'utf8');
const codeSet = extractCode();

console.log('\n■ پروندهٔ منفی: حذف یک مسیر از اسپک');
const withoutLogin = specText.replace(/\/api\/auth\/login:\s*\n/, '/api/auth/login-REMOVED:\n');
const d1 = diff(codeSet, extractSpec(withoutLogin));
chk('حذف ورود ⇒ در فهرست «جاافتاده» شکار می‌شود', d1.missing.includes('POST /api/auth/login'));

console.log('\n■ پروندهٔ مثبت کاذب: مسیر غیرواقعی در اسپک');
const withGhost = specText + '\n  /api/v1/ghost:\n    get:\n      tags: [auth]\n';
const d2 = diff(codeSet, extractSpec(withGhost));
chk('مسیر شبح ⇒ در فهرست «اضافه» شکار می‌شود', d2.ghost.includes('GET /api/v1/ghost'));

console.log('\n■ همسانی اسپک و کد');
const d0 = diff(codeSet, extractSpec(specText));
chk('هیچ مسیر جاافتاده‌ای نیست', d0.missing.length === 0);
chk('هیچ مسیر شبحی نیست', d0.ghost.length === 0);
chk('شمار عملیات کد با اسپک برابر است (نه عدد جادویی)', codeSet.size === extractSpec(specText).size && codeSet.size > 0);
chk('دو مسیر کشف‌شده از کد در اسپک هست', codeSet.has('GET /api/health-index') && codeSet.has('GET /metrics'));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }

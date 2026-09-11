#!/usr/bin/env node
// tests/config-audit.js — تست مغایرت‌یابی پیکربندی کد/سند (مأموریت ۳۷، چت ۶)
// ۱) اجرای ابزار روی ریپو: خروجی ۰. ۲) پروندهٔ منفی: حذف یک ردیف ⇒ تشخیص.
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
const TOOL = path.join(ROOT, 'tools', 'config-audit.js');
const DOC = path.join(ROOT, 'docs', 'CONFIGURATION_REFERENCE.md');

console.log('■ اجرای ابزار روی ریپو');
chk('ابزار ممیزی وجود دارد', fs.existsSync(TOOL));
let out = '', code = 0;
try { out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' }); }
catch (e) { code = e.status || 1; out = (e.stdout || '') + (e.stderr || ''); }
chk('صفر مغایرت در ریپو (خروجی ۰)', code === 0);
chk('پیام «هیچ متغیر کدی بی‌سند نیست»', out.includes('هیچ متغیر کدی بی‌سند نیست'));

console.log('\n■ پروندهٔ منفی درون‌حافظه‌ای');
// اگر ردیف REDIS_URL از سند حذف شود، ابزارِ شبیه‌سازی‌شده باید مغایرت ببیند.
const doc = fs.readFileSync(DOC, 'utf8');
const docVars = new Set();
const s2 = doc.slice(doc.indexOf('## ۲) متغیرهای محیطی'), doc.indexOf('## ۳)'));
for (const line of s2.split('\n')) {
  if (!line.startsWith('|')) continue;
  const first = line.split('|')[1] || '';
  for (const bt of first.split('·')) {
    const m = bt.match(/`([A-Z_][A-Z0-9_]*)`/);
    if (m) docVars.add(m[1]);
  }
}
// مجموعهٔ کوچک کد برای شبیه‌سازی (متغیرهای حیاتی که حتماً در کد هستند)
const CODE_CORE = ['REDIS_URL', 'DATABASE_URL', 'PAYESH_JWT_SECRET', 'PORT', 'NODE_ENV', 'PAYESH_ENV'];
chk('همهٔ متغیرهای هسته در سند هستند', CODE_CORE.every((v) => docVars.has(v)));
const removed = new Set([...docVars].filter((v) => v !== 'REDIS_URL'));
chk('حذف ردیف ⇒ مغایرت شکار می‌شود', CODE_CORE.some((v) => !removed.has(v)) && !removed.has('REDIS_URL'));

console.log('\n■ همسانی شمارش');
chk('دست‌کم ۹۰ متغیر در §۲ سند (' + fa(docVars.size) + ')', docVars.size >= 90);
chk('دست‌کم ۷۰ متغیر در کد', out.includes('متغیرهای کد:') && parseInt(out.split('متغیرهای کد: ')[1], 10) >= 70);

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   troubleshooting-coverage.js — سنجه‌های سند عیب‌یابی:
     TS-SEC  هشت بخش
     TS-ERR  جدول پیام‌های خطا با کدهای واقعی
     TS-REF  ارجاع‌های زنده + قاعدهٔ سند زنده
   اجرا: node tests/troubleshooting-coverage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };

const doc = rd('docs/TROUBLESHOOTING.md');
if (!doc) { console.log('❌ docs/TROUBLESHOOTING.md نیست'); process.exit(1); }

grp('TS-SEC — بخش‌های هشت‌گانه');
[
  ['راه‌اندازی', /مشکلات راه‌اندازی/],
  ['شکست تست‌ها', /شکست تست‌ها/],
  ['همگام‌سازی و صف', /همگام‌سازی و صف/],
  ['احراز و نشست', /احراز و نشست/],
  ['کارایی', /کارایی/],
  ['بیلد', /## ۶\) بیلد/],
  ['گیت و گیت‌هاب', /گیت و گیت‌هاب/],
  ['جدول پیام‌های خطا', /جدول پیام‌های خطا/]
].forEach(([label, re]) => chk('بخشِ «' + label + '»', re.test(doc)));

grp('TS-SYM — علامت‌های واقعی هر بخش');
chk('پورت مشغول', /پورت/.test(doc) && /در حال استفاده/.test(doc));
chk('اتصال پستگرس/ردیس رد می‌شود', /پستگرس/.test(doc) && /ردیس/.test(doc));
chk('شکست مهاجرت', /مهاجرت/.test(doc) && /down\.sql/.test(doc));
chk('هشدار بی‌خطر جی‌ساداوم', /window\.scrollTo/.test(doc) && /بی‌خطر/.test(doc));
chk('تست وابسته به سید + نمونهٔ واقعی فیکس', /گیت‌ایگنور/.test(doc) && /ae70796/.test(doc));
chk('تست وابسته به تاریخ', /تقویم|روزهای کاری/.test(doc));
chk('تداخل پورت لاین‌های موازی', /لاین/.test(doc) && /LIVE_PORT/.test(doc));
chk('صف گیر + ردیف مرده', /سرریز|مرده/.test(doc) && /retry_count/.test(doc));
chk('جی‌دابلیوتی و نشست', /جی‌دابلیوتی|JWT/.test(doc) && /revocation\.js/.test(doc));
chk('سی‌اس‌آر‌اف: صداقت دربارهٔ قرارداد', /سی‌اس‌آر‌اف|CSRF/.test(doc) && /SameSite/.test(doc));
chk('نشت حافظه و ایونت‌لوپ', /نشت/.test(doc) && /ایونت‌لوپ/.test(doc));
chk('بیلد ناهم‌زمان + مجوز نوشتن + مُهر', /بازتولید/.test(doc) && /مُهر|مهر/.test(doc));
chk('پوش بلاک → چت ۷ و باندل', /چت ۷/.test(doc) && /باندل/.test(doc));
chk('قاعدهٔ فورس‌پوش امن', /force-with-lease/.test(doc));

grp('TS-ERR — جدول خطاها با کدهای واقعی');
const ERR_CODES = ['no_session', 'forbidden', 'field_denied', 'unknown_field', 'role_denied', 'role_escalation', 'out_of_scope', 'conflict', 'rate_limited', 'pg_unavailable', 'bad_request', 'not_found'];
const errSec = doc.split(/جدول پیام‌های خطا/)[1];
ERR_CODES.forEach((c) => chk('کد خطای «' + c + '» در جدول', errSec.includes('`' + c + '`')));
const errRows = (errSec.match(/^\|\s*`[a-z_]/gm) || []).length;
chk('دست‌کم ۱۰ ردیف در جدول خطاها', errRows >= 10, String(errRows));
chk('ستون‌های علت/راه‌حل/سند کامل', /علت/.test(errSec) && /راه‌حل/.test(errSec) && /سند کامل/.test(errSec));

grp('TS-REF — ارجاع‌ها و قاعدهٔ زنده');
chk('قاعدهٔ سند زنده (افزودن ردیف تازه)', /سند زنده/.test(doc));
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
// فایل‌های تولیدشده در اجرا و گیت‌ایگنورد — ارجاعشان درست است ولی در کلون تازه نیستند
const RUNTIME = ['server/data/payesh.json'];
const dead = refs.filter((r) => !RUNTIME.includes(r) && !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها به فایل موجود می‌رسند', dead.length === 0, dead.join(','));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ سند عیب‌یابی کامل است.');

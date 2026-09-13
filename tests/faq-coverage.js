#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   faq-coverage.js — سنجه‌های پرسش‌وپاسخ پرتکرار:
     FQ-SEC  شش بخش
     FQ-Q    دست‌کم ۲۰ پرسش + پاسخ‌های متصل به اسناد
     FQ-MISC تصورات غلط رایج
     FQ-REF  ارجاع‌های زنده
   اجرا: node tests/faq-coverage.js
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

const doc = rd('docs/FAQ.md');
if (!doc) { console.log('❌ docs/FAQ.md نیست'); process.exit(1); }

grp('FQ-SEC — بخش‌های شش‌گانه');
[
  ['عمومی', /## ۱\) عمومی/],
  ['توسعه', /## ۲\) توسعه/],
  ['استقرار', /## ۳\) استقرار/],
  ['عملیات', /## ۴\) عملیات/],
  ['آزمون', /## ۵\) آزمون/],
  ['تصورات غلط', /تصورات غلط/]
].forEach(([label, re]) => chk('بخشِ «' + label + '»', re.test(doc)));

grp('FQ-Q — پرسش‌ها');
const questions = doc.match(/^\*\*[^*]+؟\*\*$/gm) || [];
chk('دست‌کم ۲۰ پرسش', questions.length >= 20, String(questions.length));
chk('پرسش‌های کلیدی معماری (چرا...)', questions.filter((q) => q.includes('چرا')).length >= 6, String(questions.filter((q) => q.includes('چرا')).length));
chk('پاسخ‌ها به اسناد مرجع وصل‌اند', (doc.match(/docs\/[A-Z0-9_]+\.md/g) || []).length >= 8);

grp('FQ-KEY — پاسخ‌های کلیدی درست');
chk('توزیع تک‌فایلی به‌عنوان دلیل جاوااسکریپت خالص', /توزیع تک‌فایلی/.test(doc));
chk('مونولیت ماژولار با ارجاع به الحاقیه', /مونولیت ماژولار/.test(doc) && /ADDENDUM/.test(doc));
chk('پستگرس = تنها منبع حقیقت', /منبع حقیقت/.test(doc));
chk('ردیس = حالت توزیع‌شده + فیل-کلوزد', /حالت توزیع‌شده/.test(doc) && /فیل-کلوزد|503/.test(doc));
chk('اوت‌باکس با جدول و مهاجرت ۰۰۴', /server_outbox/.test(doc) && /۰۰۴/.test(doc));
chk('سنگ‌قبر با مرجع تست', /tombstone/.test(doc) || /سنگ‌قبر/.test(doc));
chk('آر‌پی‌او/آر‌تی‌او با قید دریل‌نشده', /۱۵ دقیقه/.test(doc) && /۵ دقیقه/.test(doc) && /دریل/.test(doc));
chk('چهار گیت پیش از کامیت', /547/.test(doc) && /check-authz/.test(doc) && /secret-scan/.test(doc) && /build\.js --check/.test(doc));

grp('FQ-MISC — تصورات غلط');
chk('آرنا ابزار است نه جایگزین', /ابزار/.test(doc) && /جایگزین/.test(doc));
chk('ردیس فقط کش نیست', /فقط کش نیست|نه.*کش است/.test(doc) || /حامل.*حالت/.test(doc));
chk('کوکی نشست با جی‌دابلیوتی فرق دارد', /کوکی/.test(doc) && /جی‌دابلیوتی|JWT/.test(doc));
chk('سندباکس مرجع ظرفیت نیست', /سندباکس/.test(doc) && /ظرفیت/.test(doc));

grp('FQ-REF — ارجاع‌ها');
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools|migrations|src)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
chk('دست‌کم ۶ ارجاع فایلی', refs.length >= 6, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها به فایل موجود می‌رسند', dead.length === 0, dead.join(','));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ پرسش‌وپاسخ کامل است.');

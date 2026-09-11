#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   security-incident-log-coverage.js — سنجه‌های دفتر رخدادهای امنیتی:
     SL-SEC  شش بخش
     SL-SEV  طبقه‌بندی شدت هماهنگ با سند حادثه
     SL-LOG  دست‌کم ۱۰ رخداد با شناسهٔ اس‌آی + ستون شاهد
     SL-PRC  فرایند ثبت سه‌مقصدی
     SL-TRD  تحلیل روند + الگوها
     SL-OPN  اقلام باز + صداقت منبع
     SL-REF  ارجاع‌های زنده
   اجرا: node tests/security-incident-log-coverage.js
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

const doc = rd('docs/SECURITY_INCIDENT_LOG.md');
if (!doc) { console.log('❌ docs/SECURITY_INCIDENT_LOG.md نیست'); process.exit(1); }

grp('SL-SEC — بخش‌های شش‌گانه');
[
  ['هدف و دامنه', /هدف و دامنه/],
  ['طبقه‌بندی شدت', /طبقه‌بندی شدت/],
  ['دفتر رخدادها', /دفتر رخدادها/],
  ['فرایند ثبت', /فرایند ثبت/],
  ['تحلیل روند', /تحلیل روند/],
  ['اقلام امنیتی باز', /اقلام امنیتی باز/]
].forEach(([label, re]) => chk('بخشِ «' + label + '»', re.test(doc)));

grp('SL-SEV — شدت‌ها');
['پ0', 'پ1', 'پ2', 'پ3'].forEach((s) => chk('سطح «' + s + '» تعریف شده', doc.includes(s + ' —')));
chk('هماهنگی با سطوح سند حادثه', /INCIDENT_RESPONSE\.md/.test(doc) && /دونگانی نمی‌سازیم/.test(doc));

grp('SL-LOG — رخدادها');
const ids = [...new Set((doc.match(/اس‌آی-[۰-۹]+/g) || []))];
chk('دست‌کم ۱۰ شناسهٔ یکتا', ids.length >= 10, String(ids.length));
['اس‌آی-۰۰۱', 'اس‌آی-۰۰۲', 'اس‌آی-۰۰۳', 'اس‌آی-۰۰۴', 'اس‌آی-۰۰۵', 'اس‌آی-۰۰۶', 'اس‌آی-۰۰۷', 'اس‌آی-۰۰۸', 'اس‌آی-۰۰۹', 'اس‌آی-۰۱۰']
  .forEach((id) => chk('رخداد «' + id + '» ثبت شده', doc.includes(id)));
const log = doc.split(/دفتر رخدادها/)[1].split(/جزئیات درس‌آموخته/)[0];
chk('ستون شاهد/منبع در جدول', /شاهد\/منبع|شاهد/.test(log));
chk('تمایز صادقانهٔ منبع (ابلاغ در برابر ریپو)', /ابلاغ تیمی/.test(log) && /HANDOFF\.md|WAVE6_REDIS_AUDIT\.md|ROUND73/.test(log));
chk('ستون وضعیت هست', /وضعیت/.test(log));

grp('SL-PRC — فرایند ثبت');
const prc = doc.split(/فرایند ثبت/)[1].split(/تحلیل روند/)[0];
chk('ثبت سه‌مقصدی: جدول + هندآف + روفلو', /جدول این سند/.test(prc) && /HANDOFF|هندآف/i.test(prc) && /روفلو/.test(prc));
chk('مالک سطح‌بندی چت ۲', /چت ۲/.test(prc));
chk('مهلت ثبت همان روز', /همان روز/.test(prc));

grp('SL-TRD — روند');
const trd = doc.split(/تحلیل روند/)[1].split(/اقلام امنیتی باز/)[0];
chk('جدول شمارش شدت‌ها', /تعداد/.test(trd));
chk('الگوهای تکرارشونده', /الگو/.test(trd) && /غیراتمی|اتمی/.test(trd));
chk('توصیه‌های پیشگیری', /توصیه/.test(trd));

grp('SL-OPN — اقلام باز و صداقت');
const opn = doc.split(/اقلام امنیتی باز/)[1];
chk('راستی‌آزمایی رخدادهای باگ‌هانت باز است', /راستی‌آزمایی/.test(opn));
chk('دی‌ای‌اس‌تی/پنتست زنده باز', /دی‌ای‌اس‌تی/.test(opn));
chk('دبلیو‌ای‌اف فقط-تشخیص قید شده', /فقط-تشخیص/.test(opn));
chk('قید سند ممیزی ویو ۱۳ (ساخته‌شده در ۲۰۲۶-۰۹-۱۰)', /WAVE13_ASVS_AUDIT\.md/.test(doc) && /ساخته شد/.test(doc));

grp('SL-REF — ارجاع‌ها');
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
chk('دست‌کم ۴ ارجاع فایلی', refs.length >= 4, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها زنده‌اند', dead.length === 0, dead.join(','));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ دفتر رخدادهای امنیتی کامل است.');

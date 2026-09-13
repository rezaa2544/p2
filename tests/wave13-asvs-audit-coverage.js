#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave13-asvs-audit-coverage.js — سنجه‌های ممیزی ای‌اس‌وی‌اس ویو ۱۳:
     WA-SEC  شش بخش
     WA-CTL  جدول کنترل‌ها: ۱۵ حوزه + ستون شاهد + وضعیت
     WA-RES  یافته‌ها و رفع‌ها با شاهد
     WA-HON  قیدهای صداقت (نبود اجرا زنده، نبود میدل‌ور)
     WA-REF  ارجاع‌های زنده
   اجرا: node tests/wave13-asvs-audit-coverage.js
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
const doc = (() => { try { return fs.readFileSync(path.join(ROOT, 'docs/WAVE13_ASVS_AUDIT.md'), 'utf8'); } catch (e) { return null; } })();
if (!doc) { console.log('❌ docs/WAVE13_ASVS_AUDIT.md نیست'); process.exit(1); }

grp('WA-SEC — بخش‌های شش‌گانه');
['خلاصهٔ اجرایی', 'جدول کامل کنترل‌ها', 'یافته‌ها و رفع‌ها', 'کنترل‌های خارج دامنه', 'کارهای آینده', 'ارجاع‌ها']
  .forEach((s) => chk('بخشِ «' + s + '»', doc.includes(s)));

grp('WA-CTL — جدول کنترل‌ها');
const ctl = doc.split(/جدول کامل کنترل‌ها/)[1].split(/یافته‌ها و رفع‌ها/)[0];
const rows = ctl.split('\n').filter((l) => /^\| V\d+ /.test(l));
chk('پانزده حوزهٔ کنترل (V1 تا V15)', rows.length === 15, String(rows.length));
for (let i = 1; i <= 15; i++) chk('ردیف «V' + i + '»', rows.some((r) => r.startsWith('| V' + i + ' ')));
chk('ستون شاهد در جدول', /شاهد \(فایل\/تست\)/.test(ctl));
chk('هر ردیف وضعیت دارد', rows.every((r) => /✅|🟡|⏳|➖/.test(r)));
chk('شاهد ریپویی برای احراز', /auth\.js/.test(ctl) && /otp-ratelimit/.test(ctl));
chk('شاهد ریپویی برای مجوز', /check-authz\.js/.test(ctl));

grp('WA-RES — یافته‌ها و رفع‌ها');
const res = doc.split(/یافته‌ها و رفع‌ها/)[1].split(/کنترل‌های خارج دامنه/)[0];
chk('دست‌کم چهار رفع با شاهد', (res.match(/رفع با شاهد|✅ رفع با شاهد|رفع شد|رفع‌شده با شاهد|✅/g) || []).length >= 4);
['اتمی', 'شمارش', 'تلفن', 'انتساب انبوه'].forEach((k) => chk('یافتهٔ «' + k + '»', res.includes(k)));

grp('WA-HON — صداقت');
chk('نبود اجرای زندهٔ دی‌ای‌اس‌تی قید شده', /پ0-۴/.test(doc) && /اجرای زنده/.test(doc));
chk('نبود میدل‌ور ای‌اس‌وی‌اس قید شده', /میدل‌ور|میان‌افزار|وجود ندارد/.test(doc) && /asvs\.js/i.test(doc));
chk('نبود کامیت با کلیدواژهٔ ای‌اس‌وی‌اس قید شده', /کامیتی با کلیدواژه/.test(doc) || /هیچ کامیتی/.test(doc));
chk('شمار حوزه‌ها با نسخهٔ ۵ سازگار توضیح داده شده', /۱۵ حوزه/.test(doc) && /نسخهٔ ۴/.test(doc));

grp('WA-REF — ارجاع‌ها');
['SECURITY_MODEL.md', 'PEN_TEST_CHECKLIST.md', 'THREAT_MODEL.md', 'SECURITY_INCIDENT_LOG.md', 'WAVE6_REDIS_AUDIT.md']
  .forEach((f) => chk('ارجاع به «' + f + '»', doc.includes(f)));
const refs = [...new Set((doc.match(/(?:docs|server|tools|tests|\.github)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
// «میدل‌ور ای‌اس‌وی‌اس» صریحاً به‌عنوان «وجود ندارد» قید شده — استثنا
const deadFiltered = dead.filter((r) => r !== 'server/middleware/asvs.js');
chk('همهٔ ارجاع‌های فایلی زنده‌اند (استثنا: میدل‌ور اعلام‌شدهٔ نبوده)', deadFiltered.length === 0, deadFiltered.join(','));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ ممیزی ای‌اس‌وی‌اس کامل است.');

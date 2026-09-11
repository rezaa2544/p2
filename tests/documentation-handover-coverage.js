#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   documentation-handover-coverage.js — سنجه‌های بستهٔ تحویل مستندات:
     DH-SEC  پنج بخش
     DH-PKG  چهار بستهٔ مخاطب‌محور با زمان مطالعه
     DH-PATH مسیرهای مطالعهٔ ترتیبی
     DH-SCN  دست‌کم ۱۵ سناریو
     DH-VER  نسخه‌بندی (وی۱.۰.۰-آرسی۱)
     DH-REF  همهٔ ارجاع‌های فایلی زنده
   اجرا: node tests/documentation-handover-coverage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 220) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 220) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const doc = (() => { try { return fs.readFileSync(path.join(ROOT, 'docs/DOCUMENTATION_HANDOVER.md'), 'utf8'); } catch (e) { return null; } })();
if (!doc) { console.log('❌ docs/DOCUMENTATION_HANDOVER.md نیست'); process.exit(1); }

grp('DH-SEC — پنج بخش');
['بسته‌های مخاطب‌محور', 'مسیر مطالعهٔ ترتیبی', 'جدول سناریو → سند', 'نسخهٔ برون‌خطی', 'نسخه‌بندی مستندات']
  .forEach((s) => chk('بخشِ «' + s + '»', doc.includes(s)));

grp('DH-PKG — چهار بسته');
[['الف', 'توسعه‌دهندهٔ جدید', '۴ تا ۶ ساعت'], ['ب', 'دیواپس', '۶ تا ۸ ساعت'], ['پ', 'امنیت', '۳ تا ۴ ساعت'], ['ت', 'ذی‌نفعان', '۲ تا ۳ ساعت']]
  .forEach(([ltr, aud, time]) => chk('بستهٔ «' + ltr + '» (' + aud + ')', doc.includes('بستهٔ ' + ltr) && doc.includes(time)));
['SUPERVISOR_BRIEF.md', 'ONBOARDING_NEW_DEVELOPER.md', 'DATA_DICTIONARY.md', 'TROUBLESHOOTING.md', 'FAQ.md',
 'NATIONAL_ARCHITECTURE.md', 'PRODUCTION_RUNBOOK.md', 'DEPLOYMENT_GUIDE.md', 'HA_POSTGRES.md', 'HA_REDIS.md',
 'OBSERVABILITY_LIVE_SETUP.md', 'INCIDENT_RESPONSE.md', 'DISASTER_RECOVERY.md', 'DR_RUNBOOK.md',
 'SECURITY_MODEL.md', 'WAVE13_ASVS_AUDIT.md', 'PEN_TEST_CHECKLIST.md', 'SECURITY_INCIDENT_LOG.md', 'AUTHORIZATION_MODEL.md',
 'RATE_LIMITING_DESIGN.md', 'CAPACITY_MODEL.md', 'RELEASE_NOTES.md', 'GO_LIVE_PACKAGE.md', 'PILOT_ROLLOUT_PLAN.md', 'P0_BLOCKER_TRACKER.md']
  .forEach((f) => chk('سند «' + f + '» در بسته‌ها', doc.includes(f)));
chk('صداقت: نبود ممیزی ریتِ ابلاغی قید شده', /RATE_LIMIT_AUDIT\.md/.test(doc) && /وجود ندارد/.test(doc));

grp('DH-PATH — مسیرهای ترتیبی');
['۱ ساعت', '۴ ساعت', '۲۱۲ سند'].forEach((s) => chk('مسیر «' + s + '»', doc.includes(s)));
chk('پنج سند حیاتی معرفی شده‌اند', /پنج سند حیاتی/.test(doc));

grp('DH-SCN — سناریوها');
const scn = doc.split(/جدول سناریو → سند/)[1].split(/نسخهٔ برون‌خطی/)[0];
const rows = scn.split('\n').filter((l) => /^\| «/.test(l));
chk('دست‌کم ۱۵ سناریو', rows.length >= 15, String(rows.length));
['پستگرس و نه مونگو', 'کند است', 'پی۰', 'پی‌آر جدید', 'امنیت', 'ظرفیت'].forEach((k) => chk('سناریوی «' + k + '»', scn.includes(k)));

grp('DH-VER — نسخه‌بندی');
chk('نسخهٔ وی۱.۰.۰-آرسی۱', doc.includes('v1.0.0-rc1'));
chk('تاریخ ۲۰۲۶-۰۹-۱۰', doc.includes('۲۰۲۶-۰۹-۱۰'));
chk('مجوز داخلی', /داخلی/.test(doc));
chk('شمارهٔ نسخه بعدی تعریف شده', /rc2/.test(doc));
chk('دستور پنداک برای خروجی', /pandoc/.test(doc) && /xelatex|html/.test(doc));

grp('DH-REF — ارجاع‌های زنده');
// ارجاع‌ها گاهی با پیشوند مسیرند و گاهی نام لخت داخل بک‌تیک
const pref = [...new Set((doc.match(/(?:docs|server|tools)\/[A-Za-z0-9_./-]+\.(?:md|js|sh)/g) || []))];
const bare = [...new Set((doc.match(/`[A-Z][A-Z0-9_]*\.md`/g) || []).map((s) => s.slice(1, -1)))];
const refs = [...new Set([...pref, ...bare])];
chk('دست‌کم ۲۵ ارجاع فایلی', refs.length >= 25, String(refs.length));
const resolve = (r) => (r.startsWith('server/') || r.startsWith('tools/') || r.startsWith('docs/'))
  ? path.join(ROOT, r)
  : (fs.existsSync(path.join(ROOT, 'docs', r)) ? path.join(ROOT, 'docs', r) : path.join(ROOT, r));
const dead = refs.filter((r) => !fs.existsSync(resolve(r)));
// «ممیزی ریت» ابلاغی و اسکریپت صادرکننده صریحاً «وجود ندارد/ساخته نشده» قید شده‌اند — استثنا
const deadFiltered = dead.filter((r) => !r.endsWith('RATE_LIMIT_AUDIT.md') && !r.endsWith('docs-export.sh'));
chk('همهٔ ارجاع‌ها زنده‌اند (استثنا: اسناد اعلام‌شدهٔ نبوده)', deadFiltered.length === 0, deadFiltered.join(','));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ بستهٔ تحویل کامل است.');

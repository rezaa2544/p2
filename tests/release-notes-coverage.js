#!/usr/bin/env node
// tests/release-notes-coverage.js — پوشش RELEASE_NOTES.md نسخهٔ آرسی۱۷ (مأموریت ۳۵، چت ۶)
// قرارداد: ساختار ابلاغی (خلاصه + ۷ بخش + تاریخچهٔ ۱۷ نسخه + مهاجرت + ارتقا + پیوست آرسی۱).
'use strict';
const fs = require('fs');
const path = require('path');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);
let pass = 0, fail = 0;
const failures = [];
function grp(t) { console.log('\n■ ' + t); }
function chk(name, ok) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name); }
}

const FILE = path.join(__dirname, '..', 'docs', 'RELEASE_NOTES.md');
chk('فایل یادداشت انتشار وجود دارد', fs.existsSync(FILE));
if (!fs.existsSync(FILE)) { console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`); process.exit(1); }
const doc = fs.readFileSync(FILE, 'utf8');
const bulletsOf = (t) => t.split('\n').filter((l) => l.startsWith('- ')).length;
const numberedOf = (t) => t.split('\n').filter((l) => /^\d+\. /.test(l)).length;
function sectionOf(title) {
  const start = doc.indexOf(title);
  if (start === -1) return '';
  const next = doc.indexOf('\n## ', start + title.length);
  return next === -1 ? doc.slice(start) : doc.slice(start, next);
}

grp('سربرگ');
chk('عنوان اصلی', doc.startsWith('# 📦 RELEASE NOTES — پایش'));
chk('نسخهٔ جاری آرسی۱۷', doc.includes('**نسخه:** `v1.0.0-rc17`'));
chk('تاریخ', doc.includes('۲۰۲۶-۰۹-۱۱'));
chk('کانال پیش‌تولید', doc.includes('هنوز انتشار عمومی نیست'));
chk('ارجاع به قفل جاری', doc.includes('DOCS_FREEZE_v1.0.0-rc17.md'));

grp('نسخهٔ جاری — بخش‌ها');
const cur = sectionOf('## نسخهٔ جاری: v1.0.0-rc17');
chk('سربرگ نسخهٔ جاری', cur.length > 0);
chk('خلاصهٔ اجرایی با اعداد کلیدی', cur.includes('۱۶ قفل') && cur.includes('۳۴ مأموریت') && cur.includes('هنوز نه'));
const added = cur.slice(cur.indexOf('### Added'), cur.indexOf('### Changed'));
chk('Added ≥ ۵', bulletsOf(added) >= 5);
const changed = cur.slice(cur.indexOf('### Changed'), cur.indexOf('### Fixed'));
chk('Changed ≥ ۵', bulletsOf(changed) >= 5);
const fixed = cur.slice(cur.indexOf('### Fixed'), cur.indexOf('### Security'));
chk('Fixed ≥ ۵', bulletsOf(fixed) >= 5);
const sec = cur.slice(cur.indexOf('### Security'), cur.indexOf('### Documentation'));
chk('Security ≥ ۵', bulletsOf(sec) >= 5);
chk('Security به ۳۶ یافته اشاره دارد', sec.includes('۳۶'));
const docs_ = cur.slice(cur.indexOf('### Documentation'), cur.indexOf('### Known'));
chk('Documentation با شمار درخت', docs_.includes('۲۶۹'));
const known = cur.slice(cur.indexOf('### Known'), cur.indexOf('### Breaking'));
chk('Known Limitations ≥ ۴', bulletsOf(known) >= 4);
chk('Breaking Changes: بدون تغییر از آرسی۱', cur.includes('None since v1.0.0-rc1') || cur.includes('بدون تغییر از آرسی۱'));

grp('تاریخچهٔ نسخه‌ها');
const hist = sectionOf('## تاریخچهٔ نسخه‌ها');
chk('سربرگ تاریخچه', hist.length > 0);
chk('ستون‌های جدول', hist.includes('| نسخه |') && hist.includes('کامیت‌ها') && hist.includes('اسناد ریشه'));
const FAORD = ['۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '۱۰', '۱۱', '۱۲', '۱۳', '۱۴', '۱۵', '۱۶', '۱۷'];
for (const v of FAORD) chk('ردیف آرسی' + v, hist.includes('۱.۰.۰-آرسی' + v + ' |'));
chk('شمار مانیفست آرسی۱۷ = ۲۴۹', hist.includes('۲۴۹'));
chk('شمار مانیفست آرسی۱ = ۲۱۰', hist.includes('۲۱۰'));
chk('قید صداقت ستون کامیت‌ها', hist.includes('ثبت‌نشدهٔ دقیق') && hist.includes('کوتاه شده'));

grp('مهاجرت و ارتقا');
const mig = sectionOf('## Migration Notes');
chk('سربرگ مهاجرت', mig.length > 0);
chk('مهاجرت ≥ ۵ بند', bulletsOf(mig) >= 5);
chk('صریح: تغییر کد لازم نیست', mig.includes('مهاجرت فنی لازم نیست'));
const up = sectionOf('## Upgrade Path');
chk('سربرگ مسیر ارتقا', up.length > 0);
chk('هفت گام ارتقا', numberedOf(up) >= 7);

grp('پیوست آرسی۱ (حفظ دوطرفه)');
const ap = doc.slice(doc.indexOf('## پیوست'));
chk('سربرگ پیوست', ap.length > 0);
chk('الحاقیهٔ هفت‌گانه محفوظ', ap.includes('الحاقیه'));
chk('مسیر ارتقای تک‌سروری محفوظ', ap.includes('از نسخهٔ تک‌سروری'));
chk('وضعیت موج‌های آرسی۱ محفوظ', ap.includes('وضعیت موج‌ها'));
chk('جدول تغییرات شکنندهٔ آرسی۱ محفوظ', ap.includes('کلید نشست زیر ۲۵۶ بیت'));

grp('ارجاع‌ها و پاکیزگی');
for (const ref of ['GO_LIVE_PACKAGE.md', 'P0_BLOCKER_TRACKER.md', 'EXECUTIVE_BRIEFING.md', 'LESSONS_LEARNED.md', 'DOCS_INDEX.md']) {
  chk('ارجاع به ' + ref, doc.includes(ref));
}
chk('بدون راز', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }

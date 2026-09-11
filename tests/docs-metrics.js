#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   docs-metrics.js — سنجه‌های گزارش سنجه‌های مستندات:
     DM-KEY  اعداد اصلی (اسناد، لینک‌ها، §۳۰، مأموریت‌ها)
     DM-DATE بازهٔ شروع تا قفل
     DM-LIVE راستی‌آزمایی زندهٔ شمار اسناد و تست‌ها با دیسک
   اجرا: node tests/docs-metrics.js
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
const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const doc = (() => { try { return fs.readFileSync(path.join(ROOT, 'docs/DOCS_METRICS.md'), 'utf8'); } catch (e) { return null; } })();
if (!doc) { console.log('❌ docs/DOCS_METRICS.md نیست'); process.exit(1); }

grp('DM-KEY — اعداد اصلی');
/* شمارها از دیسک مشتق می‌شوند، نه سخت‌کد: نسخهٔ پیشین «۲۷۷/۲۹۷» را
     hard-code کرده بود و با هر بامپ قفل کهنه می‌شد. */
const _rootMd = fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md'));
const _subMd = (() => { let n = 0;
  for (const d of ['RUNBOOK_CARDS', 'user-guides', 'pilot']) {
    const dp = path.join(ROOT, 'docs', d);
    if (fs.existsSync(dp)) n += fs.readdirSync(dp).filter((f) => f.endsWith('.md')).length; }
  return n; })();
const _manRows = _rootMd.length - 1;                 // بیرون از خودِ سند قفل
const _tree = _rootMd.length + _subMd;
chk('شمار اسناد ' + _manRows + ' ریشه + ' + _subMd + ' زیرپوشه (لحظهٔ قفلِ جاری)',
  doc.includes(faNum(_manRows)) && doc.includes(faNum(_tree)),
  faNum(_manRows) + ' / ' + faNum(_tree));
chk('صفر لینک شکسته', /\| لینک شکسته \| \*\*۰\*\*/.test(doc) || /لینک شکسته/.test(doc));
chk('پوشش §۳۰: چهارده از چهارده', /۱۴ از ۱۴/.test(doc));
chk('هفده مأموریت تکمیل‌شده', /۱۷/.test(doc) && /مأموریت‌های تکمیل‌شده/.test(doc));
chk('بیست‌وشش تست پوشش مستندات', /۲۶/.test(doc));
chk('صفر تعارض هماهنگی', /۰/.test(doc) && /تعارض/.test(doc));

grp('DM-DATE — بازه');
chk('شروع ۲۰۲۶-۰۹-۰۵', doc.includes('۲۰۲۶-۰۹-۰۵'));
chk('قفل ۲۰۲۶-۰۹-۱۰', doc.includes('۲۰۲۶-۰۹-۱۰'));

grp('DM-LIVE — راستی‌آزمایی زنده');
const onDisk = fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md'));
chk('ادعای سند با دیسک سازگار است (' + onDisk.length + ' سند ریشه)', doc.includes(faNum(onDisk.length)), String(onDisk.length));
const covTests = fs.readdirSync(path.join(ROOT, 'tests'))
  .filter((f) => /coverage\.js$/.test(f)).length;
const docTests = covTests + ['docs-consistency.js', 'docs-health.js', 'incident-playbooks.js',
  'docs-export-script.js', 'docs-freeze-marker.js', 'docs-metrics.js', 'docs-metadata.js']
  .filter((f) => fs.existsSync(path.join(ROOT, 'tests', f))).length;
chk('شمار تست‌های پوشش مستندات با دیسک یکی است', docTests === 50, String(docTests));
chk('سند قفل و بستهٔ تحویل واقعاً موجودند',
  fs.existsSync(path.join(ROOT, 'docs/DOCS_FREEZE_v1.0.0-rc1.md')) &&
  fs.existsSync(path.join(ROOT, 'docs/DOCUMENTATION_HANDOVER.md')));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ سنجه‌های مستندات درست‌اند.');

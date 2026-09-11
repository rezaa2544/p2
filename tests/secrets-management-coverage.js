#!/usr/bin/env node
/* secrets-management-coverage.js — پوششِ سند مدیریت رازها (چت ۶) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'SECRETS_MANAGEMENT.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

chk('سند مدیریت رازها وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('بخش‌ها');
['خلاصه و دامنه', 'فهرست رازهای سامانه', 'تولید و حداقل قدرت', 'چرخش کلید',
  'حالت چندنمونه‌ای', 'جلوگیری از نشت', 'پاسخ به نشت', 'چک‌لیست استقرار', 'رونوشت']
  .forEach((s) => chk('بخش: ' + s, doc.includes('## ') && doc.includes(s)));

grp('سیاست‌های کلیدی');
chk('اصل «هیچ رازی در ریپو نیست»', doc.includes('هیچ رازی در ریپو نیست'));
chk('تزریق فقط از محیط', doc.includes('تزریق فقط از محیط'));
chk('شکست-بسته/شکست-سریع', doc.includes('شکست-بسته'));
chk('کلید مشترک ≥۳۲ بایت', doc.includes('≥۳۲ بایت'));
chk('چرخش غلتان با کلید قبلی', doc.includes('چرخش غلتان') && doc.includes('کلید قبلی'));
chk('چرخش = ردیف در دفتر رخدادهای امنیتی', doc.includes('SECURITY_INCIDENT_LOG.md'));
chk('ممنوعیت مجاز بی‌دلیل در اسکنر', doc.includes('مجاز بی‌دلیل'));
chk('ممنوعیت جای‌گذاری راز در چت', doc.includes('هرگز در چت'));

grp('شاهدهای کد (راستی‌آزمایی زنده)');
const idx = rd('server/index.js');
const auth = rd('server/auth.js');
chk('fail-fast کلید مشترک در کد هست', idx.includes('requires a shared PAYESH_JWT_SECRET'));
chk('بررسی ۲۵۶ بیت در کد هست', idx.includes('JWT key shorter than 256 bits'));
chk('چرخش غلتان در کد هست', auth.includes('PAYESH_JWT_SECRET_PREV'));
chk('کلید خودساخته ۳۲ بایتی در کد هست', idx.includes('crypto.randomBytes(32)'));
chk('.gitignore کلیدها را می‌گیرد', rd('.gitignore').includes('*.key') && rd('.gitignore').includes('jwt.key'));
chk('گرافانا پسورد اجباری در کمپوز است', rd('infra/observability/docker-compose.observability.yml').includes('GRAFANA_PASSWORD:?'));
chk('نمونهٔ .example بیرون از مقادیر واقعی وجود دارد', fs.existsSync(path.join(ROOT, 'infra/observability/env.observability.example')));
chk('اسکنر ۱۱/۱۱ و الگوها برقرارند', rd('tests/secret-scan.js').includes('github_pat_') && rd('tests/secret-scan.js').includes('AKIA'));
chk('دروازهٔ انتشار اسکن راز را اجرا می‌کند', rd('tools/release-gate.js').includes('tests/secret-scan.js'));

grp('ارجاع‌ها و جایگاه در کتابخانه');
chk('ارجاع به مدل امنیت', doc.includes('SECURITY_MODEL.md'));
chk('ارجاع به بستهٔ انطباق', doc.includes('IRAN_COMPLIANCE_PACKAGE.md'));
chk('ردیف نمایه برای مدیریت رازها وجود دارد', rd('docs/DOCS_INDEX.md').includes('SECRETS_MANAGEMENT.md'));
chk('بستهٔ انطباق به این سند ارجاع می‌دهد (رفع شکاف مأموریت ۲۰)', rd('docs/IRAN_COMPLIANCE_PACKAGE.md').includes('SECRETS_MANAGEMENT.md'));

console.log('');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);

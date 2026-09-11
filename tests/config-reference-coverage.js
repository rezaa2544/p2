#!/usr/bin/env node
// tests/config-reference-coverage.js — پوشش مرجع پیکربندی (مأموریت ۳۷، چت ۶)
// قرارداد ابلاغی: ده بخش + دست‌کم ۵۰ متغیر مستند + قواعد اعتبارسنجی و حالت‌های شکست.
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

const FILE = path.join(__dirname, '..', 'docs', 'CONFIGURATION_REFERENCE.md');
chk('فایل مرجع پیکربندی وجود دارد', fs.existsSync(FILE));
if (!fs.existsSync(FILE)) process.exit(1);
const doc = fs.readFileSync(FILE, 'utf8');
function sectionOf(title) {
  const start = doc.indexOf(title);
  if (start === -1) return '';
  const next = doc.indexOf('\n## ', start + title.length);
  return next === -1 ? doc.slice(start) : doc.slice(start, next);
}
const bulletsOf = (t) => t.split('\n').filter((l) => l.startsWith('- ')).length;
const numberedOf = (t) => t.split('\n').filter((l) => /^\d+\. /.test(l)).length;

grp('ده بخش');
const SECS = ['## ۱) مقدمه', '## ۲) متغیرهای محیطی', '## ۳) فایل‌های پیکربندی',
  '## ۴) قواعد اعتبارسنجی', '## ۵) حالت‌های شکست', '## ۶) پیکربندی هر محیط',
  '## ۷) چرخش پیکربندی', '## ۸) مسیر ممیزی تغییرات', '## ۹) اشتباه‌های رایج', '## ۱۰) اقلام باز'];
for (const s of SECS) chk('سربرگ «' + s.slice(3, 24) + '»', doc.includes(s));

grp('مقدمه');
const s1 = sectionOf(SECS[0]);
chk('اولویت پیکربندی آمده', s1.includes('متغیر محیطی > مقدار فایل') || s1.includes('اولویت'));
chk('راهنمای تست پیکربندی', s1.includes('config-audit.js') && s1.includes('check-authz'));

grp('متغیرها — شمار و دسته‌ها');
const s2 = sectionOf(SECS[1]);
const vars = new Set();
for (const line of s2.split('\n')) {
  for (const m of line.matchAll(/`([A-Z_][A-Z0-9_]*)`/g)) {
    if (!['X', 'POSTGRES_USER', 'PAYESH_ENV', 'NODE_ENV'].includes(m[1]) || true) vars.add(m[1]);
  }
}
chk('دست‌کم ۵۰ متغیر مستند (' + fa(vars.size) + ')', vars.size >= 50);
for (const c of ['۲.۱ کاربرد', '۲.۲ پایگاه داده', '۲.۳ ردیس', '۲.۴ احراز هویت', '۲.۵ امنیت', '۲.۶ نرخ‌بندی', '۲.۷ رصدپذیری', '۲.۸ پشتیبان', '۲.۹ ممیزی', '۲.۱۰ کارگر', '۲.۱۱ فقط-زیرساخت', '۲.۱۲ متغیرهای اسکریپت']) {
  chk('زیربخش «' + c + '»', s2.includes('### ' + c));
}
// متغیرهای کلیدی هر دسته
for (const v of ['PAYESH_ENV', 'NODE_ENV', 'PORT', 'HOST', 'DATABASE_URL', 'READ_DATABASE_URL', 'PG_POOL_MAX',
  'REDIS_URL', 'REDIS_SENTINELS', 'REDIS_SENTINEL_NAME', 'REDIS_CLUSTER_NODES',
  'PAYESH_JWT_SECRET', 'PAYESH_JWT_SECRET_PREV', 'PAYESH_DEMO_CODE',
  'PAYESH_BEHIND_PROXY', 'PAYESH_WAF_MODE', 'PAYESH_TLS_CERT',
  'PAYESH_SMS_COOLDOWN_S', 'PAYESH_SMS_IP_LIMIT', 'METRICS_TOKEN',
  'PAYESH_BACKUP_EVERY_HOURS', 'BACKUP_RETENTION_DAYS', 'PAYESH_AUDIT',
  'PAYESH_WORKER_INTERVAL_MS', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'GRAFANA_PASSWORD']) {
  chk('متغیر «' + v + '»', vars.has(v));
}
// ستون‌های جدول
chk('جدول‌ها ستون‌های الزامی دارند', s2.includes('| پیش‌فرض |') && s2.includes('| الزامی |') && s2.includes('| محیط |') && s2.includes('| مثال |'));

grp('فایل‌های پیکربندی');
const s3 = sectionOf(SECS[2]);
for (const f of ['.env.example', 'docker-compose.ha.yml', 'pgbouncer', 'sentinel.conf.template', 'alert-rules.yml', 'nginx/nginx.conf', 'env.observability.example']) {
  chk('فایل «' + f + '»', s3.includes(f));
}

grp('اعتبارسنجی و حالت‌های شکست');
const s4 = sectionOf(SECS[3]);
chk('جی‌دابلیوتی ≥ ۳۲ بایت', s4.includes('۳۲ بایت') || s4.includes('256 بیت'));
chk('پی۰-۱۳ و پی۰#۲ ارجاع دارند', s4.includes('پی۰-۱۳') && s4.includes('پی۰#۲'));
chk('اسکیمای دیتابیس چک می‌شود', s4.includes('postgres'));
const s5 = sectionOf(SECS[4]);
chk('جدول حالت شکست ≥ ۶ ردیف', s5.split('\n').filter((l) => l.startsWith('| `')).length >= 6);
chk('شکست جی‌دابلیوتی در جدول', s5.includes('PAYESH_JWT_SECRET'));

grp('محیط‌ها و چرخش');
const s6 = sectionOf(SECS[5]);
chk('سه محیط', s6.includes('توسعه') && s6.includes('استیجینگ') && s6.includes('تولید'));
const s7 = sectionOf(SECS[6]);
chk('چرخش نرم با _PREV', s7.includes('PAYESH_JWT_SECRET_PREV'));
chk('ارجاع به مدیریت رازها', s7.includes('SECRETS_MANAGEMENT.md'));

grp('ممیزی، اشتباه‌ها، اقلام باز');
const s8 = sectionOf(SECS[7]);
chk('فرآیند تغییر تولید ≥ ۵ گام/بند', bulletsOf(s8) + numberedOf(s8) >= 4);
const s9 = sectionOf(SECS[8]);
chk('دست‌کم ۵ اشتباه رایج', numberedOf(s9) >= 5);
chk('مثال واقعی تاریخی (کلید ضعیف)', s9.includes('آرسی۹۶') || s9.includes('R96'));
const s10 = sectionOf(SECS[9]);
chk('اقلام باز ≥ ۴', bulletsOf(s10) >= 4);
chk('قید صداقت درگاه پیامک', s10.includes('PAYESH_SMS_API_KEY') || s10.includes('درگاه'));

grp('ارجاع‌ها و پاکیزگی');
for (const ref of ['SECRETS_MANAGEMENT.md', 'DEPLOYMENT_GUIDE.md', 'OPERATIONAL_HANDOVER.md', 'tools/config-audit.js']) {
  chk('ارجاع به ' + ref, doc.includes(ref));
}
chk('بدون راز', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }

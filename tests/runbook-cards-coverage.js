#!/usr/bin/env node
/* runbook-cards-coverage.js — پوشش بستهٔ کارت‌های ران‌بورد on-call (چت ۶، مأموریت ۲۵) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'docs', 'RUNBOOK_CARDS');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('پوشهٔ کارت‌ها وجود دارد', fs.existsSync(DIR));

const CARDS = [
  ['RC-001', 'REDIS_REVIVE.md', 'احیای ردیس', '۵'],
  ['RC-002', 'PG_PRIMARY_FAILOVER.md', 'فیلاور اولیهٔ پستگرس', '۱۵'],
  ['RC-003', 'PG_PITR_RESTORE.md', 'بازیابی نقطه‌ای پستگرس', '۶۰'],
  ['RC-004', 'SERVICE_ROLLBACK.md', 'بازگشت سرویس', '۱۰'],
  ['RC-005', 'SESSION_REVOCATION.md', 'ابطال اضطراری نشست‌ها', '۵'],
  ['RC-006', 'JWT_SECRET_ROTATION.md', 'چرخش اضطراری کلید جی‌دبلیوتی', '۱۰'],
  ['RC-007', 'RATE_LIMIT_EMERGENCY.md', 'محدودسازی نرخ اضطراری', '۵'],
  ['RC-008', 'BACKUP_RESTORE.md', 'بازیابی پشتیبان', '۹۰'],
  ['RC-009', 'DISK_FULL_EMERGENCY.md', 'پر شدن دیسک', '۲۰'],
  ['RC-010', 'DDOS_MITIGATION.md', 'مقابله با دیداس', '۱۵'],
  ['RC-016', 'RC-016.md', 'هشدار پایش امنیت زمان اجرا', '۱۵'],
];

grp('ساختار A4 هر ۱۱ کارت');
CARDS.forEach(([id, file, title, budget]) => {
  const p = path.join(DIR, file);
  const exists = fs.existsSync(p);
  chk(id + ' وجود دارد (' + file + ')', exists);
  if (!exists) return;
  const doc = fs.readFileSync(p, 'utf8');
  chk(id + ' عنوان و شناسه دارد', doc.includes('# کارت ران‌بورد') && doc.includes('| شناسه | ' + id + ' |'));
  chk(id + ' محرک + تأثیر', doc.includes('**Trigger') && doc.includes('**Impact'));
  chk(id + ' بودجهٔ زمانی ≤' + budget + ' دقیقه', doc.includes('بودجهٔ زمانی') && doc.includes('≤' + budget + ' دقیقه'));
  chk(id + ' گام‌ها با تأیید هر گام', doc.includes('## Steps') && doc.includes('**تأیید:**'));
  chk(id + ' بازگشت + تشدید', doc.includes('## Rollback') && doc.includes('## Escalation'));
  chk(id + ' حداکثر ۶۰ خط (A4)', doc.split('\n').length <= 62, String(doc.split('\n').length));
});

grp('محتوای کلیدی کارت‌ها');
const get = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
chk('RC-002 اسکریپت فیلاور پستگرس را دارد', get('PG_PRIMARY_FAILOVER.md').includes('failover-postgres.sh') && get('PG_PRIMARY_FAILOVER.md').includes('--live'));
chk('RC-003 اسکریپت بازیابی نقطه‌ای را دارد', get('PG_PITR_RESTORE.md').includes('pitr-restore.sh') && get('PG_PITR_RESTORE.md').includes('--native') && get('PG_PITR_RESTORE.md').includes('pitr-verify.sh'));
chk('RC-001 فیلاور ردیس + سنتینل', get('REDIS_REVIVE.md').includes('failover-redis.sh') && get('REDIS_REVIVE.md').includes('sentinel'));
chk('RC-004 بازگشت غلتان کوبرنیتی', get('SERVICE_ROLLBACK.md').includes('kubectl rollout undo'));
chk('RC-005 سه حالت ابطال (همه/کاربر/بازهٔ جی‌تی‌آی)', (() => { const d = get('SESSION_REVOCATION.md'); return d.includes('revoke-all') && d.includes('کاربر') && d.includes('jti'); })());
chk('RC-006 چرخش غلتان با کلید قبلی', (() => { const d = get('JWT_SECRET_ROTATION.md'); return d.includes('PAYESH_JWT_SECRET') && d.includes('PAYESH_JWT_SECRET_PREV'); })());
chk('RC-007 حالت اِجرای دیوار آتش', get('RATE_LIMIT_EMERGENCY.md').includes('PAYESH_WAF_MODE=enforce'));
chk('RC-010 ترکیب سه‌گانهٔ دیداس', (() => { const d = get('DDOS_MITIGATION.md'); return d.includes('enforce') && d.includes('کش') && d.includes('سقف نرخ'); })());
chk('RC-016 سه آلارم runtime و پیوند مهار را دارد', (() => { const d = get('RC-016.md'); return d.includes('AnomalyDetected') && d.includes('AttackPatternSignature') && d.includes('SuspiciousSession') && d.includes('RATE_LIMIT_EMERGENCY.md'); })());

grp('فهرست و نقشهٔ تصمیم');
const readme = fs.existsSync(path.join(DIR, 'README.md')) ? fs.readFileSync(path.join(DIR, 'README.md'), 'utf8') : '';
chk('README وجود دارد', readme.length > 0);
CARDS.forEach(([id, file]) => chk('فهرست: ردیف ' + id + ' با لینک', readme.includes('| ' + id + ' |') && readme.includes('(' + file + ')')));
chk('نقشهٔ درخت تصمیم وجود دارد', readme.includes('نقشهٔ درخت تصمیم'));
chk('هر کارت در درخت تصمیم ارجاع شده', CARDS.every(([id, file]) => readme.includes('(' + file + ')')));

grp('امنیت و جایگاه در کتابخانه');
const allText = CARDS.map(([id, file]) => fs.existsSync(path.join(DIR, file)) ? fs.readFileSync(path.join(DIR, file), 'utf8') : '').join('\n');
chk('هیچ رازی در کارت‌ها نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(allText));
chk('ردیف نمایه برای پوشهٔ کارت‌ها وجود دارد', rd('docs/DOCS_INDEX.md').includes('RUNBOOK_CARDS'));
chk('پاسخ به حادثه به کارت‌ها ارجاع می‌دهد', rd('docs/INCIDENT_RESPONSE.md').includes('RUNBOOK_CARDS'));
chk('ران‌بورد بازیابی به کارت‌ها ارجاع می‌دهد', rd('docs/DR_RUNBOOK.md').includes('RUNBOOK_CARDS'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);

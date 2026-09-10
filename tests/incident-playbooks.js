#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   incident-playbooks.js — پوشش‌سنجِ ساختاریِ docs/INCIDENT_RESPONSE.md
   (سندِ اجباریِ §30 — چت ۶):
     IP-SEV   چهار سطحِ شدت (P0..P3) با تعریف و نمونه
     IP-PROC  شش‌مرحلهٔ پاسخ + جدولِ زمان‌بندی هر سطح
     IP-PB    ده پلی‌بوک؛ هرکدام با تشخیص/مهار/بازیابی/بازگشت/چک‌لیست
     IP-COMM  اطلاع‌رسانیِ داخلی/بیرونی/صفحهٔ وضعیت
     IP-POST  قالبِ پست‌مورتم با پنج فیلدِ الزامی
   اجرا: node tests/incident-playbooks.js
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

const ir = rd('docs/INCIDENT_RESPONSE.md');
if (!ir) { console.log('❌ docs/INCIDENT_RESPONSE.md نیست'); process.exit(1); }

/* برشِ یک بخشِ ## تا ## بعدی — سرفصل‌های داخلِ بلوکِ کد نادیده گرفته می‌شوند */
function sectionOf(re) {
  const lines = ir.split('\n');
  let start = -1, end = lines.length, fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) fence = !fence;
    if (fence || !/^## /.test(lines[i])) continue;
    if (start >= 0) { end = i; break; }
    if (re.test(lines[i])) start = i;
  }
  return start >= 0 ? lines.slice(start, end).join('\n') : null;
}

const sec1 = sectionOf(/سطوح شدت|Severity Levels/) || '';
const sec2 = sectionOf(/فرایند پاسخ|Response Process/) || '';
const sec3 = sectionOf(/پلی‌بوک|Playbooks/) || '';
const sec4 = sectionOf(/اطلاع‌رسانی|Communication/) || '';
const sec5 = sectionOf(/پست‌مورتم|Postmortem Template/) || '';

/* ── IP-SEV ── */
grp('IP-SEV — سطوحِ شدت');
[['بحرانی', /بحرانی/], ['بالا', /بالا/], ['متوسط', /متوسط/], ['پایین', /پایین/]].forEach(([label, re], i) =>
  chk('سطحِ «P' + i + '» (' + label + ') تعریف شده', new RegExp('\\*\\*P' + i + '[^*]*' + re.source).test(sec1)));
chk('P0 شاملِ سه نمونهٔ الزامی: قطعی/از‌دست‌رفتنِ داده/نفوذ',
  /outage/.test(sec1) && /data loss/.test(sec1) && /security breach/.test(sec1));
chk('قاعدهٔ شک: شک به داده/نفوذ = ‏P0 تا اثباتِ خلاف', /فرض می‌شود|فرض شود/.test(sec1) && /P0/.test(sec1));

/* ── IP-PROC ── */
grp('IP-PROC — فرایندِ پاسخ');
const STAGES = ['Detect', 'Alert', 'Triage', 'Contain', 'Recover', 'Postmortem'];
let prev = -1, ordered = true;
STAGES.forEach((s) => { const i = sec2.indexOf(s); if (i < 0 || i <= prev) ordered = false; prev = i; });
chk('شش مرحله به‌ترتیب: ' + STAGES.join(' → '), ordered);
chk('برایِ هر مرحله مسئول و خروجی تعریف شده', /فرمانده/.test(sec2) && /خروجی/.test(sec2));
chk('زمانِ تأییدِ حضور: ‏P0 پنج دقیقه / ‏P1 پانزده دقیقه', /۵ دقیقه/.test(sec2) && /۱۵ دقیقه/.test(sec2));
chk('زمان‌بندیِ سطوحِ پایین‌تر هم آمده', /۱ ساعت/.test(sec2) && /روز کاری/.test(sec2));
chk('ستون‌هایِ مهار و حل در جدولِ زمان‌بندی هست', /مهار/.test(sec2) && /حل/.test(sec2));

/* ── IP-PB — ده پلی‌بوک ── */
grp('IP-PB — پلی‌بوک‌هایِ حوادثِ رایج');
const PBS = [
  ['PB-01', 'Database Down', /خرابی.*PG|PG primary/],
  ['PB-02', 'Redis Down', /ردیس|ردیس از دسترس/],
  ['PB-03', 'High Error Rate', /5xx|خطا/],
  ['PB-04', 'High Latency', /تأخیر/],
  ['PB-05', 'Memory Leak', /هیپ|نشتی|حافظه/],
  ['PB-06', 'Disk Full', /دیسک/],
  ['PB-07', 'Certificate Expiry', /گواهی/],
  ['PB-08', 'Security Breach', /نفوذ|نشت/],
  ['PB-09', 'DDoS Attack', /حمله|محروم‌سازی/],
  ['PB-10', 'Sync Queue Backup', /صف همگام‌سازی|انباشت/]
];
const pbs = sec3.split(/^### /m).slice(1); /* بدنهٔ هر پلی‌بوک */
PBS.forEach(([id, en, faRe]) => {
  const body = pbs.find((b) => b.startsWith(id));
  chk(id + ' «' + en + '» وجود دارد', !!body && faRe.test(body));
  if (body) {
    chk(id + ' بخشِ تشخیص دارد', /تشخیص/.test(body));
    chk(id + ' بخشِ مهار دارد', /مهار/.test(body));
    chk(id + ' بخشِ بازیابی دارد', /بازیابی/.test(body));
    chk(id + ' بخشِ بازگشت دارد', /بازگشت/.test(body));
    chk(id + ' چک‌لیستِ پست‌مورتم دارد', /چک‌لیست پست‌مورتم/.test(body));
  }
});
chk('پلی‌بوک‌ها به ابزارهایِ واقعیِ ریپو ارجاع می‌دهند', /tools\/failover-postgres\.sh/.test(sec3) && /tools\/failover-redis\.sh/.test(sec3));
chk('پلی‌بوکِ دیتابیس به سناریویِ رسمیِ دی‌آر وصل است', /DR_RUNBOOK/.test(sec3));
chk('پلی‌بوکِ امنیت: چرخشِ جی‌دبلیوتی + حفظِ شواهد', /PAYESH_JWT_SECRET/.test(sec3) && /شواهد/.test(sec3));
chk('پلی‌بوکِ دی‌دی‌اس به سندِ دبلیو‌ای‌اف وصل است', /WAF_DDOS_SETUP\.md/.test(sec3));

/* ── IP-COMM ── */
grp('IP-COMM — اطلاع‌رسانی');
chk('ارتباطِ داخلی (تیم/آن‌کال + هندآف)', /داخلی/.test(sec4) && /HANDOFF/.test(sec4));
chk('ارتباطِ بیرونی با مرجعیتِ ناظر', /بیرونی/.test(sec4) && /ناظر/.test(sec4));
chk('ذکرِ ذی‌نفعِ سازمانی (وزارت آموزش‌وپرورش)', /وزارت/.test(sec4));
chk('صفحهٔ وضعیت با شناسه و چرخهٔ سه‌حالته', /صفحه/.test(sec4) && /شناسه/.test(sec4));

/* ── IP-POST ── */
grp('IP-POST — قالبِ پست‌مورتم');
chk('اصلِ بی‌سرزنش', /بی‌سرزنش|blameless/.test(sec5));
chk('فیلدِ خط زمانی', /خط زمانی|Timeline/.test(sec5));
chk('فیلدِ ریشه (با پنج چرا)', /ریشه/.test(sec5) && /پنج چرا/.test(sec5));
chk('فیلدِ اثر (مدت/کاربران/بودجهٔ خطا/داده)', /اثر|Impact/.test(sec5) && /بودجهٔ خطا/.test(sec5));
chk('فیلدِ اقداماتِ اصلاحی با مالک و مهلت', /اقدامات اصلاحی/.test(sec5) && /مالک/.test(sec5) && /مهلت/.test(sec5));
chk('فیلدِ پیشگیری', /پیشگیری/.test(sec5));
chk('ارجاعِ متقابل به ران‌بوکِ تولید', /PRODUCTION_RUNBOOK/.test(ir));

console.log('\n' + '─'.repeat(52));
console.log(`نتیجهٔ پلی‌بوک‌هایِ حادثه: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);

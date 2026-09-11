#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   disaster-recovery-coverage.js — سنجه‌های سندِ معماریِ بازیابی
   (سندِ اجباریِ §30: docs/DISASTER_RECOVERY.md):
     DR2-SEC   هر هشت بخشِ الزامی موجود باشد
     DR2-REF   هر ارجاعِ فایل در سند به فایلِ واقعیِ ریپو برسد
     DR2-TAB   جدولِ سیاستِ آر‌پی‌او/آر‌تی‌او برای چهار سناریو + مسئول
     DR2-BKP   راهبرد پشتیبان با نگهداریِ مشخص
     DR2-REP   توپولوژیِ تکثیرِ دیتابیس/ردیس/منطقه
     DR2-FLW   نقشهٔ تصمیمِ چهار سناریو + ارجاعِ اجرا به ران‌بوک
     DR2-TST   چرخهٔ آزمون: ماهانه/فصلی/سالانه + ثبتِ مانور
     DR2-VAL   راستی‌آزماییِ پنج‌گانهٔ پس از بازیابی
   اجرا: node tests/disaster-recovery-coverage.js
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

const doc = rd('docs/DISASTER_RECOVERY.md');
if (!doc) { console.log('❌ docs/DISASTER_RECOVERY.md نیست'); process.exit(1); }

/* ── DR2-SEC ── */
grp('DR2-SEC — بخش‌های هشت‌گانه');
[
  ['سیاست آر‌پی‌او/آر‌تی‌او', /سیاست آر‌پی‌او ?\/ ?آر‌تی‌او|RPO\/RTO Policy/],
  ['راهبرد پشتیبان', /راهبرد پشتیبان|Backup Strategy/],
  ['توپولوژی تکثیر', /توپولوژی تکثیر|Replication Topology/],
  ['رویه‌های فیلاور', /رویه‌های فیلاور|Failover Procedures/],
  ['آزمون بازیابی', /آزمون بازیابی|Recovery Testing/],
  ['برنامهٔ ارتباطات', /برنامهٔ ارتباطات|Communication/],
  ['راستی‌آزمایی پس از بازیابی', /راستی‌آزمایی پس از بازیابی|Post-Recovery/],
  ['محدودیت‌های صادقانه', /محدودیت‌های صادقانه/]
].forEach(([label, re]) => chk('بخشِ «' + label + '» در سند هست', re.test(doc)));

/* ── DR2-REF ── */
grp('DR2-REF — ارجاع‌های فایلِ زنده');
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh)/g) || []))];
chk('سند به فایل‌های ریپو ارجاع می‌دهد', refs.length >= 6, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها به فایلِ موجود می‌رسند', dead.length === 0, dead.join(','));
['docs/DR_RUNBOOK.md', 'docs/RELIABILITY_DR_PLAN.md', 'docs/HA_POSTGRES.md', 'docs/HA_REDIS.md'].forEach((f) =>
  chk('سند به ' + f + ' وصل است', doc.includes(f)));

/* ── DR2-TAB ── */
grp('DR2-TAB — جدولِ سیاست');
chk('چهار سناریو: پستگرس/ردیس/مرکز داده/فساد', /پستگرسِ اصلی/.test(doc) && /خرابی ردیس/.test(doc) && /مرکز داده/.test(doc) && /فساد/.test(doc));
chk('ستونِ مسئول در جدول هست', /مسئول/.test(doc));
chk('سقفِ پستگرس: آر‌پی‌او ≤ ۵ دقیقه و آر‌تی‌او ≤ ۱۵ دقیقه', /≤ ۵ دقیقه/.test(doc) && /≤ ۱۵ دقیقه/.test(doc));
chk('سقفِ ردیس: آر‌پی‌او ≤ ۱ دقیقه و آر‌تی‌او ≤ ۵ دقیقه', /≤ ۱ دقیقه/.test(doc) && /≤ ۵ دقیقه/.test(doc));
chk('سقفِ منطقه‌ای: ≤ ۳۰ دقیقه / ≤ ۴ ساعت', /≤ ۳۰ دقیقه/.test(doc) && /≤ ۴ ساعت/.test(doc));
chk('فساد: بازیابی تا هر نقطه + آر‌تی‌او ≤ ۱ ساعت', /هر نقطه/.test(doc) && /≤ ۱ ساعت/.test(doc));
chk('تفکیکِ «سقفِ سیاست» از «هدفِ عملیاتیِ سخت‌گیرانه‌تر»', /سقف|اهداف عملیاتی/.test(doc));

/* ── DR2-BKP ── */
grp('DR2-BKP — پشتیبان');
chk('پشتیبانِ پستگرس: کامل هفتگی + تفاضلی روزانه + آرشیو پیوسته', /هفتگی/.test(doc) && /روزانه/.test(doc) && /آرشیو/.test(doc));
chk('پشتیبانِ ردیس با ابزارِ رسمی', /tools\/redis-backup\.sh/.test(doc));
chk('فضای شیئی: نسخه‌بندی + تکثیر بین‌منطقه‌ای', /نسخه‌بندی/.test(doc) && /بین‌منطقه‌ای/.test(doc));
chk('نگهداری: پستگرس ۳۰ روز، ردیس ۷ روز، شیئی ۱ سال', /۳۰ روز/.test(doc) && /۷ روز/.test(doc) && /۱ سال/.test(doc));
chk('رمزنگاریِ پشتیبان‌ها', /رمزنگاری/.test(doc));

/* ── DR2-REP ── */
grp('DR2-REP — توپولوژی');
chk('پستگرس: اصلی + آمادهٔ داغ استریمینگ', /استریمینگ/.test(doc) && /آمادهٔ داغ/.test(doc));
chk('ردیس: اصلی + ۲ کپی + ۳ نگهبان', /۲ کپی/.test(doc) && /۳ نگهبان/.test(doc));
chk('دو منطقه: تهران و تبریز', /تهران/.test(doc) && /تبریز/.test(doc));
chk('ارجاع به زیرساختِ کامپوز', /docker-compose\.ha\.yml/.test(doc) && /docker-compose\.sentinel\.yml/.test(doc));

/* ── DR2-FLW ── */
grp('DR2-FLW — نقشهٔ تصمیم');
const flows = (doc.match(/تشخیص[^]*?تصمیم[^]*?اقدام[^]*?تأیید/g) || []);
chk('دست‌کم چهار نقشهٔ «تشخیص←تصمیم←اقدام←تأیید»', flows.length >= 4, String(flows.length));
chk('اجرای لحظهٔ حادثه به ران‌بوک بازیابی واگذار شده', /DR_RUNBOOK\.md/.test(doc) && /ران‌بوک/.test(doc));

/* ── DR2-TST ── */
grp('DR2-TST — چرخهٔ آزمون');
chk('دریلِ ری‌استور: ماهانه', /ماهانه/.test(doc));
chk('دریلِ فیلاور: فصلی', /فصلی/.test(doc));
chk('مانورِ تمام‌منطقه: سالانه', /سالانه/.test(doc));
chk('ثبتِ هر مانور در جدولِ ران‌بوک', /ثبت/.test(doc) && /مانور/.test(doc));
chk('قاعدهٔ «بی‌آزمون = انجام‌نشده»', /بی‌آزمون|بی‌ثبت/.test(doc));

/* ── DR2-COM + DR2-VAL + DR2-HON ── */
grp('DR2-COM — ارتباطات');
chk('زنجیرهٔ داخلی: آن‌کال ← مسئول بحران ← مدیریت', /آن‌کال/.test(doc) && /مدیریت/.test(doc));
chk('صفحهٔ وضعیت با فیلدهای ثابت', /صفحهٔ وضعیت/.test(doc));
chk('نهاد بالادستی: وزارت آموزش‌وپرورش', /آموزش‌وپرورش/.test(doc));
chk('الزامِ رگولاتوری برای نقض داده', /ذی‌صلاح|رگولاتوری/.test(doc));

grp('DR2-VAL — راستی‌آزمایی پس از بازیابی');
chk('سلامت داده: شمارش + چک‌سام', /چک‌سام/.test(doc));
chk('دودِ برنامه با سه گیت', /گیت/.test(doc));
chk('اعتبار نشست‌ها پس از چرخش رمز', /نشست/.test(doc));
chk('گرم‌شدن کش', /گرم‌شدن/.test(doc));
chk('سلامت کامل + آرشیو فعال روی اصلیِ جدید', /آرشیو/.test(doc) && /سلامت/.test(doc));

grp('DR2-HON — صداقت');
chk('دست‌کم چهار محدودیتِ صادقانهٔ مشخص', (doc.match(/\|\s*(?:استکِ آماده|مانورها|تکثیر بین‌منطقه|نگهداریِ ۳۰روزه|صفحهٔ وضعیت|سند «راه‌اندازی)/g) || []).length >= 4);

console.log('\n' + '─'.repeat(52));
console.log(`نتیجه سندِ بازیابی: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   runbook-coverage.js — پوشش‌سنجِ ساختاریِ docs/PRODUCTION_RUNBOOK.md
   (سندِ اجباریِ §30 — چت ۶):
     RB-SEC   هر ۸ بخشِ الزامی با زیربخش‌هایِ کلیدی
     RB-BOOT  ترتیبِ بوت (پستگرس→ردیس→اپی‌آی→لبه) و خاموشیِ برعکس
     RB-OPS   پایان‌گرهایِ سلامت + آلارم‌هایِ هفت‌گانه + ماتریسِ ارجاع
     RB-CMD   هر ارجاعِ فایل در سند باید به فایلِ واقعیِ ریپو برسد
     RB-OPS2  عملیاتِ روتین/مقیاس/پیکربندی/بازگشت/تماس‌ها
   اجرا: node tests/runbook-coverage.js
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

const rb = rd('docs/PRODUCTION_RUNBOOK.md');
if (!rb) { console.log('❌ docs/PRODUCTION_RUNBOOK.md نیست'); process.exit(1); }

/* برشِ یک بخشِ ## تا ## بعدی — سرفصل‌های داخلِ بلوکِ کد نادیده گرفته می‌شوند */
function sectionOf(re) {
  const lines = rb.split('\n');
  let start = -1, end = lines.length, fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) fence = !fence;
    if (fence || !/^## /.test(lines[i])) continue;
    if (start >= 0) { end = i; break; }
    if (re.test(lines[i])) start = i;
  }
  return start >= 0 ? lines.slice(start, end).join('\n') : null;
}
/* برشِ زیربخشِ ### تا ### یا ## بعدی، از نقطهٔ شروعِ داده‌شده */
function sliceBetween(fromRe, stopRe, fromIdx) {
  const i0 = rb.search(fromRe);
  if (i0 < 0) return '';
  const rest = rb.slice(i0);
  const m = stopRe ? rest.slice(3).search(stopRe) : -1; /* رد کردنِ خودِ سرفصل */
  return m > 0 ? rest.slice(0, m + 3) : rest;
}

/* ── RB-SEC — هشت بخشِ الزامی ── */
grp('RB-SEC — بخش‌هایِ الزامی');
const SECS = [
  ['نمای معماری (Architecture Overview)', /نمای معماری|Architecture Overview/],
  ['راه‌اندازی و خاموشی (Startup / Shutdown)', /راه‌اندازی و خاموشی|Startup \/ Shutdown/],
  ['پایش و سلامت (Monitoring & Health)', /پایش و سلامت|Monitoring & Health/],
  ['عملیات روتین (Routine Operations)', /عملیات روتین|Routine Operations/],
  ['عملیات مقیاس (Scaling Operations)', /عملیات مقیاس|Scaling Operations/],
  ['تغییرات پیکربندی (Config Changes)', /تغییرات پیکربندی|Config Changes/],
  ['رویه‌های بازگشت (Rollback Procedures)', /رویه‌های بازگشت|Rollback Procedures/],
  ['تماس‌های اضطراری (Emergency Contacts)', /تماس‌های اضطراری|Emergency Contacts/]
];
SECS.forEach(([label, re]) => chk('بخشِ «' + label + '» موجود است', sectionOf(re) !== null));

const sec1 = sectionOf(/نمای معماری/) || '';
const sec2 = sectionOf(/راه‌اندازی و خاموشی/) || '';
const sec3 = sectionOf(/پایش و سلامت/) || '';
const sec4 = sectionOf(/عملیات روتین/) || '';
const sec5 = sectionOf(/عملیات مقیاس/) || '';
const sec6 = sectionOf(/تغییرات پیکربندی/) || '';
const sec7 = sectionOf(/رویه‌های بازگشت/) || '';
const sec8 = sectionOf(/تماس‌های اضطراری/) || '';

/* ── §۱ معماری ── */
grp('§۱ — معماری و مسیرهایِ حیاتی');
['API', 'PgBouncer', 'Redis', 'CDN', 'LB', 'PostgreSQL'].forEach((c) =>
  chk('دیاگرامِ اجزا «' + c + '» را دارد', sec1.includes(c)));
chk('مسیرِ ورود (login) با روتِ رسمی', /\/api\/auth\/login/.test(sec1));
chk('مسیرِ همگام‌سازی (sync)', /\/api\/sync/.test(sec1));
chk('مسیرِ حضور (attendance)', /attendance/.test(sec1));
chk('مسیرِ نمره (grades)', /grades/.test(sec1));
chk('منابعِ مشترکِ بینِ نمونه‌ها تفکیک شده', /منابع مشترک/.test(sec1) && /PostgreSQL/.test(sec1) && /Redis/.test(sec1));
chk('هشدارِ وضعیتِ فعلیِ مقیاسِ افقی (تا ادغامِ موج ۱) صادقانه آمده', /تک‌نمونه‌ای|چندنمونه‌ای امن نیست|موج ۱/.test(sec1));

/* ── §۲ بوت/خاموشی ── */
grp('§۲ — بوت و خاموشی');
chk('چک‌لیستِ پیش‌پرواز قبل از بوت', /پیش‌پرواز/.test(sec2));
chk('پیش‌پرواز: اسکنِ مخفی‌ها + دروازهٔ انتشارِ زنده', /secret-scan/.test(sec2) && /release-gate/.test(sec2));
const bootSlice = sliceBetween(/ترتیب بوت/, /ترتیب خاموشی/);
chk('زیربخشِ ترتیبِ بوت وجود دارد', bootSlice.length > 100);
const bP = bootSlice.indexOf('PostgreSQL'), bR = bootSlice.indexOf('Redis'),
      bA = bootSlice.indexOf('API'), bL = bootSlice.indexOf('LB');
chk('ترتیبِ بوت: پستگرس→ردیس→اپی‌آی→لبه', bP >= 0 && bR > bP && bA > bR && bL > bA,
  [bP, bR, bA, bL].join(','));
chk('بوتِ اپی‌آی شکست‌بسته است (نبودِ کش = خروجِ فاجعه)', /شکست‌بسته|FATAL/.test(bootSlice));
const shutSlice = sliceBetween(/ترتیب خاموشی/, /راستی‌آزمایی خاموشی/);
chk('زیربخشِ ترتیبِ خاموشی وجود دارد', shutSlice.length > 100);
const sL = shutSlice.indexOf('LB'), sA = shutSlice.indexOf('API'),
      sR = shutSlice.indexOf('Redis'), sP = shutSlice.indexOf('PostgreSQL');
chk('ترتیبِ خاموشی برعکس: لبه→اپی‌آی→ردیس→پستگرس', sL >= 0 && sA > sL && sR > sA && sP > sR,
  [sL, sA, sR, sP].join(','));
chk('خاموشی با سیگنالِ آرام (SIGTERM) است', /SIGTERM/.test(shutSlice));
chk('راستی‌آزماییِ خاموشیِ آرام + محدودیتِ شناخته‌شدهٔ تخلیه (موج ۱۵)',
  /راستی‌آزمایی/.test(sec2) && /درحال‌پرواز|در حالِ پرواز/.test(sec2) && /موج ۱۵/.test(sec2));

/* ── §۳ پایش ── */
grp('§۳ — پایش و سلامت');
chk('پایان‌گرِ زندهٔ /api/health مستند است', /\/api\/health/.test(sec3));
chk('پایان‌گرِ /metrics با دروازهٔ توکن', /\/metrics/.test(sec3) && /METRICS_TOKEN/.test(sec3));
chk('قراردادِ موج ۱۵ (liveness/readiness) صادقانه «در انتظار» آمده', /liveness/.test(sec3) && /readiness/.test(sec3) && /موج ۱۵/.test(sec3));
['payesh_http_requests_total', 'payesh_redis_up', 'payesh_db_query_latency_ms', 'payesh_db_pool_',
 'payesh_sync_queue_depth', 'payesh_cache_hits_total', 'payesh_eventloop_lag_ms', 'payesh_process_heap_bytes']
  .forEach((m) => chk('سنجهٔ «' + m + '» در فهرستِ پایش است', sec3.includes(m)));
['HighErrorRate', 'HighLatency', 'RedisDown', 'DBLatencyHigh', 'SyncQueueDepth', 'EventLoopLagHigh', 'MemoryHigh']
  .forEach((a) => chk('آلارمِ «' + a + '» با آستانه آمده', sec3.includes(a)));
chk('ماتریسِ ارجاع: آن‌کال + ناظر + زمان‌بندی', /آن‌کال/.test(sec3) && /ناظر/.test(sec3) && /دقیقه/.test(sec3));
chk('ارجاعِ متقابل به سندِ پاسخِ حادثه', /INCIDENT_RESPONSE/.test(sec3));

/* ── §۴ روتین ── */
grp('§۴ — عملیاتِ روتین');
chk('راستی‌آزماییِ بکاپ (روزانه/دریل)', /بکاپ/.test(sec4) && /pitr-restore|pitr-verify/.test(sec4));
chk('چرخشِ لاگ', /چرخش لاگ/.test(sec4));
chk('چکِ حافظهٔ ردیس', /حافظه/.test(sec4) && /redis/i.test(sec4));
chk('چکِ تورم/وکیومِ پستگرس', /تورم|bloat/i.test(sec4) && /vacuum/i.test(sec4));
chk('تازه‌سازیِ گواهی با پایشِ ۳۰روزه', /گواهی/.test(sec4) && /30|۳۰/.test(sec4));

/* ── §۵ مقیاس ── */
grp('§۵ — عملیاتِ مقیاس');
chk('مقیاسِ افقیِ اپ با پیش‌شرط و رویه', /افقی/.test(sec5) && /DATABASE_URL/.test(sec5));
chk('مقیاسِ عمودی با پنجرهٔ تعمیرات + یادآوریِ ضدالگو', /عمودی/.test(sec5) && /ضدالگو/.test(sec5));
chk('توسعهٔ ردیس', /ردیس/.test(sec5) && /maxmemory/.test(sec5));
chk('افزودنِ رپلیکایِ خواندنِ پستگرس', /رپلیکا/.test(sec5) && /READ_DATABASE_URL/.test(sec5));

/* ── §۶ پیکربندی ── */
grp('§۶ — تغییراتِ پیکربندی');
chk('سرچشمهٔ حقیقتِ متغیرها (.env.example)', /\.env\.example/.test(sec6));
chk('متغیرهایِ اتصال + جی‌دبلیوتی مستندند', /DATABASE_URL/.test(sec6) && /PAYESH_JWT_SECRET/.test(sec6));
chk('چرخشِ رمزِ نشست با کلیدِ قبلی (پیش‌بینی‌شده در کد)', /PAYESH_JWT_SECRET_PREV/.test(sec6));
chk('قاعدهٔ شکست‌بسته برایِ پرچم‌هایِ ویژگی', /پرچم/.test(sec6) && /شکست‌بسته/.test(sec6));
chk('رازها بیرونِ ریپو (اسکنِ نگهبان)', /0600/.test(sec6) && /اسکن/.test(sec6));

/* ── §۷ بازگشت ── */
grp('§۷ — رویه‌هایِ بازگشت');
chk('ارجاع به راهنمایِ استقرار', /DEPLOY\.md/.test(sec7));
chk('بازگشتِ داده/اسکیما به دریلِ دی‌آر وصل است', /DR_RUNBOOK/.test(sec7));
chk('باز-انتشار با دروازهٔ رسمی', /release-gate/.test(sec7));
chk('بیلد هرگز دستی ویرایش نمی‌شود', /build\.js/.test(sec7));

/* ── §۸ تماس‌ها ── */
grp('§۸ — تماس‌هایِ اضطراری');
chk('نقش‌ها: آن‌کال، دی‌بی‌ای، امنیت، استقرار، ناظر', /آن‌کال/.test(sec8) && /دی‌بی‌ای|دیتابیس/.test(sec8) && /امنیت/.test(sec8) && /ناظر/.test(sec8));
chk('روشِ ارتباطی + ثبتِ هندآف', /HANDOFF/.test(sec8) && /کانال/.test(sec8));

/* ── RB-CMD — ارجاع‌هایِ زنده ── */
grp('RB-CMD — ارجاع‌هایِ فایلِ واقعی');
const REF = /(?:docs|tools|infra|tests|server|migrations|nginx)\/[A-Za-z0-9_.\/-]+\.(?:md|sh|js|yml|yaml|ini|conf|template|sql)/g;
const refs = [...new Set((rb.match(REF) || []))];
chk('دست‌کم ۱۵ ارجاعِ فایلی در سند', refs.length >= 15, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها به فایلِ موجود می‌رسند', dead.length === 0, dead.join(','));
chk('سندِ مکمل (پاسخِ حادثه) واقعاً موجود است', fs.existsSync(path.join(ROOT, 'docs/INCIDENT_RESPONSE.md')));

/* ── RB-BR — پیش‌پروازِ انضباطِ شاخه‌های انتشار (C6-06، شیفت ۲) ──
   پینِ ابزارِ فقط‌خواندنیِ tools/branch-preflight.js: سرشماریِ شاخه‌های
   تحویل‌شده/کهنه و نوکِ مشترک + پیش‌پروازِ شاخهٔ نامزدِ انتشار.
   خودآزماییِ ابزار هرمتیک است (مخزنِ اسباب‌بازی در tmpdir؛ شبکه نمی‌خواهد)؛
   این بخش فقط اجرای آن را روی همین ریپو پین می‌کند — بدونِ هیچ نوشتار. */
grp('RB-BR — پیش‌پروازِ شاخه‌های انتشار (ابزار + گاز)');
const { spawnSync } = require('child_process');
const TOOL_BP = path.join(ROOT, 'tools', 'branch-preflight.js');
const runBP = (args) => spawnSync(process.execPath, [TOOL_BP].concat(args), { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
chk('ابزارِ پیش‌پرواز موجود است', fs.existsSync(TOOL_BP));
{
  const st = runBP(['--selftest']);
  chk('خودآزماییِ هرمتیکِ ابزار سبز است (خروجی ۰)', st.status === 0, String(st.stdout + st.stderr).slice(-200));
}
{
  const fl = runBP(['--fleet', '--json']);
  let fj = null; try { fj = JSON.parse(fl.stdout); } catch (e) {}
  chk('سرشماریِ ناوگان خروجی ۰ و جی‌سانِ معتبر دارد',
    fl.status === 0 && !!fj && fj.mode === 'fleet' && !!fj.counts
    && ['total', 'mergedStale', 'live', 'aged', 'sharedTipClusters'].every((k) => typeof fj.counts[k] === 'number'),
    String(fl.stdout + fl.stderr).slice(-200));
}
{
  /* گازِ سطحِ ریپو: «main» هیچ‌گاه نمی‌تواند نسبت به خودش چیزی تحویل بدهد
     ⇒ پیش‌پرواز باید سخت رد کند (خروجی ۱ + حکمِ مردود). */
  const bite = runBP(['--branch', 'main', '--json']);
  let bj = null; try { bj = JSON.parse(bite.stdout); } catch (e) {}
  chk('گاز: پیش‌پروازِ شاخهٔ بدون‌محتوا (main) سخت مردود است',
    bite.status === 1 && !!bj && bj.verdict === 'FAIL',
    'exit=' + bite.status + ' ' + String(bite.stdout + bite.stderr).slice(-160));
}
{
  const usage = runBP([]);
  chk('فراخوانیِ بی‌کاربرگ با خروجی ۲ رد می‌شود (قراردادِ رابط)', usage.status === 2);
}

console.log('\n' + '─'.repeat(52));
console.log(`نتیجهٔ پوششِ ران‌بوک: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   observability-doc-coverage.js — سنجه‌های سندِ یکپارچهٔ رصدپذیری
   (سندِ اجباریِ §30: docs/OBSERVABILITY.md):
     OBS-SEC   هر ده بخشِ الزامی موجود باشد
     OBS-REF   هر ارجاعِ فایل در سند به فایلِ واقعیِ ریپو برسد
     OBS-MET   مدلِ متریک: پیشوندِ استاندارد + متریک‌هایِ زندهٔ کلیدی
     OBS-LOG   مدلِ لاگ: محرمانگی + پلِ شناسهٔ زنجیره
     OBS-TRC   مدلِ تریس: نمونه‌برداری + قراردادِ صدور
     OBS-ALR   سیاستِ آلارم: هر هفت قانونِ زنده + سطوح + ارجاعِ حادثه
     OBS-DSL   داشبوردها + اس‌ال‌او + نگهداری + محدودیت‌هایِ صادقانه
   اجرا: node tests/observability-doc-coverage.js
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

const doc = rd('docs/OBSERVABILITY.md');
if (!doc) { console.log('❌ docs/OBSERVABILITY.md نیست'); process.exit(1); }

/* ── OBS-SEC: ده بخشِ الزامی ── */
grp('OBS-SEC — بخش‌هایِ ده‌گانه');
const SECTIONS = [
  ['معماری کلان', /معماری کلان|Architecture Overview/],
  ['مدل متریک‌ها', /مدل متریک‌ها|Metrics Model/],
  ['مدل لاگ‌ها', /مدل لاگ‌ها|Logs Model/],
  ['مدل تریس‌ها', /مدل تریس‌ها|Traces Model/],
  ['سیاست آلارم', /سیاست آلارم|Alerting Policy/],
  ['داشبوردها', /داشبوردها|Dashboards/],
  ['SLO/SLI', /اس‌ال‌آی \/ اس‌ال‌او|SLO\/SLI/],
  ['پلی‌بوک آن‌کال', /پلی‌بوک آن‌کال|On-Call Playbook/],
  ['هزینه و نگهداری', /هزینه و نگهداری|Cost & Retention/],
  ['محدودیت‌های صادقانه', /محدودیت‌های صادقانه/]
];
SECTIONS.forEach(([label, re]) => chk('بخشِ «' + label + '» در سند هست', re.test(doc)));

/* ── OBS-REF: ارجاع‌هایِ فایلِ زنده ── */
grp('OBS-REF — ارجاع‌هایِ فایلِ زنده');
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools|authz)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
chk('سند به فایل‌هایِ ریپو ارجاع می‌دهد', refs.length >= 8, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها به فایلِ موجود می‌رسند', dead.length === 0, dead.join(','));
['server/metrics.js', 'server/tracing.js', 'server/audit.js'].forEach((f) =>
  chk('سند ' + f + ' را به‌عنوان منبعِ سیگنال می‌شناسد', doc.includes(f)));
chk('سند به راهنمایِ استقرار ارجاع می‌دهد (نه اینکه جایگزینش باشد)', /OBSERVABILITY_DEPLOYMENT\.md/.test(doc));

/* ── OBS-MET: مدلِ متریک ── */
grp('OBS-MET — مدلِ متریک');
chk('پیشوندِ استانداردِ نام‌گذاری', /پیشوند.*`payesh_`|`payesh_`/.test(doc));
const METRICS = ['payesh_http_requests_total', 'payesh_http_request_duration_seconds', 'payesh_redis_up',
  'payesh_db_pool_total', 'payesh_sync_queue_depth', 'payesh_cache_hits_total',
  'payesh_eventloop_lag_ms', 'payesh_process_heap_bytes', 'payesh_build_info'];
METRICS.forEach((m) => chk('متریکِ زندهٔ ' + m + ' در جدول هست', doc.includes(m)));
chk('نگهبانِ کاردینالیتی (برچسبِ بی‌کران ممنوع) مستند است', /کاردینالیتی/.test(doc));
chk('ضدرانشِ سه‌جانبه (متریک⇄آلارم⇄داشبورد) مستند است', /ضدرانش|قفل/.test(doc));
chk('شکاف‌هایِ متریکِ امنیت/کسب‌وکار صادقانه آمده', /شکاف/.test(doc));

/* ── OBS-LOG: مدلِ لاگ ── */
grp('OBS-LOG — مدلِ لاگ');
chk('ساختارِ ساخت‌یافتهٔ جی‌سان', /جی‌سان|JSON/.test(doc));
chk('پلِ همبستگیِ شناسهٔ زنجیره در لاگ', /`trace_id`/.test(doc));
chk('قاعدهٔ محرمانگی: رمز/توکن هرگز', /رمز عبور|توکن/.test(doc) && /هرگز/.test(doc));
chk('شمارهٔ ملی فقط ماسک‌شده', /ماسک‌شده|maskNationalId/.test(doc));
chk('چرخش/نگهداریِ لاگ مشخص است', /چرخش/.test(doc) && /۳۰ روز/.test(doc));

/* ── OBS-TRC: مدلِ تریس ── */
grp('OBS-TRC — مدلِ تریس');
chk('نمونه‌برداریِ تولید ۱۰٪', /۱۰٪|10٪|10%/.test(doc));
chk('نمونه‌برداریِ توسعه ۱۰۰٪', /۱۰۰٪|100٪|100%/.test(doc));
chk('قراردادِ صدورِ استاندارد (دبلیوسی۳ + او‌تی‌ال‌پی)', /دبلیوسی۳|W3C/.test(doc) && /OTLP|اُتی‌ال‌پی/.test(doc));
chk('شکستِ تله‌متری باز-رو است (سرویس نمی‌افتد)', /باز-رو|باز رو/.test(doc));
chk('قراردادِ نام‌گذاریِ اسپن (سرویس.منبع.عملیات)', /سرویس\.منبع\.عملیات|نام‌گذاری اسپن/.test(doc));

/* ── OBS-ALR: سیاستِ آلارم ── */
grp('OBS-ALR — سیاستِ آلارم');
const ALERTS = ['HighErrorRate', 'RedisDown', 'HighLatency', 'DBLatencyHigh', 'SyncQueueDepth', 'EventLoopLagHigh', 'MemoryHigh'];
ALERTS.forEach((a) => chk('قانونِ آلارمِ ' + a + ' در جدول هست', doc.includes(a)));
chk('چهار سطحِ شدت (پی۰..پی۳) تعریف شده', /پی۰/.test(doc) && /پی۱/.test(doc) && /پی۲/.test(doc) && /پی۳/.test(doc));
chk('ارجاعِ پله‌بندی به سندِ پاسخِ حادثه', /INCIDENT_RESPONSE\.md/.test(doc));
chk('هر آلارم یک پلی‌بوک دارد', /پلی‌بوک/.test(doc));

/* ── OBS-DSL: داشبورد/اس‌ال‌او/نگهداری/صداقت ── */
grp('OBS-DSL — داشبورد، اس‌ال‌او، نگهداری، صداقت');
chk('داشبوردِ اصلی + لاگ‌ها نام برده شده', /payesh-main\.json/.test(doc) && /payesh-logs\.json/.test(doc));
chk('اهدافِ اس‌ال‌او مطابقِ §۲۹ نقشهٔ راه', /۱۰۰ میلی‌ثانیه/.test(doc) && /۳۰۰ میلی‌ثانیه/.test(doc) && /۱ ثانیه/.test(doc) && /۰\.۱٪|۰٫۱٪/.test(doc));
chk('بودجهٔ خطا با سیاستِ توقفِ انتشار', /بودجهٔ خطا/.test(doc) && /توقف انتشار/.test(doc));
chk('اهدافِ نگهداری: متریک ۹۰ روز، لاگ ۳۰ روز، تریس ۷ روز', /۹۰ روز/.test(doc) && /۷ روز/.test(doc));
chk('محدودیت‌هایِ صادقانه (دست‌کم سه موردِ مشخص)', (doc.match(/\|\s*(?:اجرای استک|متریک‌های امنیت|لاگر عمومی|داشبورد اختصاصی|نمونه‌برداری دمی|نگهداری)/g) || []).length >= 3);
chk('اصلِ کلان: تله‌متری باز-رو، امنیت شکست‌بسته', /باز-رو/.test(doc) && /شکست‌بسته/.test(doc));

console.log('\n' + '─'.repeat(52));
console.log(`نتیجه سندِ رصدپذیری: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);

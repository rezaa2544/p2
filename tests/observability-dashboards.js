#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   observability-dashboards.js — سنجه‌های داشبوردهایِ Grafana (ویو ۱۴)
     DS-JSON  پارسِ JSON + ساختارِ dashboard (uid/title/panels/gridPos)
     DS-COV   پوششِ الزامیِ پنل‌ها (RPS، p50/95/99، 4xx/5xx، DB، Redis،
              cache hit، queue depth، lag+heap+GC) با exprهایِ معنادار
     DS-LOKI  داشبوردِ لاگ: متغیر trace_id + exprهایِ LokiQL
     DS-DS    uid دیتاسورس‌ها با provisioningِ گرافانا هم‌خوان (ضدرانش)
     DS-MET   نام‌های متریکِ داشبورد ⊆ متریک‌های واقعیِ server/metrics.js
   اجرا: node tests/observability-dashboards.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 180) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 180) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch (e) { return null; } };
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };

const main = readJson('infra/observability/dashboards/payesh-main.json');
const logs = readJson('infra/observability/dashboards/payesh-logs.json');
const metricsJs = rd('server/metrics.js') || '';

grp('DS-JSON — ساختار');
chk('payesh-main.json پارس می‌شود', !!main);
chk('payesh-logs.json پارس می‌شود', !!logs);
if (main) {
  chk('main: uid/title/timezone صحیح', main.uid === 'payesh-main' && /Payesh/.test(main.title) && main.timezone === 'Asia/Tehran');
  const ids = (main.panels || []).map((p) => p.id);
  chk('main: پنل‌ها ≥ ۱۰ با id یکتا', (main.panels || []).length >= 10 && new Set(ids).size === ids.length);
  chk('main: gridPos در بوم ۲۴تایی', (main.panels || []).every((p) => p.gridPos && p.gridPos.x + p.gridPos.w <= 24 && p.gridPos.w > 0 && p.gridPos.h > 0));
  chk('main: همهٔ پنل‌ها از نوعِ مجاز', (main.panels || []).every((p) => ['timeseries', 'stat', 'gauge', 'logs', 'table'].includes(p.type)));
  chk('main: هیچ پنلی exprِ تهی ندارد', (main.panels || []).every((p) => (p.targets || []).length > 0 && p.targets.every((t) => (t.expr || '').length > 5)));
}
if (logs) {
  chk('logs: متغیر trace_id تعریف شده', (logs.templating.list || []).some((v) => v.name === 'trace_id' && v.type === 'textbox'));
  chk('logs: پنلِ type=logs با LokiQL', (logs.panels || []).some((p) => p.type === 'logs' && (p.targets || []).some((t) => /\{service="payesh"/.test(t.expr || ''))));
  chk('logs: فیلتر trace_id=~"$trace_id" در expr هست', (logs.panels || []).some((p) => (p.targets || []).some((t) => /trace_id=~"\$trace_id"/.test(t.expr || ''))));
}

grp('DS-COV — پوششِ الزامی');
const allExprs = main ? (main.panels || []).flatMap((p) => (p.targets || []).map((t) => t.expr || '')).join('\n') : '';
const NEED = [
  ['RPS (rate کل)', /sum\(rate\(payesh_http_requests_total\[5m\]\)\)/],
  ['p50 با histogram_quantile', /histogram_quantile\(0\.50[^\n]*payesh_http_request_duration_seconds_bucket/],
  ['p95 با histogram_quantile', /histogram_quantile\(0\.95[^\n]*payesh_http_request_duration_seconds_bucket/],
  ['p99 با histogram_quantile', /histogram_quantile\(0\.99[^\n]*payesh_http_request_duration_seconds_bucket/],
  ['۴xx/۵xx', /payesh_http_requests_total\{status=~"4xx\|5xx"\}/],
  ['DB latency', /payesh_db_query_latency_ms/],
  ['pool waiting', /payesh_db_pool_waiting/],
  ['Redis latency', /payesh_redis_ping_latency_ms/],
  ['Cache hit ratio', /payesh_cache_hits_total[\s\S]{0,160}payesh_cache_misses_total/],
  ['Sync queue depth', /payesh_sync_queue_depth/],
  ['Event-loop lag', /payesh_eventloop_lag_ms/],
  ['Heap ratio', /payesh_process_heap_bytes\{kind="used"\}[\s\S]{0,80}payesh_process_heap_bytes\{kind="limit"\}/],
  ['GC rate', /rate\(payesh_process_gc_total\[5m\]\)/]
];
NEED.forEach(([label, re]) => chk('پنل/expr: ' + label, re.test(allExprs)));
/* پینِ سفتِ quantile: هر سه پنل باید خودش exprِ هم‌quantile داشته باشد —
   نه اینکه یک پنل دیگر پوششش دهد (Mutation M2). */
const QT = { p50: '0.50', p95: '0.95', p99: '0.99' };
const panels = main ? (main.panels || []) : [];
['p50', 'p95', 'p99'].forEach((leg) => {
  const ok = panels.some((p) => (p.targets || []).some((t) =>
    t.legendFormat === leg && new RegExp('histogram_quantile\\(' + QT[leg]).test(t.expr || '')));
  chk('پنل/expr: هدفِ ' + leg + ' با exprِ دقیقاً ' + QT[leg], ok);
});
chk('per-route p95 (گروه‌بندیِ route)', /sum by \(le, route\)/.test(allExprs));

grp('DS-DS — هم‌خوانیِ datasource provisioning');
const prov = rd('infra/observability/grafana/provisioning/datasources/payesh.yml') || '';
const provUids = [...new Set((prov.match(/uid: ([a-z-]+)/g) || []).map((m) => m.split(': ')[1]))];
const dsUids = new Set();
[main, logs].forEach((d) => { if (d) (d.panels || []).forEach((p) => { if (p.datasource && p.datasource.uid) dsUids.add(p.datasource.uid); (p.targets || []).forEach((t) => { if (t.datasource && t.datasource.uid) dsUids.add(t.datasource.uid); }); }); });
const missing = [...dsUids].filter((u) => !provUids.includes(u));
chk('uidهایِ داشبورد ⊆ provisioning (' + provUids.join(',') + ')', missing.length === 0, missing.join(','));
chk('پروایدرِ فایل‌داشبورد، پوشهٔ dashboards را می‌خواند', /path: \/var\/lib\/grafana\/dashboards/.test(rd('infra/observability/grafana/provisioning/dashboards/payesh.yaml') || ''));

grp('DS-MET — متریک‌ها واقعی‌اند');
const dashboardMetrics = [...new Set((allExprs.match(/payesh_[a-z0-9_]+/g) || []))];
const fake = dashboardMetrics.filter((m) => !metricsJs.includes(m));
chk('همهٔ ' + dashboardMetrics.length + ' متریکِ داشبورد در metrics.js زنده‌اند', dashboardMetrics.length >= 8 && fake.length === 0, fake.join(','));

console.log('\n' + '─'.repeat(52));
console.log(`نتیجه Observability Dashboards: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   observability-config.js — سنجه‌های استقرارِ زندهٔ Observability (ویو ۱۴)
     OBS-EXIST  فایل‌های استک
     OBS-YAML   sanity ساختاری (tab/CRLF/تصویرِ پین/sرویس‌ها/bind لوکال)
     OBS-PROM   scrape config ↔ /metrics + rule_files + alertmanager
     OBS-RULES  هر ۷ قانونِ بحرانی با آستانه‌ها و for
     OBS-METRICS نام متریک‌های قوانین ⊆ نام‌های واقعیِ server/metrics.js
     OBS-OTLP   پورت OTLP tracing.js ↔ collector compose (ضدرانش)
     OBS-TOKEN  وایرینگ /metrics در index.js (توکن+۴۰۱+attach+self-guard)
     OBS-SEC    placeholderها در alertmanager؛ رازِ هاردکد نه در infra
   اجرا: node tests/observability-config.js
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
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };

const DIR = 'infra/observability';
const FILES = [DIR + '/docker-compose.observability.yml', DIR + '/prometheus.yml', DIR + '/alert-rules.yml',
  DIR + '/alertmanager.yml', DIR + '/loki-config.yml', DIR + '/promtail.yml', DIR + '/otelcol-config.yml',
  DIR + '/env.observability.example',
  DIR + '/grafana/provisioning/datasources/payesh.yml', DIR + '/grafana/provisioning/dashboards/payesh.yaml',
  DIR + '/dashboards/payesh-main.json', DIR + '/dashboards/payesh-logs.json'];

grp('OBS-EXIST — فایل‌ها');
FILES.forEach((f) => chk(f.split('/').pop(), rd(f) != null));

grp('OBS-YAML — ساختار');
const compose = rd(DIR + '/docker-compose.observability.yml') || '';
const yamls = [compose, rd(DIR + '/prometheus.yml'), rd(DIR + '/alert-rules.yml'), rd(DIR + '/loki-config.yml'),
  rd(DIR + '/promtail.yml'), rd(DIR + '/otelcol-config.yml'), rd(DIR + '/alertmanager.yml')];
yamls.forEach((y, i) => { if (y) chk('yaml#' + i + ' بدون tab/CRLF', !y.includes('\t') && !y.includes('\r\n')); });
chk('تصویرها پین (هیچ latest نیست)', !/image:\s*\S+:latest/m.test(compose));
['prometheus', 'alertmanager', 'grafana', 'loki', 'promtail', 'otel-collector', 'jaeger'].forEach((svc) =>
  chk('سرویس «' + svc + '» در compose', new RegExp('\\n  ' + svc + ':').test(compose)));
chk('همهٔ پورت‌های published روی 127.0.0.1', !/ports:\s*\n\s*-\s*"0\.0\.0\.0:/m.test(compose)
  && (compose.match(/"127\.0\.0\.1:\d+:\d+"/g) || []).length >= 7);
chk('restart و retention برای سرویس‌های stateful', (compose.match(/restart: unless-stopped/g) || []).length >= 6 && /retention/i.test(compose));

grp('OBS-PROM — scrape config');
const prom = rd(DIR + '/prometheus.yml') || '';
chk('job payesh-api با metrics_path: /metrics', /job_name: payesh-api/.test(prom) && /metrics_path: \/metrics\s*$/m.test(prom));
chk('target از طریق host.docker.internal (اسکرپِ میزبان)', /host\.docker\.internal:3000/.test(prom));
chk('rule_files به alert-rules.yml', /alert-rules\.yml/.test(prom));
chk('rule_files شامل هر دو alert-rules.yml و alerts.yml',
  /rule_files:\s*\n\s*-\s*\/etc\/prometheus\/alert-rules\.yml\s*\n\s*-\s*\/etc\/prometheus\/alerts\.yml/.test(prom));
chk('compose mount هم‌خوانی دارد: alerts.yml به /etc/prometheus/alerts.yml:ro',
  /\.\/alerts\.yml:\/etc\/prometheus\/alerts\.yml:ro/.test(compose));
chk('مسیرِ alertmanager در prometheus.yml', /alertmanager:9093/.test(prom));

grp('OBS-RULES — قوانینِ بحرانی');
const rules = rd(DIR + '/alert-rules.yml') || '';
const RULES = [
  ['HighErrorRate', /alert: HighErrorRate[\s\S]*?0\.001/],
  ['HighLatency', /alert: HighLatency[\s\S]*?histogram_quantile\(0\.95[\s\S]*?0\.300/],
  ['RedisDown', /alert: RedisDown[\s\S]*?payesh_redis_up == 0/],
  ['DBLatencyHigh', /alert: DBLatencyHigh[\s\S]*?payesh_db_query_latency_ms > 50/],
  ['SyncQueueDepth', /alert: SyncQueueDepth[\s\S]*?payesh_sync_queue_depth > 1000/],
  ['EventLoopLagHigh', /alert: EventLoopLagHigh[\s\S]*?payesh_eventloop_lag_ms\{q="p99"\} > 100/],
  ['MemoryHigh', /alert: MemoryHigh[\s\S]*?0\.80/],
  ['DiskSpaceLow', /alert: DiskSpaceLow[\s\S]*?payesh_disk_used_ratio > 0\.85/],
  ['AnomalyDetected', /alert: AnomalyDetected[\s\S]*?payesh_runtime_anomalies_total/],
  ['AttackPatternSignature', /alert: AttackPatternSignature[\s\S]*?payesh_attack_patterns_detected_total/],
  ['SuspiciousSession', /alert: SuspiciousSession[\s\S]*?payesh_suspicious_sessions > 0/]
];
RULES.forEach(([n, re]) => chk('قانون ' + n + ' با آستانهٔ درست', re.test(rules)));
const ruleBlocks = rules.split('- alert:').slice(1);
chk('همهٔ قوانین for+severity دارند', ruleBlocks.length === RULES.length
  && ruleBlocks.every((b) => /for: \d+m/.test(b) && /severity: (critical|warning)/.test(b)), ruleBlocks.length);
chk('critical برای HighErrorRate و RedisDown', /HighErrorRate[\s\S]*?severity: critical/.test(rules) && /RedisDown[\s\S]*?severity: critical/.test(rules));
const runtimeRuleAlias = path.join(ROOT, 'monitoring', 'alert-rules.yml');
chk('alias موردنیاز monitoring/alert-rules.yml به قانونِ mounted وصل است',
  fs.existsSync(runtimeRuleAlias) && fs.lstatSync(runtimeRuleAlias).isSymbolicLink()
  && fs.readlinkSync(runtimeRuleAlias) === '../infra/observability/alert-rules.yml');

grp('OBS-METRICS — نام‌ها زنده‌اند');
const metricsJs = rd('server/metrics.js') || '';
const usedMetrics = [...new Set((rules.match(/payesh_[a-z0-9_]+/g) || []))];
chk('همهٔ متریک‌هایِ قوانین در metrics.js تعریف‌شده‌اند', usedMetrics.length >= 7 && usedMetrics.every((m) => metricsJs.includes(m)), usedMetrics.filter((m) => !metricsJs.includes(m)).join(','));

const alertsYml = rd(DIR + '/alerts.yml') || '';
const alertsMetrics = [...new Set((alertsYml.match(/payesh_[a-z0-9_]+/g) || []))];
const missingAlertsMetrics = alertsMetrics.filter((m) => {
  if (metricsJs.includes(m)) return false;
  // هیستوگرامِ خودکار: payesh_db_query_duration_seconds_count مشتق از payesh_db_query_duration_seconds است
  if (m.endsWith('_count') && metricsJs.includes(m.slice(0, -6))) return false;
  return true;
});
chk('همهٔ ۲۳ متریکِ ۲۴ قاعدهٔ alerts.yml در metrics.js تعریف شده‌اند',
  alertsMetrics.length >= 20 && missingAlertsMetrics.length === 0,
  missingAlertsMetrics.join(','));
const promUsed = [...new Set(((prom.match(/job_name: payesh-api[\s\S]*/) || [''])[0].match(/payesh_[a-z0-9_]+/g) || []))];
chk('metrics.js رندرِ payesh_http_requests_total و histogramِ duration را دارد',
  metricsJs.includes('payesh_http_requests_total') && metricsJs.includes('payesh_http_request_duration_seconds_bucket'));

grp('OBS-OTLP — سیم‌کشیِ tracing (ضدرانش)');
const tracingJs = rd('server/tracing.js') || '';
chk('پیش‌فرض tracing.js پورت OTLP/HTTP 4318 است', /4318\/v1\/traces/.test(tracingJs));
chk('collectorِ compose همان 4318 را publish می‌کند', /"127\.0\.0\.1:4318:4318"/.test(compose));
chk('exporterِ collector به jaeger:4318 می‌نویسد', /otlphttp\/jaeger[\s\S]*?endpoint: http:\/\/jaeger:4318/.test(rd(DIR + '/otelcol-config.yml') || ''));
chk('jaeger COLLECTOR_OTLP_ENABLED', /COLLECTOR_OTLP_ENABLED: "true"/.test(compose));

grp('OBS-TOKEN — وایرینگِ index.js');
const indexJs = rd('server/index.js') || '';
chk('rout /metrics در dispatcher هست', /p === '\/metrics'/.test(indexJs));
chk('METRICS_TOKEN gate با ۴۰۱', /METRICS_TOKEN/.test(indexJs) && /'unauthorized'/.test(indexJs));
chk('server attach شده (try-guarded)', /metrics\.attach\(server\)/.test(indexJs));
chk('خوداسکرپ حذف شده (ضدفیدبک‌لوپ)', /\/metrics'\) return; \/\* self-scrape/.test(metricsJs) || metricsJs.includes("=== '/metrics'"));

grp('OBS-SEC — بهداشتِ فایل‌ها');
const am = rd(DIR + '/alertmanager.yml') || '';
chk('webhook با placeholder (URLِ زنده در ریپو نیست)', /__WEBHOOK_URL__/.test(am) && !/https?:\/\/(?!localhost)[a-z]/i.test(am.replace(/#.*$/gm, '')));
const secretPat = /(?:password|passwd|secret|token)[ \t]*[:=][ \t]*['"]?\$?[A-Za-z0-9+/._-]{12,}/i;
let hits = [];
FILES.filter((f) => f.endsWith('.yml')).forEach((f) => { const s = rd(f) || ''; const m = s.match(new RegExp(secretPat.source, 'gi')) || []; m.forEach((h) => { if (!h.includes('$') && !h.includes('GF_')) hits.push(f + '→' + h); }); });
chk('رازِ هاردکد در ymlهایِ استک نیست', hits.length === 0, hits[0] || '');
const envEx = rd(DIR + '/env.observability.example') || '';
chk('env-example: GRAFANA_PASSWORD خالی', /^GRAFANA_PASSWORD=\s*$/m.test(envEx));

console.log('\n' + '─'.repeat(52));
console.log(`نتیجه Observability Config: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);

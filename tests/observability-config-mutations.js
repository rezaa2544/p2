#!/usr/bin/env node
/* جهش‌سنجِ استکِ observability — هر جهش باید یکی از دو سوئیت را بشکند
   (الگوی tests/wave12-network-mutations.js؛ backup/restore + خط‌پایه). */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const SUITES = { cfg: 'node tests/observability-config.js', dash: 'node tests/observability-dashboards.js' };
const WATCH = ['infra/observability/alert-rules.yml', 'infra/observability/docker-compose.observability.yml',
  'infra/observability/prometheus.yml', 'infra/observability/dashboards/payesh-main.json', 'server/metrics.js'];
const FILES = {}; WATCH.forEach((f) => { FILES[f] = fs.readFileSync(f, 'utf8'); });
const MUTS = [
  { file: 'infra/observability/alert-rules.yml', suite: 'cfg',
    name: 'M1 حذفِ قانون SyncQueueDepth',
    bad: '      - alert: SyncQueueDepth\n        expr: payesh_sync_queue_depth > 1000\n', mut: '',
    expectFail: 'قانون SyncQueueDepth با آستانهٔ درست' },
  { file: 'infra/observability/dashboards/payesh-main.json', suite: 'dash',
    name: 'M2 خرابکردنِ p95 (0.95 → 0.9)',
    bad: 'histogram_quantile(0.95, sum by (le) (rate(payesh_http_request_duration_seconds_bucket[5m])))',
    mut: 'histogram_quantile(0.9, sum by (le) (rate(payesh_http_request_duration_seconds_bucket[5m])))',
    replaceAll: true,
    expectFail: 'پنل/expr: هدفِ p95 با exprِ دقیقاً 0.95' },
  { file: 'infra/observability/docker-compose.observability.yml', suite: 'cfg',
    name: 'M3 رانشِ پورت OTLP (collector 4318→4317)',
    bad: '- "127.0.0.1:4318:4318"', mut: '- "127.0.0.1:4317:4317"',
    expectFail: 'collectorِ compose همان 4318 را publish می‌کند' },
  { file: 'infra/observability/prometheus.yml', suite: 'cfg',
    name: 'M4 رانشِ مسیرِ اسکرپ (/metrics → /metrics2)',
    bad: 'metrics_path: /metrics', mut: 'metrics_path: /metrics2',
    expectFail: 'job payesh-api با metrics_path: /metrics' },
  { file: 'server/metrics.js', suite: 'cfg',
    name: 'M5 تغییرِ نامِ متریک در metrics.js (رانشِ یک‌طرفه)',
    bad: 'payesh_sync_queue_depth', mut: 'payesh_outbox_pending_depth', replaceAll: true,
    expectFail: 'همهٔ متریک‌هایِ قوانین در metrics.js تعریف‌شده‌اند' }
];
function restore() { WATCH.forEach((f) => fs.writeFileSync(f, FILES[f])); }
let killed = 0;
console.log('\n▸ جهش‌های observability (M1–M5)');
try {
  MUTS.forEach((m) => {
    const src = fs.readFileSync(m.file, 'utf8');
    if (src.indexOf(m.bad) < 0) { console.log('  ❌ ' + m.name + ': لنگر یافت نشد'); return; }
    fs.writeFileSync(m.file, m.replaceAll ? src.split(m.bad).join(m.mut) : src.replace(m.bad, m.mut));
    let out = '', code = 0;
    try { out = execSync(SUITES[m.suite], { stdio: 'pipe', timeout: 60000 }).toString(); }
    catch (e) { code = (e.status === null ? 1 : e.status); out = ((e.stdout || '') + (e.stderr || '')).toString(); }
    const ok = code !== 0 && out.indexOf('❌ ' + m.expectFail) >= 0;
    if (ok) { killed++; console.log('  ✅ ' + m.name + ' کشته شد'); }
    else console.log('  ❌ ' + m.name + ' زنده ماند' + (code === 0 ? ' (خروجی سوئیت ۰ شد)' : ' (❌ target دیده نشد)'));
    restore();
  });
} finally { restore(); }
let baseOk = true;
try { execSync(SUITES.cfg, { stdio: 'pipe', timeout: 60000 }); execSync(SUITES.dash, { stdio: 'pipe', timeout: 60000 }); } catch (e) { baseOk = false; }
if (baseOk) console.log('  ✅ پس از بازگردانی، هر دو خطِّ پایه سبز');
else console.log('  ❌ خطِّ پایه پس از بازگردانی سبز نشد');
const total = MUTS.length + 1; const all = killed + (baseOk ? 1 : 0);
console.log('\n' + '─'.repeat(52));
console.log(`جهش‌های observability: ${all}/${total} موفق` + (all === total ? ' — بدون خطا ✅' : ` — ${total - all} ناموفق ❌`));
process.exit(all === total ? 0 : 1);

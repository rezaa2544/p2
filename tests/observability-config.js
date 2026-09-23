#!/usr/bin/env node
/* Current-HEAD observability configuration contract. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function chk(name, cond) { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } }
const DIR = 'infra/observability';
const compose = rd(DIR + '/docker-compose.observability.yml');
const prom = rd(DIR + '/prometheus.yml');
const rules = rd(DIR + '/alert-rules.yml');
const am = rd(DIR + '/alertmanager.yml');
const promtail = rd(DIR + '/promtail.yml');
const env = rd(DIR + '/env.observability.example');
const metrics = rd('server/metrics.js');

chk('compose contains pinned observability services', ['prometheus:v2.54.1','alertmanager:v0.27.0','grafana:11.2.0','loki:3.1.1','promtail:3.1.1'].every((x) => compose.includes(x)));
chk('Prometheus loads only canonical alert-rules.yml', /rule_files:\s*\n\s*- \/etc\/prometheus\/alert-rules\.yml(?:\s*)$/.test(prom));
chk('retired alerts.yml is not mounted', !/\.\/alerts\.yml:/.test(compose));
chk('retired alerts.yml has no active alert', !/^- alert:/m.test(rd(DIR + '/alerts.yml')));
chk('Prometheus target is payesh-api /metrics', /job_name: payesh-api/.test(prom) && /metrics_path: \/metrics/.test(prom) && /host\.docker\.internal:3000/.test(prom));
chk('Prometheus points at Alertmanager', /alertmanager:9093/.test(prom));
chk('all active alerts have for + severity', [...rules.matchAll(/- alert:[\s\S]*?(?=\n\s*- alert:|\n*$)/g)].every((m) => /for: \d+m/.test(m[0]) && /severity: (critical|warning)/.test(m[0])));
const secondaryPath = path.join(ROOT, 'monitoring/alert-rules.yml');
const secondary = fs.existsSync(secondaryPath) ? fs.readFileSync(secondaryPath, 'utf8') : null;
chk('secondary monitoring catalogue is absent or retired', secondary === null || !/^\s*-\s*alert:/m.test(secondary));
chk('canonical P0 alert count is 11', (rules.match(/- alert:/g) || []).length === 11);
chk('HTTP error alert uses emitted code label', /payesh_http_requests_total\{code=~"5\.\."\}/.test(rules));
chk('event-loop alert uses canonical seconds gauge', /payesh_node_eventloop_lag_seconds\s*>\s*0\.1/.test(rules) && !/payesh_eventloop_lag_ms\{/.test(rules));
chk('memory alert uses canonical Node heap gauges', /payesh_node_heap_used_bytes/.test(rules) && /payesh_node_heap_total_bytes/.test(rules));
chk('critical alerts are wired', /alert: HighErrorRate[\s\S]*?severity: critical/.test(rules) && /alert: RedisDown[\s\S]*?severity: critical/.test(rules));
chk('all alert metric names occur in metrics.js', [...new Set((rules.match(/payesh_[a-z0-9_]+/g) || []))].every((m) => metrics.includes("'" + m + "'") || metrics.includes(m.replace(/_(bucket|sum|count)$/, ''))));
chk('Promtail tails canonical server.log and audit.log', /__path__: \/var\/log\/payesh\/server\.log/.test(promtail) && /__path__: \/var\/log\/payesh\/audit\.log/.test(promtail));
chk('logging contract is documented', fs.existsSync(path.join(ROOT, 'docs/OBSERVABILITY_LOGGING_CONTRACT.md')));
chk('Alertmanager retains repository placeholder', /__WEBHOOK_URL__/.test(am));
chk('Alertmanager overrides image entrypoint for fail-closed shell', /entrypoint:\s*\["\/bin\/sh",\s*"-ec"\]/.test(compose));
chk('Alertmanager compose refuses missing/placeholder endpoint', /ALERTMANAGER_WEBHOOK_URL/.test(compose) && /refusing placeholder alerting config/.test(compose));
chk('owner endpoint is not committed', /^ALERTMANAGER_WEBHOOK_URL=\s*$/m.test(env));
chk('metrics endpoint is fail-closed', /METRICS_TOKEN/.test(rd('server/index.js')) && /unauthorized/.test(rd('server/index.js')));

console.log(`\nObservability Config: ${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);

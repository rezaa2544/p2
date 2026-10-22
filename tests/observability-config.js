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
const loki = rd(DIR + '/loki-config.yml');
const promtail = rd(DIR + '/promtail.yml');
const env = rd(DIR + '/env.observability.example');
const metrics = rd('server/metrics.js');

chk('compose contains pinned observability services', ['prometheus:v2.54.1','alertmanager:v0.27.0','grafana:11.2.0','loki:3.1.1','promtail:3.1.1'].every((x) => compose.includes(x)));
const ruleFilesBlock = (prom.match(/^rule_files:\s*\n((?:[ \t]+-[^\n]*\n)+)/m) || [])[1] || '';
chk('Prometheus loads only canonical alert-rules.yml', ruleFilesBlock.trim() === '- /etc/prometheus/alert-rules.yml');
chk('retired alerts.yml is not mounted', !/\.\/alerts\.yml:/.test(compose));
chk('retired alerts.yml has no active alert', !/^- alert:/m.test(rd(DIR + '/alerts.yml')));
chk('job payesh-api با metrics_path: /metrics', /job_name:\s*payesh-api/.test(prom) && /metrics_path:\s*\/metrics\s*$/m.test(prom) && /host\.docker\.internal:3000/.test(prom));
chk('collectorِ compose همان 4318 را publish می‌کند', /- "127\.0\.0\.1:4318:4318"/.test(compose));
chk('Prometheus uses Bearer auth from the mounted protected token file', /authorization:\s*\n\s*type: Bearer\s*\n\s*credentials_file: \/etc\/prometheus\/payesh_metrics_token/.test(prom) && /PAYESH_METRICS_TOKEN_FILE:\?/.test(compose));
chk('Prometheus runs non-root as the owner of the mode-0600 token file', /user: "\$\{PROMETHEUS_UID:-65534\}:\$\{PROMETHEUS_GID:-65534\}"/.test(compose) && /PROMETHEUS_UID=65534/.test(env) && /install -o "\$PROMETHEUS_UID" -g "\$PROMETHEUS_GID" -m 0600/.test(rd(DIR + '/README.md')));
chk('Alertmanager can reach the host-only CI receiver when explicitly configured', /host\.docker\.internal:host-gateway/.test(compose));
chk('Prometheus points at Alertmanager', /alertmanager:9093/.test(prom));
chk('all active alerts have for + severity', [...rules.matchAll(/- alert:[\s\S]*?(?=\n\s*- alert:|\n*$)/g)].every((m) => /for: \d+m/.test(m[0]) && /severity: (critical|warning)/.test(m[0])));
const secondaryPath = path.join(ROOT, 'monitoring/alert-rules.yml');
const secondary = fs.existsSync(secondaryPath) ? fs.readFileSync(secondaryPath, 'utf8') : null;
chk('secondary monitoring catalogue is absent or retired', secondary === null || !/^\s*-\s*alert:/m.test(secondary));
chk('canonical P0 alert count is 11', (rules.match(/- alert:/g) || []).length === 11);
chk('قانون SyncQueueDepth با آستانهٔ درست', /alert:\s*SyncQueueDepth[\s\S]*?expr:\s*payesh_sync_queue_depth\s*>\s*1000/.test(rules));
chk('قانون AnomalyDetected با آستانهٔ درست', /alert:\s*AnomalyDetected[\s\S]*?expr:\s*sum\(increase\(payesh_runtime_anomalies_total\[5m\]\)\)\s*>\s*0/.test(rules));
chk('قانون AttackPatternSignature با آستانهٔ درست', /alert:\s*AttackPatternSignature[\s\S]*?expr:\s*sum by \(pattern, severity\) \(increase\(payesh_attack_patterns_detected_total\[5m\]\)\)\s*>\s*0/.test(rules));
chk('قانون SuspiciousSession با آستانهٔ درست', /alert:\s*SuspiciousSession[\s\S]*?expr:\s*payesh_suspicious_sessions\s*>\s*0/.test(rules));
chk('HTTP error alert uses emitted code label', /payesh_http_requests_total\{code=~"5\.\."\}/.test(rules));
chk('event-loop alert uses canonical seconds gauge', /payesh_node_eventloop_lag_seconds\s*>\s*0\.1/.test(rules) && !/payesh_eventloop_lag_ms\{/.test(rules));
chk('memory alert uses canonical Node heap gauges', /payesh_node_heap_used_bytes/.test(rules) && /payesh_node_heap_total_bytes/.test(rules));
chk('critical alerts are wired', /alert: HighErrorRate[\s\S]*?severity: critical/.test(rules) && /alert: RedisDown[\s\S]*?severity: critical/.test(rules));
chk('همهٔ متریک‌هایِ قوانین در metrics.js تعریف‌شده‌اند', [...new Set((rules.match(/payesh_[a-z0-9_]+/g) || []))].every((m) => metrics.includes("'" + m + "'") || metrics.includes(m.replace(/_(bucket|sum|count)$/, ''))));
chk('Loki defines v13 tsdb schema_config', /schema_config:\s*\n\s*configs:[\s\S]*?store:\s*tsdb[\s\S]*?object_store:\s*filesystem[\s\S]*?schema:\s*v13/.test(loki));
chk('Loki scopes retention_enabled inside compactor block', /compactor:\s*\n\s+working_directory:\s*\/loki\/compactor\s*\n\s+delete_request_store:\s*filesystem\s*\n\s+retention_enabled:\s*true/.test(loki) && !/^retention_enabled:/m.test(loki));
chk('Promtail tails canonical server.log and audit.log', /__path__: \/var\/log\/payesh\/server\.log/.test(promtail) && /__path__: \/var\/log\/payesh\/audit\.log/.test(promtail));
chk('logging contract is documented', fs.existsSync(path.join(ROOT, 'docs/OBSERVABILITY_LOGGING_CONTRACT.md')));
chk('Alertmanager retains repository placeholder', /__WEBHOOK_URL__/.test(am));
chk('Alertmanager overrides image entrypoint for fail-closed shell', /entrypoint:\s*\["\/bin\/sh",\s*"-ec"\]/.test(compose));
chk('Alertmanager compose refuses missing/placeholder endpoint', /ALERTMANAGER_WEBHOOK_URL/.test(compose) && /refusing placeholder alerting config/.test(compose));
chk('owner endpoint is not committed', /^ALERTMANAGER_WEBHOOK_URL=\s*$/m.test(env));
chk('metrics endpoint is fail-closed', /METRICS_TOKEN/.test(rd('server/index.js')) && /unauthorized/.test(rd('server/index.js')));

console.log(`\nObservability Config: ${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);

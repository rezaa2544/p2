#!/usr/bin/env node
/* Semantic false-green guard for Prometheus alert rules. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const metrics = read('server/metrics.js');
const rules = read('infra/observability/alert-rules.yml');
const retired = read('infra/observability/alerts.yml');
let fail = 0;
const errors = [];
function check(ok, msg) {
  if (!ok) { fail++; errors.push(msg); console.error('❌ ' + msg); }
  else console.log('✅ ' + msg);
}

// Extract the registry declaration contract directly from metrics.js.
const declarations = new Map();
const declRe = /r\.(counter|gauge|histogram)\(\s*'([^']+)'[^\n]*?\[([^\]]*)\]/g;
let m;
while ((m = declRe.exec(metrics))) {
  const labels = [...m[3].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  declarations.set(m[2], new Set(labels));
}
function canonicalMetric(name) {
  for (const suffix of ['_bucket', '_count', '_sum']) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name;
}
function exists(name) {
  const base = canonicalMetric(name);
  if (declarations.has(base)) return true;
  // The runtime collector emits these gauges by registry.set(); they are
  // declared separately in metrics.js and therefore still belong to the contract.
  return metrics.includes("'" + base + "'");
}

check(declarations.size > 20, 'metric declaration catalogue is non-empty');
check(/__WEBHOOK_URL__/.test(retired) && !/^- alert:/m.test(retired), 'retired duplicate alert catalogue is not active');\nconst secondary = read('monitoring/alert-rules.yml');\ncheck(!/^- alert:/m.test(secondary), 'secondary monitoring alert catalogue is not active');

const alerts = [...rules.matchAll(/- alert:\s*([A-Za-z0-9_]+)/g)].map((x) => x[1]);
check(new Set(alerts).size === alerts.length, 'alert names are unique');
check(alerts.length === 11, 'canonical catalogue contains the expected 11 alerts');

// Only inspect expr blocks. Annotation prose must never affect semantic checks.
const exprBlocks = [...rules.matchAll(/\n\s*expr:\s*(?:\|\s*)?\n([\s\S]*?)(?=\n\s*for:)/g)].map((x) => x[1]);
check(exprBlocks.length === alerts.length, 'every alert has an expression block');

const metricRef = /\b(payesh_[a-zA-Z0-9_]+)(?:\{([^}]*)\})?/g;
for (const expr of exprBlocks) {
  let ref;
  while ((ref = metricRef.exec(expr))) {
    const name = ref[1];
    const base = canonicalMetric(name);
    check(exists(name), `metric exists: ${name}`);
    if (!exists(name)) continue;
    const labels = declarations.get(base);
    if (!ref[2]) continue;
    const selectors = [...ref[2].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|!~|=~|!=)/g)].map((x) => x[1]);
    if (labels) selectors.forEach((label) => check(labels.has(label), `${base} selector label exists: ${label}`));
  }
}

check(/payesh_http_requests_total\{code=~"5\.\."\}/.test(rules), 'HighErrorRate uses emitted code label');
check(/payesh_eventloop_lag_ms\s*>\s*100/.test(rules), 'EventLoopLagHigh has no dead q label selector');
check(/payesh_node_heap_used_bytes\s*\/\s*clamp_min\(payesh_node_heap_total_bytes/.test(rules), 'MemoryHigh uses canonical heap gauges');
check(!/payesh_process_heap_bytes\{kind=/.test(rules), 'MemoryHigh does not use undeclared kind labels');
check(!/payesh_eventloop_lag_ms\{q=/.test(rules), 'no event-loop q selector can create an empty vector');

if (fail) {
  console.error(`\nObservability semantic guard: ${fail} failure(s)`);
  process.exit(1);
}
console.log('\nObservability semantic guard: PASS');

#!/usr/bin/env node
'use strict';

/* Bounded E3 route generator. This program runs in its own CPU/memory-limited
   Docker container; it records counts and latency only, never response bodies,
   cookies, phone numbers, or request headers. */
const fs = require('fs');
const { performance } = require('perf_hooks');

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const i = Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1));
  return Number(sorted[i].toFixed(3));
}

async function readRequest(spec, url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', cookie: spec.cookie },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.arrayBuffer();
  return { status: response.status, bytes: body.byteLength };
}

async function runRoute(spec) {
  const route = spec.route;
  const url = new URL(route.path, spec.base_url);
  if (url.origin !== 'http://127.0.0.1:3000' || !url.pathname.startsWith('/api/')) {
    throw new Error('route_target_not_isolated_loopback');
  }
  const seconds = Math.max(2, Math.min(20, Number(spec.seconds) || 5));
  const concurrency = Math.max(1, Math.min(8, Number(spec.concurrency) || 2));
  const samples = [];
  const statusCounts = Object.create(null);
  const errorCounts = Object.create(null);
  const started = performance.now();
  const deadline = started + seconds * 1000;
  let stop = false;

  async function worker() {
    while (!stop && performance.now() < deadline && samples.length < 5000) {
      const requestStarted = performance.now();
      try {
        const result = await readRequest(spec, url);
        const latency = performance.now() - requestStarted;
        samples.push({ status: result.status, latency_ms: latency, bytes: result.bytes });
        statusCounts[String(result.status)] = (statusCounts[String(result.status)] || 0) + 1;
        if (result.status < 200 || result.status >= 300) stop = true;
      } catch (error) {
        stop = true;
        const name = String(error && error.name || 'network_error').slice(0, 40);
        errorCounts[name] = (errorCounts[name] || 0) + 1;
        samples.push({ status: 0, latency_ms: performance.now() - requestStarted, bytes: 0 });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedMs = performance.now() - started;
  const latencies = samples.map((sample) => sample.latency_ms);
  const successes = samples.filter((sample) => sample.status >= 200 && sample.status < 300).length;
  const failures = samples.length - successes;
  return {
    route_template: route.template,
    requests: samples.length,
    successes,
    failures,
    requests_per_second: Number((samples.length / (elapsedMs / 1000)).toFixed(3)),
    elapsed_ms: Number(elapsedMs.toFixed(3)),
    latency_ms: {
      p50: percentile(latencies, 0.50),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length ? Number(Math.max(...latencies).toFixed(3)) : null
    },
    bytes_total: samples.reduce((total, sample) => total + sample.bytes, 0),
    status_counts: statusCounts,
    error_counts: errorCounts,
    concurrency
  };
}

async function main() {
  const specPath = process.env.M15_LOAD_SPEC_FILE || '/run/m15/spec.json';
  const resultPath = process.env.M15_LOAD_RESULT_FILE || '/run/m15/result.json';
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const base = new URL(spec.base_url);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.port !== '3000'
      || !spec.cookie || !spec.route || !String(spec.route.path || '').startsWith('/api/')) {
    throw new Error('load_spec_invalid_or_nonlocal');
  }
  const result = await runRoute(spec);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log('ROUTE_LOAD ' + result.route_template + ' requests=' + result.requests
    + ' successes=' + result.successes + ' rps=' + result.requests_per_second
    + ' p50=' + result.latency_ms.p50 + 'ms p95=' + result.latency_ms.p95
    + 'ms p99=' + result.latency_ms.p99 + 'ms');
  if (!result.requests || result.failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error('M15 route generator failed: ' + String(error && error.message || 'unknown').slice(0, 160));
  process.exitCode = 1;
});

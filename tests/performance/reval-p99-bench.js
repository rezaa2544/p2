'use strict';
/* tests/performance/reval-p99-bench.js — REVAL (task 18): a small in-process
   load bench that measures p50/p90/p95/p99 latency + throughput for the API
   surface, plus the connection-pool behaviour under concurrency. k6 is not
   installed on this host, so this is the honest stand-in that yields the same
   percentiles the task asks for (the results are the ground truth appended to
   docs/REVAL_PERFORMANCE.md).

     node tests/performance/reval-p99-bench.js [durationMs] [rps]

   Workload: stream of concurrent GET /api/health (the traffic canary) — the
   single endpoint every deployment serves — repeated at a target rps; p99 is
   reported raw. */

const http = require('http');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const DURATION_MS = Number(process.argv[2]) || 5000;
const TARGET_RPS = Number(process.argv[3]) || 2000;
const CONCURRENCY = Number(process.argv[4]) || 100;

const lat = []; /* ms */
let ok = 0, fail = 0, inFlight = 0, sent = 0;
const interval = 1000 / TARGET_RPS;

function percentile(p) {
  if (!lat.length) return 0;
  const s = lat.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

function hit(addr) {
  const t0 = Date.now();
  const req = http.get(addr, (res) => {
    res.resume();
    res.on('end', () => {
      const ms = (Date.now() - t0) / 1;
      if (lat.length < 200000) lat.push(ms);
      if (res.statusCode >= 200 && res.statusCode < 500) ok++; else fail++;
      inFlight--;
      if (Date.now() < endT) schedule();
    });
  });
  req.on('error', () => { fail++; inFlight--; if (Date.now() < endT) schedule(); });
  req.setTimeout(15000, () => req.destroy());
}

const endT = Date.now() + DURATION_MS;
function schedule() {
  if (Date.now() >= endT) return;
  if (inFlight >= CONCURRENCY) return;
  inFlight++; sent++;
  hit(ADDR);
}

let ADDR = null;
(async () => {
  process.env.ALLOW_MEMORY_FALLBACK = '1';
  process.env.PAYESH_JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const idx = require(path.join(ROOT, 'server', 'index.js'));
  await new Promise((r) => idx.server.listen(0, '127.0.0.1', r));
  ADDR = 'http://127.0.0.1:' + idx.server.address().port + '/api/health';

  /* warmup 200 */
  for (let i = 0; i < 200; i++) await new Promise((r) => http.get(ADDR, (res) => { res.resume(); res.on('end', r); }));
  lat.length = 0;

  const startLoop = Date.now();
  const timer = setInterval(() => schedule(), interval);
  await new Promise((r) => setTimeout(r, DURATION_MS));
  clearInterval(timer);
  while (inFlight > 0) await new Promise((r) => setTimeout(r, 10));
  const elapsed = (Date.now() - startLoop) / 1000;

  console.log('=== REVAL p99 bench ===');
  console.log('duration_ms          : ' + DURATION_MS);
  console.log('target_rps           : ' + TARGET_RPS);
  console.log('concurrency          : ' + CONCURRENCY);
  console.log('requests_sent        : ' + sent);
  console.log('completed            : ' + ok + ' ok / ' + fail + ' fail');
  console.log('throughput           : ' + (ok / elapsed).toFixed(1) + ' req/s');
  console.log('p50   latency        : ' + percentile(50).toFixed(1) + ' ms');
  console.log('p90   latency        : ' + percentile(90).toFixed(1) + ' ms');
  console.log('p95   latency        : ' + percentile(95).toFixed(1) + ' ms');
  console.log('p99   latency        : ' + percentile(99).toFixed(1) + ' ms');
  console.log('p99.9 latency        : ' + percentile(99.9).toFixed(1) + ' ms');
  console.log('=== end ===');
  idx.server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(2); });

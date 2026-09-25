#!/usr/bin/env node
/* E3 A-01..A-03 HTTP benchmark (probe tool — NOT project code).
 * usage: node tools/bench-ap.js <base> <cookie> <label> [iters] [conc] [endpointFilter]
 * endpoints: health | regional | school   (default all, sequential)
 * conc>0 runs the filtered endpoint concurrently (A-03 pool saturation).
 * prints one JSON summary line per endpoint to stdout.
 */
'use strict';
const http = require('http');
const URLC = require('url');

const [base, cookie, label, itersS, concS, epF] = process.argv.slice(2);
const ITERS = Number(itersS || 30);
const CONC = Number(concS || 1);
const EPS = {
  health: '/api/health-index',
  regional: '/api/v1/analytics/regional-intelligence?region_id=777',
  school: '/api/v1/analytics/school-intelligence?school_id=101',
};
const keys = epF ? [epF] : Object.keys(EPS);

const agent = new http.Agent({ keepAlive: true, maxSockets: Math.max(64, CONC * 4) });

function hit(path) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const u = URLC.parse(base + path);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.path, method: 'GET', agent,
      headers: { Cookie: cookie, Connection: 'keep-alive' },
    }, (res) => {
      let n = 0;
      res.on('data', (d) => { n += d.length; });
      res.on('end', () => resolve({ ms: Number(process.hrtime.bigint() - t0) / 1e6, status: res.statusCode, bytes: n }));
    });
    req.on('error', (e) => resolve({ ms: -1, status: 0, bytes: 0, err: e.code || e.message }));
    req.end();
  });
}

function stats(samples) {
  const ok = samples.filter((s) => s.status === 200);
  const xs = ok.map((s) => s.ms).sort((p, q) => p - q);
  const pct = (p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : NaN);
  const avg = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  return {
    n: samples.length, ok: ok.length,
    statuses: samples.reduce((m, s) => ((m[s.status] = (m[s.status] || 0) + 1), m), {}),
    bytes: ok.length ? ok[0].bytes : 0,
    min: +pct(0).toFixed(2), avg: +avg.toFixed(2), p50: +pct(0.5).toFixed(2),
    p95: +pct(0.95).toFixed(2), max: +pct(1).toFixed(2),
  };
}

(async () => {
  for (const k of keys) {
    let samples;
    if (CONC > 1) {
      samples = [];
      let idx = 0;
      const workers = Array.from({ length: CONC }, async () => {
        while (idx < ITERS) { const my = idx++; samples.push(await hit(EPS[k])); }
      });
      await Promise.all(workers);
    } else {
      samples = [];
      // warmup
      await hit(EPS[k]); await hit(EPS[k]);
      for (let i = 0; i < ITERS; i++) samples.push(await hit(EPS[k]));
    }
    console.log(JSON.stringify({ label, ep: k, conc: CONC, ...stats(samples) }));
  }
  agent.destroy();
})().catch((e) => { console.error(e); process.exit(1); });

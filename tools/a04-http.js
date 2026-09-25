#!/usr/bin/env node
/* A-04 HTTP arm (probe): N concurrent single-op sync creates without ids.
 * usage: node tools/a04-http.js <base> <cookie> <N> [parallel] [collection]
 * prints JSON summary of HTTP outcomes; duplicates are counted from storage
 * by the caller (PG query / JSON file scan).
 */
'use strict';
const http = require('http');
const URLC = require('url');
const [base, cookie, nS, pS, coll] = process.argv.slice(2);
const N = Number(nS || 100);
const P = Number(pS || 50);
const C = coll || 'visitors';

function post(op) {
  return new Promise((resolve) => {
    const u = URLC.parse(base + '/api/sync');
    const body = JSON.stringify({ ops: [op] });
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.path, method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 200) }));
    });
    req.on('error', (e) => resolve({ status: 0, err: e.code }));
    req.end(body);
  });
}

(async () => {
  const codes = {};
  let idx = 0;
  const workers = Array.from({ length: P }, async () => {
    while (idx < N) {
      const my = idx++;
      const op = {
        uid: `a04-${process.pid}-${my}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        t: 'ins', c: C, by: 1,
        data: { school_id: 1, name: 'a04-' + my, purpose: 'A04' },
      };
      const r = await post(op);
      codes[r.status] = (codes[r.status] || 0) + 1;
    }
  });
  await Promise.all(workers);
  console.log(JSON.stringify({ base, N, P, collection: C, statuses: codes }));
})().catch((e) => { console.error(e); process.exit(1); });

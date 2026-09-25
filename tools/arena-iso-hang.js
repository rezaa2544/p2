#!/usr/bin/env node
'use strict';
/* Narrow test: once ioredis has SETTLED into a live TCP connection against a
 * silent blackhole (no replies), do in-flight commands hang (no commandTimeout)?
 */
const net = require('net');
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function blackhole(port) {
  const socks = new Set();
  return new Promise((resolve) => {
    const srv = net.createServer((s) => { socks.add(s); s.on('data', () => {}); s.on('close', () => socks.delete(s)); });
    srv.on('error', () => {});
    srv.listen(port, () => resolve({ n: () => socks.size, close: () => { for (const s of socks) s.destroy(); srv.close(); } }));
  });
}

(async () => {
  const infra = await L.Infra.start();
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const rd = api.port;

  infra.stopRedis('kill9');
  await sleep(250);
  const bh = await blackhole(infra.redisPort);
  // wait for ioredis reconnect to settle against the blackhole (retry ~200,400,800,1600,2000...)
  await sleep(8000);
  console.log('blackhole settled; established sink sockets =', bh.n());

  const t0 = Date.now();
  const r = await L.readiness(rd, 2500);
  console.log('readiness in settle window:', r.status, 'err=' + r.error, '(' + (Date.now() - t0) + 'ms)', JSON.stringify(r.json && r.json.redis).slice(0, 120));

  const h = await L.health(rd, 2500);
  console.log('/api/health:', h.status, 'err=' + h.error, 'cache=' + JSON.stringify(h.json && h.json.cache), 'redis=' + JSON.stringify(h.json && h.json.redis));

  const sc = await L.httpReq(rd, 'POST', '/api/auth/send-code', { phone: '09992630039' }, { timeoutMs: 2500 });
  console.log('send-code in settle window:', sc.status, 'err=' + sc.error, JSON.stringify(sc.json).slice(0, 80));

  bh.close();
  await sleep(400);
  await infra.startRedisAgain();
  await sleep(400);
  const rr = await L.readiness(rd, 2000);
  console.log('after recovery: readiness =', rr.status);
  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); });

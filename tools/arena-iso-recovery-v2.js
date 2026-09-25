#!/usr/bin/env node
'use strict';
/* Isolation v2: correct mechanics for (a) Redis blackhole with socket teardown,
 * (b) FULL PostgreSQL freeze (postmaster + backends). Measures real recovery.
 */
const fs = require('fs');
const net = require('net');
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sink(port) {
  const sockets = new Set();
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => { sockets.add(sock); sock.on('close', () => sockets.delete(sock)); });
    srv.on('error', (e) => console.log('  [sink] error', e.message));
    srv.listen(port, () => resolve({
      connCount: () => sockets.size,
      destroy: () => new Promise((res) => {
        for (const s of sockets) { try { s.destroy(); } catch (e) {} }
        srv.close(() => res());
        setTimeout(res, 500);
      })
    }));
  });
}
function postmasterPid(infra) {
  try { return Number(fs.readFileSync(infra.pgData + '/postmaster.pid', 'utf8').trim().split('\n')[0]); } catch (e) { return null; }
}
function pgChildren(ppid) {
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync('/proc/' + d + '/stat', 'utf8');
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      if (Number(rest[1]) === ppid) out.push(Number(d));
    } catch (e) {}
  }
  return out;
}
async function untilReady(port, ms) {
  const t0 = Date.now();
  for (;;) {
    const r = await L.readiness(port, 2000);
    if (r.status === 200) return { ms: Date.now() - t0, status: 200 };
    if (Date.now() - t0 > ms) return { ms: Date.now() - t0, status: r.status };
    await sleep(400);
  }
}

(async () => {
  const infra = await L.Infra.start();
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const rd = api.port;

  console.log('A. baseline readiness =', (await L.readiness(rd)).status);

  /* ── Redis blackhole ── */
  infra.stopRedis('kill9');
  await sleep(300);
  const sk = await sink(infra.redisPort);
  // wait until ioredis has CONNECTED to the sink (retryStrategy reconnects)
  let connected = false;
  for (let i = 0; i < 40 && !connected; i++) { if (sk.connCount() > 0) connected = true; else await sleep(250); }
  console.log('B. ioredis connected to blackhole sink:', connected, '(connCount=' + sk.connCount() + ')');
  const rb = await L.readiness(rd, 3000);
  console.log('C. readiness during connected-blackhole:', rb.status, JSON.stringify(rb.json && rb.json.redis));
  const sc = await L.httpReq(rd, 'POST', '/api/auth/send-code', { phone: '09992630039' }, { timeoutMs: 3000 });
  console.log('D. send-code during connected-blackhole:', sc.status, 'err=' + sc.error, JSON.stringify(sc.json).slice(0, 80));

  // teardown: destroy sockets (FIN) + close listen; then real redis back
  await sk.destroy();
  await sleep(500);
  await infra.startRedisAgain();
  await sleep(500);
  console.log('E. harness-side redis PING after relaunch =', infra.redis(['ping']));
  const r1 = await untilReady(rd, 40000);
  console.log('F. Redis-blackhole recovery (readiness 200):', r1.status === 200 ? r1.ms + 'ms' : 'NEVER (' + r1.ms + 'ms)');

  /* ── FULL PostgreSQL freeze ── */
  const pp = postmasterPid(infra);
  const kids = pgChildren(pp);
  for (const p of [pp, ...kids]) { try { process.kill(p, 'SIGSTOP'); } catch (e) {} }
  console.log('G. SIGSTOP postmaster ' + pp + ' + ' + kids.length + ' children (full freeze)');
  await sleep(300);
  const fr = await L.readiness(rd, 3000);
  const pidsLeft = [pp, ...kids].filter((p) => { try { process.kill(p, 0); return true; } catch (e) { return false; } });
  console.log('H. readiness during full freeze:', fr.status, 'err=' + fr.error, '(still-frozen pids=' + pidsLeft.length + ')');
  // a login (needs PG) — sessionFrom reads users via pool → should hang
  const lg = await L.httpReq(rd, 'POST', '/api/auth/send-code', { phone: '09992630039' }, { timeoutMs: 3000 });
  console.log('I. send-code during full freeze (rate-limit needs redis; userByPhone needs PG):', lg.status, 'err=' + lg.error);
  for (const p of [pp, ...kids]) { try { process.kill(p, 'SIGCONT'); } catch (e) {} }
  const r2 = await untilReady(rd, 40000);
  console.log('J. DB-freeze recovery (readiness 200):', r2.status === 200 ? r2.ms + 'ms' : 'NEVER (' + r2.ms + 'ms)');

  api.stop(); infra.stop();
  console.log('DONE');
})().catch((e) => { console.error('ISO ERROR', e.stack || e); });

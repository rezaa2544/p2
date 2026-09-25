#!/usr/bin/env node
'use strict';
/* Redis FREEZE: healthy connection, then SIGSTOP redis-server (socket stays
 * open, replies stop). Does any endpoint hang (no commandTimeout)? */
const fs = require('fs');
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function untilReady(port, ms) {
  const t0 = Date.now();
  for (;;) {
    const r = await L.readiness(port, 1500);
    if (r.status === 200) return { ms: Date.now() - t0, status: 200 };
    if (Date.now() - t0 > ms) return { ms: Date.now() - t0, status: r.status };
    await sleep(300);
  }
}

(async () => {
  const infra = await L.Infra.start();
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const rd = api.port;
  console.log('baseline readiness =', (await L.readiness(rd)).status);

  // find redis-server pid via INFO (authoritative process_id)
  const info = require('child_process').execSync('redis-cli -p ' + infra.redisPort + ' INFO server | grep process_id', { encoding: 'utf8' });
  const rpid = Number(info.split(':')[1].trim());
  console.log('resolved redis process_id =', rpid);
  process.kill(rpid, 'SIGSTOP');
  await sleep(500);

  const t0 = Date.now();
  const r = await L.readiness(rd, 2500);
  console.log('readiness during redis-frozen:', r.status, 'err=' + r.error, '(' + (Date.now() - t0) + 'ms)');

  const sc = await L.httpReq(rd, 'POST', '/api/auth/send-code', { phone: '09992630039' }, { timeoutMs: 2500 });
  console.log('send-code during redis-frozen:', sc.status, 'err=' + sc.error, JSON.stringify(sc.json).slice(0, 80));

  const h = await L.health(rd, 2500);
  console.log('/api/health during redis-frozen:', h.status, 'err=' + h.error, 'ok=' + (h.json && h.json.ok));

  process.kill(rpid, 'SIGCONT');
  const rec = await untilReady(rd, 30000);
  console.log('recovery after SIGCONT redis:', rec.status === 200 ? rec.ms + 'ms' : 'NEVER (' + rec.ms + 'ms)');
  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); });

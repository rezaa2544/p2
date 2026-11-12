'use strict';
/* tests/m15-17-ws-hub.test.js — M15-17: the horizontally scalable WebSocket
   hub (Redis pub/sub fan-out, no sticky sessions).

     W1  an unauthenticated upgrade is rejected (401)
     W2  an authenticated client connects and receives a global broadcast
         published through a DIFFERENT hub instance (the cross-instance
         fan-out — the sticky-session replacement)
     W3  three hub instances share one Redis bus: a broadcast via any one of
         them reaches the clients of all three
     W4  tenant isolation: a client may only subscribe to its OWN tenant
         topic (the cross-tenant subscribe is refused) and never receives
         another tenant's broadcast
     W5  the subscriber ack arrives (subscribe confirmation)

   The three hubs run in this process against the same Redis driver
   (in-memory here; the real staging Redis with REDIS_URL) — the pub/sub bus
   semantics are identical to the multi-process deployment: every hub's
   delivery goes through the shared bus round-trip, not an in-process call.

   Run: node tests/m15-17-ws-hub.test.js */

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const { createWsHub } = require('../server/ws-hub');
const redis = require('../server/redis');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

function listen() {
  return new Promise((r) => {
    const srv = http.createServer(() => {});
    srv.listen(0, '127.0.0.1', () => r(srv));
  });
}

function wsConnect(url, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url + (token ? '?token=' + token : ''));
    const open = new Promise((res2) => ws.on('open', res2));
    const err = new Promise((res2) => ws.on('error', (e) => res2(e)));
    Promise.race([open.then(() => res2resolve({ ws, error: null })), err.then((e) => res2resolve({ ws, error: e }))]);
    let done = false;
    function res2resolve(v) { if (!done) { done = true; resolve(v); } }
  });
}

function next(ws, timeoutMs) {
  return new Promise((resolve) => {
    const to = setTimeout(() => resolve(null), timeoutMs || 5000);
    ws.once('message', (raw) => { clearTimeout(to); resolve(JSON.parse(String(raw))); });
  });
}

(async () => {
  /* the same readiness contract as the other live-Redis suites: with
     REDIS_URL configured, the driver must be initialized BEFORE use —
     configured-but-uninitialized = the documented fail-closed throw */
  const LIVE = !!String(process.env.REDIS_URL || '').trim();
  if (LIVE) { await redis.init(); }
  console.log('▸ bus: ' + (LIVE ? 'live Redis (staging sentinel)' : 'in-memory pub/sub (dev)'));

  /* three hub instances on three http servers, one shared session stub */
  const TOKENS = { t1: 'tok-tenant-1', t2: 'tok-tenant-2', sa: 'tok-superadmin' };
  const sessionFrom = async (req) => {
    const h = String(req.headers.authorization || '');
    const tok = h.replace(/^Bearer\s+/, '');
    if (tok === TOKENS.t1) return { user_id: 11, role: 'teacher', school_id: 1 };
    if (tok === TOKENS.t2) return { user_id: 22, role: 'teacher', school_id: 2 };
    if (tok === TOKENS.sa) return { user_id: 99, role: 'superadmin', school_id: null };
    return null;
  };

  const hubs = [];
  for (let i = 0; i < 3; i++) {
    const srv = await listen();
    hubs.push({ srv, hub: createWsHub({ httpServer: srv, sessionFrom }), addr: 'ws://127.0.0.1:' + srv.address().port + '/ws' });
  }
  await new Promise((r) => setTimeout(r, 200)); /* the Redis subscribe = settled */

  /* W1 — unauthenticated upgrade */
  {
    const { ws, error } = await wsConnect(hubs[0].addr, null);
    await new Promise((r) => setTimeout(r, 300));
    const refused = error || ws.readyState !== WebSocket.OPEN;
    check('W1 the unauthenticated upgrade is rejected', refused, error ? error.message : 'state=' + ws.readyState);
    try { ws.close(); } catch (e) {}
  }

  /* W2 — the cross-instance fan-out: connect to hub[0], publish via hub[1] */
  {
    const { ws } = await wsConnect(hubs[0].addr, TOKENS.t1);
    await next(ws, 1000); /* drain */
    await hubs[1].hub.broadcast('global', { hello: 'from-instance-2' });
    const m = await next(ws, 5000);
    check('W2 a broadcast via a DIFFERENT hub instance reaches the client', m && m.topic === 'global' && m.payload && m.payload.hello === 'from-instance-2', JSON.stringify(m).slice(0, 80));
    ws.close();
  }

  /* W3 — three instances, one bus: a broadcast via hub[2] reaches the clients on hub[0] AND hub[1] */
  {
    const c0 = (await wsConnect(hubs[0].addr, TOKENS.t1)).ws;
    const c1 = (await wsConnect(hubs[1].addr, TOKENS.t2)).ws;
    await next(c0, 800); await next(c1, 800); /* drain */
    await hubs[2].hub.broadcast('global', { ev: 'three-instance' });
    const [m0, m1] = await Promise.all([next(c0, 5000), next(c1, 5000)]);
    check('W3a hub[0] client receives', m0 && m0.payload && m0.payload.ev === 'three-instance');
    check('W3b hub[1] client receives', m1 && m1.payload && m1.payload.ev === 'three-instance');
    /* hub[2] is the PUBLISHER — it legitimately has zero local clients; the
       receiver hubs must each hold their own independent local client set */
    check('W3c the receiver hubs hold independent local client sets', hubs[0].hub.stats().localClients >= 1 && hubs[1].hub.stats().localClients >= 1, JSON.stringify(hubs.map((h) => h.hub.stats().localClients)));
    c0.close(); c1.close();
  }

  /* W4 — tenant isolation */
  {
    const { ws } = await wsConnect(hubs[0].addr, TOKENS.t1); /* school 1 */
    await next(ws, 800);
    /* subscribe to the OTHER tenant's topic = refused */
    ws.send(JSON.stringify({ action: 'subscribe', topic: 'tenant:2' }));
    const ref = await next(ws, 3000);
    check('W4a the cross-tenant subscribe is refused', ref && ref.error === 'tenant_isolation', JSON.stringify(ref));
    /* subscribe to the OWN tenant = ok */
    ws.send(JSON.stringify({ action: 'subscribe', topic: 'tenant:1' }));
    const ack = await next(ws, 3000);
    check('W5 the subscribe ack arrives', ack && ack.ok === true && ack.subscribed === 'tenant:1', JSON.stringify(ack));
    /* the tenant-2 broadcast must NOT reach the school-1 client */
    await hubs[1].hub.broadcast('tenant:2', { secret: 'school-2' });
    const leak = await next(ws, 1500);
    check('W4b the other tenant\'s broadcast does not leak', !leak || leak.topic !== 'tenant:2');
    /* the tenant-1 broadcast DOES reach */
    await hubs[2].hub.broadcast('tenant:1', { ev: 'school-1-event' });
    const got = await next(ws, 4000);
    check('W4c the own-tenant broadcast arrives', got && got.topic === 'tenant:1' && got.payload.ev === 'school-1-event');
    /* the superadmin = may subscribe to any tenant */
    const sa = (await wsConnect(hubs[1].addr, TOKENS.sa)).ws;
    await next(sa, 800);
    sa.send(JSON.stringify({ action: 'subscribe', topic: 'tenant:1' }));
    const saAck = await next(sa, 3000);
    check('W4d the superadmin may subscribe to any tenant', saAck && saAck.ok === true);
    ws.close(); sa.close();
  }

  for (const h of hubs) { h.hub.close(); h.srv.close(); }

  console.log('────────────────────────────────────────────');
  console.log('m15-17-ws-hub: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });

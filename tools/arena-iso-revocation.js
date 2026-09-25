#!/usr/bin/env node
'use strict';
/* Revocation during Redis outage: is a REVOKED session rejected when the
 * denylist (Redis) is unreachable? fail-open here = security finding. */
const crypto = require('crypto');
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const codeHash = (c, p) => sha256(c + '|' + p);
async function recoverCode(infra, phone) {
  for (let i = 0; i < 20; i++) {
    const raw = infra.redis(['get', 'payesh:otp:state']);
    if (raw && !raw.startsWith('ERR') && raw !== '(nil)' && raw !== '') {
      try {
        const d = JSON.parse(raw);
        const r = d.codes && d.codes[phone];
        if (r && r.h) { for (let n = 100000; n < 1000000; n++) if (codeHash(String(n), phone) === r.h) return String(n); }
      } catch (e) {}
    }
    await sleep(120);
  }
  return null;
}
async function login(port, infra, phone, nid) {
  const jar = L.makeJar();
  const s = await L.httpReq(port, 'POST', '/api/auth/send-code', { phone }, { jar, timeoutMs: 10000 });
  if (s.status !== 200) return { jar, ok: false, error: 'send:' + s.status };
  const code = await recoverCode(infra, phone);
  if (!code) return { jar, ok: false, error: 'no-code' };
  const l = await L.httpReq(port, 'POST', '/api/auth/login', { phone, code, national_id: nid }, { jar, timeoutMs: 10000 });
  return { jar, ok: l.status === 200, loginStatus: l.status };
}

(async () => {
  const infra = await L.Infra.start();
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const rd = api.port;

  const st = infra.store();
  const mgr = st.users.find((u) => u.phone === '09992630039') || st.users.find((u) => u.role === 'manager' && u.school_id === 1);
  const phone = String(mgr.phone), nid = mgr.national_id;

  const li = await login(rd, infra, phone, nid);
  console.log('login:', li.ok, li.loginStatus);
  const jar = li.jar;

  const me1 = await L.httpReq(rd, 'GET', '/api/auth/me', null, { jar });
  console.log('1. /me fresh:', me1.status);

  const lo = await L.httpReq(rd, 'POST', '/api/auth/logout', {}, { jar });
  console.log('2. logout:', lo.status);
  const me2 = await L.httpReq(rd, 'GET', '/api/auth/me', null, { jar });
  console.log('3. /me after logout (Redis healthy):', me2.status, JSON.stringify(me2.json).slice(0, 80));

  infra.stopRedis('kill9');
  await sleep(300);
  const me3 = await L.httpReq(rd, 'GET', '/api/auth/me', null, { jar, timeoutMs: 3000 });
  console.log('4. /me REVOKED session, Redis DOWN:', me3.status, 'err=' + me3.error, JSON.stringify(me3.json).slice(0, 140));

  infra.startRedisAgain();
  await sleep(400);
  const me4 = await L.httpReq(rd, 'GET', '/api/auth/me', null, { jar, timeoutMs: 3000 });
  console.log('5. /me REVOKED session, Redis back:', me4.status, JSON.stringify(me4.json).slice(0, 80));

  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); });

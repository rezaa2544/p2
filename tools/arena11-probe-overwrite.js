#!/usr/bin/env node
'use strict';
/* Decisive: on the bootstrap path, does the first nextId=1 upsert OVERWRITE
 * seed user id=1 (superadmin) instead of inserting? */
const crypto = require('crypto');
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
async function recoverCode(infra, phone) {
  for (let i = 0; i < 25; i++) {
    const raw = infra.redis(['get', 'payesh:otp:state']);
    if (raw && !raw.startsWith('ERR') && raw !== '(nil)' && raw !== '') {
      try { const d = JSON.parse(raw); const r = d.codes && d.codes[phone];
        if (r && r.h) for (let n = 100000; n < 1000000; n++) if (sha256(String(n) + '|' + phone) === r.h) return String(n); } catch (e) {}
    }
    await sleep(90);
  }
  return null;
}
async function login(port, infra, phone, nid) {
  const jar = L.makeJar();
  const s = await L.httpReq(port, 'POST', '/api/auth/send-code', { phone }, { jar, timeoutMs: 10000 });
  if (s.status !== 200) return { jar, ok: false };
  const code = await recoverCode(infra, phone);
  if (!code) return { jar, ok: false };
  const l = await L.httpReq(port, 'POST', '/api/auth/login', { phone, code, national_id: nid }, { jar, timeoutMs: 10000 });
  return { jar, ok: l.status === 200 };
}
(async () => {
  const infra = await L.Infra.start();
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const ps = (q) => infra.psql(q);
  console.log('BEFORE create — users id=1:', ps("SELECT id, full_name, role, phone FROM users WHERE id=1"));
  const mgr = await login(api.port, infra, '09992630039', '9995270358');
  console.log('manager login:', mgr.ok);
  const cu = await L.httpReq(api.port, 'POST', '/api/v1/users', { full_name: 'مهاجم', role: 'teacher', phone: '09990000001', national_id: '0000000001' }, { jar: mgr.jar });
  console.log('create user →', cu.status, JSON.stringify(cu.json).slice(0, 120));
  console.log('AFTER create — users id=1:', ps("SELECT id, full_name, role, phone FROM users WHERE id=1"));
  console.log('AFTER create — count of id=1 rows:', ps('SELECT COUNT(*) FROM users WHERE id=1'));
  // can the superadmin still log in (phone 09999838444)?
  const su = await login(api.port, infra, '09999838444', '9999843888');
  console.log('superadmin (id=1) login AFTER overwrite:', su.ok);
  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });

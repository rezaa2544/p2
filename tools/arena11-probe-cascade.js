#!/usr/bin/env node
'use strict';
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
  if (s.status !== 200) return { jar, ok: false, status: s.status };
  const code = await recoverCode(infra, phone);
  if (!code) return { jar, ok: false, status: -1 };
  const l = await L.httpReq(port, 'POST', '/api/auth/login', { phone, code, national_id: nid }, { jar, timeoutMs: 10000 });
  return { jar, ok: l.status === 200, status: l.status, body: l.json };
}
(async () => {
  const infra = await L.Infra.start();
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const ps = (q) => infra.psql(q);
  console.log('seq users_id_seq:', ps("SELECT last_value, is_called FROM users_id_seq"));

  const mgr = await login(api.port, infra, '09992630039', '9995270358');
  console.log('manager(id=2) login:', mgr.ok, mgr.status);

  const c1 = await L.httpReq(api.port, 'POST', '/api/v1/users', { full_name: 'ا_1', role: 'teacher', phone: '09990000001', national_id: '0000000001' }, { jar: mgr.jar });
  console.log('create#1 → id=' + (c1.json && c1.json.data && c1.json.data.id), c1.status);
  const c2 = await L.httpReq(api.port, 'POST', '/api/v1/users', { full_name: 'ا_2', role: 'teacher', phone: '09990000002', national_id: '0000000002' }, { jar: mgr.jar });
  console.log('create#2 → id=' + (c2.json && c2.json.data && c2.json.data.id), c2.status);

  console.log('id=1 after:', ps("SELECT full_name, role, phone FROM users WHERE id=1"));
  console.log('id=2 after:', ps("SELECT full_name, role, phone FROM users WHERE id=2"));
  console.log('id=3 after:', ps("SELECT full_name, role, phone FROM users WHERE id=3"));

  // superadmin login with CORRECT creds (phone 09999838444, nid 9993235245)
  const su = await login(api.port, infra, '09999838444', '9993235245');
  console.log('superadmin login after cascade:', su.ok, su.status, JSON.stringify(su.body || {}).slice(0, 120));
  // manager id=2 login again
  const mgr2 = await login(api.port, infra, '09992630039', '9995270358');
  console.log('manager(id=2) login after overwrite:', mgr2.ok, mgr2.status);
  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });

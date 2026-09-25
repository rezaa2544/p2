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
  console.log('    send-code(' + phone + ') →', s.status, JSON.stringify(s.json).slice(0, 90));
  if (s.status !== 200) return { jar, ok: false, status: s.status };
  const code = await recoverCode(infra, phone);
  if (!code) return { jar, ok: false, status: -1 };
  const l = await L.httpReq(port, 'POST', '/api/auth/login', { phone, code, national_id: nid }, { jar, timeoutMs: 10000 });
  return { jar, ok: l.status === 200, status: l.status };
}
(async () => {
  const infra = await L.Infra.start();
  infra.seedPg(['schools','users','classes','enrollments','parent_links']);
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const st = infra.store();
  const edu = (st.users || []).find((u) => u.role === 'edu_office');
  console.log('edu_office seed:', edu && JSON.stringify({ id: edu.id, office_id: edu.office_id, school_id: edu.school_id, phone: edu.phone, active: edu.active }));
  const l = await login(api.port, infra, String(edu.phone).replace(/\D/g, ''), edu.national_id);
  console.log('edu_office login:', l.ok, l.status);
  if (l.ok) {
    const reg = await L.httpReq(api.port, 'GET', '/api/v1/analytics/regional-intelligence?region_id=1', null, { jar: l.jar });
    console.log('edu_office regional region_id=1:', reg.status, JSON.stringify(reg.json).slice(0, 120));
    const qg = await L.httpReq(api.port, 'GET', '/api/v1/analytics/quality-governance?region_id=1', null, { jar: l.jar });
    console.log('edu_office quality-governance region_id=1:', qg.status, JSON.stringify(qg.json).slice(0, 100));
  }
  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });

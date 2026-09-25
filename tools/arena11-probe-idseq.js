#!/usr/bin/env node
'use strict';
/* Reproduction: does the "empty PG + bootstrap JSON store" boot path leave
 * identity sequences behind, so the first nextId() collides with seeded rows? */
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
      try {
        const d = JSON.parse(raw);
        const r = d.codes && d.codes[phone];
        if (r && r.h) for (let n = 100000; n < 1000000; n++) if (sha256(String(n) + '|' + phone) === r.h) return String(n);
      } catch (e) {}
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
  // Phase A: empty PG → bootstrap seeds from JSON store (no explicit seedPg)
  const infra = await L.Infra.start();
  let api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  console.log('A1 classes in PG:', infra.psql('SELECT COUNT(*) AS n, MAX(id) AS mx FROM classes'));
  console.log('A2 classes identity seq:', infra.psql("SELECT last_value, is_called FROM classes_id_seq"));
  console.log('A3 users seq:', infra.psql("SELECT last_value, is_called FROM users_id_seq"));
  const bootLog = api.logs().split('\n').filter((l) => /seed|hydrat|bootstrap/i.test(l));
  console.log('A4 boot log lines:', JSON.stringify(bootLog.slice(-5)));

  const mgr = await login(api.port, infra, '09992630039', '9995270358');
  console.log('A5 manager login:', mgr.ok);
  const cls = await L.httpReq(api.port, 'POST', '/api/v1/classes', { name: 'کلاس تازه', grade: 7 }, { jar: mgr.jar });
  console.log('A6 create class (bootstrap path):', cls.status, JSON.stringify(cls.json).slice(0, 120));
  console.log('A7 classes in PG after create:', infra.psql('SELECT COUNT(*) AS n, MAX(id) AS mx  FROM classes'));
  const first = await L.httpReq(api.port, 'POST', '/api/v1/classes', { name: 'کلاس دوم', grade: 7 }, { jar: mgr.jar });
  console.log('A8 create second class:', first.status, JSON.stringify(first.json).slice(0, 90));
  api.stop(); infra.stop();

  // Phase B: explicit seedPg (v2-style) as control
  const infra2 = await L.Infra.start();
  const seeded = infra2.seedPg(['schools', 'users', 'classes', 'enrollments', 'parent_links']);
  console.log('B1 seedPg report:', JSON.stringify(seeded));
  let api2 = await L.startApi({ infra: infra2, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const mgr2 = await login(api2.port, infra2, '09992630039', '9995270358');
  console.log('B2 manager login:', mgr2.ok);
  const clsB = await L.httpReq(api2.port, 'POST', '/api/v1/classes', { name: 'کلاس تازه ب', grade: 7 }, { jar: mgr2.jar });
  console.log('B3 create class (seeded path):', clsB.status, JSON.stringify(clsB.json).slice(0, 90));
  console.log('B4 classes in PG after create:', infra2.psql('SELECT COUNT(*) AS n, MAX(id) AS mx FROM classes'));
  api2.stop(); infra2.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });

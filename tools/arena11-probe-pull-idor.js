#!/usr/bin/env node
'use strict';
/* hunt7: legacy /api/students/:id parent path (parent_id column drift) +
 * pull-route parent_links leak breadth (student/teacher) */
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
  return { jar, ok: l.status === 200, status: l.status };
}
(async () => {
  const infra = await L.Infra.start();
  infra.seedPg(['schools','users','classes','enrollments','parent_links']);
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const st = infra.store();
  const byId = (i) => (st.users || []).find((u) => u.id === i);

  const parent = await login(api.port, infra, '09998544082', byId(17).national_id);
  const student = await login(api.port, infra, '09992336550', byId(16).national_id);
  const teacher = await login(api.port, infra, '09996055377', byId(6).national_id);

  /* F-PARENT: legacy idor path for parent's own child */
  const idorChild = await L.httpReq(api.port, 'GET', '/api/students/16', null, { jar: parent.jar });
  console.log('F-PARENT legacy GET /api/students/16 (parent own child):', idorChild.status, JSON.stringify(idorChild.json).slice(0, 90));
  const v1Child = await L.httpReq(api.port, 'GET', '/api/v1/students/16', null, { jar: parent.jar });
  console.log('F-PARENT v1  GET /api/v1/students/16 (parent own child):', v1Child.status, JSON.stringify(v1Child.json).slice(0, 90));
  // API log line for the PG scope failure
  const log = api.logs().split('\n').filter((l) => /POLICY\] PG parent_links|IDOR\] PG scope/.test(l));
  console.log('F-PARENT api logs:', JSON.stringify(log.slice(-3)));

  /* F-PULL breadth: student / teacher pull parent_links */
  for (const [nm, jar] of [['student', student.jar], ['teacher', teacher.jar], ['parent', parent.jar]]) {
    const pull = await L.httpReq(api.port, 'GET', '/api/v1/pull?collections=parent_links', null, { jar });
    let n = -1, first = null;
    try { const pl = pull.json && pull.json.collections && pull.json.collections.parent_links; n = Array.isArray(pl) ? pl.length : -1; first = Array.isArray(pl) && pl[0]; } catch (e) {}
    console.log('F-PULL ' + nm + ' pull parent_links:', pull.status, 'rows_exposed=' + n, 'first=' + JSON.stringify(first));
  }
  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });

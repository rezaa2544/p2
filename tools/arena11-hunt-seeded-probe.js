#!/usr/bin/env node
'use strict';
/* hunt2b: re-run seed-dependent checks WITH seedPg + new pull-route / restart checks */
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
  const seed = infra.seedPg(['schools','users','classes','enrollments','parent_links']);
  console.log('seedPg:', JSON.stringify(seed));
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const st = infra.store();
  const byId = (i) => (st.users || []).find((u) => u.id === i);
  const mgr = await login(api.port, infra, '09992630039', '9995270358');
  const teacher = await login(api.port, infra, '09996055377', byId(6).national_id);
  const parent = await login(api.port, infra, '09998544082', byId(17).national_id);

  /* HF6 teacher students (with seeds) */
  const tList = await L.httpReq(api.port, 'GET', '/api/v1/students', null, { jar: teacher.jar });
  let tIds = []; try { tIds = ((tList.json && tList.json.data) || []).map((x) => x.id); } catch (e) {}
  const taught = (st.schedule || []).filter((s) => s.teacher_id === 6).map((s) => s.class_id);
  const enr = (st.enrollments || []).filter((e) => taught.includes(e.class_id)).map((e) => e.student_id);
  const expect = new Set(enr);
  const bad = tIds.filter((id) => !expect.has(id));
  console.log('HF6 teacher6 taught classes', JSON.stringify(taught), '→ expected students', expect.size);
  console.log('HF6 teacher6 list count:', tIds.length, 'out-of-scope rows:', JSON.stringify(bad));

  /* HF11 sync conflict scoping with real stale PATCH */
  const clsList = await L.httpReq(api.port, 'GET', '/api/v1/classes', null, { jar: mgr.jar });
  const cid = clsList.json && clsList.json.data && clsList.json.data[0] && clsList.json.data[0].id;
  if (cid) {
    await L.httpReq(api.port, 'PATCH', '/api/v1/classes/' + cid, { name: 'hunt-first' }, { jar: mgr.jar });
    const st1 = await L.httpReq(api.port, 'PATCH', '/api/v1/classes/' + cid, { base_version: 1, name: 'hunt-stale' }, { jar: mgr.jar });
    console.log('HF11 stale PATCH:', st1.status, JSON.stringify(st1.json).slice(0, 100));
    const cf = await L.httpReq(api.port, 'GET', '/api/sync/conflicts', null, { jar: mgr.jar });
    let cfs = []; try { cfs = (cf.json && cf.json.conflicts) || []; } catch (e) {}
    const foreign = cfs.filter((c) => c.school_id != null && Number(c.school_id) !== 1).length;
    console.log('HF11 conflicts: status=' + cf.status, 'n=' + cfs.length, 'foreign=' + foreign);
  }

  /* HF13 pull route: parent schools scope + parent_links */
  const pull = await L.httpReq(api.port, 'GET', '/api/v1/pull?collections=schools,parent_links,users', null, { jar: parent.jar });
  let plCount = 0, schoolIds = [];
  try {
    const b = pull.json;
    if (b && b.collections) {
      plCount = (b.collections.parent_links || []).length;
      schoolIds = (b.collections.schools || []).map((s) => s.id);
    }
  } catch (e) {}
  console.log('HF13 parent pull: status=' + pull.status, 'parent_links_exposed=' + plCount, 'schools=' + JSON.stringify(schoolIds));
  const pullMgr = await L.httpReq(api.port, 'GET', '/api/v1/pull?collections=schools', null, { jar: mgr.jar });
  let mgrSchools = []; try { mgrSchools = (pullMgr.json && pullMgr.json.collections && pullMgr.json.collections.schools || []).map((s) => s.id); } catch (e) {}
  console.log('HF13 manager pull schools:', JSON.stringify(mgrSchools));

  /* HF14 cross-school student by id (manager) */
  const otherStudent = (st.users || []).find((u) => u.role === 'student' && u.school_id === 2);
  if (otherStudent) {
    const s2 = await L.httpReq(api.port, 'GET', '/api/v1/students/' + otherStudent.id, null, { jar: mgr.jar });
    console.log('HF14 manager GET student school-2 id=' + otherStudent.id, '→', s2.status, JSON.stringify(s2.json).slice(0, 80));
  }
  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });

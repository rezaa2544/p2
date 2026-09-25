#!/usr/bin/env node
'use strict';
/* Arena 11 — Fresh Defect Hunt probe (independent of prior work).
 * Runs against real PG17+Redis8 + production-mode server at HEAD 66928be.
 * Only reuses the repo's own Infra/startApi. Every hypothesis is scored
 * PASS / FAIL / BLOCKED with first-hand evidence. */
const crypto = require('crypto');
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const P = (v) => String(v).replace(/\D/g, '');

const rows = [];
function rec(status, name, detail) {
  rows.push({ status, name, detail: String(detail).replace(/\s+/g, ' ').slice(0, 400) });
  console.log((status === 'FAIL' ? '  ❌ ' : status === 'PASS' ? '  ✅ ' : '  ⏸ ') + name + '  —  ' + String(detail).slice(0, 300));
}

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
  if (s.status !== 200) return { jar, ok: false, error: 'send:' + s.status };
  const code = await recoverCode(infra, phone);
  if (!code) return { jar, ok: false, error: 'no-code' };
  const l = await L.httpReq(port, 'POST', '/api/auth/login', { phone, code, national_id: nid }, { jar, timeoutMs: 10000 });
  return { jar, ok: l.status === 200, loginStatus: l.status, body: l.json };
}

(async () => {
  const infra = await L.Infra.start();
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const rd = api.port;
  const st = infra.store();
  const byId = (i) => (st.users || []).find((u) => u.id === i);
  const schools = st.schools || [];
  const school2 = schools.find((s) => s.id === 2) || {};
  const school3 = schools.find((s) => s.id === 3) || {};
  const school3District = school3.district_id; // 11
  const edu = (st.users || []).find((u) => u.role === 'edu_office');
  const teacher6 = byId(6);

  rec('EVIDENCE', 'HEAD/tree', 'HEAD=66928be; server/,migrations/,tests/ byte-identical at HEAD; infra/tools mode-only artifacts; isolated PG17.11 + Redis8.0.2 + Node22.21.1');

  /* ── HF1: regional-intelligence — manager with region_id param ── */
  const mgr = await login(rd, infra, '09992630039', byId(2).national_id);
  rec(mgr.ok ? 'EVIDENCE' : 'BLOCKED', 'login manager', 'status=' + mgr.loginStatus);
  const su = await login(rd, infra, edu ? P(edu.phone) : '09999838444', (edu || byId(1)).national_id);

  const regMan = await L.httpReq(rd, 'GET', '/api/v1/analytics/regional-intelligence?region_id=' + school3District, null, { jar: mgr.jar });
  rec(regMan.status !== 200 ? 'PASS' : 'FAIL', 'HF1 regional-intelligence: manager + region_id=' + school3District + ' (school-3 district) → expect deny', 'status=' + regMan.status + ' ' + JSON.stringify(regMan.json).slice(0, 140));
  if (regMan.status === 200) rec('FAIL', 'HF1 detail', 'manager of school 1 received district-scope regional network for district ' + school3District + ' — cross-tenant read');
  const regManOwn = await L.httpReq(rd, 'GET', '/api/v1/analytics/regional-intelligence?region_id=1', null, { jar: mgr.jar });
  rec('EVIDENCE', 'HF1 contrast: manager + region_id=1', 'status=' + regManOwn.status + ' ' + JSON.stringify(regManOwn.json).slice(0, 100));

  /* ── HF2: quality-governance — region branch vs school branch ── */
  const qgSchool3 = await L.httpReq(rd, 'GET', '/api/v1/analytics/quality-governance?school_id=3', null, { jar: mgr.jar });
  rec(qgSchool3.status === 403 ? 'PASS' : 'FAIL', 'HF2 control: quality-governance school_id=3 (manager school1) → 403', 'status=' + qgSchool3.status + ' ' + JSON.stringify(qgSchool3.json).slice(0, 100));
  const qgReg = await L.httpReq(rd, 'GET', '/api/v1/analytics/quality-governance?region_id=' + school3District, null, { jar: mgr.jar });
  rec(qgReg.status !== 200 ? 'PASS' : 'FAIL', 'HF2 quality-governance: manager + region_id=' + school3District + ' → expect deny', 'status=' + qgReg.status + ' ' + JSON.stringify(qgReg.json).slice(0, 160));
  if (qgReg.status === 200) rec('FAIL', 'HF2 detail', 'manager crossed to district ' + school3District + ' scope with mock-derived quality summary — tenant isolation gap (region branch lacks manager check)');
  const qgRegOwn = await L.httpReq(rd, 'GET', '/api/v1/analytics/quality-governance?region_id=1', null, { jar: mgr.jar });
  rec('EVIDENCE', 'HF2 contrast: manager + region_id=1', 'status=' + qgRegOwn.status + ' ' + JSON.stringify(qgRegOwn.json).slice(0, 100));

  /* ── HF3: longitudinal-intelligence region branch ── */
  const loSchool3 = await L.httpReq(rd, 'GET', '/api/v1/analytics/longitudinal-intelligence?entity_id=3&entity_type=school', null, { jar: mgr.jar });
  rec(loSchool3.status === 403 ? 'PASS' : 'FAIL', 'HF3 control: longitudinal school entity_id=3 → 403', 'status=' + loSchool3.status);
  const loReg = await L.httpReq(rd, 'GET', '/api/v1/analytics/longitudinal-intelligence?entity_id=' + school3District + '&entity_type=region', null, { jar: mgr.jar });
  rec(loReg.status !== 200 ? 'PASS' : 'FAIL', 'HF3 longitudinal: manager + entity_type=region entity_id=' + school3District + ' → expect deny', 'status=' + loReg.status + ' ' + JSON.stringify(loReg.json).slice(0, 160));
  if (loReg.status === 200) rec('FAIL', 'HF3 detail', 'manager region-trend access for district ' + school3District + ' — region branch lacks manager check');

  /* ── HF4: edu_office regional-intelligence own region (control) ── */
  if (edu) {
    const eduLogin = await login(rd, infra, P(edu.phone), edu.national_id);
    rec(eduLogin.ok ? 'EVIDENCE' : 'BLOCKED', 'login edu_office id=' + edu.id + ' (office_id=' + edu.office_id + ')', 'status=' + eduLogin.loginStatus);
    const eduReg = await L.httpReq(rd, 'GET', '/api/v1/analytics/regional-intelligence?region_id=1', null, { jar: eduLogin.jar });
    rec('EVIDENCE', 'HF4 edu_office regional region_id=1', 'status=' + eduReg.status + ' ' + JSON.stringify(eduReg.json).slice(0, 100));
  }

  /* ── HF5: parent student-scope live (idor + list) ── */
  const parent = await login(rd, infra, '09998544082', byId(17).national_id);
  const pChild = await L.httpReq(rd, 'GET', '/api/v1/students/16', null, { jar: parent.jar });
  rec(pChild.status === 200 ? 'PASS' : 'FAIL', 'HF5 parent GET /api/v1/students/16 (own child) → 200', 'status=' + pChild.status + ' ' + JSON.stringify(pChild.json).slice(0, 90));
  const pOther = await L.httpReq(rd, 'GET', '/api/v1/students/18', null, { jar: parent.jar });
  rec(pOther.status === 404 ? 'PASS' : 'FAIL', 'HF5 parent GET /api/v1/students/18 (not child) → 404 anti-enum', 'status=' + pOther.status + ' ' + JSON.stringify(pOther.json).slice(0, 90));
  const pList = await L.httpReq(rd, 'GET', '/api/v1/students', null, { jar: parent.jar });
  let pIds = [];
  try { pIds = ((pList.json && pList.json.data) || []).map((x) => x.id); } catch (e) {}
  rec(pList.status === 200 && pIds.length === 1 && pIds[0] === 16 ? 'PASS' : 'FAIL', 'HF5 parent GET /api/v1/students (list) → only child 16', 'status=' + pList.status + ' ids=' + JSON.stringify(pIds));

  /* ── HF6: teacher scope live (taught class only) ── */
  const teacher = await login(rd, infra, teacher6 ? P(teacher6.phone) : '09996055377', byId(6).national_id);
  const tList = await L.httpReq(rd, 'GET', '/api/v1/students', null, { jar: teacher.jar });
  let tIds = [];
  try { tIds = ((tList.json && tList.json.data) || []).map((x) => x.id); } catch (e) {}
  rec(tList.status === 200 ? 'EVIDENCE' : 'FAIL', 'HF6 teacher GET /api/v1/students', 'status=' + tList.status + ' count=' + tIds.length + ' sample=' + JSON.stringify(tIds.slice(0, 8)));

  /* ── HF7: public-report unauthed (invalid sid behavior + PII) ── */
  const pr1 = await L.httpReq(rd, 'GET', '/api/public-report?school_id=3', null, {});
  rec(pr1.status === 200 ? 'PASS' : 'FAIL', 'HF7 public-report ?school_id=3 (unauthed) → 200 aggregate', 'status=' + pr1.status + ' sid=' + (pr1.json && pr1.json.report && pr1.json.report.sid));
  const prBad = await L.httpReq(rd, 'GET', '/api/public-report?school_id=999', null, {});
  rec('EVIDENCE', 'HF7 public-report ?school_id=999 (invalid) → falls back to first school', 'status=' + prBad.status + ' fallback sid=' + (prBad.json && prBad.json.report && prBad.json.report.sid));
  const prRaw = JSON.stringify(pr1.json || {});
  const pii = ['national_id', 'phone', '0999', '9996312461'].some((k) => prRaw.includes(k));
  rec(!pii ? 'PASS' : 'FAIL', 'HF7 public-report leaks no PII', 'contains_phone_or_nid=' + pii + ' keys=' + Object.keys((pr1.json && pr1.json.report) || {}).join(','));

  /* ── HF8: /metrics gate ── */
  const mxNoAuth = await L.httpReq(rd, 'GET', '/metrics', null, {});
  rec(mxNoAuth.status === 401 || mxNoAuth.status === 404 ? 'PASS' : 'FAIL', 'HF8 /metrics without token → not exposed', 'status=' + mxNoAuth.status);
  const mxTok = await L.httpReq(rd, 'GET', '/metrics', null, { bearer: L.CHAOS_METRICS_TOKEN });
  rec(mxTok.status === 200 ? 'PASS' : 'FAIL', 'HF8 /metrics with bearer token → 200', 'status=' + mxTok.status + ' has_payesh_series=' + /^payesh_/m.test(mxTok.raw || ''));

  /* ── HF9: admin backup/restore in PG mode (fail-closed + role gate) ── */
  const suLogin = await login(rd, infra, '09999838444', byId(1).national_id);
  const bakSu = await L.httpReq(rd, 'POST', '/api/admin/backup', {}, { jar: suLogin.jar });
  rec(bakSu.status === 501 ? 'PASS' : 'FAIL', 'HF9 superadmin POST /api/admin/backup (PG authoritative) → 501', 'status=' + bakSu.status + ' ' + JSON.stringify(bakSu.json).slice(0, 80));
  const bakMgr = await L.httpReq(rd, 'POST', '/api/admin/backup', {}, { jar: mgr.jar });
  rec(bakMgr.status === 403 ? 'PASS' : 'FAIL', 'HF9 manager POST /api/admin/backup → 403', 'status=' + bakMgr.status + ' ' + JSON.stringify(bakMgr.json).slice(0, 80));

  /* ── HF10: system POST role gates (manager vs superadmin) ── */
  const pilotMgr = await L.httpReq(rd, 'POST', '/api/v1/system/phase5/pilot-approval', { approved: true }, { jar: mgr.jar });
  rec(pilotMgr.status === 403 ? 'PASS' : 'FAIL', 'HF10 manager phase5/pilot-approval → 403', 'status=' + pilotMgr.status + ' ' + JSON.stringify(pilotMgr.json).slice(0, 90));
  const canaryMgr = await L.httpReq(rd, 'POST', '/api/v1/system/phase6/canary/weight', { cluster_id: 'x', target_weight: 50 }, { jar: mgr.jar });
  rec(canaryMgr.status === 403 ? 'PASS' : 'FAIL', 'HF10 manager phase6/canary/weight → 403', 'status=' + canaryMgr.status + ' ' + JSON.stringify(canaryMgr.json).slice(0, 90));
  const pilotSu = await L.httpReq(rd, 'POST', '/api/v1/system/phase5/pilot-approval', { approved: true }, { jar: suLogin.jar });
  rec('EVIDENCE', 'HF10 superadmin phase5/pilot-approval (control)', 'status=' + pilotSu.status + ' ' + JSON.stringify(pilotSu.json).slice(0, 120));

  /* ── HF11: sync conflict list scoping for manager ── */
  /* seed a conflict via stale PATCH, then list as manager */
  const clsList = await L.httpReq(rd, 'GET', '/api/v1/classes', null, { jar: mgr.jar });
  const cid = clsList.json && clsList.json.data && clsList.json.data[0] && clsList.json.data[0].id;
  if (cid) {
    await L.httpReq(rd, 'PATCH', '/api/v1/classes/' + cid, { name: 'hunt-class-first' }, { jar: mgr.jar });
    const p1 = await L.httpReq(rd, 'PATCH', '/api/v1/classes/' + cid, { base_version: 1, name: 'hunt-class-a' }, { jar: mgr.jar });
    rec('EVIDENCE', 'HF11 stale PATCH seed (2nd PATCH base_version=1)', 'status=' + p1.status + ' ' + JSON.stringify(p1.json).slice(0, 90));
    const cf = await L.httpReq(rd, 'GET', '/api/sync/conflicts', null, { jar: mgr.jar });
    let cfs = [];
    try { cfs = (cf.json && cf.json.conflicts) || []; } catch (e) {}
    const foreign = cfs.filter((c) => c.school_id != null && Number(c.school_id) !== 1).length;
    rec(cf.status === 200 && foreign === 0 ? 'PASS' : 'FAIL', 'HF11 manager GET /api/sync/conflicts → own school only', 'status=' + cf.status + ' n=' + cfs.length + ' foreign=' + foreign);
    /* legacy /api/public-report already covered; sync conflict resolve role gate */
    const crMgr = await L.httpReq(rd, 'POST', '/api/sync/resolve-conflict', { id: cfs[0] && cfs[0].id, winner: 'server' }, { jar: mgr.jar });
    rec('EVIDENCE', 'HF11 manager resolve-conflict', 'status=' + crMgr.status + ' ' + JSON.stringify(crMgr.json).slice(0, 90));
  }

  /* ── HF12: business write as manager with body.school_id=3 (masquerade) ── */
  const masq = await L.httpReq(rd, 'POST', '/api/v1/classes', { name: 'کلاس جعلی', grade: 7, school_id: 3 }, { jar: mgr.jar });
  rec(masq.status === 201 ? 'FAIL' : 'PASS', 'HF12 manager POST /api/v1/classes with body.school_id=3 → not school-3', 'status=' + masq.status + ' ' + JSON.stringify(masq.json).slice(0, 100));
  if (masq.status === 201 && masq.json && masq.json.data) rec('EVIDENCE', 'HF12 detail', 'created school_id=' + masq.json.data.school_id + ' (expected, min(actor.school_id))');

  /* summary */
  const tally = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  console.log('\nHUNT SUMMARY:', JSON.stringify(tally), '| total', rows.length);
  const out = { runner: 'arena-hunt2-probe.js', time: new Date().toISOString(), head: '66928be', tally, rows };
  require('fs').writeFileSync('/home/user/arena-hunt2-evidence.json', JSON.stringify(out, null, 2));
  api.stop(); infra.stop();
})().catch((e) => { console.error('HUNT ERROR', e.stack || e); process.exit(1); });

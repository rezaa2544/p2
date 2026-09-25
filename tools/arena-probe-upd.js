#!/usr/bin/env node
'use strict';
/* Real-PG probe: does the upd-mirror work on collections whose table has no `version` column?
 * Control: ins visitors (should 200). Target: upd visitors (else-branch appends version → expect fail).
 * Positive control: classes PATCH (version column exists → 200).
 */
const fs = require('fs');
const crypto = require('crypto');
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const codeHash = (c, p) => sha256(c + '|' + p);
const P = (v) => String(v).replace(/\D/g, '');

async function recover(infra, phone) {
  for (let i = 0; i < 20; i++) {
    const raw = infra.redis(['get', 'payesh:otp:state']);
    if (raw && !raw.startsWith('ERR') && raw !== '(nil)') {
      try { const d = JSON.parse(raw); const r = d.codes && d.codes[phone]; if (r && r.h) { for (let n = 100000; n < 1000000; n++) if (codeHash(String(n), phone) === r.h) return String(n); } } catch (e) {}
    }
    await sleep(120);
  }
  return null;
}
async function login(port, infra, phone, nid) {
  const jar = L.makeJar();
  const s = await L.httpReq(port, 'POST', '/api/auth/send-code', { phone }, { jar, timeoutMs: 10000 });
  if (s.status !== 200) return { jar, login: null, error: 'send:' + s.status };
  const code = await recover(infra, phone);
  if (!code) return { jar, login: null, error: 'no-code' };
  const l = await L.httpReq(port, 'POST', '/api/auth/login', { phone, code, national_id: nid }, { jar, timeoutMs: 10000 });
  return { jar, login: l };
}

(async () => {
  const infra = await L.Infra.start();
  const st = infra.store();
  const mgr = st.users.find((u) => u.role === 'manager' && u.school_id === 1);
  infra.seedPg(['schools', 'users', 'classes', 'visitors', 'preapps', 'assets']);
  const seed2 = JSON.parse(fs.readFileSync('/home/user/repo/server/data/payesh.json', 'utf8'));
  for (const r of (seed2.schools || [])) if (r && r.capabilities != null && typeof r.capabilities === 'object') infra.psql("UPDATE schools SET capabilities='" + JSON.stringify(r.capabilities).replace(/'/g, "''") + "'::jsonb WHERE id=" + r.id);

  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock', PAYESH_SMS_COOLDOWN_S: '0' } });
  const m = await login(api.port, infra, P(mgr.phone), mgr.national_id);
  if (!(m.login && m.login.status === 200)) { console.log('LOGIN FAIL', m.login && m.login.status); api.stop(); infra.stop(); return; }
  const jar = m.jar;

  const out = [];

  // control: visitors ins
  const uidI = 'probe-ins-' + Date.now();
  const rI = await L.syncWrite(api.port, jar, { uid: uidI, by: mgr.id, collection: 'visitors', type: 'ins', data: { name: 'probe-visitor', purpose: 'x', school_id: 1 } }, 12000);
  out.push(['visitors ins (control)', rI.status, JSON.stringify(rI.json).slice(0, 120)]);
  const vid = infra.psql("SELECT id FROM visitors WHERE name='probe-visitor' LIMIT 1");
  out.push(['visitors ins → PG id', '', vid]);

  // TARGET: visitors upd (no version col)
  const uidU = 'probe-upd-' + Date.now();
  const rU = await L.syncWrite(api.port, jar, { uid: uidU, by: mgr.id, collection: 'visitors', type: 'upd', id: Number(vid), data: { purpose: 'changed' } }, 12000);
  out.push(['visitors upd (no version col in table)', rU.status, JSON.stringify(rU.json).slice(0, 160) + ' raw=' + rU.raw.slice(0, 120)]);
  const vp = infra.psql("SELECT purpose FROM visitors WHERE id=" + vid);
  out.push(['visitors purpose after upd → PG', '', vp]);

  // TARGET: preapps upd (no version col)
  const uidP = 'probe-preapps-' + Date.now();
  const rP1 = await L.syncWrite(api.port, jar, { uid: uidP, by: mgr.id, collection: 'preapps', type: 'ins', data: { name: 'probe-app', stage: 'contact', school_id: 1 } }, 12000);
  const pid = infra.psql("SELECT id FROM preapps WHERE name='probe-app' LIMIT 1");
  const rP2 = await L.syncWrite(api.port, jar, { uid: 'probe-preapps-upd-' + Date.now(), by: mgr.id, collection: 'preapps', type: 'upd', id: Number(pid), data: { note: 'updated-note' } }, 12000);
  out.push(['preapps upd (no version col)', rP2.status, JSON.stringify(rP2.json).slice(0, 160) + ' raw=' + rP2.raw.slice(0, 120)]);
  const pn = infra.psql("SELECT note FROM preapps WHERE id=" + pid);
  out.push(['preapps note after upd → PG', '', pn]);

  // POSITIVE CONTROL: classes PATCH (version col exists via migration 004)
  const cr = await L.httpReq(api.port, 'POST', '/api/v1/classes', { name: 'probe-class', grade: 6 }, { jar, timeoutMs: 8000 });
  const cid = cr.json && cr.json.data && cr.json.data.id;
  const ver = infra.psql("SELECT version FROM classes WHERE id=" + cid);
  out.push(['classes create → 201 (version col=' + ver + ')', cr.status, JSON.stringify(cr.json).slice(0, 80)]);
  const cp = await L.httpReq(api.port, 'PATCH', '/api/v1/classes/' + cid, { name: 'probe-class-renamed', base_version: 1 }, { jar, timeoutMs: 8000 });
  out.push(['classes PATCH upd (version col exists → control)', cp.status, JSON.stringify(cp.json).slice(0, 160)]);

  // capture metrics/audit for the smoke
  const dbg = infra.psql("SELECT count(*) FROM sync_conflicts");
  out.push(['sync_conflicts rows', '', dbg]);

  console.log('\n=== PROBE RESULTS ===');
  for (const line of out) console.log(line[0] + ' :: ' + line[1] + ' :: ' + line[2]);

  api.stop();
  infra.stop();
})().catch((e) => { console.error('PROBE ERROR', e.stack || e); });

#!/usr/bin/env node
'use strict';
/* Probe: delegated-permission flags (asset_staff / lib_staff) in PG-live mode.
 * Seed teacher id14 has asset_staff=1 (asset officer), teacher id15 lib_staff=1.
 * policy.js inScope('assets') requires store.users[me].asset_staff===1.
 * Hypotheses: (a) users PG table has no asset_staff/lib_staff column;
 *             (b) after hydration store.users = PG rows (flag absent) →
 *             teacher's authorized asset write becomes out_of_scope in PG mode.
 * Control: manager (id2) asset upd must succeed.
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
  const out = [];
  const infra = await L.Infra.start();
  const st = infra.store();
  const mgr = st.users.find((u) => u.role === 'manager' && u.school_id === 1);
  const t14 = st.users.find((u) => u.id === 14);   // asset_staff=1
  out.push(['seed teacher14.asset_staff (JSON SoT)', '', t14.asset_staff + ' (school ' + t14.school_id + ')']);
  out.push(['seed teacher15.lib_staff (JSON SoT)', '', (st.users.find((u) => u.id === 15) || {}).lib_staff]);

  infra.seedPg(['schools', 'users', 'assets']);
  const seed2 = JSON.parse(fs.readFileSync('/home/user/repo/server/data/payesh.json', 'utf8'));
  for (const r of (seed2.schools || [])) if (r && r.capabilities != null && typeof r.capabilities === 'object') infra.psql("UPDATE schools SET capabilities='" + JSON.stringify(r.capabilities).replace(/'/g, "''") + "'::jsonb WHERE id=" + r.id);

  // (a) does the PG users table carry the flag column?  (expect ERR)
  const colProbe = infra.psql("SELECT asset_staff FROM users WHERE id=14");
  out.push(['(a) SELECT asset_staff FROM users → PG', '', colProbe]);
  const colProbe2 = infra.psql("SELECT lib_staff FROM users WHERE id=15");
  out.push(['(a) SELECT lib_staff FROM users → PG', '', colProbe2]);

  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock', PAYESH_SMS_COOLDOWN_S: '0' } });
  const m = await login(api.port, infra, P(mgr.phone), mgr.national_id);
  const t = await login(api.port, infra, P(t14.phone), t14.national_id);
  out.push(['login manager', m.login && m.login.status, '']);
  out.push(['login teacher14 (asset officer in JSON)', t.login && t.login.status, JSON.stringify(t.login && t.login.json).slice(0, 120)]);

  // (b) teacher14 (asset_staff=1 in JSON) tries assets upd in_use → expect out_of_scope in PG mode
  const rT = await L.syncWrite(api.port, t.jar, { uid: 'probe-asset-t-' + Date.now(), by: 14, collection: 'assets', type: 'upd', id: 3, data: { status: 'in_use' } }, 12000);
  out.push(['(b) teacher14 assets upd (flag lost post-hydration?)', rT.status, JSON.stringify(rT.json).slice(0, 140)]);
  const a3 = infra.psql("SELECT status FROM assets WHERE id=3");
  out.push(['assets.id=3 status in PG', '', a3]);

  // CONTROL: manager same op (manager can upd assets)
  const rM = await L.syncWrite(api.port, m.jar, { uid: 'probe-asset-m-' + Date.now(), by: mgr.id, collection: 'assets', type: 'upd', id: 3, data: { status: 'in_use' } }, 12000);
  out.push(['CONTROL manager assets upd', rM.status, JSON.stringify(rM.json).slice(0, 120) + ' raw=' + rM.raw.slice(0, 90)]);
  const a3b = infra.psql("SELECT status FROM assets WHERE id=3");
  out.push(['assets.id=3 status in PG after manager', '', a3b]);

  console.log('\n=== DELEGATION PROBE RESULTS ===');
  for (const line of out) console.log(line[0] + ' :: ' + line[1] + ' :: ' + line[2]);

  api.stop();
  infra.stop();
})().catch((e) => { console.error('PROBE ERROR', e.stack || e); });

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/canary-persistence.js — Canary Production-Contract chain proof
   (Root-Cause Elimination §2/§3: Persistent State / Audit / Rollback)

   Chain under test:
     HTTP promote → governance (approved + operator + signature, durable
     replay ledger) → decision engine → phase6_canary_configs (PostgreSQL
     SSoT, version++) → phase6_audit_events (rollout history) →
     kill -9 → restart → boot hydration (RAM is NOT the authority) →
     signature replay REJECTED from the durable ledger → rollback ⇒ weight 0.

   Without DATABASE_URL: FAIL (exit 1) — never fake-green.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const { Client } = require('pg');
const gov = require('../server/infrastructure/phase6-governance');

const NODE = process.execPath;
const ROOT = path.join(__dirname, '..');
const PORT = 3207;
const results = [];
function chk(name, ok, detail) { results.push(ok); console.log((ok ? '✅ ' : '❌ ') + name + (detail != null ? ' — ' + String(detail).slice(0, 170) : '')); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign({ 'content-type': 'application/json' },
        data ? { 'content-length': Buffer.byteLength(data) } : {}, cookie ? { cookie } : {}) },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, body: b, headers: res.headers }); }); });
    r.on('error', () => resolve({ status: 0, json: null, body: '', headers: {} }));
    if (data) r.write(data); r.end();
  });
}
function boot(env) {
  return new Promise((resolve) => {
    const proc = spawn(NODE, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
    proc.__log = () => log;
    (async () => {
      for (let i = 0; i < 140; i++) { const h = await req('GET', '/api/health'); if (h.status === 200) return resolve(proc); await sleep(250); }
      console.error('  boot failed:', log.slice(-400)); resolve(null);
    })();
  });
}
function kill9(proc) { try { proc.kill('SIGKILL'); } catch (e) {} }
async function pgOne(sql, params) { const c = new Client({ connectionString: URL }); await c.connect(); const r = await c.query(sql, params || []); await c.end(); return r.rows; }

let URL;
(async () => {
  const BASE_URL = process.env.DATABASE_URL;
  if (!BASE_URL) { console.error('❌ DATABASE_URL required — dependency missing = FAIL (exit 1)'); process.exit(1); }
  URL = BASE_URL.replace(/\/[^/?]+(\?.*)?$/, (m, q) => ('/payesh_canary' + (q || '')));
  const adm = new Client({ connectionString: BASE_URL });
  await adm.connect();
  await adm.query('DROP DATABASE IF EXISTS payesh_canary').catch(() => {});
  await adm.query('CREATE DATABASE payesh_canary');
  await adm.end();

  /* full migration chain (015 creates the canary tables) */
  let migFail = 0;
  for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).sort()) {
    if (!/^\d{3}_.*\.sql$/.test(f) || f.endsWith('.down.sql')) continue;
    try { execSync(`psql "${URL}" -v ON_ERROR_STOP=1 -q -f "${path.join(ROOT, 'migrations', f)}"`, { stdio: 'pipe' }); }
    catch (e) { console.error('MIG FAIL', f, String(e.stderr).slice(0, 200)); migFail = 1; break; }
  }
  chk('زنجیرهٔ migration (شامل جدول‌های canary)', migFail === 0);
  if (migFail) process.exit(1);

  execSync(`${NODE} server/seed.js`, { cwd: ROOT, stdio: 'pipe' });
  const STORE = path.join(os.tmpdir(), 'canary-store.json');
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), STORE);
  const { publicKey, privateKey } = gov.generateGovernanceKeypair();
  const pubB64 = gov.exportPublicKeyB64(publicKey);
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1', DATABASE_URL: URL,
    PAYESH_STORE: STORE, PAYESH_DEMO_CODE: '1', PAYESH_KEY: path.join(os.tmpdir(), 'canary-jwt.key'),
    PAYESH_OTP_FILE: path.join(os.tmpdir(), 'canary-otp-' + Date.now() + '.json'),
    PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY: pubB64
  });
  delete env.NODE_ENV;

  const proc = await boot(env);
  chk('بوت سرور روی DB زنجیره‌ای', !!proc);
  if (!proc) process.exit(1);

  const st = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const su = (st.users || []).find((u) => u.role === 'superadmin');
  const sc = await req('POST', '/api/auth/send-code', { phone: su.phone });
  const lg = await req('POST', '/api/auth/login', { phone: su.phone, code: sc.json && sc.json.demo_code, national_id: su.national_id });
  const cookie = (lg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  chk('ورود superadmin', lg.status === 200);

  /* discover a real cluster id */
  const stat0 = await req('GET', '/api/v1/system/phase6/canary/status', null, cookie);
  const fabric = stat0.json && stat0.json.canary_fabric;
  const clusterList = fabric && (fabric.clusters ? (Array.isArray(fabric.clusters) ? fabric.clusters : Object.values(fabric.clusters)) : []);
  const cluster = clusterList[0] || {};
  chk('موتور قناری کلاستر دارد (id=' + cluster.id + ')', !!cluster.id, JSON.stringify(cluster).slice(0, 80));
  if (!cluster.id) process.exit(1);
  const cid = cluster.id;
  const w0 = Number(cluster.weight != null ? cluster.weight : (cluster.traffic_weight != null ? cluster.traffic_weight : 0));

  /* governance negative: approved===true alone is NEVER enough ⇒ 403 */
  const noApprove = await req('POST', '/api/v1/system/phase6/canary/promote', { cluster_id: cid, target_weight: 10, approved: true }, cookie);
  chk('بدون Ed25519/nonce ⇒ 403 PHASE6_APPROVAL_REQUIRED', noApprove.status === 403, noApprove.status + ' ' + noApprove.body.slice(0, 90));

  /* positive: Ed25519 + nonce + timestamp + expiry */
  const signed = gov.signGovernancePayload(privateKey, { action: 'WEIGHT_UPDATE', cluster_id: cid, target_weight: 10 });
  const pr = await req('POST', '/api/v1/system/phase6/canary/promote', {
    cluster_id: cid, target_weight: 10, action: 'WEIGHT_UPDATE',
    nonce: signed.nonce, timestamp: signed.timestamp, expiry: signed.expiry,
    signature: signed.signature, reason: 'root-cause acceptance'
  }, cookie);
  chk('promote تأییدشده ⇒ 200', pr.status === 200, pr.status + ' ' + pr.body.slice(0, 110));

  /* PostgreSQL SSoT: weight + version bumped */
  const row = await pgOne('SELECT traffic_weight, version FROM phase6_canary_configs WHERE id = $1', [cid]);
  chk('phase6_canary_configs: weight=10 (SSoT)', row.length === 1 && Number(row[0].traffic_weight) === 10, JSON.stringify(row[0] || null));
  chk('version در PG افزایش یافت', row.length === 1 && Number(row[0].version) >= 2, row[0] && row[0].version);

  /* rollout history: audit row with old→new + signature (governance event) */
  const ev = await pgOne("SELECT action, old_weight, new_weight, signature FROM phase6_audit_events WHERE cluster_id = $1 AND signature = $2 ORDER BY id DESC LIMIT 1", [cid, signed.signature]);
  chk('phase6_audit_events: ردیفِ history با old→new و امضا', ev.length === 1 && Number(ev[0].new_weight) === 10, JSON.stringify(ev[0] || null));

  /* kill -9 → restart ⇒ boot hydration restores the PERSISTED weight */
  kill9(proc);
  await sleep(300);
  const proc2 = await boot(env);
  chk('restart بعد از kill -9', !!proc2);
  if (!proc2) process.exit(1);
  const stat1 = await req('GET', '/api/v1/system/phase6/canary/status', null, cookie);
  const cl1 = stat1.json && stat1.json.canary_fabric && (Array.isArray(stat1.json.canary_fabric.clusters) ? stat1.json.canary_fabric.clusters : Object.values(stat1.json.canary_fabric.clusters || {})) || [];
  const c1 = cl1.find((c) => (c.id || c.clusterId) === cid) || {};
  const w1 = Number(c1.weight != null ? c1.weight : (c1.traffic_weight != null ? c1.traffic_weight : -1));
  chk('بوتِ نو، وزنِ PERSISTED را لود کرد (10) — RAM مرجع نبود', w1 === 10, 'weight=' + w1);
  if (w1 !== 10) { console.log('── proc2 log head:\n' + proc2.__log().split('\n').slice(0, 12).join('\n') + '\n── snapshot entry: ' + JSON.stringify(c1).slice(0, 300)); }

  /* durable replay: the SAME signature must be rejected from the PG ledger */
  const replay = await req('POST', '/api/v1/system/phase6/canary/promote', {
    cluster_id: cid, target_weight: 10, action: 'WEIGHT_UPDATE',
    nonce: signed.nonce, timestamp: signed.timestamp, expiry: signed.expiry,
    signature: signed.signature, reason: 'replay attempt'
  }, cookie);
  chk('replay امضای مصرف‌شده (حتی بعد از restart) ⇒ 403', replay.status === 403 && /REPLAY/.test(replay.body), replay.status + ' ' + replay.body.slice(0, 90));

  /* rollback ⇒ 0 persisted + history row */
  const rb = await req('POST', '/api/v1/system/phase6/canary/rollback', { cluster_id: cid, reason: 'acceptance rollback' }, cookie);
  chk('rollback ⇒ 200', rb.status === 200, rb.status + ' ' + rb.body.slice(0, 90));
  const row2 = await pgOne('SELECT traffic_weight FROM phase6_canary_configs WHERE id = $1', [cid]);
  chk('بعد از rollback: weight=0 در PG', row2.length === 1 && Number(row2[0].traffic_weight) === 0, JSON.stringify(row2[0] || null));
  const ev2 = await pgOne("SELECT COUNT(*)::int n FROM phase6_audit_events WHERE cluster_id = $1 AND action ILIKE '%ROLLBACK%'", [cid]);
  chk('history: ردیفِ rollback ثبت شد', ev2[0].n >= 1, 'rows=' + ev2[0].n);

  kill9(proc2);
  const pass = results.filter(Boolean).length;
  console.log('\n════ CANARY PERSISTENCE CHAIN: ' + pass + '/' + results.length + ' ════');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });

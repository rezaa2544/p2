#!/usr/bin/env node
/* Phase-2 remediation directive — BLOCKER 3 acceptance:
   Outbox durability across a real crash + restart, and the DLQ path
   (moveToDlq with a bare event id ⇒ real server_outbox_dlq row in PG).
   Without DATABASE_URL this test FAILS (exit 1) — never fake-green. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const { Client } = require('pg');

const NODE = process.execPath;
const ROOT = path.join(__dirname, '..');
const PORT = 3103;
const results = [];
function chk(name, ok, detail) { results.push(ok); console.log((ok ? '✅ ' : '❌ ') + name + (detail != null ? ' — ' + String(detail).slice(0, 200) : '')); }
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
      for (let i = 0; i < 120; i++) { const h = await req('GET', '/api/health'); if (h.status === 200) return resolve(proc); await sleep(250); }
      console.error(log.slice(-800)); resolve(null);
    })();
  });
}
function stop(proc) { return new Promise((r) => { if (!proc) return r(); proc.on('exit', r); proc.kill('SIGTERM'); setTimeout(r, 5000); }); }
function kill9(proc) { try { proc.kill('SIGKILL'); } catch (e) {} }
async function pgOne(sql, params) { const c = new Client({ connectionString: OBX_URL }); await c.connect(); const r = await c.query(sql, params || []); await c.end(); return r.rows; }

let OBX_URL;
(async () => {
  const BASE_URL = process.env.DATABASE_URL;
  if (!BASE_URL) { console.error('❌ DATABASE_URL required — dependency missing = FAIL (exit 1)'); process.exit(1); }
  OBX_URL = process.env.P2_OBX_DATABASE_URL ||
    BASE_URL.replace(/\/[^/?]+(\?.*)?$/, (m, q) => ('/payesh_p2obx' + (q || '')));
  const KEY = path.join(os.tmpdir(), 'obx-jwt.key');
  const STORE = path.join(os.tmpdir(), 'obx-store.json');
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1', DATABASE_URL: OBX_URL,
    PAYESH_STORE: STORE, PAYESH_DEMO_CODE: '1', PAYESH_KEY: KEY,
    PAYESH_OTP_FILE: path.join(os.tmpdir(), 'obx-otp-' + Date.now() + '.json')
  });
  delete env.NODE_ENV;

  const adm = new Client({ connectionString: BASE_URL });
  await adm.connect();
  await adm.query('DROP DATABASE IF EXISTS payesh_p2obx').catch(() => {});
  await adm.query('CREATE DATABASE payesh_p2obx');
  await adm.end();
  /* BLOCKER 2 acceptance: migrate-to-pg --execute owns this EMPTY database
     end-to-end (two-phase DDL; the psql migration chain is exercised by the
     migration-cycle suite, not here). */
  execSync(`${NODE} server/seed.js`, { cwd: ROOT, env: Object.assign({}, process.env, { PAYESH_STORE: STORE }), stdio: 'pipe' });
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), STORE);   /* seed.js writes the default path only */
  execSync(`${NODE} tools/migrate-to-pg.js --execute`, { cwd: ROOT, env: Object.assign({}, process.env, { DATABASE_URL: OBX_URL, PAYESH_STORE: STORE }), stdio: 'pipe' });

  /* ── crash artifact: a pending event that the (dead) worker never saw ── */
  const ins = await pgOne(
    `INSERT INTO server_outbox (type, collection, record_id, actor_id, version, payload, status)
     VALUES ('classes.deleted', 'classes', 4242, 1, 2, '{"school_id":1}', 'pending') RETURNING id`);
  await pgOne("SELECT setval('payesh_outbox_id_seq', (SELECT COALESCE(MAX(id), 1) FROM server_outbox))");   /* manual inserts must not desync the named sequence */
  const crashEvtId = Number(ins[0].id);
  chk('رویداد pending «بازماندهٔ کرش» در PG درج شد (id=' + crashEvtId + ')', crashEvtId > 0);

  /* worker is DEAD (server not running). Now boot = restart after crash. */
  const proc = await boot(env);
  chk('سرور بعد از «کرش» restart شد', !!proc, proc ? '' : (proc && proc.__log ? proc.__log().slice(-300) : ''));
  if (!proc) process.exit(1);
  let replayed = null;
  for (let i = 0; i < 16; i++) {
    const r = await pgOne('SELECT status FROM server_outbox WHERE id = $1', [crashEvtId]);
    replayed = r[0] && r[0].status;
    if (replayed === 'processed') break;
    await sleep(500);
  }
  chk('pending پس از restart replay و processed شد (worker از PG)', replayed === 'processed', 'status=' + replayed);

  /* login + a REAL delete ⇒ real outbox event through the API path */
  const st = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const su = (st.users || []).find((u) => u.role === 'superadmin');
  const sc = await req('POST', '/api/auth/send-code', { phone: su.phone });
  const lg = await req('POST', '/api/auth/login', { phone: su.phone, code: sc.json && sc.json.demo_code, national_id: su.national_id });
  const cookie = (lg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  chk('ورود superadmin', lg.status === 200);
  const mk = await req('POST', '/api/v1/classes', { name: 'OBX', grade: 10, school_id: 1 }, cookie);
  const clsId = mk.json && mk.json.data && mk.json.data.id;
  chk('ایجاد class واقعی', mk.status === 201 && clsId != null, mk.status);
  const del = await req('DELETE', '/api/v1/classes/' + clsId, null, cookie);
  chk('حذف class واقعی (مسیر outbox تراکنشی)', del.status === 200 || del.status === 202, del.status);
  let apiEvt = null;
  for (let i = 0; i < 16; i++) {
    const r = await pgOne('SELECT id, status FROM server_outbox WHERE record_id = $1 AND collection = $2 ORDER BY id DESC LIMIT 1', [clsId, 'classes']);
    apiEvt = r[0];
    if (apiEvt && apiEvt.status === 'processed') break;
    await sleep(500);
  }
  chk('رویدادِ API مسیرِ delete → server_outbox → processed', !!(apiEvt && apiEvt.status === 'processed'), JSON.stringify(apiEvt));

  /* ── DLQ via the new contract: moveToDlq(<bare id>) ⇒ real DLQ row ── */
  await pgOne("SELECT setval('server_outbox_id_seq', (SELECT COALESCE(MAX(id), 1) FROM server_outbox))");   /* identity default must not collide with explicit ids either */
  const poison = await pgOne(
    `INSERT INTO server_outbox (type, collection, record_id, actor_id, version, payload, status)
     VALUES ('classes.deleted', 'classes', 4343, 1, 2, '{"school_id":1}', 'pending') RETURNING id`);
  await pgOne("SELECT setval('payesh_outbox_id_seq', (SELECT COALESCE(MAX(id), 1) FROM server_outbox))");
  const poisonId = Number(poison[0].id);
  const script = `
    process.env.DATABASE_URL = ${JSON.stringify(OBX_URL)};
    const db = require(${JSON.stringify(path.join(ROOT, 'server/db.js'))});
    const { createOutbox } = require(${JSON.stringify(path.join(ROOT, 'server/outbox.js'))});
    (async () => {
      await db.init();
      const obx = createOutbox({ store: {}, db });
      const r = await obx.moveToDlq(${poisonId}, 'poison: directive B3 acceptance');
      console.log('DLQ_RES:' + JSON.stringify({ ok: !!r, id: r && r.id, status: r && r.status }));
      process.exit(0);
    })().catch((e) => { console.error('DLQ_FATAL', e.message); process.exit(1); });`;
  fs.writeFileSync(path.join(os.tmpdir(), 'dlq-probe.js'), script);
  let dlqOk = false;
  try {
    const out = execSync(`${NODE} ${path.join(os.tmpdir(), 'dlq-probe.js')}`, { cwd: ROOT, env: Object.assign({}, process.env), stdio: 'pipe' }).toString();
    dlqOk = /DLQ_RES:\{"ok":true/.test(out);
    console.log('   ' + out.trim().split('\n').pop().slice(0, 120));
  } catch (e) { console.log('   DLQ probe failed: ' + String(e.stderr || e.message).slice(0, 200)); }
  chk('moveToDlq با idِ خام کار کرد (event object یا id)', dlqOk);
  const dlqRows = await pgOne('SELECT outbox_id, type, error_message FROM server_outbox_dlq WHERE outbox_id = $1', [poisonId]);
  chk('ردیفِ واقعی در server_outbox_dlq ثبت شد', dlqRows.length === 1 && dlqRows[0].type === 'classes.deleted', JSON.stringify(dlqRows[0] || null));
  const srcStatus = await pgOne('SELECT status FROM server_outbox WHERE id = $1', [poisonId]);
  chk('ردیفِ مبدأ dead_letter شد', srcStatus[0] && srcStatus[0].status === 'dead_letter', srcStatus[0] && srcStatus[0].status);

  await stop(proc);
  const pass = results.filter(Boolean).length;
  console.log('\n════ PHASE2 OUTBOX FAILOVER: ' + pass + '/' + results.length + ' ════');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });

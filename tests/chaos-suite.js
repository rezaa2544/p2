#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/chaos-suite.js — Permanent Chaos Engineering Suite (Phase-HARDENING)
   ───────────────────────────────────────────────────────────────────────
   Four destructive scenarios against REAL processes. Every scenario fails
   closed: a missing dependency (PostgreSQL / Redis binary) = FAIL, never skip.

   S1 Redis failure      : kill Redis ⇒ auth 503 redis_required (never allowed:true)
   S2 PostgreSQL failure : stop PostgreSQL ⇒ write 503, no RAM ack; restart ⇒ recovery
   S3 Multi-instance race: 2 real processes × 10 concurrent writers ⇒ 1/9/0 + PG conflicts
   S4 kill -9 recovery   : transactional write ⇒ kill -9 ⇒ restart ⇒ outbox replayed & processed

   Run: DATABASE_URL=postgres://… node tests/chaos-suite.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const { Client } = require('pg');

const NODE = process.execPath;
const ROOT = path.join(__dirname, '..');
const results = [];
function chk(name, ok, detail) { results.push(ok); console.log((ok ? '✅ ' : '❌ ') + name + (detail != null ? ' — ' + String(detail).slice(0, 160) : '')); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(port, method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: Object.assign({ 'content-type': 'application/json' },
        data ? { 'content-length': Buffer.byteLength(data) } : {}, cookie ? { cookie } : {}) },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, body: b, headers: res.headers }); }); });
    r.on('error', () => resolve({ status: 0, json: null, body: '', headers: {} }));
    if (data) r.write(data); r.end();
  });
}
function boot(port, env) {
  return new Promise((resolve) => {
    const proc = spawn(NODE, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
    proc.__log = () => log;
    (async () => {
      for (let i = 0; i < 120; i++) { const h = await req(port, 'GET', '/api/health'); if (h.status === 200) return resolve(proc); await sleep(250); }
      console.error('  boot failed:', log.slice(-400)); resolve(null);
    })();
  });
}
function stop(proc) { return new Promise((r) => { if (!proc) return r(); proc.on('exit', r); proc.kill('SIGTERM'); setTimeout(r, 5000); }); }
function kill9(proc) { try { proc.kill('SIGKILL'); } catch (e) {} }
async function pgOne(url, sql, params) { const c = new Client({ connectionString: url }); await c.connect(); const r = await c.query(sql, params || []); await c.end(); return r.rows; }
function freshDb(base, name) {
  return (async () => {
    const adm = new Client({ connectionString: base });
    await adm.connect();
    await adm.query(`DROP DATABASE IF EXISTS ${name}`).catch(() => {});
    await adm.query(`CREATE DATABASE ${name}`);
    await adm.end();
    return base.replace(/\/[^/?]+(\?.*)?$/, (m, q) => ('/' + name + (q || '')));
  })();
}
function dbUrlOf(base, name) { return base.replace(/\/[^/?]+(\?.*)?$/, (m, q) => ('/' + name + (q || ''))); }
const envFor = (port, url, store, key, extra) => {
  const e = Object.assign({}, process.env, {
    PORT: String(port), HOST: '127.0.0.1', DATABASE_URL: url,
    PAYESH_STORE: store, PAYESH_DEMO_CODE: '1', PAYESH_KEY: key,
    PAYESH_OTP_FILE: path.join(os.tmpdir(), 'chaos-otp-' + port + '-' + Date.now() + '.json')
  }, extra || {});
  delete e.NODE_ENV;
  return e;
};
async function login(port, store) {
  const st = JSON.parse(fs.readFileSync(store, 'utf8'));
  const su = (st.users || []).find((u) => u.role === 'superadmin');
  const sc = await req(port, 'POST', '/api/auth/send-code', { phone: su.phone });
  const lg = await req(port, 'POST', '/api/auth/login', { phone: su.phone, code: sc.json && sc.json.demo_code, national_id: su.national_id });
  return { cookie: (lg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; '), ok: lg.status === 200 };
}

(async () => {
  const BASE_URL = process.env.DATABASE_URL;
  if (!BASE_URL) { console.error('❌ DATABASE_URL required — dependency missing = FAIL (exit 1)'); process.exit(1); }
  execSync(`${NODE} server/seed.js`, { cwd: ROOT, stdio: 'pipe' });   /* fresh default store (server/data/payesh.json) */

  /* ── S1: Redis failure ⇒ auth fails CLOSED ───────────────────────── */
  console.log('\n── S1: Redis failure');
  {
    const RPORT = 17000 + (process.pid % 1500);
    const rlog = fs.openSync(path.join(os.tmpdir(), 'chaos-redis.log'), 'w');
    const rp = spawn('/usr/bin/redis-server', ['--port', String(RPORT), '--save', '', '--appendonly', 'no', '--dir', os.tmpdir()], { stdio: ['ignore', rlog, rlog] });
    await sleep(900);
    if (rp.exitCode != null) { chk('S1 redis-server runnable', false, 'exit ' + rp.exitCode); }
    else {
      const url = dbUrlOf(BASE_URL, 'payesh_chaos1');
      const adm = new Client({ connectionString: BASE_URL }); await adm.connect();
      await adm.query('DROP DATABASE IF EXISTS payesh_chaos1').catch(() => {}); await adm.query('CREATE DATABASE payesh_chaos1'); await adm.end();
      execSync(`psql "${url}" -v ON_ERROR_STOP=1 -q -f migrations/001_initial.sql`, { stdio: 'pipe' });
      const STORE = path.join(os.tmpdir(), 'chaos-s1-store.json');
      fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), STORE);
      const proc = await boot(3201, envFor(3201, url, STORE, path.join(os.tmpdir(), 'chaos-s1.key'), { REDIS_URL: `redis://127.0.0.1:${RPORT}` }));
      chk('S1 سرور با Redis بوت شد', !!proc);
      if (proc) {
        const st = JSON.parse(fs.readFileSync(STORE, 'utf8'));
        const su = (st.users || []).find((u) => u.role === 'superadmin');
        const ok1 = await req(3201, 'POST', '/api/auth/send-code', { phone: su.phone });
        chk('S1 Redis زنده ⇒ send-code 200', ok1.status === 200, ok1.status);
        rp.kill('SIGKILL');
        await sleep(1200);
        const other = (st.users.find((u) => u.phone && u.phone !== su.phone) || {}).phone;
        const dead = await req(3201, 'POST', '/api/auth/send-code', { phone: other });
        chk('S1 Redis قطع ⇒ 503 redis_required (هرگز allowed:true)', dead.status === 503 && /redis_required/.test(dead.body), dead.status + ' ' + dead.body.slice(0, 60));
        kill9(proc);
      }
    }
    try { rp.kill('SIGKILL'); } catch (e) {}
  }

  /* ── S2: PostgreSQL failure ⇒ write 503, no RAM ack; recovery after restart ── */
  console.log('\n── S2: PostgreSQL failure');
  {
    const url = await freshDb(BASE_URL, 'payesh_chaos2');
    execSync(`${NODE} tools/migrate-to-pg.js --execute`, { cwd: ROOT, env: Object.assign({}, process.env, { DATABASE_URL: url, PAYESH_STORE: path.join(ROOT, 'server', 'data', 'payesh.json') }), stdio: 'pipe' });
    await pgOne(url, "SELECT setval('payesh_outbox_id_seq', (SELECT COALESCE(MAX(id), 1) FROM server_outbox))").catch(() => {});
    const STORE = path.join(os.tmpdir(), 'chaos-s2-store.json');
    fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), STORE);
    const proc = await boot(3202, envFor(3202, url, STORE, path.join(os.tmpdir(), 'chaos-s2.key')));
    chk('S2 سرور با PG بوت شد', !!proc);
    if (proc) {
      const { cookie, ok } = await login(3202, STORE);
      chk('S2 ورود superadmin', ok);
      const mk1 = await req(3202, 'POST', '/api/v1/classes', { name: 'PRE', grade: 10, school_id: 1 }, cookie);
      chk('S2 نوشتِ پیش از قطعی: 201', mk1.status === 201, mk1.status);
      /* stop the whole PostgreSQL cluster (real outage, not a mock) */
      let stopped = true;
      try { execSync('sudo pg_ctlcluster 17 main stop --mode fast', { stdio: 'pipe' }); } catch (e) { stopped = false; }
      chk('S2 PostgreSQL واقعاً متوقف شد', stopped);
      if (stopped) {
        await sleep(500);
        const w = await req(3202, 'POST', '/api/v1/classes', { name: 'DURING_OUTAGE', grade: 10, school_id: 1 }, cookie);
        /* Invariant: PG is the identity authority (P0-1) — with PG down the
           request must FAIL CLOSED. 401 = session identity check refused to
           fall back to the RAM store; 503 = write-path mirror failure. Either
           way: NEVER a 2xx ack for a write that never reached PG. */
        chk('S2 نوشتن در قطعی ⇒ fail-closed (401/503، هرگز 2xx/RAM-ack)',
          (w.status === 401 || w.status === 503), w.status + ' ' + w.body.slice(0, 60));
        try { execSync('sudo pg_ctlcluster 17 main start', { stdio: 'pipe' }); } catch (e) {}
        await sleep(1500);
        const rec = await req(3202, 'POST', '/api/v1/classes', { name: 'AFTER_RECOVERY', grade: 10, school_id: 1 }, cookie);
        chk('S2 بازگشت PG ⇒ نوشتن دوباره کار می‌کند (recovery)', rec.status === 201, rec.status);
        const rows = await pgOne(url, "SELECT COUNT(*)::int n FROM classes WHERE name IN ('PRE','AFTER_RECOVERY','DURING_OUTAGE')");
        chk('S2 هیچ نوشتِ قطعی در PG نیست (0 lost-ack)', rows[0].n === 2, 'rows=' + rows[0].n);
      }
      kill9(proc);
    }
  }

  /* ── S3: Multi-instance race — delegated to the dedicated acceptance test ── */
  console.log('\n── S3: Multi-instance race (2 processes × 10 writers)');
  {
    const url = await freshDb(BASE_URL, 'payesh_chaos3');
    let ok = false;
    try {
      execSync(`DATABASE_URL=${url} NODE_PATH=${path.join(ROOT, 'node_modules')} ${NODE} tests/phase2-occ-multi.js`, { cwd: ROOT, stdio: 'pipe' });
      ok = true;
    } catch (e) { console.log('  ' + String(e.stderr || e.message).slice(0, 200)); }
    chk('S3 race: دقیقاً ۱ موفق / ۹ تعارض / ۰ lost update / تعارض‌ها در PG', ok);
  }

  /* ── S4: kill -9 recovery — transactional write survives SIGKILL ────── */
  console.log('\n── S4: kill -9 recovery');
  {
    const url = await freshDb(BASE_URL, 'payesh_chaos4');
    execSync(`${NODE} tools/migrate-to-pg.js --execute`, { cwd: ROOT, env: Object.assign({}, process.env, { DATABASE_URL: url, PAYESH_STORE: path.join(ROOT, 'server', 'data', 'payesh.json') }), stdio: 'pipe' });
    await pgOne(url, "SELECT setval('payesh_outbox_id_seq', (SELECT COALESCE(MAX(id), 1) FROM server_outbox))").catch(() => {});
    const STORE = path.join(os.tmpdir(), 'chaos-s4-store.json');
    fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), STORE);
    const env = envFor(3204, url, STORE, path.join(os.tmpdir(), 'chaos-s4.key'));
    const proc = await boot(3204, env);
    chk('S4 سرور بوت شد', !!proc);
    if (proc) {
      const { cookie, ok } = await login(3204, STORE);
      chk('S4 ورود superadmin', ok);
      const mk = await req(3204, 'POST', '/api/v1/classes', { name: 'DOOMED', grade: 10, school_id: 1 }, cookie);
      const clsId = mk.json && mk.json.data && mk.json.data.id;
      chk('S4 ایجاد class', mk.status === 201 && clsId != null, mk.status);
      const del = await req(3204, 'DELETE', '/api/v1/classes/' + clsId, null, cookie);
      chk('S4 حذف class (delete+outbox در یک تراکنش PG)', del.status === 200 || del.status === 202, del.status);
      /* SIGKILL immediately — the worker may or may not have processed yet */
      kill9(proc);
      await sleep(300);
      const pending = await pgOne(url, "SELECT id, status FROM server_outbox WHERE record_id = $1 AND collection = 'classes' ORDER BY id DESC LIMIT 1", [clsId]);
      chk('S4 رویداد outbox در PG ماند (کرش پس از commit)', pending.length === 1, JSON.stringify(pending[0] || null));
      const gone = await pgOne(url, 'SELECT COUNT(*)::int n FROM classes WHERE id = $1', [clsId]);
      chk('S4 حذف در PG پایدار بود (حتی با kill -9)', gone[0].n === 0, 'rows=' + gone[0].n);
      const proc2 = await boot(3204, env);
      chk('S4 restart بعد از kill -9', !!proc2);
      if (proc2) {
        let st = null;
        for (let i = 0; i < 16; i++) {
          const r = await pgOne(url, 'SELECT status FROM server_outbox WHERE record_id = $1 AND collection = $2 ORDER BY id DESC LIMIT 1', [clsId, 'classes']);
          st = r[0] && r[0].status;
          if (st === 'processed') break;
          await sleep(500);
        }
        chk('S4 رویداد پس از restart replay و processed شد', st === 'processed', 'status=' + st);
        kill9(proc2);
      }
    }
  }

  const pass = results.filter(Boolean).length;
  console.log('\n════ CHAOS SUITE: ' + pass + '/' + results.length + ' ════');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });

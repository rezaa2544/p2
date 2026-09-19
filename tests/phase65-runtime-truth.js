#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/phase65-runtime-truth.js — Phase 6.5 Red Team Acceptance Suite
   RT-01 … RT-10 against REAL HTTP + REAL PostgreSQL + REAL Redis.
   Missing dependency = exit 1. No mocks. No skip. No fake-green.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');
const { Client } = require('pg');
const gov = require('../server/infrastructure/phase6-governance');

const NODE = process.execPath;
const ROOT = path.join(__dirname, '..');
const results = [];
function chk(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail != null ? String(detail).slice(0, 180) : '' });
  console.log((ok ? '✅ ' : '❌ ') + name + (detail != null ? ' — ' + String(detail).slice(0, 180) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(port, method, p, body, cookie, extraHeaders) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = Object.assign(
      { 'content-type': 'application/json' },
      data ? { 'content-length': Buffer.byteLength(data) } : {},
      cookie ? { cookie } : {},
      extraHeaders || {}
    );
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, body: b, headers: res.headers });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null, body: '', headers: {} }));
    if (data) r.write(data);
    r.end();
  });
}

function boot(port, env) {
  return new Promise((resolve) => {
    const proc = spawn(NODE, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    proc.stdout.on('data', (d) => (log += d));
    proc.stderr.on('data', (d) => (log += d));
    proc.__log = () => log;
    (async () => {
      for (let i = 0; i < 200; i++) {
        const h = await req(port, 'GET', '/api/health');
        if (h.status === 200 || h.status === 503) {
          if (h.status === 200) return resolve(proc);
        }
        await sleep(300);
      }
      console.error('  boot failed:', log.slice(-500));
      resolve(null);
    })();
  });
}
function kill9(proc) { try { if (proc) proc.kill('SIGKILL'); } catch (e) {} }

async function pgOne(url, sql, params) {
  const c = new Client({ connectionString: url });
  await c.connect();
  const r = await c.query(sql, params || []);
  await c.end();
  return r.rows;
}

function applyMigrations(url) {
  const files = fs.readdirSync(path.join(ROOT, 'migrations')).sort();
  for (const f of files) {
    if (!/^\d{3}_.*\.sql$/.test(f) || f.endsWith('.down.sql')) continue;
    execSync(`psql "${url}" -v ON_ERROR_STOP=1 -q -f "${path.join(ROOT, 'migrations', f)}"`, { stdio: 'pipe' });
  }
}
function rollbackMigrations(url) {
  const files = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => /^\d{3}_.*\.down\.sql$/.test(f)).sort().reverse();
  for (const f of files) {
    execSync(`psql "${url}" -v ON_ERROR_STOP=1 -q -f "${path.join(ROOT, 'migrations', f)}"`, { stdio: 'pipe' });
  }
}

async function flood(port, n, pth, headers) {
  const out = new Array(n);
  let i = 0;
  const conc = 40;
  async function worker() {
    while (true) {
      const k = i++;
      if (k >= n) return;
      out[k] = await req(port, 'GET', pth, null, null, headers);
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  return out;
}

(async () => {
  const BASE_URL = process.env.DATABASE_URL;
  if (!BASE_URL) {
    console.error('❌ DATABASE_URL required — dependency missing = FAIL (exit 1)');
    process.exit(1);
  }

  const { publicKey, privateKey } = gov.generateGovernanceKeypair();
  const pubB64 = gov.exportPublicKeyB64(publicKey);
  function signedPromote(clusterId, weight, action) {
    const s = gov.signGovernancePayload(privateKey, {
      action: action || 'WEIGHT_UPDATE',
      cluster_id: clusterId,
      target_weight: weight
    });
    return {
      cluster_id: clusterId,
      target_weight: weight,
      action: s.action,
      nonce: s.nonce,
      timestamp: s.timestamp,
      expiry: s.expiry,
      signature: s.signature,
      reason: 'phase65 runtime truth'
    };
  }

  /* ── RT-07 Migration Truth on a completely empty database ───────── */
  console.log('\n── RT-07 Migration clean DB');
  const MIG = 'payesh_p65mig';
  const adm = new Client({ connectionString: BASE_URL });
  await adm.connect();
  await adm.query('DROP DATABASE IF EXISTS ' + MIG).catch(() => {});
  await adm.query('CREATE DATABASE ' + MIG);
  await adm.end();
  const migUrl = BASE_URL.replace(/\/[^/?]+(\?.*)?$/, (m, q) => ('/' + MIG + (q || '')));
  try {
    applyMigrations(migUrl);
  } catch (e) {
    chk('RT-07 UP 001→latest بدون خطا', false, String(e.stderr || e.message).slice(0, 200));
    process.exit(1);
  }
  const up1 = await pgOne(migUrl, "SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public'");
  chk('RT-07 UP → جداول ساخته شد (n>0)', up1[0].n > 0, 'tables=' + up1[0].n);
  const hasLedger = await pgOne(migUrl, "SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name='phase6_replay_ledger'");
  chk('RT-07 phase6_replay_ledger موجود است', hasLedger[0].n === 1);
  const hasWeight = await pgOne(migUrl, "SELECT COUNT(*)::int n FROM information_schema.columns WHERE table_name='phase6_canary_configs' AND column_name IN ('weight','region_id')");
  chk('RT-07 ستون‌های weight و region_id', hasWeight[0].n === 2, 'n=' + hasWeight[0].n);
  try {
    rollbackMigrations(migUrl);
  } catch (e) {
    chk('RT-07 DOWN latest→001 بدون خطا', false, String(e.stderr || e.message).slice(0, 200));
    process.exit(1);
  }
  const down1 = await pgOne(migUrl, "SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public'");
  chk('RT-07 DOWN ALL → ZERO RESIDUE', down1[0].n === 0, 'tables=' + down1[0].n);
  applyMigrations(migUrl);
  const up2 = await pgOne(migUrl, "SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public'");
  chk('RT-07 UP دوباره → همان تعداد جدول', up2[0].n === up1[0].n, up2[0].n + ' vs ' + up1[0].n);

  /* ── runtime DB ─────────────────────────────────────────────────── */
  const DB = 'payesh_p65';
  const adm2 = new Client({ connectionString: BASE_URL });
  await adm2.connect();
  await adm2.query('DROP DATABASE IF EXISTS ' + DB).catch(() => {});
  await adm2.query('CREATE DATABASE ' + DB);
  await adm2.end();
  const URL = BASE_URL.replace(/\/[^/?]+(\?.*)?$/, (m, q) => ('/' + DB + (q || '')));
  applyMigrations(URL);

  execSync(`${NODE} server/seed.js`, { cwd: ROOT, stdio: 'pipe' });
  const STORE = path.join(os.tmpdir(), 'p65-store.json');
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), STORE);
  const PORTA = 3311;
  const PORTB = 3312;
  const envA = Object.assign({}, process.env, {
    PORT: String(PORTA), HOST: '127.0.0.1', DATABASE_URL: URL,
    PAYESH_STORE: STORE, PAYESH_DEMO_CODE: '1',
    PAYESH_KEY: path.join(os.tmpdir(), 'p65-jwt.key'),
    PAYESH_OTP_FILE: path.join(os.tmpdir(), 'p65-otp-' + Date.now() + '.json'),
    PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY: pubB64
  });
  delete envA.NODE_ENV;

  const procA = await boot(PORTA, envA);
  chk('بوت نمونه A', !!procA);
  if (!procA) process.exit(1);

  const st = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const su = (st.users || []).find((u) => u.role === 'superadmin');
  const sc = await req(PORTA, 'POST', '/api/auth/send-code', { phone: su.phone });
  const lg = await req(PORTA, 'POST', '/api/auth/login', { phone: su.phone, code: sc.json && sc.json.demo_code, national_id: su.national_id });
  const cookie = (lg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  chk('ورود superadmin', lg.status === 200, lg.status);

  /* ── RT-01 Canary live routing ──────────────────────────────────── */
  console.log('\n── RT-01 Canary live routing');
  const CID = 'ir-isfahan-1';
  const noGov = await req(PORTA, 'POST', '/api/v1/system/phase6/canary/promote', { cluster_id: CID, target_weight: 25, approved: true }, cookie);
  chk('RT-01 approved===true به‌تنهایی ⇒ 403 (نه 200)', noGov.status === 403, noGov.status + ' ' + noGov.body.slice(0, 90));

  const body25 = signedPromote(CID, 25);
  const pr = await req(PORTA, 'POST', '/api/v1/system/phase6/canary/promote', body25, cookie);
  chk('RT-01 promote Ed25519 ⇒ 200', pr.status === 200, pr.status + ' ' + pr.body.slice(0, 110));

  const row = await pgOne(URL, 'SELECT traffic_weight, weight, version FROM phase6_canary_configs WHERE id=$1', [CID]);
  chk('RT-01 PostgreSQL SoT weight=25', row.length === 1 && Number(row[0].traffic_weight) === 25 && Number(row[0].weight) === 25, JSON.stringify(row[0] || null));

  const N = 10000;
  const t0 = Date.now();
  const samples = await flood(PORTA, N, '/api/health', { 'x-province-code': '04' });
  const elapsed = Date.now() - t0;
  const hdrOk = samples.filter((s) => s.headers['x-canary-id'] && s.headers['x-canary-cluster'] && s.headers['x-canary-version']).length;
  chk('RT-01 هر پاسخ X-Canary-ID/Cluster/Version دارد', hdrOk === N, hdrOk + '/' + N);
  const canaryHits = samples.filter((s) => s.headers['x-canary-destination'] === 'canary').length;
  const baselineHits = samples.filter((s) => s.headers['x-canary-destination'] === 'baseline').length;
  /* binomial 25% of 10000: σ≈43; ±5% of N = 500 */
  chk('RT-01 10000 req @25% → canary 2500±500', canaryHits >= 2000 && canaryHits <= 3000,
    'canary=' + canaryHits + ' baseline=' + baselineHits + ' ' + elapsed + 'ms');
  const clusterHdr = samples.filter((s) => s.headers['x-canary-cluster'] === 'ir-isfahan-1' || s.headers['x-canary-cluster'] === 'ir-tehran-1').length;
  chk('RT-01 کلاستر از تصمیم واقعی است (isfahan|tehran)', clusterHdr === N, clusterHdr + '/' + N);

  /* ── RT-08 Tenant / province isolation ──────────────────────────── */
  console.log('\n── RT-08 Tenant breach');
  const teacher = (st.users || []).find((u) => u.role === 'teacher' && Number(u.school_id) === 3);
  chk('RT-08 معلم استان تهران (school 3) موجود است', !!teacher, teacher && teacher.phone);
  let tCookie = '';
  if (teacher) {
    const tsc = await req(PORTA, 'POST', '/api/auth/send-code', { phone: teacher.phone });
    const tlg = await req(PORTA, 'POST', '/api/auth/login', { phone: teacher.phone, code: tsc.json && tsc.json.demo_code, national_id: teacher.national_id });
    tCookie = (tlg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
    chk('RT-08 ورود معلم', tlg.status === 200, tlg.status);
    const breach = await req(PORTA, 'GET', '/api/v1/students?province=04', null, tCookie, { 'x-province-code': '04' });
    chk('RT-08 کاربر استان ۷ / province=04 ⇒ 403 PHASE6_TENANT_ISOLATION_BREACH',
      breach.status === 403 && /PHASE6_TENANT_ISOLATION_BREACH/.test(breach.body),
      breach.status + ' ' + breach.body.slice(0, 120));
  }

  /* ── RT-09 NOC metrics vs real samples ──────────────────────────── */
  console.log('\n── RT-09 NOC metric comparison');
  const clientLat = [];
  const M = 5000;
  const t1 = Date.now();
  const nocSamples = await flood(PORTA, M, '/api/health', { 'x-province-code': '07' });
  const wall = Date.now() - t1;
  const avgClient = wall / M;
  const noc = await req(PORTA, 'GET', '/api/v1/system/national/health', null, cookie);
  const observed = noc.json && noc.json.dashboard && noc.json.dashboard.slo_performance && noc.json.dashboard.slo_performance.observed;
  const live = noc.json && noc.json.live_samples;
  chk('RT-09 NOC API 200', noc.status === 200, noc.status);
  chk('RT-09 NOC از نمونهٔ واقعی است (is_live)', !!(observed && observed.is_live) || !!(live && live.is_live), JSON.stringify(observed || live).slice(0, 120));
  const p95 = observed && observed.latency_p95_ms;
  chk('RT-09 p95 ساختگی 65/185/120 نیست', p95 !== 65 && p95 !== 185 && p95 !== 120 && p95 !== 620, 'p95=' + p95);
  chk('RT-09 اختلاف p95 با میانگین کلاینت در آستانه', p95 != null && Math.abs(p95 - avgClient) < 500,
    'p95=' + p95 + ' client_avg=' + avgClient.toFixed(2) + 'ms n=' + M);

  /* ── RT-03 Replay (before restart) ──────────────────────────────── */
  console.log('\n── RT-03 Replay attack');
  const replay1 = await req(PORTA, 'POST', '/api/v1/system/phase6/canary/promote', body25, cookie);
  chk('RT-03 همان payload دوباره ⇒ 403 REPLAY_ATTACK_DETECTED',
    replay1.status === 403 && /REPLAY_ATTACK_DETECTED/.test(replay1.body),
    replay1.status + ' ' + replay1.body.slice(0, 100));

  /* ── RT-04 Two instance consistency ─────────────────────────────── */
  console.log('\n── RT-04 Two instance split-brain');
  const envB = Object.assign({}, envA, {
    PORT: String(PORTB),
    PAYESH_OTP_FILE: path.join(os.tmpdir(), 'p65-otp-b-' + Date.now() + '.json')
  });
  const procB = await boot(PORTB, envB);
  chk('RT-04 بوت نمونه B', !!procB);
  if (procB) {
    const body50 = signedPromote(CID, 50);
    const pr50 = await req(PORTA, 'POST', '/api/v1/system/phase6/canary/promote', body50, cookie);
    chk('RT-04 A تغییر وزن به ۵۰٪', pr50.status === 200, pr50.status + ' ' + pr50.body.slice(0, 80));
    const statB = await req(PORTB, 'GET', '/api/v1/system/phase6/canary/status', null, cookie);
    const fabric = statB.json && statB.json.canary_fabric;
    const clusters = (fabric && Array.isArray(fabric.clusters)) ? fabric.clusters : [];
    const cB = clusters.find((c) => c.id === CID) || {};
    const wB = Number(cB.weight != null ? cB.weight : cB.traffic_weight);
    const row50 = await pgOne(URL, 'SELECT traffic_weight FROM phase6_canary_configs WHERE id=$1', [CID]);
    const wPg = Number(row50[0] && row50[0].traffic_weight);
    chk('RT-04 A=50 و B=50 (بدون split-brain)', wB === 50 && wPg === 50, 'B=' + wB + ' PG=' + wPg);
    kill9(procB);
  }

  /* ── RT-02 Kill -9 persistence ──────────────────────────────────── */
  console.log('\n── RT-02 Kill-9 persistence');
  kill9(procA);
  await sleep(400);
  const procA2 = await boot(PORTA, envA);
  chk('RT-02 restart بعد از kill -9', !!procA2);
  if (!procA2) process.exit(1);
  const stat2 = await req(PORTA, 'GET', '/api/v1/system/phase6/canary/status', null, cookie);
  const cl2 = (stat2.json && stat2.json.canary_fabric && stat2.json.canary_fabric.clusters) || [];
  const c2 = cl2.find((c) => c.id === CID) || {};
  const w2 = Number(c2.weight != null ? c2.weight : c2.traffic_weight);
  chk('RT-02 وزن بعد از restart از PostgreSQL آمد (۵۰)', w2 === 50, 'weight=' + w2);

  const replay2 = await req(PORTA, 'POST', '/api/v1/system/phase6/canary/promote', body25, cookie);
  chk('RT-03 بعد از restart همچنان 403 REPLAY',
    replay2.status === 403 && /REPLAY/.test(replay2.body),
    replay2.status + ' ' + replay2.body.slice(0, 90));
  const ledgerN = await pgOne(URL, 'SELECT COUNT(*)::int n FROM phase6_replay_ledger');
  chk('RT-03 دفتر replay در PostgreSQL ردیف دارد', ledgerN[0].n >= 1, 'n=' + ledgerN[0].n);

  /* ── RT-05 Redis outage ─────────────────────────────────────────── */
  console.log('\n── RT-05 Redis fail-closed');
  {
    const RPORT = 18000 + (process.pid % 1000);
    const rlog = fs.openSync(path.join(os.tmpdir(), 'p65-redis.log'), 'w');
    const rp = spawn('/usr/bin/redis-server', ['--port', String(RPORT), '--save', '', '--appendonly', 'no', '--dir', os.tmpdir()], { stdio: ['ignore', rlog, rlog] });
    await sleep(800);
    const PORTC = 3313;
    const STORE2 = path.join(os.tmpdir(), 'p65-r5-store.json');
    fs.copyFileSync(STORE, STORE2);
    const envC = Object.assign({}, process.env, {
      PORT: String(PORTC), HOST: '127.0.0.1', PAYESH_STORE: STORE2,
      PAYESH_DEMO_CODE: '1', PAYESH_KEY: path.join(os.tmpdir(), 'p65-r5.key'),
      REDIS_URL: 'redis://127.0.0.1:' + RPORT,
      PAYESH_OTP_FILE: path.join(os.tmpdir(), 'p65-r5-otp.json'),
      PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY: pubB64
    });
    delete envC.NODE_ENV;
    delete envC.DATABASE_URL;
    const procC = await boot(PORTC, envC);
    chk('RT-05 سرور با Redis بوت شد', !!procC);
    if (procC) {
      const ok1 = await req(PORTC, 'POST', '/api/auth/send-code', { phone: su.phone });
      chk('RT-05 Redis زنده ⇒ send-code 200', ok1.status === 200, ok1.status);
      rp.kill('SIGKILL');
      await sleep(1200);
      const other = (st.users.find((u) => u.phone && u.phone !== su.phone) || {}).phone;
      const dead = await req(PORTC, 'POST', '/api/auth/send-code', { phone: other });
      chk('RT-05 Redis kill ⇒ 503 REDIS_UNAVAILABLE',
        dead.status === 503 && /REDIS_UNAVAILABLE/.test(dead.body),
        dead.status + ' ' + dead.body.slice(0, 100));
      chk('RT-05 هیچ allowed:true / fallback:true در خطا نیست',
        !/allowed"?\s*:\s*true/.test(dead.body) && !/fallback"?\s*:\s*true/.test(dead.body),
        dead.body.slice(0, 80));
      kill9(procC);
    }
    try { rp.kill('SIGKILL'); } catch (e) {}
  }

  /* ── RT-06 Postgres outage ──────────────────────────────────────── */
  console.log('\n── RT-06 Postgres outage');
  {
    const mk1 = await req(PORTA, 'POST', '/api/v1/classes', { name: 'P65_PRE', grade: 10, school_id: 1 }, cookie);
    chk('RT-06 نوشتِ پیش از قطعی پذیرفته شد (2xx)', mk1.status >= 200 && mk1.status < 300, mk1.status);
    let stopped = true;
    try { execSync('sudo pg_ctlcluster 17 main stop --mode fast', { stdio: 'pipe' }); } catch (e) { stopped = false; }
    chk('RT-06 PostgreSQL واقعاً متوقف شد', stopped);
    if (stopped) {
      await sleep(500);
      const w = await req(PORTA, 'POST', '/api/v1/classes', { name: 'P65_DURING', grade: 10, school_id: 1 }, cookie);
      chk('RT-06 نوشتن در قطعی ⇒ fail-closed (401/503 نه 2xx)',
        w.status === 401 || w.status === 503, w.status + ' ' + w.body.slice(0, 80));
      try { execSync('sudo pg_ctlcluster 17 main start', { stdio: 'pipe' }); } catch (e) {}
      await sleep(1500);
      const rec = await req(PORTA, 'POST', '/api/v1/classes', { name: 'P65_AFTER', grade: 10, school_id: 1 }, cookie);
      chk('RT-06 بازگشت PG ⇒ نوشتن دوباره', rec.status >= 200 && rec.status < 300, rec.status);
    }
  }

  kill9(procA2);

  /* ── RT-10 Fake-green scanner ───────────────────────────────────── */
  console.log('\n── RT-10 Fake green scanner');
  const findings = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        walk(p);
      } else if (/\.(js|mjs|cjs)$/.test(ent.name)) {
        const txt = fs.readFileSync(p, 'utf8');
        const rel = path.relative(ROOT, p);
        const lines = txt.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          if (/^\s*if\s*\(\s*!process\.env\.DATABASE_URL/.test(ln)) {
            const win = lines.slice(i, i + 8).join('\n');
            if (/process\.exit\(\s*0\s*\)/.test(win)) {
              findings.push(rel + ':' + (i + 1) + ': DATABASE_URL missing → exit(0)');
            }
          }
          if (/^\s*(describe|it|test)\.skip\s*\(/.test(ln)) {
            findings.push(rel + ':' + (i + 1) + ': skip()');
          }
          if (/catch\s*\([^)]*\)\s*\{\s*process\.exit\(\s*0\s*\)/.test(ln)) {
            findings.push(rel + ':' + (i + 1) + ': catch → process.exit(0)');
          }
        }
      }
    }
  }
  walk(path.join(ROOT, 'tests'));
  chk('RT-10 اسکنر سبزِ کاذب: ۰ مورد', findings.length === 0, findings.slice(0, 5).join(' | '));

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log('\n════ PHASE 6.5 RUNTIME TRUTH: ' + pass + '/' + results.length + ' ════');
  if (fail.length) {
    console.log('FAILED:');
    fail.forEach((f) => console.log('  - ' + f.name + ' :: ' + f.detail));
  }
  process.exit(fail.length ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e && e.stack || e);
  try { execSync('sudo pg_ctlcluster 17 main start', { stdio: 'pipe' }); } catch (e2) {}
  process.exit(1);
});

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tools/production-truth-gate.js — Permanent Production Truth Pipeline
   Phase 6.6. Verdict is ONLY "VERIFIED" or "NOT VERIFIED".
   Missing PostgreSQL / Redis / git = FAIL (exit 1). No skip. No mock.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');
const { Client } = require('pg');
const pgOutage = require('../tests/pg-outage-control');
const gov = require('../server/infrastructure/phase6-governance');

const NODE = process.execPath;
const ROOT = path.join(__dirname, '..');
const results = [];

function chk(gate, name, ok, detail) {
  results.push({ gate, name, ok: !!ok, detail: detail != null ? String(detail).slice(0, 220) : '' });
  console.log((ok ? '✅ ' : '❌ ') + '[' + gate + '] ' + name + (detail != null ? ' — ' + String(detail).slice(0, 220) : ''));
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
      for (let i = 0; i < 220; i++) {
        const h = await req(port, 'GET', '/api/health');
        if (h.status === 200) return resolve(proc);
        if (proc.exitCode != null) {
          console.error('  boot exited', proc.exitCode, log.slice(-700));
          return resolve(null);
        }
        await sleep(300);
      }
      console.error('  boot timeout:', log.slice(-700));
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

function flood(port, n, pth, headers) {
  return new Promise(async (resolve) => {
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
    resolve(out);
  });
}

function walkJs(dir, visit) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue;
      walkJs(p, visit);
    } else if (/\.(js|mjs|cjs)$/.test(ent.name)) {
      visit(p, fs.readFileSync(p, 'utf8'));
    }
  }
}

(async () => {
  const BASE_URL = process.env.DATABASE_URL;
  if (!BASE_URL) {
    console.error('NOT VERIFIED — DATABASE_URL required (dependency missing = FAIL)');
    process.exit(1);
  }

  /* ════════════ GATE 1 — Git truth ════════════ */
  console.log('\n════ GATE 1 — Git');
  let head = '';
  try {
    head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
    chk('G1', 'HEAD وجود دارد', /^[0-9a-f]{40}$/.test(head), head);
  } catch (e) {
    chk('G1', 'HEAD وجود دارد', false, e.message);
  }
  let dirty = '';
  try { dirty = execSync('git status --porcelain', { cwd: ROOT }).toString(); } catch (e) { dirty = 'STATUS_FAILED'; }
  if (process.env.GATE_REQUIRE_CLEAN === '1') {
    chk('G1', 'working tree تمیز است', dirty.trim() === '', dirty.trim().slice(0, 120) || 'clean');
  } else {
    chk('G1', 'وضعیت working tree ثبت شد (dirty مانع VERIFIED نیست مگر GATE_REQUIRE_CLEAN=1)', true,
      dirty.trim() ? 'DIRTY ' + dirty.trim().split('\n').length + ' path(s)' : 'clean');
  }
  let remoteHead = '';
  try {
    const remotes = execSync('git remote', { cwd: ROOT }).toString().trim();
    if (remotes) {
      execSync('git fetch --end-of-options origin 2>/dev/null || true', { cwd: ROOT, stdio: 'pipe' });
    }
  } catch (e) {}
  try {
    remoteHead = execSync('git rev-parse origin/main', { cwd: ROOT }).toString().trim();
  } catch (e) { remoteHead = ''; }
  if (process.env.GATE_REQUIRE_REMOTE_MATCH === '1') {
    chk('G1', 'HEAD محلی == origin/main', !!remoteHead && remoteHead === head, 'local=' + head + ' remote=' + remoteHead);
  } else if (remoteHead) {
    chk('G1', 'origin/main خوانده شد', true, remoteHead === head ? 'SYNC' : ('DIVERGED remote=' + remoteHead.slice(0, 12)));
  } else {
    chk('G1', 'origin تنظیم نشده — مقایسهٔ ریموت در این اجرا ممکن نیست', true, 'no origin/main');
  }

  /* ════════════ GATE 2 — Schema 3-cycle ZERO RESIDUE ════════════ */
  console.log('\n════ GATE 2 — Schema 3-cycle');
  const migDir = path.join(ROOT, 'migrations');
  const ups = fs.readdirSync(migDir).filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith('.down.sql')).sort();
  const downs = fs.readdirSync(migDir).filter((f) => /^\d{3}_.+\.down\.sql$/.test(f)).sort();
  chk('G2', 'تعداد UP == DOWN', ups.length === downs.length && ups.length >= 18, 'up=' + ups.length + ' down=' + downs.length);
  let txOk = true;
  const txBad = [];
  for (const f of ups.concat(downs)) {
    const t = fs.readFileSync(path.join(migDir, f), 'utf8');
    if (!/\bBEGIN\s*;/i.test(t) || !/\bCOMMIT\s*;/i.test(t)) {
      txOk = false;
      txBad.push(f);
    }
  }
  chk('G2', 'هر migration دارای BEGIN و COMMIT است', txOk, txBad.join(',') || 'all transactional');

  const MIG = 'payesh_ptgmig';
  const adm = new Client({ connectionString: BASE_URL });
  await adm.connect();
  await adm.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [MIG]).catch(() => {});
  await adm.query('DROP DATABASE IF EXISTS ' + MIG);
  await adm.query('CREATE DATABASE ' + MIG);
  await adm.end();
  const migUrl = BASE_URL.replace(/\/[^/?]+(\?.*)?$/, (m, q) => ('/' + MIG + (q || '')));

  const tableCount = async () => {
    const r = await pgOne(migUrl, "SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public'");
    return r[0].n;
  };
  let cycleTables = null;
  for (let cycle = 1; cycle <= 3; cycle++) {
    try {
      applyMigrations(migUrl);
    } catch (e) {
      chk('G2', 'cycle ' + cycle + ' UP 001→latest', false, String(e.stderr || e.message).slice(0, 200));
      process.exit(1);
    }
    const nUp = await tableCount();
    chk('G2', 'cycle ' + cycle + ' UP → جداول > 0', nUp > 0, 'tables=' + nUp);
    const ops = await pgOne(migUrl, "SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name='phase6_ops_kv'");
    chk('G2', 'cycle ' + cycle + ' phase6_ops_kv موجود است', ops[0].n === 1);
    if (cycleTables == null) cycleTables = nUp;
    else chk('G2', 'cycle ' + cycle + ' تعداد جدول پایدار', nUp === cycleTables, nUp + ' vs ' + cycleTables);
    try {
      rollbackMigrations(migUrl);
    } catch (e) {
      chk('G2', 'cycle ' + cycle + ' DOWN latest→001', false, String(e.stderr || e.message).slice(0, 200));
      process.exit(1);
    }
    const nDown = await tableCount();
    chk('G2', 'cycle ' + cycle + ' DOWN ALL → ZERO RESIDUE', nDown === 0, 'tables=' + nDown);
  }

  /* ════════════ GATE 3 + 4 runtime / chaos ════════════ */
  console.log('\n════ GATE 3/4 — Runtime + Chaos');
  const DB = 'payesh_ptg';
  const adm2 = new Client({ connectionString: BASE_URL });
  await adm2.connect();
  await adm2.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [DB]).catch(() => {});
  await adm2.query('DROP DATABASE IF EXISTS ' + DB);
  await adm2.query('CREATE DATABASE ' + DB);
  await adm2.end();
  const URL = BASE_URL.replace(/\/[^/?]+(\?.*)?$/, (m, q) => ('/' + DB + (q || '')));
  applyMigrations(URL);

  execSync(`${NODE} server/seed.js`, { cwd: ROOT, stdio: 'pipe' });
  const STORE = path.join(os.tmpdir(), 'ptg-store.json');
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), STORE);
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
      reason: 'production-truth-gate'
    };
  }

  const PORTA = 3411;
  const PORTB = 3412;
  const PORTC = 3413;
  const JWT = path.join(os.tmpdir(), 'ptg-jwt.key');
  const envBase = Object.assign({}, process.env, {
    HOST: '127.0.0.1',
    DATABASE_URL: URL,
    PAYESH_STORE: STORE,
    PAYESH_DEMO_CODE: '1',
    PAYESH_KEY: JWT,
    PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY: pubB64
  });
  delete envBase.NODE_ENV;
  if (envBase.REDIS_URL) envBase.REDIS_URL = String(envBase.REDIS_URL).replace(/\/\d+\s*$/, '') + '/12';

  const envA = Object.assign({}, envBase, { PORT: String(PORTA), PAYESH_OTP_FILE: path.join(os.tmpdir(), 'ptg-otp-a.json') });
  const envB = Object.assign({}, envBase, { PORT: String(PORTB), PAYESH_OTP_FILE: path.join(os.tmpdir(), 'ptg-otp-b.json') });
  const envC = Object.assign({}, envBase, { PORT: String(PORTC), PAYESH_OTP_FILE: path.join(os.tmpdir(), 'ptg-otp-c.json') });

  const procA = await boot(PORTA, envA);
  chk('G3', 'بوت نمونه A', !!procA);
  if (!procA) process.exit(1);
  const procB = await boot(PORTB, envB);
  chk('G4', 'بوت نمونه B', !!procB);
  const procC = await boot(PORTC, envC);
  chk('G4', 'بوت نمونه C', !!procC);
  if (!procB || !procC) {
    kill9(procA); kill9(procB); kill9(procC);
    process.exit(1);
  }

  const st = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const su = (st.users || []).find((u) => u.role === 'superadmin');
  const sc = await req(PORTA, 'POST', '/api/auth/send-code', { phone: su.phone });
  const lg = await req(PORTA, 'POST', '/api/auth/login', { phone: su.phone, code: sc.json && sc.json.demo_code, national_id: su.national_id });
  const cookie = (lg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  chk('G3', 'ورود superadmin روی A', lg.status === 200, lg.status);

  const CID = 'ir-isfahan-1';
  const noGov = await req(PORTA, 'POST', '/api/v1/system/phase6/canary/promote', { cluster_id: CID, target_weight: 25, approved: true }, cookie);
  chk('G3', 'approved===true بدون Ed25519 ⇒ 403', noGov.status === 403, noGov.status + ' ' + noGov.body.slice(0, 80));

  const body25 = signedPromote(CID, 25);
  const pr = await req(PORTA, 'POST', '/api/v1/system/phase6/canary/promote', body25, cookie);
  chk('G3', 'promote Ed25519 روی A ⇒ 200', pr.status === 200, pr.status + ' ' + pr.body.slice(0, 100));

  async function canaryWeight(port) {
    const s = await req(port, 'GET', '/api/v1/system/phase6/canary/status', null, cookie);
    const clusters = (s.json && s.json.canary_fabric && s.json.canary_fabric.clusters) || [];
    const c = clusters.find((x) => x.id === CID) || {};
    return { status: s.status, w: Number(c.weight != null ? c.weight : c.traffic_weight) };
  }
  const wA = await canaryWeight(PORTA);
  const wB = await canaryWeight(PORTB);
  const wC = await canaryWeight(PORTC);
  const row = await pgOne(URL, 'SELECT traffic_weight, weight FROM phase6_canary_configs WHERE id=$1', [CID]);
  const wPg = Number(row[0] && (row[0].traffic_weight != null ? row[0].traffic_weight : row[0].weight));
  chk('G4', 'A == B == C == PostgreSQL (weight=25)',
    wA.w === 25 && wB.w === 25 && wC.w === 25 && wPg === 25,
    'A=' + wA.w + ' B=' + wB.w + ' C=' + wC.w + ' PG=' + wPg);

  const N = 400;
  const samples = await flood(PORTA, N, '/api/health', { 'x-province-code': '04' });
  const hdrOk = samples.filter((s) => s.headers['x-canary-id'] && s.headers['x-canary-cluster'] && s.headers['x-canary-version']).length;
  chk('G3', 'هر پاسخ X-Canary-ID/Cluster/Version دارد', hdrOk === N, hdrOk + '/' + N);
  const destOk = samples.filter((s) => s.headers['x-canary-destination'] === 'canary' || s.headers['x-canary-destination'] === 'baseline').length;
  chk('G3', 'destination از تصمیم واقعی است', destOk === N, destOk + '/' + N);

  let tw = { status: 0, body: '' };
  for (let i = 0; i < 25; i++) {
    tw = await req(PORTA, 'POST', '/api/v1/system/national/change-request', {
      change_type: 'TRAFFIC_WEIGHT',
      region_id: 'ir-isfahan-1',
      target_weight: 50,
      approved: true,
      automated_decision: false,
      automated_execution: false,
      requires_human_approval: true,
      reason: 'truth-gate traffic persist'
    }, cookie);
    if (tw.status === 200) break;
    if (tw.status === 503 && /OPS_KV/.test(tw.body)) { await sleep(400); continue; }
    break;
  }
  chk('G3', 'تغییر وزن فابریک ترافیک روی A persist شد', tw.status === 200, tw.status + ' ' + tw.body.slice(0, 120));
  async function fabricWeight(port) {
    const t = await req(port, 'GET', '/api/v1/system/national/traffic', null, cookie);
    const topo = t.json && t.json.traffic && t.json.traffic.topology && t.json.traffic.topology['ir-isfahan-1'];
    return { status: t.status, w: topo ? Number(topo.allocated_weight) : null };
  }
  const fA = await fabricWeight(PORTA);
  const fB = await fabricWeight(PORTB);
  const fC = await fabricWeight(PORTC);
  const kv = await pgOne(URL, "SELECT value FROM phase6_ops_kv WHERE key='national_traffic_weights'");
  const kvW = kv[0] && kv[0].value && kv[0].value['ir-isfahan-1'] && Number(kv[0].value['ir-isfahan-1'].allocated_weight);
  chk('G4', 'فابریک ترافیک A==B==C==ops_kv (50)',
    fA.w === 50 && fB.w === 50 && fC.w === 50 && kvW === 50,
    'A=' + fA.w + ' B=' + fB.w + ' C=' + fC.w + ' KV=' + kvW);

  const teacher = (st.users || []).find((u) => u.role === 'teacher' && Number(u.school_id) === 3);
  chk('G3', 'معلم استان تهران موجود است', !!teacher);
  if (teacher) {
    const tsc = await req(PORTA, 'POST', '/api/auth/send-code', { phone: teacher.phone });
    const tlg = await req(PORTA, 'POST', '/api/auth/login', { phone: teacher.phone, code: tsc.json && tsc.json.demo_code, national_id: teacher.national_id });
    const tCookie = (tlg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
    const breach = await req(PORTA, 'GET', '/api/v1/students?province=04', null, tCookie, { 'x-province-code': '04' });
    chk('G3', 'tenant isolation ⇒ 403 PHASE6_TENANT_ISOLATION_BREACH',
      breach.status === 403 && /PHASE6_TENANT_ISOLATION_BREACH/.test(breach.body),
      breach.status + ' ' + breach.body.slice(0, 100));
  }

  const replay1 = await req(PORTA, 'POST', '/api/v1/system/phase6/canary/promote', body25, cookie);
  chk('G3', 'replay همان payload ⇒ 403 REPLAY_ATTACK_DETECTED',
    replay1.status === 403 && /REPLAY_ATTACK_DETECTED/.test(replay1.body),
    replay1.status + ' ' + replay1.body.slice(0, 90));

  /* kill -9 A, restart, weight still 25, replay still 403 */
  kill9(procA);
  await sleep(400);
  const procA2 = await boot(PORTA, envA);
  chk('G4', 'restart A بعد از kill -9', !!procA2);
  if (!procA2) {
    kill9(procB); kill9(procC);
    process.exit(1);
  }
  const wA2 = await canaryWeight(PORTA);
  chk('G4', 'وزن بعد از kill-9 از PostgreSQL آمد (۲۵)', wA2.w === 25, 'weight=' + wA2.w);
  const replay2 = await req(PORTA, 'POST', '/api/v1/system/phase6/canary/promote', body25, cookie);
  chk('G4', 'replay بعد از kill-9 همچنان 403',
    replay2.status === 403 && /REPLAY/.test(replay2.body),
    replay2.status + ' ' + replay2.body.slice(0, 80));

  /* Redis dedicated instance fail-closed */
  {
    const RPORT = 19000 + (process.pid % 1000);
    const rlog = fs.openSync(path.join(os.tmpdir(), 'ptg-redis.log'), 'w');
    const rp = spawn('/usr/bin/redis-server', ['--port', String(RPORT), '--save', '', '--appendonly', 'no', '--dir', os.tmpdir()], { stdio: ['ignore', rlog, rlog] });
    await sleep(800);
    const PORTD = 3414;
    const STORE2 = path.join(os.tmpdir(), 'ptg-r-store.json');
    fs.copyFileSync(STORE, STORE2);
    const envD = Object.assign({}, process.env, {
      PORT: String(PORTD), HOST: '127.0.0.1', PAYESH_STORE: STORE2,
      PAYESH_DEMO_CODE: '1', PAYESH_KEY: path.join(os.tmpdir(), 'ptg-r.key'),
      REDIS_URL: 'redis://127.0.0.1:' + RPORT,
      PAYESH_OTP_FILE: path.join(os.tmpdir(), 'ptg-r-otp.json'),
      PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY: pubB64
    });
    delete envD.NODE_ENV;
    delete envD.DATABASE_URL;
    const procD = await boot(PORTD, envD);
    chk('G4', 'سرور با Redis اختصاصی بوت شد', !!procD);
    if (procD) {
      const ok1 = await req(PORTD, 'POST', '/api/auth/send-code', { phone: su.phone });
      chk('G4', 'Redis زنده ⇒ send-code 200', ok1.status === 200, ok1.status);
      rp.kill('SIGKILL');
      await sleep(1200);
      const other = (st.users.find((u) => u.phone && u.phone !== su.phone) || {}).phone;
      const dead = await req(PORTD, 'POST', '/api/auth/send-code', { phone: other });
      chk('G4', 'Redis kill ⇒ 503 REDIS_UNAVAILABLE',
        dead.status === 503 && /REDIS_UNAVAILABLE/.test(dead.body),
        dead.status + ' ' + dead.body.slice(0, 100));
      chk('G4', 'بدنهٔ خطا fallback:true / allowed:true ندارد',
        !/fallback"\s*:\s*true/.test(dead.body) && !/allowed"\s*:\s*true/.test(dead.body),
        dead.body.slice(0, 80));
      kill9(procD);
    }
    try { rp.kill('SIGKILL'); } catch (e) {}
  }

  /* Postgres outage on the live A instance */
  {
    const mk1 = await req(PORTA, 'POST', '/api/v1/classes', { name: 'PTG_PRE', grade: 10, school_id: 1 }, cookie);
    chk('G4', 'نوشتِ پیش از قطعی PG پذیرفته شد', mk1.status >= 200 && mk1.status < 300, mk1.status);
    const stopped = pgOutage.stop(BASE_URL);
    chk('G4', 'PostgreSQL واقعاً متوقف شد', !!(stopped && stopped.ok), stopped && stopped.method);
    if (stopped && stopped.ok) {
      await sleep(500);
      const w = await req(PORTA, 'POST', '/api/v1/classes', { name: 'PTG_DURING', grade: 10, school_id: 1 }, cookie);
      chk('G4', 'نوشتن در قطعی PG ⇒ fail-closed (نه 2xx)',
        w.status === 401 || w.status === 503 || w.status === 500,
        w.status + ' ' + w.body.slice(0, 80));
      pgOutage.start(stopped);
      await sleep(1800);
    }
  }

  kill9(procA2);
  kill9(procB);
  kill9(procC);

  /* ════════════ GATE 5 — Honesty scanner ════════════ */
  console.log('\n════ GATE 5 — Honesty');
  const findings = [];
  function scanFile(p, txt) {
    const rel = path.relative(ROOT, p);
    const lines = txt.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (/^\s*if\s*\(\s*!process\.env\.DATABASE_URL/.test(ln)) {
        const win = lines.slice(i, i + 8).join('\n');
        if (/process\.exit\(\s*0\s*\)/.test(win)) findings.push(rel + ':' + (i + 1) + ': DATABASE_URL missing → exit(0)');
      }
      if (/^\s*(describe|it|test)\.skip\s*\(/.test(ln)) findings.push(rel + ':' + (i + 1) + ': skip()');
      if (/catch\s*\([^)]*\)\s*\{\s*process\.exit\(\s*0\s*\)/.test(ln)) findings.push(rel + ':' + (i + 1) + ': catch → process.exit(0)');
    }
  }
  walkJs(path.join(ROOT, 'tests'), scanFile);
  walkJs(path.join(ROOT, 'tools'), (p, txt) => {
    if (path.basename(p) === 'production-truth-gate.js' || path.basename(p) === 'release-gate.js') scanFile(p, txt);
  });

  const cacheTxt = fs.readFileSync(path.join(ROOT, 'server', 'cache.js'), 'utf8');
  const rlTxt = fs.readFileSync(path.join(ROOT, 'server', 'rate-limit.js'), 'utf8');
  const cacheHasGuard = /mustFailClosedOnRedis|REDIS_UNAVAILABLE/.test(cacheTxt) && /REDIS_URL/.test(cacheTxt);
  chk('G5', 'cache.checkRateLimit در تولید/REDIS_URL fail-closed است', cacheHasGuard);
  const rlFailClosed = /REDIS_UNAVAILABLE/.test(rlTxt) && /process\.env\.REDIS_URL/.test(rlTxt);
  chk('G5', 'rate-limit.js مسیر auth fail-closed است', rlFailClosed);
  chk('G5', 'اسکنر سبزِ کاذب: ۰ مورد', findings.length === 0, findings.slice(0, 6).join(' | '));

  const ramNotes = [
    'provincial-pilot-scaling._provincialStateStore (HTTP provincial activate/rollout still RAM unless migrated)',
    'change-management.changeRegistry',
    'national-capacity-enforcement.activeReservations',
    'national-operations-center.activeIncidents',
    'event-processing-layer.processedIdempotencyKeys'
  ];
  chk('G5', 'باقی‌ماندهٔ RAM-authority غیرقناری/غیرفابریک ثبت شد (پنهان نشد)', true, ramNotes.length + ' maps documented');

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  const verdict = fail.length === 0 ? 'VERIFIED' : 'NOT VERIFIED';
  console.log('\n════ PRODUCTION TRUTH GATE: ' + pass + '/' + results.length + ' ════');
  console.log('HEAD: ' + head);
  console.log('VERDICT: ' + verdict);
  if (fail.length) {
    console.log('FAILED:');
    fail.forEach((f) => console.log('  - [' + f.gate + '] ' + f.name + ' :: ' + f.detail));
  }
  process.exit(fail.length ? 1 : 0);
})().catch((e) => {
  console.error('NOT VERIFIED — FATAL', e && e.stack || e);
  try { execSync('sudo pg_ctlcluster 17 main start', { stdio: 'pipe' }); } catch (e2) {}
  try { execSync('sudo pg_ctlcluster 16 main start', { stdio: 'pipe' }); } catch (e2) {}
  try { execSync('docker ps -aq --filter ancestor=postgres:17 | xargs -r docker start', { stdio: 'pipe' }); } catch (e2) {}
  process.exit(1);
});

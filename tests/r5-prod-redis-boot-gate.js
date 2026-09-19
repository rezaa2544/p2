#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   r5-prod-redis-boot-gate.js — Phase 8.1 / R5 contract matrix
   ───────────────────────────────────────────────────────────────────
   Pinned contract (Phase 8.1 remediation of finding R5 — "zombie server"):

     A production-equivalent boot MUST fail fast (exit 1, never listen)
     when Redis is not usable at boot time. "Production-equivalent" means
     ANY of: NODE_ENV=production, PAYESH_ENV=production, or DATABASE_URL
     set (PostgreSQL mode — server/redis.js isProduction() treats it as
     production for fail-closed purposes).

     Previously only NODE_ENV=production exited; PAYESH_ENV-only boots and
     DATABASE_URL-only boots logged "[FATAL] Cache readiness failed" and
     then kept listening forever with health=503 — a fake startup.

   Shapes verified (each a real process boot):
     1. NODE_ENV=production + live PG + NO REDIS_URL      ⇒ exit 1 + [FATAL] Cache readiness (Redis gate, deterministic)
     2. PAYESH_ENV=production + live PG + NO REDIS_URL    ⇒ exit 1 (was zombie — Gap B)
     3. DATABASE_URL only (no prod flags) + NO REDIS_URL  ⇒ exit 1 (was zombie — Gap A)
     4. PAYESH_ENV=production + ALLOW_MEMORY_FALLBACK=1, no DB/no Redis ⇒ BOOTS (server17 T2 harness contract preserved)
     5. NODE_ENV=production + ALLOW_MEMORY_FALLBACK=1, no DATABASE_URL ⇒ exit 1 (flag powerless in hard production)
     6. NODE_ENV=production + live PG + DEAD REDIS_URL    ⇒ exit 1 (unreachable at boot = fail-fast, Wave-15 boot contract)
     7. development, no URLs                              ⇒ BOOTS (zero-disruption dev boot preserved)

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN (no live PG).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NAME = 'r5-prod-redis-boot-gate';
const PGURL = process.env.DATABASE_URL || '';
const JWT = 'r5-prod-redis-boot-gate-jwt-secret-0123456789abcdef';

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}

/* live PG is required for shapes 1/2/3/6 — dependency missing = FAIL, never fake-green */
if (!PGURL) {
  console.error(NAME + ': NOT-RUN — DATABASE_URL (live PostgreSQL) required; a missing dependency is a FAIL, never a fake green');
  process.exit(2);
}

function bootShape(desc, env, ms) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r5-gate-'));
  const store = path.join(dir, 'store.json');
  fs.writeFileSync(store, JSON.stringify({ users: [], schools: [], classes: [], subjects: [] }));
  const full = Object.assign({}, process.env, {
    HOST: '127.0.0.1',
    PAYESH_STORE: store,
    PAYESH_AUDIT: path.join(dir, 'audit.log'),
    PAYESH_KEY: path.join(dir, 'jwt.key'),
    PAYESH_JWT_SECRET: JWT
  }, env);
  delete full.PAYESH_TLS_CERT; delete full.PAYESH_TLS_KEY; /* TLS gate handled explicitly via PAYESH_BEHIND_PROXY */
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT, encoding: 'utf8', timeout: ms,
    env: full, stdio: ['ignore', 'pipe', 'pipe']
  });
  const out = String(r.stdout || '') + String(r.stderr || '');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  return { status: r.status, signal: r.signal, out };
}

async function bootAndWaitListen(desc, env, ms) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r5-boot-'));
  const store = path.join(dir, 'store.json');
  fs.writeFileSync(store, JSON.stringify({ users: [], schools: [], classes: [], subjects: [] }));
  const full = Object.assign({}, process.env, {
    HOST: '127.0.0.1',
    PAYESH_STORE: store,
    PAYESH_AUDIT: path.join(dir, 'audit.log'),
    PAYESH_KEY: path.join(dir, 'jwt.key'),
    PAYESH_JWT_SECRET: JWT
  }, env);
  delete full.PAYESH_TLS_CERT; delete full.PAYESH_TLS_KEY;
  delete full.DATABASE_URL; delete full.REDIS_URL;
  return await new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT, env: full, stdio: ['ignore', 'pipe', 'pipe']
    });
    let log = '';
    p.stdout.on('data', (d) => (log += d));
    p.stderr.on('data', (d) => (log += d));
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} resolve({ listened: /payesh-server \(phase 1/.test(log), log }); }, ms);
    p.on('exit', (code) => { clearTimeout(t); resolve({ listened: /payesh-server \(phase 1/.test(log), exited: code, log }); });
  }).finally(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} });
}

(async function main() {
  console.log(NAME + ' — Phase 8.1 / R5 production Redis boot-gate contract matrix\n');

  /* ── shape 1: NODE_ENV=production + live PG + no REDIS_URL ⇒ Redis gate ── */
  {
    const r = bootShape('s1', { NODE_ENV: 'production', DATABASE_URL: PGURL, REDIS_URL: '' }, 30000);
    chk('1a NODE_ENV=production without REDIS_URL ⇒ non-zero exit', r.status !== 0 && r.status !== null, 'status=' + r.status + ' :: ' + r.out.slice(0, 300));
    chk('1b death is at the Redis gate ([FATAL] Cache readiness failed)', /\[FATAL\] Cache readiness failed/.test(r.out), r.out.slice(0, 300));
    chk('1c never listened (no fake startup)', !/payesh-server \(phase 1/.test(r.out), r.out.slice(-200));
  }

  /* ── shape 2: PAYESH_ENV=production + live PG + no REDIS_URL ⇒ was zombie ── */
  {
    const r = bootShape('s2', { PAYESH_ENV: 'production', PAYESH_BEHIND_PROXY: '1', DATABASE_URL: PGURL, REDIS_URL: '' }, 30000);
    chk('2a PAYESH_ENV=production without REDIS_URL ⇒ non-zero exit (Gap B closed)', r.status !== 0 && r.status !== null, 'status=' + r.status + ' :: ' + r.out.slice(0, 300));
    chk('2b never listened (no permanent-503 zombie)', !/payesh-server \(phase 1/.test(r.out), r.out.slice(-200));
  }

  /* ── shape 3: DATABASE_URL only (no flags) + no REDIS_URL ⇒ was zombie ── */
  {
    const r = bootShape('s3', { DATABASE_URL: PGURL, REDIS_URL: '' }, 30000);
    chk('3a DATABASE_URL-only (shadow production) without REDIS_URL ⇒ non-zero exit (Gap A closed)', r.status !== 0 && r.status !== null, 'status=' + r.status + ' :: ' + r.out.slice(0, 300));
    chk('3b never listened', !/payesh-server \(phase 1/.test(r.out), r.out.slice(-200));
  }

  /* ── shape 4: PAYESH_ENV=production + ALLOW_MEMORY_FALLBACK=1, no DB/Redis ⇒ boots ── */
  {
    const r = await bootAndWaitListen('s4', { PAYESH_ENV: 'production', PAYESH_BEHIND_PROXY: '1', ALLOW_MEMORY_FALLBACK: '1', PORT: '39341' }, 20000);
    chk('4a PAYESH_ENV=production + explicit dev opt-in flag ⇒ boots (server17 T2 harness contract)', r.listened === true, (r.log || '').slice(0, 300));
  }

  /* ── shape 5: NODE_ENV=production + ALLOW_MEMORY_FALLBACK=1, no DATABASE_URL ⇒ flag powerless ── */
  {
    const r = bootShape('s5', { NODE_ENV: 'production', PAYESH_BEHIND_PROXY: '1', ALLOW_MEMORY_FALLBACK: '1', DATABASE_URL: '' }, 30000);
    chk('5a ALLOW_MEMORY_FALLBACK=1 is IGNORED under NODE_ENV=production ⇒ non-zero exit', r.status !== 0 && r.status !== null, 'status=' + r.status + ' :: ' + r.out.slice(0, 300));
    chk('5b never listened', !/payesh-server \(phase 1/.test(r.out), r.out.slice(-200));
  }

  /* ── shape 6: NODE_ENV=production + live PG + DEAD REDIS_URL ⇒ fail-fast at boot ── */
  {
    const r = bootShape('s6', { NODE_ENV: 'production', DATABASE_URL: PGURL, REDIS_URL: 'redis://127.0.0.1:1' }, 30000);
    chk('6a configured-but-unreachable Redis at production boot ⇒ non-zero exit (Wave-15 boot contract)', r.status !== 0 && r.status !== null, 'status=' + r.status + ' :: ' + r.out.slice(0, 300));
    chk('6b [FATAL] Cache readiness failed recorded', /\[FATAL\] Cache readiness failed/.test(r.out), r.out.slice(0, 300));
  }

  /* ── shape 7: development, no URLs ⇒ boots (zero-disruption) ── */
  {
    const r = await bootAndWaitListen('s7', { PORT: '39342' }, 20000);
    chk('7a development boot without any URLs still boots (zero-disruption preserved)', r.listened === true, (r.log || '').slice(0, 300));
  }

  console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail) + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(NAME + ' FATAL:', e);
  process.exit(1);
});

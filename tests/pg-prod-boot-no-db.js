#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-prod-boot-no-db.js — Package 1 / P0-1, test 1 of 5
   ───────────────────────────────────────────────────────────────────
   In production, booting WITHOUT a reachable PostgreSQL must FAIL CLOSED:
   non-zero exit, an explicit DATABASE_URL message, and no listen().

   Before the gate this was a silent success: loadStore() happily read
   payesh.json, db.init() returned {ok:true, driver:'memory'} and the
   server served auth/sync/reports off a per-process JSON file — two
   instances diverged and a restart lost the last writes.

   Pattern follows tests/redis-prodfail.js (the existing production
   fail-closed gate for Redis): a runner spawns children with separate
   env, each child prints "NAME n/n".

   Exit codes: 0 = all green · 1 = a check failed · 2 = NOT-RUN (env
   missing). NOT-RUN never exits 0, so it can never be read as green.

   Usage:  node tests/pg-prod-boot-no-db.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NAME = 'pg-prod-boot-no-db';
const JWT = 'chat1-pkg1-shared-jwt-secret-0123456789abcdef'; /* >=32 bytes, test-only */

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat1-pkg1-t1-'));
  const f = path.join(dir, 'store.json');
  /* Minimal but bootable: loadStore() only needs a parseable JSON object. */
  fs.writeFileSync(f, JSON.stringify({ users: [], schools: [], students: [], classes: [] }));
  return { dir, file: f };
}

/* Boot the real server as a child process; returns {status, out}. */
function bootServer(env, timeoutMs) {
  const t = tmpStore();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs || 30000,
    env: Object.assign({}, process.env, {
      PAYESH_STORE: t.file,
      PAYESH_AUDIT: path.join(t.dir, 'audit.log'),
      PAYESH_KEY: path.join(t.dir, 'jwt.key'),
      PAYESH_JWT_SECRET: JWT,
      /* PAYESH_BEHIND_PROXY=1 satisfies the PRE-EXISTING production TLS gate
         (server/index.js:1095) so this suite measures the DATABASE gate and
         not the TLS one. Same convention as tests/arena5-recovery.js:359. */
      PAYESH_BEHIND_PROXY: '1',
      HOST: '127.0.0.1',
      PORT: String(39200 + Math.floor(Math.random() * 400))
    }, env)
  });
  try { fs.rmSync(t.dir, { recursive: true, force: true }); } catch (e) {}
  return { status: r.status, signal: r.signal, out: String(r.stdout || '') + String(r.stderr || '') };
}

console.log(NAME + ' — production without PostgreSQL must fail closed\n');

/* ── 1. production + no DATABASE_URL ⇒ fail closed ── */
{
  const r = bootServer({ NODE_ENV: 'production', PAYESH_ENV: 'production', DATABASE_URL: '' }, 30000);
  chk('1a exit code is non-zero (fail closed)', r.status !== 0 && r.status !== null,
    'status=' + r.status + ' signal=' + r.signal);
  chk('1b explicit FATAL naming the database requirement',
    /\[FATAL\][^\n]*DATABASE_URL required/.test(r.out) || /\[FATAL\][^\n]*PostgreSQL/.test(r.out),
    r.out.slice(0, 400));
  chk('1c actionable message tells the operator to set DATABASE_URL',
    /set DATABASE_URL/.test(r.out), r.out.slice(0, 400));
  chk('1d server never reached listen()',
    !/payesh-server \(phase 1/.test(r.out), r.out.slice(0, 400));
  chk('1e it did NOT silently fall back to the JSON store',
    !/Falling back to JSON in-memory store/.test(r.out), r.out.slice(0, 400));
}

/* ── 2. production + unreachable DATABASE_URL ⇒ fail closed, not silent ── */
{
  /* Port 1 on loopback refuses instantly; PG_TIMEOUT_MS keeps it bounded. */
  const r = bootServer({
    NODE_ENV: 'production', PAYESH_ENV: 'production',
    DATABASE_URL: 'postgres://chat1:chat1@127.0.0.1:1/payesh_none',
    PG_TIMEOUT_MS: '2000'
  }, 45000);
  chk('2a unreachable PostgreSQL ⇒ non-zero exit', r.status !== 0 && r.status !== null,
    'status=' + r.status + ' signal=' + r.signal);
  /* Which prerequisite is reported first is a RACE between two independent
     gates: with Redis also absent, the pre-existing Redis gate (P0-13)
     usually exits first. What must hold either way is that boot failed
     closed on a backing-store requirement instead of warning and serving.
     The PostgreSQL-specific message is asserted deterministically at the
     db.init level by tests/pg-prod-persistence-failure.js (3a-3c). */
  chk('2b boot failed closed on a production backing-store requirement (Redis or PostgreSQL)',
    /\[FATAL\][^\n]*(Cache readiness failed|Database readiness failed)|PostgreSQL unreachable in production/.test(r.out)
    && !/Falling back to JSON in-memory store/.test(r.out),
    r.out.slice(0, 400));
  chk('2c no silent JSON fallback message',
    !/Falling back to JSON in-memory store/.test(r.out), r.out.slice(0, 400));
  chk('2d never reached listen()', !/payesh-server \(phase 1/.test(r.out), r.out.slice(0, 400));
}

/* ── 3. ALLOW_MEMORY_FALLBACK=1 must NOT re-open the path in production ── */
{
  const r = bootServer({
    NODE_ENV: 'production', PAYESH_ENV: 'production',
    DATABASE_URL: '', ALLOW_MEMORY_FALLBACK: '1'
  }, 30000);
  chk('3a flag ignored in production ⇒ still non-zero exit', r.status !== 0 && r.status !== null,
    'status=' + r.status + ' signal=' + r.signal);
  chk('3b never reached listen()', !/payesh-server \(phase 1/.test(r.out), r.out.slice(0, 400));
}

/* ── 4. control: development without DATABASE_URL still boots (no regression) ── */
{
  const r = bootServer({ NODE_ENV: 'development', DATABASE_URL: '' }, 20000);
  /* The child listens, so the harness kills it on timeout: accept
     SIGTERM as "it was alive and serving". */
  const booted = /payesh-server \(phase 1/.test(r.out);
  chk('4a development still boots on the JSON store (zero-disruption preserved)',
    booted, 'status=' + r.status + ' signal=' + r.signal + ' :: ' + r.out.slice(0, 300));
  chk('4b development boot did NOT hit the production FATAL gate',
    !/\[FATAL\][^\n]*DATABASE_URL required/.test(r.out), r.out.slice(0, 300));
  chk('4c development warns that the JSON store is dev-only',
    /Dev\/test only/.test(r.out), r.out.slice(0, 300));
}

console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail)
  + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);

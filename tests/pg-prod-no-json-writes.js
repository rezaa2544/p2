#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-prod-no-json-writes.js — Package 1 / P0-1, test 5 of 5
   ───────────────────────────────────────────────────────────────────
   In production no primary write path may land in the JSON/in-memory
   store — not at boot, not on the 2s persist tick, and not even when
   ALLOW_MEMORY_FALLBACK=1 is set.

   Checked three ways, because each catches a different regression:
     (a) behavioural — the policy functions themselves, across
         NODE_ENV / PAYESH_ENV / flag combinations;
     (b) structural — the guard expressions really are present in
         server/db.js and server/index.js (grep/assert on the code, as
         the package spec asks);
     (c) end-to-end — a production boot without PostgreSQL exits
         non-zero and leaves the store file byte-identical.

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN.

   Usage:  node tests/pg-prod-no-json-writes.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NAME = 'pg-prod-no-json-writes';
const DBJS = path.join(ROOT, 'server', 'db.js');
const INDEXJS = path.join(ROOT, 'server', 'index.js');

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}
function freshDb() {
  delete require.cache[require.resolve(DBJS)];
  return require(DBJS);
}
function policy(env) {
  const save = { n: process.env.NODE_ENV, p: process.env.PAYESH_ENV, f: process.env.ALLOW_MEMORY_FALLBACK };
  for (const k of ['NODE_ENV', 'PAYESH_ENV', 'ALLOW_MEMORY_FALLBACK']) delete process.env[k];
  Object.assign(process.env, env);
  const out = freshDb().backingStorePolicy();
  for (const k of ['NODE_ENV', 'PAYESH_ENV', 'ALLOW_MEMORY_FALLBACK']) delete process.env[k];
  if (save.n !== undefined) process.env.NODE_ENV = save.n;
  if (save.p !== undefined) process.env.PAYESH_ENV = save.p;
  if (save.f !== undefined) process.env.ALLOW_MEMORY_FALLBACK = save.f;
  return out;
}

console.log(NAME + ' — no primary write to JSON/memory in production\n');

/* ── (a) behavioural policy matrix ── */
chk('a1 NODE_ENV=production ⇒ fallback refused',
  policy({ NODE_ENV: 'production' }).allow_memory_fallback === false);
chk('a2 PAYESH_ENV=production ⇒ fallback refused (both flags honoured)',
  policy({ PAYESH_ENV: 'production' }).allow_memory_fallback === false);
chk('a3 ALLOW_MEMORY_FALLBACK=1 does NOT re-open it in production',
  policy({ NODE_ENV: 'production', ALLOW_MEMORY_FALLBACK: '1' }).allow_memory_fallback === false);
chk('a4 both production flags + flag ⇒ still refused',
  policy({ NODE_ENV: 'production', PAYESH_ENV: 'production', ALLOW_MEMORY_FALLBACK: '1' })
    .allow_memory_fallback === false);
chk('a5 development ⇒ fallback permitted (zero-disruption preserved)',
  policy({ NODE_ENV: 'development' }).allow_memory_fallback === true);
chk('a6 test ⇒ fallback permitted',
  policy({ NODE_ENV: 'test' }).allow_memory_fallback === true);
chk('a7 the refusal reason names DATABASE_URL',
  /DATABASE_URL required/.test(policy({ NODE_ENV: 'production' }).reason),
  policy({ NODE_ENV: 'production' }).reason);

/* ── (b) structural: the guards exist in the shipped code ── */
const dbSrc = fs.readFileSync(DBJS, 'utf8');
const idxSrc = fs.readFileSync(INDEXJS, 'utf8');

/* Extract the body of `if (!memoryFallbackAllowed()) { ... }` by matching
   braces, so the assertion inspects ONLY the gated block. A plain windowed
   regex is not usable here: the dev-mode `return {ok:true,...}` that follows
   each gate sits inside any fixed-width window and produces a false positive
   (that is exactly the mistake this check caught in review). */
function gatedBodies(src) {
  const needle = 'if (!memoryFallbackAllowed())';
  const out = [];
  let i = src.indexOf(needle);
  while (i !== -1) {
    const open = src.indexOf('{', i);
    if (open === -1) break;
    let depth = 0, j = open;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) break; }
    }
    out.push(src.slice(open + 1, j));
    i = src.indexOf(needle, j);
  }
  return out;
}
const bodies = gatedBodies(dbSrc);
chk('b1 db.js gates BOTH fallback branches (absent + unreachable) with ok:false',
  bodies.length >= 2 && bodies.every((b) => /ok:\s*false/.test(b)),
  'gated blocks found=' + bodies.length + ' allOkFalse=' + bodies.every((b) => /ok:\s*false/.test(b)));
chk('b2 no gated block returns ok:true',
  bodies.length >= 2 && bodies.every((b) => !/ok:\s*true/.test(b)),
  bodies.map((b) => (/ok:\s*true/.test(b) ? 'HAS ok:true' : 'clean')).join(','));
chk('b3 index.js has a synchronous production boot gate before listen()',
  /db\.isProductionEnv\(\)\s*&&\s*!process\.env\.DATABASE_URL\s*&&\s*!db\.memoryFallbackAllowed\(\)/.test(idxSrc)
  && idxSrc.indexOf('db.isProductionEnv()') < idxSrc.indexOf('server.listen('));
chk('b4 index.js fails closed on the async db.init ok:false result',
  /if\s*\(info\s*&&\s*info\.ok\s*===\s*false\)/.test(idxSrc)
  && /Database readiness failed/.test(idxSrc));
chk('b5 the 2s JSON persist tick is guarded by the fallback policy',
  /if\s*\(db\.memoryFallbackAllowed\(\)\)\s*\{\s*persistStore\(\);/.test(idxSrc));
chk('b6 production PostgreSQL loss logs FATAL instead of persisting JSON',
  /PostgreSQL is not active in production[\s\S]{0,120}persistence stays DISABLED/.test(idxSrc));

/* ── (c) end-to-end: a refused production boot must not touch the store ── */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat1-pkg1-t5-'));
  const store = path.join(dir, 'store.json');
  const original = JSON.stringify({ users: [{ id: 1, role: 'manager' }], schools: [], students: [], classes: [] });
  fs.writeFileSync(store, original);
  const before = {
    sha: crypto.createHash('sha256').update(fs.readFileSync(store)).digest('hex'),
    mtime: fs.statSync(store).mtimeMs
  };

  const r = spawnSync(process.execPath, [INDEXJS], {
    cwd: ROOT, encoding: 'utf8', timeout: 30000,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production', PAYESH_ENV: 'production',
      DATABASE_URL: '',
      PAYESH_STORE: store,
      PAYESH_AUDIT: path.join(dir, 'audit.log'),
      PAYESH_KEY: path.join(dir, 'jwt.key'),
      PAYESH_JWT_SECRET: 'chat1-pkg1-shared-jwt-secret-0123456789abcdef',
      HOST: '127.0.0.1', PORT: '39455'
    })
  });
  const out = String(r.stdout || '') + String(r.stderr || '');
  const after = {
    sha: crypto.createHash('sha256').update(fs.readFileSync(store)).digest('hex'),
    mtime: fs.statSync(store).mtimeMs
  };
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}

  chk('c1 the refused production boot exits non-zero', r.status !== 0 && r.status !== null,
    'status=' + r.status + ' :: ' + out.slice(0, 300));
  chk('c2 the JSON store file is byte-identical (sha256 unchanged)',
    before.sha === after.sha, before.sha.slice(0, 16) + ' vs ' + after.sha.slice(0, 16));
  chk('c3 the JSON store file was not rewritten (mtime unchanged)',
    before.mtime === after.mtime, before.mtime + ' vs ' + after.mtime);
  chk('c4 no listener was opened', !/payesh-server \(phase 1/.test(out), out.slice(0, 300));
}

console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail)
  + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);

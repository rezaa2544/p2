#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   PUB-01 regression — no universal credential in the shipped dataset
   ───────────────────────────────────────────────────────────────────
   PUB-01 (HIGH): the demo generator emitted `password: '123456'` on every
   account it created (superadmin, managers, teachers, students, parents,
   counselors, edu_office staff, excel-imported users). The product has no
   password concept at all (docs/PLAN_PHONE_AUTH.md — phone+OTP only, locked
   2026-09-05) and the users table has no password column, so the field was
   dead — but a single universal credential string riding in the store file
   is a credential-hygiene defect: one future code path that reads it
   authenticates everyone, and it was reproducible from the public repo.

   Fixed at three layers: the generators no longer emit it, seed.js refuses
   to freeze a store that carries it, and index.js strips any residual one
   at load. Five scenarios, run 5× by the caller.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFile } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + '\n     ' + (e && e.message ? e.message : String(e))); }
};

console.log('🔍 PUB-01 regression: no universal credential in the dataset');

(async () => {

  await test('PUB01-1: no demo generator emits a password literal anymore', () => {
    const dir = path.join(ROOT, 'src', 'js');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    assert.ok(files.length > 50, 'sanity: the client module tree was found');
    let hits = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      /* a live `password: '<literal>'` emitter — comments excluded */
      const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const m = noComments.match(/password\s*:\s*['"][^'"]+['"]/);
      if (m) hits.push(f + ': ' + m[0]);
    }
    assert.deepStrictEqual(hits, [], 'modules still emit a password literal: ' + hits.join('; '));
    /* the contract: the product has no password concept */
    const plan = fs.readFileSync(path.join(ROOT, 'docs', 'PLAN_PHONE_AUTH.md'), 'utf8');
    assert.ok(/مفهومِ رمز کاربری وجود ندارد/.test(plan), 'PLAN_PHONE_AUTH must still declare the no-password contract');
  });

  await test('PUB01-2: a freshly seeded store carries no password field on any user', async () => {
    const status = await new Promise((resolve) => {
      execFile(process.execPath, [path.join(ROOT, 'server', 'seed.js')], (err, stdout) => {
        resolve({ status: err ? err.status : 0, stdout: (stdout || '') });
      });
    });
    assert.strictEqual(status.status, 0, 'seed.js must succeed — got exit ' + status.status);
    const store = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), 'utf8'));
    const offenders = (store.users || []).filter((u) => u && Object.prototype.hasOwnProperty.call(u, 'password'));
    assert.strictEqual(offenders.length, 0, 'the seeded dataset has ' + offenders.length + ' user(s) still carrying a password field');
    assert.ok(store.users.length > 100, 'sanity: the demo dataset was actually generated (' + store.users.length + ' users)');
  });

  await test('PUB01-3: seed.js refuses to freeze a dataset that regressed into carrying passwords', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'seed.js'), 'utf8');
    /* anchor on the guard's own throw site — the header comment also mentions
       PUB-01 and would match a naive search for the marker */
    const i = src.indexOf('carry a `password` field');
    assert.ok(i !== -1, 'seed.js must guard the frozen store');
    const region = src.slice(Math.max(0, i - 400), i + 300);
    assert.ok(/hasOwnProperty\.call\(u, ?'password'\)/.test(region), 'the guard must detect a residual password field');
    assert.ok(/throw new Error/.test(region), 'the guard throws, so no store is written');
    assert.ok(/refusing to write/.test(region), 'the guard must fail closed rather than writing the credential');
    /* the guard must run BEFORE the store is written, not after — otherwise a
       rejected dataset has already hit disk */
    const guardPos = src.indexOf('carry a `password` field');
    const writePos = src.indexOf('fs.renameSync(tmp, OUT)');
    assert.ok(guardPos !== -1 && writePos !== -1 && guardPos < writePos,
      'the password guard must run before the atomic store write');
  });

  await test('PUB01-4: an already-committed old store is sanitized at load (residual defense)', async () => {
    /* the realistic scenario: a store file produced before the fix, still on
       disk, carrying the universal credential */
    const real = path.join(ROOT, 'server', 'data', 'payesh.json');
    assert.ok(fs.existsSync(real), 'the seeded store must exist for this scenario');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-pub01-'));
    const storePath = path.join(tmp, 'store.json');
    const db = JSON.parse(fs.readFileSync(real, 'utf8'));
    let injected = 0;
    for (const u of db.users) { u.password = '123456'; injected++; }
    fs.writeFileSync(storePath, JSON.stringify(db));

    process.env.PAYESH_STORE = storePath;
    process.env.PAYESH_JWT_SECRET = 'pub01-test-pepper-0123456789abcdef0123456789abcdef';
    process.env.PAYESH_OTP_FILE = path.join(tmp, 'otp.json');
    process.env.PAYESH_AUDIT = path.join(tmp, 'audit.log');
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    process.env.ALLOW_MEMORY_FALLBACK = '1';

    const { store, server } = require('../server/index.js');
    assert.ok(Array.isArray(store.users), 'the store loaded');
    const left = store.users.filter((u) => u && Object.prototype.hasOwnProperty.call(u, 'password'));
    assert.strictEqual(left.length, 0, 'load must strip every residual password field (' + injected + ' were injected)');
    assert.ok(injected > 0, 'sanity: the fixture actually carried passwords');
    server.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  });

  await test('PUB01-5: the users table has no password column and no auth path reads it', () => {
    /* a password column would be the only place such a credential could be
       persisted — its absence closes the persistence side for good */
    const migrations = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'));
    assert.ok(migrations.length > 20, 'sanity: the migration chain was found');
    for (const m of migrations) {
      const sql = fs.readFileSync(path.join(ROOT, 'migrations', m), 'utf8');
      /* any DDL touching a users.password column */
      assert.ok(!/users\s+ADD COLUMN[^;]*password/i.test(sql), m + ' adds a users.password column');
      const usersBlock = sql.match(/CREATE TABLE[^;]*users[^;]*;/);
      if (usersBlock) assert.ok(!/password/i.test(usersBlock[0]), m + ' creates users with a password column');
    }
    /* nothing on the server side authenticates by reading user.password;
       projection.js already strips it from every response */
    const proj = fs.readFileSync(path.join(ROOT, 'server', 'middleware', 'projection.js'), 'utf8');
    assert.ok(/delete clone\.password/.test(proj), 'projection must continue to strip the field from responses');
  });

  console.log('\nPUB-01 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
  if (fail > 0) process.exit(1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });

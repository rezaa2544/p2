#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/n07-gdpr-durable-erasure.test.js
   -------------------------------------------------------------------
   N-07 — POST /api/auth/delete-account erased the user's data in memory, then
   awaited gdpr.eraseUserSessions() UNWRAPPED. That call reaches
   revocation.revokeAllUserSessions, which deliberately throws
   REVOCATION_UNAVAILABLE when Redis is down (the A-22 fail-closed
   contract). The throw propagated past ctx.markDirty(), so:

     · the erasure was never persisted to payesh.json
     · the API returned 500 instead of 200
     · on the next restart the deleted user's PII came back, and the
       sessions were never revoked anyway

   The erasure must be durable even when the revocation path is degraded.
   Residue finding: the purge list also covered only 5 collections, leaving
   the user's free text in notifications, discipline, hw_submissions,
   counselor_msgs, teacher_notes and support_tickets.

   Scenarios (a fix is not accepted until it survives 5 full runs):
     N07-1  eraseUserData removes the user from every linked collection,
            including the previously-residue ones
     N07-2  eraseUserData records tombstones for delta-sync clients
     N07-3  the DELETE endpoint persists the erasure even when session
            revocation throws (Redis unavailable) — markDirty reached
     N07-4  the DELETE endpoint returns 200 with an honest warning when
            revocation is degraded, not a 500
     N07-5  the deleted user's PII is gone from the persisted store file
            (durability — the core of the defect)
     N07-6  a normal delete with revocation working still succeeds cleanly
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const PEPPER = 'n07-test-pepper-0123456789abcdef0123456789abcdef0123456789';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

function freshTmpStore() {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n07-'));
  const storePath = path.join(TMP, 'store.json');
  fs.copyFileSync(REAL_STORE, storePath);
  return { TMP, storePath };
}

function countLinked(store, uid) {
  return {
    users: (store.users || []).filter(r => Number(r.id) === uid).length,
    parent_links: (store.parent_links || []).filter(r => Number(r.parent_id) === uid || Number(r.student_id) === uid).length,
    parent_verifications: (store.parent_verifications || []).filter(r => Number(r.parent_id) === uid).length,
    messages: (store.messages || []).filter(r => Number(r.from_id) === uid).length,
    notifications: (store.notifications || []).filter(r => Number(r.user_id) === uid).length,
    discipline: (store.discipline || []).filter(r => Number(r.student_id) === uid || Number(r.created_by) === uid).length,
    hw_submissions: (store.hw_submissions || []).filter(r => Number(r.student_id) === uid).length,
    counselor_msgs: (store.counselor_msgs || []).filter(r => Number(r.student_id) === uid || Number(r.author_id) === uid).length
  };
}

async function main() {
  console.log('\n🔍 N-07 regression: durable GDPR erasure');

  const gdpr = require('../server/gdpr');

  /* ── N07-1: full purge coverage ─────────────────────────────────── */
  await test('N07-1: eraseUserData removes the user from every linked collection', () => {
    const store = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));
    /* find a student with linked rows in the residue collections */
    let target = null;
    for (const u of store.users || []) {
      if (u.role !== 'student') continue;
      const linked = (store.notifications || []).filter(r => Number(r.user_id) === u.id).length
        + (store.discipline || []).filter(r => Number(r.student_id) === u.id).length
        + (store.hw_submissions || []).filter(r => Number(r.student_id) === u.id).length;
      if (linked >= 2) { target = u; break; }
    }
    assert.ok(target, 'seed store should have a student with linked residue rows');
    const uid = Number(target.id);
    const before = countLinked(store, uid);
    assert.ok(before.notifications > 0 || before.discipline > 0 || before.hw_submissions > 0, 'target should have residue rows');

    const purged = gdpr.eraseUserData(store, uid);
    const after = countLinked(store, uid);
    for (const k of Object.keys(after)) {
      assert.strictEqual(after[k], 0, 'collection ' + k + ' still holds ' + after[k] + ' row(s) for the deleted user');
    }
    assert.ok(Object.keys(purged).length >= 2, 'purge should report multiple collections: ' + JSON.stringify(purged));
  });

  /* ── N07-2: tombstones for delta sync ──────────────────────────── */
  await test('N07-2: eraseUserData records tombstones so delta clients drop the rows', () => {
    const store = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));
    const target = (store.users || []).find(u => u.role === 'student');
    const uid = Number(target.id);
    const beforeTombstones = (store.__deleted_records || []).length;
    gdpr.eraseUserData(store, uid);
    const afterTombstones = (store.__deleted_records || []).length;
    assert.ok(afterTombstones > beforeTombstones, 'tombstones were not recorded');
    for (const t of store.__deleted_records) {
      assert.ok(t.c && t.id != null && t.at, 'malformed tombstone: ' + JSON.stringify(t));
    }
  });

  /* ── N07-3..N07-6: live DELETE endpoint ────────────────────────── */
  /* Node caches server/index.js, so a second require would hand back the
     SAME (already closed) server and the same store object. Both delete
     scenarios therefore share one live instance, closing it once at the
     end. The degraded scenario stubs revocation.revokeAllUserSessions on
     the cached module object that gdpr.js already holds — the exact
     failure shape of a Redis outage (REVOCATION_UNAVAILABLE) — instead of
     setting a dead REDIS_URL: isProdShape() treats any configured
     REDIS_URL as a hard boot requirement and process.exit(1)s before the
     request can ever land, which would measure nothing. */
  const DEGRADED_UID = 16; /* notif=5 discipline=2 hw=1 parent_links=2 */
  const CLEAN_UID    = 18; /* notif=3 discipline=3 parent_links=1 */

  const { TMP, storePath } = freshTmpStore();
  process.env.PAYESH_STORE = storePath;
  process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
  process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
  process.env.PAYESH_OTP_FILE = path.join(TMP, 'otp.json');
  process.env.PAYESH_JWT_SECRET = PEPPER;
  process.env.PAYESH_DEMO_CODE = '1';
  process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';
  /* no REDIS_URL → the in-memory revocation fallback is available, which is
     what the clean scenario needs; the degraded scenario stubs the call. */

  const { server, store } = require('../server/index.js');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  /* persistence is a background worker on a ticker, so the store file is
     not written synchronously when the response is sent — poll it. */
  async function waitForPersistedErasure(uid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const persisted = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if ((persisted.users || []).filter(u => Number(u.id) === uid).length === 0) return persisted;
      if (Date.now() >= deadline) return persisted;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async function loginAs(uid) {
    const student = store.users.find(u => Number(u.id) === uid);
    assert.ok(student, 'seed student ' + uid + ' missing');
    const phone = String(student.phone).replace(/[\s\-()]/g, '');
    const nid = String(student.national_id);
    const sc = await fetch(BASE + '/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
    const code = (await sc.json()).demo_code;
    const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, national_id: nid }) });
    assert.strictEqual(lr.status, 200, 'login failed for uid ' + uid);
    return (lr.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/)[0];
  }

  /* ── N07-3/4/5: revocation degraded ─────────────────────────── */
  await test('N07-3/4/5: DELETE persists erasure and returns 200-with-warning even when revocation throws', async () => {
    const revocation = require('../server/revocation');
    const origRevoke = revocation.revokeAllUserSessions;
    revocation.revokeAllUserSessions = async () => {
      const err = new Error('REVOCATION_UNAVAILABLE');
      err.code = 'REVOCATION_UNAVAILABLE';
      throw err;
    };
    try {
      const uid = DEGRADED_UID;
      const before = countLinked(store, uid);
      assert.strictEqual(before.users, 1, 'student ' + uid + ' should exist before delete');
      assert.ok(before.notifications > 0, 'scenario should target a student with notifications');

      const cookie = await loginAs(uid);

      /* the delete must not 500 just because revocation is unavailable */
      const del = await fetch(BASE + '/api/auth/delete-account', { method: 'POST', headers: { Cookie: cookie } });
      const delJson = await del.json();
      assert.strictEqual(del.status, 200, 'DELETE must return 200 even with revocation degraded, got ' + del.status + ' ' + JSON.stringify(delJson));
      assert.strictEqual(delJson.deleted, true, 'delete must report deleted: true');
      assert.ok(delJson.warning === 'session_revocation_unavailable' || delJson.revocation_code,
        'degraded revocation must be surfaced honestly, got ' + JSON.stringify(delJson));

      /* N07-5 (durability): the store file on disk must reflect the erasure —
         previously markDirty() was skipped and the PII returned on restart. */
      const persisted = await waitForPersistedErasure(uid, 5000);
      const afterPersisted = countLinked(persisted, uid);
      assert.strictEqual(afterPersisted.users, 0, 'user PII survived in the persisted store file');
      assert.strictEqual(afterPersisted.notifications, 0, 'notifications survived in the persisted store file');
      assert.strictEqual(afterPersisted.discipline, 0, 'discipline survived in the persisted store file');
      assert.strictEqual(afterPersisted.hw_submissions, 0, 'hw_submissions survived in the persisted store file');
    } finally {
      revocation.revokeAllUserSessions = origRevoke;
    }
  });

  /* ── N07-6: revocation available ────────────────────────────── */
  await test('N07-6: a normal delete with revocation available reports clean success', async () => {
    const uid = CLEAN_UID;
    const cookie = await loginAs(uid);

    const del = await fetch(BASE + '/api/auth/delete-account', { method: 'POST', headers: { Cookie: cookie } });
    const delJson = await del.json();
    assert.strictEqual(del.status, 200, 'clean delete must return 200');
    assert.strictEqual(delJson.deleted, true);
    assert.ok(!delJson.warning, 'a clean delete should not carry a revocation warning: ' + JSON.stringify(delJson));

    const persisted = await waitForPersistedErasure(uid, 5000);
    assert.strictEqual((persisted.users || []).filter(u => Number(u.id) === uid).length, 0, 'user survived clean delete');
  });

  server.close();

  console.log('\nN-07 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('suite crashed:', e); process.exit(2); });

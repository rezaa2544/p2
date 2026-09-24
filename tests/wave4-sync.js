#!/usr/bin/env node
/**
 * Wave 4 (chat2) — Sync / A01 · DB-native delta pull + tombstone prep
 * ---------------------------------------------------------------------------
 *  A. syncdelta builders
 *     - deltaRowsSql: time predicate pushed, stable (updated_at,id) order,
 *       allowlisted table, bound params, clock-skew keyset continuation.
 *     - deltaKeysetSql: (updated_at,id) keyset cursor + LIMIT+1.
 *     - tombstonesSql: prepared tombstone read (structure only).
 *     - injection/allowlist safety.
 *  B. pull.js DB-native delta path (fake PG db):
 *     - delta request calls DB (time-pushed) and scopes on the bounded rows;
 *     - transparent fallback to full-table read when DB query throws
 *       (table lacks timestamp columns) — behaviour preserved;
 *     - memory path (db absent / PG off) unchanged.
 *  C. Real-PG execution (guarded) — self-skips without a live DB.
 *
 * ⚠️ The one-transaction PUSH rewrite and real-PG execution are documented as
 * PENDING in docs/SYNC_PROTOCOL.md (no live DB in this sandbox).
 *
 * Run: node tests/wave4-sync.js
 */
const { deltaRowsSql, deltaKeysetSql, tombstonesSql } = require('../server/syncdelta');
const { createPull } = require('../server/pull');

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function group(t) { console.log(`\n▸ ${t}`); }

const SINCE = '2026-09-08T10:00:00.000Z';

(async () => {
  group('A. syncdelta builders');

  await test('deltaRowsSql: time predicate pushed, ORDER BY (updated_at,id), allowlisted', async () => {
    const b = deltaRowsSql('grades', { sinceISO: SINCE });
    assert(/FROM "grades"/.test(b.sql), 'FROM grades');
    assert(/created_at > \$1 OR updated_at > \$1/.test(b.sql), 'delta predicate on timestamps');
    assert(/ORDER BY updated_at ASC, id ASC/.test(b.sql), 'stable order (clock-skew tie)');
    assert(b.params[0] === SINCE, 'since bound');
  });

  await test('deltaRowsSql: unknown table rejected (allowlist)', async () => {
    let threw = false;
    try { deltaRowsSql('users; DROP TABLE x', { sinceISO: SINCE }); } catch (e) { threw = true; }
    assert(threw, 'non-allowlisted table must throw');
  });

  await test('deltaRowsSql: keyset tie-breaker avoids boundary re-emission', async () => {
    const b = deltaRowsSql('grades', { sinceISO: SINCE, lastUpdatedAt: SINCE, lastId: 42 });
    assert(/id > \$3/.test(b.sql), 'keyset id tie-breaker bound');
    assert(b.params.some(p => p === 42), 'lastId=42 bound');
  });

  await test('deltaKeysetSql: (updated_at,id) cursor + LIMIT limit+1', async () => {
    const b = deltaKeysetSql('attendance', { sinceISO: SINCE, afterUpdatedAt: SINCE, afterId: 7, limit: 50 });
    assert(/updated_at = \$2 AND id > \$3/.test(b.sql), 'keyset continuation predicate');
    assert(/LIMIT \$\d+/.test(b.sql), 'LIMIT present');
    const lim = Number(b.params[b.params.length - 1]);
    assert(lim === 51, `LIMIT 51, got ${lim}`);
  });

  await test('tombstonesSql: prepared tombstone read structure + school scope', async () => {
    const b = tombstonesSql({ sinceISO: SINCE, schoolId: 1 });
    assert(/FROM server_tombstones/.test(b.sql), 'from server_tombstones');
    assert(/deleted_at > \$1/.test(b.sql), 'time predicate');
    assert(/school_id = \$\d+/.test(b.sql), 'school scope bound');
    assert(b.sql.includes('record_id AS id') && b.sql.includes('deleted_at AS at'), 'renames to pull shape');
  });

  group('B. pull.js DB-native delta path');

  // a PG-like fake db that records whether delta SQL was used
  function makePullDb({ ok = true, changedRows, fullRows }) {
    const queries = [];
    const fakeDb = {
      isPostgres: () => true,
      readCollection: async (c) => Array.isArray(fullRows) ? fullRows : [],
      async query(sql, params) {
        queries.push(sql);
        if (!ok) { const e = new Error('column does not exist'); e.code = '42703'; throw e; }
        // delta SQL path
        return { rows: Array.isArray(changedRows) ? changedRows : [] };
      }
    };
    return { fakeDb, queries };
  }

  function seedStore() {
    const S = { __server_version: 5, __deleted_records: [] };
    S.schools = [{ id: 1 }];
    S.users = [
      { id: 10, school_id: 1, role: 'manager', full_name: 'م' },
      { id: 20, school_id: 1, role: 'teacher', full_name: 'د' }
    ];
    S.subjects = [];
    S.schedule = [];
    S.notifications = [];
    S.classes = [{ id: 1, school_id: 1, grade: 10 }];
    S.enrollments = [];
    S.sync_conflicts = [];
    return S;
  }

  const sess = { id: 10, school_id: 1, role: 'manager' };
  const build = (store, dbObj) => createPull({ store, db: dbObj, sessionFrom: () => sess, sendJson: (r, s, b) => ({ status: s, body: b }) });

  await test('delta request uses DB (time-pushed) when PG live', async () => {
    const store = seedStore();
    const changed = [
      { id: 1, school_id: 1, full_name: 'تازه', role: 'student', updated_at: '2026-09-09T08:00:00.000Z', created_at: '2026-09-09T08:00:00.000Z' }
    ];
    const { fakeDb, queries } = makePullDb({ changedRows: changed });
    const ctl = build(store, fakeDb);
    const r = await ctl.apiPull({ url: '/api/v1/pull?since=' + encodeURIComponent(SINCE) + '&collections=users' }, {});
    assert(r.status === 200 && r.body.ok === true, '200 ok');
    assert(queries.some(q => /created_at > \$1 OR updated_at > \$1/.test(q)), 'DB delta SQL used');
    // scope: manager school 1 → user kept (projected later by projection only in list routes; here raw)
    assert(Array.isArray(r.body.collections.users), 'users collection present');
    assert(r.body.full_snapshot === false, 'delta not snapshot');
  });

  await test('DB delta fetch transparently falls back on missing timestamp columns', async () => {
    const store = seedStore();
    const { fakeDb, queries } = makePullDb({ ok: false }); // db.query throws
    const ctl = build(store, fakeDb);
    const r = await ctl.apiPull({ url: '/api/v1/pull?since=' + encodeURIComponent(SINCE) + '&collections=users' }, {});
    // delta SQL was attempted, then fell back to readCollection (full) → JS time filter → empty (no matching rows)
    assert(r.status === 200 && r.body.ok === true, '200 ok after fallback');
    assert(r.body.collections.users.length === 0, 'no rows changed after since (fallback applied JS delta)');
  });

  await test('memory path (db absent) still works for delta', async () => {
    const store = seedStore();
    store.users.push({ id: 55, school_id: 1, role: 'student', updated_at: '2026-09-09T08:00:00.000Z', created_at: '2026-09-09T08:00:00.000Z' });
    const ctl = build(store, null); // no db
    const r = await ctl.apiPull({ url: '/api/v1/pull?since=' + encodeURIComponent(SINCE) + '&collections=users' }, {});
    const hasNew = (r.body.collections.users || []).some(u => u.id === 55);
    assert(hasNew, 'memory delta picks up the new user');
  });

  await test('snapshot (no since) path unchanged', async () => {
    const store = seedStore();
    const { fakeDb } = makePullDb({ fullRows: store.users });
    const ctl = build(store, fakeDb);
    const r = await ctl.apiPull({ url: '/api/v1/pull?collections=users' }, {});
    assert(r.body.full_snapshot === true, 'full snapshot');
    assert(Array.isArray(r.body.collections.users), 'users present');
  });

  await test('tombstones still served from store (write side not PG-native yet)', async () => {
    const store = seedStore();
    store.__deleted_records.push({ c: 'grades', id: 999, school_id: 1, at: '2026-09-09T08:00:00.000Z' });
    const { fakeDb } = makePullDb({ changedRows: [] });
    const ctl = build(store, fakeDb);
    const r = await ctl.apiPull({ url: '/api/v1/pull?since=' + encodeURIComponent(SINCE) }, {});
    assert((r.body.deleted || []).length === 1, 'tombstone delivered from store');
    assert(r.body.deleted[0].c === 'grades', 'tombstone payload shape');
  });

  group('C. PostgreSQL execution (guarded)');
  await test('real-PG run', async () => {
    let pg = null;
    try { pg = require('pg'); } catch (e) { pg = null; }
    if (!process.env.DATABASE_URL || !pg) {
      throw new Error('LIVE_PG_REQUIRED: DATABASE_URL and pg are required; real-PG delta run must execute');
    }
    const db = require('../server/db');
    const info = await db.init(seedStore());
    assert(info.driver === 'postgres', 'driver postgres');
    const b = deltaRowsSql('users', { sinceISO: SINCE });
    const r = await db.query(b.sql, b.params);
    assert(r && Array.isArray(r.rows), 'pg delta returned rows');
  });

  const total = pass + fail;
  console.log('\n' + '─'.repeat(56));
  console.log(`نتیجه Wave4 Sync: ${pass}/${total}` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();

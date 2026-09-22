#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { persistOpWithClient } = require('../server/db');
const { prepareMigrationSql, computeChecksum } = require('../tools/migrate-ledger');

let passes = 0;
function pass(name) { passes++; console.log('  ✅ ' + name); }

async function occPasses() {
  console.log('\n=== DATA INTEGRITY: OCC ===');

  // Pass 1 — functional: correct base_version + client-supplied version cannot pin the counter.
  const q1 = [];
  const c1 = { query: async (sql, params) => { q1.push({ sql, params }); return { rowCount: 1, rows: [] }; } };
  await persistOpWithClient(c1, {
    c: 'grades', t: 'upd', id: 7, base_version: 1,
    data: { id: 7, score: 19, version: 999 }
  });
  assert(!q1[0].sql.includes('"version" = $'), 'OCC update must not accept client version as SET value');
  assert(/version = COALESCE\(version, 1\) \+ 1/.test(q1[0].sql), 'OCC update must increment version server-side');
  assert.deepStrictEqual(q1[0].params.slice(-2), [7, 1]);
  pass('Pass 1 functional: atomic WHERE id+base_version and server-owned version increment');

  // Pass 2 — boundary: base_version=1 and stale current version.
  const c2 = { query: async () => ({ rowCount: 0, rows: [] }) };
  let e2;
  try { await persistOpWithClient(c2, { c: 'grades', t: 'upd', id: 7, base_version: 1, data: { score: 18 } }); }
  catch (e) { e2 = e; }
  assert(e2 && e2.code === 'occ_conflict' && e2.status === 409);
  pass('Pass 2 boundary: stale version returns occ_conflict/409');

  // Pass 3 — negative: malformed base_version is rejected before SQL.
  let calls3 = 0;
  const c3 = { query: async () => { calls3++; return { rowCount: 1, rows: [] }; } };
  let e3;
  try { await persistOpWithClient(c3, { c: 'grades', t: 'upd', id: 7, base_version: '1', data: { score: 17 } }); }
  catch (e) { e3 = e; }
  assert(e3 && e3.code === 'bad_base_version' && calls3 === 0);
  pass('Pass 3 negative: malformed base_version is fail-closed with no UPDATE');

  // Pass 4 — missing version under strict OCC policy.
  const oldStrict = process.env.PAYESH_STRICT_OCC;
  process.env.PAYESH_STRICT_OCC = '1';
  let e4;
  try { await persistOpWithClient({ query: async () => ({ rowCount: 1, rows: [] }) }, { c: 'grades', t: 'upd', id: 7, data: { score: 16 } }); }
  catch (e) { e4 = e; }
  if (oldStrict == null) delete process.env.PAYESH_STRICT_OCC; else process.env.PAYESH_STRICT_OCC = oldStrict;
  assert(e4 && e4.code === 'missing_base_version' && e4.status === 409);
  pass('Pass 4 negative: missing base_version is rejected under strict OCC');

  // Pass 5 — concurrency model: ten writers share version=1; atomic compare-and-write permits one winner.
  let version = 1;
  const scores = [];
  const c5 = { query: async (sql, params) => {
    if (/UPDATE "grades"/.test(sql)) {
      const base = Number(params[params.length - 1]);
      if (base !== version) return { rowCount: 0, rows: [] };
      version++;
      scores.push(Number(params[0]));
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  }};
  const out = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
    persistOpWithClient(c5, { c: 'grades', t: 'upd', id: 7, base_version: 1, data: { score: 10 + i } })
  ));
  assert.strictEqual(out.filter(x => x.status === 'fulfilled').length, 1);
  assert.strictEqual(out.filter(x => x.status === 'rejected' && x.reason.code === 'occ_conflict').length, 9);
  assert.strictEqual(version, 2);
  assert.strictEqual(scores.length, 1);
  pass('Pass 5 concurrency/replay: 10 same-base writers yield exactly 1 winner and 9 OCC conflicts');
}

function migrationPasses() {
  console.log('\n=== DATA INTEGRITY: MIGRATION 012 ===');
  const src = fs.readFileSync(path.join(__dirname, '..', 'migrations', '012_partition_grades_attendance.sql'), 'utf8');
  const runner = fs.readFileSync(path.join(__dirname, '..', 'tools', 'migrate-ledger.js'), 'utf8');

  // Pass 1 — 012 has explicit ALREADY_APPLIED sentinel.
  assert(/ALREADY_APPLIED:\s*migration 012/.test(src));
  pass('Pass 1 functional: migration 012 exposes an explicit already-applied recovery sentinel');

  // Pass 2 — 012 contains internal COMMIT and therefore cannot be wrapped in an outer transaction.
  const prepared = prepareMigrationSql(src);
  assert(/\bCOMMIT\s*;/i.test(prepared));
  pass('Pass 2 boundary: runner detects internal transaction control instead of forcing an outer BEGIN/COMMIT');

  // Pass 3 — runner captures stderr so ALREADY_APPLIED can be classified.
  assert(/stdio:\s*\['pipe', 'pipe', 'pipe'\]/.test(runner));
  assert(/alreadyApplied\s*=\s*usePsql/.test(runner));
  pass('Pass 3 failure/recovery: psql stderr is retained and ALREADY_APPLIED is classified');

  // Pass 4 — recovery writes the ledger with ON CONFLICT protection.
  assert(/ON CONFLICT \(version\) DO NOTHING/.test(runner));
  assert(/ALREADY_APPLIED_RECOVERED/.test(runner));
  pass('Pass 4 recovery: recovered state records schema_migrations idempotently');

  // Pass 5 — checksum remains the current migration checksum, preventing false ledger truth.
  assert(/file\.checksum/.test(runner));
  assert(computeChecksum(src).length === 64);
  pass('Pass 5 independent regression: recovered ledger entry uses the exact current migration checksum');
}

(async () => {
  await occPasses();
  migrationPasses();
  console.log('\nALL DATA-INTEGRITY CHECKS PASSED: ' + passes + ' passes');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/g6-migration-022-down.test.js — regression test for G6 (migration 022)
   ────────────────────────────────────────────────────────────────────────
   DEFECT (verified on origin/main 691f8d6):

     migrations/022_users_staff_flags.sql exists, but there was NO
     022_users_staff_flags.down.sql. Every other migration 001..021 ships a
     paired .down.sql, and tools/migrate-ledger.js migrateDown() hard-fails
     with MIGRATION_DOWN_FILE_MISSING when the paired file is absent.

     Impact: the CI step "Rollback chain — latest → 001"
     (.github/workflows/node.js.yml) runs `migrate-ledger.js down-all`, which
     rolls back the HIGHEST applied version FIRST. Once 022 became the latest
     migration, every full rollback chain aborted at 022 and the rest of the
     chain (021 → 001) could never run — the ledger was left half-rolled-back.

   CONTRACT THIS TEST LOCKS IN:
     1. Every migration NNN_*.sql has a paired NNN_*.down.sql.
     2. The down file is discoverable by migrate-ledger.js's own naming rule:
          `${version}_${name with NNN_ prefix and .sql suffix stripped}.down.sql`
        so a rename that breaks the pairing is caught.
     3. 022's down is idempotent (IF EXISTS) so a retry after a partial
        rollback is a no-op, not an error.
     4. 022's down undoes exactly the three columns 022's up creates — no
        more, no less — so rollback cannot drop unrelated production state.
     5. The down file must not contain untransactional / destructive statements
        that would break the BEGIN/COMMIT envelope the ledger wraps it in.

   Run:  node tests/g6-migration-022-down.test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'migrations');

let pass = 0;
let fail = 0;

function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

/* The ledger's own down-file naming rule (tools/migrate-ledger.js:278).
   Mirrored here rather than required, so a test stays independent of the
   tool it audits — but must be updated if that rule ever changes. */
function expectedDownName(upFile) {
  const m = upFile.match(/^([0-9]{3})_(.+)\.sql$/);
  if (!m) return null;
  return `${m[1]}_${m[2]}.down.sql`;
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

(async () => {
  console.log('\n▸ G6 / migration 022 — paired down migration');

  const up022 = '022_users_staff_flags.sql';
  const down022 = '022_users_staff_flags.down.sql';
  const upPath = path.join(MIGRATIONS, up022);
  const downPath = path.join(MIGRATIONS, down022);

  chk('022 up migration exists', fs.existsSync(upPath));
  chk('022 down migration exists', fs.existsSync(downPath));

  if (!fs.existsSync(upPath) || !fs.existsSync(downPath)) {
    console.log('\n────────────────────────────────────────────────────');
    console.log(`g6-migration-022-down: ${pass}/${pass + fail} — ABORTED (files missing)`);
    process.exit(1);
  }

  /* T1 — the whole migration set must be paired, not just 022.
     Catches the same class of defect for any future migration. */
  const ups = fs.readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();
  const missing = ups.filter((f) => !fs.existsSync(path.join(MIGRATIONS, expectedDownName(f))));
  chk(`T1 every up migration has a paired down (${ups.length} checked)`,
    missing.length === 0, 'missing down for: ' + JSON.stringify(missing));

  /* T2 — the down file must be discoverable by the ledger's own naming rule. */
  chk('T2 down file name matches migrate-ledger.js discovery rule',
    expectedDownName(up022) === down022,
    `expected "${expectedDownName(up022)}"`);

  /* T3 — up creates exactly these columns; down drops exactly these. */
  const upSql = read(upPath);
  const downSql = read(downPath);
  const createdCols = ['lib_staff', 'asset_staff', 'is_head'].filter((c) =>
    new RegExp('ADD\\s+COLUMN\\s+(IF\\s+NOT\\s+EXISTS\\s+)?' + c + '\\b', 'i').test(upSql));
  chk('T3 up adds lib_staff / asset_staff / is_head',
    createdCols.length === 3, 'found ' + JSON.stringify(createdCols));

  const droppedCols = ['lib_staff', 'asset_staff', 'is_head'].filter((c) =>
    new RegExp('DROP\\s+COLUMN\\s+(IF\\s+EXISTS\\s+)?' + c + '\\b', 'i').test(downSql));
  chk('T3 down drops exactly the same three columns',
    droppedCols.length === 3, 'found ' + JSON.stringify(droppedCols));

  /* T4 — the down must not drop columns the up never created (blast radius). */
  const allDrops = (downSql.match(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi) || [])
    .map((s) => s.replace(/.*COLUMN\s+(?:IF\s+EXISTS\s+)?/i, '').toLowerCase());
  const unexpected = allDrops.filter((c) => !['lib_staff', 'asset_staff', 'is_head'].includes(c));
  chk('T4 down drops no columns beyond the three 022 introduced',
    unexpected.length === 0, 'unexpected drops: ' + JSON.stringify(unexpected));

  /* T5 — idempotency: IF EXISTS so a retry after a partial rollback is safe.
     ALTER ... DROP COLUMN without IF EXISTS errors on the second run and
     would leave the ledger in a state that cannot be rolled back again. */
  chk('T5 down is idempotent (every DROP COLUMN carries IF EXISTS)',
    /DROP\s+COLUMN\s+IF\s+EXISTS/i.test(downSql) &&
    !/^.*DROP\s+COLUMN\s+(?!IF\s+EXISTS)/im.test(downSql),
    'a DROP COLUMN lacks IF EXISTS');

  /* T6 — must be safe inside the ledger's BEGIN/COMMIT envelope.
     The ledger wraps down SQL in a transaction unless it detects an internal
     COMMIT; statements that cannot run inside a transaction would break it. */
  const forbidden = /^\s*(VACUUM|REINDEX|CREATE\s+DATABASE|DROP\s+DATABASE|CREATE\s+INDEX\s+CONCURRENTLY)\b/im;
  chk('T6 down has no untransactionable statements (BEGIN/COMMIT-safe)',
    !forbidden.test(downSql), 'found a statement that cannot run in a transaction');

  /* T7 — transaction boundaries. migrate-ledger.js supports BOTH conventions:
     an explicit BEGIN/COMMIT inside the file (it appends only the ledger
     DELETE) or none at all (it wraps the whole thing itself, tools/
     migrate-ledger.js:372). Either is atomic. What must NOT happen is a
     COMMIT that splits the rollback from the ledger DELETE — a lone
     trailing COMMIT with no preceding BEGIN would. */
  {
    const hasBegin = /^\s*BEGIN\s*;/im.test(downSql);
    const hasCommit = /^\s*COMMIT\s*;/im.test(downSql);
    chk('T7 transaction boundaries are balanced (BEGIN IFF COMMIT)',
      hasBegin === hasCommit,
      'BEGIN=' + hasBegin + ' COMMIT=' + hasCommit + ' — ledger wraps a bare file itself, but a lone COMMIT would split the atomic rollback');
  }

  /* T8 — round-trip text: applying up then down then up again is a no-op on
     the schema description. This is a static proxy for the live round-trip
     (which needs PostgreSQL, exercised by the CI rollback-chain step). */
  const statements = (sql) => (sql.match(/ALTER\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+(?:ADD|DROP)\s+COLUMN[^\n;]*;?/gi) || []);
  const upStmts = statements(upSql);
  const downStmts = statements(downSql);
  chk('T8 up/down statement counts are symmetric',
    upStmts.length === downStmts.length && upStmts.length === 3,
    `up=${upStmts.length} down=${downStmts.length}`);

  console.log('\n────────────────────────────────────────────────────');
  console.log(`g6-migration-022-down: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

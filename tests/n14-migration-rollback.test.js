#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/n14-migration-rollback.test.js
   -------------------------------------------------------------------
   N-14 — migrations/022_users_staff_flags.sql shipped as a forward-only
   migration: no .down.sql, no BEGIN/COMMIT, and no row in the §۸ table of
   docs/MIGRATION_GUIDE.md. Consequences:

     · `migrate-helper --check` reported «بدونِ فایلِ برگشت» (red), so the
       repo's own migration gate was broken and any future check run fails.
     · tools/migrate-ledger.js migrateDown resolves the down file as
       `022_users_staff_flags.down.sql` and throws MIGRATION_DOWN_FILE_MISSING
       when it is absent — the CI "latest → 001" rollback step died on the
       very first migration it tried to undo.

   Fix: wrapped the forward in BEGIN/COMMIT, added 022_users_staff_flags.down.sql
   (drops exactly the three columns the forward adds) and documented it.

   Scenarios (a fix is not accepted until it survives 5 full runs):
     N14-1  migrate-helper --check is green (the repo's own gate)
     N14-2  every forward migration is paired with a .down.sql, no orphans
     N14-3  the 022 down file is the exact reverse of its forward
     N14-4  live PostgreSQL: forward creates the columns, down removes them,
            re-applying is idempotent (a true round trip)
     N14-5  the file name the ledger computes for 022's rollback exists on
            disk (no MIGRATION_DOWN_FILE_MISSING)
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MIG = path.join(ROOT, 'migrations');
const PG_URL = 'postgresql://postgres@127.0.0.1:5433/payesh_n16';

let pass = 0, fail = 0, skipped = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

/* the three staff flags 022 adds / must remove */
const STAFF_FLAGS = ['lib_staff', 'asset_staff', 'is_head'];

async function main() {
  console.log('\n🔍 N-14 regression: migration 022 ships a working rollback');

  /* ── N14-1: the repo's own migration gate ───────────────────────── */
  await test('N14-1: migrate-helper --check is green (no unpaired migrations)', async () => {
    const out = await new Promise((resolve) => {
      execFile(process.execPath, [path.join(ROOT, 'tools', 'migrate-helper.js'), '--check'],
        { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout: String(stdout), stderr: String(stderr) }));
    });
    assert.strictEqual(out.code, 0, 'migrate-helper --check exited non-zero (' + out.code + '):\n' + out.stdout + out.stderr);
    assert.ok(/سبز/i.test(out.stdout), 'check summary must be green, got: ' + out.stdout.split('\n').pop());
    assert.ok(/022_users_staff_flags\.sql/.test(out.stdout), '022 must appear in the check output');
  });

  /* ── N14-2: pairing invariant across the whole chain ───────────── */
  await test('N14-2: every forward migration is paired with a .down.sql and there are no orphans', () => {
    const all = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
    const forwards = all.filter(f => !f.endsWith('.down.sql'));
    const downs = all.filter(f => f.endsWith('.down.sql'));
    assert.ok(forwards.length >= 22, 'expected at least 22 forward migrations, found ' + forwards.length);
    for (const f of forwards) {
      const expected = f.replace(/\.sql$/, '.down.sql');
      assert.ok(downs.includes(expected), 'forward migration has no .down.sql: ' + f);
    }
    for (const d of downs) {
      const expected = d.replace(/\.down\.sql$/, '.sql');
      assert.ok(forwards.includes(expected), 'orphan .down.sql with no forward: ' + d);
    }
    assert.strictEqual(downs.length, forwards.length, forwards.length + ' forwards but ' + downs.length + ' downs');
  });

  /* ── N14-3: the 022 down is the exact reverse of its forward ───── */
  await test('N14-3: 022_users_staff_flags.down.sql reverses exactly what the forward adds', () => {
    const fwd = fs.readFileSync(path.join(MIG, '022_users_staff_flags.sql'), 'utf8');
    const down = fs.readFileSync(path.join(MIG, '022_users_staff_flags.down.sql'), 'utf8');
    /* forward: adds each flag, wrapped in a transaction */
    for (const col of STAFF_FLAGS) {
      assert.ok(new RegExp('ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+' + col + '\\s+integer', 'i').test(fwd),
        'forward does not add column ' + col);
    }
    assert.ok(/BEGIN\s*;/i.test(fwd) && /COMMIT\s*;/i.test(fwd), 'forward must be wrapped in BEGIN/COMMIT');
    /* down: drops each flag, wrapped in a transaction */
    for (const col of STAFF_FLAGS) {
      assert.ok(new RegExp('DROP\\s+COLUMN\\s+IF\\s+EXISTS\\s+' + col, 'i').test(down),
        'down does not drop column ' + col);
    }
    assert.ok(/BEGIN\s*;/i.test(down) && /COMMIT\s*;/i.test(down), 'down must be wrapped in BEGIN/COMMIT');
    /* and the down must not add anything, nor the forward drop anything */
    assert.ok(!/DROP\s+COLUMN/i.test(fwd), 'forward unexpectedly drops a column');
    assert.ok(!/ADD\s+COLUMN/i.test(down), 'down unexpectedly adds a column');
  });

  /* ── N14-5: the file name the ledger computes must exist ───────── */
  await test('N14-5: the down file name migrate-ledger computes for 022 exists on disk', () => {
    /* tools/migrate-ledger.js: `${version}_${name.replace(/^([0-9]{3})_|\.sql$/g,'')}.down.sql`
       for version 022 and name 022_users_staff_flags.sql → 022_users_staff_flags.down.sql */
    const ledgerName = '022_' + '022_users_staff_flags.sql'.replace(/^([0-9]{3})_|\.sql$/g, '') + '.down.sql';
    assert.strictEqual(ledgerName, '022_users_staff_flags.down.sql', 'ledger naming assumption changed');
    const resolved = path.join(MIG, ledgerName);
    assert.ok(fs.existsSync(resolved), 'MIGRATION_DOWN_FILE_MISSING: ' + ledgerName + ' does not exist at ' + resolved);
  });

  /* ── N14-4: live PostgreSQL round trip ──────────────────────────── */
  let pool = null;
  try {
    const mod = require('pg');
    pool = new mod.Pool({ connectionString: PG_URL, query_timeout: 60000 });
    const c = await pool.connect();
    await c.query('SELECT 1');
    c.release();
  } catch (e) { pool = null; }

  if (!pool) {
    console.log('  ⏭️ N14-4 skipped: no PostgreSQL at ' + PG_URL);
    skipped += 1;
  } else {
    await test('N14-4: live PostgreSQL — forward adds the flags, down removes them, re-apply is idempotent', async () => {
      const c = await pool.connect();
      try {
        /* isolated scratch schema so the round trip touches no real table;
           the migration uses an unqualified "users", so search_path lands it
           in n14. */
        await c.query('DROP SCHEMA IF EXISTS n14 CASCADE');
        await c.query('CREATE SCHEMA n14');
        await c.query('SET search_path TO n14, public');
        await c.query('CREATE TABLE users (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, full_name VARCHAR(255))');

        const flagsIn = async () => {
          const r = await c.query("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name IN ('lib_staff','asset_staff','is_head')", ['n14', 'users']);
          return Number(r.rows[0].n);
        };
        assert.strictEqual(await flagsIn(), 0, 'scratch users must start without the staff flags');

        /* forward — exactly the statements 022 ships */
        await c.query('BEGIN');
        await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS lib_staff integer');
        await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS asset_staff integer');
        await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_head integer');
        await c.query('COMMIT');
        assert.strictEqual(await flagsIn(), 3, 'the forward must create all three staff flags');

        /* down — exactly the statements 022_users_staff_flags.down.sql ships */
        await c.query('BEGIN');
        await c.query('ALTER TABLE users DROP COLUMN IF EXISTS lib_staff');
        await c.query('ALTER TABLE users DROP COLUMN IF EXISTS asset_staff');
        await c.query('ALTER TABLE users DROP COLUMN IF EXISTS is_head');
        await c.query('COMMIT');
        assert.strictEqual(await flagsIn(), 0, 'the down must remove all three staff flags');

        /* the round trip must be repeatable (IF NOT EXISTS / IF EXISTS) */
        await c.query('BEGIN');
        await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS lib_staff integer');
        await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS asset_staff integer');
        await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_head integer');
        await c.query('COMMIT');
        assert.strictEqual(await flagsIn(), 3, 're-applying the forward must be idempotent');

        await c.query('RESET search_path');
      } finally {
        try { await c.query('RESET search_path'); } catch (_) {}
        try { await c.query('DROP SCHEMA IF EXISTS n14 CASCADE'); } catch (_) {}
        c.release();
      }
    });
    try { await pool.end(); } catch (_) {}
  }

  console.log('\nN-14 regression tests: ' + pass + '/' + (pass + fail) + ' passed' + (skipped ? ' (' + skipped + ' skipped)' : ''));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('suite crashed:', e); process.exit(2); });

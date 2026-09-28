#!/usr/bin/env node
/**
 * tools/migrate-ledger.js — PostgreSQL Authoritative Migration Ledger (C-6 / R21)
 *
 * Requirements:
 * - Table: schema_migrations (version PRIMARY KEY, name, applied_at, checksum)
 * - Atomic execution: SQL + ledger record in a single transaction (or coordinated transaction)
 * - Idempotency: Already-applied migrations are skipped; checksum verified
 * - Out-of-order / skipped migration detection
 * - Failed migration rolls back cleanly and is NOT recorded in ledger
 * - Replaces raw shell psql loops as the authoritative migration runner
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'migrations');

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function stripLeadingBegin(sql) {
  let i = 0;
  while (i < sql.length) {
    const start = i;
    while (i < sql.length && /[\t\n\r\f\v ]/.test(sql[i])) i++;
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i + 2);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return sql;
      i = end + 2;
      continue;
    }
    if (i === start) break;
  }
  const match = /^BEGIN[\t\n\r\f\v ]*;/i.exec(sql.slice(i));
  return match ? sql.slice(0, i) + sql.slice(i + match[0].length) : sql;
}

function stripTrailingCommit(sql) {
  let end = sql.length;
  for (;;) {
    const before = end;
    while (end > 0 && /[\t\n\r\f\v ]/.test(sql[end - 1])) end--;
    if (end >= 2 && sql.slice(end - 2, end) === '*/') {
      const start = sql.lastIndexOf('/*', end - 2);
      if (start < 0) return sql;
      end = start;
      continue;
    }
    const lineStart = sql.lastIndexOf('\\n', end - 1) + 1;
    if (sql.slice(lineStart, end).startsWith('--')) {
      end = lineStart;
      continue;
    }
    if (end === before) break;
  }
  const prefix = sql.slice(0, end);
  const match = /COMMIT[\\t\\n\\r\\f\\v ]*;$/i.exec(prefix);
  return match ? prefix.slice(0, match.index) + sql.slice(end) : sql;
}

function prepareMigrationSql(sql) {
  return stripTrailingCommit(stripLeadingBegin(sql));
}

/* 🔴 مرزِ ثابتِ DDL: این دو رشتهٔ ثابتِ ماژولی‌اند — هیچ ورودیِ بیرونی
   در آن‌ها جای نمی‌گیرد. `CREATE TABLE` و SELECTِ ثابت نمی‌توانند با
   پارامترِ $N نوشته شوند (DDL پارامتری نمی‌شود)، پس ثابتِ سراسریِ
   یک‌تکه، بدونِ الحاق، مرزِ امنِ همین الگوست. */
const LEDGER_DDL = 'CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), checksum VARCHAR(64) NOT NULL);';

const LEDGER_SELECT = 'SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC;';

async function ensureLedgerTable(client) {
  await client.query(LEDGER_DDL);
}

async function getAppliedMigrations(client) {
  await ensureLedgerTable(client);
  const res = await client.query(LEDGER_SELECT);
  return res.rows;
}

function discoverMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found at ${MIGRATIONS_DIR}`);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();

  const seenVersions = new Map();

  return files.map(file => {
    const match = file.match(/^([0-9]{3})_([A-Za-z0-9_.-]+)\.sql$/);
    if (!match) {
      throw new Error(`Invalid migration file format: ${file}. Expected NNN_name.sql`);
    }

    const version = match[1];
    if (seenVersions.has(version)) {
      throw new Error(
        `DUPLICATE_MIGRATION_VERSION: version ${version} is used by ${seenVersions.get(version)} and ${file}`
      );
    }
    seenVersions.set(version, file);

    /* 🔴 مرزِ مسیر: نامِ فایل باید دقیقاً داخلِ MIGRATIONS_DIR حل شود.
       file یک نامِ خالی از readdirSync است که با Whitelist بالایی مچ شده
       (بدونِ جداکننده، بدونِ «..»)؛ ترکیبِ مستقیم، انحرافِ مسیر را غیرممکن
       می‌کند. */
    const fullPath = MIGRATIONS_DIR + path.sep + file;
    const content = fs.readFileSync(fullPath, 'utf8');
    const checksum = computeChecksum(content);
    return {
      version,
      name: file,
      path: fullPath,
      content,
      checksum
    };
  });
}

function canRunPsql() {
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

/* 🔴 مرزِ ورودی: اتصالِ psql از طریقِ متغیرهایِ محیطی PG* (نه URL در خطِ
   فرمان) — این‌گونه argvِ execFileSync کاملاً ثابت می‌ماند و تزریقِ گزینهٔ
   دستور غیرممکن می‌شود (همان الگویِ tests/partitioning.js). URL با new URL
   تجزیه می‌شود تا هیچ بخشِ آن هرگز در argv قرار نگیرد. */
function pgEnvFromUrl(url) {
  const parsed = new URL(String(url).replace(/^postgres(ql)?:/, 'http:'));
  const env = {};
  if (parsed.hostname) env.PGHOST = parsed.hostname;
  if (parsed.port) env.PGPORT = parsed.port;
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  const database = (parsed.pathname || '').replace(/^\//, '');
  if (database) env.PGDATABASE = decodeURIComponent(database);
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

/* 🔴 مرزِ ورودیِ شناسهٔ مهاجرت: version و name یا از discoverMigrationFiles
   می‌آیند (که با whitelistِ ^[0-9]{3}_... اجبار شده‌اند) یا از ledger خوانده
   می‌شوند. چون این مقادیر در SQLِ پوستهٔ psql جای می‌گیرند و psql از stdin
   خوانده می‌شود (نمی‌توان $N را به stdin فرستاد)، اعتبارسنجیِ صریح،
   همان مرزِ امن است. */
function assertMigrationIdentity(version, name) {
  if (!/^[0-9]{3}$/.test(String(version))) {
    throw new Error('refusing to interpolate unsafe migration version: ' + version);
  }
  if (!/^[0-9]{3}_[A-Za-z0-9_.-]+\.sql$/.test(String(name))) {
    throw new Error('refusing to interpolate unsafe migration name: ' + name);
  }
}

/**
 * Executes pending migrations using atomic transactions and ledger verification.
 */
async function migrateUp(client, options = {}) {
  await ensureLedgerTable(client);
  const applied = await getAppliedMigrations(client);
  const appliedMap = new Map(applied.map(m => [m.version, m]));

  const allFiles = discoverMigrationFiles();
  const results = [];
  const pgUrl = options.pgUrl || process.env.DATABASE_URL || process.env.PGURL;
  const usePsql = !!(pgUrl && canRunPsql());

  let firstUnappliedIndex = -1;
  let lastAppliedIndex = -1;
  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    if (appliedMap.has(file.version)) {
      if (firstUnappliedIndex !== -1) {
        const skippedFile = allFiles[firstUnappliedIndex];
        const err = new Error(
          `MIGRATION_OUT_OF_ORDER: Migration ${file.name} is recorded as applied, but preceding migration ${skippedFile.name} was not applied`
        );
        err.code = 'MIGRATION_OUT_OF_ORDER';
        err.expectedVersion = skippedFile.version;
        err.actualVersion = file.version;
        throw err;
      }
      const recorded = appliedMap.get(file.version);
      if (recorded.checksum !== file.checksum) {
        const err = new Error(
          `MIGRATION_CHECKSUM_MISMATCH: Migration ${file.name} (version ${file.version}) has checksum ${file.checksum} but ledger recorded ${recorded.checksum}`
        );
        err.code = 'MIGRATION_CHECKSUM_MISMATCH';
        err.version = file.version;
        throw err;
      }
      lastAppliedIndex = i;
    } else {
      if (firstUnappliedIndex === -1) {
        firstUnappliedIndex = i;
      }
    }
  }

  const startIndex = firstUnappliedIndex === -1 ? allFiles.length : firstUnappliedIndex;
  for (let i = startIndex; i < allFiles.length; i++) {
    const file = allFiles[i];

    // Execute migration with atomic ledger entry
    try {
      if (usePsql) {
        const cleanedContent = prepareMigrationSql(file.content);
        /* 🔴 مقادیرِ جای‌گرفته ثابتِ موردِ اعتمادِ مهاجرت‌اند (نسخه و نامِ
           فایل، هر دو با whitelist بالا): psql از stdin می‌خواند و $N به
           stdin قابل فرستادن نیست، پس اعتبارسنجیِ صریح مرزِ امن است. */
        assertMigrationIdentity(file.version, file.name);
        const ledgerSql = `\nINSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES ('${file.version.replace(/'/g, "''")}', '${file.name.replace(/'/g, "''")}', NOW(), '${file.checksum.replace(/'/g, "''")}');\n`;
        const hasInternalTx = /\bCOMMIT\s*;/i.test(cleanedContent);
        const scriptSql = hasInternalTx
          ? `${cleanedContent}\n${ledgerSql}`
          : `BEGIN;\n${cleanedContent}\n${ledgerSql}COMMIT;\n`;
        /* 🔴 مرزِ ورودی: URL به‌عنوانِ آخرین آرگومانِ موقعیتی به psql می‌رود؛
           هر رشتهٔ آغازشونده با «-» به‌جای URL، گزینهٔ دستور تفسیر می‌شد.
           اعتبارسنجیِ صریح، بلافاصله پیش از فراخوانیِ execFileSync، مرزِ
           امن است و چون درونِ try است، مسیرِ خطایِ گذشته را حفظ می‌کند. */
        const safeUrl = pgUrl;
        if (!/^postgres(ql)?:\/\//.test(String(safeUrl))) {
          throw new Error('refusing to pass non-postgres URL to psql');
        }
        const childEnv = Object.assign({}, process.env, pgEnvFromUrl(safeUrl));
        execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], { input: scriptSql, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
      } else {
        await client.query('BEGIN');
        await client.query(prepareMigrationSql(file.content));
        await client.query(`
          INSERT INTO schema_migrations (version, name, applied_at, checksum)
          VALUES ($1, $2, NOW(), $3);
        `, [file.version, file.name, file.checksum]);
        await client.query('COMMIT');
      }

      lastAppliedIndex = i;
      appliedMap.set(file.version, { version: file.version, name: file.name, checksum: file.checksum });
      results.push({ version: file.version, name: file.name, status: 'APPLIED', checksum: file.checksum });
    } catch (err) {
      /* Recovery for the known 012 crash window: its DDL/swap can commit
         before the ledger INSERT is attempted. A rerun then emits
         ALREADY_APPLIED; record the already-completed migration instead of
         re-executing destructive swap logic. */
      const stderr = String(err && err.stderr ? err.stderr : '');
      const errText = String(err && err.message ? err.message : err);
      const alreadyApplied = usePsql && /ALREADY_APPLIED:/.test(stderr + '\\n' + errText);
      if (alreadyApplied) {
        try {
          assertMigrationIdentity(file.version, file.name);
          const recoverySql = `BEGIN;
INSERT INTO schema_migrations (version, name, applied_at, checksum)
VALUES ('${file.version.replace(/'/g, "''")}', '${file.name.replace(/'/g, "''")}', NOW(), '${file.checksum.replace(/'/g, "''")}')
ON CONFLICT (version) DO NOTHING;
COMMIT;
`;
          /* 🔴 مرزِ ورودی: مانندِ migrateUp — اعتبارسنجیِ URL بلافاصله پیش از
             فراخوانی، تا هیچ رشتهٔ آغازشونده با «-» به‌عنوانِ گزینه نرود. */
          const safeUrl = pgUrl;
          if (!/^postgres(ql)?:\/\//.test(String(safeUrl))) {
            throw new Error('refusing to pass non-postgres URL to psql');
          }
          const childEnv = Object.assign({}, process.env, pgEnvFromUrl(safeUrl));
          execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], {
            input: recoverySql, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8'
          });
          lastAppliedIndex = i;
          appliedMap.set(file.version, { version: file.version, name: file.name, checksum: file.checksum });
          results.push({ version: file.version, name: file.name, status: 'ALREADY_APPLIED_RECOVERED', checksum: file.checksum });
          continue;
        } catch (recoveryErr) {
          const failErr = new Error(`MIGRATION_RECOVERY_FAILED: Could not record already-applied migration ${file.name}: ${recoveryErr.message}`);
          failErr.code = 'MIGRATION_RECOVERY_FAILED';
          failErr.cause = recoveryErr;
          failErr.migration = file.name;
          throw failErr;
        }
      }
      if (!usePsql) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      const failErr = new Error(`MIGRATION_EXECUTION_FAILED: Error in migration ${file.name}: ${errText}`);
      failErr.code = 'MIGRATION_EXECUTION_FAILED';
      failErr.cause = err;
      failErr.migration = file.name;
      throw failErr;
    }
  }

  return results;
}

/**
 * Rolls back the latest applied migration.
 */
async function migrateDown(client, targetVersion = null, options = {}) {
  await ensureLedgerTable(client);
  const applied = await getAppliedMigrations(client);
  if (applied.length === 0) return null;

  const latest = applied[applied.length - 1];
  if (targetVersion && latest.version !== targetVersion) {
    const err = new Error(
      `MIGRATION_ROLLBACK_ORDER_VIOLATION: Requested rollback of version ${targetVersion}, but latest applied version is ${latest.version}`
    );
    err.code = 'MIGRATION_ROLLBACK_ORDER_VIOLATION';
    throw err;
  }

  /* 🔴 مرزِ ورودیِ شناسهٔ مهاجرت: version و name از ledger می‌آیند، پس پیش از
     ساخته‌شدنِ هر مسیر یا SQL، اعتبارسنجیِ صریحِ آن‌ها مرزِ امن است. */
  assertMigrationIdentity(latest.version, latest.name);

  /* 🔴 مرزِ مسیر: نامِ فایلِ down از ledger ساخته می‌شود؛ اجزای نام تنها از
     گروه‌هایِ whitelistِ /^([0-9]{3})_([A-Za-z0-9_.-]+)\.sql$/ استخراج می‌شوند
     و ردِ جداکننده/«..» در ادامه، لایهٔ دومِ مرز است. */
  const nameMatch = /^([0-9]{3})_([A-Za-z0-9_.-]+)\.sql$/.exec(String(latest.name));
  if (!nameMatch) {
    const err = new Error(`MIGRATION_DOWN_PATH_ESCAPE: refusing unsafe migration name from ledger: ${latest.name}`);
    err.code = 'MIGRATION_DOWN_PATH_ESCAPE';
    throw err;
  }
  const downFileName = `${nameMatch[1]}_${nameMatch[2]}.down.sql`;
  /* 🔴 مرزِ مسیر: نامِ فایلِ down فقط از گروه‌هایِ whitelistِ بالا ساخته
     می‌شود و هیچ جداکننده یا «..» نمی‌تواند داشته باشد؛ ترکیبِ مستقیم،
     انحراف از MIGRATIONS_DIR را غیرممکن می‌کند (همان الگوی
     discoverMigrationFiles در همین فایل). */
  if (downFileName.indexOf(path.sep) !== -1 || downFileName.indexOf('/') !== -1 || downFileName.indexOf('..') !== -1) {
    const err = new Error(`MIGRATION_DOWN_PATH_ESCAPE: refusing unsafe down file name: ${downFileName}`);
    err.code = 'MIGRATION_DOWN_PATH_ESCAPE';
    throw err;
  }
  const downPath = MIGRATIONS_DIR + path.sep + downFileName;
  if (!fs.existsSync(downPath)) {
    const err = new Error(`MIGRATION_DOWN_FILE_MISSING: Down file ${downFileName} does not exist`);
    err.code = 'MIGRATION_DOWN_FILE_MISSING';
    throw err;
  }

  const downContent = fs.readFileSync(downPath, 'utf8');
  const pgUrl = options.pgUrl || process.env.DATABASE_URL || process.env.PGURL;
  const usePsql = !!(pgUrl && canRunPsql());

  try {
    if (usePsql) {
      const cleanedDown = prepareMigrationSql(downContent);
      /* 🔴 مانندِ migrateUp: نسخه/نام از ledger، با اعتبارسنجیِ صریح. */
      assertMigrationIdentity(latest.version, latest.name);
      const ledgerSql = `\nDELETE FROM schema_migrations WHERE version = '${latest.version.replace(/'/g, "''")}';\n`;
      const hasInternalTx = /\bCOMMIT\s*;/i.test(cleanedDown);
      const scriptSql = hasInternalTx
        ? `${cleanedDown}\n${ledgerSql}`
        : `BEGIN;\n${cleanedDown}\n${ledgerSql}COMMIT;\n`;
      /* 🔴 مرزِ ورودی: مانندِ migrateUp — URL آخرین آرگومانِ موقعیتی است؛
         اعتبارسنجیِ صریح، بلافاصله پیش از فراخوانیِ execFileSync. */
      const safeUrl = pgUrl;
      if (!/^postgres(ql)?:\/\//.test(String(safeUrl))) {
        throw new Error('refusing to pass non-postgres URL to psql');
      }
      const childEnv = Object.assign({}, process.env, pgEnvFromUrl(safeUrl));
      execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], { input: scriptSql, env: childEnv, stdio: ['pipe', 'inherit', 'inherit'] });
    } else {
      await client.query('BEGIN');
      await client.query(prepareMigrationSql(downContent));
      await client.query('DELETE FROM schema_migrations WHERE version = $1;', [latest.version]);
      await client.query('COMMIT');
    }

    return { version: latest.version, name: downFileName, status: 'ROLLED_BACK' };
  } catch (err) {
    if (!usePsql) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    const failErr = new Error(`MIGRATION_ROLLBACK_FAILED: Error rolling back ${downFileName}: ${err.message}`);
    failErr.code = 'MIGRATION_ROLLBACK_FAILED';
    failErr.cause = err;
    throw failErr;
  }
}

/**
 * Rolls back all applied migrations in reverse order until the ledger is empty.
 */
async function migrateAllDown(client, options = {}) {
  await ensureLedgerTable(client);
  const results = [];
  for (;;) {
    const rolled = await migrateDown(client, null, options);
    if (!rolled) break;
    results.push(rolled);
  }
  return results;
}

async function getStatus(client) {
  await ensureLedgerTable(client);
  const applied = await getAppliedMigrations(client);
  const allFiles = discoverMigrationFiles();
  const appliedMap = new Map(applied.map(m => [m.version, m]));

  return allFiles.map(f => ({
    version: f.version,
    name: f.name,
    applied: appliedMap.has(f.version),
    applied_at: appliedMap.has(f.version) ? appliedMap.get(f.version).applied_at : null,
    checksum: f.checksum
  }));
}

if (require.main === module) {
  const { Client } = require('pg');
  const pgUrl = process.env.DATABASE_URL || process.env.PGURL;
  if (!pgUrl) {
    console.error('FATAL: DATABASE_URL or PGURL environment variable is required');
    process.exit(1);
  }
  const client = new Client({ connectionString: pgUrl });
  const command = process.argv[2] || 'up';

  (async () => {
    await client.connect();
    try {
      if (command === 'up') {
        const res = await migrateUp(client, { pgUrl });
        console.log(`[LEDGER] Applied ${res.length} migration(s).`);
      } else if (command === 'down') {
        const res = await migrateDown(client, process.argv[3] || null, { pgUrl });
        console.log(`[LEDGER] Rolled back migration:`, res);
      } else if (command === 'down-all') {
        const res = await migrateAllDown(client, { pgUrl });
        console.log(`[LEDGER] Rolled back total ${res.length} migration(s).`);
      } else if (command === 'status') {
        const st = await getStatus(client);
        console.table(st);
      } else {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
    } finally {
      await client.end();
    }
  })().catch(err => {
    console.error(`[LEDGER FATAL] Migration failed:`, err);
    process.exit(1);
  });
}

module.exports = {
  computeChecksum,
  prepareMigrationSql,
  ensureLedgerTable,
  getAppliedMigrations,
  discoverMigrationFiles,
  migrateUp,
  migrateDown,
  migrateAllDown,
  getStatus
};

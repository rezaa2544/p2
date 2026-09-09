#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let ok = 0, total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    ok++;
    console.log('  ✅ ' + name);
  } catch (err) {
    console.error('  ❌ ' + name + ': ' + err.message);
    process.exitCode = 1;
  }
}
function has(text, needle) {
  if (!text.includes(needle)) throw new Error('missing: ' + needle);
}
function match(text, re, label) {
  if (!re.test(text)) throw new Error('missing pattern: ' + (label || re));
}

async function main(){
console.log('\n▸ PgBouncer connection pooling contract');

const docPath = path.join(ROOT, 'docs', 'PGBOUNCER_SETUP.md');
const dbPath = path.join(ROOT, 'server', 'db.js');
const roadmapPath = path.join(ROOT, 'docs', 'ROADMAP.md');

await test('سند PGBOUNCER_SETUP.md وجود دارد', () => {
  if (!fs.existsSync(docPath)) throw new Error('docs/PGBOUNCER_SETUP.md not found');
});

const doc = fs.readFileSync(docPath, 'utf8');
const dbSrc = fs.readFileSync(dbPath, 'utf8');
const roadmap = fs.readFileSync(roadmapPath, 'utf8');

await test('معماری Node.js → PgBouncer → PostgreSQL مستند شده است', () => {
  has(doc, 'Application Nodes (Node.js) → PgBouncer (Pooling) → PostgreSQL Primary');
});

await test('نمونه pgbouncer.ini حالت transaction را قفل می‌کند', () => {
  has(doc, '[databases]');
  has(doc, '[pgbouncer]');
  has(doc, 'pool_mode = transaction');
});

await test('سقف‌ها و timeoutهای خواسته‌شده در pgbouncer.ini آمده‌اند', () => {
  [
    'default_pool_size = 20',
    'max_client_conn = 1000',
    'min_pool_size = 5',
    'reserve_pool_size = 10',
    'reserve_pool_timeout = 3',
    'server_idle_timeout = 600',
    'server_lifetime = 3600',
    'server_connect_timeout = 5',
    'listen_port = 6432'
  ].forEach(x => has(doc, x));
});

await test('احراز هویت و فایل userlist بدون secret واقعی مستند شده است', () => {
  has(doc, 'auth_type = md5');
  has(doc, 'auth_file = /etc/pgbouncer/userlist.txt');
  has(doc, 'chmod 0600');
  if (/ghp_[A-Za-z0-9_]+/.test(doc)) throw new Error('GitHub token leaked into doc');
});

await test('DATABASE_URL تولید به PgBouncer روی پورت 6432 اشاره می‌کند', () => {
  match(doc, /DATABASE_URL=postgresql:\/\/[^\s@]+:\*\*\*@(?:pgbouncer|127\.0\.0\.1):6432\/payesh/, 'DATABASE_URL :6432');
});

await test('server/db.js همچنان از pg.Pool استفاده می‌کند', () => {
  has(dbSrc, 'new pg.Pool');
  has(dbSrc, 'connectionString: config.connectionString');
});

await test('server/db.js متغیرهای PgBouncer را می‌شناسد', () => {
  has(dbSrc, 'PGBOUNCER');
  has(dbSrc, 'PGBOUNCER_POOL_MODE');
  has(dbSrc, 'PG_IDLE_TIMEOUT_MS');
  has(dbSrc, 'looksLikePgbouncerUrl');
});

await test('تشخیص پورت 6432، PgBouncer را بدون اتصال واقعی فعال می‌کند', () => {
  const old = { DATABASE_URL: process.env.DATABASE_URL, PGBOUNCER: process.env.PGBOUNCER, PGBOUNCER_POOL_MODE: process.env.PGBOUNCER_POOL_MODE, PG_POOL_MIN: process.env.PG_POOL_MIN };
  process.env.DATABASE_URL = 'postgresql://payesh_user:pass@pgbouncer:6432/payesh';
  delete process.env.PGBOUNCER;
  delete process.env.PGBOUNCER_POOL_MODE;
  delete process.env.PG_POOL_MIN;
  delete require.cache[require.resolve('../server/db')];
  const db = require('../server/db');
  const cfg = db.__getConfigForTests();
  if (!cfg.pgbouncer) throw new Error('pgbouncer flag is false');
  if (cfg.poolMode !== 'transaction') throw new Error('default pool mode is not transaction');
  if (cfg.min !== 0) throw new Error('PgBouncer default PG_POOL_MIN must be 0');
  db.close();
  Object.keys(old).forEach(k => {
    if (old[k] === undefined) delete process.env[k];
    else process.env[k] = old[k];
  });
  delete require.cache[require.resolve('../server/db')];
});

await test('PG_POOL_MIN و PGBOUNCER_POOL_MODE صریح، پیش‌فرض‌ها را override می‌کنند', () => {
  const old = { DATABASE_URL: process.env.DATABASE_URL, PGBOUNCER: process.env.PGBOUNCER, PGBOUNCER_POOL_MODE: process.env.PGBOUNCER_POOL_MODE, PG_POOL_MIN: process.env.PG_POOL_MIN };
  process.env.DATABASE_URL = 'postgresql://payesh_user:pass@db.internal:5432/payesh';
  process.env.PGBOUNCER = '1';
  process.env.PGBOUNCER_POOL_MODE = 'transaction';
  process.env.PG_POOL_MIN = '3';
  delete require.cache[require.resolve('../server/db')];
  const db = require('../server/db');
  const cfg = db.__getConfigForTests();
  if (!cfg.pgbouncer) throw new Error('PGBOUNCER=1 not honored');
  if (cfg.poolMode !== 'transaction') throw new Error('pool mode override not honored');
  if (cfg.min !== 3) throw new Error('PG_POOL_MIN override not honored');
  db.close();
  Object.keys(old).forEach(k => {
    if (old[k] === undefined) delete process.env[k];
    else process.env[k] = old[k];
  });
  delete require.cache[require.resolve('../server/db')];
});

await test('healthCheck وضعیت pool و PgBouncer را گزارش می‌کند', async () => {
  process.env.DATABASE_URL = 'postgresql://payesh_user:pass@pgbouncer:6432/payesh';
  delete require.cache[require.resolve('../server/db')];
  const db = require('../server/db');
  db.__getConfigForTests();
  db.__setPoolForTests({
    totalCount: 4,
    idleCount: 2,
    waitingCount: 1,
    query: async () => ({ rows: [{ '?column?': 1 }] }),
    end: async () => {}
  });
  const h = await db.healthCheck();
  if (h.driver !== 'postgres') throw new Error('health driver must be postgres for injected pool');
  if (h.total_count !== 4 || h.idle_count !== 2 || h.waiting_count !== 1) throw new Error('pool counters missing');
  if (h.pgbouncer !== true || h.pool_mode !== 'transaction') throw new Error('PgBouncer metadata missing');
  await db.close();
  delete process.env.DATABASE_URL;
  delete require.cache[require.resolve('../server/db')];
});

await test('ROADMAP وضعیت PgBouncer را کامل نشان می‌دهد', () => {
  has(roadmap, 'PgBouncer Connection Pooling');
  match(roadmap, /PgBouncer Connection Pooling\s*\|\s*✅/, 'PgBouncer ✅ row');
});

}

main().catch(err => { console.error(err); process.exit(1); });

process.on('beforeExit', () => {
  if (ok !== total) {
    console.error(`\npgbouncer-pooling: ${ok}/${total} سبز — خطا دارد ❌`);
    process.exitCode = 1;
  } else {
    console.log(`\npgbouncer-pooling: ${ok}/${total} سبز ✅`);
  }
});

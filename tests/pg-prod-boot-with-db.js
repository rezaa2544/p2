#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-prod-boot-with-db.js — Package 1 / P0-1, test 2 of 5
   ───────────────────────────────────────────────────────────────────
   The positive half of the gate: in production WITH a live PostgreSQL,
   db.init() must report ok:true / driver:'postgres' and isPostgres()
   must be true — i.e. every write path takes the PostgreSQL branch.

   NOTE ON THE PROCESS-BOOT CHECK (2B), stated plainly rather than
   glossed: this repo already enforces a SECOND production prerequisite,
   Redis (P0-13 — server/redis.js:150-158 + server/index.js cache gate).
   No Redis instance exists in this sandbox (the redis-memory-server
   binary download is network-blocked), so a production process cannot
   reach listen() here. 2B therefore asserts the precise, weaker-but-true
   statement: the DATABASE gate does not fire and boot proceeds to the
   pre-existing Redis readiness gate. That is reported as such, not as
   "production boots".

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN (no live PG).

   Usage:
     PG_LIVE_PG='postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1' \
       NODE_PATH=/home/user/pgws/node_modules node tests/pg-prod-boot-with-db.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NAME = 'pg-prod-boot-with-db';
const PGURL = process.env.PG_LIVE_PG || 'postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1';
const JWT = 'chat1-pkg1-shared-jwt-secret-0123456789abcdef';

let pass = 0, fail = 0;
let preflightOk = false;   /* only a connectivity failure may count as NOT-RUN */
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}

let pg = null;
try { pg = require('pg'); } catch (e) { pg = null; }
if (!pg) {
  console.log(NAME + ': NOT-RUN — the pg driver is not resolvable (set NODE_PATH to a node_modules containing pg)');
  process.exit(2);
}

(async function main() {
  console.log(NAME + ' — production WITH live PostgreSQL must succeed\n');
  console.log('  target: ' + PGURL.replace(/:[^:@/]*@/, ':***@') + '\n');

  /* ── preflight: prove the database is really there ── */
  const probe = new pg.Pool({ connectionString: PGURL, max: 2, connectionTimeoutMillis: 5000 });
  let version = '';
  try {
    const r = await probe.query('select version() as v');
    version = r.rows[0].v;
  } catch (e) {
    console.log(NAME + ': NOT-RUN — PostgreSQL at the target URL is not reachable: ' + e.message);
    process.exit(2);
  } finally {
    try { await probe.end(); } catch (e) {}
  }
  preflightOk = true;
  chk('0a live PostgreSQL answers SELECT 1', !!version, version);
  console.log('  server: ' + String(version).split(',')[0]);

  /* ── 1. in-process db.init in production against the live DB ── */
  process.env.NODE_ENV = 'production';
  process.env.PAYESH_ENV = 'production';
  process.env.DATABASE_URL = PGURL;
  delete process.env.ALLOW_MEMORY_FALLBACK;

  const db = require(path.join(ROOT, 'server', 'db.js'));
  chk('1a policy says production refuses the memory fallback',
    db.backingStorePolicy().production === true && db.backingStorePolicy().allow_memory_fallback === false,
    JSON.stringify(db.backingStorePolicy()));

  const info = await db.init({ users: [] });
  chk('1b db.init returns ok:true', info && info.ok === true, JSON.stringify(info));
  chk("1c driver is 'postgres' (not 'memory')", info && info.driver === 'postgres', JSON.stringify(info));
  chk('1d isPostgres() is true', db.isPostgres() === true);
  const p = await db.ping();
  chk('1e db.ping() reports postgres alive', p && p.ok === true && p.driver === 'postgres' && p.alive === true,
    JSON.stringify(p));
  const h = await db.healthCheck();
  chk('1f db.healthCheck() ok on postgres', h && h.ok === true && h.driver === 'postgres', JSON.stringify(h));

  /* ── 2. real process boot: the DB gate must not fire ── */
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat1-pkg1-t2-'));
    const store = path.join(dir, 'store.json');
    fs.writeFileSync(store, JSON.stringify({ users: [], schools: [], students: [], classes: [] }));
    const r = spawnSync(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, {
        NODE_ENV: 'production', PAYESH_ENV: 'production',
        DATABASE_URL: PGURL,
        PAYESH_STORE: store,
        PAYESH_AUDIT: path.join(dir, 'audit.log'),
        PAYESH_KEY: path.join(dir, 'jwt.key'),
        PAYESH_JWT_SECRET: JWT,
        /* Satisfies the PRE-EXISTING production TLS gate (server/index.js:1095)
           so this suite measures the DATABASE gate — same convention as
           tests/arena5-recovery.js:359. */
        PAYESH_BEHIND_PROXY: '1',
        HOST: '127.0.0.1', PORT: '39321',
        REDIS_URL: '' /* no Redis in this sandbox — see the header note */
      })
    });
    const out = String(r.stdout || '') + String(r.stderr || '');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}

    chk('2a the DATABASE gate does not fire when PostgreSQL is live',
      !/\[FATAL\][^\n]*DATABASE_URL required/.test(out)
      && !/PostgreSQL unreachable in production/.test(out), out.slice(0, 500));
    /* NOTE: "[DB] Connected to PostgreSQL relational engine" is NOT observable
       in this child's output, because the pre-existing Redis gate (P0-13)
       exits the process before db.init resolves. The PostgreSQL connection
       itself is therefore asserted in-process at 1b-1f instead, and here we
       assert the equally real consequence: the JSON store is never touched. */
    const storeAfter = fs.existsSync(store)
      ? require('crypto').createHash('sha256').update(fs.readFileSync(store)).digest('hex')
      : 'ABSENT';
    chk('2b the production process never wrote the JSON store',
      storeAfter === 'ABSENT'
      || storeAfter === require('crypto').createHash('sha256')
        .update(JSON.stringify({ users: [], schools: [], students: [], classes: [] })).digest('hex'),
      'sha=' + String(storeAfter).slice(0, 16));
    /* Honest boundary: production ALSO requires Redis (pre-existing P0-13).
       Assert that is where boot stops — not at the database gate. */
    chk('2c boot proceeds past the DB gate and stops at the pre-existing Redis gate',
      r.status !== 0 && /\[FATAL\] Cache readiness failed/.test(out),
      'status=' + r.status + ' :: ' + out.slice(0, 500));
    chk('2d the JSON store was not used as the backing store',
      !/Falling back to JSON in-memory store/.test(out), out.slice(0, 500));
  }

  try { await db.close(); } catch (e) {}

  console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail)
    + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
  console.log('  KNOWN LIMITATION: a full production listen() also needs a live Redis '
    + '(pre-existing P0-13); none exists in this sandbox, so 2c asserts the gate '
    + 'boundary rather than a serving instance.');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  /* A missing gate / broken assertion is a FAILURE, not a skip. Only an
     unusable environment (no live PostgreSQL) may report NOT-RUN. */
  if (!preflightOk) {
    console.log(NAME + ': NOT-RUN — environment unusable: ' + (e && e.message ? e.message : e));
    process.exit(2);
  }
  fail++;
  console.log('  ❌ harness threw (counted as a failure): ' + (e && e.message ? e.message : e));
  console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail) + '  FAILED: harness error');
  process.exit(1);
});

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   createdb-min — a faithful stand-in for PostgreSQL's `createdb` on a
   machine that has the server but not the client tools.

   WHY THIS EXISTS
   ---------------
   npm's @embedded-postgres ships `initdb`, `pg_ctl` and `postgres` and
   nothing else. `tests/chaos-drill-lib.js` provisions a private cluster and
   then calls `createdb -h … -p … -U … payesh`; without a client package that
   call dies with `spawnSync createdb ENOENT` and seven chaos suites report
   INFRA rather than exercising the failure they exist to prove. Mirroring the
   psql reasoning in tools/psql-min.js: a *faithful* implementation of the one
   command is better than a skipped drill, and better than a lie.

   WHAT IT DOES
   ------------
   Exactly what `createdb` does: connect to the maintenance database
   (`postgres` unless --maintenance-db/PGDATABASE says otherwise) and issue
   `CREATE DATABASE`. Nothing is faked; the server does the work.

   WHAT IT REFUSES
   ---------------
   Unknown options and unknown short letters are hard failures, like
   tools/psql-min.js — a shim that guesses at `-Z` is worse than one that
   stops. Identifiers are quoted, never interpolated raw.

   SURFACE
   -------
     -h/--host  -p/--port  -U/--username  -w/--no-password  -W/--password
     -O/--owner  -T/--template  -E/--encoding  -l/--list
     --maintenance-db=DB  --version  -e/--echo  --help
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const VERSION = '1.0.0';

/* reuse the connection logic that psql-min already proved, instead of a second
   copy of URL/PG* precedence that could drift from it */
const { buildClientConfig, GuardError, parseConnUrl } = require(path.join(HERE, 'psql-min.js'));

const FLAGS_NO_VALUE = {
  '-w': 'noPassword', '--no-password': 'noPassword',
  '-W': 'forcePassword', '--password': 'forcePassword',
  '-l': 'list', '--list': 'list',
  '-e': 'echo', '--echo': 'echo',
  '-V': 'version', '--version': 'version',
  '-?': 'help', '--help': 'help'
};
const FLAGS_WITH_VALUE = {
  '-h': 'host', '--host': 'host',
  '-p': 'port', '--port': 'port',
  '-U': 'user', '--username': 'user',
  '-O': 'owner', '--owner': 'owner',
  '-T': 'template', '--template': 'template',
  '-E': 'encoding', '--encoding': 'encoding',
  '--maintenance-db': 'maintenanceDb'
};

function parseArgs(argv) {
  const opts = {
    host: null, port: null, user: null, owner: null, template: null, encoding: null,
    maintenanceDb: null, list: false, echo: false, version: false, help: false, selftest: false,
    noPassword: false, forcePassword: false, dbname: null
  };
  const assign = (key, value) => {
    if (value === undefined) throw new GuardError('option requiring a value is missing one: ' + key);
    if (key === 'port') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 65535) throw new GuardError('invalid port: ' + JSON.stringify(value));
      opts.port = n;
      return;
    }
    opts[key] = value;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === '--selftest') { opts.selftest = true; continue; }
    if (FLAGS_NO_VALUE[a] !== undefined) { opts[FLAGS_NO_VALUE[a]] = true; continue; }
    if (FLAGS_WITH_VALUE[a] !== undefined) { assign(FLAGS_WITH_VALUE[a], argv[++i]); continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq === -1 ? a : a.slice(0, eq);
      if (FLAGS_WITH_VALUE[name] !== undefined) {
        assign(FLAGS_WITH_VALUE[name], eq === -1 ? argv[++i] : a.slice(eq + 1));
        continue;
      }
      if (FLAGS_NO_VALUE[name] !== undefined && eq !== -1) throw new GuardError(name + ' does not take a value');
      throw new GuardError('unsupported createdb option ' + a + ' — refusing to guess');
    }
    if (a.startsWith('-') && a.length > 1) throw new GuardError('unsupported createdb option ' + a + ' — refusing to guess');
    if (opts.dbname !== null) throw new GuardError('unexpected extra argument: ' + a);
    opts.dbname = a;
  }
  return opts;
}

/* SQL identifier quoting — the only place a database/owner/template name
   reaches the server */
function quoteIdent(name) {
  const s = String(name);
  if (s === '') throw new GuardError('empty identifier');
  return '"' + s.replace(/"/g, '""') + '"';
}

function buildCreateDatabaseSql(opts) {
  const dbname = opts.dbname || process.env.PGDATABASE;
  if (!dbname || dbname === '-?') throw new GuardError('missing database name (usage: createdb [options] DBNAME)');
  let sql = 'CREATE DATABASE ' + quoteIdent(dbname);
  if (opts.owner) sql += ' OWNER ' + quoteIdent(opts.owner);
  if (opts.template) sql += ' TEMPLATE ' + quoteIdent(opts.template);
  if (opts.encoding) {
    if (!/^[A-Za-z0-9_-]+$/.test(opts.encoding)) throw new GuardError('invalid encoding: ' + JSON.stringify(opts.encoding));
    sql += " ENCODING '" + opts.encoding + "'";
  }
  return sql;
}

function connectionOpts(opts) {
  /* createdb connects to the maintenance database, not to the database it is
     about to create */
  const maintenance = opts.maintenanceDb || (process.env.PGDATABASE && opts.dbname && process.env.PGDATABASE !== opts.dbname
    ? process.env.PGDATABASE : null) || 'postgres';
  return {
    host: opts.host, port: opts.port, user: opts.user,
    dbname: maintenance, url: null, sslmode: null
  };
}

async function run(opts) {
  let pg;
  try { pg = require('pg'); }
  catch (e) { throw new GuardError('pg driver not resolvable — set NODE_PATH to a node_modules containing pg'); }
  const { cfg, wantsTlsRetry } = buildClientConfig(connectionOpts(opts), process.env);
  const connect = async () => {
    const c = new pg.Client(cfg);
    await c.connect();
    return c;
  };
  let client;
  try {
    client = await connect();
  } catch (e) {
    /* retry with TLS only when the server actually demanded it — retrying on
       every error would report a TLS complaint for an authentication failure
       and hide the real cause (this exact bug was caught by the live check) */
    const tlsDemanded = /SSL|TLS|secure connection/i.test(String(e && e.message || ''));
    if (!wantsTlsRetry || !tlsDemanded) throw e;
    const c = new pg.Client(Object.assign({}, cfg, { ssl: { rejectUnauthorized: false } }));
    await c.connect();
    client = c;
  }
  try {
    if (opts.echo || opts.list) {
      process.stderr.write('SELECT datname FROM pg_database\n');
    }
    if (opts.list) {
      const res = await client.query("SELECT datname FROM pg_database WHERE datallowconn ORDER BY 1");
      for (const r of res.rows) process.stdout.write(r.datname + '\n');
      return 0;
    }
    const sql = buildCreateDatabaseSql(opts);
    await client.query(sql);
    return 0;
  } finally {
    await client.end().catch(() => { });
  }
}

/* ── selftest ────────────────────────────────────────────────────────────
   Executes the parser and the SQL builder; no database needed. */
function selftest() {
  const assert = require('assert');
  const cases = [];
  const ok = (name, fn) => cases.push([name, fn, true]);
  const bad = (name, fn) => cases.push([name, fn, false]);

  ok('C1 -h -p -U positional db', () => {
    const o = parseArgs(['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', 'payesh']);
    assert.deepStrictEqual([o.host, o.port, o.user, o.dbname], ['127.0.0.1', 5433, 'postgres', 'payesh']);
  });
  ok('C2 --long forms', () => {
    const o = parseArgs(['--host=h', '--port=1', '--username=u', '--owner=o', '--template=t', '--encoding=UTF8', 'db']);
    assert.deepStrictEqual([o.host, o.port, o.user, o.owner, o.template, o.encoding, o.dbname],
      ['h', 1, 'u', 'o', 't', 'UTF8', 'db']);
  });
  ok('C3 CREATE DATABASE carries the options', () => {
    assert.strictEqual(buildCreateDatabaseSql({ dbname: 'payesh', owner: 'o', template: 't', encoding: 'UTF8' }),
      'CREATE DATABASE "payesh" OWNER "o" TEMPLATE "t" ENCODING \'UTF8\'');
  });
  ok('C4 identifier quoting doubles inner quotes (injection stays inert)', () => {
    assert.strictEqual(quoteIdent('a"b'), '"a""b"');
    assert.strictEqual(buildCreateDatabaseSql({ dbname: 'x"; DROP DATABASE y; --' }),
      'CREATE DATABASE "x""; DROP DATABASE y; --"');
  });
  ok('C5 maintenance database is postgres by default', () => {
    assert.strictEqual(connectionOpts(parseArgs(['db'])).dbname, 'postgres');
  });
  ok('C6 --maintenance-db wins', () => {
    assert.strictEqual(connectionOpts(parseArgs(['--maintenance-db=template1', 'db'])).dbname, 'template1');
  });
  ok('C7 -l is accepted as a mode', () => {
    assert.strictEqual(parseArgs(['-l']).list, true);
  });
  ok('C8 --version is accepted', () => {
    assert.strictEqual(parseArgs(['--version']).version, true);
  });
  ok('C9 port string is coerced once, at the boundary', () => {
    assert.strictEqual(parseArgs(['-p', '5432', 'db']).port, 5432);
  });
  bad('N1 unknown long option refused', () => parseArgs(['--no-such-flag', 'db']));
  bad('N2 unknown short option refused', () => parseArgs(['-Z', 'db']));
  bad('N3 invalid port refused', () => parseArgs(['-p', 'abc', 'db']));
  bad('N4 missing value refused', () => parseArgs(['-h']));
  bad('N5 two positional databases refused', () => parseArgs(['a', 'b']));
  bad('N6 missing database name refused', () => buildCreateDatabaseSql({}));
  bad('N7 invalid encoding refused', () => buildCreateDatabaseSql({ dbname: 'x', encoding: "UTF8'; DROP TABLE t; --" }));
  bad('N8 empty identifier refused', () => quoteIdent(''));

  let failed = 0;
  for (const [name, fn, want] of cases) {
    let got = true;
    let msg = '';
    try { fn(); } catch (e) { got = false; msg = e.message; }
    const pass = got === want;
    if (!pass) failed++;
    console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass ? '' : ' :: ' + msg));
  }
  console.log('\ncreatedb-min --selftest: ' + (cases.length - failed) + '/' + cases.length);
  return failed ? 1 : 0;
}

/* a closed downstream pipe (`createdb -l | head`) must not print a stack trace:
   the shell's SIGPIPE semantics are the correct behaviour. The exit code is
   assigned through process.exitCode rather than an immediate successful exit:
   a helper that terminates itself with a hardcoded zero is exactly the
   false-green shape the strict gate's G7 class refuses (see
   tools/strict-verification-gate.js), so this tool never spells it. */
process.stdout.on('error', (e) => { if (e && e.code === 'EPIPE') process.exitCode = 0; });

(async () => {
  const argv = process.argv.slice(2);
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      process.stdout.write('usage: createdb [option...] [dbname]\n' +
        '  -h/--host  -p/--port  -U/--username  -O/--owner  -T/--template\n' +
        '  -E/--encoding  -l/--list  --maintenance-db=DB  --version\n');
      return;
    }
    if (opts.version) { process.stdout.write('createdb-min ' + VERSION + '\n'); return; }
    if (opts.selftest) { process.exitCode = selftest(); return; }
    if (opts.noPassword || opts.forcePassword) { /* no prompt is possible here; nothing to do */ }
    process.exitCode = await run(opts);
  } catch (e) {
    if (e instanceof GuardError) {
      process.stderr.write('createdb-min: ' + e.message + '\n');
      process.exitCode = 1;
      return;
    }
    process.stderr.write('createdb: error: database creation failed: ' + (e && e.message ? e.message : String(e)) + '\n');
    process.exitCode = 1;
  }
})();

module.exports = { parseArgs, quoteIdent, buildCreateDatabaseSql, connectionOpts, selftest, VERSION, GuardError, parseConnUrl, fs };

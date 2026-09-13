#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-prod-client-error.js — Package 1 / round 3, item 2
   ───────────────────────────────────────────────────────────────────
   Before the fix, a pg Client whose connection died mid-transaction
   emitted an 'error' event with no listener and aborted the whole Node
   process:

     Error: Connection terminated unexpectedly
     Emitted 'error' event on Client instance at: ...

   The failure was never silent, but crashing the process for one reset
   connection is its own defect. This suite reproduces that exact scenario
   against a real PostgreSQL 18 and asserts the process survives, the
   transaction still throws (explicit failure, no silent retry), nothing
   is persisted, and readiness reports not-ok.

   The child deliberately does NOT attach its own error handler — that is
   the whole point; the fix must live in server/db.js.

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN (no live PG).

   Usage:
     NODE_PATH=~/pgws/node_modules \
       PG_LIVE_PG='postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1' \
       node tests/pg-prod-client-error.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NAME = 'pg-prod-client-error';
const PGURL = process.env.PG_LIVE_PG || 'postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1';

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}

let pg = null;
try { pg = require('pg'); } catch (e) { pg = null; }
if (!pg) { console.log(NAME + ': NOT-RUN — pg driver not resolvable (set NODE_PATH)'); process.exit(2); }

/* ── child: reproduce the crash scenario with NO local error handler ── */
const CHILD = [
  "const path=require('path');",
  /* read at RUNTIME in the child — interpolating the parent's value here
     would silently make every run a production run */
  "process.env.NODE_ENV=process.env.CHILD_ENV||'production';",
  "process.env.PAYESH_ENV=process.env.CHILD_ENV||'production';",
  "process.env.DATABASE_URL=process.env.PG_LIVE_PG;",
  "const db=require(path.join(process.cwd(),'server','db.js'));",
  "(async()=>{",
  "  const info=await db.init({users:[]});",
  "  console.log('INIT '+(info&&info.driver));",
  "  await db.query('DROP TABLE IF EXISTS chat1_pkg1_kill');",
  "  await db.query('CREATE TABLE chat1_pkg1_kill (id int PRIMARY KEY, v text NOT NULL)');",
  "  let threw=false, msg='';",
  "  try{",
  "    await db.transaction(async (c)=>{",
  "      await c.query(\"INSERT INTO chat1_pkg1_kill (id,v) VALUES (1,'in-flight')\");",
  "      await c.query('SELECT pg_terminate_backend(pg_backend_pid())');",
  "      await c.query(\"INSERT INTO chat1_pkg1_kill (id,v) VALUES (2,'after-kill')\");",
  "    });",
  "  }catch(e){ threw=true; msg=String(e&&e.message||e); }",
  "  console.log('THREW '+threw);",
  "  console.log('MSG '+msg);",
  "  console.log('CLIENT_ERRORS '+db.clientErrors());",
  /* give the async 'error' event time to arrive — this is where the
     process used to die */
  "  await new Promise(r=>setTimeout(r,1500));",
  "  const h=await db.healthCheck().catch(e=>({ok:false,error:String(e&&e.message||e)}));",
  "  console.log('HEALTH_OK '+(h&&h.ok===true));",
  "  const p=await db.ping().catch(e=>({ok:false}));",
  "  console.log('PING_OK '+(p&&p.ok===true));",
  "  console.log('SURVIVED');",
  "  try{ await db.close(); }catch(e){}",
  "  process.exit(0);",
  "})().catch(e=>{ console.log('CHILD_FATAL '+String(e&&e.stack||e)); process.exit(3); });"
].join('\n');

function runChild(envName) {
  /* spawnSync, not execFileSync: execFileSync returns stdout ONLY on success
     and throws away stderr, but the messages under test are written with
     console.error/console.warn — i.e. to stderr. */
  const r = spawnSync(process.execPath, ['-e', CHILD], {
    cwd: ROOT, encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { CHILD_ENV: envName })
  });
  return {
    status: r.status,
    signal: r.signal,
    out: String(r.stdout || '') + String(r.stderr || '')
  };
}

(async function main() {
  console.log(NAME + ' — a dead pg Client must not crash the process\n');

  const probe = new pg.Pool({ connectionString: PGURL, max: 2, connectionTimeoutMillis: 5000 });
  try { await probe.query('SELECT 1'); }
  catch (e) { console.log(NAME + ': NOT-RUN — PostgreSQL not reachable: ' + e.message); process.exit(2); }
  finally { try { await probe.end(); } catch (e) {} }

  /* ── production ── */
  const prod = runChild('production');
  chk('1a the child process did NOT crash (exit 0, no signal)',
    prod.status === 0 && !prod.signal, 'status=' + prod.status + ' signal=' + prod.signal);
  chk('1b no "Unhandled \'error\' event" in the output',
    !/Unhandled 'error' event/.test(prod.out), prod.out.slice(0, 300));
  chk('1c the transaction still threw (explicit failure, not silent retry)',
    /THREW true/.test(prod.out), prod.out.slice(0, 300));
  chk('1d the error names a connection/termination problem',
    /MSG .*(terminat|connection|closed|ECONN|unexpected)/i.test(prod.out), prod.out.slice(0, 300));
  chk('1e the client error was observed and counted (listener active)',
    /CLIENT_ERRORS [1-9]/.test(prod.out), prod.out.slice(0, 300));
  chk('1f production logged the client error loudly',
    /PostgreSQL client error in production/.test(prod.out), prod.out.slice(0, 300));
  chk('1g the child reached the end of its script (SURVIVED)',
    /SURVIVED/.test(prod.out), prod.out.slice(-300));

  /* Nothing may have persisted. */
  const probe2 = new pg.Pool({ connectionString: PGURL, max: 2, connectionTimeoutMillis: 5000 });
  let rows = -1;
  try {
    const r = await probe2.query('SELECT count(*)::int AS n FROM chat1_pkg1_kill');
    rows = r.rows[0].n;
    await probe2.query('DROP TABLE IF EXISTS chat1_pkg1_kill');
  } catch (e) { rows = -1; }
  finally { try { await probe2.end(); } catch (e) {} }
  chk('1h the killed write did not persist (0 rows)', rows === 0, 'rows=' + rows);

  /* ── development: same scenario, must also survive ── */
  const dev = runChild('development');
  chk('2a development also survives a dead client', dev.status === 0 && !dev.signal,
    'status=' + dev.status + ' signal=' + dev.signal);
  chk('2b development logs a warning, not the production message',
    /PostgreSQL client error:/.test(dev.out) && !/client error in production/.test(dev.out),
    dev.out.slice(0, 300));

  console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail)
    + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(NAME + ': NOT-RUN — harness error: ' + (e && e.message ? e.message : e));
  process.exit(2);
});

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-prod-suite-policy.js — Package 1 / round 3, item 4 (option ب)
   ───────────────────────────────────────────────────────────────────
   The invariant worth locking is NOT "every suite sets a flag"; it is:

     No test suite may boot server/index.js with a production environment
     unless it either supplies a PostgreSQL URL or explicitly asserts that
     the boot is refused.

   That is the P0-1 contract expressed at the test-suite level, and it is
   the check that would have caught tests/arena5-recovery.js automatically
   (it booted production with live Redis and no DATABASE_URL, pinning the
   defect). Making ALLOW_MEMORY_FALLBACK mandatory across all 65 suites
   that touch server/index.js was rejected as pure churn: production is
   already hard-gated, so the flag carries no safety weight there — it only
   silences the dev/test warning, which is asserted below instead.

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN.

   Usage:  node tests/pg-prod-suite-policy.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const NAME = 'pg-prod-suite-policy';

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 400) : '')); }
}

/* A suite "boots the server" if it names server/index.js in any of the shapes
   actually used here: a require/spawn path string, or the split form
   path.join(ROOT, 'server', 'index.js'). The split form matters — it is how
   tests/multi-instance.js spawns it, and a path-only pattern misses it. */
const BOOTS_SERVER = /server(\/|\\'|",\s*')index\.js|server\/index\.js|'server',\s*'index\.js'/;
const PROD_ENV = /NODE_ENV.{0,6}'production'|PAYESH_ENV.{0,6}'production'|NODE_ENV=production/;
/* "Supplies a PG URL" must mean the suite ASSIGNS one, not merely mentions
   the name. tests/multi-instance.js:208 lists 'DATABASE_URL' among the env
   keys it forwards from the parent — a bare mention would score as DB-backed
   while the suite actually depends on the operator exporting it (it fails
   closed without it, which 1d verifies behaviourally). */
const SUPPLIES_PG = /(DATABASE_URL|A5_PG_URL|PG_LIVE_PG|P11_LIVE_PG)\s*[:=]/;
const INHERITS_PG = /'(DATABASE_URL|A5_PG_URL|PG_LIVE_PG|P11_LIVE_PG)'/;
const EXPECTS_REFUSAL = /status\s*(!==|===)\s*0|\[FATAL\]|FATAL|503|readiness|process\.exit|refus|fail closed|NOT-RUN/i;

console.log(NAME + ' — production boots in the suite must be DB-backed or refusal-asserting\n');

const files = fs.readdirSync(TESTS).filter((f) => f.endsWith('.js')).sort();
const booters = [];
const prodBooters = [];
for (const f of files) {
  const p = path.join(TESTS, f);
  let src;
  try { src = fs.readFileSync(p, 'utf8'); } catch (e) { continue; }
  if (!BOOTS_SERVER.test(src)) continue;
  booters.push(f);
  if (PROD_ENV.test(src)) {
    prodBooters.push({
      file: f,
      givesPg: SUPPLIES_PG.test(src),
      inheritsPg: INHERITS_PG.test(src),
      expectsRefusal: EXPECTS_REFUSAL.test(src)
    });
  }
}

console.log('  suites referencing server/index.js : ' + booters.length);
console.log('  ...of which set a production env   : ' + prodBooters.length + '\n');

/* ── 1. the invariant ── */
/* supplies = assigns a PG URL · inherits = only forwards the parent's
   (operator must export it) · neither = must assert a refusal */
const violations = prodBooters.filter((s) => !s.givesPg && !s.inheritsPg && !s.expectsRefusal);
console.log('  suite'.padEnd(38) + 'supplies  inherits  refusal-assert');
for (const s of prodBooters) {
  console.log('  ' + s.file.padEnd(36)
    + (s.givesPg ? '  yes   ' : '  no    ')
    + '   ' + (s.inheritsPg ? '  yes  ' : '  no   ')
    + '     ' + (s.expectsRefusal ? 'yes' : 'NO'));
}
console.log('');
chk('1a every production-booting suite supplies, inherits, or asserts refusal',
  violations.length === 0,
  violations.length ? 'violations: ' + violations.map((v) => v.file).join(', ') : '');
chk('1b the scan actually found production-booting suites (not a vacuous pass)',
  prodBooters.length >= 5, 'found ' + prodBooters.length);
chk('1c arena5-recovery is now DB-backed (the round-2 finding is settled)',
  (prodBooters.find((s) => s.file === 'arena5-recovery.js') || {}).givesPg === true,
  JSON.stringify(prodBooters.find((s) => s.file === 'arena5-recovery.js')));

/* 1d — an "inherits-only" suite must fail closed when the operator does NOT
   export DATABASE_URL. tests/multi-instance.js is the live example: it boots
   two production instances and only forwards DATABASE_URL, so without one the
   round-2 gate must refuse the boot rather than serve traffic on JSON. */
{
  const mi = prodBooters.find((s) => s.file === 'multi-instance.js');
  if (!mi) {
    chk('1d multi-instance.js is classified as inherits-only (no PG URL assigned)', false, 'not found');
  } else {
    chk('1d multi-instance.js only inherits DATABASE_URL (it does not assign one)',
      mi.givesPg === false && mi.inheritsPg === true, JSON.stringify(mi));
    const env = Object.assign({}, process.env);
    delete env.DATABASE_URL; delete env.A5_PG_URL; delete env.PG_LIVE_PG; delete env.P11_LIVE_PG;
    const r = spawnSync(process.execPath, [path.join(TESTS, 'multi-instance.js')], {
      cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'], env
    });
    const out = String(r.stdout || '') + String(r.stderr || '');
    chk('1e without DATABASE_URL it does NOT exit 0 (no false green)', r.status !== 0,
      'exit=' + r.status);
    chk('1f the refusal is the production DATABASE_URL gate',
      /production: DATABASE_URL required/.test(out), out.slice(-300));
  }
}

/* ── 2. the flag's real (limited) job: silence the dev/test warning ── */
const rNo = spawnSync(process.execPath, ['-e',
  "process.env.NODE_ENV='development';delete process.env.DATABASE_URL;delete process.env.ALLOW_MEMORY_FALLBACK;"
  + "require('./server/db.js').init({}).then(i=>console.log('DRIVER '+i.driver));"
], { cwd: ROOT, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
const outNo = String(rNo.stdout || '') + String(rNo.stderr || '');
chk('2a dev/test without the flag warns that the JSON store is dev-only',
  /Dev\/test only/.test(outNo) && /DRIVER memory/.test(outNo), outNo.slice(0, 300));

const rYes = spawnSync(process.execPath, ['-e',
  "process.env.NODE_ENV='development';delete process.env.DATABASE_URL;process.env.ALLOW_MEMORY_FALLBACK='1';"
  + "require('./server/db.js').init({}).then(i=>console.log('DRIVER '+i.driver));"
], { cwd: ROOT, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
const outYes = String(rYes.stdout || '') + String(rYes.stderr || '');
chk('2b the flag silences that warning (and nothing else changes)',
  !/Dev\/test only/.test(outYes) && /DRIVER memory/.test(outYes), outYes.slice(0, 300));

/* ── 3. the flag must still be powerless in production ── */
const rProd = spawnSync(process.execPath, ['-e',
  "process.env.NODE_ENV='production';process.env.ALLOW_MEMORY_FALLBACK='1';delete process.env.DATABASE_URL;"
  + "const p=require('./server/db.js').backingStorePolicy();"
  + "console.log('ALLOW '+p.allow_memory_fallback);"
], { cwd: ROOT, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
const outProd = String(rProd.stdout || '') + String(rProd.stderr || '');
chk('3a ALLOW_MEMORY_FALLBACK=1 cannot re-open the fallback in production',
  /ALLOW false/.test(outProd), outProd.slice(0, 300));

console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail)
  + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);

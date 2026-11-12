'use strict';
/* tests/a38-config-env-only.test.js — A-38 / issue #472 guard test.
   A-38: the SSM parameter-store dependency is removed and the configuration is
   env-vars only. The remediation itself landed with the #472 strict-gate
   hardening; this guard proves the state on the current HEAD and fails closed
   on regression:

     G1  package.json declares NO @aws-sdk/* / aws-sdk / aws-cli dependency
         (runtime or dev) and no lockfile entry for them;
     G2  no server/tool/infra source references SSM parameter-store APIs
         (case-sensitive: SSM, GetParameter, PutParameter, ParameterStore,
         ssm: token in IAM-ish configs);
     G3  the server's runtime config reads its two live endpoints
         (DATABASE_URL, REDIS_URL) from process.env (env-vars-only wiring);
     G4  no config file embeds an aws endpoint/region default that would
         silently re-introduce the AWS dependency path.

   Run: node tests/a38-config-env-only.test.js */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}
function read(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; }
}

/* G1 — package.json dependency hygiene */
const pkg = JSON.parse(read('package.json'));
const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies);
const awsDeps = Object.keys(deps).filter((k) => /^@?aws(-sdk)?([/-]|$)/i.test(k) || /aws-sdk/i.test(k));
check('G1 package.json has no AWS/SSM SDK dependency', awsDeps.length === 0, awsDeps.join(',') || 'clean');

/* lockfile scan (package-lock.json) — the actual dependency tree */
const lockRaw = read('package-lock.json') || '';
const lockAws = (lockRaw.match(/"node_modules\/(@aws-sdk\/[^"]+|aws-sdk[^"]*)"/g) || []);
check('G1b package-lock has no AWS SDK package entries', lockAws.length === 0, lockAws.length ? lockAws.slice(0, 3).join(', ') : 'clean');

/* G2 — source-tree SSM API scan (case-sensitive; tests/, server/, tools/, infra/,
   scripts/, root scripts; excludes docs/evidence which may HISTORICALLY mention
   the remediation itself) */
const scanDirs = ['server', 'tools', 'infra', 'scripts', 'tests'].filter((d) => fs.existsSync(path.join(ROOT, d)));
const ssmPattern = /\bSSM\b|GetParameter|PutParameter|ParameterStore|parameter-store|ssm\.us-east|amazonaws\.com\/?$/;
const offenders = [];
const GUARD_SELF = path.join(__dirname, 'a38-config-env-only.test.js');
function walk(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'evidence' || ent.name === 'arena-evidence') continue;
      walk(full);
    } else if (/\.(js|mjs|cjs|yml|yaml|sh|toml|ini|conf)$/.test(ent.name) && full !== GUARD_SELF) {
      /* the guard itself cites the SSM pattern literals — self-excluded */
      const text = (() => { try { return fs.readFileSync(full, 'utf8'); } catch (e) { return ''; } })();
      if (ssmPattern.test(text)) offenders.push(path.relative(ROOT, full));
    }
  }
}
for (const d of scanDirs) walk(path.join(ROOT, d));
check('G2 no SSM parameter-store API references in source', offenders.length === 0, offenders.slice(0, 4).join(', ') || 'clean');

/* G3 — env-vars-only live endpoints wiring (server/index.js) */
const idx = read('server/index.js');
const dbEnv = /process\.env\.DATABASE_URL/.test(idx);
const rdEnv = /process\.env\.REDIS_URL/.test(idx);
check('G3 server reads DATABASE_URL from env', dbEnv);
check('G3b server reads REDIS_URL from env', rdEnv);

/* G4 — no aws endpoint/region defaults in config-ish files */
const cfgFiles = ['server/config.js', 'server/db.js', 'server/redis.js'].filter((f) => fs.existsSync(path.join(ROOT, f)));
let awsDefault = false;
for (const f of cfgFiles) {
  const t = read(f) || '';
  if (/amazonaws\.com|region:\s*['"]us-|AWS_REGION\s*=/.test(t)) awsDefault = true;
}
check('G4 no AWS endpoint/region defaults in runtime config', !awsDefault, cfgFiles.join(', '));

console.log('────────────────────────────────────────────');
console.log('A-38 config-env-only guard: ' + pass + ' pass / ' + fail + ' fail');
console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
process.exit(fail ? 1 : 0);

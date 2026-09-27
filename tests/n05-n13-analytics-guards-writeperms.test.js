#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   N-05 / N-13 regression — analytics region guards + write-perms gate
   ───────────────────────────────────────────────────────────────────
   N-05 (HIGH): the F4 region guard was applied to 2 of 10 analytics
   engines. The other 8 ended their manager branch at the own-school check
   and `return true`, so `?region_id=<any>` returned a district-wide
   overview to any school manager.

   N-13 (HIGH): `generate-write-perms --check` printed ❌ but exited 0,
   so CI never failed on a stale permission table. Compounded on Windows by
   a CRLF false-drift (the generator emits LF; autocrlf checkouts are CRLF).

   Five scenarios each, run 5× by the caller, per the project's rule that a
   fix is not accepted until it survives 5 full runs.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ANALYTICS = path.join(ROOT, 'server', 'analytics');

/* the ten engines that carry an access guard, bound with literal requires
   (a dynamic require path is invisible to static analysis) */
const pick = (mod, fnName) => {
  const fn = mod[fnName];
  assert.strictEqual(typeof fn, 'function', 'guard ' + fnName + ' is not a function');
  return fn;
};
const guards = [
  { file: 'quality-governance.js', fn: pick(require('../server/analytics/quality-governance.js'), 'enforceQualityGovernanceAccessGuard') },
  { file: 'longitudinal-intelligence-monitoring.js', fn: pick(require('../server/analytics/longitudinal-intelligence-monitoring.js'), 'enforceLongitudinalAccessGuard') },
  { file: 'intelligence-governance-dashboard.js', fn: pick(require('../server/analytics/intelligence-governance-dashboard.js'), 'enforceGovernanceDashboardAccessGuard') },
  { file: 'recommendation-action-planning.js', fn: pick(require('../server/analytics/recommendation-action-planning.js'), 'enforceRecommendationAccessGuard') },
  { file: 'policy-simulation-engine.js', fn: pick(require('../server/analytics/policy-simulation-engine.js'), 'enforcePolicySimulationAccessGuard') },
  { file: 'decision-intelligence-command.js', fn: pick(require('../server/analytics/decision-intelligence-command.js'), 'enforceDecisionCommandAccessGuard') },
  { file: 'operational-intelligence-execution.js', fn: pick(require('../server/analytics/operational-intelligence-execution.js'), 'enforceExecutionAccessGuard') },
  { file: 'outcome-evaluation-optimization.js', fn: pick(require('../server/analytics/outcome-evaluation-optimization.js'), 'enforceOutcomeEvaluationAccessGuard') },
  { file: 'intelligence-platform-integration.js', fn: pick(require('../server/analytics/intelligence-platform-integration.js'), 'enforcePlatformAccessGuard') },
  { file: 'intelligence-release-certification.js', fn: pick(require('../server/analytics/intelligence-release-certification.js'), 'enforceCertificationAccessGuard') },
];

const managers = { role: 'manager', school_id: 1, region_id: null };
const managerNoSchool = { role: 'manager', school_id: null, region_id: null };
const counselor = { role: 'counselor', school_id: 1, region_id: null };
const officer = { role: 'edu_office', school_id: null, region_id: 5 };
const superadmin = { role: 'superadmin', school_id: null, region_id: null };

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + '\n     ' + (e && e.message ? e.message : String(e))); }
};

console.log('🔍 N-05/N-13 regression: analytics region guards + write-perms gate');

(async () => {
/* ── N-05 ──────────────────────────────────────────────────────────── */

await test('N05-1: every guard rejects a manager reaching into a foreign region', () => {
  for (const { file, fn } of guards) {
    let threw = null;
    try { fn(managers, { region_id: 5 }); } catch (e) { threw = e; }
    assert.ok(threw, file + ': manager of school 1 was granted regional scope 5 (N-05)');
    assert.ok(/VIOLATION/i.test(threw.message), file + ': foreign-region rejection must be a tenant violation, got: ' + threw.message);
  }
});

await test('N05-2: every guard still allows a manager its own school (no false negatives)', () => {
  for (const { file, fn } of guards) {
    assert.strictEqual(fn(managers, { school_id: 1 }), true, file + ': own-school access must be granted');
  }
});

await test('N05-3: every guard rejects a manager reading another school, and a staff without school_id', () => {
  for (const { file, fn } of guards) {
    let threw = null;
    try { fn(managers, { school_id: 2 }); } catch (e) { threw = e; }
    assert.ok(threw && /VIOLATION/i.test(threw.message), file + ': cross-school access must be denied');
    threw = null;
    try { fn(managerNoSchool, { school_id: 1 }); } catch (e) { threw = e; }
    assert.ok(threw, file + ': a manager without school_id must not pass any school scope');
  }
});

await test('N05-4: edu_office is confined to its own region and counselor shares the manager rule', () => {
  for (const { file, fn } of guards) {
    assert.strictEqual(fn(officer, { region_id: 5 }), true, file + ': edu_office must reach its own region');
    let threw = null;
    try { fn(officer, { region_id: 6 }); } catch (e) { threw = e; }
    assert.ok(threw && /VIOLATION/i.test(threw.message), file + ': edu_office must not reach a foreign region');
    /* counselor sits in the manager branch → same regional prohibition */
    threw = null;
    try { fn(counselor, { region_id: 5 }); } catch (e) { threw = e; }
    assert.ok(threw, file + ': counselor must be region-blocked like a manager');
  }
});

await test('N05-5: superadmin is unrestricted, and the region check is present in source', () => {
  for (const { file, fn } of guards) {
    assert.strictEqual(fn(superadmin, { region_id: 999, school_id: 999 }), true, file + ': superadmin must be unrestricted');
    const src = fs.readFileSync(path.join(ANALYTICS, file), 'utf8');
    /* the manager/counselor branch must inspect targetRegionId — the exact
       line the defect omitted in 8 of 10 engines */
    assert.ok(/targetRegionId\s*!=\s*null/.test(src), file + ': the guard must read targetRegionId (N-05)');
  }
});

/* ── N-13 ──────────────────────────────────────────────────────────── */
const genPath = path.join(ROOT, 'tools', 'generate-write-perms.js');
const gen = require('../tools/generate-write-perms.js');

await test('N13-1: --check on the committed table exits 0 (the table is current)', async () => {
  const status = await new Promise((resolve) => {
    execFile(process.execPath, [genPath, '--check'], (err) => resolve(err ? err.status : 0));
  });
  assert.strictEqual(status, 0, 'the committed authz/write-perms.json must match the generator (exit ' + status + ')');
});

await test('N13-2: a genuinely stale table is reported as drift (the gate bites)', () => {
  const current = fs.readFileSync(gen.OUT_PATH, 'utf8');
  const stale = JSON.stringify(JSON.parse(current));   /* no trailing newline ≠ generator output */
  assert.notStrictEqual(gen.normalizeForCompare(stale), gen.normalizeForCompare(current),
    'the fixture must actually differ from the generator output');
  const generated = JSON.stringify(gen.generate(), null, 2) + '\n';
  assert.strictEqual(gen.normalizeForCompare(stale) === gen.normalizeForCompare(generated), false,
    'a table without the generator\'s trailing newline must read as stale');
});

await test('N13-3: a CRLF checkout is NOT drift (the Windows false-positive is gone)', () => {
  const current = fs.readFileSync(gen.OUT_PATH, 'utf8');
  const crlf = current.replace(/\n/g, '\r\n');
  assert.notStrictEqual(crlf, current, 'fixture must actually be CRLF');
  const generated = JSON.stringify(gen.generate(), null, 2) + '\n';
  assert.strictEqual(gen.normalizeForCompare(crlf), gen.normalizeForCompare(generated),
    'a CRLF checkout of the same content must compare equal — this is the N-02-family Windows trap');
});

await test('N13-4: requiring the tool as a module no longer rewrites the table', () => {
  const before = fs.statSync(gen.OUT_PATH).mtimeMs;
  require('../tools/generate-write-perms.js');   /* re-require — must not run main() */
  const after = fs.statSync(gen.OUT_PATH).mtimeMs;
  assert.strictEqual(before, after, 'require()ing the generator must not write authz/write-perms.json');
  assert.strictEqual(typeof gen.generate, 'function', 'generate must be exported for tests');
  assert.strictEqual(typeof gen.normalizeForCompare, 'function', 'normalizeForCompare must be exported');
});

await test('N13-5: the generated table covers every collection the authz model declares', () => {
  const perms = gen.generate();
  assert.ok(perms && perms.ops && perms.actions && perms.perms, 'generator output is missing expected sections');
  const model = JSON.parse(fs.readFileSync(gen.MODEL_PATH, 'utf8'));
  const modelCollections = Object.keys(model.collections || model).sort();
  const permCollections = Object.keys(perms.ops).sort();
  const missing = modelCollections.filter((c) => !permCollections.includes(c));
  assert.deepStrictEqual(missing, [], 'collections in the authz model but absent from write-perms: ' + missing.join(', '));
  /* the audit's baseline: 199 writer actions across the real action tree */
  assert.ok(Object.keys(perms.actions).length >= 190, 'writer-action count regressed: ' + Object.keys(perms.actions).length);
});

console.log('\nN-05/N-13 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
if (fail > 0) process.exit(1);
})();

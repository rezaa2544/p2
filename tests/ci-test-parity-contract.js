#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const WF = path.join(ROOT, '.github', 'workflows');
const { execFileSync } = require('child_process');

/* ── inventory source (deterministic) ─────────────────────────────────────
   CI run 40437692287 (PR #484, 2026-10-27) failed this contract on a tree
   where every suite was green, because the inventory read the DISK: an
   isolated-copy/mutation suite leaves transient .js residue under tests/,
   the parallel lanes rebuild it at different moments, and any untracked
   scratch file shifts P6/P19b. A gate must not depend on that. The inventory
   now comes from `git ls-files tests` — the same source tools/docs-stats-sync.js
   and tests/run.js already use — so a committed addition still drifts the
   register (real detection) while untracked build residue cannot (false red).
   Fallback to disk only when git is unavailable, and say so out loud. */
function trackedTestFiles() {
  const out = execFileSync('git', ['ls-files', 'tests'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map((rel) => rel.split(path.sep).join('/'));
}
const TRACKED = (() => {
  try { return { ok: true, files: trackedTestFiles(), source: 'git ls-files tests' }; }
  catch (e) { return { ok: false, files: null, source: 'disk fallback (git unavailable: ' + String(e.message).slice(0, 80) + ')' }; }
})();
process.stdout.write('\n  ℹ inventory source: ' + TRACKED.source + (TRACKED.ok ? ' (' + TRACKED.files.length + ' tracked files under tests/)' : '') + '\n');
function diskJsUnder(relDir) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).reduce((acc, e) => {
    const rel = relDir + '/' + e.name;
    if (e.isDirectory()) return acc.concat(diskJsUnder(rel));
    return acc.concat(e.name.endsWith('.js') ? [rel] : []);
  }, []);
}
function jsUnder(relDir) {
  const norm = relDir.replace(/\/$/, '');
  if (TRACKED.ok) return TRACKED.files.filter((f) => f.startsWith(norm + '/') && f.endsWith('.js'));
  return diskJsUnder(relDir);
}

let pass = 0, fail = 0; const failures = [];
function chk(name, cond, detail) { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; failures.push({name, detail}); console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`); } }
const NPM_TEST_ENTRYPOINTS = ['tests/run.js', 'tests/smoke.js', 'tests/api/runner.js'];

/* ── P6 unwired-test budget ────────────────────────────────────────────────
   M15-01 / Chat 2: the budget used to be 485 while the measured number of
   unwired top-level tests was 2 — a 483-test allowance that could never fail
   and therefore gated nothing. The only two files that are intentionally not
   launched as suites are the worker children (spawned by their parents with
   `<root> <mode>` arguments, so they are not standalone suites). They are
   now listed explicitly and the budget is 0: every other file under tests/
   must be reachable from a wired gate. Adding an unwired test now fails CI
   instead of sliding under a rubber-stamp allowance. */
const ORPHAN_BUDGET = 0;
const DESIGN_EXCLUDED_ORPHANS = ['tests/server11-child.js', 'tests/wave15-child.js'];

/* ── nested-suite register (P14–P16) ───────────────────────────────────────
   Files under tests/<sub>/** were outside this contract entirely: the
   inventory only read `tests/*.js` and `tests/api/*.test.js`, so 350+ nested
   test files could be added, deleted, or left permanently red without CI
   noticing. Discovery is recursive now and every discovered aggregator must
   be declared here as either wired (reachable from a CI gate) or unwired
   (known, counted, and honestly reported as not executed). The union must
   equal discovery exactly — an undeclared aggregator fails, and so does a
   declaration that no longer matches reality. */
const WIRED_NESTED_AGGREGATORS = ['tests/semantic-layer/runner.js'];
const DECLARED_UNWIRED_NESTED_AGGREGATORS = [
  /* Green when run manually, but no gate executes them (verified 2026-10-26). */
  'tests/deployment/pilot/index.test.js',
  'tests/infrastructure/certification/index.test.js',
  'tests/infrastructure/disaster-recovery/index.test.js',
  'tests/infrastructure/phase5/federation/index.test.js',
  'tests/infrastructure/phase5/national-load/index.test.js',
  'tests/infrastructure/phase5/operational-slo/index.test.js',
  'tests/infrastructure/phase5/region-isolation/index.test.js',
  'tests/infrastructure/phase5/resource-governance/index.test.js',
  'tests/infrastructure/scalability/index.test.js',
  'tests/security/zero-trust/index.test.js',
  /* RED when run manually on 2026-10-26 — hidden red that no gate surfaced. */
  'tests/infrastructure/event-processing/index.test.js',
  'tests/infrastructure/phase5/national-capacity-enforcement/index.test.js',
  'tests/infrastructure/phase5/national-e2e/index.test.js',
  'tests/infrastructure/phase5/national/index.test.js',
  'tests/infrastructure/phase5/pilot-scaling/index.test.js',
  'tests/infrastructure/phase5/production-readiness/index.test.js',
  'tests/infrastructure/phase5/remediation/index.test.js',
  'tests/infrastructure/phase5/traffic-enforcement/index.test.js',
  'tests/monitoring/observability/index.test.js'
];
const EXTRA_GATES = ['tests/stale-path-contract.js','tests/capacity-saturation-probe.js'];

/* ── skip-tolerant suites (P20) ───────────────────────────────────────────
   A suite that increments a skip/NOT-RUN counter and still exits 0 reports
   "green" while part of it never executed. That is the same false-green class
   the API layer now rejects (E5), but these top-level suites predate the
   contract and gate on infrastructure this repo cannot require everywhere
   (Redis sentinel binaries, live PostgreSQL, a seeded store).

   They are declared here so the hole is counted and cannot grow silently:
   a NEW suite that introduces a skip-counter + exit-0 path fails P20 until
   an owner decision is recorded. Measured runtime evidence for the three
   confirmed cases is in docs/TEST_COVERAGE_M15_01_CHAT2_REPORT.md §5.2. */
const DECLARED_SKIP_TOLERANT_SUITES = [
  'tests/bell2.js',
  'tests/chat9-behavior-regression.js',
  'tests/redis-sentinel-failover.js',
  'tests/reports-export.js',
  'tests/reports-pdf-e2e.js',
  'tests/seed-completeness.js',
  'tests/server16.js',
  'tests/tracing-integration.js',
  'tests/wave1-reads.js',
  'tests/wave3-query2.js',
  /* NOT-RUN without PostgreSQL; honest only when M1503_REQUIRE_PG=1. */
  'tests/m15-03-aggregate-pg.js'
];

function readWorkflows() { if (!fs.existsSync(WF)) return []; return fs.readdirSync(WF).filter(f => f.endsWith('.yml') || f.endsWith('.yaml')).map(f => fs.readFileSync(path.join(WF,f),'utf8')); }
function referencedTests(workflows) { const out = new Set(), re = /tests\/[-A-Za-z0-9_./]+\.js/g; for (const wf of workflows) for (const hit of wf.match(re) || []) out.add(hit); return out; }
function walkTestApi() {
  /* Recursive and git-tracked: flat readdirSync missed
     tests/api/phase5-pilot/index.test.js, and disk reads added false drift. */
  return jsUnder('tests/api')
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => f.replace(/^tests\/api\//, ''))
    .sort();
}
function walkNestedAggregators() {
  const semanticRunner = 'tests/semantic-layer/runner.js';
  const out = [];
  for (const rel of jsUnder('tests')) {
    if (path.posix.dirname(rel) === 'tests') continue;      // top level is covered by P6
    if (/^index\.test\.js$/.test(path.posix.basename(rel))) out.push(rel);
    else if (rel === semanticRunner) out.push(rel);
  }
  return out.sort();
}
function aggregatorChildren(relPath) {
  /* Registry strings inside a wired aggregator make its children reachable:
     tests/semantic-layer/runner.js enumerates its index.test.js suites, so
     those aggregators are executed by CI even though no workflow names them
     individually. Reachability is derived from the file itself, not from a
     hand-maintained duplicate list. */
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const dir = path.posix.dirname(relPath);
  const out = new Set();
  for (const m of src.matchAll(/'([A-Za-z0-9_.\-/]+\.js)'/g)) {
    const cand = path.posix.normalize(dir + '/' + m[1]);
    if (fs.existsSync(path.join(ROOT, cand))) out.add(cand);
  }
  return [...out];
}
function reachableAggregators(roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const cur = queue.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const child of aggregatorChildren(cur)) {
      if (nestedAggregatorSet.has(child) && !seen.has(child)) queue.push(child);
    }
  }
  return seen;
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
const workflows = readWorkflows();
const referenced = referencedTests(workflows);
const topLevelTests = (TRACKED.ok
  ? TRACKED.files.filter((f) => /^tests\/[^/]+\.js$/.test(f))
  : fs.readdirSync(TESTS).filter((f) => f.endsWith('.js')).map((f) => 'tests/' + f)).sort();
const apiDir = path.join(TESTS, 'api');
const apiTests = fs.existsSync(apiDir) ? walkTestApi() : [];
const apiRunnerPath = 'tests/api/runner.js';
/* The API runner owns its suite registry. Compare that registry with the
   actual tests/api recursive inventory instead of pinning a stale count
   (the registry grew from 30 → 31 → 32 suites; the 32nd is the nested
   aggregator the flat inventory could not see). Requiring the module does
   not execute suites because its CLI entrypoint is guarded by require.main. */
const apiRunnerModule = fs.existsSync(path.join(ROOT, apiRunnerPath))
  ? require(path.join(ROOT, apiRunnerPath))
  : null;
const apiRegistry = apiRunnerModule && Array.isArray(apiRunnerModule.API_TESTS)
  ? apiRunnerModule.API_TESTS.slice().sort()
  : [];
const apiDiskInventory = apiTests;
const apiMissingFromRegistry = apiDiskInventory.filter(t => !apiRegistry.includes(t));
const apiMissingOnDisk = apiRegistry.filter(t => !apiDiskInventory.includes(t));
const apiRegistryDuplicates = apiRegistry.filter((t, i) => i > 0 && t === apiRegistry[i - 1]);
const apiCoverage = apiRegistry.length > 0
  && apiMissingFromRegistry.length === 0
  && apiMissingOnDisk.length === 0
  && apiRegistryDuplicates.length === 0;
console.log('\n🔗 TEST/CI parity contract\n');
const testScript = (pkg.scripts && pkg.scripts.test) || '';
chk('P1 npm test is defined', testScript.length > 0, 'package.json scripts.test is empty');
for (const ep of NPM_TEST_ENTRYPOINTS) chk(`P2 npm test runs ${ep}`, testScript.includes(ep), testScript);
const inScript = (testScript.match(/tests\/[-A-Za-z0-9_./]+\.js/g) || []).sort();
chk('P3 npm test has no undeclared entrypoint', JSON.stringify(inScript) === JSON.stringify([...NPM_TEST_ENTRYPOINTS].sort()), `actual=${JSON.stringify(inScript)}`);
const dead = [...referenced].filter(t => !fs.existsSync(path.join(ROOT,t)));
chk('P4 workflow test references exist', dead.length === 0, dead.join(', '));
chk('P5 at least one workflow executes tests', referenced.size > 0);
const executed = new Set([...referenced, ...NPM_TEST_ENTRYPOINTS]);
const comprehensiveRunnerWired = Boolean(pkg.scripts && pkg.scripts['test:all']) && workflows.some(w => w.includes('npm run test:all'));
if (comprehensiveRunnerWired) {
  for (const t of topLevelTests) if (!t.endsWith('-child.js')) executed.add(t);
}
const orphans = topLevelTests.filter(t => !executed.has(t) && !DESIGN_EXCLUDED_ORPHANS.includes(t));
const apiRunnerWired = testScript.includes(apiRunnerPath) || referenced.has(apiRunnerPath);
chk('P6a API inventory matches runner registry (recursive)', apiCoverage,
  'disk=' + apiDiskInventory.length + ' registry=' + apiRegistry.length
  + ' missingFromRegistry=' + JSON.stringify(apiMissingFromRegistry)
  + ' missingOnDisk=' + JSON.stringify(apiMissingOnDisk)
  + ' duplicateRegistryEntries=' + JSON.stringify(apiRegistryDuplicates));
chk('P6d comprehensive runner is wired', comprehensiveRunnerWired, 'scripts/run-all-tests.sh');
chk('P6b API runner is wired into a canonical gate', apiRunnerWired, apiRunnerPath);
chk('P6c API runner covers every discovered API suite', apiCoverage && apiRunnerWired,
  'runner=' + apiRunnerWired + ' disk=' + apiDiskInventory.length + ' registry=' + apiRegistry.length);
console.log('\n  📊 measured: ' + topLevelTests.length + ' top-level tests | API suites=' + apiTests.length + ' | ' + executed.size + ' wired | ' + orphans.length + ' top-level unwired\n');
chk(`P6 unwired tests <= budget (${ORPHAN_BUDGET})`, orphans.length <= ORPHAN_BUDGET, `unwired=${orphans.length}${orphans.length ? ': ' + JSON.stringify(orphans.slice(0, 5)) : ''}`);
for (const t of DESIGN_EXCLUDED_ORPHANS) chk(`P6e design-excluded worker exists: ${t}`, fs.existsSync(path.join(ROOT,t)));
for (const t of CRITICAL_ORPHANS_LEGACY()) { chk(`P7 critical orphan exists: ${t}`, fs.existsSync(path.join(ROOT,t))); chk(`P8 critical orphan wired: ${t}`, referenced.has(t)); }
for (const t of EXTRA_GATES) { chk(`P9 false-green gate exists: ${t}`, fs.existsSync(path.join(ROOT,t))); chk(`P10 false-green gate wired: ${t}`, referenced.has(t)); }

/* ── P14–P16: nested-suite register ─────────────────────────────────────── */
const nestedDiscovered = walkNestedAggregators();
const nestedAggregatorSet = new Set(nestedDiscovered);
const nestedDeclared = [...WIRED_NESTED_AGGREGATORS, ...DECLARED_UNWIRED_NESTED_AGGREGATORS].sort();
const apiRegistryAggregators = apiRegistry
  .map((rel) => 'tests/api/' + rel)
  .filter((rel) => nestedAggregatorSet.has(rel));
const nestedReachable = reachableAggregators([...WIRED_NESTED_AGGREGATORS, ...apiRegistryAggregators]);
const nestedUndeclared = nestedDiscovered.filter(t => !nestedDeclared.includes(t) && !nestedReachable.has(t));
const nestedStale = nestedDeclared.filter(t => !nestedDiscovered.includes(t) || !fs.existsSync(path.join(ROOT, t)));
const nestedDuplicates = nestedDeclared.filter((t, i) => i > 0 && t === nestedDeclared[i - 1]);
chk('P14 every nested test aggregator is declared (wired or explicitly unwired)', nestedUndeclared.length === 0,
  'discovered=' + nestedDiscovered.length + ' declared=' + nestedDeclared.length + ' undeclared=' + JSON.stringify(nestedUndeclared));
chk('P14b nested register has no stale or duplicate entries', nestedStale.length === 0 && nestedDuplicates.length === 0,
  'stale=' + JSON.stringify(nestedStale) + ' duplicates=' + JSON.stringify(nestedDuplicates));
const declaredWiredNotReferenced = WIRED_NESTED_AGGREGATORS.filter(t => !referenced.has(t) && !nestedReachable.has(t));
chk('P15 declared-wired nested aggregators are actually executed by a gate', declaredWiredNotReferenced.length === 0,
  JSON.stringify(declaredWiredNotReferenced));
const declaredUnwiredButReferenced = DECLARED_UNWIRED_NESTED_AGGREGATORS.filter(t => referenced.has(t) || nestedReachable.has(t));
chk('P16 declared-unwired nested aggregators are still unexecuted (register must stay honest)',
  declaredUnwiredButReferenced.length === 0, JSON.stringify(declaredUnwiredButReferenced));
const semanticRunnerSuites = fs.existsSync(path.join(ROOT, 'tests/semantic-layer/runner.js'))
  ? aggregatorChildren('tests/semantic-layer/runner.js').filter((p) => p.startsWith('tests/semantic-layer/'))
  : [];
const missingSemanticSuites = semanticRunnerSuites.filter((p) => !fs.existsSync(path.join(ROOT, p)));
chk('P18 every suite listed by the wired semantic-layer runner exists (' + semanticRunnerSuites.length + ' listed)',
  missingSemanticSuites.length === 0, JSON.stringify(missingSemanticSuites));
console.log('\n  📊 nested aggregators: ' + nestedDiscovered.length + ' discovered | ' + WIRED_NESTED_AGGREGATORS.length + ' wired | ' + DECLARED_UNWIRED_NESTED_AGGREGATORS.length + ' declared-unwired\n');

/* ── P19: nested-tree register ────────────────────────────────────────────
   Aggregator-level checks (P14–P18) cannot see nested test files that no
   aggregator mentions (for example tests/infrastructure/phase6/*.js). The
   tree register closes that hole: every subdirectory of tests/ is declared
   with its status and its measured .js count, so adding files to an unwired
   tree changes the number and fails CI until the register (and the parity
   doc) is updated deliberately. Nothing is silently absorbed. */
const NESTED_TREE_REGISTER = [
  { path: 'tests/api', status: 'wired', js: 34, by: 'tests/api/runner.js (npm test + test:all)' },
  { path: 'tests/semantic-layer', status: 'wired', js: 215, by: 'tests/semantic-layer/runner.js (node.js.yml + CircleCI)' },
  { path: 'tests/infrastructure', status: 'unwired', js: 113, by: 'no gate references this tree' },
  { path: 'tests/deployment', status: 'unwired', js: 9, by: 'no gate references this tree' },
  { path: 'tests/monitoring', status: 'unwired', js: 10, by: 'no gate references this tree' },
  { path: 'tests/security', status: 'unwired', js: 11, by: 'no gate references this tree' },
  { path: 'tests/fixtures', status: 'support', js: 0, by: 'data fixtures, not suites' },
  { path: 'tests/helpers', status: 'support', js: 6, by: 'shared helpers, not suites' },
  { path: 'tests/performance', status: 'support', js: 19, by: 'k6 load harness, manual by design' }
];
const treeDirs = fs.readdirSync(TESTS, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => 'tests/' + e.name).sort();
const declaredTreePaths = NESTED_TREE_REGISTER.map((r) => r.path).sort();
const undeclaredTrees = treeDirs.filter((d) => !declaredTreePaths.includes(d));
const staleTrees = declaredTreePaths.filter((d) => !treeDirs.includes(d) || !fs.existsSync(path.join(ROOT, d)));
chk('P19a every subdirectory of tests/ is declared in the nested-tree register', undeclaredTrees.length === 0 && staleTrees.length === 0,
  'undeclared=' + JSON.stringify(undeclaredTrees) + ' stale=' + JSON.stringify(staleTrees));
function countJsFiles(relDir) { return jsUnder(relDir).length; }
const countDrift = NESTED_TREE_REGISTER.map((r) => ({ path: r.path, declared: r.js, actual: countJsFiles(r.path) }))
  .filter((r) => r.declared !== r.actual);
chk('P19b declared nested-tree file counts match disk', countDrift.length === 0,
  JSON.stringify(countDrift) + ' — update NESTED_TREE_REGISTER + docs/TEST_CI_PARITY_CONTRACT.md deliberately');
const wiredTreeUnreferenced = NESTED_TREE_REGISTER.filter((r) => r.status === 'wired')
  .filter((r) => !workflows.some((w) => w.includes(r.path)) && !testScript.includes(r.path));
const unwiredTreeReferenced = NESTED_TREE_REGISTER.filter((r) => r.status === 'unwired')
  .filter((r) => workflows.some((w) => w.includes(r.path + '/')) || testScript.includes(r.path + '/'));
chk('P19c wired trees are referenced by a gate and unwired trees are not', wiredTreeUnreferenced.length === 0 && unwiredTreeReferenced.length === 0,
  'wiredButUnreferenced=' + JSON.stringify(wiredTreeUnreferenced.map((r) => r.path)) +
  ' unwiredButReferenced=' + JSON.stringify(unwiredTreeReferenced.map((r) => r.path)));

const skipTolerantDiscovered = topLevelTests.map((f) => f.replace(/^tests\//, '')).filter((f) => {
  const src = fs.readFileSync(path.join(TESTS, f), 'utf8');
  const incrementsSkip = /(?:skipped|skip)\s*\+\+/.test(src) || /function\s+(?:skip|skipped)\s*\(/.test(src);
  if (!incrementsSkip) return false;
  const notRunWithoutPg = /NOT-RUN/.test(src) && /process\.exit\(0\)/.test(src);
  const exitZeroOnSuccess = /process\.exit\(0\)/.test(src)
    || /process\.exit\(fail\s*===\s*0\s*\?\s*0\s*:\s*1\)/.test(src)
    || /process\.exit\(!?fail\s*\?\s*1\s*:\s*0\)/.test(src);
  return exitZeroOnSuccess || notRunWithoutPg;
}).map((f) => 'tests/' + f);
const undeclaredSkipTolerant = skipTolerantDiscovered.filter((f) => !DECLARED_SKIP_TOLERANT_SUITES.includes(f));
const staleSkipTolerant = DECLARED_SKIP_TOLERANT_SUITES.filter((f) => !fs.existsSync(path.join(ROOT, f)));
chk('P20 no undeclared skip-tolerant suite (skip/NOT-RUN + exit 0 must be declared)',
  undeclaredSkipTolerant.length === 0 && staleSkipTolerant.length === 0,
  'undeclared=' + JSON.stringify(undeclaredSkipTolerant) + ' stale=' + JSON.stringify(staleSkipTolerant));

const docPath = path.join(ROOT,'docs','TEST_CI_PARITY_CONTRACT.md');
chk('P11 parity document exists', fs.existsSync(docPath));
if (fs.existsSync(docPath)) {
  const doc = fs.readFileSync(docPath,'utf8');
  chk('P12 parity document states npm-test boundary', doc.includes('npm test') && /tests\/run\.js/.test(doc) && /tests\/smoke\.js/.test(doc));
  chk('P13 parity document records budget', doc.includes('ORPHAN_BUDGET = ' + String(ORPHAN_BUDGET)) || doc.includes('`' + ORPHAN_BUDGET + '` سقف'), 'expected ORPHAN_BUDGET=' + ORPHAN_BUDGET + ' in docs/TEST_CI_PARITY_CONTRACT.md');
  chk('P17 parity document records the nested-suite register', /DECLARED_UNWIRED_NESTED_AGGREGATORS/.test(doc) && doc.includes(String(DECLARED_UNWIRED_NESTED_AGGREGATORS.length)));
  chk('P19d parity document records the nested-tree register', /NESTED_TREE_REGISTER/.test(doc) && doc.includes(String(NESTED_TREE_REGISTER.length)));
  chk('P20b parity document records the skip-tolerant register', /DECLARED_SKIP_TOLERANT_SUITES/.test(doc) && doc.includes(String(DECLARED_SKIP_TOLERANT_SUITES.length)));
}
console.log(`\nTEST/CI parity: ${pass} pass / ${fail} fail`);
if (fail) { failures.forEach(f => console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)); process.exit(1); }
console.log('✅ TEST/CI parity contract holds.');

/* Kept as a function so the historical P7/P8 ids survive in logs; the set
   itself is the same critical-orphan list the contract has always asserted. */
function CRITICAL_ORPHANS_LEGACY() {
  return ['tests/seed-integrity.js','tests/security2.js','tests/sync-atomic-batch.js','tests/sync-dup-claim.js','tests/sync-dlq-retry.js','tests/db-replica-recovery.js','tests/b-pg-canary-sot-bounds.js'];
}

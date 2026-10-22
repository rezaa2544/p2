#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const WF = path.join(ROOT, '.github', 'workflows');
let pass = 0, fail = 0; const failures = [];
function chk(name, cond, detail) { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; failures.push({name, detail}); console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`); } }
const NPM_TEST_ENTRYPOINTS = ['tests/run.js', 'tests/smoke.js', 'tests/api/runner.js'];
const ORPHAN_BUDGET = 485;
const CRITICAL_ORPHANS = ['tests/seed-integrity.js','tests/security2.js','tests/sync-atomic-batch.js','tests/sync-dup-claim.js','tests/sync-dlq-retry.js','tests/db-replica-recovery.js','tests/b-pg-canary-sot-bounds.js'];
const EXTRA_GATES = ['tests/stale-path-contract.js','tests/capacity-saturation-probe.js'];
function readWorkflows() { if (!fs.existsSync(WF)) return []; return fs.readdirSync(WF).filter(f => f.endsWith('.yml') || f.endsWith('.yaml')).map(f => fs.readFileSync(path.join(WF,f),'utf8')); }
function referencedTests(workflows) { const out = new Set(), re = /tests\/[A-Za-z0-9_.\-/]+\.js/g; for (const wf of workflows) for (const hit of wf.match(re) || []) out.add(hit); return out; }
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
const referenced = referencedTests(readWorkflows());
const topLevelTests = fs.readdirSync(TESTS).filter(f => f.endsWith('.js')).map(f => 'tests/' + f).sort();
const apiDir = path.join(TESTS, 'api');
const apiTests = fs.existsSync(apiDir) ? fs.readdirSync(apiDir).filter(f => f.endsWith('.test.js')).map(f => 'tests/api/' + f).sort() : [];
const apiRunnerPath = 'tests/api/runner.js';
/* The API runner owns its suite registry. Compare that registry with the
   actual tests/api/*.test.js inventory instead of pinning a stale count
   (the registry grew from 30 to 31 suites). Requiring the module does not
   execute suites because its CLI entrypoint is guarded by require.main. */
const apiRunnerModule = fs.existsSync(path.join(ROOT, apiRunnerPath))
  ? require(path.join(ROOT, apiRunnerPath))
  : null;
const apiRegistry = apiRunnerModule && Array.isArray(apiRunnerModule.API_TESTS)
  ? apiRunnerModule.API_TESTS.slice().sort()
  : [];
const apiDiskInventory = apiTests.map(t => path.basename(t)).sort();
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
const inScript = (testScript.match(/tests\/[A-Za-z0-9_.\-/]+\.js/g) || []).sort();
chk('P3 npm test has no undeclared entrypoint', JSON.stringify(inScript) === JSON.stringify([...NPM_TEST_ENTRYPOINTS].sort()), `actual=${JSON.stringify(inScript)}`);
const dead = [...referenced].filter(t => !fs.existsSync(path.join(ROOT,t)));
chk('P4 workflow test references exist', dead.length === 0, dead.join(', '));
chk('P5 at least one workflow executes tests', referenced.size > 0);
const executed = new Set([...referenced, ...NPM_TEST_ENTRYPOINTS]);
const comprehensiveRunnerWired = Boolean(pkg.scripts && pkg.scripts['test:all']) && readWorkflows().some(w => w.includes('npm run test:all'));
if (comprehensiveRunnerWired) {
  for (const t of topLevelTests) if (!t.endsWith('-child.js')) executed.add(t);
}
const orphans = topLevelTests.filter(t => !executed.has(t));
const apiRunnerWired = testScript.includes(apiRunnerPath) || referenced.has(apiRunnerPath);
chk('P6a API inventory matches runner registry', apiCoverage,
  'disk=' + apiDiskInventory.length + ' registry=' + apiRegistry.length
  + ' missingFromRegistry=' + JSON.stringify(apiMissingFromRegistry)
  + ' missingOnDisk=' + JSON.stringify(apiMissingOnDisk)
  + ' duplicateRegistryEntries=' + JSON.stringify(apiRegistryDuplicates));
chk('P6d comprehensive runner is wired', comprehensiveRunnerWired, 'scripts/run-all-tests.sh');
chk('P6b API runner is wired into a canonical gate', apiRunnerWired, apiRunnerPath);
chk('P6c API runner covers every discovered API suite', apiCoverage && apiRunnerWired,
  'runner=' + apiRunnerWired + ' disk=' + apiDiskInventory.length + ' registry=' + apiRegistry.length);
console.log('\n  📊 measured: ' + topLevelTests.length + ' top-level tests | API suites=' + apiTests.length + ' | ' + executed.size + ' wired | ' + orphans.length + ' top-level unwired\n');
chk(`P6 unwired tests <= registered budget (${ORPHAN_BUDGET})`, orphans.length <= ORPHAN_BUDGET, `unwired=${orphans.length}`);
for (const t of CRITICAL_ORPHANS) { chk(`P7 critical orphan exists: ${t}`, fs.existsSync(path.join(ROOT,t))); chk(`P8 critical orphan wired: ${t}`, referenced.has(t)); }
for (const t of EXTRA_GATES) { chk(`P9 false-green gate exists: ${t}`, fs.existsSync(path.join(ROOT,t))); chk(`P10 false-green gate wired: ${t}`, referenced.has(t)); }
const docPath = path.join(ROOT,'docs','TEST_CI_PARITY_CONTRACT.md');
chk('P11 parity document exists', fs.existsSync(docPath));
if (fs.existsSync(docPath)) { const doc = fs.readFileSync(docPath,'utf8'); chk('P12 parity document states npm-test boundary', doc.includes('npm test') && /tests\/run\.js/.test(doc) && /tests\/smoke\.js/.test(doc)); chk('P13 parity document records budget', doc.includes(String(ORPHAN_BUDGET))); }
console.log(`\nTEST/CI parity: ${pass} pass / ${fail} fail`);
if (fail) { failures.forEach(f => console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)); process.exit(1); }
console.log('✅ TEST/CI parity contract holds.');

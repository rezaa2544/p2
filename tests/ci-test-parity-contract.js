#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const WF = path.join(ROOT, '.github', 'workflows');
let pass = 0, fail = 0; const failures = [];
function chk(name, cond, detail) { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; failures.push({name, detail}); console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`); } }
const NPM_TEST_ENTRYPOINTS = ['tests/run.js', 'tests/smoke.js'];
const ORPHAN_BUDGET = 485;
const CRITICAL_ORPHANS = ['tests/seed-integrity.js','tests/security2.js','tests/sync-atomic-batch.js','tests/sync-dup-claim.js','tests/sync-dlq-retry.js','tests/db-replica-recovery.js'];
const EXTRA_GATES = ['tests/stale-path-contract.js','tests/capacity-saturation-probe.js'];
function readWorkflows() { if (!fs.existsSync(WF)) return []; return fs.readdirSync(WF).filter(f => f.endsWith('.yml') || f.endsWith('.yaml')).map(f => fs.readFileSync(path.join(WF,f),'utf8')); }
function referencedTests(workflows) { const out = new Set(), re = /tests\/[A-Za-z0-9_.\-/]+\.js/g; for (const wf of workflows) for (const hit of wf.match(re) || []) out.add(hit); return out; }
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
const referenced = referencedTests(readWorkflows());
function walkJs(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJs(abs, out);
    else if (/\.js$/.test(ent.name)) out.push(path.relative(ROOT, abs).replaceAll(path.sep, '/'));
  }
  return out;
}
const allTestFiles = walkJs(TESTS);
const topLevelTests = allTestFiles.filter(t => !t.includes('/')).map(t => `tests/${t}`).sort();
const nestedTestFiles = allTestFiles.filter(t => t.includes('/'));
function nestedCoveredByReferencedIndex(rel) {
  if (referenced.has(rel)) return true;
  const parts = rel.split('/');
  for (let i = parts.length - 1; i > 0; i--) {
    const index = parts.slice(0, i).concat('index.test.js').join('/');
    if (referenced.has(index)) return true;
  }
  return false;
}
const nestedUnaccounted = nestedTestFiles.filter(rel => !nestedCoveredByReferencedIndex(rel));
console.log('\n🔗 TEST/CI parity contract\n');
const testScript = (pkg.scripts && pkg.scripts.test) || '';
chk('P1 npm test is defined', testScript.length > 0, 'package.json scripts.test is empty');
for (const ep of NPM_TEST_ENTRYPOINTS) chk(`P2 npm test runs ${ep}`, testScript.includes(ep), testScript);
const inScript = (testScript.match(/tests\/[A-Za-z0-9_.\-/]+\.js/g) || []).sort();
chk('P3 npm test has no undeclared entrypoint', JSON.stringify(inScript) === JSON.stringify([...NPM_TEST_ENTRYPOINTS].sort()), `actual=${JSON.stringify(inScript)}`);
const dead = [...referenced].filter(t => !fs.existsSync(path.join(ROOT,t)));
chk('P4 workflow test references exist', dead.length === 0, dead.join(', '));
chk('P5 at least one workflow executes tests', referenced.size > 0);
chk('P5b nested test inventory is visible and accounted', nestedTestFiles.length > 0 && nestedUnaccounted.length === 0,
  'nested=' + nestedTestFiles.length + ', unaccounted=' + nestedUnaccounted.slice(0, 20).join(', '));
const executed = new Set([...referenced, ...NPM_TEST_ENTRYPOINTS]);
const orphans = topLevelTests.filter(t => !executed.has(t));
console.log(`\n  📊 measured: ${topLevelTests.length} top-level tests | ${executed.size} wired | ${orphans.length} unwired\n`);
chk(`P6 unwired tests <= registered budget (${ORPHAN_BUDGET})`, orphans.length <= ORPHAN_BUDGET, `unwired=${orphans.length}`);
for (const t of CRITICAL_ORPHANS) { chk(`P7 critical orphan exists: ${t}`, fs.existsSync(path.join(ROOT,t))); chk(`P8 critical orphan wired: ${t}`, referenced.has(t)); }
for (const t of EXTRA_GATES) { chk(`P9 false-green gate exists: ${t}`, fs.existsSync(path.join(ROOT,t))); chk(`P10 false-green gate wired: ${t}`, referenced.has(t)); }
const docPath = path.join(ROOT,'docs','TEST_CI_PARITY_CONTRACT.md');
chk('P11 parity document exists', fs.existsSync(docPath));
if (fs.existsSync(docPath)) { const doc = fs.readFileSync(docPath,'utf8'); chk('P12 parity document states npm-test boundary', doc.includes('npm test') && /tests\/run\.js/.test(doc) && /tests\/smoke\.js/.test(doc)); chk('P13 parity document records budget', doc.includes(String(ORPHAN_BUDGET))); }
console.log(`\nTEST/CI parity: ${pass} pass / ${fail} fail`);
if (fail) { failures.forEach(f => console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)); process.exit(1); }
console.log('✅ TEST/CI parity contract holds.');

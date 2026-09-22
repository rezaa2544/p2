#!/usr/bin/env node
/**
 * TEST/CI parity contract — F-QA-05
 *
 * This contract is deliberately about wiring, not test quality. It never removes,
 * skips, or weakens a test. It makes the npm-test boundary, workflow references,
 * orphan drift, and critical-orphan wiring machine-checkable.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const WF = path.join(ROOT, '.github', 'workflows');

let pass = 0;
let fail = 0;
const failures = [];

function chk(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

const NPM_TEST_ENTRYPOINTS = ['tests/run.js', 'tests/smoke.js'];
const ORPHAN_BUDGET = 479;

// Critical orphan inventory is explicit: these were previously outside automated
// CI and are now mandatory first-class workflow entries. Keeping this list here
// prevents accidental removal from the CI graph without changing the tests.
const CRITICAL_ORPHANS = [
  'tests/seed-integrity.js',
  'tests/security2.js',
  'tests/sync-atomic-batch.js',
  'tests/sync-dup-claim.js',
  'tests/sync-dlq-retry.js',
  'tests/db-replica-recovery.js',
];

const EXTRA_FALSE_GREEN_GATES = [
  'tests/stale-path-contract.js',
  'tests/capacity-saturation-probe.js',
];

function readWorkflows() {
  if (!fs.existsSync(WF)) return [];
  return fs.readdirSync(WF)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(WF, f), 'utf8') }));
}

function referencedTests(workflows) {
  const out = new Set();
  const re = /tests\/[A-Za-z0-9_.\-/]+\.js/g;
  for (const wf of workflows) {
    for (const hit of wf.text.match(re) || []) out.add(hit);
  }
  return out;
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const workflows = readWorkflows();
const referenced = referencedTests(workflows);
const topLevelTests = fs.readdirSync(TESTS)
  .filter((f) => f.endsWith('.js'))
  .map((f) => `tests/${f}`)
  .sort();

console.log('\n🔗 TEST/CI parity contract\n');

const testScript = (pkg.scripts && pkg.scripts.test) || '';
chk('P1 npm test is defined', testScript.length > 0, 'package.json scripts.test is empty');
for (const ep of NPM_TEST_ENTRYPOINTS) {
  chk(`P2 npm test runs ${ep}`, testScript.includes(ep), `not found in scripts.test: ${testScript}`);
}
const inScript = (testScript.match(/tests\/[A-Za-z0-9_.\-/]+\.js/g) || []).sort();
chk('P3 npm test has no undeclared test entrypoint',
  JSON.stringify(inScript) === JSON.stringify([...NPM_TEST_ENTRYPOINTS].sort()),
  `declared=${JSON.stringify(NPM_TEST_ENTRYPOINTS)} actual=${JSON.stringify(inScript)}`);

const dead = [...referenced].filter((t) => !fs.existsSync(path.join(ROOT, t)));
chk('P4 every workflow test reference exists on disk', dead.length === 0, dead.join(', '));
chk('P5 at least one workflow executes tests', referenced.size > 0, 'no tests/*.js references found');

const executed = new Set([...referenced, ...NPM_TEST_ENTRYPOINTS]);
const orphans = topLevelTests.filter((t) => !executed.has(t));
console.log(`\n  📊 measured: ${topLevelTests.length} top-level tests | ${executed.size} wired | ${orphans.length} unwired\n`);
chk(`P6 unwired tests do not exceed registered budget (${ORPHAN_BUDGET})`,
  orphans.length <= ORPHAN_BUDGET,
  `unwired=${orphans.length} > budget=${ORPHAN_BUDGET}`);

for (const testPath of CRITICAL_ORPHANS) {
  chk(`P7 critical orphan exists: ${testPath}`, fs.existsSync(path.join(ROOT, testPath)), testPath);
  chk(`P8 critical orphan is wired: ${testPath}`, referenced.has(testPath), testPath);
}
for (const testPath of EXTRA_FALSE_GREEN_GATES) {
  chk(`P9 false-green gate exists: ${testPath}`, fs.existsSync(path.join(ROOT, testPath)), testPath);
  chk(`P10 false-green gate is wired: ${testPath}`, referenced.has(testPath), testPath);
}

const contractDoc = path.join(ROOT, 'docs', 'TEST_CI_PARITY_CONTRACT.md');
chk('P11 parity contract document exists', fs.existsSync(contractDoc), contractDoc);
if (fs.existsSync(contractDoc)) {
  const doc = fs.readFileSync(contractDoc, 'utf8');
  chk('P12 document states npm test boundary', doc.includes('npm test') && /tests\/run\.js/.test(doc) && /tests\/smoke\.js/.test(doc));
  chk('P13 document records orphan budget', doc.includes(String(ORPHAN_BUDGET)), String(ORPHAN_BUDGET));
}

console.log('\n' + '─'.repeat(60));
console.log(`TEST/CI parity: ${pass} pass / ${fail} fail`);
if (fail > 0) {
  for (const f of failures) console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}
console.log('✅ TEST/CI parity contract holds.');

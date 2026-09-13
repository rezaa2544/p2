#!/usr/bin/env node
/* Supply-chain regression gate: SPDX, licenses, audit snapshot, and drift. */
'use strict';
const fs = require('fs');
const path = require('path');
const tool = require('../tools/supply-chain-audit');

const ROOT = path.join(__dirname, '..');
const docs = (name) => path.join(ROOT, 'docs', name);
const lockText = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
const lock = JSON.parse(lockText);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(docs('DEPENDENCY_DRIFT_BASELINE.json'), 'utf8'));
const sbom = JSON.parse(fs.readFileSync(docs('SBOM.spdx.json'), 'utf8'));
const audit = JSON.parse(fs.readFileSync(docs('NPM_AUDIT_2026_Q3.json'), 'utf8'));
let pass = 0;
let fail = 0;
function test(name, condition, detail) {
  if (condition) { pass += 1; console.log('  ✅ ' + name); }
  else { fail += 1; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n▸ Supply-chain audit regression gate');
const inv = tool.inventory(lock);
const validBaseline = tool.validateBaseline(baseline, lockText, lock, pkg);
const validSbom = tool.validateSbom(sbom, lockText, lock, pkg);
const direct = tool.directResolutions(lock, pkg);

test('SC-01 SPDX 2.3 SBOM exists and maps every lockfile package',
  sbom.spdxVersion === 'SPDX-2.3' && sbom.packages.length === inv.length + 1 && validSbom.ok,
  validSbom.errors.join('; '));
test('SC-02 every third-party package declares a license',
  sbom.packages.slice(1).every((entry) => entry.licenseDeclared && entry.licenseDeclared !== 'NOASSERTION'),
  'unknown=' + sbom.packages.slice(1).filter((entry) => entry.licenseDeclared === 'NOASSERTION').length);
test('SC-03 license inventory is present and records the lockfile fingerprint',
  fs.existsSync(docs('THIRD_PARTY_LICENSES.md')) && fs.readFileSync(docs('THIRD_PARTY_LICENSES.md'), 'utf8').includes(baseline.lockfile_sha256));
test('SC-04 audit snapshot has no production advisories',
  audit.metadata && audit.metadata.vulnerabilities && audit.metadata.vulnerabilities.total === 0,
  JSON.stringify(audit.metadata && audit.metadata.vulnerabilities));
test('SC-05 current lockfile equals the approved dependency drift baseline', validBaseline.ok, validBaseline.errors.join('; '));
test('SC-06 every direct dependency has a locked resolution',
  Object.values(direct).every((entry) => entry.resolved && entry.declared),
  JSON.stringify(direct));

/* Mutation: a one-byte lockfile change must trip the fingerprint gate. */
const drift = tool.validateBaseline(baseline, lockText + '\n ', lock, pkg);
test('SC-07 simulated lockfile drift is detected', !drift.ok && drift.errors.some((entry) => entry.includes('SHA-256 drift')), drift.errors.join('; '));

console.log('\nsupply-chain: ' + pass + '/' + (pass + fail) + ' checks' + (fail ? ' — FAILED' : ' ✅'));
process.exit(fail ? 1 : 0);

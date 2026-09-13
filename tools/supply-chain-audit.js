#!/usr/bin/env node
/* Supply-chain inventory, SPDX SBOM and deterministic dependency-drift gate.
   Usage:
     node tools/supply-chain-audit.js --write
     node tools/supply-chain-audit.js --check
*/
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const DOCS = path.join(ROOT, 'docs');
const SBOM_PATH = path.join(DOCS, 'SBOM.spdx.json');
const BASELINE_PATH = path.join(DOCS, 'DEPENDENCY_DRIFT_BASELINE.json');
const LICENSES_PATH = path.join(DOCS, 'THIRD_PARTY_LICENSES.md');
const AUDIT_PATH = path.join(DOCS, 'NPM_AUDIT_2026_Q3.json');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function packageId(index) { return 'SPDXRef-Package-' + String(index + 1); }
function purl(name, version) {
  /* A minimal, deterministic npm PURL. Scoped names need the slash encoded. */
  return 'pkg:npm/' + encodeURIComponent(name).replace(/%40/g, '@') + '@' + encodeURIComponent(version);
}
/* npm lockfile integrity is an SRI digest, e.g. sha512-base64. Preserve its
   real algorithm and digest in SPDX; never relabel a hash of the SRI string
   as the package artifact hash. */
function integrityChecksum(integrity) {
  const hit = /^sha(256|384|512)-([A-Za-z0-9+/=]+)$/.exec(String(integrity || ''));
  if (!hit) return null;
  return { algorithm: 'SHA' + hit[1], checksumValue: Buffer.from(hit[2], 'base64').toString('hex') };
}
function inventory(lock) {
  const packages = lock.packages || {};
  return Object.keys(packages).filter((key) => key.startsWith('node_modules/')).map((key) => {
    const item = packages[key] || {};
    const name = key.slice('node_modules/'.length);
    return {
      name,
      version: String(item.version || ''),
      license: String(item.license || 'NOASSERTION'),
      dev: !!item.dev,
      integrity: item.integrity || null
    };
  }).filter((item) => item.name && item.version).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}
function directResolutions(lock, pkg) {
  const merged = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
  const out = {};
  Object.keys(merged).sort().forEach((name) => {
    const resolved = (lock.packages || {})['node_modules/' + name];
    out[name] = { declared: merged[name], resolved: resolved && resolved.version ? String(resolved.version) : null };
  });
  return out;
}
function makeBaseline(lockText, lock, pkg) {
  const packages = inventory(lock);
  return {
    schema: 'payesh-dependency-drift/v1',
    generated_at: '2026-09-11',
    lockfile: 'package-lock.json',
    lockfile_version: lock.lockfileVersion,
    lockfile_sha256: sha256(lockText),
    package_count: packages.length,
    direct_dependencies: directResolutions(lock, pkg)
  };
}
function makeSbom(lockText, lock, pkg) {
  const packages = inventory(lock);
  const rootId = 'SPDXRef-RootPackage';
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: (pkg.name || 'payesh') + '-sbom',
    documentNamespace: 'https://github.com/rezaa2544/p2/sbom/' + sha256(lockText).slice(0, 24),
    creationInfo: {
      created: '2026-09-11T00:00:00Z',
      creators: ['Tool: payesh-supply-chain-audit/1.0']
    },
    packages: [{
      SPDXID: rootId,
      name: pkg.name || 'payesh',
      versionInfo: pkg.version || 'NOASSERTION',
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: pkg.license || 'NOASSERTION',
      licenseDeclared: pkg.license || 'NOASSERTION',
      copyrightText: 'NOASSERTION'
    }].concat(packages.map((item, index) => ({
      SPDXID: packageId(index),
      name: item.name,
      versionInfo: item.version,
      downloadLocation: 'https://registry.npmjs.org/' + item.name,
      filesAnalyzed: false,
      licenseConcluded: item.license,
      licenseDeclared: item.license,
      copyrightText: 'NOASSERTION',
      externalRefs: [{ referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: purl(item.name, item.version) }],
      checksums: integrityChecksum(item.integrity) ? [integrityChecksum(item.integrity)] : []
    }))),
    relationships: packages.filter((item) => Object.prototype.hasOwnProperty.call(pkg.dependencies || {}, item.name) || Object.prototype.hasOwnProperty.call(pkg.devDependencies || {}, item.name)).map((item) => ({
      spdxElementId: rootId,
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: packageId(packages.indexOf(item))
    })),
    annotations: [{
      annotationDate: '2026-09-11T00:00:00Z',
      annotationType: 'OTHER',
      annotator: 'Tool: payesh-supply-chain-audit/1.0',
      comment: 'Lockfile SHA256: ' + sha256(lockText)
    }]
  };
}
function makeLicenses(lockText, lock) {
  const packages = inventory(lock);
  const byLicense = {};
  packages.forEach((item) => { (byLicense[item.license] = byLicense[item.license] || []).push(item); });
  const summary = Object.keys(byLicense).sort().map((name) => '| ' + name + ' | ' + byLicense[name].length + ' |').join('\n');
  const rows = packages.map((item) => '| `' + item.name.replace(/`/g, '') + '` | `' + item.version + '` | ' + item.license + ' | ' + (item.dev ? 'development' : 'runtime') + ' |').join('\n');
  return '# Third-party licenses\n\n' +
    '> Generated from `package-lock.json` by `node tools/supply-chain-audit.js --write`. Do not hand-edit.\n\n' +
    'Lockfile SHA256: `' + sha256(lockText) + '`  \n' +
    'Inventory date: 2026-09-11  \n' +
    'Packages inventoried: **' + packages.length + '**\n\n' +
    '## License distribution\n\n| License | Packages |\n|---|---:|\n' + summary + '\n\n' +
    '## Package inventory\n\n| Package | Locked version | Declared license | Scope |\n|---|---|---|---|\n' + rows + '\n';
}
function validateBaseline(baseline, lockText, lock, pkg) {
  const errors = [];
  const actual = makeBaseline(lockText, lock, pkg);
  if (!baseline || baseline.schema !== actual.schema) errors.push('baseline schema is missing or unsupported');
  if (!baseline || baseline.lockfile_sha256 !== actual.lockfile_sha256) errors.push('package-lock.json SHA-256 drift detected');
  if (!baseline || baseline.lockfile_version !== actual.lockfile_version) errors.push('lockfile version drift detected');
  if (!baseline || baseline.package_count !== actual.package_count) errors.push('resolved package count drift detected');
  Object.keys(actual.direct_dependencies).forEach((name) => {
    const expected = baseline && baseline.direct_dependencies && baseline.direct_dependencies[name];
    const current = actual.direct_dependencies[name];
    if (!expected || expected.declared !== current.declared || expected.resolved !== current.resolved) errors.push('direct dependency drift: ' + name);
  });
  return { ok: errors.length === 0, errors, actual };
}
function validateSbom(sbom, lockText, lock, pkg) {
  const actual = makeSbom(lockText, lock, pkg);
  const errors = [];
  if (!sbom || sbom.spdxVersion !== 'SPDX-2.3') errors.push('SBOM is not SPDX-2.3');
  if (!sbom || !Array.isArray(sbom.packages) || sbom.packages.length !== actual.packages.length) errors.push('SBOM package count does not match lockfile');
  const annotation = sbom && Array.isArray(sbom.annotations) ? sbom.annotations[0] : null;
  if (!annotation || annotation.comment !== actual.annotations[0].comment) errors.push('SBOM lockfile fingerprint is stale');
  const unknown = (sbom && sbom.packages || []).slice(1).filter((entry) => entry.licenseDeclared === 'NOASSERTION');
  if (unknown.length) errors.push('SBOM contains packages with unknown license: ' + unknown.slice(0, 5).map((entry) => entry.name).join(', '));
  return { ok: errors.length === 0, errors, actual };
}
function writeArtifacts() {
  const lockText = fs.readFileSync(LOCK_PATH, 'utf8');
  const lock = JSON.parse(lockText);
  const pkg = readJson(PACKAGE_PATH);
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(SBOM_PATH, JSON.stringify(makeSbom(lockText, lock, pkg), null, 2) + '\n');
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(makeBaseline(lockText, lock, pkg), null, 2) + '\n');
  fs.writeFileSync(LICENSES_PATH, makeLicenses(lockText, lock));
  console.log('Wrote SPDX SBOM, license inventory, and drift baseline for ' + inventory(lock).length + ' packages.');
}
function checkArtifacts() {
  const lockText = fs.readFileSync(LOCK_PATH, 'utf8');
  const lock = JSON.parse(lockText);
  const pkg = readJson(PACKAGE_PATH);
  const baseline = fs.existsSync(BASELINE_PATH) ? readJson(BASELINE_PATH) : null;
  const sbom = fs.existsSync(SBOM_PATH) ? readJson(SBOM_PATH) : null;
  const drift = validateBaseline(baseline, lockText, lock, pkg);
  const sbomCheck = validateSbom(sbom, lockText, lock, pkg);
  const required = [LICENSES_PATH, AUDIT_PATH].filter((file) => !fs.existsSync(file));
  const errors = drift.errors.concat(sbomCheck.errors).concat(required.map((file) => 'required audit artifact missing: ' + path.basename(file)));
  if (errors.length) {
    errors.forEach((error) => console.error('❌ ' + error));
    return false;
  }
  console.log('✅ Supply-chain drift gate: lockfile, ' + inventory(lock).length + ' SPDX packages, licenses, and audit snapshot are consistent.');
  return true;
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--write')) writeArtifacts();
  if (args.has('--check')) process.exit(checkArtifacts() ? 0 : 1);
  if (!args.has('--write') && !args.has('--check')) {
    console.error('Usage: node tools/supply-chain-audit.js --write|--check');
    process.exit(2);
  }
}
module.exports = { sha256, inventory, directResolutions, makeBaseline, makeSbom, validateBaseline, validateSbom };

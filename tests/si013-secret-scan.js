#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;

function chk(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log('  PASS  ' + name);
  } else {
    fail += 1;
    console.log('  FAIL  ' + name + (detail ? ' :: ' + String(detail).slice(0, 220) : ''));
  }
}

function buildFixtureRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-si013-'));
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'infra', 'observability'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tests', 'secret-scan.js'), path.join(dir, 'tests', 'secret-scan.js'));
  fs.copyFileSync(path.join(ROOT, '.gitignore'), path.join(dir, '.gitignore'));
  fs.copyFileSync(
    path.join(ROOT, 'infra', 'observability', 'alert-rules.yml'),
    path.join(dir, 'infra', 'observability', 'alert-rules.yml')
  );
  return dir;
}

function writeRel(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function runScanner(root) {
  return spawnSync(process.execPath, [path.join(root, 'tests', 'secret-scan.js')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000
  });
}

const VALID_SHA256 = 'c04261fa4efbc9a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899';
const FAKE_JWT_COOKIE = 'payesh_' + 'session='
  + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
  + 'eyJzdWIiOjEwNCwicm9sZSI6InRlYWNoZXIiLCJzY2hvb2xfaWQiOjF9.'
  + 'abcdef0123456789ABCDEF_-abcdef0123456789abc';

// 1. Positive fixture: verified SHA-256 evidence hashes under docs/arena-evidence/** and tools/ft/** pass.
{
  const root = buildFixtureRoot();
  try {
    writeRel(
      root,
      'docs/arena-evidence/2026-09-25/arena8-dr/evidence/sample.json',
      JSON.stringify({ stdout: '{"postgres":{"verified":true,"checksum":"' + VALID_SHA256 + '"}}' }, null, 2) + '\n'
    );
    writeRel(
      root,
      'tools/ft/FT-METRIC-01-SAMPLE-PACKAGE.md',
      '| `tools/ft/metric-v2.js` | `' + VALID_SHA256 + '` | verified |\n'
    );
    const res = runScanner(root);
    chk('positive fixture: scoped SHA-256 evidence hashes pass secret-scan', res.status === 0, res.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// 2. Negative fixtures: secrets, tokens, cookies, non-64 hex, and production code paths MUST fail closed.
const NEGATIVE_CASES = [
  {
    name: 'negative fixture: api_key inside docs/arena-evidence/** fails closed',
    rel: 'docs/arena-evidence/2026-09-25/arena8-dr/evidence/leak.json',
    body: JSON.stringify({ stdout: '{"api_key":"' + VALID_SHA256 + '"}' }, null, 2) + '\n'
  },
  {
    name: 'negative fixture: 65-char non-SHA256 hex inside docs/arena-evidence/** fails closed',
    rel: 'docs/arena-evidence/2026-09-25/arena8-dr/evidence/non-sha256.json',
    body: JSON.stringify({ stdout: '{"checksum":"' + VALID_SHA256 + 'a"}' }, null, 2) + '\n'
  },
  {
    name: 'negative fixture: secret inside tools/ft/FT-METRIC-01-*.md fails closed',
    rel: 'tools/ft/FT-METRIC-01-LEAK.md',
    body: 'const api_secret = "' + VALID_SHA256 + '";\n'
  },
  {
    name: 'negative fixture: checksum shape inside server production code fails closed',
    rel: 'server/leak.js',
    body: 'const payload = "{\\"checksum\\": \\"' + VALID_SHA256 + '\\"}";\nmodule.exports = payload;\n'
  },
  {
    name: 'negative fixture: session JWT cookie inside performance results fails closed',
    rel: 'tests/performance/results/w18-load.json',
    body: JSON.stringify({ setup_data: { sess: { cookie: FAKE_JWT_COOKIE } }, metrics: {} }, null, 2) + '\n'
  }
];

for (const tc of NEGATIVE_CASES) {
  const root = buildFixtureRoot();
  try {
    writeRel(root, tc.rel, tc.body);
    const res = runScanner(root);
    chk(tc.name, res.status === 1, 'status=' + res.status + ' out=' + String(res.stdout || '').slice(-160));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// 3. Repository HEAD invariants: w18-*.json preserve non-sensitive k6 metrics without session cookies/PII.
const w18Dir = path.join(ROOT, 'tests', 'performance', 'results');
const w18Files = fs.readdirSync(w18Dir).filter((f) => /^w18-.*\.json$/.test(f)).sort();
chk('w18 results inventory preserved (5 scenarios)', w18Files.length === 5, JSON.stringify(w18Files));
for (const file of w18Files) {
  const full = path.join(w18Dir, file);
  const raw = fs.readFileSync(full, 'utf8');
  const parsed = JSON.parse(raw);
  const sess = (parsed.setup_data && parsed.setup_data.sess) || {};
  chk(file + ': metrics and workload model preserved',
    Boolean(parsed.metrics && parsed.metrics.http_reqs && parsed.setup_data && parsed.setup_data.model));
  chk(file + ': sensitive cookie/session user fields removed',
    sess.cookie === undefined
      && sess.user === undefined
      && !/payesh_session=|phone_masked|full_name/.test(raw));
}

const liveScan = runScanner(ROOT);
chk('live repository secret-scan passes with exit 0', liveScan.status === 0, liveScan.stdout);

console.log('\nsi013-secret-scan: ' + pass + '/' + (pass + fail) + (fail ? ' FAILED' : ' PASSED'));
process.exitCode = fail ? 1 : 0;

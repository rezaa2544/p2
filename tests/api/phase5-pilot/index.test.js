#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/phase5-pilot/index.test.js
   Phase 5 National Pilot API Master Suite (P2-PL-01)

   M15-01 / Chat 2 — this nested aggregator was outside every gate:
     • scripts/run-all-tests.sh discovers `tests/*.js` (flat) and
       `tests/api/runner.js`, never `tests/api/<dir>/*.test.js`
     • tests/ci-test-parity-contract.js inventoried tests/api/ flat only
   It is now registered in tests/api/runner.js and the parity contract
   walks tests/api/ recursively.

   The aggregator no longer asserts "100% success" from an exit code. It
   forwards the child's own execution evidence (pass/fail/skip counts) and
   declares that evidence itself, so the runner's contract applies here too.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { reportSuiteResult, parseSuiteResult, countOkLines, MARKER_PREFIX } = require('../suite-contract');

const CHILD = path.join(__dirname, '..', 'phase5-pilot.test.js');
const CHILD_TIMEOUT_MS = Number(process.env.PAYESH_API_SUITE_TIMEOUT_MS) > 0
  ? Number(process.env.PAYESH_API_SUITE_TIMEOUT_MS)
  : 240000;

function stripMarkers(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(MARKER_PREFIX))
    .join('\n');
}

function run() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🏛️  اجرای آزمون‌های یکپارچه API پایلوت ملی و فدراسیون (P2-PL-01)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let stdout = '';
  let stderr = '';
  let code = 0;
  try {
    stdout = execFileSync(process.execPath, [CHILD], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: CHILD_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024
    });
  } catch (err) {
    code = err && err.status != null ? err.status : 1;
    stdout = (err && err.stdout) || '';
    stderr = (err && err.stderr) || (err && err.message) || '';
  }

  const echoed = stripMarkers(stdout).trim();
  if (echoed) console.log(echoed);
  if (stderr.trim()) console.error(stderr.trim());

  const { markers, malformed } = parseSuiteResult(stdout);
  if (code !== 0 || malformed.length > 0 || markers.length !== 1) {
    console.error('\n❌ Phase 5 Pilot API Suite Failed — the child declared no usable execution evidence ' +
      '(exit=' + code + ', markers=' + markers.length + ', malformed=' + malformed.length + ').');
    process.exit(1);
  }

  const child = markers[0];
  const observed = countOkLines(stdout);
  if (child.fail > 0 || child.skip > 0 || child.pass <= 0 || observed !== child.pass) {
    console.error('\n❌ Phase 5 Pilot API child evidence is not green: ' + JSON.stringify({
      pass: child.pass, fail: child.fail, skip: child.skip, printedOkLines: observed
    }));
    process.exit(1);
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log('نتیجه آزمون‌های Phase 5 Pilot API: ' + child.pass + ' آزمون موفق، ۰ ناموفق، ۰ skip');
  console.log('────────────────────────────────────────────────────');
  reportSuiteResult({ name: 'phase5-pilot/index', pass: child.pass, fail: child.fail, skip: child.skip });
}

run();

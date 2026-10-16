#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/zero-suite-fail-closed.test.js
   Issue #454 item 3 — regression for the API runner's zero-suite guard.

   Proves tests/api/runner.js fails closed (exit code 1) when the suite
   registry is empty, null, or names a suite that cannot execute. Before
   the guard an empty registry printed "0/0" and exited 0 — a false-green.

   Mutation-sensitivity: deleting the `!Array.isArray(suites) ||
   suites.length === 0` branch in runSuites() makes check #2 RED.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const { runSuites, API_TESTS } = require(path.join(__dirname, 'api', 'runner.js'));

let pass = 0, fail = 0;
function chk(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.error('  ❌ ' + name); }
}

// 1) the live registry is non-empty — the runner actually has work to do
chk('real registry is non-empty', Array.isArray(API_TESTS) && API_TESTS.length > 0);

// 2) an EMPTY registry must fail closed (was exit 0 = false-green)
chk('empty registry fails closed (exit 1)', runSuites([]) === 1);

// 3) a non-array registry must fail closed
chk('non-array registry fails closed (exit 1)', runSuites(null) === 1);

// 4) a registry naming a suite that cannot run must fail closed, not skip
chk('unrunnable suite fails closed (exit 1)', runSuites(['__definitely_missing__.test.js']) === 1);

console.log(`\n${fail === 0 ? '✅' : '❌'} zero-suite fail-closed: ${pass}/${pass + fail} ` +
  `${fail === 0 ? '— بدون خطا' : '— ' + fail + ' ناموفق'}`);
process.exit(fail === 0 ? 0 : 1);

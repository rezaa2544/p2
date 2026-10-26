#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/suite-contract.js — execution-evidence contract for the
   REST API suite layer (M15-01 / Chat 2, false-green elimination).

   WHY THIS FILE EXISTS
   ────────────────────
   Before this contract, tests/api/runner.js treated "child process exited 0"
   as "suite passed". Exit code alone cannot distinguish:

     • a suite that executed 7 real assertions           (real green)
     • a suite that skipped every assertion on a missing
       env var / feature flag and exited 0               (false green)
     • a suite whose tests never ran because a conditional
       block was never entered                          (false green)
     • a suite that counted failures into `fail` but the
       author forgot to `process.exit(1)`                (false green)
     • a suite that printed a ✅ banner without asserting (false green)

   Every suite in the registry therefore declares its own counts on stdout
   through reportSuiteResult(). The runner requires exactly one well-formed
   marker, requires pass > 0, requires fail === 0 and skip === 0, and
   cross-checks the declared pass count against the number of ✅ lines the
   suite actually printed. Any violation is a hard RED — a suite can no
   longer be green by exiting 0.

   USAGE (inside a suite)
   ──────────────────────
     const { reportSuiteResult } = require('./suite-contract');
     ...
     reportSuiteResult({ name: 'students', pass, fail });   // skip == 0
     if (fail > 0) process.exit(1);

   A suite that legitimately cannot run must NOT exit 0. It must exit
   non-zero (fail-closed) — "not run" is never a pass.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');

const MARKER_PREFIX = 'PAYESH_SUITE_RESULT ';
const RESULT_RE = /^PAYESH_SUITE_RESULT (\{.*\})\s*$/gm;

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

/**
 * Emit the canonical execution-evidence marker for this suite.
 * Throws on malformed input instead of emitting a marker the runner
 * would have to guess about (fail-closed at the producer side).
 */
function reportSuiteResult({ name, pass, fail = 0, skip = 0 } = {}) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('reportSuiteResult: name must be a non-empty string');
  }
  if (!isNonNegInt(pass) || !isNonNegInt(fail) || !isNonNegInt(skip)) {
    throw new Error('reportSuiteResult: pass/fail/skip must be non-negative integers, got ' +
      JSON.stringify({ pass, fail, skip }));
  }
  const payload = { name, file: path.basename(process.argv[1] || ''), pass, fail, skip };
  const line = MARKER_PREFIX + JSON.stringify(payload);
  process.stdout.write(line + '\n');
  return line;
}

/**
 * Parse every marker in a suite's stdout.
 * Returns { markers, malformed } — the runner decides the verdict so the
 * rules stay in one place (tests/api/runner.js).
 */
function parseSuiteResult(stdout) {
  const text = String(stdout || '');
  const markers = [];
  const malformed = [];
  RESULT_RE.lastIndex = 0;
  let m;
  while ((m = RESULT_RE.exec(text)) !== null) {
    let parsed;
    try { parsed = JSON.parse(m[1]); } catch (_err) { malformed.push(m[1]); continue; }
    if (!parsed || typeof parsed !== 'object'
      || typeof parsed.name !== 'string'
      || typeof parsed.file !== 'string'
      || !isNonNegInt(parsed.pass) || !isNonNegInt(parsed.fail) || !isNonNegInt(parsed.skip)) {
      malformed.push(m[1]);
      continue;
    }
    markers.push(parsed);
  }
  /* A marker line that starts with the prefix but does not parse is a
     malformed declaration — never silently ignored. */
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith(MARKER_PREFIX) && !/^PAYESH_SUITE_RESULT \{.*\}\s*$/.test(line)) {
      malformed.push(line);
    }
  }
  return { markers, malformed };
}

/**
 * Number of ✅ RESULT lines printed by a suite (its own evidence).
 *
 * Only lines that START with ✅ (after indentation) count. Summary/banner
 * lines such as "کل آزمونها: ۱۳ آزمون موفق — بدون خطا ✅" mention the emoji
 * without being a test result, and counting them made the declared count
 * drift by one. Result lines are the ones a reader can count one-to-one
 * against executed assertions.
 */
function countOkLines(stdout) {
  const text = String(stdout || '');
  return text.split(/\r?\n/).filter((line) => /^\s*✅/.test(line)).length;
}

module.exports = { MARKER_PREFIX, reportSuiteResult, parseSuiteResult, countOkLines };

#!/usr/bin/env node
/**
 * tools/ft/tests/metric-v2.test.js — FT-METRIC-01 mandatory negative+positive suite
 *
 * Every case builds a SYNTHETIC {instruction, expected, response} row, runs it
 * through the real metric, and asserts the verdict. No result is hardcoded:
 * each case ends in a real assert on the metric's own output fields.
 *
 * Run: node tools/ft/tests/metric-v2.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const assert = require('assert');

// FT_METRIC_V2_PATH lets tools/ft/mutation-test.sh point this suite at a
// MUTATED COPY of the metric without copying or editing this test file.
// When unset, the real metric next door is used.
const METRIC = process.env.FT_METRIC_V2_PATH
  ? path.resolve(process.env.FT_METRIC_V2_PATH)
  : path.resolve(__dirname, '..', 'metric-v2.js');
const TMP = path.resolve(__dirname, '__rows.tmp.jsonl');

function runMetric(rows) {
  fs.writeFileSync(TMP, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  const out = execFileSync(process.execPath, [METRIC, '--rows', TMP], { encoding: 'utf8' });
  return JSON.parse(out);
}

// ---------- fixtures ----------
const INSTR = 'Add a shared PAYESH_OTP_PEPPER to the multi-instance OTP ratelimit harness config.';
const PLAIN_INSTR = 'Engineering lesson about waiting on child processes before allowing exit 0.';
const PLAIN_EXPECTED = 'Any wait on a child must be guarded: verify the child is alive and the event actually fired before allowing exit 0.';
const GOOD_DIFF =
  '```\nfix(a-02): add shared pepper\n\nThe harness now sets PAYESH_OTP_PEPPER.\n```\n\n' +
  '```diff\ndiff --git a/h.js b/h.js\nindex 1111111..2222222 100644\n--- a/h.js\n+++ b/h.js\n@@ -10,6 +10,8 @@ function boot() {\n   const k = key();\n+  // shared pepper\n+  process.env.PAYESH_OTP_PEPPER = "pepper";\n   return k;\n}\n```';

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

console.log('=== FT-METRIC-01 metric-v2 test suite ===');

// ---- 1. response exactly equal to the instruction (prompt echo) ----
check('1. exact prompt echo is flagged ECHO and fails', () => {
  const rep = runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: INSTR }]);
  const r = rep.rows[0];
  assert.strictEqual(r.echo_status, 'EXACT', `got ${r.echo_status}`);
  assert.strictEqual(r.format_status, 'FORMAT_FAIL', 'echo of a DIFF task must not satisfy the format contract');
  assert.strictEqual(r.fail_reason && r.fail_reason.startsWith('FORMAT_FAIL'), true);
});

// ---- 2. near-duplicate echo (instruction + bookkeeping noise) ----
check('2. near-duplicate echo is flagged CONTAINED', () => {
  const noise = INSTR + '\n\n### Response:\n';
  const rep = runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: noise }]);
  const r = rep.rows[0];
  // 'response' and '###' are <=2 chars -> filtered by tokenizer -> meaningful=0
  assert.strictEqual(r.echo_status, 'CONTAINED', `got ${r.echo_status} — detail: ${r.echo_detail}`);
  assert.strictEqual(r.format_status, 'FORMAT_FAIL');
});

// ---- 3. response lacking the required diff format for a DIFF task ----
check('3. no diff block on a DIFF task -> FORMAT_FAIL', () => {
  const rep = runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: 'I would add a pepper variable to the config file.' }]);
  const r = rep.rows[0];
  assert.strictEqual(r.format_status, 'FORMAT_FAIL');
  assert.strictEqual(r.format_kind, 'DIFF');
  assert.ok(/no fenced/.test(r.format_clause), r.format_clause);
  assert.strictEqual(r.echo_status, 'NONE');
});

// ---- 3b. degenerate diff: fence present but zero hunks ----
check('3b. fenced diff block with no hunk headers -> FORMAT_FAIL', () => {
  const resp = '```diff\nsome words here\nmore words\n```';
  const rep = runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: resp }]);
  const r = rep.rows[0];
  assert.strictEqual(r.format_status, 'FORMAT_FAIL');
  assert.ok(/hunk/.test(r.format_clause), r.format_clause);
});

// ---- 4. valid diff on a DIFF task -> FORMAT_OK, non-zero content ----
check('4. valid diff on a DIFF task passes format', () => {
  const rep = runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: GOOD_DIFF }]);
  const r = rep.rows[0];
  assert.strictEqual(r.format_status, 'FORMAT_OK', r.format_clause);
  assert.strictEqual(r.echo_status, 'NONE');
  assert.ok(r.content_score_v2 > 0, 'identical diff must score > 0');
  assert.strictEqual(r.content_slice, 'diff');
  assert.ok(r.msg_score !== null, 'DIFF rows must report the message slice');
});

// ---- 5. non-diff response on a PLAIN task is correct, not a format failure ----
check('5. plain response on a PLAIN task is FORMAT_OK', () => {
  const resp = 'Every helper whose null return is later dereferenced must be asserted non-null at the call site.';
  const rep = runMetric([{ instruction: PLAIN_INSTR, expected: PLAIN_EXPECTED, response: resp }]);
  const r = rep.rows[0];
  assert.strictEqual(r.format_kind, 'PLAIN');
  assert.strictEqual(r.format_status, 'FORMAT_OK', r.format_clause);
  assert.strictEqual(r.content_slice, 'full');
});

// ---- 6. empty / truncated response ----
check('6. empty response is FORMAT_FAIL and scores 0', () => {
  const rep = runMetric([
    { instruction: INSTR, expected: GOOD_DIFF, response: '' },
    { instruction: PLAIN_INSTR, expected: PLAIN_EXPECTED, response: '' },
  ]);
  assert.strictEqual(rep.rows[0].format_status, 'FORMAT_FAIL');
  assert.strictEqual(rep.rows[1].format_status, 'FORMAT_FAIL');
  assert.strictEqual(rep.rows[0].content_score_v2, 0);
  assert.strictEqual(rep.rows[1].content_score_v2, 0);
  assert.strictEqual(rep.summary.n_format_fail, 2);
});

// ---- 7. historical report is NOT modified by running the new metric ----
check('7. old report byte-identical after a v2 run, numbers unchanged', () => {
  const repPath = path.resolve(__dirname, '..', 'benchmark-report.json');
  const old = fs.readFileSync(repPath, 'utf8');
  runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: INSTR }]);
  const after = fs.readFileSync(repPath, 'utf8');
  assert.strictEqual(old, after, 'benchmark-report.json must be byte-identical after a v2 run');
  // and the old numbers are still exactly the historically reported ones
  const j = JSON.parse(after);
  assert.strictEqual(j.base_mean_similarity, 0.126);
  assert.strictEqual(j.tuned_mean_similarity, 0.21);
  assert.strictEqual(j.delta, 0.084);
  assert.strictEqual(j.n, 2);
});

// ---- 7b. v2 never opens the old report for writing ----
check('7b. metric-v2 source contains no write to the old report path', () => {
  const src = fs.readFileSync(METRIC, 'utf8');
  // a write would look like writeFileSync(...benchmark-report.json...) — allow
  // doc/comment mentions, reject an actual write call targeting it
  const bad = /writeFileSync\s*\(\s*[^)]*benchmark-report\.json/.test(src);
  assert.strictEqual(bad, false, 'metric-v2 must never write benchmark-report.json');
});

// ---- 8. invalid input / missing data -> explicit failure, never false green ----
check('8. malformed jsonl row makes the metric exit non-zero', () => {
  fs.writeFileSync(TMP, 'this is not json\n');
  let code = 0;
  try {
    execFileSync(process.execPath, [METRIC, '--rows', TMP], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) { code = e.status; }
  assert.notStrictEqual(code, 0, 'malformed input must not exit 0');
});

// ---- 8b. missing --rows -> usage error, not silent success ----
check('8b. no --rows -> exit 2', () => {
  let code = 0;
  try { execFileSync(process.execPath, [METRIC], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { code = e.status; }
  assert.strictEqual(code, 2);
});

// ---- 9. echo detection is label-independent: same echo, different expected ----
check('9. echo verdict does not depend on the ground truth', () => {
  const a = runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: INSTR }]);
  const b = runMetric([{ instruction: INSTR, expected: 'totally different expected text', response: INSTR }]);
  assert.strictEqual(a.rows[0].echo_status, b.rows[0].echo_status, 'echo must be a property of (instr,resp) only');
});

// ---- 10. a diff that merely quotes the instruction inside a fence is still caught ----
check('10. instruction echoed inside a fenced block does not pass as a diff', () => {
  const resp = '```diff\n' + INSTR + '\n```';
  const rep = runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: resp }]);
  const r = rep.rows[0];
  assert.strictEqual(r.format_status, 'FORMAT_FAIL');
  assert.strictEqual(r.echo_status, 'NONE', 'not a pure echo (has a fence), so echo is NONE but format still fails');
});

// ---- 11. PLAIN task: a stray diff fence is tolerated; short answer fails ----
check('11. PLAIN task tolerates a stray diff block but rejects a fragment', () => {
  const ok = runMetric([{ instruction: PLAIN_INSTR, expected: PLAIN_EXPECTED,
    response: PLAIN_EXPECTED + '\n\n```diff\nx\n```' }]);
  assert.strictEqual(ok.rows[0].format_status, 'FORMAT_OK', ok.rows[0].format_clause);
  const bad = runMetric([{ instruction: PLAIN_INSTR, expected: PLAIN_EXPECTED, response: 'ok' }]);
  assert.strictEqual(bad.rows[0].format_status, 'FORMAT_FAIL');
});

// ---- 4b. v1 word-tokens are BLIND to a symbol-only patch payload ------------
// POSITIVE control: the response reproduces the payload exactly.
// NEGATIVE control: the response keeps the diff metadata (diff --git / hunk /
//   commit message) but REPLACES the symbol payload with a different one.
// The property under test: v1's \W+ tokenizer cannot see the symbol-only added
// lines, so it must score BOTH identically — while v2 line-tokens distinguish
// them. This is what makes the test a real guard: under the old tb.size bug both
// scores were 0 and the assertion `v1 > 0` would have failed, so the test can
// no longer pass by accident.
check('4b. v1 word-overlap is blind to symbol-only patch payload (positive + negative control)', () => {
  const expDiff = '```diff\ndiff --git a/f.js b/f.js\n@@ -1,3 +1,5 @@\n+  x = { a: 1 };\n+  y = [ 2, 3 ];\n```';
  const exp = '```\nfix\n```\n\n' + expDiff;
  // negative: same metadata + hunk header, but a different symbol payload
  const negDiff = '```diff\ndiff --git a/f.js b/f.js\n@@ -1,3 +1,5 @@\n+  p = { q: 9 };\n+  r = [ 8, 7 ];\n```';
  const negResp = '```\nfix\n```\n\n' + negDiff;

  const pos = runMetric([{ instruction: INSTR, expected: exp, response: exp }]);
  const neg = runMetric([{ instruction: INSTR, expected: exp, response: negResp }]);
  const p = pos.rows[0], n = neg.rows[0];

  // both satisfy the DIFF format contract (diff --git counts as a content line)
  assert.strictEqual(p.format_status, 'FORMAT_OK', p.format_clause);
  assert.strictEqual(n.format_status, 'FORMAT_OK', n.format_clause);
  // POSITIVE: v1 must see the SHARED words (fix/diff/git) — this is the
  // assertion the old .size bug made impossible (v1 was always 0).
  assert.ok(p.v1_content_score > 0, `v1 must see the shared header words (got ${p.v1_content_score})`);
  // THE BLIND SPOT: v1 is identical for a reproduced payload and a replaced one.
  assert.strictEqual(p.v1_content_score, n.v1_content_score,
    'v1 \\W+ overlap must be blind to which symbols the patch adds');
  // v2 line-tokens are NOT blind: the reproduced payload scores higher.
  assert.ok(p.content_score_v2 > n.content_score_v2,
    `v2 line-tokens must distinguish reproduced from replaced payload (${p.content_score_v2} vs ${n.content_score_v2})`);
});

// ---- 12. summary math is real ----
check('12. summary aggregates match the rows', () => {
  const rep = runMetric([
    { instruction: INSTR, expected: GOOD_DIFF, response: INSTR },         // echo + ff
    { instruction: INSTR, expected: GOOD_DIFF, response: GOOD_DIFF },     // ok
    { instruction: PLAIN_INSTR, expected: PLAIN_EXPECTED, response: '' }, // ff
  ]);
  assert.strictEqual(rep.summary.n_echo, 1);
  assert.strictEqual(rep.summary.n_format_fail, 2);
  assert.strictEqual(rep.n, 3);
});

// ---- R1. FORMAT_FAIL does NOT zero the content score (contract stabilization) ----
// Contract read from the real code (metric-v2.js main/out.push):
// content_score_v2 = round(cs.score) is computed UNCONDITIONALLY and fail_reason
// is reported SEPARATELY. A mutated metric that zeroes content_score_v2 whenever
// format_status === 'FORMAT_FAIL' (MUT4) must turn this test red.
check('R1. FORMAT_FAIL reports a non-zero content score, not a forced zero', () => {
  // 0 hunks -> FORMAT_FAIL via the hunk clause, yet the ADD lines still
  // reproduce 4 of the expected diff's 5 line-tokens (2x PATH:h.js, 2x ADD:...).
  const resp = '```diff\ndiff --git a/h.js b/h.js\nindex 1111111..2222222 100644\n--- a/h.js\n+++ b/h.js\n+  // shared pepper\n+  process.env.PAYESH_OTP_PEPPER = "pepper";\n+  return k;\n```';
  const rep = runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: resp }]);
  const r = rep.rows[0];
  assert.strictEqual(r.format_status, 'FORMAT_FAIL', r.format_clause);
  assert.ok(/hunk/.test(r.format_clause), r.format_clause);
  assert.strictEqual(r.content_slice, 'diff');
  assert.ok(r.content_score_v2 > 0, `FORMAT_FAIL must not zero the content score (got ${r.content_score_v2})`);
});

// ---- R2. line-token recall: a diff header alone carries no patch payload ----
// Response quotes the diff METADATA (diff --git / index / --- / +++ headers) but
// none of the expected ADD/DEL payload lines. Under the real v2 line tokenizer
// the recall is exactly 0: the expected diff's tokens are HUNK/ADD:x/ADD:y/ADD:z
// and none is reproduced. Under the v1 \W+ tokenizer (MUT3) the shared prose
// words (diff, git) would collide and the score would be 1.0 — so this fixture
// only passes when the real line-token logic is doing the scoring.
check('R2. diff header without payload lines scores 0 under v2 line-tokens', () => {
  const expDiff = '```diff\ndiff --git a/f.js b/f.js\n@@ -1,3 +1,5 @@\n+  x = { a: 1 };\n+  y = [ 2, 3 ];\n+  z = < 4, 5 >;\n```';
  const exp = '```\nfix\n```\n\n' + expDiff;
  // header-only: no @@ hunk, no ADD/DEL line of the expected patch
  const resp = '```diff\ndiff --git a/f.js b/f.js\nindex 1111111..2222222 100644\n--- a/f.js\n+++ b/f.js\n```';
  const rep = runMetric([{ instruction: INSTR, expected: exp, response: resp }]);
  const r = rep.rows[0];
  assert.strictEqual(r.content_slice, 'diff');
  assert.strictEqual(r.content_score_v2, 0, `header-only diff must recall 0 payload line-tokens (got ${r.content_score_v2})`);
  assert.strictEqual(r.format_status, 'FORMAT_FAIL', r.format_clause);
});

// ---- R3. MIN_DIFF_LINES is load-bearing (MUT2b: 3 -> 0) ----
// The response carries a real hunk header but only 2 content lines, below the
// MIN_DIFF_LINES=3 floor. Flipping MIN_DIFF_LINES to 0 turns this FORMAT_OK and
// this test red. The hunk count is deliberately valid (1 >= 1) so only the
// line-count clause can fire.
check('R3. diff with fewer than MIN_DIFF_LINES content lines is FORMAT_FAIL', () => {
  const resp = '```diff\n@@ -10,6 +10,8 @@ function boot() {\n+  // shared pepper\n+  process.env.PAYESH_OTP_PEPPER = "pepper";\n```';
  const rep = runMetric([{ instruction: INSTR, expected: GOOD_DIFF, response: resp }]);
  const r = rep.rows[0];
  assert.strictEqual(r.format_status, 'FORMAT_FAIL', r.format_clause);
  assert.ok(/content line/.test(r.format_clause), r.format_clause);
});

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.unlinkSync(TMP); } catch (e) { /* ignore */ }
process.exit(fail === 0 ? 0 : 1);

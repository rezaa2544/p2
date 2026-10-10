#!/usr/bin/env node
/**
 * tools/ft/metric-v2.js — FT-METRIC-01: repaired benchmark metric (v2)
 *
 * VERSIONING
 *   v1 (OLD): single token-overlap similarity over the WHOLE expected output.
 *             Formula: |W(resp) ∩ W(exp)| / |W(exp)|, W = lowercase tokens len>2.
 *             Metric file: tools/ft/benchmark.js  (function `sim`).
 *             Report:      tools/ft/benchmark-report.json  (UNTOUCHED by this mission)
 *
 *   v2 (NEW): this file. Separates echo detection, format validation and
 *             content similarity into three independent signals.
 *
 * DESIGN
 *   1. ECHO_STATUS  — is the response just the instruction (prompt echo)?
 *      Two independent detectors:
 *        (a) exact:      resp == instr
 *        (b) containment: instr is fully contained in resp AND resp is
 *            overwhelmingly the instruction (<= ECHO_MAX_EXTRA chars of
 *            non-instruction material). Guards the "near-duplicate" case.
 *      Echo is a property of the (instruction, response) pair only; it never
 *      looks at the ground truth, so it cannot be gamed by the label.
 *
 *   2. FORMAT_STATUS — does the response satisfy the OUTPUT CONTRACT of the row?
 *      The contract is derived from the row's OWN expected output, not assumed:
 *        - if expected contains a ```diff block  -> task is DIFF-BEARING:
 *            response must contain a fenced ```diff block AND the diff must be
 *            non-degenerate: at least MIN_DIFF_HUNKS real hunk headers
 *            (^@@ ... @@) and at least MIN_DIFF_LINES content lines.
 *        - if expected has no diff block       -> task is PLAIN (PEES lesson):
 *            no diff is required; a stray ```diff block is tolerated but the
 *            response must still carry MIN_PLAIN_WORDS of prose.
 *      FORMAT_FAIL is recorded with the exact unmet clause.
 *
 *   3. CONTENT_SCORE — v1 token-overlap recomputed, but ONLY over the material
 *      the task actually asks for:
 *        - DIFF-BEARING: overlap over the diff block only (the engineering
 *          payload). The commit-message prose is reported separately as
 *          MSG_SCORE but does not dilute the diff score.
 *        - PLAIN:        overlap over the whole short expected text.
 *      A FORMAT_FAIL does NOT zero the content score; both are reported.
 *
 *   4. ECHO PENALTY — if ECHO_STATUS != NONE, content_score is reported as-is
 *      but the row is flagged; the caller can see exactly how much of the
 *      "similarity" was the model repeating the prompt.
 *
 * WHY THE THRESHOLDS
 *   ECHO_MAX_EXTRA = 0  — the ground truth for a PEB row is a commit message
 *     + diff, never the instruction text. Any response that IS the instruction
 *     (exactly, or with only structural noise — newlines, EOS markers,
 *     "### Response:" headers) carries zero engineering payload. "Material"
 *     means content words, excluding the scaffolding tokens a chat template
 *     leaks (im_end, endoftext, response/instruction headers). Chosen as an
 *     exact/containment rule rather than a fuzzy threshold because a fuzzy
 *     threshold would need a justifying corpus we do not have (holdout n=2).
 *   MIN_DIFF_HUNKS = 1, MIN_DIFF_LINES = 3 — the smallest real diff in the
 *     dataset (train row 8-smallest PEB) has 2 hunks and >20 content lines;
 *     a response with 0 hunks is not a diff at all, and 1-2 lines is a degenerate
 *     fragment, so 3 content lines is the floor that still rejects noise while
 *     accepting the shortest observed real diff by a wide margin.
 *   MIN_PLAIN_WORDS = 5 — every PEES ground truth in train is a single
 *     sentence of >= 7 words; 5 is the floor that rejects an empty/fragment
 *     answer while accepting every real lesson.
 *
 * LIMITATIONS (documented, not hidden)
 *   - CONTENT_SCORE for PLAIN rows is the same \W+ token-overlap as v1, so v1
 *     and v2 numbers are directly comparable on PLAIN rows.
 *   - CONTENT_SCORE for DIFF rows uses line-token recall (HUNK / ADD: / DEL: /
 *     PATH:), NOT the v1 \W+ split, because the v1 split destroys all diff
 *     structure (a diff whose added lines are entirely symbols scores 0 under
 *     v1 — proven in the test suite, case 4). v1 and v2 DIFF scores are
 *     therefore NOT comparable; v2 DIFF scores are the meaningful ones.
 *   - Line-token recall does not test that the response is a syntactically
 *     valid patch for the right files at the right line numbers — it tests
 *     that the added/removed lines the ground truth expects are present.
 *     `git apply --check` would be the right next step but needs file context
 *     the dataset does not carry, and re-running inference to produce better
 *     outputs is out of scope for this mission.
 *   - Echo detection only fires when the instruction text is present verbatim
 *     in the response. A response that paraphrases the instruction without
 *     adding engineering content would not be flagged by ECHO (it would show
 *     up as a low content score instead). Detecting semantic paraphrase
 *     requires an embedding model and is out of scope.
 *
 * USAGE
 *   node tools/ft/metric-v2.js --rows <inference-output.jsonl>
 *     (--rows is a jsonl of {instruction, expected, response} — exactly what
 *      tools/ft/infer.py --out writes, and exactly what benchmark.js consumed.)
 *   Prints a JSON report to stdout; write it wherever you like.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FT = path.resolve(__dirname);
const DATA = path.join(FT, 'dataset');

const ECHO_MAX_EXTRA = 0;
const MIN_DIFF_HUNKS = 1;
const MIN_DIFF_LINES = 3;
const MIN_PLAIN_WORDS = 5;

// ---------- tokenizer ----------
// v1 compatibility tokenizer: \W+ split, words longer than 2 chars.
// DOCUMENTED v1 LIMITATION: this split destroys ALL diff structure — the `+`/`-`
// line markers, the @@ hunk headers (tokens shorter than 3 chars or pure
// punctuation), and file paths collapse. On a DIFF row v1 therefore measures
// the vocabulary of the COMMIT MESSAGE PROSE, not of the patch. The v1 score
// is still reproduced here (v1_content_score) for comparison and continuity.
function toks(s) {
  return String(s || '').toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function overlap(resp, exp) {
  const ta = new Set(toks(resp));
  const tb = toks(exp);          // Array — use .length, NOT .size (FT-METRIC-01-R1)
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const w of tb) if (ta.has(w)) hit++;
  return hit / tb.length;
}

// ---------- diff tokenizer (v2) ----------
// Line-oriented tokens that actually describe a patch:
//   HUNK         — a @@ ... @@ hunk header
//   ADD:<text>   — an added line  (excluding the +++ file header)
//   DEL:<text>   — a removed line (excluding the --- file header)
//   PATH:<path>  — a file path from the diff --git / index / --- / +++ lines
// This is what makes a diff a diff: which lines were added where.
function diffTokens(diffBody) {
  const out = [];
  const lines = String(diffBody || '').split('\n');
  for (const l of lines) {
    if (/^@@/.test(l)) { out.push('HUNK'); continue; }
    if (/^\+\+\+ /.test(l) || /^--- /.test(l)) {
      const p = l.replace(/^[+-]{3} /, '').split('\t')[0].trim();
      if (p) out.push('PATH:' + p.replace(/^[ab]\//, ''));
      continue;
    }
    if (/^\+/.test(l)) { out.push('ADD:' + l.slice(1).trim()); continue; }
    if (/^-/.test(l))  { out.push('DEL:' + l.slice(1).trim()); continue; }
  }
  return out;
}

// recall of the expected diff's line-tokens in the response's diff.
// Recall (not F1) on purpose, matching v1's asymmetric direction: what fraction
// of the ground-truth patch's signal does the response reproduce.
function diffOverlap(respDiff, expDiff) {
  const tb = diffTokens(expDiff);
  if (!tb.length) return 0;
  const ta = new Set(diffTokens(respDiff));
  if (!ta.size) return 0;
  let hit = 0;
  for (const w of tb) if (ta.has(w)) hit++;
  return hit / tb.length;
}

// Structural scaffolding tokens that survive tokenization but carry no
// engineering material: EOS/BOs markers from the chat template and the
// section headers of the ### Instruction/### Response prompt wrapper.
const NOISE_TOKENS = new Set([
  'im_end', 'im_start', 'endoftext', 'eos', 'bos',
  'response', 'instruction', 'system', 'user', 'assistant',
]);
// "material" tokens: words longer than 2 chars, excluding scaffolding noise.
function materialTokens(s) {
  return toks(s).filter(w => !NOISE_TOKENS.has(w));
}

// ---------- 1. echo detection ----------
// returns {status: 'NONE'|'EXACT'|'CONTAINED', detail}
function echoStatus(instruction, response) {
  const instr = String(instruction || '');
  const resp = String(response || '');
  if (!instr) return { status: 'NONE', detail: 'no instruction' };
  if (!resp) return { status: 'NONE', detail: 'empty response' };

  if (resp.trim() === instr.trim())
    return { status: 'EXACT', detail: 'response == instruction' };

  // near-duplicate: instruction fully contained, and no engineering material added.
  // Only structural noise (newlines, EOS markers, ### Response: headers) is allowed
  // beyond the instruction text — a real answer adds content words.
  if (resp.includes(instr)) {
    const rest = resp.replace(instr, '');
    const material = materialTokens(rest).length;
    if (material <= ECHO_MAX_EXTRA)
      return { status: 'CONTAINED', detail: `instruction is the whole response (${material} material word(s))` };
  }
  return { status: 'NONE', detail: 'response is not an echo of the instruction' };
}

// ---------- 2. output-contract extraction ----------
// The contract comes from the row's own expected output.
function contractOf(expected) {
  const exp = String(expected || '');
  if (/```diff/.test(exp)) return 'DIFF';
  return 'PLAIN';
}

// extract the fenced ```diff ... block body
function diffBlock(s) {
  const m = String(s || '').match(/```diff\n([\s\S]*?)```/);
  return m ? m[1] : '';
}

// ---------- 3. format validation ----------
function formatStatus(expected, response) {
  const kind = contractOf(expected);
  const resp = String(response || '');

  if (kind === 'DIFF') {
    const blk = diffBlock(resp);
    if (!/```diff/.test(resp))
      return { status: 'FORMAT_FAIL', kind, clause: 'no fenced ```diff block in response' };
    if (!blk.trim())
      return { status: 'FORMAT_FAIL', kind, clause: '```diff block is empty' };
    const hunks = (blk.match(/^@@.*@@/gm) || []).length;
    if (hunks < MIN_DIFF_HUNKS)
      return { status: 'FORMAT_FAIL', kind, clause: `diff has ${hunks} hunk header(s), need >= ${MIN_DIFF_HUNKS}` };
    // content lines: non-context, non-header, non-fence lines
    const lines = blk.split('\n').filter(l =>
      l.length > 0 && !/^@@/.test(l) && !/^(---|\+\+\+)/.test(l));
    if (lines.length < MIN_DIFF_LINES)
      return { status: 'FORMAT_FAIL', kind, clause: `diff has ${lines.length} content line(s), need >= ${MIN_DIFF_LINES}` };
    return { status: 'FORMAT_OK', kind, clause: `${hunks} hunk(s), ${lines.length} content line(s)` };
  }

  // PLAIN: no diff required
  const words = toks(resp);
  if (words.length < MIN_PLAIN_WORDS)
    return { status: 'FORMAT_FAIL', kind, clause: `plain response has ${words.length} word(s), need >= ${MIN_PLAIN_WORDS}` };
  return { status: 'FORMAT_OK', kind, clause: `plain prose, ${words.length} word(s)` };
}

// ---------- 4. content score over the task-relevant slice ----------
function contentScore(expected, response) {
  const kind = contractOf(expected);
  if (kind === 'DIFF') {
    const expDiff = diffBlock(expected);
    const respDiff = diffBlock(String(response || ''));
    // line-token recall over the patch — the engineering payload.
    // If the response has no diff block, this is honestly 0.
    return { score: expDiff ? diffOverlap(respDiff, expDiff) : 0, slice: 'diff' };
  }
  return { score: overlap(response, expected), slice: 'full' };
}

// for DIFF rows we also want the commit-message slice reported separately
function msgSliceScore(expected, response) {
  const kind = contractOf(expected);
  if (kind !== 'DIFF') return null;
  const expMsg = String(expected || '').split('```diff')[0];
  const respMsg = String(response || '').split('```diff')[0];
  return overlap(respMsg, expMsg);
}

// ---------- partial-data mode ----------
// The raw inference outputs (bench-base.jsonl / bench-tuned.jsonl) are NOT in
// the repository: they were gitignored by design (line 79 of .gitignore:
//   tools/ft/bench-*.jsonl) and were never committed. Re-running inference to
// regenerate them is forbidden by this mission (no new training or inference).
// So the per-row v2 content score CANNOT be computed — it needs the response
// text. What CAN be computed from surviving data is reported honestly:
//   - v1 internal consistency (row means vs reported means)
//   - the echo susceptibility of the v1 metric itself, proven on the dataset
//   - the v1 blind spot on diff-bearing rows, proven on the dataset
// This mode exists to make the gap explicit rather than papering over it.
function partialReport() {
  const rep = JSON.parse(fs.readFileSync(path.join(__dirname, 'benchmark-report.json'), 'utf8'));
  const hold = fs.readFileSync(path.join(DATA, 'payesh-sft-holdout.jsonl'), 'utf8')
    .trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

  // 1. v1 internal consistency
  const bMean = avg(rep.rows.map(r => r.base_sim));
  const tMean = avg(rep.rows.map(r => r.tuned_sim));
  const consistency = {
    reported_base: rep.base_mean_similarity,
    recomputed_base: round(bMean),
    base_ok: round(bMean) === rep.base_mean_similarity,
    reported_tuned: rep.tuned_mean_similarity,
    recomputed_tuned: round(tMean),
    tuned_ok: round(tMean) === rep.tuned_mean_similarity,
    reported_delta: rep.delta,
    recomputed_delta: round(tMean - bMean),
    delta_ok: round(tMean - bMean) === rep.delta,
  };

  // 2. echo susceptibility of v1, proven on the real holdout
  // If the model HAD echoed the instruction, what would v1 have scored?
  // v1 sim(response, expected) with response == instruction:
  const echoWhatIf = hold.map((h, i) => {
    const scoreIfEcho = overlap(h.instruction, h.output);
    return {
      holdout_row: i,
      instruction_head: h.instruction.slice(0, 70),
      kind: contractOf(h.output),
      v1_score_if_prompt_echo: round(scoreIfEcho),
      reported_base_sim: rep.rows[i] ? rep.rows[i].base_sim : null,
      reported_tuned_sim: rep.rows[i] ? rep.rows[i].tuned_sim : null,
      // the v1 metric would have AWARDED this many points for pure echo
      echo_would_have_scored: round(scoreIfEcho),
    };
  });

  // 3. the v1 blind spot on diff-bearing rows, proven on the real holdout
  const blindSpot = hold.map((h, i) => {
    const db = diffBlock(h.output);
    const dt = diffTokens(db);
    const v1Tokens = toks(db);
    // v1 does not see fewer tokens — it sees DIFFERENT ones. It splits on \W+
    // so the + / - / @@ markers vanish and the code identifiers leak through,
    // while the line structure that defines the patch is invisible to it.
    // The signal here is what v1 tokens actually ARE vs what a diff needs.
    const v1Sample = v1Tokens.slice(0, 8);
    const v2Sample = dt.slice(0, 6);
    return {
      holdout_row: i,
      kind: contractOf(h.output),
      v2_line_tokens: dt.length,
      v1_word_tokens: v1Tokens.length,
      v1_tokens_are_words_not_lines: true,
      v1_token_sample: v1Sample,
      v2_line_token_sample: v2Sample,
    };
  });

  return {
    mode: 'PARTIAL — raw inference outputs not in repo (gitignored, never committed)',
    v1_internal_consistency: consistency,
    v1_echo_susceptibility: echoWhatIf,
    v1_diff_blind_spot: blindSpot,
    per_row_v2: 'NOT COMPUTABLE — requires the model response text, which is not in the repository and must not be regenerated',
  };
}

// ---------- main ----------
function main() {
  const argv = process.argv.slice(2);
  let rowsFile = null;
  let partial = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rows' && argv[i + 1]) rowsFile = argv[i + 1];
    if (argv[i] === '--partial') partial = true;
  }

  if (partial) {
    const rep = path.join(__dirname, 'metric-v2-partial-report.json');
    const out = partialReport();
    fs.writeFileSync(rep, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    console.log(`\nwrote ${rep}`);
    return;
  }

  if (!rowsFile) {
    console.error('usage: node tools/ft/metric-v2.js --rows <inference-output.jsonl>');
    console.error('       node tools/ft/metric-v2.js --partial   # surviving-data analysis only');
    process.exit(2);
  }

  const lines = fs.readFileSync(rowsFile, 'utf8').trim().split('\n').filter(l => l.trim());
  const out = [];
  for (const l of lines) {
    const r = JSON.parse(l);
    const instr = r.instruction || '';
    const resp = r.response || '';
    const exp = r.expected || '';

    const echo = echoStatus(instr, resp);
    const fmt = formatStatus(exp, resp);
    const cs = contentScore(exp, resp);
    const ms = msgSliceScore(exp, resp);

    out.push({
      id: r.id != null ? r.id : out.length,
      instruction_head: instr.slice(0, 70),
      v1_content_score: round(overlap(resp, exp)),   // the OLD metric, for comparison
      echo_status: echo.status,
      echo_detail: echo.detail,
      format_status: fmt.status,
      format_kind: fmt.kind,
      format_clause: fmt.clause,
      content_score_v2: round(cs.score),
      content_slice: cs.slice,
      msg_score: ms == null ? null : round(ms),
      fail_reason: fmt.status === 'FORMAT_FAIL'
        ? `FORMAT_FAIL: ${fmt.clause}`
        : (echo.status !== 'NONE' ? `ECHO(${echo.status}): ${echo.detail}` : null),
    });
  }

  const report = {
    metric_version: 'v2',
    metric_file: 'tools/ft/metric-v2.js',
    old_metric_file: 'tools/ft/benchmark.js',
    rows_in: rowsFile,
    n: out.length,
    rows: out,
    summary: {
      n_echo: out.filter(r => r.echo_status !== 'NONE').length,
      n_format_fail: out.filter(r => r.format_status === 'FORMAT_FAIL').length,
      v1_mean_content: round(avg(out.map(r => r.v1_content_score))),
      v2_mean_content: round(avg(out.map(r => r.content_score_v2))),
    },
    thresholds: { ECHO_MAX_EXTRA, MIN_DIFF_HUNKS, MIN_DIFF_LINES, MIN_PLAIN_WORDS },
  };
  console.log(JSON.stringify(report, null, 2));
}

function avg(a) { return a.filter(v => v !== null).reduce((x, y) => x + y, 0) / Math.max(1, a.filter(v => v !== null).length); }
function round(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }

main();

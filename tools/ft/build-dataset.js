#!/usr/bin/env node
/**
 * tools/ft/build-dataset.js — Payesh SFT dataset builder (Stage C)
 *
 * Builds the fine-tuning dataset from THREE real, verifiable sources:
 *   1. PEB benchmark cases  (prompt + real fix diff from git history)
 *   2. PEES experience store (verified engineering lessons)
 *   3. git log patch corpus  (real Payesh commit messages + diffs)
 *
 * Output: tools/ft/dataset/payesh-sft.jsonl  +  manifest.json
 *
 * Leakage control (mission section 12):
 *   HOLDOUT cases are EXCLUDED from train — written to a separate file.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'tools', 'ft', 'dataset');

// PEB-09 + PEB-10 are the holdout set (never trained on) — mirrors Phase 3.
const HOLDOUT_CASES = ['PEB-09', 'PEB-10'];
const DATASET_VERSION = 'payesh-engineering-v1';

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, maxBuffer: 200 * 1024 * 1024 }).toString();
}

function getFixDiff(fixCommit, scope) {
  try {
    const full = sh(`git rev-parse ${fixCommit}`).trim();
    // MSYS bash treats ^ as an escape char — quote it.
    const parent = sh(`git rev-parse "${full}^"`).trim();
    const diff = sh(`git diff ${parent} ${full} -- ${scope}`);
    return diff;
  } catch (e) { return null; }
}

function getCommitMessage(fixCommit) {
  try { return sh(`git log -1 --format=%B ${fixCommit}`).trim(); } catch (e) { return ''; }
}

// ---------------------------------------------------------------------------
// Source 1: PEB cases -> instruction/response SFT pairs
// ---------------------------------------------------------------------------
function buildPebPairs() {
  const cases = require(path.join(ROOT, 'tools', 'experience-benchmark-cases.js'));
  const pairs = [];
  for (const c of cases) {
    const diff = getFixDiff(c.fix_commit, c.scope);
    if (!diff || !diff.trim()) { pairs.push({ case: c.id, error: 'NO_DIFF' }); continue; }
    const msg = getCommitMessage(c.fix_commit);
    pairs.push({
      case_id: c.id,
      category: c.category,
      prompt: c.prompt,
      start_sha: c.start,
      fix_sha: c.fix_commit,
      scope: c.scope,
      commit_message: msg,
      diff: diff,
      forbidden: c.forbidden || [],
    });
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Source 2: PEES verified experiences -> lesson pairs
// ---------------------------------------------------------------------------
function buildPeesPairs() {
  const file = path.join(ROOT, 'docs', 'experience-store', 'experiences.jsonl');
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(l => l.trim());
  const pairs = [];
  for (const l of lines) {
    let o;
    try { o = JSON.parse(l); } catch (e) { continue; }
    if (o.validation_status === 'SUPERSEDED' || o.validation_status === 'RETIRED') continue;
    if (!o.problem_class || !o.reusable_pattern) continue;
    pairs.push({
      case_id: o.experience_id,
      category: o.problem_class,
      prompt: `Engineering lesson — ${o.problem_class}: ${String(o.observed_failure || '').slice(0, 400)}`,
      diff: null,
      lesson: o.reusable_pattern,
      evidence: o.evidence,
    });
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Source 3: real commit corpus (agent-authored Payesh commits)
// ---------------------------------------------------------------------------
function buildCommitPairs() {
  let log;
  try { log = sh('git log --format=%H -80 --no-merges'); } catch (e) { return []; }
  const shas = log.trim().split('\n').filter(Boolean);
  const pairs = [];
  for (const sha of shas) {
    let msg, diff;
    try {
      msg = sh(`git log -1 --format=%B ${sha}`).trim();
      diff = sh(`git show ${sha} --stat --format="" `);
    } catch (e) { continue; }
    if (!msg || msg.length < 20) continue;
    pairs.push({ commit_sha: sha, commit_message: msg, stat: diff.trim() });
  }
  return pairs;
}

function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const peb = buildPebPairs();
  const pees = buildPeesPairs();
  const commits = buildCommitPairs();

  const pebOK = peb.filter(p => !p.error);
  const trainPeb = pebOK.filter(p => !HOLDOUT_CASES.includes(p.case_id));
  const holdoutPeb = pebOK.filter(p => HOLDOUT_CASES.includes(p.case_id));

  // ---- write train split (SFT format) ----
  const trainFile = path.join(OUT_DIR, 'payesh-sft-train.jsonl');
  let n = 0;
  const fh = fs.openSync(trainFile, 'w');
  for (const p of trainPeb) {
    const response = [
      '```',
      p.commit_message,
      '```',
      '',
      '```diff',
      p.diff,
      '```',
    ].join('\n');
    const rec = { instruction: p.prompt, input: '', output: response };
    fs.writeSync(fh, JSON.stringify(rec) + '\n'); n++;
  }
  for (const p of pees) {
    const rec = { instruction: p.prompt, input: '', output: p.lesson };
    fs.writeSync(fh, JSON.stringify(rec) + '\n'); n++;
  }
  fs.closeSync(fh);

  // ---- holdout ----
  const holdFile = path.join(OUT_DIR, 'payesh-sft-holdout.jsonl');
  let hn = 0;
  const hfh = fs.openSync(holdFile, 'w');
  for (const p of holdoutPeb) {
    const response = ['```', p.commit_message, '```', '', '```diff', p.diff, '```'].join('\n');
    const rec = { instruction: p.prompt, input: '', output: response };
    fs.writeSync(hfh, JSON.stringify(rec) + '\n'); hn++;
  }
  fs.closeSync(hfh);

  const data = fs.readFileSync(trainFile);
  const manifest = {
    dataset_version: DATASET_VERSION,
    source_repo_head: sh('git rev-parse HEAD').trim(),
    created_at: new Date().toISOString(),
    sources: {
      peb_cases_total: peb.length,
      peb_cases_ok: pebOK.length,
      peb_errors: peb.filter(p => p.error).map(p => p.case + ':' + p.error),
      peb_train: trainPeb.map(p => p.case_id),
      peb_holdout: holdoutPeb.map(p => p.case_id),
      pees_records: pees.length,
      commit_corpus: commits.length,
    },
    splits: { train: n, holdout: hn },
    train_sha256: hash(data.toString()),
    holdout_sha256: hash(fs.readFileSync(holdFile).toString()),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main();

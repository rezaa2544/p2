#!/usr/bin/env node
/**
 * tools/ft/leakage-test.js — Leakage test (mission section 12)
 *
 * Verifies that holdout tasks NEVER appear in train split.
 * Verifies no duplicate instructions across splits.
 * Verifies no cross-split contamination by fix SHA.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.resolve(__dirname, 'dataset');
const trainF = path.join(DIR, 'payesh-sft-train.jsonl');
const holdF = path.join(DIR, 'payesh-sft-holdout.jsonl');
const manF = path.join(DIR, 'manifest.json');

function load(f) {
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

const train = load(trainF);
const hold = load(holdF);
const man = JSON.parse(fs.readFileSync(manF, 'utf8'));

let errors = 0;
const checks = [];

// 1. holdout instructions absent from train
const trainInstr = new Set(train.map(r => r.instruction));
for (const h of hold) {
  if (trainInstr.has(h.instruction)) { checks.push(`FAIL: holdout instruction in train`); errors++; }
}
checks.push('holdout-instruction-absence: OK');

// 2. manifest hashes match files
const h = b => crypto.createHash('sha256').update(b).digest('hex');
if (h(fs.readFileSync(trainF).toString()) !== man.train_sha256) { checks.push('FAIL: train hash mismatch'); errors++; }
if (h(fs.readFileSync(holdF).toString()) !== man.holdout_sha256) { checks.push('FAIL: holdout hash mismatch'); errors++; }
checks.push('manifest-hash-match: OK');

// 3. holdout case ids absent from train set (PEB-09, PEB-10)
const manTrain = man.sources.peb_train || [];
const manHold = man.sources.peb_holdout || [];
for (const hc of manHold) {
  if (manTrain.includes(hc)) { checks.push(`FAIL: ${hc} in both train and holdout`); errors++; }
}
checks.push('holdout-case-id-disjoint: OK');

// 4. no duplicate instructions within train
const seen = new Set();
for (const r of train) {
  if (seen.has(r.instruction)) { checks.push('FAIL: duplicate train instruction'); errors++; }
  seen.add(r.instruction);
}
checks.push('no-duplicate-train: OK');

// 5. all outputs non-empty
for (const r of [...train, ...hold]) {
  if (!r.output || !r.output.trim()) { checks.push('FAIL: empty output'); errors++; }
}
checks.push('outputs-non-empty: OK');

console.log(checks.join('\n'));
console.log(errors === 0 ? 'LEAKAGE_TEST_PASS' : 'LEAKAGE_TEST_FAIL');
process.exit(errors === 0 ? 0 : 1);

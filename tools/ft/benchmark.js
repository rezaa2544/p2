#!/usr/bin/env node
/**
 * tools/ft/benchmark.js — baseline vs tuned benchmark (Stage F/G)
 *
 * Runs infer.py on the holdout split for both BASE and TUNED, then scores
 * similarity to the ground-truth fix. Reports a comparison table.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const FT = path.join(ROOT, 'tools', 'ft');
const DATA = path.join(FT, 'dataset');

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, maxBuffer: 500 * 1024 * 1024, ...opts }).toString();
}

// similarity: token-overlap of generated diff vs real diff
function sim(a, b) {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const tb = b.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const w of tb) if (ta.has(w)) hit++;
  return hit / tb.size;
}

function runMode(adapter) {
  const tmp = path.join(FT, 'bench-tmp.jsonl');
  const outF = adapter ? path.join(FT, 'bench-tuned.jsonl') : path.join(FT, 'bench-base.jsonl');
  const flag = adapter ? `--adapter "${adapter}"` : '--base-only';
  const cmd = `python tools/ft/infer.py --jsonl "${path.join(DATA, 'payesh-sft-holdout.jsonl')}" ${flag} --out "${outF}"`;
  console.log('RUN:', cmd);
  sh(cmd, { stdio: 'pipe' });
  if (!fs.existsSync(outF)) return [];
  return fs.readFileSync(outF, 'utf8').trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

function main() {
  const adapterDir = process.argv[2] || null;
  if (!adapterDir) { console.error('usage: node tools/ft/benchmark.js <adapter-dir>'); process.exit(2); }

  const base = runMode(null);
  const tuned = runMode(adapterDir);

  const rows = [];
  for (let i = 0; i < Math.max(base.length, tuned.length); i++) {
    const b = base[i], t = tuned[i];
    rows.push({
      instruction: (b || t).instruction.slice(0, 70),
      base_sim: b ? sim(b.response, b.expected) : null,
      tuned_sim: t ? sim(t.response, t.expected) : null,
      base_len: b ? b.response.length : 0,
      tuned_len: t ? t.response.length : 0,
    });
  }

  const baseAvg = avg(rows.map(r => r.base_sim));
  const tunedAvg = avg(rows.map(r => r.tuned_sim));
  const report = {
    adapter: adapterDir,
    n: rows.length,
    base_mean_similarity: round(baseAvg),
    tuned_mean_similarity: round(tunedAvg),
    delta: round(tunedAvg - baseAvg),
    rows,
  };
  const outPath = path.join(FT, 'benchmark-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

function avg(a) { return a.filter(v => v !== null).reduce((x, y) => x + y, 0) / Math.max(1, a.filter(v => v !== null).length); }
function round(n) { return Math.round(n * 1000) / 1000; }

main();

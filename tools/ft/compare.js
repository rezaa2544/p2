#!/usr/bin/env node
/**
 * tools/ft/compare.js — BASE vs TUNED comparison from existing inference files.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FT = path.resolve(__dirname);

function load(f) {
  const p = path.join(FT, f);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

function sim(a, b) {
  // word sets incl. Persian/unicode letters
  const ta = new Set(String(a).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1));
  const tb = String(b).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1);
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const w of tb) if (ta.has(w)) hit++;
  return hit / tb.length;
}

const base = load('bench-base.jsonl');
const tuned = load('bench-tuned.jsonl');

const rows = [];
for (let i = 0; i < Math.max(base.length, tuned.length); i++) {
  const b = base[i], t = tuned[i];
  rows.push({
    instruction: (b || t).instruction.slice(0, 60),
    base_sim: b ? Math.round(sim(b.response, b.expected) * 1000) / 1000 : null,
    tuned_sim: t ? Math.round(sim(t.response, t.expected) * 1000) / 1000 : null,
  });
}

function avg(a) {
  const v = a.filter(x => x !== null);
  return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length * 1000) / 1000 : null;
}

const report = {
  base_mean_similarity: avg(rows.map(r => r.base_sim)),
  tuned_mean_similarity: avg(rows.map(r => r.tuned_sim)),
  n: rows.length,
  rows,
};
report.delta = report.base_mean_similarity !== null && report.tuned_mean_similarity !== null
  ? Math.round((report.tuned_mean_similarity - report.base_mean_similarity) * 1000) / 1000 : null;

fs.writeFileSync(path.join(FT, 'benchmark-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

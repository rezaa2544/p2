#!/usr/bin/env node
/* Mutation checks for one-pass class-list enrichment. */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'server/routes/classes.js');
const original = fs.readFileSync(FILE, 'utf8');
const mutants = [
  {
    name: 'enrollment counts are disabled',
    from: 'enrollmentCounts.set(classId, (enrollmentCounts.get(classId) || 0) + 1);',
    to: 'if (classId != null) { /* MUT: no enrollment count */ }'
  },
  {
    name: 'indexed enrollment loop is bypassed',
    from: 'for (const enrollment of (Array.isArray(store.enrollments) ? store.enrollments : [])) {',
    to: 'for (const enrollment of []) { /* MUT: bypass index */'
  }
];

function run() {
  try {
    return { code: 0, output: execFileSync(process.execPath, ['tests/session8-classes-index.js'], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe']
    }) };
  } catch (err) {
    return {
      code: typeof err.status === 'number' ? err.status : 1,
      output: String(err.stdout || '') + String(err.stderr || '')
    };
  }
}

let killed = 0;
console.log('\n▸ Session 8 classes-index mutation tests');
try {
  for (const mutant of mutants) {
    if (!original.includes(mutant.from)) throw new Error('Mutation anchor missing: ' + mutant.name);
    fs.writeFileSync(FILE, original.replace(mutant.from, mutant.to));
    const result = run();
    fs.writeFileSync(FILE, original);
    if (result.code !== 0 && /AssertionError|checks/.test(result.output)) {
      killed++;
      console.log('  ✅ ' + mutant.name + ' — killed');
    } else {
      console.log('  ❌ ' + mutant.name + ' — survived');
      console.log(result.output.split('\n').slice(-8).join('\n'));
    }
  }
} finally {
  fs.writeFileSync(FILE, original);
}
const restored = run();
const restoredGreen = restored.code === 0 && /session8-classes-index: 5\/5 checks/.test(restored.output);
console.log(`\nsession8-classes-index mutations: ${killed}/${mutants.length} killed` + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);

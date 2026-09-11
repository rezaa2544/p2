#!/usr/bin/env node
/* Mutation checks for one-pass grade enrichment. */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'server/routes/grades.js');
const original = fs.readFileSync(FILE, 'utf8');
const mutants = [
  {
    name: 'subject index population is disabled',
    from: 'subjectsById.set(subject.id, subject);',
    to: 'if (subject && subject.id != null) { /* MUT: no subject index */ }'
  },
  {
    name: 'student index population is disabled',
    from: 'usersById.set(userRow.id, userRow);',
    to: 'if (userRow && userRow.id != null) { /* MUT: no student index */ }'
  }
];

function run() {
  try {
    return { code: 0, output: execFileSync(process.execPath, ['tests/session8-grades-index.js'], {
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
console.log('\n▸ Session 8 grades-index mutation tests');
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
const restoredGreen = restored.code === 0 && /session8-grades-index: 5\/5 checks/.test(restored.output);
console.log(`\nsession8-grades-index mutations: ${killed}/${mutants.length} killed` + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);

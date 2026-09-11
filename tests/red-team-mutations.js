#!/usr/bin/env node
/* Four focused mutation tests for the CSRF remediation proved by RT-09.
   Each mutant must make the attacker request succeed, causing the red-team
   CSRF probe to fail. Run: node tests/red-team-mutations.js */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'server', 'csrf.js');
const original = fs.readFileSync(FILE, 'utf8');
const mutants = [
  {
    name: 'M1 POST is removed from the state-changing methods',
    from: "const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);",
    to: "const UNSAFE = new Set(['PUT', 'PATCH', 'DELETE']); /* MUT */"
  },
  {
    name: 'M2 the exact Origin comparison is removed',
    from: 'return !!actual && !!expected && actual.toLowerCase() === expected.toLowerCase();',
    to: 'return !!actual && !!expected; /* MUT */'
  },
  {
    name: 'M3 foreign Origin is treated as an allow decision',
    from: ": { ok: false, code: 'csrf_origin_mismatch' };",
    to: ": { ok: true, code: 'csrf_origin_mismatch' }; /* MUT */"
  },
  {
    name: 'M4 the browser Origin header is ignored',
    from: 'if (originHeader !== undefined) {',
    to: 'if (false /* MUT: ignore Origin */) {'
  }
];

function execute() {
  try {
    const stdout = execFileSync(process.execPath, ['tests/red-team.js', '--csrf-only'], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe']
    });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: typeof err.status === 'number' ? err.status : 1, output: String(err.stdout || '') + String(err.stderr || '') };
  }
}

let killed = 0;
console.log('\n▸ Red-team CSRF mutation tests (M1–M4)');
try {
  for (const mutant of mutants) {
    if (!original.includes(mutant.from)) throw new Error('Mutation anchor missing: ' + mutant.name);
    fs.writeFileSync(FILE, original.replace(mutant.from, mutant.to));
    const result = execute();
    fs.writeFileSync(FILE, original);
    const detected = result.code !== 0 && /RT-09.*❌|1 FAILED/.test(result.output);
    if (detected) {
      killed += 1;
      console.log('  ✅ ' + mutant.name + ' — killed');
    } else {
      console.log('  ❌ ' + mutant.name + ' — survived');
      console.log('     ' + result.output.split('\n').slice(-8).join('\n     '));
    }
  }
} finally {
  fs.writeFileSync(FILE, original);
}

const restored = execute();
const restoredGreen = restored.code === 0 && /red-team: 1\/1 blocked ✅/.test(restored.output);
console.log('\nred-team mutations: ' + killed + '/' + mutants.length + ' killed' + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);

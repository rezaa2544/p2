#!/usr/bin/env node
/* Mutation checks for bounded/purged bootstrap school indexes. */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'server', 'cache.js');
const original = fs.readFileSync(FILE, 'utf8');
const mutants = [
  {
    name: 'school index TTL is removed',
    from: 'await redis.expire(indexKey, indexTtl);',
    to: '/* MUT: no index expiry */'
  },
  {
    name: 'school index membership cleanup is removed',
    from: 'if (members.length) await redis.sRem(indexKey, ...members);',
    to: '/* MUT: stale school members remain */'
  }
];

function run() {
  try {
    return { code: 0, output: execFileSync(process.execPath, ['tests/session8-cache-index.js'], {
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
console.log('\n▸ Session 8 cache-index mutation tests');
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
const restoredGreen = restored.code === 0 && /session8-cache-index: 6\/6 checks/.test(restored.output);
console.log(`\nsession8-cache-index mutations: ${killed}/${mutants.length} killed` + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);

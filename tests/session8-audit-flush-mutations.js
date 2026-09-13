#!/usr/bin/env node
/* Mutation checks for retryable asynchronous audit flushes. */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانیِ درجا و finally حذف شدند (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('s8af-mut-');
const FILE = path.join(ROOT, 'server', 'audit.js');
const original = fs.readFileSync(FILE, 'utf8');
const mutants = [
  {
    name: 'append errors are ignored',
    from: '}, (err) => resolve(!err));',
    to: '}, (err) => resolve(true /* MUT: ignore append error */));'
  },
  {
    name: 'failed audit batch is discarded',
    from: 'flushQueue = batch.concat(flushQueue);',
    to: 'flushQueue = []; /* MUT: discard failed batch */'
  }
];

function run(e) {
  try {
    return { code: 0, output: execFileSync(process.execPath, ['tests/session8-audit-flush.js'], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'], env: e
    }) };
  } catch (err) {
    return {
      code: typeof err.status === 'number' ? err.status : 1,
      output: String(err.stdout || '') + String(err.stderr || '')
    };
  }
}

let killed = 0;
console.log('\n▸ Session 8 audit-flush mutation tests');
try {
  for (const mutant of mutants) {
    if (!original.includes(mutant.from)) throw new Error('Mutation anchor missing: ' + mutant.name);
    const mcopy = kit.mutant(FILE, original.replace(mutant.from, mutant.to)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(FILE).mode); } catch (_) {}
    const result = run(kit.env());
    if (result.code !== 0 && /AssertionError|checks/.test(result.output)) {
      killed++;
      console.log('  ✅ ' + mutant.name + ' — killed');
    } else {
      console.log('  ❌ ' + mutant.name + ' — survived');
      console.log(result.output.split('\n').slice(-8).join('\n'));
    }
  }
} finally {
  kit.clear(FILE); /* نقشهٔ خالی؛ پاک‌سازیِ واقعی در exit */
}
const restored = run();
const restoredGreen = restored.code === 0 && /session8-audit-flush: 4\/4 checks/.test(restored.output);
console.log(`\nsession8-audit-flush mutations: ${killed}/${mutants.length} killed` + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);

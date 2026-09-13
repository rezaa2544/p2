#!/usr/bin/env node
/* Mutation checks for one-pass grade enrichment. */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانیِ درجا و finally حذف شدند (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('s8gi-mut-');
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

function run(e) {
  try {
    return { code: 0, output: execFileSync(process.execPath, ['tests/session8-grades-index.js'], {
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
console.log('\n▸ Session 8 grades-index mutation tests');
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
const restoredGreen = restored.code === 0 && /session8-grades-index: 5\/5 checks/.test(restored.output);
console.log(`\nsession8-grades-index mutations: ${killed}/${mutants.length} killed` + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);

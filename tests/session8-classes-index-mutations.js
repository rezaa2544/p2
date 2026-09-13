#!/usr/bin/env node
/* Mutation checks for one-pass class-list enrichment. */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانیِ درجا و finally حذف شدند (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('s8cli-mut-');
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

function run(e) {
  try {
    return { code: 0, output: execFileSync(process.execPath, ['tests/session8-classes-index.js'], {
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
console.log('\n▸ Session 8 classes-index mutation tests');
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
const restoredGreen = restored.code === 0 && /session8-classes-index: 5\/5 checks/.test(restored.output);
console.log(`\nsession8-classes-index mutations: ${killed}/${mutants.length} killed` + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);

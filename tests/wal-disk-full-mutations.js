#!/usr/bin/env node
/* Regression and mutation gate for the WAL drill's fail-closed early exit. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const drill = path.join(ROOT, 'tests', 'wal-disk-full.js');
const output = spawnSync(process.execPath, [drill, '--skip-live'], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 30000,
});
const text = (output.stdout || '') + '\n' + (output.stderr || '');
assert.strictEqual(output.status, 2, 'skip-live must report NOT-RUN with exit 2');
assert.ok(/NOT RUN/.test(text), 'skip-live must identify live scenarios as NOT-RUN');
assert.ok(!/ReferenceError: Cannot access 'finished'/.test(text),
  'early exit must not hit a temporal-dead-zone failure');

/* Mutation: remove the completion-state declaration. The regression gate must
   kill this mutant by observing the original ReferenceError and non-2 exit. */
const mutantRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wal-drill-mutant-'));
try {
  fs.mkdirSync(path.join(mutantRoot, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(mutantRoot, 'infra', 'wal-drill'), { recursive: true });
  fs.mkdirSync(path.join(mutantRoot, 'docs'), { recursive: true });
  const source = fs.readFileSync(drill, 'utf8');
  const marker = "let finished = false;\n\n/* ═══════════════════════════════════════════════════════════════════";
  assert.ok(source.includes(marker), 'fixed declaration marker must exist');
  const mutant = source.replace(marker, "/* MUTANT: completion state removed */\n\n/* ═══════════════════════════════════════════════════════════════════");
  fs.writeFileSync(path.join(mutantRoot, 'tests', 'wal-disk-full.js'), mutant);
  fs.copyFileSync(path.join(ROOT, 'infra', 'wal-drill', 'bootstrap.sh'),
    path.join(mutantRoot, 'infra', 'wal-drill', 'bootstrap.sh'));
  fs.copyFileSync(path.join(ROOT, 'docs', 'WAVE19_WAL_DRILL_REPORT.md'),
    path.join(mutantRoot, 'docs', 'WAVE19_WAL_DRILL_REPORT.md'));
  /* ری‌تارگت (ممیزی دور ۲): S5ِ سوئیت حالا migrations/ را با readdir کشف
     می‌کند — بدونِ کپی، mutant پیش از رسیدن به مسیرِ ReferenceError با
     ENOENT می‌مُرد و assertionِ بازتولید شکست می‌خورد (قرمزِ کاذبِ گیت). */
  fs.mkdirSync(path.join(mutantRoot, 'migrations'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'migrations')))
    fs.copyFileSync(path.join(ROOT, 'migrations', f), path.join(mutantRoot, 'migrations', f));
  const killed = spawnSync(process.execPath,
    [path.join(mutantRoot, 'tests', 'wal-disk-full.js'), '--skip-live'],
    { cwd: mutantRoot, encoding: 'utf8', timeout: 30000 });
  const mutantText = (killed.stdout || '') + '\n' + (killed.stderr || '');
  assert.notStrictEqual(killed.status, 2, 'mutant must not pass the early-exit contract');
  assert.ok(/ReferenceError: .*finished/.test(mutantText),
    'mutant must reproduce the early-exit completion-state failure');
} finally {
  fs.rmSync(mutantRoot, { recursive: true, force: true });
}

console.log('wal-disk-full mutation gate: 2/2 green');

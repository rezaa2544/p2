#!/usr/bin/env node
/* Mutation gate for PR #81 / WAL drill session 9.
 * The review-critical guard and the --skip-live fail-closed path must not
 * regress into the pre-review behaviours. */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;
function check(condition, message) {
  if (condition) { pass += 1; console.log('  ✅ ' + message); }
  else { fail += 1; console.log('  ❌ ' + message); }
}
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function run(args, timeout = 120000) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT, env: process.env, encoding: 'utf8', timeout,
    maxBuffer: 8 * 1024 * 1024
  });
}
function mutate(file, from, to, execute, killed, label) {
  const original = fs.readFileSync(file, 'utf8');
  const before = sha(file);
  const bad = original.replace(from, to);
  if (bad === original) { check(false, label + ' — لنگر پیدا نشد'); return; }
  try {
    fs.writeFileSync(file, bad, 'utf8');
    const result = execute();
    const output = String(result.stdout || '') + String(result.stderr || '');
    check(killed(result, output), label);
  } finally {
    fs.writeFileSync(file, original, 'utf8');
    if (sha(file) !== before) check(false, label + ' — بازگردانی شکست خورد');
  }
}

console.log('\n▸ جهش‌های PR #81 — گارد مسیر و خروج fail-closed');

mutate(
  path.join(ROOT, 'infra', 'wal-drill', 'bootstrap.sh'),
  'canon=$(realpath -m -- "$raw" 2>/dev/null) || die "$name path cannot be canonicalized: $raw"',
  'canon="$raw" # MUT: canonical aliases bypass the deny-list',
  () => run(['tests/wal-drill-bootstrap.js']),
  (r, out) => r.status !== 0 && /❌ B5/.test(out),
  'M1 حذفِ canonicalization اجازهٔ /usr/ را می‌دهد ⇒ B5 آن را می‌کشد'
);

mutate(
  path.join(ROOT, 'tests', 'wal-disk-full.js'),
  'let finished = false;',
  '/* MUT: completion state omitted */',
  () => run(['tests/wal-disk-full.js', '--skip-live']),
  (r, out) => r.status !== 0 && /finished is not defined|ReferenceError/.test(out),
  'M2 حذفِ تعریفِ زودهنگامِ finished ⇒ مسیرِ --skip-live آن را می‌کشد'
);

console.log('\n────────────────────────────────────────────');
console.log(`جهش‌های PR #81: ${pass}/${pass + fail}` + (fail ? ' — ❌' : ' — همه کشته شدند ✅'));
console.log('────────────────────────────────────────────');
process.exit(fail ? 1 : 0);

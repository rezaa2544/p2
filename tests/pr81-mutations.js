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
const os = require('os');

/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ هم‌جوارِ جدا (mutant-kit)؛
   سورس اصلی هرگز بازنویسی نمی‌شود — restore/بازگردانیِ درجا حذف شد. */
const { session } = require('./helpers/mutant-kit');
const kit = session('p81-');
let pass = 0;
let fail = 0;
function check(condition, message) {
  if (condition) { pass += 1; console.log('  ✅ ' + message); }
  else { fail += 1; console.log('  ❌ ' + message); }
}
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function run(args, timeout = 120000, env = process.env) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT, env, encoding: 'utf8', timeout,
    maxBuffer: 8 * 1024 * 1024
  });
}
function mutate(file, from, to, execute, killed, label) {
  const original = fs.readFileSync(file, 'utf8');
  const before = sha(file);
  const bad = original.replace(from, to);
  if (bad === original) { check(false, label + ' — لنگر پیدا نشد'); return; }
  try {
    const mcopy = kit.mutant(file, bad); /* کپیِ هم‌جوار: __dirname و requireهای نسبی سالم می‌مانند */
    try { fs.chmodSync(mcopy, fs.statSync(file).mode); } catch (_) {}
    const result = execute();
    const output = String(result.stdout || '') + String(result.stderr || '');
    check(killed(result, output), label);
  } finally {
    kit.clear(file);
    if (sha(file) !== before) check(false, label + ' — سورس اصلی تغییر کرد');
  }
}

console.log('\n▸ جهش‌های PR #81 — گارد مسیر و خروج fail-closed');

/* M1 — bash اسکریپت را با «آرگومانِ مسیر» اجرا می‌کند و preload نمی‌تواند
   آرگومان را بازمپ کند ⇒ نسخهٔ جهش‌یافته در sandboxِ tmp کنارِ کپیِ خودِ
   نگهبان اجرا می‌شود (سورس اصلی و repo دست‌نخورده — الگوی wal-disk-full). */
{
  const BOOT = path.join(ROOT, 'infra', 'wal-drill', 'bootstrap.sh');
  const original = fs.readFileSync(BOOT, 'utf8');
  const before = sha(BOOT);
  const bad = original.replace(
    'canon=$(realpath -m -- "$raw" 2>/dev/null) || die "$name path cannot be canonicalized: $raw"',
    'canon="$raw" # MUT: canonical aliases bypass the deny-list');
  if (bad === original) check(false, 'M1 حذفِ canonicalization — لنگر پیدا نشد');
  else {
    const SBX = fs.mkdtempSync(path.join(os.tmpdir(), 'pr81-m1-'));
    try {
      fs.mkdirSync(path.join(SBX, 'tests'), { recursive: true });
      fs.mkdirSync(path.join(SBX, 'infra', 'wal-drill'), { recursive: true });
      fs.mkdirSync(path.join(SBX, 'migrations'), { recursive: true });
      fs.copyFileSync(path.join(ROOT, 'tests', 'wal-drill-bootstrap.js'),
        path.join(SBX, 'tests', 'wal-drill-bootstrap.js'));
      fs.writeFileSync(path.join(SBX, 'infra', 'wal-drill', 'bootstrap.sh'), bad, 'utf8');
      for (const mf of fs.readdirSync(path.join(ROOT, 'migrations'))) {
        if (fs.statSync(path.join(ROOT, 'migrations', mf)).isFile()) {
          fs.copyFileSync(path.join(ROOT, 'migrations', mf), path.join(SBX, 'migrations', mf));
        }
      }
      const result = run([path.join(SBX, 'tests', 'wal-drill-bootstrap.js')]);
      const output = String(result.stdout || '') + String(result.stderr || '');
      check(result.status !== 0 && /❌ B5/.test(output),
        'M1 حذفِ canonicalization اجازهٔ /usr/ را می‌دهد ⇒ B5 آن را می‌کشد');
    } finally {
      fs.rmSync(SBX, { recursive: true, force: true });
    }
  }
  if (sha(BOOT) !== before) check(false, 'M1 — سورس اصلی تغییر کرد');
}

mutate(
  path.join(ROOT, 'tests', 'wal-disk-full.js'),
  'let finished = false;',
  '/* MUT: completion state omitted */',
  () => run(['tests/wal-disk-full.js', '--skip-live'], 120000, kit.env()),
  (r, out) => r.status !== 0 && /finished is not defined|ReferenceError/.test(out),
  'M2 حذفِ تعریفِ زودهنگامِ finished ⇒ مسیرِ --skip-live آن را می‌کشد'
);

console.log('\n────────────────────────────────────────────');
console.log(`جهش‌های PR #81: ${pass}/${pass + fail}` + (fail ? ' — ❌' : ' — همه کشته شدند ✅'));
console.log('────────────────────────────────────────────');
process.exit(fail ? 1 : 0);

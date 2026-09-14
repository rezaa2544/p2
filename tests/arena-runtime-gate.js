#!/usr/bin/env node
'use strict';
// Regression for repo-bound governance routing; no network or real Mission edits.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-runtime-gate-'));
const target = path.join(scratch, 'target');
const foreign = path.join(scratch, 'foreign');
const mission = 'docs/daily-missions/Chat8/ACTIVE.md';
const env = { ...process.env };
// Test fixtures must not inherit an outer repository selected by the caller.
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[key];
let passed = 0, failed = 0;
function test(name, check) {
  try { check(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function seed(dir) {
  fs.mkdirSync(path.join(dir, path.dirname(mission)), { recursive: true });
  fs.writeFileSync(path.join(dir, mission), '# Fixture Mission\n');
  git(dir, ['init', '-q']);
  git(dir, ['add', mission]);
  git(dir, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=/dev/null', 'commit', '--no-gpg-sign', '-qm', 'fixture']);
}
function run(cwd, chat = ['Chat8']) {
  const result = spawnSync(process.execPath, [path.join(target, 'tools/arena-runtime-gate.js'), ...chat],
    { cwd, env, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  return result;
}
function state(result, mode, local, remote) {
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('ARENA_RUNTIME_STATE=' + mode + '\n'), result.stdout);
  assert.ok(result.stdout.includes('LOCAL_MISSION=' + local + '\n'), result.stdout);
  assert.ok(result.stdout.includes('ORIGIN_MAIN_MISSION=' + remote + '\n'), result.stdout);
  assert.ok(result.stdout.includes('STOP_ALLOWED=NO\n'));
  assert.ok(result.stdout.includes('NEXT_ACTION='));
}
try {
  seed(target); seed(foreign);
  fs.mkdirSync(path.join(target, 'tools'));
  fs.copyFileSync(path.join(ROOT, 'tools/arena-runtime-gate.js'), path.join(target, 'tools/arena-runtime-gate.js'));
  git(target, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  const initialStatus = git(target, ['status', '--porcelain']);
  const initialRefs = git(target, ['show-ref']);
  for (const [name, cwd] of [['repo-root', target], ['nested-cwd', path.join(target, 'docs')],
    ['outside-repo', scratch], ['foreign-repo', foreign]]) {
    test(name, () => state(run(cwd), 'MISSION_MODE', 'PRESENT', 'PRESENT'));
  }
  test('read-only-local-and-refs', () => {
    assert.equal(git(target, ['status', '--porcelain']), initialStatus);
    assert.equal(git(target, ['show-ref']), initialRefs);
  });
  fs.unlinkSync(path.join(target, mission));
  test('remote-only-root', () => state(run(target), 'MISSION_MODE', 'MISSING', 'PRESENT'));
  test('remote-only-outside', () => state(run(scratch), 'MISSION_MODE', 'MISSING', 'PRESENT'));
  git(target, ['update-ref', '-d', 'refs/remotes/origin/main']);
  test('missing-root', () => state(run(target), 'CONTINUITY_FALLBACK', 'MISSING', 'NOT_AVAILABLE'));
  test('missing-outside', () => state(run(scratch), 'CONTINUITY_FALLBACK', 'MISSING', 'NOT_AVAILABLE'));
  test('foreign-mission-cannot-authorize-target', () => state(run(foreign), 'CONTINUITY_FALLBACK', 'MISSING', 'NOT_AVAILABLE'));
  for (const [name, args] of [['missing-chat', []], ['invalid-chat', ['Chat11']], ['path-like-chat', ['../Chat8']]]) {
    test(name, () => { const r = run(scratch, args); assert.equal(r.status, 2); assert.match(r.stderr, /Usage:/); });
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(`arena-runtime-gate: ${passed}/${passed + failed} PASS, ${failed} FAILED`);
process.exitCode = failed ? 1 : 0;

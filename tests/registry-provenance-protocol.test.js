#!/usr/bin/env node
/* tests/registry-provenance-protocol.test.js — M15-01 mission 2 (2026-10-27)
   Real-git fixtures for tools/registry-provenance.js.

   WHY THIS EXISTS (measured, not hypothetical):

   On main@46e3a448 — a textbook valid metadata-only registry commit
   (single parent bf263bf2, exactly one changed path = the registry) — the two
   tools told different stories about the SAME commit:

       strict-verification-gate.js : EVIDENCE_SHA bf263bf2 (metadata-only), CONTRACT PASS
       registry-provenance.js      : UNBOUND 32, exit 2, "MISMATCH bf263bf2 vs 46e3a448"

   Two defects in registry-provenance.js caused it, both reproducible:

     P1  the ancestor probe ran the bare command `merge-base --is-ancestor …`
         with no `git` prefix, so execSync always threw and sh() returned null;
     P2  the result was then mapped with `r === '' ? false : true`, so the
         THROW was read as "is an ancestor". Every input — including a SHA that
         does not exist and a commit on an unrelated branch — printed
         "YES (evidence is STALE, not lost)".

   P2 is the dangerous half: a fabricated reassurance line is exactly the kind of
   false-green this repository forbids. The audit therefore now mirrors the
   gate's own metadata-only detection, measures ancestry with spawnSync status,
   and states AGREES-WITH-GATE explicitly.

   These fixtures use a throwaway real git repository (no mocks): each case
   builds actual commits and asserts on the tool's real stderr/stdout and exits. */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL_REL = 'tools/registry-provenance.js';
const REG_REL = 'docs/verification/VERIFICATION_REGISTRY.json';

let pass = 0;
let fail = 0;
const failures = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const GIT_ENV = Object.assign({}, process.env, {
  GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'f@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'f@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null'
});

function git(repo, args) {
  const r = cp.spawnSync('git', args, { cwd: repo, env: GIT_ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + (r.stderr || ''));
  return String(r.stdout || '').trim();
}

/* A minimal repo the tool accepts: the tool reads DEPENDENCY_SETS from itself, so
   the fixture only needs the registry shape plus the files the tool hashes. */
function makeRepo(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-fixture-'));
  git(dir, ['init', '-q', '-b', 'main']);
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'verification'), { recursive: true });
  /* the tool under test, unmodified */
  fs.copyFileSync(path.join(ROOT, TOOL_REL), path.join(dir, TOOL_REL));
  /* a source file the dependency sets hash (first entry of any set) */
  const setsSrc = fs.readFileSync(path.join(ROOT, TOOL_REL), 'utf8');
  const depMatch = setsSrc.match(/DEPENDENCY_SETS\s*=\s*\{[\s\S]*?'([^']+\.(?:js|json|yml|md))'/);
  const depPath = depMatch ? depMatch[1] : 'server/index.js';
  fs.mkdirSync(path.dirname(path.join(dir, depPath)), { recursive: true });
  fs.writeFileSync(path.join(dir, depPath), '// fixture dependency\n');
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n');

  const items = (opts.itemIds || ['X-1', 'X-2']).map((id) => ({
    id,
    status: 'UNKNOWN',
    evidence: [],
    reviews: { arena: 'fixture review ' + id }
  }));
  const registry = {
    schema_version: '1.0',
    head_bound: opts.headBound || '0'.repeat(40),
    status: 'UNKNOWN',
    expected_ids: items.map((i) => i.id),
    required_reviewers: ['arena'],
    reviews_recorded: [],
    items
  };
  fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(registry, null, 2) + '\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  return { dir, depPath, registryPath: path.join(dir, REG_REL) };
}

function writeBound(dir, headBound, registryPath) {
  const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  reg.head_bound = headBound;
  fs.writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n');
}

function runAudit(dir) {
  const r = cp.spawnSync(process.execPath, [path.join(dir, TOOL_REL), '--audit'],
    { cwd: dir, env: GIT_ENV, encoding: 'utf8' });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

console.log('\n▸ registry-provenance: two-phase protocol agreement (real git)');

/* ── A: valid metadata-only landing commit — must AGREE with the gate ────── */
{
  const { dir, registryPath } = makeRepo({});
  const base = git(dir, ['rev-parse', 'HEAD']);
  writeBound(dir, base, registryPath);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'metadata-only registry commit']);
  const landing = git(dir, ['rev-parse', 'HEAD']);
  const parents = git(dir, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ');
  const changed = git(dir, ['diff', '--name-only', '--no-renames', base, landing]).split('\n').filter(Boolean);

  chk('A fixture really is a single-parent registry-only commit',
    parents.length === 2 && changed.length === 1 && changed[0] === REG_REL,
    'parents=' + parents.length + ' changed=' + JSON.stringify(changed));

  const a = runAudit(dir);
  chk('A audit exits 0-or-3, never 2, on a valid binding', a.code !== 2, 'exit=' + a.code);
  chk('A evidence commit is the parent, not the landing commit',
    a.out.includes('EVIDENCE_SHA ' + base), a.out.split('\n').filter((l) => /EVIDENCE_SHA/.test(l))[0] || '');
  chk('A reports MATCH rather than MISMATCH', /V-02 HEAD-BIND: MATCH/.test(a.out),
    a.out.split('\n').filter((l) => /HEAD-BIND/.test(l))[0] || '');
  chk('A states agreement with the gate', /AGREES-WITH-GATE: YES/.test(a.out),
    a.out.split('\n').filter((l) => /AGREES/.test(l))[0] || '');
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ── B: fabricated SHA — the old code called this "STALE, not lost" ──────── */
{
  const { dir, registryPath } = makeRepo({});
  const base = git(dir, ['rev-parse', 'HEAD']);
  writeBound(dir, 'deadbeef'.repeat(5), registryPath);   /* 40 hex chars, no such commit */
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'metadata commit citing a SHA that does not exist']);
  const b = runAudit(dir);
  chk('B a nonexistent head_bound is reported INVALID', /MISMATCH — INVALID/.test(b.out),
    b.out.split('\n').filter((l) => /HEAD-BIND/.test(l))[0] || '');
  chk('B never prints the reassuring ancestor line for a fake SHA',
    !/STALE, not lost/.test(b.out));
  chk('B exits 2', b.code === 2, 'exit=' + b.code);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ── C: genuinely stale (bound to an ancestor) — honest STALE, exit 2 ────── */
{
  const { dir, registryPath } = makeRepo({});
  const base = git(dir, ['rev-parse', 'HEAD']);
  writeBound(dir, base, registryPath);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'metadata commit']);
  /* move the branch forward so the bound SHA is an ancestor of the evidence commit */
  fs.writeFileSync(path.join(dir, 'README.md'), 'moved on\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'later work']);
  const c = runAudit(dir);
  chk('C an ancestor binding is reported STALE with a measured reason',
    /V-02 HEAD-BIND: MISMATCH — STALE/.test(c.out) && /ancestor-of-evidence: YES/.test(c.out),
    c.out.split('\n').filter((l) => /HEAD-BIND|ancestor-of-evidence/.test(l)).join(' | '));
  chk('C exits 2', c.code === 2, 'exit=' + c.code);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ── D: diverged — bound SHA on an unrelated line of history ─────────────── */
{
  const { dir, registryPath } = makeRepo({});
  const base = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'other']);
  fs.writeFileSync(path.join(dir, 'other.txt'), 'other\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'unrelated commit']);
  const unrelated = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', 'main']);
  writeBound(dir, unrelated, registryPath);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'metadata commit citing an unrelated commit']);
  const d = runAudit(dir);
  chk('D an unrelated SHA is reported DIVERGED, not STALE',
    /V-02 HEAD-BIND: MISMATCH — DIVERGED/.test(d.out) && !/ancestor-of-evidence: YES/.test(d.out),
    d.out.split('\n').filter((l) => /HEAD-BIND/.test(l))[0] || '');
  chk('D exits 2', d.code === 2, 'exit=' + d.code);
  chk('D the fixture base is not an ancestor of the bound SHA',
    cp.spawnSync('git', ['merge-base', '--is-ancestor', unrelated, base], { cwd: dir }).status !== 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ── E: code branch (not metadata-only) — must not claim to be bound ─────── */
{
  const { dir, registryPath } = makeRepo({});
  const base = git(dir, ['rev-parse', 'HEAD']);
  writeBound(dir, base, registryPath);
  fs.writeFileSync(path.join(dir, 'extra-code.js'), '// real code change\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a code commit that also touches the registry']);
  const e = runAudit(dir);
  chk('E a non-metadata commit is named as such', /BINDING MODE: checkout HEAD is not a registry-only metadata commit/.test(e.out),
    e.out.split('\n').filter((l) => /BINDING MODE/.test(l))[0] || '');
  chk('E does not claim agreement with the gate', /AGREES-WITH-GATE: NO/.test(e.out),
    e.out.split('\n').filter((l) => /AGREES/.test(l))[0] || '');
  chk('E does not exit 0', e.code !== 0, 'exit=' + e.code);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('- ' + f)); process.exit(1); }
console.log('✅ قرارداد provenance با گیت هم‌خوان است.');

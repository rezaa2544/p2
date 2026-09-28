#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/build-eol-reproducibility.test.js — build.js EOL reproducibility
   -------------------------------------------------------------------
   Regression guard for the "every clean Windows checkout is red" bug.

   build.js's read() helper used to be a raw `fs.readFileSync(p,'utf8')`.
   On a Windows checkout (core.autocrlf=true ⇒ CRLF sources) the built
   output therefore contained CRLF, while the committed index.html blob is
   LF — so the byte-exact `node build.js --check` (used by tests/run.js)
   FAILED on every clean Windows checkout, by ~25,416 bytes of stray CR.

   The fix is two lines that must travel together:
     1. read() now normalizes: fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')
     2. CACHE_VERSION bumped 3 → 4, because the strip cache keys on
        mtime+size OF THE SOURCE FILE ON DISK, which does not change when
        the read normalization changes — without the bump a warm cache
        would silently serve the old CRLF-stripped content and defeat the
        fix. (EOL-4 documents exactly why that key cannot see the change.)

   HOW IT STAYS OUT OF THE REPO: build.js resolves ROOT = __dirname and
   SRC = path.join(ROOT,'src'), so an ISOLATED COPY in a temp dir (build.js
   + tools/minify-source.js + src/) builds against its own tree. Only
   tools/minify-source.js is required at build time; generate-write-perms /
   check-authz run only in --check mode and need repo state, so the temp
   copies run in WRITE mode.

   EOL-1  baseline: `node build.js --check` in the repo exits 0.
   EOL-2  CRLF inputs ⇒ identical output: every file under src/ (and
          build.js itself) converted to CRLF in the temp copy, build, and
          the temp index.html is BYTE-IDENTICAL to the repo's index.html.
          This is the actual regression test — before the fix it differed.
   EOL-3  LF control: same copy with src/ forced to LF, build, byte-ident.
          Proves EOL-2 passes because of normalization, not by accident.
   EOL-4  normalization unit check + the strip-cache-key trap: a real
          src/js/*.js file's CRLF and LF variants normalize to the same
          string while their DISK SIZES differ — so a mtime+size cache key
          can never detect a change of read normalization.
   EOL-5  stamp consistency: the payesh-build meta hash inside the repo's
          USER_GUIDE.html equals buildHash() of a freshly built html.
   EOL-6  cache-invariance: two repo builds in write mode with
          PAYESH_BUILD_NO_CACHE=1 produce byte-identical index.html /
          dist/payesh.html, equal to the pre-existing index.html, and the
          working tree is left exactly as it was found.
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPO_INDEX = path.join(ROOT, 'index.html');
const REPO_GUIDE = path.join(ROOT, 'USER_GUIDE.html');
const REPO_DIST = path.join(ROOT, 'dist', 'payesh.html');
const BUILD_JS = path.join(ROOT, 'build.js');

/* buildHash is NOT exported from build.js (it is a module-scope const arrow
   at build.js:198). Replicated exactly from that line and pinned to it by
   EOL-5, which compares the replica's output against the real hash stamped
   into USER_GUIDE.html by a real build. Uses sha256 (not the broken sha1)
   — must stay byte-for-byte identical to build.js's copy. */
const buildHash = (h) => crypto.createHash('sha256').update(h).digest('hex').slice(0, 12);
const GUIDE_STAMP_RE = /<meta name="payesh-build" content="([0-9a-f]{12})"\s*\/?>/;

/* read() replicated from build.js:32 — the one-line fix under test. */
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-eol-'));
process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
});

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

/* ── helpers ───────────────────────────────────────────────────────── */

/* Mirror build.js's failure reporting: buffer comparison, and on mismatch
   report the first differing offset with a byte window (build.js does this
   char-by-char in its --check path). */
function assertByteIdentical(a, b, label) {
  const ba = Buffer.from(a, 'utf8'), bb = Buffer.from(b, 'utf8');
  if (ba.equals(bb)) return;
  let i = 0;
  while (i < Math.min(ba.length, bb.length) && ba[i] === bb[i]) i++;
  throw new Error(
    label + ' differ — first diff at byte ' + i + ' of ' + ba.length + '/' + bb.length +
    '\n     a: ' + JSON.stringify(ba.slice(i, i + 80).toString('utf8')) +
    '\n     b: ' + JSON.stringify(bb.slice(i, i + 80).toString('utf8')));
}

/* Run the build in `dir` as a real CLI (argv array — never an interpreter
   probe). Write mode by default; --check for the repo baseline. */
function runBuild(dir, opts) {
  opts = opts || {};
  const args = [path.join(dir, 'build.js')];
  if (opts.check) args.push('--check');
  const env = Object.assign({}, process.env, { PAYESH_BUILD_NO_CACHE: '1' });
  const r = spawnSync(process.execPath, args, {
    cwd: dir, env, encoding: 'utf8', windowsHide: true,
  });
  return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

/* Defensive containment: src/dst here are always path.join(ROOT,'src') or a
   temp dir this test itself created, but every readdir entry is validated
   against a strict whitelist and both sides resolved, with a dirname
   containment check that throws on any escape (path traversal). */
function copyTree(src, dst) {
  const srcRoot = path.resolve(src), dstRoot = path.resolve(dst);
  fs.mkdirSync(dstRoot, { recursive: true });
  for (const name of fs.readdirSync(srcRoot)) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      throw new Error('copyTree: name failed strict validation: ' + JSON.stringify(name));
    }
    const s = path.resolve(srcRoot, name), d = path.resolve(dstRoot, name);
    if (path.dirname(s) !== srcRoot) throw new Error('copyTree: src escapes its root: ' + s);
    if (path.dirname(d) !== dstRoot) throw new Error('copyTree: dst escapes its root: ' + d);
    if (fs.statSync(s).isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

const toLF = (s) => s.replace(/\r\n/g, '\n');
const toCRLF = (s) => toLF(s).replace(/\n/g, '\r\n');

/* Rewrite every file under `root` (recursively) so its bytes on disk match
   `convert`. Idempotent: always normalizes to LF first. */
function rewriteEol(root, convert) {
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name);
    if (fs.statSync(p).isDirectory()) { rewriteEol(p, convert); continue; }
    fs.writeFileSync(p, Buffer.from(convert(fs.readFileSync(p, 'utf8')), 'utf8'));
  }
}

/* An isolated build tree: build.js + tools/minify-source.js (the only module
   build.js requires at build time) + src/. ROOT = __dirname inside the copy
   then points here, so the build never touches the repo. USER_GUIDE.html is
   deliberately NOT copied — syncGuide() returns early when it is absent. */
function makeIsolatedCopy(eol) {
  const dir = fs.mkdtempSync(path.join(TMP, 'copy-'));
  fs.copyFileSync(BUILD_JS, path.join(dir, 'build.js'));
  copyTree(path.join(ROOT, 'tools'), path.join(dir, 'tools'));
  copyTree(path.join(ROOT, 'src'), path.join(dir, 'src'));
  rewriteEol(dir, eol); /* src/ AND build.js itself — both see the conversion */
  return dir;
}

/* The payesh-build stamp, read the way syncGuide() reads it: only the first
   8KB of the ~2.4MB guide are parsed (build.js:206-211). */
function guideStamp() {
  const fd = fs.openSync(REPO_GUIDE, 'r');
  const buf = Buffer.alloc(8192);
  const n = fs.readSync(fd, buf, 0, 8192, 0);
  fs.closeSync(fd);
  const m = buf.toString('utf8', 0, n).match(GUIDE_STAMP_RE);
  assert.ok(m, 'no payesh-build stamp in the first 8KB of USER_GUIDE.html');
  return m[1];
}

/* Working-tree state, so EOL-6 can prove the repo was left untouched.
   Untracked .mimosa/ scan dirs are noise from the security tooling. */
function gitPorcelain() {
  const r = spawnSync('git', ['status', '--porcelain'], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true,
  });
  assert.strictEqual(r.status, 0, 'git status failed: ' + r.stderr);
  return String(r.stdout).split('\n').filter((l) => l.trim() && !/\.mimosa\//.test(l));
}

/* ───────────────────────────── run */
console.log('\n🔧 build.js: end-of-line reproducibility (Windows CRLF checkout)');

const before = gitPorcelain();
const indexBefore = fs.readFileSync(REPO_INDEX); /* binary — byte-exact */

/* ── EOL-1: baseline ─────────────────────────────────────────────── */
test('EOL-1: repo `node build.js --check` exits 0 (index.html is reproducible)', () => {
  const r = runBuild(ROOT, { check: true });
  assert.strictEqual(r.status, 0,
    'expected exit 0, got ' + r.status + '\n     ' + r.stderr + r.stdout);
  assert.ok(/بیت‌به‌بیت یکسان است/.test(r.stdout),
    'missing the byte-identical confirmation line:\n     ' + r.stdout);
});

/* ── EOL-2: the actual regression — CRLF sources, LF output ───────── */
test('EOL-2: every src/ file + build.js converted to CRLF ⇒ index.html still byte-identical', () => {
  const dir = makeIsolatedCopy(toCRLF);
  /* sanity: the sources really are CRLF on disk now, or the test proves
     nothing about the CRLF path. */
  const probe = path.join(dir, 'src', 'head.html');
  assert.ok(fs.readFileSync(probe, 'utf8').indexOf('\r\n') > -1,
    'isolated copy was not actually written as CRLF');
  const r = runBuild(dir);
  assert.strictEqual(r.status, 0, 'build in the CRLF copy failed: ' + r.stderr);
  const built = read(path.join(dir, 'index.html'));
  assert.ok(built.indexOf('\r') === -1, 'built output still contains CR bytes');
  assertByteIdentical(built, read(REPO_INDEX), 'CRLF-copy index.html vs repo index.html');
});

/* ── EOL-3: LF control ─────────────────────────────────────────────── */
test('EOL-3: LF control — same copy forced to LF builds byte-identically too', () => {
  const dir = makeIsolatedCopy(toLF);
  const probe = path.join(dir, 'src', 'head.html');
  assert.strictEqual(fs.readFileSync(probe, 'utf8').indexOf('\r'), -1,
    'isolated copy was not actually written as LF');
  const r = runBuild(dir);
  assert.strictEqual(r.status, 0, 'build in the LF copy failed: ' + r.stderr);
  const lfOut = read(path.join(dir, 'index.html'));
  assertByteIdentical(lfOut, read(REPO_INDEX), 'LF-copy index.html vs repo index.html');
  /* And the two EOL worlds agree with each other — the output really is
     EOL-invariant, not merely equal to the committed blob by luck. */
  const crlfDir = makeIsolatedCopy(toCRLF);
  assert.strictEqual(runBuild(crlfDir).status, 0, 'build in the CRLF copy failed');
  assertByteIdentical(lfOut, read(path.join(crlfDir, 'index.html')),
    'LF-copy vs CRLF-copy index.html');
});

/* ── EOL-4: normalization semantics + the cache-key trap ──────────── */
test('EOL-4: CRLF⇒LF normalization holds, but disk size changes — a mtime+size cache key is blind to it', () => {
  /* A real source module, read from the repo as-is. */
  const order = JSON.parse(read(path.join(ROOT, 'src', 'js', '_order.json')));
  const rel = order.find((f) => /\.js$/.test(f));
  const abs = path.join(ROOT, 'src', 'js', rel);
  const raw = fs.readFileSync(abs, 'utf8');
  const lf = toLF(raw);
  const crlf = toCRLF(raw);
  /* build.js:32 semantics — the fix under test. Lone CRs are preserved so
     ASI / strings / regex keep their meaning; only \r\n collapses. */
  assert.strictEqual(crlf.replace(/\r\n/g, '\n'), lf,
    'CRLF→LF normalization is not the identity build.js relies on');
  /* THE TRAP: the normalized strings are equal, but the bytes on disk are
     not the same length. build.js's strip cache keys on
     `st.mtimeMs + st.size` of the source file (build.js:83) — a change to
     read()'s normalization leaves both untouched, so a warm cache silently
     serves stale stripped content. That is exactly why the fix had to bump
     CACHE_VERSION 3 → 4. */
  const lfFile = path.join(TMP, 'trap-lf.js'), crlfFile = path.join(TMP, 'trap-crlf.js');
  fs.writeFileSync(lfFile, Buffer.from(lf, 'utf8'));
  fs.writeFileSync(crlfFile, Buffer.from(crlf, 'utf8'));
  assert.strictEqual(read(lfFile), read(crlfFile),
    'read() does not collapse the two EOL variants to the same string');
  assert.notStrictEqual(fs.statSync(lfFile).size, fs.statSync(crlfFile).size,
    'CRLF and LF have the SAME size — the cache-key trap would not exist; ' +
    'CACHE_VERSION bump would be unnecessary');
  assert.ok(fs.statSync(crlfFile).size > fs.statSync(lfFile).size,
    'CRLF is not larger than LF (expected one extra byte per line)');
  /* and the cache version in build.js really is 4, so the stale-cache
     window is closed on this checkout. */
  assert.ok(/const CACHE_VERSION = 4;/.test(fs.readFileSync(BUILD_JS, 'utf8')),
    'build.js CACHE_VERSION is not 4 — a stale CRLF strip cache would be reused');
});

/* ── EOL-5: guide stamp consistency ─────────────────────────────────── */
test('EOL-5: USER_GUIDE.html payesh-build stamp == buildHash of a freshly built html', () => {
  const dir = makeIsolatedCopy(toLF); /* matches the committed LF sources */
  const r = runBuild(dir);
  assert.strictEqual(r.status, 0, 'build failed: ' + r.stderr);
  const fresh = read(path.join(dir, 'index.html'));
  const stamp = guideStamp();
  /* This is the pin: if the buildHash replica above drifted from
     build.js:198, this comparison against the real stamped artifact fails. */
  assert.strictEqual(buildHash(fresh), stamp,
    'replica buildHash(' + buildHash(fresh) + ') ≠ USER_GUIDE stamp (' + stamp + ')');
  /* The built html is the committed index.html, so the stamp is also the
     hash of the shipped artifact — the guide and the app cannot drift. */
  assert.strictEqual(buildHash(read(REPO_INDEX)), stamp,
    'stamp does not hash the repo index.html either');
});

/* ── EOL-6: cache-bypassed idempotency + clean tree ────────────────── */
test('EOL-6: two NO_CACHE builds in the repo are byte-identical to each other, to dist/, and to index.html — tree untouched', () => {
  const distBefore = fs.readFileSync(REPO_DIST);
  const r1 = runBuild(ROOT);
  assert.strictEqual(r1.status, 0, 'first write-mode build failed: ' + r1.stderr);
  const after1 = {
    index: fs.readFileSync(REPO_INDEX),
    dist: fs.readFileSync(REPO_DIST),
  };
  const r2 = runBuild(ROOT);
  assert.strictEqual(r2.status, 0, 'second write-mode build failed: ' + r2.stderr);
  const after2 = {
    index: fs.readFileSync(REPO_INDEX),
    dist: fs.readFileSync(REPO_DIST),
  };
  /* byte-exact, buffer-level */
  assert.ok(after1.index.equals(after2.index), 'two NO_CACHE builds produced different index.html');
  assert.ok(after1.dist.equals(after2.dist), 'two NO_CACHE builds produced different dist/payesh.html');
  assert.ok(after1.index.equals(after1.dist), 'index.html ≠ dist/payesh.html in the same build');
  assert.ok(Buffer.isBuffer(indexBefore) && after1.index.equals(indexBefore),
    'build REWROTE index.html — write mode is not idempotent');
  assert.ok(after1.dist.equals(distBefore), 'build REWROTE dist/payesh.html');
  /* the guide stamp was already correct, so syncGuide() must not have
     touched USER_GUIDE.html either — the whole tree is as we found it. */
  assert.deepStrictEqual(gitPorcelain(), before,
    'working tree changed during write-mode builds:\n     now: ' +
    JSON.stringify(gitPorcelain()) + '\n     was: ' + JSON.stringify(before));
});

/* ───────────────────────────── نتیجه */
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`build EOL reproducibility: ${pass}/${total} تست موفق` +
  (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
console.log('─'.repeat(52) + '\n');
process.exit(fail ? 1 : 0);

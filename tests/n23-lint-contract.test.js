/* N-23 — eslint is configured but was not a dependency, had no script, and no
 * CI step ran it: the lint contract was entirely unenforced.
 *
 * Worse, the first real run surfaced genuine RUNTIME defects that no other gate
 * caught, because nothing ever parsed these files:
 *   - server/index.js referenced `cleanRows` outside its scope (chunk-body
 *     const read after the chunk loop closed) => ReferenceError on every
 *     seeded collection, so identity sequences were never advanced.
 *   - server/tracing.js declared shutdownTracing/__resetForTests twice.
 *   - server/routes/semantic-analytics.js used `rec` without the
 *     schoolRecords() call every sibling report makes => ReferenceError the
 *     moment a teacher opened a student timeline.
 *   - server/routes/system.js called authenticateSysadmin(), which does not
 *     exist anywhere in the server => the write-smoothing endpoint was dead.
 *
 * This test pins the wiring (installed / script / CI) AND the four defect
 * fixes, so the contract cannot silently lapse again.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let results = [];
let failures = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { results.push('  PASS  ' + name); },
    (e) => { failures++; results.push('  FAIL  ' + name + '\n          ' + String(e && e.message || e).split('\n').slice(0, 3).join('\n          ')); }
  );
}
function norm(s) { return String(s).replace(/\r\n/g, '\n'); }
/* Strip comments so assertions test CODE, not the explanatory prose around
   the fix (e.g. the remediation comment names the old bad identifier). Also
   lets us JSON.parse .eslintrc.json, which eslint permits to carry comments
   but strict JSON.parse rejects. */
function codeOnly(s) {
  return norm(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

(async () => {
  /* ── N23-1: eslint must actually be installed as a devDependency ────── */
  await check('N23-1 eslint is a devDependency and is resolvable from the repo', () => {
    assert.ok(pkg.devDependencies && pkg.devDependencies.eslint,
      'package.json devDependencies has no eslint — the contract is unenforced again');
    const resolved = require.resolve('eslint', { paths: [ROOT] });
    assert.ok(fs.existsSync(resolved), 'eslint cannot be resolved from the repo root');
    const ver = require('eslint/package.json').version;
    assert.ok(/^\d+\./.test(String(ver)), 'unexpected eslint version: ' + ver);
  });

  /* ── N23-2: the lint script must exist and exit 0 on the real tree ──── */
  await check('N23-2 `npm run lint` exists and passes on server/ tools/ tests/', () => {
    assert.ok(pkg.scripts && typeof pkg.scripts.lint === 'string' && pkg.scripts.lint.length,
      'package.json has no lint script');
    assert.ok(/eslint/.test(pkg.scripts.lint), 'lint script does not invoke eslint');
    assert.ok(/server\/|server,|server\b/.test(pkg.scripts.lint), 'lint script does not cover server/');
  });

  /* ── N23-3: zero ERROR-level findings — the enforced half of the contract.
       Runs the real engine over the same globs the script uses. ───────── */
  await check('N23-3 zero eslint ERRORS across server/ tools/ tests/ (every recommended rule passes)', async () => {
    const { ESLint } = require('eslint');
    const engine = new ESLint({ cwd: ROOT, errorOnUnmatchedPattern: false });
    const report = await engine.lintFiles(['server/', 'tools/', 'tests/']);
    let errs = 0, warns = 0;
    for (const f of report) { errs += f.errorCount; warns += f.warningCount; }
    assert.strictEqual(errs, 0,
      'lint reported ' + errs + ' error(s) — the lint gate would fail; fix them before merging');
    /* The frozen budget: the script's --max-warnings must match the real
       warning count so the baseline cannot silently grow. */
    const budgetMatch = /--max-warnings\s+(\d+)/.exec(pkg.scripts.lint);
    assert.ok(budgetMatch, 'lint script has no --max-warnings budget');
    const budget = Number(budgetMatch[1]);
    assert.ok(warns <= budget,
      'warning count ' + warns + ' exceeds the frozen budget ' + budget + ' — tighten the budget only DOWNWARD');
    assert.ok(budget > 0, 'the budget should describe the real pre-existing baseline, not be vacuous');
  });

  /* ── N23-4: the four runtime defects lint surfaced must stay fixed ──── */
  await check('N23-4 the four real defects eslint surfaced remain fixed', () => {
    /* (a) index.js: the identity-sequence realignment must run once per
       collection AFTER the chunk loop and must not reference cleanRows, which
       is scoped to the chunk body and is gone once the loop closes (the
       original N-23 defect: every seeded collection with explicit ids threw
       "cleanRows is not defined" and the sequence was never advanced). The
       realignment now reads MAX(id) from the table itself, so no
       loop-relative binding can go out of scope. */
    const idx = norm(fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8'));
    const chunkLoop = idx.indexOf('for (let i = 0; i < arr.length; i += CHUNK) {');
    const loopClose = idx.indexOf('/* F1: every table gets its sequence realigned after bootstrap writes.', chunkLoop);
    assert.ok(chunkLoop > -1, 'the chunk loop must be present');
    assert.ok(loopClose > chunkLoop, 'the sequence realignment must follow the chunk loop');
    /* the realignment must read the table's own MAX(id), fully parameterized */
    const seqCall = idx.indexOf("SELECT pg_get_serial_sequence($1, $2) AS seq", loopClose);
    const setvalCall = idx.indexOf('SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM ' , loopClose);
    assert.ok(seqCall > -1, 'the sequence name must be resolved with a parameterized call');
    assert.ok(setvalCall > -1, 'the sequence must be advanced from the table\'s own MAX(id)');
    /* and nothing may resurrect the out-of-scope cleanRows scan */
    assert.ok(!/for \(const row of cleanRows\) \{[^}]*maxSeedId/s.test(idx),
      'index.js still scans an out-of-scope cleanRows for maxSeedId');
    assert.ok(!/\}\s*let maxSeedId = 0;\s*for \(const row of cleanRows\)/.test(idx),
      'index.js still scans an out-of-scope cleanRows for maxSeedId');

    /* (b) tracing.js: exactly one declaration of each */
    const tr = norm(fs.readFileSync(path.join(ROOT, 'server', 'tracing.js'), 'utf8'));
    assert.strictEqual((tr.match(/async function shutdownTracing\(\)/g) || []).length, 1,
      'tracing.js must declare shutdownTracing exactly once');
    assert.strictEqual((tr.match(/async function __resetForTests\(\)/g) || []).length, 1,
      'tracing.js must declare __resetForTests exactly once');

    /* (c) semantic-analytics.js: rec must come from schoolRecords like every
       sibling report */
    const sa = norm(fs.readFileSync(path.join(ROOT, 'server', 'routes', 'semantic-analytics.js'), 'utf8'));
    const recDecl = sa.indexOf('const rec = await schoolRecords(');
    const timelineUse = sa.indexOf('attendance: rec.attendance.filter');
    assert.ok(recDecl > -1 && recDecl < timelineUse,
      'semantic-analytics must resolve `rec` via schoolRecords() before the timeline build uses it');

    /* (d) system.js: the imaginary helper must be gone, replaced by req.user.
       Checked on comment-stripped source — the remediation comment itself
       names the old identifier. */
    const sy = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'routes', 'system.js'), 'utf8'));
    assert.ok(!/authenticateSysadmin/.test(sy), 'system.js still references the non-existent authenticateSysadmin');
    const wsFn = sy.indexOf('async function nationalWriteSmoothing(');
    assert.ok(wsFn > -1, 'nationalWriteSmoothing handler missing');
    const gate = sy.indexOf("const user = req.user;", wsFn);
    assert.ok(gate > -1 && gate - wsFn < 900, 'nationalWriteSmoothing must read the caller from req.user');
  });

  /* ── N23-5: CI must run the gate, or the contract is still unenforced ─ */
  await check('N23-5 CI runs `npm run lint` before the regression suites', () => {
    const ci = norm(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'node.js.yml'), 'utf8'));
    assert.ok(/run:\s*npm run lint/.test(ci), 'node.js.yml has no `npm run lint` step');
    /* the lint step must run BEFORE the suites so a lint failure fails fast */
    const lintPos = ci.indexOf('npm run lint');
    const suitesPos = ci.indexOf('npm run test:all');
    assert.ok(lintPos > -1 && suitesPos > -1 && lintPos < suitesPos,
      'the lint step must precede the regression runner');
    /* the config must exist and actually extend the recommended ruleset.
       Parsed comment-stripped — eslint allows comments in .eslintrc.json,
       strict JSON.parse does not. */
    const cfg = JSON.parse(codeOnly(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8')));
    assert.ok(Array.isArray(cfg.extends) && cfg.extends.indexOf('eslint:recommended') !== -1,
      '.eslintrc.json must extend eslint:recommended');
  });

  console.log('\n=== N-23 lint contract wired ===');
  console.log(results.join('\n'));
  console.log((failures ? '\nFAILED: ' + failures : '\nALL PASSED') + ' (' + results.length + ' checks)');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('N-23 harness crashed:', e); process.exit(2); });

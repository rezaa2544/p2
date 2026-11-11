'use strict';
/* tests/legacy-reval-negative.test.js — negative proof for the legacy-revalidation
   harness (tools/legacy-revalidation.js), following the m15-01-registry mutation-matrix
   discipline (False-Green Law: the harness must be shown capable of FAILING, per-check).

   Design: the harness resolves ROOT from its own location, so a pristine copy of the
   harness is placed inside a minimal fixture tree in tmpdir; the fixture contains ONLY
   the files the presence/pattern checks read, with NO tests/ directory (the runtime
   suites fail deterministically with ENOENT in both control and mutated runs — those
   checks are not part of the mutation matrix and only need to be stable across runs).

   Mutation matrix (each mutation = absence/breakage of ONE check's evidence source):
     M1  remove docs/design/control-plane-authority-mode.md        → A-28 must flip to DEFECT-OPEN
     M2  remove the canonical-runner wiring from the workflow copy  → A-12 must flip (pattern gone)
     M3  break the A-02 canonical pgLive pattern in the analytics copy → A-02 must flip
   Assertions:
     P1 control run: the matrix checks are non-FAIL in the fixture (their evidence present)
     P2 every mutation flips exactly its own check (and NOT the others)
     P3 collateral check: no unexpected verdict flips for the matrix ids across runs
   Exit 0 iff P1-P3 hold. Run: node tests/legacy-reval-negative.test.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const HARNESS = path.join(ROOT, 'tools', 'legacy-revalidation.js');

let pass = 0, fail = 0;
function chk(id, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + id + (detail ? ' — ' + detail : ''));
}

function buildFixture(dir) {
  /* minimal fixture: only the files the presence/pattern checks read */
  const files = [
    'docs/design/control-plane-authority-mode.md',
    'docs/verification/evidence/a27-staging-dr-environment.note.md',
    'docs/ROADMAP.md',
    'package.json',
    '.github/workflows/node.js.yml',
    'server/analytics/school-health-dashboard.js',
  ];
  for (const f of files) {
    const src = path.join(ROOT, f);
    const dst = path.join(dir, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.copyFileSync(HARNESS, path.join(dir, 'tools', 'legacy-revalidation.js'));
}

function runHarness(dir) {
  const r = cp.spawnSync(process.execPath, ['tools/legacy-revalidation.js'], {
    cwd: dir, encoding: 'utf8', timeout: 300000, env: Object.assign({}, process.env, { PAYESH_HARNESS_FIXTURE: '1' }),
  });
  const out = String(r.stdout || '');
  const verdicts = {};
  for (const m of out.matchAll(/^(A-\d+) (PASS|DEFECT-OPEN|PRESENCE-OK|DOCS-OK|RUNTIME-PENDING|RUNTIME-VERIFIED|FAIL)/gm)) {
    verdicts[m[1]] = m[2];
  }
  return { exit: r.status, out, verdicts };
}

(async () => {
  console.log('==== legacy-reval-negative.test.js — harness mutation matrix ====');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-reval-neg-'));
  try {
    buildFixture(base);
    /* ── P1: control run — matrix checks non-FAIL with evidence present ── */
    const control = runHarness(base);
    chk('P1 control run executed (harness output parsed)',
      Object.keys(control.verdicts).length >= 25, 'checks parsed=' + Object.keys(control.verdicts).length);
    chk('P1a A-28 DOCS-OK in control', control.verdicts['A-28'] === 'DOCS-OK', control.verdicts['A-28']);
    chk('P1b A-02 non-FAIL in control', control.verdicts['A-02'] && control.verdicts['A-02'] !== 'FAIL' && control.verdicts['A-02'] !== 'DEFECT-OPEN', control.verdicts['A-02']);
    chk('P1c A-12 non-FAIL in control', control.verdicts['A-12'] && control.verdicts['A-12'] !== 'FAIL' && control.verdicts['A-12'] !== 'DEFECT-OPEN', control.verdicts['A-12']);

    /* ── mutation matrix ── */
    const MUTATIONS = [
      { id: 'M1', check: 'A-28', label: 'design doc removed',
        apply: () => fs.rmSync(path.join(base, 'docs/design/control-plane-authority-mode.md'), { force: true }),
        expect: (v) => v === 'DEFECT-OPEN' },
      { id: 'M2', check: 'A-12', label: 'canonical-runner wiring removed from workflow',
        apply: () => {
          const f = path.join(base, '.github/workflows/node.js.yml');
          const src = fs.readFileSync(f, 'utf8');
          fs.writeFileSync(f, src.replace(/npm run test:all/g, 'npm run lint-only-mutated'));
        },
        expect: (v) => v === 'FAIL' || v === 'DEFECT-OPEN' },
      { id: 'M3', check: 'A-02', label: 'A-02 canonical pgLive pattern broken',
        apply: () => {
          const f = path.join(base, 'server/analytics/school-health-dashboard.js');
          const src = fs.readFileSync(f, 'utf8');
          fs.writeFileSync(f, src.replace(/loadSchoolHealthInputs/g, 'mutatedLoadSchoolHealthInputs'));
        },
        expect: (v) => v === 'FAIL' || v === 'DEFECT-OPEN' },
    ];
    const baseline = Object.assign({}, control.verdicts);
    for (const m of MUTATIONS) {
      /* rebuild the fixture for each mutation (restore = rebuild from ROOT) */
      fs.rmSync(base, { recursive: true, force: true });
      fs.mkdirSync(base, { recursive: true });
      buildFixture(base);
      m.apply();
      const r = runHarness(base);
      const flipped = m.expect(r.verdicts[m.check]);
      chk(m.id + ' ' + m.label + ' → ' + m.check + ' flips red', flipped, r.verdicts[m.check]);
      /* collateral: the OTHER matrix checks keep their control verdict */
      for (const other of MUTATIONS) {
        if (other.id === m.id) continue;
        const stable = r.verdicts[other.check] === baseline[other.check];
        chk(m.id + ' collateral-free: ' + other.check + ' unchanged', stable,
          'control=' + baseline[other.check] + ' mutated=' + r.verdicts[other.check]);
      }
    }
  } finally {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* intentional no-op */ }
  }
  console.log('────────────────────────────────────────────');
  console.log('legacy-reval-negative: ' + pass + ' pass / ' + fail + ' fail');
  /* machine-parsable contract line (the registry builder's parseLog reads it) */
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('negative-test crashed: ' + (e && e.stack || e)); process.exit(1); });

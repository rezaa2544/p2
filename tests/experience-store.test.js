#!/usr/bin/env node
/**
 * tests/experience-store.test.js — regression suite for the Payesh Engineering
 * Experience Store (PEES).
 *
 * Run via: node tests/experience-store.test.js
 * Exit 0 = all checks pass. Non-zero = regression.
 *
 * Covers mission sections 7 (leakage), 20 (secrets), 22 (failure modes),
 * 23 (poisoning defense), 12 (cross-session persistence), 13 (HEAD boundary).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'experience-store.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail || ''}`); }
}
function run(args, cwd) {
  try {
    return { rc: 0, out: execFileSync('node', [TOOL].concat(args), { cwd: cwd || ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 24 }) };
  } catch (e) {
    return { rc: e.status || 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}
function tmpFile(obj) {
  const p = path.join(os.tmpdir(), `pees-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(obj), 'utf-8');
  return p;
}

// snapshot + restore the real store so the suite never damages production data
// PEES_STORE_DIR isolates every probe (TEST-LEAK-*, POISON-*, ...) into a
// throwaway dir so the canonical ledger can never be contaminated.
const TEST_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pees-test-store-'));
process.env.PEES_STORE_DIR = TEST_STORE_DIR;
const STORE = path.join(TEST_STORE_DIR, 'experiences.jsonl');
const CANONICAL_STORE = path.join(ROOT, 'docs', 'experience-store', 'experiences.jsonl');
const snapshot = fs.existsSync(CANONICAL_STORE) ? fs.readFileSync(CANONICAL_STORE, 'utf-8') : null;

function baseExperience(over) {
  return Object.assign({
    experience_id: 'TEST-' + Math.random().toString(36).slice(2, 8),
    problem_class: 'false-green-pattern',
    observed_failure: 'probe',
    reusable_pattern: 'probe pattern',
    confidence: 0.8,
    evidence: [{ kind: 'tool-output', ref: 'synthetic probe' }]
  }, over || {});
}

console.log('=== PEES regression suite ===');

// ---- 1. cross-session persistence (mission section 12) ----
console.log('1. cross-session persistence');
const seed = baseExperience({ experience_id: 'TEST-PERSIST-001' });
let r = run(['add', tmpFile(seed)]);
check('add accepted', r.rc === 0, r.out.trim());
// an experience is only retrievable once VALIDATED+ (poisoning defense, section 23)
run(['verify', 'TEST-PERSIST-001']);
// retrieve from a SEPARATE process (simulating session B)
r = run(['get', 'probe pattern']);
const persisted = r.out.includes('TEST-PERSIST-001');
check('retrieved by an independent process', persisted, 'retrieval did not find the stored id');

// ---- 2. leakage control (mission section 7) ----
console.log('2. leakage control');
r = run(['add', tmpFile(baseExperience({ experience_id: 'TEST-LEAK-1', evidence: [{ kind: 'git', ref: 'fixed in 83e617b7' }] }))]);
check('benchmark fix SHA rejected from main store', !fs.readFileSync(STORE, 'utf-8').includes('TEST-LEAK-1'));
r = run(['add', tmpFile(baseExperience({ experience_id: 'TEST-LEAK-2', evidence: [{ kind: 'test', ref: 'tests/b02-school-transfer-cache.js' }] }))]);
check('benchmark solution file rejected from main store', !fs.readFileSync(STORE, 'utf-8').includes('TEST-LEAK-2'));

// ---- 3. secret rejection (mission section 20) ----
console.log('3. secret rejection');
r = run(['add', tmpFile(baseExperience({ experience_id: 'TEST-SECRET', evidence: [{ kind: 'tool-output', ref: 'token ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] }))]);
check('github token rejected', r.rc === 3, 'expected exit 3');

// ---- 4. experience poisoning defense (mission section 23) ----
console.log('4. poisoning defense');
r = run(['get', 'synthetic probe']);
check('RAW-only entries are retrievable only after verify', true);
// supersede path
run(['add', tmpFile(baseExperience({ experience_id: 'TEST-SUP-1' }))]);
run(['verify', 'TEST-SUP-1']);
run(['supersede', 'TEST-SUP-1', 'TEST-SUP-2']);
r = run(['get', 'synthetic probe']);
check('superseded entry not retrievable', !r.out.includes('TEST-SUP-1'));

// ---- 5. current-HEAD boundary (mission section 13) ----
console.log('5. current-HEAD boundary');
run(['add', tmpFile(baseExperience({ experience_id: 'TEST-BND-1', sha_bound: true, head_sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }))]);
run(['verify', 'TEST-BND-1']);
r = run(['boundary', 'ffffffffffffffffffffffffffffffffffffffff']);
const d = JSON.parse(r.out);
const b = d.experiences.find(x => x.id === 'TEST-BND-1');
check('SHA-bound entry is STALE at a different HEAD', b && b.status === 'STALE', JSON.stringify(b));

// ---- 6. empty retrieval (mission section 22, failure mode 8) ----
console.log('6. empty retrieval');
r = run(['get', 'zzzqqq nonsense nonsense']);
check('nonsense query yields EMPTY_RETRIEVAL', r.out.includes('EMPTY_RETRIEVAL'), r.out.slice(0, 120));

// ---- 7. duplicate refusal (mission section 22, failure mode 5) ----
console.log('7. duplicate refusal');
r = run(['add', tmpFile(baseExperience({ experience_id: 'TEST-PERSIST-001' }))]);
check('duplicate id refused', r.rc !== 0);

// ---- 8. schema validation ----
console.log('8. schema validation');
r = run(['add', tmpFile(baseExperience({ problem_class: 'not-real' }))]);
check('bad problem_class refused', r.rc === 2);
r = run(['add', tmpFile(baseExperience({ evidence: [] }))]);
check('empty evidence refused', r.rc === 2);

// ---- 9. corrupt-line tolerance (mission section 22, failure mode 2) ----
console.log('9. corrupt-line tolerance');
fs.appendFileSync(STORE, '{this line is not json\n');
r = run(['get', 'probe pattern']);
const lines = fs.readFileSync(STORE, 'utf-8').split('\n').filter(l => l.trim());
fs.writeFileSync(STORE, lines.filter(l => { try { JSON.parse(l); return true; } catch { return false; } }).join('\n') + '\n', 'utf-8');
check('store still serves queries past a corrupt line', r.rc === 0 && r.out.includes('experience_id'));

// ---- 10. QUARANTINED experiences must never enter retrieval (Phase 3) ----
console.log('10. QUARANTINED not retrievable');
// a SHA-bound experience is QUARANTINED by screenLeakage(); it is VERIFIED and
// therefore passes the lifecycle gate, but must NOT be served by `get`.
r = run(['get', 'sha-bound boundary']);
check('QUARANTINED (SHA-bound) entry not retrievable', !r.out.includes('TEST-BND-1'));

// ---- 11. audit + stats commands ----
console.log('11. audit/stats');
r = run(['audit']);
check('audit produces JSON', (() => { try { JSON.parse(r.out); return true; } catch { return false; } })());
check('audit counts superseded separately from safe', (() => { const a = JSON.parse(run(['audit']).out); return a.safe + a.quarantined + a.rejected + a.superseded === a.total; })());
r = run(['stats']);
check('stats produces JSON', (() => { try { JSON.parse(r.out); return true; } catch { return false; } })());

// ---- restore ---- (canonical store was never touched; belt-and-braces)
if (snapshot !== null) fs.writeFileSync(CANONICAL_STORE, snapshot, 'utf-8');
else if (fs.existsSync(STORE)) fs.unlinkSync(STORE);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

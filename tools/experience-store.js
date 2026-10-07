#!/usr/bin/env node
/**
 * tools/experience-store.js — Payesh Engineering Experience Store (PEES)
 *
 * A persistent, leakage-controlled, cross-session experience retrieval layer.
 *
 * Usage:
 *   node tools/experience-store.js add    <experience.json>   validate + append
 *   node tools/experience-store.js get    <query>             retrieve relevant experiences
 *   node tools/experience-store.js list   [--class X]         list experiences
 *   node tools/experience-store.js verify <experience_id>     promote RAW -> VERIFIED
 *   node tools/experience-store.js supersede <id> <new_id>    mark superseded
 *   node tools/experience-store.js audit                       leakage + secret audit report
 *   node tools/experience-store.js stats                       corpus statistics
 *   node tools/experience-store.js boundary <head_sha>         check current-HEAD boundary
 *
 * Storage: docs/experience-store/experiences.jsonl  (one JSON object per line)
 *          docs/experience-store/index.json        (query index)
 *
 * Governance (section 24 of the mission brief):
 *   CREATE    = any agent (Atria candidate producer)
 *   VALIDATE  = Hermes (evidence-backed verification)
 *   PROMOTE   = ChatGPT Control Plane (final authority)
 *   SUPERSEDE = Hermes + Control Plane
 *   RETIRE    = Control Plane
 *
 * NON-NEGOTIABLE LAW:
 *   CURRENT REPO TRUTH > HISTORICAL EXPERIENCE
 *   An experience bound to a SHA is REVALIDATION_REQUIRED whenever the
 *   current HEAD is not that SHA.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
// PEES_STORE_DIR lets regression tests run against a throwaway store so they
// never append probe rows (TEST-LEAK-*, POISON-*) into the canonical ledger.
const STORE_DIR = process.env.PEES_STORE_DIR || path.join(ROOT, 'docs', 'experience-store');
const STORE_FILE = path.join(STORE_DIR, 'experiences.jsonl');
const INDEX_FILE = path.join(STORE_DIR, 'index.json');
const SCHEMA_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Experience status lifecycle (mission section 23)
// ---------------------------------------------------------------------------
const STATUS_LIFECYCLE = ['RAW', 'VALIDATED', 'VERIFIED', 'CANONICAL', 'SUPERSEDED', 'RETIRED'];
// statuses that retrieval may return
const RETRIEVABLE = ['VALIDATED', 'VERIFIED', 'CANONICAL'];

// ---------------------------------------------------------------------------
// Experience classes (mission section 6)
// ---------------------------------------------------------------------------
const EXPERIENCE_CLASSES = [
  'defect-pattern', 'root-cause-pattern', 'verification-pattern',
  'false-green-pattern', 'regression-pattern', 'evidence-pattern',
  'architecture-lesson', 'performance-lesson', 'security-lesson',
  'tenant-isolation-lesson', 'database-lesson', 'cache-lesson',
  'queue-worker-lesson', 'ci-test-integrity-lesson', 'process-failure',
  'failed-approach', 'successful-verification-approach', 'scope-discipline-lesson',
  'self-critique-lesson', 'anti-regression-rule'
];

// ---------------------------------------------------------------------------
// Leakage screening (mission section 7) — ABSOLUTE
// ---------------------------------------------------------------------------
const BENCHMARK_FIX_SHAS = [
  '83e617b7', 'b4e04ad7', '670e2332', '79f1a093',
  '8dcb0576', '9ba8d340', '367c2b02', '17200c99'
];
// names of solution test files that benchmark cases expect an agent to produce
const BENCHMARK_SOLUTION_MARKERS = [
  'tests/b02-school-transfer-cache.js',
  'tests/a-next-health-blackhole.js',
  'tests/p11-phone-auth.js'
];
// patterns that reproduce a benchmark answer verbatim
const SOLUTION_REPRO_PATTERNS = [
  /DEV_OTP_BYPASS\s*=\s*(?:process\.env\.){0,1}['"]1['"]/,
  /redis\.ping\s*\(\s*\)\s*&&\s*!?(?:stale|ready)/
];

const SECRET_PATTERNS = [
  { name: 'github_pat',   re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'jwt',          re: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/ },
  { name: 'aws',          re: /AKIA[0-9A-Z]{16}/ },
  { name: 'google_api',   re: /AIza[0-9A-Za-z_\-]{35}/ },
  { name: 'slack',        re: /xox[baprs]-[0-9A-Za-z\-]{10,}/ },
  { name: 'openai_sk',    re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: 'generic_key',  re: /(?:api[_-]?key|secret|password|passwd)["'\s:=]{1,4}[A-Za-z0-9_\-]{16,}/ }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureStore() {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, '', 'utf-8');
}
function readAll() {
  ensureStore();
  return fs.readFileSync(STORE_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
    .filter(Boolean);
}
function writeAll(list) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, list.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
}
function headSha() {
  try {
    return require('child_process')
      .execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch { return null; }
}
function now() { return new Date().toISOString().slice(0, 10); }

// ---------------------------------------------------------------------------
// Leakage screening — mission section 7
// ---------------------------------------------------------------------------
function screenLeakage(exp) {
  const blob = JSON.stringify(exp);
  const reasons = [];

  for (const sha of BENCHMARK_FIX_SHAS) {
    if (blob.includes(sha)) reasons.push(`benchmark fix SHA present: ${sha}`);
  }
  for (const m of BENCHMARK_SOLUTION_MARKERS) {
    if (blob.includes(m)) reasons.push(`benchmark solution file present: ${m}`);
  }
  for (const re of SOLUTION_REPRO_PATTERNS) {
    if (re.test(blob)) reasons.push(`benchmark solution reproduced verbatim`);
  }

  if (reasons.length) return { level: 'REJECTED', reasons };
  // SHA-bound experiences are QUARANTINED for retrieval unless the caller is
  // explicitly doing historical reproduction (they are still listable/auditable).
  if (exp.sha_bound && exp.head_sha) return { level: 'QUARANTINED', reasons: [`SHA-bound to ${exp.head_sha}`] };
  return { level: 'SAFE', reasons: [] };
}

// ---------------------------------------------------------------------------
// Secret screening — mission section 20
// ---------------------------------------------------------------------------
function screenSecrets(exp) {
  const blob = JSON.stringify(exp);
  for (const p of SECRET_PATTERNS) {
    if (p.re.test(blob)) return { found: true, name: p.name };
  }
  return { found: false, name: null };
}

// ---------------------------------------------------------------------------
// Validation — mission sections 5 & 23
// ---------------------------------------------------------------------------
function validate(exp) {
  const errs = [];
  if (!exp.experience_id) errs.push('experience_id required');
  if (!EXPERIENCE_CLASSES.includes(exp.problem_class)) errs.push(`problem_class must be one of: ${EXPERIENCE_CLASSES.join(', ')}`);
  if (!exp.observed_failure && !exp.reusable_pattern && !exp.anti_pattern) {
    errs.push('at least one of observed_failure / reusable_pattern / anti_pattern required');
  }
  if (typeof exp.confidence !== 'number' || exp.confidence < 0 || exp.confidence > 1) {
    errs.push('confidence must be a number in [0,1]');
  }
  if (!exp.evidence || !Array.isArray(exp.evidence) || exp.evidence.length === 0) {
    errs.push('evidence must be a non-empty array');
  }
  // an experience is only VERIFIED+ if it carries evidence that is NOT the
  // agent's own claim (mission: agent claim alone is not evidence)
  const hasExternalEvidence = exp.evidence.some(e =>
    (e.kind === 'git' || e.kind === 'test' || e.kind === 'tool-output') && e.ref);
  if (!hasExternalEvidence && exp.validation_status && exp.validation_status !== 'RAW') {
    errs.push('cannot be VALIDATED/VERIFIED without external evidence (git/test/tool-output)');
  }
  return errs;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function cmdAdd(file) {
  const exp = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const errs = validate(exp);
  if (errs.length) { console.error('VALIDATION FAILED:'); errs.forEach(e => console.error('  - ' + e)); process.exit(2); }

  const secret = screenSecrets(exp);
  if (secret.found) {
    console.error(`SECRET DETECTED (${secret.name}) — experience REJECTED, not stored.`);
    process.exit(3);
  }

  const leak = screenLeakage(exp);
  exp.leakage_level = leak.level;
  exp.leakage_reasons = leak.reasons;
  exp.schema_version = SCHEMA_VERSION;
  exp.created_at = now();
  exp.current_head_at_capture = headSha();
  if (!exp.validation_status) exp.validation_status = 'RAW';

  // REJECTED experiences must never enter the retrieval store. They are kept
  // in a separate quarantine ledger so the audit trail is preserved.
  if (leak.level === 'REJECTED') {
    const qFile = path.join(STORE_DIR, 'quarantine.jsonl');
    fs.appendFileSync(qFile, JSON.stringify(exp) + '\n', 'utf-8');
    console.log(`QUARANTINED ${exp.experience_id} (not stored) leakage=REJECTED reason=${leak.reasons[0]}`);
    return;
  }

  const all = readAll();
  if (all.some(e => e.experience_id === exp.experience_id)) {
    console.error(`experience_id ${exp.experience_id} already exists`);
    process.exit(4);
  }
  all.push(exp);
  writeAll(all);
  rebuildIndex();
  console.log(`ADDED ${exp.experience_id} leakage=${leak.level} status=${exp.validation_status}`);
}

function cmdGet(query, opts) {
  const all = readAll();
  const head = headSha();
  const q = (query || '').toLowerCase();
  const limit = (opts && opts.limit) || 12;

  let hits = all
    .filter(e => RETRIEVABLE.includes(e.validation_status))
    .filter(e => e.leakage_level === 'SAFE')
    .map(e => {
      let score = 0;
      const hay = JSON.stringify(e).toLowerCase();
      for (const term of q.split(/\s+/).filter(Boolean)) {
        if (hay.includes(term)) score += 2;
        if ((e.problem_class || '').includes(term)) score += 3;
      }
      if (score === 0) return { e, score: 0, head_status: headBoundary(e, head) }; // no term match -> not a hit
      // recency/severity/confidence only BOOST a real term match
      score += (e.severity === 'high' ? 2 : 0) + (e.severity === 'critical' ? 4 : 0);
      score += Math.round((e.confidence || 0) * 3);
      // current-HEAD boundary (mission section 13)
      e._head_status = headBoundary(e, head);
      if (e._head_status === 'STALE') score = Math.max(0, score - 5);
      return { e, score, head_status: e._head_status };
    })
    // a query with no matching terms must yield EMPTY retrieval, not the whole corpus
    .filter(h => h.score > (q.trim() ? 4 : Infinity))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!hits.length) { console.log('EMPTY_RETRIEVAL'); return; }
  console.log(JSON.stringify(hits.map(h => ({
    experience_id: h.e.experience_id,
    problem_class: h.e.problem_class,
    reusable_pattern: h.e.reusable_pattern,
    anti_pattern: h.e.anti_pattern,
    severity: h.e.severity,
    confidence: h.e.confidence,
    head_status: h.head_status,
    evidence: h.e.evidence
  })), null, 1));
}

function headBoundary(e, head) {
  // mission section 13: SHA-bound experiences go REVALIDATION_REQUIRED
  if (!e.sha_bound) return 'HEAD_INDEPENDENT';
  if (!head) return 'HEAD_UNKNOWN';
  if (e.head_sha && e.head_sha.startsWith(head.slice(0, 8))) return 'CURRENT';
  return 'STALE';
}

function cmdVerify(id) {
  const all = readAll();
  const e = all.find(x => x.experience_id === id);
  if (!e) { console.error('not found'); process.exit(5); }
  const errs = validate({ ...e, validation_status: 'VERIFIED' });
  if (errs.length) { console.error('CANNOT VERIFY:'); errs.forEach(x => console.error('  - ' + x)); process.exit(2); }
  if (e.leakage_level === 'REJECTED') { console.error('REJECTED experiences cannot be verified'); process.exit(6); }
  e.validation_status = 'VERIFIED';
  e.verified_at = now();
  e.verified_by = 'hermes';
  writeAll(all);
  rebuildIndex();
  console.log(`VERIFIED ${id}`);
}

function cmdSupersede(id, newId) {
  const all = readAll();
  const e = all.find(x => x.experience_id === id);
  if (!e) { console.error('not found'); process.exit(5); }
  e.validation_status = 'SUPERSEDED';
  e.superseded_by = newId;
  // A superseded record must not enter retrieval. The retrieval gate filters
  // on leakage_level, so SUPERSEDED alone did not bar a SAFE record from
  // prompts — placeholder/stale records still leaked through.
  if (e.leakage_level === 'SAFE') e.leakage_level = 'SUPERSEDED_SAFE';
  writeAll(all);
  rebuildIndex();
  console.log(`SUPERSEDED ${id} -> ${newId} (leakage_level ${e.leakage_level})`);
}

function cmdAudit() {
  const all = readAll();
  const report = { total: all.length, safe: 0, quarantined: 0, rejected: 0, superseded: 0, secrets: 0, by_class: {}, by_status: {} };
  for (const e of all) {
    report.by_class[e.problem_class] = (report.by_class[e.problem_class] || 0) + 1;
    report.by_status[e.validation_status] = (report.by_status[e.validation_status] || 0) + 1;
    if (e.leakage_level === 'SAFE') report.safe++;
    if (e.leakage_level === 'QUARANTINED') report.quarantined++;
    if (e.leakage_level === 'REJECTED') report.rejected++;
    if (e.leakage_level === 'SUPERSEDED_SAFE') report.superseded++;
    const s = screenSecrets(e);
    if (s.found) report.secrets++;
  }
  console.log(JSON.stringify(report, null, 1));
}

function cmdStats() {
  const all = readAll();
  const bytes = fs.existsSync(STORE_FILE) ? fs.statSync(STORE_FILE).size : 0;
  console.log(JSON.stringify({
    corpus_size: all.length,
    storage_bytes: bytes,
    retrieval_latency_note: 'linear scan over jsonl corpus; O(n) per query, bounded by corpus size',
    growth_bound: 'experiences are deduplicated by experience_id (add refuses duplicates)',
    head: headSha()
  }, null, 1));
}

function cmdBoundary(headArg) {
  const all = readAll();
  const head = headArg || headSha();
  const out = { current_head: head, experiences: [] };
  for (const e of all) out.experiences.push({ id: e.experience_id, status: headBoundary(e, head) });
  console.log(JSON.stringify(out, null, 1));
}

function rebuildIndex() {
  const all = readAll();
  const idx = {};
  for (const e of all) {
    const terms = new Set([...(e.problem_class || '').split(/[-_]/), (e.defect_class || ''), (e.severity || '')].filter(Boolean));
    for (const t of terms) (idx[t] = idx[t] || []).push(e.experience_id);
  }
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 1), 'utf-8');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'add':      cmdAdd(args[0]); break;
  case 'get':      cmdGet(args[0], { limit: parseInt(args[1] || '12', 10) }); break;
  case 'list': {
    const all = readAll().filter(e => !args[0] || e.problem_class === args[0]);
    console.log(JSON.stringify(all.map(e => ({ id: e.experience_id, class: e.problem_class, status: e.validation_status, leakage: e.leakage_level })), null, 1));
    break;
  }
  case 'verify':   cmdVerify(args[0]); break;
  case 'supersede':cmdSupersede(args[0], args[1]); break;
  case 'audit':    cmdAudit(); break;
  case 'stats':    cmdStats(); break;
  case 'boundary': cmdBoundary(args[0]); break;
  default:
    console.error('usage: experience-store.js <add|get|list|verify|supersede|audit|stats|boundary> [args]');
    process.exit(1);
}

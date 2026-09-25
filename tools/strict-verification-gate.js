#!/usr/bin/env node
'use strict';
/* PAYESH STRICT VERIFICATION GATE — A-30 hardened (V-01..V-12)
   Fail-closed: incomplete registry, wrong SHA, missing one of the three
   reviews, missing evidence, vacuous/self-attested/injectable claims, or
   inability to prove an assertion => NOT VERIFIED + exit 1. No green fallback. */
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const REG = path.join(ROOT, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
const ALLOW = path.join(ROOT, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json');
const SCHEMA = path.join(ROOT, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
const ALERT_RULES = path.join(ROOT, 'infra', 'observability', 'alert-rules.yml');

/* canonical contracts (pinned — must equal the schema file, see V-12 below) */
const CANONICAL_STATUSES = ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'];
const REVIEWERS = ['chatgpt', 'arena', 'atria'];
const REVIEWER_VERDICTS = ['PASS', 'FAIL', 'BLOCKED'];
const EVIDENCE_KINDS = ['positive_test', 'negative_test', 'adversarial_test', 'runtime_evidence', 'failure_recovery_evidence', 'data_evidence', 'review_note'];
const POSITIVE_KINDS = ['positive_test', 'runtime_evidence', 'data_evidence'];
const ADVERSARIAL_KINDS = ['negative_test', 'adversarial_test', 'failure_recovery_evidence'];
const REQUIRED_REGISTRY_KEYS = ['schema_version', 'policy', 'status', 'head_bound', 'required_reviewers', 'allowed_statuses', 'reviews_recorded', 'human_governance', 'items'];
const REQUIRED_ITEM_KEYS = ['id', 'status', 'requirement', 'head_sha', 'reviews', 'known_limitations', 'evidence'];
const REQUIRED_EVIDENCE_KEYS = ['reviewer', 'kind', 'command', 'exit_code', 'checks_total', 'checks_passed', 'artifact', 'sha256', 'head_sha', 'runtime', 'ts'];
const SELF_CERT_SOURCES = /(?:^|\s)(?:server\/analytics\/intelligence-release-certification\.js|server\/infrastructure\/phase4-release-certification\.js)(?=\s|$)/;

let pass = 0, fail = 0, failures = [];
function chk(n, ok, d) { if (ok) { pass++; console.log('  OK ' + n + (d ? ' — ' + d : '')); } else { fail++; failures.push({ n: n, d: d }); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isStr(v) { return typeof v === 'string' && v.trim().length > 0; }
function isInt(v) { return typeof v === 'number' && Number.isInteger(v); }
function isSha256(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }
function isSha1(v) { return typeof v === 'string' && /^[0-9a-f]{40}$/.test(v); }
function isDate(v) { return isStr(v) && !Number.isNaN(Date.parse(v)); }
const norm = (v) => JSON.stringify(v);

let head = '';
try { head = cp.execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch (e) { }
console.log('==== PAYESH STRICT VERIFICATION GATE ====');
chk('G1 current HEAD known', /^[0-9a-f]{40}$/.test(head), head);
chk('G2 mandatory policy exists', fs.existsSync(path.join(ROOT, 'docs', 'STRICT_VERIFICATION_GATE.md')));
chk('G3 registry exists', fs.existsSync(REG));
let reg = null; try { reg = JSON.parse(read(REG)); } catch (e) { }
chk('G4 registry valid JSON', !!reg);
chk('G5 three independent reviewers declared', !!reg && norm(reg.required_reviewers) === norm(REVIEWERS));
let allowed = null; try { allowed = JSON.parse(read(ALLOW)); } catch (e) { }
chk('G6 explicit false-green allowlist exists', !!allowed && Array.isArray(allowed.items));
chk('G6a canonical alert rules exists', fs.existsSync(ALERT_RULES), path.relative(ROOT, ALERT_RULES));

/* ── V-12: evidence schema file exists and is pinned to the canonical contract ── */
let schema = null; try { schema = JSON.parse(read(SCHEMA)); } catch (e) { }
chk('V-12 schema file exists & valid JSON', !!schema, path.relative(ROOT, SCHEMA));
chk('V-12 schema matches canonical contract',
  !!schema &&
  norm(schema.required_registry_keys) === norm(REQUIRED_REGISTRY_KEYS) &&
  norm(schema.required_item_keys) === norm(REQUIRED_ITEM_KEYS) &&
  norm(schema.required_evidence_keys) === norm(REQUIRED_EVIDENCE_KEYS) &&
  norm(schema.evidence_kinds) === norm(EVIDENCE_KINDS) &&
  norm(schema.allowed_statuses) === norm(CANONICAL_STATUSES) &&
  norm(schema.reviewers) === norm(REVIEWERS) &&
  norm(schema.reviewer_verdicts) === norm(REVIEWER_VERDICTS));

/* ── V-07: false-green scanner (wider walk + own/only patterns + owned allowlist) ── */
function walk(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs|yml|yaml|sh|ts|json)$/.test(e.name)) out.push(p);
  }
  return out;
}
const pats = [
  ['assert(true', /assert\s*\(\s*true\b/gi],
  ['process.exit(0)', /process\.exit\(\s*0\s*\)/g],
  ['|| true', /\|\|\s*true\b/g],
  ['0/0 checks', /0\s*\/\s*0\s*(?:checks?|tests?)/gi],
  ['self-skip', /\b(?:it|test|describe|suite)\s*\.\s*skip\s*\(/g],
  ['self-only', /\b(?:it|test|describe|suite)\s*\.\s*only\s*\(/g],
  ['expect-true-toBe', /\bexpect\(\s*true\s*\)\s*\.\s*toBe\(\s*true\b/g]
];
const KNOWN_LABELS = new Set(pats.map((p) => p[0]));
/* allowlist entries are only honored when fully owned (policy: owner/reason/expiry/replacement)
   and may be path-scoped so the gate's own scanner literals cannot blanket-approve the repo. */
const validAllow = [];
if (allowed && Array.isArray(allowed.items)) {
  allowed.items.forEach((a, i) => {
    const ok = isObj(a) && KNOWN_LABELS.has(String(a.pattern)) && isStr(a.owner) && isStr(a.reason) &&
      isStr(a.replacement_test) && (a.expires === 'never' || isDate(a.expires)) &&
      (a.path === undefined || isStr(a.path));
    chk('G6b allowlist entry ' + i + ' complete & owned', ok, ok ? a.pattern : JSON.stringify(a).slice(0, 160));
    if (ok) validAllow.push(a);
  });
}
const expired = (a) => a.expires !== 'never' && !(new Date(a.expires) > new Date());
const ALLOW_REL = 'docs/verification/FALSE_GREEN_ALLOWLIST.json';
const approved = (label, rel) => {
  const relN = rel.split('\\').join('/');
  const scoped = validAllow.some((a) => a.pattern === label && !expired(a) && (a.path === undefined || a.path === relN));
  if (scoped) return true;
  /* the allowlist file is self-describing: declaring a label inside it is not a use */
  return relN === ALLOW_REL && validAllow.some((a) => a.pattern === label && !expired(a));
};
function readRaw(p) { return fs.readFileSync(p, 'utf8'); }
for (const pair of pats) {
  const label = pair[0], re = pair[1];
  const hits = [];
  for (const f of walk(ROOT)) {
    const s = readRaw(f);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) hits.push(path.relative(ROOT, f) + ':' + (s.slice(0, m.index).split('\n').length));
  }
  const bad = hits.filter((h) => !approved(label, h.split(':')[0]));
  chk('G7 ' + label + ' has no unapproved hits', bad.length === 0, bad.slice(0, 15).join(', '));
}

/* ── V-06: HEAD binding must be provable against the remote, not just local ── */
const rev = cp.spawnSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { cwd: ROOT, encoding: 'utf8' });
const originMain = (rev.status === 0 ? (rev.stdout || '').trim() : '');
chk('V-06 origin/main resolvable', isSha1(originMain) && originMain.length === 40, originMain || 'missing');
let contained = false;
if (isSha1(originMain)) {
  const anc = cp.spawnSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], { cwd: ROOT });
  contained = anc.status === 0;
}
chk('V-06 HEAD contained in origin/main (not a local-only line)', contained, 'head=' + head + ' origin/main=' + originMain);

if (reg && isObj(reg)) {
  /* ── registry-level machine: V-01, V-04a, V-05, V-02, V-10 ── */
  chk('V-01 registry declares a non-empty items array', Array.isArray(reg.items) && reg.items.length > 0,
    Array.isArray(reg.items) ? 'items=' + reg.items.length : 'items=' + typeof reg.items);
  chk('V-04 allowed_statuses is the canonical status machine', norm(reg.allowed_statuses) === norm(CANONICAL_STATUSES),
    norm(reg.allowed_statuses));
  const top = String(reg.status || '');
  chk('V-05 top-level status in machine & not BLOCKED*', CANONICAL_STATUSES.includes(top) && !/^BLOCKED/i.test(top), top || '(absent)');
  chk('V-02 registry head_bound matches HEAD', reg.head_bound === head, 'head_bound=' + reg.head_bound + ' head=' + head);
  const hg = reg.human_governance;
  const hgOk = isObj(hg) &&
    hg.requires_human_approval === true &&          /* absent key must NOT pass (V-10) */
    hg.human_approved === true &&                   /* absent key must NOT pass (V-10) */
    isStr(hg.approver) && !REVIEWERS.includes(String(hg.approver).toLowerCase()) &&
    isDate(hg.decided_at) && hg.head_sha === head;
  chk('V-10 human governance present, approved, human (not AI reviewer), head-bound', hgOk,
    isObj(hg) ? JSON.stringify({ r: hg.requires_human_approval, a: hg.human_approved, approver: hg.approver, head: hg.head_sha }) : 'absent');
  chk('V-12 registry has all required keys', REQUIRED_REGISTRY_KEYS.every((k) => k in reg),
    REQUIRED_REGISTRY_KEYS.filter((k) => !(k in reg)).join(',') || 'complete');

  if (Array.isArray(reg.items)) {
    const ids = new Set();
    for (const item of reg.items) {
      const id = isObj(item) ? String(item.id || '') : '';
      chk('G8 unique item ' + id, !!id && !ids.has(id));
      ids.add(id);
      chk('G9 ' + id + ' binds current HEAD', item.head_sha === head, 'item=' + item.head_sha + ' head=' + head);
      for (const r of REVIEWERS) {
        const v = item[r] || {};
        chk('G10 ' + id + ' ' + r + ' PASS + evidence', v.status === 'PASS' && Array.isArray(v.evidence) && v.evidence.length > 0, v.status || 'missing');
        if (v.status !== undefined && !REVIEWER_VERDICTS.includes(v.status)) chk('V-04 ' + id + ' ' + r + ' verdict in machine', false, v.status);
      }
      if (item.status === 'CERTIFIED') {
        chk('G11 ' + id + ' certified with 3 PASS', REVIEWERS.every((r) => item[r] && item[r].status === 'PASS'));
        chk('G12 ' + id + ' has evidence', Array.isArray(item.evidence) && item.evidence.length >= 3);
      } else chk('G13 ' + id + ' not falsely certified', item.status !== 'CERTIFIED', item.status);
      chk('V-04 ' + id + ' status in machine', CANONICAL_STATUSES.includes(String(item.status)), String(item.status));

      /* evidence slots: item-level + per reviewer */
      const slots = [{ slot: 'item', entries: Array.isArray(item.evidence) ? item.evidence : null }];
      for (const r of REVIEWERS) slots.push({ slot: r, entries: isObj(item[r]) && Array.isArray(item[r].evidence) ? item[r].evidence : null });
      const flat = [];
      for (const s of slots) if (s.entries) for (let i = 0; i < s.entries.length; i++) flat.push({ where: s.slot + '[' + i + ']', e: s.entries[i] });

      /* V-02: binding — every evidence object must bind head + existing artifact + real hash */
      const bindErrs = [];
      for (const f of flat) {
        const e = f.e;
        if (!isObj(e)) { bindErrs.push(f.where + ': not an object'); continue; }
        if (e.head_sha !== head) bindErrs.push(f.where + ': head_sha mismatch');
        if (!isStr(e.artifact) || !isSha256(e.sha256)) { bindErrs.push(f.where + ': artifact/sha256 missing'); continue; }
        const ap = path.resolve(ROOT, e.artifact);
        if (!ap.startsWith(ROOT + path.sep) || !fs.existsSync(ap)) { bindErrs.push(f.where + ': artifact not in repo: ' + e.artifact); continue; }
        const actual = crypto.createHash('sha256').update(fs.readFileSync(ap)).digest('hex');
        if (actual !== e.sha256) bindErrs.push(f.where + ': sha256 mismatch');
      }
      chk('V-02 ' + id + ' evidence binds HEAD+artifact+hash', bindErrs.length === 0, bindErrs.slice(0, 4).join(' | '));

      /* V-03: the three reviewers' evidence must be independent (not byte-clones) */
      const reviewerSlots = REVIEWERS.map((r) => ({ r, entries: slots.find((s) => s.slot === r).entries }));
      const hashes = reviewerSlots.map((s) => norm(s.entries));
      const distinct = new Set(hashes).size === hashes.length;
      chk('V-03 ' + id + ' reviewer evidence independent (pairwise distinct)', distinct, reviewerSlots.map((s) => s.r + ':' + (Array.isArray(s.entries) ? s.entries.length : 'none')).join(' '));

      /* V-08: self-attesting certification modules may not be the sole evidence source */
      const cmds = flat.filter((f) => isObj(f.e) && isStr(f.e.command)).map((f) => String(f.e.command));
      const selfOnly = cmds.length > 0 && cmds.every((c) => SELF_CERT_SOURCES.test(c));
      chk('V-08 ' + id + ' not certified by self-attesting sources alone', !selfOnly,
        selfOnly ? 'all ' + cmds.length + ' commands are self-certification modules' : cmds.length + ' commands checked');

      /* V-09: injected reviewer PASS must be corroborated by recorded review + item.reviews + slot identity */
      const inj = [];
      for (const r of REVIEWERS) {
        const v = item[r] || {};
        if (v.status !== 'PASS') continue;
        const rec = isObj(reg.reviews_recorded) ? reg.reviews_recorded[r] : undefined;
        if (!Array.isArray(rec) || rec.length === 0) inj.push(r + ': not in reviews_recorded');
        if (!Array.isArray(item.reviews) || !item.reviews.includes(r)) inj.push(r + ': not in item.reviews');
        if (Array.isArray(v.evidence)) for (let i = 0; i < v.evidence.length; i++) {
          const e = v.evidence[i];
          if (isObj(e) && e.reviewer !== undefined && e.reviewer !== r) inj.push(r + ': evidence[' + i + '] reviewer=' + e.reviewer);
        }
      }
      chk('V-09 ' + id + ' reviewer PASS corroborated (recorded + reviews + identity)', inj.length === 0, inj.join(' | '));

      /* V-11: no vacuous 0/0 evidence; positive AND adversarial evidence must exist */
      const vac = [];
      for (const f of flat) {
        const e = f.e;
        if (!isObj(e)) continue;
        if (!isInt(e.checks_total) || e.checks_total < 1) vac.push(f.where + ': checks_total=' + e.checks_total);
        if (!isInt(e.checks_passed) || e.checks_passed < 0 || (isInt(e.checks_total) && e.checks_passed > e.checks_total)) vac.push(f.where + ': checks_passed=' + e.checks_passed);
      }
      const kinds = flat.filter((f) => isObj(f.e)).map((f) => f.e.kind);
      const hasPos = kinds.some((k) => POSITIVE_KINDS.includes(k));
      const hasAdv = kinds.some((k) => ADVERSARIAL_KINDS.includes(k));
      if (!hasPos) vac.push('no positive/runtime evidence');
      if (!hasAdv) vac.push('no negative/adversarial evidence');
      chk('V-11 ' + id + ' evidence non-vacuous & adversarially covered', vac.length === 0, vac.slice(0, 4).join(' | '));

      /* V-12: item + evidence schema */
      const sch = [];
      const missingItem = REQUIRED_ITEM_KEYS.filter((k) => !(k in item));
      if (missingItem.length) sch.push('item missing: ' + missingItem.join(','));
      if (!Array.isArray(item.reviews) || !REVIEWERS.every((r) => item.reviews.includes(r))) sch.push('reviews must cover the three reviewers');
      if (!Array.isArray(item.known_limitations)) sch.push('known_limitations not an array');
      if (!isStr(item.requirement)) sch.push('requirement missing');
      if (!Array.isArray(item.evidence) || item.evidence.length === 0) sch.push('item.evidence missing/empty');
      for (const f of flat) {
        const e = f.e;
        if (!isObj(e)) { sch.push(f.where + ': evidence not an object'); continue; }
        const miss = REQUIRED_EVIDENCE_KEYS.filter((k) => !(k in e));
        if (miss.length) { sch.push(f.where + ': missing ' + miss.join(',')); continue; }
        if (!REVIEWERS.includes(e.reviewer)) sch.push(f.where + ': reviewer not in trio');
        if (!EVIDENCE_KINDS.includes(e.kind)) sch.push(f.where + ': bad kind ' + e.kind);
        if (!isStr(e.command)) sch.push(f.where + ': command');
        if (typeof e.exit_code !== 'number') sch.push(f.where + ': exit_code');
        if (!isInt(e.checks_total)) sch.push(f.where + ': checks_total');
        if (!isInt(e.checks_passed)) sch.push(f.where + ': checks_passed');
        if (!isStr(e.artifact)) sch.push(f.where + ': artifact');
        if (!isSha256(e.sha256)) sch.push(f.where + ': sha256');
        if (!isSha1(e.head_sha)) sch.push(f.where + ': head_sha');
        if (!isObj(e.runtime) || Object.keys(e.runtime).length === 0) sch.push(f.where + ': runtime');
        if (!isDate(e.ts)) sch.push(f.where + ': ts');
      }
      chk('V-12 ' + id + ' item+evidence schema', sch.length === 0, sch.slice(0, 5).join(' | '));
    }
  }
}

const certified = reg && Array.isArray(reg.items) ? reg.items.filter((x) => x && x.status === 'CERTIFIED').length : 0;
console.log('RESULT ' + pass + ' pass / ' + fail + ' fail');
console.log('HEAD ' + head);
console.log('CERTIFIED ' + certified);
console.log('VERDICT ' + (fail ? 'NOT VERIFIED' : 'VERIFIED'));
if (fail) { console.log('BLOCKERS'); failures.forEach((x) => console.log(' - ' + x.n + (x.d ? ' — ' + x.d : ''))); }
process.exit(fail ? 1 : 0);

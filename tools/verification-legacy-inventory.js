#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   tools/verification-legacy-inventory.js — M15-01 legacy record inventory

   WHY THIS EXISTS
   docs/verification/VERIFICATION_REGISTRY.json used to carry A-01..A-29 as
   Atria-era prose records: `atria_status`, `previous_verdict`, a free-text
   `evidence` string, `reviews: ["atria"]`, and no `status`, no `head_sha`, no
   `arena` slot and no evidence objects. Those records are history, not
   attestations, and they cannot be promoted to PASS/CERTIFIED without producing
   Arena evidence on a real SHA. Deleting them would destroy audit history, and
   leaving them in the live registry would keep the live registry unusable.

   This tool makes the history *checkable* instead of narrated:
     * the pre-repair registry is archived verbatim at
       docs/verification/legacy/VERIFICATION_REGISTRY.atria-6612f58.json
     * every tracked legacy id must still be present in that archive
     * no archived item may carry an Arena attestation (slot, status, head_sha)
     * the archive must be bound to a SHA that is NOT the current checkout, i.e.
       it is stale by construction and may not be used as current evidence
     * the Atria carry-over register is the authoritative source for A-01..A-23

   It asserts facts about immutable files only, so its output is reproducible on
   any later HEAD and can serve as the artifact for a blocked (UNKNOWN) item.

   Run:  node tools/verification-legacy-inventory.js
   Exit: 0 only if every legacy record is accounted for AND is provably not an
         Arena attestation. A missing id or a promoted record exits 1.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ARCHIVE_REL = 'docs/verification/legacy/VERIFICATION_REGISTRY.atria-6612f58.json';
const ARCHIVE = path.join(ROOT, ARCHIVE_REL);
const CARRYOVER_REL = 'docs/audit/ATRIA_PHASE_A_CARRYOVER.md';
const CARRYOVER = path.join(ROOT, CARRYOVER_REL);

/* The carry-over register (A-01..A-23) and the six reconciliation obligations that
   were tracked separately in the same registry (A-24..A-29). */
const LEGACY_IDS = [];
for (let i = 1; i <= 29; i++) LEGACY_IDS.push('A-' + String(i).padStart(2, '0'));
const CARRYOVER_IDS = LEGACY_IDS.filter((id) => Number(id.slice(2)) <= 23);
const RECONCILIATION_IDS = LEGACY_IDS.filter((id) => Number(id.slice(2)) > 23);

let checks = 0, fail = 0;
function chk(name, ok, detail) {
  checks++;
  if (!ok) fail++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const read = (p) => fs.readFileSync(p, 'utf8');

let head = '';
try { head = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { head = ''; }

console.log('==== M15-01 LEGACY RECORD INVENTORY ====');
console.log('ARCHIVE ' + ARCHIVE_REL);

let archiveText = '';
let archive = null;
try { archiveText = read(ARCHIVE); archive = JSON.parse(archiveText); } catch (e) { archive = null; }
chk('archive exists and parses as JSON', !!archive, archive ? ARCHIVE_REL : 'missing or invalid');
console.log('ARCHIVE_SHA256 ' + (archiveText ? sha256(Buffer.from(archiveText)) : '(none)'));

if (archive) {
  /* 1. it is a 40-hex immutable binding, and it is deliberately NOT this checkout */
  const bound = String(archive.head_bound || '');
  chk('archive is bound to an immutable 40-hex SHA', /^[0-9a-f]{40}$/.test(bound), bound);
  chk('archive binding is NOT the current checkout (stale by construction)', bound !== head,
    'archive=' + bound + ' head=' + head);

  /* 2. no archived item may look like an Arena attestation */
  const items = Array.isArray(archive.items) ? archive.items : [];
  chk('archive carries the full legacy item set', items.length === LEGACY_IDS.length,
    'items=' + items.length + ' expected=' + LEGACY_IDS.length);
  const withArenaSlot = items.filter((it) => it && Object.prototype.hasOwnProperty.call(it, 'arena'));
  chk('no archived item carries an Arena reviewer slot', withArenaSlot.length === 0,
    withArenaSlot.map((i) => i.id).join(', '));
  const withStatus = items.filter((it) => it && Object.prototype.hasOwnProperty.call(it, 'status'));
  chk('no archived item carries a machine status', withStatus.length === 0,
    withStatus.map((i) => i.id).join(', '));
  const withHead = items.filter((it) => it && Object.prototype.hasOwnProperty.call(it, 'head_sha'));
  chk('no archived item is bound to a HEAD', withHead.length === 0, withHead.map((i) => i.id).join(', '));
  const withEvidenceObjects = items.filter((it) => it && Array.isArray(it.evidence));
  chk('no archived item carries evidence objects (free-text notes only)', withEvidenceObjects.length === 0,
    withEvidenceObjects.map((i) => i.id).join(', '));
  const withAtria = items.filter((it) => it && typeof it.atria_status === 'string' && it.atria_status.trim());
  chk('every archived item records its Atria-era status verbatim', withAtria.length === items.length,
    withAtria.length + '/' + items.length);

  /* 3. no recorded Arena review may be borrowed */
  const rr = archive.reviews_recorded && typeof archive.reviews_recorded === 'object' ? archive.reviews_recorded : {};
  const arenaRecords = Array.isArray(rr.arena) ? rr.arena : [];
  chk('archive records no Arena review for any item', arenaRecords.length === 0,
    JSON.stringify(rr));

  /* 4. every legacy id is accounted for exactly once */
  const ids = items.map((it) => String((it && it.id) || ''));
  const missing = LEGACY_IDS.filter((id) => !ids.includes(id));
  chk('every tracked legacy id is present in the archive (' + LEGACY_IDS.length + ')', missing.length === 0,
    'missing: ' + missing.join(', '));
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  chk('archived legacy ids are unique', dupes.length === 0, dupes.join(', '));
}

/* 5. the Atria carry-over register must still back A-01..A-23 */
{
  let doc = '';
  try { doc = read(CARRYOVER); } catch (e) { doc = ''; }
  chk('Atria carry-over register exists', doc.length > 0, CARRYOVER_REL);
  const absent = CARRYOVER_IDS.filter((id) => !new RegExp('\\|\\s*' + id + '\\s*\\|').test(doc));
  chk('carry-over register documents A-01..A-23 (' + CARRYOVER_IDS.length + ')', absent.length === 0,
    'absent: ' + absent.join(', '));
  /* the register is an Atria document: it must not be mistakable for Arena evidence */
  chk('carry-over register declares the Atria source', /ATRIA/i.test(doc.split('\n').slice(0, 6).join(' ')),
    doc.split('\n')[0].slice(0, 80));
  const reconciliationAbsent = RECONCILIATION_IDS.filter((id) => !new RegExp('"?' + id + '"?\\s*:').test(doc));
  console.log('RECONCILIATION_IDS ' + RECONCILIATION_IDS.length + ' (A-24..A-29 tracked separately in the registry; ' +
    reconciliationAbsent.length + ' appear as keys in the carry-over register)');
}

console.log('LEGACY_IDS ' + LEGACY_IDS.length + ' REGISTRY_ITEMS ' + (archive && Array.isArray(archive.items) ? archive.items.length : 0));
console.log('CHECKS ' + checks + ' FAIL ' + fail);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   scripts/dr-restore-drill.js — Wave 16: the automated restore drill
   ───────────────────────────────────────────────────────────────────
   "Backup having without a restore drill is not enough." (ROADMAP §19)

   Runs server/dr.js restoreDrill() against the real store and reports
   whether a restore actually works, how long it took versus the RTO
   objective, and whether a tampered archive is rejected.

   Usage:
     node scripts/dr-restore-drill.js                 # drill on the live store
     node scripts/dr-restore-drill.js --keep          # keep the scratch dir
     node scripts/dr-restore-drill.js --json out.json # also write a report
     node scripts/dr-restore-drill.js --data-dir /var/backups/payesh

   Environment:
     PAYESH_BACKUP_KEY           ≥16 chars — enables the encryption phases
     PAYESH_BACKUP_OFFSITE_DIR   verified off-site copy target
     PAYESH_DR_RPO_S / RTO_S     objectives (default 300 / 900)

   Exit code: 0 = drill passed, 1 = drill failed, 2 = usage/IO error.
   NOTE: the drill WRITES one new backup into the backup directory (that is
   the point — it drills the real path) and then restores into an isolated
   store. It never modifies the live store.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { createDR } = require(path.join(ROOT, 'server', 'dr.js'));

function parseArgs(argv) {
  const o = { store: process.env.PAYESH_STORE || path.join(ROOT, 'server', 'data', 'payesh.json'), dataDir: path.join(ROOT, 'server', 'data'), keep: false, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep') o.keep = true;
    else if (a === '--store') o.store = argv[++i];
    else if (a === '--data-dir') o.dataDir = argv[++i];
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--help' || a === '-h') o.help = true;
    else { console.error('unknown argument: ' + a); o.bad = true; }
  }
  return o;
}

const HELP = `dr-restore-drill — Wave 16 restore/encryption/tamper drill

  node scripts/dr-restore-drill.js [--store FILE] [--data-dir DIR] [--keep] [--json OUT]

Exits 0 when every phase passes and the restore fits inside the RTO objective.`;

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(HELP); return 0; }
  if (o.bad) { console.error(HELP); return 2; }

  let store = null;
  try { store = JSON.parse(fs.readFileSync(o.store, 'utf8')); }
  catch (e) { console.error('cannot read store: ' + o.store + ' (' + e.message + ')'); return 2; }

  const auditEvents = [];
  const dr = createDR({
    dataDir: o.dataDir,
    audit: (evt, data) => { auditEvents.push({ evt, ok: data && data.ok }); }
  });

  const obj = dr.objectives();
  console.log('\n▸ Wave 16 — Disaster Recovery restore drill');
  console.log('  store     : ' + o.store);
  console.log('  backups   : ' + dr.dir);
  console.log('  objectives: RPO ' + obj.rpo_seconds + 's · RTO ' + obj.rto_seconds + 's (' + obj.source + ')');
  console.log('  encryption: ' + (process.env.PAYESH_BACKUP_KEY ? 'AES-256-GCM (PAYESH_BACKUP_KEY set)' : 'SKIPPED — PAYESH_BACKUP_KEY not set'));
  console.log('  off-site  : ' + (dr.offSiteDir() || 'not configured'));
  console.log('  PITR      : ' + dr.pitrStatus().mode + (dr.pitrStatus().pitr ? ' (available)' : ' (not available on the JSON store)'));

  const report = dr.restoreDrill({ snapshot: store, keep: o.keep });

  console.log('\n  phases:');
  for (const p of report.phases) {
    const note = p.reason != null ? ' reason=' + p.reason : (p.skipped ? ' skipped=' + p.skipped : '');
    console.log('   ' + (p.ok ? '✅' : '❌') + ' ' + p.name.padEnd(20) + String(p.ms).padStart(9) + ' ms' + note);
  }

  console.log('\n  restore time : ' + report.restore_ms + ' ms (objective ' + report.rto_objective_ms + ' ms) → ' + (report.within_rto ? 'WITHIN RTO' : 'RTO EXCEEDED'));
  if (report.record_counts) {
    console.log('  restored     : ' + report.restored_users + ' users · ' + report.restored_schools + ' schools · '
      + Object.keys(report.record_counts).length + ' collections');
  }
  if (report.tamper_reason) console.log('  tamper test  : rejected with "' + report.tamper_reason + '"');
  if (report.warnings) report.warnings.forEach((w) => console.log('  ⚠️  ' + w));

  const rpo = dr.rpoStatus();
  console.log('  RPO after    : ' + (rpo.achieved_seconds === null ? 'no backup' : rpo.achieved_seconds + 's of ' + rpo.objective_seconds + 's') + (rpo.breached ? '  ❌ BREACHED' : '  ✅'));

  if (report.reason) console.log('  failure      : ' + report.reason);
  if (o.json) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true });
      fs.writeFileSync(o.json, JSON.stringify(report, null, 2), { mode: 0o600 });
      console.log('  report       : ' + path.resolve(o.json));
    } catch (e) { console.error('  cannot write report: ' + e.message); return 2; }
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(report.ok ? 'dr-restore-drill: PASS ✅' : 'dr-restore-drill: FAIL ❌');
  console.log('');
  return report.ok ? 0 : 1;
}

process.exit(main());

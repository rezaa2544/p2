#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tools/baseline-check.js — CURRENT_REMOTE_HEAD_CHECK for PAYESH missions
   ────────────────────────────────────────────────────────────────────────
   WHY THIS EXISTS (Mission 01 weakness, self-repaired):

     Mission 01 was handed a baseline SHA (57dae2e3) that was already 2
     commits behind real origin/main (691f8d6). Nothing in the toolchain
     would have flagged that. An agent could have produced an entire report
     bound to a SHA that no longer existed at the tip, and its evidence
     would have been silently stale.

     PAYESH §58 (Evidence Ledger) requires every claim to bind to a SHA.
     A SHA that is not the current tip is STALE until re-run against HEAD.
     This tool makes that check mechanical instead of a matter of agent
     diligence.

   CONTRACT — call twice per mission:
     1. BEFORE analysis:  node tools/baseline-check.js
     2. BEFORE commit:    node tools/baseline-check.js --recheck <initial-sha>

   The --recheck mode is the staleness defense. Pass the SHA you recorded at
   the start; if origin/main has moved since, this exits non-zero and reports
   the divergence, so a mission pauses and re-verifies instead of shipping
   evidence bound to a superseded HEAD.

   Exit codes:
     0  baseline consistent (or recheck passed)
     1  could not establish GitHub truth (network / auth) — DO NOT PROCEED
     2  local HEAD is behind origin/main (uncommitted risk)
     3  RECHECK FAILED — remote HEAD moved during the mission
     4  local HEAD is ahead of origin/main (unpushed work — inventory first)
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function sh(cmd, opts) {
  try {
    return cp.execSync(cmd, Object.assign({ cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts)).trim();
  } catch (e) {
    return null;
  }
}

function git(args) { return sh('git ' + args); }

function record(payload) {
  /* Machine-readable baseline record — the artifact a mission pins its
     evidence to. Written to a scratch path, never committed. */
  const out = path.join(ROOT, '.baseline-check.json');
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return out;
}

function main() {
  const mode = process.argv[2];
  const initialSha = process.argv[3];

  const localHead = git('rev-parse HEAD');
  if (!/^[0-9a-f]{40}$/.test(localHead || '')) {
    console.error('BASELINE-FAIL: local HEAD unknown');
    process.exit(1);
  }

  /* Remote truth. ls-remote does not touch any local ref — read-only. */
  const remoteHead = git('ls-remote origin refs/heads/main');
  if (!remoteHead) {
    console.error('BASELINE-FAIL: cannot reach origin (network or auth).');
    console.error('  Do NOT proceed on a baseline you cannot confirm.');
    process.exit(1);
  }
  const remoteSha = remoteHead.split(/\s+/)[0];

  const mergeBase = git('merge-base ' + localHead + ' ' + remoteSha) || null;
  const behind = (git('rev-list --count ' + localHead + '..' + remoteSha) || '0');
  const ahead = (git('rev-list --count ' + remoteSha + '..' + localHead) || '0');

  /* --- mode 2: the staleness defense ---------------------------------- */
  if (mode === '--recheck') {
    if (!/^[0-9a-f]{40}$/.test(initialSha || '')) {
      console.error('BASELINE-FAIL: --recheck needs the initial 40-char SHA as argv[3]');
      process.exit(1);
    }
    if (initialSha !== remoteSha) {
      console.error('STALE-BASELINE: remote HEAD moved during the mission.');
      console.error('  INITIAL_REMOTE_HEAD: ' + initialSha);
      console.error('  FINAL_REMOTE_HEAD  : ' + remoteSha);
      console.error('  Evidence bound to the initial SHA is STALE. Re-run affected');
      console.error('  verification, then re-record the baseline.');
      process.exit(3);
    }
    console.log('RECHECK-OK: origin/main unchanged (' + remoteSha + ')');
    process.exit(0);
  }

  /* --- mode 1: initial baseline ---------------------------------------- */
  const dirty = (git('status --porcelain') || '').split(/\r?\n/).filter(Boolean);
  const payload = {
    repo: 'rezaa2544/p2',
    remote: git('remote get-url origin') || null,
    branch: (git('rev-parse --abbrev-ref HEAD') || '(detached)'),
    HEAD: localHead,
    'origin/main': remoteSha,
    'merge-base': mergeBase,
    behind_origin_main: Number(behind),
    ahead_of_origin_main: Number(ahead),
    'working-tree-state': dirty.length ? 'DIRTY(' + dirty.length + ')' : 'CLEAN',
    working_tree_changes: dirty,
    recorded_at: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      git: (git('--version') || '').replace('git version ', ''),
    },
  };
  const out = record(payload);
  console.log('BASELINE-RECORD: ' + out);
  console.log('  local HEAD      : ' + localHead);
  console.log('  origin/main     : ' + remoteSha);
  console.log('  behind / ahead  : ' + behind + ' / ' + ahead);
  console.log('  working tree    : ' + payload['working-tree-state']);
  console.log('  merge-base      : ' + mergeBase);

  if (Number(behind) > 0) {
    console.error('BASELINE-WARN: local HEAD is ' + behind + ' commit(s) behind origin/main.');
    console.error('  Inventory local work before doing anything; do not blindly reset.');
    process.exit(2);
  }
  if (Number(ahead) > 0) {
    console.error('BASELINE-INFO: local HEAD is ' + ahead + ' commit(s) ahead of origin/main.');
    console.error('  Unpushed work exists — inventory it, do not discard it.');
    process.exit(4);
  }
  console.log('BASELINE-OK: local HEAD == origin/main');
  process.exit(0);
}

main();

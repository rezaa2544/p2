#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Route against this checkout, not the caller's cwd (which may be another repo).
const ROOT = path.resolve(__dirname, '..');

const chat = process.argv[2];
if (!/^Chat(?:[1-9]|10)$/.test(chat || '')) {
  console.error('Usage: node tools/arena-runtime-gate.js Chat1..Chat10');
  process.exit(2);
}

function git(args) {
  // Git hooks/callers may select a foreign repository even with cwd fixed.
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[key];
  try {
    return execFileSync('git', args, { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (_) {
    return '';
  }
}

const mission = `docs/daily-missions/${chat}/ACTIVE.md`;
const localMission = fs.existsSync(path.join(ROOT, mission));
let mainMission = false;
const mainRef = git(['show', `origin/main:${mission}`]);
if (mainRef) mainMission = true;

const status = localMission || mainMission ? 'MISSION_MODE' : 'CONTINUITY_FALLBACK';
console.log(`ARENA_RUNTIME_STATE=${status}`);
console.log(`CHAT=${chat}`);
console.log(`LOCAL_MISSION=${localMission ? 'PRESENT' : 'MISSING'}`);
console.log(`ORIGIN_MAIN_MISSION=${mainMission ? 'PRESENT' : 'NOT_AVAILABLE'}`);
console.log('NEXT_ACTION=' + (status === 'MISSION_MODE'
  ? 'read ACTIVE.md; if M1-M4 complete start CONTINUATION PASS #1'
  : 'read docs/ARENA_CONTROL_PLANE_RECOVERY.md and docs/ARENA_CONTINUITY_AUTHORIZATION.md; execute first bounded fallback action'));
console.log('STOP_ALLOWED=NO');

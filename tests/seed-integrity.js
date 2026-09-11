#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   seed-integrity.js — the demo store must be complete, or nothing else
   in the pipeline means anything
   ───────────────────────────────────────────────────────────────────
   Why this suite exists:

   `server/seed.js` builds the demo world by running the real bundle in
   jsdom. On 2026-09-10 (a Thursday) that generation threw
   `TypeError: Cannot read properties of undefined (reading 'teacher_id')`,
   and the script **still wrote the store and still exited 0**:

       ✅ store written: server/data/payesh.json  (28 KB)
          users: 15 | schools: 1 | classes: 9 | parent_links: 0

   Nothing downstream complained. `tests/smoke.js` quietly fell from 547 to
   405 checks, and every suite that reads a `grades` fixture lost it. The
   failure was invisible precisely because the exit code was 0 and the file
   looked plausible.

   These checks make that failure loud. They are cheap (one seed run) and
   they guard the fixture every other suite depends on.

   اجرا:  node tests/seed-integrity.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}

console.log('\n▸ seed integrity — the demo store every fixture suite reads');

/* keep whatever was there so a failed run does not leave the repo worse */
const backup = fs.existsSync(STORE) ? fs.readFileSync(STORE) : null;

let out = '', err = '', code = 0, store = null, bytes = 0;
try {
  const r = spawnSync(process.execPath, ['server/seed.js'], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  out = r.stdout || ''; err = r.stderr || ''; code = r.status;
  bytes = fs.existsSync(STORE) ? fs.statSync(STORE).size : 0;
  if (bytes) store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
} catch (e) {
  err = String(e);
}

console.log('  — run');
chk('S1 seed.js exits 0', code === 0, 'exit=' + code + ' ' + err.slice(0, 160));
chk('S2 seed.js prints no uncaught exception',
  !/TypeError|ReferenceError|is not a function|Cannot read properties/.test(err),
  err.split('\n').filter((l) => /Error/.test(l)).slice(0, 2).join(' | '));
chk('S3 a store file was written', bytes > 0, 'bytes=' + bytes);

console.log('  — completeness');
/* the demo world is deterministic (SEED=20260901). These floors are far below
   the real counts (1035 users / 6 schools / 12854 grades) and far above the
   truncated ones (15 / 1 / 0), so a partial store cannot slip through. */
const n = (k) => (store && Array.isArray(store[k]) ? store[k].length : 0);
chk('S4 the store is not the truncated one (> 1 MB)', bytes > 1024 * 1024, 'bytes=' + bytes);
chk('S5 users > 500 (a truncated store has 15)', n('users') > 500, 'users=' + n('users'));
chk('S6 schools > 1', n('schools') > 1, 'schools=' + n('schools'));
chk('S7 classes > 10', n('classes') > 10, 'classes=' + n('classes'));
chk('S8 students exist (a truncated store has none)',
  n('users') > 0 && (store.users.filter((u) => u.role === 'student').length > 100),
  'students=' + (store ? store.users.filter((u) => u.role === 'student').length : 0));
chk('S9 grades exist — the fixture IN7/CC5 read', n('grades') > 1000, 'grades=' + n('grades'));
chk('S10 attendance exists', n('attendance') > 1000, 'attendance=' + n('attendance'));
chk('S11 schedule covers the school week (day 0..4)',
  n('schedule') > 0 && [0, 1, 2, 3, 4].every((d) => store.schedule.some((s) => s.day === d)),
  'days=' + JSON.stringify(Array.from(new Set((store && store.schedule || []).map((s) => s.day))).sort()));

console.log('  — usability');
chk('S12 a superadmin exists and can log in (active + phone + national_id)',
  !!store && store.users.some((u) => u.role === 'superadmin' && u.active && u.phone && u.national_id),
  'superadmin=' + JSON.stringify((store && store.users.find((u) => u.role === 'superadmin')) || null).slice(0, 120));
/* every generated user must carry `active` — server/auth.js:270 rejects the rest */
chk('S13 no generated user is missing `active`',
  !!store && store.users.every((u) => u.active === 0 || u.active === 1),
  'without active=' + (store ? store.users.filter((u) => u.active !== 0 && u.active !== 1).length : 'n/a'));
chk('S14 the store is owner-only on disk (PII: phone + national_id)',
  bytes > 0 && (fs.statSync(STORE).mode & 0o077) === 0,
  'mode=' + (bytes ? '0' + (fs.statSync(STORE).mode & 0o777).toString(8) : 'n/a'));

/* restore, so this suite never leaves the repo with a store it did not intend */
if (backup) fs.writeFileSync(STORE, backup, { mode: 0o600 });

console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc));
if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('');
process.exit(failc ? 1 : 0);

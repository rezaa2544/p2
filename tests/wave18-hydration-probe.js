#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave18-hydration-probe.js — mutation probe for tests/wave18-hydration-guards.js
   ───────────────────────────────────────────────────────────────────
   Runs the shouldPersistMirrorFile decision matrix against a mutated copy
   of server/db.js. The parent suite writes the mutated source next to
   this probe (same temp dir) and spawns this file, so the module is
   loaded through a static relative require — no argv, no -e interpreter
   input. Exit 0 = the matrix holds; exit 1 = the mutation killed the guard.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const db = require('./db.js');

/* ماتریس: [pgLive, hydrateResult, انتظار] — همان ماتریسِ بخشِ A.
   تنها حالتِ ممنوع: pgLive + mirror_incomplete (G1). */
const MATRIX = [
  [false, null, true],
  [false, { mirror_incomplete: true }, true],   /* بدونِ PG: آینهٔ بریده هم فایل می‌نویسد */
  [true, null, true],
  [true, {}, true],
  [true, { mirror_incomplete: false }, true],   /* PG-live + آینهٔ کامل = نوشتن */
  [true, { mirror_incomplete: true }, false],   /* G1: تنها حالتِ ممنوع */
];

for (const [pg, h, want] of MATRIX) {
  if (db.shouldPersistMirrorFile(pg, h) !== want) process.exit(1);
}
process.exit(0);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-prod-fallback-probe.js — probe helper for tests/pg-prod-suite-policy.js
   ───────────────────────────────────────────────────────────────────
   Runs server/db.js under one of three fixed env shapes, selected by a
   literal argv[2] mode. Kept as a committed static module so the parent
   suite spawns a file path (never -e interpreter input) and so every env
   shape is auditable in-tree.

   Modes:
     dev-noflag — dev, DATABASE_URL deleted, ALLOW_MEMORY_FALLBACK unset
     dev-flag   — dev, DATABASE_URL deleted, ALLOW_MEMORY_FALLBACK=1
     prod-flag  — production, DATABASE_URL deleted, ALLOW_MEMORY_FALLBACK=1
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* 🔴 مرزِ ورودیِ حالت: فقط این سه رشتهٔ ثابت پذیرفته می‌شوند. هر چیزِ
   دیگر قبل از رسیدن به منطقِ برنامه رد می‌شود. */
const MODES = {
  'dev-noflag': function () {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    delete process.env.ALLOW_MEMORY_FALLBACK;
  },
  'dev-flag': function () {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    process.env.ALLOW_MEMORY_FALLBACK = '1';
  },
  'prod-flag': function () {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_MEMORY_FALLBACK = '1';
    delete process.env.DATABASE_URL;
  }
};

const mode = process.argv[2];
if (!Object.prototype.hasOwnProperty.call(MODES, mode)) {
  console.error('pg-prod-fallback-probe: unknown mode: ' + String(mode));
  process.exit(2);
}
MODES[mode]();

const db = require('../server/db.js');
if (mode === 'prod-flag') {
  const p = db.backingStorePolicy();
  console.log('ALLOW ' + p.allow_memory_fallback);
} else {
  db.init({}).then((i) => console.log('DRIVER ' + i.driver));
}

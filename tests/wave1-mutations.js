#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave1-mutations.js — آزمون‌های جهش موج ۱ (Wave 1 Mutation Suite)
   ───────────────────────────────────────────────────────────────────
   تأیید می‌کند که ۱۰ جهش بحرانی همگی توسط آزمون‌ها کشته می‌شوند (KILLED):
     M1: PG read → memory read
     M2: PG-first auth → memory-first auth
     M3: remove DB injection from IDOR
     M4: remove tenant filter
     M5: remove school active validation
     M6: remove OCC
     M7: remove transaction
     M8: remove rollback
     M9: PG outage → memory fallback
     M10: remove production fail-closed

   قانون: KILLED = PASS | SURVIVED = FAILURE
   اجرا: node tests/wave1-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

let killed = 0, survived = 0;
const failures = [];
function reportKill(name, detail) {
  killed++;
  console.log('  ✅ ' + name + ' — KILLED');
}
function reportSurvive(name, detail) {
  survived++;
  failures.push(name + (detail ? ' — ' + detail : ''));
  console.log('  ❌ ' + name + ' — SURVIVED');
}

function testMutation(name, fileRel, mutateFn, testCmd) {
  const filePath = path.join(ROOT, fileRel);
  const orig = fs.readFileSync(filePath, 'utf8');
  try {
    const mutated = mutateFn(orig);
    if (mutated === orig) {
      reportSurvive(name, 'جهش اعمال نشد (متن یافت نشد)');
      return;
    }
    fs.writeFileSync(filePath, mutated, 'utf8');
    const r = spawnSync(testCmd[0], testCmd.slice(1), {
      cwd: ROOT, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024
    });
    // اگر تست بعد از جهش با شکست مواجه شد (exit != 0)، یعنی جهش شناسایی و کشته شده است!
    if (r.status !== 0) {
      reportKill(name);
    } else {
      reportSurvive(name, 'تست با کد صفر موفق شد و جهش را تشخیص نداد!');
    }
  } finally {
    fs.writeFileSync(filePath, orig, 'utf8');
  }
}

console.log('\n▸ Wave 1 Mutation Testing (10 Critical Invariants)');

// M1: PG read -> memory read
testMutation(
  'M1: PG read → memory read (sessionFrom ignores PG)',
  'server/auth.js',
  (code) => code.replace("user = await db.readOne('users', p.sub);", "user = (store.users || []).find(u => u.id === p.sub);"),
  [process.execPath, 'tests/wave1-multi-instance.js']
);

// M2: PG-first auth -> memory-first auth
testMutation(
  'M2: PG-first auth → memory-first auth (memory checked before PG in sessionFrom)',
  'server/auth.js',
  (code) => code.replace(
    "let user = null;\n    if(db && typeof db.isPostgres === 'function' && db.isPostgres()){",
    "let user = (store.users || []).find(u => u.id === p.sub);\n    if(!user && db && typeof db.isPostgres === 'function' && db.isPostgres()){"
  ),
  [process.execPath, 'tests/wave1-multi-instance.js']
);

// M3: remove DB injection from IDOR
testMutation(
  'M3: remove DB injection from IDOR (db omitted from createIdor in server/index.js)',
  'server/index.js',
  (code) => code.replace("sendJson: sendJsonCounting, db });", "sendJson: sendJsonCounting });"),
  [process.execPath, 'tests/wave1-regression-gate.js']
);

// M4: remove tenant filter in policy (cross-tenant manager check removed)
testMutation(
  'M4: remove tenant filter in policy (cross-tenant manager check removed)',
  'server/policy.js',
  (code) => code.replace(
    "if (role === 'manager') return rec.school_id != null && Number(rec.school_id) === num(session.school_id);",
    "if (role === 'manager') return true;"
  ),
  [process.execPath, 'tests/wave1-multi-instance.js']
);

// M5: remove school active validation
testMutation(
  'M5: remove school active validation in auth',
  'server/auth.js',
  (code) => code.replace("if(school && !school.active) return null;", "// if(school && !school.active) return null;"),
  [process.execPath, 'tests/wave1-multi-instance.js']
);

// M6: remove OCC check
testMutation(
  'M6: remove OCC check in server/occ.js',
  'server/occ.js',
  (code) => code.replace(
    "if (Number(base) !== serverVersion) {",
    "if (false && Number(base) !== serverVersion) {"
  ),
  [process.execPath, 'tests/occ.js']
);

// M7: remove transaction (persistOpsBatch without BEGIN)
testMutation(
  'M7: remove transaction (BEGIN omitted from persistOpsBatch)',
  'server/db.js',
  (code) => code.replace("await client.query('BEGIN');", "// await client.query('BEGIN');"),
  [process.execPath, 'tests/sync-atomic-batch.js']
);

// M8: remove rollback (ROLLBACK on error omitted)
testMutation(
  'M8: remove rollback in sync/db transaction',
  'server/db.js',
  (code) => code.replace("await client.query('ROLLBACK');", "// await client.query('ROLLBACK');"),
  [process.execPath, 'tests/sync-atomic-batch.js']
);

// M9: PG outage -> silent memory fallback
testMutation(
  'M9: PG outage → silent memory fallback (refusal disabled)',
  'server/db.js',
  (code) => code.replace(
    "if (!memoryFallbackAllowed()) {\n      console.error('[DB] PostgreSQL unreachable in production",
    "if (false) {\n      console.error('[DB] PostgreSQL unreachable in production"
  ),
  [process.execPath, 'tests/pg-prod-persistence-failure.js']
);

// M10: remove production fail-closed boot gate
testMutation(
  'M10: remove production fail-closed boot gate in server/index.js',
  'server/index.js',
  (code) => code.replace(
    "if (db.isProductionEnv() && !process.env.DATABASE_URL && !db.memoryFallbackAllowed()) {",
    "if (false && db.isProductionEnv()) {"
  ),
  [process.execPath, 'tests/pg-prod-no-json-writes.js']
);

console.log(`\n  جمع آزمون‌های جهش: ${killed} کشته‌شده (Killed)، ${survived} زنده (Survived)`);
if (survived) {
  console.log('  موارد زنده:\n   - ' + failures.join('\n   - '));
  process.exit(1);
}
console.log('\n  🟢 10/10 CRITICAL MUTATIONS KILLED — 100% Mutation Resistance Verified.');
process.exit(0);

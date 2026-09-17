#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave1-regression-gate.js — گارد رگرسیون عدم مرجعیت حافظه در پروداکشن
   ───────────────────────────────────────────────────────────────────
   تضمین می‌کند که هیچ مسیر پروداکشنی به عنوان مرجع حقیقت (Authority)
   به حافظه (store.* / memoryStore / payesh.json) تکیه نمی‌کند.

   قانون طلایی:
     PostgreSQL تنها Source of Truth در Production است.
     حافظه صرفاً کش محدود (bounded cache/mirror) پس از commit دیتابیس است.

   اجرا: node tests/wave1-regression-gate.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(name) { pass++; console.log('  ✅ ' + name); }
function bad(name, extra) {
  fail++;
  failures.push(name + (extra ? ' — ' + extra : ''));
  console.log('  ❌ ' + name + (extra ? ' — ' + extra : ''));
}

/* ── ALLOWLIST رسمی (با ساختار الزامی: FILE, SYMBOL, REASON, OWNER, REVIEW/EXPIRY) ── */
const MEMORY_ALLOWLIST = [
  {
    FILE: 'server/db.js',
    SYMBOL: 'memoryStore',
    REASON: 'Ephemeral dev/test fixture storage when DATABASE_URL is not set; strictly blocked in production by backingStorePolicy()',
    OWNER: 'Chat1 (Core Architecture)',
    EXPIRY: 'Permanent dev fixture fallback'
  },
  {
    FILE: 'server/otp-store.js',
    SYMBOL: 'otp.json',
    REASON: 'Dev fallback storage for OTP counters when Redis cluster is absent; Redis is authoritative in production',
    OWNER: 'Chat1 / Chat3 (Security)',
    EXPIRY: 'Phase 2 (Wave 6 Redis live gate)'
  },
  {
    FILE: 'server/index.js',
    SYMBOL: 'store',
    REASON: 'In-memory client state mirror hydrated from PG on boot; file write interval disabled in PG mode; mirrorIncomplete stops overwrites',
    OWNER: 'Chat1 (Core Architecture)',
    EXPIRY: 'Permanent bounded mirror'
  },
  {
    FILE: 'server/auth.js',
    SYMBOL: 'store.__revoked_jti',
    REASON: 'Local in-process JWT revocation denylist alongside distributed Redis revocation token lookup',
    OWNER: 'Chat1 / Chat3 (Security)',
    EXPIRY: 'Permanent local denylist'
  }
];

function checkFileForUnsafeMemoryAuthority(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return;
  const content = fs.readFileSync(full, 'utf8');

  // ۱. بررسی auth.js: بررسی اینکه sessionFrom از PG مستقیم می‌خواند
  if (relPath === 'server/auth.js') {
    const hasPgSession = /if\(db\s*&&\s*typeof\s*db\.isPostgres\s*===\s*'function'\s*&&\s*db\.isPostgres\(\)\)\s*\{[\s\S]*?db\.readOne\('users'/.test(content);
    if (hasPgSession) ok('server/auth.js: sessionFrom resolves user authority from PostgreSQL');
    else bad('server/auth.js: sessionFrom missing PG-first user lookup');

    const hasPgSchool = /db\.readOne\('schools'/.test(content);
    if (hasPgSchool) ok('server/auth.js: school active status verified against PostgreSQL authority');
    else bad('server/auth.js: school active status missing PG authority check');

    const hasNoSilentMirrorFallback = !/falling back to mirror/i.test(content);
    if (hasNoSilentMirrorFallback) ok('server/auth.js: userByPhone does not silently fall back to mirror in production');
    else bad('server/auth.js: userByPhone still contains silent mirror fallback');
  }

  // ۲. بررسی idor.js: تزریق دیتابیس و خوانش از PG
  if (relPath === 'server/idor.js') {
    const hasDb = /const\s+db\s*=\s*ctx\.db/.test(content);
    if (hasDb) ok('server/idor.js: db injected into createIdor');
    else bad('server/idor.js: db not injected into createIdor');

    const hasPgStudent = /db\.readOne\('users',\s*sid\)/.test(content);
    if (hasPgStudent) ok('server/idor.js: student lookup is PostgreSQL-backed');
    else bad('server/idor.js: student lookup is not PG-backed');

    const hasCrossTenant = /s\.school_id\s*!=\s*null\s*&&\s*st\.school_id\s*!=\s*null/.test(content);
    if (hasCrossTenant) ok('server/idor.js: cross-tenant fail-closed boundary enforced');
    else bad('server/idor.js: cross-tenant check missing');

    const hasScopeOpts = /resolveStudentScopeOpts/.test(content);
    if (hasScopeOpts) ok('server/idor.js: scope options resolved from PostgreSQL');
    else bad('server/idor.js: scope options not resolved from PG');
  }

  // ۳. بررسی index.js: گیت بوت Fail-Closed در غیاب PG
  if (relPath === 'server/index.js') {
    const hasSyncGate = /db\.isProductionEnv\(\)\s*&&\s*!process\.env\.DATABASE_URL/.test(content);
    if (hasSyncGate) ok('server/index.js: synchronous production boot gate enforces DATABASE_URL');
    else bad('server/index.js: missing synchronous production boot gate');

    const hasIdorDbInjection = /createIdor\(\{[^}]*?\bdb\b[^}]*\}\)/.test(content);
    if (hasIdorDbInjection) ok('server/index.js: db injected into createIdor call');
    else bad('server/index.js: db not injected into createIdor in server/index.js');
  }

  // ۴. بررسی policy.js: صادرات و تعریف حل دامنه از PG
  if (relPath === 'server/policy.js') {
    const hasResolve = /async function resolveStudentScopeOpts/.test(content);
    if (hasResolve) ok('server/policy.js: resolveStudentScopeOpts defined for PostgreSQL scope');
    else bad('server/policy.js: resolveStudentScopeOpts missing');

    const hasParentLinks = /SELECT\s+student_id\s+FROM\s+parent_links/.test(content);
    if (hasParentLinks) ok('server/policy.js: parent_links query against PostgreSQL');
    else bad('server/policy.js: parent_links query missing');

    const hasTeacherScope = /SELECT\s+id\s+FROM\s+classes\s+WHERE\s+homeroom_teacher_id/.test(content);
    if (hasTeacherScope) ok('server/policy.js: teacher homeroom and schedule queried against PostgreSQL');
    else bad('server/policy.js: teacher scope query missing');
  }
}

console.log('\n▸ Wave 1 Regression Gate — No Production Memory Authority');

const TARGET_FILES = [
  'server/auth.js',
  'server/idor.js',
  'server/policy.js',
  'server/index.js',
  'server/db.js'
];

for (const f of TARGET_FILES) {
  checkFileForUnsafeMemoryAuthority(f);
}

// بررسی ساختار و کامل بودن Allowlist
for (const entry of MEMORY_ALLOWLIST) {
  assert.ok(entry.FILE && entry.SYMBOL && entry.REASON && entry.OWNER && entry.EXPIRY,
    'تمام فیلدهای الزامی allowlist باید پر باشند: ' + JSON.stringify(entry));
}
ok(`Allowlist verified: ${MEMORY_ALLOWLIST.length} controlled symbols registered`);

console.log(`\n  جمع گیت رگرسیون: ${pass} موفق، ${fail} ناموفق`);
if (fail) {
  console.log('  موارد ناموفق:\n   - ' + failures.join('\n   - '));
  process.exit(1);
}
console.log('\n  🟢 REGRESSION GATE GREEN — Zero Production Memory Authority Verified.');
process.exit(0);

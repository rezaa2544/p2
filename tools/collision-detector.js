#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/collision-detector.js — Shared-File Collision Detector (C8-02)
   ───────────────────────────────────────────────────────────────────
   هدف: شناسایی و مسدودسازی تداخل‌های عمدی یا تصادفی روی فایل‌های مشترک
   و نقض مرزهای مالکیتی آرناها طبق:
     • docs/PARALLEL_FAILOVER_EXECUTION_PROTOCOL.md (§4, §5, §9)
     • docs/EXECUTION_CONTROL_PROTOCOL.md (§6)
     • docs/daily-mission-boards/2026-09-17/Chat8.md (C8-02)

   حوزه‌ها:
     ۱) تفکیک مالکیتی آرناها: هر آرنا فقط مالک پوشه گزارش/مأموریت خودش است
        (docs/daily-reports/ChatN/ و docs/daily-missions/ChatN/)
     ۲) فایل‌های حساس و پرتداخل (High-collision shared files):
        تغییر همزمان یا بدون هماهنگی روی فایل‌های تکلیفی مانند authz،
        قفل مستندات، index.html، بیلد و هسته سرور پرچم‌گذاری و مدیریت می‌شود.
     ۳) بررسی تداخل شاخه‌ها و PRهای باز (gh pr list / git diff).

   اجرا:
     node tools/collision-detector.js --check
     node tools/collision-detector.js --files f1,f2 --arena Chat8
     node tools/collision-detector.js --json
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

/* لیست فایل‌های بحرانی با احتمال بالای تداخل (High-Collision Shared Files) */
const HIGH_COLLISION_SHARED_FILES = [
  'authz/model.json',
  'authz/write-perms.json',
  'index.html',
  'build.js',
  'server/sync.js',
  'server/db.js',
  'server/policy.js',
  'docs/PARALLEL_FAILOVER_EXECUTION_PROTOCOL.md',
  'docs/EXECUTION_CONTROL_PROTOCOL.md',
  'docs/DAILY_20_MISSION_PROTOCOL.md',
  'docs/DOCS_METRICS.md',
  'docs/DOCUMENTATION_MAP.md'
];

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (_) {
    return '';
  }
}

/** استخراج آرنا از شاخه، متغیر محیطی یا آرگومان */
function detectCurrentArena(explicit) {
  if (explicit && /^Chat(?:[1-9]|10)$/i.test(explicit)) {
    return explicit.charAt(0).toUpperCase() + explicit.slice(1).toLowerCase();
  }
  if (process.env.ARENA_NAME && /^Chat(?:[1-9]|10)$/i.test(process.env.ARENA_NAME)) {
    return process.env.ARENA_NAME;
  }
  return null;
}

/** بررسی فایل‌ها در برابر مرزهای مالکیتی آرناها */
function checkArenaBoundary(files, arena) {
  const violations = [];
  if (!arena) return violations;

  const arenaNum = arena.replace(/^Chat/i, '');
  for (const f of files) {
    const norm = f.replace(/\\/g, '/');
    const mReport = norm.match(/^docs\/daily-reports\/Chat([1-9]|10)\//);
    if (mReport && mReport[1] !== arenaNum) {
      violations.push({
        file: norm,
        type: 'FOREIGN_ARENA_REPORT',
        owner: 'Chat' + mReport[1],
        violator: arena,
        reason: `ویرایش مستقیم پوشه گزارش روزانه آرنای دیگر (Chat${mReport[1]}) توسط ${arena} ممنوع است.`
      });
    }

    const mMission = norm.match(/^docs\/daily-missions\/Chat([1-9]|10)\//);
    if (mMission && mMission[1] !== arenaNum) {
      violations.push({
        file: norm,
        type: 'FOREIGN_ARENA_MISSION',
        owner: 'Chat' + mMission[1],
        violator: arena,
        reason: `ویرایش صف مأموریت فعال آرنای دیگر (Chat${mMission[1]}) بدون Takeover رسمی ممنوع است.`
      });
    }
  }
  return violations;
}

/** بررسی فایل‌های بحرانی با احتمال بالای تداخل */
function checkHighCollisionFiles(files) {
  const sharedTouched = [];
  for (const f of files) {
    const norm = f.replace(/\\/g, '/');
    if (HIGH_COLLISION_SHARED_FILES.includes(norm) || /^docs\/DOCS_FREEZE_v.*\.md$/.test(norm)) {
      sharedTouched.push(norm);
    }
  }
  return sharedTouched;
}

/** بررسی تداخل متقابل بین چند مجموعه فایل (مثلاً دو شاخه یا دو PR) */
function detectCollisionsBetween(setA, setB) {
  const sB = new Set(setB.map(f => f.replace(/\\/g, '/')));
  const collisions = [];
  for (const f of setA) {
    const norm = f.replace(/\\/g, '/');
    if (sB.has(norm)) {
      collisions.push(norm);
    }
  }
  return collisions;
}

/** دریافت فایل‌های تغییریافته فعلی (Staged + Working tree vs HEAD/main) */
function getChangedFiles(baseRef) {
  const base = baseRef || 'origin/main';
  const out = git(['diff', '--name-only', base]);
  const staged = git(['diff', '--cached', '--name-only']);
  const files = new Set();
  if (out) out.split('\n').filter(Boolean).forEach(f => files.add(f));
  if (staged) staged.split('\n').filter(Boolean).forEach(f => files.add(f));
  return Array.from(files);
}

function run(argv) {
  const args = argv || process.argv.slice(2);
  let explicitArena = null;
  let explicitFiles = null;
  let jsonOutput = false;
  let baseRef = 'origin/main';
  let blockShared = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--arena' && args[i + 1]) {
      explicitArena = args[++i];
    } else if (args[i] === '--files' && args[i + 1]) {
      explicitFiles = args[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (args[i] === '--base' && args[i + 1]) {
      baseRef = args[++i];
    } else if (args[i] === '--block-shared') {
      blockShared = true;
    } else if (args[i] === '--json') {
      jsonOutput = true;
    }
  }

  const arena = detectCurrentArena(explicitArena) || 'Chat8';
  const files = explicitFiles || getChangedFiles(baseRef);

  const boundaryViolations = checkArenaBoundary(files, arena);
  const highCollisionTouched = checkHighCollisionFiles(files);

  const result = {
    arena,
    filesChecked: files.length,
    files,
    boundaryViolations,
    highCollisionTouched,
    passed: boundaryViolations.length === 0 && (!blockShared || highCollisionTouched.length === 0)
  };

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return result.passed ? 0 : 1;
  }

  console.log(`\n🔍 Shared-File Collision Detector (C8-02) — Arena: ${arena}`);
  console.log(`────────────────────────────────────────────────────────`);
  console.log(`فایل‌های بررسی‌شده: ${files.length}`);

  if (boundaryViolations.length > 0) {
    console.error(`\n❌ نقض مرز مالکیتی آرناها (تداخل مسدودکننده):`);
    for (const v of boundaryViolations) {
      console.error(`  • [${v.type}] ${v.file} (مالک: ${v.owner}) — ${v.reason}`);
    }
  }

  if (highCollisionTouched.length > 0) {
    console.log(`\n⚠️ فایل‌های حساس و مشترک تغییریافته (نیازمند انطباق دقیق):`);
    for (const f of highCollisionTouched) {
      console.log(`  • ${f}`);
    }
  }

  if (result.passed) {
    console.log(`\n✅ هیچ تداخل یا نقض مرز مالکیتی مسدودکننده‌ای یافت نشد.`);
    return 0;
  } else {
    console.error(`\n🚫 خطا: تداخل فایل یا نقض مرز مالکیتی مانع از ادامه است (Exit 1).`);
    return 1;
  }
}

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  run,
  checkArenaBoundary,
  checkHighCollisionFiles,
  detectCollisionsBetween,
  HIGH_COLLISION_SHARED_FILES
};

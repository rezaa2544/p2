#!/usr/bin/env node
/*
 * Mutation gate for PR #74 / Bug Hunt session 7.
 * Every mutant below represents a real regression: an old migration marker
 * bypass, newest-first queue merge, or a stale Background Sync mirror after
 * explicit deletion. The generated single-file app is rebuilt for each
 * browser-facing mutant — BH-mut safe pattern (p06/p11): the mutant lives in a
 * sibling copy, build outputs are shadowed in tmpdir, and the tracked files
 * are asserted byte-for-byte unchanged afterwards (by construction + check).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
/* BH-mut (الگوی امن p06/p11): جهش در کپیِ جدا + خروجی‌های build در سایه. */
const { session } = require('./helpers/mutant-kit');
const kit = session('pr74-mut-');
kit.remapBuildOutputs();

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'js', '00-migration.js');
const SYNC = path.join(ROOT, 'src', 'js', '27-sync.js');
const GENERATED = [
  path.join(ROOT, 'index.html'),
  path.join(ROOT, 'USER_GUIDE.html')
];
let pass = 0;
let fail = 0;

function check(condition, message) {
  if (condition) { pass += 1; console.log('  ✅ ' + message); }
  else { fail += 1; console.log('  ❌ ' + message); }
}

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function run(command, args, timeout = 180000, env) {
  return spawnSync(command, args, {
    cwd: ROOT,
    env: env || process.env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024
  });
}

function outputOf(result) {
  return String(result.stdout || '') + String(result.stderr || '');
}

function withGeneratedMutation(file, from, to, killPattern, label, suite) {
  const tracked = [file, ...GENERATED];
  const before = new Map(tracked.map((f) => [f, { text: fs.readFileSync(f, 'utf8'), hash: sha(f) }]));
  const original = before.get(file).text;
  const mutated = original.replace(from, to);
  if (mutated === original) {
    check(false, label + ' — لنگرِ جهش پیدا نشد');
    return;
  }
  try {
    kit.mutant(file, mutated); /* کپی هم‌جوار — سورس اصلی هرگز نوشته نمی‌شود */
    const build = run(process.execPath, ['build.js'], 180000, kit.env()); /* build به سایه */
    const builtOut = outputOf(build);
    if (build.status !== 0) {
      check(false, label + ' — build شکست خورد: ' + builtOut.slice(-240));
      return;
    }
    const result = run(process.execPath, [suite], 180000, kit.env());
    const out = outputOf(result);
    const suiteRan = /(?:جمع: \d+ موفق|sync-del-mirror:)/.test(out);
    check(suiteRan && result.status !== 0 && killPattern.test(out), label);
  } finally {
    /* الگوی امن: فایل‌های tracked هرگز نوشته نشدند — این assert بقای
       بایت‌به‌بایت را اثبات می‌کند (در جایگزینِ قدیمی: restore + sha-check) */
    for (const [f, value] of before) {
      if (sha(f) !== value.hash) check(false, label + ' — سورس/خروجیِ اصلی تغییر کرد (نقضِ الگوی امن!)');
    }
  }
}

console.log('\n▸ جهش‌های PR #74 — مهاجرت، ترتیب صف و آینهٔ Background Sync');

/* A v2 flag from the old first-wins implementation must not bypass repair. */
withGeneratedMutation(
  SOURCE,
  "Store.get(IDB_MIGRATION_REPAIR_FLAG) === 'true'",
  "Store.get(IDB_MIGRATION_FLAG) === 'true' /* MUT: old flag bypass */",
  /❌ M6/,
  'M1 پرچمِ v2 دوباره bypass می‌کند ⇒ آزمونِ صفِ باقی‌مانده آن را می‌کشد',
  path.join('tests', 'idb-migration-queue.js')
);

/* A newest-first traversal lets a legacy record overwrite the current uid. */
withGeneratedMutation(
  SOURCE,
  "var QUEUE_KEYS = ['payesh_sync_queue', 'sms_queue_v1', 'sms_syncq_v1'];",
  "var QUEUE_KEYS = ['sms_syncq_v1', 'sms_queue_v1', 'payesh_sync_queue']; /* MUT: newest first */",
  /❌ M7/,
  'M2 ترتیبِ جدید→قدیم collision را خراب می‌کند ⇒ آزمونِ uid مشترک آن را می‌کشد',
  path.join('tests', 'idb-migration-queue.js')
);

/* Manual deletion must remove the IDB mirror, not only localStorage. */
withGeneratedMutation(
  SYNC,
  "    bgMirrorQueue();\n    refreshSyncBadge();",
  "    /* MUT: deletion does not update the Background Sync mirror */\n    refreshSyncBadge();",
  /❌ D3/,
  'M3 حذفِ bgMirrorQueue در مسیرِ حذف ⇒ آزمونِ آینه آن را می‌کشد',
  path.join('tests', 'sync-del-mirror.js')
);

console.log('\n────────────────────────────────────────────');
console.log(`جهش‌های PR #74: ${pass}/${pass + fail}` + (fail ? ' — ❌' : ' — همه کشته شدند ✅'));
console.log('────────────────────────────────────────────');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* documentation-maintenance-coverage.js — پوشش راهنمای نگهداری مستندات (چت ۶، مأموریت ۳۱) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'DOCUMENTATION_MAINTENANCE.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('سند نگهداری مستندات وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('ده بخش اصلی');
[['۱', 'اصول نگهداری'], ['۲', 'چرخه‌های نگهداری'], ['۳', 'فرآیند افزودن سند جدید'],
 ['۴', 'فرآیند حذف/آرشیو سند'], ['۵', 'فرآیند بامپ قفل'], ['۶', 'تست‌های پوشش مستندات'],
 ['۷', 'نقش‌ها و مسئولیت‌ها'], ['۸', 'ابزارها'], ['۹', 'کلیدهای تاریخی'], ['۱۰', 'بدهی مستنداتی']]
  .forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## بخش ' + num + ': ' + title)));

grp('محتوای اصول و چرخه‌ها');
['هر تغییر کد = تغییر سند مرتبط', 'Definition of Done', 'یتیمی وجود ندارد', 'یک منبع حقیقت'].forEach((p) =>
  chk('اصل: ' + p, doc.includes(p)));
['روزانه', 'هفتگی', 'ماهانه', 'فصلی'].forEach((c) =>
  chk('چرخهٔ ' + c, doc.includes('**' + c)));

grp('فرآیندها');
chk('شش گام افزودن سند', (doc.slice(doc.indexOf('## بخش ۳'), doc.indexOf('## بخش ۴')).match(/^\d\. /gm) || []).length === 6);
chk('قاعدهٔ آرشیو نه حذف', doc.includes('حذف نمی‌شود — آرشیو'));
chk('ارجاع به پوشهٔ آرشیو', doc.includes('docs/archive/'));
chk('فریز ۱۴/۱۴ در فرآیند بامپ', doc.includes('۱۴/۱۴'));
chk('چک‌لیست دام آف‌بای‌وان آمده', doc.includes('آف‌بای‌وان'));

grp('تست‌ها و ابزارها');
['tests/docs-freeze-marker.js', 'tests/docs-metrics.js', 'tests/docs-health.js', 'tests/docs-consistency.js',
 'tests/docs-index-coverage.js', 'tools/docs-health.sh', 'tools/docs-consistency-check.sh',
 'tools/generate-data-dictionary.js', 'tools/docs-export.sh'].forEach((t) =>
  chk('ارجاع به ' + t, doc.includes(t)));
chk('الگوی تست تازه معرفی شده', doc.includes('risk-register-coverage.js'));

grp('نقش‌ها');
['مستندساز (چت ۶)', 'مسئول امنیت (چت ۱)', 'اس‌آر‌ای (چت ۴)', 'ناظر'].forEach((r) =>
  chk('نقش: ' + r, doc.includes(r)));

grp('کلیدهای تاریخی و بدهی');
chk('قفل‌های تاریخی مصون‌اند', doc.includes('rc1.md') && doc.includes('rc13'));
chk('هندآف و آرشیوش آمده', doc.includes('HANDOFF_ARCHIVE.md'));
chk('بدهی‌های رویداد-وابسته اولویت‌بندی شده‌اند', doc.includes('🔴 بالا') && doc.includes('🟢 پایین'));
chk('بدهی بار واقعی در فهرست است', doc.includes('LOAD_TEST_RESULTS.md'));

grp('امنیت و جایگاه در کتابخانه');
chk('هیچ رازی در سند نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه برای سند نگهداری وجود دارد', rd('docs/DOCS_INDEX.md').includes('DOCUMENTATION_MAINTENANCE.md'));

/* قالب PR سند زندهٔ اجرای همین قرارداد است، نه snapshot بیلینگ/شمار تست‌ها.
   این گاردها ادعای CI را به head و run واقعی وصل می‌کنند؛ هیچ گیت قدیمی حذف نمی‌شود. */
grp('صداقت شواهد در قالب PR');
const templatePath = path.join(ROOT, '.github', 'pull_request_template.md');
const template = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '';
chk('قالب PR موجود است', template.length > 0);
chk('قالب، انسداد همیشگی بیلینگ را فرض نمی‌کند', !template.includes('بیلینگِ Actions مسدود است'));
chk('شاهد CI شامل head SHA و run URL است', template.includes('head SHA') && template.includes('run URL'));
chk('FAILED از NOT-RUN و CI از staging تفکیک می‌شود', ['FAILED', 'NOT-RUN', 'staging'].every((s) => template.includes(s)));
chk('گیت‌های مستندات و محصول در قالب حفظ شده‌اند', [
  'node tools/docs-stats-sync.js --check', 'node tests/docs-freeze-marker.js', '۱۴/۱۴',
  'node tests/run.js', 'node tests/smoke.js', 'node tests/secret-scan.js', 'node build.js --check'
].every((s) => template.includes(s)));

// Keep all runtime fixtures in the existing governance-maintenance suite.
// No frozen counters or assertions are weakened by adding runtime coverage.
grp('Repository-bound Arena runtime');
(() => {
  // Regression for repo-bound governance routing; no network or real Mission edits.
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync, execFileSync } = require('node:child_process');
  const ROOT = path.resolve(__dirname, '..');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-runtime-gate-'));
  const target = path.join(scratch, 'target');
  const foreign = path.join(scratch, 'foreign');
  const mission = 'docs/daily-missions/Chat8/ACTIVE.md';
  const env = { ...process.env };
  // Test fixtures must not inherit an outer repository selected by the caller.
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[key];
  function test(name, check) {
    try { check(); chk('runtime/' + name, true); }
    catch (error) { chk('runtime/' + name, false, error.message); }
  }
  function git(dir, args) {
    return execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  }
  function seed(dir) {
    fs.mkdirSync(path.join(dir, path.dirname(mission)), { recursive: true });
    fs.writeFileSync(path.join(dir, mission), '# Fixture Mission\n');
    git(dir, ['init', '-q']);
    git(dir, ['add', mission]);
    git(dir, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'core.hooksPath=' + path.join(scratch, 'empty-hooks'), 'commit', '--no-gpg-sign', '-qm', 'fixture']);
  }
  function run(cwd, chat = ['Chat8'], overrides = {}) {
    const result = spawnSync(process.execPath, [path.join(target, 'tools/arena-runtime-gate.js'), ...chat],
      { cwd, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    return result;
  }
  function state(result, mode, local, remote) {
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('ARENA_RUNTIME_STATE=' + mode + '\n'), result.stdout);
    assert.ok(result.stdout.includes('LOCAL_MISSION=' + local + '\n'), result.stdout);
    assert.ok(result.stdout.includes('ORIGIN_MAIN_MISSION=' + remote + '\n'), result.stdout);
    assert.ok(result.stdout.includes('STOP_ALLOWED=NO\n'));
    assert.ok(result.stdout.includes('NEXT_ACTION='));
  }
  try {
    fs.mkdirSync(path.join(scratch, 'empty-hooks'));
    seed(target); seed(foreign);
    fs.mkdirSync(path.join(target, 'tools'));
    fs.copyFileSync(path.join(ROOT, 'tools/arena-runtime-gate.js'), path.join(target, 'tools/arena-runtime-gate.js'));
    git(target, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const initialStatus = git(target, ['status', '--porcelain']);
    const initialRefs = git(target, ['show-ref']);
    for (const [name, cwd] of [['repo-root', target], ['nested-cwd', path.join(target, 'docs')],
      ['outside-repo', scratch], ['foreign-repo', foreign]]) {
      test(name, () => state(run(cwd), 'MISSION_MODE', 'PRESENT', 'PRESENT'));
    }
    test('read-only-local-and-refs', () => {
      assert.equal(git(target, ['status', '--porcelain']), initialStatus);
      assert.equal(git(target, ['show-ref']), initialRefs);
    });
    fs.unlinkSync(path.join(target, mission));
    test('remote-only-root', () => state(run(target), 'MISSION_MODE', 'MISSING', 'PRESENT'));
    test('remote-only-outside', () => state(run(scratch), 'MISSION_MODE', 'MISSING', 'PRESENT'));
    const foreignSelectors = { GIT_DIR: path.join(foreign, '.git'), GIT_WORK_TREE: foreign,
      GIT_COMMON_DIR: path.join(foreign, '.git'), GIT_INDEX_FILE: path.join(foreign, '.git/index') };
    test('inherited-selectors-cannot-hide-target-mission', () => state(run(scratch, ['Chat8'], foreignSelectors), 'MISSION_MODE', 'MISSING', 'PRESENT'));
    git(target, ['update-ref', '-d', 'refs/remotes/origin/main']);
    test('missing-root', () => state(run(target), 'CONTINUITY_FALLBACK', 'MISSING', 'NOT_AVAILABLE'));
    test('missing-outside', () => state(run(scratch), 'CONTINUITY_FALLBACK', 'MISSING', 'NOT_AVAILABLE'));
    test('foreign-mission-cannot-authorize-target', () => state(run(foreign), 'CONTINUITY_FALLBACK', 'MISSING', 'NOT_AVAILABLE'));
    git(foreign, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    test('inherited-selectors-cannot-authorize-target', () => state(run(scratch, ['Chat8'], foreignSelectors), 'CONTINUITY_FALLBACK', 'MISSING', 'NOT_AVAILABLE'));
    for (const [name, args] of [['missing-chat', []], ['invalid-chat', ['Chat11']], ['path-like-chat', ['../Chat8']]]) {
      test(name, () => { const r = run(scratch, args); assert.equal(r.status, 2); assert.match(r.stderr, /Usage:/); });
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
})();

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);

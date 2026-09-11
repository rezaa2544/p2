#!/usr/bin/env node
/**
 * wal-drill-bootstrap.js — نگهبانِ زیرساختِ مانورِ WAL (Bug Hunt نشست ۹)
 * ══════════════════════════════════════════════════════════════════
 * چرا این تست جدا از tests/wal-disk-full.js است؟ مانورِ زنده به PostgreSQL 17،
 * tmpfs و sudo نیاز دارد و در CI سبک اجرا نمی‌شود؛ ولی دو باگِ واقعیِ همین
 * اسکریپت *بدونِ* هیچ زیرساختی قابل گرفتن بودند:
 *
 *   B1 نحوِ bash سالم است
 *   B2 کشفِ پویای migration (نامی hardcode نشده) — پس بازشماریِ فایل‌ها
 *      نمی‌تواند اسکریپت را بی‌صدا کهنه کند (S9-6)
 *   B3 پیش‌بینیِ پوشش: با همان الگویِ اسکریپت، هر migrationِ روی دیسک دیده می‌شود
 *   B4 شکستِ migration اجرا را می‌بندد (die) و «skip»ِ بی‌صدا وجود ندارد
 *   B5 گاردهای مسیر: WAL_MNT=/ و PGDATA=/ و مسیرِ نسبی ⇒ امتناع، پیش از هر
 *      mount/rm -rf و بی‌نیاز از PostgreSQL (اجرای واقعیِ اسکریپت)
 *   B6 با مسیرهایِ سالم ولی PGBINِ ناموجود، دقیقاً روی همان نبودِ PostgreSQL
 *      می‌میرد — یعنی گاردها مسیرِ درست را رد نمی‌کنند
 *   B7 اسکریپت به هیچ مسیرِ بیرونِ متغیرها دست نمی‌زند (بی‌سازوکارِ test-able)
 * اجرا: node tests/wal-drill-bootstrap.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BOOT = path.join(ROOT, 'infra', 'wal-drill', 'bootstrap.sh');

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
/* اجرای اسکریپت با متغیرهای محیطیِ دلخواه؛ هیچ چیزی روی میزبان لازم نیست */
function runBootstrap(env) {
  return spawnSync('bash', [BOOT], {
    encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, env || {}),
  });
}

console.log('\n▸ نگهبانِ زیرساختِ مانورِ WAL — wal-drill-bootstrap (Bug Hunt نشست ۹)');

assert(fs.existsSync(BOOT), 'infra/wal-drill/bootstrap.sh پیدا نشد');
const src = fs.readFileSync(BOOT, 'utf8');
/* برای ادعاهای مربوط به «مسیرِ کد»، خطوطِ کامنت حذف می‌شوند: کامنتِ توضیحی
   که دربارهٔ رفتارِ قدیمی حرف می‌زند نباید تست را سبز/سرخ کند. */
const code = src.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

test('B1 نحوِ bash سالم است', () => {
  const r = spawnSync('bash', ['-n', BOOT], { encoding: 'utf8' });
  assert(r.status === 0, (r.stderr || '').trim());
});

test('B2 migrations با کشفِ پویا اعمال می‌شوند — هیچ نامی hardcode نشده', () => {
  const glob = /migrations\/\[0-9\]\[0-9\]\[0-9\]_\*\.sql/;
  assert(glob.test(code), 'الگویِ کشفِ پویا (migrations/[0-9][0-9][0-9]_*.sql) در اسکریپت نیست');
  const hardcoded = code.match(/migrations\/\d{3}_[a-z0-9_]+\.sql/g) || [];
  assert(hardcoded.length === 0, 'نامِ hardcode‌شده باقی مانده: ' + hardcoded.join(', '));
});

test('B3 پیش‌بینیِ پوشش: الگویِ اسکریپت هر migrationِ روی دیسک را می‌بیند', () => {
  const dir = path.join(ROOT, 'migrations');
  const onDisk = fs.readdirSync(dir)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f) && !/\.down\.sql$/.test(f)).sort();
  assert(onDisk.length > 0, 'هیچ migrationِ رو‌به‌جلو روی دیسک نیست');
  const rx = /^\d{3}_.*\.sql$/;         /* همان چیزی که globِ اسکریپت می‌گیرد */
  const missed = onDisk.filter((f) => !rx.test(f));
  assert(missed.length === 0, 'migration بدونِ پوشش: ' + missed.join(', '));
  /* و شمارشِ ادعاییِ اسکریپت باید با واقعیتِ دیسک بخواند */
  assert(/applied=\$?\(?\(?0\)?\)?/.test(code) || /applied=0/.test(code), 'شمارندهٔ applied در اسکریپت نیست');
  assert(!/= absent|skip \(absent\): \$m/.test(code), 'مسیرِ «رد کردنِ فایلِ ناموجود» هنوز در کد است');
  assert(!/\[ -f "\$m" \] \|\|/.test(code), 'گاردِ وجودِ فایل (به‌جای کشفِ پویا) هنوز در کد است');
});

test('B4 شکستِ migration اجرا را می‌بندد (die)، نه ادامهٔ بی‌صدا', () => {
  assert(/die "migration failed/.test(code), 'dieِ migrationِ شکست‌خورده نیست');
  const failEcho = code.match(/echo "    FAIL \$m";?/g) || [];
  assert(failEcho.length === 0 || /die "migration failed/.test(src),
    'FAIL بی‌در‌پی (بدونِ توقف) باقی مانده');
  assert(/ON_ERROR_STOP=1/.test(code), 'psql بدونِ ON_ERROR_STOP اجرا می‌شود');
});

test('B5 گاردِ مسیر: / و /usr و مسیرِ نسبی رد می‌شوند (پیش از هر کارِ سنگین)', () => {
  const cases = [
    { env: { WAL_MNT: '/', PGBIN: '/nonexistent-bin' }, want: /WAL_MNT/ },
    { env: { PGDATA: '/', PGBIN: '/nonexistent-bin' }, want: /PGDATA/ },
    { env: { WAL_MNT: 'relative/path', PGBIN: '/nonexistent-bin' }, want: /absolute/ },
    { env: { PGDATA: '/usr', PGBIN: '/nonexistent-bin' }, want: /PGDATA/ },
    /* Canonical aliases must be denied too; a literal case pattern accepts
       /usr/ and was the security finding in PR #81 review. */
    { env: { PGDATA: '/usr/', PGBIN: '/nonexistent-bin' }, want: /PGDATA/ },
    { env: { WAL_MNT: '/usr/.', PGBIN: '/nonexistent-bin' }, want: /WAL_MNT/ },
    { env: { RUN: '/tmp/../usr', PGBIN: '/nonexistent-bin' }, want: /RUN/ },
  ];
  for (const c of cases) {
    const r = runBootstrap(c.env);
    const out = (r.stdout || '') + (r.stderr || '');
    assert(r.status !== 0, 'با ' + JSON.stringify(c.env) + ' باید امتناع کند (status=' + r.status + ')');
    assert(c.want.test(out), 'پیامِ گارد برای ' + JSON.stringify(c.env) + ' دیده نشد: ' + out.slice(-160));
    assert(!/postgres 17 binaries not found/.test(out),
      'تحقّقِ مسیر بعد از کارهایِ سنگین رخ می‌دهد — گارد باید اول بیاید');
  }
});

test('B6 مسیرهایِ سالم بی‌دلیل رد نمی‌شوند (صرفاً نبودِ PostgreSQL را می‌گوید)', () => {
  const r = runBootstrap({
    WAL_MNT: '/tmp/s9-wal-mnt', PGDATA: '/tmp/s9-pgdata-wal-drill',
    RUN: '/tmp/s9-run', PGBIN: '/nonexistent-bin',
  });
  const out = (r.stdout || '') + (r.stderr || '');
  assert(r.status !== 0, 'بدونِ PostgreSQL باید شکست بخورد');
  assert(/postgres 17 binaries not found/.test(out), 'پیامِ انتظاری نیامد: ' + out.slice(-200));
  assert(!/refuses/.test(out), 'گاردِ مسیر به مسیرِ سالم گیر داده: ' + out.slice(-200));
});

test('B7 هیچ کارِ مخربی پیش از گاردها انجام نمی‌شود (اسکریپت بی‌عارضه اجرا و رد شد)', () => {
  /* اجرای بالا با WAL_MNT=/ هیچ‌وقت به mount/rm -rf نرسید؛ این‌جا تأیید
     ساختاری: mount/rm -rf/chown باید *بعد* از گاردها در فایل باشند. */
  const iGuard = src.indexOf('guard_path WAL_MNT');
  const iMount = src.indexOf('mount -t tmpfs');
  const iRm = src.indexOf('rm -rf "$PGDATA"');
  assert(iGuard > -1 && iMount > iGuard && iRm > iGuard,
    'ترتیبِ گارد/کارِ مخرب درست نیست (guard=' + iGuard + ' mount=' + iMount + ' rm=' + iRm + ')');
  assert(!/rm -rf "\$WAL_MNT"\/?\s*$/.test(src), 'rm -rf روی خودِ WAL_MNT ممنوع است');
});

console.log('\n────────────────────────────────────────────');
if (fail) console.log(`wal-drill-bootstrap: ${pass}/${pass + fail} ❌\n` + failures.map((f) => '   ' + f.name + ' — ' + f.msg).join('\n'));
else console.log(`wal-drill-bootstrap: ${pass}/${pass} ✅`);
console.log('────────────────────────────────────────────');
process.exit(fail ? 1 : 0);

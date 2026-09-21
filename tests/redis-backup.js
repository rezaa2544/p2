#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   redis-backup.js — فاز ۲.۱: آزمون اسکریپت پشتیبان/نگهداری
   ───────────────────────────────────────────────────────────────────
   بدون نیاز به ردیس واقعی: `redis-cli` با اسکریپتِ جعلی (stub) که
   از مسیرِ `REDIS_CLI` به اسکریپت معرفی می‌شود جایگزین شده است.

   B1  پشتیبان RDB: فایل با مهر زمانی در مقصد ساخته می‌شود
   B2  پشتیبان AOF: پس از پایان بازنویسی کپی می‌شود
   B3  مانیفست نوشته می‌شود
   B4  نگهداری: فایل‌های قدیمی‌تر از دوره حذف می‌شوند، تازه‌ها می‌مانند
   B5  شکستِ SAVE = خروجی غیرصفر و بدون ادعای موفقیت
   B6  نشت رمز: رمز در خروجی/مانیفست ظاهر نمی‌شود
   اجرا:  node tests/redis-backup.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'tools', 'redis-backup.sh');

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 240) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}

function makeStub(binDir, redisDir, opts) {
  opts = opts || {};
  fs.mkdirSync(binDir, { recursive: true });
  const stub = path.join(binDir, 'fake-redis-cli');
  fs.writeFileSync(stub, `#!/usr/bin/env bash
# دستور، نخستین آرگومانِ غیرگزینه‌ای است (پیش از آن ‎-h/-پورت می‌آید)
for a in "$@"; do
  case "$a" in
    PING) echo PONG; exit 0 ;;
    SAVE)
      ${opts.failSave ? 'exit 1' : `echo OK; echo "RDB-DATA-\${RANDOM}" > "${redisDir}/dump.rdb"`}
      exit 0 ;;
    BGREWRITEAOF) echo "Background append only file rewriting started"; echo "AOF-DATA" > "${redisDir}/appendonly.aof"; exit 0 ;;
    INFO)
      printf '# persistence\\r\\naof_rewrite_in_progress:0\\r\\nrdb_last_bgsave_status:ok\\r\\n'
      exit 0 ;;
  esac
done
exit 0
`);
  fs.chmodSync(stub, 0o755);
  return stub;
}

function runBackup(env) {
  return spawnSync('bash', [SCRIPT], {
    env: Object.assign({}, { PATH: process.env.PATH }, env),
    encoding: 'utf8', timeout: 60000
  });
}

main();

function main() {
  console.log('\n▸ فاز ۲.۱ — پشتیبان ردیس (با ردیس جعلی)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rb-'));
  const redisDir = path.join(tmp, 'redis'); fs.mkdirSync(redisDir);
  const backupDir = path.join(tmp, 'backup'); fs.mkdirSync(backupDir);
  const stub = makeStub(path.join(tmp, 'bin'), redisDir, {});

  const baseEnv = {
    REDIS_CLI: stub, REDIS_DIR: redisDir, BACKUP_DIR: backupDir,
    BACKUP_LOCK: path.join(tmp, 'lock'), BACKUP_RETENTION_DAYS: '7'
  };

  /* فایل‌های قدیمی برای آزمون نگهداری */
  const oldRdb = path.join(backupDir, 'dump-20200101T000000Z.rdb');
  const oldAof = path.join(backupDir, 'appendonly-20200101T000000Z.aof');
  fs.writeFileSync(oldRdb, 'old'); fs.writeFileSync(oldAof, 'old');
  const tenDaysAgo = new Date(Date.now() - 10 * 86400 * 1000);
  fs.utimesSync(oldRdb, tenDaysAgo, tenDaysAgo);
  fs.utimesSync(oldAof, tenDaysAgo, tenDaysAgo);

  const r = runBackup(Object.assign({}, baseEnv, { REDIS_PASSWORD: 'p@ss-SECRET-xyz' }));
  const out = (r.stdout || '') + (r.stderr || '');

  chk('B0 اسکریپت موفق اجرا شد (بدون ردیس واقعی)', r.status === 0, out.slice(-300));

  const files = fs.readdirSync(backupDir);
  const rdb = files.find(f => /^dump-\d{8}T\d{6}Z\.rdb$/.test(f));
  const aof = files.find(f => /^appendonly-\d{8}T\d{6}Z\.aof$/.test(f));

  chk('B1 پشتیبان RDB با مهر زمانی ساخته شد', !!rdb && fs.readFileSync(path.join(backupDir, rdb), 'utf8').indexOf('RDB-DATA') === 0, files.join(','));
  chk('B2 پشتیبان AOF ساخته شد', !!aof, files.join(','));
  chk('B3 مانیفست نوشته شد', (() => {
    const m = fs.readFileSync(path.join(backupDir, 'last-backup.txt'), 'utf8');
    return /timestamp=/.test(m) && /rdb=/.test(m) && m.indexOf('SECRET') === -1;
  })());
  chk('B4a فایل ۱۰ روز پیش حذف شد (نگهداری ۷ روز)', !fs.existsSync(oldRdb) && !fs.existsSync(oldAof));
  chk('B4b فایل‌های تازه ماندند', !!rdb && !!aof);

  /* شکست SAVE */
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rb2-'));
  const redisDir2 = path.join(tmp2, 'redis'); fs.mkdirSync(redisDir2);
  const backupDir2 = path.join(tmp2, 'backup'); fs.mkdirSync(backupDir2);
  const stubFail = makeStub(path.join(tmp2, 'bin'), redisDir2, { failSave: true });
  const r2 = runBackup({ REDIS_CLI: stubFail, REDIS_DIR: redisDir2, BACKUP_DIR: backupDir2, BACKUP_LOCK: path.join(tmp2, 'lock') });
  chk('B5 شکست SAVE = خروجی غیرصفر + پیام', r2.status !== 0 && /SAVE/.test((r2.stdout || '') + (r2.stderr || '')), 'status=' + r2.status);

  chk('B6 رمز در هیچ خروجی‌ای نشت نکرد',
    out.indexOf('p@ss-SECRET-xyz') === -1 && ((r2.stdout || '') + (r2.stderr || '')).indexOf('p@ss-SECRET-xyz') === -1);

  /* ── B7 (F-QA-08): تداخلِ قفل نباید «موفقیت» گزارش شود ──
     قفل را در یک پروسهٔ دیگر نگه می‌داریم و اسکریپت را صدا می‌زنیم.
     پیش از اصلاح، اسکریپت با exit 0 خارج می‌شد و cron یک اجرایِ
     بدونِ هیچ پشتیبانی را سبز می‌دید. */
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rb3-'));
  const redisDir3 = path.join(tmp3, 'redis'); fs.mkdirSync(redisDir3);
  const backupDir3 = path.join(tmp3, 'backup'); fs.mkdirSync(backupDir3);
  const stub3 = makeStub(path.join(tmp3, 'bin'), redisDir3, {});
  const lock3 = path.join(tmp3, 'lock');
  /* نگهدارندهٔ قفل: تا ۳۰ ثانیه قفل را در اختیار می‌گیرد */
  const holder = spawnSync('bash', ['-c',
    `exec 9>"${lock3}"; flock -n 9 || exit 9; (exec 9>"${lock3}"; flock 9; sleep 30) & echo $!`
  ], { encoding: 'utf8', timeout: 15000 });
  const holderPid = parseInt(String(holder.stdout || '').trim(), 10);
  /* به نگهدارنده فرصت بده قفل را واقعاً بگیرد */
  spawnSync('bash', ['-c', 'sleep 1'], { timeout: 5000 });
  const r3 = runBackup({
    REDIS_CLI: stub3, REDIS_DIR: redisDir3, BACKUP_DIR: backupDir3, BACKUP_LOCK: lock3
  });
  const out3 = (r3.stdout || '') + (r3.stderr || '');
  const produced3 = fs.readdirSync(backupDir3).filter(f => /\.(rdb|aof)$/.test(f));
  chk('B7 تداخلِ قفل = خروجیِ غیرصفر (نه سبزِ کاذب)',
    r3.status !== 0, 'status=' + r3.status + ' out=' + out3.slice(-160));
  chk('B7b تداخلِ قفل = هیچ فایلِ پشتیبانی تولید نشد',
    produced3.length === 0, 'files=' + produced3.join(','));
  chk('B7c کدِ تداخل از کدِ خطایِ واقعی (۱) جداست',
    r3.status === 75, 'status=' + r3.status);
  if (Number.isFinite(holderPid) && holderPid > 0) { try { process.kill(holderPid, 'SIGKILL'); } catch (e) {} }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(tmp2, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(tmp3, { recursive: true, force: true }); } catch (e) {}

  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`پشتیبان ردیس: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}

#!/usr/bin/env node
/**
 * B-PG-3 — پروبِ دوطرفهٔ بازیابیِ مهاجرتِ نیمه‌کاره (kill در وسطِ migrateUp).
 *
 * پنجرهٔ خرابیِ D-4: migration 012 روی میزبانِ بدونِ باینریِ psql از مسیرِ
 * pg-client اجرا می‌شود. 012 کنترلِ تراکنشِ داخلی دارد (chunk-commit copy)،
 * پس دستوراتش یکی‌یکی اجرا می‌شوند و هر کدام implicit commit می‌گیرد. اگر
 * فرآیند **دقیقاً بعد ازِ commit شدنِ swap ولی قبل از INSERT سطرِ ledger**
 * کشته شود، پایگاه داده 012 را aplic کرده ولی ledger آن را ندارد. اجرای
 * مجدد باید نگهبانِ `ALREADY_APPLIED:` خودِ 012 را ببیند و به‌جایِ اجرای
 * دوباره‌ی swapِ مخرب، سطرِ ledger را ثبت کند (status: ALREADY_APPLIED_RECOVERED).
 *
 * PROBE_LEGACY=1 درختِ pre-D-4 را بازتولید می‌کند: تشخیصِ «ازقبلًا-اعمال‌شده»
 * به usePsql گره داشت و رویِ این میزبان (psql غایب) هرگز روشن نمی‌شد، پس
 * rerun با MIGRATION_EXECUTION_FAILED FAIL می‌شود → RED.
 *
 *     node tests/b-pg-migration-midflight-kill.js              # درختِ اصلاح‌شده: exit 0
 *     PROBE_LEGACY=1 node tests/b-pg-migration-midflight-kill.js   # درختِ شکسته: exit 1
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client } = require('pg');
const {
  discoverMigrationFiles, migrateUp, getAppliedMigrations
} = require('../tools/migrate-ledger');

const LEGACY = process.env.PROBE_LEGACY === '1';
const KILL_VERSION = '012';
const PROBE_DB = 'payesh_bpg3_probe';

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: String(detail || '').slice(0, 220) });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '  — ' + results[results.length - 1].detail));
}

/* اتصالِ مدیر: اول overrideِ صریح، بعد PGURL/DATABASE_URLِ CI، بعد کلاسترِ
   محلی. همیشه روی پایگاهِ maintenance وصل می‌شود. */
function parseUrl(u) {
  const x = new URL(u);
  return {
    host: x.hostname, port: x.port || '5432',
    user: x.username, password: decodeURIComponent(x.password || '')
  };
}
const parsed = parseUrl(process.env.PAYESH_BPG_ADMIN_URL || process.env.PGURL || process.env.DATABASE_URL
  || 'postgresql://postgres:123456@127.0.0.1:5432/postgres');
const clientOpts = { host: parsed.host, port: parsed.port, user: parsed.user, password: parsed.password };

/* B-PG-3/F-2: مسیرِ pg-client را اجباری می‌کنیم. PGURL/DATABASE_URL فقط برای
 * parse کردنِ admin URL در لودِ ماژول لازم داشتیم؛ از این به بعد migrateUp و
 * getAppliedMigrations از رویِ clientهایِ صریح با database=PROBE_DB کار می‌کنند.
 * بدونِ این پاک‌سازی، روی میزبان‌هایی که psql نصب است (مثلِ runnerهای CI،
 * که PGURL را در سطحِ job تنظیم می‌کنند) مقدارِ pgUrl غیر‌خالی می‌ماند و
 * usePsql=true می‌شود — یعنی migrateUp از مسیرِ execِ psql می‌رود و wrapperِ
 * تزریقِ crash هرگز اجرا نمی‌شود و پروب به‌جایِ تست کردنِ مسیرِ D-4،
 * کاذب قرمز می‌شود. همه‌چیز از همین لحظه مشخص است. */
delete process.env.PGURL;
delete process.env.DATABASE_URL;

/* ── شبیه‌سازیِ kill سختِ فرآیند ───────────────────────────────────
 * migrateUp فقط از client.query استفاده می‌کند، پس یک wrapper کافی است.
 * wrapper همه‌چیز را پاس می‌دهد تا ورژنِ KILL_VERSION: وقتی INSERT سطرِ
 * ledgerِ آن می‌رسد، connection را واقعاً قطع می‌کند و خطا پرتاب می‌کند —
 * دقیقاً مثلِ فرآیندی که کشته شده: BEGINِ باز با connection می‌میرد و اثرِ
 * DDLِ commitشده باقی می‌ماند. */
function makeCrashClient(real) {
  return {
    query: async (sql, params) => {
      const text = String(typeof sql === 'string' ? sql : (sql && sql.text) || sql);
      if (/INSERT\s+INTO\s+schema_migrations/i.test(text) && Array.isArray(params) && params[0] === KILL_VERSION) {
        try { real.end(); } catch (_) {}
        const err = new Error('SIMULATED_KILL: backend terminated after migration ' + KILL_VERSION
          + ' DDL committed, before its ledger row was written');
        err.simulatedKill = true;
        throw err;
      }
      return real.query(text, params);
    }
  };
}

async function dropDb(admin) {
  await admin.query('DROP DATABASE IF EXISTS ' + PROBE_DB);
}

async function recreateDb() {
  const a = new Client(Object.assign({}, clientOpts, { database: 'postgres' }));
  await a.connect();
  await dropDb(a);
  await a.query('CREATE DATABASE ' + PROBE_DB);
  await a.end();
}

(async () => {
  console.log('B-PG-3 mid-migration crash-recovery probe  (PROBE_LEGACY=' + (LEGACY ? '1' : '0') + ')');

  /* F-2: قراردادِ verdictِ greppable. هر مسیرِ خروجِ زودهنگام باید خودش را
   * به‌صورتِ NOT-RUN/FAIL معرفی کند تا runner و CI هرگز نتوانند یک پروبِ
   * اجرا نشده را به‌عنوانِ سبز گزارش کنند. */
  function notRun(reason) {
    console.log('B-PG-PROBE VERDICT: NOT-RUN reason=' + String(reason).slice(0, 200));
  }

  const files = discoverMigrationFiles();
  const killFile = files.find((f) => f.version === KILL_VERSION);
  if (!killFile) {
    notRun('migration ' + KILL_VERSION + ' not found in the migrations directory');
    console.log('  SETUP FAILED: migration ' + KILL_VERSION + ' not found');
    process.exit(1);
  }

  /* پیش‌نیاز: psql روی این میزبان غایب است — وگرنه مسیرِ psql اجرا می‌شود و
     این پروب مسیرِ pg-client را تست نمی‌کند. */
  let psqlAbsent = false;
  try { require('child_process').execFileSync('psql', ['--version'], { stdio: 'ignore' }); }
  catch (e) { psqlAbsent = true; }
  /* F-2: متغیرهای URL در لودِ ماژول پاک شدند (بالا)، پس pgUrl در migrateUp
   * همیشه undefined است و usePssl رویِ هر میزبانی false می‌ماند — حتی رویِ
   * runnerهای CI که psql نصب است. این check خودِ آن راست‌آزمایی می‌کند. */
  check('precondition: pg-client split path forced (PGURL/DATABASE_URL absent from env, so usePsql stays false even where psql is installed)',
    !process.env.PGURL && !process.env.DATABASE_URL,
    (!process.env.PGURL && !process.env.DATABASE_URL) ? ''
      : 'URL env still present — the psql path could take over: PGURL=' + String(process.env.PGURL) + ' DATABASE_URL=' + String(process.env.DATABASE_URL));
  if (!psqlAbsent) {
    console.log('  note: psql IS installed on this host — harmless, the URL env is cleared so the pg-client path is forced');
  }

  /* ── SETUP: scratch DB ── */
  const admin = new Client(Object.assign({}, clientOpts, { database: 'postgres' }));
  try { await admin.connect(); }
  catch (e) {
    notRun('cannot connect to postgres maintenance db (' + e.message
      + ') — probe needs a live PostgreSQL cluster (PGURL/DATABASE_URL/PAYESH_BPG_ADMIN_URL)');
    console.log('  SETUP FAILED: cannot connect to postgres maintenance db (' + e.message + ')');
    console.log('  This probe needs a live PostgreSQL cluster (PGURL/DATABASE_URL/PAYESH_BPG_ADMIN_URL).');
    process.exit(1);
  }
  await dropDb(admin);
  await admin.query('CREATE DATABASE ' + PROBE_DB);
  await admin.end();
  /* ── کنترل: زنجیرهٔ کامل رویِ DB تازه سالم است ── */
  {
    const ctl = new Client(Object.assign({}, clientOpts, { database: PROBE_DB }));
    await ctl.connect();
    let ctlOk = false, ctlErr = '';
    try {
      const res = await migrateUp(ctl, { pgUrl: null });
      ctlOk = Array.isArray(res) && res.length === files.length && res.every((r) => r.status === 'APPLIED');
    } catch (e) { ctlErr = e.code + ': ' + e.message; }
    check('control: full migration chain applies cleanly to a fresh database (' + files.length + ' migrations)', ctlOk, ctlErr);
    await ctl.end();
    if (!ctlOk) {
      try { const a = new Client(Object.assign({}, clientOpts, { database: 'postgres' })); await a.connect(); await dropDb(a); await a.end(); } catch (_) {}
      console.log('\n  ' + results.filter((r) => r.ok).length + '/' + results.length + ' checks passed');
      console.log('B-PG-PROBE VERDICT: FAIL mode=' + (LEGACY ? 'LEGACY' : 'FIXED')
        + ' reason=control migration chain failed on a fresh database (' + ctlErr + ')');
      process.exit(1);
    }
  }

  /* ── فاز A: kill در پنجرهٔ D-4 ── */
  await recreateDb();
  console.log('\n  --- PHASE A: run migrations with a backend that dies at the ' + KILL_VERSION + ' ledger row ---');
  {
    const real = new Client(Object.assign({}, clientOpts, { database: PROBE_DB }));
    await real.connect();
    const crashed = makeCrashClient(real);
    let killHit = false, errCode = '', errMsg = '';
    try {
      await migrateUp(crashed, { pgUrl: null });
    } catch (e) {
      killHit = !!(e.simulatedKill || (e.cause && e.cause.simulatedKill));
      errCode = String(e.code || '');
      errMsg = String(e.message || '').slice(0, 140);
    }
    check('crash injected: migrateUp aborted exactly at the ' + KILL_VERSION + ' ledger INSERT',
      killHit, errCode + ' ' + errMsg);
    try { await real.end(); } catch (_) {}
  }

  /* حالتِ میانیِ جزئی را قبل از rerun تأیید می‌کنیم — این همان stateای است که
     بازیابی باید با آن روبرو شود. */
  let ledgerMissing012 = false, swapCommitted = false;
  {
    const mid = new Client(Object.assign({}, clientOpts, { database: PROBE_DB }));
    await mid.connect();
    const applied = await getAppliedMigrations(mid);
    const versions = applied.map((m) => m.version);
    ledgerMissing012 = !versions.includes(KILL_VERSION)
      && versions.filter((v) => Number(v) < Number(KILL_VERSION)).length === Number(KILL_VERSION) - 1;
    const swapRes = await mid.query("SELECT COUNT(*)::int AS n FROM pg_class WHERE relname IN ('attendance','grades') AND relkind = 'p'");
    swapCommitted = swapRes.rows.length > 0 && swapRes.rows[0].n === 2;
    check('partial state: ledger has 001..011 but NOT ' + KILL_VERSION, ledgerMissing012,
      'ledger=' + versions.join(','));
    check('partial state: ' + KILL_VERSION + ' DDL/swap actually committed (attendance+grades are partitions)', swapCommitted,
      'partitioned tables found=' + (swapRes.rows[0] ? swapRes.rows[0].n : 0));
    await mid.end();
  }

  /* ── فاز B: rerun ── */
  console.log('\n  --- PHASE B: rerun migrateUp from the partial ledger ---');
  if (!LEGACY) {
    const rerun = new Client(Object.assign({}, clientOpts, { database: PROBE_DB }));
    await rerun.connect();
    let res = null, err = '';
    try { res = await migrateUp(rerun, { pgUrl: null }); }
    catch (e) { err = (e.code || '') + ': ' + e.message; }
    check('rerun completes without re-executing the destructive swap', !err, err);

    const recovered = res && res.find((r) => r.version === KILL_VERSION);
    check('rerun records ' + KILL_VERSION + ' as ALREADY_APPLIED_RECOVERED (not APPLIED, not skipped)',
      !!(recovered && recovered.status === 'ALREADY_APPLIED_RECOVERED'),
      recovered ? 'status=' + recovered.status : 'no result row for ' + KILL_VERSION);
    check('recovered ledger row carries the migration file checksum',
      !!(recovered && recovered.checksum === killFile.checksum),
      recovered ? 'recorded=' + String(recovered.checksum).slice(0, 16) + ' file=' + killFile.checksum.slice(0, 16) : '');

    /* کل‌زنجیره در نهایت کامل و درست است */
    const applied = await getAppliedMigrations(rerun);
    const byVersion = new Map(applied.map((m) => [m.version, m]));
    const allPresent = applied.length === files.length
      && files.every((f) => byVersion.has(f.version) && byVersion.get(f.version).checksum === f.checksum);
    check('after rerun the ledger is complete: all ' + files.length + ' migrations present with matching checksums',
      allPresent, 'ledger rows=' + applied.length + ' expected=' + files.length);
    await rerun.end();
  } else {
    /* درختِ pre-D-4: تشخیصِ «ازقبلًا-اعمال‌شده» به usePsql گره داشت. روی این
       میزبان usePsql=false، پس alreadyApplied هرگز true نمی‌شد و RAISE به
       MIGRATION_EXECUTION_FAILED تبدیل می‌شد. این را با یک کپی temp از خودِ
       ابزار شبیه‌سازی می‌کنیم که فقط همان gate برگردانده شده — بقیهٔ کد
       دست‌نخورده است، پس این دقیقاً درختِ pre-D-4 رویِ این کلاس میزبان است. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'migrate-ledger.js'), 'utf8');
    const detection = /const alreadyApplied = \/ALREADY_APPLIED:\/\.test\(stderr \+ '\\n' \+ errText\);/;
    if (!detection.test(src)) {
      check('LEGACY harness: located the D-4 detection line in the runner source', false,
        'detection line not found — the tool has changed; probe harness needs updating');
    } else {
      let legacySrc = src.replace(
        detection,
        'const alreadyApplied = false; /* B-PG-3 LEGACY: pre-D-4 gate was usePsql && ..., psql absent => never recovers */'
      );
      /* کپی temp در tmpdir می‌نشیند، پس ROOT_DIRِ محاسبه‌شده از __dirname به
         جای اشتباهی اشاره می‌کند. مسیرِ واقعیِ repo را به‌جای آن می‌کاریم
         (اسلش‌روبه‌جلو — path.resolve روی ویندوز آن را می‌پذیرد). */
      const realRoot = path.resolve(__dirname, '..').split(path.sep).join('/');
      legacySrc = legacySrc.replace(
        /const ROOT_DIR = path\.resolve\(__dirname, '\.\.'\);/,
        "const ROOT_DIR = path.resolve('" + realRoot + "');"
      );
      const rootPatched = /path\.resolve\('/.test(legacySrc.split('const MIGRATIONS_DIR')[0]);
      const tmpPath = path.join(os.tmpdir(), 'payesh-bpg3-legacy-migrate-ledger-' + process.pid + '.js');
      fs.writeFileSync(tmpPath, legacySrc);
      const legacyMigrate = require(tmpPath);
      const rerun = new Client(Object.assign({}, clientOpts, { database: PROBE_DB }));
      await rerun.connect();
      let legacyErr = null;
      try { await legacyMigrate.migrateUp(rerun, { pgUrl: null }); }
      catch (e) { legacyErr = e; }
      check('LEGACY harness: located the D-4 detection line in the runner source', true, '');
      check('LEGACY red: pre-D-4 rerun FAILS on a psql-absent host (detection gate closed, RAISE propagates)',
        !!(legacyErr && /ALREADY_APPLIED/.test(String(legacyErr.message || '') + String(legacyErr.cause && legacyErr.cause.message || ''))),
        legacyErr ? legacyErr.code + ': ' + String(legacyErr.message).slice(0, 120) : 'rerun unexpectedly SUCCEEDED — the broken tree went green, probe is not load-bearing');
      await rerun.end();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      if (!rootPatched) {
        check('LEGACY harness: repointed ROOT_DIR at the real repo root in the temp copy', false,
          'ROOT_DIR replacement did not apply');
      }
    }
  }

  /* ── cleanup ── */
  try {
    const a = new Client(Object.assign({}, clientOpts, { database: 'postgres' }));
    await a.connect();
    await dropDb(a);
    await a.end();
  } catch (e) { console.log('  cleanup warning: could not drop ' + PROBE_DB + ' (' + e.message + ')'); }

  const failed = results.filter((r) => !r.ok);
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) {
    console.log('  FAILED: ' + failed.map((f) => f.name).join(' | '));
    console.log('B-PG-PROBE VERDICT: FAIL mode=' + (LEGACY ? 'LEGACY' : 'FIXED') + ' failed=' + failed.length);
    process.exit(1);
  }
  if (LEGACY) {
    /* پلاریتهٔ خروجی: درختِ شکسته باید exit≠0 بدهد تا اثباتِ RED ماشین-خوانا
       باشد. در حالتِ LEGACY سبز شدنِ چک‌ها یعنی «باگ بازتولید شد»، نه
       «پروب سالم است» — پس پیامِ توضیحی می‌آید ولی خروج همچنان ۱ می‌ماند. */
    console.log('B-PG-PROBE VERDICT: FAIL mode=LEGACY broken-tree-rerun-failure-reproduced');
    console.log('  RED ON BROKEN TREE (expected — pre-D-4 detection gate cannot recover on a psql-absent host)');
    process.exit(1);
  }
  console.log('B-PG-PROBE VERDICT: PASS mode=FIXED');
  console.log('  ALL GREEN — a mid-migration kill on the pg-client path is recovered on rerun with the correct checksum');
})().catch((e) => {
  console.error('B-PG-PROBE VERDICT: ERROR harness-crash');
  console.error('PROBE ERROR:', e.stack || e);
  process.exit(2);
});

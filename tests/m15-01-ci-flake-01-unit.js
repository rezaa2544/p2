#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/m15-01-ci-flake-01-unit.js — نگهبان‌های `CI-FLAKE-01` (M15-01)
   ───────────────────────────────────────────────────────────────────────
   چیزی که این سوئیت قفل می‌کند (سه نقصِ repo-کنترل‌شدنی که در Node.js CIِ PR
   #479 روی `7d902f33…` فعال شد — check-run `120598819123`، step 7،
   `RED suite server13-mutations`):

     U-گروه ۱ — قضاوتِ جهش (تطبیقِ مرزِ واژه، نه زیررشته)
     U-گروه ۲ — دروازهٔ آمادگیِ PostgreSQL (کرانه‌دار، fail-closed)
     U-گروه ۳ — عدم‌نشتِ رمزِ DSN در لاگ
     U-گروه ۴ — کنترل‌هایِ واقعیِ end-to-end ( subprocess ) با DSNِ مرده
     U-گروه ۵ — ضدِ بازگشت: هیچ assertionِ اصلیِ server13 حذف/تضعیف نشده

   سیاستِ شواهد: هیچ «سبزِ دروغین» در این سوئیت نیست — کنترل‌هایِ مثبت فقط
   وقتی اجرا می‌شوند که PostgreSQLِ هدف واقعاً در دسترس باشد و در همان حالت
   اگر دروازه جوابِ منفی بدهد، تست قرمز می‌شود. برچسبِ `pg=` در خروجی
   نشان می‌دهد کدام شاخه واقعاً سنجیده شده است.
   اجرا: node tests/m15-01-ci-flake-01-unit.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const {
  checkMatches, failedCheckNames, judgeMutation, parseSuiteSummary, isCrashOutput, tail
} = require('./helpers/mutation-verdict.js');
const {
  resolveTargetDbUrl, redactTarget, redactSecrets, waitForPostgres, ensureMigrated, CI_DEFAULT_DB
} = require('./helpers/live-db-readiness.js');

let pass = 0, fail = 0;
const failures = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 220) : '')); }
}
/* اجرایِ یک فرمانِ واقعی در پوسته — خروجی و کدِ بازگشت، بدونِ استثنا. */
function runSh(args, opts) {
  const o = opts || {};
  try {
    const out = execFileSync(args[0], args.slice(1), Object.assign({
      encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024
    }, o));
    return { code: 0, out: String(out || '') };
  } catch (e) {
    return { code: Number.isFinite(e.status) ? e.status : 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

const BASH = fs.existsSync('/bin/bash') ? '/bin/bash' : 'bash';

/* یک درگاهِ واقعاً بسته (bind-then-close) — برایِ کنترلِ منفیِ قطعی. */
async function closedPort() {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  await new Promise((r) => srv.close(r));
  return port;
}

(async () => {
  /* ── U1: قضاوتِ جهش ─────────────────────────────────────────────────── */
  console.log('\n■ U1 — قضاوتِ جهش با مرزِ واژه');
  const CHILD_KILL = '  ❌ T1 production + self-signed → exit(1) — code=0\n  ✅ T2 production + CA-signed → سرور بالا آمد\n';
  const CHILD_T1B_ONLY = '  ❌ T1b پیامِ خطایِ دقیق — [DB] PostgreSQL unreachable: connect ECONNREFUSED 127.0.0.1:5999\n';
  chk('U1.1 الگویِ مرزدار: T1 با «T1 production …» می‌خواند', checkMatches('T1 production + self-signed → exit(1)', 'T1') === true);
  chk('U1.2 الگوی مرزدار «T1b» را «T1» نمی‌شمارد (نقصِ زیررشته‌ایِ پیشین)', checkMatches('T1b پیامِ خطایِ دقیق', 'T1') === false);
  chk('U1.3 «T10» هم با «T1» نمی‌خواند', checkMatches('T10 something', 'T1') === false);
  chk('U1.4 استخراجِ نامِ بررسی‌هایِ قرمز', JSON.stringify(failedCheckNames(CHILD_T1B_ONLY)) === JSON.stringify(['T1b پیامِ خطایِ دقیق']), failedCheckNames(CHILD_T1B_ONLY).join('|'));
  const vKill = judgeMutation({ ok: false, out: CHILD_KILL, timedOut: false, spawnFailed: false }, 'T1', false);
  chk('U1.5 جهشِ کشته‌شده: KILLED_ON_EXPECTED_CHECK', vKill.killed === true && vKill.status === 'KILLED_ON_EXPECTED_CHECK', vKill.status);
  const vT1b = judgeMutation({ ok: false, out: CHILD_T1B_ONLY, timedOut: false, spawnFailed: false }, 'T1', false);
  chk('U1.6 قرمزیِ فقط-T1b «کشته شد» نیست (سبزِ دروغینِ پیشین بسته شد)', vT1b.killed === false && vT1b.status === 'WRONG_CHECK_FAILED', vT1b.status + ' killed=' + vT1b.killed);
  const vGreen = judgeMutation({ ok: true, out: 'server13: 9/9  ✅', timedOut: false, spawnFailed: false }, 'T1', false);
  chk('U1.7 فرزندِ سبز ⇒ جهش زنده مانده (قرمز)', vGreen.killed === false && vGreen.status === 'MUTANT_SURVIVED', vGreen.status);
  const vCrash = judgeMutation({ ok: false, out: CHILD_T1B_ONLY + 'FATAL: terminating connection due to OOM\n', timedOut: false, spawnFailed: false }, 'T1', false);
  chk('U1.8 کرش ⇒ حکمِ سبز داده نمی‌شود', vCrash.killed === false && vCrash.status === 'CHILD_CRASH' && isCrashOutput(vCrash.note || CHILD_T1B_ONLY) === true, vCrash.status);
  const vCrashOk = judgeMutation({ ok: false, out: 'FATAL\n', timedOut: false, spawnFailed: false }, 'T1', true);
  chk('U1.9 کرشِ انتظاری (crashOK) همچنان شمرده می‌شود', vCrashOk.killed === true, vCrashOk.status);
  const vEmpty = judgeMutation({ ok: false, out: '   ', timedOut: false, spawnFailed: false }, 'T1', false);
  chk('U1.10 خروجیِ خالی ⇒ «زنده ماندنِ جهش» نیست', vEmpty.killed === false && vEmpty.status === 'CHILD_EMPTY', vEmpty.status);
  const vTo = judgeMutation({ ok: false, out: 'x', timedOut: true, spawnFailed: false }, 'T1', false);
  chk('U1.11 timeoutِ فرزند ⇒ حکم ثبت نمی‌شود', vTo.killed === false && vTo.status === 'CHILD_TIMEOUT', vTo.status);
  const s9 = parseSuiteSummary('\nserver13: 9/9  ✅\n');
  chk('U1.12 خلاصهٔ سوئیت: 9/9 کامل است', s9.suite === 'server13' && s9.pass === 9 && s9.total === 9 && s9.complete === true, JSON.stringify(s9));
  const s78 = parseSuiteSummary('server13: 7/8 — شکست: T2\n');
  chk('U1.13 خلاصهٔ ناقص (7/8) کامل نیست ⇒ خطِ پایه قرمز', s78.complete === false, JSON.stringify(s78));
  const sNone = parseSuiteSummary('no summary here\n');
  chk('U1.14 خلاصهٔ نبودن ⇒ suite=null و complete=false', sNone.suite === null && sNone.complete === false, JSON.stringify(sNone));

  /* ── U3: عدم‌نشتِ رمز ────────────────────────────────────────────────── */
  console.log('\n■ U3 — قرارداد عدم‌نشتِ اعتبارنامه');
  const SECRET_DSN = 'postgres://payesh:S3CR3T-P4SSW0RD@db.internal:6432/payesh_ci';
  const red = redactTarget(SECRET_DSN);
  chk('U3.1 redactTarget فقط میزبان/درگاه/پایگاه را برمی‌گرداند', red === 'db.internal:6432/payesh_ci', red);
  chk('U3.2 رمز در خروجی نیست', red.indexOf('S3CR3T-P4SSW0RD') === -1 && tail(SECRET_DSN, 4).indexOf('S3CR3T-P4SSW0RD') === -1, tail(SECRET_DSN, 4));
  chk('U3.3 tail هر DSNِ داخلِ متن را هم سانسور می‌کند', tail('child err=' + SECRET_DSN, 3).indexOf('S3CR3T-P4SSW0RD') === -1, tail('child err=' + SECRET_DSN, 3));
  chk('U3.4 redactSecrets روی چند DSN در یک رشته', redactSecrets('a ' + SECRET_DSN + ' b postgres://x:y@h/z').indexOf('S3CR3T') === -1);
  chk('U3.5 آدرسِ بدونِ اعتبارنامه سانسور نمی‌شود (بي‌معنیِ تغییرِ دیاگنوستیک)', redactSecrets('redis://127.0.0.1:6379') === 'redis://127.0.0.1:6379');
  chk('U3.6 DSNِ غیرقابل‌تجزیه هم چیزی فاش نمی‌کند', redactTarget('not a dsn at all') === 'unparsable-target', redactTarget('not a dsn at all'));

  /* ── U2 + U4: دروازهٔ آمادگی روی هدفِ واقعاً مرده ────────────────────── */
  console.log('\n■ U2 — دروازهٔ آمادگیِ PostgreSQL (fail-closed)');
  const dead = 'postgres://payesh:deadpass@127.0.0.1:' + (await closedPort()) + '/payesh_none';
  const t0 = Date.now();
  const r0 = await waitForPostgres(dead, { budgetMs: 1200, intervalMs: 200 });
  const dur = Date.now() - t0;
  chk('U2.1 هدفِ مرده ⇒ ok:false (بدونِ skip)', r0.ok === false, JSON.stringify(r0));
  chk('U2.2 چند تلاشِ کرانه‌دار انجام شد (attempts≥2)', r0.attempts >= 2, 'attempts=' + r0.attempts);
  chk('U2.3 بودجه رعایت شد (بدونِ تعلیقِ بی‌کران)', dur >= 1000 && dur < 25000, 'ms=' + dur);
  chk('U2.4 علت در پیام هست (ECONNREFUSED)', /ECONNREFUSED|refused|closed/i.test(String(r0.last_error)), r0.last_error);
  chk('U2.5 رمزِ هدفِ مرده در نتیجه نیست', JSON.stringify(r0).indexOf('deadpass') === -1);
  const mig = await ensureMigrated(dead, { attempts: 2, retryMs: 100, timeoutMs: 15000 });
  chk('U2.6 مهاجرات روی هدفِ مرده ⇒ ok:false (خطا بلعیده نمی‌شود)', mig.ok === false && mig.attempts === 2, JSON.stringify({ ok: mig.ok, attempts: mig.attempts, last: mig.last_error }));
  chk('U2.7 بودجهٔ صفر ⇒ دقیقاً یک تلاش و قرمز', (await waitForPostgres(dead, { budgetMs: 0, intervalMs: 50 })).attempts === 1);
  chk('U2.8 هدفِ پیش‌فرضِ CI از contract بیرون نمی‌زند', CI_DEFAULT_DB.indexOf('127.0.0.1:5432/payesh_ci') > -1 && resolveTargetDbUrl({}) === CI_DEFAULT_DB, resolveTargetDbUrl({}));
  chk('U2.9 DATABASE_URL بر PGURL مقدم است', resolveTargetDbUrl({ DATABASE_URL: 'postgres://a/b', PGURL: 'postgres://c/d' }) === 'postgres://a/b');

  /* ── شاخهٔ مثبتِ واقعی: فقط اگر PostgreSQLِ هدف زنده باشد ────────────── */
  const target = resolveTargetDbUrl(process.env);
  const probe = await waitForPostgres(target, { budgetMs: 8000, intervalMs: 250 });
  if (probe.ok) {
    console.log('  · pg=REAL target=' + probe.target + ' attempts=' + probe.attempts + ' waited_ms=' + probe.waited_ms);
    chk('U2.10 (real PG) دروازه روی هدفِ سالم سبز است', probe.ok === true && probe.attempts >= 1);
    const migLive = await ensureMigrated(target, { attempts: 1, timeoutMs: 60000 });
    chk('U2.11 (real PG) مهاجرتِ خطِ پایه ok است', migLive.ok === true, JSON.stringify({ last: migLive.last_error }));
  } else {
    console.log('  · pg=ABSENT target=' + probe.target + ' last=' + probe.last_error + ' — شاخهٔ مثبتِ واقعی اجرا نشد (صورتی که PGِ هدف در این محیط نیست؛ این skip سبز محسوب نمی‌شود)');
    chk('U2.10 (no PG) دروازه روی همین محیط هم قرمزِ صادق می‌دهد', probe.ok === false, JSON.stringify(probe));
  }

  /* ── U4: کنترل‌های end-to-end با DSNِ مرده (هیچ پورتی رزرو نمی‌شود) ──── */
  console.log('\n■ U4 — کنترل‌های end-to-end (DSNِ مرده)');
  const childEnv = Object.assign({}, process.env, {
    DATABASE_URL: dead, PGURL: dead, S13_PG_WAIT_MS: '600', S13_PG_INTERVAL_MS: '200'
  });
  let base = null;
  try {
    base = { code: 0, out: execFileSync(process.execPath, ['tests/server13.js'], { cwd: ROOT, env: childEnv, timeout: 180000, maxBuffer: 16 * 1024 * 1024 }).toString() };
  } catch (e) {
    base = { code: Number.isFinite(e.status) ? e.status : 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
  chk('U4.1 server13 روی PGِ مرده ⇒ exit 1 (هیچ سبزی از نبودِ وابستگی درنمی‌آید)', base.code === 1, 'exit=' + base.code);
  chk('U4.2 علت به‌صورتِ ENVIRONMENT برچسب می‌خورد', /ENVIRONMENT — PostgreSQL unreachable/.test(base.out), tail(base.out, 3));
  chk('U4.3 پیامِ گمراه‌کنندهٔ «T2 سرور بالا نیامد» تولید نمی‌شود', /❌ T2 production/.test(base.out) === false, tail(base.out, 3));
  chk('U4.4 رمز در خروجی نیست', base.out.indexOf('deadpass') === -1);

  let mut = null;
  try {
    mut = { code: 0, out: execFileSync(process.execPath, ['tests/server13-mutations.js'], { cwd: ROOT, env: childEnv, timeout: 240000, maxBuffer: 16 * 1024 * 1024 }).toString() };
  } catch (e) {
    mut = { code: Number.isFinite(e.status) ? e.status : 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
  chk('U4.5 هارنس روی PGِ مرده ⇒ exit 1', mut.code === 1, 'exit=' + mut.code);
  chk('U4.6 هارنس BASELINE-RED را اعلام می‌کند (نه استثنایِ باز)', /BASELINE-RED/.test(mut.out), tail(mut.out, 4));
  chk('U4.7 دمپِ خامِ Buffer در لاگ نیست (نقصِ پیشین)', /Buffer\(\d+\)\s*\[Uint8Array\]/.test(mut.out) === false, tail(mut.out, 2));
  chk('U4.8 جهش «کشته شد» اعلام نمی‌شود (ضدِ سبزِ دروغین)', /کشته شد/.test(mut.out) === false, tail(mut.out, 3));
  chk('U4.9 هارنس پیش ازِ جهش متوقف می‌شود', /پیش‌سنجیِ خطِ پایه/.test(mut.out) === true && /M1 fail-fast/.test(mut.out) === false, tail(mut.out, 3));

  /* ── U5: ضدِ بازگشت — ساختارِ سوئیت‌های هدف ─────────────────────────── */
  console.log('\n■ U5 — ضدِ بازگشت (حذف/تضعیفِ assertion‌ها)');
  const s13 = fs.readFileSync(path.join(ROOT, 'tests/server13.js'), 'utf8');
  const mutSrc = fs.readFileSync(path.join(ROOT, 'tests/server13-mutations.js'), 'utf8');
  for (const name of [
    'P0 گواهی‌های تست ساخته شد', 'T1 production + self-signed → exit(1)', 'T1b پیامِ خطایِ دقیق',
    'T2 production + CA-signed → سرور بالا آمد', 'T2b health روی https سالم است',
    'T3 development + self-signed → سرور بالا آمد', 'T3b health روی https سالم است',
    'T4 production + گواهیِ خراب → exit(1)', 'T4b پیامِ «cert unreadable»'
  ]) {
    chk('U5 هر ۹ assertion حفظ شد: ' + name, s13.includes("chk('" + name), name);
  }
  chk('U5.10 خطِ پایه پیش ازِ هر جهش سنجیده می‌شود', mutSrc.includes('پیش‌سنجیِ خطِ پایه') && mutSrc.indexOf('baseline-pre') < mutSrc.indexOf('for (const m of MUTS)'));
  chk('U5.11 execFileSyncِ لخت در هارنس باقی نمانده', /execFileSync\(/.test(mutSrc) === false);
  chk('U5.12 دروازه به helper وصل است (نه کپیِ محلی)', s13.includes("require('./helpers/live-db-readiness.js')") && s13.includes('waitForPostgres(') && s13.includes('ensureMigrated('));
  chk('U5.13 بودجهٔ انتظار پیش‌فرض کرانه‌دار است', /S13_PG_WAIT_MS \?\? 90000/.test(s13));
  chk('U5.14 هیچ skip/safe-skip در دو سوئیت اضافه نشده', /process\.exit\(0\)|\|\|\s*true/.test(s13 + mutSrc) === false);

  /* ── U6: هارنسِ lane — `pg_wait_if_expected` در scripts/run-all-tests.sh ──
     تابع واقعی از خودِ اسکریپت استخراج و در یک پوستهٔ تمیز اجرا می‌شود؛ هیچ
     چیزی fake نمی‌شود: اگر `psql` در PATH نباشد، شاخهٔ degradationِ مستند
     سنجیده می‌شود و شاخهِٔ «منتظر بمان» فقط با psqlِ واقعی اجرا می‌شود (CI
     postgresql-client دارد). */
  console.log('\n■ U6 — دروازهٔ آمادگیِ lane در scripts/run-all-tests.sh');
  const sh = fs.readFileSync(path.join(ROOT, 'scripts/run-all-tests.sh'), 'utf8');
  const fnBlock = /^pg_wait_if_expected\(\)[\s\S]*?^\}$/m.exec(sh);
  chk('U6.1 تابع دروازه در اسکریپت تعریف شده', !!fnBlock, 'not found');
  chk('U6.2 دروازه پیش از اجرای سوئیت در run_one صدا زده می‌شود', /run_one\(\)[\s\S]{0,220}pg_wait_if_expected/.test(sh));
  chk('U6.3 دروازه در run_copy (lane جهش/کپی) هم صدا زده می‌شود', /run_copy\(\)[\s\S]{0,600}pg_wait_if_expected/.test(sh));
  chk('U6.4 تابع به xargs subshell صادر می‌شود', /export -f[^\n]*pg_wait_if_expected/.test(sh));
  chk('U6.5 بودجهٔ انتظار کرانه‌دار است (۴۰ × ۰٫۵ ثانیه)', /-lt 40/.test(fnBlock ? fnBlock[0] : '') && /sleep 0\.5/.test(fnBlock ? fnBlock[0] : ''));
  chk('U6.6 کرانه‌بندی با skip تمام نمی‌شود (متن FAIL CLOSED)', /FAIL CLOSED \(no skip, no fake green\)/.test(fnBlock ? fnBlock[0] : ''));
  if (fnBlock) {
    const tmpHarness = path.join(require('os').tmpdir(), 'ci-flake-01-lane-harness.sh');
    fs.writeFileSync(tmpHarness, '#!/bin/bash\nset -u\nOUT="' + tmpHarness + '.out"\n: > "$OUT"\n' + fnBlock[0] + '\n"$@"\n', { mode: 0o755 });
    const deadUrl = 'postgres://payesh:deadpass@127.0.0.1:' + (await closedPort()) + '/payesh_none';
    /* هر سناریو کرانهٔ خود را *صریح* تنظیم می‌کند. این دقیقاً همان نقصی است که
       در CI ما را قرمز کرد: run-all-tests.sh با `export WAVE23_REQUIRE_PG=1`
       بالا می‌آید و آن را به همهٔ سوئیت‌ها می‌دهد؛ «سناریوی خنثی» که ارثی بسازد،
       روی ماشینِ دارای psql (CI postgresql-client دارد) به انتظارِ ۲۰ ثانیه‌ای
       می‌نشست و ادعای «فوراً رد می‌شود» را می‌شکست. پس صریحاً خنثی، و صریحاً
       مسلح — هیچ ارثی از محیطِ والد نه. */
    const laneBase = Object.assign({}, process.env, { WAVE23_REQUIRE_PG: '0', LIVE_PG_URL: deadUrl });
    const t1 = Date.now();
    const disarmed = runSh([BASH, tmpHarness, 'pg_wait_if_expected', 'disarmed'], { env: laneBase });
    const disarmedMs = Date.now() - t1;
    chk('U6.7 بدونِ PGِ انتظاری ⇒ فوراً رد می‌شود (ماشینِ PG-less هزینه نمی‌دهد)', disarmed.code === 0 && disarmedMs < 4000, 'ms=' + disarmedMs + ' out=' + disarmed.out.slice(0, 120));
    const noPsql = runSh([BASH, tmpHarness, 'pg_wait_if_expected', 'nopsql'], {
      env: Object.assign({}, laneBase, { WAVE23_REQUIRE_PG: '1', PATH: '/nonexistent-bin' })
    });
    chk('U6.8 psqlِ در دسترس نبود ⇒ مسیرِ degradation بدونِ تعلیق (exit 0)', noPsql.code === 0 && noPsql.out.indexOf('FAIL CLOSED') === -1, 'code=' + noPsql.code);
    /* ابزارِ psql: اولِ binaryِ واقعیِ سیستم؛ اگر نبود، shimِ خودِ مخزن
       (tools/bin/psql → tools/psql-min.js) که یک کلاینتِ واقعیِ PG است. هیچ
       پاسخِ ساختگی‌ای در کار نیست: هر دو مسیر به یک PostgreSQLِ واقعی کوئری
       می‌زنند یا صادقاً NOT-RUN می‌دهند. */
    const shimEnv = Object.assign({}, laneBase, {
      PATH: path.join(ROOT, 'tools', 'bin') + path.delimiter + String(process.env.PATH || ''),
      NODE_PATH: [path.join(ROOT, 'node_modules'), String(process.env.NODE_PATH || '')].filter(Boolean).join(path.delimiter)
    });
    const hasPsql = runSh([BASH, '-c', 'command -v psql >/dev/null 2>&1'], { env: shimEnv }).code === 0;
    {
      /* شکلِ CI: psql حل می‌شود (binaryِ سیستم یا shimِ مخزن) ولی دروازه خنثی است
         ⇒ باید همان‌جا برگردد؛ این سنجشِ مستقیمِ همان حالتی است که CI را قرمز کرد. */
      const t1b = Date.now();
      const disarmedPsql = runSh([BASH, tmpHarness, 'pg_wait_if_expected', 'disarmed-psql'], { env: shimEnv });
      const disarmedPsqlMs = Date.now() - t1b;
      chk('U6.7b خنثی + psqlِ قابل‌حل ⇒ همچنان بدونِ هزینه (صریحِ WAVE23_REQUIRE_PG=0)',
        disarmedPsql.code === 0 && disarmedPsqlMs < 4000,
        'psql=' + (hasPsql ? 'present' : 'absent') + ' ms=' + disarmedPsqlMs + ' code=' + disarmedPsql.code);
    }
    if (hasPsql) {
      const t2 = Date.now();
      const armed = runSh([BASH, tmpHarness, 'pg_wait_if_expected', 'armed'], {
        env: Object.assign({}, shimEnv, { WAVE23_REQUIRE_PG: '1', LIVE_PG_URL: deadUrl })
      });
      const armedMs = Date.now() - t2;
      const logged = fs.readFileSync(tmpHarness + '.out', 'utf8');
      chk('U6.9 armed + PGِ مرده ⇒ انتظارِ کرانه‌دار (۱۵≤ثانیه≤۴۵)', armed.code === 0 && armedMs >= 15000 && armedMs <= 45000, 'ms=' + armedMs);
      chk('U6.10 لاگ، کرانه‌بندی را صادق اعلام می‌کند (بدونِ سبز/بدونِ skip)', /FAIL CLOSED \(no skip, no fake green\)/.test(logged), logged.slice(-200));
      chk('U6.11 رمز در لاگِ lane نیست', logged.indexOf('deadpass') === -1, logged.slice(-120));
    } else {
      console.log('  · psql=ABSENT (نه binaryِ سیستم، نه shim) — شاخهٔ U6.9..U6.11 در این محیط سنجیده نشد؛ CI با postgresql-client می‌سنجد. این skip سبز محسوب نمی‌شود.');
    }
    try { fs.rmSync(tmpHarness, { force: true }); fs.rmSync(tmpHarness + '.out', { force: true }); } catch (e) { /* پاک‌سازیِ best-effort */ }
  }

  console.log('\nنتیجه: ' + pass + '/' + (pass + fail) + (fail ? ' — شکست: ' + failures.join(' | ') : '  ✅'));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   chaos-drill-disk-pressure.js — سناریوی S6: فشارِ دیسک → شکستِ نوشت → تخریبِ مهربان

   تزریقِ واقعی (نه شبیه‌سازیِ منطقی): دیتادایرکتوریِ PG + فایلِ استور + لاگِ آدیت
   روی یک tmpfs با اندازهٔ محدود نصب می‌شوند و با fallocate تا ~۱MB آزادِ باقی‌مانده
   پر می‌شوند ⇒ نوشتِ WAL/فایل با ENOSPC شکست می‌خورد.

   ادعاهای سنجیده:
     write error rate   : نرخِ شکستِ نوشت زیرِ فشارِ دیسک (بدونِ ۲۰۰ جعلی)
     graceful degrade   : liveness زنده، امتناعِ صریح، بدونِ سقوط/کرشِ پروسه
     read-only function : خوانش‌ها تا حدِ امکان پاسخ می‌دهند (بدونِ دادهٔ جعلی)
     no corruption      : پس از آزادکردنِ فضا: دادهٔ پیش‌از‌فشار دست‌نخورده، بدونِ ردیفِ فانتوم

   اجرا: timeout 150 node tests/chaos-drill-disk-pressure.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const L = require('./chaos-drill-lib');

const T = { auditGrowthUnderPressure: null, apiAliveUnderPressure: null, crashEvidence: null, freeBeforeKb: null, freeAfterKb: null, writeErrorRate: null, recoverMs: null, pgRestarted: null, driverDuringPressure: null };
const rows = [];

(async () => {
  /* پیش‌نیازِ این سناریو: امکانِ نصبِ tmpfs با اندازهٔ محدود. نبودِ آن = NOT-RUN (exit 2)، نه سبز. */
  if (!L.canMountTmpfs()) L.notRun('نصبِ tmpfs ممکن نیست (نیازمندِ sudo/امتیازِ mount) — تزریقِ ENOSPC در دسترس نیست');
  const infra = await L.Infra.start({ disk: { mount: true, sizeMb: 96 } });
  infra.seedPg(['schools', 'classes', 'users', 'preapps']);
  let api = await L.startApi({ infra });
  const st = infra.store();
  const mgr = st.users.find((u) => u.role === 'manager' && u.school_id === 1);
  const lg = await L.loginAs(api.port, mgr);
  L.check(rows, 'setup: لاگینِ مدیر روی زیرساختِ دیسک‌محدود', lg.ok, 'login=' + lg.login.status);

  /* ── پایه ────────────────────────────────────────────────────── */
  const baseline = [];
  for (let i = 0; i < 3; i++) {
    const w = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's6-base-' + i, stage: 'contact' } });
    if (w.acked) baseline.push('s6-base-' + i);
  }
  T.freeBeforeKb = infra.diskFreeKb();
  L.check(rows, 'baseline: ۳ نوشتِ ack‌شده پیش از فشارِ دیسک', baseline.length === 3 && infra.psql("SELECT count(*) FROM preapps WHERE name LIKE 's6-base-%'") === '3',
    'free_kb=' + T.freeBeforeKb + ' pg_rows=' + infra.psql("SELECT count(*) FROM preapps WHERE name LIKE 's6-base-%'"));

  /* ── تزریق: پر کردنِ دیسک تا شکستِ واقعیِ WAL ───────────────── */
  let enospcLine = '';
  let freeKb = null;
  for (const target of [2048, 1024, 512]) {
    const fill = infra.fillDiskToFreeKb(target);
    freeKb = fill.freeKb;
    /* فشارِ واقعی: سوئیچِ قطعهٔ WAL + نوشتِ بزرگ — تا موتور ENOSPC بدهد */
    const sw = infra.psql('SELECT pg_switch_wal()');   /* قطعهٔ WALِ تازه = ۱۶MB ⇒ زیرِ ~۱MB آزاد باید ENOSPC بدهد */
    const ping = infra.psql('SELECT 1');
    const candidate = [sw].find((x) => x.startsWith('ERR:'));
    if (candidate && /space left|ENOSPC|disk full/i.test(candidate)) { enospcLine = candidate.slice(0, 170); break; }
    if (candidate && ping.startsWith('ERR:')) { enospcLine = candidate.slice(0, 170); break; }
  }
  T.freeAfterKb = freeKb;
  L.check(rows, 'inject: دیسک تا آستانهٔ ENOSPC پر شد (شاهدِ df، نه ادعا)',
    freeKb !== null && freeKb < 8192, 'free_before=' + T.freeBeforeKb + 'KB free_under_pressure=' + freeKb + 'KB');
  /* رفع دور مرج (#185): وقتی خودِ backendِ psql با PANIC می‌میرد، stderrِ
     کلاینت فقط «server closed the connection» می‌گوید و ENOSPC *در لاگِ
     موتور* است (PANIC: could not write ... No space left on device).
     شاهدِ معتبر = کلاینت **یا** لاگِ PG — هر دو evidence واقعی‌اند. */
  if (!/space left|ENOSPC|disk full/i.test(enospcLine)) {
    try {
      const lg = fs.readFileSync(infra.pgLog, 'utf8').split('\n')
        .find((l) => /No space left|ENOSPC|disk full/i.test(l));
      if (lg) enospcLine = ('PG-LOG: ' + lg).slice(0, 170);
    } catch (e) { /* لاگ در دسترس نیست — همان شاهد کلاینتی می‌ماند */ }
  }
  console.log('[evidence] خطای موتورِ PG زیرِ فشار: ' + (enospcLine || 'بدونِ ENOSPC'));
  L.check(rows, 'inject: فشارِ دیسک واقعاً PG را به شکستِ نوشت رساند (شاهدِ خطای موتور — کلاینت یا لاگ)',
    /space left|ENOSPC|disk full/i.test(enospcLine), enospcLine.slice(0, 150) || 'ENOSPC رخ نداد ⇒ NOT-REACHED');

  /* ── در دورهٔ فشار: نوشت‌های API ───────────────────────────── */
  const attempts = [];
  for (let i = 0; i < 6; i++) {
    const w = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's6-pressure-api-' + i, stage: 'contact' } });
    attempts.push(w);
  }
  const acked = attempts.filter((a) => a.acked || a.status === 200).length;
  T.writeErrorRate = (attempts.length - acked) / attempts.length;
  await L.sleep(600);
  const pressureRows = infra.psql("SELECT count(*) FROM preapps WHERE name LIKE 's6-pressure-api-%'");
  const pgReachable = !pressureRows.startsWith('ERR:');
  T.driverDuringPressure = ((await L.readiness(api.port)).json || {}).db;
  const durableOk = pgReachable ? Number(pressureRows) === acked : acked === 0;
  L.check(rows, 'graceful: زیرِ فشار یا ack نمی‌دهد (fail-closed) یا ack را durable می‌کند — بدونِ ۲۰۰ جعلی',
    durableOk,
    'write_error_rate=' + (T.writeErrorRate * 100).toFixed(0) + '% statuses=' + attempts.map((a) => a.status).join(',') +
    ' acked=' + acked + ' pg_reachable=' + pgReachable + ' pg_rows=' + pressureRows + ' driver=' + JSON.stringify(T.driverDuringPressure));

  const lv = await L.liveness(api.port);
  const rd = await L.readiness(api.port);
  const health = await L.health(api.port);
  T.apiAliveUnderPressure = lv.status === 200;
  if (!T.apiAliveUnderPressure) {
    const crash = api.logs().split('\n').filter((l) => /ENOSPC|No space|uncaught|Unhandled|Error:|exception|EACCES/i.test(l)).slice(-4);
    T.crashEvidence = crash.join(' || ').slice(0, 300);
    console.log('[finding] پروسهٔ API زیرِ فشارِ دیسک از دست رفت (liveness=' + lv.status + ') — شاهدِ لاگ: ' + (T.crashEvidence || 'لاگ خالی/بی‌پیام'));
  }
  L.check(rows, 'graceful: پروسه زیرِ فشارِ دیسک زنده می‌ماند و امتناعِ صریح می‌دهد (نه سقوط)',
    lv.status === 200 && [200, 503].includes(rd.status),
    'liveness=' + lv.status + ' readiness=' + rd.status + ' health=' + health.status + ' | پروسه_مرده=' + !T.apiAliveUnderPressure);
  L.check(rows, 'graceful: /api/health زیرِ فشار در دسترسِ اپراتور می‌ماند (ابزارِ پایش از کار نمی‌افتد)',
    health.status === 200, 'status=' + health.status);

  const storeParse = (() => { try { const j = JSON.parse(fs.readFileSync(infra.storeFile, 'utf8')); return !!j.users; } catch (e) { return false; } })();
  L.check(rows, 'no corruption: فایلِ استور زیرِ فشارِ دیسک هم JSONِ سالم است', storeParse, 'store_parseable=' + storeParse + ' bytes=' + (fs.existsSync(infra.storeFile) ? fs.statSync(infra.storeFile).size : 0));

  /* آدیت زیرِ فشارِ دیسک: رشدِ فایل و شمارِ رویدادها (شاهدِ کمّیِ از‌دست‌رفتنِ بی‌صدا) */
  const auditBefore = fs.existsSync(infra.auditFile) ? fs.statSync(infra.auditFile).size : 0;
  await L.httpReq(api.port, 'GET', '/api/health', null, { timeoutMs: 5000 });
  await L.httpReq(api.port, 'GET', '/api/health', null, { timeoutMs: 5000 });
  await L.sleep(300);
  const auditAfter = fs.existsSync(infra.auditFile) ? fs.statSync(infra.auditFile).size : 0;
  T.auditGrowthUnderPressure = auditAfter - auditBefore;
  console.log('[evidence] رشدِ فایلِ آدیت در دورهٔ فشارِ دیسک: ' + T.auditGrowthUnderPressure + ' بایت پس از ۲ درخواستِ آدیت‌دار ⇒ ' + (T.auditGrowthUnderPressure === 0 ? 'رویدادها بی‌صدا از دست می‌روند (فایلِ آدیت روی همان دیسکِ پر است)' : 'آدیت نوشته شد'));
  const enospc = (api.logs().match(/ENOSPC|No space left/g) || []).length;
  console.log('[evidence] خطوطِ ENOSPC در لاگِ اپلیکیشن: ' + enospc + ' | خطِ لاگ: ' + (api.logs().split('\n').filter((l) => /ENOSPC|No space/.test(l)).slice(0, 2).join(' || ').slice(0, 300)));

  /* ── بازیابی: آزادکردنِ فضا ─────────────────────────────────── */
  const freed = infra.clearDiskFiller();
  L.check(rows, 'recover: فضا آزاد شد (شاهدِ df)', freed !== null && freed > T.freeAfterKb, 'free_kb=' + freed + ' (بود ' + T.freeAfterKb + ')');

  const tUp = Date.now();
  const pgOk = await L.until(async () => !infra.psql('SELECT 1').startsWith('ERR:'), { timeoutMs: 20000, stepMs: 250, label: 'pg-writable' });
  if (!pgOk.ok && !infra.pgRunning()) { infra.pgStart(); T.pgRestarted = true; }
  else T.pgRestarted = false;
  /* اگر پروسهٔ API زیرِ فشار مرده، اپراتور آن را دوباره بالا می‌آورد */
  if (!T.apiAliveUnderPressure) {
    api.stop();
    api = await L.startApi({ infra });
    L.check(rows, 'recover: پروسهٔ API پس از آزادسازیِ فضا دوباره بالا آمد', true, 'port=' + api.port + ' pid=' + api.pid);
  }
  const rec = await L.until(async () => {
    const r = await L.readiness(api.port, 3000);
    return r.status === 200 && r.json && r.json.status === 'ready' && r.json.db && r.json.db.driver === 'postgres';
  }, { timeoutMs: 60000, stepMs: 250, label: 'readiness-postgres' });
  T.recoverMs = Date.now() - tUp;
  L.check(rows, 'recover: زیرساخت به حالتِ سالم برگشت و درایور به postgres برگشت (نه صرفاً «سبز»)',
    rec.ok, 'time_to_recover=' + T.recoverMs + 'ms pg_restarted=' + T.pgRestarted +
    ' | driver_now=' + JSON.stringify((((await L.readiness(api.port)).json) || {}).db));

  let firstAck = null, tries = 0;
  while (tries < 12 && !firstAck) {
    tries++;
    const w = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's6-recover-probe', stage: 'contact' }, uid: 's6-recover-probe-' + tries });
    if (w.acked) firstAck = w; else await L.sleep(300);
  }
  L.check(rows, 'recover: اولین نوشتِ موفق پس از آزادسازیِ فضا سنجیده شد', !!firstAck, 'attempts=' + tries + ' ms=' + (firstAck && firstAck.ms));

  /* ── یکپارچگی ───────────────────────────────────────────────── */
  const baseStill = infra.psql("SELECT count(*) FROM preapps WHERE name LIKE 's6-base-%'");
  L.check(rows, 'no corruption: هر ۳ ردیفِ پیش‌از‌فشار دست‌نخورده در PG باقی مانده‌اند', baseStill === '3', 'rows=' + baseStill);

  const phantom = infra.psql("SELECT count(*) FROM preapps WHERE name LIKE 's6-pressure-api-%'");
  const phantomAcked = attempts.filter((a) => a.acked || a.status === 200).length;
  L.check(rows, 'no corruption: هیچ ردیفِ فانتومی از تلاش‌های ناموفق ثبت نشد (ردیف‌ها = تعدادِ ack‌شده)',
    !phantom.startsWith('ERR:') && Number(phantom) === phantomAcked,
    'pressure_rows=' + phantom + ' acked_during_pressure=' + phantomAcked);

  const dupes = infra.psql("SELECT count(*) FROM (SELECT name, count(*) c FROM preapps WHERE name LIKE 's6-%' GROUP BY name HAVING count(*) > 1) t");
  L.check(rows, 'no duplicates: هیچ نامِ تکراری پس از بازیابی', dupes === '0', 'dup=' + dupes);

  const acc = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's6-ack-after', stage: 'contact' } });
  const accRows = infra.psql("SELECT count(*) FROM preapps WHERE name='s6-ack-after'");
  const accDriver = (((await L.readiness(api.port)).json) || {}).db;
  L.check(rows, 'durability: نوشتِ ack‌شدهٔ پس از بازیابی واقعاً در PG هست',
    acc.acked && accRows === '1',
    'status=' + acc.status + ' acked=' + acc.acked + ' pg_rows=' + accRows + ' driver=' + JSON.stringify(accDriver));

  const x = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 2, name: 's6-crosstenant', stage: 'contact' } });
  L.check(rows, 'tenant isolation (پس از فشارِ دیسک): school_id=2 با کوکیِ مدیرِ school 1 = 403', x.status === 403, 'status=' + x.status);

  const pgLogTail = (() => { try { return fs.readFileSync(infra.pgLog, 'utf8').split('\n').filter((l) => /space left|PANIC|shutting down|recovery/i.test(l)).slice(0, 3).join(' || ').slice(0, 320); } catch (e) { return ''; } })();
  console.log('[evidence] لاگِ PG (فضا/PANIC/bازیابی): ' + (pgLogTail || 'بدونِ نشانه'));

  api.stop(); infra.stop();
  L.report('S6-disk-pressure', rows, T,
    'free_before=' + T.freeBeforeKb + 'KB | free_under_pressure=' + T.freeAfterKb + 'KB | write_error_rate=' + (T.writeErrorRate * 100).toFixed(0) + '% | recover=' + T.recoverMs + 'ms | pg_restarted=' + T.pgRestarted);
})().catch((e) => { console.error('DRILL ERROR: ' + (e && e.message)); process.exit(3); });

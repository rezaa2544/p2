#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   chaos-drill-pg-outage.js — سناریوی S3: قطعِ PostgreSQL → بازیابیِ اتصال
   (نسخهٔ سخت‌گیرانه: پنجرهٔ قطع کوتاه کافی نیست — «فالبکِ بی‌صدا» هم سنجیده می‌شود)

   چرا سخت‌گیرانه: در اجرای اول معلوم شد پس از ~۱۰s قطع، pool.on('error') →
   scheduleReconnect (تایمر ۱۰s) → init() → شکستِ اتصال ⇒ isPgActive=false و
   درایور به «memory» می‌افتد: readiness دوباره ۲۰۰ می‌شود و نوشت‌ها روی
   استورِ محلی ack می‌شوند. پس فقط سنجشِ لحظهٔ اول، سبزِ گمراه‌کننده است.

   اندازه‌گیری‌ها:
     fail_closed_window : چند ms رفتارِ درستِ ۵۰۳ دوام کرد
     flip_at            : لحظهٔ سقوطِ درایور به memory (fail-open)
     false_ack_count    : نوشت‌هایی که در پنجرهٔ memory با ۲۰۰ ack شدند
     lost_after_recover : از آن‌ها چند تا پس از بازگشتِ PG در PG هستند (انتظار: همه)
     time_to_recover    : تا بازگشتِ درایور به postgres + اولین ackِ سالم

   اجرا: timeout 150 node tests/chaos-drill-pg-outage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./chaos-drill-lib');

const T = { detect503: null, failClosedWindow: null, flipAt: null, falseAcks: 0, lostAfterRecover: null, recover: null, retriesToRecover: null };
const rows = [];
const root = (p) => path.join(__dirname, '..', p);

(async () => {
  const infra = await L.Infra.start();
  infra.seedPg(['schools', 'classes', 'users', 'preapps']);
  const api = await L.startApi({ infra });
  const st = infra.store();
  const mgr = st.users.find((u) => u.role === 'manager' && u.school_id === 1);
  const lg = await L.loginAs(api.port, mgr);
  L.check(rows, 'setup: لاگینِ مدیر (PG-live)', lg.ok, 'login=' + lg.login.status);

  /* ── پایه ────────────────────────────────────────────────────── */
  const wBase = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's3-base', stage: 'contact' } });
  L.check(rows, 'baseline: نوشت ack شد و در PG هست',
    wBase.acked && infra.psql("SELECT count(*) FROM preapps WHERE name='s3-base'") === '1',
    'status=' + wBase.status + ' driver=' + ((await L.readiness(api.port)).json || {}).db.driver);

  /* ── تزریق: توقفِ واقعیِ PG ─────────────────────────────────── */
  const tStop = Date.now();
  infra.pgStop('fast');
  const dead = await L.until(async () => infra.psql('SELECT 1').startsWith('ERR:'), { timeoutMs: 10000, stepMs: 25, label: 'pg-dead' });
  L.check(rows, 'inject: PG واقعاً متوقف شد (SELECT 1 خطا)', dead.ok, 'after=' + dead.ms + 'ms');

  /* ── تشخیص: ۵۰۳ در پنجرهٔ اول ──────────────────────────────── */
  const det = await L.until(async () => { const r = await L.readiness(api.port, 3000); return r.status === 503; }, { timeoutMs: 20000, stepMs: 25, label: 'readiness-503' });
  T.detect503 = det.ok ? det.ms : null;
  L.check(rows, 'detect: readiness=503 با db.alive=false در پنجرهٔ اولِ قطع', det.ok, 'time_to_detect=' + det.ms + 'ms');

  /* ── پنجرهٔ دوامِ fail-closed: تا ۲۵ ثانیه پایش ─────────────── */
  let flip = null, lastStatus = 503;
  const timeline = [];
  for (let i = 0; i < 125 && !flip; i++) {
    const r = await L.readiness(api.port, 2500);
    const drv = r.json && r.json.db && r.json.db.driver;
    if (i % 20 === 0) timeline.push(((Date.now() - tStop) / 1000).toFixed(1) + 's:' + r.status + '/' + drv);
    if (r.status === 200 || drv === 'memory') flip = { ms: Date.now() - tStop, status: r.status, driver: drv, body: r.json };
    lastStatus = r.status;
    await L.sleep(200);
  }
  T.flipAt = flip ? flip.ms : null;
  T.failClosedWindow = flip ? flip.ms : (Date.now() - tStop);
  console.log('[timeline] ' + timeline.join(' | ') + (flip ? ' | FLIP@' + flip.ms + 'ms status=' + flip.status + ' driver=' + flip.driver : ' | بدونِ flip در ۲۵s'));

  L.check(rows, 'fail-closed: رفتارِ ۵۰۳ در طولِ کلِ قطعِ PG پایدار ماند (بدونِ fail-open)',
    !flip, 'fail_closed_window=' + T.failClosedWindow + 'ms' + (flip ? ' | سپس status=' + flip.status + ' driver=' + flip.driver : ''));
  if (flip) {
    console.log('[finding] fail-open: پس از ' + flip.ms + 'ms readiness به ' + flip.status + ' با driver=' + flip.driver + ' برگشت — بدنه: ' + JSON.stringify(flip.body));
    L.check(rows, 'fail-open: وقتی درایور memory می‌شود، readiness باید آمادگی را انکار کند (وگرنه LB ترافیک می‌فرستد)',
      false, 'driver=memory + status=' + flip.status + ' ⇒ چراغِ سبزِ دروغ');
  }

  /* ── در پنجرهٔ memory: نوشت‌ها ack می‌شوند؟ ────────────────── */
  const falseAcks = [];
  for (let i = 0; i < 3; i++) {
    const w = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's3-mem-' + i, stage: 'contact' } });
    falseAcks.push({ name: 's3-mem-' + i, uid: w.op.uid, status: w.status, acked: w.acked });
  }
  T.falseAcks = falseAcks.filter((a) => a.acked).length;
  L.check(rows, 'outage: نوشت در قطعِ PG ackِ موفق نمی‌گیرد (fail-closed در کلِ پنجرهٔ قطع)',
    T.falseAcks === 0, 'acked=' + T.falseAcks + '/3 statuses=' + falseAcks.map((a) => a.status).join(','));

  const storeLeak = (infra.store().preapps || []).filter((p) => String(p.name).startsWith('s3-mem-')).length;
  L.check(rows, 'rollback: هیچ نوشتِ جزئی در فایلِ استور نماند (no partial writes)', storeLeak === 0, 'leaked_rows=' + storeLeak);

  const connErr = (api.logs().match(/ECONNREFUSED|terminating connection|shutting down/g) || []).length;
  const logFlip = /Falling back to JSON in-memory store/.test(api.logs());
  L.check(rows, 'evidence: لاگ خطای واقعیِ اتصالِ PG را نشان می‌دهد', connErr > 0, 'connection_error_lines=' + connErr + ' | memory_fallback_logged=' + logFlip);

  /* ── بازیابی ────────────────────────────────────────────────── */
  const tUp = Date.now();
  infra.pgStart();
  const rec = await L.until(async () => { const r = await L.readiness(api.port, 3000); return r.status === 200 && r.json && r.json.status === 'ready' && r.json.db.driver === 'postgres'; },
    { timeoutMs: 40000, stepMs: 50, label: 'readiness-postgres' });
  T.recover = rec.ok ? rec.ms : (Date.now() - tUp);
  L.check(rows, 'recover: درایور و readiness به postgres/ready برگشتند', rec.ok, 'time_to_recover=' + T.recover + 'ms (از لحظهٔ start)');

  let tries = 0, firstOk = null;
  while (tries < 10 && !firstOk) {
    tries++;
    const w = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's3-recover-probe', stage: 'contact' }, uid: 's3-recover-probe-' + tries });
    if (w.acked) firstOk = w; else await L.sleep(200);
  }
  T.retriesToRecover = tries;
  L.check(rows, 'recover: اولین نوشتِ موفقِ پس از بازگشت سنجیده شد', !!firstOk, 'attempts_to_first_ack=' + tries + ' ms=' + (firstOk && firstOk.ms));

  /* ── یکپارچگی: سرنوشتِ ack‌های پنجرهٔ memory ──────────────── */
  const inPg = falseAcks.map((a) => ({ name: a.name, acked: a.acked, rows: infra.psql("SELECT count(*) FROM preapps WHERE name='" + a.name + "'") }));
  T.lostAfterRecover = inPg.filter((x) => x.acked && x.rows === '0').length;
  L.check(rows, 'integrity: هر نوشتِ ack‌شده در پنجرهٔ قطع، پس از بازگشت در PG هست (بدونِ ackِ گم‌شده)',
    T.lostAfterRecover === 0, JSON.stringify(inPg));

  const visibleNow = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's3-visibility', stage: 'contact' } });
  L.check(rows, 'integrity: پس از بازگشت، نوشتِ تازه ack و در PG دیده می‌شود',
    visibleNow.acked && infra.psql("SELECT count(*) FROM preapps WHERE name='s3-visibility'") === '1', 'status=' + visibleNow.status);

  /* بازاجرای opsِ پنجرهٔ memory با uid اصلی → هر op دقیقاً یک ردیف */
  const replay = [];
  for (const a of falseAcks) {
    const w = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: a.name, stage: 'contact' }, uid: a.uid });
    replay.push({ name: a.name, status: w.status, acked: w.acked, rows: infra.psql("SELECT count(*) FROM preapps WHERE name='" + a.name + "'") });
  }
  L.check(rows, 'integrity: بازاجرای ops (no loss) و بدونِ تکرار (no duplicates)',
    replay.every((r) => r.acked && r.rows === '1'), JSON.stringify(replay));

  const x = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 2, name: 's3-crosstenant', stage: 'contact' } });
  L.check(rows, 'tenant isolation (پس از بازیابی): school_id=2 با کوکیِ مدیرِ school 1 = 403', x.status === 403, 'status=' + x.status);

  /* شاهدِ کد: مسیرِ فالبک */
  const dbSrc = fs.readFileSync(root('server/db.js'), 'utf8');
  const mech = /pool\.on\('error'/.test(dbSrc) && /scheduleReconnect/.test(dbSrc) && /}, 10000\)/.test(dbSrc) && /isPgActive = false/.test(dbSrc);
  console.log('[root-cause] db.js: pool.on(error) → scheduleReconnect(10000ms) → init() → isPgActive=false ⇒ driver=memory (fail-open) : ' + mech);

  api.stop(); infra.stop();
  L.report('S3-pg-outage', rows, T,
    'detect503=' + T.detect503 + 'ms | fail_closed_window=' + T.failClosedWindow + 'ms | flip_at=' + T.flipAt + 'ms | false_acks=' + T.falseAcks + ' | lost_after_recover=' + T.lostAfterRecover);
})().catch((e) => { console.error('DRILL ERROR: ' + (e && e.message)); process.exit(3); });

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   chaos-drill-api-kill.js — سناریوی S1: کشتنِ API → خودراه‌اندازی

   هدفِ اندازه‌گیری (نه ادعا):
     time-to-detect   — چند میلی‌ثانیه تا «مرده‌بودنِ» پروسه قابل مشاهده شد
     time-to-recover  — چند میلی‌ثانیه تا نمونهٔ سالم با PID جدید ready شد
     in-flight        — درخواست‌های در جریان: کامل‌شده vs افتاده (kill -9 ⇒ انتظار: افتاده)
     state consistency— پس از restart: نوشتِ جدید ack می‌شود و در PG/store خوانده می‌شود
     liveness/readiness— پاسخ‌ها پس از restart

   تزریق: SIGKILL به PID واقعیِ node (از /api/liveness)؛ پوستهٔ supervisor
   (X=while :; do node server/index.js; done) دوباره بالا می‌آورد.

   اجرا: timeout 120 node tests/chaos-drill-api-kill.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const L = require('./chaos-drill-lib');

const T = { detect: null, recover: null, inFlightDropped: 0, inFlightCompleted: 0 };
const rows = [];

(async () => {
  const infra = await L.Infra.start();
  const seeded = infra.seedPg(['schools', 'classes', 'users', 'preapps']);
  console.log('[setup] PG=' + infra.pgPort + ' Redis=' + infra.redisPort + ' seedPG=' + JSON.stringify(seeded));
  const api = await L.startApi({ infra, supervisor: true });
  const st = infra.store();
  const mgr = st.users.find((u) => u.role === 'manager' && u.school_id === 1);
  const lg = await L.loginAs(api.port, mgr);
  L.check(rows, 'setup: لاگینِ مدیر (کوکیِ نشست)', lg.ok, 'login=' + lg.login.status);
  console.log('[setup] api pid=' + api.pid + ' port=' + api.port + ' db_collection_hydration=PG');

  /* ── ۰) پایه ─────────────────────────────────────────────────── */
  const l0 = await L.liveness(api.port);
  const r0 = await L.readiness(api.port);
  const pid0 = l0.json && l0.json.pid;
  L.check(rows, 'baseline: liveness=200 و PID خوانده شد', l0.status === 200 && !!pid0, 'pid=' + pid0);
  L.check(rows, 'baseline: readiness=ready', r0.status === 200 && r0.json && r0.json.status === 'ready', 'status=' + r0.status + ' body=' + JSON.stringify(r0.json && r0.json.status));
  if (!pid0) L.report('S1-api-kill', rows, T, 'baseline ناکام');

  /* ── ۱) درخواست‌های در جریان (هرکدام ۴ ثانیه) ──────────────── */
  const slow = [0, 1, 2].map(() => L.httpReq(api.port, 'GET', '/api/__slow?ms=4000', null, { jar: lg.jar, timeoutMs: 8000 }));
  /* تعریفِ صریح: «کامل» فقط اگر ۲۰۰ واقعی؛ هر چیزِ دیگر (قطع/خطای شبکه/غیر-۲۰۰)
     «افتاده» است. تفکیک لازم است تا این ادعا جعل‌شدنی نباشد. */
  await L.sleep(600); /* مطمئن شویم واقعاً در جریان‌اند */
  console.log('[inject] ۳ درخواست /api/__slow در جریان + SIGKILL به pid=' + pid0);

  /* ── ۲) تزریق: kill -9 ──────────────────────────────────────── */
  const tKill = Date.now();
  const killed = api.kill9(pid0);
  L.check(rows, 'inject: SIGKILL به PID واقعیِ node ارسال شد', killed, 'pid=' + pid0);

  /* ── ۳) تشخیص: اولین لحظهٔ «connection refused»/مرگ ────────── */
  const det = await L.until(async () => {
    const r = await L.liveness(api.port, 700);
    return r.status === 0; /* اتصال رد ⇒ پروسه مرده */
  }, { timeoutMs: 15000, stepMs: 10, label: 'death' });
  T.detect = det.ok ? det.ms : null;
  L.check(rows, 'detect: مرگِ نمونه در ≤۱۵s قابل مشاهده شد', det.ok, 'time_to_detect=' + det.ms + 'ms');

  /* ── ۴) بازیابی: نمونهٔ سالم با PID جدید ───────────────────── */
  const rec = await L.until(async () => {
    const l = await L.liveness(api.port, 1200);
    return l.status === 200 && l.json && Number(l.json.pid) !== Number(pid0);
  }, { timeoutMs: 30000, stepMs: 25, label: 'restart' });
  T.recover = rec.ok ? rec.ms : null;
  const l1 = await L.liveness(api.port);
  const pid1 = l1.json && l1.json.pid;
  L.check(rows, 'recover: supervisor نمونه را با PID جدید بالا آورد', rec.ok && pid1 && Number(pid1) !== Number(pid0),
    'pid_new=' + pid1 + ' time_to_recover=' + rec.ms + 'ms');

  const r1 = await L.until(async () => { const r = await L.readiness(api.port, 1500); return r.status === 200 && r.json && r.json.status === 'ready'; },
    { timeoutMs: 20000, stepMs: 25, label: 'readiness' });
  L.check(rows, 'recover: readiness پس از restart = ready', r1.ok, 'time_to_ready_delta=' + r1.ms + 'ms');

  /* ── ۵) سرنوشتِ درخواست‌های در جریان ───────────────────────── */
  const inflight = await Promise.race([Promise.all(slow), L.sleep(15000).then(() => 'timeout')]);
  const measured = inflight !== 'timeout';
  if (measured) {
    T.inFlightCompleted = inflight.filter((x) => x.status === 200).length;
    T.inFlightDropped = inflight.filter((x) => x.status !== 200).length;
    T.inFlightStatuses = inflight.map((x) => (x.status === 0 ? 'ERR:' + String(x.error).slice(0, 24) : String(x.status))).join(',');
  }
  L.check(rows, 'in-flight: هر ۳ درخواستِ در جریان واقعاً سنجیده شد (بدونِ timeoutِ اندازه‌گیری)', measured,
    measured ? 'statuses=' + T.inFlightStatuses : 'MEASUREMENT TIMEOUT ⇒ NOT-MEASURED');
  L.check(rows, 'in-flight: هیچ ۲۰۰ جعلی پس از مرگِ پروسه (kill -9 ⇒ افتادنِ درست)',
    measured && T.inFlightCompleted === 0 && T.inFlightDropped === 3,
    'dropped=' + T.inFlightDropped + ' completed200=' + T.inFlightCompleted + ' total=3');

  /* ── ۶) یکپارچگیِ وضعیت پس از restart ──────────────────────── */
  const mark = 's1-' + Date.now();
  const w = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: mark, stage: 'contact' } });
  L.check(rows, 'state: نوشتِ پس از restart با ۲۰۰ ack شد', w.status === 200 && w.acked, 'status=' + w.status + ' ms=' + w.ms);
  const inPg = infra.psql("SELECT count(*) FROM preapps WHERE name = '" + mark + "'");
  L.check(rows, 'state: ردیفِ نوشته‌شده در PG خوانده می‌شود', inPg === '1', 'PG count=' + inPg);
  const boot = await L.httpReq(api.port, 'GET', '/api/v1/bootstrap', null, { jar: lg.jar, timeoutMs: 8000 });
  L.check(rows, 'state: bootstrap پس از restart پاسخ می‌دهد (نمای سازگارِ تازه)', boot.status === 200, 'status=' + boot.status + ' bytes=' + boot.raw.length);
  const orphans = psqlCount(infra, 'SELECT count(*) FROM preapps WHERE name LIKE \'s1-%\'');
  L.check(rows, 'state: بدونِ ردیفِ تکراری از era قبل (no partial writes)', orphans === '1', 'rows(s1-*)=' + orphans);

  /* ── شاهدِ audit: رویدادِ lifecycle ────────────────────────── */
  const supLog = (api.logs().match(/\[supervisor\] api exited rc=/g) || []).length;
  const bootLine = /\[supervisor\] api exited rc=137/.test(api.logs());
  L.check(rows, 'evidence: لاگِ supervisor یک خروج (rc=137 = SIGKILL) و راه‌اندازیِ مجدد را نشان می‌دهد',
    supLog >= 1 && bootLine, 'supervisor_exit_lines=' + supLog + ' rc137=' + bootLine);
  const bootAudits = L.auditCount(infra, 'server_start') + L.auditCount(infra, 'boot') + L.auditCount(infra, 'restart');
  console.log('[evidence] audit lifecycle hits=' + bootAudits + ' — audit=' + infra.auditFile);

  L.check(rows, 'tenant isolation: نوشتِ school_id=2 با کوکیِ مدیرِ school 1 = 403',
    (await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 2, name: mark + '-x', stage: 'contact' } })).status === 403,
    'out_of_scope');

  api.stop(); infra.stop();
  L.report('S1-api-kill', rows, T, 'time_to_detect=' + T.detect + 'ms | time_to_recover=' + T.recover + 'ms');
})().catch((e) => { console.error('DRILL ERROR: ' + (e && e.message)); process.exit(3); });

function psqlCount(infra, sql) { const r = infra.psql(sql); return r.startsWith('ERR:') ? r : r; }

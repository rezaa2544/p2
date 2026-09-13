#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   chaos-drill-queue-outage.js — سناریوی S4: قطعِ مصرف‌کننده → بافر → بازپخش

   مسیرِ واقعی (نقشه‌برداری، بدونِ حدس):
     REST DELETE /api/v1/students/:id → delete-service (تراکنشِ PG) → outbox.append
       → store.outbox (صفِ درون‌پروسه‌ای = منبعِ مصرفِ worker) +
         server_outbox (آینهٔ durable در PG)
     worker (tick) → handler '*.deleted' → باطل‌کردنِ کش → status=processed

   دو فاز:
     A) قطعِ کوتاهِ مصرف‌کننده (tick=1500ms) + انفجارِ رویداد ⇒ بافر پر می‌شود،
        سپس خودش تخلیه می‌شود (replay درونِ پروسه). سنجش: buffer depth، replay duration.
     B) سقوطِ پروسه (SIGKILL) با رویدادهای pending ⇒ آیا صف پس از restart بازپخش
        می‌شود؟ (انتظارِ سخت: بله؛ چون PG آینهٔ durable دارد.)

   اجرا: timeout 150 node tests/chaos-drill-queue-outage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./chaos-drill-lib');
const root = (p) => path.join(__dirname, '..', p);

const T = { bufferDepth: null, replayMs: null, strandedBeforeCrash: null, pendingAfterRestart: null, recoveredAfterRestart: null };
const rows = [];
const pendingPg = (infra) => infra.psql("SELECT count(*) FROM server_outbox WHERE status='pending'");
const processedPg = (infra) => infra.psql("SELECT count(*) FROM server_outbox WHERE status='processed'");

(async () => {
  const infra = await L.Infra.start();
  infra.seedPg(['schools', 'classes', 'users', 'preapps']);
  let api = await L.startApi({ infra, extraEnv: { PAYESH_WORKER_INTERVAL_MS: '1500' } });
  const st = infra.store();
  const sa = st.users.find((u) => u.role === 'superadmin');
  let lg = await L.loginAs(api.port, sa);
  L.check(rows, 'setup: لاگینِ superadmin', lg.ok, 'login=' + lg.login.status);

  const ids = infra.psql("SELECT string_agg(id::text, ',') FROM (SELECT id FROM users WHERE role='student' AND school_id=1 ORDER BY id LIMIT 30) t").split(',').map(Number).filter(Boolean);
  L.check(rows, 'setup: استخرِ دانش‌آموز برای حذفِ کنترل‌شده', ids.length >= 20, 'n=' + ids.length);
  const del = (id, jar) => L.httpReq(api.port, 'DELETE', '/api/v1/students/' + id, null, { jar: jar || lg.jar, timeoutMs: 10000 });

  /* ── فاز A: بافرِ کوتاه‌مدت و تخلیهٔ خودکار ─────────────────── */
  const burst = [];
  for (let i = 0; i < 6; i++) burst.push(await del(ids[i]));
  T.bufferDepth = Number(pendingPg(infra));
  const localPending = (infra.store().outbox || []).filter((e) => (e.status || 'pending') === 'pending').length;
  L.check(rows, 'A/buffer: انفجارِ ۶ رویداد در بافر نشست (pending پیش از tickِ worker)',
    T.bufferDepth >= 1 && burst.every((r) => r.status === 200),
    'deletes=' + burst.map((r) => r.status).join(',') + ' buffer_depth(PG pending)=' + T.bufferDepth + ' | فایلِ store (تأخیرِ persist)=' + localPending);

  const t0 = Date.now();
  const drain = await L.until(async () => pendingPg(infra) === '0', { timeoutMs: 20000, stepMs: 100, label: 'drain' });
  T.replayMs = Date.now() - t0;
  L.check(rows, 'A/replay: مصرف‌کننده بافر را خودش تخلیه کرد (pending → 0، بدونِ مداخله)', drain.ok,
    'replay_duration=' + T.replayMs + 'ms | processed=' + processedPg(infra) + ' | server_outbox=' + infra.psql("SELECT string_agg(status||':'||n, ',') FROM (SELECT status, count(*) n FROM server_outbox GROUP BY status) x"));
  L.check(rows, 'A/integrity: هر رویداد دقیقاً یک‌بار processed و بدونِ تکرار',
    (await infra.psql("SELECT count(*) FROM (SELECT record_id, count(*) c FROM server_outbox GROUP BY record_id HAVING count(*) > 1) t")) === '0' &&
    (await infra.psql("SELECT count(*) FROM server_outbox WHERE status='processed' AND processed_at IS NULL")) === '0',
    'dup_records=0 && processed_without_ts=0');

  /* ── فاز B: سقوطِ پروسه با بافرِ پر ────────────────────────── */
  const burst2 = [];
  for (let i = 6; i < 12; i++) burst2.push(await del(ids[i]));
  T.strandedBeforeCrash = Number(pendingPg(infra));
  L.check(rows, 'B/inject: بافرِ پر در لحظهٔ سقوط (رویدادهای pending)', T.strandedBeforeCrash >= 1 && burst2.every((r) => r.status === 200),
    'pending=' + T.strandedBeforeCrash + ' deletes=' + burst2.map((r) => r.status).join(','));
  const storeHasPending = (infra.store().outbox || []).filter((e) => (e.status || 'pending') === 'pending').length;
  console.log('[evidence] pending در فایلِ store (تأخیرِ persist ~۲s ⇒ ممکن است کهنه باشد)=' + storeHasPending + ' | pending در server_outbox (PG، durable)=' + T.strandedBeforeCrash);

  const pid = await api.currentNodePid();
  const killed = api.kill9(pid);
  L.check(rows, 'B/inject: SIGKILL به پروسه با بافرِ پر', killed, 'pid=' + pid);

  /* راه‌اندازی دوباره با tickِ سریع (مصرف‌کننده سالم) — فرضِ سخت: صف باید بازپخش شود */
  api.stop();
  api = await L.startApi({ infra, extraEnv: { PAYESH_WORKER_INTERVAL_MS: '200' } });
  /* نشستِ پیش‌از‌سقوط بازاستفاده می‌شود: JWT بی‌حالت + رازِ پین‌شده.
     (ورودِ دوباره با send-code به سقفِ نرخِ Redis می‌خورد و متغیرِ ناخواسته می‌شود.) */
  const me = await L.httpReq(api.port, 'GET', '/api/auth/me', null, { jar: lg.jar, timeoutMs: 8000 });
  L.check(rows, 'B/restart: پروسهٔ تازه بالا آمد و نشستِ قبلی معتبر ماند (بدونِ ورودِ دوباره)', me.status === 200,
    'me=' + me.status + ' liveness=' + (await L.liveness(api.port)).status);

  T.pendingAfterRestart = Number(pendingPg(infra));
  const recovered = await L.until(async () => pendingPg(infra) === '0', { timeoutMs: 20000, stepMs: 200, label: 'queue-recovery-after-restart' });
  T.recoveredAfterRestart = recovered.ok;
  L.check(rows, 'B/replay: پس از restart، رویدادهای pending بازپخش و processed شدند (at-least-once پس از سقوط)',
    recovered.ok,
    'pending_after_restart=' + T.pendingAfterRestart + ' → ' + pendingPg(infra) + ' در ' + recovered.ms + 'ms' +
    ' | pending_forever=' + (!recovered.ok));
  if (!recovered.ok) {
    const ev = infra.psql("SELECT string_agg(id::text || '@' || status, ',' ORDER BY id) FROM server_outbox WHERE status='pending'");
    console.log('[finding] رویدادهای زمین‌مانده: ' + ev);
    console.log('[root-cause] worker منبعِ مصرف را store.outbox می‌گیرد (server/worker.js) و بوتِ PG-live استور را خالی می‌سازد (server/index.js: skeleton)؛ هیچ مسیری ردیف‌های pendingِ server_outbox را به store.outbox برنمی‌گرداند ⇒ صف پس از سقوطِ پروسه بازپخش نمی‌شود.');
  }

  /* رویدادهای تازه پس از restart کار می‌کنند؟ (تفکیک: باگِ بازپخش، نه باگِ کلِ صف) */
  const freshDel = await del(ids[12], lg.jar);
  const freshOk = await L.until(async () => infra.psql('SELECT status FROM server_outbox WHERE record_id=' + ids[12] + ' ORDER BY id DESC LIMIT 1') === 'processed',
    { timeoutMs: 10000, stepMs: 100, label: 'fresh-processed' });
  L.check(rows, 'B/scope: رویدادهای تازه پس از restart پردازش می‌شوند (عیب محدود به بازپخشِ بافرِ مرده است)',
    freshDel.status === 200 && freshOk.ok, 'fresh_delete=' + freshDel.status + ' fresh_event_status=' + infra.psql('SELECT status FROM server_outbox WHERE record_id=' + ids[12] + ' ORDER BY id DESC LIMIT 1'));

  /* ── یکپارچگیِ نهایی ────────────────────────────────────────── */
  const deleted = ids.slice(0, 13);
  const remaining = infra.psql('SELECT count(*) FROM users WHERE role=\'student\' AND school_id=1 AND id IN (' + deleted.join(',') + ')');
  L.check(rows, 'integrity: دقیقاً همان ۱۳ دانش‌آموزِ درخواست‌شده حذف شده‌اند (no extra delete)', remaining === '0', 'remaining=' + remaining);
  const aliveOthers = infra.psql("SELECT count(*) FROM users WHERE role='student' AND school_id=1");
  L.check(rows, 'integrity: هیچ دانش‌آموزِ دیگری از مدرسهٔ ۱ آسیب ندید', Number(aliveOthers) >= 100, 'students_left=' + aliveOthers + ' (از ۱۲۸)');
  const cross = await L.httpReq(api.port, 'DELETE', '/api/v1/students/' + ids[13], null, { jar: (await L.loginAs(api.port, st.users.find((u) => u.role === 'manager' && u.school_id === 2))).jar, timeoutMs: 8000 });
  L.check(rows, 'tenant isolation: مدیرِ مدرسهٔ ۲ دسترسی به دانش‌آموزِ مدرسهٔ ۱ ندارد', [403, 404].includes(cross.status), 'status=' + cross.status);

  api.stop(); infra.stop();
  L.report('S4-queue-outage', rows, T,
    'buffer_depth=' + T.bufferDepth + ' | in-process replay=' + T.replayMs + 'ms | stranded_at_crash=' + T.strandedBeforeCrash + ' | replay_after_restart=' + T.recoveredAfterRestart);
})().catch((e) => { console.error('DRILL ERROR: ' + (e && e.message)); process.exit(3); });

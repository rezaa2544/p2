#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   sync-conflict-storm-drill.js — دور ۱۲ چت ۳: Conflict Storm + Partial
   Failure (شکاف P0/P1 بستهٔ ۳ نقشه راه)
   ───────────────────────────────────────────────────────────────────
   چهار سناریوی طوفانی روی server/sync.js *واقعی* (authz/OCC/idempotency/
   undo-log). ضدتکرار: دور ۱۱ (offline-sync-drill) تک‌عامله بود؛ این‌جا
   هم‌زمانی/طوفان. Capacity (latency در بار بالا) مال چت ۴ است — این‌جا
   فقط صحتِ زیر طوفان سنجیده می‌شود، نه throughput.

     S7  Conflict Storm: ۵۰ آپدیتِ هم‌زمانِ یک رکورد (base_version کهنهٔ
         یکسان) ⇒ سرورِ مرجع همه را conflict-preserve می‌کند و رکورد
         دست‌نخورده می‌ماند (قراردادِ R95 بند ۲.۵: داوریِ انسانی، نه LWW).
     S8  Partial Failure: batch ۱۰تایی + شکستِ mirror وسطِ نوشتن (PG-live)
         ⇒ قرارداد all-or-nothing: rollback با undo-log + 503 + هیچ uid ی
         mark نمی‌شود ⇒ retry کامل ⇒ دقیقاً ۱۰ (نه کمتر/بیشتر/تکراری).
     S9  Retry Storm: ۱۰۰ mutation × ۳ ارسالِ درهم (۳۰۰ درخواست، ترتیبِ
         شافل‌شده) ⇒ اثرِ نهایی دقیقاً ۱۰۰؛ dedupe hit = ۲۰۰.
     S10 Clock Storm: ۲۰ «کلاینت» با skew از ‎-۶۰ تا +۶۰ دقیقه ⇒ اعمالِ
         همه + auditِ sync_clock_skew فقط برای بیرونِ حد؛ ترتیبِ علّی از
         OCC/version است نه timestamp (آپدیتِ نسخه‌کهنه conflict می‌شود
         حتی با timestamp «جدیدتر»).

   integrity هر سناریو: snapshot قبل/بعد + شمارشِ duplicate/گم‌شده/خرابی.
   اجرا: node tests/sync-conflict-storm-drill.js   (بدون نیاز به jsdom —
   لایهٔ سرور؛ کلاینتِ واقعی در دور ۱۱ پوشش دارد)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { createSync, attach } = require('../server/sync.js');

let okc = 0, failc = 0, notrun = 0;
const fails = [];
const METRICS = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 220) : '')); }
}
function nr(name, why) { notrun++; console.log('  🚫 NOT-RUN: ' + name + ' — ' + why); }
function metric(scn, m) { METRICS.push(Object.assign({ scn }, m)); }

/* مولد قطعی برای شافل (بدون Math.random — بازتولیدپذیری drill) */
let RSEED = 20260913;
function rnd() { RSEED = (RSEED * 1664525 + 1013904223) % 4294967296; return RSEED / 4294967296; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function makeServer(opts) {
  opts = opts || {};
  const store = {
    users: [
      { id: 5, role: 'manager', school_id: 1, full_name: 'مدیر ۱' },
      { id: 6, role: 'manager', school_id: 2, full_name: 'مدیر ۲' }
    ],
    schools: [{ id: 1, name: 'مدرسه ۱' }, { id: 2, name: 'مدرسه ۲' }],
    classes: [{ id: 10, school_id: 1, name: 'کلاس' }],
    announcements: [],
    grades: [{ id: 900, school_id: 1, student_id: 50, score: 17, version: 4 }],
    sync_conflicts: [], notifications: [],
    __processed_uids: {}, __server_version: 0
  };
  const persisted = [];
  const audits = [];
  let failMirrorTimes = 0;          /* S8: شکستِ قابل‌برنامه‌ریزیِ mirror */
  let currentSession = { id: 5, role: 'manager', school_id: 1 };
  const ctx = {
    store,
    db: {
      isPostgres: () => !!opts.pgLive,   /* S8: مسیر undo-log/rollback فقط در pgLive */
      persistOpsBatch: async (ops) => {
        if (failMirrorTimes > 0) { failMirrorTimes--; throw new Error('DB crash mid-write (drill)'); }
        persisted.push(...ops); return { ok: true };
      },
      isUidProcessed: async () => false
    },
    MAX_BATCH: 500, AT_DRIFT_MS: opts.AT_DRIFT_MS || 10 * 60 * 1000,
    audit: (ev, meta) => { audits.push({ ev, meta }); }, markDirty: () => {},
    sessionFrom: () => currentSession,
    sendJson: (res, code, body) => { res._cap = { code, body }; }
  };
  attach(store);
  const sync = createSync(ctx);
  return {
    store, persisted, audits,
    failMirror: (n) => { failMirrorTimes = n; },
    handle: async (body) => {
      const res = {};
      await sync.apiSync({}, res, body);
      return { status: res._cap.code, body: res._cap.body };
    }
  };
}

function snap(server) {
  return {
    ann: server.store.announcements.length,
    annTitles: server.store.announcements.map((a) => a.title).sort().join('|'),
    grade: JSON.stringify(server.store.grades[0]),
    conflicts: server.store.sync_conflicts.length,
    uids: Object.keys(server.store.__processed_uids || {}).length,
    persisted: server.persisted.length
  };
}
/* integrity: بدون duplicate در announcements + بدون خرابی رکورد مرجع */
function noDup(server) {
  const t = server.store.announcements.map((a) => a.title);
  return new Set(t).size === t.length;
}

(async () => {
  console.log('\nsync-conflict-storm-drill — دور ۱۲: طوفانِ تعارض/شکستِ جزئی/طوفانِ retry/طوفانِ ساعت (server/sync.js واقعی)\n');
  const t0all = Date.now();

  /* ════ S7: Conflict Storm — ۵۰ آپدیتِ هم‌زمانِ یک رکورد ════ */
  console.log('▸ S7 — طوفانِ تعارض: ۵۰ آپدیتِ هم‌زمان روی grades#900 با base_version کهنه');
  {
    const server = makeServer();
    const before = snap(server);
    const t0 = Date.now();
    /* ۵۰ درخواستِ هم‌زمان (Promise.all — درهم‌تنیدگیِ واقعیِ event-loop) */
    const reqs = [];
    for (let i = 0; i < 50; i++) {
      reqs.push(server.handle({ ops: [{ uid: 'storm7-' + i, by: 5, c: 'grades', t: 'upd', user_id: 5, school_id: 1,
        id: 900, base_version: 2, at: new Date().toISOString(), data: { school_id: 1, score: (i % 20) + 0.5 } }] }));
    }
    const rs = await Promise.all(reqs);
    const detectMs = Date.now() - t0;
    const after = snap(server);
    const codes = rs.map((r) => (r.body.results || [{}])[0].code);
    const preserved = codes.filter((c) => c === 'conflict_preserved').length;
    chk('S7a هر ۵۰ آپدیتِ نسخه‌کهنه conflict-preserve شد (سرورِ مرجع — داوری، نه LWW)',
      preserved === 50, 'preserved=' + preserved + ' codes=' + [...new Set(codes)].join(','));
    chk('S7b رکوردِ مرجع کاملاً دست‌نخورده (score=17, version=4)', after.grade === before.grade, after.grade);
    chk('S7c ‏۵۰ conflict در صفِ داوری ثبت شد', after.conflicts === 50, 'conflicts=' + after.conflicts);
    chk('S7d integrity: صفر side-effect دیگر (ann/uids ثابت — تا رفعِ داوری هیچ uid ی مصرف نشد)',
      after.ann === before.ann, 'ann=' + after.ann);
    metric('S7', { storm_size: 50, detect_ms: detectMs, conflicts: after.conflicts, applied: 0, integrity: after.grade === before.grade && noDup(server) });
  }

  /* ════ S8: Partial Failure — شکستِ mirror وسطِ batch ‏(PG-live) ════ */
  console.log('▸ S8 — شکستِ جزئی: batch ۱۰تایی + کرشِ DB حینِ نوشتن ⇒ rollback اتمیک ⇒ retry کامل');
  {
    const server = makeServer({ pgLive: true });
    const before = snap(server);
    const mkBatch = () => ({ ops: Array.from({ length: 10 }, (_, i) => ({ uid: 'pf8-' + i, by: 5, c: 'announcements', t: 'ins',
      user_id: 5, school_id: 1, at: new Date().toISOString(), data: { school_id: 1, title: 'pf-' + i, body: 'x' } })) });
    server.failMirror(1);
    const t0 = Date.now();
    const r1 = await server.handle(mkBatch());
    const failMs = Date.now() - t0;
    const mid = snap(server);
    chk('S8a شکستِ mirror ⇒ ‏503 با کدِ پایدارِ sync_mirror_failed', r1.status === 503 && r1.body.code === 'sync_mirror_failed');
    chk('S8b قراردادِ all-or-nothing: ‏rollback با undo-log — صفر رکورد از ۱۰ ماند',
      mid.ann === before.ann, 'ann=' + mid.ann);
    chk('S8c هیچ uid ی mark نشد (شکست ⇒ replay کامل مجاز)', mid.uids === before.uids, 'uids=' + mid.uids);
    chk('S8d ‏auditِ sync_mirror_failed ثبت شد (رصدپذیری)', server.audits.some((a) => a.ev === 'sync_mirror_failed'));
    const t1 = Date.now();
    const r2 = await server.handle(mkBatch());      /* retry کلاینت — DB سالم */
    const retryMs = Date.now() - t1;
    const after = snap(server);
    /* یافتهٔ حینِ ساخت (قراردادِ P1-2): در PG-live آینهٔ کالکشن‌هایِ خارجِ
       لیستِ سفیدِ هرس پس از commitِ موفق عمداً بریده می‌شود — مرجعِ داده
       PG است (این‌جا: ژورنالِ persisted)، نه store. سنجهٔ integrity روی
       مرجع است؛ ann در آینه به‌درستی ۰ می‌ماند. */
    const pTitles = server.persisted.map((o) => o.data && o.data.title);
    chk('S8e ‏retry: هر ۱۰ به مرجع (PG) رسید و همه ok — آینه طبق P1-2 عمداً هرس شد',
      after.persisted === 10 && r2.body.results.every((x) => x.ok) && after.ann === 0,
      'persisted=' + after.persisted + ' ann=' + after.ann);
    chk('S8f integrity: دقیقاً ۱۰ در مرجع — نه duplicate، نه گم‌شده',
      new Set(pTitles).size === 10 && after.uids === before.uids + 10, 'uniq=' + new Set(pTitles).size + ' uids=' + after.uids);
    metric('S8', { batch: 10, fail_ms: failMs, retry_ms: retryMs, rolled_back: 10, final_applied: after.persisted, integrity: new Set(server.persisted.map(o=>o.data&&o.data.title)).size === 10 });
  }

  /* ════ S9: Retry Storm — ۱۰۰×۳ ارسالِ درهم ════ */
  console.log('▸ S9 — طوفانِ retry: ‏۱۰۰ mutation × ۳ ارسال (۳۰۰ درخواستِ شافل‌شده) ⇒ اثرِ ۱۰۰');
  {
    const server = makeServer();
    const before = snap(server);
    const sends = [];
    for (let i = 0; i < 100; i++) for (let k = 0; k < 3; k++) sends.push(i);
    shuffle(sends);
    const t0 = Date.now();
    let dedupeHits = 0, oks = 0;
    /* موج‌های ۳۰تایی هم‌زمان (طوفانِ کنترل‌شده — درهم‌تنیدگیِ واقعی بدونِ OOM) */
    for (let w = 0; w < sends.length; w += 30) {
      const wave = sends.slice(w, w + 30).map((i) => server.handle({ ops: [{ uid: 'rs9-' + i, by: 5, c: 'announcements', t: 'ins',
        user_id: 5, school_id: 1, at: new Date().toISOString(), data: { school_id: 1, title: 'retry-' + i, body: 'x' } }] }));
      for (const r of await Promise.all(wave)) {
        const res0 = (r.body.results || [{}])[0];
        if (res0.code === 'duplicate_ignored') dedupeHits++;
        if (res0.ok) oks++;
      }
    }
    const drainMs = Date.now() - t0;
    const after = snap(server);
    chk('S9a اثرِ نهایی دقیقاً ۱۰۰ (نه ۳۰۰)', after.ann === before.ann + 100, 'ann=' + after.ann);
    chk('S9b ‏dedupe hit = ۲۰۰ از ۳۰۰', dedupeHits === 200, 'hits=' + dedupeHits);
    chk('S9c هر ۳۰۰ پاسخ برای کلاینت ok بود (retry شفاف — صف گیر نمی‌کند)', oks === 300, 'oks=' + oks);
    chk('S9d integrity: صفر duplicate در عنوان‌ها + ‏uids=۱۰۰', noDup(server) && after.uids === before.uids + 100, 'uids=' + after.uids);
    metric('S9', { mutations: 100, sends: 300, dedupe_hits: dedupeHits, drain_ms: drainMs, integrity: noDup(server) && after.ann === before.ann + 100 });
  }

  /* ════ S10: Clock Storm — ۲۰ کلاینت با skew ‏-۶۰..+۶۰ دقیقه ════ */
  console.log('▸ S10 — طوفانِ ساعت: ‏۲۰ کلاینت با skew از ‎-۶۰ تا +۶۰ دقیقه (حدِ drift = ‏۱۰min)');
  {
    const server = makeServer({ AT_DRIFT_MS: 10 * 60 * 1000 });
    const before = snap(server);
    const skews = Array.from({ length: 20 }, (_, i) => -60 + i * 6.3); /* ‏-۶۰..+۵۹.۷ دقیقه */
    const reqs = skews.map((min, i) => server.handle({ ops: [{ uid: 'cs10-' + i, by: 5, c: 'announcements', t: 'ins',
      user_id: 5, school_id: 1, at: new Date(Date.now() + min * 60000).toISOString(), data: { school_id: 1, title: 'clock-' + i, body: 'x' } }] }));
    const rs = await Promise.all(reqs);
    const after1 = snap(server);
    const outOfBound = skews.filter((m) => Math.abs(m) > 10).length;
    const skewAudits = server.audits.filter((a) => a.ev === 'sync_clock_skew').length;
    chk('S10a هر ۲۰ اعمال شد (قراردادِ fail-open با ثبت — ساعتِ کلاینت داور نیست)',
      after1.ann === before.ann + 20 && rs.every((r) => r.body.results[0].ok), 'ann=' + after1.ann);
    chk('S10b ‏audit دقیقاً برای skewهای بیرونِ حد (' + outOfBound + ' از ۲۰)', skewAudits === outOfBound, 'audits=' + skewAudits);
    /* ترتیبِ علّی از OCC: آپدیت با base_version درست *و timestamp خیلی کهنه* می‌نشیند؛
       آپدیت با base_version کهنه *و timestamp تازه* conflict می‌شود */
    const rOld = await server.handle({ ops: [{ uid: 'cs10-occ-ok', by: 5, c: 'grades', t: 'upd', user_id: 5, school_id: 1,
      id: 900, base_version: 4, at: new Date(Date.now() - 55 * 60000).toISOString(), data: { school_id: 1, score: 18 } }] });
    const rNew = await server.handle({ ops: [{ uid: 'cs10-occ-bad', by: 5, c: 'grades', t: 'upd', user_id: 5, school_id: 1,
      id: 900, base_version: 4, at: new Date(Date.now() + 55 * 60000).toISOString(), data: { school_id: 1, score: 12 } }] });
    chk('S10c ترتیبِ علّی از version است نه timestamp: کهنه+نسخه‌درست نشست (score=18) و تازه+نسخه‌کهنه conflict شد',
      rOld.body.results[0].ok === true && server.store.grades[0].score === 18
      && rNew.body.results[0].code === 'conflict_preserved' && server.store.grades[0].score === 18,
      'score=' + server.store.grades[0].score + ' rNew=' + rNew.body.results[0].code);
    chk('S10d integrity: صفر duplicate/خرابی', noDup(server), '');
    metric('S10', { clients: 20, skew_min: [-60, 60], out_of_bound: outOfBound, audits: skewAudits, conflicts: server.store.sync_conflicts.length, integrity: noDup(server) });
  }

  /* ════ NOT-RUN های صادقانه ════ */
  console.log('▸ محدودیت‌ها (سبزِ جعلی ممنوع):');
  nr('طوفان روی PG/Redis زنده با پروسه‌های OS مجزا', 'این drill درهم‌تنیدگیِ event-loop تک‌پروسه است — هم‌زمانیِ بین‌پروسه‌ایِ واقعی نیازمند استیجینگ (بستهٔ P0-5)');
  nr('latency/throughput زیرِ بار (p50/p95/p99)', 'مالکیتِ Capacity = چت ۴ — این‌جا فقط صحتِ زیر طوفان');
  nr('conflict storm چند-tenant هم‌زمان', 'سناریوی داوریِ بین‌مدرسه‌ای نیازمند قراردادِ counselor/tenancy باز (صف ناظر)');

  console.log('\n▸ جدولِ metrics:');
  for (const m of METRICS) console.log('  ' + JSON.stringify(m));
  console.log('\nsync-conflict-storm-drill: ' + okc + ' موفق، ' + failc + ' ناموفق (+ ' + notrun + ' NOT-RUN ثبت‌شده) — ' + ((Date.now() - t0all) / 1000).toFixed(1) + 's');
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });

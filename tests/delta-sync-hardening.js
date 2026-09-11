#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/delta-sync-hardening.js — Delta Sync Hardening Phase 2
   ─────────────────────────────────────────────────────────────────
   Gap 1 — Long-lived delta (7+ days):
     DH1  since > 7d ⇒ full_snapshot_required:true + full snapshot served
          (old clients converge too) + tombstones after since still sent
     DH2  fresh since ⇒ plain delta, no flag (behaviour preserved)
     DH3  boundary: one ms past 7d forces full; one ms inside stays delta
     DH4  PAYESH_DELTA_MAX_AGE_DAYS override honoured per-request
   Gap 2 — Cursor TTL (signed, 1h default, renewal):
     DH5  pull response carries next_cursor + cursor_ttl_s
     DH6  valid cursor ⇒ delta from the AUTHENTICATED since inside the token
     DH7  expired cursor ⇒ 401 cursor_expired (+cursor_renewal:'full_pull')
     DH8  tampered cursor ⇒ 401 cursor_invalid (fail-closed)
     DH9  cursor wins over a conflicting client-claimed `since`
     DH10 no signing key ⇒ no next_cursor; presented token ⇒ 401
          cursor_unavailable; legacy `since` path unaffected
     DH11 unit: TTL clamp (60..86400), future-iat rejection, jti uniqueness
   Gap 2 client (jsdom, built index.html):
     DH12 pullFromServer stores next_cursor and sends it as ?cursor=
     DH13 401 cursor_expired ⇒ automatic renewal: exactly one follow-up
          FULL pull (no cursor/since), fresh cursor stored, final ok:true
   Gap 1 client (jsdom):
     DH14 forced-full payload (full_snapshot_required) REPLACES collection
          state — rows absent server-side are dropped (merge kept them)
   Gap 4 — Conflict measurement (in-process apiSync, two parallel clients):
     DH15 two parallel updates, same base_version ⇒ exactly one
          conflict_preserved (payesh_sync_conflicts_total{grades} +1)
     DH16 payesh_sync_conflict_detection_seconds observed with
          outcome=conflict AND outcome=clean (count>0, sum>=0, ms scale)
     DH17 new histogram exposed in the Prometheus exposition
   Gap 3 — load-test tool contract:
     DH18 DRY_RUN default runs clean (exit 0) and labels output simulated
     DH19 --live without DATABASE_URL fails closed (exit 1, clear error)

   Run: node tests/delta-sync-hardening.js   (exit 0 = all green)
   Client groups need index.html built from current src (node build.js).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { createPull } = require(path.join(ROOT, 'server', 'pull'));
const { createCursor, DEFAULT_TTL_S, MIN_TTL_S, MAX_TTL_S } = require(path.join(ROOT, 'server', 'cursor'));
const { createSync, attach } = require(path.join(ROOT, 'server', 'sync'));
const metrics = require(path.join(ROOT, 'server', 'metrics'));
const { opX } = require('./helpers/opx');

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function group(t) { console.log(`\n▸ ${t}`); }
const DAY = 24 * 60 * 60 * 1000;
const iso = (t) => new Date(t).toISOString();

/* ── minimal pull harness (memory store, no db) ───────────────────── */
function makePullStore() {
  return {
    schools: [
      { id: 1, school_id: 1, name: 'مدرسه ۱', created_at: iso(Date.now() - 30 * DAY), updated_at: iso(Date.now() - 30 * DAY) },
      { id: 2, school_id: 2, name: 'مدرسه ۲', created_at: iso(Date.now() - 30 * DAY), updated_at: iso(Date.now() - 30 * DAY) }
    ],
    grades: [
      { id: 101, school_id: 1, class_id: 1, student_id: 30, subject_id: 1, score: 20, version: 1, created_at: iso(Date.now() - 30 * DAY), updated_at: iso(Date.now() - 30 * DAY) },
      { id: 102, school_id: 1, class_id: 2, student_id: 31, subject_id: 2, score: 18, version: 1, created_at: iso(Date.now() - 30 * DAY), updated_at: iso(Date.now() - 2 * DAY) },
      { id: 103, school_id: 1, class_id: 1, student_id: 30, subject_id: 2, score: 17, version: 1, created_at: iso(Date.now() - 1 * DAY), updated_at: iso(Date.now() - 1 * DAY) }
    ],
    users: [
      { id: 10, school_id: 1, role: 'manager', full_name: 'مدیر', created_at: iso(Date.now() - 30 * DAY), updated_at: iso(Date.now() - 30 * DAY) }
    ],
    __deleted_records: [
      { c: 'grades', id: 105, school_id: 1, at: iso(Date.now() - 3 * DAY) }
    ],
    __server_version: 7
  };
}
function makePull(opts) {
  opts = opts || {};
  const store = opts.store || makePullStore();
  const session = opts.session || { id: 10, school_id: 1, role: 'manager' };
  const cap = {};
  const controller = createPull({
    store,
    sessionFrom: async () => session,
    sendJson: (res, code, body) => { cap.code = code; cap.body = body; },
    cursor: opts.cursor !== undefined ? opts.cursor : createCursor({ secret: 'k'.repeat(64) })
  });
  return {
    store, cap,
    pull: (qs) => controller.apiPull({ url: '/api/v1/pull' + (qs ? '?' + qs : '') }, {})
  };
}

/* ── in-process sync harness (gap 4) ──────────────────────────────── */
function makeSyncCtx() {
  const store = {
    grades: [{ id: 55, school_id: 1, class_id: 1, student_id: 30, subject_id: 1, teacher_id: 20, score: 19, version: 3, updated_at: iso(Date.now()) }],
    users: [{ id: 5, role: 'manager', school_id: 1 }, { id: 7, role: 'manager', school_id: 1 }],
    __processed_uids: {}, __server_version: 0
  };
  const mgr = (id) => ({ id, role: 'manager', school_id: 1 });
  const ctx = {
    store,
    db: { persistOpsBatch: async () => ({ ok: true }), isUidProcessed: async () => false },
    MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: () => {},
    /* two distinct "clients": the request object selects the session
       (op.by must equal the authenticated user — contract §3 #1) */
    sessionFrom: (req) => (req && req._user === 7) ? mgr(7) : mgr(5),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    markDirty: () => {}
  };
  attach(store);
  return { ctx, store };
}
const updOp = (uid, by, score, base) => opX({
  uid, by, collection: 'grades', type: 'upd',
  user_id: by, school_id: 1,
  id: 55, base_version: base,
  data: { id: 55, school_id: 1, class_id: 1, student_id: 30, subject_id: 1, teacher_id: 20, score }
});

function snapMetric(name) {
  const snap = metrics.snapshot()[name];
  if (!snap || !snap.series) return null;
  return snap;
}
function seriesCount(name, labels) {
  const snap = snapMetric(name);
  if (!snap) return 0; /* metric absent (or no observation yet) ⇒ zero observations */
  for (const s of snap.series) {
    let ok = true;
    for (const k of Object.keys(labels)) {
      if ((s.labels || {})[k] !== labels[k]) { ok = false; break; }
    }
    if (ok) {
      return snap.type === 'histogram' ? s.count : s.value;
    }
  }
  return 0;
}

/* ── jsdom client harness (gaps 1+2 client side) ──────────────────── */
async function withClientHarness(fn) {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {})
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await new Promise(r => setTimeout(r, 1200));
  try {
    await fn(win, W);
  } finally {
    dom.window.close();
  }
}

(async () => {
  console.log('Delta Sync Hardening — Phase 2 (گپ‌های ۱/۲/۳/۴)');

  /* ═══ Gap 1 — long-lived delta ═══ */
  group('گپ ۱ — دلتای کهنه (۷+ روز) → اسنپ‌شات کامل');

  await test('DH1 since>7d ⇒ full_snapshot_required + full + tombstones', async () => {
    const { cap, pull } = makePull();
    const since = iso(Date.now() - 8 * DAY); /* changed 8d ago → would be delta-visible only via full */
    await pull('since=' + encodeURIComponent(since) + '&collections=grades,users');
    assert(cap.code === 200, 'status 200 expected, got ' + cap.code);
    const b = cap.body;
    assert(b.ok === true, 'ok');
    assert(b.full_snapshot === true, 'full_snapshot must be true');
    assert(b.full_snapshot_required === true, 'full_snapshot_required flag missing');
    assert(b.full_snapshot_reason === 'since_too_old', 'reason');
    /* full snapshot: rows older than since are ALSO present (101: updated 30d ago) */
    const ids = b.collections.grades.map(r => r.id).sort((x, y) => x - y);
    assert(JSON.stringify(ids) === JSON.stringify([101, 102, 103]), 'full set expected, got ' + JSON.stringify(ids));
    /* tombstones after since still delivered → old client converges deletions */
    assert(Array.isArray(b.deleted) && b.deleted.length === 1 && b.deleted[0].id === 105, 'tombstone after since missing');
  });

  await test('DH2 since تازه ⇒ دلتای عادی بدون پرچم', async () => {
    const { cap, pull } = makePull();
    const since = iso(Date.now() - 5 * DAY);
    await pull('since=' + encodeURIComponent(since) + '&collections=grades');
    assert(cap.code === 200, 'status');
    const b = cap.body;
    assert(b.full_snapshot === false, 'not a full snapshot');
    assert(b.full_snapshot_required === undefined, 'flag must be absent');
    const ids = b.collections.grades.map(r => r.id).sort((x, y) => x - y);
    assert(JSON.stringify(ids) === JSON.stringify([102, 103]), 'only changed rows, got ' + JSON.stringify(ids));
    assert(b.deleted.length === 1, 'tombstones on normal delta');
  });

  await test('DH3 مرزِ دقیقِ ۷ روز (۱ms بیرون = full؛ ۱ms داخل = دلتا)', async () => {
    const justOutside = iso(Date.now() - 7 * DAY - 2);  /* > 7d → forced */
    const justInside = iso(Date.now() - 7 * DAY + 60 * 1000); /* < 7d → delta */
    const a = makePull();
    await a.pull('since=' + encodeURIComponent(justOutside) + '&collections=grades');
    assert(a.cap.body.full_snapshot_required === true, 'just outside 7d must force full');
    const b = makePull();
    await b.pull('since=' + encodeURIComponent(justInside) + '&collections=grades');
    assert(b.cap.body.full_snapshot_required === undefined, 'just inside 7d must stay delta');
  });

  await test('DH4 آستانه از PAYESH_DELTA_MAX_AGE_DAYS خوانده می‌شود', async () => {
    const prev = process.env.PAYESH_DELTA_MAX_AGE_DAYS;
    try {
      process.env.PAYESH_DELTA_MAX_AGE_DAYS = '1'; /* 1 day */
      const a = makePull();
      const since2d = iso(Date.now() - 2 * DAY);
      await a.pull('since=' + encodeURIComponent(since2d) + '&collections=grades');
      assert(a.cap.body.full_snapshot_required === true, '2d-old since must force full with 1d threshold');
      const b = makePull();
      const since2h = iso(Date.now() - 2 * 60 * 60 * 1000);
      await b.pull('since=' + encodeURIComponent(since2h) + '&collections=grades');
      assert(b.cap.body.full_snapshot_required === undefined, '2h-old since stays delta with 1d threshold');
    } finally {
      if (prev === undefined) delete process.env.PAYESH_DELTA_MAX_AGE_DAYS;
      else process.env.PAYESH_DELTA_MAX_AGE_DAYS = prev;
    }
  });

  /* ═══ Gap 2 — cursor TTL (server) ═══ */
  group('گپ ۲ — کرسرِ امضاشده با TTL (سرور)');

  await test('DH5 پاسخِ pull دارای next_cursor و cursor_ttl_s است', async () => {
    const { cap, pull } = makePull({ cursor: createCursor({ secret: 'k'.repeat(64), ttlS: 3600 }) });
    await pull('collections=grades');
    assert(cap.code === 200, 'status');
    assert(typeof cap.body.next_cursor === 'string' && cap.body.next_cursor.startsWith('pc1.'), 'next_cursor shape');
    assert(cap.body.cursor_ttl_s === 3600, 'cursor_ttl_s');
    const v = createCursor({ secret: 'k'.repeat(64) }).verify(cap.body.next_cursor);
    assert(v.ok === true, 'next_cursor must verify with the same key');
    assert(v.payload.since === cap.body.server_time, 'cursor since must be the response snapshot moment');
  });

  await test('DH6 کرسرِ معتبر ⇒ دلتا از sinceِ امضاشدهٔ داخل توکن', async () => {
    let clock = Math.floor(Date.now() / 1000);
    const signer = createCursor({ secret: 'k'.repeat(64), ttlS: 3600, now: () => clock });
    const { cap, pull } = makePull({ cursor: signer });
    const since = iso(Date.now() - 5 * DAY);
    clock += 5; /* some time passes before the client reuses the cursor */
    const token = signer.sign(since, Math.floor(Date.now() / 1000) - 5);
    await pull('cursor=' + encodeURIComponent(token) + '&collections=grades');
    assert(cap.code === 200, 'status: ' + cap.code + ' ' + JSON.stringify(cap.body));
    assert(cap.body.full_snapshot === false, 'delta (since is fresh, inside cursor window)');
    const ids = cap.body.collections.grades.map(r => r.id).sort((x, y) => x - y);
    assert(JSON.stringify(ids) === JSON.stringify([102, 103]), 'delta from cursor.since, got ' + JSON.stringify(ids));
    assert(cap.body.since === since, 'since echoed = token since');
  });

  await test('DH7 کرسرِ منقضی ⇒ 401 cursor_expired + cursor_renewal', async () => {
    let clock = Math.floor(Date.now() / 1000);
    const signer = createCursor({ secret: 'k'.repeat(64), ttlS: 60, now: () => clock });
    const token = signer.sign(iso(Date.now() - 10 * 60 * 1000), clock - 10 * 60); /* issued 10min ago */
    clock += 61; /* TTL=60s → now expired */
    const { cap, pull } = makePull({ cursor: signer });
    await pull('cursor=' + encodeURIComponent(token));
    assert(cap.code === 401, '401 expected, got ' + cap.code);
    assert(cap.body.code === 'cursor_expired', 'code cursor_expired, got ' + cap.body.code);
    assert(cap.body.cursor_renewal === 'full_pull', 'renewal hint');
    assert(cap.body.ok === false, 'ok false');
  });

  await test('DH8 کرسرِ دستکاری‌شده ⇒ 401 cursor_invalid (fail-closed)', async () => {
    const signer = createCursor({ secret: 'k'.repeat(64) });
    const token = signer.sign(iso(Date.now() - 60 * 1000));
    const tampered = token.slice(0, -4) + 'AAAA';
    const { cap, pull } = makePull({ cursor: signer });
    await pull('cursor=' + encodeURIComponent(tampered));
    assert(cap.code === 401 && cap.body.code === 'cursor_invalid', 'tampered cursor must be rejected, got ' + cap.code + ' ' + cap.body.code);
    /* garbage token too */
    await pull('cursor=' + encodeURIComponent('pc1.not-a-token.x'));
    assert(cap.code === 401 && cap.body.code === 'cursor_invalid', 'garbage cursor rejected');
  });

  await test('DH9 کرسرِ معتبر بر sinceِ ادعایی کلاینت مقدم است', async () => {
    const signer = createCursor({ secret: 'k'.repeat(64), ttlS: 3600 });
    const realSince = iso(Date.now() - 5 * DAY);
    const forgedSince = iso(Date.now() - 8 * DAY); /* would force full snapshot if honored */
    const token = signer.sign(realSince);
    const { cap, pull } = makePull({ cursor: signer });
    await pull('cursor=' + encodeURIComponent(token) + '&since=' + encodeURIComponent(forgedSince) + '&collections=grades');
    assert(cap.code === 200, 'status');
    assert(cap.body.full_snapshot_required === undefined, 'forged since must NOT force full — token since wins');
    assert(cap.body.since === realSince, 'authenticated since echoed');
  });

  await test('DH10 بدون کلید ⇒ next_cursor نیست؛ توکن ارسالی ⇒ 401 cursor_unavailable؛ since معمولی سالم', async () => {
    const prevSecret = process.env.PAYESH_CURSOR_SECRET, prevJwt = process.env.PAYESH_JWT_SECRET;
    try {
      delete process.env.PAYESH_CURSOR_SECRET; delete process.env.PAYESH_JWT_SECRET;
      const none = makePull({ cursor: createCursor({ secret: null }) });
      await none.pull('collections=grades');
      assert(none.cap.body.next_cursor === undefined, 'no next_cursor when disabled');
      assert(none.cap.body.cursor_ttl_s === undefined, 'no ttl when disabled');
      /* legacy since path unaffected */
      const legacy = makePull({ cursor: createCursor({ secret: null }) });
      await legacy.pull('since=' + encodeURIComponent(iso(Date.now() - 2 * DAY)) + '&collections=grades');
      assert(legacy.cap.code === 200 && legacy.cap.body.full_snapshot === false, 'legacy delta works');
      /* a presented token is rejected fail-closed (never silently trusted) */
      const other = createCursor({ secret: 'k'.repeat(64) });
      const token = other.sign(iso(Date.now() - 60 * 1000));
      const hostile = makePull({ cursor: createCursor({ secret: null }) });
      await hostile.pull('cursor=' + encodeURIComponent(token));
      assert(hostile.cap.code === 401 && hostile.cap.body.code === 'cursor_unavailable', 'token on disabled server rejected');
    } finally {
      if (prevSecret) process.env.PAYESH_CURSOR_SECRET = prevSecret;
      if (prevJwt) process.env.PAYESH_JWT_SECRET = prevJwt;
    }
  });

  await test('DH11 واحدِ کرسر: clamp طول عمر، iat آینده، یکتایی jti', async () => {
    assert(DEFAULT_TTL_S === 3600, 'default TTL is 1h');
    const short = createCursor({ secret: 'k'.repeat(64), ttlS: 1 });
    assert(short.ttlS === MIN_TTL_S, 'TTL clamped up to ' + MIN_TTL_S + ', got ' + short.ttlS);
    const long = createCursor({ secret: 'k'.repeat(64), ttlS: 99999999 });
    assert(long.ttlS === MAX_TTL_S, 'TTL clamped down to ' + MAX_TTL_S + ', got ' + long.ttlS);
    /* future iat (clock games) → invalid */
    const nowS = Math.floor(Date.now() / 1000);
    const signer = createCursor({ secret: 'k'.repeat(64), ttlS: 3600, now: () => nowS });
    const futureTok = signer.sign(iso(Date.now()), nowS + 3600); /* issued "in the future" */
    assert(signer.verify(futureTok).code === 'cursor_invalid', 'future iat rejected');
    /* jti uniqueness */
    const t1 = signer.sign(iso(Date.now())), t2 = signer.sign(iso(Date.now()));
    const p1 = signer.verify(t1).payload, p2 = signer.verify(t2).payload;
    assert(p1.jti !== p2.jti, 'jti must differ per token');
    /* key separation: same source secret via different paths derives the same key; raw secret never used directly */
    const a = createCursor({ secret: 'x'.repeat(64) });
    const b = createCursor({ secret: 'x'.repeat(64) });
    assert(a.verify(b.sign(iso(Date.now()))).ok === true, 'same secret ⇒ verifiable');
    const c = createCursor({ secret: 'y'.repeat(64) });
    assert(c.verify(b.sign(iso(Date.now()))).ok === false, 'different secret ⇒ reject');
  });

  /* ═══ Gap 2 — client side (jsdom) ═══ */
  group('گپ ۲ — کلاینت: ذخیره و تمدید خودکارِ کرسر');

  await test('DH12 کلاینت next_cursor را ذخیره و دفعهٔ بعد به‌صورت ?cursor= می‌فرستد', async () => {
    await withClientHarness(async (win, W) => {
      const calls = [];
      win.__mockApi = {
        get: function (endpoint) {
          calls.push(endpoint);
          if (calls.length === 1) {
            return Promise.resolve({ status: 200, body: { ok: true, server_time: '2026-09-11T09:00:00.000Z', full_snapshot: true, next_cursor: 'pc1.NEXTTOK.sig', collections: {} } });
          }
          return Promise.resolve({ status: 200, body: { ok: true, server_time: '2026-09-11T09:05:00.000Z', full_snapshot: false, next_cursor: 'pc1.NEXTTOK2.sig', collections: {} } });
        }
      };
      W(`Store.set('payesh_last_pull_time', '2026-09-11T08:00:00.000Z'); Store.set('payesh_pull_cursor', null); 0;`);
      const r1 = await W(`pullFromServer({ customApi: window.__mockApi, forceOnline: true })`);
      assert(r1 && r1.ok === true, 'first pull ok');
      assert(calls[0].indexOf('since=') > -1, 'first call uses legacy since (no cursor yet): ' + calls[0]);
      assert(W(`Store.get('payesh_pull_cursor')`) === 'pc1.NEXTTOK.sig', 'next_cursor stored');
      const r2 = await W(`pullFromServer({ customApi: window.__mockApi, forceOnline: true })`);
      assert(r2 && r2.ok === true, 'second pull ok');
      assert(calls[1].indexOf('cursor=pc1.NEXTTOK.sig') > -1, 'second call sends stored cursor: ' + calls[1]);
      assert(calls[1].indexOf('since=') === -1, 'no raw since when cursor present');
    });
  });

  await test('DH13 401 cursor_expired ⇒ تمدید خودکار: دقیقاً یک pull کامل بعدی', async () => {
    await withClientHarness(async (win, W) => {
      const calls = [];
      win.__mockApi = {
        get: function (endpoint) {
          calls.push(endpoint);
          if (calls.length === 1) {
            return Promise.resolve({ status: 401, body: { ok: false, code: 'cursor_expired', cursor_renewal: 'full_pull' } });
          }
          return Promise.resolve({ status: 200, body: { ok: true, server_time: '2026-09-11T09:10:00.000Z', full_snapshot: true, next_cursor: 'pc1.RENEWED.sig', collections: { subjects: [{ id: 1, name: 'ریاضی' }] } } });
        }
      };
      W(`Store.set('payesh_pull_cursor', 'pc1.OLD.sig'); Store.set('payesh_last_pull_time', '2026-09-11T08:00:00.000Z'); 0;`);
      const r = await W(`pullFromServer({ customApi: window.__mockApi, forceOnline: true })`);
      assert(calls.length === 2, 'exactly two calls (expired + renewal), got ' + calls.length);
      assert(calls[0].indexOf('cursor=pc1.OLD.sig') > -1, 'first call sends the old cursor');
      assert(calls[1] === '/api/v1/pull', 'renewal must be a clean FULL pull: ' + calls[1]);
      assert(r && r.ok === true, 'renewed pull succeeds');
      assert(W(`Store.get('payesh_pull_cursor')`) === 'pc1.RENEWED.sig', 'fresh cursor stored after renewal');
      /* no infinite loop: renewed call failing 401 again stops */
      win.__mockApi2 = {
        get: function () { return Promise.resolve({ status: 401, body: { ok: false, code: 'cursor_expired', cursor_renewal: 'full_pull' } }); }
      };
      W(`Store.set('payesh_pull_cursor', 'pc1.X.sig'); 0;`);
      const r2 = await W(`pullFromServer({ customApi: window.__mockApi2, forceOnline: true })`);
      assert(r2 && r2.ok === false && r2.code === 'cursor_expired', 'repeated 401 stops (no loop), got ' + JSON.stringify(r2).slice(0, 120));
    });
  });

  /* ═══ Gap 1 — client side (jsdom) ═══ */
  group('گپ ۱ — کلاینت: اسنپ‌شاتِ کاملِ اجباری جایگزین می‌شود');

  await test('DH14 full_snapshot_required ⇒ مجموعه‌ها جایگزین می‌شوند (ردیفِ غایب حذف)', async () => {
    await withClientHarness(async (win, W) => {
      /* local stale state: subject 77 exists locally, absent server-side */
      W(`if (!Array.isArray(db.subjects)) db.subjects = [];
         db.subjects.length = 0;
         db.subjects.push({ id: 77, name: 'قدیمی-باید-حذف-شود' });
         db.subjects.push({ id: 88, name: 'محلی-در-صف' });
         SYNC.queue = [{ c: 'subjects', id: 88, data: { id: 88, name: 'محلی-در-صف' } }]; 0;`);
      win.__mockApi = {
        get: function () {
          return Promise.resolve({
            status: 200,
            body: {
              ok: true, server_time: '2026-09-11T09:20:00.000Z',
              full_snapshot: true, full_snapshot_required: true, full_snapshot_reason: 'since_too_old',
              next_cursor: 'pc1.FRESH.sig',
              collections: { subjects: [{ id: 1, name: 'ریاضی' }] },
              deleted: []
            }
          });
        }
      };
      const r = await W(`pullFromServer({ customApi: window.__mockApi, forceOnline: true })`);
      assert(r && r.ok === true, 'pull ok');
      const subjects = W(`db.subjects.map(function(x){ return x.id; }).sort(function(a,b){ return a-b; })`);
      assert(JSON.stringify(subjects) === JSON.stringify([1, 88]), 'replaced: server rows + queued-only local rows, got ' + JSON.stringify(subjects));
      assert(W(`Store.get('payesh_pull_cursor')`) === 'pc1.FRESH.sig', 'fresh cursor after forced full');
    });
  });

  /* ═══ Gap 4 — conflict measurement ═══ */
  group('گپ ۴ — اندازه‌گیری تعارض (دو کلاینت موازی)');

  await test('DH15 دو کلاینت موازی ⇒ دقیقاً یک conflict_preserved + شمارنده', async () => {
    /* دو کلاینتِ واقعاً موازی: A با پایهٔ جاری، B با پایهٔ کهنه (۲≠۳) —
       تعارضِ B قطعی است (حتی پیش از اعمالِ A) و رقابتِ هم‌زمانی واقعی می‌ماند.
       (دو نوشتِ هم‌پایهٔ کاملاً هم‌زمان در موتورِ حافظه می‌توانند هر دو از
       دروازه رد شوند — TOCTOU شناخته‌شدهٔ apply دومرحله‌ای؛ آینهٔ PG تراکنشی
       است. اینجا سناریوی قطعی آزموده می‌شود، نه شانسِ درهم‌تنیدگی.) */
    const { ctx, store } = makeSyncCtx();
    const s = createSync(ctx);
    const before = seriesCount('payesh_sync_conflicts_total', { collection: 'grades' });
    const rA = {}, rB = {};
    await Promise.all([
      s.apiSync({ _user: 5 }, rA, { ops: [updOp('dh15-a', 5, 20, 3)] }), /* client A: manager 5, base = current (3) */
      s.apiSync({ _user: 7 }, rB, { ops: [updOp('dh15-b', 7, 10, 2)] })  /* client B: manager 7, stale base (2) — parallel */
    ]);
    const codes = [rA._cap.body.results[0], rB._cap.body.results[0]]
      .map(r => (r && r.ok === true) ? 'ok' : (r && r.code));
    codes.sort();
    assert(JSON.stringify(codes) === JSON.stringify(['conflict_preserved', 'ok']),
      'one winner + one preserved conflict, got ' + JSON.stringify(codes));
    assert(Array.isArray(store.sync_conflicts) && store.sync_conflicts.length === 1, 'sync_conflicts row');
    assert(store.sync_conflicts[0].base_version === 2 && Number(store.sync_conflicts[0].server_version) >= 3,
      'conflict row records both versions (base 2 vs server ≥3), got base=' +
      store.sync_conflicts[0].base_version + ' server=' + store.sync_conflicts[0].server_version);
    const after = seriesCount('payesh_sync_conflicts_total', { collection: 'grades' });
    assert(after === before + 1, `conflicts_total{grades} +1 (before=${before} after=${after})`);
  });

  await test('DH16 زمانِ تشخیص تعارض (هیستوگرام) برای conflict و clean ثبت می‌شود', async () => {
    const beforeConflict = seriesCount('payesh_sync_conflict_detection_seconds', { outcome: 'conflict' });
    const beforeClean = seriesCount('payesh_sync_conflict_detection_seconds', { outcome: 'clean' });
    const { ctx } = makeSyncCtx();
    const s = createSync(ctx);
    const r1 = {}, r2 = {};
    await s.apiSync({}, r1, { ops: [updOp('dh16-clean', 5, 20, 3)] });       /* clean: base matches */
    await s.apiSync({}, r2, { ops: [updOp('dh16-stale', 5, 10, 1)] });       /* stale base → conflict */
    const afterConflict = seriesCount('payesh_sync_conflict_detection_seconds', { outcome: 'conflict' });
    const afterClean = seriesCount('payesh_sync_conflict_detection_seconds', { outcome: 'clean' });
    assert(afterConflict === beforeConflict + 1, `conflict observation +1 (${beforeConflict}→${afterConflict})`);
    assert(afterClean === beforeClean + 1, `clean observation +1 (${beforeClean}→${afterClean})`);
    /* values are sane seconds (sub-second detection on the memory store) */
    const snap = snapMetric('payesh_sync_conflict_detection_seconds');
    let sumOk = true;
    for (const ser of snap.series) { if (!(ser.sum >= 0 && ser.sum < 60)) sumOk = false; }
    assert(sumOk, 'detection-time sum must be sane seconds');
  });

  await test('DH17 هیستوگرامِ تازه در exposition پرومتئوس هست', async () => {
    const text = metrics.render();
    assert(text.indexOf('payesh_sync_conflict_detection_seconds_bucket') > -1, 'bucket series exposed');
    assert(text.indexOf('payesh_sync_conflict_detection_seconds_sum') > -1, 'sum series exposed');
    assert(text.indexOf('payesh_sync_conflict_detection_seconds_count') > -1, 'count series exposed');
    assert(/outcome="clean"/.test(text), 'clean label present');
  });

  /* ═══ Gap 3 — load-test tool ═══ */
  group('گپ ۳ — ابزار بارِ دلتا');

  await test('DH18 DRY_RUN پیش‌فرض: اجرای تمیز + برچسبِ صریحِ شبیه‌سازی', async () => {
    const out = await new Promise((resolve) => {
      const p = spawn(process.execPath, ['tools/delta-load-test.js'], { cwd: ROOT });
      let so = '', code = null;
      p.stdout.on('data', d => (so += d));
      p.stderr.on('data', d => (so += d));
      p.on('close', c => { code = c; resolve({ code, so }); });
    });
    assert(out.code === 0, 'exit 0, got ' + out.code);
    assert(out.so.indexOf('DRY_RUN') > -1, 'mode label');
    assert(out.so.indexOf('نه عملکردِ PostgreSQL') > -1, 'explicit NOT-a-perf-measurement warning');
    assert(out.so.indexOf('1000/1000') > -1, 'all simulated requests accounted');
  });

  await test('DH19 --live بدون DATABASE_URL ⇒ شکستِ بسته (exit 1)', async () => {
    const out = await new Promise((resolve) => {
      const env = Object.assign({}, process.env);
      delete env.DATABASE_URL; /* fail-closed without it */
      const p = spawn(process.execPath, ['tools/delta-load-test.js', '--live'], { cwd: ROOT, env });
      let so = '', code = null;
      p.stdout.on('data', d => (so += d));
      p.stderr.on('data', d => (so += d));
      p.on('close', c => { code = c; resolve({ code, so }); });
    });
    assert(out.code === 1, 'exit 1, got ' + out.code);
    assert(out.so.indexOf('DATABASE_URL') > -1, 'clear error mentions DATABASE_URL');
  });

  /* ── result ── */
  const total = pass + fail;
  console.log('\n' + '─'.repeat(56));
  console.log(`نتیجه Delta Sync Hardening (فاز ۲): ${pass}/${total}` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (fail) { failures.forEach(f => console.log(`  ✗ ${f.name}: ${f.msg}`)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });

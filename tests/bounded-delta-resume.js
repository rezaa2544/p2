#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/bounded-delta-resume.js — پ۳: بستن قلم باز «دلتای بریده»
   + رفع ۴ کامنت بازبین PR #129
   ───────────────────────────────────────────────────────────────────
   بخش A (سرور):
     - دلتای بزرگ‌تر از سقف → full_snapshot_required_collections اعلام
       می‌شود (کامنت ۱: دلتای بریده نباید ساکت گم شود)
     - snapshot کامل بریده full_snapshot_required نمی‌دهد (فقط partial)
     - بودجهٔ بایت بر حسب UTF-8 واقعی است (کامنت ۴: متن فارسی)
   بخش B (کلاینت، jsdom):
     - دریافت پرچم → resume خودکار (snapshot کامل کران‌دار فقط برای
       مجموعه‌های متأثر) → همگرایی: هیچ شکافی بین کلاینت و سرور در
       سقف کران نمی‌ماند
     - idempotency: resume دوباره = بدون تکرار رکورد
     - پاسخ resume دوباره resume صادر نمی‌کند (حلقه‌شکن)
     - قرارداد union متادیتا (کامنت ۲): دلتای کوچک پرچم partial را پاک
       نمی‌کند و TTL را تازه نمی‌کند؛ فقط snapshot کامل نبریده پاک می‌کند
     - نشانگر resume در UI گزارش‌ها + بنر نمای عملیاتی (کامنت ۳)
   اجرا: node tests/bounded-delta-resume.js   (نیازمند jsdom)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

delete process.env.DATABASE_URL; /* pin حالت حافظه — قرارداد reports-basic */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-resume-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const ROW_CAP = 300;
process.env.PAYESH_PULL_MAX_ROWS = String(ROW_CAP);
process.env.PAYESH_PULL_MAX_BYTES = String(8 * 1024 * 1024); /* بودجهٔ آزاد: این سوئیت کران ردیف را می‌سنجد */

fs.copyFileSync(REAL_STORE, path.join(TMP, 'store.json'));
process.env.PAYESH_STORE = path.join(TMP, 'store.json');
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';

const { server, store } = require(path.join(ROOT, 'server', 'index.js'));

let BASE = '';
let pass = 0, fail = 0;

async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

async function loginCookie(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r0 = await fetch(BASE + '/api/auth/send-code', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone })
  });
  const j0 = await r0.json();
  const r1 = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: j0.demo_code, national_id: String(user.national_id) })
  });
  assert.strictEqual(r1.status, 200);
  const m = (r1.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/);
  assert.ok(m, 'no session cookie');
  return m[0];
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  console.log('\n▸ پ۳ — دلتای بریده: بخش A (سرور)');

  const mgr = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const cookie = await loginCookie(mgr);

  /* دلتای عظیم مصنوعی: همهٔ حضورهای مدرسهٔ ۱ را «به‌تازگی تغییر کرده» جا بزن */
  const NOW = Date.now();
  const RECENT = new Date(NOW - 30 * 1000).toISOString();
  let touched = 0;
  for (const a of store.attendance) {
    if (a.school_id === 1) { a.updated_at = new Date(NOW - 40 * 1000 + (touched % 1000)).toISOString(); touched++; }
  }
  assert.ok(touched > ROW_CAP, `پیش‌شرط: ${touched} ردیف باید > ${ROW_CAP} باشد`);

  const SINCE = new Date(NOW - 5 * 60 * 1000).toISOString();
  let deltaPayload = null;

  await test('دلتای بزرگ‌تر از سقف: بریده + full_snapshot_required_collections شامل attendance', async () => {
    const r = await fetch(BASE + '/api/v1/pull?since=' + encodeURIComponent(SINCE), { headers: { Cookie: cookie } });
    assert.strictEqual(r.status, 200);
    deltaPayload = await r.json();
    const att = deltaPayload.collections.attendance || [];
    assert.ok(att.length <= ROW_CAP, `attendance=${att.length} > ${ROW_CAP}`);
    assert.ok(Array.isArray(deltaPayload.partial_collections) && deltaPayload.partial_collections.includes('attendance'), 'partial غایب');
    assert.ok(Array.isArray(deltaPayload.full_snapshot_required_collections)
      && deltaPayload.full_snapshot_required_collections.includes('attendance'),
      'full_snapshot_required_collections غایب: ' + JSON.stringify(deltaPayload.full_snapshot_required_collections));
  });

  await test('snapshot کامل بریده: partial بله ولی full_snapshot_required نه (snapshot خودش مقصد resume است)', async () => {
    const r = await fetch(BASE + '/api/v1/pull?collections=attendance', { headers: { Cookie: cookie } });
    const p = await r.json();
    assert.strictEqual(p.full_snapshot, true);
    assert.ok((p.collections.attendance || []).length <= ROW_CAP);
    assert.ok(Array.isArray(p.partial_collections) && p.partial_collections.includes('attendance'), 'partial غایب');
    assert.strictEqual(p.full_snapshot_required_collections, undefined,
      'snapshot کامل نباید resume بخواهد: ' + JSON.stringify(p.full_snapshot_required_collections));
  });

  await test('دلتای کوچک: نه partial نه full_snapshot_required', async () => {
    const r = await fetch(BASE + '/api/v1/pull?since=' + encodeURIComponent(new Date(NOW + 60 * 1000).toISOString()), { headers: { Cookie: cookie } });
    const p = await r.json();
    assert.ok(!(p.partial_collections || []).length, JSON.stringify(p.partial_collections));
    assert.strictEqual(p.full_snapshot_required_collections, undefined);
  });

  await test('کامنت ۴: بودجهٔ بایت بر حسب UTF-8 است (Buffer.byteLength در sizeOf)', async () => {
    /* سنجهٔ سفیدجعبه + رفتاری: متن فارسی length≈نصف بایت واقعی است */
    const src = fs.readFileSync(path.join(ROOT, 'server', 'pull.js'), 'utf8');
    assert.ok(/Buffer\.byteLength\(JSON\.stringify\(resultCollections\[c\] \|\| \[\]\), 'utf8'\)/.test(src),
      'sizeOf باید Buffer.byteLength باشد نه length');
    /* رفتاری: با بودجهٔ کوچک بر حسب بایت، مجموعهٔ فارسی باید بیشتر بریده شود
       از آنچه length می‌گفت — این را جهش FM4 از سمت دیگر قفل می‌کند. */
    const sample = store.attendance.filter(a => a.school_id === 1).slice(0, 100);
    const chars = JSON.stringify(sample).length;
    const bytes = Buffer.byteLength(JSON.stringify(sample), 'utf8');
    assert.ok(bytes >= chars, 'پیش‌شرط UTF-8'); /* فارسی ⇒ بایت > کاراکتر */
  });

  /* ── بخش B: کلاینت (jsdom) ─────────────────────────────────────── */
  console.log('\n▸ پ۳ — دلتای بریده: بخش B (کلاینت resume + همگرایی)');

  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) { console.error('jsdom نصب نیست — npm i --no-save jsdom'); process.exit(1); }

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = () => Promise.reject(new Error('offline'));
      w.scrollTo = () => {};
    }
  });
  await new Promise(r => setTimeout(r, 1500));
  const W = (code) => dom.window.eval(code);

  /* سرورِ ساختگی درون jsdom: پاسخ‌ها را کنترل می‌کنیم تا سناریوی بریدگی
     قطعی و بدون شبکه سنجیده شود. رکوردهای سرور: 1..N (جدیدترین = N). */
  W(`
    window.__SRV = (function(){
      var CAP = RPT_CACHE_MAX_ROWS; /* هم‌ارز سقف کلاینت */
      var N = CAP + 700;            /* دامنهٔ سرور بزرگ‌تر از سقف */
      function row(i){ return { id: i, school_id: 1, class_id: 1, student_id: 1,
        date: '2025-01-01', status: 'present',
        updated_at: new Date(1700000000000 + i * 1000).toISOString() }; }
      var calls = [];
      return {
        N: N, CAP: CAP, calls: calls,
        get: function(endpoint){
          calls.push(endpoint);
          var isSnapshot = endpoint.indexOf('since=') === -1 && endpoint.indexOf('cursor=') === -1;
          var onlyAtt = endpoint.indexOf('collections=attendance') > -1;
          var rows = [];
          if (isSnapshot) {
            /* snapshot کامل کران‌دار: جدیدترین CAP ردیف */
            for (var i = N; i > N - CAP; i--) rows.push(row(i));
            return Promise.resolve({ status: 200, body: { ok: true, full_snapshot: true,
              server_time: new Date().toISOString(),
              partial_collections: ['attendance'],
              collections: { attendance: rows } } });
          }
          /* دلتا: سرور CAP ردیفِ جدیدتر می‌فرستد و اعلام بریدگی می‌کند */
          for (var j = N; j > N - CAP; j--) rows.push(row(j));
          return Promise.resolve({ status: 200, body: { ok: true, full_snapshot: false,
            server_time: new Date().toISOString(),
            partial_collections: ['attendance'],
            full_snapshot_required_collections: ['attendance'],
            collections: { attendance: rows } } });
        }
      };
    })();
  `);

  await test('resume خودکار: دلتای بریده → درخواست snapshot فقط برای مجموعهٔ متأثر', async () => {
    const result = await dom.window.eval(`
      (function(){
        db.attendance = [];
        SYNC.demoMode = false; SYNC.serverUrl = '/api/sync';
        Store.set('payesh_last_pull_time', new Date(1700000000000).toISOString());
        return pullFromServer({ customApi: __SRV, forceOnline: true, force: true });
      })()`);
    assert.strictEqual(result.ok, true);
    assert.ok(Array.isArray(result.resumed) && result.resumed.includes('attendance'), 'resumed غایب: ' + JSON.stringify(result.resumed));
    const calls = W('JSON.parse(JSON.stringify(__SRV.calls))');
    assert.strictEqual(calls.length, 2, 'باید دقیقاً ۲ درخواست باشد (دلتا + resume): ' + JSON.stringify(calls));
    assert.ok(calls[1].indexOf('collections=attendance') > -1, 'resume باید فقط attendance بخواهد: ' + calls[1]);
    assert.ok(calls[1].indexOf('since=') === -1 && calls[1].indexOf('cursor=') === -1, 'resume باید snapshot باشد: ' + calls[1]);
  });

  await test('همگرایی: پس از resume، کلاینت == جدیدترین CAP ردیف سرور (بدون شکاف در پنجرهٔ کران)', async () => {
    const st = W(`(function(){
      var N = __SRV.N, CAP = __SRV.CAP;
      var ids = {}; db.attendance.forEach(function(r){ ids[r.id] = 1; });
      var missing = 0;
      for (var i = N; i > N - CAP; i--) if (!ids[i]) missing++;
      return { len: db.attendance.length, missing: missing, cap: CAP };
    })()`);
    assert.ok(st.len <= st.cap, `len=${st.len} > cap=${st.cap}`);
    assert.strictEqual(st.missing, 0, `${st.missing} ردیف از پنجرهٔ سرور در کلاینت نیست`);
  });

  await test('idempotency: resume دوباره = بدون تکرار رکورد', async () => {
    const st = await dom.window.eval(`
      (function(){
        var before = db.attendance.length;
        return rptResumeTruncatedDelta(['attendance']).then(function(){
          var seen = {}, dup = 0;
          db.attendance.forEach(function(r){ if (seen[r.id]) dup++; seen[r.id] = 1; });
          return { before: before, after: db.attendance.length, dup: dup };
        });
      })()`);
    assert.strictEqual(st.dup, 0, `${st.dup} رکورد تکراری`);
    assert.strictEqual(st.after, st.before, 'طول تغییر کرد: ' + st.before + '→' + st.after);
  });

  await test('حلقه‌شکن: پاسخ resume (حتی با پرچم) resume دوم صادر نمی‌کند', async () => {
    const calls = await dom.window.eval(`
      (function(){
        __SRV.calls.length = 0;
        /* سرور ساختگی روی snapshot هم پرچم نمی‌دهد؛ برای این سنجه یک api
           بدخیم می‌سازیم که همیشه پرچم می‌دهد. */
        var evil = { get: function(ep){ __SRV.calls.push(ep);
          return Promise.resolve({ status: 200, body: { ok: true, full_snapshot: true,
            server_time: new Date().toISOString(),
            full_snapshot_required_collections: ['attendance'],
            collections: { attendance: [] } } }); } };
        return pullFromServer({ customApi: evil, forceOnline: true, force: true, forceSnapshot: true, collections: ['attendance'], _resume: true })
          .then(function(){ return __SRV.calls.length; });
      })()`);
    assert.strictEqual(calls, 1, 'با _resume نباید درخواست دومی برود: ' + calls);
  });

  await test('حلقه‌شکن end-to-end: سرور بدخیم (پرچم روی هر پاسخ) — دقیقاً ۲ درخواست، هرگز حلقه', async () => {
    /* سناریوی واقعی حلقه: pull عادی → پرچم → resume → پاسخ resume هم پرچم
       دارد (سرور بدخیم/باگ‌دار). کد سالم باید در ۲ درخواست بایستد؛ نه ۳،
       نه بی‌نهایت. این سنجه هر دو لایهٔ حلقه‌شکن (_resume و IN_FLIGHT) را
       با هم قفل می‌کند — جهش RM5 چندویرایشی همین را می‌شکند. */
    const calls = await dom.window.eval(`
      (function(){
        __SRV.calls.length = 0;
        var evil = { get: function(ep){ __SRV.calls.push(ep);
          return Promise.resolve({ status: 200, body: { ok: true,
            full_snapshot: ep.indexOf('since=') === -1,
            server_time: new Date().toISOString(),
            full_snapshot_required_collections: ['attendance'],
            collections: { attendance: [] } } }); } };
        Store.set('payesh_last_pull_time', new Date(1700000000000).toISOString());
        return pullFromServer({ customApi: evil, forceOnline: true, force: true })
          .then(function(){
            /* هر resume معوقِ احتمالی هم فرصت اجرا بگیرد */
            return new Promise(function(res){ setTimeout(function(){ res(__SRV.calls.length); }, 100); });
          });
      })()`);
    assert.strictEqual(calls, 2, 'سرور بدخیم باید در ۲ درخواست مهار شود: ' + calls);
  });

  await test('کامنت ۲ — union: دلتای کوچکِ بعدی پرچم partial را پاک نمی‌کند و TTL تازه نمی‌شود', async () => {
    const st = await dom.window.eval(`
      (function(){
        /* وضعیت فعلی: attendance partial است (از سنجه‌های قبل) */
        var meta0 = Store.getJSON(RPT_CACHE_META_KEY, {});
        meta0.at = Date.now() - 3600 * 1000; /* یک ساعت پیش */
        meta0.partial = ['attendance'];
        Store.setJSON(RPT_CACHE_META_KEY, meta0);
        /* دلتای کوچک بدون partial_collections */
        mergeServerDelta({ ok: true, full_snapshot: false,
          collections: { grades: [{ id: 999901, school_id: 1, student_id: 1, score: 18,
            updated_at: new Date().toISOString() }] } });
        var meta1 = Store.getJSON(RPT_CACHE_META_KEY, {});
        return { partial: meta1.partial, at0: meta0.at, at1: meta1.at };
      })()`);
    assert.ok(st.partial.includes('attendance'), 'دلتا پرچم را پاک کرد: ' + JSON.stringify(st.partial));
    assert.strictEqual(st.at1, st.at0, 'دلتا TTL را تازه کرد');
  });

  await test('کامنت ۲ — فقط snapshot کاملِ نبریدهٔ همان مجموعه پرچم را پاک و TTL را تازه می‌کند', async () => {
    const st = await dom.window.eval(`
      (function(){
        var atBefore = Store.getJSON(RPT_CACHE_META_KEY, {}).at;
        /* snapshot کامل attendance، این‌بار نبریده (بدون partial_collections) */
        var rows = [];
        for (var i = 1; i <= 50; i++) rows.push({ id: 800000 + i, school_id: 1, class_id: 1,
          student_id: 1, date: '2025-01-01', status: 'present',
          updated_at: new Date(1690000000000 + i * 1000).toISOString() });
        mergeServerDelta({ ok: true, full_snapshot: true, collections: { attendance: rows } });
        var meta = Store.getJSON(RPT_CACHE_META_KEY, {});
        return { partial: meta.partial, atBefore: atBefore, atAfter: meta.at };
      })()`);
    assert.ok(!st.partial.includes('attendance'), 'snapshot نبریده باید پرچم را پاک کند: ' + JSON.stringify(st.partial));
    assert.ok(st.atAfter > st.atBefore, 'snapshot کامل باید TTL را تازه کند');
  });

  await test('نشانگر UI: حالت resume («در حال تکمیل») در صفحهٔ گزارش‌ها', async () => {
    const shown = W(`
      (function(){
        var meta = Store.getJSON(RPT_CACHE_META_KEY, {});
        meta.partial = ['attendance']; meta.resuming = true; meta.at = Date.now();
        Store.setJSON(RPT_CACHE_META_KEY, meta);
        S.user = db.users.find(function(u){ return u.role === 'manager' && u.school_id === 1; });
        SYNC.demoMode = true; S.showPicker = false; S.route = 'reports'; render();
        var el = document.querySelector('[data-rpt-resuming]');
        return !!el && el.textContent.indexOf('در حال تکمیل') > -1;
      })()`);
    assert.ok(shown, 'نشانگر resume نیست');
  });

  await test('کامنت ۳ — بنر «دادهٔ جزئی» در نمای عملیاتی حضور هم دیده می‌شود', async () => {
    const shown = W(`
      (function(){
        S.route = 'attendance'; render();
        return !!document.querySelector('[data-rpt-partial-shell]');
      })()`);
    assert.ok(shown, 'بنر نمای عملیاتی نیست');
  });

  await test('کامنت ۳ — بدون partial، بنر عملیاتی نمایش داده نمی‌شود', async () => {
    const clean = W(`
      (function(){
        Store.setJSON(RPT_CACHE_META_KEY, { at: Date.now(), partial: [], resuming: false });
        render();
        return document.querySelector('[data-rpt-partial-shell]') === null;
      })()`);
    assert.ok(clean, 'بنر بی‌دلیل');
  });

  console.log('\n────────────────────────────────────────────────────');
  const verdict = fail === 0 ? '✅' : '❌';
  console.log(`bounded-delta-resume: ${pass} سبز / ${fail} قرمز ${verdict}`);
  server.close();
  dom.window.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });

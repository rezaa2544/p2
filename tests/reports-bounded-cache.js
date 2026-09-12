#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/reports-bounded-cache.js — P0-2: کشِ کرانداِر گزارش‌ها در مرورگر
   ───────────────────────────────────────────────────────────────────
   دفاعِ دولایه در برابرِ ورودِ دیتاستِ ملی به مرورگر:
   بخش A (سرور — server/pull.js):
     - superadmin با pull کامل هرگز بیش از سقفِ ردیف per-collection از
       مجموعه‌های سنگینِ گزارشی نمی‌گیرد + بودجهٔ بایت + partial_collections
     - کران تازه‌ترین‌ها را نگه می‌دارد (نه دلخواه)
     - scope دست‌نخورده: مدیر همچنان فقط مدرسهٔ خودش را می‌بیند و کران
       چیزی به دامنه اضافه نمی‌کند
   بخش B (کلاینت — src/js/29-pull.js + 77-reports.js، jsdom):
     - mergeServerDelta با payload بزرگ‌تر از سقف: db[c] کران می‌خورد
       (سرورِ جعلی/قدیمی هم نمی‌تواند مرورگر را پر کند)
     - متادیتای partial ثبت و نشانگرِ «دادهٔ جزئی» در صفحهٔ گزارش‌ها
       رندر می‌شود؛ TTL گذشته → نشانگرِ کهنگی
     - scope کلاینت: کران رکوردِ مدرسهٔ دیگر وارد نمی‌کند
   اجرا: node tests/reports-bounded-cache.js   (نیازمند jsdom)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

/* pin حالتِ حافظه — همان قراردادِ reports-basic (این سوئیت قرارداد کران را
   روی store حافظه می‌سنجد؛ گیتِ PG جدا است). */
delete process.env.DATABASE_URL;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rpt-cache-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

/* سقفِ کوچک برای آزمون تا با استورِ دمو (attendance=10537) قطعاً فعال شود.
   بودجهٔ بایت عمداً کوچک‌تر از خروجیِ «فقط-کرانِ-ردیف» است (۴۰۰ ردیف × ۴
   مجموعهٔ سنگین ≈ >64KB) تا مسیرِ بودجه واقعاً بند شود — درسِ جهشِ BM4:
   با بودجهٔ 1MB سنجه هرگز فعال نمی‌شد و جهشِ حذفِ بودجه زنده می‌ماند. */
process.env.PAYESH_PULL_MAX_ROWS = '400';
const BYTE_CAP = 64 * 1024;
process.env.PAYESH_PULL_MAX_BYTES = String(BYTE_CAP);

fs.copyFileSync(REAL_STORE, path.join(TMP, 'store.json'));
process.env.PAYESH_STORE = path.join(TMP, 'store.json');
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';

const { server, store } = require(path.join(ROOT, 'server', 'index.js'));

let BASE = '';
let pass = 0, fail = 0;

async function req(method, p, { body, cookie } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      body ? { 'Content-Type': 'application/json' } : {},
      cookie ? { Cookie: cookie } : {}
    ),
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}

async function loginAs(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  assert.strictEqual(r.status, 200);
  const code = r.json.demo_code;
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(user.national_id) } });
  assert.strictEqual(r.status, 200, 'login failed: ' + JSON.stringify(r.json));
  const res = await fetch(BASE + '/api/auth/login', { method: 'POST' }); /* فقط برای گرفتن هدر نبود؛ نگه‌دار */
  return r;
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
  const sc = r1.headers.get('set-cookie') || '';
  const m = sc.match(/payesh_session=[^;]+/);
  assert.ok(m, 'no session cookie');
  return m[0];
}

async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

const ROW_CAP = 400;
const HEAVY = ['attendance', 'grades', 'discipline', 'hw_submissions'];

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  console.log('\n▸ P0-2 — کش کراندار گزارش‌ها: بخش A (سرور)');

  const sup = store.users.find(u => u.role === 'superadmin');
  const supCookie = await loginCookie(sup);

  let supPull = null;
  await test('superadmin: pull کامل هیچ مجموعهٔ سنگینی بیش از سقف ردیف ندارد', async () => {
    const r = await fetch(BASE + '/api/v1/pull', { headers: { Cookie: supCookie } });
    assert.strictEqual(r.status, 200);
    supPull = await r.json();
    assert.strictEqual(supPull.ok, true);
    for (const c of HEAVY) {
      const n = (supPull.collections[c] || []).length;
      assert.ok(n <= ROW_CAP, `${c}: ${n} > ${ROW_CAP}`);
    }
  });

  await test('superadmin: مجموعهٔ بریده در partial_collections اعلام می‌شود', async () => {
    assert.ok(Array.isArray(supPull.partial_collections), 'partial_collections غایب');
    /* attendance=10537 در استور دمو، قطعاً بریده شده */
    assert.ok(supPull.partial_collections.includes('attendance'), JSON.stringify(supPull.partial_collections));
  });

  await test('کران تازه‌ترین‌ها را نگه می‌دارد (کهنه‌ترین ردیف دامنه حذف شده)', async () => {
    const kept = supPull.collections.attendance;
    const keptIds = new Set(kept.map(r => r.id));
    const recency = (r) => {
      const t = r.updated_at || r.created_at;
      const ms = t ? new Date(t).getTime() : NaN;
      return isNaN(ms) ? (Number(r.id) || 0) : ms;
    };
    const all = store.attendance.slice().sort((a, b) => recency(b) - recency(a));
    /* جدیدترین باید مانده باشد و کهنه‌ترین حذف */
    assert.ok(keptIds.has(all[0].id), 'جدیدترین ردیف حذف شده');
    assert.ok(!keptIds.has(all[all.length - 1].id), 'کهنه‌ترین ردیف هنوز هست');
  });

  await test('بودجهٔ بایت: مجموع سنگین‌ها زیر سقف بایت است (سقف بندشونده)', async () => {
    const total = HEAVY.reduce((n, c) => n + JSON.stringify(supPull.collections[c] || []).length, 0);
    assert.ok(total <= BYTE_CAP, `مجموع ${total} > ${BYTE_CAP}`);
    /* سنجهٔ ضدجعل: اثبات این‌که بودجه واقعاً فعال شده — خروجیِ فقط-کرانِ-ردیفِ
       ۴۰۰تایی روی استورِ دمو بزرگ‌تر از سقف است، پس دست‌کم یک مجموعه باید
       کوچک‌تر از کرانِ ردیف شده باشد. */
    const anyBelowRowCap = HEAVY.some(c => {
      const n = (supPull.collections[c] || []).length;
      const domain = (store[c] || []).length;
      return domain > ROW_CAP && n < ROW_CAP;
    });
    assert.ok(anyBelowRowCap, 'بودجهٔ بایت هیچ مجموعه‌ای را نبرید — سنجه بند نشده');
  });

  const mgr = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const mgrCookie = await loginCookie(mgr);

  await test('scope دست‌نخورده: مدیر فقط مدرسهٔ خودش + زیر سقف', async () => {
    const r = await fetch(BASE + '/api/v1/pull', { headers: { Cookie: mgrCookie } });
    const p = await r.json();
    for (const c of ['attendance', 'grades']) {
      const rows = p.collections[c] || [];
      assert.ok(rows.length <= ROW_CAP, `${c}: ${rows.length} > ${ROW_CAP}`);
      for (const row of rows) assert.strictEqual(Number(row.school_id), 1, `${c}: نشت school_id=${row.school_id}`);
    }
  });

  await test('کران ردیف مستقل از بودجهٔ بایت است (سرور دوم با بودجهٔ آزاد)', async () => {
    /* درسِ جهشِ BM2: با بودجهٔ بایتِ کوچک، حذفِ کرانِ ردیف پنهان می‌ماند
       (بودجه همه را می‌بُرد). سرورِ دوم در subprocess با بودجهٔ عملاً
       بی‌نهایت بوت می‌شود — تنها خطِ دفاع همین کرانِ ردیف است. */
    const cp = require('child_process');
    const script = `
      process.env.PAYESH_PULL_MAX_ROWS = '400';
      process.env.PAYESH_PULL_MAX_BYTES = String(1024*1024*1024);
      const { server, store } = require(${JSON.stringify(path.join(ROOT, 'server', 'index.js'))});
      server.listen(0, '127.0.0.1', async () => {
        const B = 'http://127.0.0.1:' + server.address().port;
        const sup = store.users.find(u => u.role === 'superadmin');
        const phone = String(sup.phone).replace(/[\\s\\-()]/g, '');
        let r = await fetch(B + '/api/auth/send-code', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phone }) });
        const j = await r.json();
        if (!j.demo_code) { console.error('send-code: ' + r.status + ' ' + JSON.stringify(j)); process.exit(7); }
        r = await fetch(B + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phone, code: j.demo_code, national_id: String(sup.national_id) }) });
        const scm = (r.headers.get('set-cookie')||'').match(/payesh_session=[^;]+/);
        if (!scm) { console.error('login: ' + r.status + ' ' + JSON.stringify(await r.json().catch(()=>null))); process.exit(8); }
        const cookie = scm[0];
        r = await fetch(B + '/api/v1/pull', { headers: { Cookie: cookie } });
        const p = await r.json();
        console.log(JSON.stringify({ att: (p.collections.attendance||[]).length, grd: (p.collections.grades||[]).length }));
        process.exit(0);
      });
      setTimeout(() => process.exit(9), 30000);
    `;
    /* کپیِ تازهٔ store — سرورِ اول rate-state ورود را در store.json مشترک
       persist می‌کند و send-code دوم 429 می‌گیرد. */
    fs.copyFileSync(REAL_STORE, path.join(TMP, 'store2.json'));
    const env = Object.assign({}, process.env, {
      PAYESH_STORE: path.join(TMP, 'store2.json'), PAYESH_AUDIT: path.join(TMP, 'audit2.log'),
      PAYESH_KEY: path.join(TMP, 'jwt2.key'), PAYESH_DEMO_CODE: '1',
      /* otp.json مشترک است (server/data) — cooldown ورودِ سرورِ اول را صفر
         می‌کنیم تا send-code دوم 429 نگیرد (رفتار امنیتی prod دست‌نخورده). */
      PAYESH_SMS_COOLDOWN_S: '0'
    });
    delete env.DATABASE_URL;
    let out;
    try {
      out = cp.execFileSync(process.execPath, ['-e', script], { env, timeout: 60000 }).toString();
    } catch (e) {
      throw new Error('subprocess failed: ' + (e.stderr ? e.stderr.toString().slice(-400) : e.message));
    }
    const counts = JSON.parse(out.trim().split('\n').pop());
    assert.ok(counts.att <= ROW_CAP, `attendance=${counts.att} > ${ROW_CAP} (بودجهٔ آزاد، کران ردیف تنها دفاع)`);
    assert.ok(counts.grd <= ROW_CAP, `grades=${counts.grd} > ${ROW_CAP}`);
  });

  await test('دلتا (since تازه) کران‌ ردیف را رعایت می‌کند', async () => {
    const r = await fetch(BASE + '/api/v1/pull?since=' + encodeURIComponent(new Date(Date.now() - 60000).toISOString()), { headers: { Cookie: supCookie } });
    const p = await r.json();
    for (const c of HEAVY) {
      assert.ok((p.collections[c] || []).length <= ROW_CAP, c);
    }
  });

  /* ── بخش B: کلاینت (jsdom) ─────────────────────────────────────── */
  console.log('\n▸ P0-2 — کش کراندار گزارش‌ها: بخش B (کلاینت، jsdom)');

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

  await test('کلاینت: سقف و مجموعه‌های سنگین تعریف شده‌اند', async () => {
    assert.strictEqual(W('typeof rptCacheBound'), 'function');
    assert.strictEqual(W('typeof rptCacheStatus'), 'function');
    assert.ok(W('RPT_CACHE_MAX_ROWS') >= 1000, 'سقف کلاینت غیرمنطقی');
    /* مقایسهٔ رشته‌ای — آرایهٔ realm پنجره با deepStrictEqual ناسازگار است */
    assert.strictEqual(W('RPT_CACHE_HEAVY_COLS.join(",")'),
      'attendance,grades,discipline,hw_submissions');
  });

  await test('کلاینت: payload بزرگ‌تر از سقف — db کران می‌خورد (دفاع مستقل از سرور)', async () => {
    const over = W(`
      (function(){
        var N = RPT_CACHE_MAX_ROWS + 500;
        var rows = [];
        for (var i = 1; i <= N; i++) rows.push({ id: 900000 + i, school_id: 1, class_id: 1, student_id: 1,
          date: '2025-01-01', status: 'present', updated_at: new Date(1700000000000 + i * 1000).toISOString() });
        db.attendance = [];
        mergeServerDelta({ ok: true, full_snapshot: true, collections: { attendance: rows } });
        return db.attendance.length;
      })()`);
    assert.ok(over <= W('RPT_CACHE_MAX_ROWS'), `db.attendance=${over} از سقف گذشت`);
  });

  await test('کلاینت: کران جدیدترین‌ها را نگه می‌دارد', async () => {
    /* جدیدترین ردیفِ تزریق‌شده id بزرگ‌ترین timestamp را دارد */
    const hasNewest = W(`db.attendance.some(function(r){ return r.id === 900000 + RPT_CACHE_MAX_ROWS + 500; })`);
    const hasOldest = W(`db.attendance.some(function(r){ return r.id === 900001; })`);
    assert.ok(hasNewest, 'جدیدترین حذف شد');
    assert.ok(!hasOldest, 'کهنه‌ترین هنوز هست');
  });

  await test('کلاینت: متادیتای partial ثبت شده و شامل attendance است', async () => {
    const st = W('JSON.parse(JSON.stringify(rptCacheStatus()))');
    assert.ok(st, 'متادیتا نیست');
    assert.ok(st.partial.includes('attendance'), JSON.stringify(st.partial));
    assert.strictEqual(st.stale, false);
  });

  await test('کلاینت: scope — کران رکورد مدرسهٔ دیگر را وارد گزارش نمی‌کند', async () => {
    const leak = W(`
      (function(){
        S.user = db.users.find(function(u){ return u.role === 'manager' && u.school_id === 1; });
        var schools = rptSchools();
        return schools.some(function(s){ return s.id !== 1; });
      })()`);
    assert.strictEqual(leak, false, 'مدرسهٔ خارج از دامنه در rptSchools');
  });

  await test('نشانگر «دادهٔ جزئی» در صفحهٔ گزارش‌ها رندر می‌شود', async () => {
    /* DOM-query واقعی — نه جست‌وجوی innerHTML (سورسِ اسکریپت‌های inline
       هم داخل body است و false-positive می‌دهد) */
    const hasBanner = W(`
      (function(){
        SYNC.demoMode = true; S.showPicker = false; S.route = 'reports'; render();
        var el = document.querySelector('[data-rpt-partial]');
        return !!el && el.textContent.indexOf('دادهٔ جزئی') > -1;
      })()`);
    assert.ok(hasBanner, 'نشانگر partial نیست');
  });

  await test('TTL: متادیتای کهنه (بیش از ۲۴h) → نشانگر کهنگی', async () => {
    const staleShown = W(`
      (function(){
        var meta = Store.getJSON(RPT_CACHE_META_KEY, {});
        meta.at = Date.now() - (RPT_CACHE_TTL_MS + 60000);
        Store.setJSON(RPT_CACHE_META_KEY, meta);
        var st = rptCacheStatus();
        render();
        var el = document.querySelector('[data-rpt-partial]');
        return st.stale === true && !!el && el.textContent.indexOf('کهنه') > -1;
      })()`);
    assert.ok(staleShown, 'نشانگر کهنگی نیست');
  });

  await test('بدون partial و بدون کهنگی: نشانگر نمایش داده نمی‌شود', async () => {
    const clean = W(`
      (function(){
        Store.setJSON(RPT_CACHE_META_KEY, { at: Date.now(), partial: [] });
        render();
        return document.querySelector('[data-rpt-partial]') === null;
      })()`);
    assert.ok(clean, 'نشانگر بی‌دلیل نمایش داده شد');
  });

  console.log('\n────────────────────────────────────────────────────');
  const verdict = fail === 0 ? '✅' : '❌';
  console.log(`reports-bounded-cache: ${pass} سبز / ${fail} قرمز ${verdict}`);
  server.close();
  dom.window.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });

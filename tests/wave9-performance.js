#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave9-performance.js — Wave 9: کاراییِ برنامه (Application Performance)
   ───────────────────────────────────────────────────────────────────
   نقشهٔ راه (docs/ROADMAP.md §12): این‌ها نباید در مسیرِ درخواست باشند:
     JSON.stringify(کلِ store) · I/O سنکرونِ فایل · بکاپ/گزارشِ سنگین
   چیزی که این سئوت می‌سنجد (W9-*):

   بخشِ ۱ — واحد (بدون سرور):
     W9-A  audit حالتِ async: صف → دستهٔ مرتب پس از flush؛ چرخش با
           شمارِ رویداد در فلش؛ flushSync همان لحظه می‌نویسد؛ ماسک PII
     W9-B  کشِ استاتیک: خواندنِ کش‌شده، بی‌اعتباری با mtime/size،
           سقفِ بایت (LRU)، فایلِ غایب → null
     W9-C  L1 کشِ bootstrap محدود: سقفِ ورودی، حذفِ قدیمی‌ترین،
           تازگی در خواندن (LRU)، بازگشتِ سقف به حالتِ عادی

   بخشِ ۲ — سرورِ واقعی (همان فرآیند — event-loop مشترک):
     W9-1  بوت + سلامت
     W9-2  نوشتنِ sync → persistِ ورکر روی disk می‌نشیند (پُلِ زمانی)
     W9-3  persist بیرون از رشتهٔ اصلی: بیشینهٔ تأخیرِ event-loop حینِ
           چند دورِ persist باید از مسیرِ سنکرونِ قدیمی
           (JSON.stringify + writeFileSync، اندازه‌گیریِ درون‌تست) کمتر باشد
     W9-4  بکاپ در حالتِ پایدار: ۸ درخواستِ پشتِ‌هم، همه 200 + فایل روی
           disk + فقط‌داده (بدونِ __*) + تأخیرِ event-loop ناچیز
     W9-5  تازگیِ بکاپ: نوشتنِ نشانگر → بکاپِ فوری → نشانگر داخلِ فایل
     W9-6  گزارشِ عمومی از ورکر: هم‌ارزیِ بایت‌به‌بایت با هستهٔ مرجع؛
           مدرسهٔ نامعتبر → اولین مدرسهٔ فعال؛ ساختِ کلاس (REST) →
           شمارشِ کلاس‌ها در همان لحظه +۱ (تازگیِ اسنپ‌شات)
     W9-7  استاتیک با کش: پاسخِ کامل + nonce + کشِ فعال
     W9-8  وضعیتِ ورکر: نسخهٔ ورکر هم‌گام با نسخهٔ اصلی

   اجرا: node tests/wave9-performance.js   (نیازمند seed: node server/seed.js)
   آستانه‌ها عامدانه گشادند (نه‌فلکی در CI) — عددها چاپ می‌شوند تا در
   docs/WAVE9_PERFORMANCE.md ثبت شوند.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
if (!fs.existsSync(REAL_STORE)) {
  console.log('⏭️  store موجود نیست — اول: node server/seed.js');
  process.exit(0);
}

/* ── فایل‌های ایزولهٔ این اجرا (پیش از requireِ سرور) ─────────────── */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-w9-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });
const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);
process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';
/* سقف‌های OTP بالا — آزادیِ لاگین‌های تست (خودِ سقف‌ها در server17) */
process.env.PAYESH_SMS_COOLDOWN_S = '0';
process.env.PAYESH_SMS_DAILY_CAP = '1000000';
process.env.PAYESH_SMS_PHONE_LIMIT = '1000000';
process.env.PAYESH_SMS_IP_LIMIT = '1000000';
process.env.PAYESH_LOGIN_IP_LIMIT = '1000000';
process.env.PAYESH_LOGIN_TRIES = '1000000';

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── کاوشگرِ تأخیرِ event-loop ─────────────────────────────────────── */
const PROBE_MS = 10;
let probeLags = [];
let probeTimer = null;
let probeLast = 0n;
function probeStart() {
  probeLags = [];
  probeLast = process.hrtime.bigint();
  probeTimer = setInterval(() => {
    const t = process.hrtime.bigint();
    probeLags.push(Number(t - probeLast) / 1e6 - PROBE_MS);
    probeLast = t;
  }, PROBE_MS);
}
function probeStop() {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
  if (!probeLags.length) return { max: 0, p95: 0, n: 0 };
  const s = probeLags.slice().sort((a, b) => a - b);
  return { max: s[s.length - 1], p95: s[Math.floor(s.length * 0.95)], n: s.length };
}

(async () => {
  console.log('\n▸ Wave 9 — کاراییِ برنامه');

  /* ══ بخشِ ۱ — واحدها ══════════════════════════════════════════ */

  /* ── W9-A: audit حالتِ async ─────────────────────────────────── */
  {
    const { createAudit } = require('../server/audit');
    const aFile = path.join(TMP, 'async-audit.log');
    const aDir  = path.join(TMP, 'async-audit');
    const a = createAudit({ auditFile: aFile, auditDir: aDir, asyncMode: true, maxEvents: 5 });
    chk('W9-A0 حالتِ async فعال است', a.isAsync() === true);

    a.audit('w9_a1', { n: 1 });
    a.audit('w9_a2', { n: 2, phone: '09121234567' });
    a.audit('w9_a3', { n: 3 });
    /* سنکرون، بلافاصله: هنوز چیزی نوشته نشده — نوشتن پس‌زمینه است */
    const pre = fs.existsSync(aFile) ? fs.readFileSync(aFile, 'utf8') : '';
    chk('W9-A1 پیش از flush چیزی روی disk نیست (پس‌زمینه)', pre.split('\n').filter(Boolean).length === 0, JSON.stringify(pre.slice(0, 80)));
    await a.flush();
    const lines1 = fs.readFileSync(aFile, 'utf8').split('\n').filter(Boolean);
    chk('W9-A2 پس از flush هر ۳ رویداد مرتب روی disk', lines1.length === 3 && /w9_a1/.test(lines1[0]) && /w9_a3/.test(lines1[2]));
    chk('W9-A3 ماسکِ تلفن در حالتِ async هم برقرار', lines1.join('\n').indexOf('09121234567') === -1 && lines1.join('\n').indexOf('0912***4567') > -1);

    /* چرخش با شمارِ رویداد — در فلش، نه در مسیرِ رویداد */
    for (let i = 4; i <= 8; i++) a.audit('w9_rot', { n: i });
    await a.flush();
    const rotated = fs.existsSync(aDir) ? fs.readdirSync(aDir).filter((f) => f.endsWith('.log')) : [];
    const cur = fs.readFileSync(aFile, 'utf8').split('\n').filter(Boolean);
    chk('W9-A4 چرخش با شمارِ رویداد در فلشِ پس‌زمینه', rotated.length >= 1 && cur.length === 5,
      'rotated=' + rotated.length + ' current=' + cur.length);

    /* flushSync — مسیرِ خروج */
    a.audit('w9_s1', { n: 1 });
    a.audit('w9_s2', { n: 2 });
    a.audit('w9_s3', { n: 3 });
    a.flushSync();
    const cur2 = fs.readFileSync(aFile, 'utf8').split('\n').filter(Boolean);
    chk('W9-A5 flushSync همان لحظه می‌نویسد (مسیرِ خروج)', cur2.length === 8 && /w9_s3/.test(cur2[cur2.length - 1]));
  }

  /* ── W9-B: کشِ استاتیک ───────────────────────────────────────── */
  {
    const { createStaticCache } = require('../server/static-cache');
    const f1 = path.join(TMP, 'st1.html');
    const f2 = path.join(TMP, 'st2.html');
    fs.writeFileSync(f1, 'v1-محتوای اول');
    fs.writeFileSync(f2, 'x'.repeat(2048)); /* بزرگ‌تر از سقفِ ۱KB */
    const c = createStaticCache(1024);
    chk('W9-B1 خواندنِ اول → محتوا', (await c.read(f1)) === 'v1-محتوای اول');
    chk('W9-B2 خواندنِ دوم → از کش (ورودی ثبت شد)', c.stats().entries === 1);
    fs.writeFileSync(f1, 'v2-محتوای دومی (طول متفاوت)');
    chk('W9-B3 تغییرِ فایل → بازخوانی (بی‌اعتباریِ mtime/size)', (await c.read(f1)) === 'v2-محتوای دومی (طول متفاوت)');
    /* سقفِ بایت: فایلِ بزرگ کش نمی‌شود ولی محتوا برمی‌گردد */
    const big = await c.read(f2);
    chk('W9-B4 فایلِ بزرگ‌تر از سقف: محتوا هست، کش نیست', big.length === 2048 && c.stats().entries === 1);
    /* حذفِ LRU: فایلِ کوچکِ تازه، ورودیِ قدیمی را بیرون می‌اندازد (سقف ۱KB) */
    const f3 = path.join(TMP, 'st3.html');
    fs.writeFileSync(f3, 'y'.repeat(1024)); /* خودش سقف را پر می‌کند → قدیمی بیرون */
    await c.read(f3);
    chk('W9-B5 سقفِ بایت → حذفِ قدیمی‌ترین (LRU)', c.stats().entries === 1 && c.stats().bytes <= 1024);
    chk('W9-B6 فایلِ غایب → null', (await c.read(path.join(TMP, 'nope.html'))) === null);
  }

  /* ── W9-C: L1 محدود ──────────────────────────────────────────── */
  {
    const cache = require('../server/cache');
    const redis = require('../server/redis');
    const prevMax = cache.l1Stats().max;
    cache.setL1MaxEntries(3);
    for (let i = 1; i <= 4; i++) {
      await cache.setBootstrapCache(i, { marker: 'u' + i, school: { id: 1 } });
    }
    chk('W9-C1 سقفِ ورودی: ۴ نوشتن → اندازهٔ ۳', cache.l1Stats().size === 3, 'size=' + cache.l1Stats().size);
    /* حذفِ L2 تا سنجش فقط از L1 باشد */
    for (let i = 1; i <= 4; i++) await redis.del('payesh:cache:bootstrap:' + i);
    chk('W9-C2 قدیمی‌ترین بیرون افتاد (u1)', (await cache.getBootstrapCache(1)) === null);
    chk('W9-C3 تازه‌ها ماندند (u2)', ((await cache.getBootstrapCache(2)) || {}).marker === 'u2');
    /* تازگی: خواندنِ u2 آن را تازه‌ترین می‌کند → درجِ u5 باید u3 را بیرون بیندازد نه u2 */
    await cache.getBootstrapCache(2);
    await cache.setBootstrapCache(5, { marker: 'u5', school: { id: 1 } });
    await redis.del('payesh:cache:bootstrap:3');
    await redis.del('payesh:cache:bootstrap:5');
    chk('W9-C4 خواندن = تازگی: u2 ماند، u3 رفت (LRU واقعی)',
      ((await cache.getBootstrapCache(2)) || {}).marker === 'u2' && (await cache.getBootstrapCache(3)) === null);
    cache.setL1MaxEntries(prevMax);
    chk('W9-C5 بازگشتِ سقف به مقدارِ قبلی', cache.l1Stats().max === prevMax);
  }

  /* ══ بخشِ ۲ — سرورِ واقعی در همین فرآیند ═════════════════════ */

  const { server, store, workers, staticCache } = require(path.join(ROOT, 'server', 'index.js'));
  const { computePublicReport } = require(path.join(ROOT, 'server', 'public-report-core'));
  const { opX } = require('./helpers/opx');

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  async function req(method, p, { body, cookie } = {}) {
    const res = await fetch(BASE + p, {
      method,
      headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, json, headers: res.headers, text: async () => res.text() };
  }
  function cookieOf(res) {
    const sc = res.headers.get('set-cookie') || '';
    const m = sc.match(/payesh_session=[^;]+/);
    return m ? m[0] : null;
  }
  async function loginAs(user) {
    const phone = String(user.phone).replace(/[\s-()]/g, '');
    let r = await req('POST', '/api/auth/send-code', { body: { phone } });
    r = await req('POST', '/api/auth/login', { body: { phone, code: String(r.json.demo_code || ''), national_id: String(user.national_id) } });
    return cookieOf(r);
  }
  const byRole = (role, school) => store.users.find((u) => u.role === role && (school == null || u.school_id === school));

  /* W9-1: بوت */
  {
    const h = await req('GET', '/api/health');
    chk('W9-1 سرور بالا آمد و سلامت است', h.status === 200 && h.json.ok === true);
  }

  const mgr = byRole('manager', 1);
  const su  = byRole('superadmin');
  const mgrCookie = await loginAs(mgr);
  const suCookie  = await loginAs(su);
  chk('W9-1b نشست‌های مدیر و سوپرادمین ساخته شد', !!mgrCookie && !!suCookie);

  /* W9-2: نوشتنِ sync → persistِ ورکر روی disk */
  const MARK = 'w9-marker-' + Date.now();
  {
    const r = await req('POST', '/api/sync', {
      cookie: mgrCookie,
      body: { ops: [opX({ by: mgr.id, collection: 'announcements', type: 'ins', user_id: mgr.id, school_id: 1, data: { school_id: 1, title: MARK } })] },
    });
    chk('W9-2a op ثبت شد', r.status === 200 && r.json.results[0].ok === true);
    let onDisk = false;
    for (let i = 0; i < 40 && !onDisk; i++) {
      await sleep(150);
      try { onDisk = fs.readFileSync(T_STORE, 'utf8').indexOf(MARK) > -1; } catch (e) {}
    }
    chk('W9-2b persistِ ورکر روی disk نشست (≤۶ ثانیه)', onDisk);
  }

  /* W9-3: persist بیرون از رشتهٔ اصلی — مقایسه با مسیرِ سنکرون */
  {
    /* خطِ پایه: همان کاری که persistStoreِ قدیمی در هر تیک می‌کرد */
    const baseFile = path.join(TMP, 'baseline.json');
    let syncMs = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = process.hrtime.bigint();
      fs.writeFileSync(baseFile, JSON.stringify(store));
      syncMs = Math.min(syncMs, Number(process.hrtime.bigint() - t0) / 1e6);
    }
    console.log('    [w9] مسیرِ سنکرونِ قدیمی (stringify+write، سه‌بارِ بهترین): ' + syncMs.toFixed(1) + ' ms');

    probeStart();
    for (let i = 0; i < 3; i++) {
      await req('POST', '/api/sync', {
        cookie: mgrCookie,
        body: { ops: [opX({ by: mgr.id, collection: 'announcements', type: 'ins', user_id: mgr.id, school_id: 1, data: { school_id: 1, title: MARK + '-p' + i } })] },
      });
      await sleep(900); /* هر نوشتن یک دورِ persist (تیکرِ ۲s) بخورد */
    }
    await sleep(2400); /* دورِ آخرِ persist */
    const p = probeStop();
    console.log('    [w9] تأخیرِ event-loop حینِ persistِ ورکر: max=' + p.max.toFixed(1) + ' ms · p95=' + p.p95.toFixed(1) + ' ms (' + p.n + ' نمونه)');
    chk('W9-3a بیشینهٔ تأخیر < مسیرِ سنکرونِ قدیمی', p.max < syncMs, p.max.toFixed(1) + ' !< ' + syncMs.toFixed(1));
    chk('W9-3b بیشینهٔ تأخیر زیرِ سقفِ مطلق (۱۲۰ms)', p.max < 120, p.max.toFixed(1));
  }

  /* W9-4: بکاپ در حالتِ پایدار — بیرون از مسیرِ درخواست */
  const backupsDir = path.join(TMP, 'backups');
  {
    await req('POST', '/api/admin/backup', { cookie: suCookie }); /* گرم: اسنپ‌شاتِ اول */
    probeStart();
    const results = [];
    for (let i = 0; i < 8; i++) {
      const r = await req('POST', '/api/admin/backup', { cookie: suCookie });
      results.push(r);
    }
    const p = probeStop();
    console.log('    [w9] تأخیرِ event-loop حینِ ۸ بکاپِ پشت‌هم: max=' + p.max.toFixed(1) + ' ms · p95=' + p.p95.toFixed(1) + ' ms');
    chk('W9-4a همهٔ بکاپ‌ها 200', results.every((r) => r.status === 200 && r.json.ok === true));
    chk('W9-4b فایلِ هر پاسخ همان لحظه روی disk است', results.every((r) => fs.existsSync(path.join(backupsDir, r.json.file))));
    const last = results[results.length - 1].json;
    let parsed = null;
    try { parsed = JSON.parse(fs.readFileSync(path.join(backupsDir, last.file), 'utf8')); } catch (e) {}
    chk('W9-4c اسنپ‌شاتِ فقط‌داده (بدونِ __*) و users کامل',
      !!parsed && !Object.keys(parsed).some((k) => k.indexOf('__') === 0) && Array.isArray(parsed.users) && parsed.users.length === store.users.length);
    chk('W9-4d تأخیرِ event-loop ناچیز (بدونِ stringify در مسیرِ درخواست)', p.max < 30, p.max.toFixed(1));
    chk('W9-4e بکاپِ مدیر (نه سوپرادمین) همچنان 403', (await req('POST', '/api/admin/backup', { cookie: mgrCookie })).status === 403);
  }

  /* W9-5: تازگیِ بکاپ — نوشتنِ تازه باید در بکاپِ فوری باشد */
  {
    const r1 = await req('POST', '/api/sync', {
      cookie: mgrCookie,
      body: { ops: [opX({ by: mgr.id, collection: 'announcements', type: 'ins', user_id: mgr.id, school_id: 1, data: { school_id: 1, title: MARK + '-fresh' } })] },
    });
    const bk = await req('POST', '/api/admin/backup', { cookie: suCookie });
    let body = '';
    try { body = fs.readFileSync(path.join(backupsDir, bk.json.file), 'utf8'); } catch (e) {}
    chk('W9-5 نوشتنِ تازه در بکاپِ فوری هست (تازگیِ اسنپ‌شات)',
      r1.status === 200 && bk.status === 200 && body.indexOf(MARK + '-fresh') > -1);
  }

  /* W9-6: گزارشِ عمومی از ورکر */
  {
    const sid = (store.schools.find((s) => s.active === 1) || store.schools[0]).id;
    const r1 = await req('GET', '/api/public-report?school_id=' + sid);
    chk('W9-6a گزارش 200 + ساختار', r1.status === 200 && r1.json.ok === true && Array.isArray(r1.json.schools) && !!r1.json.report);
    const ref = computePublicReport(store, sid);
    chk('W9-6b خروجیِ ورکر هم‌ارزِ هستهٔ مرجع است', JSON.stringify(r1.json) === JSON.stringify(ref));
    const rBad = await req('GET', '/api/public-report?school_id=999999');
    chk('W9-6c مدرسهٔ نامعتبر → اولین مدرسهٔ فعال', rBad.status === 200 && rBad.json.report && rBad.json.report.sid === ref.report.sid);
    /* تازگی: ساختِ کلاس با REST → شمارش در همان پاسخِ بعدی +۱ */
    const before = r1.json.report.classes;
    const cr = await req('POST', '/api/v1/classes', { cookie: mgrCookie, body: { name: 'کلاس آزمون W9', grade: 10 } });
    const r2 = await req('GET', '/api/public-report?school_id=' + sid);
    chk('W9-6d کلاسِ تازه در گزارشِ همان لحظه (+۱)', cr.status === 201 && r2.json.report.classes === before + 1,
      'cr=' + cr.status + ' ' + before + '→' + r2.json.report.classes);
    const ref2 = computePublicReport(store, sid);
    chk('W9-6e هم‌ارزی پس از تغییر هم برقرار', JSON.stringify(r2.json) === JSON.stringify(ref2));
  }

  /* W9-7: استاتیک با کش */
  {
    const h1 = await fetch(BASE + '/');
    const body1 = await h1.text();
    const h2 = await fetch(BASE + '/');
    const body2 = await h2.text();
    chk('W9-7a صفحهٔ اصلی: 200 + تیپِ html + محتوای کامل',
      h1.status === 200 && /text\/html/.test(h1.headers.get('content-type') || '') && body1.length > 1000000);
    /* nonce در هر درخواست جدا است (§5.6.2) — جسمِ پاسخ عمداً کمی فرق دارد */
    chk('W9-7b پاسخِ دوم هم‌قد است، جای‌گذارِ nonce رفته و کش فعال است',
      body1.length === body2.length && body1.indexOf('__PAYESH_NONCE__') === -1 && body1 !== body2 && staticCache.stats().entries >= 1,
      body1.length + '/' + body2.length + ' entries=' + staticCache.stats().entries);
    const g = await fetch(BASE + '/USER_GUIDE.html');
    chk('W9-7c راهنمای کاربر 200', g.status === 200);
    const miss = await fetch(BASE + '/no-such-page');
    chk('W9-7d مسیرِ ناشناخته → 404', miss.status === 404);
  }

  /* W9-8: وضعیتِ ورکر */
  {
    const st = workers.stats();
    chk('W9-8 ورکر زنده و نسخه‌ها هم‌گام', st.alive === true && st.workerVersion >= 0 && st.mainVersion >= st.workerVersion,
      JSON.stringify(st));
  }

  /* ── جمع‌بندی ─────────────────────────────────────────────────── */
  try { workers.terminate(); } catch (e) {}
  await new Promise((r) => server.close(r));
  console.log('\n────────────────────────────────────────────────────');
  console.log('wave9-performance: ' + (okc + failc) + ' بررسی — ✅ ' + okc + ' · ❌ ' + failc);
  if (fails.length) { console.log('شکست‌ها:'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

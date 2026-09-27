#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n32-route-now-fresh-timestamp.test.js — N-32 regression guard
   -------------------------------------------------------------------
   N-32 (شدت: MEDIUM): ROUTE_NOW یک بار در زمانِ بارگذاریِ ماژولِ
   analytics محاسبه و در closure قفل می‌شد. نتیجه: همهٔ گواهی‌هایِ یک
   پروسهٔ سرور — حتی اگر روزها از هم فاصله داشتند — مهرِ زمانی و در
   نتیجه certificate_fingerprint یکسان می‌گرفتند. قابلیتِ تشخیصِ
   «این گواهی بعد از آن یکی صادر شده» از بین می‌رفت و هر گواهی در یک
   پروسهٔ طولانی برای همیشه به زمانِ بوت گیر می‌ماند.

   اصلاح: مهر در زمانِ هر فراخوانِ nowOptions() تازه محاسبه می‌شود
   (مگر اینکه PAYESH_ANALYTICS_FIXED_NOW برایِ قطعیتِ تست set شده باشد).
   مسیرِ اصلیِ آسیب‌پذیر، گواهیِ انتشار است که fingerprint خود را از
   همین مهر می‌سازد.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n32-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';
/* PAYESH_ANALYTICS_FIXED_NOW عمداً set نیست — حالتِ تولید موضوعِ تست است. */

const { server, store } = require('../server/index.js');

let BASE = '';
let pass = 0, fail = 0;

async function req(method, p, opts) {
  const options = opts || {};
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      options.body ? { 'Content-Type': 'application/json' } : {},
      options.cookie ? { Cookie: options.cookie } : {}
    ),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json, headers: res.headers };
}

async function loginAs(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  assert.strictEqual(r.status, 200, 'send-code ناموفق: ' + r.status);
  const code = r.json.demo_code;
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(user.national_id) } });
  assert.strictEqual(r.status, 200, 'login ناموفق: ' + r.status);
  const sc = r.headers.get('set-cookie') || '';
  const m = sc.match(/payesh_session=[^;]+/);
  return m ? m[0] : null;
}

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log('  ✅ ' + name);
  } catch (err) {
    fail++;
    console.error('  ❌ ' + name + '\n     ' + err.message);
  }
}

async function certify(cookie) {
  const r = await req('GET', '/api/v1/analytics/intelligence-certification?school_id=1', { cookie });
  assert.strictEqual(r.status, 200, 'گواهی 200 نبود: ' + r.status + ' ' + JSON.stringify(r.json));
  const cert = r.json.intelligence_certification;
  const rc = cert && cert.release_certificate;
  assert.ok(rc, 'release_certificate یافت نشد');
  assert.ok(rc.certified_at, 'certified_at یافت نشد');
  assert.ok(rc.certificate_fingerprint, 'fingerprint یافت نشد');
  return rc;
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  assert.ok(manager, 'دادهٔ نمونه manager نیست');
  const cookie = await loginAs(manager);
  assert.ok(cookie, 'ورود ناموفق بود');

  console.log('\n🔍 N-32: certificate fingerprints are fresh per call, not boot-frozen');

  /* N32-1 — مانیفستِ خطا: دو گواهیِ صادرشده با فاصلهٔ زمانی نباید
     fingerprint یکسان داشته باشند. قبل از اصلاح، ROUTE_NOW در boot قفل
     می‌شد و هر دو یکی می‌شدند — یعنی گواهیِ جدید از قدیمی قابلِ تشخیص
     نبود. */
  await test('N32-1: two certificates issued at different times get distinct fingerprints', async () => {
    const a = await certify(cookie);
    await new Promise(r => setTimeout(r, 1100));
    const b = await certify(cookie);
    assert.notStrictEqual(a.certified_at, b.certified_at,
      'مهرِ زمانی باید متفاوت باشد (هر دو: ' + a.certified_at + ')');
    assert.notStrictEqual(a.certificate_fingerprint, b.certificate_fingerprint,
      'fingerprint باید متفاوت باشد');
    assert.notStrictEqual(a.certificate_id, b.certificate_id,
      'certificate_id باید متفاوت باشد');
    assert.ok(new Date(b.certified_at) > new Date(a.certified_at), 'مهرِ دوم باید جدیدتر باشد');
  });

  /* N32-2 — مهر باید زمانِ فراخوانی باشد، نه زمانِ بوتِ پروسه. این
     تستِ اصلیِ N-32 است: سرور مدت‌هاست بالا آمده ولی گواهیِ اکنون
     صادر می‌شود. */
  await test('N32-2: stamp reflects call time, not process boot time', async () => {
    const before = Date.now();
    const rc = await certify(cookie);
    const ms = new Date(rc.certified_at).getTime();
    assert.ok(!isNaN(ms), 'مهرِ زمانیِ معتبر نیست: ' + rc.certified_at);
    assert.ok(ms >= before - 5000,
      'مهر (' + rc.certified_at + ') نباید قبل ازِ این لحظه باشد — پروسه از قبل بالا آمده بود');
    assert.ok(new Date(rc.certified_at).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10),
      'مهر باید تاریخِ امروز باشد');
  });

  /* N32-3 — گواهیِ ردشده هم مهرِ تازه می‌گیرد (در دادهٔ نمونه، گواهی
     REJECTED است — ولی باز هم باید timestamp واقعی داشته باشد). */
  await test('N32-3: a rejected certificate is still stamped with the real time', async () => {
    const rc = await certify(cookie);
    const stale = new Date('2026-09-18T12:00:00.000Z').getTime();
    const ms = new Date(rc.certified_at).getTime();
    assert.ok(ms > stale, 'مهر نباید روی پیش‌فرضِ ثابتِ 2026-09-18 مانده باشد: ' + rc.certified_at);
    console.log('     status=' + rc.status + ' | certified_at=' + rc.certified_at);
  });

  /* N32-4 — گزارشِ هوشمندیِ مدرسه هم از همان nowOptions می‌خواند؛
     مهرش نباید قفلِ boot باشد. */
  await test('N32-4: school-intelligence report stamp is also fresh', async () => {
    const a = await req('GET', '/api/v1/analytics/school-intelligence?school_id=1', { cookie });
    assert.strictEqual(a.status, 200, 'گزارش 200 نبود: ' + a.status);
    const genA = (a.json.snapshot && (a.json.snapshot.generated_at || a.json.snapshot.created_at)) || null;
    assert.ok(genA, 'مهرِ گزارش یافت نشد');
    assert.ok(new Date(genA).getTime() > new Date('2026-09-18T12:00:00.000Z').getTime(),
      'گزارش نباید روی تاریخِ ثابت بماند: ' + genA);
    await new Promise(r => setTimeout(r, 1100));
    const b = await req('GET', '/api/v1/analytics/school-intelligence?school_id=1', { cookie });
    const genB = (b.json.snapshot && (b.json.snapshot.generated_at || b.json.snapshot.created_at)) || null;
    assert.ok(genB, 'مهرِ گزارشِ دوم یافت نشد');
    assert.notStrictEqual(genA, genB, 'دو گزارشِ متوالی باید مهرِ متفاوت داشته باشند');
  });

  /* N32-5 — کنترلِ مثبتِ قطعیت: با PAYESH_ANALYTICS_FIXED_NOW مهرها
     مساوی می‌شوند. این env در زمانِ ساختِ route خوانده می‌شود، پس
     باید آن را قبل از require حذف/تنظیم کرد — با یک زیرپروسهٔ مستقل. */
  await test('N32-5: PAYESH_ANALYTICS_FIXED_NOW still pins stamps (determinism contract)', async () => {
    const { execFileSync } = require('child_process');
    const script = path.join(TMP, 'pin.js');
    /* کدِ زیرپروسه از یک فایلِ موقت اجرا می‌شود تا env قبل از بارگذاریِ
       ماژول analytics set شود. */
    fs.writeFileSync(script, [
      'process.env.PAYESH_ANALYTICS_FIXED_NOW = "2026-01-15T08:00:00.000Z";',
      'const s = require("' + ROOT.replace(/\\/g, '\\\\') + '/server/routes/analytics.js");',
      'const routes = s.createAnalyticsRoutes({ store: {}, db: null });',
      '(async () => {',
      '  const req = { user: { id: 1, role: "manager", school_id: 101 } };',
      '  const sp = new URLSearchParams({ school_id: "101" });',
      '  const a = await routes.intelligenceCertificationReport(req, sp);',
      '  await new Promise(r => setTimeout(r, 600));',
      '  const b = await routes.intelligenceCertificationReport(req, sp);',
      '  const ra = a.body.intelligence_certification.release_certificate;',
      '  const rb = b.body.intelligence_certification.release_certificate;',
      '  if (a.status !== 200 || b.status !== 200) { console.log("BADSTATUS"); process.exit(1); }',
      '  if (ra.certified_at !== rb.certified_at) { console.log("STAMPS_DIFFER:" + ra.certified_at + "|" + rb.certified_at); process.exit(1); }',
      '  if (ra.certificate_fingerprint !== rb.certificate_fingerprint) { console.log("FP_DIFFER"); process.exit(1); }',
      '  if (ra.certified_at !== "2026-01-15T08:00:00.000Z") { console.log("WRONG_STAMP:" + ra.certified_at); process.exit(1); }',
      '  console.log("PINNED_OK " + ra.certificate_id);',
      '})().catch(e => { console.log("ERR:" + e.message); process.exit(1); });'
    ].join('\n'));
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    assert.ok(out.indexOf('PINNED_OK') === 0, 'خروجیِ زیرپروسه نامعتبر: ' + out);
    console.log('     ' + out);
  });

  console.log(`\nN-32 Fresh Timestamp Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

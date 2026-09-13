#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/reports-basic.js — Wave 23: گزارش‌های پیشرفته (API پایه)
   ───────────────────────────────────────────────────────────────────
   چهار endpoint فقط‌خواندنی /api/v1/reports/* :
   - ساختار پاسخ + صحتِ تجمیع در برابر شمارش مستقل روی store
   - پارامترهای jy/jm/term/class_id
   - خطاهای 400 (ماه نامعتبر، مدرسهٔ بدون شهریه)
   اجرا: node tests/reports-basic.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rpt-basic-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

/* پ۳ (2026-09-12): این سوئیت قراردادِ «پاسخِ API == شمارشِ مستقل روی همان
   JSON store ای که خودش seed کرده» را می‌سنجد؛ قراردادِ PG-mode گیتِ
   اختصاصیِ خودش را دارد (tests/wave23-reports-pg.js — ۷۶ سنجه روی PG
   واقعیِ مهاجرت‌شده). اگر DATABASE_URL از محیط نشت کند، سرور PG-mode بوت
   می‌شود و این سوئیت به‌جای کد، محیط را می‌سنجد (۵۰۰ روی دیتابیسِ بدونِ
   schema — قرمزِ پیش‌موجودِ ثبت‌شده در گزارشِ 2026-09-12). پس حالتِ حافظه
   صریحاً pin می‌شود؛ هیچ سنجه‌ای حذف/ضعیف نشده است. */
delete process.env.DATABASE_URL;

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
  return { status: res.status, json, headers: res.headers };
}

async function loginAs(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  assert.strictEqual(r.status, 200);
  const code = r.json.demo_code;
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(user.national_id) } });
  assert.strictEqual(r.status, 200);
  const sc = r.headers.get('set-cookie') || '';
  const m = sc.match(/payesh_session=[^;]+/);
  return m ? m[0] : null;
}

async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

/* تبدیل شمسی مستقل (کپی از الگوریتم مرجع — برای شمارش شاهد) */
const _div = (a, b) => Math.floor(a / b);
function toJalali(gy, gm, gd) {
  const g = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979; gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + _div(gy2 + 3, 4) - _div(gy2 + 99, 100) + _div(gy2 + 399, 400) - 80 + gd + g[gm - 1];
  jy += 33 * _div(days, 12053); days %= 12053;
  jy += 4 * _div(days, 1461); days %= 1461;
  if (days > 365) { jy += _div(days - 1, 365); days = (days - 1) % 365; }
  return [jy, days < 186 ? 1 + _div(days, 31) : 7 + _div(days - 186, 30)];
}
function jOf(iso) {
  const p = String(iso).slice(0, 10).split('-').map(Number);
  return toJalali(p[0], p[1], p[2]);
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  console.log('\n▸ Wave 23 — گزارش‌ها: API پایه');

  const manager1 = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const cookie = await loginAs(manager1);
  assert.ok(cookie, 'ورود مدیر ناموفق');

  /* ماهی که قطعاً داده دارد: ماهِ اولین رکورد حضور مدرسهٔ ۱ */
  const anyAtt = store.attendance.find(a => a.school_id === 1);
  const [JY, JM] = jOf(anyAtt.date);

  await test('attendance: 200 + ساختار (jy/jm/schools/classes/totals)', async () => {
    const r = await req('GET', `/api/v1/reports/attendance?jy=${JY}&jm=${JM}`, { cookie });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.kind, 'attendance');
    assert.strictEqual(r.json.jy, JY);
    assert.ok(Array.isArray(r.json.schools) && r.json.schools.length === 1, 'مدیر فقط مدرسهٔ خودش');
    const s = r.json.schools[0];
    assert.strictEqual(s.school_id, 1);
    assert.ok(Array.isArray(s.classes) && s.classes.length > 0);
    for (const k of ['present', 'absent', 'late', 'excused', 'early_exit', 'total', 'rate']) assert.ok(k in s.totals, 'totals.' + k);
  });

  await test('attendance: تجمیع = شمارش مستقل روی store', async () => {
    const r = await req('GET', `/api/v1/reports/attendance?jy=${JY}&jm=${JM}`, { cookie });
    const cls = store.classes.find(c => c.school_id === 1);
    const expect = store.attendance.filter(a => {
      if (a.school_id !== 1 || a.class_id !== cls.id) return false;
      const j = jOf(a.date);
      return j[0] === JY && j[1] === JM;
    }).length;
    const row = r.json.schools[0].classes.find(c => c.class_id === cls.id);
    assert.strictEqual(row.total, expect, `total کلاس ${cls.id}: ${row.total} ≠ ${expect}`);
  });

  await test('attendance: فیلتر class_id فقط همان کلاس', async () => {
    const cls = store.classes.find(c => c.school_id === 1);
    const r = await req('GET', `/api/v1/reports/attendance?jy=${JY}&jm=${JM}&class_id=${cls.id}`, { cookie });
    assert.strictEqual(r.json.schools[0].classes.length, 1);
    assert.strictEqual(r.json.schools[0].classes[0].class_id, cls.id);
  });

  await test('attendance: jm نامعتبر = 400', async () => {
    const r = await req('GET', '/api/v1/reports/attendance?jy=1405&jm=13', { cookie });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.code, 'bad_request');
  });

  await test('academic: 200 + میانگین بر مقیاس ۲۰ + روند + توصیه', async () => {
    const r = await req('GET', '/api/v1/reports/academic', { cookie });
    assert.strictEqual(r.status, 200);
    const s = r.json.schools[0];
    assert.ok(s.avg === null || (s.avg >= 0 && s.avg <= 20), 'avg در بازهٔ ۰..۲۰');
    assert.ok(Array.isArray(s.trend) && s.trend.length > 0, 'روند ترمی');
    assert.ok(Array.isArray(s.recommendations) && s.recommendations.length > 0, 'توصیه');
    for (const c of s.classes) {
      assert.ok(c.avg === null || (c.avg >= 0 && c.avg <= 20));
      assert.ok(c.pass_rate === null || (c.pass_rate >= 0 && c.pass_rate <= 100));
    }
  });

  await test('academic: فیلتر term تعداد نمره‌ها را کم می‌کند', async () => {
    const all = await req('GET', '/api/v1/reports/academic', { cookie });
    const t1 = await req('GET', '/api/v1/reports/academic?term=' + encodeURIComponent('نوبت اول'), { cookie });
    const sum = (resp) => resp.json.schools[0].classes.reduce((a, c) => a + c.count, 0);
    assert.ok(sum(t1) > 0, 'ترمِ فیلترشده داده دارد');
    assert.ok(sum(t1) < sum(all), 'فیلتر ترم زیرمجموعهٔ سره است');
  });

  await test('finance: 200 + شهریه/اقساط/بورسیه/نرخ وصول', async () => {
    const r = await req('GET', '/api/v1/reports/finance', { cookie });
    assert.strictEqual(r.status, 200);
    const s = r.json.schools[0];
    assert.strictEqual(s.school_id, 1);
    /* شمارش شاهد */
    const tuCount = store.tuitions.filter(t => t.school_id === 1).length;
    assert.strictEqual(s.tuitions.count, tuCount);
    const paidIns = store.installments.filter(i => i.school_id === 1 && i.status === 'paid').length;
    assert.strictEqual(s.installments.paid, paidIns);
    assert.ok(s.collection_rate === null || (s.collection_rate >= 0 && s.collection_rate <= 100));
  });

  await test('teachers: 200 + حضور کادر + جانشینی + دوره‌ها', async () => {
    const anySA = store.staff_attendance.find(a => a.school_id === 1);
    const [sy, sm] = jOf(anySA.date);
    const r = await req('GET', `/api/v1/reports/teachers?jy=${sy}&jm=${sm}`, { cookie });
    assert.strictEqual(r.status, 200);
    const s = r.json.schools[0];
    assert.ok(s.staff.length > 0, 'کادر خالی نیست');
    const row = s.staff[0];
    for (const k of ['name', 'present', 'absent', 'late', 'attendance_rate', 'substitutions', 'training_hours']) assert.ok(k in row, 'staff.' + k);
    /* شمارش شاهد: حضور اولین همکار در آن ماه */
    const expect = store.staff_attendance.filter(a => {
      if (a.school_id !== 1 || a.staff_id !== row.staff_id || a.status !== 'present') return false;
      const j = jOf(a.date);
      return j[0] === sy && j[1] === sm;
    }).length;
    assert.strictEqual(row.present, expect);
  });

  await test('روش‌های غیر GET روی reports = مسیر ناموجود (404)', async () => {
    const r = await req('POST', '/api/v1/reports/attendance', { cookie, body: {} });
    assert.ok(r.status === 404 || r.status === 405, 'status=' + r.status);
  });

  server.close();
  console.log('');
  console.log('────────────────────────────────────────────────────');
  console.log(`reports-basic: ${pass} سبز / ${fail} قرمز ${fail ? '❌' : '✅'}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

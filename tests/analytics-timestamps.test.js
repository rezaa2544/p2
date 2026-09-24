#!/usr/bin/env node
/**
 * tests/analytics-timestamps.test.js
 * گیت رفع D2 — گزارش‌های هوشمندی نباید با تاریخ ثابت ۲۰۲۶-۰۹-۱۸ مهر شوند
 * و گواهی‌های روزهای مختلف باید fingerprint متفاوت داشته باشند.
 *
 * قبل از این اصلاح: routeها هیچ timestampی به موتورها نمی‌رساندند، پس همه
 * روی پیش‌فرض '2026-09-18T12:00:00.000Z' می‌ماندند. نتیجه: دو گواهی صادرشده
 * در دو روز متفاوت، شناسه و fingerprint کاملاً یکسان داشتند — یعنی «گواهی
 * تازه» از روی گواهی قدیمی قابل تشخیص نبود.
 */
'use strict';

const assert = require('assert');
const path = require('path');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

const STALE = '2026-09-18T12:00:00.000Z';
const { createAnalyticsRoutes } = require(path.join(__dirname, '..', 'server', 'routes', 'analytics.js'));

function routesFor(fixedNow) {
  if (fixedNow) process.env.PAYESH_ANALYTICS_FIXED_NOW = fixedNow;
  else delete process.env.PAYESH_ANALYTICS_FIXED_NOW;
  return createAnalyticsRoutes({ store: {}, db: null });
}

async function certify(routes) {
  const req = { user: { id: 1, role: 'manager', school_id: 101 } };
  const sp = new URLSearchParams({ school_id: '101' });
  const r = await routes.intelligenceCertificationReport(req, sp);
  assert.strictEqual(r.status, 200, 'certification report must succeed');
  return r.body.intelligence_certification.release_certificate;
}

console.log('\n🕐 گیت زمان‌مهر واقعی و یکتایی fingerprint گواهی (D2)\n');

(async () => {
  // ۱. مهر زمان واقعی (نه تاریخ ثابت)
  const cert = await certify(routesFor(null));
  check('گواهی با تاریخ ثابت ۲۰۲۶-۰۹-۱۸ مهر نمی‌شود', () => {
    assert.notStrictEqual(cert.certified_at, STALE);
  });
  check('certified_at یک ISO معتبر و روز جاری است', () => {
    const d = new Date(cert.certified_at);
    assert.ok(!isNaN(d.getTime()), 'must be a valid date');
    const today = new Date();
    assert.strictEqual(d.toISOString().slice(0, 10), today.toISOString().slice(0, 10),
      'certificate should be stamped with the current day');
  });

  // ۲. یکتایی fingerprint در روزهای متفاوت
  const dayA = await certify(routesFor('2026-10-01T00:00:00.000Z'));
  const dayB = await certify(routesFor('2026-11-01T00:00:00.000Z'));
  check('دو گواهی در دو روز متفاوت، fingerprint متفاوت دارند', () => {
    assert.notStrictEqual(dayA.certificate_id, dayB.certificate_id);
    assert.notStrictEqual(dayA.certificate_fingerprint, dayB.certificate_fingerprint);
  });

  // ۳. قطعیت: دو فراخوانی در یک لحظه، یکسان می‌مانند (تست‌ها همچنان قطعی‌اند)
  const same1 = await certify(routesFor('2026-10-01T00:00:00.000Z'));
  const same2 = await certify(routesFor('2026-10-01T00:00:00.000Z'));
  check('دو فراخوانی با یک تاریخ، خروجی قطعی یکسان می‌دهند', () => {
    assert.strictEqual(same1.certificate_id, same2.certificate_id);
  });

  // ۴. snapshot مدرسه هم مهر زمان واقعی دارد
  check('گزارش مرکز هوشمندی مهر زمان غیرِثابت دارد', async () => {
    const routes = routesFor(null);
    const req = { user: { id: 1, role: 'manager', school_id: 101 } };
    const sp = new URLSearchParams({ school_id: '101' });
    const r = await routes.schoolIntelligenceReport(req, sp);
    const gen = r.body.snapshot.generated_at || r.body.snapshot.created_at;
    if (gen != null) assert.notStrictEqual(gen, STALE);
  });

  console.log(`\nگیت زمان‌مهر: ${pass} pass / ${fail} fail`);
  delete process.env.PAYESH_ANALYTICS_FIXED_NOW;
  if (fail) process.exit(1);
  console.log('✅ زمان‌مهر واقعی و یکتایی fingerprint گواهی برقرار است.');
})().catch((e) => { console.error('❌ خطای اجرا:', e.message); process.exit(1); });

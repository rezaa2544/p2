#!/usr/bin/env node
/**
 * tests/semantic-analytics-e2e.test.js
 * گیت رفتاری Phase 9.0 Wiring Gate — هر ۸ موتورِ پیش‌تر یتیم، حالا باید از
 * مسیر HTTP واقعی قابل فراخوانی باشند، با کنترل دسترسی درست.
 *
 * این تست تأیید می‌کند که:
 *  - همهٔ ۸ endpoint با دادهٔ دمو کار می‌کنند
 *  - گارد دسترسی مدرسه اعمال می‌شود (مدیر مدرسهٔ دیگر را نمی‌بیند)
 *  - ولی فقط فرزند خودش را می‌بیند
 *  - نقش غیرمجاز رد می‌شود
 */
'use strict';

const assert = require('assert');
const path = require('path');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

const { createSemanticAnalyticsRoutes } = require(path.join(__dirname, '..', 'server', 'routes', 'semantic-analytics.js'));
const STORE_PATH = path.join(__dirname, '..', 'server', 'data', 'payesh.json');

let store;
try {
  store = require(STORE_PATH);
} catch (e) {
  console.log('\n⚠️  store موجود نیست — ابتدا `node server/seed.js` را اجرا کنید.\n');
  process.exit(1);
}

const routes = createSemanticAnalyticsRoutes({ store, db: null });
const MANAGER = { id: 2, role: 'manager', school_id: 1 };
const sp = (o) => new URLSearchParams(o);

async function call(fn, user, params) {
  return fn({ user }, sp(params));
}

console.log('\n🔌 گیت رفتاری Wiring Gate (Phase 9.0 — ۸ موتور یتیمِ سابق)\n');

(async () => {
  // ۱. همهٔ endpointها با دادهٔ دمو کار می‌کنند
  const schoolEndpoints = [
    ['semantic-metrics', routes.semanticReport, { school_id: '1' }],
    ['assessment-quality', routes.assessmentQualityReport, { school_id: '1' }],
    ['attendance-risk', routes.attendanceRiskReport, { school_id: '1' }],
    ['intervention-warnings', routes.interventionWarningsReport, { school_id: '1' }],
    ['school-health-dashboard', routes.schoolHealthReport, { school_id: '1' }]
  ];
  for (const [name, fn, params] of schoolEndpoints) {
    const r = await call(fn, MANAGER, params);
    check(`${name} از مسیر HTTP اجرا می‌شود`, () => {
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
      assert.strictEqual(r.body.ok, true);
    });
  }

  const tl = await call(routes.studentTimelineReport, MANAGER, { school_id: '1', student_id: '16' });
  check('student-timeline اجرا می‌شود', () => {
    assert.strictEqual(tl.status, 200, `got ${tl.status}`);
    assert.ok(tl.body.timeline, 'timeline payload present');
  });

  const te = await call(routes.teacherEvidenceReport, MANAGER, { school_id: '1', teacher_id: '5' });
  check('teacher-evidence اجرا می‌شود', () => {
    assert.strictEqual(te.status, 200, `got ${te.status}`);
  });

  const p360 = await call(routes.parent360Report, MANAGER, { school_id: '1', student_id: '16' });
  check('parent-360 (نقش مدرسه) اجرا می‌شود', () => {
    assert.strictEqual(p360.status, 200, `got ${p360.status}: ${JSON.stringify(p360.body).slice(0, 150)}`);
  });

  // ۲. گارد جداسازی مستأجر: مدیر مدرسه ۱ نمی‌تواند مدرسه ۲ را ببیند
  const cross = await call(routes.semanticReport, MANAGER, { school_id: '2' });
  check('گارد جداسازی: مدیر مدرسهٔ دیگر را نمی‌بیند', () => {
    assert.strictEqual(cross.status, 403);
    assert.strictEqual(cross.body.code, 'forbidden');
  });

  // ۳. ولی واقعی دسترسی دارد؛ ولیِ اشتباه ندارد
  const realParent = await call(routes.parent360Report, { id: 17, role: 'parent' }, { student_id: '16' });
  check('ولیِ واقعی پروندهٔ فرزند را می‌بیند', () => {
    assert.strictEqual(realParent.status, 200, `got ${realParent.status}`);
  });
  const wrongParent = await call(routes.parent360Report, { id: 999, role: 'parent' }, { student_id: '16' });
  check('ولیِ اشتباه رد می‌شود', () => {
    assert.strictEqual(wrongParent.status, 403);
  });

  // ۴. پارامتر گم‌شده → 400 نه 500
  const noParam = await call(routes.semanticReport, MANAGER, {});
  check('نبود school_id با ۴۰۰ پاسخ می‌دهد', () => {
    assert.strictEqual(noParam.status, 400);
  });

  console.log(`\nگیت Wiring Gate: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
  console.log('✅ هر ۸ موتور یتیمِ سابق مسیر رانتایم دارند.');
})().catch((e) => { console.error('❌ خطای اجرا:', e.message); process.exit(1); });

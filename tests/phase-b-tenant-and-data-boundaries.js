#!/usr/bin/env node
// tests/phase-b-tenant-and-data-boundaries.js
// رگرسیونِ عیوبِ P0/P1 اصلاح‌شده در موجِ Phase B (Zero-Trust Defect Hunt).
// هر تست مستقیلاً روی store واقعیِ seed و ماژول‌ها اجرا می‌شود (E2، بدون سرور).
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'payesh.json'), 'utf8'));
const policy = require('../server/policy');
const {
  mapProvinceToken,
  resolveActorProvince,
  assertTenantBoundary
} = require('../server/infrastructure/phase6-production-hardening');

const sic = require('../server/analytics/school-intelligence-center');
const te = require('../server/analytics/teacher-evidence');
const icm = require('../server/analytics/intervention-case-management');
const sa = require('../server/routes/semantic-analytics');

let pass = 0;
const failures = [];
const checks = [];
function chk(name, fn) {
  checks.push(Promise.resolve().then(async () => {
    try { await fn(); pass += 1; console.log('  ✅ ' + name); }
    catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
  }));
}
function blocked(fn) {
  try { fn(); return false; } catch (e) { return /TENANT_ISOLATION_VIOLATION|scope does not cover/.test(e.message); }
}

/* ── F#1 + F#5: گاردِ edu_office باید محدودهٔ جغرافیاییِ دفتر را محترم بشمارد */
console.log('\n■ F#1/F#5 — گاردِ edu_office و حلِ استانِ دفتر');

const EDU_PROV1 = { id: 1027, role: 'edu_office', office_id: 1 };        // دفترِ استانیِ کردستان
const EDU_SUB = { id: 1031, role: 'edu_office', office_id: 3 };          // دفارِ ناحیه‌ای (cty1/dist1)
const EDU_NOOFFICE = { id: 9999, role: 'edu_office' };                   // بدون دفتر → fail-closed
const schoolInProv1 = school(1);
const schoolOut = school(3);                                             // تهران

chk('edu_office استانی: مدارسِ استانِ خودش مجازند', () => {
  for (const sid of [1, 2, 5]) {
    assert.ok(!blocked(() => sic.enforceSchoolIntelligenceAccessGuard(EDU_PROV1, sid, { store })), 'school ' + sid);
    assert.ok(!blocked(() => sa.assertCanSeeSchool(EDU_PROV1, sid, store)), 'school ' + sid);
  }
});
chk('edu_office استانی: مدرسهٔ استانِ دیگر مسدود است', () => {
  assert.ok(blocked(() => sic.enforceSchoolIntelligenceAccessGuard(EDU_PROV1, 3, { store })));
  assert.ok(blocked(() => sic.enforceSchoolIntelligenceAccessGuard(EDU_PROV1, 4, { store })));
  assert.ok(blocked(() => sa.assertCanSeeSchool(EDU_PROV1, 3, store)));
  assert.ok(blocked(() => sa.assertCanSeeSchool(EDU_PROV1, 4, store)));
});
chk('edu_office ناحیه‌ای: فقط مدرسهٔ ناحیهٔ خودش (دقتِ شهرستانی)', () => {
  assert.ok(!blocked(() => sa.assertCanSeeSchool(EDU_SUB, 1, store)));   // cty1/dist1
  assert.ok(blocked(() => sa.assertCanSeeSchool(EDU_SUB, 2, store)));    // cty3
  assert.ok(blocked(() => sa.assertCanSeeSchool(EDU_SUB, 5, store)));    // cty2
});
chk('edu_office بدونِ دفتر: fail-closed (نه باز)', () => {
  assert.ok(blocked(() => sa.assertCanSeeSchool(EDU_NOOFFICE, 1, store)));
});
chk('teacher-evidence guard: edu_office خارج از حوزه مسدود است', () => {
  assert.ok(blocked(() => te.enforceTeacherAccessGuard(EDU_PROV1, 4, { store, schoolId: 3 })));
  assert.ok(!blocked(() => te.enforceTeacherAccessGuard(EDU_PROV1, 4, { store, schoolId: 1 })));
});
chk('intervention guard: edu_office خارج از حوزه مسدود است', () => {
  assert.ok(blocked(() => icm.enforceInterventionAccessGuard(EDU_PROV1, { school_id: 3 }, { store })));
  assert.ok(!blocked(() => icm.enforceInterventionAccessGuard(EDU_PROV1, { school_id: 1 }, { store })));
});
chk('manager همچنان فقط مدرسهٔ خودش را می‌بیند', () => {
  assert.ok(!blocked(() => sa.assertCanSeeSchool({ id: 2, role: 'manager', school_id: 1 }, 1, store)));
  assert.ok(blocked(() => sa.assertCanSeeSchool({ id: 2, role: 'manager', school_id: 1 }, 2, store)));
});

/* ── F#5: resolveActorProvince باید edu_office را از دفترِ او حل کند */
console.log('\n■ F#5 — حلِ استانِ عامل از دفتر + حذفِ پیش‌فرضِ جادوییِ ۰۷');

chk('resolveActorProvince: edu_office → استانِ دفتر', () => {
  const p = resolveActorProvince(EDU_PROV1, store);
  assert.ok(p != null, 'province must resolve');
  assert.strictEqual(p, resolveActorProvince({ id: 2, role: 'manager', school_id: 1 }, store),
    'manager school 1 و edu_office office 1 باید به یک استان نگاشته شوند');
});
chk('resolveActorProvince: کاربرِ بدونِ مدرسه/دفتر → null (نه ۰۷)', () => {
  assert.strictEqual(resolveActorProvince({ id: 9999, role: 'teacher' }, store), null);
});
chk('assertTenantBoundary: دو استانِ متمایز دیگر یکی نمی‌شوند', () => {
  const p1 = resolveActorProvince({ id: 2, role: 'manager', school_id: 1 }, store); // کردستان
  const p2 = resolveActorProvince({ id: 3, role: 'manager', school_id: 3 }, store); // تهران
  assert.notStrictEqual(p1, p2, 'کردستان و تهران نباید یک توکن باشند');
});
chk('assertTenantBoundary: کاربرِ استانِ ۱ به استانِ ۲ دسترسی ندارد', async () => {
  const tehran = resolveActorProvince({ id: 3, role: 'manager', school_id: 3 }, store);
  const kurdistan = resolveActorProvince({ id: 2, role: 'manager', school_id: 1 }, store);
  const actor = { id: 3, role: 'manager', school_id: 3, province_code: tehran };
  await assertRejectsAsync(() => assertTenantBoundary(actor, null, kurdistan));
});

/* ── F#6: نگاشتِ کدِ استان بدونِ تصادم */
console.log('\n■ F#6 — نگاشتِ کدِ استان');

chk('سیستان و کردستان توکن‌های متمایز دارند (تصادمِ ۱۲→۱۲ برطرف شد)', () => {
  assert.notStrictEqual(mapProvinceToken('کردستان', null), mapProvinceToken('سیستان', null));
});
chk('توکنِ همهٔ استان‌هایِ seed یکتا و دو رقمی است', () => {
  const codes = (store.provinces || []).map((p) => mapProvinceToken(p.name, null));
  assert.ok(codes.every((c) => /^\d{2}$/.test(c)), 'all codes 2-digit: ' + codes.join(','));
  assert.strictEqual(new Set(codes).size, codes.length, 'province codes must be unique');
});
chk('mapProvinceToken: نام و کدِ seed با store به یک توکن نگاشته می‌شوند', () => {
  for (const p of store.provinces) {
    assert.strictEqual(mapProvinceToken(p.name, store), mapProvinceToken(p.code, store), p.name);
  }
});

/* ── F#8: allowlistِ pull + نشتِ ردیف‌های سراسری */
console.log('\n■ F#8 — allowlistِ pull و نشتِ ردیف‌های سراسری');

const { createPull } = require('../server/pull');
const ctx = {
  store,
  sendJson: () => {},
  sessionFrom: async () => null
};
const pull = createPull(ctx);
const filter = pull.filterCollectionForSession;

chk('collection‌های غیراستاندارد دیگر سرو نمی‌شوند', () => {
  const requested = ['bus_locations', 'parent_subscriptions', 'offices', 'tombstones', 'parent_links'];
  const ALL = ['schools','users','classes','subjects','schedule','enrollments','attendance','grades',
    'discipline','leaves','notifications','announcements','hw_assignments','hw_submissions',
    'vclass_sessions','bell_schedules','sync_conflicts','counselor_refs','counselor_msgs'];
  assert.deepStrictEqual(requested.filter((c) => ALL.includes(c)), []);
});
chk('parent: ردیف‌های سراسری (school_id==null) از مجموعه‌های غیرعمومی نشت نمی‌کنند', () => {
  const parent = { id: 17, role: 'parent', school_id: 1 };
  const globalRows = [{ id: 1, student_id: 999 }, { id: 2, school_id: null, amount: 2200000 }];
  const out = filter('parent_subscriptions', globalRows, parent);
  assert.deepStrictEqual(out, [], 'unscoped rows must not leak');
});
chk('parent: announcements همچنان ردیف‌های عمومی را نگه می‌دارد', () => {
  const parent = { id: 17, role: 'parent', school_id: 1 };
  const rows = [{ id: 1, school_id: null }, { id: 2, school_id: 1 }, { id: 3, school_id: 2 }];
  assert.deepStrictEqual(filter('announcements', rows, parent).map((r) => r.id), [1, 2]);
});
chk('parent: مجموعه‌های مدرسه‌ای فقط مدرسهٔ خودش را برمی‌گردانند', () => {
  const parent = { id: 17, role: 'parent', school_id: 1 };
  const rows = [{ id: 1, school_id: 1 }, { id: 2, school_id: 2 }, { id: 3, school_id: null }];
  assert.deepStrictEqual(filter('leaves', rows, parent).map((r) => r.id), [1]);
});
chk('edu_office: فقط مدارسِ زیرِ پوششِ دفتر را می‌بیند', () => {
  const rows = [{ id: 1, school_id: 1 }, { id: 2, school_id: 2 }, { id: 3, school_id: 3 }];
  assert.deepStrictEqual(filter('leaves', rows, EDU_PROV1).map((r) => r.id), [1, 2]);
  assert.deepStrictEqual(filter('leaves', rows, EDU_SUB).map((r) => r.id), [1]);
});

/* ── F#9: حلِ فرزند از parent_links (منبعِ یکتا) */
console.log('\n■ F#9 — حلِ فرزندِ ولی از parent_links');

chk('parent_links در seed موجود است و users.parent_id خالی است', () => {
  assert.ok((store.parent_links || []).some((l) => Number(l.parent_id) === 17));
  assert.ok(store.users.find((u) => u.id === 16).parent_id == null);
});
chk('childrenOfParent فرزندِ ۱۶ را از parent_links پیدا می‌کند', () => {
  const kids = policy.childrenOfParent(store, 17);
  assert.ok(kids.has(16), 'child 16 must resolve via parent_links');
});
chk('parent می‌تواند حضورِ فرزندش را از pull بخواند', () => {
  const parent = { id: 17, role: 'parent', school_id: 1 };
  const rows = (store.attendance || []).filter((r) => Number(r.student_id) === 16).slice(0, 3);
  assert.ok(rows.length > 0, 'seed has attendance for student 16');
  assert.deepStrictEqual(filter('attendance', rows, parent), rows);
});
chk('parent حضورِ دانش‌آموزِ دیگر را نمی‌بیند', () => {
  const parent = { id: 17, role: 'parent', school_id: 1 };
  const others = (store.attendance || []).filter((r) => Number(r.student_id) !== 16).slice(0, 3);
  assert.deepStrictEqual(filter('attendance', others, parent), []);
});

/* ── F#3: عدمِ پنهان‌سازی در تجمیع‌های منطقه‌ای */
console.log('\n■ F#3 — عدمِ پنهان‌سازیِ دادهٔ گم‌شده');

chk('generateDistrictAggregation: مدرسهٔ بدون داده HEALTHY فرض نمی‌شود', () => {
  const d = sic.generateDistrictAggregation([
    { school_id: 1, health_index: { status: 'HEALTHY' }, attendance_summary: { calendar_rate: 94 } },
    { school_id: 2 /* بدون health_index و بدون attendance */ }
  ]);
  assert.strictEqual(d.health_distribution.HEALTHY, 1, 'only the real HEALTHY counts');
  assert.strictEqual(d.health_distribution.NEEDS_MONITORING, 0);
  assert.strictEqual(d.schools_with_no_data_count, 1);
  assert.strictEqual(d.overall_average_attendance, 94, 'not diluted by 90.0');
  assert.strictEqual(d.schools_reported_in_attendance_average, 1);
});
chk('generateDistrictAggregation: همه بدون داده ⇒ null (نه ۹۰/۵)', () => {
  const d = sic.generateDistrictAggregation([{ school_id: 1 }, { school_id: 2 }]);
  assert.strictEqual(d.overall_average_attendance, null);
  assert.strictEqual(d.district_chronic_absence_rate, null);
  assert.strictEqual(d.schools_with_no_data_count, 2);
});
chk('buildRegionalSnapshot: مدرسهٔ بدون داده ۱۰۰٪ حلِ مسائل نمی‌سازد', () => {
  const rin = require('../server/analytics/regional-intelligence-network');
  const snap = rin.buildRegionalSnapshot({
    regionId: 1,
    schools: [{ school_id: 1, intervention_summary: { active_cases_count: 4 } }]
  });
  const iv = snap.intervention_summary || {};
  assert.strictEqual(iv.overall_resolution_rate, null, 'no data must not become 100%');
  assert.strictEqual(iv.effective_interventions_ratio, null, '0.85/1.0 fabrication removed');
  assert.ok(iv.schools_reported_in_resolution_average === 0, 'reported count is explicit');
});
chk('generateActionRecommendations: مدرسهٔ بدون داده توصیه‌ی خیالی نمی‌سازد', () => {
  const rap = require('../server/analytics/recommendation-action-planning');
  const recs = rap.generateActionRecommendations({ schoolId: 7, schoolSnapshot: {} });
  const att = recs.find((r) => r.action_type === 'ATTENDANCE_SUPPORT' || r.type === 'ATTENDANCE_SUPPORT');
  assert.ok(!att, 'no attendance recommendation should be fabricated from empty data');
});
chk('generateActionRecommendations: با دادهٔ واقعی هنوز کار می‌کند', () => {
  const rap = require('../server/analytics/recommendation-action-planning');
  const recs = rap.generateActionRecommendations({
    schoolId: 10,
    schoolSnapshot: { attendance_rate: 82.0, chronic_absence_rate: 14.2, average_gpa: 11.2 }
  });
  assert.ok(recs.some((r) => (r.action_type || r.type) === 'ATTENDANCE_SUPPORT'));
  assert.ok(recs.length >= 2);
});

/* ── جمع‌بندی */
Promise.all(checks).then(() => {
  console.log('\n' + '═'.repeat(60));
  console.log('نتیجهٔ Phase B regression: ' + pass + ' موفق / ' + failures.length + ' ناموفق');
  if (failures.length) { console.log('ناموفق‌ها: ' + failures.join('، ')); }
  process.exit(failures.length ? 1 : 0);
});

/* ── ابزارها */
function school(id) { return (store.schools || []).find((s) => Number(s.id) === Number(id)); }
async function assertRejectsAsync(fn) {
  try { await fn(); throw new Error('expected the guard to throw'); }
  catch (e) { if (/expected the guard to throw/.test(e.message)) throw e; }
}

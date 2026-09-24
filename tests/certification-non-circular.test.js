#!/usr/bin/env node
/**
 * tests/certification-non-circular.test.js
 * گواهی انتشار غیرچرخشی — قفل عیب D5
 *
 * انگیزه: validateEngineCompleteness نسخهٔ قدیمی فقط کاتالوگِ خودش را چک می‌کرد
 * (آیا همهٔ شناسه‌ها present و ACTIVE هستند؟). این بررسی کاملاً چرخشی بود:
 * یک موتور یتیم، بدون هیچ مصرف‌کنندهٔ رانتایم، تا ابد در گزارش‌ها
 * «پیاده‌سازی‌شده» می‌نمود و گواهی انتشار همچنان صادر می‌شد.
 *
 * این تست تضمین می‌کند که:
 *   ۱. کاتالوگ همهٔ ۲۰ موتور (EI-01..EI-20) را پوشش می‌دهد.
 *   ۲. کاتالوگ برای هر موتور، نام فایل روی دیسک (module) دارد.
 *   ۳. اعتبارسنجی، گراف require واقعی را بررسی می‌کند (نه فقط اظهارنامه).
 *   ۴. اگر یک موتور ACTIVE در کاتالوگ مسیر رانتایم نداشته باشد،
 *      گواهی انتشار نباید صادر شود — یعنی کامل بودن false می‌شود.
 *   ۵. شبیه‌سازی F-EI-01: ۸ موتور یتیم → گواهی مسدود می‌شود.
 */
'use strict';

const assert = require('assert');
const {
  CANONICAL_PHASE3_CATALOG,
  PHASE3_ENGINE_ID,
  CERTIFICATION_STATUS,
  validateEngineCompleteness,
  computeRuntimeWiring,
  generatePhase3ReleaseCertificate,
  runPhase3Certification
} = require('../server/analytics/intelligence-release-certification');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

console.log('\n🛡️  گواهی انتشار غیرچرخشی (D5 Non-Circular Certification Gate)\n');

// ── ۱. کاتالوگ همهٔ ۲۰ موتور را پوشش می‌دهد ─────────────────────────────
const allIds = Object.values(PHASE3_ENGINE_ID);
check('کاتالوگ دقیقاً ۲۰ موتور را ثبت کرده (۱۲ فاز ۳ + ۸ لایه معنایی)',
  CANONICAL_PHASE3_CATALOG.length === 20, `length=${CANONICAL_PHASE3_CATALOG.length}`);

check('هر ۸ موتور P0-EI-01..08 در کاتالوگ حضور دارند',
  [PHASE3_ENGINE_ID.EI_01_SEMANTIC, PHASE3_ENGINE_ID.EI_02_STUDENT_TIMELINE,
   PHASE3_ENGINE_ID.EI_03_ASSESSMENT, PHASE3_ENGINE_ID.EI_04_ATTENDANCE,
   PHASE3_ENGINE_ID.EI_05_SCHOOL_HEALTH_DASHBOARD, PHASE3_ENGINE_ID.EI_06_PARENT_360,
   PHASE3_ENGINE_ID.EI_07_TEACHER_EVIDENCE, PHASE3_ENGINE_ID.EI_08_INTERVENTION_CASES]
    .every(id => CANONICAL_PHASE3_CATALOG.some(e => e.engine_id === id)));

// ── ۲. هر کاتالوگ، نگاشت module (فایل روی دیسک) دارد ───────────────────
const withoutModule = CANONICAL_PHASE3_CATALOG.filter(e => !e.module);
check('هر موتور کاتالوگ دارای فیلد module (نگاشت به فایل واقعی) است',
  withoutModule.length === 0,
  withoutModule.length ? `بدون module: ${withoutModule.map(e => e.engine_id).join(', ')}` : '');

// ── ۳. منبع حقیقت، دیسک است (نه اظهارنامه) ───────────────────────────
const wiring = computeRuntimeWiring();
check('computeRuntimeWiring، گراف require واقعی سرور را اسکن می‌کند',
  Array.isArray(wiring.modulesOnDisk) &&
  wiring.modulesOnDisk.length >= 20 &&
  wiring.wired instanceof Set && wiring.wired.size >= 20,
  `modules_on_disk=${wiring.modulesOnDisk.length} wired=${wiring.wired.size} orphans=${wiring.orphans.length}`);

// حالت سالم: همه متصل → کامل
const healthy = validateEngineCompleteness();
check('وضعیت سالم: ۲۰ موتور متصل → complete=true',
  healthy.complete === true,
  `complete=${healthy.complete} active=${healthy.active_count} orphans=${healthy.runtime_wiring.orphan_count}`);

check('گزارش، شاخص‌های اتصال رانتایم را برمی‌گرداند',
  healthy.runtime_wiring !== undefined &&
  typeof healthy.runtime_wiring.wired_count === 'number' &&
  Array.isArray(healthy.runtime_wiring.dead_active_modules),
  JSON.stringify(healthy.runtime_wiring));

// ── ۴. شبیه‌سازی یتیمی: کاتالوگ سالم ولی موتورها در رانتایم مرده ───────
// این دقیقاً شرایط پیش از رفع F-EI-01 بود: کاتالوگ می‌گفت «همه ACTIVE»
// در حالی که هیچ مسیر زنده‌ای وجود نداشت. گواهی نباید صادر شود.
const orphanWiring = {
  modulesOnDisk: wiring.modulesOnDisk,
  wired: new Set(),          // هیچ موتوری متصل نیست
  orphans: wiring.modulesOnDisk.slice()
};
const withOrphans = validateEngineCompleteness(CANONICAL_PHASE3_CATALOG, { runtimeWiring: orphanWiring });
check('شبیه‌سازی یتیمی کامل: هیچ مسیر رانتایمی → complete=false',
  withOrphans.complete === false,
  `complete=${withOrphans.complete} dead_active=${withOrphans.runtime_wiring.dead_active_modules.length}`);
check('ایتیم‌بودن، همهٔ ۲۰ موتور را به‌عنوان dead_active گزارش می‌کند',
  withOrphans.runtime_wiring.dead_active_modules.length === 20,
  `dead=${withOrphans.runtime_wiring.dead_active_modules.length}`);

// ── ۵. یک موتور یتیم کافی برای مسدود شدن گواهی است ────────────────────
const partiallyWired = new Set(wiring.wired);
partiallyWired.delete('parent-360');
const oneOrphan = validateEngineCompleteness(CANONICAL_PHASE3_CATALOG, {
  runtimeWiring: { modulesOnDisk: wiring.modulesOnDisk, wired: partiallyWired, orphans: ['parent-360'] }
});
check('حتی یک موتور یتیم (parent-360) هم گواهی را مسدود می‌کند',
  oneOrphan.complete === false &&
  oneOrphan.runtime_wiring.dead_active_modules.includes('parent-360'),
  `complete=${oneOrphan.complete}`);

// ── ۶. گواهی واقعی در حالت یتیم، REJECTED می‌شود ──────────────────────
const rejectedCert = generatePhase3ReleaseCertificate({ completeness: withOrphans });
check('گواهی انتشار در حالت یتیمی، REJECTED و release_ready=false می‌شود',
  rejectedCert.status === CERTIFICATION_STATUS.REJECTED && rejectedCert.release_ready === false,
  `status=${rejectedCert.status}`);

const healthyCert = generatePhase3ReleaseCertificate({ completeness: healthy });
check('گواهی انتشار در حالت سالم، CERTIFIED می‌شود',
  healthyCert.status === CERTIFICATION_STATUS.CERTIFIED && healthyCert.release_ready === true,
  `status=${healthyCert.status}`);

// ── ۷. سناریوی کاتالوگ ناقص (همچنان معتبر) ─────────────────────────────
const incompleteCatalog = CANONICAL_PHASE3_CATALOG.filter(
  e => e.engine_id !== PHASE3_ENGINE_ID.EI_20_PLATFORM_INTEGRATION
);
const incompleteValidation = validateEngineCompleteness(incompleteCatalog);
check('کاتالوگ ناقص → complete=false با یک موتور غایب',
  incompleteValidation.complete === false &&
  incompleteValidation.missing_engines.length === 1 &&
  incompleteValidation.missing_engines[0] === PHASE3_ENGINE_ID.EI_20_PLATFORM_INTEGRATION,
  `missing=${JSON.stringify(incompleteValidation.missing_engines)}`);

// ── ۸. runPhase3Certification در محیط واقعی همچنان CERTIFIED ────────
const cert = runPhase3Certification(
  { schoolId: 101, regionId: 1, academicYear: '1404-1405', user: { id: 10, role: 'manager', school_id: 101, region_id: 1 } },
  { timestamp: '2026-09-24T09:00:00.000Z' }
);
check('runPhase3Certification با ۲۰ موتور متصل، CERTIFIED می‌ماند',
  cert.certification_status === CERTIFICATION_STATUS.CERTIFIED && cert.release_ready === true,
  `status=${cert.certification_status}`);
check('engines_summary، ۲۰ موتور را گزارش می‌دهد',
  cert.release_certificate.engines_summary.total_required === 20 &&
  cert.release_certificate.engines_summary.total_certified === 20,
  `required=${cert.release_certificate.engines_summary.total_required} certified=${cert.release_certificate.engines_summary.total_certified}`);

console.log(`\nگواهی غیرچرخشی: ${pass} pass / ${fail} fail`);
if (fail) {
  failures.forEach(f => console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
  process.exit(1);
}
console.log('✅ گواهی انتشار دیگر چرخشی نیست؛ موتور مرده، گواهی را مسدود می‌کند.');

/**
 * تست تمامیت محاسبات شاخص‌های عملکردی اپلیکیشن و ظرفیت (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  collectApplicationMetrics,
  collectCapacityMetrics
} = require('../../../server/monitoring/production-observability');

function runMetricsIntegrityTests() {
  console.log('▸ تست ۲: تمامیت محاسبات شاخص‌های عملکردی و ظرفیت (metrics-integrity)');

  /* ۱. نبودِ اندازه‌گیری، سلامت نیست (N-11).
     این سنجه پیش‌تر «بدون هیچ ورودی» را healthy و ۲۵۰ درخواست بر ثانیه می‌خواست —
     یعنی همان عددسازی که N-11 جلوی آن را می‌گیرد: سرویسی که هیچ نمونه‌ای ندارد
     نباید روی داشبورد سبز دیده شود. پس سنجه اصلاح می‌شود، نه نگهبان. */
  const defaultApp = collectApplicationMetrics();
  assert.strictEqual(defaultApp.status, 'unknown');
  assert.strictEqual(defaultApp.is_live, false);
  assert.strictEqual(defaultApp.samples, 0);
  assert.strictEqual(defaultApp.total_requests, 0);
  assert.strictEqual(defaultApp.request_rate_per_sec, null);
  assert.strictEqual(defaultApp.error_rate, null);
  assert.deepStrictEqual(defaultApp.latency_ms, { p50: null, p95: null, p99: null });
  assert.strictEqual(defaultApp.slo_compliance.p99_under_1s, false);
  assert.strictEqual(defaultApp.slo_compliance.error_rate_under_point_one_pct, false);
  assert.strictEqual(defaultApp.slo_compliance.not_verified, true);
  /* نتیجه باید یخ‌زده باشد: بازنویسی local یک وضعیتِ اندازه‌گیری‌نشده به «healthy»
     دقیقاً همان دستکاری‌ای است که این نگهبان جلوی گزارش‌سازی‌اش را می‌گیرد. */
  assert.throws(() => { defaultApp.status = 'healthy'; }, TypeError);
  assert.strictEqual(defaultApp.status, 'unknown');

  /* با ورودی واقعی، همان شاخص‌ها باید محاسبه و گزارش شوند — یعنی UNKNOWN
     یک درِ بستهٔ همیشگی نیست، فقط نبودِ داده را داده جا نمی‌زند. */
  const measuredApp = collectApplicationMetrics({
    latency_p95_ms: 65,
    total_requests: 1000,
    error_count: 1
  });
  assert.notStrictEqual(measuredApp.status, 'unknown');
  assert.strictEqual(measuredApp.error_rate, 0.001);
  assert.strictEqual(measuredApp.latency_ms.p95, 65);
  /* آستانه سخت‌گیرانه است: دقیقاً ۰.۱٪ «زیرِ» ۰.۱٪ نیست — این مرز هم قفل می‌شود تا
     یک تغییرِ بی‌سر‌و‌صدا در مقایسه، سبز/قرمز شدنِ کل SLI را جابه‌جا نکند. */
  assert.strictEqual(measuredApp.slo_compliance.error_rate_under_point_one_pct, false);
  assert.strictEqual(
    collectApplicationMetrics({ latency_p95_ms: 65, total_requests: 1000, error_count: 0 })
      .slo_compliance.error_rate_under_point_one_pct,
    true
  );

  // ۲. ارزیابی تاخیر بالا و تغییر وضعیت به بحرانی
  const degradedApp = collectApplicationMetrics({
    latency_p99_ms: 450,
    error_count: 15,
    total_requests: 1000
  });
  assert.strictEqual(degradedApp.status, 'degraded');
  assert.strictEqual(degradedApp.latency_ms.p99, 450);
  assert.strictEqual(degradedApp.error_rate, 0.015);

  const criticalApp = collectApplicationMetrics({
    latency_p99_ms: 1200,
    error_count: 600,
    total_requests: 10000
  });
  assert.strictEqual(criticalApp.status, 'critical');
  assert.strictEqual(criticalApp.slo_compliance.p99_under_1s, false);

  // ۳. ارزیابی شاخص‌های ظرفیت منابع
  const capacity = collectCapacityMetrics({
    cpu_utilization_pct: 45.0,
    active_connections: 500,
    max_connections: 2000
  });

  assert(Number.isFinite(capacity.cpu.utilization_pct));
  assert(Number.isFinite(capacity.cpu.cores_available));
  assert(Number.isFinite(capacity.memory.rss_bytes));
  assert(Number.isFinite(capacity.memory.heap_total_bytes));
  assert(Number.isFinite(capacity.memory.heap_used_bytes));
  assert.strictEqual(capacity.connections.saturation_pct, 25.0);
  assert.strictEqual(capacity.connections.status, 'ACCEPTABLE');

  console.log('  ✅ صحت محاسبات شاخص‌های عملکردی و ظرفیت منابع با موفقیت تایید شد');
}

if (require.main === module) {
  runMetricsIntegrityTests();
}

module.exports = { runMetricsIntegrityTests };

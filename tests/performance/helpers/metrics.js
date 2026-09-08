/* ═══════════════════════════════════════════════════════════════════
   tests/performance/helpers/metrics.js
   سنجه‌های سفارشی k6 برای آزمون‌های کارایی و سنجش پایداری در مقیاس ملی
   ═══════════════════════════════════════════════════════════════════ */
import { Trend, Rate, Counter, Gauge } from 'k6/metrics';

// سنجه‌های زمانی (Latency Trends)
export const loginDuration = new Trend('login_duration_ms', true);
export const bootstrapDuration = new Trend('bootstrap_duration_ms', true);
export const attendanceDuration = new Trend('attendance_duration_ms', true);
export const gradesDuration = new Trend('grades_duration_ms', true);
export const notificationDuration = new Trend('notification_duration_ms', true);
export const syncDuration = new Trend('sync_duration_ms', true);
export const dbQueryDuration = new Trend('db_query_duration_ms', true);
export const redisLatency = new Trend('redis_latency_ms', true);

// سنجه‌های نرخ خطا (Error Rates)
export const loginFailureRate = new Rate('login_failure_rate');
export const bootstrapFailureRate = new Rate('bootstrap_failure_rate');
export const attendanceFailureRate = new Rate('attendance_failure_rate');
export const gradesFailureRate = new Rate('grades_failure_rate');
export const notificationFailureRate = new Rate('notification_failure_rate');
export const syncFailureRate = new Rate('sync_failure_rate');

// شمارنده‌ها و نشانگرهای مقیاس‌پذیری
export const syncOpsCount = new Counter('sync_ops_total');
export const syncBatchSize = new Trend('sync_batch_size');
export const conflictCount = new Counter('sync_conflicts_total');
export const circuitBreakerTrips = new Counter('circuit_breaker_trips');
export const activeVUs = new Gauge('active_concurrent_users');
export const successfulRequests = new Counter('successful_requests_total');

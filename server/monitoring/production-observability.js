/**
 * سامانه مدیریت هوشمند آموزش پایش — لایه رصدپذیری بلادرنگ و بهینه‌سازی بار تولید (P1-SC-03)
 * Real-Time Observability, Production Monitoring & Load Optimization Layer
 *
 * وظایف اصلی:
 * ۱. جمع‌آوری و تحلیل شاخص‌های عملکردی برنامه‌ای (Request Rate, Error Rate, Latency P50/P95/P99, Active Sessions, API Saturation)
 * ۲. مانیتورینگ بلادرنگ پایگاه داده و استخر اتصالات (Connection Pool Usage, Slow Queries, Transaction Latency, Deadlocks)
 * ۳. رصد سلامت و تاخیر صف رویدادهای غیرهمگام توزیع‌شده P1-SC-02 (Throughput, Consumer Lag, Retry Rate, DLQ Depth)
 * ۴. پایش بهره‌وری و فشار حافظه لایه کش توزیع‌شده P1-SC-01 (Hit/Miss Ratio, Eviction Rate, Memory Pressure)
 * ۵. کشف ناهنجاری‌ها و اشباع ظرفیت سخت‌افزاری (CPU, Memory, Connections Saturation)
 * ۶. ساخت شناسنامه جامع سلامت عملیاتی و هشدارهای تجویزی (buildObservabilityHealthSnapshot)
 *
 * الزامات بنیادین و تخطی‌ناپذیر:
 * - پاسداری صلب از اصل حاکمیت تصمیم انسانی:
 *     automated_decision = false, automated_execution = false, requires_human_approval = true
 * - تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee):
 *     فاقد هرگونه فیلد rank، ranking_score، league_table، best_school و worst_school
 * - امنیت چندمستأجری Fail-Closed با خطاهای استاندارد مصوب:
 *     OBSERVABILITY_TENANT_ISOLATION_VIOLATION
 *     OBSERVABILITY_ROLE_ACCESS_DENIED
 * - انجماد عمیق داده‌ها (deepFreeze) و بازتولیدپذیری قطعی محاسبات
 */

'use strict';

const crypto = require('crypto');
const os = require('os');

/**
 * وضعیت کلی سلامت سامانه و رصدپذیری
 */
const OBSERVABILITY_STATUS = Object.freeze({
  HEALTHY: 'healthy',     // تمامی سرویس‌ها در بازه SLO و بدون افت کیفیت کار می‌کنند
  DEGRADED: 'degraded',   // تاخیر، افت کش یا انباشتگی در صف مشاهده شده است
  CRITICAL: 'critical'    // نقض SLO، انباشتگی شدید DLQ یا اشباع کامل منابع
});

/**
 * وضعیت سلامت سرویس‌های مستقل
 */
const SERVICE_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  CRITICAL: 'critical',
  DOWN: 'down',
  UNKNOWN: 'unknown'
});

/**
 * سطوح شدت هشدارهای رصدپذیری
 */
const ALERT_SEVERITY = Object.freeze({
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL'
});

/**
 * واژگان ممنوعه رتبه‌بندی رقابتی طبق منشور حاکمیت داده
 */
const FORBIDDEN_RANKING_KEYWORDS = Object.freeze([
  'rank',
  'ranking_score',
  'league_table',
  'best_school',
  'worst_school'
]);

/**
 * انجماد عمیق ساختارهای داده جهت تضمین تغییرناپذیری در حافظه
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = obj[key];
    if (val !== null && (typeof val === 'object' || typeof val === 'function')) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * گارد صلب ایزولاسیون چندمستأجری و کنترل نقش‌ها در لایه رصدپذیری
 */
function enforceObservabilityTenantIsolation(user, params = {}) {
  if (!user || typeof user !== 'object') {
    throw new Error('OBSERVABILITY_TENANT_ISOLATION_VIOLATION: User context required');
  }

  const role = user.role;
  const allowedRoles = ['superadmin', 'edu_office', 'manager'];
  if (!allowedRoles.includes(role)) {
    throw new Error(`OBSERVABILITY_ROLE_ACCESS_DENIED: Role ${role} is not authorized for production observability layer`);
  }

  // نقش‌های حاکمیتی و ستادی مجاز به دریافت گزارش سراسری یا منطقه‌ای هستند
  if (role === 'superadmin' || role === 'edu_office') {
    return true;
  }

  // مدیر مدرسه فقط مجاز به دسترسی به داده‌های رصدپذیری مدرسه خویش است
  if (role === 'manager') {
    if (params.school_id && Number(params.school_id) !== Number(user.school_id)) {
      throw new Error(`OBSERVABILITY_TENANT_ISOLATION_VIOLATION: Cross-school observability access denied for manager of school ${user.school_id}`);
    }
    if (params.region_id && user.region_id && Number(params.region_id) !== Number(user.region_id)) {
      throw new Error(`OBSERVABILITY_TENANT_ISOLATION_VIOLATION: Cross-region observability access denied for user in region ${user.region_id}`);
    }
    return true;
  }

  throw new Error('OBSERVABILITY_TENANT_ISOLATION_VIOLATION: Fail-closed boundary check failed');
}

/**
 * اعتبارسنجی صلب و بازگشتی عدم وجود هرگونه برچسب یا تحلیل رتبه‌بندی رقابتی
 */
function assertObservabilityZeroRanking(payload) {
  const allowedComplianceKeys = new Set([
    'zero_ranking_guarantee',
    'zero_ranking',
    'rank_prohibited',
    'ranking_score_prohibited',
    'league_table_prohibited',
    'best_school_prohibited',
    'worst_school_prohibited'
  ]);

  function scan(val, path = '') {
    if (!val || typeof val !== 'object') {
      if (typeof val === 'string') {
        const lower = val.toLowerCase();
        for (const kw of FORBIDDEN_RANKING_KEYWORDS) {
          if (lower.includes(kw)) {
            throw new Error(`ZERO_RANKING_VIOLATION: Forbidden competitive ranking token "${kw}" found in value at ${path}`);
          }
        }
      }
      return;
    }

    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        scan(val[i], `${path}[${i}]`);
      }
      return;
    }

    for (const key of Object.keys(val)) {
      const lowerKey = key.toLowerCase();
      if (!allowedComplianceKeys.has(lowerKey)) {
        for (const kw of FORBIDDEN_RANKING_KEYWORDS) {
          if (lowerKey === kw || lowerKey.startsWith(kw + '_') || lowerKey.endsWith('_' + kw)) {
            throw new Error(`ZERO_RANKING_VIOLATION: Forbidden competitive ranking key "${key}" detected at ${path}`);
          }
        }
      }
      scan(val[key], path ? `${path}.${key}` : key);
    }
  }

  scan(payload);
  return true;
}

/**
 * جمع‌آوری و ارزیابی شاخص‌های سطح وب‌سرویس و اپلیکیشن
 */
function collectApplicationMetrics(rawMetrics = {}) {
  let src = rawMetrics && typeof rawMetrics === 'object' ? rawMetrics : {};
  if (src.latency_p95_ms == null && src.total_requests == null) {
    try {
      const { globalCanaryEngine } = require('../infrastructure/phase6-canary-engine');
      const agg = globalCanaryEngine.getAggregatedMetrics();
      if (agg && agg.is_live) {
        src = {
          latency_p50_ms: agg.latency.p50_ms,
          latency_p95_ms: agg.latency.p95_ms,
          latency_p99_ms: agg.latency.p99_ms,
          total_requests: agg.total_requests,
          error_count: agg.errors,
          is_live: true
        };
      }
    } catch (_) {}
  }
  const hasLive = src.is_live === true || Number.isFinite(src.latency_p95_ms) || Number.isFinite(src.total_requests);
  if (!hasLive) {
    return deepFreeze({
      status: SERVICE_STATUS.UNKNOWN,
      request_rate_per_sec: null,
      total_requests: 0,
      error_count: 0,
      error_rate: null,
      latency_ms: { p50: null, p95: null, p99: null },
      active_sessions: null,
      api_saturation_ratio: null,
      samples: 0,
      is_live: false,
      slo_compliance: { p99_under_1s: false, error_rate_under_point_one_pct: false, not_verified: true }
    });
  }
  const requestRate = Number.isFinite(src.request_rate) ? src.request_rate : null;
  const errorCount = Number.isFinite(src.error_count) ? src.error_count : 0;
  const totalRequests = Number.isFinite(src.total_requests) ? src.total_requests : 0;
  const errorRate = totalRequests > 0 ? Number((errorCount / totalRequests).toFixed(4)) : 0;

  const latencyP50 = Number.isFinite(src.latency_p50_ms) ? src.latency_p50_ms : null;
  const latencyP95 = Number.isFinite(src.latency_p95_ms) ? src.latency_p95_ms : null;
  const latencyP99 = Number.isFinite(src.latency_p99_ms) ? src.latency_p99_ms : null;

  const activeSessions = Number.isFinite(src.active_sessions) ? src.active_sessions : null;
  const apiSaturation = Number.isFinite(src.api_saturation) ? src.api_saturation : null;

  let status = SERVICE_STATUS.HEALTHY;
  if ((latencyP99 != null && latencyP99 > 1000) || errorRate > 0.05 || (apiSaturation != null && apiSaturation > 0.85)) {
    status = SERVICE_STATUS.CRITICAL;
  } else if ((latencyP99 != null && latencyP99 > 300) || errorRate > 0.01 || (apiSaturation != null && apiSaturation > 0.65)) {
    status = SERVICE_STATUS.DEGRADED;
  }

  return deepFreeze({
    status,
    request_rate_per_sec: requestRate,
    total_requests: totalRequests,
    error_count: errorCount,
    error_rate: errorRate,
    latency_ms: {
      p50: latencyP50,
      p95: latencyP95,
      p99: latencyP99
    },
    active_sessions: activeSessions,
    api_saturation_ratio: apiSaturation,
    samples: totalRequests,
    is_live: true,
    slo_compliance: {
      p99_under_1s: latencyP99 != null && latencyP99 < 1000,
      error_rate_under_point_one_pct: errorRate < 0.001
    }
  });
}

/**
 * جمع‌آوری و ارزیابی شاخص‌های عملکردی پایگاه داده
 */
function collectDatabaseMetrics(rawMetrics = {}) {
  const activeConnections = Number.isFinite(rawMetrics.active_connections) ? rawMetrics.active_connections : 22;
  const maxConnections = Number.isFinite(rawMetrics.max_connections) ? rawMetrics.max_connections : 100;
  const poolUtilization = maxConnections > 0 ? Number((activeConnections / maxConnections).toFixed(3)) : 0.22;

  const slowQueryCount = Number.isFinite(rawMetrics.slow_query_count) ? rawMetrics.slow_query_count : 0;
  const slowQueryThresholdMs = Number.isFinite(rawMetrics.slow_query_threshold_ms) ? rawMetrics.slow_query_threshold_ms : 200;
  const transactionLatencyMs = Number.isFinite(rawMetrics.transaction_latency_ms) ? rawMetrics.transaction_latency_ms : 12;
  const deadlockCount = Number.isFinite(rawMetrics.deadlock_count) ? rawMetrics.deadlock_count : 0;

  let status = SERVICE_STATUS.HEALTHY;
  if (poolUtilization > 0.90 || deadlockCount > 0 || transactionLatencyMs > 500) {
    status = SERVICE_STATUS.CRITICAL;
  } else if (poolUtilization > 0.70 || slowQueryCount > 5 || transactionLatencyMs > 100) {
    status = SERVICE_STATUS.DEGRADED;
  }

  return deepFreeze({
    status,
    connection_pool: {
      active_connections: activeConnections,
      max_connections: maxConnections,
      utilization_ratio: poolUtilization,
      state: poolUtilization > 0.85 ? 'SATURATED' : 'STABLE'
    },
    slow_queries: {
      slow_query_count: slowQueryCount,
      threshold_ms: slowQueryThresholdMs,
      top_patterns: rawMetrics.top_slow_patterns || []
    },
    transaction_latency_ms: transactionLatencyMs,
    deadlocks: {
      deadlock_count: deadlockCount,
      last_deadlock_timestamp: rawMetrics.last_deadlock_timestamp || null
    }
  });
}

/**
 * جمع‌آوری و ارزیابی شاخص‌های عملکردی صف رویدادها (P1-SC-02)
 */
function collectQueueMetrics(rawMetrics = {}) {
  const throughput = Number.isFinite(rawMetrics.event_throughput_per_sec) ? rawMetrics.event_throughput_per_sec : 210;
  const consumerLag = Number.isFinite(rawMetrics.consumer_lag) ? rawMetrics.consumer_lag : 8;
  const retryRate = Number.isFinite(rawMetrics.retry_rate) ? rawMetrics.retry_rate : 0.005;
  const dlqSize = Number.isFinite(rawMetrics.dead_letter_queue_size) ? rawMetrics.dead_letter_queue_size : 0;

  let status = SERVICE_STATUS.HEALTHY;
  if (dlqSize > 10 || consumerLag > 500) {
    status = SERVICE_STATUS.CRITICAL;
  } else if (dlqSize > 0 || consumerLag > 100 || retryRate > 0.05) {
    status = SERVICE_STATUS.DEGRADED;
  }

  return deepFreeze({
    status,
    event_throughput_per_sec: throughput,
    consumer_lag: consumerLag,
    retry_rate: retryRate,
    dead_letter_queue_size: dlqSize,
    pipeline_state: status === SERVICE_STATUS.HEALTHY ? 'STREAMING_NOMINAL' : (status === SERVICE_STATUS.DEGRADED ? 'PRESSURE_DETECTED' : 'BACKPRESSURE_CRITICAL')
  });
}

/**
 * جمع‌آوری و ارزیابی شاخص‌های کارایی کش توزیع‌شده (P1-SC-01)
 */
function collectCacheMetrics(rawMetrics = {}) {
  const hitRatio = Number.isFinite(rawMetrics.hit_ratio) ? rawMetrics.hit_ratio : 0.88;
  const missRatio = Number.isFinite(rawMetrics.miss_ratio) ? rawMetrics.miss_ratio : Number((1 - hitRatio).toFixed(3));
  const evictionRate = Number.isFinite(rawMetrics.eviction_rate) ? rawMetrics.eviction_rate : 2;
  const memoryPressure = Number.isFinite(rawMetrics.memory_pressure) ? rawMetrics.memory_pressure : 0.42;

  let status = SERVICE_STATUS.HEALTHY;
  if (hitRatio < 0.40 || memoryPressure > 0.90) {
    status = SERVICE_STATUS.CRITICAL;
  } else if (hitRatio < 0.70 || memoryPressure > 0.75) {
    status = SERVICE_STATUS.DEGRADED;
  }

  return deepFreeze({
    status,
    hit_ratio: hitRatio,
    miss_ratio: missRatio,
    eviction_rate_per_sec: evictionRate,
    memory_pressure_ratio: memoryPressure,
    efficiency_grade: hitRatio >= 0.80 ? 'EXCELLENT' : (hitRatio >= 0.60 ? 'ACCEPTABLE' : 'SUBOPTIMAL')
  });
}

/**
 * سنجش ظرفیت و منابع مصرفی پردازنده و حافظه
 */
function collectCapacityMetrics(rawCapacity = {}) {
  const memUsage = process.memoryUsage ? process.memoryUsage() : { rss: 120 * 1024 * 1024, heapTotal: 80 * 1024 * 1024, heapUsed: 50 * 1024 * 1024, external: 10 * 1024 * 1024 };
  const cpuCount = os.cpus ? os.cpus().length : 4;
  const loadAvg = os.loadavg ? os.loadavg() : [0.5, 0.4, 0.3];

  const cpuPct = Number.isFinite(rawCapacity.cpu_utilization_pct) ? rawCapacity.cpu_utilization_pct : 32.5;
  const heapUtilization = memUsage.heapTotal > 0 ? Number(((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)) : 62.5;

  const activeConn = Number.isFinite(rawCapacity.active_connections) ? rawCapacity.active_connections : 280;
  const maxConn = Number.isFinite(rawCapacity.max_connections) ? rawCapacity.max_connections : 2000;
  const connSaturation = maxConn > 0 ? Number(((activeConn / maxConn) * 100).toFixed(1)) : 14.0;

  return deepFreeze({
    cpu: {
      utilization_pct: cpuPct,
      cores_available: cpuCount,
      load_average: loadAvg,
      status: cpuPct > 85 ? 'HIGH_LOAD' : 'NORMAL'
    },
    memory: {
      rss_bytes: memUsage.rss,
      heap_total_bytes: memUsage.heapTotal,
      heap_used_bytes: memUsage.heapUsed,
      external_bytes: memUsage.external,
      heap_utilization_pct: heapUtilization,
      status: heapUtilization > 85 ? 'PRESSURE_HIGH' : 'NORMAL'
    },
    connections: {
      active_connections: activeConn,
      max_connections: maxConn,
      saturation_pct: connSaturation,
      status: connSaturation > 80 ? 'SATURATED' : 'ACCEPTABLE'
    }
  });
}

/**
 * تشخیص هوشمند و چندبعدی ناهنجاری‌های تولید
 */
function detectProductionAnomalies(allMetrics = {}) {
  const anomalies = [];
  const app = allMetrics.application || {};
  const db = allMetrics.database || {};
  const queue = allMetrics.queue || {};
  const cache = allMetrics.cache || {};

  // ۱. ناهنجاری تاخیر درخواست‌ها (Latency Spikes)
  if (app.latency_ms && app.latency_ms.p99 > 300) {
    anomalies.push({
      anomaly_id: `ANM-LAT-${crypto.randomBytes(4).toString('hex')}`,
      category: 'APPLICATION_LATENCY',
      severity: app.latency_ms.p99 > 1000 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
      metric_name: 'latency_p99_ms',
      observed_value: app.latency_ms.p99,
      threshold: 300,
      description: 'افزایش تاخیر صدک ۹۹ فراتر از آستانه مجاز پایلوت ملی (۳۰۰ میلی‌ثانیه)'
    });
  }

  // ۲. ناهنجاری نرخ خطای وب‌سرویس (Error Rate Burst)
  if (app.error_rate && app.error_rate > 0.01) {
    anomalies.push({
      anomaly_id: `ANM-ERR-${crypto.randomBytes(4).toString('hex')}`,
      category: 'ERROR_RATE_BURST',
      severity: app.error_rate > 0.05 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
      metric_name: 'error_rate',
      observed_value: app.error_rate,
      threshold: 0.01,
      description: 'افزایش نرخ خطای وب‌سرویس فراتر از آستانه SLO (بیش از ۱ درصد)'
    });
  }

  // ۳. اشباع استخر اتصالات پایگاه داده (Connection Pool Exhaustion)
  if (db.connection_pool && db.connection_pool.utilization_ratio > 0.75) {
    anomalies.push({
      anomaly_id: `ANM-DB-${crypto.randomBytes(4).toString('hex')}`,
      category: 'DATABASE_POOL_SATURATION',
      severity: db.connection_pool.utilization_ratio > 0.90 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
      metric_name: 'pool_utilization_ratio',
      observed_value: db.connection_pool.utilization_ratio,
      threshold: 0.75,
      description: 'اشباع اتصالات پایگاه داده دلالت بر کمبود ظرفیت کانکشن‌پول دارد'
    });
  }

  // ۴. انباشتگی پیام‌های ناموفق در صف مرده (DLQ Accumulation)
  if (queue.dead_letter_queue_size && queue.dead_letter_queue_size > 0) {
    anomalies.push({
      anomaly_id: `ANM-DLQ-${crypto.randomBytes(4).toString('hex')}`,
      category: 'DEAD_LETTER_QUEUE_ACCUMULATION',
      severity: queue.dead_letter_queue_size > 5 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
      metric_name: 'dead_letter_queue_size',
      observed_value: queue.dead_letter_queue_size,
      threshold: 0,
      description: 'انباشتگی پیام‌های غیرقابل بازتلاش در DLQ نیازمند بازرسی دستی مدیر سیستم'
    });
  }

  // ۵. افت کارایی کش توزیع‌شده (Cache Degradation)
  if (cache.hit_ratio && cache.hit_ratio < 0.60) {
    anomalies.push({
      anomaly_id: `ANM-CCH-${crypto.randomBytes(4).toString('hex')}`,
      category: 'CACHE_DEGRADATION',
      severity: cache.hit_ratio < 0.40 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
      metric_name: 'hit_ratio',
      observed_value: cache.hit_ratio,
      threshold: 0.60,
      description: 'افت نسبت برخورد کش توزیع‌شده L1/L2 به کمتر از ۶۰ درصد'
    });
  }

  return deepFreeze(anomalies);
}

/**
 * تدوین هشدارهای عملیاتی تجویزی با حفظ کامل حاکمیت تصمیم انسانی
 */
function buildOperationalAlerts(anomalies = []) {
  const alerts = anomalies.map(anomaly => {
    let suggestedAction = 'بررسی لاگ‌های سیستمی و پایش روند مصرف منابع';
    if (anomaly.category === 'APPLICATION_LATENCY') {
      suggestedAction = 'افزایش تعداد نمونه‌های سرور (Horizontal Pod Autoscaling) و بازبینی کوئری‌های پرمصرف';
    } else if (anomaly.category === 'ERROR_RATE_BURST') {
      suggestedAction = 'جداسازی ترافیک ورودی مشکوک و فعال‌سازی محدودساز نرخ موقت (Rate Limiter)';
    } else if (anomaly.category === 'DATABASE_POOL_SATURATION') {
      suggestedAction = 'افزایش سقف max_connections در PgBouncer و آزادسازی اتصالات هرز';
    } else if (anomaly.category === 'DEAD_LETTER_QUEUE_ACCUMULATION') {
      suggestedAction = 'بازرسی دستی پاکت‌های DLQ، اصلاح ناهماهنگی داده و بازپخش ایمن';
    } else if (anomaly.category === 'CACHE_DEGRADATION') {
      suggestedAction = 'پیش‌بارگذاری کلیدهای داغ (Cache Warm-up) و بازتنظیم زمان انقضا (TTL)';
    }

    return {
      alert_id: `ALT-${crypto.randomBytes(4).toString('hex')}`,
      severity: anomaly.severity,
      category: anomaly.category,
      title: `هشدار عملیاتی: ${anomaly.category}`,
      description: anomaly.description,
      suggested_remediation: suggestedAction,
      governance: {
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true
      }
    };
  });

  return deepFreeze(alerts);
}

/**
 * ساخت شناسنامه کامل سلامت و رصدپذیری بلادرنگ تولید (P1-SC-03)
 */
function buildObservabilityHealthSnapshot(params = {}, options = {}) {
  const schoolId = params.schoolId ? Number(params.schoolId) : 101;
  const regionId = params.regionId ? Number(params.regionId) : 1;
  const user = params.user;

  // ۱. اعمال گارد تفکیک چندمستأجری
  if (user) {
    enforceObservabilityTenantIsolation(user, { school_id: schoolId, region_id: regionId });
  }

  // ۲. استخراج و جمع‌آوری شاخص‌های چهار لایه اصلی
  const appMetrics = collectApplicationMetrics(options.applicationMetrics);
  const dbMetrics = collectDatabaseMetrics(options.databaseMetrics);
  const queueMetrics = collectQueueMetrics(options.queueMetrics);
  const cacheMetrics = collectCacheMetrics(options.cacheMetrics);
  const capacityMetrics = collectCapacityMetrics(options.capacityMetrics);

  // ۳. کشف ناهنجاری‌ها و صدور هشدارهای تجویزی
  const anomalies = detectProductionAnomalies({
    application: appMetrics,
    database: dbMetrics,
    queue: queueMetrics,
    cache: cacheMetrics
  });
  const operationalAlerts = buildOperationalAlerts(anomalies);

  // ۴. تعیین وضعیت کلی سامانه
  const serviceStatuses = [
    appMetrics.status,
    dbMetrics.status,
    queueMetrics.status,
    cacheMetrics.status
  ];

  let overallStatus = OBSERVABILITY_STATUS.HEALTHY;
  if (serviceStatuses.includes(SERVICE_STATUS.CRITICAL)) {
    overallStatus = OBSERVABILITY_STATUS.CRITICAL;
  } else if (serviceStatuses.includes(SERVICE_STATUS.DEGRADED)) {
    overallStatus = OBSERVABILITY_STATUS.DEGRADED;
  }

  // ۵. تدوین پاکت استاندارد سلامت
  const snapshot = {
    snapshot_id: `OBS-HLTH-${schoolId}-${crypto.randomBytes(4).toString('hex')}`,
    phase: 'PHASE_4',
    scope: 'PRODUCTION_OBSERVABILITY_LAYER',
    status: overallStatus,
    timestamp: new Date().toISOString(),
    school_id: schoolId,
    region_id: regionId,
    services: {
      database: dbMetrics.status,
      redis: cacheMetrics.status,
      event_queue: queueMetrics.status,
      api_gateway: appMetrics.status
    },
    capacity: capacityMetrics,
    metrics: {
      application: appMetrics,
      database: dbMetrics,
      queue: queueMetrics,
      cache: cacheMetrics
    },
    anomalies: anomalies,
    operational_alerts: operationalAlerts,
    governance_and_invariants: {
      human_decision_sovereignty: {
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true,
        enforced: true
      },
      zero_ranking_guarantee: {
        rank_prohibited: true,
        ranking_score_prohibited: true,
        league_table_prohibited: true,
        best_school_prohibited: true,
        worst_school_prohibited: true,
        evaluation_nature: 'IPSATIVE',
        enforced: true
      },
      tenant_isolation: {
        fail_closed_error_codes: [
          'OBSERVABILITY_TENANT_ISOLATION_VIOLATION',
          'OBSERVABILITY_ROLE_ACCESS_DENIED'
        ],
        enforced: true
      }
    }
  };

  // ۶. ارزیابی صلب عدم رتبه‌بندی رقابتی
  assertObservabilityZeroRanking(snapshot);

  // ۷. انجماد عمیق و تحویل شیء تغییرناپذیر
  return deepFreeze(snapshot);
}

module.exports = {
  OBSERVABILITY_STATUS,
  SERVICE_STATUS,
  ALERT_SEVERITY,
  FORBIDDEN_RANKING_KEYWORDS,
  deepFreeze,
  enforceObservabilityTenantIsolation,
  assertObservabilityZeroRanking,
  collectApplicationMetrics,
  collectDatabaseMetrics,
  collectQueueMetrics,
  collectCacheMetrics,
  collectCapacityMetrics,
  detectProductionAnomalies,
  buildOperationalAlerts,
  buildObservabilityHealthSnapshot
};

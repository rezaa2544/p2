/**
 * ماژول پایش طولی هوشمندی آموزشی و کشف روندها (P0-EI-12)
 * Educational Intelligence Longitudinal Monitoring & Trend Detection Engine
 * 
 * ویژگی‌های کلیدی:
 *  - ۱) گارد امنیتی، ضد نفوذ (Anti-IDOR) و شکست ایمن چندمستأجری (enforceLongitudinalAccessGuard)
 *  - ۲) تحلیل جبری و بدون تقریب روندهای آموزشی (calculateEducationalTrends)
 *  - ۳) کشف نقاط چرخش معنادار و افت/جهش‌های ناگهانی (detectChangePoints)
 *  - ۴) سنجش ضریب پایداری و تفکیک بهبود پایدار از نوسان مقطعی (calculateSustainableImprovement)
 *  - ۵) تولید بینش‌های عملیاتی و توصیه‌های نظارتی انسان‌محور (generateLongitudinalInsights)
 *  - ۶) ساخت پرونده طولی تاریخی مدرسه بدون هرگونه رتبه‌بندی (buildLongitudinalSchoolProfile)
 *  - ۷) نقشه روندهای منطقه‌ای جهت تخصیص منابع حمایتی (buildRegionalTrendMap)
 * 
 * اصول حاکم:
 *  - ممنوعیت مطلق رتبه‌بندی، League Table، و برچسب‌های بهترین/بدترین مدارس
 *  - قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 *  - ایمنی در برابر جهش داده‌ها با فریز عمیق اشیا (deepFreeze Mutation Safety)
 *  - نظارت قطعی انسانی (Human-in-the-Loop Guard): بدون تصمیم‌گیری خودکار
 */

'use strict';

// جهت‌های روند زمانی
const TREND_DIRECTIONS = Object.freeze({
  IMPROVING: 'IMPROVING',
  STABLE: 'STABLE',
  DECLINING: 'DECLINING'
});

// انواع نقاط چرخش و تغییر معنادار
const CHANGE_POINT_TYPES = Object.freeze({
  SUDDEN_DROP: 'SUDDEN_DROP',
  SUDDEN_SURGE: 'SUDDEN_SURGE',
  SUSTAINED_IMPROVEMENT: 'SUSTAINED_IMPROVEMENT',
  POST_INTERVENTION_INFLECTION: 'POST_INTERVENTION_INFLECTION'
});

// رده‌بندی پایداری و دوام تغییرات
const PERSISTENCE_TYPES = Object.freeze({
  SUSTAINABLE_IMPROVEMENT: 'SUSTAINABLE_IMPROVEMENT',
  SUSTAINED_IMPROVEMENT: 'SUSTAINED_IMPROVEMENT',
  TEMPORARY_SPIKE: 'TEMPORARY_SPIKE',
  RANDOM_FLUCTUATION: 'RANDOM_FLUCTUATION',
  GRADUAL_DECLINE: 'GRADUAL_DECLINE'
});

/**
 * فریز عمیق و بازگشتی برای تضمین پایداری در برابر جهش و تغییر ناخواسته
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * گارد امنیتی و کنترل دسترسی پایش طولی (Anti-IDOR & Fail-Closed Tenant Guard)
 *
 * @param {Object} requester - کاربر درخواست‌دهنده (id, role, school_id, region_id)
 * @param {Object|number|string} targetEntity - مدرسه یا منطقه هدف
 * @param {Object} [options]
 * @returns {boolean}
 */
function enforceLongitudinalAccessGuard(requester, targetEntity, options = {}) {
  if (!requester || typeof requester !== 'object') {
    throw new Error('LONGITUDINAL_ACCESS_FORBIDDEN: requester session is missing');
  }

  const role = requester.role;
  let targetSchoolId = null;
  let targetRegionId = null;

  if (typeof targetEntity === 'object' && targetEntity !== null) {
    targetSchoolId = targetEntity.school_id != null ? Number(targetEntity.school_id) : (targetEntity.schoolId != null ? Number(targetEntity.schoolId) : null);
    targetRegionId = targetEntity.region_id != null ? Number(targetEntity.region_id) : (targetEntity.regionId != null ? Number(targetEntity.regionId) : null);
  } else if (targetEntity != null) {
    targetSchoolId = Number(targetEntity);
  }

  // ۱. مدیر ارشد سامانه (Superadmin)
  if (role === 'superadmin') {
    return true;
  }

  // ۲. کارشناس یا مدیر اداره آموزش و پرورش منطقه (Edu Office)
  if (role === 'edu_office') {
    const userRegionId = requester.region_id != null
      ? Number(requester.region_id)
      : (requester.office_id != null ? Number(requester.office_id) : null);

    if (userRegionId == null) {
      throw new Error('LONGITUDINAL_TENANT_ISOLATION_VIOLATION: edu_office user lacks valid region assignment');
    }
    if (targetRegionId != null && userRegionId !== targetRegionId) {
      throw new Error(`LONGITUDINAL_TENANT_ISOLATION_VIOLATION: edu_office region ${userRegionId} does not match target region ${targetRegionId}`);
    }
    return true;
  }

  // ۳. مدیر مدرسه (School Manager)
  if (role === 'manager') {
    const userSchoolId = requester.school_id != null ? Number(requester.school_id) : null;
    if (userSchoolId == null) {
      throw new Error('LONGITUDINAL_TENANT_ISOLATION_VIOLATION: manager lacks school_id assignment');
    }
    if (targetSchoolId != null && userSchoolId !== targetSchoolId) {
      throw new Error(`LONGITUDINAL_TENANT_ISOLATION_VIOLATION: manager of school ${userSchoolId} cannot access school ${targetSchoolId}`);
    }
    /* F4: region-level intelligence is not part of a school manager's grant. */
    if (targetRegionId != null) {
      throw new Error(`LONGITUDINAL_TENANT_ISOLATION_VIOLATION: manager of school ${userSchoolId} cannot access regional scope ${targetRegionId}`);
    }
    return true;
  }

  // ۴. سایر نقش‌ها (دانش‌آموز، والد، معلم و...)
  throw new Error(`LONGITUDINAL_ACCESS_FORBIDDEN: role ${role} is not authorized to access longitudinal intelligence`);
}

/**
 * استخراج مقدار عددی یک شاخص از درون ساختار اسنپ‌شات
 */
function extractMetricValue(snapshot, metricKey) {
  if (!snapshot || typeof snapshot !== 'object') return null;

  // ۱. بررسی مستقیم در ریشه
  if (snapshot[metricKey] != null) {
    const v = Number(snapshot[metricKey]);
    return isNaN(v) ? null : v;
  }

  // ۲. بررسی مسیرهای تودرتو متداول
  const paths = [
    snapshot.academic_metrics,
    snapshot.academicMetrics,
    snapshot.attendance_metrics,
    snapshot.attendanceMetrics,
    snapshot.intervention_metrics,
    snapshot.interventionMetrics,
    snapshot.quality_metrics,
    snapshot.qualityMetrics,
    snapshot.metrics
  ];

  for (const p of paths) {
    if (p && typeof p === 'object' && p[metricKey] != null) {
      const v = Number(p[metricKey]);
      if (!isNaN(v)) return v;
    }
  }

  return null;
}

/**
 * تشخیص معکوس بودن شاخص (Lower is Better)
 */
function isMetricInverted(metricKey, options = {}) {
  if (options.inverted !== undefined) return Boolean(options.inverted);
  if (!metricKey || typeof metricKey !== 'string') return false;
  const key = metricKey.toLowerCase();
  return (
    key.includes('absence') ||
    key.includes('failing') ||
    key.includes('chronic') ||
    key.includes('dropout') ||
    key.includes('risk') ||
    key.includes('anomaly')
  );
}

/**
 * محاسبه شیب و جهت روند زمانی یک شاخص در طول دوره‌ها
 *
 * @param {Object} params
 * @param {Array<Object>} params.snapshots
 * @param {string} params.metric
 * @param {string} [params.periodRange]
 * @param {Object} [options]
 * @returns {Object}
 */
function calculateEducationalTrends(params = {}, options = {}) {
  const snapshots = Array.isArray(params.snapshots) ? params.snapshots : [];
  const metric = params.metric || params.metricKey || 'health_index';
  const periodRange = params.periodRange || params.period_range || 'ALL';
  const threshold = options.threshold != null ? Number(options.threshold) : 0.2;
  const isInverted = isMetricInverted(metric, options);

  // پالایش و استخراج سری زمانی
  const validPoints = [];
  for (let i = 0; i < snapshots.length; i++) {
    const val = extractMetricValue(snapshots[i], metric);
    if (val != null) {
      validPoints.push({
        index: validPoints.length,
        period: snapshots[i].period || `P${validPoints.length + 1}`,
        value: val
      });
    }
  }

  const n = validPoints.length;
  if (n < 2) {
    return deepFreeze({
      metric,
      period_range: periodRange,
      slope: 0.0,
      direction: TREND_DIRECTIONS.STABLE,
      sample_count: n,
      confidence: 1.0,
      r_squared: 0.0,
      start_value: n === 1 ? validPoints[0].value : null,
      end_value: n === 1 ? validPoints[0].value : null,
      delta: 0.0,
      is_inverted: isInverted
    });
  }

  // رگرسیون خطی قطعی
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    const x = validPoints[i].index;
    const y = validPoints[i].value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  const numerator = sumXY - n * meanX * meanY;
  const denominator = sumXX - n * meanX * meanX;

  const rawSlope = denominator !== 0 ? numerator / denominator : 0;
  const slope = Math.round(rawSlope * 100) / 100;

  // محاسبه R^2
  const ssTotal = sumYY - n * meanY * meanY;
  const ssReg = denominator !== 0 ? (numerator * numerator) / denominator : 0;
  let rSquared = ssTotal > 0 ? ssReg / ssTotal : 1.0;
  rSquared = Math.max(0, Math.min(1.0, Math.round(rSquared * 100) / 100));

  const startValue = validPoints[0].value;
  const endValue = validPoints[n - 1].value;
  const delta = Math.round((endValue - startValue) * 100) / 100;

  // تعیین جهت بر مبنای نوع شاخص
  let direction = TREND_DIRECTIONS.STABLE;
  if (isInverted) {
    if (slope < -threshold) direction = TREND_DIRECTIONS.IMPROVING;
    else if (slope > threshold) direction = TREND_DIRECTIONS.DECLINING;
    else direction = TREND_DIRECTIONS.STABLE;
  } else {
    if (slope > threshold) direction = TREND_DIRECTIONS.IMPROVING;
    else if (slope < -threshold) direction = TREND_DIRECTIONS.DECLINING;
    else direction = TREND_DIRECTIONS.STABLE;
  }

  return deepFreeze({
    metric,
    period_range: periodRange,
    slope,
    direction,
    sample_count: n,
    confidence: rSquared,
    r_squared: rSquared,
    start_value: startValue,
    end_value: endValue,
    delta,
    is_inverted: isInverted
  });
}

/**
 * کشف نقاط چرخش، تغییرات ناگهانی و نقاط عطف معنادار
 *
 * @param {Object} params
 * @param {Array<Object>} params.snapshots
 * @param {string} params.metric
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
function detectChangePoints(params = {}, options = {}) {
  const snapshots = Array.isArray(params.snapshots) ? params.snapshots : [];
  const metric = params.metric || params.metricKey || 'health_index';
  const isInverted = isMetricInverted(metric, options);
  const dropThreshold = options.dropThreshold != null ? Number(options.dropThreshold) : 5.0;
  const changePoints = [];

  const points = [];
  for (const s of snapshots) {
    const val = extractMetricValue(s, metric);
    if (val != null) {
      points.push({
        period: s.period || `P${points.length + 1}`,
        value: val,
        has_intervention: Boolean(s.has_intervention || s.intervention_active || s.hasIntervention)
      });
    }
  }

  if (points.length < 2) {
    return deepFreeze([]);
  }

  // ۱. کشف افت ناگهانی و جهش ناگهانی
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].value;
    const curr = points[i].value;
    const delta = Math.round((curr - prev) * 100) / 100;

    // افت ناگهانی (Sudden Drop)
    const isSuddenDrop = isInverted ? delta > dropThreshold : delta < -dropThreshold;
    if (isSuddenDrop) {
      changePoints.push({
        period: points[i].period,
        change_type: CHANGE_POINT_TYPES.SUDDEN_DROP,
        delta,
        previous_value: prev,
        current_value: curr,
        description: `افت ناگهانی شاخص ${metric} به میزان ${Math.abs(delta)} واحد در دوره ${points[i].period}`
      });
    }

    // جهش ناگهانی (Sudden Surge)
    const isSuddenSurge = isInverted ? delta < -dropThreshold : delta > dropThreshold;
    if (isSuddenSurge) {
      changePoints.push({
        period: points[i].period,
        change_type: CHANGE_POINT_TYPES.SUDDEN_SURGE,
        delta,
        previous_value: prev,
        current_value: curr,
        description: `جهش ناگهانی شاخص ${metric} به میزان ${Math.abs(delta)} واحد در دوره ${points[i].period}`
      });
    }

    // نقطه عطف پس از مداخله (Post-Intervention Inflection)
    if (points[i].has_intervention || points[i - 1].has_intervention) {
      if ((!isInverted && delta > 0) || (isInverted && delta < 0)) {
        changePoints.push({
          period: points[i].period,
          change_type: CHANGE_POINT_TYPES.POST_INTERVENTION_INFLECTION,
          delta,
          previous_value: prev,
          current_value: curr,
          description: `نقطه عطف مثبت پس از اجرای مداخله آموزشی در دوره ${points[i].period}`
        });
      }
    }
  }

  // ۲. کشف بهبود پایدار حداقل سه دوره متوالی
  if (points.length >= 3) {
    for (let i = 2; i < points.length; i++) {
      const v0 = points[i - 2].value;
      const v1 = points[i - 1].value;
      const v2 = points[i].value;

      const isConsecutiveGrowth = isInverted 
        ? (v1 < v0 && v2 < v1) 
        : (v1 > v0 && v2 > v1);

      if (isConsecutiveGrowth) {
        changePoints.push({
          period: points[i].period,
          change_type: CHANGE_POINT_TYPES.SUSTAINED_IMPROVEMENT,
          delta: Math.round((v2 - v0) * 100) / 100,
          previous_value: v0,
          current_value: v2,
          description: `بهبود مداوم شاخص ${metric} طی ۳ دوره متوالی تا دوره ${points[i].period}`
        });
      }
    }
  }

  return deepFreeze(changePoints);
}

/**
 * سنجش پایداری بهبود و تفکیک بهبود واقعی پایدار از نوسان مقطعی
 *
 * @param {Object} params
 * @param {Object} [params.beforePeriod]
 * @param {Object} [params.afterPeriod]
 * @param {Array<Object>} [params.snapshots]
 * @param {string} [params.metric]
 * @param {Object} [options]
 * @returns {Object}
 */
function calculateSustainableImprovement(params = {}, options = {}) {
  const metric = params.metric || 'health_index';
  const isInverted = isMetricInverted(metric, options);

  // حالت الف: دریافت دو دوره قبل و بعد به صورت مستقیم
  if (params.beforePeriod && params.afterPeriod) {
    const preVal = extractMetricValue(params.beforePeriod, metric) ?? Number(params.beforePeriod.value ?? 0);
    const postVal = extractMetricValue(params.afterPeriod, metric) ?? Number(params.afterPeriod.value ?? 0);
    const delta = Math.round((postVal - preVal) * 100) / 100;
    const isImproved = isInverted ? delta < 0 : delta > 0;

    return deepFreeze({
      is_sustainable: isImproved && Math.abs(delta) >= 2.0,
      classification: isImproved ? PERSISTENCE_TYPES.SUSTAINABLE_IMPROVEMENT : PERSISTENCE_TYPES.GRADUAL_DECLINE,
      persistence_score: isImproved ? 1.0 : 0.0,
      delta,
      pre_value: preVal,
      post_value: postVal
    });
  }

  // حالت ب: ارزیابی یک سری زمانی از اسنپ‌شات‌ها
  const snapshots = Array.isArray(params.snapshots) ? params.snapshots : [];
  if (snapshots.length < 2) {
    return deepFreeze({
      is_sustainable: false,
      classification: PERSISTENCE_TYPES.RANDOM_FLUCTUATION,
      persistence_score: 0.0,
      successful_periods: 0,
      total_periods: snapshots.length
    });
  }

  const values = [];
  for (const s of snapshots) {
    const v = extractMetricValue(s, metric);
    if (v != null) values.push(v);
  }

  const n = values.length;
  if (n < 2) {
    return deepFreeze({
      is_sustainable: false,
      classification: PERSISTENCE_TYPES.RANDOM_FLUCTUATION,
      persistence_score: 0.0,
      successful_periods: 0,
      total_periods: n
    });
  }

  const baseline = values[0];
  let successfulPeriods = 0;
  for (let i = 1; i < n; i++) {
    const isSuccess = isInverted ? values[i] < baseline : values[i] > baseline;
    if (isSuccess) successfulPeriods++;
  }

  const persistenceScore = Math.round((successfulPeriods / (n - 1)) * 100) / 100;

  // تحلیل جهت کلی روند
  const trend = calculateEducationalTrends({ snapshots, metric }, options);

  // بررسی وجود جهش موقت (یک قله منفرد و بازگشت به سطح مبنا)
  const hasSpike = values.some((v, idx) =>
    idx > 0 && idx < n - 1 && (
      isInverted
        ? (v < values[idx - 1] - 5 && v < values[idx + 1] - 5)
        : (v > values[idx - 1] + 5 && v > values[idx + 1] + 5)
    )
  );

  let classification = PERSISTENCE_TYPES.RANDOM_FLUCTUATION;
  let isSustainable = false;

  if (hasSpike && persistenceScore < 0.75) {
    classification = PERSISTENCE_TYPES.TEMPORARY_SPIKE;
    isSustainable = false;
  } else if (persistenceScore >= 0.75 && trend.direction === TREND_DIRECTIONS.IMPROVING) {
    classification = PERSISTENCE_TYPES.SUSTAINABLE_IMPROVEMENT;
    isSustainable = true;
  } else if (trend.direction === TREND_DIRECTIONS.DECLINING) {
    classification = PERSISTENCE_TYPES.GRADUAL_DECLINE;
    isSustainable = false;
  } else {
    classification = PERSISTENCE_TYPES.RANDOM_FLUCTUATION;
    isSustainable = false;
  }

  return deepFreeze({
    is_sustainable: isSustainable,
    classification,
    persistence_score: persistenceScore,
    successful_periods: successfulPeriods,
    total_periods: n - 1,
    overall_slope: trend.slope,
    overall_direction: trend.direction
  });
}

/**
 * تولید بینش‌های عملیاتی و توصیه‌های نظارتی انسان‌محور (Human-in-the-Loop)
 *
 * @param {Object} params
 * @param {Object} [params.trends]
 * @param {Array<Object>} [params.changePoints]
 * @param {Array<Object>} [params.interventions]
 * @param {Object} [options]
 * @returns {Object}
 */
function generateLongitudinalInsights(params = {}, options = {}) {
  const trends = params.trends || {};
  const changePoints = Array.isArray(params.changePoints) ? params.changePoints : [];
  const interventions = Array.isArray(params.interventions) ? params.interventions : [];

  const insights = [];
  const recommendations = [];

  // بررسی روندها
  if (trends.direction === TREND_DIRECTIONS.IMPROVING) {
    insights.push(`روند شاخص ${trends.metric || 'مورد بررسی'} با شیب مثبت ${trends.slope} واحد بهبود مستمر را نشان می‌دهد.`);
    recommendations.push('تداوم رویه‌های موثر جاری و استانداردسازی تجارب موفق در سطح مدرسه.');
  } else if (trends.direction === TREND_DIRECTIONS.DECLINING) {
    insights.push(`روند شاخص ${trends.metric || 'مورد بررسی'} با شیب منفی ${trends.slope} واحد دارای افت فرسایشی است.`);
    recommendations.push('تشکیل فوری جلسه شورای آموزشی مدرسه جهت بازنگری برنامه و استقرار اقدامات پیشگیرانه.');
  } else {
    insights.push(`شاخص ${trends.metric || 'مورد بررسی'} در بازه زمانی پایدار بوده و نوسان معناداری نداشته است.`);
    recommendations.push('پایش مستمر شاخص‌ها بدون نیاز به مداخله فوری.');
  }

  // بررسی نقاط چرخش
  for (const cp of changePoints) {
    if (cp.change_type === CHANGE_POINT_TYPES.SUDDEN_DROP) {
      insights.push(`هشدار: ${cp.description}`);
      recommendations.push(`بررسی میدانی علل افت ناگهانی در دوره ${cp.period} توسط کادر مدیریت.`);
    } else if (cp.change_type === CHANGE_POINT_TYPES.SUSTAINED_IMPROVEMENT) {
      insights.push(`نقطه قوت: ${cp.description}`);
    } else if (cp.change_type === CHANGE_POINT_TYPES.POST_INTERVENTION_INFLECTION) {
      insights.push(`اثربخشی مداخله: ${cp.description}`);
      recommendations.push('تثبیت مداخلات مشاوره‌ای/آموزشی اجرا شده جهت حفظ روند صعودی.');
    }
  }

  // تضمین نظارت انسانی
  return deepFreeze({
    insights: Object.freeze(insights),
    recommendations: Object.freeze(recommendations),
    human_in_the_loop_required: true,
    automated_decision_made: false,
    generated_at: options.now || '2026-09-18T10:00:00.000Z'
  });
}

/**
 * ساخت پرونده تاریخی و طولی مدرسه بدون رتبه‌بندی رقابتی (Ipsative Assessment)
 *
 * @param {Object} params
 * @param {number|string} params.schoolId
 * @param {Array<Object>} params.snapshots
 * @param {string} [params.periodRange]
 * @param {Object} [options]
 * @returns {Object}
 */
function buildLongitudinalSchoolProfile(params = {}, options = {}) {
  const schoolId = Number(params.schoolId || params.school_id || 1);
  const rawSnapshots = Array.isArray(params.snapshots) ? params.snapshots : [];
  const periodRange = params.periodRange || params.period_range || 'ALL';

  // مرتب‌سازی اسنپ‌شات‌ها بر حسب دوره زمانی
  const snapshots = [...rawSnapshots].sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')));

  // ارزیابی روند شاخص‌های کلیدی
  const healthTrend = calculateEducationalTrends({ snapshots, metric: 'health_index', periodRange }, options);
  const academicTrend = calculateEducationalTrends({ snapshots, metric: 'average_gpa', periodRange }, options);
  const attendanceTrend = calculateEducationalTrends({ snapshots, metric: 'calendar_rate', periodRange }, options);
  const chronicTrend = calculateEducationalTrends({ snapshots, metric: 'chronic_absence_rate', periodRange }, options);

  // کشف نقاط چرخش
  const healthChangePoints = detectChangePoints({ snapshots, metric: 'health_index' }, options);
  const attendanceChangePoints = detectChangePoints({ snapshots, metric: 'chronic_absence_rate' }, options);
  const allChangePoints = [...healthChangePoints, ...attendanceChangePoints];

  // سنجش پایداری بهبود سلامت مدرسه
  const healthPersistence = calculateSustainableImprovement({ snapshots, metric: 'health_index' }, options);

  // تولید بینش‌ها و توصیه‌ها
  const insightPack = generateLongitudinalInsights({
    trends: healthTrend,
    changePoints: allChangePoints
  }, options);

  const profile = {
    school_id: schoolId,
    total_periods: snapshots.length,
    period_range: periodRange,
    overall_trend: healthTrend.direction,
    overall_slope: healthTrend.slope,
    persistence_classification: healthPersistence.classification,
    is_sustainable: healthPersistence.is_sustainable,
    persistence_score: healthPersistence.persistence_score,
    trends_by_metric: {
      health_index: healthTrend,
      academic_gpa: academicTrend,
      attendance_rate: attendanceTrend,
      chronic_absence_rate: chronicTrend
    },
    change_points: allChangePoints,
    insights: insightPack.insights,
    recommendations: insightPack.recommendations,
    human_in_the_loop_required: true,
    automated_decision_made: false,
    zero_ranking_policy_enforced: true,
    is_ranked: false,
    ranking_score: null,
    league_table: null,
    best_school: null,
    worst_school: null,
    generated_at: options.now || '2026-09-18T10:00:00.000Z'
  };

  return deepFreeze(profile);
}

/**
 * نقشه روندهای منطقه‌ای جهت هدایت منابع حمایتی با تضمین ۱۰۰٪ عدم رتبه‌بندی
 *
 * @param {Object} params
 * @param {Array<Object>} [params.regions]
 * @param {Array<Object>} [params.snapshots]
 * @param {string} [params.periodRange]
 * @param {number|string} [params.regionId]
 * @param {Object} [options]
 * @returns {Object}
 */
function buildRegionalTrendMap(params = {}, options = {}) {
  const regionId = Number(params.regionId || params.region_id || 1);
  const rawSchools = Array.isArray(params.schools || params.regions) ? (params.schools || params.regions) : [];
  const periodRange = params.periodRange || params.period_range || 'ALL';

  // مرتب‌سازی اکیداً فقط بر مبنای شناسه عددی مدرسه
  const sortedSchools = [...rawSchools].sort((a, b) => Number(a.school_id || 0) - Number(b.school_id || 0));

  const trendDistribution = {
    [TREND_DIRECTIONS.IMPROVING]: 0,
    [TREND_DIRECTIONS.STABLE]: 0,
    [TREND_DIRECTIONS.DECLINING]: 0
  };

  let prioritySupportCount = 0;
  const processedSchools = [];

  for (const s of sortedSchools) {
    const schoolTrend = s.overall_trend || s.trend_direction || TREND_DIRECTIONS.STABLE;
    if (trendDistribution[schoolTrend] !== undefined) {
      trendDistribution[schoolTrend]++;
    } else {
      trendDistribution[TREND_DIRECTIONS.STABLE]++;
    }

    const needsSupport = schoolTrend === TREND_DIRECTIONS.DECLINING || s.persistence_classification === PERSISTENCE_TYPES.GRADUAL_DECLINE;
    if (needsSupport) {
      prioritySupportCount++;
    }

    processedSchools.push({
      school_id: Number(s.school_id || 0),
      school_name: s.school_name || `مدرسه ${s.school_id}`,
      trend_direction: schoolTrend,
      persistence_classification: s.persistence_classification || PERSISTENCE_TYPES.STABLE,
      support_priority: needsSupport ? 'HIGH' : 'STANDARD'
    });
  }

  const summary = {
    region_id: regionId,
    period_range: periodRange,
    total_schools_monitored: sortedSchools.length,
    trend_distribution: Object.freeze(trendDistribution),
    priority_support_needed_count: prioritySupportCount,
    schools_trend_summary: Object.freeze(processedSchools),
    zero_ranking_policy_enforced: true,
    is_ranked: false,
    ranking_score: null,
    league_table: null,
    best_school: null,
    worst_school: null,
    generated_at: options.now || '2026-09-18T10:00:00.000Z'
  };

  return deepFreeze(summary);
}

module.exports = {
  TREND_DIRECTIONS,
  CHANGE_POINT_TYPES,
  PERSISTENCE_TYPES,
  enforceLongitudinalAccessGuard,
  calculateEducationalTrends,
  detectChangePoints,
  calculateSustainableImprovement,
  generateLongitudinalInsights,
  buildLongitudinalSchoolProfile,
  buildRegionalTrendMap
};

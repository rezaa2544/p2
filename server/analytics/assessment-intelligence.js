/* ═══════════════════════════════════════════════════════════════════
   server/analytics/assessment-intelligence.js — Assessment Intelligence Engine (P0-EI-03)
   -------------------------------------------------------------------
   Educational Intelligence Foundation:
   - 1) analyzeAssessmentQuality (Item & Exam-level Psychometrics, Reliability)
   - 2) calculateDiscriminationIndex (Classical CTT D-index with Top/Bottom 27%)
   - 3) detectGradeAnomalies (Tukey's Fences, Outliers, Artificial Clustering)
   - 4) calculateAssessmentFairness (Cross-Class & Demographic Parity)
   - 5) calculateTeacherAssessmentProfile (Grading Consistency without Rankings)
   - 6) generateAssessmentInsights (Evidence-Based Decision Support Recommendations)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const {
  parseValidScore,
  roundTo,
  enforceTenantIsolation
} = require('./semantic');

/**
 * ۱) تحلیل جامع کیفیت و روان‌سنجی آزمون (analyzeAssessmentQuality)
 * محاسبه ضریب دشواری (p-value)، ضریب تمایز (D)، پایایی (Reliability) و سطح کیفی
 */
function analyzeAssessmentQuality(params = {}, options = {}) {
  const {
    exam = params.exam || {},
    questions = params.questions || [],
    responses = params.responses || [],
    grades = params.grades || []
  } = params;

  const expectedSchoolId = options.expectedSchoolId != null
    ? Number(options.expectedSchoolId)
    : (exam && exam.school_id != null ? Number(exam.school_id) : null);

  if (expectedSchoolId != null) {
    if (exam && exam.school_id != null && Number(exam.school_id) !== expectedSchoolId) {
      const err = new Error(`Tenant isolation violation: Record school_id (${exam.school_id}) does not match expected (${expectedSchoolId})`);
      err.code = 'TENANT_ISOLATION_VIOLATION';
      throw err;
    }
    enforceTenantIsolation(grades, expectedSchoolId);
    enforceTenantIsolation(responses, expectedSchoolId);
  }

  const passThreshold = options.passThreshold != null ? Number(options.passThreshold) : 10.0;
  const assessmentId = exam.id || params.assessmentId || params.assessment_id || null;

  // استخراج نمرات معتبر دانش‌آموزان
  const validScores = [];
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    const s = parseValidScore(g ? g.score : null, (g && g.max_score) || (exam && exam.max_score) || 20);
    if (s !== null) validScores.push(s);
  }

  const n = validScores.length;
  if (n === 0 && responses.length === 0) {
    return {
      assessment_id: assessmentId,
      total_examinees: 0,
      difficulty_index: null,
      difficulty_level: 'NO_DATA',
      discrimination_index: null,
      discrimination_quality: 'NO_DATA',
      reliability_score: null,
      quality_level: 'NO_DATA',
      data_quality: { status: 'NO_DATA', completeness: 0 }
    };
  }

  // محاسبه ضریب دشواری (Difficulty Index: p-value)
  let difficultyIndex = null;
  let difficultyLevel = 'BALANCED';

  if (responses.length > 0) {
    // محاسبه مبتنی بر سوالات و پاسخ‌ها: p = مجموع پاسخ‌های صحیح / کل پاسخ‌ها
    let correctCount = 0;
    let totalResp = 0;
    for (const r of responses) {
      totalResp++;
      if (r.is_correct === true || r.score > 0) {
        correctCount += (r.score !== undefined ? Number(r.score) : 1);
      }
    }
    const maxPossible = responses.reduce((acc, r) => acc + (r.max_score ? Number(r.max_score) : 1), 0);
    difficultyIndex = maxPossible > 0 ? roundTo(correctCount / maxPossible, 3) : 0;
  } else if (n > 0) {
    // محاسبه مبتنی بر میانگین نمرات نرمال‌شده کل آزمون
    const sum = validScores.reduce((acc, s) => acc + s, 0);
    const mean = sum / n;
    difficultyIndex = roundTo(mean / 20.0, 3);
  }

  if (difficultyIndex !== null) {
    if (difficultyIndex < 0.45) {
      difficultyLevel = 'HARD';
    } else if (difficultyIndex > 0.75) {
      difficultyLevel = 'EASY';
    } else {
      difficultyLevel = 'BALANCED';
    }
  }

  // محاسبه شاخص تمایز (Discrimination Index)
  const discResult = calculateDiscriminationIndex({
    grades,
    responses,
    maxScore: (exam && exam.max_score) || 20,
    expectedSchoolId
  });

  // محاسبه ضریب پایایی (Reliability Score / Cronbach's Alpha)
  let reliabilityScore = null;
  if (questions.length >= 2 && responses.length >= questions.length * 2) {
    // محاسبه آلفای کرونباخ به ازای سوالات
    const k = questions.length;
    const itemScores = new Map();
    for (const q of questions) itemScores.set(q.id, []);
    for (const r of responses) {
      if (itemScores.has(r.question_id)) {
        itemScores.get(r.question_id).push(Number(r.score || (r.is_correct ? 1 : 0)));
      }
    }

    let sumItemVariance = 0;
    for (const scores of itemScores.values()) {
      if (scores.length > 1) {
        const itemMean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const itemVar = scores.reduce((acc, s) => acc + Math.pow(s - itemMean, 2), 0) / (scores.length - 1);
        sumItemVariance += itemVar;
      }
    }

    const totalMean = validScores.reduce((a, b) => a + b, 0) / (n || 1);
    const totalVariance = n > 1
      ? validScores.reduce((acc, s) => acc + Math.pow(s - totalMean, 2), 0) / (n - 1)
      : 0;

    if (totalVariance > 0 && k > 1) {
      const alpha = (k / (k - 1)) * (1 - (sumItemVariance / totalVariance));
      reliabilityScore = roundTo(Math.max(0, Math.min(1, alpha)), 3);
    }
  }

  // اگر داده سطوح سوال نبود، برآورد پایایی بر مبنای واریانس و خطای استاندارد نمرات
  if (reliabilityScore === null && n >= 5) {
    const sum = validScores.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = validScores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / (n - 1);
    // تقریب Kuder-Richardson KR-20 استاندارد
    const p = mean / 20.0;
    const q = 1 - p;
    const kEst = 20; // فرض تعداد گویه استاندارد ۲۰
    if (variance > 0) {
      const kr20 = (kEst / (kEst - 1)) * (1 - (kEst * p * q) / variance);
      reliabilityScore = roundTo(Math.max(0.40, Math.min(0.95, kr20)), 2);
    } else {
      reliabilityScore = 0.50;
    }
  }

  // تعیین سطح کیفی آزمون (Quality Level)
  let qualityLevel = 'POOR';
  const D = discResult.discrimination_index !== null ? discResult.discrimination_index : 0;
  const rel = reliabilityScore !== null ? reliabilityScore : 0.70;

  if (D >= 0.35 && difficultyLevel === 'BALANCED' && rel >= 0.70) {
    qualityLevel = 'EXCELLENT';
  } else if (D >= 0.25 && rel >= 0.60) {
    qualityLevel = 'GOOD';
  } else if (D >= 0.20 || difficultyLevel === 'BALANCED') {
    qualityLevel = 'ACCEPTABLE';
  }

  const passedCount = validScores.filter(s => s >= passThreshold).length;
  const passRate = n > 0 ? roundTo((passedCount / n) * 100, 2) : 0;

  return {
    assessment_id: assessmentId,
    total_examinees: n,
    difficulty_index: difficultyIndex,
    difficulty_level: difficultyLevel,
    discrimination_index: discResult.discrimination_index,
    discrimination_quality: discResult.discrimination_quality,
    reliability_score: reliabilityScore,
    quality_level: qualityLevel,
    pass_rate: passRate,
    data_quality: {
      status: n >= 10 ? 'HIGH_CONFIDENCE' : (n >= 4 ? 'MODERATE_CONFIDENCE' : 'LOW_SAMPLE'),
      sample_size: n
    }
  };
}

/**
 * ۲) محاسبه شاخص تمایز کلاسیک با دو گروه ۲۷٪ بالا و پایین (calculateDiscriminationIndex)
 * D = Performance(Top 27%) - Performance(Bottom 27%)
 */
function calculateDiscriminationIndex(params = {}) {
  const {
    grades = [],
    maxScore = 20,
    expectedSchoolId = null
  } = params;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId);
  }

  const validScores = [];
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    const s = parseValidScore(g ? g.score : null, (g && g.max_score) || maxScore);
    if (s !== null) validScores.push(s);
  }

  const n = validScores.length;
  if (n < 4) {
    return {
      discrimination_index: null,
      discrimination_quality: 'INSUFFICIENT_SAMPLE',
      sample_size: n,
      top_group_size: 0,
      bottom_group_size: 0
    };
  }

  validScores.sort((a, b) => a - b);
  const groupSize = Math.max(1, Math.floor(n * 0.27));

  const bottomGroup = validScores.slice(0, groupSize);
  const topGroup = validScores.slice(n - groupSize);

  const bottomMean = bottomGroup.reduce((a, b) => a + b, 0) / groupSize;
  const topMean = topGroup.reduce((a, b) => a + b, 0) / groupSize;

  // شاخص تمایز نرمال‌شده به مقیاس ۰ تا ۱
  const rawD = (topMean - bottomMean) / 20.0;
  const D = roundTo(Math.max(-1.0, Math.min(1.0, rawD)), 3);

  let quality = 'POOR';
  if (D >= 0.40) {
    quality = 'EXCELLENT';
  } else if (D >= 0.30) {
    quality = 'GOOD';
  } else if (D >= 0.20) {
    quality = 'ACCEPTABLE';
  } else {
    quality = 'POOR';
  }

  return {
    discrimination_index: D,
    discrimination_quality: quality,
    sample_size: n,
    top_group_size: groupSize,
    bottom_group_size: groupSize,
    top_mean: roundTo(topMean, 2),
    bottom_mean: roundTo(bottomMean, 2)
  };
}

/**
 * ۳) کشف ناهنجاری‌ها و داده‌های پرت نمرات (detectGradeAnomalies)
 * استفاده از حصارهای توکی (Tukey's Fences) + کشف جهش‌های مصنوعی و خوشه‌بندی غیرطبیعی
 */
function detectGradeAnomalies(params = {}) {
  const {
    grades = [],
    maxScore = 20,
    expectedSchoolId = null
  } = params;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId);
  }

  const entries = [];
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    const sc = parseValidScore(g ? g.score : null, (g && g.max_score) || maxScore);
    if (sc !== null) {
      entries.push({
        id: g.id != null ? g.id : i,
        student_id: g.student_id != null ? Number(g.student_id) : null,
        score: sc,
        raw_score: g.score
      });
    }
  }

  const n = entries.length;
  if (n < 4) {
    return {
      anomalies_detected: false,
      outliers_count: 0,
      q1: null,
      q3: null,
      iqr: null,
      lower_fence: null,
      upper_fence: null,
      outliers: [],
      clustering_anomalies: [],
      sample_size: n
    };
  }

  entries.sort((a, b) => a.score - b.score);

  // محاسبه چارک‌ها و دامنه میان‌چارکی (Tukey Fences)
  const q1 = entries[Math.floor(n * 0.25)].score;
  const q3 = entries[Math.floor(n * 0.75)].score;
  const iqr = roundTo(q3 - q1, 2);

  const lowerFence = roundTo(Math.max(0, q1 - 1.5 * iqr), 2);
  const upperFence = roundTo(Math.min(20, q3 + 1.5 * iqr), 2);

  const outliers = [];
  for (const item of entries) {
    if (item.score < lowerFence) {
      outliers.push({
        student_id: item.student_id,
        score: item.score,
        type: 'LOW_OUTLIER',
        fence: lowerFence,
        deviation: roundTo(lowerFence - item.score, 2)
      });
    } else if (item.score > upperFence) {
      outliers.push({
        student_id: item.student_id,
        score: item.score,
        type: 'HIGH_OUTLIER',
        fence: upperFence,
        deviation: roundTo(item.score - upperFence, 2)
      });
    }
  }

  // کشف خوشه‌بندی غیرطبیعی حول مرز قبولی ۱۰ (Unnatural Clustering / Grade Rounding Spike)
  // اگر بیش از ۳۵٪ از دانش‌آموزان دقیقاً بین ۹٫۵ تا ۱۰٫۵ قرار گیرند در حالی که توزیع نامتقارن است
  const clusteringAnomalies = [];
  const nearPassCount = entries.filter(e => e.score >= 9.5 && e.score <= 10.5).length;
  const nearPassRatio = nearPassCount / n;

  if (nearPassCount >= 4 && nearPassRatio >= 0.35) {
    clusteringAnomalies.push({
      type: 'PASS_THRESHOLD_SPIKE',
      range: '9.5-10.5',
      count: nearPassCount,
      percentage: roundTo(nearPassRatio * 100, 1),
      severity: nearPassRatio > 0.50 ? 'HIGH' : 'MEDIUM',
      message: 'تراکم غیرعادی نمرات حول مرز قبولی ۱۰ (احتمال دستکاری یا ارفاق مصنوعی نمرات مرزی)'
    });
  }

  const anomaliesDetected = outliers.length > 0 || clusteringAnomalies.length > 0;

  return {
    anomalies_detected: anomaliesDetected,
    outliers_count: outliers.length,
    q1,
    q3,
    iqr,
    lower_fence: lowerFence,
    upper_fence: upperFence,
    outliers,
    clustering_anomalies: clusteringAnomalies,
    sample_size: n
  };
}

/**
 * ۴) ارزیابی عدالت و برابری سنجش (calculateAssessmentFairness)
 * مقایسه انحراف معیار و شکاف نمرات بین کلاس‌ها و گروه‌های مختلف بدون سوگیری
 */
function calculateAssessmentFairness(params = {}) {
  const {
    grades = [],
    classes = [],
    users = [],
    expectedSchoolId = null
  } = params;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId);
    enforceTenantIsolation(classes, expectedSchoolId);
    enforceTenantIsolation(users, expectedSchoolId);
  }

  if (!Array.isArray(grades) || grades.length === 0) {
    return {
      fairness_score: 100,
      fairness_rating: 'NO_DATA',
      fairness_flags: [],
      class_parity: { class_count: 0, max_mean_gap: 0 },
      demographic_parity: { evaluated: false }
    };
  }

  const fairnessFlags = [];
  let penalty = 0;

  // ۱. ارزیابی برابری بین کلاس‌های موازی (Cross-Class Parity)
  const classGrades = new Map();
  for (const g of grades) {
    if (g.class_id != null) {
      const cid = Number(g.class_id);
      if (!classGrades.has(cid)) classGrades.set(cid, []);
      const sc = parseValidScore(g.score, g.max_score || 20);
      if (sc !== null) classGrades.get(cid).push(sc);
    }
  }

  let maxMeanGap = 0;
  const classAverages = [];

  if (classGrades.size >= 2) {
    for (const [cid, scores] of classGrades.entries()) {
      if (scores.length >= 3) {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        classAverages.push({ class_id: cid, mean: roundTo(mean, 2), count: scores.length });
      }
    }

    if (classAverages.length >= 2) {
      const means = classAverages.map(c => c.mean);
      const minM = Math.min(...means);
      const maxM = Math.max(...means);
      maxMeanGap = roundTo(maxM - minM, 2);

      // اگر اختلاف میانگین دو کلاس موازی بیش از ۳ نمره باشد
      if (maxMeanGap >= 3.0) {
        fairnessFlags.push({
          type: 'CLASS_DISPARITY_ALERT',
          severity: maxMeanGap >= 4.5 ? 'CRITICAL' : 'WARNING',
          gap: maxMeanGap,
          message: `اختلاف میانگین چشمگیر بین کلاس‌های موازی (${maxMeanGap} نمره)`
        });
        penalty += Math.min(30, maxMeanGap * 7);
      }
    }
  }

  // ۲. ارزیابی برابری جنسیتی (Demographic Parity) در صورت وجود داده در users
  const userMap = new Map();
  for (const u of users) {
    if (u && u.id != null) userMap.set(Number(u.id), u);
  }

  const genderScores = { male: [], female: [] };
  for (const g of grades) {
    const u = userMap.get(Number(g.student_id));
    if (u && u.gender) {
      const gen = String(u.gender).toLowerCase();
      const sc = parseValidScore(g.score, g.max_score || 20);
      if (sc !== null) {
        if (gen === 'male' || gen === 'پسر') genderScores.male.push(sc);
        else if (gen === 'female' || gen === 'دختر') genderScores.female.push(sc);
      }
    }
  }

  let genderGap = 0;
  let demographicEvaluated = false;
  if (genderScores.male.length >= 4 && genderScores.female.length >= 4) {
    demographicEvaluated = true;
    const maleMean = genderScores.male.reduce((a, b) => a + b, 0) / genderScores.male.length;
    const femaleMean = genderScores.female.reduce((a, b) => a + b, 0) / genderScores.female.length;
    genderGap = roundTo(Math.abs(maleMean - femaleMean), 2);

    if (genderGap >= 2.5) {
      fairnessFlags.push({
        type: 'DEMOGRAPHIC_DISPARITY_ALERT',
        severity: genderGap >= 4.0 ? 'CRITICAL' : 'WARNING',
        gap: genderGap,
        message: `اختلاف نمرات بین گروه‌های جنسیتی (${genderGap} نمره)`
      });
      penalty += Math.min(25, genderGap * 6);
    }
  }

  const fairnessScore = roundTo(Math.max(0, Math.min(100, 100 - penalty)), 1);

  let fairnessRating = 'FAIR';
  if (fairnessScore >= 85) {
    fairnessRating = 'EXCELLENT';
  } else if (fairnessScore >= 70) {
    fairnessRating = 'FAIR';
  } else {
    fairnessRating = 'NEEDS_REVIEW';
  }

  return {
    fairness_score: fairnessScore,
    fairness_rating: fairnessRating,
    fairness_flags: fairnessFlags,
    class_parity: {
      class_count: classAverages.length,
      max_mean_gap: maxMeanGap,
      class_averages: classAverages
    },
    demographic_parity: {
      evaluated: demographicEvaluated,
      gender_gap: genderGap
    }
  };
}

/**
 * ۵) تحلیل نیمرخ سنجش معلم (calculateTeacherAssessmentProfile)
 * ارزیابی پایداری، پراکندگی نمرات و الگوی سختی بدون رتبه‌بندی یا مجازات فردی
 */
function calculateTeacherAssessmentProfile(params = {}) {
  const {
    teacherId = params.teacherId || params.teacher_id,
    grades = [],
    exams = [],
    expectedSchoolId = null
  } = params;

  if (!teacherId) {
    throw new Error('INVALID_INPUT: teacherId is required for calculateTeacherAssessmentProfile');
  }

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId);
    enforceTenantIsolation(exams, expectedSchoolId);
  }

  // فیلتر نمرات مربوط به این معلم
  const tGrades = grades.filter(g => Number(g.teacher_id) === Number(teacherId));
  const validScores = [];
  for (const g of tGrades) {
    const sc = parseValidScore(g.score, g.max_score || 20);
    if (sc !== null) validScores.push(sc);
  }

  const n = validScores.length;
  if (n === 0) {
    return {
      teacher_id: Number(teacherId),
      total_assessments: 0,
      total_students_graded: 0,
      avg_exam_difficulty: null,
      grade_mean: null,
      grade_std_dev: null,
      pass_rate: null,
      consistency_score: 50,
      profile_status: 'INSUFFICIENT_DATA',
      note: 'این نیمرخ ابزار تصمیم‌یار و رشد حرفه‌ای است و معیار رتبه‌بندی فردی نمی‌باشد.'
    };
  }

  const sum = validScores.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = n > 1
    ? validScores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / (n - 1)
    : 0;
  const stdDev = roundTo(Math.sqrt(variance), 2);

  const passedCount = validScores.filter(s => s >= 10.0).length;
  const passRate = roundTo((passedCount / n) * 100, 1);
  const difficultyPValue = roundTo(mean / 20.0, 3);

  // نمره ثبات و اعتدال در سنجش (Consistency Score):
  // انحراف معیار نرمال آموزشی معمولاً بین ۲ تا ۴ است؛ انحراف معیار بسیار پایین (< ۱) نشان‌دهنده نمره‌دهی صوری و بسیار بالا (> ۶) نشان‌دهنده عدم تعادل است
  let consistencyScore = 100;
  if (stdDev < 1.0) {
    consistencyScore -= 30; // نمرات بیش از حد یکنواخت و صوری
  } else if (stdDev > 5.5) {
    consistencyScore -= 25; // پراکندگی شدید و بی‌ثباتی آزمون
  }
  if (passRate === 100 && mean > 19) {
    consistencyScore -= 20; // تورم غیرعادی نمرات
  } else if (passRate < 40) {
    consistencyScore -= 20; // سختی افراطی
  }

  return {
    teacher_id: Number(teacherId),
    total_assessments: exams.length,
    total_students_graded: n,
    avg_exam_difficulty: difficultyPValue,
    grade_mean: roundTo(mean, 2),
    grade_std_dev: stdDev,
    pass_rate: passRate,
    consistency_score: Math.max(0, consistencyScore),
    profile_status: consistencyScore >= 75 ? 'BALANCED' : 'NEEDS_ALIGNMENT',
    note: 'این نیمرخ ابزار تصمیم‌یار و رشد حرفه‌ای است و معیار رتبه‌بندی فردی نمی‌باشد.'
  };
}

/**
 * ۶) تولید بینش‌های ساخت‌یافته و پیشنهادات تصمیم‌یار (generateAssessmentInsights)
 */
function generateAssessmentInsights(context = {}) {
  const {
    assessmentQuality = {},
    anomalies = {},
    fairness = {},
    teacherProfile = null
  } = context;

  const insights = [];

  // الف) هشدار سطح سختی آزمون
  if (assessmentQuality.difficulty_level === 'HARD') {
    insights.push({
      type: 'ASSESSMENT_DIFFICULTY_WARNING',
      severity: 'HIGH',
      evidence: [
        `ضریب دشواری آزمون برابر ${assessmentQuality.difficulty_index} است (< 0.45)`,
        `نرخ قبولی: ${assessmentQuality.pass_rate}٪`
      ],
      recommended_action: 'برگزاری جلسه بازنگری سوالات با سرگروه درسی و هماهنگی آزمون جبرانی'
    });
  } else if (assessmentQuality.difficulty_level === 'EASY') {
    insights.push({
      type: 'ASSESSMENT_CEILING_EFFECT',
      severity: 'LOW',
      evidence: [
        `ضریب دشواری آزمون برابر ${assessmentQuality.difficulty_index} است (> 0.75)`,
        'آزمون قادر به تفکیک دانش‌آموزان ممتاز از متوسط نیست'
      ],
      recommended_action: 'طراحی سوالات مهارتی و مفهومی با ضریب تمایز بالاتر در نوبت‌های بعد'
    });
  }

  // ب) هشدار ضعف تمایز آزمون
  if (assessmentQuality.discrimination_quality === 'POOR') {
    insights.push({
      type: 'DISCRIMINATION_DEFICIT',
      severity: 'MEDIUM',
      evidence: [
        `ضریب تمایز آزمون ${assessmentQuality.discrimination_index} می‌باشد (< 0.20)`,
        'سوالات آزمون قدرت سنجش تفاوت سطوح یادگیری را ندارند'
      ],
      recommended_action: 'بازبینی گزینه‌های انحرافی و اصلاح گویه‌های مبهم آزمون'
    });
  }

  // ج) هشدارهای نمرات پرت و خوشه‌بندی غیرطبیعی
  if (anomalies.clustering_anomalies && anomalies.clustering_anomalies.length > 0) {
    for (const anom of anomalies.clustering_anomalies) {
      insights.push({
        type: anom.type,
        severity: anom.severity,
        evidence: [
          anom.message,
          `${anom.percentage}٪ از دانش‌آموزان در محدوده ${anom.range} قرار گرفته‌اند`
        ],
        recommended_action: 'بررسی اوراق امتحانی و راستی‌آزمایی کلید تصحیح جهت جلوگیری از تورم نمرات'
      });
    }
  }

  // د) هشدار شکاف عدالت و تفاوت فاحش بین کلاس‌ها
  if (fairness.fairness_flags && fairness.fairness_flags.length > 0) {
    for (const flag of fairness.fairness_flags) {
      insights.push({
        type: flag.type,
        severity: flag.severity,
        evidence: [
          flag.message,
          `شاخص برابری سنجش: ${fairness.fairness_score} از ۱۰۰`
        ],
        recommended_action: 'استانداردسازی شیوه‌نامه تصحیح و هم‌افزایی معلمان کلاس‌های موازی'
      });
    }
  }

  // ه) بازخورد حرفه‌ای معلم (در صورت وجود)
  if (teacherProfile && teacherProfile.profile_status === 'NEEDS_ALIGNMENT') {
    insights.push({
      type: 'TEACHER_ASSESSMENT_ALIGNMENT_NOTE',
      severity: 'MEDIUM',
      evidence: [
        `نمره ثبات سنجش دبیر: ${teacherProfile.consistency_score}`,
        `انحراف معیار نمرات: ${teacherProfile.grade_std_dev}`
      ],
      recommended_action: 'ارائه کارگاه طراحی آزمون استاندارد و تدوین ماتریس ارزیابی (Rubric)'
    });
  }

  return insights;
}

module.exports = {
  analyzeAssessmentQuality,
  calculateDiscriminationIndex,
  detectGradeAnomalies,
  calculateAssessmentFairness,
  calculateTeacherAssessmentProfile,
  generateAssessmentInsights
};

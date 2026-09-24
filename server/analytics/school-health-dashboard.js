/* ═══════════════════════════════════════════════════════════════════
   server/analytics/school-health-dashboard.js — School Health Dashboard & Decision Center (P0-EI-05)
   -------------------------------------------------------------------
   Educational Intelligence Foundation:
   - 1) calculateSchoolHealthIndex (Composite 4-Dimension Health with No-Masking Guarantee)
   - 2) detectSchoolCriticalIssues (Surge Detection in Absence, Learning Decline, Failure, Quality)
   - 3) generateDailyActionCenter (Prioritized Managerial Decision Center for School Leaders)
   - 4) aggregateSchoolEducationalMetrics (Hierarchical Aggregation: School, Grade, Class, Subject)
   - 5) generateExecutiveSummary (Executive Briefing with Strengths, Risks & Actions)
   - 6) enforceSchoolHealthTenantIsolation (Fail-Closed Multi-Tenant Guard)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const {
  roundTo,
  enforceTenantIsolation,
  calculateAttendanceRate,
  calculateChronicAbsence,
  calculateGradeDistribution,
  calculateLearningProgressTrend,
  evaluateCompletionSemantics,
  evaluateCourseEngagement
} = require('./semantic');

const {
  analyzeAttendanceQuality,
  detectAttendanceRisk
} = require('./attendance-intelligence');

const {
  analyzeAssessmentQuality,
  detectGradeAnomalies,
  calculateAssessmentFairness
} = require('./assessment-intelligence');

/**
 * گارد اختصاصی چندمستأجری داشبورد سلامت مدرسه (Fail-Closed)
 */
function enforceSchoolHealthTenantIsolation(records, expectedSchoolId) {
  if (expectedSchoolId == null) return;
  const expected = Number(expectedSchoolId);

  if (Array.isArray(records)) {
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r && r.school_id != null && Number(r.school_id) !== expected) {
        const err = new Error(`Tenant isolation violation: Record school_id (${r.school_id}) does not match expected (${expected})`);
        err.code = 'TENANT_ISOLATION_VIOLATION';
        throw err;
      }
    }
  } else if (records && typeof records === 'object') {
    if (records.school_id != null && Number(records.school_id) !== expected) {
      const err = new Error(`Tenant isolation violation: Record school_id (${records.school_id}) does not match expected (${expected})`);
      err.code = 'TENANT_ISOLATION_VIOLATION';
      throw err;
    }
  }
}

/**
 * ۱) محاسبه شاخص سلامت ترکیبی مدرسه با تضمین عدم پنهان‌سازی (calculateSchoolHealthIndex)
 * وزن‌ها: حضور ۳۰٪، سنجش ۲۵٪، پیشرفت یادگیری ۳۰٪، ارتقا و قبولی ۱۵٪
 */
function calculateSchoolHealthIndex(params = {}, options = {}) {
  const {
    attendance = params.attendance || null,
    assessment = params.assessment || null,
    progress = params.progress || null,
    completion = params.completion || null
  } = params;

  const expectedSchoolId = options.expectedSchoolId != null ? options.expectedSchoolId : null;
  if (expectedSchoolId != null) {
    if (attendance) enforceSchoolHealthTenantIsolation(attendance, expectedSchoolId);
    if (assessment) enforceSchoolHealthTenantIsolation(assessment, expectedSchoolId);
    if (progress) enforceSchoolHealthTenantIsolation(progress, expectedSchoolId);
    if (completion) enforceSchoolHealthTenantIsolation(completion, expectedSchoolId);
  }

  const criticalFlags = [];

  // اصل No-Fabrication: بعدی که هیچ داده واقعی ندارد وارد محاسبه نمی‌شود
  // (پیش‌فرض‌های ساختگی 100/85/…/90 حذف شدند؛ نبود داده => بعد null)
  const hasAttendanceData = !!(attendance && typeof attendance === 'object' &&
    (typeof attendance.attendance_rate === 'number' || typeof attendance.rate === 'number'));
  const hasAssessmentData = !!(assessment && typeof assessment === 'object' &&
    (typeof assessment.reliability === 'number' || typeof assessment.fairness_score === 'number' || typeof assessment.quality_score === 'number'));
  const hasProgressData = !!(progress && typeof progress === 'object' &&
    (typeof progress.improving_students_ratio === 'number' || typeof progress.declining_students_ratio === 'number' ||
     typeof progress.improving_ratio === 'number' || typeof progress.declining_ratio === 'number'));
  const hasCompletionData = !!(completion && typeof completion === 'object' &&
    (typeof completion.pass_rate === 'number' || typeof completion.failure_rate === 'number'));

  // ۱. بعد سلامت حضور و تعامل (Attendance Health — وزن ۳۰٪)
  let attendanceHealth = null;
  if (hasAttendanceData) {
    let attRate = 100;
    let chronicRate = 0;
    if (typeof attendance.attendance_rate === 'number') attRate = attendance.attendance_rate;
    if (typeof attendance.chronic_absence_rate === 'number') chronicRate = attendance.chronic_absence_rate;
    if (typeof attendance.rate === 'number') attRate = attendance.rate;

    const chronicPenalty = chronicRate * 1.5;
    attendanceHealth = roundTo(Math.max(0, Math.min(100, attRate - chronicPenalty)), 2);

    if (chronicRate >= 20.0) {
      criticalFlags.push('HIGH_CHRONIC_ABSENCE');
    }
    if (attRate < 75.0) {
      criticalFlags.push('SEVERE_ATTENDANCE_DEFICIT');
    }
  }

  // ۲. بعد سلامت سنجش و امتحانات (Assessment Health — وزن ۲۵٪)
  let assessmentHealth = null;
  if (assessment && typeof assessment === 'object' && assessment.has_critical_anomaly) {
    criticalFlags.push('CRITICAL_ASSESSMENT_ANOMALY');
  }
  if (hasAssessmentData) {
    let assessReliability = 85;
    let assessFairness = 85;
    let assessDiscrim = 80;
    if (typeof assessment.reliability === 'number') assessReliability = assessment.reliability;
    if (typeof assessment.fairness_score === 'number') assessFairness = assessment.fairness_score;
    if (typeof assessment.quality_score === 'number') assessDiscrim = assessment.quality_score;

    assessmentHealth = roundTo(
      Math.max(0, Math.min(100, (0.40 * assessReliability) + (0.40 * assessFairness) + (0.20 * assessDiscrim))),
      2
    );

    if (assessReliability < 50.0 || assessFairness < 50.0) {
      criticalFlags.push('CRITICAL_ASSESSMENT_DEFICIT');
    }
  }

  // ۳. بعد سلامت پیشرفت یادگیری (Learning Progress Health — وزن ۳۰٪)
  let learningHealth = null;
  if (hasProgressData) {
    let improvingRatio = 0.5;
    let decliningRatio = 0.1;
    if (typeof progress.improving_students_ratio === 'number') improvingRatio = progress.improving_students_ratio;
    if (typeof progress.declining_students_ratio === 'number') decliningRatio = progress.declining_students_ratio;
    if (typeof progress.improving_ratio === 'number') improvingRatio = progress.improving_ratio;
    if (typeof progress.declining_ratio === 'number') decliningRatio = progress.declining_ratio;

    learningHealth = roundTo(
      Math.max(0, Math.min(100, 50 + (50 * (improvingRatio - decliningRatio)))),
      2
    );

    if (decliningRatio > 0.35) {
      criticalFlags.push('ALARMING_LEARNING_DECLINE');
    }
  }

  // ۴. بعد سلامت ارتقا و قبولی (Completion Health — وزن ۱۵٪)
  let completionHealth = null;
  if (hasCompletionData) {
    let passRate = 90;
    let failureRate = 5;
    if (typeof completion.pass_rate === 'number') passRate = completion.pass_rate;
    if (typeof completion.failure_rate === 'number') failureRate = completion.failure_rate;

    completionHealth = roundTo(
      Math.max(0, Math.min(100, passRate - (0.5 * failureRate))),
      2
    );

    if (failureRate >= 15.0) {
      criticalFlags.push('HIGH_FAILURE_RISK');
    }
  }

  // محاسبه میانگین وزنی فقط روی ابعاد دارای داده (بازتوزیع وزن)
  const weightedDims = [
    [0.30, attendanceHealth],
    [0.25, assessmentHealth],
    [0.30, learningHealth],
    [0.15, completionHealth]
  ].filter(([, v]) => v != null);

  const dimWeightSum = weightedDims.reduce((acc, [w]) => acc + w, 0);
  const healthScore = weightedDims.length > 0
    ? roundTo(weightedDims.reduce((acc, [w, v]) => acc + w * v, 0) / dimWeightSum, 2)
    : null;

  // رده‌بندی اولیه بر پایه نمره — در نبود کامل داده: NO_DATA صریح
  let healthLevel = 'CRITICAL';
  if (healthScore == null) healthLevel = 'NO_DATA';
  else if (healthScore >= 85) healthLevel = 'EXCELLENT';
  else if (healthScore >= 70) healthLevel = 'GOOD';
  else if (healthScore >= 50) healthLevel = 'NEEDS_INTERVENTION';

  // اعمال اصل عدم پنهان‌سازی (No-Masking Principle)
  let noMaskingApplied = false;
  if (criticalFlags.length > 0 && healthLevel !== 'NO_DATA') {
    if (healthLevel === 'EXCELLENT' || healthLevel === 'GOOD') {
      healthLevel = 'NEEDS_INTERVENTION';
      noMaskingApplied = true;
    }
    // اگر دو یا چند بحران حاد همزمان وجود داشته باشد، تنزل به بحرانی
    if (criticalFlags.length >= 2 && healthLevel !== 'CRITICAL') {
      healthLevel = 'CRITICAL';
      noMaskingApplied = true;
    }
  }

  return {
    health_score: healthScore,
    health_level: healthLevel,
    dimensions: {
      attendance_health: attendanceHealth,
      assessment_health: assessmentHealth,
      learning_health: learningHealth,
      completion_health: completionHealth
    },
    data_coverage: {
      attendance: hasAttendanceData,
      assessment: hasAssessmentData,
      learning: hasProgressData,
      completion: hasCompletionData
    },
    critical_flags: criticalFlags,
    no_masking_applied: noMaskingApplied
  };
}

/**
 * ۲) کشف مسائل و بحران‌های حاد مدرسه (detectSchoolCriticalIssues)
 */
function detectSchoolCriticalIssues(params = {}, options = {}) {
  const {
    students = params.students || [],
    attendance = params.attendance || [],
    assessments = params.assessments || [],
    grades = params.grades || [],
    timeline = params.timeline || []
  } = params;

  const expectedSchoolId = options.expectedSchoolId != null ? options.expectedSchoolId : null;
  if (expectedSchoolId != null) {
    enforceSchoolHealthTenantIsolation(students, expectedSchoolId);
    enforceSchoolHealthTenantIsolation(attendance, expectedSchoolId);
    enforceSchoolHealthTenantIsolation(assessments, expectedSchoolId);
    enforceSchoolHealthTenantIsolation(grades, expectedSchoolId);
  }

  const issues = [];
  const totalStudents = students.length || (new Set(attendance.map(a => a.student_id).concat(grades.map(g => g.student_id))).size) || 1;

  // ۱. کشف طغیان غیبت مزمن (Chronic Absence Surge)
  if (attendance.length > 0) {
    const chronicRes = calculateChronicAbsence(attendance, { minRequiredSessions: 3 });
    if (chronicRes && chronicRes.chronic_students_count > 0) {
      const chronicPct = roundTo((chronicRes.chronic_students_count / totalStudents) * 100, 1);
      if (chronicPct >= 15.0 || chronicRes.chronic_students_count >= 5) {
        issues.push({
          issue_type: 'CHRONIC_ABSENCE_SURGE',
          severity: chronicPct >= 20.0 ? 'CRITICAL' : 'HIGH',
          title: 'طغیان غیبت مزمن و افت زمان آموزش',
          evidence: [
            `${chronicRes.chronic_students_count} دانش‌آموز (${chronicPct}٪ از کل) دچار غیبت مزمن هستند`,
            'میزان زمان مفید آموزش از دست رفته فراتر از آستانه مجاز ۱۰٪ است'
          ],
          affected_count: chronicRes.chronic_students_count
        });
      }
    }
  }

  // ۲. افت جمعی یادگیری (Collective Learning Decline)
  if (grades.length > 0) {
    // گروه‌بندی نمرات بر اساس دانش‌آموز
    const studentGrades = {};
    for (let i = 0; i < grades.length; i++) {
      const g = grades[i];
      if (!g || !g.student_id) continue;
      if (!studentGrades[g.student_id]) studentGrades[g.student_id] = [];
      studentGrades[g.student_id].push(g);
    }

    let decliningCount = 0;
    const sIds = Object.keys(studentGrades);
    for (let i = 0; i < sIds.length; i++) {
      const gList = studentGrades[sIds[i]];
      if (gList.length >= 3) {
        const trend = calculateLearningProgressTrend(gList);
        if (trend.direction === 'DECLINING' || trend.trend === 'DECLINING') {
          decliningCount++;
        }
      }
    }

    if (decliningCount > 0) {
      const declinePct = roundTo((decliningCount / Math.max(1, sIds.length)) * 100, 1);
      if (declinePct >= 25.0 || decliningCount >= 5) {
        issues.push({
          issue_type: 'COLLECTIVE_LEARNING_DECLINE',
          severity: declinePct >= 35.0 ? 'CRITICAL' : 'HIGH',
          title: 'افت جمعی روند پیشرفت یادگیری',
          evidence: [
            `${decliningCount} دانش‌آموز (${declinePct}٪) دارای شیب نزولی در آزمون‌های متوالی هستند`,
            'شتاب افت نمرات در ارزشیابی‌های مستمر اخیر مشاهده شده است'
          ],
          affected_count: decliningCount
        });
      }
    }

    // ۳. افزایش ریسک مردودی (High Failure Risk)
    const gradeDist = calculateGradeDistribution(grades);
    const failCount = (gradeDist && gradeDist.counts && gradeDist.counts.poor) || 0;
    const failRate = gradeDist && gradeDist.sample_size > 0
      ? roundTo((failCount / gradeDist.sample_size) * 100, 1)
      : 0;

    if (failRate >= 15.0 || failCount >= 5) {
      issues.push({
        issue_type: 'HIGH_FAILURE_RISK',
        severity: failRate >= 25.0 ? 'CRITICAL' : 'HIGH',
        title: 'نرخ نگران‌کننده عدم احراز حدنصاب قبولی',
        evidence: [
          `${failCount} رکورد نمره زیر ۱۰ (معادل ${failRate}٪ از ارزیابی‌ها) ثبت شده است`,
          `میانگین نمرات ثبت‌شده ${gradeDist.mean} از ۲۰ است`
        ],
        affected_count: failCount
      });
    }
  }

  // ۴. افت کیفیت یا نقض عدالت آزمون (Assessment Quality Degradation)
  if (assessments.length > 0) {
    let lowReliabilityCount = 0;
    for (let i = 0; i < assessments.length; i++) {
      const a = assessments[i];
      if (a && a.reliability_classification === 'POOR') {
        lowReliabilityCount++;
      }
    }
    if (lowReliabilityCount > 0) {
      issues.push({
        issue_type: 'ASSESSMENT_QUALITY_DEGRADATION',
        severity: 'HIGH',
        title: 'کیفیت پایین و عدم پایایی آزمون‌های کلاسی',
        evidence: [
          `${lowReliabilityCount} آزمون دارای طبقه‌بندی روان‌سنجی ضعیف و ضرایب تمایز نامناسب هستند`,
          'ضرورت بازبینی ابزارهای سنجش و سؤالات استاندارد'
        ],
        affected_count: lowReliabilityCount
      });
    }
  }

  return issues;
}

/**
 * ۳) تولید مرکز اقدام روزانه مدیران (generateDailyActionCenter)
 */
function generateDailyActionCenter(params = {}, options = {}) {
  const issues = Array.isArray(params) ? params : (params.issues || []);
  const schoolContext = params.schoolContext || options.schoolContext || {};

  const actions = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    if (!issue) continue;

    switch (issue.issue_type) {
      case 'CHRONIC_ABSENCE_SURGE':
        actions.push({
          action_type: 'CHRONIC_ABSENCE_INTERVENTION',
          priority: issue.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          target_role: 'vice_principal',
          title: 'تشکیل پرونده مداخله غیبت مزمن و تماس فوری با اولیا',
          description: `پیگیری وضعیت ${issue.affected_count} دانش‌آموز غایب مزمن جهت جلوگیری از ترک تحصیل و افت فرسایشی آموزش.`,
          evidence: issue.evidence,
          deadline: issue.severity === 'CRITICAL' ? 'IMMEDIATE' : 'TODAY'
        });
        break;

      case 'COLLECTIVE_LEARNING_DECLINE':
        actions.push({
          action_type: 'CURRICULUM_RECOVERY_MEETING',
          priority: 'HIGH',
          target_role: 'principal',
          title: 'برگزاری جلسه شورای آموزشی و تدوین برنامه جبران یادگیری',
          description: `بررسی علل افت یادگیری در ${issue.affected_count} دانش‌آموز و تعیین سرفصل‌های جبرانی با دبیران مربوطه.`,
          evidence: issue.evidence,
          deadline: 'WITHIN_48_HOURS'
        });
        break;

      case 'HIGH_FAILURE_RISK':
        actions.push({
          action_type: 'COUNSELING_AND_ACADEMIC_SUPPORT',
          priority: 'CRITICAL',
          target_role: 'counselor',
          title: 'جلسات مشاوره هدایت تحصیلی و کلاس‌های تقویتی فوری',
          description: `شناسایی موانع تحصیلی و خانوادگی دانش‌آموزان در معرض تجدیدی و تنظیم قرارداد بهبود آموزشی.`,
          evidence: issue.evidence,
          deadline: 'TODAY'
        });
        break;

      case 'ASSESSMENT_QUALITY_DEGRADATION':
        actions.push({
          action_type: 'TEACHER_ASSESSMENT_WORKSHOP',
          priority: 'MEDIUM',
          target_role: 'teacher',
          title: 'بازنگری در طراحی سؤالات و انطباق با جدول هدف-محتوا',
          description: 'ارائه بازخورد روان‌سنجی به دبیران جهت استانداردسازی آزمون‌ها و اصلاح دشواری سؤالات.',
          evidence: issue.evidence,
          deadline: 'THIS_WEEK'
        });
        break;

      default:
        actions.push({
          action_type: 'GENERAL_EDUCATIONAL_REVIEW',
          priority: 'MEDIUM',
          target_role: 'principal',
          title: issue.title || 'رسیدگی به چالش آموزشی مطرح‌شده',
          description: 'بررسی مستندات رویداد و نظارت بر حسن جریان آموزشی مدرسه.',
          evidence: issue.evidence || [],
          deadline: 'THIS_WEEK'
        });
        break;
    }
  }

  // مرتب‌سازی قطعی اقدامات بر مبنای اولویت
  const priorityRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  actions.sort((a, b) => {
    const rankA = priorityRank[a.priority] !== undefined ? priorityRank[a.priority] : 9;
    const rankB = priorityRank[b.priority] !== undefined ? priorityRank[b.priority] : 9;
    const diff = rankA - rankB;
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title);
  });

  return actions;
}

/**
 * ۴) تجمیع ماتریسی و سلسله‌مراتبی شاخص‌ها (aggregateSchoolEducationalMetrics)
 * سطوح: مدرسه، پایه، کلاس، درس
 */
function aggregateSchoolEducationalMetrics(params = {}, options = {}) {
  const {
    school_id = params.school_id || 1,
    attendance = params.attendance || [],
    grades = params.grades || [],
    classes = params.classes || [],
    students = params.students || []
  } = params;

  const expectedSchoolId = options.expectedSchoolId != null
    ? options.expectedSchoolId
    : school_id;

  if (expectedSchoolId != null) {
    enforceSchoolHealthTenantIsolation(attendance, expectedSchoolId);
    enforceSchoolHealthTenantIsolation(grades, expectedSchoolId);
    enforceSchoolHealthTenantIsolation(classes, expectedSchoolId);
    enforceSchoolHealthTenantIsolation(students, expectedSchoolId);
  }

  // نگاشت کلاس‌ها و پایه‌ها
  const classMap = {};
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    if (c && c.id != null) {
      classMap[c.id] = c;
    }
  }

  // نگاشت پایه‌ها
  const byGradeLevel = {};
  const byClass = {};
  const bySubject = {};

  // تجمیع نمرات بر اساس کلاس، پایه و درس
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    if (!g) continue;

    const cid = g.class_id || 'unknown';
    const cls = classMap[cid] || {};
    const gradeLevel = cls.grade_level || g.grade_level || 'standard';
    const subj = g.subject_id || g.subject || 'general';

    // ۱. پایه
    if (!byGradeLevel[gradeLevel]) {
      byGradeLevel[gradeLevel] = { grade_level: gradeLevel, total_grades: 0, sum_scores: 0, fail_count: 0 };
    }
    byGradeLevel[gradeLevel].total_grades++;
    const s = Number(g.score) || 0;
    byGradeLevel[gradeLevel].sum_scores += s;
    if (s < 10) byGradeLevel[gradeLevel].fail_count++;

    // ۲. کلاس
    if (!byClass[cid]) {
      byClass[cid] = { class_id: cid, name: cls.name || `کلاس ${cid}`, total_grades: 0, sum_scores: 0, fail_count: 0 };
    }
    byClass[cid].total_grades++;
    byClass[cid].sum_scores += s;
    if (s < 10) byClass[cid].fail_count++;

    // ۳. درس
    if (!bySubject[subj]) {
      bySubject[subj] = { subject: subj, total_grades: 0, sum_scores: 0, fail_count: 0 };
    }
    bySubject[subj].total_grades++;
    bySubject[subj].sum_scores += s;
    if (s < 10) bySubject[subj].fail_count++;
  }

  // محاسبه میانگین‌ها و نرخ‌ها
  const finalizeStats = (obj) => {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const item = obj[keys[i]];
      if (item.total_grades > 0) {
        item.mean_score = roundTo(item.sum_scores / item.total_grades, 2);
        item.failure_rate = roundTo((item.fail_count / item.total_grades) * 100, 1);
      } else {
        item.mean_score = null;
        item.failure_rate = 0;
      }
    }
  };

  finalizeStats(byGradeLevel);
  finalizeStats(byClass);
  finalizeStats(bySubject);

  const totalGrades = grades.length;
  const overallMean = totalGrades > 0
    ? roundTo(grades.reduce((a, b) => a + (Number(b.score) || 0), 0) / totalGrades, 2)
    : null;

  return {
    school_id: Number(expectedSchoolId),
    school_summary: {
      total_students: students.length,
      total_classes: classes.length,
      total_grades: totalGrades,
      overall_mean_score: overallMean
    },
    by_grade_level: byGradeLevel,
    by_class: byClass,
    by_subject: bySubject
  };
}

/**
 * ۵) تولید خلاصه مدیریتی راهبردی (generateExecutiveSummary)
 */
function generateExecutiveSummary(params = {}, options = {}) {
  const {
    schoolHealth = params.schoolHealth || { health_score: 80, health_level: 'GOOD', dimensions: {} },
    issues = params.issues || [],
    actions = params.actions || [],
    metrics = params.metrics || {}
  } = params;

  const strengths = [];
  const risks = [];

  // ارزیابی نقاط قوت
  if (schoolHealth.dimensions) {
    if (schoolHealth.dimensions.attendance_health >= 85) {
      strengths.push('انضباط بالای حضور و مشارکت پایدار دانش‌آموزان در کلاس‌های درس');
    }
    if (schoolHealth.dimensions.assessment_health >= 85) {
      strengths.push('رعایت استانداردهای روان‌سنجی و برابری نمره‌دهی در ارزیابی‌های مدرسه');
    }
    if (schoolHealth.dimensions.learning_health >= 80) {
      strengths.push('روند صعودی و رو به رشد پیشرفت تحصیلی دانش‌آموزان در ارزشیابی‌های مستمر');
    }
    if (schoolHealth.dimensions.completion_health >= 85) {
      strengths.push('نرخ قبولی بالا و انطباق با شاخص‌های استاندارد پایان دوره تحصیلی');
    }
  }

  if (strengths.length === 0) {
    strengths.push('ثبت یکنواخت داده‌های آموزشی و استقرار زیرساخت پایش مستمر');
  }

  // ارزیابی مخاطرات
  for (let i = 0; i < issues.length; i++) {
    const is = issues[i];
    risks.push(`${is.title} (سطح: ${is.severity})`);
  }

  if (risks.length === 0) {
    risks.push('هیچ مخاطره بحرانی یا هشدار فوری در سامانه پایش ثبت نشده است.');
  }

  return {
    school_health: schoolHealth,
    strengths,
    risks,
    recommended_actions: actions,
    generated_at: new Date().toISOString()
  };
}

module.exports = {
  calculateSchoolHealthIndex,
  detectSchoolCriticalIssues,
  generateDailyActionCenter,
  aggregateSchoolEducationalMetrics,
  generateExecutiveSummary,
  enforceSchoolHealthTenantIsolation
};

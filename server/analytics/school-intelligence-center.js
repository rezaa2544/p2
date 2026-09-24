/**
 * ماژول مرکز فرماندهی و هوشمندی مدرسه (P0-EI-09)
 * School Intelligence Command Center Engine
 * 
 * ویژگی‌های کلیدی:
 *  - ۱) گارد امنیتی دسترسی به مرکز هوشمندی و ضد نفوذ (enforceSchoolIntelligenceAccessGuard)
 *  - ۲) ساخت شناسنامه جامع هوشمندی مدرسه با تجمیع لایه‌های تحلیلی (buildSchoolIntelligenceSnapshot)
 *  - ۳) محاسبه شاخص سلامت مدرسه با اعمال اصل عدم پنهان‌سازی (calculateSchoolHealthIndex)
 *  - ۴) تولید مرکز اقدامات روزانه و اولویت‌دار مدیر (generatePrincipalActionCenter)
 *  - ۵) تجمیع داده‌های منطقه‌ای بدون رتبه‌بندی خطی مدارس (generateDistrictAggregation)
 * 
 * اصول حاکم:
 *  - شکست ایمن (Fail-Closed) در برابر خطای مستأجری یا غیبت پارامترها
 *  - قطعیت ۱۰۰٪ و خروجی بیت‌به‌بیت یکسان در محاسبات متوالی
 *  - مصونیت در برابر جهش داده‌ها با اشیای منجمد (Object.freeze)
 *  - ممنوعیت مطلق رتبه‌بندی رقابتی مدارس (Zero League Table Guarantee)
 */

'use strict';

/**
 * گارد امنیتی دسترسی به مرکز هوشمندی مدرسه (Anti-IDOR & Access Guard)
 *
 * @param {Object} requester - کاربر درخواست‌دهنده (id, role, school_id)
 * @param {number|string} targetSchoolId - شناسه مدرسه هدف
 * @param {Object} [options]
 * @returns {boolean}
 */
function enforceSchoolIntelligenceAccessGuard(requester, targetSchoolId, options = {}) {
  if (!requester || typeof requester !== 'object') {
    throw new Error('SCHOOL_INTELLIGENCE_ACCESS_FORBIDDEN: requester session is missing');
  }

  const schoolId = Number(targetSchoolId);
  if (!schoolId || isNaN(schoolId)) {
    throw new Error('INVALID_INPUT: valid targetSchoolId is required');
  }

  const role = requester.role;
  const requesterSchoolId = requester.school_id != null ? Number(requester.school_id) : null;

  // ۱. مدیر سامانه ارشد
  if (role === 'superadmin') {
    return true;
  }

  // ۲. ناظر/بازرس اداره آموزش و پرورش منطقه
  if (role === 'edu_office') {
    // دسترسی قانونی در سطح منطقه
    return true;
  }

  // ۳. مدیر مدرسه فقط مجاز به مشاهده مدرسه تحت تصدی خود است
  if (role === 'manager') {
    if (requesterSchoolId == null || requesterSchoolId !== schoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: manager of school ${requesterSchoolId} cannot access school ${schoolId}`);
    }
    return true;
  }

  // ۴. سایر نقش‌ها (دبیر بدون تفویض، دانش‌آموز، ولی، راننده، مشاور) دسترسی به نمای راهبردی مدیر ندارند
  throw new Error(`SCHOOL_INTELLIGENCE_ACCESS_FORBIDDEN: role ${role} is not authorized to access school intelligence center`);
}

/**
 * محاسبه شاخص سلامت مدرسه با اعمال اصل عدم پنهان‌سازی (No-Masking Principle)
 *
 * @param {Object} snapshot - پیش‌نویس شناسنامه مدرسه یا مقادیر مؤلفه‌ها
 * @param {Object} [options]
 * @returns {Object} HealthIndexResult
 */
function calculateSchoolHealthIndex(snapshot = {}, options = {}) {
  const academic = snapshot.academic_summary || {};
  const attendance = snapshot.attendance_summary || {};
  const engagement = snapshot.engagement_summary || snapshot.parent_summary || {};
  const intervention = snapshot.intervention_summary || {};

  // اصل No-Fabrication: مؤلفه‌ای که داده واقعی ندارد در محاسبه وارد نمی‌شود
  // (به‌جای مقادیر پیش‌فرض ساختگی مانند 15.0 / 90.0 / 75.0 / 50.0)
  const hasAcademic = academic.average_gpa != null && !isNaN(Number(academic.average_gpa));
  const hasAttendance = attendance.calendar_rate != null && !isNaN(Number(attendance.calendar_rate));
  const hasEngagement = engagement.average_pei != null && !isNaN(Number(engagement.average_pei));
  const hasIntervention = intervention.resolution_rate != null && !isNaN(Number(intervention.resolution_rate));

  // مؤلفه آموزشی (0-100)
  const avgGpa = hasAcademic ? Number(academic.average_gpa) : null;
  const failingRatio = Number(academic.failing_students_ratio ?? 0);
  const compAcademic = hasAcademic
    ? Math.max(0, Math.min(100, (avgGpa / 20) * 100 - (failingRatio * 100 * 0.5)))
    : null;

  // مؤلفه حضور (0-100)
  const attRate = hasAttendance ? Number(attendance.calendar_rate) : null;
  const chronicRate = attendance.chronic_absence_rate != null ? Number(attendance.chronic_absence_rate) : null;
  const compAttendance = hasAttendance
    ? Math.max(0, Math.min(100, attRate - ((chronicRate || 0) * 1.5)))
    : null;

  // مؤلفه مشارکت و تعامل (0-100)
  const pei = hasEngagement ? Number(engagement.average_pei) : null;
  const compEngagement = hasEngagement ? Math.max(0, Math.min(100, pei)) : null;

  // مؤلفه مداخله (0-100)
  const resRate = hasIntervention ? Number(intervention.resolution_rate) : null;
  const unassignedCritical = Number(intervention.unassigned_high_priority_count ?? 0);
  const compIntervention = hasIntervention
    ? Math.max(0, Math.min(100, resRate - (unassignedCritical * 15)))
    : null;

  // میانگین وزنی فقط روی مؤلفه‌های دارای داده (بازتوزیع وزن)
  const weighted = [
    [0.35, compAcademic],
    [0.30, compAttendance],
    [0.20, compEngagement],
    [0.15, compIntervention]
  ].filter(([, v]) => v != null);

  const weightSum = weighted.reduce((acc, [w]) => acc + w, 0);
  const score = weighted.length > 0
    ? Math.round((weighted.reduce((acc, [w, v]) => acc + w * v, 0) / weightSum) * 10) / 10
    : null;

  // احصای مخاطرات بحرانی (Critical Risks) — فقط بر پایه داده واقعی
  let criticalRiskCount = 0;
  if (chronicRate != null && chronicRate >= 15.0) criticalRiskCount++;
  if (avgGpa != null && avgGpa < 10.0) criticalRiskCount++;
  if (unassignedCritical > 0) criticalRiskCount++;

  // اعمال اصل عدم پنهان‌سازی (No-Masking)
  let status = 'HEALTHY';
  let noMaskingApplied = false;

  if (score == null) {
    status = 'NO_DATA';
  } else if (criticalRiskCount > 0) {
    status = 'NEEDS_IMMEDIATE_ACTION';
    noMaskingApplied = score >= 60; // اگر نمره عددی متوسط/بالا بوده اما به دلیل ریسک حاد تنزل یافته
  } else if (score >= 80) {
    status = 'HEALTHY';
  } else if (score >= 60) {
    status = 'NEEDS_MONITORING';
  } else {
    status = 'NEEDS_IMMEDIATE_ACTION';
  }

  return {
    score: score,
    status: status,
    components: {
      academic: compAcademic != null ? Math.round(compAcademic * 10) / 10 : null,
      attendance: compAttendance != null ? Math.round(compAttendance * 10) / 10 : null,
      engagement: compEngagement != null ? Math.round(compEngagement * 10) / 10 : null,
      intervention: compIntervention != null ? Math.round(compIntervention * 10) / 10 : null
    },
    data_coverage: {
      academic: hasAcademic,
      attendance: hasAttendance,
      engagement: hasEngagement,
      intervention: hasIntervention
    },
    critical_risk_count: criticalRiskCount,
    no_masking_applied: noMaskingApplied
  };
}

/**
 * تولید اقدامات روزانه و اولویت‌دار مدیر مدرسه
 *
 * @param {Object} snapshot
 * @param {Object} [options]
 * @returns {Array<Object>} PrincipalActionItems
 */
function generatePrincipalActionCenter(snapshot = {}, options = {}) {
  const actions = [];

  const att = snapshot.attendance_summary || {};
  const aca = snapshot.academic_summary || {};
  const ass = snapshot.assessment_summary || {};
  const inv = snapshot.intervention_summary || {};
  const par = snapshot.parent_summary || {};
  const tea = snapshot.teacher_summary || {};

  // ۱. پرونده‌های بحرانی مداخله بدون مسئول
  if (inv.unassigned_high_priority_count > 0) {
    actions.push({
      priority: 'CRITICAL',
      source: 'INTERVENTION',
      action: `تخصیص فوری مشاور به ${inv.unassigned_high_priority_count} پرونده مداخله با اولویت بحرانی`,
      deadline: '24h'
    });
  }

  // ۲. طغیان غیبت مزمن
  if (att.chronic_absence_rate >= 10.0) {
    actions.push({
      priority: 'CRITICAL',
      source: 'ATTENDANCE',
      action: `رسیدگی به طغیان غیبت مزمن (${att.chronic_absence_rate}٪) و احضار اولیا در روزهای اوج (${att.peak_absence_day || 'پایان هفته'})`,
      deadline: '24h'
    });
  }

  // ۳. آزمون‌های بسیار دشوار یا ناهنجاری تصحیح
  if (ass.hard_exams_count > 0) {
    actions.push({
      priority: 'HIGH',
      source: 'ASSESSMENT',
      action: `بازنگری و هم‌ترازی نمرات با طراحان ${ass.hard_exams_count} آزمون با ضریب دشواری نامتعارف`,
      deadline: '48h'
    });
  }

  // ۴. افت معدل و دروس بحرانی
  if (aca.at_risk_subjects_count > 0) {
    actions.push({
      priority: 'HIGH',
      source: 'ACADEMIC',
      action: `تشکیل جلسه گروه آموزشی برای ${aca.at_risk_subjects_count} درس با افت شدید نمرات`,
      deadline: '48h'
    });
  }

  // ۵. غیبت‌های غیرموجه در انتظار تایید خانواده
  if (par.unjustified_absences_pending > 5) {
    actions.push({
      priority: 'MEDIUM',
      source: 'PARENT',
      action: `ارسال یادآوری پیامکی به خانواده‌ها برای ${par.unjustified_absences_pending} مورد غیبت غیرموجه معوق`,
      deadline: '48h'
    });
  }

  // ۶. بار کاری نامتعادل دبیران
  if (tea.overloaded_teachers_count > 0) {
    actions.push({
      priority: 'MEDIUM',
      source: 'TEACHER',
      action: `بررسی مجدد برنامه تدریس و توزیع متوازن جلسات برای ${tea.overloaded_teachers_count} دبیر با بار بیش از ۳۰ ساعت`,
      deadline: '7d'
    });
  }

  // اولویت‌بندی قطعی: CRITICAL -> HIGH -> MEDIUM -> LOW
  const priorityOrder = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
  actions.sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));

  return Object.freeze(actions);
}

/**
 * ساخت شناسنامه جامع هوشمندی مدرسه (SchoolIntelligenceSnapshot)
 *
 * @param {Object} data - داده‌های پایه‌ای مدرسه
 * @param {number|string} data.schoolId
 * @param {string} [data.academicYear]
 * @param {Array} [data.grades]
 * @param {Array} [data.attendanceSessions]
 * @param {Array} [data.classes]
 * @param {Array} [data.schedule]
 * @param {Array} [data.teacherNotes]
 * @param {Array} [data.cases]
 * @param {Array} [data.trainingCourses]
 * @param {Object} [options]
 * @returns {Object} SchoolIntelligenceSnapshot
 */
function buildSchoolIntelligenceSnapshot(data = {}, options = {}) {
  const schoolId = Number(data.schoolId || data.school_id);
  if (!schoolId || isNaN(schoolId)) {
    throw new Error('INVALID_INPUT: valid schoolId is required for buildSchoolIntelligenceSnapshot');
  }

  const rawGrades = Array.isArray(data.grades) ? data.grades : [];
  const rawAttendance = Array.isArray(data.attendanceSessions || data.attendance) ? (data.attendanceSessions || data.attendance) : [];
  const rawClasses = Array.isArray(data.classes) ? data.classes : [];
  const rawSchedule = Array.isArray(data.schedule) ? data.schedule : [];
  const rawCases = Array.isArray(data.cases) ? data.cases : [];
  const rawTeacherNotes = Array.isArray(data.teacherNotes) ? data.teacherNotes : [];

  // بررسی دقیق ایزولاسیون چندمستأجری
  const verifySchoolMatch = (arr, name) => {
    for (const item of arr) {
      if (item.school_id != null && Number(item.school_id) !== schoolId) {
        throw new Error(`TENANT_ISOLATION_VIOLATION: ${name} record with school_id ${item.school_id} does not match target ${schoolId}`);
      }
    }
  };

  verifySchoolMatch(rawGrades, 'grade');
  verifySchoolMatch(rawAttendance, 'attendance');
  verifySchoolMatch(rawClasses, 'class');
  verifySchoolMatch(rawSchedule, 'schedule');
  verifySchoolMatch(rawCases, 'intervention_case');
  verifySchoolMatch(rawTeacherNotes, 'teacher_note');

  // ۱. خلاصه تحصیلی (Academic Summary)
  let totalScore = 0;
  let failingCount = 0;
  const subjectScores = new Map();

  for (const g of rawGrades) {
    const sc = Number(g.score);
    if (!isNaN(sc)) {
      totalScore += sc;
      if (sc < 10.0) failingCount++;

      const subId = g.subject_id || 'default';
      if (!subjectScores.has(subId)) subjectScores.set(subId, []);
      subjectScores.get(subId).push(sc);
    }
  }

  const gradeCount = rawGrades.length;
  // No-Fabrication: در نبود نمره، معدل null است (نه مقدار ساختگی 15.0)
  const avgGpa = gradeCount > 0 ? Math.round((totalScore / gradeCount) * 100) / 100 : null;
  const failingRatio = gradeCount > 0 ? Math.round((failingCount / gradeCount) * 1000) / 1000 : null;

  let atRiskSubjectsCount = 0;
  for (const [, scores] of subjectScores.entries()) {
    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = sum / scores.length;
    if (avg < 10.0) atRiskSubjectsCount++;
  }

  const academicSummary = {
    average_gpa: avgGpa,
    failing_students_ratio: failingRatio,
    at_risk_subjects_count: atRiskSubjectsCount
  };

  // ۲. خلاصه حضور و غیاب (Attendance Summary)
  let presentCount = 0;
  let absentCount = 0;
  const dayAbsenceMap = { saturday: 0, sunday: 0, monday: 0, tuesday: 0, wednesday: 0 };
  const dayMap = {
    0: 'saturday', 1: 'sunday', 2: 'monday', 3: 'tuesday', 4: 'wednesday',
    'شنبه': 'saturday', 'یکشنبه': 'sunday', 'دوشنبه': 'monday', 'سه‌شنبه': 'tuesday', 'چهارشنبه': 'wednesday'
  };

  for (const att of rawAttendance) {
    const st = String(att.status || '').toLowerCase();
    if (st.includes('present') || st.includes('حاضر') || st.includes('late') || st.includes('تأخیر')) {
      presentCount++;
    } else if (st.includes('absent') || st.includes('غایب')) {
      absentCount++;
      const dayKey = dayMap[att.day] || 'wednesday';
      dayAbsenceMap[dayKey] = (dayAbsenceMap[dayKey] || 0) + 1;
    }
  }

  const totalSessions = presentCount + absentCount;
  // No-Fabrication: در نبود جلسه حضور/غیاب، نرخ‌ها null هستند (نه 95.0 / 5.0 ساختگی)
  const calendarRate = totalSessions > 0 ? Math.round(((presentCount / totalSessions) * 100) * 100) / 100 : null;
  const chronicAbsenceRate = totalSessions > 0 ? Math.round(((absentCount / totalSessions) * 100) * 100) / 100 : null;

  let peakDay = null;
  let maxAbs = 0;
  for (const [d, count] of Object.entries(dayAbsenceMap)) {
    if (count > maxAbs) {
      maxAbs = count;
      peakDay = d;
    }
  }

  const attendanceSummary = {
    calendar_rate: calendarRate,
    chronic_absence_rate: chronicAbsenceRate,
    peak_absence_day: peakDay
  };

  // ۳. خلاصه سنجش‌ها (Assessment Summary)
  let hardExamsCount = 0;
  for (const [, scores] of subjectScores.entries()) {
    if (scores.length >= 5) {
      const pValue = (scores.reduce((a, b) => a + b, 0) / scores.length) / 20;
      if (pValue < 0.40) hardExamsCount++;
    }
  }

  const assessmentSummary = {
    total_exams_analyzed: subjectScores.size,
    hard_exams_count: hardExamsCount,
    outlier_clusters_count: 0
  };

  // ۴. خلاصه معلمان (Teacher Summary)
  const teacherPeriods = new Map();
  for (const s of rawSchedule) {
    const tid = s.teacher_id;
    if (tid) {
      teacherPeriods.set(tid, (teacherPeriods.get(tid) || 0) + 1);
    }
  }

  let overloadedTeachers = 0;
  for (const [, periods] of teacherPeriods.entries()) {
    if (periods > 30) overloadedTeachers++;
  }

  const teacherSummary = {
    // No-Fabrication: تعداد واقعی معلمان فعال (نه حداقل ساختگی 1)
    active_teachers_count: teacherPeriods.size,
    overloaded_teachers_count: overloadedTeachers,
    exemplary_evidence_count: Math.min(teacherPeriods.size, rawTeacherNotes.length > 5 ? 2 : 0)
  };

  // ۵. خلاصه اولیا (Parent Summary)
  // No-Fabrication: منبع داده شاخص تعامل اولیا (PEI) هنوز متصل نیست؛ null با علامت‌گذاری صریح
  const parentSummary = {
    average_pei: null,
    average_pei_status: 'NOT_AVAILABLE',
    unjustified_absences_pending: absentCount > 0 ? Math.min(absentCount, 3) : 0
  };

  // ۶. خلاصه مداخلات (Intervention Summary)
  let activeCasesCount = 0;
  let unassignedHigh = 0;
  let resolvedCount = 0;

  for (const c of rawCases) {
    const s = c.status || 'OPEN';
    if (s === 'OPEN' || s === 'UNDER_REVIEW' || s === 'INTERVENTION_ACTIVE' || s === 'EVALUATING') {
      activeCasesCount++;
      if ((s === 'OPEN' || s === 'UNDER_REVIEW') && (c.priority === 'CRITICAL' || c.priority === 'HIGH') && !c.assigned_to_id) {
        unassignedHigh++;
      }
    } else if (s === 'RESOLVED') {
      resolvedCount++;
    }
  }

  const totalCases = rawCases.length;
  // No-Fabrication: بدون پرونده مداخله، نرخ حل null است (نه 100٪ ساختگی)
  const resolutionRate = totalCases > 0 ? Math.round(((resolvedCount / totalCases) * 100) * 100) / 100 : null;

  const interventionSummary = {
    active_cases_count: activeCasesCount,
    unassigned_high_priority_count: unassignedHigh,
    resolution_rate: resolutionRate
  };

  // محاسبه سلامت و اقدامات
  const intermediateSnapshot = {
    academic_summary: academicSummary,
    attendance_summary: attendanceSummary,
    assessment_summary: assessmentSummary,
    teacher_summary: teacherSummary,
    parent_summary: parentSummary,
    intervention_summary: interventionSummary
  };

  const healthIndex = calculateSchoolHealthIndex(intermediateSnapshot, options);
  const actionCenter = generatePrincipalActionCenter(intermediateSnapshot, options);

  // احصای ریسک‌ها
  const topRisks = [];
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;

  for (const act of actionCenter) {
    if (act.priority === 'CRITICAL') criticalCount++;
    else if (act.priority === 'HIGH') highCount++;
    else if (act.priority === 'MEDIUM') mediumCount++;

    topRisks.push({
      domain: act.source,
      priority: act.priority,
      description: act.action
    });
  }

  // وضعیت کیفیت داده اسنپ‌شات (No-Data Masking صریح)
  const dataQualityStatus =
    (gradeCount === 0 && totalSessions === 0 && totalCases === 0) ? 'NO_DATA'
      : (gradeCount === 0 || totalSessions === 0) ? 'PARTIAL'
        : 'OK';

  return {
    school_id: schoolId,
    generated_at: options.now || new Date().toISOString(),
    academic_year: data.academicYear || data.academic_year || '1405-1406',
    data_quality: {
      status: dataQualityStatus,
      grades_count: gradeCount,
      attendance_sessions_count: totalSessions,
      intervention_cases_count: totalCases,
      teacher_schedule_entries_count: rawSchedule.length
    },
    health_index: healthIndex,
    risk_summary: {
      total_risks_count: topRisks.length,
      critical_count: criticalCount,
      high_count: highCount,
      medium_count: mediumCount,
      top_risks: Object.freeze(topRisks)
    },
    academic_summary: academicSummary,
    attendance_summary: attendanceSummary,
    assessment_summary: assessmentSummary,
    teacher_summary: teacherSummary,
    parent_summary: parentSummary,
    intervention_summary: interventionSummary,
    action_center: actionCenter
  };
}

/**
 * تجمیع داده‌های منطقه‌ای بدون رتبه‌بندی خطی مدارس (Zero League Table Aggregation)
 *
 * @param {Array<Object>} schools - لیست شناسنامه‌های مدارس منطقه
 * @param {Object} [options]
 * @returns {Object} DistrictAggregationSummary
 */
function generateDistrictAggregation(schools = [], options = {}) {
  const rawSchools = Array.isArray(schools) ? schools : [];

  const healthDist = {
    HEALTHY: 0,
    NEEDS_MONITORING: 0,
    NEEDS_IMMEDIATE_ACTION: 0,
    NO_DATA: 0
  };

  let sumAttendance = 0;
  let sumChronic = 0;
  let totalActiveInterventions = 0;
  const commonIssuesSet = new Set();

  let attendanceSchoolCount = 0;
  for (const s of rawSchools) {
    // No-Fabrication: مدرسه بدون شاخص سلامت، NO_DATA است نه HEALTHY
    const status = s.health_index?.status || 'NO_DATA';
    healthDist[status] = (healthDist[status] || 0) + 1;

    // فقط مدارس دارای داده حضور واقعی در میانگین منطقه‌ای وارد می‌شوند
    if (s.attendance_summary?.calendar_rate != null) {
      sumAttendance += Number(s.attendance_summary.calendar_rate);
      sumChronic += Number(s.attendance_summary.chronic_absence_rate ?? 0);
      attendanceSchoolCount++;
    }
    totalActiveInterventions += Number(s.intervention_summary?.active_cases_count ?? 0);

    for (const risk of (s.risk_summary?.top_risks || [])) {
      if (risk.priority === 'CRITICAL' || risk.priority === 'HIGH') {
        commonIssuesSet.add(risk.description);
      }
    }
  }

  const count = rawSchools.length;
  // No-Fabrication: میانگین فقط از مدارس دارای داده؛ در نبود داده null (نه 90.0 / 5.0)
  const avgAtt = attendanceSchoolCount > 0 ? Math.round((sumAttendance / attendanceSchoolCount) * 100) / 100 : null;
  const avgChronic = attendanceSchoolCount > 0 ? Math.round((sumChronic / attendanceSchoolCount) * 100) / 100 : null;

  return {
    district_id: options.districtId || options.district_id || 1,
    total_schools: count,
    generated_at: options.now || new Date().toISOString(),
    is_ranked: false,                 // ضمانت صریح عدم رتبه‌بندی
    ranking_score: null,               // تضمین فقدان نمره رتبه‌ای
    league_table: null,                // تضمین عدم تولید جدول لیگ
    health_distribution: Object.freeze(healthDist),
    overall_average_attendance: avgAtt,
    district_chronic_absence_rate: avgChronic,
    total_active_interventions: totalActiveInterventions,
    common_critical_issues: Object.freeze(Array.from(commonIssuesSet).slice(0, 5))
  };
}

module.exports = {
  enforceSchoolIntelligenceAccessGuard,
  calculateSchoolHealthIndex,
  generatePrincipalActionCenter,
  buildSchoolIntelligenceSnapshot,
  generateDistrictAggregation
};

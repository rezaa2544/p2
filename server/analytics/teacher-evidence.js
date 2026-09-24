/**
 * ماژول چارچوب شواهد تدریس و کیفیت‌بخشی معلمان (P0-EI-07)
 * Teacher Evidence & Quality Framework Engine
 * 
 * ویژگی‌های کلیدی:
 *  - ۱) گارد امنیتی دسترسی معلم و ضد نفوذ (Anti-IDOR Guard)
 *  - ۲) نمایه بار کاری و فعالیت معلم (TeacherWorkloadProfile)
 *  - ۳) سبد شواهد فرآیند یاددهی (TeacherEvidencePortfolio)
 *  - ۴) ارزیابی روبریک مشاهدات کلاسی ۴ بعدی (LessonObservationReview)
 *  - ۵) پیگیری دوره‌های رشد حرفه‌ای و تطبیق نیازها (ProfessionalDevelopmentTracker)
 *  - ۶) سنتز کارنامه رشد و توانمندسازی معلم بدون رتبه‌بندی خودکار (No-Ranking Growth Profile)
 * 
 * اصول حاکم:
 *  - شکست ایمن (Fail-Closed) در برابر ورودی ناقص یا نشت چندمستأجری
 *  - مصونیت در برابر جهش داده‌ها (Object.freeze Mutation Safety)
 *  - قطعیت ۱۰۰٪ و خروجی بیت‌به‌بیت یکسان در محاسبات متوالی
 *  - ممنوعیت مطلق رتبه‌بندی خطی، تنبیه خودکار یا رده‌بندی رقابتی معلمان
 */

'use strict';

const policy = require('../policy');

/**
 * گارد امنیتی دسترسی معلم و ضد نفوذ (Anti-IDOR Access Guard)
 *
 * @param {Object} requester - کاربر درخواست‌دهنده (حاوی id، role، school_id)
 * @param {number|string} teacherId - شناسه معلم هدف
 * @param {Object} [options]
 * @param {number|string} [options.schoolId] - شناسه مدرسه معلم
 * @returns {boolean}
 */
function enforceTeacherAccessGuard(requester, teacherId, options = {}) {
  if (!requester || typeof requester !== 'object') {
    throw new Error('TEACHER_EVIDENCE_ACCESS_FORBIDDEN: requester session is missing');
  }

  const role = requester.role;
  const reqId = Number(requester.id);
  const targetTeacherId = Number(teacherId);

  if (!targetTeacherId || isNaN(targetTeacherId)) {
    throw new Error('INVALID_INPUT: valid teacherId is required');
  }

  const teacherSchoolId = options.schoolId != null ? Number(options.schoolId) : null;
  const requesterSchoolId = requester.school_id != null ? Number(requester.school_id) : null;

  // دسترسی مدیر سامانه و بازرس اداره آموزش و پرورش
  if (role === 'superadmin') {
    return true;
  }

  if (role === 'edu_office') {
    // بازرس آموزش و پرورش فقط در محدودهٔ جغرافیایی دفترِ خودش مجاز است؛
    // مدرسهٔ ناشناس یا خارج از حوزه ⇒ رد (fail-closed).
    const store = options.store || {};
    if (teacherSchoolId == null || !policy.schoolInOfficeScope(store, requester, teacherSchoolId)) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: edu_office scope does not cover school ${teacherSchoolId}`);
    }
    return true;
  }

  // مدیر مدرسه فقط مجاز به مشاهده معلمان مدرسه خود است
  if (role === 'manager') {
    if (teacherSchoolId != null && requesterSchoolId != null && teacherSchoolId !== requesterSchoolId) {
      throw new Error('TENANT_ISOLATION_VIOLATION: manager cannot access teachers of another school');
    }
    return true;
  }

  // معلم فقط مجاز به مشاهده پرونده رشد شخصی خویش است
  if (role === 'teacher') {
    if (reqId !== targetTeacherId) {
      throw new Error('TEACHER_EVIDENCE_ACCESS_FORBIDDEN: teachers are prohibited from viewing other teachers profiles');
    }
    if (teacherSchoolId != null && requesterSchoolId != null && teacherSchoolId !== requesterSchoolId) {
      throw new Error('TENANT_ISOLATION_VIOLATION: teacher school mismatch');
    }
    return true;
  }

  // سایر نقش‌ها (دانش‌آموز، ولی، مشاور، راننده) دسترسی به پرونده شواهد تدریس ندارند
  throw new Error(`TEACHER_EVIDENCE_ACCESS_FORBIDDEN: role ${role} is not authorized to access teacher evidence`);
}

/**
 * ساخت نمایه بار کاری و فعالیت معلم
 *
 * @param {Object} params
 * @param {number|string} params.teacherId - شناسه معلم
 * @param {number|string} params.schoolId - شناسه مدرسه
 * @param {Array} [params.schedule] - آرایه برنامه‌های کلاسی معلم
 * @param {Array} [params.classes] - آرایه کلاس‌های مدرسه
 * @param {Array} [params.grades] - آرایه نمرات ثبت شده توسط معلم
 * @param {Object} [options]
 * @returns {Object} TeacherWorkloadProfile
 */
function buildTeacherWorkloadProfile(params = {}, options = {}) {
  const teacherId = Number(params.teacherId || params.teacher_id);
  const schoolId = Number(params.schoolId || params.school_id);

  if (!teacherId || isNaN(teacherId)) {
    throw new Error('INVALID_INPUT: valid teacherId is required for buildTeacherWorkloadProfile');
  }
  if (!schoolId || isNaN(schoolId)) {
    throw new Error('INVALID_INPUT: valid schoolId is required for buildTeacherWorkloadProfile');
  }

  const rawSchedule = Array.isArray(params.schedule) ? params.schedule : [];
  const rawClasses = Array.isArray(params.classes) ? params.classes : [];
  const rawGrades = Array.isArray(params.grades) ? params.grades : [];

  // بررسی عدم تداخل چندمستأجری
  for (const s of rawSchedule) {
    if (s.school_id != null && Number(s.school_id) !== schoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: schedule record has school_id ${s.school_id} differing from ${schoolId}`);
    }
  }
  for (const c of rawClasses) {
    if (c.school_id != null && Number(c.school_id) !== schoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: class record has school_id ${c.school_id} differing from ${schoolId}`);
    }
  }
  for (const g of rawGrades) {
    if (g.school_id != null && Number(g.school_id) !== schoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: grade record has school_id ${g.school_id} differing from ${schoolId}`);
    }
  }

  // فیلتر برنامه‌های مربوط به این معلم
  const teacherSchedule = rawSchedule.filter(s => Number(s.teacher_id) === teacherId);

  const assignedClassesSet = new Set();
  const subjectsSet = new Set();
  const scheduleDistribution = {
    saturday: 0,
    sunday: 0,
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    other: 0
  };

  const dayMap = {
    0: 'saturday',
    1: 'sunday',
    2: 'monday',
    3: 'tuesday',
    4: 'wednesday',
    'شنبه': 'saturday',
    'یکشنبه': 'sunday',
    'دوشنبه': 'monday',
    'سه‌شنبه': 'tuesday',
    'چهارشنبه': 'wednesday',
    saturday: 'saturday',
    sunday: 'sunday',
    monday: 'monday',
    tuesday: 'tuesday',
    wednesday: 'wednesday'
  };

  for (const slot of teacherSchedule) {
    if (slot.class_id != null) assignedClassesSet.add(Number(slot.class_id));
    if (slot.subject_id != null) subjectsSet.add(Number(slot.subject_id));

    const dayKey = dayMap[slot.day] || 'other';
    scheduleDistribution[dayKey] = (scheduleDistribution[dayKey] || 0) + 1;
  }

  // کلاس‌های مربیگری (Homeroom)
  const homeroomClasses = rawClasses.filter(c => Number(c.homeroom_teacher_id) === teacherId);
  homeroomClasses.forEach(c => assignedClassesSet.add(Number(c.id)));

  // نمرات ثبت شده توسط معلم
  const teacherGrades = rawGrades.filter(g => Number(g.teacher_id) === teacherId);
  const assessedStudentsSet = new Set();
  for (const g of teacherGrades) {
    if (g.student_id != null) assessedStudentsSet.add(Number(g.student_id));
  }

  const weeklyPeriods = teacherSchedule.length;
  let workloadIntensity = 'BALANCED';
  if (weeklyPeriods > 30) {
    workloadIntensity = 'OVERLOADED';
  } else if (weeklyPeriods >= 25) {
    workloadIntensity = 'HIGH';
  }

  return {
    teacher_id: teacherId,
    school_id: schoolId,
    assigned_classes_count: assignedClassesSet.size,
    homeroom_classes_count: homeroomClasses.length,
    weekly_periods_count: weeklyPeriods,
    unique_subjects_count: subjectsSet.size,
    total_students_enrolled: assessedStudentsSet.size,
    assessment_events_count: teacherGrades.length,
    workload_intensity: workloadIntensity,
    schedule_distribution: {
      saturday: scheduleDistribution.saturday,
      sunday: scheduleDistribution.sunday,
      monday: scheduleDistribution.monday,
      tuesday: scheduleDistribution.tuesday,
      wednesday: scheduleDistribution.wednesday
    }
  };
}

/**
 * ساخت سبد شواهد فرآیند یاددهی معلم (Teaching Evidence Portfolio)
 *
 * @param {Object} params
 * @param {number|string} params.teacherId - شناسه معلم
 * @param {number|string} params.schoolId - شناسه مدرسه
 * @param {number} [params.totalStudents] - تعداد کل دانش‌آموزان تحت تدریس
 * @param {Array} [params.teacherNotes] - یادداشت‌های بازخورد هدایتی برای دانش‌آموزان
 * @param {Array} [params.grades] - نمرات و سنجش‌های ثبت شده
 * @param {Object} [options]
 * @returns {Object} TeacherEvidencePortfolio
 */
function buildTeacherEvidencePortfolio(params = {}, options = {}) {
  const teacherId = Number(params.teacherId || params.teacher_id);
  const schoolId = Number(params.schoolId || params.school_id);

  if (!teacherId || isNaN(teacherId)) {
    throw new Error('INVALID_INPUT: valid teacherId is required for buildTeacherEvidencePortfolio');
  }
  if (!schoolId || isNaN(schoolId)) {
    throw new Error('INVALID_INPUT: valid schoolId is required for buildTeacherEvidencePortfolio');
  }

  const rawNotes = Array.isArray(params.teacherNotes || params.teacher_notes) ? (params.teacherNotes || params.teacher_notes) : [];
  const rawGrades = Array.isArray(params.grades) ? params.grades : [];

  for (const n of rawNotes) {
    if (n.school_id != null && Number(n.school_id) !== schoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: teacher_notes record has school_id ${n.school_id} differing from ${schoolId}`);
    }
  }
  for (const g of rawGrades) {
    if (g.school_id != null && Number(g.school_id) !== schoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: grade record has school_id ${g.school_id} differing from ${schoolId}`);
    }
  }

  const notes = rawNotes.filter(n => Number(n.teacher_id) === teacherId);
  const grades = rawGrades.filter(g => Number(g.teacher_id) === teacherId);

  const studentsReceivingFeedback = new Set();
  for (const n of notes) {
    if (n.student_id != null) studentsReceivingFeedback.add(Number(n.student_id));
  }

  const totalStudents = Number(params.totalStudents || params.total_students) || studentsReceivingFeedback.size || 1;
  const coverageRate = Math.min(100, Math.round(((studentsReceivingFeedback.size / totalStudents) * 100) * 100) / 100);

  // تحلیل تنوع سنجش‌ها
  const assessmentDiversity = {
    formative: 0,
    summative: 0,
    classwork: 0,
    project: 0
  };

  for (const g of grades) {
    const type = String(g.type || 'classwork').toLowerCase();
    if (type.includes('formative') || type.includes('تکوینی')) {
      assessmentDiversity.formative++;
    } else if (type.includes('summative') || type.includes('تراکمی') || type.includes('پایانی')) {
      assessmentDiversity.summative++;
    } else if (type.includes('project') || type.includes('پروژه')) {
      assessmentDiversity.project++;
    } else {
      assessmentDiversity.classwork++;
    }
  }

  let diversityTypeCount = 0;
  if (assessmentDiversity.formative > 0) diversityTypeCount++;
  if (assessmentDiversity.summative > 0) diversityTypeCount++;
  if (assessmentDiversity.classwork > 0) diversityTypeCount++;
  if (assessmentDiversity.project > 0) diversityTypeCount++;

  let portfolioCompleteness = 'DEVELOPING';
  if (coverageRate >= 75 && diversityTypeCount >= 3) {
    portfolioCompleteness = 'EXEMPLARY';
  } else if (coverageRate >= 45 && diversityTypeCount >= 2) {
    portfolioCompleteness = 'PROFICIENT';
  }

  const totalAssessments = grades.length;
  const formativeRatio = totalAssessments > 0 
    ? Math.round((assessmentDiversity.formative / totalAssessments) * 1000) / 1000 
    : 0;

  return {
    teacher_id: teacherId,
    school_id: schoolId,
    total_students: totalStudents,
    formative_notes_count: notes.length,
    students_receiving_feedback_count: studentsReceivingFeedback.size,
    formative_coverage_rate: coverageRate,
    assessment_diversity: assessmentDiversity,
    diversity_type_count: diversityTypeCount,
    portfolio_completeness: portfolioCompleteness,
    evidence_summary: {
      has_individual_feedback: studentsReceivingFeedback.size > 0,
      uses_multiple_assessment_types: diversityTypeCount >= 2,
      formative_ratio: formativeRatio
    }
  };
}

/**
 * ارزیابی روبریک مشاهدات کلاسی استاندارد ۴ بعدی
 *
 * @param {Object} params
 * @param {number|string} params.observationId
 * @param {number|string} params.teacherId
 * @param {number|string} params.schoolId
 * @param {string} [params.evaluatorRole] - نقش ارزیاب ('manager', 'edu_office')
 * @param {Object} params.rubric - نمرات ابعاد چهارگانه (۱ تا ۵)
 * @param {Array<string>} [params.strengths] - نقاط قوت ثبت شده
 * @param {Array<string>} [params.growthRecommendations] - توصیه‌های سازنده
 * @param {Object} [options]
 * @returns {Object} LessonObservationReview
 */
function evaluateLessonObservation(params = {}, options = {}) {
  const teacherId = Number(params.teacherId || params.teacher_id);
  const schoolId = Number(params.schoolId || params.school_id);

  if (!teacherId || isNaN(teacherId)) {
    throw new Error('INVALID_INPUT: valid teacherId is required for evaluateLessonObservation');
  }
  if (!schoolId || isNaN(schoolId)) {
    throw new Error('INVALID_INPUT: valid schoolId is required for evaluateLessonObservation');
  }

  const rubric = params.rubric || {};
  const clampScore = (v) => {
    const num = Number(v);
    if (isNaN(num)) return 3.0; // پیش‌فرض سطح متوسط در غیاب داده
    return Math.max(1.0, Math.min(5.0, Math.round(num * 100) / 100));
  };

  const scores = {
    classroom_interaction: clampScore(rubric.classroom_interaction != null ? rubric.classroom_interaction : rubric.interaction),
    learner_engagement: clampScore(rubric.learner_engagement != null ? rubric.learner_engagement : rubric.engagement),
    instructional_clarity: clampScore(rubric.instructional_clarity != null ? rubric.instructional_clarity : rubric.clarity),
    formative_feedback: clampScore(rubric.formative_feedback != null ? rubric.formative_feedback : rubric.feedback)
  };

  const avgScore = Math.round(((scores.classroom_interaction + scores.learner_engagement + scores.instructional_clarity + scores.formative_feedback) / 4) * 100) / 100;

  let masteryLevel = 'DEVELOPING';
  if (avgScore >= 4.2) {
    masteryLevel = 'ADVANCED';
  } else if (avgScore >= 3.2) {
    masteryLevel = 'COMPETENT';
  }

  // احصای بعدی که کمترین امتیاز را دارد جهت اولویت‌بخشی توانمندسازی
  let lowestDim = 'classroom_interaction';
  let minVal = scores.classroom_interaction;
  for (const [k, v] of Object.entries(scores)) {
    if (v < minVal) {
      minVal = v;
      lowestDim = k;
    }
  }

  const rawStrengths = Array.isArray(params.strengths) ? params.strengths : [];
  const rawRecommendations = Array.isArray(params.growthRecommendations || params.growth_recommendations) 
    ? (params.growthRecommendations || params.growth_recommendations) 
    : [];

  return {
    observation_id: params.observationId || params.observation_id || 1,
    teacher_id: teacherId,
    school_id: schoolId,
    evaluator_role: params.evaluatorRole || params.evaluator_role || 'manager',
    average_score: avgScore,
    mastery_level: masteryLevel,
    dimension_scores: scores,
    priority_focus_dimension: lowestDim,
    strengths: Object.freeze([...rawStrengths]),
    growth_recommendations: Object.freeze([...rawRecommendations])
  };
}

/**
 * پیگیری دوره‌های رشد حرفه‌ای و تطبیق با نیازهای آموزشی شناسایی‌شده
 *
 * @param {Object} params
 * @param {number|string} params.teacherId
 * @param {number|string} params.schoolId
 * @param {Array} [params.trainingCourses] - دوره‌های گذرانده شده معلم
 * @param {Array<string>} [params.identifiedNeeds] - نیازهای شناسایی‌شده از روبریک یا سنجش
 * @param {Object} [options]
 * @returns {Object} ProfessionalDevelopmentTracker
 */
function trackProfessionalDevelopment(params = {}, options = {}) {
  const teacherId = Number(params.teacherId || params.teacher_id);
  const schoolId = Number(params.schoolId || params.school_id);

  if (!teacherId || isNaN(teacherId)) {
    throw new Error('INVALID_INPUT: valid teacherId is required for trackProfessionalDevelopment');
  }
  if (!schoolId || isNaN(schoolId)) {
    throw new Error('INVALID_INPUT: valid schoolId is required for trackProfessionalDevelopment');
  }

  const rawCourses = Array.isArray(params.trainingCourses || params.training_courses) 
    ? (params.trainingCourses || params.training_courses) 
    : [];
  const identifiedNeeds = Array.isArray(params.identifiedNeeds || params.identified_needs) 
    ? (params.identifiedNeeds || params.identified_needs) 
    : [];

  for (const c of rawCourses) {
    if (c.school_id != null && Number(c.school_id) !== schoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: training_course has school_id ${c.school_id} differing from ${schoolId}`);
    }
  }

  const teacherCourses = rawCourses.filter(c => Number(c.staff_id || c.teacher_id) === teacherId);

  let totalHoursCompleted = 0;
  let completedCount = 0;
  let inProgressCount = 0;
  const addressedNeedsSet = new Set();

  for (const course of teacherCourses) {
    const isCompleted = course.status === 'completed' || course.status === 'پایان‌یافته';
    if (isCompleted) {
      completedCount++;
      totalHoursCompleted += Number(course.hours) || 0;
      if (course.competency_area) {
        addressedNeedsSet.add(course.competency_area);
      }
      // اگر عنوان دوره شامل نیاز شناسایی‌شده باشد
      for (const need of identifiedNeeds) {
        if (course.title && course.title.toLowerCase().includes(need.toLowerCase())) {
          addressedNeedsSet.add(need);
        }
      }
    } else {
      inProgressCount++;
    }
  }

  const unaddressedNeeds = identifiedNeeds.filter(n => !addressedNeedsSet.has(n));

  let pdStatus = 'NEEDS_ENGAGEMENT';
  if (totalHoursCompleted >= 24 && unaddressedNeeds.length === 0) {
    pdStatus = 'ACTIVE_LEARNER';
  } else if (totalHoursCompleted >= 12) {
    pdStatus = 'ON_TRACK';
  }

  return {
    teacher_id: teacherId,
    school_id: schoolId,
    total_hours_completed: totalHoursCompleted,
    completed_courses_count: completedCount,
    in_progress_courses_count: inProgressCount,
    courses: Object.freeze(teacherCourses.map(c => ({
      id: c.id,
      title: c.title,
      hours: Number(c.hours) || 0,
      status: c.status,
      competency_area: c.competency_area || null
    }))),
    addressed_needs: Object.freeze(Array.from(addressedNeedsSet).sort()),
    unaddressed_needs: Object.freeze([...unaddressedNeeds].sort()),
    pd_status: pdStatus
  };
}

/**
 * سنتز کارنامه جامع رشد و توانمندسازی معلم (بدون رتبه‌بندی خطی)
 * Synthesizes a constructive growth profile ensuring ZERO comparative ranking.
 *
 * @param {Object} params
 * @param {number|string} params.teacherId
 * @param {number|string} params.schoolId
 * @param {Object} [params.workloadProfile]
 * @param {Object} [params.evidencePortfolio]
 * @param {Object} [params.observationReview]
 * @param {Object} [params.pdTracker]
 * @param {Object} [params.consistencyProfile]
 * @param {Object} [options]
 * @returns {Object} TeacherGrowthProfile
 */
function synthesizeTeacherGrowthProfile(params = {}, options = {}) {
  const teacherId = Number(params.teacherId || params.teacher_id);
  const schoolId = Number(params.schoolId || params.school_id);

  if (!teacherId || isNaN(teacherId)) {
    throw new Error('INVALID_INPUT: valid teacherId is required for synthesizeTeacherGrowthProfile');
  }
  if (!schoolId || isNaN(schoolId)) {
    throw new Error('INVALID_INPUT: valid schoolId is required for synthesizeTeacherGrowthProfile');
  }

  const workload = params.workloadProfile || {};
  const evidence = params.evidencePortfolio || {};
  const observation = params.observationReview || {};
  const pd = params.pdTracker || {};
  const consistency = params.consistencyProfile || {};

  // اعتبارسنجی ایزولاسیون زیرمجموعه‌ها
  if (workload.school_id != null && Number(workload.school_id) !== schoolId) {
    throw new Error('TENANT_ISOLATION_VIOLATION: workloadProfile school mismatch');
  }
  if (evidence.school_id != null && Number(evidence.school_id) !== schoolId) {
    throw new Error('TENANT_ISOLATION_VIOLATION: evidencePortfolio school mismatch');
  }
  if (observation.school_id != null && Number(observation.school_id) !== schoolId) {
    throw new Error('TENANT_ISOLATION_VIOLATION: observationReview school mismatch');
  }
  if (pd.school_id != null && Number(pd.school_id) !== schoolId) {
    throw new Error('TENANT_ISOLATION_VIOLATION: pdTracker school mismatch');
  }

  const strengthAreas = [];
  const priorityGrowthGoals = [];

  // تحلیل شواهد تکوینی
  if (evidence.portfolio_completeness === 'EXEMPLARY') {
    strengthAreas.push('پوشش برجسته بازخورد تکوینی به دانش‌آموزان و هدایت یادگیری فردی');
  } else if (evidence.portfolio_completeness === 'PROFICIENT') {
    strengthAreas.push('پوشش مطلوب بازخورد تکوینی و تنوع در شیوه‌های ارزشیابی');
  } else {
    priorityGrowthGoals.push('توسعه و مستندسازی بازخوردهای تکوینی فردی برای دانش‌آموزان نیازمند حمایت');
  }

  // تحلیل تنوع سنجش‌ها
  if (evidence.diversity_type_count >= 3) {
    strengthAreas.push('استفاده گسترده از تنوع ابزارهای سنجش (تکوینی، تراکمی، کلاسی و پروژه‌محور)');
  }

  // تحلیل روبریک کلاسی
  if (observation.mastery_level === 'ADVANCED') {
    strengthAreas.push('تسلط پیشرفته در مدیریت تعامل کلاسی و تفهیم اهداف درس');
  } else if (observation.priority_focus_dimension) {
    const dimNames = {
      classroom_interaction: 'مدیریت زمان و تعامل کلاسی',
      learner_engagement: 'افزایش مشارکت فعال دانش‌آموزان',
      instructional_clarity: 'شفافیت اهداف آموزشی و پیوند با آموخته‌های قبلی',
      formative_feedback: 'ارائه بازخوردهای اصلاحی حین تدریس'
    };
    priorityGrowthGoals.push(`تمرکز توسعه حرفه‌ای بر بُعد «${dimNames[observation.priority_focus_dimension] || observation.priority_focus_dimension}»`);
  }

  // تحلیل ثبات نمره‌دهی
  if (consistency.consistency_status === 'CONSISTENT') {
    strengthAreas.push('ثبات ارزیابی و عدالت سنجش در تصحیح نمرات');
  } else if (consistency.consistency_status === 'NEEDS_ALIGNMENT') {
    priorityGrowthGoals.push('تنظیم شاخص تمایز آزمون‌ها و هم‌ترازی نمرات با معیارهای استاندارد مدرسه');
  }

  // تحلیل توانمندسازی حرفه‌ای
  if (pd.pd_status === 'ACTIVE_LEARNER') {
    strengthAreas.push('مشارکت فعال در دوره‌های توانمندسازی و تکمیل نیازمندی‌های حرفه‌ای');
  } else if (pd.pd_status === 'NEEDS_ENGAGEMENT') {
    priorityGrowthGoals.push('برنامه‌ریزی جهت شرکت در کارگاه‌های ضمن‌خدمت مرتبط با اولویت‌های تدریس');
  }

  // تعیین خط سیر رشد حرفه‌ای (Growth Trajectory) بدون رتبه‌بندی
  let growthTrajectory = 'STABLE_PROFICIENT';
  if ((observation.mastery_level === 'ADVANCED' || evidence.portfolio_completeness === 'EXEMPLARY') && pd.pd_status !== 'NEEDS_ENGAGEMENT') {
    growthTrajectory = 'ADVANCING';
  } else if (observation.mastery_level === 'DEVELOPING' && evidence.portfolio_completeness === 'DEVELOPING') {
    growthTrajectory = 'EMERGING_NEEDS_MENTORSHIP';
  }

  return {
    teacher_id: teacherId,
    school_id: schoolId,
    profile_date: options.profileDate || '2026-09-18',
    is_ranked: false,            // ضمانت صریح عدم رتبه‌بندی خودکار
    ranking_score: null,          // تضمین فقدان امتیاز رتبه‌ای
    workload_status: workload.workload_intensity || 'BALANCED',
    evidence_completeness: evidence.portfolio_completeness || 'DEVELOPING',
    observation_mastery: observation.mastery_level || 'COMPETENT',
    pd_engagement: pd.pd_status || 'NEEDS_ENGAGEMENT',
    growth_trajectory: growthTrajectory,
    strength_areas: Object.freeze(strengthAreas),
    priority_growth_goals: Object.freeze(priorityGrowthGoals)
  };
}

module.exports = {
  enforceTeacherAccessGuard,
  buildTeacherWorkloadProfile,
  buildTeacherEvidencePortfolio,
  evaluateLessonObservation,
  trackProfessionalDevelopment,
  synthesizeTeacherGrowthProfile
};

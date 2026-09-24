/* ═══════════════════════════════════════════════════════════════════
   server/routes/semantic-analytics.js — Phase 9.0 Wiring Gate
   -------------------------------------------------------------------
   اتصال هشت موتور آموزشی که تا این تغییر هیچ مصرف‌کنندهٔ رانتایمی نداشتند
   (یافتهٔ F-EI-01). هر موتور حالا از یک مسیر HTTP واقعی فراخوانی می‌شود،
   پشت همان لایهٔ احراز هویت و جداسازی مستأجر که بقیهٔ API است.

   - GET /api/v1/analytics/semantic-metrics        (semantic.js)
   - GET /api/v1/analytics/assessment-quality      (assessment-intelligence.js)
   - GET /api/v1/analytics/attendance-risk         (attendance-intelligence.js)
   - GET /api/v1/analytics/student-timeline         (student-timeline.js)
   - GET /api/v1/analytics/intervention-warnings    (intervention-case-management.js)
   - GET /api/v1/analytics/school-health-dashboard  (school-health-dashboard.js)
   - GET /api/v1/analytics/parent-360               (parent-360.js)
   - GET /api/v1/analytics/teacher-evidence         (teacher-evidence.js)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const {
  calculateAttendanceRate,
  calculateChronicAbsence,
  calculateGradeDistribution,
  calculateLearningProgressTrend,
  calculateSchoolEducationalHealth
} = require('../analytics/semantic');

const {
  analyzeAssessmentQuality,
  detectGradeAnomalies
} = require('../analytics/assessment-intelligence');

const {
  detectAttendanceRisk,
  analyzeWeeklyAttendancePattern
} = require('../analytics/attendance-intelligence');

const { buildStudentTimeline } = require('../analytics/student-timeline');

const {
  evaluateEarlyWarningRules,
  summarizeSchoolInterventions,
  enforceInterventionAccessGuard
} = require('../analytics/intervention-case-management');

const {
  calculateSchoolHealthIndex: legacySchoolHealth,
  detectSchoolCriticalIssues,
  aggregateSchoolEducationalMetrics
} = require('../analytics/school-health-dashboard');

const {
  buildParent360Profile,
  enforceParentChildAccessGuard,
  calculateParentEngagementIndex
} = require('../analytics/parent-360');

const {
  buildTeacherWorkloadProfile,
  buildTeacherEvidencePortfolio,
  enforceTeacherAccessGuard
} = require('../analytics/teacher-evidence');

const policy = require('../policy');

/* گزارهای دسترسی — مدیر مدرسه فقط مدرسهٔ خودش؛ superadmin آزاد؛
   edu_office فقط مدارس داخلِ محدودهٔ جغرافیایی دفترِ خودش (همان دروازهٔ
   یکتای policy.schoolInOfficeScope که در sync/reports به کار رفته). */
function assertCanSeeSchool(user, schoolId, store = {}) {
  if (!user || typeof user !== 'object') {
    throw new Error('SEMANTIC_ANALYTICS_FORBIDDEN: requester session is missing');
  }
  const sid = Number(schoolId);
  if (!sid || isNaN(sid)) throw new Error('INVALID_INPUT: valid school_id is required');
  if (user.role === 'superadmin') return true;
  if (user.role === 'edu_office') {
    if (!policy.schoolInOfficeScope(store, user, sid)) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: edu_office scope does not cover school ${sid}`);
    }
    return true;
  }
  if (user.role === 'manager') {
    const own = user.school_id != null ? Number(user.school_id) : null;
    if (own === null || own !== sid) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: manager of school ${own} cannot access school ${sid}`);
    }
    return true;
  }
  /* دبیر/مشاور می‌توانند مدرسهٔ خودشان را ببینند (محدودهٔ تدریس) */
  if (user.role === 'teacher' || user.role === 'counselor') {
    const own = user.school_id != null ? Number(user.school_id) : null;
    if (own === null || own !== sid) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: ${user.role} cannot access school ${sid}`);
    }
    return true;
  }
  throw new Error(`SEMANTIC_ANALYTICS_FORBIDDEN: role ${user.role} is not authorized`);
}

function requireSchoolId(searchParams) {
  const raw = searchParams.get('school_id');
  if (!raw) return { err: { status: 400, body: { ok: false, code: 'invalid_params', message: 'school_id الزامی است' } } };
  const schoolId = Number(raw);
  if (!schoolId || isNaN(schoolId)) {
    return { err: { status: 400, body: { ok: false, code: 'invalid_params', message: 'school_id نامعتبر است' } } };
  }
  return { schoolId };
}

function ok(payload) {
  return { status: 200, body: { ok: true, api_version: '1.0.0', ...payload } };
}

function guard(fn) {
  return async (req, searchParams) => {
    const user = req.user || req.session;
    try {
      return await fn(user, searchParams);
    } catch (err) {
      const code = String(err.message || '').startsWith('TENANT_ISOLATION_VIOLATION')
        ? 'forbidden'
        : (err.code === 'TENANT_ISOLATION_VIOLATION' ? 'forbidden' : 'forbidden');
      return { status: 403, body: { ok: false, code, message: err.message } };
    }
  };
}

function createSemanticAnalyticsRoutes(ctx) {
  const store = ctx.store || {};
  const db = ctx.db;
  const pgLive = () => !!(db && typeof db.isPostgres === 'function' && db.isPostgres());

  async function schoolRecords(tables, schoolId) {
    const out = {};
    if (pgLive() && typeof db.query === 'function') {
      try {
        for (const [key, table] of Object.entries(tables)) {
          const r = await db.query(`SELECT * FROM ${table} WHERE school_id = $1`, [schoolId]);
          out[key] = (r && r.rows) || [];
        }
        return out;
      } catch (e) {
        /* در صورت خطای DB به fallback برو */
      }
    }
    for (const [key, table] of Object.entries(tables)) {
      out[key] = (store[table] || []).filter((r) => Number(r.school_id) === schoolId);
    }
    return out;
  }

  /* ── ۱. semantic.js — معیارهای پایهٔ آموزشی ────────────────────── */
  const semanticReport = guard(async (user, searchParams) => {
    const parsed = requireSchoolId(searchParams);
    if (parsed.err) return parsed.err;
    const { schoolId } = parsed;
    try { assertCanSeeSchool(user, schoolId, store); }
    catch (e) { return { status: 403, body: { ok: false, code: 'forbidden', message: e.message } }; }

    const rec = await schoolRecords({ attendance: 'attendance', grades: 'grades' }, schoolId);

    const attendanceRate = calculateAttendanceRate(rec.attendance, { expectedSchoolId: schoolId });
    const chronicAbsence = calculateChronicAbsence(rec.attendance, { expectedSchoolId: schoolId });
    const gradeDistribution = calculateGradeDistribution(rec.grades, { expectedSchoolId: schoolId });
    const learningTrend = calculateLearningProgressTrend(rec.grades, { expectedSchoolId: schoolId });

    const components = {
      attendance_rate: attendanceRate && attendanceRate.value != null ? attendanceRate.value : null,
      chronic_absence_rate: chronicAbsence && chronicAbsence.value != null ? chronicAbsence.value : null,
      mean_grade: gradeDistribution && gradeDistribution.mean != null ? gradeDistribution.mean : null,
      failure_rate: gradeDistribution && gradeDistribution.failure_rate != null ? gradeDistribution.failure_rate : null,
      improving_students_ratio: null,
      declining_students_ratio: null,
      class_coverage_ratio: null,
      data_freshness_ratio: null
    };
    const schoolHealth = calculateSchoolEducationalHealth(components, { expectedSchoolId: schoolId });

    return ok({
      school_id: schoolId,
      metrics: {
        attendance_rate: attendanceRate,
        chronic_absence: chronicAbsence,
        grade_distribution: gradeDistribution,
        learning_progress_trend: learningTrend,
        school_educational_health: schoolHealth
      }
    });
  });

  /* ── ۲. assessment-intelligence.js — کیفیت سنجش ───────────────── */
  const assessmentQualityReport = guard(async (user, searchParams) => {
    const parsed = requireSchoolId(searchParams);
    if (parsed.err) return parsed.err;
    const { schoolId } = parsed;
    try { assertCanSeeSchool(user, schoolId, store); }
    catch (e) { return { status: 403, body: { ok: false, code: 'forbidden', message: e.message } }; }

    const rec = await schoolRecords({ grades: 'grades' }, schoolId);
    const quality = analyzeAssessmentQuality({ grades: rec.grades }, { expectedSchoolId: schoolId });
    const anomalies = detectGradeAnomalies({ grades: rec.grades, expectedSchoolId: schoolId });

    return ok({ school_id: schoolId, assessment_quality: quality, grade_anomalies: anomalies });
  });

  /* ── ۳. attendance-intelligence.js — خطر حضور ──────────────────── */
  const attendanceRiskReport = guard(async (user, searchParams) => {
    const parsed = requireSchoolId(searchParams);
    if (parsed.err) return parsed.err;
    const { schoolId } = parsed;
    try { assertCanSeeSchool(user, schoolId, store); }
    catch (e) { return { status: 403, body: { ok: false, code: 'forbidden', message: e.message } }; }

    const rec = await schoolRecords({ attendance: 'attendance' }, schoolId);
    const byStudent = new Map();
    for (const a of rec.attendance) {
      const sid = a.student_id;
      if (!byStudent.has(sid)) byStudent.set(sid, []);
      byStudent.get(sid).push(a);
    }
    const students = [];
    for (const [studentId, records] of byStudent.entries()) {
      students.push(detectAttendanceRisk({ attendance: records, studentId, school_id: schoolId }, {}));
    }
    const weekly = analyzeWeeklyAttendancePattern({ attendance: rec.attendance }, {});

    return ok({ school_id: schoolId, student_risks: students, weekly_pattern: weekly });
  });

  /* ── ۴. student-timeline.js — خط زمانی دانش‌آموز ────────────────── */
  const studentTimelineReport = guard(async (user, searchParams) => {
    const parsed = requireSchoolId(searchParams);
    if (parsed.err) return parsed.err;
    const { schoolId } = parsed;
    const studentIdParam = searchParams.get('student_id');
    try { assertCanSeeSchool(user, schoolId, store); }
    catch (e) { return { status: 403, body: { ok: false, code: 'forbidden', message: e.message } }; }
    if (!studentIdParam) {
      return { status: 400, body: { ok: false, code: 'invalid_params', message: 'student_id الزامی است' } };
    }
    const studentId = Number(studentIdParam);

    const rec = await schoolRecords({
      attendance: 'attendance', grades: 'grades', discipline: 'discipline',
      enrollments: 'enrollments', exams: 'exams'
    }, schoolId);
    const studentRec = (store.users || []).find((u) => Number(u.id) === studentId);
    /* A-19: دیدنِ مدرسه کافی نیست — دبیر/مشاور فقط باید خطِ زمانیِ
       دانش‌آموزانی را ببیند که واقعاً در کلاسِ تدریسیِ او هستند (همان
       دروازهٔ یکتای policy.studentRecordOk که در idor.js نشسته). */
    if (user.role === 'teacher' || user.role === 'counselor') {
      if (!studentRec || !policy.studentRecordOk(store, user, studentRec)) {
        return { status: 403, body: { ok: false, code: 'forbidden', message: 'دسترسی به خط زمانی این دانش‌آموز مجاز نیست' } };
      }
    } else if (!studentRec) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }
    const timelineStudentRec = studentRec || {};
    const timeline = buildStudentTimeline({
      student: timelineStudentRec,
      attendance: rec.attendance.filter((a) => Number(a.student_id) === studentId),
      grades: rec.grades.filter((g) => Number(g.student_id) === studentId),
      discipline: (rec.discipline || []).filter((d) => Number(d.student_id) === studentId),
      exams: (rec.exams || []).filter((e) => Number(e.student_id) === studentId)
    }, { studentId, expectedSchoolId: schoolId });

    return ok({ school_id: schoolId, student_id: studentId, timeline });
  });

  /* ── ۵. intervention-case-management.js — هشدار زودهنگام ───────── */
  const interventionWarningsReport = guard(async (user, searchParams) => {
    const parsed = requireSchoolId(searchParams);
    if (parsed.err) return parsed.err;
    const { schoolId } = parsed;
    try { assertCanSeeSchool(user, schoolId, store); }
    catch (e) { return { status: 403, body: { ok: false, code: 'forbidden', message: e.message } }; }

    const rec = await schoolRecords({ cases: 'counselor_refs', grades: 'grades' }, schoolId);
    const warnings = [];
    for (const c of rec.cases) {
      try {
        enforceInterventionAccessGuard(user, c, { store });
      } catch (e) {
        continue; /* پرونده‌هایی که این نقش نباید ببیند */
      }
      warnings.push(evaluateEarlyWarningRules({
        studentId: c.student_id,
        schoolId,
        currentGpa: c.current_gpa,
        recentAttendanceRate: c.recent_attendance_rate,
        consecutiveAbsences: c.consecutive_absences
      }, {}));
    }
    const summary = summarizeSchoolInterventions(rec.cases, {});

    return ok({ school_id: schoolId, early_warnings: warnings, intervention_summary: summary });
  });

  /* ── ۶. school-health-dashboard.js ──────────────────────────────── */
  const schoolHealthReport = guard(async (user, searchParams) => {
    const parsed = requireSchoolId(searchParams);
    if (parsed.err) return parsed.err;
    const { schoolId } = parsed;
    try { assertCanSeeSchool(user, schoolId, store); }
    catch (e) { return { status: 403, body: { ok: false, code: 'forbidden', message: e.message } }; }

    const rec = await schoolRecords({
      attendance: 'attendance', grades: 'grades', classes: 'classes',
      cases: 'counselor_refs', notes: 'teacher_notes'
    }, schoolId);
    const metrics = aggregateSchoolEducationalMetrics({
      schoolId, attendance: rec.attendance, grades: rec.grades,
      classes: rec.classes, cases: rec.cases, teacherNotes: rec.notes
    }, {});
    const critical = detectSchoolCriticalIssues({
      schoolId, attendance: rec.attendance, grades: rec.grades, cases: rec.cases
    }, {});

    return ok({ school_id: schoolId, health_metrics: metrics, critical_issues: critical });
  });

  /* ── ۷. parent-360.js ───────────────────────────────────────────── */
  const parent360Report = guard(async (user, searchParams) => {
    const studentIdParam = searchParams.get('student_id');
    if (!studentIdParam) {
      return { status: 400, body: { ok: false, code: 'invalid_params', message: 'student_id الزامی است' } };
    }
    const studentId = Number(studentIdParam);
    if (!studentId || isNaN(studentId)) {
      return { status: 400, body: { ok: false, code: 'invalid_params', message: 'student_id نامعتبر است' } };
    }
    const links = Array.isArray(store.parent_links) ? store.parent_links : [];
    try {
      if (user && user.role === 'parent') {
        /* ولی فقط پروندهٔ فرزندان خودش را می‌بیند */
        enforceParentChildAccessGuard(user, studentId, links, {});
      } else {
        /* نقش‌های مدرسه (manager/teacher/counselor) با گارد مدرسه کنترل می‌شوند */
        const schoolIdRaw = searchParams.get('school_id');
        if (!schoolIdRaw) return { status: 400, body: { ok: false, code: 'invalid_params', message: 'school_id الزامی است' } };
        assertCanSeeSchool(user, Number(schoolIdRaw), store);
      }
    } catch (e) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: e.message } };
    }
    /* مدرسهٔ دانش‌آموز (از پروندهٔ کاربر، در صورت موجود بودن) */
    const studentUser = (store.users || []).find((u) => Number(u.id) === studentId) || {};
    const schoolId = Number(searchParams.get('school_id') || studentUser.school_id || 0) || null;

    const profile = buildParent360Profile({
      studentId,
      parentId: (user && user.role === 'parent') ? user.id : null,
      student: studentUser,
      parent: (user && user.role === 'parent') ? user : {},
      attendance: (store.attendance || []).filter((a) => Number(a.student_id) === studentId),
      grades: (store.grades || []).filter((g) => Number(g.student_id) === studentId),
      parentLinks: links,
      school: (store.schools || []).find((sc) => Number(sc.id) === schoolId) || {}
    }, { studentId, expectedSchoolId: schoolId, schoolScopedAccess: (user && user.role !== 'parent') });

    return ok({ student_id: studentId, parent_360: profile });
  });

  /* ── ۸. teacher-evidence.js ─────────────────────────────────────── */
  const teacherEvidenceReport = guard(async (user, searchParams) => {
    const teacherIdParam = searchParams.get('teacher_id');
    if (!teacherIdParam) {
      return { status: 400, body: { ok: false, code: 'invalid_params', message: 'teacher_id الزامی است' } };
    }
    const teacherId = Number(teacherIdParam);
    if (!teacherId || isNaN(teacherId)) {
      return { status: 400, body: { ok: false, code: 'invalid_params', message: 'teacher_id نامعتبر است' } };
    }
    const schoolIdRaw = searchParams.get('school_id');
    if (!schoolIdRaw) return { status: 400, body: { ok: false, code: 'invalid_params', message: 'school_id الزامی است' } };
    const schoolId = Number(schoolIdRaw);
    try {
      assertCanSeeSchool(user, schoolId, store);
      enforceTeacherAccessGuard(user, teacherId, { store, schoolId });
    } catch (e) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: e.message } };
    }

    const workload = buildTeacherWorkloadProfile({
      teacherId, schoolId,
      schedule: (store.schedule || []).filter((s) => Number(s.school_id) === schoolId)
    }, {});
    const portfolio = buildTeacherEvidencePortfolio({
      teacherId, schoolId,
      notes: (store.teacher_notes || []).filter((n) => Number(n.school_id) === schoolId && Number(n.teacher_id || n.author_id) === teacherId)
    }, {});

    return ok({ teacher_id: teacherId, school_id: schoolId, workload, portfolio });
  });

  return {
    semanticReport,
    assessmentQualityReport,
    attendanceRiskReport,
    studentTimelineReport,
    interventionWarningsReport,
    schoolHealthReport,
    parent360Report,
    teacherEvidenceReport
  };
}

module.exports = { createSemanticAnalyticsRoutes, assertCanSeeSchool };

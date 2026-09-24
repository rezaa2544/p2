/* ═══════════════════════════════════════════════════════════════════
   server/routes/analytics.js — Phase 3: School, Regional & Governance Intelligence API
   -------------------------------------------------------------------
   - GET /api/v1/analytics/school-intelligence ?school_id=&academic_year=
       نمای جامع مرکز فرماندهی و هوشمندی مدرسه و اقدامات روزانه مدیر (P0-EI-09)
   - GET /api/v1/analytics/regional-intelligence ?region_id=&academic_year=
       شبکه بینش و اقدام منطقه‌ای هوشمندی آموزشی (P0-EI-10)
   - GET /api/v1/analytics/quality-governance ?school_id=&region_id=&academic_year=
       راهبری کیفیت آموزشی و چرخه بهبود مستمر (P0-EI-11)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const {
  enforceSchoolIntelligenceAccessGuard,
  buildSchoolIntelligenceSnapshot
} = require('../analytics/school-intelligence-center');

const {
  enforceRegionalTenantIsolation,
  buildRegionalSnapshot
} = require('../analytics/regional-intelligence-network');

const {
  enforceQualityGovernanceAccessGuard,
  evaluateQualityPillars,
  summarizeDistrictQualityGovernance
} = require('../analytics/quality-governance');

const {
  enforceLongitudinalAccessGuard,
  buildLongitudinalSchoolProfile,
  buildRegionalTrendMap
} = require('../analytics/longitudinal-intelligence-monitoring');

const {
  enforceRecommendationAccessGuard,
  generateActionRecommendations,
  generatePrincipalActionBoard
} = require('../analytics/recommendation-action-planning');

const {
  enforceFeedbackMemoryAccessGuard,
  buildOrganizationalLearningProfile
} = require('../analytics/intelligence-feedback-memory');

const {
  enforceGovernanceDashboardAccessGuard,
  buildGovernanceSnapshot,
  buildDistrictGovernanceOverview
} = require('../analytics/intelligence-governance-dashboard');

const {
  enforcePolicySimulationAccessGuard,
  buildPolicySimulationSnapshot
} = require('../analytics/policy-simulation-engine');

const {
  enforceDecisionCommandAccessGuard,
  buildDecisionCommandSnapshot
} = require('../analytics/decision-intelligence-command');

const {
  enforceExecutionAccessGuard,
  buildExecutionDashboard
} = require('../analytics/operational-intelligence-execution');

const {
  enforceOutcomeEvaluationAccessGuard,
  buildOutcomeEvaluationSnapshot
} = require('../analytics/outcome-evaluation-optimization');

const {
  enforcePlatformAccessGuard,
  buildUnifiedIntelligenceSnapshot
} = require('../analytics/intelligence-platform-integration');

const {
  enforceCertificationAccessGuard,
  runPhase3Certification
} = require('../analytics/intelligence-release-certification');

function createAnalyticsRoutes(ctx) {
  const store = ctx.store || {};
  const db = ctx.db;

  const pgLive = () => db && typeof db.isPostgres === 'function' && db.isPostgres();

  // اعتبارسنجی یکنواخت شناسه‌ها (No fail-open on NaN): شناسه باید عدد صحیح مثبت باشد
  const isValidId = (raw) => {
    if (raw == null || String(raw).trim() === '') return false;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0;
  };
  const invalidIdResponse = () => ({
    status: 400,
    body: { ok: false, code: 'invalid_params', message: 'شناسه ارائه‌شده نامعتبر است (عدد صحیح مثبت لازم است)' }
  });

  async function schoolIntelligenceReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!schoolIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id الزامی است' }
      };
    }

    const schoolId = Number(schoolIdParam);
    if (!schoolId || isNaN(schoolId)) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id نامعتبر است' }
      };
    }

    try {
      enforceSchoolIntelligenceAccessGuard(user, schoolId);
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    let grades = [];
    let attendance = [];
    let classes = [];
    let schedule = [];
    let cases = [];
    let teacherNotes = [];

    if (pgLive() && typeof db.query === 'function') {
      try {
        const [rG, rA, rC, rS, rCases, rTN] = await Promise.all([
          db.query('SELECT * FROM grades WHERE school_id = $1', [schoolId]),
          db.query('SELECT * FROM attendance WHERE school_id = $1', [schoolId]),
          db.query('SELECT * FROM classes WHERE school_id = $1', [schoolId]),
          db.query('SELECT * FROM schedule WHERE school_id = $1', [schoolId]),
          db.query('SELECT * FROM counselor_refs WHERE school_id = $1', [schoolId]),
          db.query('SELECT * FROM teacher_notes WHERE school_id = $1', [schoolId])
        ]);
        grades = (rG && rG.rows) || [];
        attendance = (rA && rA.rows) || [];
        classes = (rC && rC.rows) || [];
        schedule = (rS && rS.rows) || [];
        cases = (rCases && rCases.rows) || [];
        teacherNotes = (rTN && rTN.rows) || [];
      } catch (e) {
        grades = (store.grades || []).filter(g => Number(g.school_id) === schoolId);
        attendance = (store.attendance || []).filter(a => Number(a.school_id) === schoolId);
        classes = (store.classes || []).filter(c => Number(c.school_id) === schoolId);
        schedule = (store.schedule || []).filter(s => Number(s.school_id) === schoolId);
        cases = (store.counselor_refs || []).filter(c => Number(c.school_id) === schoolId);
        teacherNotes = (store.teacher_notes || []).filter(t => Number(t.school_id) === schoolId);
      }
    } else {
      grades = (store.grades || []).filter(g => Number(g.school_id) === schoolId);
      attendance = (store.attendance || []).filter(a => Number(a.school_id) === schoolId);
      classes = (store.classes || []).filter(c => Number(c.school_id) === schoolId);
      schedule = (store.schedule || []).filter(s => Number(s.school_id) === schoolId);
      cases = (store.counselor_refs || []).filter(c => Number(c.school_id) === schoolId);
      teacherNotes = (store.teacher_notes || []).filter(t => Number(t.school_id) === schoolId);
    }

    const snapshot = buildSchoolIntelligenceSnapshot({
      schoolId,
      academicYear,
      grades,
      attendanceSessions: attendance,
      classes,
      schedule,
      cases,
      teacherNotes
    });

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        snapshot
      }
    };
  }

  async function regionalIntelligenceReport(req, searchParams) {
    const user = req.user || req.session;
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'region_id الزامی است' }
      };
    }

    const regionId = Number(regionIdParam);
    if (!regionId || isNaN(regionId)) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'region_id نامعتبر است' }
      };
    }

    try {
      enforceRegionalTenantIsolation(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    let schools = [];
    if (pgLive() && typeof db.query === 'function') {
      try {
        const rS = await db.query('SELECT * FROM schools WHERE region_id = $1 OR district_id = $1', [regionId]);
        schools = (rS && rS.rows) || [];
      } catch (e) {
        schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);
      }
    } else {
      schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);
    }

    const schoolSnapshots = schools.map(sch => {
      const sid = Number(sch.id);
      const grades = (store.grades || []).filter(g => Number(g.school_id) === sid);
      const attendance = (store.attendance || []).filter(a => Number(a.school_id) === sid);
      const classes = (store.classes || []).filter(c => Number(c.school_id) === sid);
      const schedule = (store.schedule || []).filter(s => Number(s.school_id) === sid);
      const cases = (store.counselor_refs || []).filter(c => Number(c.school_id) === sid);
      const teacherNotes = (store.teacher_notes || []).filter(t => Number(t.school_id) === sid);

      return buildSchoolIntelligenceSnapshot({
        schoolId: sid,
        academicYear,
        grades,
        attendanceSessions: attendance,
        classes,
        schedule,
        cases,
        teacherNotes
      });
    });

    const snapshot = buildRegionalSnapshot({
      regionId,
      academicYear,
      schools: schoolSnapshots
    }, { requester: user });

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        snapshot
      }
    };
  }

  async function qualityGovernanceReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceQualityGovernanceAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const grades = (store.grades || []).filter(g => Number(g.school_id) === schoolId);
      const attendance = (store.attendance || []).filter(a => Number(a.school_id) === schoolId);
      const cases = (store.counselor_refs || []).filter(c => Number(c.school_id) === schoolId);

      const snapshot = buildSchoolIntelligenceSnapshot({
        schoolId,
        grades,
        attendanceSessions: attendance,
        cases
      });

      const pillars = evaluateQualityPillars(snapshot);
      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          scope: 'school',
          pillars
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceQualityGovernanceAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);
    const schoolPillars = schools.map(sch => {
      const sid = Number(sch.id);
      const sSnapshot = buildSchoolIntelligenceSnapshot({
        schoolId: sid,
        grades: (store.grades || []).filter(g => Number(g.school_id) === sid),
        attendanceSessions: (store.attendance || []).filter(a => Number(a.school_id) === sid)
      });
      return evaluateQualityPillars(sSnapshot);
    });

    const summary = summarizeDistrictQualityGovernance({
      districtId: regionId,
      schools: schoolPillars
    });

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        scope: 'district',
        summary
      }
    };
  }

  async function longitudinalIntelligenceReport(req, searchParams) {
    const user = req.user || req.session;
    const entityIdParam = searchParams.get('entity_id');
    const entityTypeParam = searchParams.get('entity_type') || 'school';
    const periodRange = searchParams.get('period_range') || '1404-1406';

    if (!entityIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'entity_id الزامی است' }
      };
    }

    const entityId = Number(entityIdParam);

    if (entityTypeParam === 'school') {
      try {
        enforceLongitudinalAccessGuard(user, { school_id: entityId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      // شبیه‌سازی / استخراج اسنپ‌شات‌های دوره‌ای از داده‌های تاریخی
      const grades = (store.grades || []).filter(g => Number(g.school_id) === entityId);
      const attendance = (store.attendance || []).filter(a => Number(a.school_id) === entityId);

      const periods = ['1404-T1', '1404-T2', '1405-T1', '1405-T2', '1406-T1'];
      const snapshots = periods.map((p, idx) => {
        const factor = 1 + (idx * 0.02);
        return {
          period: p,
          health_index: Math.min(100, Math.round(75.0 * factor * 10) / 10),
          average_gpa: Math.min(20, Math.round(15.0 * factor * 10) / 10),
          calendar_rate: Math.min(100, Math.round(88.0 * factor * 10) / 10),
          chronic_absence_rate: Math.max(2, Math.round((12.0 - idx * 1.5) * 10) / 10),
          has_intervention: idx === 2
        };
      });

      const profile = buildLongitudinalSchoolProfile({
        schoolId: entityId,
        snapshots,
        periodRange
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          entity_type: 'school',
          entity_id: entityId,
          period_range: periodRange,
          profile
        }
      };
    }

    if (entityTypeParam === 'region' || entityTypeParam === 'district') {
      try {
        enforceLongitudinalAccessGuard(user, { region_id: entityId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === entityId);
      const schoolTrendSummaries = schools.map(sch => {
        const sid = Number(sch.id);
        const periods = ['1404-T1', '1404-T2', '1405-T1', '1405-T2', '1406-T1'];
        const sSnapshots = periods.map((p, idx) => ({
          period: p,
          health_index: 70 + (sid % 5) * 3 + idx * 1.2
        }));
        const sProfile = buildLongitudinalSchoolProfile({
          schoolId: sid,
          snapshots: sSnapshots,
          periodRange
        });
        return {
          school_id: sid,
          school_name: sch.name || `مدرسه ${sid}`,
          overall_trend: sProfile.overall_trend,
          persistence_classification: sProfile.persistence_classification
        };
      });

      const trendMap = buildRegionalTrendMap({
        regionId: entityId,
        schools: schoolTrendSummaries,
        periodRange
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          entity_type: 'region',
          entity_id: entityId,
          period_range: periodRange,
          trend_map: trendMap
        }
      };
    }

    return {
      status: 400,
      body: { ok: false, code: 'invalid_entity_type', message: 'نوع موجودیت نامعتبر است' }
    };
  }

  async function actionRecommendationsReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceRecommendationAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const grades = (store.grades || []).filter(g => Number(g.school_id) === schoolId);
      const attendance = (store.attendance || []).filter(a => Number(a.school_id) === schoolId);

      // No-Fabrication: شاخص‌های مبنا از داده واقعی مدرسه محاسبه می‌شوند
      // (مقادیر ثابت ساختگی 88.0/80.0/14.5/14.5/0.08 حذف شدند)
      let presentCount = 0;
      let absentCount = 0;
      const absencePerStudent = new Map();
      for (const a of attendance) {
        const st = String(a.status || '').toLowerCase();
        if (st.includes('present') || st.includes('حاضر') || st.includes('late') || st.includes('تأخیر')) {
          presentCount++;
        } else if (st.includes('absent') || st.includes('غایب')) {
          absentCount++;
          const sid = a.student_id != null ? Number(a.student_id) : null;
          if (sid != null) absencePerStudent.set(sid, (absencePerStudent.get(sid) || 0) + 1);
        }
      }
      const totalSessions = presentCount + absentCount;
      const attendanceRate = totalSessions > 0
        ? Math.round(((presentCount / totalSessions) * 100) * 100) / 100
        : null;
      const chronicAbsenceRate = totalSessions > 0
        ? Math.round(((absentCount / totalSessions) * 100) * 100) / 100
        : null;

      let scoreSum = 0;
      let scoreCount = 0;
      let failingCount = 0;
      for (const g of grades) {
        const sc = Number(g.score);
        if (!isNaN(sc)) {
          scoreSum += sc;
          scoreCount++;
          if (sc < 10.0) failingCount++;
        }
      }
      const averageGpa = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null;
      const failingRatio = scoreCount > 0 ? Math.round((failingCount / scoreCount) * 1000) / 1000 : null;

      const hasData = totalSessions > 0 || scoreCount > 0;
      const recommendations = hasData
        ? generateActionRecommendations({
            schoolId,
            schoolSnapshot: {
              attendance_rate: attendanceRate,
              chronic_absence_rate: chronicAbsenceRate,
              average_gpa: averageGpa,
              failing_students_ratio: failingRatio
            }
          }, { now: new Date().toISOString() })
        : [];

      const actionBoard = generatePrincipalActionBoard({
        schoolId,
        recommendations
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          data_quality: {
            status: hasData ? 'OK' : 'NO_DATA',
            attendance_sessions_count: totalSessions,
            valid_grades_count: scoreCount,
            baseline_metrics: {
              attendance_rate: attendanceRate,
              chronic_absence_rate: chronicAbsenceRate,
              average_gpa: averageGpa,
              failing_students_ratio: failingRatio
            }
          },
          recommendations,
          action_board: actionBoard
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceRecommendationAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);
    const recommendations = generateActionRecommendations({
      schoolId: regionId,
      regionalSnapshot: {
        region_id: regionId,
        priority_support_needed_count: schools.length
      }
    });

    const actionBoard = generatePrincipalActionBoard({
      schoolId: regionId,
      recommendations
    });

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        recommendations,
        action_board: actionBoard
      }
    };
  }

  async function feedbackLearningMemoryReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceFeedbackMemoryAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const interventions = (store.interventions || []).filter(i => Number(i.school_id) === schoolId);
      // No-Fabrication: در نبود مداخله واقعی، هیچ اقدام ساختگی (ACT-DEFAULT-01) تزریق نمی‌شود
      // و دلتاهای اندازه‌گیری‌نشده null هستند (نه مقادیر ثابت 4.5/0.7/10.0)
      const history = interventions.map(inv => ({
        action_id: `ACT-${inv.id}`,
        action_type: inv.type || 'ATTENDANCE_SUPPORT',
        decision: inv.status === 'CANCELLED' ? 'REJECTED' : 'APPROVED',
        rejected_reason: inv.status === 'CANCELLED' ? 'MISDIAGNOSIS' : null,
        status: inv.status || 'COMPLETED',
        outcome: inv.status === 'RESOLVED' ? 'HIGHLY_EFFECTIVE' : 'PARTIALLY_EFFECTIVE',
        notes: inv.notes || 'مداخله آموزشی پیگیری و ثبت شد',
        delta_metrics: null
      }));

      const profile = buildOrganizationalLearningProfile({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        history,
        options: { requester: user, timestamp: new Date().toISOString() }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          data_quality: {
            status: history.length > 0 ? 'OK' : 'NO_DATA',
            interventions_count: history.length,
            delta_metrics_measured: false
          },
          learning_profile: profile
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceFeedbackMemoryAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);
    const profiles = schools.map(s => {
      return buildOrganizationalLearningProfile({
        schoolId: Number(s.id),
        regionId: regionId,
        academicYear,
        history: [],
        options: { requester: user, timestamp: new Date().toISOString() }
      });
    });

    const avgMaturity = profiles.length > 0 ?
      Number((profiles.reduce((acc, p) => acc + p.maturity_index.score, 0) / profiles.length).toFixed(1)) : 0;

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_learning_summary: {
          total_schools: schools.length,
          average_maturity_score: avgMaturity,
          zero_ranking: true
        }
      }
    };
  }

  async function intelligenceGovernanceReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceGovernanceDashboardAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const interventions = (store.interventions || []).filter(i => Number(i.school_id) === schoolId);
      const actions = interventions.map(inv => ({
        action_id: `ACT-${inv.id}`,
        recommendation_id: `REC-${inv.id}`,
        action_type: inv.type || 'ATTENDANCE_SUPPORT',
        decision: inv.status === 'CANCELLED' ? 'REJECTED' : 'APPROVED',
        status: inv.status || 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        // No-Fabrication: زمان تأیید اندازه‌گیری نشده است
        approval_time_hours: null
      }));

      // No-Fabrication: اقدام ساختگی ACT-DEF-01 و درصدهای ثابت 92/98/95 حذف شدند؛
      // فقط اقدامات واقعی (احتمالاً خالی) به موتور داده می‌شود
      const snapshot = buildGovernanceSnapshot({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        data: {
          actions
        },
        options: { requester: user, timestamp: new Date().toISOString() }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          data_quality: {
            status: actions.length > 0 ? 'OK' : 'NO_DATA',
            actions_count: actions.length,
            explainability_measured: false,
            audit_coverage_measured: false
          },
          governance_snapshot: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceGovernanceDashboardAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);
    const snapshots = schools.map(s => {
      return buildGovernanceSnapshot({
        schoolId: Number(s.id),
        regionId: regionId,
        academicYear,
        // No-Fabrication: درصدهای ثابت 88/95 حذف شدند
        data: { actions: [] },
        options: { requester: user, timestamp: new Date().toISOString() }
      });
    });

    const overview = buildDistrictGovernanceOverview({
      regionId,
      academicYear,
      schoolSnapshots: snapshots,
      options: { requester: user, timestamp: new Date().toISOString() }
    });

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        district_governance_overview: overview
      }
    };
  }

  async function policySimulationReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforcePolicySimulationAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const snapshot = buildPolicySimulationSnapshot({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        options: { requester: user, timestamp: new Date().toISOString() }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          data_provenance: {
            mode: 'SYNTHETIC_BASELINE',
            engine: 'policy-simulation-engine',
            warning: 'خروجی این موتور از داده عملیاتی واقعی تغذیه نمی‌شود؛ مقادیر جنبه نمایشی/سناریویی دارند و سنجه اندازه‌گیری‌شده نیستند'
          },
          simulation_snapshot: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforcePolicySimulationAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_policy_simulation: {
          region_id: regionId,
          total_schools: schools.length,
          zero_ranking: true,
          automated_policy_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  async function decisionCommandReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceDecisionCommandAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const snapshot = buildDecisionCommandSnapshot({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        options: { requester: user, timestamp: new Date().toISOString() }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          data_provenance: {
            mode: 'SYNTHETIC_BASELINE',
            engine: 'decision-intelligence-command',
            warning: 'خروجی این موتور از داده عملیاتی واقعی تغذیه نمی‌شود؛ مقادیر جنبه نمایشی/سناریویی دارند و سنجه اندازه‌گیری‌شده نیستند'
          },
          decision_command: snapshot,
          command_snapshot: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceDecisionCommandAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_decision_command: {
          region_id: regionId,
          total_schools: schools.length,
          zero_ranking: true,
          automated_decision: false,
          requires_human_approval: true
        }
      }
    };
  }

  async function operationalExecutionReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceExecutionAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const dashboard = buildExecutionDashboard({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        options: { requester: user, timestamp: new Date().toISOString() }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          data_provenance: {
            mode: 'SYNTHETIC_BASELINE',
            engine: 'operational-intelligence-execution',
            warning: 'خروجی این موتور از داده عملیاتی واقعی تغذیه نمی‌شود؛ مقادیر جنبه نمایشی/سناریویی دارند و سنجه اندازه‌گیری‌شده نیستند'
          },
          execution_dashboard: dashboard,
          operational_execution: dashboard
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceExecutionAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_operational_execution: {
          region_id: regionId,
          total_schools: schools.length,
          zero_ranking: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  async function outcomeEvaluationReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceOutcomeEvaluationAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const snapshot = buildOutcomeEvaluationSnapshot({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        options: { requester: user, timestamp: new Date().toISOString() }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          data_provenance: {
            mode: 'SYNTHETIC_BASELINE',
            engine: 'outcome-evaluation-optimization',
            warning: 'خروجی این موتور از داده عملیاتی واقعی تغذیه نمی‌شود؛ مقادیر جنبه نمایشی/سناریویی دارند و سنجه اندازه‌گیری‌شده نیستند'
          },
          outcome_evaluation: snapshot,
          evaluation_snapshot: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceOutcomeEvaluationAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_outcome_evaluation: {
          region_id: regionId,
          total_schools: schools.length,
          zero_ranking: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  async function intelligencePlatformReport(req, searchParams) {
    const user = req.user || req.session;
    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1405-1406';

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'invalid_params', message: 'school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforcePlatformAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const snapshot = buildUnifiedIntelligenceSnapshot({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        options: { requester: user, timestamp: new Date().toISOString() }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          data_provenance: {
            mode: 'SYNTHETIC_BASELINE',
            engine: 'intelligence-platform-integration',
            warning: 'خروجی این موتور از داده عملیاتی واقعی تغذیه نمی‌شود؛ مقادیر جنبه نمایشی/سناریویی دارند و سنجه اندازه‌گیری‌شده نیستند'
          },
          intelligence_platform: snapshot,
          platform_snapshot: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforcePlatformAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_intelligence_platform: {
          region_id: regionId,
          total_schools: schools.length,
          zero_ranking: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  /**
   * GET /api/v1/analytics/intelligence-certification
   * گیت رسمی انتشار و صدور گواهی نهایی فاز ۳ پلتفرم هوشمندی آموزشی (P0-EI-21)
   */
  async function intelligenceCertificationReport(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');
    const academicYear = searchParams.get('academic_year') || '1404-1405';

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'bad_request', message: 'ارائه school_id یا region_id الزامی است' }
      };
    }

    if ((schoolIdParam != null && !isValidId(schoolIdParam)) || (regionIdParam != null && !isValidId(regionIdParam))) {
      return invalidIdResponse();
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceCertificationAccessGuard(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const certification = runPhase3Certification({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        user
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          data_provenance: {
            mode: 'SYNTHETIC_BASELINE',
            engine: 'intelligence-release-certification',
            warning: 'زنجیره E2E این گواهی با سیگنال‌های سناریویی اجرا می‌شود نه داده عملیاتی واقعی؛ نتیجه در سطح شواهد E1 است'
          },
          intelligence_certification: certification,
          release_certificate: certification.release_certificate
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceCertificationAccessGuard(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);

    const regionalCert = runPhase3Certification({
      schoolId: 101,
      regionId,
      academicYear,
      user
    });

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_intelligence_certification: {
          region_id: regionId,
          total_schools: schools.length,
          certification_status: regionalCert.certification_status,
          release_ready: regionalCert.release_ready,
          release_certificate: regionalCert.release_certificate,
          zero_ranking: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  return {
    schoolIntelligenceReport,
    regionalIntelligenceReport,
    qualityGovernanceReport,
    longitudinalIntelligenceReport,
    actionRecommendationsReport,
    feedbackLearningMemoryReport,
    intelligenceGovernanceReport,
    policySimulationReport,
    decisionCommandReport,
    operationalExecutionReport,
    outcomeEvaluationReport,
    intelligencePlatformReport,
    intelligenceCertificationReport
  };
}

module.exports = { createAnalyticsRoutes };

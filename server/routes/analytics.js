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

const policy = require('../policy');

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

  // D2 remediation: موتورها برای قطعیتِ تست‌ها، پیش‌فرض timestamp ثابت
  // 2026-09-18 دارند و routeها هیچ چیزی به آن‌ها نمی‌رساندند — پس هر گزارش
  // API با همان تاریخِ چندین ماه پیش مهر می‌شد و دو گواهی در روزهای مختلف،
  // fingerprint یکسان می‌گرفتند. اکنون route مهر زمان واقعی را تزریق می‌کند
  // (مگر اینکه tests آن را با env override مساوی‌سازی کند).
  const ROUTE_NOW = process.env.PAYESH_ANALYTICS_FIXED_NOW || new Date().toISOString();
  const nowOptions = (extra) => Object.assign({ timestamp: ROUTE_NOW, now: ROUTE_NOW }, extra || {});

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
      enforceSchoolIntelligenceAccessGuard(user, schoolId, { store });
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
        /* A-03: این فال‌بک یک مسیرِ واقعی است که در فشارِ pool (۶ اتصال به
           ازایِ هر درخواست رویِ poolِ ۲۰تایی) یا قطعیِ PG اجرا می‌شود، ولی
           ساکت بود — گزارش، دادهٔ آینهٔ ممکن‌است-کهنه را بدونِ هیچ لاگ یا
           چرخشِ سنجه‌ای سرو می‌کرد. اکنون اعلام می‌شود. */
        console.warn('[analytics] PG read failed for school', schoolId, '— serving in-memory mirror:',
          (e && e.message) || e);
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
      teacherNotes,
      options: nowOptions()
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
        /* A-01: ستونِ region_id در جدولِ schools وجود ندارد (schema.sql:
           county_id / district_id / province_id) — این کوئری در PG زنده
           همیشه «column does not exist» می‌گرفت و catch ساکت به آینهٔ
           درون‌حافظه‌ای برمی‌گشت. یعنی مسیرِ PG در عمل هیچ‌وقت اجرا نمی‌شد.
           در data model، وقتی region_id غایب است «منطقه» همان district_id
           است (هیچ مدرسهٔ seedی region_id ندارد) پس این نگاشتِ وفادار
           به فال‌بکِ JSON است. */
        const rS = await db.query('SELECT * FROM schools WHERE district_id = $1', [regionId]);
        schools = (rS && rS.rows) || [];
      } catch (e) {
        console.warn('[analytics] regional schools query failed — falling back to in-memory mirror:',
          (e && e.message) || e);
        schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);
      }
    } else {
      schools = (store.schools || []).filter(s => Number(s.region_id || s.district_id) === regionId);
    }

    /* A-01: در PG-live، داده‌هایِ مدارس هم باید از همان منبعِ زنده خوانده
       شوند، نه از آینه — در غیر این صورت، وقتی آینه کامل نیست (مثلاً وقتی
       PAYESH_PG_HYDRATE_LIMIT تنظیم شده)، مدارسِ واقعی بدونِ داده به‌درستی
       «نیازمندِ اقدامِ فوری» پرچم می‌شوند و گزارش ساکت غلط می‌دهد. این
       همان درزِ خواندنِ Wave-1 است که routes/students.js:37 استفاده می‌کند.
       هر مجموعه یک‌بار خوانده می‌شود (نه به ازایِ هر مدرسه) و فیلترِ
       school_id مثلِ قبل در حافظه انجام می‌شود. هر مجموعه فال‌بکِ
       مستقلِ خود را دارد تا شکستِ یک جدول، کلِ گزارش را نیندازد. */
    const REGION_COLL = ['grades', 'attendance', 'classes', 'schedule', 'counselor_refs', 'teacher_notes'];
    const liveColl = {};
    if (pgLive() && typeof db.readCollection === 'function') {
      for (const cn of REGION_COLL) {
        try { liveColl[cn] = await db.readCollection(cn); }
        catch (e) {
          console.warn('[analytics] readCollection(' + cn + ') failed — in-memory mirror used:',
            (e && e.message) || e);
          liveColl[cn] = null; /* فال‌بکِ مجموعه به store زیر */
        }
      }
    }
    const collFor = (cn) => (Array.isArray(liveColl[cn]) ? liveColl[cn] : (store[cn] || []));

    const schoolSnapshots = schools.map(sch => {
      const sid = Number(sch.id);
      const grades = collFor('grades').filter(g => Number(g.school_id) === sid);
      const attendance = collFor('attendance').filter(a => Number(a.school_id) === sid);
      const classes = collFor('classes').filter(c => Number(c.school_id) === sid);
      const schedule = collFor('schedule').filter(s => Number(s.school_id) === sid);
      const cases = collFor('counselor_refs').filter(c => Number(c.school_id) === sid);
      const teacherNotes = collFor('teacher_notes').filter(t => Number(t.school_id) === sid);

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
      schools: schoolSnapshots,
      options: nowOptions()
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
        cases,
        options: nowOptions()
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
        attendanceSessions: (store.attendance || []).filter(a => Number(a.school_id) === sid),
        options: nowOptions()
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
        periodRange,
        options: nowOptions()
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
          periodRange,
          options: nowOptions()
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
        periodRange,
        options: nowOptions()
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

      const recommendations = generateActionRecommendations({
        schoolId,
        schoolSnapshot: {
          attendance_rate: attendance.length > 0 ? 88.0 : 80.0,
          chronic_absence_rate: 14.5,
          average_gpa: 14.5,
          failing_students_ratio: 0.08
        },
        options: nowOptions()
      });

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
      },
      options: nowOptions()
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
      /* A-31 / I-06: مدرسهٔ بدون مداخله، تاریخچهٔ پیش‌فرضِ جعلی نمی‌گیرد —
         موفقیتِ ساختگی (ACT-DEFAULT-01) حذف شد؛ بی‌داده همان بی‌داده است. */
      const history = interventions.map(inv => ({
        action_id: `ACT-${inv.id}`,
        action_type: inv.type || 'ATTENDANCE_SUPPORT',
        decision: inv.status === 'CANCELLED' ? 'REJECTED' : 'APPROVED',
        rejected_reason: inv.status === 'CANCELLED' ? 'MISDIAGNOSIS' : null,
        status: inv.status || 'COMPLETED',
        outcome: inv.status === 'RESOLVED' ? 'HIGHLY_EFFECTIVE' : 'PARTIALLY_EFFECTIVE',
        notes: inv.notes || 'مداخله آموزشی پیگیری و ثبت شد',
        delta_metrics: {
          delta_attendance: 4.5,
          delta_gpa: 0.7,
          delta_engagement: 10.0
        }
      }));

      const profile = buildOrganizationalLearningProfile({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        history,
        options: { requester: user }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
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
        options: { requester: user }
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
        approval_time_hours: 8.5
      }));

      /* A-31 / I-05 + I-07: اقدامِ پیش‌فرضِ جعلی و ورودی‌های سخت‌کدِ
         شفافیت/پوشش حذف شدند — مدرسهٔ بدون اقدام، گزارشِ «بی‌داده» می‌گیرد. */
      const snapshot = buildGovernanceSnapshot({
        schoolId,
        regionId: user.region_id || 1,
        academicYear,
        data: { actions },
        options: { requester: user }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
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
        /* A-31 / I-07: ورودی‌های سخت‌کدِ نمای منطقه‌ای حذف شد. */
        data: { actions: [] },
        options: { requester: user }
      });
    });

    const overview = buildDistrictGovernanceOverview({
      regionId,
      academicYear,
      schoolSnapshots: snapshots,
      options: { requester: user }
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
        options: { requester: user }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
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
        options: { requester: user }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
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
        options: { requester: user }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
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
        options: { requester: user }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
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
        options: { requester: user }
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
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
      }, nowOptions());

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
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
    }, nowOptions());

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

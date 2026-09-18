/* ═══════════════════════════════════════════════════════════════════
   server/routes/analytics.js — Phase 3: School & Regional Intelligence API
   -------------------------------------------------------------------
   - GET /api/v1/analytics/school-intelligence ?school_id=&academic_year=
       نمای جامع مرکز فرماندهی و هوشمندی مدرسه و اقدامات روزانه مدیر (P0-EI-09)
   - GET /api/v1/analytics/regional-intelligence ?region_id=&academic_year=
       شبکه بینش و اقدام منطقه‌ای هوشمندی آموزشی (P0-EI-10)
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

function createAnalyticsRoutes(ctx) {
  const store = ctx.store || {};
  const db = ctx.db;

  const pgLive = () => db && typeof db.isPostgres === 'function' && db.isPostgres();

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

    // ساخت شناسنامه‌های مدرسه‌ای برای مدارس منطقه
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

  return { schoolIntelligenceReport, regionalIntelligenceReport };
}

module.exports = { createAnalyticsRoutes };

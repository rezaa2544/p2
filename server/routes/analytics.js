/* ═══════════════════════════════════════════════════════════════════
   server/routes/analytics.js — Phase 3: School Intelligence API (P0-EI-09)
   -------------------------------------------------------------------
   - GET /api/v1/analytics/school-intelligence ?school_id=&academic_year=
       نمای جامع مرکز فرماندهی و هوشمندی مدرسه و اقدامات روزانه مدیر
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const {
  enforceSchoolIntelligenceAccessGuard,
  buildSchoolIntelligenceSnapshot
} = require('../analytics/school-intelligence-center');

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

  return { schoolIntelligenceReport };
}

module.exports = { createAnalyticsRoutes };

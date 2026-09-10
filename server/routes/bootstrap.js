/* ═══════════════════════════════════════════════════════════════════
   server/routes/bootstrap.js — Scoped Initial Bootstrap API
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - GET /api/v1/bootstrap
   - Returns role-scoped minimal dataset for instant client startup.
   - Drastically reduces initial load time and network payload.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { projectUserByRole } = require('../middleware/projection');
const cache = require('../cache');

function createBootstrapRoute(ctx) {
  const store = ctx.store;
  const db = ctx.db; /* Wave 1 (chat2): unified read seam — PG when active, JSON store otherwise */

  /**
   * Wave 1: single read seam for every collection this route needs. When the
   * unified db layer is wired (index.js passes db) it serves rows through
   * db.readCollection (PostgreSQL when active; the JSON store in fallback —
   * identical rows). When db is absent (isolated tests) it reads store.
   */
  async function readCol(c) {
    if (db && typeof db.readCollection === 'function') {
      const rows = await db.readCollection(c);
      return Array.isArray(rows) ? rows : [];
    }
    return (store && Array.isArray(store[c])) ? store[c] : [];
  }

  async function getBootstrapData(req) {
    const user = req.user;
    if (!user) {
      return { status: 401, body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' } };
    }

    // Check Redis / L1 Cache
    const cachedData = await cache.getBootstrapCache(user.id);
    if (cachedData) {
      return { status: 200, body: cachedData, cached: true };
    }

    /* Wave 11 — Single-flight (stampede protection): N درخواستِ هم‌زمانِ
       cache-miss برایِ یک کاربر = یک build و یک نوشتِ کش، نه N خوانش. */
    const responseBody = await cache.withSingleFlight('bootstrap:' + user.id, async () => {
      const schoolId = user.school_id;

      /* Wave 1: load every collection this route may touch through the unified
         read seam (parallel in PG mode). In memory fallback each readCol returns
         the same store[c] array the code previously read directly — identical. */
      const [schools, notifications, classes, bell_schedules, subjects,
        sync_conflicts, schedule, enrollments, parent_links, users] = await Promise.all([
        readCol('schools'),
        readCol('notifications'),
        readCol('classes'),
        readCol('bell_schedules'),
        readCol('subjects'),
        readCol('sync_conflicts'),
        readCol('schedule'),
        readCol('enrollments'),
        readCol('parent_links'),
        readCol('users')
      ]);

      const school = schoolId ? schools.find(s => s.id === schoolId) : null;
      const nowIso = new Date().toISOString();

      const myNotifications = notifications.filter(n => n.user_id === user.id);
      const unreadNotificationsCount = myNotifications.filter(n => !n.read).length;

      const baseResponse = {
        ok: true,
        server_time: nowIso,
        user: projectUserByRole(user, user.role, true),
        school: school ? { id: school.id, name: school.name, type: school.type, capabilities: school.capabilities } : null,
        unread_notifications: unreadNotificationsCount
      };

      let responseBody = baseResponse;

      // ── MANAGER BOOTSTRAP ──────────────────────────────────────────
      if (user.role === 'manager') {
        const mgrClasses = classes.filter(c => c.school_id === schoolId);
        const mgrBells = bell_schedules.filter(b => b.school_id === schoolId);
        const openConflicts = sync_conflicts.filter(c => c.school_id === schoolId && c.status === 'open');

        responseBody = {
          ...baseResponse,
          classes: mgrClasses.map(c => ({ id: c.id, name: c.name, grade: c.grade, capacity: c.capacity, homeroom_teacher_id: c.homeroom_teacher_id })),
          bell_schedules: mgrBells,
          subjects,
          open_conflicts_count: openConflicts.length
        };
      }

      // ── TEACHER BOOTSTRAP ──────────────────────────────────────────
      else if (user.role === 'teacher') {
        const teacherClassIds = new Set();
        classes.filter(c => c.homeroom_teacher_id === user.id && c.school_id === schoolId).forEach(c => teacherClassIds.add(c.id));
        schedule.filter(s => s.teacher_id === user.id && s.school_id === schoolId).forEach(s => teacherClassIds.add(s.class_id));

        const teacherClasses = classes.filter(c => teacherClassIds.has(c.id));
        const teacherSchedule = schedule.filter(s => s.teacher_id === user.id && s.school_id === schoolId);
        const teacherBells = bell_schedules.filter(b => b.school_id === schoolId);

        responseBody = {
          ...baseResponse,
          classes: teacherClasses.map(c => ({ id: c.id, name: c.name, grade: c.grade, is_homeroom: c.homeroom_teacher_id === user.id })),
          schedule: teacherSchedule,
          bell_schedules: teacherBells
        };
      }

      // ── STUDENT BOOTSTRAP ──────────────────────────────────────────
      else if (user.role === 'student') {
        const enrollment = enrollments.find(e => e.student_id === user.id && e.school_id === schoolId);
        const studentClass = enrollment ? classes.find(c => c.id === enrollment.class_id) : null;
        const studentSchedule = studentClass ? schedule.filter(s => s.class_id === studentClass.id) : [];
        const studentBells = bell_schedules.filter(b => b.school_id === schoolId);

        responseBody = {
          ...baseResponse,
          class: studentClass ? { id: studentClass.id, name: studentClass.name, grade: studentClass.grade } : null,
          schedule: studentSchedule,
          bell_schedules: studentBells
        };
      }


      // ── PARENT BOOTSTRAP ───────────────────────────────────────────
      else if (user.role === 'parent') {
        const links = parent_links.filter(l => l.parent_id === user.id);
        const studentIds = new Set(links.map(l => l.student_id));
        const children = users.filter(u => studentIds.has(u.id)).map(c => projectUserByRole(c, user.role, true));

        responseBody = {
          ...baseResponse,
          children
        };
      }

      // ── SUPERADMIN / DEFAULT BOOTSTRAP ─────────────────────────────
      else {
        responseBody = {
          ...baseResponse,
          schools_count: schools.length,
          users_count: users.length
        };
      }

      // Cache computed response (5 min TTL)
      await cache.setBootstrapCache(user.id, responseBody, 300);
      return responseBody;
    });

    return {
      status: 200,
      body: responseBody
    };
  }

  return { getBootstrapData };
}

module.exports = { createBootstrapRoute };

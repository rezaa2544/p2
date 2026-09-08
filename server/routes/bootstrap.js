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
const { filterByScope } = require('../middleware/scope');
const cache = require('../cache');

function createBootstrapRoute(ctx) {
  const store = ctx.store;

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

    const schoolId = user.school_id;
    const school = schoolId ? (store.schools || []).find(s => s.id === schoolId) : null;
    const nowIso = new Date().toISOString();

    const notifications = (store.notifications || []).filter(n => n.user_id === user.id);
    const unreadNotificationsCount = notifications.filter(n => !n.read).length;

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
      const classes = (store.classes || []).filter(c => c.school_id === schoolId);
      const bellSchedules = (store.bell_schedules || []).filter(b => b.school_id === schoolId);
      const subjects = store.subjects || [];
      const conflicts = (store.sync_conflicts || []).filter(c => c.school_id === schoolId && c.status === 'open');

      responseBody = {
        ...baseResponse,
        classes: classes.map(c => ({ id: c.id, name: c.name, grade: c.grade, capacity: c.capacity, homeroom_teacher_id: c.homeroom_teacher_id })),
        bell_schedules: bellSchedules,
        subjects,
        open_conflicts_count: conflicts.length
      };
    }

    // ── TEACHER BOOTSTRAP ──────────────────────────────────────────
    else if (user.role === 'teacher') {
      const teacherClassIds = new Set();
      (store.classes || []).filter(c => c.homeroom_teacher_id === user.id && c.school_id === schoolId).forEach(c => teacherClassIds.add(c.id));
      (store.schedule || []).filter(s => s.teacher_id === user.id && s.school_id === schoolId).forEach(s => teacherClassIds.add(s.class_id));

      const classes = (store.classes || []).filter(c => teacherClassIds.has(c.id));
      const schedule = (store.schedule || []).filter(s => s.teacher_id === user.id && s.school_id === schoolId);
      const bellSchedules = (store.bell_schedules || []).filter(b => b.school_id === schoolId);

      responseBody = {
        ...baseResponse,
        classes: classes.map(c => ({ id: c.id, name: c.name, grade: c.grade, is_homeroom: c.homeroom_teacher_id === user.id })),
        schedule,
        bell_schedules: bellSchedules
      };
    }

    // ── STUDENT BOOTSTRAP ──────────────────────────────────────────
    else if (user.role === 'student') {
      const enrollment = (store.enrollments || []).find(e => e.student_id === user.id && e.school_id === schoolId);
      const studentClass = enrollment ? (store.classes || []).find(c => c.id === enrollment.class_id) : null;
      const schedule = studentClass ? (store.schedule || []).filter(s => s.class_id === studentClass.id) : [];
      const bellSchedules = (store.bell_schedules || []).filter(b => b.school_id === schoolId);

      responseBody = {
        ...baseResponse,
        class: studentClass ? { id: studentClass.id, name: studentClass.name, grade: studentClass.grade } : null,
        schedule,
        bell_schedules: bellSchedules
      };
    }

    // ── PARENT BOOTSTRAP ───────────────────────────────────────────
    else if (user.role === 'parent') {
      const links = (store.parent_links || []).filter(l => l.parent_id === user.id);
      const studentIds = new Set(links.map(l => l.student_id));
      const children = (store.users || []).filter(u => studentIds.has(u.id)).map(c => projectUserByRole(c, user.role, true));

      responseBody = {
        ...baseResponse,
        children
      };
    }

    // ── SUPERADMIN / DEFAULT BOOTSTRAP ─────────────────────────────
    else {
      responseBody = {
        ...baseResponse,
        schools_count: (store.schools || []).length,
        users_count: (store.users || []).length
      };
    }

    // Cache computed response (5 min TTL)
    await cache.setBootstrapCache(user.id, responseBody, 300);

    return {
      status: 200,
      body: responseBody
    };
  }

  return { getBootstrapData };
}

module.exports = { createBootstrapRoute };

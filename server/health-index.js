/* ═══════════════════════════════════════════════════════════════════
   server/health-index.js — شاخصِ سلامتِ مدرسه (G.1)
   فقط superadmin (fail-closed).
     GET /api/health-index             → شاخصِ همهٔ مدارس
     GET /api/health-index?school_id=N → شاخصِ یک مدرسه
   پاسخ: { ok, school(s), score (۰-۱۰۰؛ بالاتر = بدتر), color, factors[], reasons[] }
   الگو: atRiskList (ترکیبِ چند عامل با وزن) — ولی سمتِ سرور و قطعی.
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const WEIGHTS = { staff: 0.25, modules: 0.25, tickets: 0.30, sub: 0.20 };
const DAY = 24 * 3600 * 1000;

function clampScore(x) {
  x = Math.round(Number(x) || 0);
  return x < 0 ? 0 : x > 100 ? 100 : x;
}

/* نمرهٔ افتِ recent در برابرِ prev (هر دو شمارِ ۳۰روزه). بالاتر = بدتر. */
function dropScore(recent, prev) {
  recent = Math.max(0, Math.floor(Number(recent) || 0));
  prev = Math.max(0, Math.floor(Number(prev) || 0));
  if (prev <= 0) {
    if (recent > 0) return { score: 0, noBaseline: true };
    return { score: 50, noBaseline: true, noData: true }; /* خنثی — بدونِ مبنا */
  }
  if (recent >= prev) return { score: 0, noBaseline: false };
  return { score: clampScore(((prev - recent) * 100) / prev), noBaseline: false };
}

/* تیکتِ باز: هر تیکت ۲۵ نمره تا سقفِ ۱۰۰. */
function ticketScore(open) {
  open = Math.max(0, Math.floor(Number(open) || 0));
  return clampScore(open * 25);
}

function colorFor(score) {
  score = clampScore(score);
  if (score <= 30) return 'green';
  if (score <= 60) return 'yellow';
  return 'red';
}

const FA = n => String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/**
 * ورودی: { staffRecent, staffPrev, modRecent, modPrev, openTickets, subOverdue }
 *   subOverdue: true/false، یا null/undefined یعنی «داده‌ای نیست» (عامل حذف + بازتوزیعِ وزن).
 */
function computeHealth(input) {
  input = input || {};
  const factors = [];
  const reasons = [];

  function dropFactor(key, label, recent, prev) {
    const d = dropScore(recent, prev);
    var reason;
    if (d.noData) reason = label + ': در ۶۰ روزِ گذشته داده‌ای نیست (خنثی)';
    else if (d.noBaseline) reason = label + ': ' + FA(recent) + ' در ۳۰ روزِ اخیر، بدونِ مبنایِ مقایسه (سالم)';
    else if (d.score === 0) reason = label + ': ' + FA(recent) + ' در برابرِ ' + FA(prev) + ' (بدونِ افت)';
    else reason = label + ': ' + FA(recent) + ' در برابرِ ' + FA(prev) + ' (افتِ ' + FA(d.score) + '٪)';
    factors.push({ key, weight: WEIGHTS[key], score: d.score, reason });
    reasons.push(reason);
  }

  dropFactor('staff', 'حضورِ کادر', input.staffRecent, input.staffPrev);
  dropFactor('modules', 'استفاده از حضور/نمره', input.modRecent, input.modPrev);

  const open = Math.max(0, Math.floor(Number(input.openTickets) || 0));
  const ts = ticketScore(open);
  var treason = open === 0 ? 'تیکتِ باز: هیچ (سالم)' : 'تیکتِ باز: ' + FA(open) + ' (نمرهٔ ' + FA(ts) + ')';
  factors.push({ key: 'tickets', weight: WEIGHTS.tickets, score: ts, reason: treason });
  reasons.push(treason);

  if (input.subOverdue === true || input.subOverdue === false) {
    const ss = input.subOverdue ? 100 : 0;
    var sreason = input.subOverdue ? 'تمدیدِ اشتراک: عقب‌افتاده' : 'تمدیدِ اشتراک: به‌روز';
    factors.push({ key: 'sub', weight: WEIGHTS.sub, score: ss, reason: sreason });
    reasons.push(sreason);
  } else {
    reasons.push('اشتراکِ مدرسه: داده‌ای نیست (در وزن‌دهی لحاظ نشد)');
  }

  /* بازتوزیعِ وزن روی عامل‌هایِ موجود */
  var wSum = 0, acc = 0;
  factors.forEach(f => { wSum += f.weight; acc += f.weight * f.score; });
  const score = wSum > 0 ? clampScore(acc / wSum) : 50;
  return { score, color: colorFor(score), factors, reasons };
}

/* ── گردآوریِ شمارها از store ─────────────────────────────────────── */

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function gather(store, schoolId, nowMs) {
  store = store || {};
  const now = isoDay(nowMs != null ? nowMs : Date.now());
  const d30 = isoDay((nowMs != null ? nowMs : Date.now()) - 30 * DAY);
  const d60 = isoDay((nowMs != null ? nowMs : Date.now()) - 60 * DAY);
  function win(dateStr) {
    if (!dateStr || dateStr > now) return 0;
    if (dateStr >= d30) return 1;   /* ۳۰ روزِ اخیر */
    if (dateStr >= d60) return -1;  /* ۳۰ روزِ پیش */
    return 0;
  }
  var staffRecent = 0, staffPrev = 0, modRecent = 0, modPrev = 0;
  (store.staff_attendance || []).forEach(r => {
    if (r.school_id !== schoolId) return;
    if (r.status !== 'present' && r.status !== 'late') return;
    const w = win(r.date);
    if (w === 1) staffRecent++;
    else if (w === -1) staffPrev++;
  });
  (store.attendance || []).forEach(r => {
    if (r.school_id !== schoolId) return;
    const w = win(r.date);
    if (w === 1) modRecent++;
    else if (w === -1) modPrev++;
  });
  (store.grades || []).forEach(r => {
    if (r.school_id !== schoolId) return;
    const w = win(String(r.created_at || '').slice(0, 10));
    if (w === 1) modRecent++;
    else if (w === -1) modPrev++;
  });
  var openTickets = 0;
  (store.support_tickets || []).forEach(t => {
    if (t.school_id !== schoolId) return;
    if (t.status !== 'closed') openTickets++;
  });
  /* اشتراکِ سطحِ مدرسه در داده نیست (فقط parent_subscriptions) — null = حذفِ عامل */
  return { staffRecent, staffPrev, modRecent, modPrev, openTickets, subOverdue: null };
}

/* ── هندلرِ HTTP ─────────────────────────────────────────────────── */

function createHealthIndex(ctx) {
  const store = ctx.store;
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;
  const audit = ctx.audit;

  function one(school) {
    const h = computeHealth(gather(store, school.id));
    return { id: school.id, name: school.name, score: h.score, color: h.color, factors: h.factors, reasons: h.reasons };
  }

  async function apiHealthIndex(req, res, query) {
    const s = await sessionFrom(req);
    if (!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    if (s.role !== 'superadmin') {
      try { audit('authz_failure', { user_id: s.id, role: s.role, school_id: s.school_id, summary: 'عدم دسترسی به شاخصِ سلامت با نقش ' + s.role, reason: 'forbidden' }); } catch (e) {}
      return sendJson(res, 403, { ok: false, code: 'forbidden' });
    }
    const schools = store.schools || [];
    const q = query && query.get ? query.get('school_id') : null;
    if (q !== null && q !== undefined && String(q) !== '') {
      const sid = Math.floor(Number(q));
      const school = schools.find(x => x.id === sid);
      if (!school) return sendJson(res, 404, { ok: false, code: 'no_school' });
      const h = computeHealth(gather(store, school.id));
      return sendJson(res, 200, { ok: true, school: { id: school.id, name: school.name }, score: h.score, color: h.color, factors: h.factors, reasons: h.reasons });
    }
    return sendJson(res, 200, { ok: true, schools: schools.map(one) });
  }

  return { apiHealthIndex, computeHealth, gather, colorFor, dropScore, ticketScore };
}

module.exports = {
  createHealthIndex, computeHealth, gather, colorFor, dropScore, ticketScore, WEIGHTS
};

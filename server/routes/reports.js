/* ═══════════════════════════════════════════════════════════════════
   server/routes/reports.js — Wave 23: سیستم گزارش‌دهی پیشرفته
   -------------------------------------------------------------------
   چهار گزارش استاندارد وزارتی (فقط‌خواندنی — تجمیع روی store):
   - GET /api/v1/reports/attendance ?jy=&jm=&school_id=&class_id=
       حضور و غیاب ماهانه به تفکیک کلاس/پایه (مدیر/اداره/سوپرادمین)
   - GET /api/v1/reports/academic   ?school_id=&class_id=&term=
       پیشرفت تحصیلی: میانگین، روند، توصیه (مدیر/مربی/اداره/سوپرادمین)
   - GET /api/v1/reports/finance    ?school_id=
       گزارش مالی مدارس شهریه‌دار (شاهد/غیرانتفاعی/…): شهریه، تخفیف،
       اقساط، بورسیه (مدیر/اداره/سوپرادمین)
   - GET /api/v1/reports/teachers   ?jy=&jm=&school_id=
       عملکرد معلمان: حضور کادر + جانشینی + دوره‌های ضمن خدمت
       (مدیر/اداره/سوپرادمین)

   مهار اجاره‌ای (tenant isolation) — آینهٔ policy:
   - superadmin: همهٔ مدارس (یا فیلترشده)
   - manager/counselor: فقط مدرسهٔ خودش (school_id پارامتر باید همان باشد)
   - edu_office: فقط مدارسِ داخلِ هندسهٔ اداره (policy.officeCoversSchool)
   - بقیهٔ نقش‌ها: 403 (fail-closed)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const policy = require('../policy'); /* Wave 5 — مدلِ یکتای مجوز */

/* ── تقویم شمسی (آینهٔ src/js/22-jalali-calendar.js — بدون وابستگی) ── */
const _div = (a, b) => Math.floor(a / b);
function toJalali(gy, gm, gd) {
  const g = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979; gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + _div(gy2 + 3, 4) - _div(gy2 + 99, 100) + _div(gy2 + 399, 400) - 80 + gd + g[gm - 1];
  jy += 33 * _div(days, 12053); days %= 12053;
  jy += 4 * _div(days, 1461); days %= 1461;
  if (days > 365) { jy += _div(days - 1, 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + _div(days, 31) : 7 + _div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
/** تاریخ ISO ⇒ [jy,jm,jd] یا null (ورودی خراب = حذف از تجمیع، نه خطا) */
function isoToJ(iso) {
  if (!iso) return null;
  const m = String(iso).slice(0, 10).split('-').map(Number);
  if (!m[0] || !m[1] || !m[2]) return null;
  return toJalali(m[0], m[1], m[2]);
}

/* ── نوعِ ساختاری مدرسه (آینهٔ src/js/09-schools.js — fail-closed) ── */
const TUITION_TYPES = ['exemplary', 'non_profit', 'shahed', 'boarding', 'vocational'];
function schoolHasTuition(school) {
  if (!school) return false;
  const caps = school.capabilities || {};
  if (caps.has_tuition != null) return !!caps.has_tuition;
  return TUITION_TYPES.indexOf(school.school_type) > -1;
}

function createReportsRoutes(ctx) {
  const store = ctx.store;
  const audit = ctx.audit || (() => {});

  /* نقش‌های مجاز هر گزارش — ناظر منطقه = edu_office؛ مربی تحصیلی = counselor */
  const REPORT_ROLES = {
    attendance: ['manager', 'edu_office', 'superadmin'],
    academic: ['manager', 'counselor', 'edu_office', 'superadmin'],
    finance: ['manager', 'edu_office', 'superadmin'],
    teachers: ['manager', 'edu_office', 'superadmin']
  };

  const deny = (msg) => ({ status: 403, body: { ok: false, code: 'forbidden', message: msg || 'دسترسی به این گزارش مجاز نیست' } });
  const bad = (msg) => ({ status: 400, body: { ok: false, code: 'bad_request', message: msg } });

  /** مدارسِ در دامنهٔ کاربر (پس از فیلتر school_id اختیاری). null ⇒ 403 */
  function scopedSchools(user, schoolIdParam) {
    const role = user && user.role;
    let list = Array.isArray(store.schools) ? store.schools.filter(Boolean) : [];
    if (role === 'superadmin') {
      /* بدون مهار */
    } else if (role === 'manager' || role === 'counselor') {
      list = list.filter((s) => Number(s.id) === Number(user.school_id));
    } else if (role === 'edu_office') {
      const office = policy.userOffice(store, user);
      if (!office) return null; /* اداره‌ی بی‌هندسه ⇒ رد (fail-closed) */
      list = list.filter((s) => policy.officeCoversSchool(office, s));
    } else {
      return null;
    }
    if (schoolIdParam != null && schoolIdParam !== '') {
      const sid = Number(schoolIdParam);
      list = list.filter((s) => Number(s.id) === sid);
      /* درخواستِ مدرسهٔ خارج از دامنه ⇒ 403 نه لیستِ خالی (تمایز عمدی:
         خالی یعنی «داده نیست»، رد یعنی «حق نداری») */
      if (!list.length) return null;
    }
    return list;
  }

  function roleGate(kind, user) {
    if (!user || REPORT_ROLES[kind].indexOf(user.role) === -1) return deny();
    return null;
  }

  /** پارامترهای jy/jm — پیش‌فرض: ماهِ شمسیِ جاری سرور */
  function monthParams(urlParams) {
    const now = new Date();
    const j = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const jy = Number(urlParams.get('jy') || j[0]);
    const jm = Number(urlParams.get('jm') || j[1]);
    if (!Number.isInteger(jy) || jy < 1300 || jy > 1500) return null;
    if (!Number.isInteger(jm) || jm < 1 || jm > 12) return null;
    return { jy, jm };
  }

  /* ════ ۱) حضور و غیاب ماهانه ════════════════════════════════════ */
  async function attendanceReport(req, urlParams) {
    const user = req.user;
    const gate = roleGate('attendance', user); if (gate) return gate;
    const mp = monthParams(urlParams);
    if (!mp) return bad('سال/ماه شمسی نامعتبر است');
    const schools = scopedSchools(user, urlParams.get('school_id'));
    if (schools === null) return deny();

    const classFilter = urlParams.get('class_id') ? Number(urlParams.get('class_id')) : null;
    const schoolIds = new Set(schools.map((s) => Number(s.id)));
    const classes = (store.classes || []).filter((c) => c && schoolIds.has(Number(c.school_id))
      && (classFilter == null || Number(c.id) === classFilter));
    const classById = new Map(classes.map((c) => [Number(c.id), c]));

    /* تجمیع تک‌گذری روی attendance ماهِ خواسته‌شده */
    const STATUSES = ['present', 'absent', 'late', 'excused', 'early_exit'];
    const perClass = new Map(); /* class_id → شمارنده‌ها */
    for (const rec of (store.attendance || [])) {
      if (!rec || !schoolIds.has(Number(rec.school_id))) continue;
      const cls = classById.get(Number(rec.class_id));
      if (!cls) continue;
      const j = isoToJ(rec.date);
      if (!j || j[0] !== mp.jy || j[1] !== mp.jm) continue;
      let row = perClass.get(Number(rec.class_id));
      if (!row) { row = { present: 0, absent: 0, late: 0, excused: 0, early_exit: 0, total: 0 }; perClass.set(Number(rec.class_id), row); }
      const st = STATUSES.indexOf(rec.status) > -1 ? rec.status : 'absent';
      row[st]++; row.total++;
    }

    const studentsBySchool = new Map();
    for (const u of (store.users || [])) {
      if (u && u.role === 'student' && u.school_id != null) {
        studentsBySchool.set(Number(u.school_id), (studentsBySchool.get(Number(u.school_id)) || 0) + 1);
      }
    }

    const out = schools.map((s) => {
      const rows = classes.filter((c) => Number(c.school_id) === Number(s.id)).map((c) => {
        const agg = perClass.get(Number(c.id)) || { present: 0, absent: 0, late: 0, excused: 0, early_exit: 0, total: 0 };
        const attended = agg.present + agg.late + agg.early_exit;
        return {
          class_id: c.id, name: c.name, grade: c.grade || null,
          present: agg.present, absent: agg.absent, late: agg.late,
          excused: agg.excused, early_exit: agg.early_exit, total: agg.total,
          rate: agg.total ? Math.round((attended / agg.total) * 1000) / 10 : null
        };
      });
      const tot = rows.reduce((a, r) => {
        a.present += r.present; a.absent += r.absent; a.late += r.late;
        a.excused += r.excused; a.early_exit += r.early_exit; a.total += r.total; return a;
      }, { present: 0, absent: 0, late: 0, excused: 0, early_exit: 0, total: 0 });
      const attended = tot.present + tot.late + tot.early_exit;
      return {
        school_id: s.id, school_name: s.name,
        students: studentsBySchool.get(Number(s.id)) || 0,
        classes: rows,
        totals: Object.assign(tot, { rate: tot.total ? Math.round((attended / tot.total) * 1000) / 10 : null })
      };
    });

    audit('report_generated', { user_id: user.id, kind: 'attendance', jy: mp.jy, jm: mp.jm, schools: out.length });
    return { status: 200, body: { ok: true, kind: 'attendance', jy: mp.jy, jm: mp.jm, schools: out } };
  }

  /* ════ ۲) پیشرفت تحصیلی ═════════════════════════════════════════ */
  async function academicReport(req, urlParams) {
    const user = req.user;
    const gate = roleGate('academic', user); if (gate) return gate;
    const schools = scopedSchools(user, urlParams.get('school_id'));
    if (schools === null) return deny();

    const termFilter = urlParams.get('term') || null;
    const classFilter = urlParams.get('class_id') ? Number(urlParams.get('class_id')) : null;
    const schoolIds = new Set(schools.map((s) => Number(s.id)));
    const classes = (store.classes || []).filter((c) => c && schoolIds.has(Number(c.school_id))
      && (classFilter == null || Number(c.id) === classFilter));
    const classById = new Map(classes.map((c) => [Number(c.id), c]));

    /* نمره‌ها بر مقیاسِ ۲۰ نرمال می‌شوند (max_score متغیر است) */
    const norm = (g) => {
      const mx = Number(g.max_score) || 20;
      return mx > 0 ? (Number(g.score) / mx) * 20 : null;
    };

    const perClass = new Map(); /* class_id → {sum,count,pass} */
    const perTerm = new Map(); /* school_id → term → {sum,count} — روند */
    for (const g of (store.grades || [])) {
      if (!g || !schoolIds.has(Number(g.school_id))) continue;
      const v = norm(g);
      if (v == null || !isFinite(v)) continue;
      /* روند از همهٔ ترم‌ها می‌آید؛ جدول کلاس‌ها فقط از ترمِ فیلترشده */
      let terms = perTerm.get(Number(g.school_id));
      if (!terms) { terms = new Map(); perTerm.set(Number(g.school_id), terms); }
      const tkey = g.term || '—';
      let trow = terms.get(tkey);
      if (!trow) { trow = { sum: 0, count: 0 }; terms.set(tkey, trow); }
      trow.sum += v; trow.count++;

      if (termFilter && g.term !== termFilter) continue;
      if (!classById.has(Number(g.class_id))) continue;
      let row = perClass.get(Number(g.class_id));
      if (!row) { row = { sum: 0, count: 0, pass: 0 }; perClass.set(Number(g.class_id), row); }
      row.sum += v; row.count++;
      if (v >= 10) row.pass++;
    }

    const r1 = (n) => Math.round(n * 10) / 10;
    const out = schools.map((s) => {
      const rows = classes.filter((c) => Number(c.school_id) === Number(s.id)).map((c) => {
        const agg = perClass.get(Number(c.id)) || { sum: 0, count: 0, pass: 0 };
        return {
          class_id: c.id, name: c.name, grade: c.grade || null,
          count: agg.count,
          avg: agg.count ? r1(agg.sum / agg.count) : null,
          pass_rate: agg.count ? Math.round((agg.pass / agg.count) * 1000) / 10 : null
        };
      });
      const all = rows.reduce((a, r) => { if (r.count) { a.sum += r.avg * r.count; a.count += r.count; } return a; }, { sum: 0, count: 0 });
      const avg = all.count ? r1(all.sum / all.count) : null;
      const trend = [...(perTerm.get(Number(s.id)) || new Map()).entries()]
        .map(([term, t]) => ({ term, avg: t.count ? r1(t.sum / t.count) : null, count: t.count }));
      /* توصیه‌های قاعده‌محور (شفاف و قابلِ‌آزمون — نه جعبه‌سیاه) */
      const recommendations = [];
      if (avg != null && avg < 10) recommendations.push('میانگین مدرسه زیر حد قبولی است؛ برنامهٔ تقویتی فوری پیشنهاد می‌شود.');
      for (const r of rows) {
        if (r.avg != null && r.avg < 10) recommendations.push(`کلاس «${r.name}» میانگین ${r.avg} دارد؛ کلاس جبرانی پیشنهاد می‌شود.`);
        else if (r.pass_rate != null && r.pass_rate < 70) recommendations.push(`کلاس «${r.name}» نرخ قبولی ${r.pass_rate}٪ دارد؛ بازبینی روش تدریس پیشنهاد می‌شود.`);
      }
      if (!recommendations.length && avg != null) recommendations.push('وضعیت تحصیلی در محدودهٔ قابل قبول است؛ روند فعلی حفظ شود.');
      return { school_id: s.id, school_name: s.name, avg, classes: rows, trend, recommendations };
    });

    audit('report_generated', { user_id: user.id, kind: 'academic', term: termFilter, schools: out.length });
    return { status: 200, body: { ok: true, kind: 'academic', term: termFilter, schools: out } };
  }

  /* ════ ۳) گزارش مالی (مدارس شهریه‌دار: شاهد/غیرانتفاعی/…) ═══════ */
  async function financeReport(req, urlParams) {
    const user = req.user;
    const gate = roleGate('finance', user); if (gate) return gate;
    const schools = scopedSchools(user, urlParams.get('school_id'));
    if (schools === null) return deny();

    /* فقط مدارسِ دارای قابلیتِ شهریه — درخواستِ صریحِ مدرسهٔ بدونِ شهریه
       با 400 پاسخ می‌گیرد تا UI پیامِ درست بدهد */
    const tuitionSchools = schools.filter(schoolHasTuition);
    if (urlParams.get('school_id') && !tuitionSchools.length) {
      return bad('این مدرسه قابلیت شهریه ندارد (فقط شاهد/غیرانتفاعی و مشابه)');
    }
    const schoolIds = new Set(tuitionSchools.map((s) => Number(s.id)));

    const agg = new Map(); /* school_id → تجمیع */
    const blank = () => ({
      tuitions: { count: 0, total: 0, discount: 0, payable: 0, paid: 0 },
      installments: { paid: 0, pending: 0, partial: 0, canceled: 0, overdue: 0, paid_amount: 0, due_amount: 0 },
      scholarships: { count: 0, approved: 0 }
    });
    const today = new Date().toISOString().slice(0, 10);
    for (const t of (store.tuitions || [])) {
      if (!t || !schoolIds.has(Number(t.school_id))) continue;
      let a = agg.get(Number(t.school_id)); if (!a) { a = blank(); agg.set(Number(t.school_id), a); }
      a.tuitions.count++;
      a.tuitions.total += Number(t.total) || 0;
      a.tuitions.discount += Number(t.discount) || 0;
      a.tuitions.payable += Number(t.payable) || 0;
      a.tuitions.paid += Number(t.paid) || 0;
    }
    for (const i of (store.installments || [])) {
      if (!i || !schoolIds.has(Number(i.school_id))) continue;
      let a = agg.get(Number(i.school_id)); if (!a) { a = blank(); agg.set(Number(i.school_id), a); }
      const st = ['paid', 'pending', 'partial', 'canceled'].indexOf(i.status) > -1 ? i.status : 'pending';
      a.installments[st]++;
      a.installments.paid_amount += Number(i.paid_amount) || 0;
      if (st !== 'canceled') a.installments.due_amount += Number(i.amount) || 0;
      if ((st === 'pending' || st === 'partial') && i.due_date && String(i.due_date) < today) a.installments.overdue++;
    }
    for (const sc of (store.scholarships || [])) {
      if (!sc || !schoolIds.has(Number(sc.school_id))) continue;
      let a = agg.get(Number(sc.school_id)); if (!a) { a = blank(); agg.set(Number(sc.school_id), a); }
      a.scholarships.count++;
      if (sc.status === 'approved') a.scholarships.approved++;
    }

    const out = tuitionSchools.map((s) => {
      const a = agg.get(Number(s.id)) || blank();
      const collect = a.tuitions.payable ? Math.round((a.tuitions.paid / a.tuitions.payable) * 1000) / 10 : null;
      return {
        school_id: s.id, school_name: s.name,
        school_type: s.school_type || 'governmental',
        tuitions: a.tuitions, installments: a.installments, scholarships: a.scholarships,
        collection_rate: collect
      };
    });

    audit('report_generated', { user_id: user.id, kind: 'finance', schools: out.length });
    return { status: 200, body: { ok: true, kind: 'finance', schools: out } };
  }

  /* ════ ۴) عملکرد معلمان ═════════════════════════════════════════ */
  async function teachersReport(req, urlParams) {
    const user = req.user;
    const gate = roleGate('teachers', user); if (gate) return gate;
    const mp = monthParams(urlParams);
    if (!mp) return bad('سال/ماه شمسی نامعتبر است');
    const schools = scopedSchools(user, urlParams.get('school_id'));
    if (schools === null) return deny();
    const schoolIds = new Set(schools.map((s) => Number(s.id)));

    const usersById = new Map();
    for (const u of (store.users || [])) if (u && u.id != null) usersById.set(Number(u.id), u);

    const perStaff = new Map(); /* school_id:staff_id → شمارنده‌ها */
    const key = (sid, tid) => sid + ':' + tid;
    const rowOf = (sid, tid) => {
      let r = perStaff.get(key(sid, tid));
      if (!r) {
        const u = usersById.get(Number(tid));
        r = { school_id: Number(sid), staff_id: Number(tid), name: u ? u.full_name : ('#' + tid), role: u ? u.role : null, present: 0, absent: 0, late: 0, substitutions: 0, training_hours: 0, training_done: 0 };
        perStaff.set(key(sid, tid), r);
      }
      return r;
    };

    for (const rec of (store.staff_attendance || [])) {
      if (!rec || !schoolIds.has(Number(rec.school_id))) continue;
      const j = isoToJ(rec.date);
      if (!j || j[0] !== mp.jy || j[1] !== mp.jm) continue;
      const r = rowOf(rec.school_id, rec.staff_id);
      const st = ['present', 'absent', 'late'].indexOf(rec.status) > -1 ? rec.status : 'absent';
      r[st]++;
    }
    for (const rec of (store.substitutions || [])) {
      if (!rec || !schoolIds.has(Number(rec.school_id))) continue;
      const j = isoToJ(rec.date);
      if (!j || j[0] !== mp.jy || j[1] !== mp.jm) continue;
      rowOf(rec.school_id, rec.sub_teacher_id).substitutions++;
    }
    /* دوره‌های ضمن خدمت: تجمیعِ کلِ سال — ساعتِ آموزش، شاخصِ ماهانه نیست */
    for (const rec of (store.training_courses || [])) {
      if (!rec || !schoolIds.has(Number(rec.school_id))) continue;
      const r = rowOf(rec.school_id, rec.staff_id);
      r.training_hours += Number(rec.hours) || 0;
      if (rec.status === 'completed' || rec.status === 'done') r.training_done++;
    }

    const out = schools.map((s) => {
      const staff = [...perStaff.values()].filter((r) => r.school_id === Number(s.id))
        .map((r) => {
          const total = r.present + r.absent + r.late;
          return Object.assign({}, r, {
            attendance_rate: total ? Math.round(((r.present + r.late) / total) * 1000) / 10 : null
          });
        })
        .sort((a, b) => a.staff_id - b.staff_id);
      const tot = staff.reduce((a, r) => { a.present += r.present; a.absent += r.absent; a.late += r.late; a.substitutions += r.substitutions; a.training_hours += r.training_hours; return a; },
        { present: 0, absent: 0, late: 0, substitutions: 0, training_hours: 0 });
      return { school_id: s.id, school_name: s.name, staff, totals: tot };
    });

    audit('report_generated', { user_id: user.id, kind: 'teachers', jy: mp.jy, jm: mp.jm, schools: out.length });
    return { status: 200, body: { ok: true, kind: 'teachers', jy: mp.jy, jm: mp.jm, schools: out } };
  }

  return { attendanceReport, academicReport, financeReport, teachersReport };
}

module.exports = { createReportsRoutes };

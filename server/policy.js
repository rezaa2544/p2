/* ═══════════════════════════════════════════════════════════════════
   server/policy.js — مدلِ ONE واحدِ مجوز و محدودهٔ مستأجر (Wave 5)
   ───────────────────────────────────────────────────────────────────
   زنجیرهٔ سیاست (طبق نقشهٔ راه ملی §8 و افزودنی معماری):

       Identity → Role → Tenant Scope → Resource → Operation → Field

   این فایل «تنها» جای تصمیمِ محدوده/مالکیت است و از دو طرف مصرف می‌شود:
     • /api/sync      → server/sync.js  (inScope = پورتِ رفتاریِ اینجاست)
     • /api/v1/* REST → server/routes/* (خواند‌ن: filterReadable/readOk
                                          نوشتن: writeRoleOk + inScope)

   قوانین بنیاد (SKILLS §۱ — Fail-Closed و Tenant Isolation):
     ۱. هیچ Resource ID به‌تنهایی مجوز نیست؛ مالکیت همیشه از رکوردِ واقعی
        حل می‌شود، نه از ادعای بدنه.
     ۲. رکوردِ بی‌مهارِ مدرسه (school_id == null) برایِ نقش‌هایِ مدرسه‌ای
        «دیده نمی‌شود» — مگر مجموعه‌هایی که null در آن‌ها معنای «سراسری»
        دارد (GLOBAL_NULL_SCHOOL_READ — فقط خواند‌ن، مثلِ اطلاعیهٔ ملی).
        توجه: مسیرِ خواند‌نِ legacy پیوش (server/pull.js) زنجیرهٔ
        parent_id/parent_national_ids را هم می‌شناسد؛ تفکیکِ آن بدهیِ
        مالکِ Wave 4/7 است و در `docs/WAVE5_AUTHZ.md` §۶ ثبت شده.
     ۳. نقش‌هایِ رکوردی (student/parent) فقط رکوردِ خود/فرزندان را
        می‌بینند؛ دبیر فقط کلاس‌هایی که واقعاً درس می‌دهد؛ مدیر فقط
        مدرسهٔ خودش؛ اداره فقط هندسهٔ دفترِ خودش (استان/شهرستان/منطقه).
     ۴. REST هرگز از مدلِ نقش×مجموعه×عمل (authz/write-perms.json — همان
        فایلی که sync می‌خواند) بازتر نیست؛ استثنای صریحِ مسیرِ REST فقط
        IEP دبیر روی users است (آینهٔ `exc` در sync).
     ۵. خود‌ویرایشی (self-update) فقط allowlistِ فیلدها — واریزِ باقیِ
        فیلدها field_denied (align با policyِ protected در sync).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* مدلِ نقش×مجموعه×عمل — همان فایلِ تولیدی که sync.js می‌خواند (یک منبع). */
const WR = require('../authz/write-perms.json');

/* ── سطوح و مجموعه‌ها ─────────────────────────────────────────────── */

const ROLE_LEVEL = { student: 0, parent: 1, driver: 1, counselor: 3, teacher: 3, edu_office: 3, manager: 4, superadmin: 5 };

/* فقط سوپرامین از مهارِ مدرسه آزاد است — edu_office اینجا نیست: دامنهٔ او
   هندسهٔ دفتر است (Wave 5؛ پیش از این در middleware legacy دور زده می‌شد). */
const SUPER_SCOPED = new Set(['superadmin']);

/* مجموعه‌هایی که در «خواند‌ن»، نبودِ school_id یعنی محتوای سراسری.
   نوشتن همچنان مهارِ صریح می‌خواهد (daronِ sync — school_id مشتق می‌شود). */
const GLOBAL_NULL_SCHOOL_READ = new Set(['announcements', 'subjects']);

/* مجموعه‌هایی که نوشتنِ اداره روی آن‌ها نیازمندِ مهارِ قابل‌حل است
   (منبعِ یکتا؛ sync.js از همین‌جا مصرف می‌کند — آزمونِ T15 این فهرست را
   در برابرِ مدلِ مجوزهایِ اداره می‌سنجد). */
const EO_SCOPE_GATED = ['announcements', 'teacher_schools', 'attendance_modes', 'notifications', 'notify_queue', 'staff_posts', 'report_logs']; /* staff_posts: د.۴ (چت ۴) — report_logs: ویو ۲۳ (گزارش‌دهی) */

/* فیلدهای IEP — استثنای صریحِ دبیر روی users (آینهٔ IEP_KEYS در sync). */
const IEP_KEYS = ['iep_notes', 'iep_staff', 'iep_updated'];

/* خود‌ویرایشیِ مسیرِ REST — allowlistِ حداقلی. تلفن/کدملی در مدلِ sync
   فیلدِ مدیریتی‌اند (protected)؛ پس اینجا هم خود‌کاربر حقِ نوشتنشان نیست. */
const SELF_EDIT_FIELDS = { users: ['full_name'] };

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/* ── دروازهٔ نقش (Role × Collection × Operation) ─────────────────── */

function collDef(coll) {
  const ops = WR.ops && WR.ops[coll];
  if (!ops) return null;
  return { ins: ops.ins || [], upd: ops.upd || [], del: ops.del || [] };
}

/** مجوزِ عمل از مدلِ تولیدی؛ مجموعهٔ ناشناخته = رد (fail-closed، حتی سوپرامین). */
function writeRoleOk(role, coll, t) {
  const def = collDef(coll);
  if (!def) return false;
  if (role === 'superadmin') return t === 'ins' || t === 'upd' || t === 'del';
  return (def[t] || []).indexOf(role) > -1;
}

/** استثنایِ مسیرِ REST: ویرایش IEP دبیر روی users وقتی کلیدهای بدنه ⊆ IEP. */
function isTeacherIepUpdate(session, coll, t, bodyKeys) {
  if (coll !== 'users' || t !== 'upd') return false;
  if (!session || session.role !== 'teacher') return false;
  const keys = (bodyKeys || []).filter((k) => k !== 'id');
  return keys.length > 0 && keys.every((k) => IEP_KEYS.indexOf(k) > -1);
}

/** دروازهٔ نوشتنِ REST: مدل + استثنایِ IEP — خروجی boolean. */
function restWriteRoleOk(session, coll, t, bodyKeys) {
  if (!session) return false;
  if (writeRoleOk(session.role, coll, t)) return true;
  return isTeacherIepUpdate(session, coll, t, bodyKeys);
}

/* ── هندسهٔ اداره (Province → County → District → School) ────────── */

/** هر فیلدِ جغرافیاییِ غیرخالیِ دفتر باید با مدرسه بخواند؛ دفترِ بدونِ
    مهار یا مدرسهٔ ناشناس = رد (fail-closed). مقایسه با truthy-check است:
    پراپِنسِ ۰/'' یعنی «قیدِ جغرافیایی ندارد» (رفتارِ ثبت‌شدهٔ Wave 5-P1). */
function officeCoversSchool(office, school) {
  if (!office || !school) return false;
  if (office.province_id && school.province_id !== office.province_id) return false;
  if (office.county_id && school.county_id !== office.county_id) return false;
  if (office.district_id && school.district_id !== office.district_id) return false;
  return true;
}

function userOffice(store, session) {
  const oid = num(session && session.office_id);
  if (oid == null) return null;
  return ((store && store.offices) || []).find((o) => Number(o.id) === oid) || null;
}

/** آیا مدرسهٔ هدف داخل محدودهٔ جغرافیایی دفترِ کاربر است؟ بی‌مهار ⇒ رد. */
function schoolInOfficeScope(store, session, schoolId) {
  const sid = num(schoolId);
  if (sid == null) return false;
  const school = ((store && store.schools) || []).find((s) => Number(s.id) === sid);
  const office = userOffice(store, session);
  if (!school || !office) return false;
  return officeCoversSchool(office, school);
}

/* ── مهارهایِ رکوردی (کلاس/فرزند/مدرسه) ───────────────────────────── */

/** کلاس‌هایی که دبیر واقعاً درس می‌دهد: سرپرستی یا برنامهٔ هفتگی. */
function teacherClassIds(store, teacherId) {
  const tid = num(teacherId);
  const out = new Set();
  if (tid == null) return out;
  ((store && store.classes) || []).forEach((c) => { if (Number(c.homeroom_teacher_id) === tid) out.add(Number(c.id)); });
  ((store && store.schedule) || []).forEach((s) => { if (Number(s.teacher_id) === tid) out.add(Number(s.class_id)); });
  return out;
}

/** درس‌هایی که دبیر در برنامه دارد (برای مهارِ نمره/حضور — آینهٔ pull). */
function teacherSubjectIds(store, teacherId) {
  const tid = num(teacherId);
  const out = new Set();
  if (tid == null) return out;
  ((store && store.schedule) || []).forEach((s) => { if (Number(s.teacher_id) === tid) out.add(Number(s.subject_id)); });
  return out;
}

function studentClassIds(store, studentId) {
  const sid = num(studentId);
  const out = new Set();
  if (sid == null) return out;
  ((store && store.enrollments) || []).forEach((e) => { if (Number(e.student_id) === sid) out.add(Number(e.class_id)); });
  return out;
}

/** فرزندانِ ولی — یکتا از parent_links + زنجیرهٔ legacy (parent_id).
    (زنجیرهٔ parent_national_ids فقط در خواند‌نِ legacy پیوش هست و در فروشگاهِ
     PG ستونی ندارد — بدهیِ ثبت‌شدهٔ Wave 4؛ رجوع: docs/WAVE5_AUTHZ.md §۶.) */
/* Wave 1 (opts.parentLinks): در حالتِ PG، لینک‌ها زنده از DB خوانده و به
   دروازه پاس می‌شوند — مدلِ یکتا همین‌جاست، فقط داده تازه‌تر است. */
function childrenOfParent(store, parentId, links) {
  const pid = num(parentId);
  const out = new Set();
  if (pid == null) return out;
  (Array.isArray(links) ? links : ((store && store.parent_links) || [])).forEach((l) => { if (Number(l.parent_id) === pid) out.add(Number(l.student_id)); });
  ((store && store.users) || []).forEach((u) => {
    if (u.role === 'student' && Number(u.parent_id) === pid) out.add(Number(u.id));
  });
  return out;
}

/** فرزندانِ نوشتن — دقیقاً parent_links (سخت‌گیرانهٔ sync حفظ می‌شود:
    نوشتنِ والد روی «فرزندِ ظاهریِ legacy» از این دروازه عبور نمی‌کند
    تا پیوندِ رسمی parent_links ساخته شود — خواند‌ن بازتر است). */
function writeChildrenOfParent(store, parentId) {
  const pid = num(parentId);
  const out = new Set();
  if (pid == null) return out;
  ((store && store.parent_links) || []).forEach((l) => { if (Number(l.parent_id) === pid) out.add(Number(l.student_id)); });
  return out;
}

/** مهارِ مدرسه از دلِ رکورد — مستقیم، یا رشتهٔ student→enroll→class→school،
    یا گیرندهٔ اعلان (user_id→school). قابل‌حل نبودن ⇒ null (تصمیم با مصرف‌کننده). */
function recordSchoolId(store, coll, rec) {
  const r = rec || {};
  if (r.school_id != null) return num(r.school_id);
  const sid = r.student_id != null ? num(r.student_id) : null;
  if (sid != null) {
    const enr = ((store && store.enrollments) || []).find((e) => Number(e.student_id) === sid);
    const cls = enr && ((store && store.classes) || []).find((c) => Number(c.id) === num(enr.class_id));
    if (cls && cls.school_id != null) return num(cls.school_id);
  }
  if (r.class_id != null) {
    const cls = ((store && store.classes) || []).find((c) => Number(c.id) === num(r.class_id));
    if (cls && cls.school_id != null) return num(cls.school_id);
  }
  if (coll === 'notifications' || coll === 'notify_queue') {
    const uid = r.user_id != null ? num(r.user_id) : null;
    if (uid != null) {
      const u = ((store && store.users) || []).find((x) => Number(x.id) === uid);
      if (u && u.school_id != null) return num(u.school_id);
    }
  }
  return null;
}

/* ── دروازهٔ محدوده/مالکیت (Tenant Scope) — منبع یکتا ───────────────
   پورتِ رفتارِ sync.js:inScope (ویو ۵ پی۱ + دور ۸۹/۹۰/۹۸). sync اکنون همین
   تابع را با store تزریق‌شده صدا می‌زند — دو مسیر، یک سیاست.
   امضا: inScope(session, store, coll, recId, data) → true/false. */
function inScope(session, store, coll, recId, data) {
  const u = session;
  if (!u || !u.role) return false;
  if (u.role === 'superadmin') return true;
  const list = ((store && store[coll]) || []);
  const existing = recId != null ? list.find((x) => x && x.id === Number(recId)) : null;
  const rec = existing
    ? Object.assign({}, existing, data)
    : ((data && Number(data.id) === Number(recId)) ? data : (data && typeof data === 'object' ? data : null));

  /* Round 89 — مالکیتی که روی student_id سوار نیست:
     messages: نویسنده (from_id) مالک است؛ manager/edu_office مسیرِ مدرسه.
     notifications: گیرنده فقط پرچم read اعلان خودش را. */
  function msgOwnerOk() {
    const f = (data && data.from_id != null) ? Number(data.from_id)
      : (rec && rec.from_id != null) ? Number(rec.from_id) : null;
    return f != null && f === u.id;
  }
  /* R96 — والد/دانش‌آموز: اعلانِ خود ⇒ فقط read (بقیه فیلدها دامنهٔ مدیر). */
  if (coll === 'notifications' && rec && Number(rec.user_id) === u.id
    && (u.role === 'parent' || u.role === 'student')) {
    const nk = Object.keys(data || {});
    return nk.length > 0 && nk.every((k) => k === 'read');
  }

  /* ب.۳ — ارزشیابیِ ناشناس دبیر: بی‌هویت؛ مهار = مدرسهٔ پاسخ‌دهنده. */
  if (coll === 'teacher_evaluations') {
    if (u.role === 'student') {
      return !!(data && Number(data.school_id) === Number(u.school_id));
    }
    if (u.role === 'parent') {
      const kids = writeChildrenOfParent(store, u.id);
      return !!(data && kids.size > 0 && Array.from(kids).some((kid) => {
        const k = ((store.users) || []).find((x) => Number(x.id) === kid);
        return k && Number(k.school_id) === Number(data.school_id);
      }));
    }
    return false;
  }

  if (u.role === 'student') {
    if (coll === 'messages') return msgOwnerOk();
    if (coll === 'users' && ((rec && Number(rec.id) === Number(u.id))
        || (!rec && data && Number(data.id) === Number(u.id)))) return true; /* data = کپیِ detachedِ PG */
    if (rec && rec.student_id != null) return rec.student_id === u.id;
    if (data && data.student_id != null) return Number(data.student_id) === u.id;
    return false;
  }
  if (u.role === 'parent') {
    if (coll === 'messages') return msgOwnerOk();
    const kids = writeChildrenOfParent(store, u.id);
    /* R96 — رزروِ نوبت: رکوردِ نوبتِ آزاد student_id ندارد؛ مهار از
       data.student_id (فرزندِ خود) حل می‌شود. */
    if (coll === 'meeting_slots' && !rec && data && data.student_id != null)
      return kids.has(Number(data.student_id));
    if (coll === 'meeting_slots' && data && data.student_id != null && rec && rec.student_id == null)
      return kids.has(Number(data.student_id));
    const sid = rec ? rec.student_id : (data && data.student_id);
    /* Round 89 — پیوندِ تازه فقط مالِ خودِ والد (جعلِ پیوند برایِ دیگران ⇒ رد)
       A-35 — parent_id در هر عملیاتِ parent_links باید خودِ والد باشد؛
       انتقالِ فرزندی به والدِ دیگر (هم‌مدرسه یا بین‌مدرسه) از مسیرِ والد ⇒ رد. */
    if (coll === 'parent_links' && data && data.parent_id != null && Number(data.parent_id) !== u.id) return false;
    if (sid == null) return !!(rec && rec.parent_id === u.id);
    /* A-35 — مهارِ والدِ دانش‌آموز با مدرسهٔ والد (دفاعِ عمق؛ دادهٔ قدیمیِ
       جعل‌شده نباید بعد از اصلاحِ دروازهٔ نوشتن باز بماند). */
    const stuP = ((store && store.users) || []).find((x) => Number(x.id) === Number(sid) && x.role === 'student');
    if (stuP && stuP.school_id != null && Number(stuP.school_id) !== Number(u.school_id)) return false;
    return kids.has(Number(sid));
  }
  if (u.role === 'teacher') {
    if (coll === 'messages') return msgOwnerOk();
    /* E.4 — کتابدار: امانت/بازگشت در سطحِ مدرسه است نه کلاس (کتابدار به
       همهٔ دانش‌آموزانِ مدرسه امانت می‌دهد)؛ پرچمِ تفویضی لازم است. (منتقل از sync.js — ویو ۵) */
    if (coll === 'lib_loans') {
      const me = ((store && store.users) || []).find((x) => Number(x.id) === Number(u.id));
      if (!me || me.lib_staff !== 1) return false;
      const t3 = rec || data || {};
      return t3.school_id != null && Number(t3.school_id) === Number(u.school_id);
    }
    /* E.5 — تحویلدار: به‌روزرسانیِ اموال در سطحِ مدرسه است نه کلاس؛
       پرچمِ تفویضیِ مدیر (users.asset_staff=1) لازم است. (منتقل از sync.js — ویو ۵) */
    if (coll === 'assets') {
      const me = ((store && store.users) || []).find((x) => Number(x.id) === Number(u.id));
      if (!me || me.asset_staff !== 1) return false;
      const t3 = rec || data || {};
      return t3.school_id != null && Number(t3.school_id) === Number(u.school_id);
    }
    /* Round 89 — کلاس‌هایی که واقعاً تدریس می‌شوند (سرپرستی یا برنامه)؛
       نوبت‌ها: نوبت‌هایِ خودِ دبیر (با parent_id/student_id null ساخته می‌شوند). */
    const t2 = rec || data || {};
    if (coll === 'meeting_slots' && t2.teacher_id != null) {
      return Number(t2.teacher_id) === u.id;
    }
    if ((coll === 'hw_assignments' || coll === 'vclass_sessions') && t2.class_id != null) {
      const cls2 = ((store && store.classes) || []).find((c) => Number(c.id) === Number(t2.class_id));
      if (!cls2) return false; /* کلاس ناموجود ⇒ رد (مثلِ مسیرِ اصلی) */
      /* A-35 — کلاسِ مدرسهٔ دیگر هرگز از راهِ برنامهٔ هفتگیِ جعل‌شده باز
         نمی‌شود: مدرسهٔ کلاس باید با مدرسهٔ دبیر بخواند (fail-closed). */
      if (cls2.school_id == null || Number(cls2.school_id) !== Number(u.school_id)) return false;
      return teacherClassIds(store, u.id).has(Number(cls2.id));
    }
    const sid = rec ? rec.student_id : (data && data.student_id);
    if (sid != null) {
      const enr = ((store && store.enrollments) || []).find((e) => Number(e.student_id) === Number(sid));
      if (!enr) return false;
      /* A-35 — دانش‌آموزِ مدرسهٔ دیگر با کلاسِ «تدریسی» جعلی نمی‌چربد. */
      const stuT = ((store && store.users) || []).find((x) => Number(x.id) === Number(sid) && x.role === 'student');
      if (stuT && stuT.school_id != null && Number(stuT.school_id) !== Number(u.school_id)) return false;
      return teacherClassIds(store, u.id).has(Number(enr.class_id));
    }
    if (rec && rec.teacher_id != null) return rec.teacher_id === u.id;
    if (rec && rec.school_id != null) return rec.school_id === u.school_id;
    return false;
  }
  /* ویو ۵ — محدودهٔ اداره: فقط مدارسِ داخل هندسهٔ دفتر؛ بی‌مهار ⇒ رد.
     offices ساختاری و بسته است (دفاعِ دوم — در مدلِ نقش هم مجوزش نیست). */
  if (u.role === 'edu_office') {
    if (coll === 'offices') return false;
    /* د.۳ — اطلاعیهٔ فوری/بحرانی اداره: کارشناس فقط می‌تواند اطلاعیه‌ای
       با office_id ادارهٔ خودش بنویسد/ویرایش/حذف کند؛ اطلاعیهٔ ادارهٔ
       دیگر ⇒ رد (بستنِ شکافِ انتشار بین‌اداره‌ای). (منتقل از sync.js — ویو ۵) */
    if (coll === 'announcements') {
      const t0 = rec || data || {};
      if (t0.office_id != null && Number(t0.office_id) !== Number(u.office_id)) return false;
    }
    /* رئیس اداره — fail-closed: فقط کاربر با is_head=1 برای اکشن‌های مدیریتی اداره مجاز است */
    const headOnlyActions = ['office-msg', 'office-print', 'office-dash', 'office-broadcast'];
    if (headOnlyActions.indexOf(coll) > -1 || (coll === 'notifications' && (data && data.type === 'office'))) {
      const meStore = ((store && store.users) || []).find((x) => Number(x.id) === Number(u.id));
      if (!meStore || meStore.is_head !== 1) return false;
    }
    if (EO_SCOPE_GATED.indexOf(coll) > -1) {
      const t = rec || data || {};
      /* د.۴ — staff_posts: مدرسهٔ «هدف» بر رکوردِ موجود مقدم است؛
         انتقالِ هنجار به مدرسهٔ بیرونِ محدودهٔ دفتر ⇒ رد (فیل‌کلوزد). */
      const sid = (coll === 'staff_posts' && data && data.school_id != null) ? data.school_id
        : (t.school_id != null ? t.school_id
        : (t.user_id != null ? (((store.users) || []).find((x) => Number(x.id) === Number(t.user_id)) || {}).school_id : null));
      /* د.۳ — اطلاعیهٔ سطحِ اداره: بدونِ مهارِ مدرسه/گیرنده ولی با
         office_id خودِ ادارهٔ کاربر ⇒ در محدودهٔ همان اداره است؛
         office_id ادارهٔ دیگر یا نبودِ آن ⇒ رد (فیل‌کلوزد) */
      if (sid == null && t.office_id != null) {
        return Number(t.office_id) === Number(u.office_id);
      }
      return schoolInOfficeScope(store, u, sid);
    }
    return true; /* بقیه: اختیارِ بین‌مدرسه‌ای که مدل داده است */
  }
  /* manager/counselor/driver و بقیه: سطحِ مدرسه — با رشتهٔ student برای
     مجموعه‌های بی‌school_id (R96)؛ بی‌مهارِ قابل‌حل ⇒ رد (fail-closed). */
  /* A-35 — parent_links بی‌school_id است؛ باید پیش از مسیرِ s==null سنجیده
     شود (آن مسیر برایِ رشتهٔ student «برمی‌گردَد» و اینجا را رد می‌شود):
     والدِ پیوند باید در مدرسهٔ همان دانش‌آموز باشد، وگرنه بین‌مدرسه‌ای ⇒ رد. */
  if (coll === 'parent_links') {
    const stPL = (rec && rec.student_id != null) ? rec.student_id : (data && data.student_id);
    const effPid = num((data && data.parent_id != null) ? data.parent_id : (rec && rec.parent_id));
    const par = effPid != null ? ((store && store.users) || []).find((x) => Number(x.id) === effPid) : null;
    if (!par || par.school_id == null) return false;
    const stuPL = stPL != null ? ((store && store.users) || []).find((x) => Number(x.id) === Number(stPL) && x.role === 'student') : null;
    if (!stuPL || stuPL.school_id == null || Number(par.school_id) !== num(stuPL.school_id)) return false;
    return true;
  }
  const s = rec ? rec.school_id : (data && data.school_id);
  if (s == null) {
    const sid2 = (rec && rec.student_id != null) ? rec.student_id
      : (data && data.student_id != null ? data.student_id : null);
    if (sid2 != null) {
      const enr = ((store && store.enrollments) || []).find((e) => Number(e.student_id) === Number(sid2));
      const cls = enr && ((store && store.classes) || []).find((c) => Number(c.id) === num(enr.class_id));
      if (cls) return Number(cls.school_id) === Number(u.school_id);
    }
    return false;
  }
  if (s !== u.school_id) return false;
  /* ویو ۵ بخش دوم — سازگاریِ مهارِ دانش‌آموز با مهارِ مدرسه: شناسهٔ
     دانش‌آموزِ «مدرسهٔ دیگر» با مُهرِ مدرسهٔ نویسنده نمی‌چربد ⇒ رد
     (هیچ Resource ID به‌تنهایی مجوز نیست). دانش‌آموزِ ناشناس رَد نمی‌کند —
     رفتارِ legacy رکوردهایِ یتیم حفظ است (docs/WAVE5_AUTHZ.md §۵). */
  const st = rec && rec.student_id != null ? rec.student_id
    : (data && data.student_id != null ? data.student_id : null);
  if (st != null) {
    const stu = ((store && store.users) || []).find((x) => Number(x.id) === Number(st) && x.role === 'student');
    if (stu && stu.school_id != null && Number(stu.school_id) !== Number(u.school_id)) return false;
  }
  /* A-35 — سازگاریِ مرجعِ فرعی با مهارِ سطر: «FK معتبر ≠ مجوز». معلم/کلاسِ
     مدرسهٔ دیگر با مُهرِ مدرسهٔ نویسنده نمی‌چربد ⇒ رد (fail-closed). */
  if (coll === 'schedule') {
    const cid2 = num((data && data.class_id != null) ? data.class_id : (rec && rec.class_id));
    const cls3 = cid2 != null ? ((store && store.classes) || []).find((x) => Number(x.id) === cid2) : null;
    const rowSch = s != null ? num(s) : (cls3 ? num(cls3.school_id) : null);
    if (rowSch == null) return false;
    const tid2 = num((data && data.teacher_id != null) ? data.teacher_id : (rec && rec.teacher_id));
    if (tid2 != null) {
      const tch = ((store && store.users) || []).find((x) => Number(x.id) === tid2);
      if (!tch || tch.school_id == null || Number(tch.school_id) !== rowSch) return false;
    }
    if (cid2 != null && (!cls3 || cls3.school_id == null || Number(cls3.school_id) !== rowSch)) return false;
    return true;
  }
  if ((coll === 'grades' || coll === 'attendance') && data && data.class_id != null) {
    const cls4 = ((store && store.classes) || []).find((x) => Number(x.id) === num(data.class_id));
    if (!cls4 || cls4.school_id == null) return false;
    const stu2 = st != null ? ((store && store.users) || []).find((x) => Number(x.id) === Number(st) && x.role === 'student') : null;
    const expectSch = (stu2 && stu2.school_id != null) ? num(stu2.school_id) : (s != null ? num(s) : num(u.school_id));
    if (expectSch == null || Number(cls4.school_id) !== expectSch) return false;
    return true;
  }
  return true;
}

/* نما/رکوردِ دانش‌آموز — قراردادِ مرجعِ idor.js §۱.۲ (تنها منبع، idor.js
   و /api/v1/students و pullِ زیرمجموعه‌ها از همین‌جا می‌خوانند):
   مدیر ⇒ فقط مدرسهٔ خودش؛ دبیر ⇒ فقط شاگردانِ کلاس‌هایی که تدریس می‌کند؛
   والد ⇒ فقط فرزندان؛ خودِ دانش‌آموز ⇒ خودش؛ بقیه ⇒ رد (fail-closed). */
function studentRecordOk(store, session, rec, opts) {
  if (!session || !rec) return false;
  const role = session.role;
  if (role === 'superadmin') return true;
  if (role === 'manager') return rec.school_id != null && Number(rec.school_id) === num(session.school_id);
  if (role === 'student') return Number(rec.id) === Number(session.id);
  if (role === 'parent') {
    const kids = (opts && opts.parentChildIds)
      ? opts.parentChildIds
      : childrenOfParent(store, session.id, opts && opts.parentLinks);
    /* A-35 — مهارِ رکورد با مدرسهٔ والد (دفاعِ عمق علیه پیوندِ جعلیِ قدیمی). */
    if (rec.school_id != null && Number(rec.school_id) !== num(session.school_id)) return false;
    return kids.has(Number(rec.id));
  }
  if (role === 'teacher') {
    if (Number(rec.id) === Number(session.id)) return true;
    if (rec.school_id == null || Number(rec.school_id) !== num(session.school_id)) return false;
    const taught = (opts && opts.teacherClassIds) || teacherClassIds(store, session.id);
    /* کلاسِ واقعی‌بودن — آینهٔ §۱.۲: کلاسِ شبح (schedule بدونِ سطرِ classes)
       هرگز دسترسی باز نمی‌کند (تلهٔ fail-openِ ثبت‌شده). */
    const real = (opts && opts.realClassIds) || new Set(((store && store.classes) || []).map((c) => Number(c.id)));
    const sClasses = (opts && opts.studentClassIds) || studentClassIds(store, rec.id);
    return Array.from(sClasses).some((cid) => taught.has(Number(cid)) && real.has(Number(cid)));
  }
  return false;
}

/**
 * Wave 1 (P0-1): حل محدودهٔ دسترسی دانش‌آموز بر پایهٔ Source of Truth در PostgreSQL
 * هنگامی که پایگاه داده فعال است، انتسابات کلاس دبیر و پیوندهای اولیا را مستقیماً
 * از PostgreSQL می‌خواند تا تغییرات سایر نمونه‌ها بلادرنگ نافذ باشد.
 */
async function resolveStudentScopeOpts(db, store, session, rec) {
  if (!db || typeof db.isPostgres !== 'function' || !db.isPostgres() || !session || !rec) {
    return null;
  }
  const opts = {};
  const role = session.role;
  if (role === 'parent') {
    const pid = num(session.id);
    const kids = new Set();
    if (pid != null) {
      try {
        const r1 = await db.query('SELECT student_id FROM parent_links WHERE parent_id = $1', [pid]);
        if (r1 && r1.rows) r1.rows.forEach(r => kids.add(Number(r.student_id)));
        /* F2: parent_links is the authoritative PG relationship. The old
           users.parent_id column does not exist in the PostgreSQL schema and
           turns an otherwise valid parent scope lookup into a production 500/404. */
      } catch (err) {
        console.error('[POLICY] PG parent_links query failed:', err.message);
        if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production') {
          throw err;
        }
      }
    }
    opts.parentChildIds = kids;
  } else if (role === 'teacher') {
    const tid = num(session.id);
    const sid = num(rec.id);
    const schId = num(session.school_id);
    const taught = new Set();
    const real = new Set();
    const stClasses = new Set();
    if (tid != null && schId != null) {
      try {
        const rHomeroom = await db.query('SELECT id FROM classes WHERE homeroom_teacher_id = $1 AND school_id = $2', [tid, schId]);
        if (rHomeroom && rHomeroom.rows) rHomeroom.rows.forEach(r => taught.add(Number(r.id)));

        const rSched = await db.query('SELECT class_id FROM schedule WHERE teacher_id = $1 AND school_id = $2', [tid, schId]);
        if (rSched && rSched.rows) rSched.rows.forEach(r => taught.add(Number(r.class_id)));

        const rReal = await db.query('SELECT id FROM classes WHERE school_id = $1', [schId]);
        if (rReal && rReal.rows) rReal.rows.forEach(r => real.add(Number(r.id)));

        if (sid != null) {
          const rEnroll = await db.query('SELECT class_id FROM enrollments WHERE student_id = $1 AND school_id = $2', [sid, schId]);
          if (rEnroll && rEnroll.rows) rEnroll.rows.forEach(r => stClasses.add(Number(r.class_id)));
        }
      } catch (err) {
        console.error('[POLICY] PG teacher scope query failed:', err.message);
        if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production') {
          throw err;
        }
      }
    }
    opts.teacherClassIds = taught;
    opts.realClassIds = real;
    opts.studentClassIds = stClasses;
  }
  return opts;
}



/* ── دروازهٔ خواند‌نِ REST (مدلِ یکتا با pull.js) ────────────────────
   دو «منبعِ» خواند‌نِ users مجزاست و هرکدام قاعدهٔ خودش را has — یکی در policy:
     • users     — دایرکتوریِ کاربرانِ مدرسه (pull همین را می‌دهد):
                   دبیر/مدیر ⇒ مدرسهٔ خود، با پروژکشنِ ماسک‌شده.
     • students  — نما/رکوردِ دانش‌آموز (studentRecordOk — همان idor).
   خروجی هر دو boolean. */
function readOk(store, session, coll, rec, opts) {
  if (!session || !rec) return false;
  const role = session.role;
  if (role === 'superadmin') return true;
  const schoolId = num(session.school_id);

  if (coll === 'students') return studentRecordOk(store, session, rec, opts);

  if (coll === 'users' && role === 'student') return Number(rec.id) === Number(session.id);
  if (coll === 'users' && role === 'parent') {
    if (Number(rec.id) === Number(session.id)) return true;
    /* A-35 — کاربرِ مدرسهٔ دیگر حتی با پیوندِ «دارای» هم دیده نمی‌شود. */
    if (rec.school_id != null && Number(rec.school_id) !== schoolId) return false;
    return childrenOfParent(store, session.id).has(Number(rec.id));
  }

  if (coll === 'classes') {
    if (role === 'student') return studentClassIds(store, session.id).has(Number(rec.id));
    if (role === 'parent') {
      const kids = childrenOfParent(store, session.id);
      const enr = ((store.enrollments) || []).find((e) => kids.has(Number(e.student_id)) && Number(e.class_id) === Number(rec.id));
      return !!enr;
    }
    /* اداره (برایِ مجموعه‌هایِ مدرسه‌محورِ عمومی): هندسهٔ دفتر — همان باندی
       که dbquery با _officeGeoClause به SQL می‌ریزد؛ بی‌دفتر ⇒ رد. */
    if (role === 'edu_office') return rec.school_id != null && schoolInOfficeScope(store, session, rec.school_id);
    if (rec.school_id == null) return false;
    if (Number(rec.school_id) !== schoolId) return false;
    if (role === 'teacher') {
      return Number(rec.homeroom_teacher_id) === Number(session.id)
        || teacherClassIds(store, session.id).has(Number(rec.id));
    }
    return true;
  }

  if (coll === 'attendance' || coll === 'grades' || coll === 'discipline') {
    if (role === 'student') return Number(rec.student_id) === Number(session.id);
    if (role === 'parent') return childrenOfParent(store, session.id).has(Number(rec.student_id));
    if (role === 'edu_office') return rec.school_id != null && schoolInOfficeScope(store, session, rec.school_id);
    if (rec.school_id == null) return false;
    if (Number(rec.school_id) !== schoolId) return false;
    if (role === 'teacher') {
      const cls = teacherClassIds(store, session.id);
      const subs = teacherSubjectIds(store, session.id);
      return cls.has(Number(rec.class_id)) || subs.has(Number(rec.subject_id)) || Number(rec.teacher_id) === Number(session.id);
    }
    return true;
  }

  /* users (دایرکتوری) برایِ بقیهٔ نقش‌هایِ مدرسه‌ای — آینهٔ pull:
     مهارِ سختِ مدرسه؛ رکوردِ بی‌مهار (حساب‌هایِ ملی) فقط سوپرامین.
     A-35/F4 — خودِ کاربر همیشه پروفایلِ خود را می‌خواند (حتی بی‌مهار). */
  if (coll === 'users' && Number(rec.id) === Number(session.id)) return true;
  if (rec.school_id == null) return false;
  if (role === 'edu_office') return schoolInOfficeScope(store, session, rec.school_id);
  return Number(rec.school_id) === schoolId;
}

/** فیلترِ مجموعه‌محورِ خواند‌ن — با پیش‌محاسبهٔ مهارها (O(n) نه O(n²)). */
function filterReadable(store, session, coll, records) {
  if (!Array.isArray(records)) return [];
  if (!session) return [];
  const role = session.role;
  if (role === 'superadmin') return records;
  const schoolId = num(session.school_id);

  const isUsersLike = coll === 'users';
  if (coll === 'students') return records.filter((r) => studentRecordOk(store, session, r));
  if (isUsersLike) {
    if (role === 'student') return records.filter((r) => Number(r.id) === Number(session.id));
    if (role === 'parent') {
      const kids = childrenOfParent(store, session.id);
      return records.filter((r) => Number(r.id) === Number(session.id) || kids.has(Number(r.id)));
    }
    if (role === 'teacher') {
      return records.filter((r) => r.school_id != null && Number(r.school_id) === schoolId);
    }
    if (role === 'edu_office') return records.filter((r) => r.school_id != null && schoolInOfficeScope(store, session, r.school_id));
    return records.filter((r) => r.school_id != null && Number(r.school_id) === schoolId);
  }

  if (coll === 'classes') {
    if (role === 'student') {
      const own = studentClassIds(store, session.id);
      return records.filter((r) => own.has(Number(r.id)));
    }
    if (role === 'parent') {
      const kids = childrenOfParent(store, session.id);
      const cls = new Set(((store.enrollments) || []).filter((e) => kids.has(Number(e.student_id))).map((e) => Number(e.class_id)));
      return records.filter((r) => cls.has(Number(r.id)));
    }
    if (role === 'teacher') {
      const taught = teacherClassIds(store, session.id);
      return records.filter((r) => r.school_id != null && Number(r.school_id) === schoolId
        && (Number(r.homeroom_teacher_id) === Number(session.id) || taught.has(Number(r.id))));
    }
    if (role === 'edu_office') return records.filter((r) => r.school_id != null && schoolInOfficeScope(store, session, r.school_id));
    return records.filter((r) => r.school_id != null && Number(r.school_id) === schoolId);
  }

  if (coll === 'attendance' || coll === 'grades' || coll === 'discipline') {
    if (role === 'student') return records.filter((r) => Number(r.student_id) === Number(session.id));
    if (role === 'parent') {
      const kids = childrenOfParent(store, session.id);
      return records.filter((r) => kids.has(Number(r.student_id)));
    }
    if (role === 'teacher') {
      const cls = teacherClassIds(store, session.id);
      const subs = teacherSubjectIds(store, session.id);
      return records.filter((r) => r.school_id != null && Number(r.school_id) === schoolId
        && (cls.has(Number(r.class_id)) || subs.has(Number(r.subject_id)) || Number(r.teacher_id) === Number(session.id)));
    }
    if (role === 'edu_office') return records.filter((r) => r.school_id != null && schoolInOfficeScope(store, session, r.school_id));
    return records.filter((r) => r.school_id != null && Number(r.school_id) === schoolId);
  }

  if (coll === 'subjects') return records;
  if (coll === 'announcements') {
    return records.filter((r) => r.school_id == null
      ? GLOBAL_NULL_SCHOOL_READ.has('announcements')
      : (role === 'edu_office' ? schoolInOfficeScope(store, session, r.school_id) : Number(r.school_id) === schoolId));
  }
  /* پیش‌فرض عمومی — مهارِ سختِ مدرسه (بی‌مهار ⇒ حذف؛ fail-closed). */
  return records.filter((r) => r.school_id != null && Number(r.school_id) === schoolId);
}

/* ── دروازهٔ یکپارچهٔ مسیرِ REST ────────────────────────────────────
   readGate: بیرونِ محدوده ⇒ not_found (۴۰۴ — ضدشمارش؛ همان قرارداد idor.js)
   writeGate: ردِ نقش ⇒ ۴۰۳ forbidden · ردِ محدوده ⇒ ۴۰۳ out_of_scope
   (قرارداد sync: scope در sync هم ۴۰۳ است — نوشتن ادعاست، وجودِ هدف را
    از قبل کلاینت اعلام کرده؛ خواند‌ن اما باید «نبود» را بازی کند.)      */
function restReadGate(store, session, coll, rec, opts) {
  if (!rec || !readOk(store, session, coll, rec, opts)) return { ok: false, status: 404, code: 'not_found' };
  return { ok: true };
}
function restWriteGate(store, session, coll, t, rec, bodyKeys) {
  if (!restWriteRoleOk(session, coll, t, bodyKeys)) {
    return { ok: false, status: 403, code: 'forbidden' };
  }
  if (rec && !inScope(session, store, coll, rec.id, rec)) {
    return { ok: false, status: 403, code: 'out_of_scope' };
  }
  if (!rec) {
    /* ساخت — مهار از بدنه/رشته حل می‌شود؛ بی‌مهار برایِ نقش‌هایِ رکوردی ⇒ رد */
    return { ok: true, needDataScope: true };
  }
  return { ok: true };
}
/** دروازهٔ ساخت با بدنه — همان دروازهٔ محدوده، روی data. */
function restCreateScopeOk(store, session, coll, data) {
  return inScope(session, store, coll, null, data);
}

/* تنگ‌سازیِ مستندِ REST: حذفِ فیزیکیِ رکوردهایِ درسی (attendance/grades) در
   REST تنها برایِ مدیر/سوپر — مدلِ sync عامدانه بازتر است (میراثِ write-perms)
   و REST هرگز بازتر از مدل نمی‌شود. رجوع: docs/WAVE5_AUTHZ.md §۴. */
const DELETE_ROLES_REST = new Set(['manager', 'superadmin']);

/* ── خود‌ویرایشی (Self-Update) ─────────────────────────────────────── */
function selfEditDeniedKeys(coll, body) {
  const allow = SELF_EDIT_FIELDS[coll] || [];
  return Object.keys(body || {}).filter((k) => k !== 'id' && allow.indexOf(k) === -1);
}

module.exports = {
  ROLE_LEVEL, SUPER_SCOPED, GLOBAL_NULL_SCHOOL_READ, EO_SCOPE_GATED,
  IEP_KEYS, SELF_EDIT_FIELDS,
  writeRoleOk, isTeacherIepUpdate, restWriteRoleOk,
  officeCoversSchool, userOffice, schoolInOfficeScope,
  teacherClassIds, teacherSubjectIds, studentClassIds, childrenOfParent, writeChildrenOfParent, recordSchoolId,
  studentRecordOk, resolveStudentScopeOpts,
  inScope, readOk, filterReadable, DELETE_ROLES_REST,
  restReadGate, restWriteGate, restCreateScopeOk,
  selfEditDeniedKeys
};

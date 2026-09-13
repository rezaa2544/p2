/* ═══════════════════════════════════════════════════════════════════
   server/public-report-sql.js — P1-3 (Wave 18 §۵-۸): تجمیعِ گزارشِ عمومی سمتِ PostgreSQL
   -------------------------------------------------------------------
   یافتهٔ کمّی Wave 18 §۵-۸: «public-report از آینهٔ درون‌حافظه‌ای محاسبه
   می‌شود ⇒ با هیدراتاسیونِ مقیّد، تقریبِ نمونهٔ محدود را نشان می‌دهد.
   برای اعدادِ ملی باید از aggregation سمتِ PG بیاید.»

   این ماژول همان تجمیعِ server/public-report-core.js را با COUNT/GROUP BY
   در PostgreSQL انجام می‌دهد — عمداً الگوی server/reports-sql.js (Wave 23):

   - هر مقدارِ کاربر-کنترل‌شده پارامترِ مقید است ($n)؛ شناسه‌ها فقط از
     شِمای ثابتِ همین فایل می‌آیند، هرگز از ورودی.
   - دامنهٔ tenant در خودِ SQL اعمال می‌شود (school_id = $1)، نه فیلترِ
     JS روی آرایهٔ مادی‌شده.
   - خروجی‌ها bounded اند: schools فهرستِ id/name است و گروه‌های جلسه
     به تعدادِ meeting_type های متمایز ( cardinality کوچک) — نه سطرِ خام.
   - ایندکس‌های موجود کافی‌اند: idx_users_school_role (school_id, role) ·
     idx_classes_school_id · idx_assoc_minutes_school_id · schools PK.

   Dual mode: این مسیر فقط وقتی PG زنده است (db.isPostgres()) استفاده
   می‌شود؛ مسیرِ حافظه (worker + public-report-core) بایت‌به‌بایت می‌ماند —
   حالتِ فایل/آفلاین دست‌نخورده. خطای PG در این مسیر fail-closed است
   (503 صادقانه)، نه fallbackِ بی‌صدا به «تقریبِ نمونهٔ محدود» — همان
   نتیجه‌گیریِ §۵-۸: عددِ تقریبیِ منتشرشده بدتر از خطای صریح است.

   قراردادِ خروجی عیناً همان C.3-security است (public-report-core.js):
   مدارسِ فعال فقط {id,name}؛ گزارش فقط شمارش/جلسات/اهداف؛ بدونِ PII.
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/**
 * @param {object} db  ماژول db (pool تزریق‌شده؛ queryRead اگر replica-aware باشد)
 * @param {number|string|null} sidWanted  school_id درخواستی (نامعتبر → اولین مدرسهٔ فعال)
 * @returns {Promise<{ok:boolean, schools:Array, report:?object}>}  هم‌ارز computePublicReport
 */
async function publicReportFromPg(db, sidWanted){
  const read = (typeof db.queryRead === 'function') ? db.queryRead.bind(db) : db.query.bind(db);

  /* مدارسِ فعال — فقط {id,name}؛ ORDER BY id ⇒ «اولین مدرسهٔ فعال» قطعی */
  const schoolsRes = await read('SELECT id, name FROM schools WHERE active IS TRUE ORDER BY id', []);
  const schools = (schoolsRes && Array.isArray(schoolsRes.rows)) ? schoolsRes.rows : [];
  const list = schools.map(s => ({ id: s.id, name: s.name }));
  let sid = Number(sidWanted) || null;
  if(!schools.some(s => s.id === sid)) sid = schools.length ? schools[0].id : null;
  if(sid === null) return { ok: true, schools: [], report: null };

  /* مدرسهٔ هدف + شهر (LEFT JOIN counties) — یک ردیف؛ منطقِ goals در JS
     می‌ماند تا عیناً همان core باشد (رشتهٔ '1'/true در شِمای VARCHAR) */
  const scRes = await read(
    'SELECT s.name, s.level, s.city, s.county_id, s.public_goals, s.boom_goals, c.name AS county_name ' +
    'FROM schools s LEFT JOIN counties c ON c.id = s.county_id ' +
    'WHERE s.id = $1 AND s.active IS TRUE', [sid]);
  const sc = (scRes && scRes.rows && scRes.rows[0]) || {};

  /* شمارشِ نقش‌ها — تجمیع در DB (ایندکس school_id, role) */
  const rolesRes = await read(
    "SELECT role, COUNT(*)::int AS n FROM users " +
    "WHERE school_id = $1 AND role IN ('student', 'teacher') GROUP BY role", [sid]);
  let studentCount = 0, teacherCount = 0;
  for(const r of ((rolesRes && rolesRes.rows) || [])){
    if(r.role === 'student') studentCount = Number(r.n) || 0;
    else if(r.role === 'teacher') teacherCount = Number(r.n) || 0;
  }

  /* شمارشِ کلاس‌ها */
  const clsRes = await read('SELECT COUNT(*)::int AS n FROM classes WHERE school_id = $1', [sid]);
  const classCount = Number((clsRes && clsRes.rows && clsRes.rows[0] && clsRes.rows[0].n)) || 0;

  /* جلسات: گروه‌بندی و «آخرین تاریخ» در DB؛ نه‌آرشیو همان falsyِ core است
     (شِما VARCHAR است: NULL یا رشتهٔ خالی ⇒ آرشیو نشده).
     MIN(id) ⇒ ترتیبِ «اولین ظهور» مثل core؛ COALESCE ⇒ type غایب = assoc. */
  const mtgRes = await read(
    "SELECT COALESCE(meeting_type, 'assoc') AS k, COUNT(*)::int AS n, MAX(meeting_date) AS last, MIN(id) AS first_id " +
    "FROM assoc_minutes WHERE school_id = $1 AND (archived IS NULL OR archived = '') " +
    "GROUP BY COALESCE(meeting_type, 'assoc') ORDER BY first_id", [sid]);
  const rows = (mtgRes && mtgRes.rows) || [];
  let meetings = rows.map(r => ({ key: r.k, n: Number(r.n) || 0, last: (r.last == null ? '' : String(r.last)) }));
  if(!meetings.some(m => m.key === 'assoc')){
    meetings = [{ key: 'assoc', n: 0, last: '' }].concat(meetings);   /* core: assoc همیشه حاضر */
  }

  const report = {
    sid: sid,
    name: sc.name || '',
    level: sc.level || '',
    city: sc.county_name || sc.city || '',
    students: studentCount,
    teachers: teacherCount,
    classes: classCount,
    meetings: meetings,
    goals: (Number(sc.public_goals) === 1 || sc.public_goals === true) ? String(sc.boom_goals || '').trim() : ''
  };
  return { ok: true, schools: list, report: report };
}

module.exports = { publicReportFromPg };

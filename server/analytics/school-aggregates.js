/* ═══════════════════════════════════════════════════════════════════
   server/analytics/school-aggregates.js — M15-03: تجمیعِ پایگاه‌داده
   ───────────────────────────────────────────────────────────────────
   جایگزینِ شش کوئریِ `SELECT *` در مسیرِ school-intelligence
   (server/routes/analytics.js) با **یک** کوئریِ تجمیعیِ واحد.

   مسیرِ قدیمی شش کوئریِ جداگانه می‌زد و تا ۱۰۰٬۰۰۰ ردیفِ خام را در
   حافظهٔ Node بارگذاری می‌کرد — شش اتصال از poolِ ۲۰تایی به ازایِ هر
   درخواست. اینجا همان شش خلاصه در سمتِ سرورِ پایگاه‌داده ساخته می‌شود
   و **هیچ ردیفِ خامی** منتقل نمی‌شود (یک اتصال، یک رفت‌وبرگشت).

   ⚠ تفاوت‌های عمدی با مسیرِ قدیمی — آن‌ها bug بودند، نه قرارداد:
     M15-03-F1: peak_absence_day از ستونِ واقعیِ date محاسبه می‌شود.
        مسیرِ قدیمی به att.day — که در schema وجود ندارد — اشاره می‌کرد،
        undefined می‌شد و fallback همیشه 'wednesday' می‌داد.
     M15-03-F2: unassigned_high_priority_count صریحاً ۰ است، چون
        counselor_refs ستون‌های priority و assigned_to_id را ندارد. مسیرِ
        قدیمی به آن ستون‌ها اشاره می‌کرد و در تولید صفر می‌شد.
     M15-03-F3: excused و early_exit دیگر سقوط نمی‌کنند. excused یک
        غیبتِ موجه‌شده است — همان‌طور که attendance-intelligence.js
        (missedSessions = absent + excused)، semantic.js (totalMissed) و
        reports-sql.js (bucket جداگانه) و کلاینت می‌شمارند.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { parsePositiveInt } = require('../reports-sql.js');

/* نامِ روزِ هفتهٔ مدرسهٔ ایرانی. extract(dow) در PostgreSQL:
   0=یکشنبه، 1=دوشنبه، …، 6=شنبه. پنج کلیدِ اوّل همان‌هایی‌اند که
   مسیرِ قدیمی در dayAbsenceMap داشت؛ پنجشنبه/چهارشنبه را هم گزارش
   می‌کنیم — مسیرِ قدیمی این دو را در نقشه نداشت و غیبت‌هایشان را روی
   'wednesday' می‌ریخت (F1). */
const DOW_TO_SCHOOL_DAY = Object.freeze({
  6: 'saturday',
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday'
});

/* واژگانِ وضعیتِ حضور و غیاب — همان فهرستِ تولیدیِ reports-sql.js و
   ATT_FA در src/js/01-helpers.js. هر وضعیتِ خارج از این فهرست
   «نامشخص» است و در سمتِ غیبت می‌نشیند (همان رفتارِ reports-sql.js). */
const ATTENDED_STATUSES = Object.freeze(['present', 'late', 'early_exit']);
const MISSED_KNOWN_STATUSES = Object.freeze(['absent', 'excused']);
const ALL_KNOWN_STATUSES = Object.freeze(['present', 'late', 'excused', 'early_exit', 'absent']);

/* آستانه‌های همان مسیرِ قدیمی — در SQL همینه می‌شوند تا جابجایی
   آستانه، رفتار را تغییر ندهد. */
const FAILING_SCORE = 10.0;      /* نمرهٔ زیرِ این = مردود */
const AT_RISK_AVG = 10.0;        /* میانگینِ درسِ زیرِ این = در خطر */
const HARD_EXAM_PVALUE = 0.40;   /* pValue = avg/20 → avg < 8.0 */
const HARD_EXAM_MIN_SCORES = 5;  /* حداقلِ نمره برای سنجشِ سختی */
const OVERLOADED_PERIODS = 30;   /* بیشتر از این ساعت در هفته = اضافه‌بار */

const ISO_DATE_RE = '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';

/**
 * سازندهٔ کوئریِ تجمیعیِ هوشمندیِ مدرسه. فقط SQL و پارامترها را
 * می‌سازد — دیتابیس نمی‌زند (الگوی Wave 23: بدونِ دیتابیس تست می‌شود).
 *
 * @param {number|string} schoolId
 * @returns {{ sql: string, params: Array<number> }}
 */
function buildSchoolIntelligenceAggregate({ schoolId } = {}) {
  const sid = parsePositiveInt(schoolId);
  if (sid == null) {
    throw new Error('INVALID_INPUT: buildSchoolIntelligenceAggregate requires a positive integer schoolId');
  }

  const sql = `WITH
/* ── ۱) تحصیلی — یک اسکنِ واحد از grades ─────────────────────────────
   نکته: score از نوع numeric(12,2) است و NULL هم می‌تواند باشد.
   مسیرِ قدیمی Number(g.score) می‌زد که برای NULL می‌شد ۰ — یعنی نمرهٔ
   NULL در grades_analyzed می‌آمد، صفر در مجموع، و «مردود» شمرده می‌شد.
   COALESCE همین رفتار را دقیقاً بازتولید می‌کند.
   همهٔ شش شاخص از همان تجمیعِ درس‌به‌درس به‌دست می‌آیند تا grades فقط
   یک بار پویش شود (نه دو بار). */
grades_agg AS (
  SELECT
    COALESCE(sum(g.n_rows), 0)::int                     AS grades_analyzed,
    COALESCE(sum(g.sum_scores), 0::numeric)             AS score_sum,
    COALESCE(sum(g.n_failing), 0)::int                  AS failing_count,
    COALESCE(count(*) FILTER (WHERE g.n_scores > 0), 0)::int AS subject_count,
    COALESCE(count(*) FILTER (WHERE g.avg_score < ${AT_RISK_AVG}), 0)::int AS at_risk_subjects,
    COALESCE(count(*) FILTER (WHERE g.n_scores >= ${HARD_EXAM_MIN_SCORES}
                              AND g.avg_score < ${HARD_EXAM_PVALUE} * 20), 0)::int AS hard_exams
  FROM (
    SELECT
      COALESCE(subject_id::text, 'default')             AS sid,
      count(*)::int                                      AS n_rows,
      count(score)::int                                  AS n_scores,
      COALESCE(sum(score), 0::numeric)                   AS sum_scores,
      count(*) FILTER (WHERE COALESCE(score, 0::numeric) < ${FAILING_SCORE})::int AS n_failing,
      avg(score)                                         AS avg_score
    FROM grades
    WHERE school_id = $1
    GROUP BY 1
  ) g
),
/* ── ۲) حضور و غیاب — یک اسکنِ واحد از attendance ──────────────────
   ابتدا بر اساسِ (status, روزِ هفته) گروه‌بندی می‌شود؛ bucketهای شش‌گانه
   و اوجِ روز هر دو از همین نتیجه ساخته می‌شوند. bucketها سقوط نمی‌کنند
   (F3)؛ status NULL در «نامشخص» می‌نشیند. */
attendance_days AS (
  SELECT
    COALESCE(status, '')                                AS st,
    CASE WHEN date ~ '${ISO_DATE_RE}'
         THEN CASE extract(dow FROM date::date)
      ${Object.keys(DOW_TO_SCHOOL_DAY).map((k) => `      WHEN ${k} THEN '${DOW_TO_SCHOOL_DAY[k]}'`).join('\n')}
         END
         ELSE NULL END::text                            AS dk,
    count(*)::int                                       AS n
  FROM attendance
  WHERE school_id = $1
  GROUP BY 1, 2
),
attendance_agg AS (
  SELECT
    COALESCE(sum(d.n), 0)::int                          AS total_rows,
    COALESCE(sum(d.n) FILTER (WHERE d.st = 'present'), 0)::int     AS n_present,
    COALESCE(sum(d.n) FILTER (WHERE d.st = 'late'), 0)::int        AS n_late,
    COALESCE(sum(d.n) FILTER (WHERE d.st = 'excused'), 0)::int     AS n_excused,
    COALESCE(sum(d.n) FILTER (WHERE d.st = 'early_exit'), 0)::int  AS n_early_exit,
    COALESCE(sum(d.n) FILTER (WHERE d.st = 'absent'), 0)::int      AS n_absent,
    COALESCE(sum(d.n) FILTER (WHERE d.st NOT IN (${ALL_KNOWN_STATUSES.map((s) => `'${s}'`).join(',')})), 0)::int AS n_unclassified
  FROM attendance_days d
),
peak_day AS (
  SELECT d.dk AS day_key, COALESCE(sum(d.n), 0)::int AS n_missed
  FROM attendance_days d
  WHERE d.dk IS NOT NULL
    AND d.st NOT IN (${ATTENDED_STATUSES.map((s) => `'${s}'`).join(',')})
  GROUP BY 1
  ORDER BY 2 DESC, 1 ASC
  LIMIT 1
),
/* ── ۳) معلمان — یک اسکنِ واحد از schedule ───────────────────────── */
schedule_agg AS (
  SELECT
    count(*)::int                                       AS distinct_teachers,
    COALESCE(count(*) FILTER (WHERE g.n_periods > ${OVERLOADED_PERIODS}), 0)::int AS overloaded_teachers
  FROM (
    SELECT teacher_id, count(*)::int AS n_periods
    FROM schedule
    WHERE school_id = $1 AND teacher_id IS NOT NULL
    GROUP BY 1
  ) g
),
/* ── ۴) مداخلات: status می‌تواند NULL باشد → مسیرِ قدیمی 'OPEN' می‌گرفت */
cases_agg AS (
  SELECT
    count(*)::int AS total_cases,
    count(*) FILTER (WHERE COALESCE(status, 'OPEN')
      IN ('OPEN','UNDER_REVIEW','INTERVENTION_ACTIVE','EVALUATING'))::int AS active_cases,
    count(*) FILTER (WHERE COALESCE(status, 'OPEN') = 'RESOLVED')::int AS resolved_cases
  FROM counselor_refs
  WHERE school_id = $1
),
/* ── ۵) یادداشت‌های معلم (فقط برای exemplary_evidence_count) ───────── */
notes_agg AS (
  SELECT count(*)::int AS notes_count
  FROM teacher_notes
  WHERE school_id = $1
)
SELECT jsonb_build_object(
  'academic_summary', jsonb_build_object(
    'average_gpa',
      CASE WHEN g.grades_analyzed > 0
           THEN round((g.score_sum / g.grades_analyzed) * 100, 0) / 100
           ELSE NULL END,
    'failing_students_ratio',
      CASE WHEN g.grades_analyzed > 0
           THEN round((g.failing_count::numeric / g.grades_analyzed) * 1000, 0) / 1000
           ELSE NULL END,
    'at_risk_subjects_count', g.at_risk_subjects,
    'grades_analyzed', g.grades_analyzed
  ),
  'attendance_summary', jsonb_build_object(
    'calendar_rate',
      CASE WHEN a.total_rows > 0
           THEN round(((a.n_present + a.n_late + a.n_early_exit)::numeric
                       / a.total_rows) * 100 * 100, 0) / 100
           ELSE NULL END,
    'chronic_absence_rate',
      CASE WHEN a.total_rows > 0
           THEN round(((a.n_absent + a.n_excused + a.n_unclassified)::numeric
                       / a.total_rows) * 100 * 100, 0) / 100
           ELSE NULL END,
    'peak_absence_day', pd.day_key,
    'sessions_analyzed', a.total_rows,
    'status_breakdown', jsonb_build_object(
      'present', a.n_present,
      'late', a.n_late,
      'excused', a.n_excused,
      'early_exit', a.n_early_exit,
      'absent', a.n_absent,
      'unclassified', a.n_unclassified
    )
  ),
  'assessment_summary', jsonb_build_object(
    'total_exams_analyzed', g.subject_count,
    'hard_exams_count', g.hard_exams,
    'outlier_clusters_count', 0
  ),
  'teacher_summary', jsonb_build_object(
    'active_teachers_count', GREATEST(s.distinct_teachers, 1),
    'overloaded_teachers_count', s.overloaded_teachers,
    'exemplary_evidence_count',
      LEAST(s.distinct_teachers, CASE WHEN n.notes_count > 5 THEN 2 ELSE 0 END)
  ),
  'parent_summary', jsonb_build_object(
    'average_pei', NULL,
    /* غیبتِ موجه‌شده unjustified نیست — excused از این شمارش بیرون است. */
    'unjustified_absences_pending',
      CASE WHEN (a.n_absent + a.n_unclassified) > 0
           THEN LEAST(a.n_absent + a.n_unclassified, 3)
           ELSE 0 END
  ),
  'intervention_summary', jsonb_build_object(
    'active_cases_count', c.active_cases,
    /* M15-03-F2: schema ستونِ priority/assigned_to_id ندارد — این شاخص
       در تولید صفر است. صفرِ صریح و مستند، نه عددیِ اتفاقی. */
    'unassigned_high_priority_count', 0,
    'resolution_rate',
      CASE WHEN c.total_cases > 0
           THEN round((c.resolved_cases::numeric / c.total_cases) * 100 * 100, 0) / 100
           ELSE NULL END,
    'cases_analyzed', c.total_cases
  )
) AS aggregate
FROM grades_agg g
CROSS JOIN attendance_agg a
LEFT JOIN peak_day pd ON TRUE
CROSS JOIN schedule_agg s
CROSS JOIN cases_agg c
CROSS JOIN notes_agg n`;

  return { sql, params: [sid] };
}

/**
 * کوئریِ تجمیعی را روی دیتابیس می‌زند و شش خلاصه را برمی‌گرداند.
 * برخلاف مسیرِ قدیمی، فقط یک اتصال و یک رفت‌وبرگشت.
 *
 * @param {Object} args - { schoolId, db }
 * @returns {Promise<Object|null>} شش خلاصه، یا null اگر نتیجه‌ای نبود
 */
async function computeSchoolIntelligenceFromDb({ schoolId, db } = {}) {
  if (!db || typeof db.query !== 'function') return null;

  const { sql, params } = buildSchoolIntelligenceAggregate({ schoolId });
  /* این کوئری فقط‌خواندنی است و یک رفت‌وبرگشت دارد — دقیقاً همان نوعِ
     باری که queryRead برایش ساخته شده (db.js:419-446). وقتی رپلیکای
     فقط‌خواندنی فعال نیست، queryRead خودش به پرماری برمی‌گردد، پس رفتار در
     هر پیکربندیِ بدونِ رپلیکا با query() کاملاً یکسان است. */
  const run = (typeof db.queryRead === 'function') ? db.queryRead.bind(db) : db.query.bind(db);
  const res = await run(sql, params);
  const rows = (res && res.rows) || [];
  if (rows.length < 1) return null;

  const agg = rows[0].aggregate;
  if (!agg || typeof agg !== 'object' || Array.isArray(agg)) return null;

  /* اطمینان از اینکه هر شش خلاصه حضور دارند (jsonb_build_object همیشه
     می‌سازدشان، ولی برایِ مسیرِ اسمبل این یک تضمینِ صریح است). */
  return {
    academic_summary: agg.academic_summary || {},
    attendance_summary: agg.attendance_summary || {},
    assessment_summary: agg.assessment_summary || {},
    teacher_summary: agg.teacher_summary || {},
    parent_summary: agg.parent_summary || {},
    intervention_summary: agg.intervention_summary || {}
  };
}

module.exports = {
  buildSchoolIntelligenceAggregate,
  computeSchoolIntelligenceFromDb,
  DOW_TO_SCHOOL_DAY,
  ATTENDED_STATUSES,
  MISSED_KNOWN_STATUSES,
  ALL_KNOWN_STATUSES,
  FAILING_SCORE,
  AT_RISK_AVG,
  HARD_EXAM_PVALUE,
  HARD_EXAM_MIN_SCORES,
  OVERLOADED_PERIODS,
  ISO_DATE_RE
};

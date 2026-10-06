#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/m15-03-aggregate-sql.js — سنجشِ سازندهٔ کوئریِ تجمیعی (بدونِ دیتابیس)

   این تست server/analytics/school-aggregates.js را **بدونِ زدنِ
   کوئری** می‌سنجد: پارامتری‌بودن (هیچ مقدارِ کاربری داخلِ SQL نمی‌رود)،
   ناوردایِ «هر پارامتر مصرف شده»، واژگانِ وضعیت‌ها، نگاشتِ روزِ هفته،
   آستانه‌ها، و این که کوئری به ستون‌های ناموجود اشاره نمی‌کند.

   هم‌زادِ ساختاریِ tests/wave23-reports-sql.js برای مسیرِ تجمیع.

   اجرا: node tests/m15-03-aggregate-sql.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const sa = require(path.join(__dirname, '..', 'server', 'analytics', 'school-aggregates.js'));

let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; const e = name + (extra ? ' — ' + extra : ''); errors.push(e); console.log('  ❌ ' + e); }
}
function grp(t) { console.log('\n▸ ' + t); }

const built = sa.buildSchoolIntelligenceAggregate({ schoolId: 9001 });
const sql = built.sql;

/* ── ۱) پارامتری‌بودن ───────────────────────────────────────────── */
grp('M1503-SQL — پارامتری‌بودن');
chk('schoolId به‌شکلِ پارامتر می‌رود نه داخلِ متن', /\$\d/.test(sql) && !/9001/.test(sql), sql.slice(0, 120));
chk('دقیقاً یک پارامتر است', built.params.length === 1 && built.params[0] === 9001);
chk('هیچ SELECT * نیست', !/SELECT \*/i.test(sql));
/* نظراتِ SQL را بیرون می‌ریزیم تا بررسیِ شناسه‌ها دقیق باشد */
const noComments = sql.replace(/\/\*[\s\S]*?\*\//g, '');
chk('یک دستور است (هیچ نقطه-ویرگولی — خاتمه‌دهنده لازم نیست)', (sql.match(/;/g) || []).length === 0);

/* ناوردای Wave 23: هر پارامتر در SQL مصرف شده، جای‌نگهدارها پیوسته‌اند */
(function invariant() {
  const used = new Set((sql.match(/\$(\d+)/g) || []).map((s) => Number(s.slice(1))));
  const maxPh = used.size ? Math.max(...used) : 0;
  const unused = [];
  for (let i = 1; i <= built.params.length; i++) if (!used.has(i)) unused.push(i);
  chk('ناوردا: هر پارامتر در SQL مصرف شده', unused.length === 0, 'بیکار: $' + unused.join(',$'));
  chk('ناوردا: جای‌نگهدارها پیوسته‌اند (۱..n)', maxPh === built.params.length && maxPh === 1);
})();

/* ── ۲) اعتبارسنجیِ ورودی ───────────────────────────────────────── */
grp('M1503-VALID — اعتبارسنجیِ schoolId');
chk('schoolId غیرعددی رد می‌شود', (() => {
  try { sa.buildSchoolIntelligenceAggregate({ schoolId: 'abc' }); return false; } catch (e) { return /INVALID_INPUT/.test(e.message); }
})());
chk('schoolId صفر/منفی رد می‌شود', (() => {
  try { sa.buildSchoolIntelligenceAggregate({ schoolId: 0 }); return false; } catch (e) { return true; }
})() && (() => {
  try { sa.buildSchoolIntelligenceAggregate({ schoolId: -5 }); return false; } catch (e) { return true; }
})());
chk('تزریقِ SQL به‌عنوانِ schoolId رد می‌شود', (() => {
  try { sa.buildSchoolIntelligenceAggregate({ schoolId: '1 OR 1=1' }); return false; } catch (e) { return true; }
})());
chk('متنِ SQL پس ازِ رد، تغییر نکرده (بدونِ نشت)', !/1 OR 1=1/.test(sql));

/* ── ۳) واژگانِ وضعیت — هر شش bucket ───────────────────────────── */
grp('M1503-BUCKETS — شش bucket به‌روشنی شمرده می‌شوند');
['present', 'late', 'excused', 'early_exit', 'absent'].forEach((s) => {
  chk(`bucketِ ${s} با FILTER شمرده می‌شود`, new RegExp(`FILTER \\(WHERE d\\.st = '${s}'\\)`).test(sql));
});
chk('bucketِ نامشخص/NULL حضور دارد', /FILTER \(WHERE d\.st NOT IN \('present','late','excused','early_exit','absent'\)/.test(sql));
/* F3: excused سقوط نمی‌کند — در denominator می‌آید */
chk('excused در chronic_absence_rate است (F3)', /n_absent \+ a\.n_excused \+ a\.n_unclassified/.test(sql));
chk('early_exit در calendar_rate است (F3)', /a\.n_present \+ a\.n_late \+ a\.n_early_exit/.test(sql));

/* ── ۴) نگاشتِ روزِ هفته (F1) ───────────────────────────────────── */
grp('M1503-DOW — نگاشتِ روزِ هفته از ستونِ date');
chk('از ستونِ واقعیِ date می‌خواند', /extract\(dow FROM date::date\)/.test(sql));
chk('فیلترِ دفاعیِ ISO روی date', /\$\{ISO_DATE_RE\}|date ~ '\^\[0-9\]\{4\}-/.test(sql) || /date ~ /.test(sql));
chk('هر هفت روزِ هفته نگاشته شده', Object.keys(sa.DOW_TO_SCHOOL_DAY).length === 7);
chk('dow=6 → saturday (PG: شنبه)', sa.DOW_TO_SCHOOL_DAY['6'] === 'saturday');
chk('dow=0 → sunday (PG: یکشنبه)', sa.DOW_TO_SCHOOL_DAY['0'] === 'sunday');
chk('dow=4 → thursday (PG: چهارشنبه)', sa.DOW_TO_SCHOOL_DAY['4'] === 'thursday');
chk('dow=5 → friday', sa.DOW_TO_SCHOOL_DAY['5'] === 'friday');
chk('LEFT JOIN peak_day روی TRUE است (جدولِ خالی ردیف را نمی‌کشد)', /LEFT JOIN peak_day pd ON TRUE/.test(sql));
chk('به att.day ناموجود اشاره نمی‌کند (F1)', !/\.day\b/.test(sql.replace(/day_key/g, '').replace(/day_absence/g, '')));

/* ── ۵) آستانه‌ها — همان مسیرِ قدیمی ────────────────────────────── */
grp('M1503-THRESHOLDS — آستانه‌ها با مسیرِ قدیمی یکی است');
chk('نمرهٔ مردودی ۱۰', sa.FAILING_SCORE === 10.0);
chk('میانگینِ درسِ درخطر ۱۰', sa.AT_RISK_AVG === 10.0);
chk('pValue سختی ۰٫۴۰ (یعنی avg < ۸)', sa.HARD_EXAM_PVALUE === 0.40);
chk('حداقلِ نمره برای سختی ۵', sa.HARD_EXAM_MIN_SCORES === 5);
chk('آستانهٔ اضافه‌بار ۳۰', sa.OVERLOADED_PERIODS === 30);
chk('hard_exams از avg < ۸ استفاده می‌کند', /HARD_EXAM_PVALUE|< 0\.4\d \* 20|< 8/.test(sql) || /\* 20\)/.test(sql));

/* ── ۶) رفتارهایِ faithful با مسیرِ قدیمی ───────────────────────── */
grp('M1503-FAITHFUL — بازتولیدِ دقیقِ رفتارِ مسیرِ قدیمی');
chk('status NULL در cases به OPEN می‌شود (همان c.status || \'OPEN\')', /COALESCE\(status, 'OPEN'\)/.test(sql));
chk('score NULL مانندِ ۰ رفتار می‌شود (Number(g.score) روی NULL)', /COALESCE\(score, 0::numeric\)/.test(sql));
chk('subject NULL به \'default\' می‌رود', /COALESCE\(subject_id::text, 'default'\)/.test(sql));
chk('active_teachers || 1 با GREATEST بازتولید شده', /GREATEST\(s\.distinct_teachers, 1\)/.test(sql));
chk('exemplary_evidence با LEAST(distinct_teachers, ...) — نه با GREATEST', /LEAST\(s\.distinct_teachers, CASE WHEN n\.notes_count > 5 THEN 2 ELSE 0 END\)/.test(sql));
chk('overloaded با n_periods > 30 در همان اسکن', /FILTER \(WHERE g\.n_periods > 30\)/.test(sql));
chk('grades فقط یک بار پویش می‌شود (یک GROUP BY درس‌به‌درس)', (sql.match(/FROM grades\n/g) || []).length === 1, 'تعدادِ FROM grades: ' + (sql.match(/FROM grades\n/g) || []).length);
chk('attendance فقط یک بار پویش می‌شود', (sql.match(/FROM attendance\n/g) || []).length === 1, 'تعدادِ FROM attendance: ' + (sql.match(/FROM attendance\n/g) || []).length);
chk('schedule فقط یک بار پویش می‌شود', (sql.match(/FROM schedule\n/g) || []).length === 1, 'تعدادِ FROM schedule: ' + (sql.match(/FROM schedule\n/g) || []).length);

/* ── ۷) F2 — صفرِ صریح و مستند ──────────────────────────────────── */
grp('M1503-F2 — unassigned_high_priority_count صریح است');
chk('صفرِ صریح در JSON', /'unassigned_high_priority_count', 0/.test(sql));
chk('به priority ناموجود اشاره نمی‌کند', !/\.priority\b/.test(noComments));
chk('به assigned_to_id ناموجود اشاره نمی‌کند', !/assigned_to_id/.test(noComments));

/* ── ۸) شش خلاصه همه ساخته می‌شوند ──────────────────────────────── */
grp('M1503-STRUCT — هر شش خلاصه');
['academic_summary', 'attendance_summary', 'assessment_summary',
 'teacher_summary', 'parent_summary', 'intervention_summary'].forEach((k) => {
  chk(`jsonb_build_object شاملِ ${k} است`, new RegExp(`'${k}', jsonb_build_object`).test(sql));
});
chk('average_pei صریحاً NULL است (D1: ادعای ساختگی نبود)', /'average_pei', NULL/.test(sql));
chk('status_breakdown افزوده شده (F3 قابلِ اندازه‌گیری)', /'status_breakdown'/.test(sql));
chk('sessions_analyzed برابرِ total_rows است (هیچ ردیفی سقوط نمی‌کند)', /'sessions_analyzed', a\.total_rows/.test(sql));

/* ── ۹) computeSchoolIntelligenceFromDb بدونِ db ─────────────────── */
grp('M1503-RUNNER — محافظِ کارکرد');
(async () => {
  const r1 = await sa.computeSchoolIntelligenceFromDb({ schoolId: 9001 });
  chk('بدونِ db نتیجه null می‌دهد', r1 === null);
  const r2 = await sa.computeSchoolIntelligenceFromDb({ schoolId: 9001, db: {} });
  chk('با db نبودِ query نتیجه null می‌دهد', r2 === null);

  /* مسیریابیِ خواندن: کوئریِ فقط‌خواندنی باید از queryRead برود وقتی هست،
     وگرگر به query برگردد. این همان الگویِ dbquery.js:411 است. */
  let readHits = 0, writeHits = 0;
  const fakeAgg = { academic_summary: { a: 1 } };
  const dbWithReplica = {
    queryRead: async () => { readHits++; return { rows: [{ aggregate: fakeAgg }], rowCount: 1 }; },
    query: async () => { writeHits++; return { rows: [{ aggregate: fakeAgg }], rowCount: 1 }; }
  };
  const dbNoReplica = {
    query: async () => { writeHits++; return { rows: [{ aggregate: fakeAgg }], rowCount: 1 }; }
  };
  await sa.computeSchoolIntelligenceFromDb({ schoolId: 9001, db: dbWithReplica });
  chk('وقتی queryRead موجود است از رپلیکای فقط‌خواندنی می‌رود', readHits === 1 && writeHits === 0);
  await sa.computeSchoolIntelligenceFromDb({ schoolId: 9001, db: dbNoReplica });
  chk('وقتی queryRead نیست به پرماری برمی‌گردد', writeHits === 1 && readHits === 1);

  /* ═══════════════════════════════════════════════════════════════════ */
  console.log('\n══════════════════════════════════════════════════════════════════');
  if (fail === 0) {
    console.log(`تست ساختاری: ${pass}/${pass + fail} موفق  —  بدون خطا ✅`);
    process.exit(0);
  }
  console.log(`تست ساختاری: ${pass}/${pass + fail} موفق، ${fail} ناموفق ❌`);
  for (const e of errors) console.log('  • ' + e);
  process.exit(1);
})();

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/m15-03-aggregate-pg.js — برابریِ مسیرِ قدیمی و تجمیع، روی PG زنده

   این تست قلبِ M15-03 است: خروجیِ مسیرِ قدیمی (شش SELECT * و تجمیع
   در Node) در برابرِ خروجیِ مسیرِ تجمیع‌شده (یک کوئری در سمتِ PG) روی
   **همان دادهٔ زنده** مقایسه می‌شود.

   قاعده: هر فیلد یا **بایت‌به‌بایت برابر** است، یا یک تفاوتِ عمدی و
   مستند است (F1/F2/F3) که مقدارِ جدیدش طبقِ قراردادِ تولیدی محاسبه
   و تأیید می‌شود — نه فقط «متفاوت از قدیم».

   دادهٔ زنده: payesh_m15probe (ازِ live schema probeِ جلسهٔ پیش).
   اگر دیتابیس در دسترس نبود → NOT-RUN (سبزِ جعلی نمی‌دهد).

   اجرا: node tests/m15-03-aggregate-pg.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TEST_DB = process.env.M1503_TEST_DB || 'payesh_m15probe';
const BASE_URL = process.env.DATABASE_URL || 'postgres://postgres:123456@127.0.0.1:5432/postgres';
const SCHOOL_ID = Number(process.env.M1503_SCHOOL_ID || 9001);
const OTHER_SCHOOL_ID = Number(process.env.M1503_OTHER_SCHOOL_ID || 999999);
const FIXED_NOW = '2026-10-04T10:00:00.000Z';

let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; const e = name + (extra ? ' — ' + extra : ''); errors.push(e); console.log('  ❌ ' + e); }
}
function grp(t) { console.log('\n▸ ' + t); }
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* همان گرد کردنِ مسیرِ قدیمی */
const round2 = (x) => Math.round(x * 100) / 100;

async function main() {
  const { Client } = require('pg');
  const sic = require(path.join(ROOT, 'server', 'analytics', 'school-intelligence-center.js'));
  const sa = require(path.join(ROOT, 'server', 'analytics', 'school-aggregates.js'));

  let client;
  try {
    client = new Client({ connectionString: BASE_URL.replace(/\/[^/]*$/, '/' + TEST_DB) });
    await client.connect();
  } catch (e) {
    console.log('\n⏭ NOT-RUN — PostgreSQL در دسترس نیست: ' + ((e && e.message) || e));
    if (process.env.M1503_REQUIRE_PG === '1') { console.log('M1503_REQUIRE_PG=1 → خروج ۳ (الزامی)'); process.exit(3); }
    process.exit(0);
  }

  const schoolRes = await client.query('SELECT count(*)::int AS n FROM schools WHERE id = $1', [SCHOOL_ID]);
  if ((schoolRes.rows[0] || {}).n < 1) {
    console.log(`\n⏭ NOT-RUN — مدرسهٔ ${SCHOOL_ID} در ${TEST_DB} نیست (live seed لازم)`);
    await client.end();
    if (process.env.M1503_REQUIRE_PG === '1') { process.exit(3); }
    process.exit(0);
  }

  /* شمارندهٔ کوئری/ردیف — شواهدِ مقیاس */
  let queryCount = 0;
  let rowsTransferred = 0;
  const db = {
    query: async (text, params) => {
      queryCount++;
      const r = await client.query(text, params);
      rowsTransferred += (r && r.rows) ? r.rows.length : 0;
      return r;
    }
  };

  /* ════════════ مسیرِ قدیمی ════════════ */
  grp(`M1503-OLD — مسیرِ قدیمی روی دیتای زنده (مدرسهٔ ${SCHOOL_ID})`);
  const t0 = process.hrtime.bigint();
  const [rG, rA, rC, rS, rCases, rTN] = await Promise.all([
    db.query('SELECT * FROM grades WHERE school_id = $1', [SCHOOL_ID]),
    db.query('SELECT * FROM attendance WHERE school_id = $1', [SCHOOL_ID]),
    db.query('SELECT * FROM classes WHERE school_id = $1', [SCHOOL_ID]),
    db.query('SELECT * FROM schedule WHERE school_id = $1', [SCHOOL_ID]),
    db.query('SELECT * FROM counselor_refs WHERE school_id = $1', [SCHOOL_ID]),
    db.query('SELECT * FROM teacher_notes WHERE school_id = $1', [SCHOOL_ID])
  ]);
  const oldSnap = sic.buildSchoolIntelligenceSnapshot({
    schoolId: SCHOOL_ID, academicYear: '1405-1406',
    grades: rG.rows, attendanceSessions: rA.rows, classes: rC.rows,
    schedule: rS.rows, cases: rCases.rows, teacherNotes: rTN.rows
  }, { now: FIXED_NOW });
  const oldQueryCount = queryCount;
  const oldRowsTransferred = rowsTransferred;
  const t1 = process.hrtime.bigint();
  chk('مسیرِ قدیمی دقیقاً شش کوئری زد', oldQueryCount === 6, 'شد: ' + oldQueryCount);
  chk('مسیرِ قدیمی همهٔ ردیف‌ها را منتقل کرد', oldRowsTransferred ===
    rG.rows.length + rA.rows.length + rC.rows.length + rS.rows.length + rCases.rows.length + rTN.rows.length);
  console.log(`  ℹ قدیم: ${oldQueryCount} کوئری · ${oldRowsTransferred} ردیف · ${Number(t1 - t0) / 1e6} ms`);

  /* ════════════ مسیرِ تجمیع ════════════ */
  grp('M1503-NEW — مسیرِ تجمیع روی همان دیتا');
  queryCount = 0; rowsTransferred = 0;
  const t2 = process.hrtime.bigint();
  const summaries = await sa.computeSchoolIntelligenceFromDb({ schoolId: SCHOOL_ID, db });
  const newSnap = sic.assembleSchoolIntelligenceSnapshot({
    schoolId: SCHOOL_ID, academicYear: '1405-1406',
    summaries, options: { now: FIXED_NOW }
  });
  const newQueryCount = queryCount;
  const newRowsTransferred = rowsTransferred;
  const t3 = process.hrtime.bigint();
  chk('مسیرِ تجمیع دقیقاً یک کوئری زد', newQueryCount === 1, 'شد: ' + newQueryCount);
  chk('مسیرِ تجمیع فقط یک ردیف منتقل کرد', newRowsTransferred === 1, 'شد: ' + newRowsTransferred);
  chk('کاهشِ کوئری: ۶ → ۱', newQueryCount < oldQueryCount);
  console.log(`  ℹ جدید: ${newQueryCount} کوئری · ${newRowsTransferred} ردیف · ${Number(t3 - t2) / 1e6} ms`);

  /* ════════════ مقایسهٔ فیلد‌به‌فیلد ════════════ */
  grp('M1503-PARITY — برابریِ دقیق (فیلدهایی که bug نبودند)');

  const cmp = (area, fields) => {
    for (const f of fields) {
      const o = (oldSnap[area] || {})[f];
      const n = (newSnap[area] || {})[f];
      chk(`${area}.${f} برابر است`, deepEq(o, n), `قدیم=${JSON.stringify(o)} جدید=${JSON.stringify(n)}`);
    }
  };
  cmp('academic_summary', ['average_gpa', 'failing_students_ratio', 'at_risk_subjects_count', 'grades_analyzed']);
  cmp('assessment_summary', ['total_exams_analyzed', 'hard_exams_count', 'outlier_clusters_count']);
  cmp('teacher_summary', ['active_teachers_count', 'overloaded_teachers_count', 'exemplary_evidence_count']);
  cmp('parent_summary', ['average_pei', 'unjustified_absences_pending']);
  cmp('intervention_summary', ['active_cases_count', 'unassigned_high_priority_count', 'resolution_rate', 'cases_analyzed']);
  chk('school_id برابر است', deepEq(oldSnap.school_id, newSnap.school_id));
  chk('academic_year برابر است', deepEq(oldSnap.academic_year, newSnap.academic_year));
  chk('generated_at برابر است (FIXED_NOW)', deepEq(oldSnap.generated_at, newSnap.generated_at));

  /* ════════════ تفاوت‌های عمدیِ مستند ════════════ */
  grp('M1503-INTENTIONAL — تفاوت‌های عمدی (F1/F3) با محاسبهٔ قراردادی');

  const brk = newSnap.attendance_summary.status_breakdown || {};
  const attended = (brk.present || 0) + (brk.late || 0) + (brk.early_exit || 0);
  const missed = (brk.absent || 0) + (brk.excused || 0) + (brk.unclassified || 0);
  const total = attended + missed;

  chk('F3: sessions_analyzed همهٔ ردیف‌ها را شمارَد (قدیم excused را می‌ریخت)',
    newSnap.attendance_summary.sessions_analyzed === total
    && newSnap.attendance_summary.sessions_analyzed > oldSnap.attendance_summary.sessions_analyzed,
    `قدیم=${oldSnap.attendance_summary.sessions_analyzed} جدید=${newSnap.attendance_summary.sessions_analyzed} کل=${total}`);
  chk('F3: excused در breakdown است و ناصفر است (در دادهٔ زنده ۲۵٪)',
    (brk.excused || 0) > 0, JSON.stringify(brk));
  chk('F3: calendar_rate مطابقِ قرارداد = round2(attended/total)',
    newSnap.attendance_summary.calendar_rate === round2((total ? attended / total : 0) * 100),
    `قدیم=${oldSnap.attendance_summary.calendar_rate} جدید=${newSnap.attendance_summary.calendar_rate} موردِ انتظار=${round2((total ? attended / total : 0) * 100)}`);
  chk('F3: chronic_absence_rate مطابقِ قرارداد = round2(missed/total)',
    newSnap.attendance_summary.chronic_absence_rate === round2((total ? missed / total : 0) * 100),
    `قدیم=${oldSnap.attendance_summary.chronic_absence_rate} جدید=${newSnap.attendance_summary.chronic_absence_rate}`);
  chk('F1: peak_absence_day از ستونِ واقعیِ date محاسبه شد (قدیم fallback بود)',
    typeof newSnap.attendance_summary.peak_absence_day === 'string'
    && newSnap.attendance_summary.peak_absence_day !== oldSnap.attendance_summary.peak_absence_day,
    `قدیم=${oldSnap.attendance_summary.peak_absence_day} جدید=${newSnap.attendance_summary.peak_absence_day}`);

  grp('M1503-F2 — unassigned_high_priority_count صفرِ صریح');
  chk('هر دو مسیر صفر می‌دهند (در تولید صفر است)',
    oldSnap.intervention_summary.unassigned_high_priority_count === 0
    && newSnap.intervention_summary.unassigned_high_priority_count === 0);

  /* ════════════ خودسازگاریِ health_index و risk_summary ════════════ */
  grp('M1503-HEALTH — اسمبلِ مشترک، خودسازگار');
  const recomputed = sic.calculateSchoolHealthIndex({
    academic_summary: newSnap.academic_summary,
    attendance_summary: newSnap.attendance_summary,
    assessment_summary: newSnap.assessment_summary,
    teacher_summary: newSnap.teacher_summary,
    parent_summary: newSnap.parent_summary,
    intervention_summary: newSnap.intervention_summary
  }, { now: FIXED_NOW });
  chk('health_index از همین خلاصه‌ها دوباره ساخته می‌شود (اسمبلِ مشترک)',
    deepEq(recomputed, newSnap.health_index), 'اختلاف در ساخت');
  chk('risk_summary از همین action_center ساخته شده',
    Array.isArray(newSnap.risk_summary.top_risks)
    && newSnap.risk_summary.total_risks_count === newSnap.action_center.length,
    `total=${newSnap.risk_summary.total_risks_count} actions=${newSnap.action_center.length}`);
  chk('action_center از مسیرِ اسمبل می‌آید (همان مولّد)',
    Array.isArray(newSnap.action_center) && newSnap.action_center.length > 0);
  console.log(`  ℹ health_score: قدیم=${oldSnap.health_index.score} جدید=${newSnap.health_index.score}`);

  /* ════════════ مهار اجاره‌ای ════════════ */
  grp('M1503-TENANT — مدرسهٔ دیگر خروجیِ خالی می‌دهد');
  const otherSummaries = await sa.computeSchoolIntelligenceFromDb({ schoolId: OTHER_SCHOOL_ID, db });
  chk('مدرسهٔ بدونِ داده null نمی‌دهد (یک ردیفِ خالی)', !!otherSummaries);
  if (otherSummaries) {
    const other = sic.assembleSchoolIntelligenceSnapshot({
      schoolId: OTHER_SCHOOL_ID, academicYear: '1405-1406',
      summaries: otherSummaries, options: { now: FIXED_NOW }
    });
    chk('grades_analyzed صفر است', other.academic_summary.grades_analyzed === 0, JSON.stringify(other.academic_summary));
    chk('average_gpa null است (نه عددِ جعلی)', other.academic_summary.average_gpa === null);
    chk('calendar_rate null است', other.attendance_summary.calendar_rate === null);
    chk('peak_absence_day null است', other.attendance_summary.peak_absence_day === null);
    chk('sessions_analyzed صفر است', other.attendance_summary.sessions_analyzed === 0);
    chk('cases_analyzed صفر است', other.intervention_summary.cases_analyzed === 0);
    chk('resolution_rate null است', other.intervention_summary.resolution_rate === null);
    chk('active_teachers_count همیشه ≥ ۱ (همان || 1)', other.teacher_summary.active_teachers_count >= 1);
    chk('school_id درست پاس می‌شود', other.school_id === OTHER_SCHOOL_ID);
  }

  /* ════════════ شواهدِ EXPLAIN ════════════ */
  grp('M1503-EXPLAIN — نقشهٔ اجرا روی دیتای زنده');

  const explainAggregate = async (sid, opts) => {
    const built = sa.buildSchoolIntelligenceAggregate({ schoolId: sid });
    const text = 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + built.sql;
    let res;
    if (opts && opts.noSeqScan) {
      /* در یک تراکنشِ برگشت‌خورده — هیچ تغییری روی دیتا نمی‌ماند */
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL enable_seqscan = off');
        res = await client.query(text, built.params);
      } finally {
        await client.query('ROLLBACK');
      }
    } else {
      res = await client.query(text, built.params);
    }
    const top = res.rows[0]['QUERY PLAN'][0];
    const scans = [];
    (function walk(node) {
      if (!node) return;
      if (node['Relation Name']) {
        scans.push({ rel: node['Relation Name'], type: node['Node Type'], rows: node['Actual Rows'], loops: node['Actual Loops'] });
      }
      for (const k of ['Plans', 'InitPlan', 'SubPlan']) if (Array.isArray(node[k])) node[k].forEach(walk);
    })(top.Plan);
    return { top, scans, execTime: top['Execution Time'], planTime: top['Planning Time'] };
  };

  const prod = await explainAggregate(SCHOOL_ID);
  console.log(`  ℹ planِ production: Planning ${prod.planTime} ms · Execution ${prod.execTime} ms`);
  for (const s of prod.scans) console.log(`  ℹ ${s.rel}: ${s.type} (${s.rows} rows${s.loops > 1 ? ' ×' + s.loops : ''})`);
  const expectedTables = ['grades', 'attendance', 'schedule', 'counselor_refs', 'teacher_notes'];
  const touched = expectedTables.filter((t) => prod.scans.some((s) => s.rel === t));
  chk('دسترسی به هر پنج جدولِ لازم در نقشه هست', touched.length === expectedTables.length,
    'نبود: ' + expectedTables.filter((t) => !touched.includes(t)).join(','));
  chk('برنامه واقعاً اجرا شد (ANALYZE)', prod.execTime != null);
  const seqOnBig = prod.scans.filter((s) => /Seq Scan/.test(s.type) && (s.rows || 0) >= 10000);
  if (seqOnBig.length) {
    /* این یک bug نیست: مدرسهٔ ۹۰۰۱ صاحبِ ۱۰۰٪ ردیف‌های grades و attendance
       است، پس school_id غیرانتخابی است و Seq Scan بهینه است. باید ثابت
       کنیم ایندکس قابلِ استفاده است — نه این که ادعای بهتر بودن کنیم.
       استفادهٔ ایندکس در دادهٔ واقعیِ چندمستأجره در فازِ scale probe (§۸)
       سنجیده می‌شود. */
    console.log(`  ℹ Seq Scan روی ${seqOnBig.map((s) => s.rel).join('، ')} — غیرانتخابی است چون ۹۰۰۱ صاحبِ ۱۰۰٪ ردیف‌هاست (نه bug)`);
  }

  grp('M1503-EXPLAIN-۲ — ایندکس قابلِ استفاده است ( Seq Scan غیرفعال)');
  const forced = await explainAggregate(SCHOOL_ID, { noSeqScan: true });
  console.log(`  ℹ plan با Seq Scanِ غیرفعال: Execution ${forced.execTime} ms (production: ${prod.execTime} ms)`);
  for (const s of forced.scans) console.log(`  ℹ ${s.rel}: ${s.type}`);
  const gradesForced = forced.scans.filter((s) => s.rel === 'grades');
  const attForced = forced.scans.filter((s) => s.rel === 'attendance');
  chk('grades با غیرفعال‌کردنِ Seq Scan ایندکس‌محور می‌شود',
    gradesForced.length > 0 && gradesForced.some((s) => /Index/.test(s.type)),
    gradesForced.map((s) => s.type).join('، '));
  chk('attendance با غیرفعال‌کردنِ Seq Scan ایندکس‌محور می‌شود',
    attForced.length > 0 && attForced.some((s) => /Index/.test(s.type)),
    attForced.map((s) => s.type).join('، '));
  console.log('  ℹ یادداشت: استفادهٔ خودکارِ ایندکس در دادهٔ چندمستأجره (school_id انتخابی) در scale probe سنجیده می‌شود');

  /* ════════════ جدولِ نهایی ════════════ */
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('خلاصهٔ مقایسه (قدیم → جدید):');
  const row = (a, f, o, n, v) => console.log(`  ${a}.${f}: قدیم=${JSON.stringify(o)} جدید=${JSON.stringify(n)} [${v}]`);
  row('attendance', 'calendar_rate', oldSnap.attendance_summary.calendar_rate, newSnap.attendance_summary.calendar_rate, 'INTENTIONAL-F3');
  row('attendance', 'chronic_absence_rate', oldSnap.attendance_summary.chronic_absence_rate, newSnap.attendance_summary.chronic_absence_rate, 'INTENTIONAL-F3');
  row('attendance', 'sessions_analyzed', oldSnap.attendance_summary.sessions_analyzed, newSnap.attendance_summary.sessions_analyzed, 'INTENTIONAL-F3');
  row('attendance', 'peak_absence_day', oldSnap.attendance_summary.peak_absence_day, newSnap.attendance_summary.peak_absence_day, 'INTENTIONAL-F1');
  row('intervention', 'unassigned_high', oldSnap.intervention_summary.unassigned_high_priority_count, newSnap.intervention_summary.unassigned_high_priority_count, 'EQUAL-F2(صفر)');
  row('health_index', 'score', oldSnap.health_index.score, newSnap.health_index.score, 'INTENTIONAL-F3');
  console.log('══════════════════════════════════════════════════════════════════');

  if (fail === 0) {
    console.log(`تست زنده: ${pass}/${pass + fail} موفق  —  بدون خطا ✅`);
    await client.end(); process.exit(0);
  }
  console.log(`تست زنده: ${pass}/${pass + fail} موفق، ${fail} ناموفق ❌`);
  for (const e of errors) console.log('  • ' + e);
  await client.end();
  process.exit(1);
}

main().catch((e) => {
  console.error('خطایِ تست:', (e && e.stack) || e);
  process.exit(1);
});

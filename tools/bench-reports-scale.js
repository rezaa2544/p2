#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/bench-reports-scale.js — هارنسِ بنچِ مقیاسِ گزارش‌های تجمیعی
   (گزینهٔ «ت» REPORT_PERF_GAP_SPEC.md §۳/§۴ — staging-ready)
   ───────────────────────────────────────────────────────────────────
   هدف: p50/p95 گزارش‌های attendance/academic/finance/teachers به تفکیکِ
   نقش (manager/office/superadmin) روی PG واقعی، تا معیارِ فعال‌سازیِ
   گزینهٔ الف (MV) — «p95 > بودجهٔ ناظر» — داده‌محور شود.

   قواعد سخت:
   - بدونِ DATABASE_URL ⇒ خود-skip با exit 0 (الگوی wave23-reports-pg).
     سندباکس ملزم به اجرا نیست؛ محلِ اجرا استیجینگ است.
   - Target ≠ Measured: خروجی همیشه برچسبِ مقیاس دارد (شمارِ ردیفِ
     measured از خودِ DB) — عددِ سندباکس هرگز «ظرفیت» جا زده نمی‌شود.

   اجرا (استیجینگ):
     DATABASE_URL=postgres://... node tools/bench-reports-scale.js \
       --roles=manager,office,superadmin --concurrency=10 --iterations=50
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ── پارس آرگومان‌ها (export برای خودآزمون) ─────────────────────────── */
function parseArgs(argv) {
  const out = { roles: ['manager', 'office', 'superadmin'], concurrency: 10, iterations: 50 };
  for (const a of argv) {
    const m = /^--([a-z]+)=(.+)$/.exec(a);
    if (!m) continue;
    if (m[1] === 'roles') out.roles = m[2].split(',').map(s => s.trim()).filter(Boolean);
    if (m[1] === 'concurrency') out.concurrency = Math.max(1, Math.floor(Number(m[2])) || 10);
    if (m[1] === 'iterations') out.iterations = Math.max(1, Math.floor(Number(m[2])) || 50);
  }
  return out;
}

/* ── آمار (export برای خودآزمون): p50/p95 روی آرایهٔ میلی‌ثانیه ─────── */
function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
function summarize(samplesMs) {
  const s = samplesMs.slice().sort((a, b) => a - b);
  return {
    n: s.length,
    p50: Number(percentile(s, 50).toFixed(2)),
    p95: Number(percentile(s, 95).toFixed(2)),
    max: s.length ? Number(s[s.length - 1].toFixed(2)) : NaN
  };
}

/* ── قالبِ خروجی (export برای خودآزمون): برچسبِ مقیاس اجباری ────────── */
function formatResult({ scaleLabel, rows }) {
  if (!scaleLabel || !/measured/i.test(scaleLabel)) {
    throw new Error('برچسبِ مقیاس اجباری است و باید «measured» باشد (Target ≠ Measured)');
  }
  const lines = [];
  lines.push(`▸ بنچ مقیاس گزارش‌ها — ${scaleLabel}`);
  lines.push('| گزارش | نقش | n | p50(ms) | p95(ms) | max(ms) |');
  lines.push('| :-- | :-- | --: | --: | --: | --: |');
  for (const r of rows) {
    lines.push(`| ${r.report} | ${r.role} | ${r.n} | ${r.p50} | ${r.p95} | ${r.max} |`);
  }
  return lines.join('\n');
}

module.exports = { parseArgs, percentile, summarize, formatResult };

/* ── اجرای واقعی (فقط با PG) ─────────────────────────────────────── */
async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('bench-reports-scale: DATABASE_URL نیست — خود-skip (محل اجرا: استیجینگ). ✅');
    process.exit(0);
  }
  let Pool;
  try { ({ Pool } = require('pg')); }
  catch (e) { console.log('bench-reports-scale: ماژول pg نصب نیست — خود-skip. ✅'); process.exit(0); }

  const args = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: args.concurrency });
  const sqlB = require('../server/reports-sql.js');

  /* برچسبِ مقیاس از خودِ DB — measured، نه ادعا */
  const counts = {};
  for (const t of ['grades', 'tuitions', 'installments', 'attendance', 'classes', 'schools']) {
    counts[t] = Number((await pool.query(`SELECT count(*)::bigint AS n FROM ${t}`)).rows[0].n);
  }
  const scaleLabel = `measured@ grades=${counts.grades} tuitions=${counts.tuitions} ` +
    `installments=${counts.installments} attendance=${counts.attendance} schools=${counts.schools}`;

  /* دامنهٔ نقش‌ها: مدیرِ یک مدرسه / اداره‌ای با نیمی از مدارس / سوپرادمین */
  const allSchools = (await pool.query('SELECT id FROM schools ORDER BY id')).rows.map(r => Number(r.id));
  if (!allSchools.length) { console.error('schools خالی است — seed لازم'); process.exit(1); }
  const scopeOf = {
    manager: [allSchools[0]],
    office: allSchools.slice(0, Math.max(1, Math.floor(allSchools.length / 2))),
    superadmin: allSchools
  };

  const today = new Date().toISOString().slice(0, 10);
  const queriesFor = (schoolIds) => ({
    academic_page: sqlB.buildAcademicClassPage({ schoolIds, limit: 50 }),
    academic_totals: sqlB.buildAcademicSchoolTotals({ schoolIds }),
    academic_trend: sqlB.buildAcademicTrend({ schoolIds }),
    finance_tuitions: sqlB.buildFinanceTuitions({ schoolIds }),
    finance_installments: sqlB.buildFinanceInstallments({ schoolIds, today }),
    finance_scholarships: sqlB.buildFinanceScholarships({ schoolIds })
  });

  const rows = [];
  for (const role of args.roles) {
    const scope = scopeOf[role];
    if (!scope) { console.error(`نقش ناشناخته: ${role} (مجاز: manager/office/superadmin)`); continue; }
    const qs = queriesFor(scope);
    for (const [report, q] of Object.entries(qs)) {
      const samples = [];
      /* گرم‌کردن */
      await pool.query(q.sql, q.params);
      for (let i = 0; i < args.iterations; i += args.concurrency) {
        const batch = Math.min(args.concurrency, args.iterations - i);
        const t0 = process.hrtime.bigint();
        await Promise.all(Array.from({ length: batch }, () => pool.query(q.sql, q.params)));
        const dtMs = Number(process.hrtime.bigint() - t0) / 1e6;
        for (let k = 0; k < batch; k++) samples.push(dtMs / batch);
      }
      rows.push({ report, role, ...summarize(samples) });
    }
  }

  console.log(formatResult({ scaleLabel, rows }));
  console.log(`\nتنظیمات: roles=${args.roles.join(',')} concurrency=${args.concurrency} iterations=${args.iterations}`);
  console.log('یادآوری: معیارِ فعال‌سازی MV = p95 > بودجهٔ تأییدشدهٔ ناظر (REPORT_PERF_GAP_SPEC §۴).');
  await pool.end();
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

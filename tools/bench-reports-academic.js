#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/bench-reports-academic.js — سنجهٔ پیش/پسِ گزارشِ پیشرفت تحصیلی

   سازندهٔ SQLِ گزارشِ تحصیلی پیش‌تر `mx` (کستِ محافظت‌شدهٔ grades.max_score)
   را درونِ NORM_EXPR درج می‌کرد، پس PostgreSQL برای هر ردیف دو بار regex و سه
   بار کستِ numeric را دوباره اجرا می‌کرد. این ابزار همان داده را یک بار می‌سازد
   و هر دو شکل را روی یک PostgreSQLِ **واقعی** اندازه می‌گیرد:

     • میانه/کمینه/صدک۹۵ برای هر سه کوئریِ تحصیلی
     • EXPLAIN (ANALYZE, BUFFERS) سازندهٔ جمعِ مدرسه‌ها
     • شمارشِ دفعاتِ اجرای regex/کست در SQLِ تولیدشده (شاهدِ ساختاری)

   هیچ عددی حدس زده نمی‌شود؛ هر عدد از اجرای واقعی می‌آید.

   اجرا:
     DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
       node tools/bench-reports-academic.js [rows] [iterations]
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const BASE_URL = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/postgres';
const DB = process.env.WAVE23_ACADEMIC_DB || 'payesh_w23_academic_bench';
const ROWS = Number(process.argv[2] || process.env.WAVE23_ROWS || 200000);
const ITER = Number(process.argv[3] || 30);
const N_SCHOOLS = 20, N_CLASSES = 200, N_STUDENTS = 2000;

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { min: s[0], med: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] };
};
const f = (n) => n.toFixed(2);

async function main() {
  const { Client } = require('pg');
  const rs = require(path.join(ROOT, 'server', 'reports-sql.js'));

  const admin = new Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  const c = new Client({ connectionString: BASE_URL.replace(/\/[^/]*$/, '/' + DB) });
  await c.connect();
  const migs = fs.readdirSync(path.join(ROOT, 'migrations'))
    .filter((x) => x.endsWith('.sql') && !x.endsWith('.down.sql')).sort();
  for (const m of migs) await c.query(fs.readFileSync(path.join(ROOT, 'migrations', m), 'utf8'));

  await c.query(`INSERT INTO schools (id,name,type,version) SELECT g,'مدرسهٔ '||g,'governmental',1 FROM generate_series(1,$1) g`, [N_SCHOOLS]);
  await c.query(`INSERT INTO classes (id,school_id,name,grade,version) SELECT g,1+((g-1)%$1),'کلاس '||g,7+((g-1)%6),1 FROM generate_series(1,$2) g`, [N_SCHOOLS, N_CLASSES]);
  await c.query(`INSERT INTO users (id,school_id,role,full_name,version) SELECT g,1+((g-1)%$1),'student','دانش‌آموز '||g,1 FROM generate_series(1,$2) g`, [N_SCHOOLS, N_STUDENTS]);

  /* max_score deliberately spans every branch of the norm: '20' (normal),
     '0'/''/NULL/junk (fall back to 20) and a negative (row dropped). */
  await c.query(`INSERT INTO grades (school_id,class_id,student_id,term,score,max_score,kind,version)
                 SELECT cl.school_id, cl.id, 1+((g-1)%$1),
                        (ARRAY['نوبت اول','نوبت دوم','مستمر'])[1 + (g % 3)],
                        (g % 20)::numeric,
                        (ARRAY['20','20','20','20','0','','junk','-5',NULL])[1 + (('x'||substr(md5(g::text),1,3))::bit(12)::int % 9)],
                        'exam', 1
                 FROM generate_series(1,$2) g JOIN classes cl ON cl.id = 1+((g-1)%$3)`,
    [N_STUDENTS, ROWS, N_CLASSES]);
  await c.query('ANALYZE grades; ANALYZE classes; ANALYZE users');

  const total = Number((await c.query('SELECT count(*)::int n FROM grades')).rows[0].n);
  const bytes = Number((await c.query(`SELECT pg_total_relation_size('grades')::bigint b`)).rows[0].b);
  const branches = (await c.query(`SELECT
      count(*) FILTER (WHERE max_score IS NULL)::int AS nulls,
      count(*) FILTER (WHERE btrim(coalesce(max_score,'')) = '')::int AS empties,
      count(*) FILTER (WHERE max_score = '0')::int AS zeros,
      count(*) FILTER (WHERE max_score = '-5')::int AS negatives,
      count(*) FILTER (WHERE max_score = 'junk')::int AS junk,
      count(*) FILTER (WHERE max_score = '20')::int AS normal
    FROM grades`)).rows[0];

  const schools = (await c.query('SELECT id FROM schools ORDER BY id')).rows.map((r) => r.id);

  const qTotals = rs.buildAcademicSchoolTotals({ schoolIds: schools });
  const qPage = rs.buildAcademicClassPage({ schoolIds: schools, limit: 500 });
  const qTrend = rs.buildAcademicTrend({ schoolIds: schools });

  const time = async (q) => {
    const a = [];
    for (let i = 0; i < ITER; i++) {
      const t = process.hrtime.bigint();
      await c.query(q.sql, q.params);
      a.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    return stats(a);
  };

  /* structural witness: how many times the guarded cast/regex is written into
     the SQL text. Before the hoist it was 3 casts + 2 regexes per builder. */
  const countIn = (sql, needle) => sql.split(needle).length - 1;
  const witness = {
    totals: { cast: countIn(qTotals.sql, '::numeric'), regex: countIn(qTotals.sql, 'max_score') },
    page: { cast: countIn(qPage.sql, '::numeric'), regex: countIn(qPage.sql, 'max_score') },
    trend: { cast: countIn(qTrend.sql, '::numeric'), regex: countIn(qTrend.sql, 'max_score') }
  };

  await c.query(qTotals.sql, qTotals.params); /* warm */
  const tTotals = await time(qTotals);
  const tPage = await time(qPage);
  const tTrend = await time(qTrend);

  const ex = await c.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${qTotals.sql}`, qTotals.params);
  const plan = ex.rows.map((r) => r['QUERY PLAN']);
  const execMs = (plan.find((l) => /Execution Time/.test(l)) || '').trim();

  console.log('');
  console.log(`grades: ${total.toLocaleString('en-US')} ردیف · ${(bytes / 1048576).toFixed(1)} MiB روی دیسک · میانهٔ ${ITER} اجرا`);
  console.log(`پوششِ شاخه‌های norm: '20'=${branches.normal} · '0'=${branches.zeros} · ''=${branches.empties} · NULL=${branches.nulls} · junk=${branches.junk} · منفی=${branches.negatives}`);
  console.log('');
  console.log('| کوئری | میانه (ms) | کمینه | صدک۹۵ |');
  console.log('| :--- | ---: | ---: | ---: |');
  console.log(`| جمعِ مدرسه‌ها | ${f(tTotals.med)} | ${f(tTotals.min)} | ${f(tTotals.p95)} |`);
  console.log(`| صفحهٔ کلاس‌ها (limit 500) | ${f(tPage.med)} | ${f(tPage.min)} | ${f(tPage.p95)} |`);
  console.log(`| روندِ ترم‌ها | ${f(tTrend.med)} | ${f(tTrend.min)} | ${f(tTrend.p95)} |`);
  console.log('');
  console.log('شاهدِ ساختاری (دفعاتِ نوشتنِ کست/ستون در SQLِ تولیدشده):');
  for (const [k, v] of Object.entries(witness)) {
    console.log(`  ${k.padEnd(6)} ::numeric=${v.cast}  max_score=${v.regex}`);
  }
  console.log('');
  console.log(`EXPLAIN جمعِ مدرسه‌ها: ${execMs}`);
  plan.filter((l) => /Seq Scan|Index Scan|HashAggregate|Sort|Execution Time/.test(l)).slice(0, 8).forEach((l) => console.log(`  ${l}`));

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

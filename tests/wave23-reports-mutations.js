#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave23-reports-mutations.js — جهش‌کشی مسیرهای DB-native گزارش
   (تکمیل Wave 23: academic/finance/teachers + اعتبارسنجی P2)

   هر جهش یک نقض عمدی در server/reports-sql.js یا server/routes/reports.js
   تزریق می‌کند (در کپی جدا — الگوی امن BH-mut)؛ گیت PG زنده باید قرمز شود؛

   نقض را می‌گیرند — سبز جعلی ممنوع.

   پیش‌نیاز: PostgreSQL زنده (DATABASE_URL). بدون آن: NOT-RUN صریح
   (کد 0؛ با WAVE23_REQUIRE_PG=1 کد 3) — همان قرارداد wave23-reports-pg.

   اجرا:
     DATABASE_URL=postgres://postgres@127.0.0.1:55470/postgres \
       node tests/wave23-reports-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
/* BH-mut (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی هرگز بازنویسی نمی‌شود. */
const { session } = require('./helpers/mutant-kit');
const kit = session('w23-rep-mut-');

const ROOT = path.join(__dirname, '..');
const SQLF = path.join(ROOT, 'server', 'reports-sql.js');
const RTF = path.join(ROOT, 'server', 'routes', 'reports.js');

if (!process.env.DATABASE_URL) {
  console.log('\n══════════════════════════════════════════════');
  console.log('⚠ NOT-RUN — tests/wave23-reports-mutations.js اجرا نشد (سبزِ جعلی نیست)');
  console.log('  دلیل: DATABASE_URL تنظیم نیست (جهش‌ها فقط روی گیتِ PG زنده معنا دارند)');
  console.log('══════════════════════════════════════════════');
  process.exit(process.env.WAVE23_REQUIRE_PG === '1' ? 3 : 0);
}

const origSql = fs.readFileSync(SQLF, 'utf8');
const origRt = fs.readFileSync(RTF, 'utf8');
/* بازگردانیِ درجا حذف شد — kit خودش کپی را در exit unlink می‌کند */

/* هر جهش: file + mutate. باید گیتِ زنده را قرمز کند. */
const mutations = [
  {
    name: 'M1 حذفِ GROUP BY هر-مدرسه از روندِ ترمی (تجمیعِ سراسری به‌جای هر مدرسه)',
    file: 'sql',
    mutate: (s) => s.replace(
      "GROUP BY school_id, 2\nORDER BY school_id, min(id)`;",
      "GROUP BY school_id, 2\nORDER BY school_id, 2`; /* MUTANT: insertion order lost */")
  },
  {
    name: 'M2 JOIN غلط: نمرهٔ کلاس بدونِ تطبیقِ مدرسه (g.school_id = c.school_id حذف)',
    file: 'sql',
    mutate: (s) => s.replace(
      'LEFT JOIN g ON g.class_id = c.id AND g.school_id = c.school_id\nWHERE ${cParts',
      'LEFT JOIN g ON g.class_id = c.id\nWHERE ${cParts')
  },
  {
    name: 'M3 حذفِ فیلترِ school_id از تجمیعِ شهریه (نشتِ مالی بینِ مدارس)',
    file: 'sql',
    mutate: (s) => s.replace(
      "FROM ${tbl('tuitions')}\nWHERE school_id = ANY($1)",
      "FROM ${tbl('tuitions')}\nWHERE TRUE /* MUTANT: tenant filter removed */ OR school_id = ANY($1)")
  },
  {
    name: 'M4 تغییرِ فرمولِ نرمال‌سازیِ نمره (score*10 به‌جای score*20)',
    file: 'sql',
    mutate: (s) => s.replace(
      'THEN COALESCE(g.score, 0) * 20 / ${MX_NUM}',
      'THEN COALESCE(g.score, 0) * 10 / ${MX_NUM} /* MUTANT */')
  },
  {
    name: 'M5 حذفِ LIMIT n+1 از صفحهٔ معلمان (نتیجهٔ بی‌کران + has_more شکسته)',
    file: 'sql',
    mutate: (s) => {
      const anchor = "${parts.length ? 'WHERE ' + parts.join(' AND ') + '\\n' : ''}ORDER BY school_id, staff_id\nLIMIT ${lim}`;";
      if (!s.includes(anchor)) return s;
      return s.replace(anchor,
        "${parts.length ? 'WHERE ' + parts.join(' AND ') + '\\n' : ''}ORDER BY school_id, staff_id`; /* MUTANT: no LIMIT */");
    }
  },
  {
    name: 'M6 حذفِ گاردِ اعتبارسنجیِ P2 (class_id خراب دیگر 400 نمی‌گیرد)',
    file: 'route',
    mutate: (s) => s.replace(
      "    const cf = reportsSql.parseOptionalPositiveInt(urlParams.get('class_id'));\n    if (!cf.ok) return bad('class_id نامعتبر است');\n    const cf_MARK = null;",
      "IMPOSSIBLE") /* placeholder، جایگزین در پایین */
  },
  {
    name: 'M7 حذفِ queryRead از مسیرِ مالی (خواندن از پرایمری)',
    file: 'route',
    mutate: (s) => s.replace(
      "  async function financeReportDb({ user, tuitionSchools }) {\n    const ids = tuitionSchools.map((s) => Number(s.id));\n    const read = (typeof db.queryRead === 'function') ? db.queryRead.bind(db) : db.query.bind(db);",
      "  async function financeReportDb({ user, tuitionSchools }) {\n    const ids = tuitionSchools.map((s) => Number(s.id));\n    const read = db.query.bind(db); /* MUTANT: replica routing removed */")
  },
  {
    name: 'M8 برگرداندنِ باگِ has_tuition (نگاشتِ type حذف — شاهدِ PG-شکل دوباره بی‌شهریه)',
    file: 'route',
    mutate: (s) => s.replace(
      '  const stype = school.school_type != null ? school.school_type : school.type;\n  return TUITION_TYPES.indexOf(stype) > -1;',
      '  return TUITION_TYPES.indexOf(school.school_type) > -1; /* MUTANT: bug restored */')
  },
  {
    name: 'M9 وضعیتِ ناشناختهٔ قسط دیگر pending نمی‌شود (catch-all حذف)',
    file: 'sql',
    mutate: (s) => s.replace(
      "THEN status ELSE 'pending' END AS st",
      "THEN status ELSE status END AS st /* MUTANT */")
  },
  {
    name: 'M10 جمعِ مدرسهٔ معلمان از صفحه گرفته شود نه کلِ دامنه (LIMIT در totals)',
    file: 'sql',
    mutate: (s) => s.replace(
      "FULL JOIN tr USING (school_id, staff_id)\nGROUP BY school_id`;",
      "FULL JOIN tr USING (school_id, staff_id)\nGROUP BY school_id\nLIMIT 1`; /* MUTANT */")
  },
  {
    name: 'M11 برگرداندنِ باگِ flag-2 بازبین (صفحهٔ آخر دوباره همهٔ مدارس با ردیفِ خالی)',
    file: 'route',
    mutate: (s) => s.replace(
      /const paged = hasMore \|\| \(cursor != null && cursor !== ''\);\n    const list = paged \? schools\.filter\(\(s\) => bySchool\.has\(Number\(s\.id\)\)\) : schools;/,
      "const list = hasMore ? schools.filter((s) => bySchool.has(Number(s.id))) : schools; /* MUTANT: reviewer flag-2 bug restored */")
  }
];

/* M6 جایگزینِ واقعی: گاردِ academic را غیرفعال کن */
mutations[5].mutate = (s) => s.replace(
  "    const cf = reportsSql.parseOptionalPositiveInt(urlParams.get('class_id'));\n    if (!cf.ok) return bad('class_id نامعتبر است');\n    const sf = reportsSql.validateSchoolId(urlParams.get('school_id'));\n    if (!sf.ok) return bad('school_id نامعتبر است');\n\n    const schools = scopedSchools(user, urlParams.get('school_id'));\n    if (schools === null) return deny();\n\n    const termFilter = tf.value;\n    const classFilter = cf.value;",
  "    const cf = { ok: true, value: urlParams.get('class_id') ? Number(urlParams.get('class_id')) : null }; /* MUTANT: guard removed */\n    const sf = { ok: true, value: null };\n\n    const schools = scopedSchools(user, urlParams.get('school_id'));\n    if (schools === null) return deny();\n\n    const termFilter = tf.value;\n    const classFilter = cf.value;");

let killed = 0, survived = 0;
const survivors = [];
console.log('\nwave23-reports-mutations — هر جهش باید گیتِ PG زنده را قرمز کند\n');
for (const m of mutations) {
  const src = m.file === 'sql' ? origSql : origRt;
  const target = m.file === 'sql' ? SQLF : RTF;
  const mutated = m.mutate(src);
  if (mutated === src) {
    survived++; survivors.push(m.name + ' (الگویِ جهش پیدا نشد!)');
    console.log('  ❌ جهش اعمال نشد: ' + m.name);
    continue;
  }
  kit.mutant(target, mutated); /* کپی جدا؛ سورس دست‌نخورده */
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'wave23-reports-pg.js')],
    { stdio: 'pipe', timeout: 600000, env: kit.env() });
  const failedAsExpected = r.status !== 0;
  if (failedAsExpected) { killed++; console.log('  ✅ کشته شد: ' + m.name); }
  else { survived++; survivors.push(m.name); console.log('  ❌ زنده ماند: ' + m.name); }
}

kit.cleanup();
console.log('\n  جمع: ' + killed + ' کشته، ' + survived + ' زنده از ' + mutations.length);
if (survivors.length) { console.log('  زنده‌ها:'); survivors.forEach((s) => console.log('   - ' + s)); }
console.log('');
process.exit(survived ? 1 : 0);

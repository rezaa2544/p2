#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/wave23-norm-edge-mutations.js — جهش‌کشیِ لبه‌های norm تحصیلی

   چرا این فایل وجود دارد
   ─────────────────────
   ممیزیِ جهشِ دوسوئیته (tools/mutate-reports-check.sh) چهار جهش را روی لبه‌های
   norm تحصیلی **زنده** یافت: فیکسچرهای موجود هیچ‌کدام از این شکل‌ها را نداشتند —
   `max_score` عددیِ صفر · `max_score` منفی · `max_score` اعشاری · `score = NULL`.
   این فایل همان چهار ردیف را به‌عنوانِ فیکسچر می‌سازد و یک اوراکلِ عددیِ دقیق
   روی سه کوئریِ تحصیلی می‌گذارد، سپس چهار جهش را می‌آزماید. هر چهار جهش باید
   با **تغییرِ عدد** (نه فقط خطا) کشته شوند.

   یافتهٔ red-first که دامنهٔ این فایل را تعیین کرد
   ────────────────────────────────────────────────
   پیش از نوشتنِ هر گاردی، رفتارِ واقعیِ PostgreSQL با `max_score='0'` سنجیده شد:
   هر سه سازندهٔ **تولید** بدونِ خطا نتیجهٔ درست می‌دهند، چون شرطِ
   `WHEN <MX_VALID> AND <MX_NUM> > 0` خودش همان گارد است — برای `'0'` مقدارِ
   شرط `false` است و شاخهٔ THEN (که تقسیم دارد) اجرا نمی‌شود. در همان کاوش،
   `SELECT 10*20/btrim('0')::numeric` خطای `division by zero` داد، پس ثابت شد که
   PG واقعاً خطا می‌دهد **اگر** گارد برداشته شود؛ یعنی گارد لازم است و هست.
   نتیجه: افزودنِ `NULLIF` در این مسیر **اضافی** است و اضافه نشد (یک گاردِ
   تکراری خودش نقص است). آنچه لازم بود پوششِ تست بود، نه گاردِ دوم.
   بنابراین جهشِ N1 دقیقاً همان گاردِ موجود را هدف می‌گیرد: اگر روزی کسی
   `> 0` را به `>= 0` تغییر دهد، این فایل باید قرمز شود.

   الگوی امنِ جهش (دکترین BH-mut، tests/helpers/mutant-kit.js)
   ────────────────────────────────────────────────────────────
   سورسِ اصلی هرگز بازنویسی نمی‌شود. جهش در کپیِ جدا نوشته می‌شود و فرزند با
   ‏NODE_OPTIONS=--require=mutant-preload و MUTANT_PATH_MAP اجرا می‌شود. علاوه بر
   گارانتیِ خودِ کیت، این فایل `sha256` سورسِ اصلی را پیش و پس از کلِ اجرا
   مقایسه می‌کند و اگر تفاوت کرده باشد **قرمز** می‌شود.

   اجرا:
     DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
       node tests/wave23-norm-edge-mutations.js
   بدونِ DATABASE_URL صریحاً NOT-RUN می‌شود (سبزِ جعلی نه).
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SQLF = path.join(ROOT, 'server', 'reports-sql.js');
const DB = process.env.W23NORM_DB || 'payesh_w23_norm_edge';

/* ── فیکسچر: هر لبه‌ای که norm می‌تواند ببیند، در یک کلاس ──────────────
   هشت ردیف؛ چهارتای آخر همان چهار شکافِ پوششِ گزارش‌شده‌اند. ستونِ «normِ
   انتظار» از قاعدهٔ مسیرِ حافظه می‌آید: mx = Number(max_score) || 20 و
   v = mx > 0 ? score/mx*20 : null.                                          */
const FIXTURE = [
  { mx: '20',   score: 15,   norm: 15,   why: 'حالتِ عادی: 15/20*20' },
  { mx: '0',    score: 10,   norm: 10,   why: 'صفرِ عددی ⇒ شاخهٔ ELSE (گاردِ تقسیم)' },
  { mx: '',     score: 10,   norm: 10,   why: 'رشتهٔ تهی ⇒ پیش‌فرض ۲۰' },
  { mx: null,   score: 10,   norm: 10,   why: 'تهی ⇒ پیش‌فرض ۲۰' },
  { mx: 'junk', score: 10,   norm: 10,   why: 'غیرعدد ⇒ پیش‌فرض ۲۰' },
  { mx: '-5',   score: 10,   norm: null, why: 'منفی ⇒ ردیف از count/sum بیرون' },
  { mx: '19.5', score: 19.5, norm: 20,   why: 'مخرجِ اعشاری ⇒ ۱۹.۵/۱۹.۵*۲۰' },
  { mx: '20',   score: null, norm: 0,    why: 'score تهی ⇒ صفر، نه NULL' }
];
const EXP = {
  page:   { cnt: 7, total: 75, pass: 6 },
  totals: { wsum: 74.9, n: 7 },
  trend:  { cnt: 7, total: 75 }
};

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function connect(dbName) {
  const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
  const base = process.env.DATABASE_URL;
  const c = new Client({ connectionString: dbName ? base.replace(/\/[^/]*$/, '/' + dbName) : base });
  await c.connect();
  return c;
}

async function seed() {
  const base = process.env.DATABASE_URL;
  const admin = await connect(null);
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  const c = await connect(DB);
  for (const m of fs.readdirSync(path.join(ROOT, 'migrations'))
      .filter((x) => x.endsWith('.sql') && !x.endsWith('.down.sql')).sort()) {
    await c.query(fs.readFileSync(path.join(ROOT, 'migrations', m), 'utf8'));
  }
  await c.query(`INSERT INTO schools (id,name,type,version) VALUES (1,'مدرسهٔ لبه','governmental',1)`);
  await c.query(`INSERT INTO classes (id,school_id,name,grade,version) VALUES (1,1,'کلاس لبه',7,1)`);
  await c.query(`INSERT INTO users (id,school_id,role,full_name,version) VALUES (1,1,'student','دانش‌آموز لبه',1)`);
  for (const r of FIXTURE) {
    await c.query(`INSERT INTO grades (school_id,class_id,student_id,term,score,max_score,kind,version)
                   VALUES (1,1,1,'نوبت اول',$1,$2,'exam',1)`, [r.score, r.mx]);
  }
  await c.query('ANALYZE grades; ANALYZE classes; ANALYZE users');
  return c;
}

/* ── اوراکل: سه کوئریِ تحصیلی را اجرا و با اعدادِ انتظار مقایسه می‌کند ── */
async function oracle() {
  const rs = require(path.join(ROOT, 'server', 'reports-sql.js'));
  const c = await connect(DB);
  let bad = 0;
  const eq = (label, got, want) => {
    const ok = Math.abs(Number(got) - Number(want)) < 1e-9;
    if (!ok) bad++;
    console.log(`  ${ok ? '✅' : '❌'} ${label}: ${got} (انتظار ${want})`);
  };
  try {
    const pg = rs.buildAcademicClassPage({ schoolIds: [1], limit: 50 });
    const p = await c.query(pg.sql, pg.params);
    eq('صفحه cnt',   p.rows[0].cnt,   EXP.page.cnt);
    eq('صفحه total', p.rows[0].total, EXP.page.total);
    eq('صفحه pass',  p.rows[0].pass,  EXP.page.pass);

    const t = rs.buildAcademicSchoolTotals({ schoolIds: [1] });
    const tr = await c.query(t.sql, t.params);
    eq('جمعِ مدرسه wsum', tr.rows[0].wsum, EXP.totals.wsum);
    eq('جمعِ مدرسه n',    tr.rows[0].n,    EXP.totals.n);

    const d = rs.buildAcademicTrend({ schoolIds: [1] });
    const dr = await c.query(d.sql, d.params);
    eq('روند cnt',   dr.rows[0].cnt,   EXP.trend.cnt);
    eq('روند total', dr.rows[0].total, EXP.trend.total);
  } catch (e) {
    bad++;
    console.log('  ❌ کوئری خطا داد: ' + String(e.message).split('\n')[0]);
  }
  await c.end();
  return bad;
}

/* ── چهار جهشِ لبه ─────────────────────────────────────────────────── */
const MUTATIONS = [
  {
    name: 'N1 گاردِ تقسیم: MX_NUM > 0 → >= 0',
    why: 'ردیفِ max_score=0 را به شاخهٔ تقسیم می‌برد؛ PG باید division by zero بدهد',
    from: 'WHEN ${MX_VALID} AND ${MX_NUM} > 0 THEN',
    to:   'WHEN ${MX_VALID} AND ${MX_NUM} >= 0 THEN'
  },
  {
    name: 'N2 max_score منفی ⇒ NULL → 0',
    why: 'ردیفِ منفی باید از count/sum بیرون بماند، نه اینکه صفر شمرده شود',
    from: 'WHEN ${MX_VALID} AND ${MX_NUM} < 0 THEN NULL',
    to:   'WHEN ${MX_VALID} AND ${MX_NUM} < 0 THEN 0'
  },
  {
    /* round() به‌جای ::int انتخاب شد: ::int روی '19.5' خطای parse می‌دهد و
       «کشته‌شدن با خطا» سیگنالِ ضعیف‌تری است. round() عدد را عوض می‌کند، پس
       اوراکل با تغییرِ مقدار می‌کُشد نه با استثنا. */
    name: 'N3 گرد کردنِ مخرج: ::numeric → round(::numeric)',
    why: 'مخرجِ اعشاری ۱۹.۵ به ۲۰ گرد می‌شود ⇒ norm از ۲۰ به ۱۹.۵ می‌افتد',
    from: 'const MX_NUM = `btrim(g.max_score)::numeric`;',
    to:   'const MX_NUM = `round(btrim(g.max_score)::numeric)`;'
  },
  {
    name: 'N4 COALESCE(g.score, 0) → g.score',
    why: 'score تهی باید صفر حساب شود؛ با NULL کلِ ردیف از count بیرون می‌رود',
    from: 'THEN COALESCE(g.score, 0) * 20 / ${MX_NUM}',
    to:   'THEN g.score * 20 / ${MX_NUM}'
  }
];

async function harness() {
  console.log('\n══════════════════════════════════════════════');
  if (!process.env.DATABASE_URL) {
    console.log('⚠ NOT-RUN — tests/wave23-norm-edge-mutations.js اجرا نشد (سبزِ جعلی نیست)');
    console.log('  دلیل: DATABASE_URL تنظیم نیست؛ جهش‌های لبه فقط روی PG واقعی معنا دارند.');
    console.log('══════════════════════════════════════════════\n');
    process.exit(process.env.WAVE23_REQUIRE_PG === '1' ? 3 : 0);
  }

  const { session } = require(path.join(__dirname, 'helpers', 'mutant-kit'));
  const kit = session('w23norm-mut-');
  const shaBefore = sha(SQLF);
  const orig = fs.readFileSync(SQLF, 'utf8');

  console.log('▸ ساختِ فیکسچرِ لبه‌ها روی PostgreSQL واقعی');
  const seedC = await seed();
  await seedC.end();
  for (const r of FIXTURE) console.log(`    max_score=${JSON.stringify(r.mx)} score=${JSON.stringify(r.score)} → norm=${r.norm}  (${r.why})`);

  /* خطِ پایه: اوراکل روی سورسِ سالم باید سبز باشد، وگرنه خودِ اوراکل خراب است
     و هیچ «کشته‌شدنی» معنا ندارد. */
  console.log('\n▸ خطِ پایه — اوراکل روی سورسِ سالم');
  const baseBad = await oracle();
  if (baseBad) {
    console.log(`\n❌ اوراکل روی سورسِ سالم ${baseBad} اختلاف دارد ⇒ فیکسچر/انتظار خراب است؛ ادامه بی‌معناست.`);
    kit.cleanup();
    process.exit(1);
  }
  console.log('  ✅ خطِ پایه سبز');

  let killed = 0, survived = 0, notApplied = 0;
  const survivors = [];
  console.log('\n▸ چهار جهشِ لبه — هر کدام باید اوراکل را قرمز کند');
  for (const m of MUTATIONS) {
    const mutated = orig.replace(m.from, m.to);
    if (mutated === orig) {
      notApplied++;
      survivors.push(m.name + ' (لنگر پیدا نشد!)');
      console.log(`  ⚠ اعمال نشد: ${m.name}`);
      continue;
    }
    kit.mutant(SQLF, mutated);              /* کپیِ جدا؛ سورسِ اصلی دست‌نخورده */
    const r = cp.spawnSync(process.execPath, [__filename, '--oracle'], {
      stdio: 'pipe', timeout: 300000,
      env: Object.assign({}, kit.env(), {
        DATABASE_URL: process.env.DATABASE_URL,
        W23NORM_DB: DB
      })
    });
    const out = String(r.stdout || '') + String(r.stderr || '');
    const proof = out.split('\n').filter((l) => l.includes('❌')).slice(0, 3).map((l) => l.trim());
    if (r.status !== 0) {
      killed++;
      console.log(`  ✅ کشته شد: ${m.name}`);
      /* «کشته شد» به‌تنهایی کافی نیست: دلیلش باید دیده شود تا «کشته‌شدن با
         خطای اتفاقی» از «کشته‌شدن با تغییرِ عدد» جدا شود. */
      (proof.length ? proof : ['(بدونِ خروجیِ ❌ — خروجِ غیرصفر: ' + r.status + ')'])
        .forEach((l) => console.log(`       شاهد: ${l}`));
    } else {
      survived++;
      survivors.push(m.name);
      console.log(`  ❌ زنده ماند: ${m.name} — ${m.why}`);
    }
  }
  const shadow = kit.target(SQLF);   /* پیش از clear خوانده شود، وگرنه هیچ می‌شود */
  kit.clear(SQLF);

  const shaAfter = sha(SQLF);
  console.log('\n▸ گارانتیِ الگوی امن');
  console.log(`  سایهٔ جهش‌یافته: ${shadow ? path.relative(ROOT, shadow) : '(هیچ)'}`);
  console.log(`  sha256 سورس پیش: ${shaBefore}`);
  console.log(`  sha256 سورس پس:  ${shaAfter}`);
  const shaOk = shaBefore === shaAfter;
  console.log(`  ${shaOk ? '✅' : '❌'} سورسِ اصلی بازنویسی نشد`);

  kit.cleanup();
  console.log('\n──────────────────────────────────────────────');
  console.log(`نتیجه: ${killed} کشته · ${survived} زنده · ${notApplied} اعمال‌نشده (از ${MUTATIONS.length})`);
  if (survivors.length) { console.log('  موارد:'); survivors.forEach((s) => console.log('   - ' + s)); }
  const ok = killed === MUTATIONS.length && survived === 0 && notApplied === 0 && shaOk;
  console.log(ok
    ? 'wave23-norm-edge-mutations: سبز ✅ (هر چهار جهشِ لبه با تغییرِ عدد کشته شد؛ سورس دست‌نخورده)'
    : 'wave23-norm-edge-mutations: قرمز ❌');
  console.log('══════════════════════════════════════════════\n');
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes('--oracle')) {
  oracle().then((bad) => process.exit(bad ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
} else {
  harness().catch((e) => { console.error(e); process.exit(1); });
}

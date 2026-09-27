#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/wave18-load-to-pg.js — Wave 18
   بارگذاریِ دیتاستِ ملیِ CSV (خروجیِ tools/generate-national-dataset.js)
   در PostgreSQL با COPY.
   ───────────────────────────────────────────────────────────────────
   چرا COPY و نه INSERTِ دانه‌دانه: در مقیاسِ ملیِ §21، بارگذاری باید خودش
   گلوگاه نشود. COPY مسیرِ bulkِ PostgreSQL است و برای ۵۰ هزار رکوردِ این
   مقیاس زیرِ یک ثانیه تمام می‌شود.

   ستونِ `version` در این schema ‏NOT NULL با DEFAULT 1 است، ولی در CSV نیست؛
   پس جدولِ مقصد موقتاً DEFAULT می‌گیرد و COPY فقط ستون‌هایِ موجود را می‌نویسد.

   اجرا:
     DATABASE_URL=postgresql://… node tools/wave18-load-to-pg.js \
       --dir data/national/scale-0.001 [--truncate]
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

/* ترتیب مهم است: والد پیش از فرزند (FK). parent_links آخر از همه.
   🔴 این ثابت باید پیش از ALLOWED_TABLES مقدار بگیرد؛ در غیر این صورت
   مرزِ شناسه (پایین) در زمانِ بارگذاریِ ماژول با خطایِ TDZ می‌میرد و
   هیچ‌یک از گاردها اجرا نمی‌شوند. */
const TABLES = ['schools', 'classes', 'users', 'attendance', 'grades', 'parent_links'];

/* 🔴 مرزِ ورودیِ شناسهٔ SQL: نامِ جدول/ستون یا از TABLES ثابت می‌آید یا از
   information_schema؛ چون در متنِ SQL جای می‌گیرند (DDL/\copy نمی‌توانند $N
   بگیرند)، با allowlistِ دقیق و یک الگویِ شناسه اعتبارسنجی می‌شوند.
   tableIdent (پایین) فقط همان شش جدولِ ثابتِ TABLES را می‌پذیرد. */
const SQL_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// pg@8.23 هیچ streamِ ورودی برایِ COPY از stdin در اختیار نمی‌گذارد
// (client.query با callback مقدارِ undefined برمی‌گرداند و خطایِ
// «No source stream defined» می‌دهد). به‌جای افزودنِ وابستگیِ
// pg-copy-streams، از `psql \copy` استفاده می‌کنیم: همان COPY واقعیِ
// PostgreSQL، با تجزیهٔ CSV در سمتِ کلاینت.
/* 🔴 مرزِ ورودی: URL باید آخرین آرگومانِ موقعیتی باشد. اگر اول بیاید،
   یک رشتهٔ آغازشونده با «-» به‌جای URL، گزینهٔ دستور تفسیر می‌شود. */
function psqlCopy(sql, url) {
  if (!/^postgres(ql)?:\/\//.test(String(url))) {
    throw new Error('refusing to pass non-postgres URL to psql');
  }
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-c', sql, url],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/* 🔴 مرزِ شناسه: نامِ جدول/ستون از TABLES ثابت یا از headerِ CSV می‌آید
   و در متنِ SQL (DDL/TRUNCATE/\\copy که $N نمی‌پذیرند) جای می‌گیرد.
   لیستِ سفیدِ دقیقِ نامِ جدول، مرزِ امن است: فقط همان شش جدولِ ثابتِ
   بالا مجازند و هر چیزِ دیگر قبل از رسیدن به SQL رد می‌شود.
   🔴 TRUNCATE و \\copy نمی‌توانند پارامتر بگیرند، پس به‌جای الحاق،
   نامِ جدول به‌صورتِ کلیدِ یک جدولِ ثابتِ statements خوانده می‌شود —
   هیچ رشته‌ای از بیرون به SQL نمی‌رسد. */
const ALLOWED_TABLES = new Set(TABLES);
function tableIdent(name) {
  const s = String(name || '');
  if (!ALLOWED_TABLES.has(s)) throw new Error('unsafe SQL table name (not in allowlist): ' + JSON.stringify(name));
  return s;
}
function colIdent(name) {
  const s = String(name || '');
  if (!SQL_IDENT.test(s)) throw new Error('unsafe SQL column name: ' + JSON.stringify(name));
  return s;
}
/* معادلِ پارامتریِ ناممکن: statementsِ ثابتِ هر جدول، یک‌بار نوشته شده. */
const TRUNCATE_SQL = Object.freeze({
  schools: 'truncate table schools cascade',
  classes: 'truncate table classes cascade',
  users: 'truncate table users cascade',
  attendance: 'truncate table attendance cascade',
  grades: 'truncate table grades cascade',
  parent_links: 'truncate table parent_links cascade',
});
const COUNT_SQL = Object.freeze({
  schools: 'select count(*) from schools',
  classes: 'select count(*) from classes',
  users: 'select count(*) from users',
  attendance: 'select count(*) from attendance',
  grades: 'select count(*) from grades',
  parent_links: 'select count(*) from parent_links',
});
function csvPath(dir, table) {
  const p = path.resolve(dir, tableIdent(table) + '.csv');
  if (path.dirname(p) !== path.resolve(dir))
    throw new Error('CSV path escapes the dataset dir: ' + table);
  return p;
}

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const has = (n) => process.argv.includes('--' + n);

const DIR_RAW = arg('dir', 'data/national/scale-0.001');
/* 🔴 مرزِ مسیر: DIR نسبت به ریشهٔ مخزن حل می‌شود و باید داخلِ آن بماند. */
const DIR = path.resolve(ROOT, DIR_RAW);
if (DIR !== path.resolve(ROOT) && !DIR.startsWith(path.resolve(ROOT) + path.sep)) {
  console.error('دایرکتوریِ دیتاست خارج از ریشهٔ مخزن است: ' + DIR_RAW);
  process.exit(2);
}
const TRUNCATE = has('truncate');

/* واگراییِ شناخته‌شدهٔ مولد ↔ schema (قلمِ بازِ ۲ در
   docs/DOCS_CONSISTENCY_REPORT.md: «هم‌ترازسازی مولد … پیش‌نیازِ اجرای رسمی
   موج ۱۸»). مولدِ دیتاست ستون‌هایی تولید می‌کند که در schema نیستند؛ اینجا
   آن‌هایی را که هم‌ارزِ روشن دارند نگاشت می‌کنیم و بقیه را «صادقانه» دور
   می‌ریزیم و گزارش می‌دهیم — نه اینکه بی‌صدا بارگذاریِ ناقص بدهیم. */
const COLUMN_MAP = {
  schools: { province: 'province_id' }   // مقدارِ CSV نامِ استان است، نه شناسه ⇒ نگاشتِ بی‌خطر نیست
};
const DROP_UNMAPPABLE = {
  schools: ['province_id'],              // نام → شناسه نیاز به جدولِ استان‌ها دارد
  attendance: ['teacher_id', 'registered_by']  // این ستون‌ها در schema وجود ندارند
};

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/* مولدِ دیتاست «enrollments» تولید نمی‌کند، ولی authz برایِ هر نوشتنِ
   معلم‌محور به آن نیاز دارد (server/policy.js: بی‌ثبت‌نام ⇒ out_of_scope).
   به‌جای ساختنِ دادهٔ جعلی، آن را از دادهٔ «موجودِ» خودِ دیتاست استنتاج
   می‌کنیم: جفت‌های (student_id, class_id) که در attendance هست، به‌همراهِ
   school_id همان کلاس. این هم بخشی از واگراییِ قلمِ بازِ ۲ است. */
async function deriveEnrollments(client) {
  const n = Number((await client.query('select count(*) from enrollments')).rows[0].count);
  if (n > 0) { console.log(`  ok    enrollments    (already ${n})`); return; }
  const r = await client.query(
    `insert into enrollments (id, student_id, class_id, school_id, version)
     select row_number() over (order by p.student_id, p.class_id),
            p.student_id, p.class_id, c.school_id, 1
     from (select distinct student_id, class_id from attendance
            where student_id is not null and class_id is not null) p
     join classes c on c.id = p.class_id
     on conflict do nothing
     returning id`);
  console.log(`  ok    enrollments    +${r.rowCount} (استنتاج از attendance — مولد تولیدش نمی‌کند)`);
}

async function seedSubjects(client, dir) {
  const n = Number((await client.query('select count(*) from subjects')).rows[0].count);
  const csv = path.join(dir, 'grades.csv');
  if (!fs.existsSync(csv)) return;
  const lines = fs.readFileSync(csv, 'utf8').split('\n').slice(1);
  let max = 0;
  for (const l of lines) { if (!l.trim()) continue; const v = Number(splitCsv(l)[4]); if (v > max) max = v; }
  if (n >= max) { console.log(`  ok    subjects       (already ${n})`); return; }
  await client.query(
    `insert into subjects (id, name, school_id, version)
     select g, 'درس ' || g, 1, 1 from generate_series(1, $1) g
     on conflict (id) do nothing`, [max]);
  console.log(`  ok    subjects       +${max - n} (تا پوششِ grades.subject_id ≤ ${max})`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL لازم است'); process.exit(2); }
  if (!fs.existsSync(DIR)) { console.error('دایرکتوریِ دیتاست پیدا نشد: ' + DIR); process.exit(2); }

  const client = new Client({ connectionString: url });
  const divergences = {};
  await client.connect();
  const t0 = Date.now();
  const summary = {};

  try {
    for (const t of TABLES) {
      // مولدِ دیتاست «subjects.csv» تولید نمی‌کند، ولی grades.subject_id به آن
      // FK دارد. بدونِ این گام، بارگذاریِ grades با نقضِ fk_grades_subject
      // شکست می‌خورد. این هم بخشی از همان واگراییِ قلمِ بازِ ۲ است.
      if (t === 'grades') await seedSubjects(client, DIR);
      if (t === 'parent_links') await deriveEnrollments(client);

      const csv = csvPath(DIR, t);
      if (!fs.existsSync(csv)) { console.log(`  skip  ${t} (فایل نیست)`); continue; }

      const header = fs.readFileSync(csv, 'utf8').split('\n', 1)[0].trim();
      const cols = header.split(',').map(s => s.trim()).filter(Boolean);

      // 'restart identity' مالکیتِ sequence می‌خواهد؛ 'cascade' کافی است.
      // TRUNCATE نمی‌تواند پارامتر بگیرد، ولی نامِ جدول از TABLES ثابت
      // می‌آید و statement نهایی از TRUNCATE_SQL خوانده می‌شود (هرگز الحاق نمی‌شود).
      if (TRUNCATE) await client.query(TRUNCATE_SQL[t]);

      // ستون‌هایِ NOT NULLِ بی‌مقدار (مثل version) باید DEFAULT داشته باشند.
      // ستون‌های identity/serial را عمداً رد می‌کنیم: ALTER روی آن‌ها مالکیتِ
      // sequence را می‌خواهد و کاربرِ برنامه معمولاً مالک نیست.
      // 🔴 شناسه‌ها قبل از ورود به متنِ DDL اعتبارسنجی می‌شوند: نامِ جدول
      // باید عضوِ LISTِ ثابتِ TABLES باشد و نامِ ستون باید ⊂ [A-Za-z_][A-Za-z0-9_]*
      // (هر دو از information_schema می‌آیند، نه از ورودیِ کاربر).
      const tbl = tableIdent(t);
      const { rows: notNull } = await client.query(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name=$1 and is_nullable='NO'
            and column_default is null
            and is_identity = 'NO'
            and column_name <> all($2::text[])`, [t, cols]);
      for (const r of notNull) {
        const col = colIdent(r.column_name);
        const ty = (await client.query(
          `select data_type from information_schema.columns
            where table_schema='public' and table_name=$1 and column_name=$2`,
          [t, r.column_name])).rows[0].data_type;
        const dflt = /int|numeric|real|double/.test(ty) ? '1' : "'w18'";
        await client.query(`alter table ${tbl} alter column "${col}" set default ${dflt}`);
      }

      // ستون‌هایِ واقعیِ جدول را بگیر و با CSV تقاطع بده
      const { rows: dbCols } = await client.query(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name=$1`, [t]);
      const have = new Set(dbCols.map(r => r.column_name));
      const keep = [], dropped = [];
      cols.forEach((c, i) => {
        const mapped = (COLUMN_MAP[t] && COLUMN_MAP[t][c]) || c;
        const blocked = DROP_UNMAPPABLE[t] && DROP_UNMAPPABLE[t].includes(mapped);
        if (have.has(mapped) && !blocked) keep.push({ csv: c, db: mapped, idx: i });
        else dropped.push(c + (blocked ? ' (بی‌معادل در schema)' : ' (ستونِ جدول نیست)'));
      });
      if (dropped.length) divergences[t] = dropped;

      // psql \copy نمی‌تواند ستون‌ها را جابه‌جا کند، پس اگر ترتیبِ نگاشت
      // همان ترتیبِ CSV نبود، یک فایلِ موقتِ هم‌تراز می‌سازیم.
      // 🔴 هر سه قطعه‌ای که به \copy می‌رسد اعتبارسنجی می‌شود: tbl ∈ TABLES
      // (ثابت)، هر ستون ⊂ [A-Za-z_][A-Za-z0-9_]*، و src باید داخلِ DIR بماند.
      let src = csv, list = keep.map(k => colIdent(k.db)).join(',');
      const aligned = keep.every((k, n) => k.idx === n);
      if (!aligned) {
        src = path.resolve(DIR, '.' + tableIdent(t) + '.aligned.csv');
        if (path.dirname(src) !== path.resolve(DIR)) {
          throw new Error('aligned CSV path escapes the dataset dir: ' + t);
        }
        const lines = fs.readFileSync(csv, 'utf8').split('\n');
        const out = lines.map(line => {
          if (!line.trim()) return line;
          const f = splitCsv(line);
          return keep.map(k => f[k.idx]).join(',');
        });
        fs.writeFileSync(src, out.join('\n'));
      }

      const before = Number((await client.query(COUNT_SQL[t])).rows[0].count);
      psqlCopy(`\\copy ${tbl} (${list}) from '${src}' with (format csv, header true)`, url);
      if (!aligned) fs.rmSync(src, { force: true });
      const after = Number((await client.query(COUNT_SQL[t])).rows[0].count);
      summary[t] = after - before;
      console.log(`  ok    ${t.padEnd(14)} +${after - before}  (now ${after})`);
    }

    if (Object.keys(divergences).length) {
      console.log('\n⚠ واگراییِ مولد ↔ schema (قلمِ بازِ ۲ — این ستون‌ها بارگذاری نشدند):');
      for (const [t, d] of Object.entries(divergences)) console.log(`    ${t}: ${d.join('، ')}`);
      console.log('  ⇒ تا هم‌ترازسازیِ مولد، دیتاستِ بارگذاری‌شده دیتاستِ رسمیِ طرحِ بار §۲.۱ نیست.');
    }
    await client.query('analyze');
    const ms = Date.now() - t0;
    console.log('\n────────────────────────────────────────────');
    console.log(`wave18-load-to-pg: ${Object.keys(summary).length} جدول در ${(ms / 1000).toFixed(1)}s`);
    console.log('  ' + JSON.stringify(summary));
    process.exit(0);
  } catch (e) {
    console.error('\nخطا در بارگذاری:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();

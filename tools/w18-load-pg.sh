#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# tools/w18-load-pg.sh — Wave 18: بارگذاریِ دیتاستِ ملی (CSV) در PostgreSQL
# ───────────────────────────────────────────────────────────────────
# ورودی: خروجیِ tools/generate-national-dataset.js (CSV + stats.json)
#         + یک پایگاه که زنجیرهٔ migrations/ روی آن اعمال شده باشد.
# استفاده:
#   node tools/generate-national-dataset.js --scale 0.3 --out /var/tmp/nat
#   bash tools/w18-load-pg.sh /var/tmp/nat "postgres://user:pass@host:5432/db"
#   bash tools/w18-load-pg.sh /var/tmp/nat "postgres://…" --low-disk
#
# چرا این لایه لازم است (واگراییِ مستند — DOCS_CONSISTENCY_REPORT قلم ۲):
#   ستون‌هایِ CSV با شمای واقعیِ migrations/ یکی نیستند:
#   • schools.province (نام) ⇒ schools.province_id (FK عددی به provinces)
#   • attendance فاقدِ ستون‌هایِ teacher_id/registered_by در شمای واقعی
#   • subjects و provinces در مهاجرت‌ها خالی‌اند؛ مولد subject_id های 1..15
#     و نام‌های ۳۱ استان را فرض می‌کند — اینجا همان مرجع seed می‌شود.
#   • version/created_at/updated_at/status پیش‌فرضِ تولید-مانند می‌گیرند.
# گاردِ fail-closed: اگر جدول‌های هدف خالی نباشند، بارگذاری رد می‌شود
# (دوباره‌اجرا روی دادهٔ موجود = تکرارِ سطرها، نه idempotency).
#
# حالتِ --low-disk (P0-4، sandbox/دیسک‌محدود):
#   پیش‌فرض تمامِ جداول در «یک» تراکنش لود می‌شوند (اتمیک). در آن حالت
#   temp tableهای همهٔ جداول + WALِ کلِ تراکنش تا پایان زنده‌اند؛ برای
#   دیتاست‌های بزرگ (مثلاً attendance از scale≈0.5 به بالا) این یعنی
#   چند برابرِ حجمِ نهاییِ داده، فضایِ موقت. با --low-disk هر جدول در
#   تراکنشِ خودش لود می‌شود، temp آن بلافاصله drop و CSVِ مصرف‌شده
#   حذف می‌شود (پیکِ دیسک ≈ دادهٔ نهایی + بزرگ‌ترین CSV). بهای آن:
#   اتمیسیتیِ همه‌چیز-یا-هیچ از بین می‌رود — اگر وسطِ کار fail شود،
#   پایگاه نیمه‌پر می‌ماند و گاردِ fail-closed اجرایِ مجدد را رد
#   می‌کند؛ راهِ recovery: DROP/TRUNCATE دستیِ جداول و شروعِ مجدد.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

DIR=${1:?csv-dir (خروجی generate-national-dataset.js)}
URL=${2:?postgres url}
LOW_DISK=0
for a in "$@"; do [ "$a" = "--low-disk" ] && LOW_DISK=1; done
if [ "$LOW_DISK" = 1 ]; then
  echo "→ حالتِ --low-disk: تراکنشِ جدول‌به‌جدول + حذفِ CSV/temp پس از مصرف"
else
  # در حالتِ عادی همهٔ CSVها از ابتدا لازم‌اند — مثلِ قبل چک می‌شوند
  for f in schools classes users parent_links attendance grades; do
    [ -f "$DIR/$f.csv" ] || { echo "✗ $DIR/$f.csv نیست" >&2; exit 2; }
  done
fi
[ -f "$DIR/stats.json" ] || { echo "✗ stats.json نیست (خروجی مولد نیست)" >&2; exit 2; }
ABS=$(cd "$DIR" && pwd)
echo "→ بارگذاری از $ABS در $URL (low_disk=$LOW_DISK)"

need_csv(){ [ -f "$ABS/$1.csv" ] || { echo "✗ $ABS/$1.csv نیست" >&2; exit 2; }; }

# ── بلوک‌های SQL جدول‌ها (مشترک بین هر دو حالت — منبعِ یگانه) ────────
GUARD_SQL="DO \$\$
BEGIN
  IF (SELECT count(*) FROM schools) + (SELECT count(*) FROM classes)
   + (SELECT count(*) FROM users) + (SELECT count(*) FROM grades)
   + (SELECT count(*) FROM attendance) > 0 THEN
    RAISE EXCEPTION 'w18-load-pg: جدول‌های هدف خالی نیستند — دوباره‌بارگذاری ممنوع (fail-closed)';
  END IF;
END \$\$;"

SUBJECTS_SQL="INSERT INTO subjects (id, name, code, version, created_at, updated_at) VALUES
  (1,'ریاضی','SUB-01',1,now(),now()),(2,'فیزیک','SUB-02',1,now(),now()),
  (3,'شیمی','SUB-03',1,now(),now()),(4,'زیست‌شناسی','SUB-04',1,now(),now()),
  (5,'ادبیات فارسی','SUB-05',1,now(),now()),(6,'زبان عربی','SUB-06',1,now(),now()),
  (7,'دینی','SUB-07',1,now(),now()),(8,'مطالعات اجتماعی','SUB-08',1,now(),now()),
  (9,'زبان انگلیسی','SUB-09',1,now(),now()),(10,'علوم تجربی','SUB-10',1,now(),now()),
  (11,'فناوری اطلاعات','SUB-11',1,now(),now()),(12,'هنرهای زیبا','SUB-12',1,now(),now()),
  (13,'ورزش','SUB-13',1,now(),now()),(14,'کار و فناوری','SUB-14',1,now(),now()),
  (15,'تفکر و پژوهش','SUB-15',1,now(),now());"

SCHOOLS_SQL="CREATE TEMP TABLE csv_schools (id BIGINT, name TEXT, code TEXT, province TEXT,
  city TEXT, phone TEXT, level TEXT, type TEXT, gender TEXT, shift TEXT,
  capacity INT, active INT);
\\copy csv_schools FROM '$ABS/schools.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

INSERT INTO provinces (id, code, name, created_at, updated_at)
SELECT row_number() OVER (ORDER BY province), 'P' || lpad(row_number() OVER (ORDER BY province)::text, 2, '0'),
       province, now(), now()
FROM (SELECT DISTINCT province FROM csv_schools WHERE province IS NOT NULL AND province <> '') d
ON CONFLICT DO NOTHING;

INSERT INTO schools (id, name, code, province_id, city, phone, level, type, gender,
                     shift, capacity, active, created_at, updated_at, version)
SELECT s.id, s.name, s.code, p.id, s.city, s.phone, s.level, s.type, s.gender,
       s.shift, s.capacity, CASE WHEN COALESCE(s.active, 1) = 1 THEN true ELSE false END, now(), now(), 1
FROM csv_schools s LEFT JOIN provinces p ON p.name = s.province;
DROP TABLE csv_schools;"

CLASSES_SQL="CREATE TEMP TABLE csv_classes (id BIGINT, school_id BIGINT, name TEXT, grade TEXT,
  field TEXT, room TEXT, capacity INT, homeroom_teacher_id BIGINT);
\\copy csv_classes FROM '$ABS/classes.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
INSERT INTO classes (id, school_id, name, grade, field, room, capacity,
                     homeroom_teacher_id, created_at, updated_at, version)
SELECT id, school_id, name, grade::int, field, room, capacity, homeroom_teacher_id, now(), now(), 1
FROM csv_classes;
DROP TABLE csv_classes;"

USERS_SQL="CREATE TEMP TABLE csv_users (id BIGINT, role TEXT, full_name TEXT, username TEXT,
  national_id TEXT, phone TEXT, active INT, school_id TEXT, subject_id INT, job TEXT);
\\copy csv_users FROM '$ABS/users.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
INSERT INTO users (id, role, full_name, username, national_id, phone, active,
                   school_id, subject_id, job, status, created_at, updated_at, version)
SELECT id, role, full_name, username, national_id, phone, CASE WHEN COALESCE(active, 1) = 1 THEN true ELSE false END,
       NULLIF(school_id, '')::bigint, subject_id, job, 'active', now(), now(), 1
FROM csv_users;
DROP TABLE csv_users;"

PL_SQL="CREATE TEMP TABLE csv_pl (id BIGINT, parent_id BIGINT, student_id BIGINT, relation TEXT);
\\copy csv_pl FROM '$ABS/parent_links.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
INSERT INTO parent_links (id, parent_id, student_id, relation, created_at, updated_at)
SELECT id, parent_id, student_id, relation, now(), now() FROM csv_pl;
DROP TABLE csv_pl;"

# attendance: ستون‌های teacher_id/registered_by در شمای واقعی نیستند (واگرایی)
ATT_SQL="CREATE TEMP TABLE csv_att (id BIGINT, school_id BIGINT, student_id BIGINT, class_id BIGINT,
  date DATE, status TEXT, teacher_id BIGINT, registered_by BIGINT, taken_at TEXT);
\\copy csv_att FROM '$ABS/attendance.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
INSERT INTO attendance (id, school_id, student_id, class_id, date, status,
                        taken_at, created_at, updated_at, version)
SELECT id, school_id, student_id, class_id, date, status,
       taken_at::timestamptz, taken_at::timestamptz, taken_at::timestamptz, 1
FROM csv_att;
DROP TABLE csv_att;"

GRADES_SQL="CREATE TEMP TABLE csv_grades (id BIGINT, school_id BIGINT, student_id BIGINT, class_id BIGINT,
  subject_id INT, teacher_id BIGINT, term TEXT, exam_type TEXT, score TEXT,
  max_score TEXT, created_at TEXT);
\\copy csv_grades FROM '$ABS/grades.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
INSERT INTO grades (id, school_id, student_id, class_id, subject_id, teacher_id,
                    term, exam_type, score, max_score, created_at, updated_at, version)
SELECT id, school_id, student_id, class_id, subject_id, teacher_id, term, exam_type,
       score::numeric, max_score::numeric, created_at::timestamptz, created_at::timestamptz, 1
FROM csv_grades;
DROP TABLE csv_grades;"

SETVAL_SQL="SELECT setval(pg_get_serial_sequence('schools','id'),      (SELECT COALESCE(MAX(id),1) FROM schools));
SELECT setval(pg_get_serial_sequence('classes','id'),      (SELECT COALESCE(MAX(id),1) FROM classes));
SELECT setval(pg_get_serial_sequence('users','id'),        (SELECT COALESCE(MAX(id),1) FROM users));
SELECT setval(pg_get_serial_sequence('parent_links','id'), (SELECT COALESCE(MAX(id),1) FROM parent_links));
SELECT setval(pg_get_serial_sequence('attendance','id'),   (SELECT COALESCE(MAX(id),1) FROM attendance));
SELECT setval(pg_get_serial_sequence('grades','id'),       (SELECT COALESCE(MAX(id),1) FROM grades));"

run_psql(){ psql "$URL" -v ON_ERROR_STOP=1 "$@"; }

if [ "$LOW_DISK" = 0 ]; then
  # ── حالتِ عادی: همه‌چیز در «یک» تراکنش (رفتارِ پیشین، دست‌نخورده) ──
  { echo '\set ON_ERROR_STOP on'; echo 'BEGIN;';
    echo "$GUARD_SQL"; echo "$SUBJECTS_SQL"; echo "$SCHOOLS_SQL"; echo "$CLASSES_SQL";
    echo "$USERS_SQL"; echo "$PL_SQL"; echo "$ATT_SQL"; echo "$GRADES_SQL";
    echo "$SETVAL_SQL"; echo 'COMMIT;';
  } | run_psql
else
  # ── حالتِ --low-disk: تراکنشِ جدول‌به‌جدول + آزادسازیِ فضا ──
  { echo '\set ON_ERROR_STOP on'; echo 'BEGIN;';
    echo "$GUARD_SQL"; echo "$SUBJECTS_SQL"; echo "$SCHOOLS_SQL"; echo 'COMMIT;';
  } | run_psql && rm -f "$ABS/schools.csv" && echo "  ✓ schools (+provinces/subjects) — CSV آزاد شد"
  for spec in "classes:$CLASSES_SQL" "users:$USERS_SQL" "parent_links:$PL_SQL" "attendance:$ATT_SQL" "grades:$GRADES_SQL"; do
    tbl=${spec%%:*}; sql=${spec#*:}
    need_csv "$tbl"
    echo "  → $tbl …"
    { echo '\set ON_ERROR_STOP on'; echo 'BEGIN;'; echo "$sql"; echo 'COMMIT;'; } | run_psql
    rm -f "$ABS/$tbl.csv"
    echo "    ✓ $tbl — CSV آزاد شد"
  done
  { echo '\set ON_ERROR_STOP on'; echo "$SETVAL_SQL"; } | run_psql
fi

echo "→ ANALYZE (می‌تواند چند دقیقه طول بکشد)…"
psql "$URL" -v ON_ERROR_STOP=1 -c "ANALYZE schools; ANALYZE classes; ANALYZE users; ANALYZE parent_links; ANALYZE attendance; ANALYZE grades; ANALYZE subjects; ANALYZE provinces;"
echo "✓ بارگذاری کامل — شمارش‌ها:"
psql "$URL" -t -c "SELECT 'schools='||(SELECT count(*) FROM schools)||' classes='||(SELECT count(*) FROM classes)||' users='||(SELECT count(*) FROM users)||' parent_links='||(SELECT count(*) FROM parent_links)||' attendance='||(SELECT count(*) FROM attendance)||' grades='||(SELECT count(*) FROM grades);"

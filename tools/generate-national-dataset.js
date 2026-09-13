#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Wave 18 — تولیدِ دادهٔ آزمایشیِ مقیاسِ ملی (10 میلیون کاربر)
   ⚠️ یادداشتِ ممیزیِ هماهنگی (2026-09-10): ابعادِ پیش‌فرضِ این مولد
   (کلاس‌ها 1,000,000 · نمره‌ها 20,000,000 · اولیا 900,000) با ابعادِ
   مصوبِ docs/LOAD_TEST_PLAN.md §۲.۱ (کلاس ۲۱۴ هزار · نمره ۲۸۸ میلیون
   · اولیا ≈۱.۸ میلیون — مشتق از CAPACITY_MODEL) یکسان نیست. تا
   هم‌ترازسازی (docs/DOCS_CONSISTENCY_REPORT.md قلم ۲)، خروجیِ این
   ابزار دیتاستِ رسمیِ طرحِ بار را بازتولید نمی‌کند.
   ─────────────────────────────────────────────────────────────────
   ابزارِ طراحی‌شده برایِ تست‌هایِ بارِ ملی (docs/WAVE18_LOAD_TEST_PLAN.md).
   خروجی: فایل‌هایِ CSV (PG COPY-ready + k6 data) در دایرکتوریِ انتخابی
   + stats.json (تعدادها + sha256 هر فایل) + README.md (دستورالعمل).

   مقیاسِ کامل (scale=1) — نسبت‌ها بر اساسِ الگویِ واقعیِ ایران:
     schools     100,000   (≈ سطحِ واقعیِ مدارسِ کشور)
     classes   1,000,000   (10 کلاس در هر مدرسه)
     users    10,000,000   (تفکیکِ زیر)
       students     8,000,000  (80 دانش‌آموز در هر مدرسه ≈ میانگینِ واقعی)
       teachers     1,000,000  (1 دبیرِ کلاس‌سرپرست در هر کلاس)
       parents        900,000  (≈ 11% فعال‌سازیِ پنلِ اولیا در سالِ اول)
       admins         99,900   (مدیر + معاون در هر مدرسه)
       edu_office          99  (اداراتِ کل/شهرستان/منطقه)
       superadmin          1
     attendance 50,000,000  (6 روزِ مدرسه + ۲۵٪ دانش‌آموزان یک روزِ بیشتر)
     grades     20,000,000  (2 آزمون + 50٪ دانش‌آموزان یک آزمونِ بیشتر)
     parent_links 900,000   (1 پیوند در هر ولی)

   ویژگی‌ها:
     - قطعی (deterministic): seed ثابت ⇒ دو اجرا = فایل‌هایِ بایت-به-بایت
       یکسان (برایِ بازتولیدپذیریِ تست‌ها).
     - پخش‌شده (streaming): نوشتِ chunked — مقیاسِ کامل ≈ 10GB در ~3 دقیقه
       با پیکِ حافظهٔ ثابت (~50MB).
     - واقع‌گرا: شناسهٔ ملی با رقمِ کنترلِ معتبر (الگوریتمِ رسمی)،
       تلفن‌هایِ 09…، استان‌هایِ واقعیِ 31 گانه — بدونِ هیچ دادهٔ واقعی
       (همهٔ شناسه‌ها مصنوعی و تکرارناپذیرند).
     - بدونِ وابستگی: فقط stdlib (fs/path/crypto).

   Usage:
     node tools/generate-national-dataset.js --plan
     node tools/generate-national-dataset.js --scale 1 --out data/national/full
     node tools/generate-national-dataset.js --scale 0.001 --out /tmp/w18
     node tools/generate-national-dataset.js --scale 1 --seed 20260901
   Flags:
     --scale <n>    1 = ملی (پیش‌فرض: 0.001 = ~10 هزار کاربر)
     --out <dir>    دایرکتوریِ خروجی (پیش‌فرض: data/national/scale-<n>)
     --seed <n>     بذرِ قطعی (پیش‌فرض: 20260901)
     --fast         نام‌ها به‌جای فهرستِ نام (سریع‌تر؛ برایِ CI)
     --quiet        بدونِ لاگِ پیشرفت
     --plan         فقط جدولِ مقیاس را چاپ کن (فایلی ننویسد)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ── CLI ──────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
function arg(name, def){
  const i = argv.indexOf(name);
  return i > -1 && argv[i + 1] ? argv[i + 1] : def;
}
const has = (name) => argv.indexOf(name) > -1;

if(has('--help') || has('-h')){
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 45).join('\n').replace(/^   /gm, ''));
  process.exit(0);
}
/* --plan پیش‌فرضِ مقیاسِ ملی دارد (جدولِ 10 میلیون)؛ تولید، مقیاسِ کوچکِ CI */
const SCALE = Math.max(0.0001, Number(arg('--scale', has('--plan') ? '1' : '0.001')));
const SEED = Number(arg('--seed', '20260901')) || 20260901;
const OUT = arg('--out', null);
const FAST = has('--fast');
const QUIET = has('--quiet');
const ROOT = path.join(__dirname, '..');
const OUT_DIR = OUT || path.join(ROOT, 'data', 'national', 'scale-' + String(SCALE).replace('.', '_'));

/* ── اعدادِ مقیاس (linear از پایهٔ ملی) ───────────────────────────── */
function plan(scale){
  const schools = Math.max(1, Math.round(100000 * scale));
  const classesPerSchool = 10;
  const classes = schools * classesPerSchool;
  const studentsPerClass = 8;
  const students = classes * studentsPerClass;              /* 80 در هر مدرسه */
  const teachers = classes;                                 /* 1 کلاس‌سرپرست در هر کلاس */
  const parents = Math.max(1, Math.round(students * 0.1125)); /* ≈11% فعال‌سازی */
  const admins = Math.max(1, Math.round(99900 * scale));
  const eduOffice = Math.max(1, Math.round(99 * scale));
  const superadmin = 1;
  const users = superadmin + eduOffice + admins + teachers + students + parents;
  const ATT_BASE = 6, ATT_FRAC = 0.25;                       /* 6.25 روز در هر دانش‌آموز */
  const attendance = students * ATT_BASE + Math.floor(students * ATT_FRAC);
  const GR_BASE = 2, GR_FRAC = 0.5;                          /* 2.5 آزمون در هر دانش‌آموز */
  const grades = students * GR_BASE + Math.floor(students * GR_FRAC);
  const parentLinks = parents;
  /* ── روابط P0-4 (فهرست بازبین مستقل — نسبت‌های نزدیک به workload واقعی) ──
     enrollments: هر دانش‌آموز دقیقاً ۱ ثبت‌نام سال جاری (UNIQUE student,year)
     messages: هر ولیِ فعال ~۲ پیام به مدرسه در بازهٔ داده + hotspot
     notifications: ۱ به‌ازای هر دانش‌آموز + ۱ به‌ازای هر دبیر
     tuitions: هر دانش‌آموز ۱ پروندهٔ شهریه؛ installments: ۳ قسط per tuition
     scholarships: ~۲٪ دانش‌آموزان تحت پوشش
     staff_attendance: هر دبیر × همان ۶ روز مدرسه
     substitutions: ~۳۰٪ کلاس‌ها یک جایگزینی در بازهٔ داده
     training_courses: ~۲۰٪ دبیران یک دورهٔ ضمن خدمت
     outbox (server_outbox): ۱ رویداد sync per دانش‌آموز (ژورنال رویداد واقعی
       سیستم — جدول audit جداگانه در اسکیمای مخزن وجود ندارد؛ UI ی audit از
       oplog درون‌حافظه می‌خواند: src/js/36-audit-activity.js) */
  const enrollments = students;
  const HOT_SCHOOLS = Math.max(1, Math.round(schools * 0.01));  /* ~۱٪ مدارس پرترافیک */
  /* پایهٔ پیام باید از مدارسِ «فعال» محاسبه شود: پیوندِ ولی→دانش‌آموز در
     مولدِ موجود سری است (ولی k → دانش‌آموز k)، پس پیام‌های پایه فقط در
     ceil(parents/studentsPerSchool) مدرسهٔ اول می‌افتند — یافتهٔ Independent
     Review این دور؛ محاسبه از میانگینِ همهٔ مدارس ضریبِ داغ را بی‌اثر می‌کرد. */
  const studentsPerSchool = studentsPerClass * classesPerSchool;
  const activeMsgSchools = Math.min(schools, Math.ceil(parents / studentsPerSchool));
  const baseMsgsPerSchool = Math.ceil((parents * 2) / activeMsgSchools);
  const HOT_FACTOR = 10;                                     /* مدرسهٔ داغ = ۱۰× پیام مدرسهٔ فعالِ عادی */
  const hotExtraPerSchool = baseMsgsPerSchool * (HOT_FACTOR - 1);
  const messages = parents * 2 + HOT_SCHOOLS * hotExtraPerSchool;
  const notifications = students + teachers;
  const tuitions = students;
  const INST_PER_TUITION = 3;
  const installments = tuitions * INST_PER_TUITION;
  const scholarships = Math.max(1, Math.round(students * 0.02));
  const staffAttendance = teachers * ATT_BASE;
  const substitutions = Math.max(1, Math.round(classes * 0.3));
  const trainingCourses = Math.max(1, Math.round(teachers * 0.2));
  const outbox = students;
  return { scale, schools, classesPerSchool, classes, studentsPerClass, students, teachers, parents, admins, eduOffice, superadmin, users, ATT_BASE, ATT_FRAC, attendance, GR_BASE, GR_FRAC, grades, parentLinks,
    enrollments, messages, notifications, tuitions, INST_PER_TUITION, installments, scholarships, staffAttendance, substitutions, trainingCourses, outbox,
    HOT_SCHOOLS, HOT_FACTOR, baseMsgsPerSchool, hotExtraPerSchool, seed: SEED };
}
const P = plan(SCALE);

if(has('--plan')){
  console.log('Wave 18 — national dataset plan (scale=' + P.scale + ', seed=' + P.seed + ')');
  console.log('  schools      ' + String(P.schools).padStart(10));
  console.log('  classes      ' + String(P.classes).padStart(10) + '   (' + P.classesPerSchool + ' per school)');
  console.log('  users        ' + String(P.users).padStart(10));
  console.log('    students   ' + String(P.students).padStart(10) + '   (' + P.studentsPerClass + ' per class / ' + (P.studentsPerClass * P.classesPerSchool) + ' per school)');
  console.log('    teachers   ' + String(P.teachers).padStart(10) + '   (1 homeroom per class)');
  console.log('    parents    ' + String(P.parents).padStart(10) + '   (~11% of students, year-1 activation)');
  console.log('    admins     ' + String(P.admins).padStart(10) + '   (manager+deputy per school)');
  console.log('    edu_office ' + String(P.eduOffice).padStart(10));
  console.log('    superadmin ' + String(P.superadmin).padStart(10));
  console.log('  attendance   ' + String(P.attendance).padStart(10) + '   (' + P.ATT_BASE + ' days + ' + P.ATT_FRAC + ' of students one more)');
  console.log('  grades       ' + String(P.grades).padStart(10) + '   (' + P.GR_BASE + ' exams + ' + P.GR_FRAC + ' of students one more)');
  console.log('  parent_links ' + String(P.parentLinks).padStart(10));
  console.log('  ── روابط P0-4 ──');
  console.log('  enrollments      ' + String(P.enrollments).padStart(10) + '   (1 per student, current year)');
  console.log('  messages         ' + String(P.messages).padStart(10) + '   (2 per parent + ' + P.HOT_SCHOOLS + ' hot schools ×' + P.HOT_FACTOR + ')');
  console.log('  notifications    ' + String(P.notifications).padStart(10) + '   (1 per student + 1 per teacher)');
  console.log('  tuitions         ' + String(P.tuitions).padStart(10) + '   (1 per student)');
  console.log('  installments     ' + String(P.installments).padStart(10) + '   (' + P.INST_PER_TUITION + ' per tuition)');
  console.log('  scholarships     ' + String(P.scholarships).padStart(10) + '   (~2% of students)');
  console.log('  staff_attendance ' + String(P.staffAttendance).padStart(10) + '   (teachers × ' + P.ATT_BASE + ' days)');
  console.log('  substitutions    ' + String(P.substitutions).padStart(10) + '   (~30% of classes)');
  console.log('  training_courses ' + String(P.trainingCourses).padStart(10) + '   (~20% of teachers)');
  console.log('  outbox           ' + String(P.outbox).padStart(10) + '   (1 sync event per student — event journal)');
  process.exit(0);
}

/* ── RNG قطعی (mulberry32) ─────────────────────────────────────────── */
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const ri = (min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

/* ── داده‌هایِ بومی (مصنوعی و امن) ────────────────────────────────── */
const PROVINCES = ['تهران','اصفهان','فارس','خراسان رضوی','آذربایجان شرقی','آذربایجان غربی','البرز','مازندران','گلستان','گیلان','همدان','هرمزگان','ایلام','بوشهر','چهارمحال و بختیاری','کهگیلویه و بویراحمد','کرمان','خوزستان','کردستان','لرستان','مرکزی','قزوین','قم','سمنان','سیستان و بلوچستان','خراسان جنوبی','خراسان شمالی','زنجان','یزد','کرمانشاه','اردبیل'];
const CITIES = ['تهران','اصفهان','شیراز','مشهد','تبریز','ارومیه','کرج','ساری','گرگان','رشت','همدان','بندرعباس','ایلام','بندر بوشهر','شهرکرد','یاسوج','کرمان','اهواز','سنندجان','خرم‌آباد','اراک','قزوین','قم','سمنان','زاهدان','بیرجند','بجنورد','زنجان','یزد','کرمانشاه','اردبیل'];
const FIRST_M = ['امیر','حسین','علی','رضا','سعید','مهدی','حمید','آرمان','پویا','سامان','کیان','بردیا','فرهاد','کامران','نیما','رادین','آریا','کیانوش','شایان','بهنام'];
const FIRST_F = ['سارا','نگار','مینا','الناز','تینا','آیدا','نگین','لیلا','پریسا','شیرین','مهسا','روژا','آناهیتا','کیانا','مریم','دانا','الهام','مهرو','آرویا','نیلوفر'];
const LAST = ['محمدی','حسینی','جعفری','رحیمی','موسوی','کریمی','احمدی','قاسمی','رضایی','ابراهیمی','شاهین','کاظمی','علی‌پور','مرادی','صفری','نجفی','اکبری','حسین‌پور','طاهری','سلطانی'];
const SUBJECTS = ['ریاضی','فیزیک','شیمی','زیست‌شناسی','ادبیات فارسی','زبان عربی','دینی','مطالعات اجتماعی','زبان انگلیسی','علوم تجربی','فناوری اطلاعات','هنرهای زیبا','ورزش','کار و فناوری','تفکر و پژوهش'];
const TERMS = ['نوبت اول','نوبت دوم'];
const EXAM_TYPES = ['کلاسی','میان‌ترم','پایانی','ماهانه'];
const ATT_STATUS = ['present','present','present','present','present','present','present','present','present','absent','late','excused']; /* ~75% حضور، ~8٪ غیاب، ~8٪ تأخیر، ~8٪ عذر */
/* اولین ۸ روزِ مدرسهٔ سالِ ۱۴۰۵-۱۴۶ (شروع: ۱۴۰/07/01 = 2026-09-11) */
const SCHOOL_DAYS = ['2026-09-11','2026-09-12','2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-19','2026-09-20'];
const LEVELS = ['ابتدایی','متوسطه اول','متوسطه دوم'];
const FIELDS = ['عمومی','ریاضی','فیزیک','شیمی','ادبیات'];

/* شناسهٔ ملیِ مصنوعی با رقمِ کنترلِ معتبر و تکرارناپذیر:
   base 9 رقمی = (K + id·M) mod 10^9 — M با 10^9 نسبتِ اول است ⇒ دو‌یک‌یک */
const NID_K = (SEED % 900000000) + 100000000;
const NID_M = 2654435761n;
function nationalId(id){
  let base = BigInt(NID_K) + BigInt(id) * NID_M;
  base = base % 1000000000n;
  if(base < 100000000n) base += 100000000n; /* حداقل 9 رقم */
  const b = base.toString().padStart(9, '0');
  let sum = 0;
  for(let i = 0; i < 9; i++) sum += Number(b[i]) * (10 - i);
  const rem = sum % 11;
  return b + (rem < 2 ? rem : 11 - rem);
}
/* تلفنِ مصنوعی و تکرارناپذیر: '09' + 10 رقمِ دو-یک-یک (M2 با 10^10 نسبتِ اول است) */
const PHONE_K = (SEED % 10000000000) + 1000000000;
const PHONE_M = 2654435761n;
function phone(id){
  const tail = (BigInt(PHONE_K) + BigInt(id) * PHONE_M) % 10000000000n;
  return '09' + tail.toString().padStart(10, '0');
}
function fullName(role, id){
  if(FAST) return 'کاربر ' + id;
  const last = LAST[id % LAST.length];
  if(role === 'student') return (id % 2 ? FIRST_M : FIRST_F)[id % 20] + ' ' + last;
  if(role === 'parent' || role === 'teacher') return FIRST_M[id % 20] + ' ' + last;
  return (id % 2 ? FIRST_M : FIRST_F)[id % 20] + ' ' + last;
}

/* ── نوشتِ CSVِ پخش‌شده ────────────────────────────────────────────── */
class CsvWriter{
  constructor(fp, header){
    this.fp = fp; this.header = header;
    this.fh = fs.openSync(fp, 'w');
    fs.writeSync(this.fh, header + '\n');
    this.buf = []; this.rows = 0; this.bytes = 0;
  }
  push(fields){
    this.buf.push(fields.join(','));
    this.rows++;
    if(this.buf.length >= 200000){
      const s = this.buf.join('\n') + '\n';
      fs.writeSync(this.fh, s);
      this.bytes += Buffer.byteLength(s);
      this.buf = [];
    }
  }
  close(){
    if(this.buf.length){
      const s = this.buf.join('\n') + '\n';
      fs.writeSync(this.fh, s);
      this.bytes += Buffer.byteLength(s);
      this.buf = [];
    }
    fs.closeSync(this.fh);
    return { rows: this.rows, bytes: this.bytes };
  }
}
const csv = (s) => String(s); /* هیچ فیلدی coma/quote ندارد — خروجیِ ساده */

/* ── ساختارِ idها (بلوک‌هایِ پیوسته در users.csv) ─────────────────── */
const ID = {
  superadmin: 1,
  eduOffice: [2, 1 + P.eduOffice],
  admins: [2 + P.eduOffice, 1 + P.eduOffice + P.admins],
  teachers: [2 + P.eduOffice + P.admins, 1 + P.eduOffice + P.admins + P.teachers],
  students: [2 + P.eduOffice + P.admins + P.teachers, 1 + P.eduOffice + P.admins + P.teachers + P.students],
  parents: [2 + P.eduOffice + P.admins + P.teachers + P.students, P.users]
};

const t0 = Date.now();
fs.mkdirSync(OUT_DIR, { recursive: true });
const log = (...a) => { if(!QUIET) console.log(...a); };
const done = {};

/* 1) schools ─────────────────────────────────────────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'schools.csv'), 'id,name,code,province,city,phone,level,type,gender,shift,capacity,active');
  for(let i = 1; i <= P.schools; i++){
    const prov = PROVINCES[(i - 1) % PROVINCES.length];
    const city = CITIES[(i - 1) % CITIES.length];
    w.push([i,
      'مدرسه ' + (i % 2 ? 'دبستان' : 'دبیرستان') + ' ' + city + ' ' + i,
      'SCH-' + String(i).padStart(8, '0'),
      prov, city, '0' + String(21000000 + ((i * 37) % 9000000)),
      LEVELS[i % 3],
      i % 5 === 0 ? 'خودمختار' : 'دولتی',
      ['دختر','پسر','ترکیبی'][i % 3],
      ['صبح','بعدازظهر','هر دو'][i % 3],
      400 + (i % 200), 1]);
  }
  done.schools = w.close();
  log('  schools     ' + done.schools.rows);
}

/* 2) classes (homeroom به دبیرِ همان مدرسه) ──────────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'classes.csv'), 'id,school_id,name,grade,field,room,capacity,homeroom_teacher_id');
  for(let i = 1; i <= P.classes; i++){
    const school = Math.ceil(i / P.classesPerSchool);
    const inSchool = (i - 1) % P.classesPerSchool;
    const tIdx = inSchool; /* دبیرِ شمارهٔ inSchool از بلوکِ دبیرانِ همان مدرسه */
    const tStart = ID.teachers[0] + (school - 1) * P.classesPerSchool;
    w.push([i, school, 'کلاس ' + (inSchool + 1) + '-الف', (i - 1) % 12 + 1,
      i % 3 === 0 ? pick(FIELDS) : 'عمومی', 'سالن ' + (100 + inSchool), 30, tStart + tIdx + 1]);
  }
  done.classes = w.close();
  log('  classes     ' + done.classes.rows);
}

/* 3) users (بلوک‌هایِ نقش) ───────────────────────────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'users.csv'), 'id,role,full_name,username,national_id,phone,active,school_id,subject_id,job');
  /* superadmin */
  w.push([ID.superadmin, 'superadmin', 'مدیر کل سامانه', 'superadmin', nationalId(ID.superadmin), phone(ID.superadmin), 1, '', '', '']);
  /* edu_office */
  for(let i = ID.eduOffice[0]; i <= ID.eduOffice[1]; i++){
    w.push([i, 'edu_office', fullName('edu_office', i), 'eduoffice' + (i - ID.eduOffice[0] + 1), nationalId(i), phone(i), 1, '', '', 'کارشناس آموزش و پرورش']);
  }
  /* admins: مدیر + معاون در هر مدرسه */
  for(let i = ID.admins[0]; i <= ID.admins[1]; i++){
    const k = i - ID.admins[0];
    const school = Math.floor(k / 2) + 1; /* 2 مدیر در هر مدرسه (حدأ تا سقفِ موجود) */
    w.push([i, 'manager', fullName('manager', i), (k % 2 ? 'deputy' : 'manager') + school, nationalId(i), phone(i), 1, school, '', k % 2 ? 'معاون آموزشی' : 'مدیر مدرسه']);
  }
  /* teachers: 10 در هر مدرسه (1 کلاس‌سرپرست در هر کلاس) */
  for(let i = ID.teachers[0]; i <= ID.teachers[1]; i++){
    const k = i - ID.teachers[0];
    const school = Math.floor(k / P.classesPerSchool) + 1;
    w.push([i, 'teacher', fullName('teacher', i), 'teacher' + school + '_' + (k % P.classesPerSchool + 1), nationalId(i), phone(i), 1, school, (k % SUBJECTS.length) + 1, '']);
  }
  /* students: 8 در هر کلاس */
  for(let i = ID.students[0]; i <= ID.students[1]; i++){
    const k = i - ID.students[0];
    const cls = Math.floor(k / P.studentsPerClass) + 1;
    const school = Math.ceil(cls / P.classesPerSchool);
    w.push([i, 'student', fullName('student', i), 'student' + (k + 1), nationalId(i), phone(i), k % 50 === 0 ? 0 : 1, school, '', '']);
  }
  /* parents */
  for(let i = ID.parents[0]; i <= ID.parents[1]; i++){
    const k = i - ID.parents[0];
    const student = ID.students[0] + (k % P.students); /* هر ولی یک فرزند (توزیعِ یکنواخت) */
    const school = Math.ceil((Math.floor((student - ID.students[0]) / P.studentsPerClass) + 1) / P.classesPerSchool);
    w.push([i, 'parent', fullName('parent', i), 'parent' + (k + 1), nationalId(i), phone(i), 1, school, '', 'کارمند']);
  }
  done.users = w.close();
  log('  users       ' + done.users.rows);
}

/* 4) parent_links ────────────────────────────────────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'parent_links.csv'), 'id,parent_id,student_id,relation');
  for(let k = 0; k < P.parentLinks; k++){
    const parent = ID.parents[0] + k;
    const student = ID.students[0] + (k % P.students);
    w.push([k + 1, parent, student, 'پدر']);
  }
  done.parent_links = w.close();
  log('  parent_links ' + done.parent_links.rows);
}

/* 5) attendance: هر دانش‌آموز 6 روز + ۲۵٪ یک روزِ هفتم ───────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'attendance.csv'), 'id,school_id,student_id,class_id,date,status,teacher_id,registered_by,taken_at');
  let n = 0;
  for(let k = 0; k < P.students; k++){
    const student = ID.students[0] + k;
    const cls = Math.floor(k / P.studentsPerClass) + 1;
    const school = Math.ceil(cls / P.classesPerSchool);
    const tStart = ID.teachers[0] + (school - 1) * P.classesPerSchool;
    const homeroom = tStart + ((cls - 1) % P.classesPerSchool);
    const days = P.ATT_BASE + (k % 4 === 0 ? 1 : 0); /* ۲۵٪ یک روزِ بیشتر */
    for(let d = 0; d < days; d++){
      n++;
      const iso = SCHOOL_DAYS[d];
      const sv = (student * 31 + iso.charCodeAt(iso.length - 1) * 7) % 97; /* هاشِ قطعی (الگوی seed) */
      const s = ATT_STATUS[sv % ATT_STATUS.length];
      w.push([n, school, student, cls, iso, s, homeroom, homeroom, iso + 'T07:' + String(50 + sv % 10).padStart(2, '0') + ':00']);
    }
  }
  done.attendance = w.close();
  log('  attendance  ' + done.attendance.rows);
}

/* 6) grades: هر دانش‌آموز 2 آزمون + 50٪ یک آزمونِ سوم ─────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'grades.csv'), 'id,school_id,student_id,class_id,subject_id,teacher_id,term,exam_type,score,max_score,created_at');
  let n = 0;
  for(let k = 0; k < P.students; k++){
    const student = ID.students[0] + k;
    const cls = Math.floor(k / P.studentsPerClass) + 1;
    const school = Math.ceil(cls / P.classesPerSchool);
    const tStart = ID.teachers[0] + (school - 1) * P.classesPerSchool;
    const homeroom = tStart + ((cls - 1) % P.classesPerSchool);
    const exams = P.GR_BASE + (k % 2 === 0 ? 1 : 0);
    for(let e = 0; e < exams; e++){
      n++;
      const subj = ((k + e) % SUBJECTS.length) + 1;
      const teach = tStart + (subj - 1);
      const sv = (student * 13 + e * 7) % 21;
      w.push([n, school, student, cls, subj, teach, TERMS[e % 2], EXAM_TYPES[(k + e) % 4], 10 + sv, 20, '2026-09-' + String(20 + (e % 5)).padStart(2, '0')]);
    }
  }
  done.grades = w.close();
  log('  grades      ' + done.grades.rows);
}

/* ── هندسهٔ مشترک روابط (قطعی — همه از k دانش‌آموز/دبیر مشتق می‌شوند) ── */
const studentOf = (k) => ID.students[0] + k;
const classOfStudent = (k) => Math.floor(k / P.studentsPerClass) + 1;
const schoolOfClass = (cls) => Math.ceil(cls / P.classesPerSchool);
const homeroomOfClass = (cls) => {
  const school = schoolOfClass(cls);
  return ID.teachers[0] + (school - 1) * P.classesPerSchool + ((cls - 1) % P.classesPerSchool);
};
/* مدارس داغ: قطعی و پخش‌شده روی کل بازه (نه فقط اولین‌ها) */
const hotStep = Math.max(1, Math.floor(P.schools / P.HOT_SCHOOLS));
const isHotSchool = (s) => ((s - 1) % hotStep === 0) && ((s - 1) / hotStep) < P.HOT_SCHOOLS;
const TS = (d, hh, mm) => SCHOOL_DAYS[d % SCHOOL_DAYS.length] + 'T' + String(hh).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0') + ':00';

/* 7) enrollments: هر دانش‌آموز ۱ ثبت‌نام سال جاری (uq student,year) ── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'enrollments.csv'), 'id,school_id,student_id,class_id,year,created_at');
  for(let k = 0; k < P.students; k++){
    const cls = classOfStudent(k);
    w.push([k + 1, schoolOfClass(cls), studentOf(k), cls, 1405, TS(0, 8, k % 60)]);
  }
  done.enrollments = w.close();
  log('  enrollments ' + done.enrollments.rows);
}

/* 8) messages: ۲ پیام per ولی + ترافیک اضافی مدارس داغ ─────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'messages.csv'), 'id,school_id,from_id,to_id,body,created_at');
  let n = 0;
  for(let k = 0; k < P.parentLinks; k++){
    const parent = ID.parents[0] + k;
    const sk = k % P.students;
    const cls = classOfStudent(sk);
    const school = schoolOfClass(cls);
    const manager = ID.admins[0] + (school - 1) * 2;
    for(let m = 0; m < 2; m++){
      n++;
      w.push([n, school, m % 2 ? manager : parent, m % 2 ? parent : manager,
        'پیام شماره ' + n + ' دربارهٔ دانش‌آموز ' + studentOf(sk), TS(k % 8, 9 + m, k % 60)]);
    }
  }
  /* hotspot: مدارس داغ ۹× پیام اضافه (بین ولی‌های همان مدرسه) */
  for(let s = 1; s <= P.schools; s++){
    if(!isHotSchool(s)) continue;
    const manager = ID.admins[0] + (s - 1) * 2;
    for(let e = 0; e < P.hotExtraPerSchool; e++){
      n++;
      /* یک ولیِ قطعی از همان بازه (پیوند از توزیع یکنواخت parent→student) */
      const parent = ID.parents[0] + ((s * 131 + e * 17) % P.parentLinks);
      w.push([n, s, e % 2 ? manager : parent, e % 2 ? parent : manager,
        'پیام پرترافیک ' + n + ' (مدرسه داغ ' + s + ')', TS(e % 8, 10 + (e % 8), e % 60)]);
    }
  }
  done.messages = w.close();
  log('  messages    ' + done.messages.rows);
}

/* 9) notifications: ۱ per دانش‌آموز + ۱ per دبیر ───────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'notifications.csv'), 'id,school_id,user_id,role,type,title,body,read,created_at');
  let n = 0;
  for(let k = 0; k < P.students; k++){
    n++;
    const cls = classOfStudent(k);
    w.push([n, schoolOfClass(cls), studentOf(k), 'student', 'attendance', 'اعلان حضور ' + n,
      'وضعیت حضور به‌روز شد', k % 3 === 0 ? 1 : 0, TS(k % 8, 12, k % 60)]);
  }
  for(let t = 0; t < P.teachers; t++){
    n++;
    const school = Math.floor(t / P.classesPerSchool) + 1;
    w.push([n, school, ID.teachers[0] + t, 'teacher', 'schedule', 'اعلان برنامه ' + n,
      'برنامهٔ هفتگی به‌روز شد', t % 2, TS(t % 8, 13, t % 60)]);
  }
  done.notifications = w.close();
  log('  notifications ' + done.notifications.rows);
}

/* 10) tuitions + installments (۳ قسط per پرونده) ───────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'tuitions.csv'), 'id,school_id,student_id,class_id,total,paid,payable,status,created_at');
  const wi = new CsvWriter(path.join(OUT_DIR, 'installments.csv'), 'id,school_id,student_id,tuition_id,seq,amount,status,due_date,created_at');
  let ni = 0;
  for(let k = 0; k < P.students; k++){
    const cls = classOfStudent(k);
    const school = schoolOfClass(cls);
    const total = 12000000 + (k % 10) * 500000;
    const paidInst = k % 4;                                 /* 0..3 قسط پرداخته */
    const per = Math.floor(total / P.INST_PER_TUITION);
    w.push([k + 1, school, studentOf(k), cls, total, paidInst * per,
      total - paidInst * per, paidInst === 3 ? 'paid' : 'open', TS(0, 8, k % 60)]);
    for(let q = 0; q < P.INST_PER_TUITION; q++){
      ni++;
      wi.push([ni, school, studentOf(k), k + 1, q + 1, per,
        q < paidInst ? 'paid' : 'due', '2026-1' + q + '-01', TS(q % 8, 9, k % 60)]);
    }
  }
  done.tuitions = w.close();
  done.installments = wi.close();
  log('  tuitions    ' + done.tuitions.rows + '  installments ' + done.installments.rows);
}

/* 11) scholarships: ~۲٪ دانش‌آموزان (هر پنجاهمین) ──────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'scholarships.csv'), 'id,school_id,student_id,status,note,created_at');
  let n = 0;
  for(let k = 0; k < P.students; k += 50){
    n++;
    if(n > P.scholarships) break;
    const cls = classOfStudent(k);
    w.push([n, schoolOfClass(cls), studentOf(k), n % 3 ? 'approved' : 'pending',
      'کمک‌هزینه ' + n, TS(k % 8, 11, k % 60)]);
  }
  done.scholarships = w.close();
  log('  scholarships ' + done.scholarships.rows);
}

/* 12) staff_attendance: هر دبیر × ۶ روز مدرسه ─────────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'staff_attendance.csv'), 'id,school_id,staff_id,date,status,registered_by,created_at');
  let n = 0;
  for(let t = 0; t < P.teachers; t++){
    const school = Math.floor(t / P.classesPerSchool) + 1;
    const manager = ID.admins[0] + (school - 1) * 2;
    for(let d = 0; d < P.ATT_BASE; d++){
      n++;
      const sv = (t * 17 + d * 31) % 100;
      w.push([n, school, ID.teachers[0] + t, SCHOOL_DAYS[d],
        sv < 92 ? 'present' : (sv < 96 ? 'absent' : 'leave'), manager, TS(d, 7, t % 60)]);
    }
  }
  done.staff_attendance = w.close();
  log('  staff_attendance ' + done.staff_attendance.rows);
}

/* 13) substitutions: ~۳۰٪ کلاس‌ها یک جایگزینی ──────────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'substitutions.csv'), 'id,school_id,date,sub_teacher_id,created_at');
  let n = 0;
  for(let c = 1; c <= P.classes && n < P.substitutions; c += 3){  /* هر سومین کلاس ≈ ۳۰٪+ */
    n++;
    const school = schoolOfClass(c);
    /* دبیر جایگزین = دبیر بعدی همان مدرسه (قطعی، درون-tenant) */
    const sub = ID.teachers[0] + (school - 1) * P.classesPerSchool + (c % P.classesPerSchool);
    w.push([n, school, SCHOOL_DAYS[c % SCHOOL_DAYS.length], sub, TS(c % 8, 8, c % 60)]);
  }
  done.substitutions = w.close();
  log('  substitutions ' + done.substitutions.rows);
}

/* 14) training_courses: ~۲۰٪ دبیران (هر پنجمین) ────────────────────── */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'training_courses.csv'), 'id,school_id,staff_id,title,hours,status,date,created_at');
  let n = 0;
  for(let t = 0; t < P.teachers && n < P.trainingCourses; t += 5){
    n++;
    const school = Math.floor(t / P.classesPerSchool) + 1;
    w.push([n, school, ID.teachers[0] + t, 'دوره ضمن خدمت ' + n, 8 + (t % 4) * 8,
      n % 4 ? 'completed' : 'enrolled', SCHOOL_DAYS[t % SCHOOL_DAYS.length], TS(t % 8, 14, t % 60)]);
  }
  done.training_courses = w.close();
  log('  training_courses ' + done.training_courses.rows);
}

/* 15) outbox (server_outbox): ژورنال رویداد sync — ۱ per دانش‌آموز ──
   جدول audit جداگانه در اسکیمای مخزن نیست؛ ژورنال رویدادِ واقعی سیستم
   server_outbox است (schema.sql:29) و UI ی «سابقه تغییرات» از oplog
   درون‌حافظه می‌خواند (src/js/36-audit-activity.js). */
{
  const w = new CsvWriter(path.join(OUT_DIR, 'outbox.csv'), 'id,type,collection,record_id,actor_id,version,status,created_at');
  for(let k = 0; k < P.outbox; k++){
    const cls = classOfStudent(k);
    const school = schoolOfClass(cls);
    const homeroom = homeroomOfClass(cls);
    w.push([k + 1, k % 2 ? 'upd' : 'ins', k % 3 === 0 ? 'grades' : 'attendance',
      k + 1, homeroom, 1, 'processed', TS(k % 8, 15, k % 60)]);
  }
  done.outbox = w.close();
  log('  outbox      ' + done.outbox.rows);
}

/* ── stats.json + README + hash ───────────────────────────────────── */
const stats = {
  generated_at: new Date().toISOString(),
  tool: 'tools/generate-national-dataset.js (Wave 18)',
  plan: P,
  counts: Object.fromEntries(Object.entries(done).map(([k, v]) => [k, v.rows])),
  /* نسبت‌های ثبت‌شده (قرارداد P0-4 — سوئیت integrity این‌ها را می‌سنجد) */
  ratios: {
    enrollments_per_student: 1,
    messages_per_parent_base: 2,
    hot_schools: P.HOT_SCHOOLS,
    hot_factor: P.HOT_FACTOR,
    notifications: 'students + teachers',
    tuitions_per_student: 1,
    installments_per_tuition: P.INST_PER_TUITION,
    scholarships_share_of_students: 0.02,
    staff_attendance_days: P.ATT_BASE,
    substitutions_share_of_classes: 0.3,
    training_share_of_teachers: 0.2,
    outbox_per_student: 1
  },
  total_users_by_role: {
    superadmin: P.superadmin, edu_office: P.eduOffice, manager: P.admins,
    teacher: P.teachers, student: P.students, parent: P.parents
  },
  checksums: {}
};
for(const f of fs.readdirSync(OUT_DIR)){
  if(f.endsWith('.csv')){
    /* P0-4 fix: readFileSync سقف ~2GiB دارد — attendance.csv از scale≈0.5
       به بالا از آن می‌گذرد و مولد در پایان کرش می‌کرد (stats.json نمی‌نوشت).
       هش را پخش‌شده (چانک ۴MiB) محاسبه می‌کنیم؛ خروجی sha256 تغییر نمی‌کند. */
    const h = crypto.createHash('sha256');
    const fp = path.join(OUT_DIR, f);
    const fh = fs.openSync(fp, 'r');
    const buf = Buffer.alloc(4 << 20);
    let n;
    while((n = fs.readSync(fh, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
    fs.closeSync(fh);
    stats.checksums[f] = h.digest('hex');
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'stats.json'), JSON.stringify(stats, null, 2));

const README = `# National Load-Test Dataset — scale=${P.scale}

Generated by \`tools/generate-national-dataset.js\` (seed=${P.seed}, Wave 18).
Deterministic: same seed+scale => byte-identical files.

## Files (CSV, UTF-8, header row)

| file | rows | notes |
|---|---|---|
| schools.csv | ${P.schools} | province/city واقعی (مصنوعی)، level/type/gender/shift |
| classes.csv | ${P.classes} | 10 per school، homeroom_teacher_id |
| users.csv | ${P.users} | نقش‌ها: superadmin/edu_office/manager/teacher/student/parent |
| parent_links.csv | ${P.parentLinks} | parent_id → student_id |
| attendance.csv | ${P.attendance} | ${P.ATT_BASE}+${P.ATT_FRAC} روز، status ∈ present/absent/late/excused |
| grades.csv | ${P.grades} | ${P.GR_BASE}+${P.GR_FRAC} آزمون، score ≤ 20 |
| enrollments.csv | ${P.enrollments} | 1 per student (year=1405, uq student,year) |
| messages.csv | ${P.messages} | 2 per parent + ${P.HOT_SCHOOLS} hot school(s) ×${P.HOT_FACTOR} |
| notifications.csv | ${P.notifications} | 1 per student + 1 per teacher |
| tuitions.csv | ${P.tuitions} | 1 per student |
| installments.csv | ${P.installments} | ${P.INST_PER_TUITION} per tuition |
| scholarships.csv | ${P.scholarships} | ~2% of students |
| staff_attendance.csv | ${P.staffAttendance} | teachers × ${P.ATT_BASE} days |
| substitutions.csv | ${P.substitutions} | ~30% of classes |
| training_courses.csv | ${P.trainingCourses} | ~20% of teachers |
| outbox.csv | ${P.outbox} | server_outbox sync journal, 1 per student |
| stats.json | — | counts + plan + ratios + sha256 |

## Load into PostgreSQL (PG COPY)

\`\`\`sql
-- بعد از ایجاد schema (migrations/):
\\copy schools (id,name,code,province,city,phone,level,type,gender,shift,capacity,active) FROM 'schools.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
\\copy classes (id,school_id,name,grade,field,room,capacity,homeroom_teacher_id) FROM 'classes.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
\\copy users (id,role,full_name,username,national_id,phone,active,school_id,subject_id,job) FROM 'users.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
\\copy parent_links (id,parent_id,student_id,relation) FROM 'parent_links.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
\\copy attendance (id,school_id,student_id,class_id,date,status,teacher_id,registered_by,taken_at) FROM 'attendance.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
\\copy grades (id,school_id,student_id,class_id,subject_id,teacher_id,term,exam_type,score,max_score,created_at) FROM 'grades.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
\`\`\`

## Use with k6

k6 می‌تواند CSV را مستقیم بخواند (\`dataFile\` در options) یا شناسه‌هایِ
نمونه (مثلاً 100 کاربر از users.csv) را در \`tests/performance/fixtures/\`
قرار دهد. سناریوها: \`tests/performance/scenarios/01..06\`، سوئیت‌ها:
\`tests/performance/suites/{spike-mehr,saturation,soak-24h,chaos-redis}-test.js\`.
طرحِ کامل: \`docs/WAVE18_LOAD_TEST_PLAN.md\`.

**امنیت:** همهٔ داده‌ها مصنوعی‌اند (شناسهٔ ملی با رقمِ کنترلِ معتبر ولی
بدونِ هیچ فردِ واقعی). این داده‌ها را در هیچ محیطی به‌عنوانِ PII واقعی
نپردازید.
`;
fs.writeFileSync(path.join(OUT_DIR, 'README.md'), README);

const secs = ((Date.now() - t0) / 1000).toFixed(1);
log('✅ national dataset written → ' + path.resolve(OUT_DIR));
log('   ' + Object.entries(done).map(([k, v]) => k + '=' + v.rows).join('  ') + '  (' + secs + 's)');

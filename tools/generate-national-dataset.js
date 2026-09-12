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
  return { scale, schools, classesPerSchool, classes, studentsPerClass, students, teachers, parents, admins, eduOffice, superadmin, users, ATT_BASE, ATT_FRAC, attendance, GR_BASE, GR_FRAC, grades, parentLinks, seed: SEED };
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

/* ── stats.json + README + hash ───────────────────────────────────── */
const stats = {
  generated_at: new Date().toISOString(),
  tool: 'tools/generate-national-dataset.js (Wave 18)',
  plan: P,
  counts: Object.fromEntries(Object.entries(done).map(([k, v]) => [k, v.rows])),
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
| stats.json | — | counts + plan + sha256 |

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

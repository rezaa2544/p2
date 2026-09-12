#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   national-dataset-integrity.js — گیتِ اعتبارسنجیِ دیتاستِ ملی (P0-4)
   ───────────────────────────────────────────────────────────────────
   مولد را روی یک مقیاسِ کوچک اجرا و خروجی را می‌سنجد:
   N1  هر ۱۶ فایلِ CSV + stats.json + README.md تولید می‌شوند
   N2  شمارِ سطرها = plan (برای هر جدول)
   N3  determinism: دو اجرا با seed یکسان ⇒ sha256 ِ همهٔ CSVها یکسان
   N4  seed متفاوت ⇒ دست‌کم یک فایل متفاوت (RNG واقعاً وابسته به seed)
   N5  FK integrity ِ enrollments: student/class/school موجود و هم‌tenant؛
       (student,year) یکتا
   N6  FK integrity ِ messages: from/to کاربرِ موجود؛ school_id معتبر
   N7  FK integrity ِ tuitions/installments: tuition_id موجود؛
       ۳ قسط per پرونده؛ tenant سازگار
   N8  FK integrity ِ staff_attendance/substitutions/training_courses:
       staff/sub_teacher دبیرِ همان مدرسه
   N9  نسبت‌ها مطابق stats.ratios: enrollments=students،
       installments=3×tuitions، scholarships≈2٪، substitutions≈30٪،
       training≈20٪، notifications=students+teachers
   N10 hotspot sanity: مدارسِ داغ واقعاً چگال‌ترند (پیامِ بیشینه ≥ ۵×
       میانهٔ مدارسِ عادی) و شمارشان = plan.HOT_SCHOOLS
   N11 بدون PII واقعی: national_id ده‌رقمی با رقمِ کنترلِ معتبر و یکتا؛
       تلفن‌ها 09xxxxxxxxxx و یکتا (نمونهٔ ۲۰۰۰تایی)
   N12 سازگاری stats/CSV: counts و checksums ِ stats.json با دیسک می‌خوانند

   بدونِ وابستگی به PG — فقط مولد و فایل‌ها. اجرای CI-پذیر (~چند ثانیه).
   جهش‌سنجی: tests/national-dataset-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const GEN = path.join(ROOT, 'tools', 'generate-national-dataset.js');
const OUT_A = '/tmp/ndi-a-' + process.pid;
const OUT_B = '/tmp/ndi-b-' + process.pid;
const OUT_C = '/tmp/ndi-c-' + process.pid;

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 220) : '')); }
}
function cleanup() { for (const d of [OUT_A, OUT_B, OUT_C]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
process.on('exit', cleanup);

function gen(out, seed) {
  cp.execSync(process.execPath + ' ' + GEN + ' --scale 0.001 --fast --quiet --seed ' + seed + ' --out ' + out,
    { stdio: 'pipe', timeout: 120000 });
}
function rows(dir, f) { return fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').slice(1); }
function sha(fp) { return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex'); }

console.log('\nnational-dataset-integrity — P0-4 (scale=0.001، ~10k کاربر)\n');
gen(OUT_A, 20260901);
gen(OUT_B, 20260901);
gen(OUT_C, 99991234);
const stats = JSON.parse(fs.readFileSync(path.join(OUT_A, 'stats.json'), 'utf8'));
const P = stats.plan;

/* N1 */
const FILES = ['schools', 'classes', 'users', 'parent_links', 'attendance', 'grades',
  'enrollments', 'messages', 'notifications', 'tuitions', 'installments', 'scholarships',
  'staff_attendance', 'substitutions', 'training_courses', 'outbox'];
chk('N1 هر ۱۶ CSV + stats.json + README.md موجودند',
  FILES.every((f) => fs.existsSync(path.join(OUT_A, f + '.csv')))
  && fs.existsSync(path.join(OUT_A, 'stats.json')) && fs.existsSync(path.join(OUT_A, 'README.md')));

/* N2 */
const expected = {
  schools: P.schools, classes: P.classes, users: P.users, parent_links: P.parentLinks,
  attendance: P.attendance, grades: P.grades, enrollments: P.enrollments,
  messages: P.messages, notifications: P.notifications, tuitions: P.tuitions,
  installments: P.installments, scholarships: stats.counts.scholarships /* سقف‌دار با break */,
  staff_attendance: P.staffAttendance, substitutions: stats.counts.substitutions,
  training_courses: stats.counts.training_courses, outbox: P.outbox
};
let n2bad = '';
for (const f of FILES) {
  const n = rows(OUT_A, f + '.csv').length;
  if (n !== expected[f] || n !== stats.counts[f]) { n2bad = f + ': csv=' + n + ' plan=' + expected[f] + ' stats=' + stats.counts[f]; break; }
}
chk('N2 شمارِ سطرِ هر ۱۶ فایل = plan = stats.counts', !n2bad, n2bad);

/* N3 determinism */
let n3bad = '';
for (const f of FILES) {
  if (sha(path.join(OUT_A, f + '.csv')) !== sha(path.join(OUT_B, f + '.csv'))) { n3bad = f; break; }
}
chk('N3 دو اجرا با seed یکسان ⇒ بایت‌به‌بایت یکسان (sha256 هر ۱۶ فایل)', !n3bad, n3bad);

/* N4 */
chk('N4 seed متفاوت ⇒ خروجی متفاوت (users.csv)',
  sha(path.join(OUT_A, 'users.csv')) !== sha(path.join(OUT_C, 'users.csv')));

/* بارگذاری در حافظه برای FK (مقیاس کوچک) */
const userRow = new Map();  /* id → {role, school} */
for (const l of rows(OUT_A, 'users.csv')) {
  const c = l.split(',');
  userRow.set(Number(c[0]), { role: c[1], school: c[7] === '' ? null : Number(c[7]) });
}
const classSchool = new Map();
for (const l of rows(OUT_A, 'classes.csv')) {
  const c = l.split(',');
  classSchool.set(Number(c[0]), Number(c[1]));
}
const nSchools = rows(OUT_A, 'schools.csv').length;

/* N5 enrollments */
{
  let bad = '', seen = new Set();
  for (const l of rows(OUT_A, 'enrollments.csv')) {
    const [id, school, student, cls, year] = l.split(',').map(Number);
    const u = userRow.get(student);
    if (!u || u.role !== 'student') { bad = 'student ' + student + ' نامعتبر'; break; }
    if (u.school !== school) { bad = 'tenant mismatch: user.school=' + u.school + ' enr.school=' + school; break; }
    if (classSchool.get(cls) !== school) { bad = 'class ' + cls + ' از مدرسهٔ دیگر'; break; }
    if (school < 1 || school > nSchools) { bad = 'school ' + school + ' ناموجود'; break; }
    const key = student + ':' + year;
    if (seen.has(key)) { bad = 'uq(student,year) نقض: ' + key; break; }
    seen.add(key);
  }
  chk('N5 enrollments: FK دانش‌آموز/کلاس/مدرسه + هم‌tenant + uq(student,year)',
    !bad && seen.size === P.students, bad || ('size=' + seen.size));
}

/* N6 messages */
{
  let bad = '';
  for (const l of rows(OUT_A, 'messages.csv')) {
    const c = l.split(',');
    const school = Number(c[1]), from = Number(c[2]), to = Number(c[3]);
    if (!userRow.has(from) || !userRow.has(to)) { bad = 'from/to ناموجود: ' + from + '/' + to; break; }
    if (school < 1 || school > nSchools) { bad = 'school ' + school; break; }
  }
  chk('N6 messages: from_id/to_id کاربرِ موجود و school_id معتبر', !bad, bad);
}

/* N7 tuitions + installments */
{
  const tuiSchool = new Map();
  for (const l of rows(OUT_A, 'tuitions.csv')) {
    const c = l.split(',');
    tuiSchool.set(Number(c[0]), Number(c[1]));
  }
  let bad = '';
  const perTuition = new Map();
  for (const l of rows(OUT_A, 'installments.csv')) {
    const c = l.split(',');
    const school = Number(c[1]), tui = Number(c[3]);
    if (!tuiSchool.has(tui)) { bad = 'tuition ' + tui + ' ناموجود'; break; }
    if (tuiSchool.get(tui) !== school) { bad = 'tenant mismatch در قسط ' + c[0]; break; }
    perTuition.set(tui, (perTuition.get(tui) || 0) + 1);
  }
  if (!bad) for (const [t, n] of perTuition) { if (n !== P.INST_PER_TUITION) { bad = 'tuition ' + t + ' دارای ' + n + ' قسط'; break; } }
  chk('N7 installments: FK به tuition + هم‌tenant + دقیقاً ' + P.INST_PER_TUITION + ' قسط per پرونده',
    !bad && tuiSchool.size === P.tuitions, bad);
}

/* N8 staff tables */
{
  let bad = '';
  for (const l of rows(OUT_A, 'staff_attendance.csv')) {
    const c = l.split(',');
    const school = Number(c[1]), staff = Number(c[2]);
    const u = userRow.get(staff);
    if (!u || u.role !== 'teacher' || u.school !== school) { bad = 'staff_attendance: staff ' + staff; break; }
  }
  if (!bad) for (const l of rows(OUT_A, 'substitutions.csv')) {
    const c = l.split(',');
    const school = Number(c[1]), sub = Number(c[3]);
    const u = userRow.get(sub);
    if (!u || u.role !== 'teacher' || u.school !== school) { bad = 'substitutions: sub ' + sub; break; }
  }
  if (!bad) for (const l of rows(OUT_A, 'training_courses.csv')) {
    const c = l.split(',');
    const school = Number(c[1]), staff = Number(c[2]);
    const u = userRow.get(staff);
    if (!u || u.role !== 'teacher' || u.school !== school) { bad = 'training: staff ' + staff; break; }
  }
  chk('N8 staff_attendance/substitutions/training_courses: staff دبیرِ همان مدرسه', !bad, bad);
}

/* N9 نسبت‌ها */
{
  const c = stats.counts;
  const near = (a, b, tol) => Math.abs(a - b) <= Math.max(1, b * tol);
  const checks = [
    ['enrollments = students', c.enrollments === P.students],
    ['installments = 3×tuitions', c.installments === c.tuitions * P.INST_PER_TUITION],
    ['tuitions = students', c.tuitions === P.students],
    ['notifications = students+teachers', c.notifications === P.students + P.teachers],
    ['scholarships ≈ 2% students', near(c.scholarships, P.students * 0.02, 0.05)],
    ['substitutions ≈ 30% classes', near(c.substitutions, P.classes * 0.3, 0.15)],
    ['training ≈ 20% teachers', near(c.training_courses, P.teachers * 0.2, 0.05)],
    ['staff_attendance = teachers×' + P.ATT_BASE, c.staff_attendance === P.teachers * P.ATT_BASE],
    ['outbox = students', c.outbox === P.students],
    ['ratios در stats.json ثبت شده', !!stats.ratios && stats.ratios.installments_per_tuition === P.INST_PER_TUITION]
  ];
  const bad = checks.find((x) => !x[1]);
  chk('N9 نسبت‌های workload مطابق قرارداد (۱۰ بند)', !bad, bad && bad[0]);
}

/* N10 hotspot */
{
  const perSchool = new Map();
  for (const l of rows(OUT_A, 'messages.csv')) {
    const s = Number(l.split(',')[1]);
    perSchool.set(s, (perSchool.get(s) || 0) + 1);
  }
  const counts = [...perSchool.values()].sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];
  const max = counts[counts.length - 1];
  const hotCount = counts.filter((n) => n >= median * 5).length;
  chk('N10 hotspot: بیشینهٔ پیامِ مدرسه ≥ ۵× میانه و شمارِ مدارسِ داغ = plan (' + P.HOT_SCHOOLS + ')',
    max >= median * 5 && hotCount === P.HOT_SCHOOLS,
    'max=' + max + ' median=' + median + ' hot=' + hotCount);
}

/* N11 PII */
{
  const sample = rows(OUT_A, 'users.csv').slice(0, 2000);
  let bad = '';
  const nids = new Set(), phones = new Set();
  for (const l of sample) {
    const c = l.split(',');
    const nid = c[4], ph = c[5];
    if (!/^\d{10}$/.test(nid)) { bad = 'nid قالب: ' + nid; break; }
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(nid[i]) * (10 - i);
    const rem = sum % 11, ctrl = rem < 2 ? rem : 11 - rem;
    if (Number(nid[9]) !== ctrl) { bad = 'nid رقمِ کنترل: ' + nid; break; }
    if (nids.has(nid)) { bad = 'nid تکراری: ' + nid; break; }
    nids.add(nid);
    if (!/^09\d{10}$/.test(ph)) { bad = 'phone قالب: ' + ph; break; }
    if (phones.has(ph)) { bad = 'phone تکراری: ' + ph; break; }
    phones.add(ph);
  }
  chk('N11 بدون PII واقعی: nid ده‌رقمی/کنترل‌دار/یکتا + تلفن 09…/یکتا (نمونهٔ ۲۰۰۰)', !bad, bad);
}

/* N12 stats/CSV */
{
  let bad = '';
  for (const f of FILES) {
    const want = stats.checksums[f + '.csv'];
    if (!want) { bad = f + ': checksum در stats نیست'; break; }
    if (sha(path.join(OUT_A, f + '.csv')) !== want) { bad = f + ': checksum نمی‌خواند'; break; }
  }
  chk('N12 stats.json: sha256 هر ۱۶ فایل با دیسک می‌خواند', !bad, bad);
}

console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc));
if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('');
process.exit(failc ? 1 : 0);

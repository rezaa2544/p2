#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/seed-national.js — Wave 18: the national test dataset
   ───────────────────────────────────────────────────────────────────
   ROADMAP §21: «10M registered user به تنهایی کافی نیست.» The dataset has
   to carry the collections that make a workload real — schools, classes,
   enrollments, attendance, grades, messages, notifications, audit/events —
   in proportions close to production.

   Two halves:

   1. NATIONAL_MODEL  — the 10M-user world as pure numbers, with every
                        derived count computed from a stated ratio so the
                        model can be audited and unit-checked.
   2. generate(scale) — writes a REAL store file at `scale` of the national
                        world (scale=1 would be ~10M users and tens of GB,
                        so nobody runs that on a laptop; CI runs 1e-4).

   Nothing here writes into the repository. The default output is a temp
   dir, and `--out` is required to be outside the repo by the caller.

   CLI:
     node tools/seed-national.js --scale 0.0001 --out /tmp/national.json
     node tools/seed-national.js --model            # print the model, no write
     node tools/seed-national.js --json --model     # machine-readable
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

/* ── the stated ratios ──────────────────────────────────────────────
   Every number below is a ratio, not a guess about an absolute. The
   absolute counts fall out of USERS = 10M. Changing one ratio changes the
   whole model consistently — that is the point. */
const RATIOS = {
  USERS: 10_000_000,            // ROADMAP §21: the headline figure
  SCHOOLS: 110_000,             // ~95k–110k schools nationally
  /* classes are DERIVED from students and a class size, not from a
     classes-per-school guess: with 6M students a "12 classes per school"
     input silently implies 4.5 pupils per class, which is not a school. */
  STUDENTS_PER_CLASS: 28,
  STUDENT_SHARE: 0.60,          // of registered users
  PARENT_SHARE: 0.32,
  TEACHER_SHARE: 0.07,
  STAFF_SHARE: 0.01,
  ENROLL_PER_STUDENT: 1.05,     // a few students sit two programmes
  SUBJECTS_PER_STUDENT: 12,
  TERMS_PER_YEAR: 4,
  ATTENDANCE_DAYS_PER_YEAR: 200,
  MESSAGES_PER_STUDENT_YEAR: 0.5,
  NOTIFICATIONS_PER_STUDENT_YEAR: 20,
  AUDIT_PER_WRITE: 1.2,
  /* the first day of Mehr: every student marked present inside ~2 h */
  MEHR_WINDOW_SECONDS: 7200,
  MEHR_PEAK_FACTOR: 3
};

const r = (n) => Math.round(n);

function buildModel(R) {
  R = R || RATIOS;
  const schools = R.SCHOOLS;
  const students = r(R.USERS * R.STUDENT_SHARE);
  const classes = Math.ceil(students / R.STUDENTS_PER_CLASS);
  const parents = r(R.USERS * R.PARENT_SHARE);
  const teachers = r(R.USERS * R.TEACHER_SHARE);
  const staff = R.USERS - students - parents - teachers;
  const enrollments = r(students * R.ENROLL_PER_STUDENT);
  const gradesPerYear = students * R.SUBJECTS_PER_STUDENT * R.TERMS_PER_YEAR;
  const attendancePerDay = students;
  const attendancePerYear = students * R.ATTENDANCE_DAYS_PER_YEAR;
  const messages = r(students * R.MESSAGES_PER_STUDENT_YEAR);
  const notifications = r(students * R.NOTIFICATIONS_PER_STUDENT_YEAR);
  const writesPerYear = gradesPerYear + attendancePerYear + enrollments;
  const auditEvents = r(writesPerYear * R.AUDIT_PER_WRITE);

  /* derived load, not an arbitrary target */
  const mehrWritesPerSec = attendancePerDay / R.MEHR_WINDOW_SECONDS;
  const peakWritesPerSec = r(mehrWritesPerSec * R.MEHR_PEAK_FACTOR);
  /* a write is ~1 sync op; a read-heavy client multiplies it ~8x */
  const normalApiRps = r(peakWritesPerSec / 5);
  const peakApiRps = peakWritesPerSec * 8;

  return {
    users: R.USERS,
    students, parents, teachers, staff,
    schools, classes, enrollments,
    attendance_per_day: attendancePerDay,
    attendance_per_year: attendancePerYear,
    grades_per_year: gradesPerYear,
    messages, notifications,
    audit_events_per_year: auditEvents,
    /* load targets derived from the above */
    mehr_writes_per_sec: r(mehrWritesPerSec),
    peak_writes_per_sec: peakWritesPerSec,
    normal_api_rps: normalApiRps,
    peak_api_rps: peakApiRps,
    students_per_class: +(students / classes).toFixed(2),
    classes_per_school: +(classes / schools).toFixed(2),
    ratios: R
  };
}

const NATIONAL_MODEL = buildModel();

/* ── the generator ────────────────────────────────────────────────
   Produces a store with the SAME shape as server/data/payesh.json but at
   `scale` of the national model, so a real server can boot on it. */
function generate(scale, opts) {
  opts = opts || {};
  if (!(scale > 0) || scale > 1) throw new Error('scale must be in (0, 1]');
  const m = NATIONAL_MODEL;
  /* `cap` bounds each collection so a CI fixture stays small while keeping the
     national SHAPE. The 10M numbers themselves live in NATIONAL_MODEL and are
     asserted separately — a generated file is a boot target, not the model. */
  const cap = opts.cap || Infinity;
  const n = (v) => Math.min(cap, Math.max(opts.minRows || 1, Math.round(v * scale)));

  const schools = n(m.schools);
  const users = [];
  let uid = 1;
  /* server/auth.js:270 — `if(!user.active) return fail('inactive')`. A generated
     user without `active` cannot log in, and every write scenario then dies on
     no_session. These four fields are load-bearing, not cosmetic. */
  const created = new Date().toISOString().slice(0, 10);
  users.push({ id: uid++, school_id: null, role: 'superadmin', full_name: 'مدیر کل سامانه', username: 'superadmin', password: 'seed-national', active: 1, created_at: created, phone: '09999838444', national_id: '9993235245' });
  const schoolRows = [];
  for (let i = 0; i < schools; i++) {
    schoolRows.push({ id: i + 1, name: 'مدرسهٔ نمونه ' + (i + 1), type: 'high' });
    users.push({ id: uid++, school_id: i + 1, role: 'manager', full_name: 'مدیر ' + (i + 1), username: 'manager_' + (i + 1), password: 'seed-national', active: 1, created_at: created, phone: '091' + String(10000000 + i).slice(-8), national_id: String(1000000000 + i) });
    users.push({ id: uid++, school_id: i + 1, role: 'teacher', full_name: 'آموزگار ' + (i + 1), username: 'teacher_' + (i + 1), password: 'seed-national', active: 1, created_at: created, phone: '092' + String(10000000 + i).slice(-8), national_id: String(2000000000 + i) });
  }

  /* one to two classes per school at these ratios; cap the total so a small
     scale does not blow up into thousands of empty classes */
  const classesPerSchool = Math.max(1, Math.round(m.classes / m.schools));
  const classCap = opts.classCap || 500;
  const classes = [];
  let cid = 1;
  for (let s = 1; s <= schools && classes.length < classCap; s++) {
    for (let c = 0; c < classesPerSchool && classes.length < classCap; c++) {
      classes.push({ id: cid++, school_id: s, name: '۱۰/' + (c + 1) });
    }
  }

  const subjects = [];
  let sid = 1;
  for (let s = 1; s <= schools; s++) {
    for (let k = 0; k < 6; k++) subjects.push({ id: sid++, school_id: s, name: 'درس ' + (k + 1), grade: 'دهم', field: 'ریاضی فیزیک', weekly_hours: 2 });
  }

  const students = [];
  let stid = 1;
  const studentsTotal = n(m.students);
  for (let i = 0; i < studentsTotal; i++) {
    const cls = classes[i % classes.length];
    students.push({
      id: stid++, school_id: cls.school_id, class_id: cls.id,
      first_name: 'دانش‌آموز', last_name: String(i + 1),
      national_id: String(3000000000 + i)
    });
  }

  const enrollments = students.map((s, i) => ({
    id: i + 1, school_id: s.school_id, student_id: s.id, class_id: s.class_id,
    academic_year: '1405-1406', status: 'active'
  }));

  const attendance = students.slice(0, n(m.attendance_per_day)).map((s, i) => ({
    id: i + 1, school_id: s.school_id, student_id: s.id, class_id: s.class_id,
    date: '2026-09-23', status: 'present', version: 1
  }));

  const grades = students.slice(0, n(m.grades_per_year)).map((s, i) => ({
    id: i + 1, school_id: s.school_id, student_id: s.id,
    subject_id: subjects[i % subjects.length].id,
    teacher_id: 3, term: (i % 4) + 1, score: (i % 18) + 2, version: 1,
    updated_at: new Date().toISOString()
  }));

  const messages = Array.from({ length: n(m.messages) }, (_, i) => ({
    id: i + 1, school_id: (i % schools) + 1, body: 'پیام نمونه ' + (i + 1),
    created_at: new Date().toISOString()
  }));

  const notifications = Array.from({ length: n(m.notifications) }, (_, i) => ({
    id: i + 1, school_id: (i % schools) + 1, user_id: (i % users.length) + 1,
    title: 'اعلان ' + (i + 1), read: false, created_at: new Date().toISOString()
  }));

  const audit_events = Array.from({ length: n(m.audit_events_per_year) }, (_, i) => ({
    id: i + 1, event: 'seed_probe', user_id: (i % users.length) + 1,
    timestamp: new Date().toISOString()
  }));

  return {
    schools: schoolRows, users, classes, subjects, students, enrollments,
    attendance, grades, messages, notifications, audit_events,
    /* bookkeeping the server expects */
    __schema_version: 1,
    __generated_by: 'tools/seed-national.js',
    __scale: scale
  };
}

function counts(store) {
  const out = {};
  for (const k of Object.keys(store)) if (Array.isArray(store[k])) out[k] = store[k].length;
  return out;
}

/* ── CLI ─────────────────────────────────────────────────────────── */
function main(argv) {
  const get = (f) => { const i = argv.indexOf(f); return i === -1 ? null : argv[i + 1]; };
  const asJson = argv.indexOf('--json') !== -1;
  if (argv.indexOf('--model') !== -1) {
    const m = NATIONAL_MODEL;
    if (asJson) { console.log(JSON.stringify(m, null, 2)); return 0; }
    console.log('National model (10M registered users)\n');
    for (const k of Object.keys(m)) {
      if (k === 'ratios') continue;
      console.log('  ' + k.padEnd(24) + String(m[k]).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    }
    return 0;
  }
  const scale = Number(get('--scale'));
  const out = get('--out');
  if (!(scale > 0) || scale > 1) { console.error('--scale must be a number in (0, 1]'); return 2; }
  if (!out) { console.error('--out <path> is required'); return 2; }
  const abs = path.resolve(out);
  /* refuse to write inside the repository: a generated dataset is not source */
  const repo = path.resolve(path.join(__dirname, '..'));
  if (abs === repo || abs.indexOf(repo + path.sep) === 0) {
    console.error('refusing to write inside the repository: ' + abs);
    return 2;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const store = generate(scale);
  fs.writeFileSync(abs, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
  const c = counts(store);
  if (asJson) { console.log(JSON.stringify({ path: abs, bytes: fs.statSync(abs).size, counts: c }, null, 2)); return 0; }
  console.log('wrote ' + abs + '  (' + fs.statSync(abs).size + ' bytes, scale=' + scale + ')');
  console.log(Object.keys(c).map((k) => '  ' + k + '=' + c[k]).join('\n'));
  return 0;
}

module.exports = { RATIOS, NATIONAL_MODEL, buildModel, generate, counts };
if (require.main === module) process.exit(main(process.argv.slice(2)));

#!/usr/bin/env node
// tests/phase-c-unvalidated-fks.js — رگرسیونِ A-21
// FKهایِ بدنه (homeroom_teacher_id / class_id / subject_id) نباید بدونِ
// بررسی پذیرفته شوند. سه عاقبت:
//   (۱) انتسابِ دبیرِ مدرسه‌ای دیگر به کلاس → cross-tenant escalation
//   (۲) class_idِ بیگانه روی حضورغیاب/نمره → read scope-break برای دبیرِ آن کلاس
//   (۳) subject_id خارج از برنامهٔ دبیر → نمرهٔ جعلی
// ناموراییِ داده: class_id روی نمره/حضورغیاب یعنی «کلاسِ دانش‌آموز»،
// نه «کلاسِ تدریسیِ دبیر» (۱۲۵۵۵/۱۲۵۵۵ و ۱۰۴۶۰/۱۰۴۶۰ رکوردِ seed).
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const policy = require('../server/policy');
const sync = require('../server/sync');
const { createIds } = require('../server/ids');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'payesh.json'), 'utf8'));
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }

let pass = 0;
const failures = [];
const checks = [];
function chk(name, fn) {
  checks.push(Promise.resolve().then(async () => {
    try { await fn(); pass += 1; console.log('  ✅ ' + name); }
    catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
  }));
}

/* ── یافتنِ بازیگرانِ واقعی روی دادهٔ seed ── */
const teachers = (seed.users || []).filter((u) => u.role === 'teacher' && u.active !== 0);
const teacher = teachers.find((t) => policy.teacherClassIds(seed, t.id).size > 0);
if (!teacher) throw new Error('seed: no teacher with taught classes');
const schA = num(teacher.school_id);

/* کلاسِ تدریسیِ دبیر + دانش‌آموزِ ثبت‌نامیشده در آن */
const taught = [...policy.teacherClassIds(seed, teacher.id)];
const myClass = (seed.classes || []).find((c) => taught.includes(num(c.id)));
const myStudent = (seed.enrollments || []).find((e) => num(e.class_id) === num(myClass.id));
if (!myStudent) throw new Error('seed: no student enrolled in a taught class');

/* کلاسی در همان مدرسه که دانش‌آموز در آن ثبت‌نام نیست (هدفِ حمله) */
const otherClass = (seed.classes || []).find((c) =>
  num(c.school_id) === schA && num(c.id) !== num(myClass.id) &&
  !(seed.enrollments || []).some((e) => num(e.student_id) === num(myStudent.student_id) && num(e.class_id) === num(c.id)));
if (!otherClass) throw new Error('seed: no same-school class the student is not enrolled in');

/* دبیرِ مدرسه‌ای دیگر برای تستِ cross-tenant */
const foreignTeacher = teachers.find((t) => num(t.school_id) !== schA);
if (!foreignTeacher) throw new Error('seed: no teacher in another school');
const managerA = (seed.users || []).find((u) => u.role === 'manager' && num(u.school_id) === schA);
if (!managerA) throw new Error('seed: no manager in school ' + schA);
const sameSchoolTeacher = teachers.find((t) => num(t.school_id) === schA && num(t.id) !== num(teacher.id));

/* درسی که دبیر واقعاً درس می‌دهد + درسی که نمی‌دهد */
const mySubjects = [...policy.teacherSubjectIds(seed, teacher.id)];
const foreignSubject = (seed.subjects || []).find((s) => !mySubjects.includes(num(s.id)) && num(s.school_id) === schA) || ({ id: 99999 });

console.log('  (دبیر ' + teacher.id + ' مدرسهٔ ' + schA + ' · کلاسِ تدریسی ' + myClass.id +
  ' · دانش‌آموز ' + myStudent.student_id + ' · کلاسِ بیگانه ' + otherClass.id +
  ' · دبیرِ بیگانه ' + foreignTeacher.id + ' مدرسهٔ ' + foreignTeacher.school_id + ')');

function makeCtx(sessionUser) {
  const store = JSON.parse(JSON.stringify(seed)); /* ایزوله — seed لمس نمی‌شود */
  sync.attach(store); /* syncInScope یک refِ ماژولی می‌خواند — مثلِ offline-sync-drill */
  const db = { isPostgres: () => false, persistOpsBatch: async () => ({ ok: true }) };
  return {
    store,
    ctx_store: store,
    db,
    ids: createIds({ db, cache: null }),
    deleter: { purge: async () => {} },
    audit: () => {}, markDirty: () => {}
  };
}

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  const { createClassRoutes } = require('../server/routes/classes');
  const { createAttendanceRoutes } = require('../server/routes/attendance');
  const { createGradeRoutes } = require('../server/routes/grades');

  /* ════ کلاس: homeroom_teacher_id ════ */
  console.log('▸ A-21 · انتسابِ دبیرِ بیگانه به کلاس (cross-tenant)');
  {
    const ctx = makeCtx();
    const api = createClassRoutes(ctx);
    const req = { user: managerA };

    const bad = await api.createClass(req, { name: 'کلاسِ آزمایش', grade: 5, homeroom_teacher_id: foreignTeacher.id });
    chk('دبیرِ مدرسه‌ای دیگر رد می‌شود (400)',
      () => assert.strictEqual(bad.status, 400, JSON.stringify(bad)));
    chk('کدِ خطا invalid_homeroom_teacher است',
      () => assert.strictEqual(bad.body && bad.body.code, 'invalid_homeroom_teacher'));
    chk('هیچ کلاسی ساخته نشد',
      () => assert.ok(!storeHas(ctx.store, 'classes', 'کلاسِ آزمایش'), 'class was created'));

    const okName = 'کلاسِ آزمایشِ داخلی';
    const good = await api.createClass(req, { name: okName, grade: 5, homeroom_teacher_id: sameSchoolTeacher ? sameSchoolTeacher.id : null });
    chk('دبیرِ همان مدرسه پذیرفته می‌شود (201)',
      () => assert.strictEqual(good.status, 201, JSON.stringify(good)));
    chk('کلاس با همان homeroom ساخته شد',
      () => {
        const made = ctx.store.classes.find((c) => c.name === okName);
        assert.ok(made, 'class missing');
        assert.strictEqual(num(made.homeroom_teacher_id), num(sameSchoolTeacher.id));
      });
  }

  console.log('▸ A-21 · ویرایشِ کلاس با دبیرِ بیگانه');
  {
    const ctx = makeCtx();
    const api = createClassRoutes(ctx);
    const req = { user: managerA };
    const target = ctx.store.classes.find((c) => num(c.school_id) === schA);
    const bad = await api.updateClass(req, target.id, { name: target.name, homeroom_teacher_id: foreignTeacher.id });
    chk('ویرایش با دبیرِ بیگانه رد می‌شود (400)',
      () => assert.strictEqual(bad.status, 400, JSON.stringify(bad)));
    chk('کلاس دست‌نخورده ماند',
      () => {
        const now = ctx.store.classes.find((c) => num(c.id) === num(target.id));
        assert.strictEqual(num(now.homeroom_teacher_id), num(target.homeroom_teacher_id), 'homeroom was changed');
      });
  }

  /* ════ حضورغیاب: class_id ════ */
  console.log('▸ A-21 · class_idِ بیگانه روی حضورغیاب');
  {
    const ctx = makeCtx();
    const api = createAttendanceRoutes(ctx);
    const req = { user: teacher };
    const base = { student_id: myStudent.student_id, date: '2026-09-24', status: 'present' };

    const bad = await api.createAttendance(req, Object.assign({}, base, { class_id: otherClass.id }));
    chk('class_idِ کلاسی که دانش‌آموز در آن ثبت‌نام نیست رد می‌شود (403)',
      () => assert.strictEqual(bad.status, 403, JSON.stringify(bad)));
    chk('رکوردی ساخته نشد',
      () => assert.strictEqual(ctx.store.attendance.filter((a) => num(a.student_id) === num(myStudent.student_id) && a.date === base.date).length, 0));

    const good = await api.createAttendance(req, Object.assign({}, base, { class_id: myClass.id }));
    chk('class_idِ کلاسِ واقعیِ دانش‌آموز پذیرفته می‌شود (201)',
      () => assert.strictEqual(good.status, 201, JSON.stringify(good)));
  }

  /* ════ نمره: class_id + subject_id ════ */
  console.log('▸ A-21 · class_id/subject_id روی نمره');
  {
    const ctx = makeCtx();
    const api = createGradeRoutes(ctx);
    const req = { user: teacher };
    const base = { student_id: myStudent.student_id, score: 15, date: '2026-09-24' };

    const badCls = await api.createGrade(req, Object.assign({}, base, { class_id: otherClass.id, subject_id: mySubjects[0] }));
    chk('class_idِ بیگانه رد می‌شود (403)',
      () => assert.strictEqual(badCls.status, 403, JSON.stringify(badCls)));

    const badSub = await api.createGrade(req, Object.assign({}, base, { class_id: myClass.id, subject_id: foreignSubject.id }));
    chk('subject_idِ خارج از برنامهٔ دبیر رد می‌شود (403)',
      () => assert.strictEqual(badSub.status, 403, JSON.stringify(badSub)));

    const good = await api.createGrade(req, Object.assign({}, base, { class_id: myClass.id, subject_id: mySubjects[0] }));
    chk('نمرهٔ معتبر پذیرفته می‌شود (201)',
      () => assert.strictEqual(good.status, 201, JSON.stringify(good)));
  }

  /* ════ ناموراییِ داده: guardها رکوردِ مشروعی را رد نمی‌کنند ════ */
  console.log('▸ A-21 · نامورایی: هیچ رکوردِ seedی توسط guardها رد نمی‌شود');
  {
    chk('همهٔ حضورغیاب‌ها: class_id = کلاسِ ثبت‌نامِ دانش‌آموز (۱۰۴۶۰/۱۰۴۶۰)',
      () => {
        const bad = (seed.attendance || []).filter((r) => r.class_id != null &&
          !policy.studentClassIds(seed, num(r.student_id)).has(num(r.class_id)));
        assert.strictEqual(bad.length, 0, bad.length + ' seed attendance rows violate the invariant');
      });
    chk('همهٔ نمره‌ها: class_id = کلاسِ ثبت‌نامِ دانش‌آموز (۱۲۵۵۵/۱۲۵۵۵)',
      () => {
        const bad = (seed.grades || []).filter((r) => r.class_id != null &&
          !policy.studentClassIds(seed, num(r.student_id)).has(num(r.class_id)));
        assert.strictEqual(bad.length, 0, bad.length + ' seed grade rows violate the invariant');
      });
    chk('همهٔ کلاس‌های دارای homeroom: دبیرِ همان مدرسه (۳۶/۳۶)',
      () => {
        const byId = {}; (seed.users || []).forEach((u) => { byId[num(u.id)] = u; });
        const bad = (seed.classes || []).filter((c) => c.homeroom_teacher_id && (!byId[num(c.homeroom_teacher_id)] ||
          num(byId[num(c.homeroom_teacher_id)].school_id) !== num(c.school_id)));
        assert.strictEqual(bad.length, 0, bad.length + ' seed classes have a foreign homeroom teacher');
      });
  }

  await Promise.all(checks);
  console.log('\n──────────────────────────────────────────');
  if (failures.length) {
    console.log('phase-c-unvalidated-fks: ' + pass + ' موفق، ' + failures.length + ' ناموفق');
    console.log('ناموفق‌ها: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('phase-c-unvalidated-fks: ' + pass + '/' + pass + ' موفق ✅');
}

function storeHas(store, coll, name) {
  return (store[coll] || []).some((r) => r.name === name);
}

#!/usr/bin/env node
// tests/phase-c-student-timeline-ownership.js — رگرسیونِ A-19
// دبیر فقط باید خطِ زمانیِ دانش‌آموزانِ کلاسِ تدریسیِ خودش را ببیند.
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'payesh.json'), 'utf8'));
const policy = require('../server/policy');

let pass = 0;
const failures = [];
function chk(name, fn) {
  try { fn(); pass += 1; console.log('  ✅ ' + name); }
  catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
}

/* از همان دیدگاهِ کانونیِ policy.studentRecordOk استفاده می‌کنیم تا
   مرزِ واقعی «دبیر → دانش‌آموز» را به‌دست آوریم. */
function teacherCanSee(student, teacher) {
  return policy.studentRecordOk(store, teacher, student);
}
function findUser(id) { return (store.users || []).find((u) => Number(u.id) === Number(id)); }

const teachers = (store.users || []).filter((u) => u.role === 'teacher');
const students = (store.users || []).filter((u) => u.role === 'student' && u.active !== 0);
console.log('  (داده: ' + teachers.length + ' دبیر، ' + students.length + ' دانش‌آموز)');

chk('یک دبیر وجود دارد که حداقل یک کلاس تدریس می‌کند', () => {
  const withClasses = teachers.filter((t) => policy.teacherClassIds(store, t.id).size > 0);
  assert.ok(withClasses.length > 0, 'seed should have teachers with taught classes');
});

chk('یک جفتِ دبیر/دانش‌آموزِ نامربوط پیدا می‌شود (پایهٔ بازتولید)', () => {
  // دبیری که دانش‌آموز را درس نمی‌دهد
  const pair = (() => {
    for (const t of teachers) {
      for (const s of students) {
        if (!teacherCanSee(s, t) && Number(s.school_id) === Number(t.school_id)) return { t, s };
      }
    }
    return null;
  })();
  assert.ok(pair, 'need a same-school teacher/student pair with no teaching relation');
  global.__pair = pair;
});

chk('دبیرِ نامربوط نباید به خطِ زمانیِ دانش‌آموز دسترسی داشته باشد', () => {
  const { t, s } = global.__pair;
  assert.ok(!teacherCanSee(s, t), 'teacher must not see an untaught student');
});

chk('دبیرِ نامربوط حتی در همان مدرسه هم مجاز نیست', () => {
  const { t, s } = global.__pair;
  assert.strictEqual(Number(s.school_id), Number(t.school_id), 'precondition: same school');
  assert.ok(!teacherCanSee(s, t), 'same school is NOT sufficient — teaching relation required');
});

chk('مدیرِ همان مدرسه مجاز است (کنترلِ مثبت — رگرسیون نکرده)', () => {
  const { s } = global.__pair;
  const manager = { id: 2, role: 'manager', school_id: Number(s.school_id) };
  assert.ok(teacherCanSee(s, manager), 'manager of the school must see the student');
});

chk('دبیرِ مدرسهٔ دیگر مجاز نیست (مرزِ تننت حفظ شده)', () => {
  const { t } = global.__pair;
  const otherSchoolStudent = students.find((s) => Number(s.school_id) !== Number(t.school_id));
  if (!otherSchoolStudent) return; /* seed باید چند مدرسه داشته باشد */
  assert.ok(!teacherCanSee(otherSchoolStudent, t), 'teacher must not see another school student');
});

Promise.resolve().then(() => {
  console.log('\n' + '═'.repeat(60));
  console.log('نتیجهٔ Phase C timeline-ownership: ' + pass + ' موفق / ' + failures.length + ' ناموفق');
  if (failures.length) console.log('ناموفق‌ها: ' + failures.join('، '));
  process.exit(failures.length ? 1 : 0);
});

/* ─────────────────────────────────────────────────────────────
   migrate-pg-constraints.js — اینوارینت‌های کسب‌وکار در DDL پستگرس (P1-13)
   ─────────────────────────────────────────────────────────────
   بخش ۱ (همیشه): server/schema.sql باید هر ۸ قید را در جدولِ درست داشته باشد
     C-capacity   ظرفیت کلاس > ۰
     C-enrollment یکتایی (student_id, year) در enrollments
     C-schedule   یکتایی (teacher_id, day, period) در schedule
     C-status     چکِ enum وضعیت users (مقادیر validate.js)
     C-grades-*   چهار کلید خارجی grades (student/class/subject/teacher)
   بخش ۲ (اگر payesh.json بود): دادهٔ امروز هر ۵ قید را پاس می‌کند (ایمپورت نمی‌شکند)
     D-capacity / D-enrollment / D-schedule / D-status / D-grades-orphans
   ───────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let okc = 0, failc = 0, skipc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond === null) { skipc++; console.log('  ⏭️ ' + name + ' (رد شد)'); return; }
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('\n▸ P1-13 — اینوارینت‌های دیتابیس (DDL + داده)');

/* ── بخش ۱: DDL ── */
const ddl = fs.readFileSync(path.join(ROOT, 'server', 'schema.sql'), 'utf8');
function tableBlock(t) {
  const m = ddl.match(new RegExp('CREATE TABLE IF NOT EXISTS ' + t + ' \\(([\\s\\S]*?)\\n\\);'));
  return m ? m[1] : null;
}
const classes = tableBlock('classes'), enroll = tableBlock('enrollments'),
      sched = tableBlock('schedule'), users = tableBlock('users'), grades = tableBlock('grades');
chk('C-capacity در DDL هست', !!classes && classes.indexOf('CONSTRAINT chk_classes_capacity CHECK (capacity > 0)') >= 0);
chk('C-enrollment در DDL هست', !!enroll && enroll.indexOf('CONSTRAINT uq_enrollments_student_year UNIQUE (student_id, year)') >= 0);
chk('C-schedule در DDL هست', !!sched && sched.indexOf('CONSTRAINT uq_schedule_teacher_slot UNIQUE (teacher_id, day, period)') >= 0);
chk('C-status در DDL هست با هر ۴ مقدار validate.js', !!users
  && users.indexOf("CONSTRAINT chk_users_status CHECK (status IN ('active', 'dropped_out', 'graduated', 'awaiting_transfer'))") >= 0);
chk('C-grades-student در DDL هست', !!grades && grades.indexOf('CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES users(id)') >= 0);
chk('C-grades-class در DDL هست', !!grades && grades.indexOf('CONSTRAINT fk_grades_class FOREIGN KEY (class_id) REFERENCES classes(id)') >= 0);
chk('C-grades-subject در DDL هست', !!grades && grades.indexOf('CONSTRAINT fk_grades_subject FOREIGN KEY (subject_id) REFERENCES subjects(id)') >= 0);
chk('C-grades-teacher در DDL هست', !!grades && grades.indexOf('CONSTRAINT fk_grades_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)') >= 0);
chk('C-deferrable هر ۴ FK نمره معوق‌اند', !!grades && (grades.match(/fk_grades_(student|class|subject|teacher)[\s\S]*?DEFERRABLE INITIALLY DEFERRED/g) || []).length === 4);

/* ── بخش ۲: داده ── */
const STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
if (!fs.existsSync(STORE)) {
  const { execSync } = require('child_process');
  try {
    execSync('node server/seed.js', { cwd: ROOT, stdio: 'ignore' });
  } catch (e) {}
}
if (!fs.existsSync(STORE)) {
  ['D-capacity', 'D-enrollment', 'D-schedule', 'D-status', 'D-grades-orphans'].forEach(n => chk(n, null));
} else {
  const s = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const cls = s.classes || [], enr = s.enrollments || [], sch = s.schedule || [],
        usr = s.users || [], grd = s.grades || [];
  const badCap = cls.filter(c => c.capacity !== null && c.capacity !== undefined && !(c.capacity > 0));
  chk('D-capacity همهٔ ظرفیت‌ها > ۰', badCap.length === 0, badCap.length + ' خراب');
  const seenEY = new Set(); let dupEY = 0;
  enr.forEach(e => {
    if (e.year === null || e.year === undefined) return; /* NULL در UNIQUE تداخل ندارد */
    const k = e.student_id + '|' + e.year;
    if (seenEY.has(k)) dupEY++; else seenEY.add(k);
  });
  chk('D-enrollment بدون تداخل (student,year)', dupEY === 0, dupEY + ' تداخل');
  const seenT = new Set(); let dupT = 0;
  sch.forEach(x => {
    const k = x.teacher_id + '|' + x.day + '|' + x.period;
    if (seenT.has(k)) dupT++; else seenT.add(k);
  });
  chk('D-schedule بدون تداخل (teacher,day,period)', dupT === 0, dupT + ' تداخل');
  const allowed = { active: 1, dropped_out: 1, graduated: 1, awaiting_transfer: 1 };
  const badSt = usr.filter(u => u.status !== null && u.status !== undefined && !allowed[u.status]);
  chk('D-status همهٔ وضعیت‌ها معتبر', badSt.length === 0, badSt.length + ' خراب');
  const uids = new Set(usr.map(u => u.id)), cids = new Set(cls.map(c => c.id)),
        sids = new Set((s.subjects || []).map(x => x.id));
  let orph = 0;
  grd.forEach(g => {
    if (g.student_id !== null && g.student_id !== undefined && !uids.has(g.student_id)) orph++;
    if (g.class_id !== null && g.class_id !== undefined && !cids.has(g.class_id)) orph++;
    if (g.subject_id !== null && g.subject_id !== undefined && !sids.has(g.subject_id)) orph++;
    if (g.teacher_id !== null && g.teacher_id !== undefined && !uids.has(g.teacher_id)) orph++;
  });
  chk('D-grades-orphans بدون یتیم در هر ۴ FK', orph === 0, orph + ' یتیم');
}

console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق، ${skipc} ردشده از ${okc + failc + skipc}`);
if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }

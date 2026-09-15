/* ═══════════════════════════════════════════════════════════════════
   tests/performance/helpers/payload-generator.js
   تولید داده‌های واقع‌گرایانه و بومی برای آزمون‌های بار k6
   ═══════════════════════════════════════════════════════════════════ */

import { randomInt } from 'crypto';

export const SCHOOL_IDS = [1, 2, 3, 4, 5, 6];
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];
export const TERMS = ['نوبت اول', 'نوبت دوم', 'مستمر اول', 'مستمر دوم'];
export const EXAM_TYPES = ['کلاسی', 'مستمر', 'پایانی', 'ماهانه'];

export function getRandomInt(min, max) {
  return randomInt(min, max + 1);
}

export function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateNationalId(seed) {
  const base = String(seed || getRandomInt(100000000, 999999999)).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(base.charAt(i), 10) * (10 - i);
  }
  const rem = sum % 11;
  const checkDigit = rem < 2 ? rem : 11 - rem;
  return base + checkDigit;
}

export function generatePhone(seed) {
  const suffixes = ['12', '19', '35', '90', '99'];
  const pfx = '09' + getRandomElement(suffixes);
  const rest = String(seed || getRandomInt(1000000, 9999999)).padStart(7, '0');
  return `${pfx}${rest}`;
}

export function getTodayJalaliDate() {
  return new Date().toISOString().slice(0, 10);
}

export function generateAttendancePayload(opts = {}) {
  const status = opts.status || getRandomElement(ATTENDANCE_STATUSES);
  return {
    school_id: opts.school_id || 1,
    class_id: opts.class_id || getRandomInt(1, 10),
    student_id: opts.student_id || getRandomInt(16, 50),
    date: opts.date || getTodayJalaliDate(),
    status: status,
    late_minutes: status === 'late' ? getRandomInt(5, 45) : 0,
    reason: status === 'excused' ? 'گواهی پزشکی معتبر' : (status === 'absent' ? 'غیبت غیرموجه' : null)
  };
}

export function generateGradePayload(opts = {}) {
  return {
    school_id: opts.school_id || 1,
    student_id: opts.student_id || getRandomInt(16, 50),
    subject_id: opts.subject_id || getRandomInt(1, 15),
    class_id: opts.class_id || getRandomInt(1, 10),
    term: opts.term || getRandomElement(TERMS),
    exam_type: opts.exam_type || getRandomElement(EXAM_TYPES),
    score: opts.score !== undefined ? opts.score : getRandomInt(10, 20),
    max_score: 20,
    date: opts.date || getTodayJalaliDate(),
    teacher_id: opts.teacher_id || 4,
    note: 'ثبت خودکار در آزمون بار'
  };
}

export function generateNotificationPayload(opts = {}) {
  const schoolId = opts.school_id || 1;
  return {
    school_id: schoolId,
    phone: opts.phone || generatePhone(),
    body: opts.body || 'اطلاعیه مهم: جلسه اولیا و مربیان روز چهارشنبه برگزار می‌گردد.',
    parts: 1,
    type: 'announcement'
  };
}

export function generateBatchSyncOps(count = 10, userId = 2, schoolId = 1, role = 'manager') {
  const ops = [];
  const now = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    const uid = `k6-op-${userId}-${Date.now()}-${i}-${getRandomInt(1000, 9999)}`;
    const opType = i % 3 === 0 ? 'ins' : (i % 3 === 1 ? 'upd' : 'ins');
    
    if (role === 'teacher' || i % 2 === 0) {
      ops.push({
        uid: uid,
        t: opType,
        c: 'attendance',
        by: userId,
        school_id: schoolId,
        user_id: userId,
        at: now,
        data: {
          school_id: schoolId,
          student_id: 16 + (i % 30),
          class_id: 1 + (i % 5),
          date: now.slice(0, 10),
          status: getRandomElement(ATTENDANCE_STATUSES)
        }
      });
    } else {
      ops.push({
        uid: uid,
        t: opType,
        c: 'announcements',
        by: userId,
        school_id: schoolId,
        user_id: userId,
        at: now,
        data: {
          school_id: schoolId,
          title: `اطلاعیه همگام‌سازی دسته‌ای #${i + 1}`,
          body: `متن پیام آزمایشی تست بار در مقیاس ملی جهت سنجش تاب‌آوری صف همگام‌سازی`,
          created_at: now
        }
      });
    }
  }
  return ops;
}

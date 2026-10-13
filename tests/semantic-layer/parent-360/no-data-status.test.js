/* ═════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/no-data-status.test.js
   -------------------------------------------------------------------
   I-04 regression: «نبودِ داده، نه عالی و نه بحرانی است — ناشناخته است.»

   parent-360.js قبلاً attendanceStatus را این‌طور محاسبه می‌کرد:

       let s = totalSessions === 0 ? 'NO_DATA' : 'EXCELLENT';
       if (attendanceRate < 80.0 || unexcusedCount >= 3) s = 'CRITICAL';

   وقتی هیچ جلسه‌ای ثبت نشده، attendanceRate برابر null است و در جاوااسکریپت
   «null < 80.0» برابر true ارزیابی می‌شود — پس NO_DATA بی‌درنگ به CRITICAL
   تبدیل می‌شد. این یعنی یک کودک بدون حتی یک رکوردِ حضور، «بحرانی» گزارش
   می‌شد. قرارداد (و a31-semantic-certification-integrity.test.js:52-53)
   می‌گوید باید NO_DATA بماند. این فایل هر دو جهتِ قرارداد را قفل می‌کند:
   دادهٔ ناکافی، NO_DATA؛ و دادهٔ واقعی، همچنان طبق آستانه‌ها رتبه‌بندی می‌شود.
   ═════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { buildParent360Profile } = require('../../../server/analytics/parent-360');

const PARENT = { id: 10, full_name: 'ولی' };
const STUDENT = { id: 101, school_id: 1, full_name: 'فرزند' };
const LINKS = [{ parent_id: 10, student_id: 101 }];

function profileWith(attendance, grades) {
  return buildParent360Profile({
    parent: PARENT,
    student: STUDENT,
    parentLinks: LINKS,
    attendance,
    grades
  });
}

function run() {
  console.log('▸ تست I-04: وضعیت حضور در نبودِ داده، NO_DATA می‌ماند (نه CRITICAL)');

  // ── ۱. کنترلِ منفیِ خودِ نقص: آرایهٔ خالی ============================
  // قبل از اصلاح: null < 80.0 → true → CRITICAL (نقصِ I-04)
  const empty = profileWith([], []);
  assert.strictEqual(empty.attendance_overview.attendance_rate, null,
    'نبودِ داده باید attendance_rate === null باشد');
  assert.strictEqual(empty.attendance_overview.status, 'NO_DATA',
    'نبودِ داده باید NO_DATA بماند، نه CRITICAL');
  assert.strictEqual(empty.attendance_overview.unexcused_absences, 0);
  assert.strictEqual(empty.attendance_overview.late_arrivals_count, 0);

  // ── ۲. رکوردهای ناقص/false-y هم نباید به‌جای «دادهٔ واقعی» شمرده شوند ==
  // status غایب/موجود ندارد → در شمارشِ نرخ حساب نمی‌شود، ولی آرایه خالی نیست.
  const junk = profileWith([
    { student_id: 101, status: null },
    { student_id: 101, status: '' },
    { student_id: 101, status: 'unknown' },
    {}, // رکورد کاملاً خالی
    { student_id: 101 } // فاقد status
  ], []);
  assert.strictEqual(junk.attendance_overview.attendance_rate, null,
    'statusهای ناشناخته نباید جلسهٔ معتبر شمرده شوند');
  assert.strictEqual(junk.attendance_overview.status, 'NO_DATA',
    'ورودیِ فاقدِ دادهٔ قابل‌تفسیر، NO_DATA است');

  // ── ۳. آستانهٔ بحرانیِ واقعی حفظ می‌شود =============================
  // ۳ غیبت غیرموجه ≥ ۳ → CRITICAL حتی اگر نرخ بالاتر از ۸۰ باشد
  const threeUnexcused = profileWith([
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'absent' },
    { student_id: 101, status: 'absent' },
    { student_id: 101, status: 'absent' }
  ], []);
  assert.strictEqual(threeUnexcused.attendance_overview.attendance_rate, 70);
  assert.strictEqual(threeUnexcused.attendance_overview.status, 'CRITICAL',
    'نرخِ ۷۰٪ (< ۸۰) باید CRITICAL باشد — این رفتارِ دادهٔ واقعی است');

  // ── ۴. آستانهٔ هشدارِ واقعی حفظ می‌شود ==============================
  // ۹۰.۹٪ + ۱ غیبت غیرموجه → WARNING
  const oneUnexcused = profileWith([
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'absent' }
  ], []);
  assert.strictEqual(oneUnexcused.attendance_overview.attendance_rate, 90.9);
  assert.strictEqual(oneUnexcused.attendance_overview.status, 'WARNING',
    '۹۰.۹٪ با ۱ غیبت غیرموجه → WARNING (قانونِ unexcusedCount >= ۱)');

  // ── ۵. وضعیتِ عالیِ واقعی حفظ می‌شود =================================
  // ۱۰۰٪ حضور و هیچ غیبت غیرموجه‌ای → EXCELLENT
  const allPresent = profileWith([
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' }
  ], []);
  assert.strictEqual(allPresent.attendance_overview.attendance_rate, 100);
  assert.strictEqual(allPresent.attendance_overview.status, 'EXCELLENT',
    'نرخِ ۱۰۰٪ بدونِ غیبتِ غیرموجه باید EXCELLENT باشد');

  // ── ۶. حالتِ پایدار (STABLE) بینِ WARNING و EXCELLENT =================
  // ۹۶٪ → STABLE (۹۰ ≤ x < ۹۵ نه؛ ۹۵ ≤ x → EXCELLENT؛ ۹۶ > ۹۵ پس EXCELLENT).
  // یک جلسهٔ تأخیر در ۱۰ جلسه: (۹ + ۰.۸×۱)/۱۰ = ۹۸٪ → EXCELLENT. برای
  // پوششِ STABLE از ۹۴٪ استفاده می‌کنیم: ۹۴ جلسهٔ حضور + ۶ جلسهٔ غیبتِ موجه.
  const stable = profileWith(
    Array.from({ length: 94 }, () => ({ student_id: 101, status: 'present' }))
      .concat(Array.from({ length: 6 }, () => ({ student_id: 101, status: 'excused' }))),
    []);
  assert.strictEqual(stable.attendance_overview.attendance_rate, 94);
  assert.strictEqual(stable.attendance_overview.status, 'STABLE',
    '۹۴٪ بدونِ غیبتِ غیرموجه → STABLE');

  // ── ۷. صفرِ واقعی ≠ نبودِ داده ========================================
  // یک جلسهٔ غیبتِ غیرموجهِ تنها: ۰٪ → CRITICAL (نه NO_DATA)
  const trulyZero = profileWith([{ student_id: 101, status: 'absent' }], []);
  assert.strictEqual(trulyZero.attendance_overview.attendance_rate, 0);
  assert.strictEqual(trulyZero.attendance_overview.status, 'CRITICAL',
    'صفرِ واقعیِ حضور باید CRITICAL باشد — این از NO_DATA متمایز است');

  console.log('  ✅ I-04 پایدار شد: نبودِ داده → NO_DATA؛ دادهٔ واقعی → رتبه‌بندیِ آستانه‌ای');
}

if (require.main === module) run();
module.exports = { run };

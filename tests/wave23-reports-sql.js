#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave23-reports-sql.js — سنجشِ سازنده‌های SQL گزارش (بدونِ دیتابیس)

   این تست‌ها server/reports-sql.js را می‌سنجند: درستیِ تبدیلِ تقویم،
   پارامتری‌بودنِ کوئری‌ها (هیچ مقدارِ کاربری داخلِ رشتهٔ SQL نمی‌رود)،
   فهرستِ مجازِ شناسه‌ها، bounded بودنِ صفحه، و کلیدِ keyset.

   سنجه‌ها رفتاری‌اند: خروجیِ واقعیِ تابع سنجیده می‌شود، نه متنِ سورس.
   اجرایِ کوئری‌ها روی PostgreSQLِ واقعی در tests/wave23-reports-pg.js است.

   اجرا: node tests/wave23-reports-sql.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const fs = require('fs');
const rs = require(path.join(__dirname, '..', 'server', 'reports-sql.js'));

let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; const e = name + (extra ? ' — ' + extra : ''); errors.push(e); console.log('  ❌ ' + e); }
}
function grp(t) { console.log('\n▸ ' + t); }

/* ── ۱) تقویم: وارونِ jalaliToGregorian باید با toJalaliِ خودِ مخزن بخواند ── */
grp('W23-CAL — وارونِ تقویمِ شمسی در برابرِ toJalaliِ مخزن');
/* toJalali را از سورسِ route بیرون می‌کشیم و **اجرا** می‌کنیم (نه shim):
   همان تابعی که مسیرِ حافظه برای فیلترِ ماه استفاده می‌کند. */
const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'reports.js'), 'utf8');
const start = src.indexOf('const _div');
const end = src.indexOf('/** تاریخ ISO');
const toJalali = new Function(src.slice(start, end) + '\nreturn toJalali;')();

let rtBad = 0, rtN = 0, firstBad = null;
for (let jy = 1300; jy <= 1500; jy++) {
  for (let jm = 1; jm <= 12; jm++) {
    for (const jd of [1, 10, 20, 29]) {
      const g = rs.jalaliToGregorian(jy, jm, jd);
      const back = toJalali(g[0], g[1], g[2]);
      rtN++;
      if (back[0] !== jy || back[1] !== jm || back[2] !== jd) {
        rtBad++; if (!firstBad) firstBad = `${jy}/${jm}/${jd} → ${g} → ${back}`;
      }
    }
  }
}
chk('وارونِ تقویم با toJalaliِ مخزن می‌خواند', rtBad === 0, `${rtBad}/${rtN} ${firstBad || ''}`);
chk('دستِ‌کم ۹هزار روز سنجیده شد', rtN > 9000, String(rtN));

let contBad = 0, lenBad = 0;
for (let jy = 1380; jy <= 1420; jy++) {
  for (let jm = 1; jm <= 12; jm++) {
    const r = rs.jalaliMonthRange(jy, jm);
    const nm = jm === 12 ? [jy + 1, 1] : [jy, jm + 1];
    const r2 = rs.jalaliMonthRange(nm[0], nm[1]);
    if (r.to !== r2.from) contBad++;               /* ماه‌ها پیوسته‌اند، بدونِ شکاف/هم‌پوشانی */
    const b = toJalali.apply(null, r.from.split('-').map(Number));
    if (b[0] !== jy || b[1] !== jm || b[2] !== 1) contBad++;
    const days = (Date.parse(r.to) - Date.parse(r.from)) / 86400000;
    const want = jm <= 6 ? 31 : jm <= 11 ? 30 : null;
    if (want != null && days !== want) lenBad++;
    if (jm === 12 && !(days === 29 || days === 30)) lenBad++;  /* اسفند ۲۹ یا ۳۰ */
  }
}
chk('بازهٔ ماه‌ها پیوسته است و روزِ اول درست', contBad === 0, String(contBad));
chk('طولِ ماه‌ها درست است (۳۱/۳۰/اسفند ۲۹-۳۰)', lenBad === 0, String(lenBad));
chk('بازه نیمه‌باز است و قالبِ ISO دارد',
  /^\d{4}-\d{2}-\d{2}$/.test(rs.jalaliMonthRange(1404, 6).from) && rs.jalaliMonthRange(1404, 6).from < rs.jalaliMonthRange(1404, 6).to);

/* ── ۲) پارامتری بودن — مهم‌ترین قیدِ امنیتی ── */
grp('W23-PARAM — هیچ مقدارِ کاربری داخلِ رشتهٔ SQL نمی‌رود');
const evil = { schoolIds: ['1) OR 1=1 --'], classId: "7; DROP TABLE attendance;--", limit: 10, cursor: '1|2' };
const b1 = rs.buildAttendanceClassPage({ schoolIds: [7], classId: 42, from: '2025-08-23', to: '2025-09-23', limit: 10, cursor: '3|4' });
chk('مقدارِ کلاس در params است نه در SQL', b1.params.includes(42) && !/=\s*42\b/.test(b1.sql), b1.sql.slice(0, 120));
chk('شمارهٔ مدرسه پارامترِ ANY است', Array.isArray(b1.params[0]) && b1.params[0].includes(7) && /ANY\(\$1\)/.test(b1.sql));
chk('بازهٔ تاریخ پارامتر است (رشتهٔ تاریخ در SQL نیست)', !b1.sql.includes('2025-08-23') && b1.params.includes('2025-08-23'));
chk('cursor پارامتر است', b1.params.includes(3) && b1.params.includes(4) && /\(c\.school_id, c\.id\) > \(\$\d+, \$\d+\)/.test(b1.sql));
chk('LIMIT عددِ صحیحِ داخلی است (نه رشتهٔ کاربر)', /LIMIT \d+$/.test(b1.sql.trim()));
const bEvil = rs.buildAttendanceClassPage(evil);
chk('ورودیِ خراب به SQL نشت نمی‌کند', !bEvil.sql.includes('OR 1=1') && !bEvil.sql.includes('DROP TABLE'));

/* ── ۳) فهرستِ مجازِ شناسه‌ها ── */
grp('W23-ALLOW — شناسه‌ها فقط از فهرستِ مجاز');
chk('attendance/classes/users/schools مجازند',
  ['attendance', 'classes', 'users', 'schools'].every((t) => rs.ALLOWED_TABLES.has(t)));
chk('جدولِ مجاز بدونِ استثنا برمی‌گردد', rs.tableName('attendance') === 'attendance');
let threwInject = false, msgInject = '';
try { rs.tableName('attendance; DROP TABLE users'); } catch (e) { threwInject = /not allowlisted/.test(e.message); msgInject = e.message; }
chk('شناسهٔ تزریق‌شده استثنا می‌دهد (نه SQL)', threwInject, msgInject);
let threwUnknown = false;
try { rs.tableName('secrets'); } catch (e) { threwUnknown = true; }
chk('جدولِ ناشناختهٔ ساده هم رد می‌شود', threwUnknown);
chk('هیچ سازنده‌ای جدول را از ورودیِ کاربر نمی‌سازد',
  /FROM users/.test(rs.buildStudentsPerSchool({ schoolIds: ['1; DROP TABLE x'] }).sql) &&
  !/FROM \$/.test(rs.buildStudentsPerSchool({ schoolIds: [1] }).sql));

/* ── ۴) bounded بودن ── */
grp('W23-BOUND — نتیجهٔ bounded');
chk('clampLimit پیش‌فرض دارد', rs.clampLimit(undefined) === 500);
chk('clampLimit صفر/منفی را رد می‌کند', rs.clampLimit(0) === 500 && rs.clampLimit(-5) === 500);
chk('clampLimit به سقف می‌چسبد', rs.clampLimit(999999) === rs.MAX_PAGE, String(rs.clampLimit(999999)));
chk('clampLimit NaN را رد می‌کند', rs.clampLimit('abc') === 500);
const bBig = rs.buildAttendanceClassPage({ schoolIds: [1], from: 'a', to: 'b', limit: 999999 });
chk('SQL هرگز بیش از سقف+۱ نمی‌خواهد', new RegExp('LIMIT ' + (rs.MAX_PAGE + 1) + '$').test(bBig.sql.trim()), bBig.sql.slice(-40));
chk('LIMIT+1 برای has_more است (بدونِ OFFSET)', !/OFFSET/i.test(bBig.sql));

/* ── ۵) ساختارِ تجمیع — هم‌ارزی با مسیرِ حافظه ── */
grp('W23-AGG — ساختارِ تجمیع');
const aggSql = b1.sql;
chk('هر پنج وضعیت با FILTER شمرده می‌شود',
  ['present', 'late', 'excused', 'early_exit'].every((s) => new RegExp(`FILTER \\(WHERE a\\.status = '${s}'\\)`).test(aggSql)));
chk('وضعیتِ ناشناخته/NULL غایب حساب می‌شود (همان رفتارِ مسیرِ حافظه)',
  /COALESCE\(a\.status, ''\) NOT IN \('present','late','excused','early_exit'\)/.test(aggSql));
chk('صفحه روی classes کلید می‌خورد تا کلاسِ بدونِ حضور هم بیاید',
  /LEFT JOIN attendance a/.test(aggSql) && /FROM classes c/.test(aggSql) && /GROUP BY c\.school_id, c\.id/.test(aggSql));
chk('شرطِ ماه داخلِ LEFT JOIN است نه WHERE (وگرنه کلاسِ صفر حذف می‌شود)',
  /LEFT JOIN attendance a[\s\S]*?a\.date >= \$\d[\s\S]*?WHERE/.test(aggSql));
const tSql = rs.buildAttendanceSchoolTotals({ schoolIds: [1, 2], from: 'f', to: 't' }).sql;
chk('جمعِ مدرسه روی همهٔ کلاس‌های دامنه است (JOIN نه LEFT JOIN)',
  /JOIN classes c ON c\.id = a\.class_id AND c\.school_id = a\.school_id/.test(tSql) && !/LEFT JOIN/.test(tSql));
chk('شمارِ دانش‌آموزان با GROUP BY است نه پویشِ users', /GROUP BY school_id/.test(rs.buildStudentsPerSchool({ schoolIds: [1] }).sql));
/* باگِ واقعیِ LEFT JOIN + count(*): کلاسِ بدونِ حضور یک ردیفِ تمام-NULL می‌سازد
   و count(*) آن را ۱ می‌شمارد. شمارش باید روی ستونِ سمتِ راست باشد. */
chk('تجمیع روی a.id شمارش می‌کند نه count(*) (دامِ LEFT JOIN)',
  !/count\(\*\)/.test(aggSql) && /count\(a\.id\)::int AS total/.test(aggSql), aggSql.slice(0, 200));

/* ── ۶) هم‌ارزیِ نرخ با فرمولِ موجود ── */
grp('W23-RATE — نرخ، همان فرمولِ src/js/77-reports.js');
const jsRate = (att, tot) => (tot ? Math.round(att / tot * 1000) / 10 : null);
let rateBad = 0;
for (let tot = 0; tot <= 300; tot++) for (let att = 0; att <= tot; att += 7) if (rs.rate10(att, tot) !== jsRate(att, tot)) rateBad++;
chk('rate10 با فرمولِ کلاینت یکی است', rateBad === 0, String(rateBad));
chk('rate10 با صفر null می‌دهد نه NaN', rs.rate10(0, 0) === null);

/* ── ۷) cursor ── */
grp('W23-CURSOR — کلیدِ صفحه');
chk('cursor «school_id|class_id» می‌سازد', rs.attendanceCursor({ school_id: 3, class_id: 41 }) === '3|41');
chk('cursor برای ردیفِ null، null است', rs.attendanceCursor(null) === null);
const noCur = rs.buildAttendanceClassPage({ schoolIds: [1], from: 'f', to: 't', limit: 5 });
chk('بدونِ cursor هیچ شرطِ keyset نمی‌آید', !/> \(\$\d+, \$\d+\)/.test(noCur.sql));
const badCur = rs.buildAttendanceClassPage({ schoolIds: [1], from: 'f', to: 't', limit: 5, cursor: 'garbage' });
chk('cursor خراب نادیده گرفته می‌شود (نه SQL خراب)', !/> \(\$\d+, \$\d+\)/.test(badCur.sql));

/* ── ۸) ناوردای کلی: هر پارامتر باید در SQL بیاید ────────────────────
   این همان سنجه‌ای است که باگِ واقعیِ «پارامترِ هل‌داده‌شده ولی استفاده‌نشده»
   را می‌گیرد: buildAttendanceSchoolTotals بازهٔ ماه را push می‌کرد ولی در
   WHERE نمی‌گذاشت، پس جمعِ هر مدرسه روی **همهٔ ماه‌ها** گرفته می‌شد در حالی
   که صفحهٔ کلاس‌ها یک ماه را نشان می‌داد. هیچ سنجهٔ ساختاریِ دیگری این را
   نمی‌گرفت. */
grp('W23-INVARIANT — هیچ پارامترِ بی‌مصرف و هیچ جای‌نگهدارِ بی‌پارامتر');
function invariant(label, built) {
  const used = new Set((built.sql.match(/\$(\d+)/g) || []).map((s) => Number(s.slice(1))));
  const maxPh = used.size ? Math.max(...used) : 0;
  const unused = [];
  for (let i = 1; i <= built.params.length; i++) if (!used.has(i)) unused.push(i);
  const dangling = maxPh > built.params.length;
  chk(label + ': هر پارامتر در SQL مصرف شده', unused.length === 0, 'بیکار: $' + unused.join(',$'));
  chk(label + ': هیچ جای‌نگهدارِ بی‌پارامتر نیست', !dangling, `max=$${maxPh} اما ${built.params.length} پارامتر`);
  chk(label + ': جای‌نگهدارها پیوسته‌اند (۱..n)', maxPh === built.params.length, `max=$${maxPh} n=${built.params.length}`);
}
const R = rs.jalaliMonthRange(1404, 6);
invariant('صفحهٔ کلاس‌ها', rs.buildAttendanceClassPage({ schoolIds: [1, 2], from: R.from, to: R.to, limit: 5, cursor: '1|2' }));
invariant('صفحهٔ کلاس‌ها + class_id', rs.buildAttendanceClassPage({ schoolIds: [1], classId: 9, from: R.from, to: R.to, limit: 5 }));
invariant('جمعِ مدرسه', rs.buildAttendanceSchoolTotals({ schoolIds: [1, 2], from: R.from, to: R.to }));
invariant('جمعِ مدرسه + class_id', rs.buildAttendanceSchoolTotals({ schoolIds: [1], classId: 4, from: R.from, to: R.to }));
invariant('شمارِ دانش‌آموزان', rs.buildStudentsPerSchool({ schoolIds: [1, 2] }));
const totSql = rs.buildAttendanceSchoolTotals({ schoolIds: [1], from: 'FROMX', to: 'TOX' }).sql;
chk('بازهٔ ماه در WHERE جمعِ مدرسه هست (نه فقط در params)',
  /a\.date >= \$2/.test(totSql) && /a\.date <\s+\$3/.test(totSql), totSql.slice(-160));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('wave23-reports-sql: سبز ✅');

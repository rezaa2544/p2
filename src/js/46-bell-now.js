/* ═══════════════════════════════════════════════════════════════════
   زنگ جاری: تشخیص «الان کدام زنگ است»
   ═══════════════════════════════════════════════════════════════════
   بخش ۱ ▸ نگاشت روز هفته              todayIndex()
   بخش ۲ ▸ سلامت ساعت دستگاه           clockSanity()
   بخش ۳ ▸ بازهٔ زمانی جاری             currentSlot()
   بخش ۴ ▸ کلاس فعلی دبیر               teacherNowClass()

   این ماژول فقط **می‌گوید** الان چه خبر است؛ هیچ رفتاری را عوض
   نمی‌کند. گام‌های بعدی طرح (پیش‌گزینش در حضور و غیاب و نمره) روی
   همین سوارند.

   📄 طرح کامل: docs/PLAN_BELL_AUTOCLASS.md
   ═══════════════════════════════════════════════════════════════════ */

/* ─────────────── بخش ۱: نگاشت روز هفته ─────────────── */

/**
 * 🔴 دام اصلی این ماژول — دو شمارش متفاوت روز هفته:
 *
 *   JavaScript `Date.getDay()` :  یکشنبه=۰ · دوشنبه=۱ … شنبه=۶
 *   جدول `schedule.day`        :  شنبه=۰ · یکشنبه=۱ … چهارشنبه=۴
 *
 * فرمول تبدیل `(getDay() + 1) % 7` است — همان که در
 * `22-jalali-calendar.js:43` برای نام روز به‌کار رفته. اگر این
 * اشتباه شود، برنامهٔ **روز دیگری** به دبیر نشان داده می‌شود و
 * هیچ خطایی هم پرتاب نمی‌شود؛ فقط دادهٔ غلط.
 *
 * ⚠️ خروجی ۵ و ۶ (پنج‌شنبه و جمعه) در `schedule` وجود ندارند و
 * `DAYS` هم فقط پنج عضو دارد. پس هر مصرف‌کننده باید بازهٔ ۰ تا ۴
 * را بسنجد، نه اینکه فرض کند همیشه روز کاری است.
 *
 * @param {Date} [d] پیش‌فرض: اکنون
 * @returns {number} ۰ (شنبه) تا ۶ (جمعه)
 */
function todayIndex(d){
  var t = d || new Date();
  return (t.getDay() + 1) % 7;
}

/** آیا این شمارهٔ روز، روز درسی است؟ (شنبه تا چهارشنبه) */
function isSchoolDay(dayIdx){
  return dayIdx >= 0 && dayIdx <= 4;
}

/**
 * روزهای کاریِ یک مدرسه (دور ۶۵ بند روزهای کاری).
 * پیش‌فرض: شنبه تا سه‌شنبه — چهارشنبه فقط اگر مدرسه روشن کرده باشد.
 * @returns {number[]} ایندکس‌های روز (شنبه=۰ … جمعه=۶)
 */
function workDaysOf(schoolId){
  var sc = (typeof byId === 'function') ? (byId('schools', schoolId) || {}) : {};
  var wd = sc.work_days;
  if(Array.isArray(wd) && wd.length) return wd.map(Number);
  return (typeof DEFAULT_WORK_DAYS !== 'undefined') ? DEFAULT_WORK_DAYS.slice() : [0,1,2,3];
}

/**
 * آیا این تاریخ برای این مدرسه روز کاری است؟
 * روزهای هفتهٔ کاری + روزهای جبرانیِ ثبت‌شده (makeup_classes).
 */
function isWorkDay(schoolId, dateISO, now){
  var t = now || new Date(dateISO + 'T12:00:00');
  var idx = todayIndex(t);
  if(workDaysOf(schoolId).indexOf(idx) > -1) return true;
  var mk = (db.makeup_classes || []).some(function(m){
    return m.school_id === schoolId && m.date === dateISO;
  });
  return !!mk;
}

/* ─────────────── بخش ۲: سلامت ساعت دستگاه ─────────────── */

/**
 * آیا ساعت دستگاه معقول به‌نظر می‌رسد؟
 *
 * 🔴 چرا لازم است؟ برنامه آفلاین است و هیچ منبع زمان معتبری
 * ندارد. اگر ساعت دستگاه اشتباه باشد (باتری خالی، تنظیم دستی
 * غلط)، کلاس اشتباه نشان داده می‌شود بدون اینکه کسی بفهمد.
 *
 * لایهٔ ۱ از سه لایهٔ طرح: بررسی معقول‌بودن سال.
 * لایهٔ ۳ (مقایسه با ساعت سرور) وقتی SYNC فعال شد اضافه می‌شود؛
 * قلابش اینجا آماده است — کافی است `SERVER_TIME_KEY` پر شود.
 *
 * @returns {{ok:boolean, reason:string|null, year:number}}
 */
var CLOCK_MIN_YEAR = 2024;
var CLOCK_MAX_YEAR = 2035;
var SERVER_TIME_KEY = 'sms_server_time_v1';
var CLOCK_DRIFT_MIN = 10;          /* دقیقه — آستانهٔ هشدار */

function clockSanity(now){
  var t = now || new Date();
  var y = t.getFullYear();
  if(isNaN(y)) return { ok:false, reason:'invalid', year:0 };
  if(y < CLOCK_MIN_YEAR || y > CLOCK_MAX_YEAR){
    return { ok:false, reason:'year', year:y };
  }
  /* لایهٔ ۳ — فقط اگر زمان سرور از همگام‌سازی ذخیره شده باشد.
     ⚠️ امروز هیچ‌جا نوشته نمی‌شود؛ این قلاب برای روز اتصال است. */
  try{
    var raw = (typeof Store !== 'undefined') ? Store.get(SERVER_TIME_KEY) : null;
    if(raw){
      var srv = Date.parse(raw);
      if(!isNaN(srv)){
        var diff = Math.abs(t.getTime() - srv) / 60000;
        if(diff > CLOCK_DRIFT_MIN){
          return { ok:false, reason:'drift', year:y, drift:Math.round(diff) };
        }
      }
    }
  }catch(e){ /* دسترسی به Store نباید تشخیص زمان را از کار بیندازد */ }
  return { ok:true, reason:null, year:y };
}

/** پیام فارسی خطای ساعت — برای نمایش در رابط */
function clockWarnText(sanity){
  if(!sanity || sanity.ok) return '';
  if(sanity.reason === 'year'){
    return 'ساعت دستگاه شما نادرست به‌نظر می‌رسد (سال '
      + (typeof faD === 'function' ? faD(String(sanity.year)) : sanity.year)
      + '). انتخاب خودکار کلاس غیرفعال شد؛ لطفاً ساعت دستگاه را تنظیم کنید.';
  }
  if(sanity.reason === 'drift'){
    return 'ساعت دستگاه شما حدود '
      + (typeof fa === 'function' ? fa(sanity.drift) : sanity.drift)
      + ' دقیقه با سرور اختلاف دارد. زنگ نمایش‌داده‌شده ممکن است درست نباشد.';
  }
  return 'ساعت دستگاه قابل خواندن نیست.';
}

/* ─────────────── بخش ۳: بازهٔ زمانی جاری ─────────────── */

/**
 * الان کدام بازه از زمان‌بندی زنگ است؟
 *
 * @returns {{kind:string, no:number|null, from:string, to:string,
 *            label:string, next:object|null, hasSchedule:boolean}}
 *   kind = 'lesson' | 'break' | 'before' | 'after' | 'holiday' | 'unknown'
 *
 * ⚠️ `hasSchedule` می‌گوید مدرسه **واقعاً** زمان‌بندی ثبت کرده یا
 * `bellOf()` الگوی پیش‌فرض برگردانده. طبق تصمیم تأییدشدهٔ کاربر،
 * پیش‌گزینش فقط وقتی مجاز است که این `true` باشد — وگرنه با ساعت
 * خیالی کار می‌کنیم.
 */
function currentSlot(schoolId, now){
  var t = now || new Date();
  var out = { kind:'unknown', no:null, from:'', to:'', label:'',
              next:null, hasSchedule:false, day:todayIndex(t) };

  var sane = clockSanity(t);
  if(!sane.ok){ out.kind = 'unknown'; out.clock = sane; return out; }
  out.clock = sane;

  /* آیا این مدرسه رکورد واقعی دارد یا الگوی پیش‌فرض است؟ */
  out.hasSchedule = (db.bell_schedules || [])
    .some(function(b){ return b.school_id === schoolId; });

  /* دور ۶۵ بند روزهای کاری: روزِ کاریِ خودِ مدرسه (پیش‌فرض شنبه تا
     سه‌شنبه) + روزهای جبرانی — به‌جای پنج‌روزهٔ سراسریِ قدیمی. */
  var wd = workDaysOf(schoolId);
  var inWeek = wd.indexOf(out.day) > -1;
  var isMakeup = (db.makeup_classes || []).some(function(m){
    return m.school_id === schoolId && m.date === localISOOf(t);
  });
  if(!inWeek && !isMakeup){
    out.kind = 'holiday';
    out.label = (out.day === 5) ? 'پنجشنبه برای این مدرسه روز کاری نیست' : 'روز تعطیل';
    return out;
  }

  /* 🔴 روز هفته باید رد شود: بدون آن bellOf() همیشه برنامهٔ شنبه
     (روز ۰) را برمی‌گرداند و در زمان‌بندی به‌تفکیک‌روز (نسخهٔ ۲)
     زنگ اشتباهی تشخیص داده می‌شود — رفع بند ۲ در گام ۳.
     روزِ جبرانیِ بیرون از هفتهٔ کاری (مثلاً جمعه) از برنامهٔ شنبه
     استفاده می‌کند — schedDay همان روزِ برنامهٔ درسی است. */
  out.schedDay = inWeek ? out.day : 0;
  var tl = (typeof bellTimeline === 'function') ? bellTimeline(schoolId, out.schedDay) : [];
  if(!tl.length){ return out; }

  var mins = t.getHours() * 60 + t.getMinutes();
  var firstFrom = timeToMin(tl[0].from);
  var lastTo    = timeToMin(tl[tl.length - 1].to);

  if(mins < firstFrom){
    out.kind = 'before';
    out.label = 'پیش از شروع مدرسه';
    out.next = tl[0];
    return out;
  }
  if(mins >= lastTo){
    out.kind = 'after';
    out.label = 'پایان ساعت مدرسه';
    return out;
  }

  for(var i = 0; i < tl.length; i++){
    var s = tl[i];
    var a = timeToMin(s.from), b = timeToMin(s.to);
    /* ⚠️ مرز شامل شروع است و شامل پایان نیست: [from, to)
       وگرنه لحظهٔ دقیق پایان زنگ به دو بازه تعلق می‌گیرد. */
    if(mins >= a && mins < b){
      out.kind  = s.kind;
      out.no    = s.no;
      out.from  = s.from;
      out.to    = s.to;
      out.label = s.label;
      out.next  = tl[i + 1] || null;
      return out;
    }
  }
  return out;
}

/* ─────────────── بخش ۴: کلاس فعلی دبیر ─────────────── */

/**
 * دبیر الان در کدام کلاس است؟
 *
 * تقاطع سه چیز: روز جاری · شمارهٔ زنگ جاری · جدول `schedule`.
 *
 * @returns {{classId, subjectId, period, className, subjectName,
 *            slot}} یا null
 *
 * ⚠️ اگر بیش از یک ردیف بخواند (تداخل برنامه)، نخستین را
 * برمی‌گرداند و `conflict:true` می‌گذارد — تصمیم با مصرف‌کننده.
 */
function teacherNowClass(teacherId, schoolId, now){
  var tid = teacherId || ((typeof S !== 'undefined' && S.user) ? S.user.id : null);
  if(!tid) return null;
  var u = byId('users', tid);
  var sid = schoolId || (u ? u.school_id : null);
  if(!sid) return null;

  var slot = currentSlot(sid, now);
  if(slot.kind !== 'lesson' || !slot.no) return null;

  var schedDay = (slot.schedDay != null) ? slot.schedDay : slot.day;
  var rows = (db.schedule || []).filter(function(r){
    return r.teacher_id === tid
        && r.school_id === sid
        && r.day === schedDay
        && Number(r.period) === Number(slot.no);
  });
  if(!rows.length) return null;

  var r = rows[0];
  return {
    classId:     r.class_id,
    subjectId:   r.subject_id,
    period:      Number(slot.no),
    className:   (byId('classes',  r.class_id)   || {}).name || '—',
    subjectName: (byId('subjects', r.subject_id) || {}).name || '—',
    slot:        slot,
    conflict:    rows.length > 1
  };
}

/**
 * آیا پیش‌گزینش خودکار مجاز است؟
 *
 * 🔴 تصمیم تأییدشدهٔ کاربر (دور ۴۷): فقط وقتی مدرسه **واقعاً**
 * `bell_schedules` ثبت کرده باشد. دلیل: `bellOf()` نبودِ رکورد را
 * با `BELL_PRESETS` جبران می‌کند، یعنی ساعت خیالی می‌دهد. بدون این
 * شرط، مدرسه‌ای که زنگ تنظیم نکرده کلاس اشتباه می‌بیند و کاربر
 * نمی‌فهمد چرا.
 *
 * گام‌های ۳ و ۴ طرح (پیش‌گزینش واقعی) از همین گارد استفاده
 * می‌کنند — هنوز پیاده نشده‌اند.
 */
function bellAutoAllowed(schoolId){
  var sid = schoolId || ((typeof S !== 'undefined' && S.user) ? S.user.school_id : null);
  if(!sid) return false;
  var slot = currentSlot(sid);
  return !!(slot.hasSchedule && slot.clock && slot.clock.ok);
}

/**
 * کلاس فعلی دبیر برای پیش‌گزینش (گام ۳ طرح).
 *
 * 📄 مصرف‌کنندهٔ اصلی: viewAttendance (12-attendance.js).
 *
 * برمی‌گرداند: {classId, subjectId, ...} یا null.
 * null یعنی «پیش‌گزینش نکن، رفتاری قدیم»:
 *   • مدرسه bell_schedules ندارد (گارد bellAutoAllowed)
 *   • ساعت دستگاه نامعتبر است
 *   • الان زنگ درسی نیست (تفریح، پیش از شروع، پایان، تعطیل)
 *   • دبیر در این زنگ کلاسی در برنامهٔ خودش ندارد
 *
 * ⚠️ `now` برای آزمون‌پذیری است — همان الگوی bellNowBar(now).
 */
function bellAutoClass(teacherId, schoolId, now){
  var sid = schoolId || ((typeof S !== 'undefined' && S.user) ? S.user.school_id : null);
  if(!bellAutoAllowed(sid)) return null;
  var cur = teacherNowClass(teacherId, sid, now);
  if(!cur || !cur.classId) return null;
  return cur;
}

/* ═══════════════════════════════════════════════════════════════════
   بخش ۵ ▸ نوار وضعیت زنگ (گام ۲)
   ═══════════════════════════════════════════════════════════════════
   کارت کوچک بالای داشبورد دبیر که می‌گوید «الان زنگ چندم است و
   کدام کلاس».

   🔴 این گام **فقط نمایش** است. هیچ رفتاری عوض نمی‌شود، هیچ
   پیش‌گزینشی انجام نمی‌شود. گام‌های ۳ و ۴ طرح روی همین سوارند.
   ═══════════════════════════════════════════════════════════════════ */

/** آیا نوار زنگ برای این کاربر معنا دارد؟ */
function bellBarApplies(){
  if(typeof S === 'undefined' || !S.user) return false;
  var role = (typeof activePersona === 'function') ? activePersona() : S.user.role;
  return role === 'teacher' && !!S.user.school_id;
}

/**
 * نوار وضعیت زنگ برای دبیر.
 *
 * ⚠️ رشتهٔ خالی برمی‌گرداند اگر: کاربر دبیر نیست · مدرسه
 * `bell_schedules` ندارد · ساعت دستگاه نامعتبر است.
 * سه حالت آخر عمدی‌اند — نوار نباید اطلاعات نادرست بدهد.
 */
function bellNowBar(now){
  if(!bellBarApplies()) return '';
  var sid = S.user.school_id;
  var slot = currentSlot(sid, now);

  /* ساعت نامعتبر ⇒ به‌جای زنگ، هشدار */
  if(slot.kind === 'unknown'){
    return '<div class="bell-bar bell-bar-warn">⚠️ '
      + esc(clockWarnText(slot.clock)) + '</div>';
  }

  /* 🔴 گارد تصمیم سیاستی: مدرسه‌ای که زنگ ثبت نکرده، ساعتش
     خیالی است (BELL_PRESETS). نوار نمایش داده نمی‌شود. */
  if(!slot.hasSchedule) return '';

  if(slot.kind === 'holiday'){
    return '<div class="bell-bar bell-bar-off">🌙 امروز روز درسی نیست.</div>';
  }
  if(slot.kind === 'before'){
    var n0 = slot.next;
    return '<div class="bell-bar bell-bar-off">🕗 هنوز مدرسه شروع نشده'
      + (n0 ? ' — نخستین زنگ ' + esc(timeFa(n0.from)) : '') + '.</div>';
  }
  if(slot.kind === 'after'){
    return '<div class="bell-bar bell-bar-off">🌆 ساعت مدرسه تمام شده است.</div>';
  }
  if(slot.kind === 'break'){
    var nx = slot.next;
    return '<div class="bell-bar bell-bar-break">☕ زنگ تفریح'
      + ' <span class="small">(' + esc(timeFa(slot.from)) + ' تا '
      + esc(timeFa(slot.to)) + ')</span>'
      + (nx && nx.kind === 'lesson'
          ? ' — زنگ بعدی ' + esc(timeFa(nx.from)) : '')
      + '</div>';
  }
  if(slot.kind !== 'lesson') return '';

  /* زنگ درسی: آیا این دبیر همین حالا کلاس دارد؟ */
  var cur = teacherNowClass(S.user.id, sid, now);
  var head = '🔔 <b>' + esc(slot.label) + '</b> <span class="small">('
    + esc(timeFa(slot.from)) + ' تا ' + esc(timeFa(slot.to)) + ')</span>';

  if(!cur){
    return '<div class="bell-bar bell-bar-free">' + head
      + ' — <span class="small">در این زنگ کلاسی ندارید.</span></div>';
  }
  return '<div class="bell-bar bell-bar-live">' + head
    + ' — <b>' + esc(cur.className) + '</b>'
    + ' <span class="small">' + esc(cur.subjectName) + '</span>'
    + (cur.conflict
        ? ' <span class="badge b-amber">تداخل برنامه</span>' : '')
    + '</div>';
}
/* ═══════════════════════════════════════════════════════════════════
   بخش ۶ ▸ کارتِ زندهٔ زنگ برای خانواده (دور ۶۵ بند زنگ زنده)
   ═══════════════════════════════════════════════════════════════════
   ولی (و خودِ دانش‌آموز) برای هر فرزند یک کارتِ زنده می‌بیند:
   زنگِ جاری · کلاسِ فرزند · اسم دبیرِ آن زنگ · وضعیتِ امروز.

   🔴 این کارت **همیشه رایگان** است — دادهٔ پایه (حضور + برنامه)
   است و ربطی به اشتراک ندارد (تصمیمِ کاربر: کارتِ ولی رایگان
   می‌ماند و اسم دبیر را هم می‌بیند). اشتراک فقط امکاناتِ اضافه
   (گزارش‌های تحلیلی) را کنترل می‌کند.

   🔴 استریم = «پُلِ دوره‌ای»: هر ۴۵ ثانیه (پنجرهٔ ۳۰–۶۰ ثانیهٔ
   تصمیمِ کاربر) فقط همین کارت‌ها بازندهی می‌شوند — نه رندرِ
   کل صفحه، نه وب‌سوکت. اگر برچسبِ زنده از DOM رفته باشد،
   زمان‌سنج خودکار خاموش می‌شود.
   ═══════════════════════════════════════════════════════════════════ */

/** دبیری که کلاسِ مشخص در روز/زنگِ مشخص تدریس می‌کند (اسم برای ولی). */
function classNowTeacher(classId, day, period){
  var r = (db.schedule || []).filter(function(x){
    return x.class_id === classId && x.day === day && Number(x.period) === Number(period);
  })[0];
  if(!r) return null;
  return (byId('users', r.teacher_id) || {}).full_name || null;
}

/** تاریخِ محلیِ یک Date به شکل ISO (برای آزمون‌پذیری با nowِ ساختگی). */
function localISOOf(t){
  var p = function(n){ return String(n).padStart(2,'0'); };
  return t.getFullYear() + '-' + p(t.getMonth()+1) + '-' + p(t.getDate());
}

/**
 * وضعیتِ زندهٔ یک فرزند: زنگِ جاری + کلاس + دبیر + حضورِ امروز.
 * تابعِ خالص است (داده را نمی‌چرخاند) — برای تست با `now` ثابت.
 *
 * `attMap` (اختیاری، حالتِ سروری): پوشِ خواندنی از حضورِ امروز که
 * سرور فرستاده است — اگر برای این دانش‌آموز رکورد داشته باشد
 * اولویتش با دادهٔ محلی است (مرورِ چنددستگاهیِ ۱۳.۴).
 */
function childNowStatus(studentId, now, attMap){
  var st = byId('users', studentId);
  if(!st) return null;
  var sid = st.school_id;
  var t = now || new Date();
  var slot = currentSlot(sid, t);
  var cls = classOf(studentId) || {};
  var out = {
    studentId: studentId,
    name: st.full_name || '—',
    className: cls.name || '—',
    classId: cls.id || null,
    schoolId: sid,
    slot: slot,
    teacherName: null,
    att: null
  };
  if(slot.kind === 'lesson' && slot.no && out.classId){
    out.teacherName = classNowTeacher(out.classId, slot.day, slot.no);
  }
  var a = (db.attendance || []).filter(function(x){
    return x.student_id === studentId && x.date === localISOOf(t);
  })[0];
  out.att = a ? a.status : null;
  if(attMap && Object.prototype.hasOwnProperty.call(attMap, studentId)){
    out.att = attMap[studentId];
  }
  return out;
}

/** HTMLِ کارتِ یک فرزند (بخشِ رایگانِ نمایِ زنده). */
function familyBellCardHTML(c){
  var slot = c.slot;
  var slotHTML = '';
  if(!slot.hasSchedule){
    slotHTML = '<div class="small muted">مدرسهٔ این فرزند هنوز برنامهٔ زنگ ثبت نکرده است.</div>';
  } else if(slot.kind === 'holiday'){
    slotHTML = '<div class="small">🌙 امروز روز درسی نیست.</div>';
  } else if(slot.kind === 'before'){
    slotHTML = '<div class="small">🕗 هنوز مدرسه شروع نشده'
      + (slot.next ? ' — نخستین زنگ ' + esc(timeFa(slot.next.from)) : '') + '.</div>';
  } else if(slot.kind === 'after'){
    slotHTML = '<div class="small">🌆 ساعت مدرسه تمام شده است.</div>';
  } else if(slot.kind === 'break'){
    slotHTML = '<div class="small">☕ زنگ تفریح'
      + (slot.next && slot.next.kind === 'lesson' ? ' — زنگ بعدی ' + esc(timeFa(slot.next.from)) : '') + '</div>';
  } else if(slot.kind === 'lesson'){
    slotHTML = '<div class="small">🔔 <b>' + esc(slot.label) + '</b> <span class="muted">('
      + esc(timeFa(slot.from)) + ' تا ' + esc(timeFa(slot.to)) + ')</span>'
      + (c.teacherName ? ' — با <b>' + esc(c.teacherName) + '</b> در کلاس'
                       : ' — برای این کلاس در برنامه، دبیری ثبت نشده') + '</div>';
  } else {
    slotHTML = '<div class="small muted">برنامهٔ زنگ امروز تعیین نیست.</div>';
  }
  var attMap = { present:'✅ حاضر', absent:'❌ غایب', late:'⏰ دیر', excused:'📋 مرخصی' };
  var attClass = c.att === 'present' ? 'b-green' : (c.att === 'absent' ? 'b-red' : 'b-amber');
  var attHTML = c.att
    ? '<span class="badge ' + attClass + '">امروز: ' + attMap[c.att] + '</span>'
    : '<span class="badge b-gray">امروز: هنوز ثبت نشده</span>';
  return '<div class="card" style="margin-bottom:10px"><div class="card-head">'
    + '<h3 style="font-size:15px">' + esc(c.name) + '</h3>'
    + '<span class="badge b-gray">' + esc(c.className) + '</span></div>'
    + '<div class="card-body" style="display:grid;gap:8px">' + slotHTML + attHTML + '</div></div>';
}

/** محتوای کارت‌های همهٔ فرزندان (بدون قاب) — برای تیکِ زنده. */
function familyBellCardsInner(now, attMap){
  var role = (typeof activePersona === 'function') ? activePersona() : S.user.role;
  if(role !== 'parent' && role !== 'student') return '';
  var kids = S.user.role === 'student' ? [S.user.id]
    : db.parent_links.filter(function(p){ return p.parent_id === S.user.id; }).map(function(p){ return p.student_id; });
  if(!kids.length) return '';
  return kids.map(function(k){
    var c = childNowStatus(k, now, attMap);
    if(!c) return '';
    return familyBellCardHTML(c);
  }).join('');
}

/** کارتِ زندهٔ زنگ برای ولی/دانش‌آموز — همیشه رایگان، بدون گارد اشتراک. */
function familyBellCards(now){
  if(typeof S === 'undefined' || !S.user) return '';
  var inner = familyBellCardsInner(now);
  if(!inner) return '';
  return '<div style="margin-bottom:10px">'
    + '<div class="row" style="padding:8px 14px 0"><b style="font-size:13px">🔔 زنگ زنده</b>'
    + '<span class="small muted">دادهٔ پایه — همیشه رایگان</span></div>'
    + '<div class="bell-live-root" data-bell-live="family">' + inner + '</div></div>';
}

/* ── تیکِ زنده: پُلِ دوره‌ای ۴۵ ثانیه‌ای (فقط کارت‌ها، نه کل صفحه) ── */
var BELL_LIVE_INTERVAL = 45000;   /* پنجرهٔ ۳۰–۶۰ ثانیهٔ تصمیمِ کاربر */
var bellLiveTimer = null;
var bellLiveInFlight = false;     /* دو پُل هم‌زمان نباشند */
var bellLiveCache = null;         /* آخرین پاسخِ معتبرِ سرور (برای تست و عیب‌یابی) */

/** رندرِ محلی — حالتِ آفلاین و پس‌رویِ امنِ حالتِ سروری. */
function bellLiveRenderLocal(){
  var roots = document.querySelectorAll('[data-bell-live]');
  roots.forEach(function(root){
    var kind = root.getAttribute('data-bell-live');
    if(kind === 'family'){
      root.innerHTML = familyBellCardsInner();
    } else {
      root.innerHTML = (typeof bellNowBar === 'function') ? bellNowBar() : '';
    }
  });
}

/** حالتِ سروری (۱۳.۴): پُل با endpoint خُردِ /api/bell/now.
    - ساعتِ سرور به قلابِ SERVER_TIME_KEY می‌نشیند (لایهٔ ۳ِ clockSanity).
    - حضورِ امروز از storeٔ سرور می‌آید (مرورِ چنددستگاهی).
    - هر خطا (نشستِ مرده، سرورِ خاموش، بدنِ نامعتبر) = پس‌رویِ محلی. */
function bellLiveTickServer(){
  if(bellLiveInFlight) return;
  bellLiveInFlight = true;
  var finish = function(ok, j){
    bellLiveInFlight = false;
    if(typeof S === 'undefined' || !S.user) return;
    if(!ok){ bellLiveRenderLocal(); return; }
    /* پاسخ باید دقیقاً این شکل را داشته باشد — وگرنه رندرِ محلی */
    if(!j || j.ok !== true || typeof j.ts !== 'number' || !Array.isArray(j.family)){
      bellLiveRenderLocal(); return;
    }
    var now = new Date(j.ts);
    var attMap = {};
    j.family.forEach(function(r){
      if(r && r.studentId != null) attMap[r.studentId] = (r.att == null ? null : r.att);
    });
    bellLiveCache = j;
    try{ (typeof Store !== 'undefined') && Store.set(SERVER_TIME_KEY, now.toISOString()); }catch(e){}
    var roots = document.querySelectorAll('[data-bell-live]');
    if(!roots.length){ bellLiveStop(); return; }
    roots.forEach(function(root){
      var kind = root.getAttribute('data-bell-live');
      if(kind === 'family'){
        root.innerHTML = familyBellCardsInner(now, attMap);
      } else {
        root.innerHTML = (typeof bellNowBar === 'function') ? bellNowBar(now) : '';
      }
    });
  };
  try{
    /* ⚠️ فقط از راهِ لایهٔ داده (httpGetJson) — قاعدهٔ طلاییِ 00-data-layer */
    httpGetJson('/api/bell/now', 2500)
      .then(function(r){ finish(r && r.ok === true, r ? r.data : null); })
      .catch(function(){ finish(false, null); });
  }catch(e){ finish(false, null); }
}

function bellLiveTick(){
  try{
    var roots = document.querySelectorAll('[data-bell-live]');
    if(!roots.length){ bellLiveStop(); return; }
    if(typeof DATA_MODE !== 'undefined' && DATA_MODE === 'server'){
      bellLiveTickServer();
      return;
    }
    bellLiveRenderLocal();
  }catch(e){ /* تیکِ زنده هرگز نباید برنامه را بشکند */ }
}
/** زمان‌سنجِ زنده را تضمین می‌کند (آیدمپتان — در رندر صدا زده می‌شود). */
function bellLiveEnsure(){
  if(typeof S === 'undefined' || !S.user){ bellLiveStop(); return; }
  if(bellLiveTimer) return;
  try{ bellLiveTimer = setInterval(bellLiveTick, BELL_LIVE_INTERVAL); }catch(e){}
}

function bellLiveStop(){
  if(bellLiveTimer){ try{ clearInterval(bellLiveTimer); }catch(e){} bellLiveTimer = null; }
}

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

  if(!isSchoolDay(out.day)){
    out.kind = 'holiday';
    out.label = 'روز تعطیل';
    return out;
  }

  /* 🔴 روز هفته باید رد شود: بدون آن bellOf() همیشه برنامهٔ شنبه
     (روز ۰) را برمی‌گرداند و در زمان‌بندی به‌تفکیک‌روز (نسخهٔ ۲)
     زنگ اشتباهی تشخیص داده می‌شود — رفع بند ۲ در گام ۳. */
  var tl = (typeof bellTimeline === 'function') ? bellTimeline(schoolId, out.day) : [];
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

  var rows = (db.schedule || []).filter(function(r){
    return r.teacher_id === tid
        && r.school_id === sid
        && r.day === slot.day
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

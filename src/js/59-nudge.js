/* ═══════════════════════════════════════════════════════════════════
   یادآوری به دبیر (دور ۶۵ بند N2)
   ═══════════════════════════════════════════════════════════════════
   مدیر مدرسه می‌بیند کدام کلاس‌ها هنوز حضورِ زنگِ جاری را ثبت
   نکرده‌اند و با یک کلیک به دبیرِ آن کلاس یادآوری می‌کند.

   سه لایه (تصمیمِ کاربر):
   ۱. درون‌برنامه — اعلانِ فوری برای دبیر (همین لحظه).
   ۲. با باز کردن — اگر دبیر برنامه را باز کند، بنرِ یادآوری
      با دکمهٔ «حالا ثبت می‌کنم» (پیش‌گزینشِ کلاس) می‌بیند.
   ۳. پیامک ۵ دقیقه بعد — رکوردِ صفِ پیامک با نشانهٔ یکتا
      (source_ref)؛ در دمو رکورد ساخته می‌شود و نمایش داده
      می‌شود، ارسال واقعی با اتصالِ سرور و درگاهِ پیامک انجام
      می‌شود (قراردادِ سرور — درگاهِ پیامک جداست، تصمیم کاربر).

   گاردها:
   - فقط زنگِ جاری (زنگ گذشته دیگر معنی ندارد).
   - ۱۰ دقیقهٔ ضداسپم برای هر کلاس/تاریخ/زنگ.
   - کلاسی که کامل ثبت شده، یادآور نمی‌گیرد.
   ═══════════════════════════════════════════════════════════════════ */

var NUDGE_COOLDOWN_MIN = 10;   /* فاصلهٔ دو یادآور برای یک کلاس/زنگ */
var NUDGE_SMS_MIN = 5;         /* لایهٔ پیامک: بعد از ۵ دقیقه */
var _nudgeTickAt = 0;

/** آیا حضورِ این کلاس برای این تاریخ کامل ثبت شده؟ */
function classAttDone(classId, dateISO){
  var roster = (typeof studentsOfClass === 'function') ? studentsOfClass(classId) : [];
  if(!roster.length) return true; /* کلاسِ بدونِ دانش‌آموز = انجام‌شده */
  var n = 0;
  for(var i = 0; i < roster.length; i++){
    var a = (db.attendance || []).some(function(x){
      return x.student_id === roster[i].id && x.date === dateISO && x.status;
    });
    if(a) n++;
  }
  return n >= roster.length;
}

/**
 * کلاس‌هایی که زنگِ جاری را دارند ولی هنوز کامل ثبت نشده‌اند.
 * خروجی: [{classId, teacherId, className, teacherName}]
 */
function unattendedClasses(schoolId, now){
  var slot = currentSlot(schoolId, now);
  if(slot.kind !== 'lesson' || !slot.no) return [];
  var schedDay = (slot.schedDay != null) ? slot.schedDay : slot.day;
  var out = [];
  (db.schedule || []).forEach(function(r){
    if(r.school_id !== schoolId) return;
    if(r.day !== schedDay) return;
    if(Number(r.period) !== Number(slot.no)) return;
    if(classAttDone(r.class_id, todayISO())) return;
    var t = byId('users', r.teacher_id) || {};
    out.push({
      classId: r.class_id,
      teacherId: r.teacher_id,
      className: (byId('classes', r.class_id) || {}).name || '—',
      teacherName: t.full_name || '—'
    });
  });
  return out.sort(function(a, b){ return a.className < b.className ? -1 : 1; });
}

/**
 * یادآوری به دبیر.
 * خروجی: {ok, msg} — گاردها در سطح داده (REAL).
 */
function nudgeTeacher(o){
  var schoolId = o.schoolId, classId = o.classId, teacherId = o.teacherId;
  var period = o.period || 0, dateISO = o.dateISO || todayISO(), by = o.by || null;
  var slot = currentSlot(schoolId, o.now||null); /* o.now فقط برای آزمون‌پذیری */
  /* گارد ۱: فقط زنگِ جاری */
  if(slot.kind !== 'lesson' || slot.no !== period){
    return {ok:false, msg:'فقط برای زنگِ جاری یادآوری می‌شود'};
  }
  /* گارد ۲: کلاس کامل ثبت شده */
  if(classAttDone(classId, dateISO)){
    return {ok:false, msg:'این کلاس کامل ثبت شده است'};
  }
  /* گارد ۳: ۱۰ دقیقهٔ ضداسپم (و پاسخی در انتظار) */
  var prev = (db.nudges || []).filter(function(n){
    return n.school_id === schoolId && n.class_id === classId && n.date === dateISO && n.period === period;
  });
  var pending = prev.some(function(n){ return n.status === 'pending'; });
  var recent = prev.some(function(n){
    return n.created_at && minutesSince(n.created_at) < NUDGE_COOLDOWN_MIN;
  });
  if(pending) return {ok:false, msg:'یادآوریِ قبلی هنوز در انتظار است'};
  if(recent) return {ok:false, msg:'هنوز در مهلتِ ۱۰ دقیقهٔ ضداسپم است'};

  var t = byId('users', teacherId) || {};
  var nu = insert('nudges', {
    school_id: schoolId, class_id: classId, teacher_id: teacherId,
    period: period, date: dateISO, status: 'pending',
    reply: null, sms_sent: 0, created_at: new Date().toISOString(), created_by: by
  });
  insert('notifications', {
    type: 'attendance_nudge', school_id: schoolId, user_id: teacherId,
    title: '🔔 یادآوری حضور و غیاب',
    body: 'مدیر یادآوری کرد: حضورِ زنگِ ' + fa(period) + ' برای کلاس «' + ((byId('classes', classId) || {}).name || '') + '» هنوز ثبت نشده است.',
    link: 'attendance', read: 0, created_at: dateISO
  });
  return {ok:true, msg:'یادآوری به دبیر ارسال شد', nudge: nu.id};
}

/** پاسخِ دبیر: ok-now (حالا ثبت می‌کنم) | no-class (حالا کلاس ندارم) | later (بعداً) */
function nudgeReply(nudgeId, reply){
  var n = byId('nudges', nudgeId);
  if(!n) return {ok:false, msg:'یادآوری یافت نشد'};
  if(n.status !== 'pending') return {ok:false, msg:'پیش از این پاسخ داده شده'};
  update('nudges', nudgeId, {status: 'replied', reply: reply, replied_at: new Date().toISOString()});
  return {ok:true, msg:'ثبت شد'};
}

/** آخرین یادآوریِ ۱۰ دقیقهٔ اخیر برای کلاس/تاریخ/زنگ (برای نمایشِ وضعیت) */
function lastNudgeFor(schoolId, classId, dateISO, period){
  var out = null;
  (db.nudges || []).forEach(function(n){
    if(n.school_id !== schoolId || n.class_id !== classId || n.date !== dateISO || n.period !== period) return;
    if(!out || (n.created_at||'') > (out.created_at||'')) out = n;
  });
  return out;
}

/* ── لایهٔ ۳: رکوردِ صفِ پیامک (۵ دقیقه بعد، با source_ref یکتا) ── */

/**
 * وارسیِ یادآورهای ۵ دقیقهٔ پیش: اگر هنوز pending باشند، رکوردِ
 * صفِ پیامک ساخته می‌شود (تکرار: نه — با source_ref).
 * در دمو فقط رکورد؛ ارسال واقعی با درگاهِ پیامکِ سرور.
 */
function nudgeTick(){
  var now = Date.now();
  if(now - _nudgeTickAt < 30000) return;   /* حداکثر هر ۳۰ ثانیه یک بار */
  _nudgeTickAt = now;
  (db.nudges || []).forEach(function(n){
    if(n.status !== 'pending') return;
    if(n.sms_sent) return;
    if(minutesSince(n.created_at) < NUDGE_SMS_MIN) return;
    var exists = (db.teacher_sms || []).some(function(x){ return x.source_ref === 'nudge_' + n.id; });
    if(exists) { update('nudges', n.id, {sms_sent: 1}); return; }
    var t = byId('users', n.teacher_id) || {};
    var sc = byId('schools', n.school_id) || {};
    var cls = byId('classes', n.class_id) || {};
    insert('teacher_sms', {
      school_id: n.school_id, teacher_id: n.teacher_id, phone: t.phone || null,
      body: 'مدیر ' + (sc.name || '') + ': حضورِ زنگِ ' + fa(n.period) + ' کلاس «' + (cls.name || '') + '» ثبت نشده است.',
      source_ref: 'nudge_' + n.id, status: 'queued', created_at: new Date().toISOString()
    });
    update('nudges', n.id, {sms_sent: 1});
  });
}

/* ── رابط ── */

/** کارتِ مدیر: کلاس‌های ثبت‌نشدهٔ زنگِ جاری + دکمهٔ یادآوری */
function nudgeManagerCard(now){
  if(typeof S === 'undefined' || !S.user) return '';
  var role = (typeof activePersona === 'function') ? activePersona() : S.user.role;
  if(role !== 'manager') return '';
  var sid = S.user.school_id;
  var slot = currentSlot(sid, now);
  if(slot.kind !== 'lesson' || !slot.no) return '';
  var list = unattendedClasses(sid, now);
  if(!list.length){
    return '<div class="card" style="margin-bottom:12px"><div class="card-body row" style="gap:10px;align-items:center">'
      + '<span style="font-size:20px">✅</span>'
      + '<div><b>زنگِ ' + fa(slot.no) + '</b> — حضورِ همهٔ کلاس‌ها ثبت شده است.'
      + '<div class="small muted">این کارت در هر رندر تازه می‌شود.</div></div></div></div>';
  }
  var rows = list.map(function(c){
    var nu = lastNudgeFor(sid, c.classId, todayISO(), slot.no);
    var state = '';
    if(nu && nu.status === 'pending'){
      state = '<span class="badge b-amber">📤 یادآوری شده — در انتظار</span>'
        + (nu.sms_sent ? '<span class="badge b-gray">در صفِ پیامک</span>' : '');
    } else if(nu && nu.status === 'replied'){
      var rep = {'ok-now':'✅ ثبت شد', 'no-class':'کلاس ندارد', later:'بعداً'}[nu.reply] || 'پاسخ داده شد';
      state = '<span class="badge b-blue">🗨️ ' + rep + '</span>';
    } else if(nu){
      state = '<button class="btn sm" data-act="nudge-send" data-id="' + escAttr(c.classId) + '">📤 یادآوری دوباره</button>';
    } else {
      state = '<button class="btn sm" data-act="nudge-send" data-id="' + escAttr(c.classId) + '">📤 یادآوری</button>';
    }
    return '<div class="row" style="gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">'
      + '<b>' + esc(c.className) + '</b><span class="small muted">دبیر: ' + esc(c.teacherName) + '</span>'
      + '<div class="spacer"></div>' + state + '</div>';
  }).join('');
  return '<div class="card" style="margin-bottom:12px"><div class="card-head">'
    + '<h3> زنگِ ' + fa(slot.no) + ' — ' + esc(slot.label || '') + ' (' + esc(timeFa(slot.from)) + ' تا ' + esc(timeFa(slot.to)) + ')</h3>'
    + '<span class="badge b-red">' + fa(list.length) + ' کلاس ثبت نشده</span></div>'
    + '<div class="card-body" style="padding-top:4px">' + rows + '</div></div>';
}

/** بنرِ دبیر: یادآوریِ در انتظار + دکمه‌های پاسخ */
function nudgeTeacherBanner(now){
  if(typeof S === 'undefined' || !S.user) return '';
  var role = (typeof activePersona === 'function') ? activePersona() : S.user.role;
  if(role !== 'teacher') return '';
  var sid = S.user.school_id;
  var slot = currentSlot(sid, now);
  if(slot.kind !== 'lesson' || !slot.no) return '';
  var nu = (db.nudges || []).filter(function(n){
    return n.teacher_id === S.user.id && n.status === 'pending' && n.period === slot.no && n.date === todayISO();
  })[0];
  if(!nu) return '';
  var cls = byId('classes', nu.class_id) || {};
  return '<div class="card" style="margin-bottom:12px;border-inline-start:4px solid var(--amber)"><div class="card-body row" style="gap:10px;flex-wrap:wrap;align-items:center">'
    + '<span style="font-size:20px">🔔</span>'
    + '<div style="min-width:0"><b>مدیر یادآوری کرد: حضورِ زنگِ ' + fa(slot.no) + ' کلاس «' + esc(cls.name || '') + '» ثبت نشده است.</b>'
    + (nu.sms_sent ? '<div class="small muted">یک یادآوریِ پیامکی هم در صف است (ارسال واقعی با درگاه).</div>' : '')
    + '</div><div class="spacer"></div>'
    + '<button class="btn sm" data-act="nudge-reply" data-id="' + escAttr(nu.id) + '" data-r="ok-now">✅ حالا ثبت می‌کنم</button>'
    + '<button class="btn ghost sm" data-act="nudge-reply" data-id="' + escAttr(nu.id) + '" data-r="no-class">حالا کلاس ندارم</button>'
    + '<button class="btn ghost sm" data-act="nudge-reply" data-id="' + escAttr(nu.id) + '" data-r="later">بعداً</button>'
    + '</div></div>';
}

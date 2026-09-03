/* ═══════════════════════════════════════════════════════════════════
   اطلاع‌رسانی خودکار پیامکی به اولیا — هستهٔ صف
   ═══════════════════════════════════════════════════════════════════
   بخش ۱ ▸ تنظیمات مدرسه (notify_rules)
   بخش ۲ ▸ قالب متن پیام‌ها
   بخش ۳ ▸ اثرانگشت وضعیت منشأ (source_hash)
   بخش ۴ ▸ ساخت درخواست پیام            notifyRequest()
   بخش ۵ ▸ لغو درون پنجرهٔ مهلت          notifyCancelIfFresh()
   بخش ۶ ▸ ارسال و کسر اعتبار            notifySend()
   بخش ۷ ▸ سقف روزانه و برآورد هزینه
   بخش ۸ ▸ پاک‌سازی رکوردهای کهنه

   ⚠️ چرا شمارهٔ ۴۴ و نه ۴۵؟ آخرین ماژول موجود ۴۳ است؛ این ماژول
   پس از آن می‌آید چون به smsParts (۳۳) و esc (۰۱) وابسته است.

   ⚠️ این ماژول تنها دروازهٔ ساخت پیامک خودکار است. هیچ ماژول دیگری
   نباید مستقیم در sms_log بنویسد. دلیل: سقف روزانه، کسر اعتبار و
   هشدار حجم باید یک‌جا اعمال شوند — همان الگوی 00-data-layer.js.
   ═══════════════════════════════════════════════════════════════════ */

/* ─────────────── بخش ۱: تنظیمات مدرسه ─────────────── */

/**
 * پیش‌فرض‌های اطلاع‌رسانی.
 *
 * ⚠️ autoSend عمداً خاموش است: روشن‌کردنش یعنی خطای دبیر بدون
 * بازبینی مستقیم به خانواده می‌رود. تصمیم آگاهانهٔ مدیر است.
 *
 * ⚠️ kinds.grade عمداً خاموش است: پیامک نمره حجم بالایی می‌سازد
 * (هر آزمون × هر دانش‌آموز) و حساسیت خانوادگی دارد.
 */
var NOTIFY_DEFAULTS = {
  enabled:      false,
  autoSend:     false,
  graceMinutes: 20,
  dailyCap:     300,
  bulkWarn:     50,
  kinds:        { absence: true, late: true, grade: false, event: true },
  gradeThreshold: 10
};

/** خواندن تنظیمات یک مدرسه با اعمال پیش‌فرض‌ها */
function notifySettings(schoolId){
  var sc = (typeof byId === 'function') ? byId('schools', schoolId) : null;
  var saved = (sc && sc.notify_rules) ? sc.notify_rules : {};
  var out = Object.assign({}, NOTIFY_DEFAULTS, saved);
  /* kinds تودرتوست و Object.assign سطحی است ⇒ جداگانه ادغام شود،
     وگرنه ذخیرهٔ {absence:false} بقیهٔ کلیدها را پاک می‌کند. */
  out.kinds = Object.assign({}, NOTIFY_DEFAULTS.kinds, saved.kinds || {});
  return out;
}

/** ذخیرهٔ تنظیمات؛ فقط کلیدهای شناخته‌شده نوشته می‌شوند */
function notifySaveSettings(schoolId, patch){
  var cur = notifySettings(schoolId);
  var next = Object.assign({}, cur, patch || {});
  if(patch && patch.kinds) next.kinds = Object.assign({}, cur.kinds, patch.kinds);
  update('schools', schoolId, { notify_rules: next });
  return next;
}

/* ─────────────── بخش ۲: قالب متن پیام‌ها ─────────────── */

/**
 * قالب‌ها.
 *
 * 🔴 قواعد ثابت (تصمیم دور ۴۲، تأیید کاربر):
 *   • هرگز کد ملی — پیامک کانال ناامنی است
 *   • هرگز عدد نمره — کرامت دانش‌آموز جلوی چشم دیگران
 *   • هرگز نام دبیر — حریم خصوصی کارکنان
 *   • هرگز لینک — پیامک فیشینگ همین شکلی است
 *
 * ⚠️ طول متن سنجیده شده است، حدس نیست: پیامک فارسی UCS-2 است و
 * هر ۷۰ نویسه یک قطعه. قالب‌ها عمداً زیر ۷۰ نویسه نگه داشته شده‌اند
 * تا هزینه نصف شود. سنجش دور ۴۲ نشان داد نسخهٔ بلندتر «حاضر نبود»
 * ۷۴ نویسه (۲ قطعه) بود و «غایب بود» ۶۴ نویسه (۱ قطعه).
 * پیش از تغییر هر متن، طولش را با smsParts بسنجید.
 */
var NOTIFY_TPL = {
  absence: function(o){
    return 'اولیای گرامی، ' + o.student + ' امروز ' + o.date +
           ' غایب بود. ' + o.school;
  },
  late: function(o){
    return 'اولیای گرامی، ' + o.student + ' امروز ' + o.date +
           ' با تأخیر آمد. ' + o.school;
  },
  /* نمره: عدد عمداً نیست. ولی با ورود به سامانه عدد دقیق را می‌بیند. */
  grade: function(o){
    return 'اولیای گرامی، نمرهٔ ' + o.student + ' در ' + (o.subject || 'آزمون') +
           ' پایین بود. جزئیات در سامانه. ' + o.school;
  },
  event: function(o){
    return 'اولیای گرامی، ' + (o.text || '') + ' ' + o.school;
  },
  correction: function(o){
    return 'اصلاحیه: ' + o.student + ' در ' + o.date + ' ' +
           (o.wasAbsent ? 'غایب نبوده است' : 'غایب بوده است') +
           '. پوزش می‌خواهیم. ' + o.school;
  }
};

/** نام کوتاه مدرسه برای امضای پیام */
function notifySchoolName(schoolId){
  var sc = (typeof byId === 'function') ? byId('schools', schoolId) : null;
  return (sc && sc.name) ? sc.name : 'مدرسه';
}

/** ساخت متن پیام از روی نوع و داده */
function notifyBody(kind, o){
  var f = NOTIFY_TPL[kind];
  return f ? f(o) : '';
}

/* ─────────────── بخش ۳: اثرانگشت وضعیت منشأ ─────────────── */

/**
 * اثرانگشت وضعیتی که پیام بر پایه‌اش ساخته شد.
 *
 * چرا لازم است؟ اگر دبیر بعداً وضعیت را عوض کند، باید بفهمیم پیامی
 * که رفته دیگر درست نیست و اصلاحیه بسازیم (گام ۵).
 *
 * ⚠️ هش رمزنگارانه نیست و نباید باشد — فقط برای تشخیص تغییر است،
 * نه امنیت. رشتهٔ ساده هم کافی است و از هزینهٔ محاسبه می‌کاهد.
 */
function notifyHash(kind, ref){
  if(kind === 'absence' || kind === 'late'){
    var a = (typeof byId === 'function') ? byId('attendance', ref) : null;
    if(!a) return 'gone';
    return a.student_id + '|' + a.date + '|' + a.status;
  }
  if(kind === 'grade'){
    var g = (typeof byId === 'function') ? byId('grades', ref) : null;
    if(!g) return 'gone';
    return g.student_id + '|' + g.exam_id + '|' + g.score;
  }
  return String(ref);
}

/* ─────────────── بخش ۴: ساخت درخواست پیام ─────────────── */

/** اولیای یک دانش‌آموز که شمارهٔ معتبر دارند */
function notifyParentsOf(studentId){
  var out = [];
  (db.parent_links || []).forEach(function(l){
    if(l.student_id !== studentId) return;
    var p = byId('users', l.parent_id);
    if(p && /^09\d{9}$/.test(p.phone || '')) out.push(p.id);
  });
  return out;
}

/**
 * ساخت یک درخواست پیام و گذاشتنش در صف.
 *
 * برمی‌گرداند: رکورد صف، یا null اگر ساخته نشد.
 * دلیل نساختن در notifyRequest.lastSkip ثبت می‌شود تا فراخوان
 * بتواند بفهمد چرا — بی‌صدا رد نمی‌شود.
 *
 * ⚠️ این تابع پیام را نمی‌فرستد. حتی در حالت خودکار، ارسال کار
 * notifySend است. جداکردن ساخت از ارسال باعث می‌شود سقف روزانه و
 * اعتبار در یک نقطه سنجیده شوند.
 */
function notifyRequest(o){
  notifyRequest.lastSkip = null;
  var sid = o.school_id;
  var cfg = notifySettings(sid);

  if(!cfg.enabled){ notifyRequest.lastSkip = 'disabled'; return null; }
  if(cfg.kinds[o.kind] === false){ notifyRequest.lastSkip = 'kind-off'; return null; }

  var parents = o.parent_ids || (o.student_id ? notifyParentsOf(o.student_id) : []);
  if(!parents.length){ notifyRequest.lastSkip = 'no-parent'; return null; }

  var body = o.body || notifyBody(o.kind, {
    student: o.student_name || '',
    date:    o.date_fa || '',
    subject: o.subject || '',
    text:    o.text || '',
    wasAbsent: o.wasAbsent,
    school:  notifySchoolName(sid)
  });
  if(!body || body.length < 4){ notifyRequest.lastSkip = 'empty-body'; return null; }

  /* ⚠️ حجم: فیلدهای null ذخیره نمی‌شوند. سنجش دور ۴۲ نشان داد
     رکورد کامل با null‌ها ۴۳۶ بایت است و بدون آن‌ها ۳۶۰ بایت —
     ۱۷٪ صرفه‌جویی، و db همین حالا ۴٫۶۴MB از سقف ۵MB است. */
  var rec = {
    school_id:  sid,
    kind:       o.kind,
    student_id: o.student_id || null,
    class_id:   o.class_id || null,
    parent_ids: parents,
    body:       body,
    parts:      (typeof smsParts === 'function') ? smsParts(body) : 1,
    status:     'pending',
    source_ref: o.source_ref || null,
    source_hash: o.source_ref ? notifyHash(o.kind, o.source_ref) : null,
    /* ⚠️ ISO کامل با ساعت، نه todayISO(). کل مکانیزم پنجرهٔ مهلت
       به این بند است: رکورد attendance مُهر زمان ندارد. */
    created_at: new Date().toISOString(),
    created_by: (typeof S !== 'undefined' && S.user) ? S.user.id : null,
    auto:       cfg.autoSend ? 1 : 0
  };
  if(o.correction_of) rec.correction_of = o.correction_of;

  return insert('notify_queue', rec);
}

/* ─────────────── بخش ۵: لغو درون پنجرهٔ مهلت ─────────────── */

/** اختلاف دقیقه میان یک ISO و اکنون */
function minutesSince(iso){
  if(!iso) return Infinity;
  var t = Date.parse(iso);
  if(isNaN(t)) return Infinity;
  return (Date.now() - t) / 60000;
}

/**
 * لغو خاموش پیام‌های معلقِ یک رکورد منشأ، اگر:
 *   ۱) هنوز pending باشند (رفته باشد دیگر لغو نمی‌شود ⇒ اصلاحیه)
 *   ۲) درون پنجرهٔ مهلت باشند
 *   ۳) همان کسی که ساخته، اصلاح کند
 *
 * ⚠️ هر سه شرط با && — نه ||. اگر فقط شرط زمان بود، مدیر هم
 * می‌توانست بی‌ردپا پیام را محو کند. این پنجره امتیاز دبیر برای
 * اصلاح خطای خودش است، نه ابزار حذف عمومی.
 *
 * برمی‌گرداند: تعداد لغوشده.
 */
function notifyCancelIfFresh(kind, sourceRef, byUserId){
  var cfg = null, n = 0;
  var who = (byUserId !== undefined && byUserId !== null)
    ? byUserId
    : ((typeof S !== 'undefined' && S.user) ? S.user.id : null);

  (db.notify_queue || []).forEach(function(q){
    if(q.status !== 'pending') return;
    if(q.source_ref !== sourceRef) return;
    if(q.kind !== kind) return;
    if(q.created_by !== who) return;              /* شرط ۳ */
    if(!cfg) cfg = notifySettings(q.school_id);
    if(minutesSince(q.created_at) > cfg.graceMinutes) return;  /* شرط ۲ */
    update('notify_queue', q.id, {
      status: 'cancelled',
      decided_at: new Date().toISOString(),
      decided_by: who
    });
    n++;
  });
  return n;
}

/* ─────────────── بخش ۶: ارسال و کسر اعتبار ─────────────── */

/**
 * ارسال یک دسته پیام از صف.
 *
 * ⚠️ اتمی نیست و نمی‌تواند باشد؛ پس ترتیبی عمل می‌کند: هر پیام که
 * اعتبارش هست می‌رود و بقیه در صف pending می‌مانند. هرگز نباید
 * پیامی «گم» شود چون اعتبار وسط کار تمام شد.
 *
 * برمی‌گرداند: {sent, skipped, used, reason}
 */
function notifySend(ids){
  var out = { sent: 0, skipped: 0, used: 0, reason: null };
  if(!ids || !ids.length) return out;

  var first = byId('notify_queue', ids[0]);
  if(!first) return out;
  var sid = first.school_id;
  var wal = smsWalletOf(sid);
  var balance = wal.balance;
  var stamp = new Date().toISOString();
  var me = (typeof S !== 'undefined' && S.user) ? S.user.id : null;

  batchWrites(function(){
    ids.forEach(function(qid){
      var q = byId('notify_queue', qid);
      if(!q || q.status !== 'pending'){ out.skipped++; return; }
      /* هزینه = قطعه × تعداد گیرنده. سنجش دور ۴۲: میانگین ۱٫۰۱ ولی
         برای هر دانش‌آموز، ولی سه دانش‌آموز دو ولی داشتند. */
      var need = q.parts * (q.parent_ids || []).length;
      if(need > balance){
        out.skipped++;
        out.reason = 'no-credit';
        return;                       /* در صف می‌ماند، گم نمی‌شود */
      }
      (q.parent_ids || []).forEach(function(pid){
        var p = byId('users', pid);
        if(!p) return;
        insert('sms_log', {
          school_id: sid, user_id: pid, phone: p.phone, body: q.body,
          parts: q.parts, status: 'sent', created_at: todayISO()
        });
      });
      update('notify_queue', qid, {
        status: 'sent', decided_at: stamp, decided_by: me
      });
      balance -= need;
      out.used += need;
      out.sent++;
    });
    if(out.used > 0) update('sms_wallet', wal.w.id, { balance: balance });
  });
  return out;
}

/** رد کردن پیام‌ها بدون ارسال */
function notifyReject(ids){
  var n = 0, stamp = new Date().toISOString();
  var me = (typeof S !== 'undefined' && S.user) ? S.user.id : null;
  batchWrites(function(){
    (ids || []).forEach(function(qid){
      var q = byId('notify_queue', qid);
      if(!q || q.status !== 'pending') return;
      update('notify_queue', qid, {
        status: 'rejected', decided_at: stamp, decided_by: me
      });
      n++;
    });
  });
  return n;
}

/* ─────────────── بخش ۷: سقف روزانه و برآورد هزینه ─────────────── */

/** شمار قطعه‌های ارسال‌شدهٔ امروز */
function notifySentToday(schoolId){
  var d = todayISO(), n = 0;
  (db.sms_log || []).forEach(function(m){
    if(m.school_id === schoolId && String(m.created_at).slice(0, 10) === d)
      n += Number(m.parts) || 1;
  });
  return n;
}

/**
 * برآورد هزینهٔ یک دسته، پیش از ارسال.
 *
 * ⚠️ سقف روزانه ترمز است نه دیوار: پیام فراتر از سقف رد نمی‌شود،
 * فقط علامت می‌خورد تا مدیر آگاهانه تصمیم بگیرد. اگر روز برفی
 * ۴۰۰ غیبت باشد، دور انداختن ۱۰۰ اطلاع‌رسانی بدتر از تمام‌شدن
 * اعتبار است.
 */
function notifyEstimate(ids){
  var out = { count: 0, parts: 0, balance: 0, after: 0,
              overCap: false, overBulk: false, enough: true };
  if(!ids || !ids.length) return out;
  var first = byId('notify_queue', ids[0]);
  if(!first) return out;
  var sid = first.school_id;
  var cfg = notifySettings(sid);
  var wal = smsWalletOf(sid);

  ids.forEach(function(qid){
    var q = byId('notify_queue', qid);
    if(!q || q.status !== 'pending') return;
    out.count++;
    out.parts += q.parts * (q.parent_ids || []).length;
  });
  out.balance  = wal.balance;
  out.after    = wal.balance - out.parts;
  out.enough   = out.parts <= wal.balance;
  out.overBulk = out.count >= cfg.bulkWarn;
  out.overCap  = (notifySentToday(sid) + out.parts) > cfg.dailyCap;
  return out;
}

/* ─────────────── بخش ۸: پاک‌سازی رکوردهای کهنه ─────────────── */

/**
 * حذف رکوردهای بسته‌شدهٔ کهنه‌تر از N روز.
 *
 * 🔴 چرا لازم است؟ سنجش دور ۴۲: هر رکورد ۴۳۶ بایت (نه ۲۵۰ که
 * برآورد اولیه بود). مدرسهٔ ۵۰۰ نفره با ۵٪ غیبت در یک سال تحصیلی
 * ۴٬۵۰۰ رکورد = ۱٫۸۷MB می‌سازد و db همین حالا ۴٫۶۴MB از سقف ۵MB
 * است. با پاک‌سازی ۳۰ روزه فقط ۳۱۹KB می‌ماند.
 *
 * ⚠️ فقط sent/rejected/cancelled پاک می‌شوند. pending هرگز — پیام
 * تصمیم‌نگرفته نباید بی‌صدا ناپدید شود.
 * ⚠️ خلاصهٔ ارسال‌شده‌ها در sms_log می‌ماند، پس تاریخچه گم نمی‌شود.
 */
var NOTIFY_KEEP_DAYS = 30;

function notifyPurge(days){
  var keep = days || NOTIFY_KEEP_DAYS;
  var cutoff = Date.now() - keep * 86400000;
  var doomed = [];
  (db.notify_queue || []).forEach(function(q){
    if(q.status === 'pending') return;
    var t = Date.parse(q.decided_at || q.created_at);
    if(!isNaN(t) && t < cutoff) doomed.push(q.id);
  });
  if(doomed.length) batchWrites(function(){
    doomed.forEach(function(qid){ remove('notify_queue', qid); });
  });
  return doomed.length;
}

/** صف در انتظار یک مدرسه، تازه‌ترین اول؛ اصلاحیه‌ها بالاتر */
function notifyPending(schoolId){
  var out = (db.notify_queue || []).filter(function(q){
    return q.school_id === schoolId && q.status === 'pending';
  });
  out.sort(function(a, b){
    var ca = a.correction_of ? 1 : 0, cb = b.correction_of ? 1 : 0;
    if(ca !== cb) return cb - ca;               /* اصلاحیه اول */
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return out;
}

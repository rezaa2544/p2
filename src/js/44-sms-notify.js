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
  },
  /* اصلاحیهٔ نمره: عدد را بازگو نمی‌کند؛ فقط می‌گوید اطلاع قبلی
     نادرست بود و جزئیات در سامانه است (همان قاعدهٔ حریم نمره). */
  gradeCorrection: function(o){
    return 'اصلاحیه: اطلاع قبلی دربارهٔ نمرهٔ ' + o.student + ' در ' +
           (o.subject || 'آزمون') + ' نادرست بود. وضعیت دقیق در سامانه. ' +
           'پوزش می‌خواهیم. ' + o.school;
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
    /* ⚠️ فیلدهای واقعی رکورد نمره: subject_id, term, exam_type, score
       (exam_id وجود ندارد). هش باید هر چیزی که در پیام اثر دارد را
       پوشش دهد تا تغییرش اصلاحیه بسازد. */
    return g.student_id + '|' + g.subject_id + '|' + g.term + '|'
         + g.exam_type + '|' + g.score;
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

/* ═══════════════════════════════════════════════════════════════════
   بخش ۹ ▸ صفحهٔ صف پیام‌ها (مدیر)            روت: notifyqueue
   ═══════════════════════════════════════════════════════════════════ */

/** برچسب فارسی و رنگ هر نوع پیام */
var NOTIFY_KIND_FA = {
  absence:    ['غیبت',    'b-red'],
  late:       ['تأخیر',   'b-amber'],
  grade:      ['نمره',    'b-purple'],
  event:      ['رویداد',  'b-blue'],
  correction: ['اصلاحیه', 'b-red']
};

/** برچسب یک رکورد صف؛ اصلاحیه بر نوع اصلی مقدم است */
function notifyKindTag(q){
  var k = q.correction_of ? 'correction' : q.kind;
  var m = NOTIFY_KIND_FA[k] || [k, 'b-gray'];
  return '<span class="badge ' + m[1] + '">' +
         (q.correction_of ? '🔴 ' : '') + esc(m[0]) + '</span>';
}

/** ساعت کوتاه از ISO کامل: «۰۸:۳۱» */
function notifyClock(iso){
  var t = String(iso || '').slice(11, 16);
  return t ? faD(t) : '—';
}

/**
 * نوار هشدار حالت ارسال خودکار.
 *
 * ⚠️ عمداً در renderShell صدا زده می‌شود، نه فقط در این صفحه.
 * مدیری که سراغ صف نمی‌رود، دقیقاً همان کسی است که خودکار را روشن
 * کرده و باید مدام یادآوری شود.
 */
function notifyAutoBanner(){
  if(typeof S === 'undefined' || !S.user) return '';
  var role = (typeof activePersona === 'function') ? activePersona() : S.user.role;
  if(role !== 'manager' && role !== 'superadmin') return '';
  var sid = S.user.school_id;
  if(!sid) return '';
  var cfg = notifySettings(sid);
  if(!cfg.enabled || !cfg.autoSend) return '';
  return '<div class="notify-auto-bar">⚠️ حالت ارسال خودکار پیامک فعال است — ' +
         'پیام‌ها بدون تأیید شما برای اولیا ارسال می‌شوند.' +
         '<button class="btn sm ghost" data-act="notify-auto-off">خاموش کردن</button></div>';
}

/**
 * نوار هشدار «سقف روزانه پر شده».
 *
 * 🔴 چرا لازم است؟ در حالت خودکار وقتی سقف پر می‌شود، پیام‌ها
 * `pending` می‌مانند و فردا خودکار می‌روند — گم نمی‌شوند. ولی
 * مدیر هیچ نشانی نمی‌دید که «۴ خانواده امشب بی‌خبر می‌مانند».
 * سنجش دور ۴۲ این شکاف را نشان داد.
 */
function notifyCapBanner(sid){
  var cfg = notifySettings(sid);
  if(!cfg.enabled) return '';
  var today = notifySentToday(sid);
  var cap   = Number(cfg.dailyCap) || 0;
  if(today < cap) return '';
  var stuck = notifyPending(sid).filter(function(q){ return q.auto; }).length;
  return '<div class="notify-cap-bar">'
    + '<b>⛔ سقف روزانهٔ پیامک پر شد</b> ('
    + fa(today) + ' از ' + fa(cap) + ' قطعه)'
    + (stuck ? ' — <b>' + fa(stuck) + ' پیام</b> تا فردا منتظر می‌مانند.' : '')
    + '<div class="small">پیام‌ها حذف نمی‌شوند؛ فردا خودکار ارسال می‌شوند. '
    + 'برای ارسال همین امروز، سقف را در تنظیمات بالا ببرید یا دستی تأیید کنید.</div>'
    + '</div>';
}

/** کارت برآورد هزینه بالای صفحه */
function notifyCostCard(sid, pend){
  var wal  = smsWalletOf(sid);
  var cfg  = notifySettings(sid);
  var today = notifySentToday(sid);
  var need = 0;
  pend.forEach(function(q){ need += q.parts * (q.parent_ids || []).length; });
  var capPct = Math.min(100, (today / (cfg.dailyCap || 1)) * 100);
  return '<div class="card"><div class="card-body notify-cost">'
    + '<div><span class="small muted">موجودی کیف</span><b>' + fa(wal.balance) + ' قطعه</b></div>'
    + '<div><span class="small muted">نیاز صف</span><b>' + fa(need) + ' قطعه</b></div>'
    + '<div><span class="small muted">امروز ارسال شد</span><b>' + fa(today)
    +   ' از ' + fa(cfg.dailyCap) + '</b>' + bar(today, cfg.dailyCap,
        capPct >= 100 ? 'var(--red)' : 'var(--primary)') + '</div>'
    + '<div><span class="small muted">پس از ارسال</span><b'
    +   (wal.balance - need < 0 ? ' style="color:var(--red)"' : '') + '>'
    +   fa(wal.balance - need) + ' قطعه</b></div>'
    + '</div></div>';
}

/**
 * صفحهٔ صف پیام‌های اولیا.
 *
 * ⚠️ همهٔ متن‌های برخاسته از ورودی کاربر (نام دانش‌آموز داخل body)
 * از esc() می‌گذرند. body متن پیامک است و مدیر می‌تواند ویرایشش
 * کند ⇒ کاملاً ورودی کاربر است.
 */
function viewNotifyQueue(){
  var sid = S.user.school_id;
  var cfg = notifySettings(sid);

  if(!cfg.enabled){
    return '<div class="page-head"><h2>📨 صف پیام‌های اولیا</h2></div>'
      + notifyAutoBanner()
      + empty('🔕', 'اطلاع‌رسانی پیامکی خاموش است',
              'برای ارسال خودکار پیام غیبت و رویداد به اولیا، این قابلیت را روشن کنید.',
              '<button class="btn" data-act="notify-settings">تنظیمات اطلاع‌رسانی</button>');
  }

  var all  = notifyPending(sid);
  var f    = S.filters.nkind || '';
  var pend = f ? all.filter(function(q){
    return f === 'correction' ? !!q.correction_of : (q.kind === f && !q.correction_of);
  }) : all;

  /* شمار هر دسته برای دکمه‌های فیلتر */
  var cnt = { absence:0, late:0, grade:0, event:0, correction:0 };
  all.forEach(function(q){
    if(q.correction_of) cnt.correction++;
    else if(cnt[q.kind] !== undefined) cnt[q.kind]++;
  });

  var chips = ['<button class="chip' + (f ? '' : ' on') +
               '" data-act="notify-filter" data-k="">همه ' + fa(all.length) + '</button>'];
  Object.keys(cnt).forEach(function(k){
    if(!cnt[k]) return;
    chips.push('<button class="chip' + (f === k ? ' on' : '') +
      '" data-act="notify-filter" data-k="' + escAttr(k) + '">' +
      (k === 'correction' ? '🔴 ' : '') + esc(NOTIFY_KIND_FA[k][0]) + ' ' + fa(cnt[k]) + '</button>');
  });

  var head = '<div class="page-head"><h2>📨 صف پیام‌های اولیا</h2>'
    + '<div class="row">'
    + '<button class="btn ghost sm" data-act="notify-settings">⚙️ تنظیمات</button>'
    + '<button class="btn ghost sm" data-act="go" data-r="formssms">📊 دفتر پیامک</button>'
    + '</div></div>';

  if(!all.length){
    return head + notifyAutoBanner() + notifyCapBanner(sid) + notifyCostCard(sid, [])
      + empty('✅', 'صف خالی است',
              cfg.autoSend
                ? 'حالت خودکار فعال است و پیام‌ها مستقیم ارسال می‌شوند.'
                : 'هیچ پیامی در انتظار تأیید شما نیست.');
  }

  var rows = pend.map(function(q){
    var st = q.student_id ? byId('users', q.student_id) : null;
    var cl = q.class_id ? byId('classes', q.class_id) : null;
    return '<tr>'
      + '<td><input type="checkbox" class="nq-pick" value="' + q.id + '"></td>'
      + '<td>' + notifyKindTag(q) + '</td>'
      + '<td>' + esc(st ? st.full_name : '—') + '</td>'
      + '<td class="small muted">' + esc(cl ? cl.name : '—') + '</td>'
      + '<td class="small muted">' + notifyClock(q.created_at) + '</td>'
      + '<td class="small">' + fa(q.parts) + '×' + fa((q.parent_ids || []).length) + '</td>'
      + '<td class="nq-body small">' + esc(q.body) + '</td>'
      + '<td class="row nowrap">'
      +   '<button class="btn ghost sm" data-act="notify-edit" data-id="' + q.id + '">✏️</button>'
      +   '<button class="btn sm" data-act="notify-approve" data-id="' + q.id + '">✓</button>'
      +   '<button class="btn danger sm" data-act="notify-reject" data-id="' + q.id + '">✗</button>'
      + '</td></tr>';
  }).join('');

  return head
    + notifyAutoBanner()
    + notifyCapBanner(sid)
    + notifyCostCard(sid, all)
    + '<div class="chips">' + chips.join('') + '</div>'
    + '<div class="card"><div class="table-wrap"><table class="table">'
    + '<thead><tr>'
    +   '<th><input type="checkbox" id="nq-all" data-act="notify-pick-all"></th>'
    +   '<th>نوع</th><th>دانش‌آموز</th><th>کلاس</th><th>ساعت</th><th>قطعه</th>'
    +   '<th>متن پیام</th><th>اقدام</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div class="card-foot row">'
    +   '<button class="btn" data-act="notify-approve-sel">✓ تأیید و ارسال انتخاب‌شده‌ها</button>'
    +   '<button class="btn danger ghost" data-act="notify-reject-sel">✗ رد انتخاب‌شده‌ها</button>'
    +   '<span class="small muted">' + fa(pend.length) + ' پیام در نمای فعلی</span>'
    + '</div></div>';
}

/** شناسه‌های انتخاب‌شده در جدول */
function notifyPicked(){
  return $$('.nq-pick:checked').map(function(x){ return Number(x.value); });
}

/**
 * گزارش روزانهٔ پیام‌های خودکار — کارت داشبورد مدیر.
 * پس‌رصد است نه پیش‌تأیید: مدیری که خودکار را روشن کرده باید
 * دست‌کم بداند چه رفته.
 */
function notifyDailyCard(){
  if(typeof S === 'undefined' || !S.user || !S.user.school_id) return '';
  var sid = S.user.school_id;
  var cfg = notifySettings(sid);
  if(!cfg.enabled) return '';
  var d = todayISO(), n = 0, auto = 0;
  (db.notify_queue || []).forEach(function(q){
    if(q.school_id !== sid || q.status !== 'sent') return;
    if(String(q.decided_at || '').slice(0, 10) !== d) return;
    n++; if(q.auto) auto++;
  });
  var pend = notifyPending(sid).length;
  return '<div class="card"><div class="card-head"><h3>📨 اطلاع‌رسانی امروز</h3>'
    + '<button class="btn ghost sm" data-act="go" data-r="notifyqueue">مدیریت صف</button></div>'
    + '<div class="card-body notify-daily">'
    +   '<div><b>' + fa(n) + '</b><span class="small muted">پیام ارسال‌شده</span></div>'
    +   '<div><b>' + fa(auto) + '</b><span class="small muted">خودکار</span></div>'
    +   '<div><b' + (pend ? ' style="color:var(--amber)"' : '') + '>' + fa(pend)
    +     '</b><span class="small muted">'
    +     (cfg.autoSend ? 'منتظر ارسال' : 'در انتظار تأیید') + '</span></div>'
    + '</div>'
    /* ⚠️ اگر سقف پر است، مدیر باید همین‌جا بفهمد — نه اینکه تصادفی
       سراغ صفحهٔ صف برود. */
    + (notifySentToday(sid) >= (Number(cfg.dailyCap) || 0)
        ? '<div class="card-foot small" style="color:var(--red)">'
          + '⛔ سقف روزانه پر شده — پیام‌های باقی‌مانده فردا ارسال می‌شوند.</div>'
        : '')
    + '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   بخش ۱۰ ▸ پیش‌نویس حضور و غیاب (گام ۳)
   ═══════════════════════════════════════════════════════════════════
   چرا پیش‌نویس؟ پیش از این هر تیک بلافاصله ذخیره می‌شد. حالا که
   غیبت به خانواده پیامک می‌شود، تیک اشتباه هزینه دارد. پس تیک‌ها
   جمع می‌شوند و با یک «تأیید و ثبت» یک‌جا نوشته می‌شوند.

   ⚠️ پیش‌نویس در Store است نه فقط S — اگر دبیر وسط کار به کلاس
   دیگر برود و برگردد، یا مرورگر بسته شود، کارش نباید گم شود.
   کلید شامل کاربر + کلاس + تاریخ است تا پیش‌نویس‌ها با هم قاطی
   نشوند.
   ═══════════════════════════════════════════════════════════════════ */

var ATT_DRAFT_KEY = 'sms_att_draft_v1';

/** کلید یکتای هر پیش‌نویس: کاربر | کلاس | تاریخ */
function attDraftKey(cid, date){
  var uid = (typeof S !== 'undefined' && S.user) ? S.user.id : 0;
  return uid + '|' + cid + '|' + date;
}

/** همهٔ پیش‌نویس‌های ذخیره‌شده */
function attDraftAll(){
  return Store.getJSON(ATT_DRAFT_KEY, {}) || {};
}

/** پیش‌نویس یک کلاس و روز: نگاشت student_id → status */
function attDraftGet(cid, date){
  var all = attDraftAll();
  var d = all[attDraftKey(cid, date)];
  return (d && d.marks) ? d.marks : {};
}

/**
 * ثبت یک تیک در پیش‌نویس.
 * زدن دوبارهٔ همان وضعیت آن را برمی‌دارد (کلید رفت‌وبرگشتی).
 */
function attDraftSet(cid, date, studentId, status){
  var all = attDraftAll();
  var k = attDraftKey(cid, date);
  var d = all[k] || { marks: {}, at: new Date().toISOString() };
  if(d.marks[studentId] === status) delete d.marks[studentId];
  else d.marks[studentId] = status;
  d.at = new Date().toISOString();
  if(Object.keys(d.marks).length) all[k] = d;
  else delete all[k];                    /* پیش‌نویس خالی نگه‌داشتن ندارد */
  Store.setJSON(ATT_DRAFT_KEY, all);
  return d.marks;
}

/** ثبت وضعیت یکسان برای فهرستی از دانش‌آموزان (دکمهٔ «همه …») */
function attDraftSetAll(cid, date, ids, status){
  var all = attDraftAll();
  var k = attDraftKey(cid, date);
  var d = all[k] || { marks: {}, at: new Date().toISOString() };
  ids.forEach(function(id){ d.marks[id] = status; });
  d.at = new Date().toISOString();
  all[k] = d;
  Store.setJSON(ATT_DRAFT_KEY, all);
  return d.marks;
}

/** پاک کردن پیش‌نویس یک کلاس و روز */
function attDraftClear(cid, date){
  var all = attDraftAll();
  delete all[attDraftKey(cid, date)];
  Store.setJSON(ATT_DRAFT_KEY, all);
}

/**
 * پاک‌سازی پیش‌نویس‌های رهاشده.
 * ⚠️ پیش‌نویس نیمه‌کاره‌ای که دبیر فراموشش کرده نباید تا ابد در
 * حافظهٔ مرورگر بماند؛ سقف حافظه ~۵MB است.
 */
function attDraftPurge(days){
  var keep = days || 7;
  var cutoff = Date.now() - keep * 86400000;
  var all = attDraftAll(), n = 0;
  Object.keys(all).forEach(function(k){
    var t = Date.parse(all[k] && all[k].at);
    if(isNaN(t) || t < cutoff){ delete all[k]; n++; }
  });
  if(n) Store.setJSON(ATT_DRAFT_KEY, all);
  return n;
}

/**
 * تفاوت پیش‌نویس با آنچه در پایگاه داده است.
 * خروجی: {changes:[{student_id,name,from,to}], counts:{...}, newAbsent:[…]}
 *
 * ⚠️ فقط تفاوت‌های واقعی برمی‌گردند. اگر دبیر روی «حاضر» بزند و
 * از قبل هم «حاضر» بوده، تغییری نیست و نباید در مرور نهایی
 * شمرده شود — وگرنه «۳۰ تغییر» نشان می‌دهد که ۲۷تایش هیچ است.
 */
function attDraftDiff(cid, date){
  var marks = attDraftGet(cid, date);
  var out = { changes: [], counts: {}, newAbsent: [], newLate: [] };
  var am = (typeof idxAttByClassDate === 'function') ? idxAttByClassDate() : null;
  var day = new Map();
  if(am) (am.get(cid + '|' + date) || []).forEach(function(a){ day.set(a.student_id, a); });

  Object.keys(marks).forEach(function(sid){
    var id = Number(sid);
    var cur = am ? day.get(id)
                 : db.attendance.find(function(a){ return a.student_id === id && a.date === date; });
    var to = marks[sid];
    var from = cur ? cur.status : null;
    if(from === to) return;                       /* بی‌تغییر */
    var u = byId('users', id);
    out.changes.push({ student_id: id, name: u ? u.full_name : '—',
                       from: from, to: to, rec_id: cur ? cur.id : null });
    out.counts[to] = (out.counts[to] || 0) + 1;
    if(to === 'absent') out.newAbsent.push(u ? u.full_name : '—');
    if(to === 'late')   out.newLate.push(u ? u.full_name : '—');
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   بخش ۱۱ ▸ اصلاحیهٔ خودکار (گام ۵)
   ═══════════════════════════════════════════════════════════════════
   مسئله: پیامی رفته و بعد معلوم شده اشتباه بوده. خانواده نباید با
   اطلاع غلط بماند.

   ⚠️ چرا «آخرین پیام ارسال‌شده» مبنا است نه «پیام اصلی»؟
   اگر دبیر غایب→حاضر→غایب کند، خانواده دو پیام گرفته: «غایب بود»
   و «اصلاحیه: غایب نبوده». حالا که دوباره غایب شده، باید بداند.
   اگر فقط با پیام اصلی می‌سنجیدیم، وضعیت فعلی با آن یکی بود و
   هیچ اصلاحیه‌ای ساخته نمی‌شد — و خانواده با آخرین اطلاعِ غلط
   («غایب نبوده») می‌ماند.

   ⚠️ سه دامی که در طراحی لحاظ شده‌اند:
   ۱. حلقهٔ بی‌نهایت — اصلاحیه خودش موضوع اصلاحیهٔ بعدی نمی‌شود
      (رکوردهای دارای correction_of از سنجش کنار می‌مانند، ولی
      hash‌شان به‌روز نگه داشته می‌شود).
   ۲. رفت‌وبرگشت — اگر وضعیت به همان چیزی برگردد که خانواده
      می‌داند، اصلاحیهٔ معلق لغو می‌شود، نه اینکه دو پیام برود.
   ۳. پیام معلق — تا وقتی پیام نرفته، اصلاحیه بی‌معناست؛ همان
      پیام معلق باید به‌روز یا لغو شود (کار notifyCancelIfFresh).
   ═══════════════════════════════════════════════════════════════════ */

/**
 * آخرین پیامی که واقعاً برای این رکورد منشأ ارسال شده.
 * یعنی «خانواده در این لحظه چه می‌داند».
 */
function notifyLastSent(kind, sourceRef){
  var best = null;
  (db.notify_queue || []).forEach(function(q){
    if(q.status !== 'sent') return;
    if(q.source_ref !== sourceRef) return;
    if(q.kind !== kind && !q.correction_of) return;
    if(!best) { best = q; return; }
    /* تازه‌ترین بر پایهٔ زمان تصمیم؛ در تساوی شناسهٔ بزرگ‌تر */
    var a = String(q.decided_at || q.created_at);
    var b = String(best.decided_at || best.created_at);
    if(a > b || (a === b && q.id > best.id)) best = q;
  });
  return best;
}

/** آیا برای این رکورد اصلاحیهٔ معلقی در صف هست؟ */
function notifyPendingCorrection(sourceRef){
  var out = null;
  (db.notify_queue || []).forEach(function(q){
    if(q.status !== 'pending' || !q.correction_of) return;
    if(q.source_ref !== sourceRef) return;
    if(!out || q.id > out.id) out = q;
  });
  return out;
}

/**
 * وارسی یک رکورد حضور و غیاب و ساخت اصلاحیه در صورت نیاز.
 *
 * برمی‌گرداند: {action, queue}
 *   action = 'none'      هیچ پیام ارسال‌شده‌ای نیست، یا وضعیت همان است
 *          | 'created'   اصلاحیه ساخته شد
 *          | 'cancelled' وضعیت برگشت؛ اصلاحیهٔ معلق لغو شد
 *          | 'updated'   اصلاحیهٔ معلق با متن تازه به‌روز شد
 *
 * ⚠️ این تابع نباید پیام بفرستد. ساخت و ارسال جدا می‌مانند تا
 * سقف روزانه و اعتبار در یک نقطه سنجیده شوند (همان قاعدهٔ گام ۱).
 */
function notifyReconcile(attId){
  var out = { action: 'none', queue: null };
  var rec = byId('attendance', attId);

  /* دو نوع پیام ممکن است برای یک رکورد رفته باشد */
  var kinds = ['absence', 'late'];
  var last = null;
  for(var i = 0; i < kinds.length; i++){
    var c = notifyLastSent(kinds[i], attId);
    if(c && (!last || String(c.decided_at || '') > String(last.decided_at || ''))) last = c;
  }
  if(!last) return out;                    /* چیزی نرفته ⇒ اصلاحیه بی‌معناست */

  var cfg = notifySettings(last.school_id);
  var curHash = notifyHash(last.correction_of ? (last.kind || 'absence') : last.kind, attId);

  /* «خانواده چه می‌داند» = هش لحظهٔ ارسال آخرین پیام */
  if(last.source_hash === curHash){
    /* وضعیت همان است که خانواده می‌داند.
       ⚠️ دام رفت‌وبرگشت: اگر اصلاحیهٔ معلقی هست، دیگر لازم نیست. */
    var stale = notifyPendingCorrection(attId);
    if(stale){
      update('notify_queue', stale.id, {
        status: 'cancelled',
        decided_at: new Date().toISOString()
      });
      out.action = 'cancelled';
      out.queue = stale;
    }
    return out;
  }

  /* وضعیت با آنچه خانواده می‌داند فرق دارد ⇒ اصلاحیه لازم است */
  var st = rec ? byId('users', rec.student_id) : byId('users', last.student_id);
  var nowAbsent = !!(rec && (rec.status === 'absent' || rec.status === 'late'));

  var body = notifyBody('correction', {
    student: st ? st.full_name : '—',
    date: rec ? jalali(rec.date) : '',
    /* wasAbsent=true یعنی «غایب نبوده است» */
    wasAbsent: !nowAbsent,
    school: notifySchoolName(last.school_id)
  });

  /* اگر اصلاحیهٔ معلقی هست، به‌جای ساخت دومی به‌روزش می‌کنیم —
     وگرنه صف مدیر پر از اصلاحیه‌های متناقض می‌شود. */
  var pend = notifyPendingCorrection(attId);
  if(pend){
    update('notify_queue', pend.id, {
      body: body,
      parts: smsParts(body),
      source_hash: curHash,
      created_at: new Date().toISOString()
    });
    out.action = 'updated';
    out.queue = byId('notify_queue', pend.id);
    return out;
  }

  if(!cfg.enabled) return out;

  var parents = last.parent_ids && last.parent_ids.length
    ? last.parent_ids
    : notifyParentsOf(last.student_id);
  if(!parents.length) return out;

  var q = insert('notify_queue', {
    school_id:  last.school_id,
    kind:       last.correction_of ? (last.kind || 'absence') : last.kind,
    student_id: last.student_id,
    class_id:   last.class_id || null,
    parent_ids: parents,
    body:       body,
    parts:      smsParts(body),
    status:     'pending',
    source_ref: attId,
    source_hash: curHash,
    created_at: new Date().toISOString(),
    created_by: (typeof S !== 'undefined' && S.user) ? S.user.id : null,
    auto:       cfg.autoSend ? 1 : 0,
    /* 🔴 نشان اصلاحیه — همین فیلد جلوی حلقهٔ بی‌نهایت را می‌گیرد */
    correction_of: last.id
  });
  out.action = 'created';
  out.queue = q;
  return out;
}

/**
 * وارسی دسته‌ای پس از ثبت گروهی حضور و غیاب.
 * برمی‌گرداند: {created, cancelled, updated}
 */
function notifyReconcileMany(attIds){
  var out = { created: 0, cancelled: 0, updated: 0 };
  (attIds || []).forEach(function(id){
    var r = notifyReconcile(id);
    if(r.action === 'created')   out.created++;
    if(r.action === 'cancelled') out.cancelled++;
    if(r.action === 'updated')   out.updated++;
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   بخش ۱۲ ▸ نمره (گام ۷، دور ۴۲)
   ═══════════════════════════════════════════════════════════════════
   نمرهٔ زیر آستانه (gradeThreshold، پیش‌فرض ۱۰) برای اولیا پیامک
   می‌شود. الگوی غیبت تکرار می‌شود ولی ساده‌تر، چون عدد نمره عمداً
   در پیام نیست:

   • تا وقتی نمره زیر آستانه بماند، پیام اول درست است و اصلاحیه
     لازم نیست — حتی اگر عدد عوض شود (خانواده عدد را نمی‌داند).
   • فقط وقتی نمره از «زیر آستانه» به «بالای آستانه» می‌رود و
     پیامش قبلاً رفته، خانواده باید اصلاحیه بگیرد.
   • پیام معلق که هنوز نرفته، کار پنجرهٔ مهلت است نه اصلاحیه.

   ⚠️ توابع این بخش «بر پایهٔ kind» فیلتر می‌کنند تا شناسهٔ تکراری
   بین مجموعه‌ها (attendance و grades شمارندهٔ جدا دارند) موجب
   قاطی‌شدن پیام حضور و نمره نشود.
   ═══════════════════════════════════════════════════════════════════ */

/** آخرین پیام نمره‌ای که واقعاً ارسال شده (شامل اصلاحیه‌ها) */
function notifyGradeLastSent(gradeId){
  var best = null;
  (db.notify_queue || []).forEach(function(q){
    if(q.status !== 'sent') return;
    if(q.source_ref !== gradeId || q.kind !== 'grade') return;
    if(!best){ best = q; return; }
    var a = String(q.decided_at || q.created_at);
    var b = String(best.decided_at || best.created_at);
    if(a > b || (a === b && q.id > best.id)) best = q;
  });
  return best;
}

/** آیا پیام نمرهٔ معلق (غیر اصلاحیه) برای این رکورد در صف هست؟ */
function notifyPendingGrade(gradeId){
  var out = null;
  (db.notify_queue || []).forEach(function(q){
    if(q.status !== 'pending' || q.correction_of) return;
    if(q.kind !== 'grade' || q.source_ref !== gradeId) return;
    if(!out || q.id > out.id) out = q;
  });
  return out;
}

/** آیا اصلاحیهٔ معلقی برای این نمره در صف هست؟ */
function notifyPendingGradeCorrection(gradeId){
  var out = null;
  (db.notify_queue || []).forEach(function(q){
    if(q.status !== 'pending' || !q.correction_of) return;
    if(q.kind !== 'grade' || q.source_ref !== gradeId) return;
    if(!out || q.id > out.id) out = q;
  });
  return out;
}

/** لغو همهٔ پیام‌های معلق نمرهٔ یک رکورد — برای حذف نمره */
function notifyGradeCancel(gradeId){
  var n = 0, stamp = new Date().toISOString();
  var me = (typeof S !== 'undefined' && S.user) ? S.user.id : null;
  batchWrites(function(){
    (db.notify_queue || []).forEach(function(q){
      if(q.status !== 'pending' || q.correction_of) return;
      if(q.kind !== 'grade' || q.source_ref !== gradeId) return;
      update('notify_queue', q.id, {
        status: 'cancelled', decided_at: stamp, decided_by: me
      });
      n++;
    });
  });
  return n;
}

/**
 * ساخت یا به‌روزرسانی اصلاحیهٔ نمره — وقتی پیام رفته و نمره دیگر
 * زیر آستانه نیست. برمی‌گرداند: 'created' | 'updated' | 'none'.
 */
function notifyGradeCorrection(g, last, cfg){
  var st  = byId('users', g.student_id);
  var sub = byId('subjects', g.subject_id);
  var curHash = notifyHash('grade', g.id);
  var body = notifyBody('gradeCorrection', {
    student: st ? st.full_name : '—',
    subject: sub ? sub.name : '',
    school:  notifySchoolName(last.school_id)
  });

  /* اصلاحیهٔ معلق موجود؟ به‌روزرسانی، نه ساخت دومی */
  var pend = notifyPendingGradeCorrection(g.id);
  if(pend){
    update('notify_queue', pend.id, {
      body: body, parts: smsParts(body),
      source_hash: curHash, created_at: new Date().toISOString()
    });
    return 'updated';
  }

  if(!cfg.enabled) return 'none';
  var parents = last.parent_ids && last.parent_ids.length
    ? last.parent_ids
    : notifyParentsOf(last.student_id);
  if(!parents.length) return 'none';

  insert('notify_queue', {
    school_id:  last.school_id,
    kind:       'grade',
    student_id: last.student_id,
    class_id:   last.class_id || null,
    parent_ids: parents,
    body:       body,
    parts:      smsParts(body),
    status:     'pending',
    source_ref: g.id,
    source_hash: curHash,
    created_at: new Date().toISOString(),
    created_by: (typeof S !== 'undefined' && S.user) ? S.user.id : null,
    auto:       cfg.autoSend ? 1 : 0,
    /* 🔴 نشان اصلاحیه — جلوی حلقهٔ بی‌نهایت */
    correction_of: last.id
  });
  return 'created';
}

/**
 * همگام‌سازی پیامک یک رکورد نمره با وضعیتش.
 * از `grade-save` پس از نوشتن صدا زده می‌شود (source_ref = شناسهٔ
 * واقعی رکورد، همان قاعدهٔ att-commit).
 *
 * برمی‌گرداند: {made, cancelled, fixed, skip}
 *   made      = پیام تازه ساخته شد
 *   cancelled = پیام معلق لغو شد
 *   fixed     = اصلاحیه ساخته/به‌روزرسانی شد
 *   skip      = دلیل نساختن (null یعنی موردی نبود)
 */
function notifyGradeSync(gradeId){
  var out = { made: 0, cancelled: 0, fixed: 0, skip: null };
  var g = byId('grades', gradeId);
  if(!g){
    /* رکورد حذف شده ⇒ پیام معلقش بی‌معناست */
    out.cancelled = notifyGradeCancel(gradeId);
    out.skip = 'gone';
    return out;
  }
  var cfg = notifySettings(g.school_id);
  if(!cfg.enabled){ out.skip = 'disabled'; return out; }
  if(cfg.kinds.grade === false){ out.skip = 'kind-off'; return out; }

  var low  = Number(g.score) < Number(cfg.gradeThreshold);
  var last = notifyGradeLastSent(gradeId);

  if(!last){
    /* هنوز چیزی برای این نمره ارسال نشده */
    if(!low){
      /* زیر آستانه نیست؛ پیام معلقِ احتمالی (خطای دبیر) لغو شود */
      out.cancelled = notifyCancelIfFresh('grade', gradeId);
      out.skip = 'not-low';
      return out;
    }
    /* تکراری نساز: پیام معلقِ همین رکورد موجود است */
    if(notifyPendingGrade(gradeId)){ out.skip = 'pending-exists'; return out; }
    var st  = byId('users', g.student_id);
    var sub = byId('subjects', g.subject_id);
    var q = notifyRequest({
      school_id:    g.school_id,
      kind:         'grade',
      student_id:   g.student_id,
      class_id:     g.class_id,
      student_name: st ? st.full_name : '',
      subject:      sub ? sub.name : '',
      source_ref:   gradeId
    });
    if(q) out.made = 1; else out.skip = notifyRequest.lastSkip;
    return out;
  }

  /* پیامی قبلاً رفته — «خانواده چه می‌داند» با وضعیت فعلی بسنج */
  var curHash = notifyHash('grade', gradeId);
  if(last.source_hash === curHash){
    /* همان که خانواده می‌داند؛ اصلاحیهٔ معلقِ کهنه را لغو کن */
    var stale = notifyPendingGradeCorrection(gradeId);
    if(stale){
      update('notify_queue', stale.id, {
        status: 'cancelled', decided_at: new Date().toISOString()
      });
      out.cancelled = 1;
    }
    return out;
  }

  if(low){
    /* هنوز زیر آستانه است — عدد در پیام نبوده، پس پیام اول درست
       است. فقط اصلاحیهٔ معلقِ نوسان قبلی را لغو کن. */
    var stale2 = notifyPendingGradeCorrection(gradeId);
    if(stale2){
      update('notify_queue', stale2.id, {
        status: 'cancelled', decided_at: new Date().toISOString()
      });
      out.cancelled = 1;
    }
    return out;
  }

  /* نمره از زیر آستانه بالا رفته ⇒ اطلاع قبلی نادرست شده است */
  var r = notifyGradeCorrection(g, last, cfg);
  if(r === 'created' || r === 'updated') out.fixed = 1;
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   بخش ۱۳ ▸ رویداد (گام ۷، دور ۴۲)
   ═══════════════════════════════════════════════════════════════════
   رویداد تازهٔ تقویم آموزشی (kind='event') برای اولیای همهٔ
   دانش‌آموزان پیامک می‌سازد — یک رکورد صف به‌ازای هر دانش‌آموزِ
   دارای ولی، تا مدیر در صف دانش‌آموز و کلاس هر ردیف را ببیند.

   ⚠️ کارایی: همهٔ درج‌ها داخل یک batchWrites انجام می‌شود. سنجش
   گام ۷: بدون دسته‌بندی، هر insert جداگانه saveLog می‌کرد
   (JSON.stringify کل دفترچهٔ تغییرات) ⇒ ۱۶۳ms برای ~۵۲۰ دانش‌آموز؛
   با batchWrites فقط یک بار ذخیره ⇒ ۱۶ms.
   ═══════════════════════════════════════════════════════════════════ */
function notifyEvent(schoolId, text, opts){
  opts = opts || {};
  var out = { made: 0, skip: null };
  var cfg = notifySettings(schoolId);
  if(!cfg.enabled){ out.skip = 'disabled'; return out; }
  if(cfg.kinds.event === false){ out.skip = 'kind-off'; return out; }
  var t = String(text || '').trim();
  if(t.length < 4){ out.skip = 'empty-body'; return out; }

  var body  = notifyBody('event', { text: t, school: notifySchoolName(schoolId) });
  var parts = (typeof smsParts === 'function') ? smsParts(body) : 1;
  var by    = (typeof S !== 'undefined' && S.user) ? S.user.id : null;
  var stamp = new Date().toISOString();

  batchWrites(function(){
    (db.users || []).forEach(function(u){
      if(u.role !== 'student' || u.school_id !== schoolId) return;
      var parents = notifyParentsOf(u.id);
      if(!parents.length) return;
      var rec = {
        school_id:  schoolId,
        kind:       'event',
        student_id: u.id,
        parent_ids: parents,
        body:       body,
        parts:      parts,
        status:     'pending',
        created_at: stamp,
        created_by: by,
        auto:       cfg.autoSend ? 1 : 0
      };
      var cl = (typeof classOf === 'function') ? classOf(u.id) : null;
      if(cl && cl.id) rec.class_id = cl.id;
      if(opts.source_ref) rec.source_ref = opts.source_ref;
      insert('notify_queue', rec);
      out.made++;
    });
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   بخش ۱۳ ▸ ارسال خودکار (گام ۶)
   ═══════════════════════════════════════════════════════════════════
   تا پیش از این، `autoSend` فقط رکورد را با `auto:1` برچسب می‌زد و
   پیام همچنان منتظر تأیید دستی می‌ماند — یعنی وعده‌ای که به مدیر
   داده شده بود («وقتی وقت سر زدن ندارم خودکار برود») عمل نمی‌شد.

   ⚠️ چرا بلافاصله نمی‌فرستیم؟ اگر پیام همان لحظهٔ ساخت برود،
   پنجرهٔ مهلت اصلاح دبیر (بخش ۵) بی‌معنا می‌شود: دبیر ۳۰ ثانیه بعد
   خطایش را می‌فهمد ولی پیام رفته و باید اصلاحیه برود. پس ارسال
   خودکار هم **پس از پایان پنجرهٔ مهلت** انجام می‌شود.

   ⚠️ چرا زمان‌سنج (setInterval) نگذاشتیم؟ برنامه تک‌فایلی و آفلاین
   است؛ ممکن است ساعت‌ها بسته باشد. به‌جای زمان‌سنج، هر بار که
   برنامه رندر می‌شود صف وارسی می‌شود (`notifyAutoFlush`). این هم
   ساده‌تر است هم در حالت آفلاین درست کار می‌کند.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * پیام‌های آمادهٔ ارسال خودکار یک مدرسه.
 * «آماده» یعنی: معلق · نشان‌دار `auto` · پنجرهٔ مهلتش تمام شده.
 */
function notifyAutoDue(schoolId){
  var cfg = notifySettings(schoolId);
  if(!cfg.enabled || !cfg.autoSend) return [];
  var out = [];
  (db.notify_queue || []).forEach(function(q){
    if(q.school_id !== schoolId) return;
    if(q.status !== 'pending') return;
    if(!q.auto) return;                       /* پیش از روشن‌شدن ساخته شده */
    if(minutesSince(q.created_at) < cfg.graceMinutes) return;
    out.push(q.id);
  });
  return out;
}

/**
 * ارسال خودکار پیام‌های سررسیده.
 *
 * برمی‌گرداند: {sent, used, skipped, reason} — همان قرارداد notifySend.
 *
 * ⚠️ سقف روزانه اینجا **دیوار** است نه ترمز، برخلاف مسیر دستی.
 * دلیل: در مسیر دستی مدیر آگاهانه تصمیم می‌گیرد از سقف رد شود؛
 * در حالت خودکار کسی نیست که تصمیم بگیرد، پس نباید بی‌اجازه
 * اعتبار مدرسه را تمام کند. پیام‌ها معلق می‌مانند تا مدیر ببیند.
 */
function notifyAutoFlush(schoolId){
  var out = { sent: 0, used: 0, skipped: 0, reason: null };
  var ids = notifyAutoDue(schoolId);
  if(!ids.length) return out;

  var cfg = notifySettings(schoolId);
  var today = notifySentToday(schoolId);
  var room = (Number(cfg.dailyCap) || 0) - today;
  if(room <= 0){
    out.skipped = ids.length;
    out.reason = 'daily-cap';
    return out;
  }

  /* تا جایی که سقف اجازه می‌دهد، به ترتیب قدیمی‌ترین */
  var pick = [], used = 0;
  ids.sort(function(a, b){
    var qa = byId('notify_queue', a), qb = byId('notify_queue', b);
    return String(qa && qa.created_at).localeCompare(String(qb && qb.created_at));
  });
  for(var i = 0; i < ids.length; i++){
    var q = byId('notify_queue', ids[i]);
    if(!q) continue;
    var need = q.parts * (q.parent_ids || []).length;
    if(used + need > room){ out.skipped++; out.reason = 'daily-cap'; continue; }
    pick.push(q.id);
    used += need;
  }
  if(!pick.length) return out;

  var r = notifySend(pick);
  out.sent = r.sent;
  out.used = r.used;
  out.skipped += r.skipped;
  if(r.reason) out.reason = r.reason;
  return out;
}

/**
 * قلاب رندر: هر بار که برنامه صفحه می‌سازد، صف خودکار وارسی شود.
 *
 * ⚠️ محافظ تکرار: رندر ممکن است چند بار پشت‌سرهم رخ دهد. بدون
 * این محافظ، یک ارسال ممکن بود چند بار تلاش شود. فاصلهٔ کمینه
 * ۳۰ ثانیه است.
 */
var _autoFlushAt = 0;

function notifyAutoTick(){
  if(typeof S === 'undefined' || !S.user) return null;
  var sid = S.user.school_id;
  if(!sid) return null;
  var now = Date.now();
  if(now - _autoFlushAt < 30000) return null;
  _autoFlushAt = now;
  var r = notifyAutoFlush(sid);
  if(r.sent && typeof toast === 'function'){
    toast(fa(r.sent) + ' پیامک خودکار برای اولیا ارسال شد', 'ok');
  }
  return r;
}

/* ═══════════════════════════════════════════════════════════════════
   بخش ۱۴ ▸ سابقهٔ تغییرات حضور و غیاب (گام ۹)
   ═══════════════════════════════════════════════════════════════════
   وقتی ولی می‌پرسد «چرا پیامک غیبت گرفتم در حالی که بچه‌ام مدرسه
   بود؟»، باید بشود نشان داد چه کسی، کِی، چه چیزی را ثبت کرد.

   ⚠️ چیز تازه‌ای ذخیره نمی‌شود. `applyOp` در 03-persistence.js از
   قبل `op.by` و `op.at` را روی هر تغییر می‌گذارد؛ اینجا فقط
   همان دفترچه برای یک رکورد مشخص فیلتر می‌شود.

   🔴 هشدار حقوقی: `op.by` ادعای سمت مرورگر است، نه اثبات. تا روز
   اتصال سرور (قرارداد امنیتی، بند «op.by ادعاست») این سابقه برای
   **شفافیت** معتبر است نه برای **اثبات**. رابط کاربری هم همین را
   می‌گوید تا کسی رویش حساب حقوقی باز نکند.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * تاریخچهٔ یک رکورد حضور و غیاب از دفترچهٔ عملیات.
 * خروجی: [{at, by, name, from, to, kind}] — تازه‌ترین آخر.
 */
function attHistory(attId){
  var src = (typeof log !== 'undefined') ? log : [];
  var out = [], last = null;
  for(var i = 0; i < src.length; i++){
    var op = src[i];
    if(!op || op.c !== 'attendance') continue;
    var isMine = (op.t === 'ins')
      ? (op.data && op.data.id === attId)
      : (op.id === attId);
    if(!isMine) continue;
    var to = op.data ? op.data.status : null;
    if(op.t === 'del'){ to = null; }
    else if(to === undefined || to === null){ continue; }  /* تغییرِ بی‌ربط به وضعیت */
    var u = op.by ? byId('users', op.by) : null;
    out.push({
      at:   op.at || null,
      by:   op.by || null,
      name: u ? u.full_name : 'نامشخص',
      from: last,
      to:   to,
      kind: op.t
    });
    last = to;
  }
  return out;
}

/**
 * کارت سابقه برای نمایش زیر برگهٔ حضور و غیاب.
 * اگر رکوردی نباشد یا تاریخچه خالی باشد، رشتهٔ خالی برمی‌گرداند.
 */
function attHistoryCard(attId){
  var h = attHistory(attId);
  if(!h.length) return '';
  var fa2 = function(s){ return (typeof ATT_FA === 'object' && ATT_FA[s]) ? ATT_FA[s] : (s || '—'); };
  var rows = h.map(function(e){
    var when = e.at ? shortStamp(e.at) : '—';
    var what = (e.kind === 'ins')
      ? 'ثبت «' + esc(fa2(e.to)) + '»'
      : (e.kind === 'del' ? 'حذف رکورد'
         : 'تغییر از «' + esc(fa2(e.from)) + '» به «' + esc(fa2(e.to)) + '»');
    return '<div class="att-hist-row"><span class="small muted">' + esc(when) + '</span>'
      + '<b class="small">' + esc(e.name) + '</b>'
      + '<span class="small">' + what + '</span></div>';
  }).join('');
  return '<div class="att-hist"><div class="small muted" style="margin-bottom:6px">'
    + '📜 سابقهٔ این رکورد</div>' + rows
    + '<div class="small muted" style="margin-top:8px;line-height:1.9">'
    + 'این سابقه از دفترچهٔ تغییرات دستگاه خوانده می‌شود و برای شفافیت است؛ '
    + 'تا زمان اتصال به سرور، سند رسمی به شمار نمی‌رود.</div></div>';
}

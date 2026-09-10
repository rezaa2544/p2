/* ==================== لایه مجوزدهی (Authorization) ====================
   مسئله‌ای که این ماژول حل می‌کند:
   پیش از این `renderRoute()` فقط بر اساس `S.route` تصمیم می‌گرفت و هیچ
   بررسی نقشی نداشت. یعنی هر کاربری با تغییر hash آدرس یا مقدار S.route
   می‌توانست هر صفحه‌ای را باز کند — و بدتر، اکشن‌های همان صفحه هم کار
   می‌کردند (مثلاً دانش‌آموز برای هم‌کلاسی‌اش غیبت ثبت می‌کرد و همان
   تغییر وارد صف ارسال به سرور می‌شد).

   راه‌حل: مجوز روت‌ها از خودِ NAV استخراج می‌شود (تک‌منبع حقیقت)، به‌علاوهٔ
   چند روت کمکی که در منو نیستند ولی برای همان نقش مجازند.

   ⚠️ این لایه سمت کلاینت است و «سد نهایی» نیست. سرور موظف است همین قواعد
   را مستقل اعمال کند (نگاه کنید به 29-scope.js). اما نبودش یعنی هر کاربر
   می‌تواند داده دیگران را ببیند و تغییر دهد.
   ======================================================================== */

/** روت‌هایی که در NAV نیستند ولی برای نقش مجازند (زیرصفحه یا مقصد پیمایش) */
var EXTRA_ROUTES = {
  superadmin: ['dashboard','adminsubs','officedash','officeschools','record','geo','offices','lifecycle'],
  manager:    ['record','corrections','teachers','exams','tuition','association','lifecycle','atrisk','meetings','growth','formssms','import','schoolyear'],
  teacher:    ['record','exams','meetings'],
  student:    ['record','mytuition','notifications','announcements','subscription'],
  parent:     ['children','record','family','mytuition','notifications','announcements','subscription','calendar','meetings'],
  edu_office: ['officedash','officeschools','notifications','announcements'],
  /* 🔴 محدودیت مشاور: فقط صف ارجاع و صفحه‌های عمومی (COMMON_ROUTES).
     record/attendance/users و بقیه عمداً نیستند — مشاور پروندهٔ
     کامل دانش‌آموز را نمی‌بیند، فقط دادهٔ ارجاع. */
  counselor:  []
};

/** روت‌هایی که برای همهٔ نقش‌های واردشده باز است */
var COMMON_ROUTES = ['dashboard','notifications','announcements','chat','calendar'];

var _ALLOWED_CACHE = null;

/** استخراج روت‌های موجود در منوی یک نقش */
function navRoutesOf(role){
  var out = [];
  try{
    var groups = NAV[role] || [];
    for(var i=0;i<groups.length;i++){
      var items = groups[i][1] || [];
      for(var j=0;j<items.length;j++) out.push(items[j][0]);
    }
  }catch(e){}
  return out;
}

/** مجموعهٔ روت‌های مجاز یک نقش (با کش) */
function allowedRoutes(role){
  if(!_ALLOWED_CACHE) _ALLOWED_CACHE = Object.create(null);
  if(_ALLOWED_CACHE[role]) return _ALLOWED_CACHE[role];
  var set = Object.create(null);
  var add = function(r){ if(r) set[r] = true; };
  navRoutesOf(role).forEach(add);
  (EXTRA_ROUTES[role] || []).forEach(add);
  COMMON_ROUTES.forEach(add);
  _ALLOWED_CACHE[role] = set;
  return set;
}

/** آیا نقش فعلی اجازهٔ دیدن این روت را دارد؟ */
function canRoute(route, role){
  role = role || (typeof activePersona === 'function' ? activePersona() : (S.user && S.user.role));
  if(!role) return false;
  /* اصل (تصمیمِ کاربر ۲۰۲۶/۰۹/۰۵): سوپرادمین هیچ محدودیتی ندارد */
  if(role === 'superadmin') return true;
  /* تحویلدار: دبیرِ دارای پرچمِ asset_staff، روتِ اموال را می‌بیند
     (دبیرِ بی‌مجوز همچنان رد می‌شود — تستِ assets/A2). */
  if(route === 'assets' && role === 'teacher'){
    try{
      var me = (typeof S !== 'undefined') ? S.user : null;
      if(me && me.asset_staff === 1) return true;
    }catch(e){}
  }
  return !!allowedRoutes(role)[route];
}

/** روت خانهٔ هر نقش */
function homeRoute(role){
  role = role || (typeof activePersona === 'function' ? activePersona() : (S.user && S.user.role));
  /* خانهٔ مشاور صف ارجاع است، نه داشبورد عمومی */
  return role === 'edu_office' ? 'officedash' : (role === 'counselor' ? 'cqueue' : (role === 'driver' ? 'myservice' : 'dashboard'));
}

/* ---------- مجوز اکشن‌ها ----------
   برخی اکشن‌ها داده را تغییر می‌دهند. حتی اگر مهاجم دکمه را دستی بسازد،
   باید رد شود. کلید = نام اکشن، مقدار = نقش‌های مجاز.               */
/* 🔴 تفکیک نقش سوپرادمین از مدیر مدرسه (دور ۴۷)
   ────────────────────────────────────────────────────────────
   پیش از این سوپرادمین **۸۸ از ۹۳ کنش** را داشت، از جمله ورود
   اکسل، ثبت نمره و حضور و غیاب. طبق تعریف درست، این‌ها کار
   **مدیر مدرسه** است نه مدیر کل سامانه. سوپرادمین باید فقط به
   مدیریت مدارس، ادارات، اشتراک‌ها و پشتیبانی دسترسی داشته باشد.

   ✅ **مسیر جانشینی نمی‌شکند.** وقتی سوپرادمین با `school-enter`
   وارد پنل مدرسه می‌شود، `S.user` **خودِ مدیر** می‌شود
   (`19-actions.js:74`) و `activePersona()` هم `'manager'`
   برمی‌گرداند. پس همان‌جا همهٔ کنش‌های مدیر را دارد — چون واقعاً
   به‌جای مدیر عمل می‌کند، نه به‌عنوان خودش. آزمون نگهبانش در
   `tests/smoke.js` هر دو حالت را جدا می‌سنجد.

   ⚠️ **معیار حذف: صفحهٔ آن کنش در منوی سوپرادمین هست یا نه.**
   کنش‌هایی مثل `user-save` و `subject-save` نگه داشته شدند چون
   صفحه‌هایشان (`users`, `subjects`) واقعاً در منوی سوپرادمین
   هستند و حذفشان آن صفحه‌ها را می‌شکست. */
var ACTION_ROLES = {
  /* اطلاع‌رسانی پیامکی: تأیید و ارسال فقط مدیر.
     ⚠️ دبیر پیام می‌سازد ولی حق تأییدش را ندارد — همان تفکیکی که
     کل مکانیزم بازبینی بر آن بنا شده است. */
  'notify-approve':     ['manager'],
  'notify-approve-sel': ['manager'],
  'notify-reject':      ['manager'],
  'notify-reject-sel':  ['manager'],
  'notify-edit':        ['manager'],
  'notify-save-edit':   ['manager'],
  'notify-settings':    ['manager'],
  'notify-save-settings':['manager'],
  'notify-auto-off':    ['manager'],
  /* خلاصهٔ روزانه (بند ۱.۷): ساخت انبوهِ پیام ⇒ فقط مدیر */
  'daily-summary':      ['manager'],
  /* سرویس مدرسه (بدون جی‌پی‌اس): راننده فقط مسیر خودش را ثبت می‌کند —
     بررسی مالکیت مسیر در busEvent() روی داده تکرار می‌شود. */
  'bus-event':        ['driver','manager'],
  'bus-route-new':    ['manager'],
  'bus-route-save':   ['manager'],
  'bus-route-del':    ['manager'],
  'bus-students':     ['manager'],
  'bus-students-save':['manager'],
  /* کلاس مجازی (نسخهٔ سبک): ساخت/حذف فقط دبیرِ کلاس یا مدیر —
     بررسی مالکیت کلاس در vclassCreateSession/vclass-del روی داده تکرار می‌شود */
  'vclass-new':       ['teacher','manager'],
  'vclass-save':      ['teacher','manager'],
  'vclass-del':       ['teacher','manager'],
  'vclass-play':      ['teacher','manager','student','parent'],
  'tomorrow-check':   ['student','parent'], /* E.1 فرناز: فقط حافظهٔ محلی — چیزی برای WRITE_PERMS ندارد */
  'goal-save':        ['student','parent'], /* E.3 فرناز: فقط Store — مالکیت در خود اکشن (goalViewerOk) */
  'pnote-save':       ['parent'], /* E.6 فرناز: فقط Store — ولیِ لینک‌شده در خود اکشن */
  'ticket-new':       ['manager'], /* G.2 فرناز: بازکردن فرم (بدون نوشتن) */
  'ticket-save':      ['manager'], /* G.2 فرناز: ثبت تیکت (ins در مدل) */
  'ticket-status':    ['superadmin'], /* G.2 فرناز: تغییر وضعیت (upd در مدل) */
  'vclass-q-ask':     ['student'],
  'vclass-q-save':    ['student'],
  'vclass-q-answer':  ['teacher','manager'],
  'vclass-q-answer-save':['teacher','manager'],
  /* تکالیف (بند ۴): مالکیت کلاس در hwCreateAssignment/hwSubmit/hwSaveGrading روی داده تکرار می‌شود */
  'hw-new':         ['teacher','manager'],
  'hw-save':        ['teacher','manager'],
  'hw-del':         ['teacher','manager'],
  'hw-list':        ['teacher','manager'],
  'hw-grade':       ['teacher','manager'],
  'hw-grade-save':  ['teacher','manager'],
  'hw-canvas-clear':['teacher','manager'],
  'hw-submit':      ['student'],
  /* گیمیفیکیشن ابتدایی (بند ۵): مدل فقط مدیر؛ چیپ فقط فرم می‌زند (ذخیره از disc-save) */
  'dojo-config':    ['manager'],
  'dojo-save':      ['manager'],
  'dojo-row-add':   ['manager'],
  'dojo-apply-defaults':['manager'],
  'dojo-row-del':   ['manager'],
  'dojo-pick':      ['teacher','manager'],
  /* حضور و غیاب: فقط دبیر و مدیر */
  /* مهمان‌ها (E.9): مدیر + نگهبان (نقشِ تفویضی — سوپرادمین کاربرِ
     role=guard می‌سازد). معاون (مدیرِ سطحی با عنوانِ معاون) فقط‌خوان است:
     گاردِ عنوان در visitorWriteOk روی داده. مالکیت مدرسه در
     visitorRegister/visitorCheckout روی داده تکرار می‌شود. */
  'vis-new':        ['manager','guard'],
  'vis-save':       ['manager','guard'],
  'vis-out':        ['manager','guard'],
  /* کتابخانه (بند ۸): فقط مدیر؛ مالکیت مدرسه در توابع دامنه روی داده */
  'lib-new':        ['manager'],
  'lib-save':       ['manager'],
  'lib-del':        ['manager'],
  'lib-lend':       ['manager'],
  'lib-lend-save':  ['manager'],
  'lib-return':     ['manager'],
  /* خوابگاه/اسکان (دور ۷۸ بند ۷): فقط مدیر؛ مالکیت مدرسه در توابع دامنه روی داده */
  'dorm-room-new':  ['manager'],
  'dorm-room-edit': ['manager'],
  'dorm-room-save': ['manager'],
  'dorm-room-del':  ['manager'],
  'dorm-assign':    ['manager'],
  'dorm-assign-pick':['manager'],
  'dorm-unassign':  ['manager'],
  'dorm-meal':      ['manager'],
  'dorm-meal-save': ['manager'],
  'dorm-leave':     ['manager'],
  'bus-need-set':   ['manager','superadmin'],
  'bus-need-save':  ['manager','superadmin'],
  'bus-need-parent-save': ['parent'],
  'bus-event-student': ['student'],
  'bus-loc-driver':  ['driver'],
  'bus-loc-student': ['student'],
  'bus-follow-open':        ['manager','superadmin'],
  'bus-follow-save':        ['manager','superadmin'],
  'bus-follow-close':       ['manager','superadmin'],
  'bus-follow-close-save':  ['manager','superadmin'],
  'vclass-links':    ['teacher','manager','superadmin'],
  'vclass-link-copy':['teacher','manager','student','parent','superadmin'],
  'vc-join':         ['student'],
  'vc-leave':        ['student'],
  'hw-window':       ['teacher','manager','superadmin'],
  'hw-window-save':  ['teacher','manager','superadmin'],
  'hw-lock':         ['teacher','manager','superadmin'],
  'hw-view':         ['teacher','manager','student','superadmin'],
  'smode-open':      ['edu_office','manager','superadmin'],
  'smode-save':      ['edu_office','manager','superadmin'],
  'smode-mgr':       ['manager','superadmin'],
  'conflict-resolve':['manager','superadmin'],
  'as-new':         ['manager'],
  'as-save':        ['manager'],
  'as-status':      ['manager','teacher'],
  'as-status-save': ['manager','teacher'],
  'as-cust-toggle': ['manager'],
  'as-del':         ['manager'],
  'sd-new':         ['manager'],
  'sd-save':        ['manager'],
  'sd-del':         ['manager'],
  /* دور ۷۶ — ترک تحصیل: فقط مدیر (سوپرادمین با اصلِ ساختاری دور می‌زند) */
  'drop-register':  ['manager'],
  'drop-register-confirm': ['manager'],
  'drop-return':    ['manager'],
  'drop-return-confirm': ['manager'],
  'att-set':       ['teacher','manager'],
  'att-time-save': ['teacher','manager'],
  'att-exempt':    ['manager'],
  'att-exempt-confirm': ['manager'],
  'att-review':    ['teacher','manager'],
  'att-commit':    ['teacher','manager'],
  'att-discard':   ['teacher','manager'],
  'att-tip-ok':    ['teacher','manager','student','parent','edu_office'],
  /* سابقه برای شفافیت با ولی است، پس همهٔ نقش‌ها می‌بینند.
     محتوایش فقط دربارهٔ رکوردی است که کاربر از قبل دسترسی دارد. */
  'att-hist':      ['teacher','manager','superadmin','student','parent','edu_office'],
  /* فقط فیلتر نمایشی است؛ دسترسی به خود پرونده جداگانه سنجیده می‌شود */
  'trend-sub':     ['teacher','manager','superadmin','student','parent','edu_office'],
  /* پیام گروهی اداره: فقط رئیس اداره و مدیر کل سامانه */
  'office-msg':      ['edu_office','superadmin'],
  'office-msg-send': ['edu_office','superadmin'],
  /* یادداشت خصوصی: فقط دبیر می‌نویسد و پاک می‌کند.
     ⚠️ مدیر می‌بیند ولی نمی‌نویسد — تصمیم سیاستی دور ۴۴. */
  'tnote-new':     ['teacher'],
  'tnote-save':    ['teacher'],
  'tnote-del':     ['teacher'],
  'att-all':       ['teacher','manager'],
  /* خروج از پیش‌گزینش زنگ (گام ۳ دور ۶۳): فقط فیلتر را عوض می‌کند */
  'att-reset-class': ['teacher','manager'],
  'grade-reset-auto': ['teacher','manager'],
  /* نمرات */
  'grade-save':    ['teacher','manager'],
  'grade-del':     ['teacher','manager'],
  'grade-modal':   ['teacher','manager'],
  /* بند ۴.۲ — کارآموزی هنرستان: ثبت دبیر/مدیر؛ تأیید دبیرِ مربوطه/مدیر
     (بررسیِ «دبیرِ مربوطه» در canApproveInternship روی داده تکرار می‌شود)؛
     حذف فقط مدیر. */
  'internship-new':     ['teacher','manager'],
  'internship-save':    ['teacher','manager'],
  'internship-approve': ['teacher','manager'],
  'internship-del':     ['manager'],
  'internship-cert':    ['manager','superadmin'],
  /* بند ۲.۲ — IEP: فیلدِ آزاد است ولی تغییرش اختیارِ کادر است (دبیر/مدیر) */
  'iep-save': ['teacher','manager'],
  /* بند ۴.۴ — قیف پیش‌ثبت‌نام: پیگیریِ داوطلب کارِ مدیر است */
  'preapp-new':  ['manager'],
  'preapp-save': ['manager'],
  'preapp-next': ['manager'],
  'preapp-del':  ['manager'],
  /* بند ۲.۴ — کمک‌هزینه: علامت‌گذاری و پیگیریِ دانش‌آموزِ نیازمند، فقط مدیر */
  'scholar-new': ['manager'],
  'scholar-save': ['manager'],
  'scholar-set': ['manager'],
  'scholar-del': ['manager'],
  /* بند ۶.۱ — امتحاناتِ تجدیدی: فقط مدیر */
  'reexam-new': ['manager'],
  'reexam-save': ['manager'],
  'reexam-score': ['manager'],
  'reexam-score-save': ['manager'],
  'reexam-del': ['manager'],
  /* بند ۶.۲ — صورت‌جلسهٔ انجمن: فقط مدیر */
  'assoc-min-new': ['manager'],
  'assoc-min-save': ['manager'],
  'assoc-min-print': ['manager'],
  'assoc-min-toggle': ['manager'],
  'assoc-min-del': ['manager'],
  /* بند ۶.۴ — کلاس‌های تابستانی: فقط مدیر */
  'summer-new': ['manager'],
  'summer-save': ['manager'],
  'summer-students': ['manager'],
  'summer-students-save': ['manager'],
  'summer-del': ['manager'],
  /* بند ۶.۵ (سبک) — جابه‌جاییِ زنگِ متداخل: فقط مدیر */
  'sched-conf-move': ['manager','superadmin'],
  'schedgen-open':   ['manager','superadmin'],
  'schedgen-apply':  ['manager','superadmin'],
  /* بند ۲.۱ — کلاسِ چندپایه: عضویتِ دروس فقط مدیر (و سوپرادمین) */
  'class-membership-save': ['manager','superadmin'],
  /* بند ۵.۲ — مسیرِ دوازدهم↔مشاور: دانش‌آموز/ولی می‌نویسند، مشاور پاسخ می‌دهد
     (گاردهای داده‌ای — دوازدهم بودن، فرزند بودن، مدرسه — در counselorMsgSend) */
  'counselor-msg-send': ['student','parent','counselor'],
  'counselor-msg-reply': ['counselor'],
  /* انضباطی */
  'disc-save':     ['teacher','manager'],
  'disc-del':      ['manager'],
  'disc-modal':    ['teacher','manager'],
  'disc-quick':    ['teacher','manager'],
  /* کاربران و مدارس */
  'user-save':     ['manager','superadmin'],
  'user-del':      ['manager','superadmin'],
  'user-modal':    ['manager','superadmin'],
  'user-toggle':   ['manager','superadmin'],
  'school-save':   ['superadmin'],
  /* C.2 فرناز — بوم: مدیر فقط مدرسهٔ خودش (گیت دوم در خود اکشن) */
  'school-boom':      ['manager'],
  'school-boom-save': ['manager'],
  'school-del':    ['superadmin'],
  'school-modal':  ['superadmin'],
  'school-toggle': ['superadmin'],
  'school-enter':  ['superadmin'],
  /* کلاس و درس */
  'class-save':    ['manager'],
  'class-del':     ['manager'],
  'subject-save':  ['manager','superadmin'],
  'subject-del':   ['manager','superadmin'],
  /* برنامه هفتگی و جابه‌جای موقت (بند ۱.۵) — فقط مدیر و سوپرادمین */
  'slot-save':     ['manager','superadmin'],
  'slot-del':      ['manager','superadmin'],
  'sub-save':      ['manager','superadmin'],
  'sub-del':       ['manager','superadmin'],
  'sub-del-route': ['manager','superadmin'],
  /* اطلاعیه */
  'ann-save':      ['manager','superadmin','edu_office'],
  'ann-del':       ['manager','superadmin','edu_office'],
  /* ب.۳ — ارزشیابی ناشناس معلم: فقط دانش‌آموز و ولی پاسخ می‌دهند */
  'eval-save':     ['student','parent'],
  /* د.۴ — کمبود نیروی انسانی: تعیین/حذف هنجار فقط سوپرادمین و کارشناس اداره
     (دروازهٔ سمت سرور هم در server/sync.js بر محدودهٔ اداره) */
  'staffgap-norm':   ['superadmin','edu_office'],
  'staffpost-save':  ['superadmin','edu_office'],
  'staffpost-del':   ['superadmin','edu_office'],
  /* مالی */
  'tuition-plan-save': ['manager','superadmin'],
  'plan-del':      ['manager','superadmin'],
  'ins-pay':       ['manager'],
  /* اداره */
  'office-save':   ['superadmin'],
  'office-del':    ['superadmin'],
  'office-toggle': ['superadmin'],
  /* اشتراک (پنل مدیریتی) */
  /* چرخهٔ تحصیلی — عملیات سنگین و برگشت‌ناپذیر: فقط مدیر و سوپرادمین */
  'promote-run':   ['manager'],
  /* چرخهٔ سال تحصیلی */
  'year-close':    ['manager'],
  'year-reopen':   ['manager'],
  'place-auto':    ['manager'],
  'cls-parallel':  ['manager'],
  'cls-parallel-ok':['manager'],
  'enroll-paid':   ['manager'],
  /* افت تحصیلی / جلسات / رشد */
  'risk-notify':   ['manager','teacher'],
  /* فرم‌های رسمی و پیامک — پیامک هزینه دارد، پس فقط مدیر */
  'form-print':    ['manager'],
  /* پنل سوپرادمین */
  'plan-settings':   ['superadmin'],
  'plan-save':       ['superadmin'],
  'backup-make':     ['superadmin'],
  'restore-pick':    ['superadmin'],
  'restore-ok':      ['superadmin'],
  'export-csv':      ['manager'],
  'ann-broadcast':   ['superadmin'],
  'ann-broadcast-ok':['superadmin'],
  'health-backup': ['superadmin'],
  'health-reindex':['superadmin'],
  'health-retry':  ['superadmin'],
  /* ورود اکسل — رکورد انبوه می‌سازد، پس فقط مدیر */
  'imp-preview':   ['manager'],
  'imp-commit':    ['manager'],
  'imp-back':      ['manager'],
  'imp-reset':     ['manager'],
  'sms-new':       ['manager'],
  'sms-send':      ['manager'],
  'sms-topup':     ['manager'],
  'sms-topup-ok':  ['manager'],
  'invite-parents':['manager'],
  'mtg-new':       ['manager','teacher'],
  'mtg-save':      ['manager','teacher'],
  'mtg-del':       ['manager','teacher'],
  'mtg-book':      ['parent'],
  'mtg-book-ok':   ['parent'],
  'tr-new':        ['manager'],
  'tr-send':       ['manager'],
  'tr-ok':         ['manager'],
  'tr-no':         ['manager'],
  'tr-box':        ['manager'],
  'conf-dismiss':  ['manager','superadmin'],
  'subs-settings': ['superadmin'],
  'subs-save':     ['superadmin'],
  /* مشاور مدرسه (دور ۶۳): ارجاع کار مدیر است؛ رسیدگی کار مشاور
     (مدیر هم می‌تواند ارجاع خودش را ببندد). */
  'counselor-ref':   ['manager'],
  'counselor-handle':['counselor','manager'],
  /* اعلان الگو به ولی (بند ۴ دور ۶۳): خودکار نیست — فقط مدیر از
     «پیگیری الگوها» پیام را در صف اولیا می‌گذارد. مشاور عمداً
     بی‌خیال این اختیار است (تفکیک: پیگیری با مشاور، اطلاع‌رسانی
     رسمی با مدیر). */
  'pattern-notify':  ['manager'],
  /* حضور کادر (بند B.1 فرناز): هر ۶ اکشن فقط مدیر */
  'staffatt-day':    ['manager'],
  'staffatt-save':   ['manager'],
  'staffatt-prev':   ['manager'],
  'staffatt-next':   ['manager'],
  'staffatt-today':  ['manager'],
  'staffatt-pick':   ['manager'],
  /* دوره‌های آموزشی کادر (بند B.2 فرناز): هر ۷ اکشن فقط مدیر */
  'trn-new':          ['manager'],
  'trn-edit':         ['manager'],
  'trn-save':         ['manager'],
  'trn-complete':     ['manager'],
  'trn-print':        ['manager'],
  'trn-verify':       ['manager'],
  'trn-verify-check': ['manager'],
  /* مانور ایمنی (بند B.4 فرناز): هر ۵ اکشن فقط مدیر */
  'drill-new':    ['manager'],
  'drill-edit':   ['manager'],
  'drill-save':   ['manager'],
  'drill-del':    ['manager'],
  'drill-del-ok': ['manager'],
  /* کمک‌های داوطلبانه (بند B.5 فرناز): هر ۶ اکشن فقط مدیر */
  'don-new':    ['manager'],
  'don-edit':   ['manager'],
  'don-save':   ['manager'],
  'don-del':    ['manager'],
  'don-del-ok': ['manager'],
  'don-print':  ['manager']
};

/* ✅ (R99 — تک‌منبعِ مجوزها) canAction/canRoute فقط رابط کاربری را مرتب
   می‌کنند؛ سرور (server/sync.js) نقش را از ژتون نشست می‌خواند و جدولِ
   مجوزِ نوشتارش را از **فایلِ تولیدشده** می‌گیرد، نه از یک جدولِ دستی:
     ACTION_ROLES (این‌جا — نقش‌هایِ مجازِ هر اکشن)
     + تحلیلِ استاتیکِ اکشن‌ها (مجموعه‌هایِ نوشتاری — tools/check-authz.js)
     + authz/model.json (fields + نقش‌هایِ هر عمل)
     ⇒ tools/generate-write-perms.js ⇒ authz/write-perms.json (سرور)
   `node build.js --check` هر دو گیت را اجرا می‌کند؛ ناهماهنگی یا جدولِ
   کهنه = build قرمز. نقشهٔ صریحِ «اکشن ← نقش‌ها + مجموعه‌هایِ قابلِ
   نوشتن» در بخشِ `actions` همان فایلِ تولیدی قفل است.
   📄 docs/SERVER_SECURITY_CONTRACT.md بند ۱ */

/** آیا نقش فعلی اجازهٔ اجرای این اکشن را دارد؟ */
function canAction(act, role){
  var allowed = ACTION_ROLES[act];
  if(!allowed) return true;                 // اکشن‌های عمومی محدود نیستند
  role = role || (typeof activePersona === 'function' ? activePersona() : (S.user && S.user.role));
  /* در حالت جانشینی، نقشِ کاربرِ جانشین‌شده ملاک است (همان S.user) */
  /* اصل (تصمیمِ کاربر ۲۰۲۶/۰۹/۰۵): سوپرادمین هیچ محدودیتی ندارد —
     جدولِ مجوزها هرگز او را نگه نمی‌دارد (مثل export-csv که فقط
     ['manager] بود و خروجیِ سوپرادمین را می‌بست). */
  if(role === 'superadmin') return true;
  return allowed.indexOf(role) > -1;
}

/** پیام یکسان برای دسترسی غیرمجاز */
function viewForbidden(){
  return '<div class="card"><div class="card-body">' +
    (typeof empty === 'function'
      ? empty('🔒','دسترسی مجاز نیست','این بخش برای نقش کاربری شما در دسترس نیست.')
      : '<p>دسترسی مجاز نیست</p>') +
    '</div></div>';
}

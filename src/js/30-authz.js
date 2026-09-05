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
  manager:    ['record','corrections','teachers','exams','tuition','lifecycle','atrisk','meetings','growth','formssms','import','schoolyear'],
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
  /* حضور و غیاب: فقط دبیر و مدیر */
  'att-set':       ['teacher','manager'],
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
  /* انضباطی */
  'disc-save':     ['teacher','manager'],
  'disc-del':      ['manager'],
  'disc-modal':    ['teacher','manager'],
  /* کاربران و مدارس */
  'user-save':     ['manager','superadmin'],
  'user-del':      ['manager','superadmin'],
  'user-modal':    ['manager','superadmin'],
  'user-toggle':   ['manager','superadmin'],
  'school-save':   ['superadmin'],
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
  /* مالی */
  'plan-save':     ['manager','superadmin'],
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
  'pass-reset':    ['manager','superadmin'],
  'pass-reset-ok': ['manager','superadmin'],
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
  'pattern-notify':  ['manager']
};

/* 🔴 TODO پیش از اتصال به سرور — تکرار عین این منطق سمت سرور
   canAction و canRoute امروز فقط رابط کاربری را مرتب می‌کنند. هرکس
   در کنسول مرورگر S.user.role را عوض کند از هر دو رد می‌شود، و هیچ
   کد سمت مرورگری نمی‌تواند جلویش را بگیرد.
   سرور باید جدول ACTION_ROLES و ROUTE_ROLES را عیناً داشته باشد و
   نقش را از ژتون نشست بخواند، نه از بدنهٔ درخواست.
   ⚠️ بهتر است هر دو جدول از یک منبع واحد تولید شوند، وگرنه دو نسخه
   به‌مرور از هم دور می‌افتند و شکاف امنیتی همان‌جا باز می‌شود.
   📄 docs/SERVER_SECURITY_CONTRACT.md بند ۱ */

/** آیا نقش فعلی اجازهٔ اجرای این اکشن را دارد؟ */
function canAction(act, role){
  var allowed = ACTION_ROLES[act];
  if(!allowed) return true;                 // اکشن‌های عمومی محدود نیستند
  role = role || (typeof activePersona === 'function' ? activePersona() : (S.user && S.user.role));
  /* در حالت جانشینی، نقشِ کاربرِ جانشین‌شده ملاک است (همان S.user) */
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

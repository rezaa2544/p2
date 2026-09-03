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
  edu_office: ['officedash','officeschools','notifications','announcements']
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
  return role === 'edu_office' ? 'officedash' : 'dashboard';
}

/* ---------- مجوز اکشن‌ها ----------
   برخی اکشن‌ها داده را تغییر می‌دهند. حتی اگر مهاجم دکمه را دستی بسازد،
   باید رد شود. کلید = نام اکشن، مقدار = نقش‌های مجاز.               */
var ACTION_ROLES = {
  /* اطلاع‌رسانی پیامکی: تأیید و ارسال فقط مدیر.
     ⚠️ دبیر پیام می‌سازد ولی حق تأییدش را ندارد — همان تفکیکی که
     کل مکانیزم بازبینی بر آن بنا شده است. */
  'notify-approve':     ['manager','superadmin'],
  'notify-approve-sel': ['manager','superadmin'],
  'notify-reject':      ['manager','superadmin'],
  'notify-reject-sel':  ['manager','superadmin'],
  'notify-edit':        ['manager','superadmin'],
  'notify-save-edit':   ['manager','superadmin'],
  'notify-settings':    ['manager','superadmin'],
  'notify-save-settings':['manager','superadmin'],
  'notify-auto-off':    ['manager','superadmin'],
  /* حضور و غیاب: فقط دبیر و مدیر */
  'att-set':       ['teacher','manager','superadmin'],
  'att-review':    ['teacher','manager','superadmin'],
  'att-commit':    ['teacher','manager','superadmin'],
  'att-discard':   ['teacher','manager','superadmin'],
  'att-tip-ok':    ['teacher','manager','superadmin','student','parent','edu_office'],
  'att-all':       ['teacher','manager','superadmin'],
  /* نمرات */
  'grade-save':    ['teacher','manager','superadmin'],
  'grade-del':     ['teacher','manager','superadmin'],
  'grade-modal':   ['teacher','manager','superadmin'],
  /* انضباطی */
  'disc-save':     ['teacher','manager','superadmin'],
  'disc-del':      ['manager','superadmin'],
  'disc-modal':    ['teacher','manager','superadmin'],
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
  'class-save':    ['manager','superadmin'],
  'class-del':     ['manager','superadmin'],
  'subject-save':  ['manager','superadmin'],
  'subject-del':   ['manager','superadmin'],
  /* اطلاعیه */
  'ann-save':      ['manager','superadmin','edu_office'],
  'ann-del':       ['manager','superadmin','edu_office'],
  /* مالی */
  'plan-save':     ['manager','superadmin'],
  'plan-del':      ['manager','superadmin'],
  'ins-pay':       ['manager','superadmin'],
  /* اداره */
  'office-save':   ['superadmin'],
  'office-del':    ['superadmin'],
  'office-toggle': ['superadmin'],
  /* اشتراک (پنل مدیریتی) */
  /* چرخهٔ تحصیلی — عملیات سنگین و برگشت‌ناپذیر: فقط مدیر و سوپرادمین */
  'promote-run':   ['manager','superadmin'],
  /* چرخهٔ سال تحصیلی */
  'year-close':    ['manager','superadmin'],
  'year-reopen':   ['manager','superadmin'],
  'place-auto':    ['manager','superadmin'],
  'cls-parallel':  ['manager','superadmin'],
  'cls-parallel-ok':['manager','superadmin'],
  'enroll-paid':   ['manager','superadmin'],
  /* افت تحصیلی / جلسات / رشد */
  'risk-notify':   ['manager','superadmin','teacher'],
  /* فرم‌های رسمی و پیامک — پیامک هزینه دارد، پس فقط مدیر */
  'form-print':    ['manager','superadmin'],
  /* پنل سوپرادمین */
  'plan-settings':   ['superadmin'],
  'plan-save':       ['superadmin'],
  'backup-make':     ['superadmin'],
  'restore-pick':    ['superadmin'],
  'restore-ok':      ['superadmin'],
  'export-csv':      ['manager','superadmin'],
  'ann-broadcast':   ['superadmin'],
  'ann-broadcast-ok':['superadmin'],
  'pass-reset':    ['manager','superadmin'],
  'pass-reset-ok': ['manager','superadmin'],
  'health-backup': ['superadmin'],
  'health-reindex':['superadmin'],
  'health-retry':  ['superadmin'],
  /* ورود اکسل — رکورد انبوه می‌سازد، پس فقط مدیر */
  'imp-preview':   ['manager','superadmin'],
  'imp-commit':    ['manager','superadmin'],
  'imp-back':      ['manager','superadmin'],
  'imp-reset':     ['manager','superadmin'],
  'sms-new':       ['manager','superadmin'],
  'sms-send':      ['manager','superadmin'],
  'sms-topup':     ['manager','superadmin'],
  'sms-topup-ok':  ['manager','superadmin'],
  'invite-parents':['manager','superadmin'],
  'mtg-new':       ['manager','superadmin','teacher'],
  'mtg-save':      ['manager','superadmin','teacher'],
  'mtg-del':       ['manager','superadmin','teacher'],
  'mtg-book':      ['parent'],
  'mtg-book-ok':   ['parent'],
  'tr-new':        ['manager','superadmin'],
  'tr-send':       ['manager','superadmin'],
  'tr-ok':         ['manager','superadmin'],
  'tr-no':         ['manager','superadmin'],
  'tr-box':        ['manager','superadmin'],
  'conf-dismiss':  ['manager','superadmin'],
  'subs-settings': ['superadmin'],
  'subs-save':     ['superadmin']
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

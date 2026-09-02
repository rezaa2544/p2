/* ═══════════════════════════════════════════════════════════════════
   کلاس‌بندی خودکار هنگام ورود از اکسل

   مدیر فایل اکسل مدرسه را می‌دهد و در ستون کلاس چیزهایی مثل این نوشته:
       «دهم الکترونیک» · «۱۰ تجربی» · «هفتم ۲» · «پنجم الف»
   این ماژول از همان متن، پایه و رشته را بیرون می‌کشد، با شاخه‌های
   اعلام‌شدهٔ مدرسه می‌سنجد و دانش‌آموزان هم‌پایه‌وهم‌رشته را در یک
   کلاس می‌گذارد — بدون آنکه مدیر کلاسی از پیش تعریف کرده باشد.

   چرا جدا از 34-excel-import؟ چون منطق تشخیص، مستقل از خواندن فایل
   است و باید بتوان جداگانه آزمودش.
   ═══════════════════════════════════════════════════════════════════ */

/* ---------- نام‌های عامیانهٔ رشته‌ها ----------
   مدرسه‌ها نام رسمی را نمی‌نویسند. «الکترونیک» در فایل یعنی همان
   «الکتروتکنیک» رسمی. کلید = آنچه ممکن است بنویسند، مقدار = نام رسمی.
   ⚠️ کلیدها باید با normHdr یکسان‌سازی شده باشند (بدون نیم‌فاصله). */
var FIELD_ALIASES = {
  /* نظری */
  'تجربی': 'علوم تجربی',
  'علوم تجربی': 'علوم تجربی',
  'ریاضی': 'ریاضی فیزیک',
  'ریاضی فیزیک': 'ریاضی فیزیک',
  'ریاضیفیزیک': 'ریاضی فیزیک',
  'انسانی': 'ادبیات و علوم انسانی',
  'ادبیات': 'ادبیات و علوم انسانی',
  'ادبیات و علوم انسانی': 'ادبیات و علوم انسانی',
  'علوم انسانی': 'ادبیات و علوم انسانی',
  'معارف': 'علوم و معارف اسلامی',
  'علوم و معارف اسلامی': 'علوم و معارف اسلامی',
  'معارف اسلامی': 'علوم و معارف اسلامی',
  /* فنی و حرفه‌ای */
  'الکترونیک': 'الکتروتکنیک',
  'الکتروتکنیک': 'الکتروتکنیک',
  'برق': 'الکتروتکنیک',
  'مکانیک': 'مکانیک خودرو',
  'مکانیک خودرو': 'مکانیک خودرو',
  'خودرو': 'مکانیک خودرو',
  'کامپیوتر': 'کامپیوتر',
  'رایانه': 'کامپیوتر',
  'شبکه و نرم افزار': 'کامپیوتر',
  'حسابداری': 'حسابداری',
  'ساختمان': 'ساختمان',
  'عمران': 'ساختمان',
  'گرافیک': 'گرافیک',
  /* کاردانش */
  'لوازم خانگی': 'تعمیر لوازم خانگی',
  'تعمیر لوازم خانگی': 'تعمیر لوازم خانگی',
  'طراحی دوخت': 'طراحی دوخت',
  'خیاطی': 'طراحی دوخت',
  'دوخت': 'طراحی دوخت',
  'تاسیسات': 'تأسیسات',
  'تأسیسات': 'تأسیسات',
  'صنایع غذایی': 'صنایع غذایی'
};

/* شاخه‌ها هم ممکن است مستقیم نوشته شوند: «دهم فنی» */
var BRANCH_ALIASES = {
  'نظری': 'نظری',
  'فنی': 'فنی و حرفه‌ای',
  'فنی و حرفه ای': 'فنی و حرفه‌ای',
  'فنی حرفه ای': 'فنی و حرفه‌ای',
  'هنرستان': 'فنی و حرفه‌ای',
  'کاردانش': 'کاردانش',
  'کار دانش': 'کاردانش'
};

/* تبدیل ارقام فارسی/عربی به لاتین.
   toLatinDigits در ماژول ۳۴ تعریف شده که پیش از این بار می‌شود، اما
   این ماژول نباید به ترتیب بارگذاری وابسته باشد؛ پشتیبان محلی داریم. */
function faDigits(x){
  if(typeof toLatinDigits === 'function') return toLatinDigits(x);
  return String(x == null ? '' : x)
    .replace(/[۰-۹]/g, function(d){ return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
    .replace(/[٠-٩]/g, function(d){ return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
}

/** یکسان‌سازی متن برای مقایسه: عربی→فارسی، نیم‌فاصله→فاصله، ارقام→لاتین */
function normField(s){
  return String(s == null ? '' : s)
    .replace(/[\u200c\u200f\u200e]/g, ' ')   /* نیم‌فاصله و نشانه‌های جهت */
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا').replace(/ۀ/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * تشخیص رشته از یک متن آزاد.
 * فقط رشته‌هایی پذیرفته می‌شوند که مدرسه واقعاً ارائه می‌دهد؛
 * وگرنه «دهم گرافیک» در دبیرستان نظری کلاس می‌ساخت.
 *
 * @param {string} text  متن ستون کلاس یا رشته
 * @param {number} schoolId
 * @returns {{field:string, branch:string, offered:boolean}|null}
 */
function detectField(text, schoolId){
  var t = normField(text);
  if(!t) return null;
  var mine = (typeof schoolFields === 'function') ? schoolFields(schoolId) : [];
  var hit = null;

  /* بلندترین کلید اول، تا «ریاضی فیزیک» پیش از «ریاضی» بررسی شود */
  var keys = Object.keys(FIELD_ALIASES).sort(function(a, b){ return b.length - a.length; });
  for(var i = 0; i < keys.length; i++){
    if(t.indexOf(normField(keys[i])) > -1){ hit = FIELD_ALIASES[keys[i]]; break; }
  }
  if(!hit) return null;

  var branch = '';
  if(typeof BRANCHES === 'object'){
    Object.keys(BRANCHES).forEach(function(b){
      if((BRANCHES[b] || []).indexOf(hit) > -1) branch = b;
    });
  }
  return { field: hit, branch: branch, offered: mine.indexOf(hit) > -1 };
}

/** تشخیص شاخه وقتی رشته نوشته نشده: «دهم فنی» */
function detectBranch(text){
  var t = normField(text);
  if(!t) return null;
  var keys = Object.keys(BRANCH_ALIASES).sort(function(a, b){ return b.length - a.length; });
  for(var i = 0; i < keys.length; i++){
    if(t.indexOf(normField(keys[i])) > -1) return BRANCH_ALIASES[keys[i]];
  }
  return null;
}

/**
 * تشخیص شاخهٔ کلاس از متن: «الف»، «۲»، «ب» در «هفتم ۲» یا «پنجم الف».
 * برای ابتدایی و متوسطه اول که رشته ندارند و فقط شماره/حرف دارند.
 */
function detectSection(text, grade){
  var t = normField(text);
  if(!t) return '';
  /* واژهٔ پایه را برداریم تا عددش با شمارهٔ کلاس اشتباه نشود */
  var words = ['اول','دوم','سوم','چهارم','پنجم','ششم','هفتم','هشتم','نهم',
               'دهم','یازدهم','دوازدهم','پایه'];
  words.sort(function(a, b){ return b.length - a.length; });
  var rest = t;
  for(var i = 0; i < words.length; i++){
    rest = rest.split(words[i]).join(' ');
  }
  /* عدد پایه هم اگر عددی نوشته شده باشد («۱۰ تجربی») */
  if(grade) rest = rest.replace(new RegExp('\\b' + grade + '\\b', 'g'), ' ');
  rest = normField(faDigits(rest));
  var m = rest.match(/(?:^|\s)([1-9]\d?|الف|ب|ج|د|ه)(?:\s|$)/);
  return m ? m[1] : '';
}

/**
 * از یک متن آزاد، مشخصات کامل کلاس را بیرون می‌کشد.
 *
 * @returns {{
 *   grade:number|null, field:string, branch:string, section:string,
 *   name:string, mode:'field'|'class', offered:boolean, raw:string
 * }|null}
 */
function parsePlacement(text, schoolId){
  var raw = normField(text);
  if(!raw) return null;

  /* ⚠️ gradeFromName الگوی عددی‌اش لاتین است و «۱۱» فارسی را نمی‌خواند؛
     پس ارقام را پیش از فراخوانی تبدیل می‌کنیم، وگرنه «۱۱ ریاضی» پایهٔ
     یازده را از دست می‌داد و به پیش‌فرض دهم می‌افتاد. */
  var latin = faDigits(raw);
  var grade = (typeof gradeFromName === 'function') ? gradeFromName(latin) : null;
  var fd = detectField(raw, schoolId);
  var branch = fd ? fd.branch : (detectBranch(raw) || '');

  /* پایه در متن نبود ولی رشته بود ⇒ پیش‌فرض دهم (شروع متوسطه دوم) */
  if(!grade && fd) grade = 10;

  var isField = grade != null && Number(grade) >= 10;
  var section = isField && fd ? '' : detectSection(raw, grade);

  /* نام استاندارد کلاس */
  var gw = gradeWordOf(grade);
  var name;
  if(isField && fd) name = (gw + ' ' + fd.field).trim();
  else if(gw) name = (gw + (section ? ' ' + section : '')).trim();
  else name = raw;

  return {
    grade: grade == null ? null : Number(grade),
    field: fd ? fd.field : '',
    branch: branch,
    section: section,
    name: name,
    mode: (isField && fd) ? 'field' : 'class',
    offered: fd ? fd.offered : true,
    raw: raw
  };
}

/** واژهٔ فارسی پایه از روی عدد */
function gradeWordOf(g){
  var W = ['','اول','دوم','سوم','چهارم','پنجم','ششم','هفتم','هشتم','نهم',
           'دهم','یازدهم','دوازدهم'];
  g = Number(g);
  return (g >= 1 && g <= 12) ? W[g] : '';
}

/**
 * کلاس موجود متناظر با یک تشخیص را پیدا می‌کند.
 * تطبیق بر پایهٔ «پایه + رشته» است نه نام، چون مدرسه ممکن است کلاس را
 * «دهم الکتروتکنیک» ثبت کرده باشد و فایل «۱۰ الکترونیک» بنویسد.
 */
function findClassFor(pl, schoolId){
  if(!pl) return null;
  var list = db.classes.filter(function(c){ return c.school_id === schoolId; });

  /* ۱) تطبیق دقیق نام */
  var byName = list.filter(function(c){ return normField(c.name) === normField(pl.name); })[0];
  if(byName) return byName;

  /* ۲) تطبیق پایه + رشته */
  if(pl.grade && pl.field){
    var byGF = list.filter(function(c){
      var cg = c.grade_level || ((typeof gradeFromName === 'function') ? gradeFromName(c.name) : null);
      return Number(cg) === pl.grade && normField(c.field || '') === normField(pl.field);
    })[0];
    if(byGF) return byGF;
    /* رشته در نام کلاس آمده ولی در میدان field ثبت نشده */
    var byGFName = list.filter(function(c){
      var cg = c.grade_level || ((typeof gradeFromName === 'function') ? gradeFromName(c.name) : null);
      return Number(cg) === pl.grade && normField(c.name).indexOf(normField(pl.field)) > -1;
    })[0];
    if(byGFName) return byGFName;
  }

  /* ۳) پایه + شاخهٔ کلاس (ابتدایی و متوسطه اول) */
  if(pl.grade && !pl.field){
    var cands = list.filter(function(c){
      var cg = c.grade_level || ((typeof gradeFromName === 'function') ? gradeFromName(c.name) : null);
      return Number(cg) === pl.grade && !c.field;
    });
    if(pl.section){
      var byS = cands.filter(function(c){
        return normField(faDigits(c.name)).indexOf(normField(faDigits(pl.section))) > -1;
      })[0];
      if(byS) return byS;
    } else if(cands.length === 1) return cands[0];
  }
  return null;
}

/**
 * برنامهٔ کلاس‌بندی برای مجموعه‌ای از ردیف‌های اکسل.
 * می‌گوید کدام کلاس‌ها باید ساخته شوند و هر دانش‌آموز کجا می‌رود.
 *
 * @param {Array} rows  آرایه‌ای از {index, text}
 * @returns {{plan:Object, create:Array, warnings:Array}}
 */
function planPlacement(rows, schoolId){
  var plan = Object.create(null);   /* index → {classId|key} */
  var create = [];                  /* کلاس‌های نو */
  var seen = Object.create(null);
  var warnings = [];

  rows.forEach(function(r){
    var pl = parsePlacement(r.text, schoolId);
    if(!pl){ plan[r.index] = null; return; }

    /* رشته‌ای که مدرسه ارائه نمی‌دهد */
    if(pl.field && !pl.offered){
      warnings.push({ index: r.index, text: r.text, field: pl.field,
        msg: 'رشتهٔ «' + pl.field + '» جزو شاخه‌های این مدرسه نیست' });
    }

    var ex = findClassFor(pl, schoolId);
    if(ex){ plan[r.index] = { classId: ex.id, name: ex.name, pl: pl }; return; }

    var key = pl.name;
    if(!seen[key]){
      seen[key] = true;
      create.push(pl);
    }
    plan[r.index] = { classId: null, key: key, name: pl.name, pl: pl };
  });

  return { plan: plan, create: create, warnings: warnings };
}

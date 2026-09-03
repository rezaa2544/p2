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
  /* ⚠️ الکتروتکنیک و الکترونیک دو رشتهٔ جدا هستند — یکی نکنید.
     «برق» در گفتار مدرسه‌ها به الکتروتکنیک اشاره دارد. */
  'الکتروتکنیک': 'الکتروتکنیک',
  'الکترو تکنیک': 'الکتروتکنیک',
  'برق': 'الکتروتکنیک',
  'برق صنعتی': 'الکتروتکنیک',
  'برق ساختمان': 'الکتروتکنیک',
  'الکترونیک': 'الکترونیک',
  'الکترونيک': 'الکترونیک',
  'مخابرات': 'الکترونیک',
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
/**
 * ساخت نقشه‌های جست‌وجوی کلاس برای یک مدرسه.
 *
 * چرا نقشه و نه filter؟
 * پیش‌تر findClassFor برای هر ردیف تا چهار بار روی کل فهرست
 * کلاس‌ها filter می‌زد ⇒ O(ردیف × کلاس).
 * سنجش: ۳۰۰۰ ردیف با ۹ کلاس ۲۱۱ms بود، ولی با ۱۵۹ کلاس
 * ۱۰۰۳ms — یعنی ۴٫۸ برابر کندتر بدون آنکه حتی یک ردیف
 * اضافه شود.
 *
 * ⚠️ درس روش‌شناختی: بنچمارک اولیه فقط تعداد ردیف را زیاد کرده
 * بود و خطی درآمد، پس «سالم» به نظر رسید. تابعی که دو ورودی
 * دارد دو محور دارد؛ ثابت نگه داشتن یکی مشکل روی دیگری را
 * پنهان می‌کند. دادهٔ نمونه ۹ کلاس دارد ⇒ کاملاً نامرئی بود.
 *
 * @param {number} schoolId
 * @returns {{byName:Object, byGF:Object, byGrade:Object, all:Array}}
 */
function buildClassIndex(schoolId){
  var byName = Object.create(null);   /* نام یکسان‌سازی‌شده ⇐ کلاس */
  var byNameDigit = Object.create(null); /* نام با ارقام لاتین ⇐ true */
  var byGF = Object.create(null);     /* "پایه|رشته" ⇐ [کلاس] */
  var byGrade = Object.create(null);  /* پایه ⇐ [کلاس بدون رشته] */
  var all = [];

  db.classes.forEach(function(c){
    if(c.school_id !== schoolId) return;
    all.push(c);

    var nm = normField(c.name);
    /* نخستین تطبیق برنده است تا با رفتار filter()[0] یکی بماند */
    if(nm && byName[nm] === undefined) byName[nm] = c;
    /* نام با ارقام یکسان‌شده، برای تشخیص «شعبهٔ صریح» بدون حلقه */
    var nd = normField(faDigits(c.name));
    if(nd) byNameDigit[nd] = true;

    var cg = c.grade_level ||
      ((typeof gradeFromName === 'function') ? gradeFromName(c.name) : null);
    if(cg == null) return;
    cg = Number(cg);

    if(c.field){
      var k = cg + '|' + normField(c.field);
      (byGF[k] = byGF[k] || []).push(c);
    } else {
      (byGrade[cg] = byGrade[cg] || []).push(c);
    }
  });

  return { byName: byName, byNameDigit: byNameDigit,
           byGF: byGF, byGrade: byGrade, all: all };
}

/**
 * یافتن کلاس موجود برای یک تشخیص کلاس‌بندی.
 *
 * @param {Object} pl        خروجی parsePlacement
 * @param {number} schoolId
 * @param {Object} [idx]     نقشهٔ buildClassIndex — اختیاری.
 *   ⚠️ در حلقه حتماً پاس داده شود، وگرنه نقشه به ازای هر ردیف
 *   دوباره ساخته می‌شود و همان رفتار درجه‌دوم برمی‌گردد.
 */
function findClassFor(pl, schoolId, idx){
  if(!pl) return null;
  if(!idx) idx = buildClassIndex(schoolId);

  /* ۱) تطبیق دقیق نام */
  var byName = idx.byName[normField(pl.name)];
  if(byName) return byName;

  /* ۲) تطبیق پایه + رشته */
  if(pl.grade && pl.field){
    var nf = normField(pl.field);
    var exact = idx.byGF[pl.grade + '|' + nf];
    if(exact && exact.length){
      /* ⚠️ اگر متن خام شمارهٔ شعبه دارد، نباید کورکورانه اولی را
         داد. «دهم علوم تجربی ۳» باید شعبهٔ ۳ را بیابد نه ۱.
         parsePlacement برای کلاس‌های رشته‌ای section را پر
         نمی‌کند، پس شماره فقط در raw هست. */
      var rawTxt = normField(faDigits(pl.raw || ''));
      if(exact.length > 1 && rawTxt){
        for(var e = 0; e < exact.length; e++){
          if(normField(faDigits(exact[e].name)) === rawTxt) return exact[e];
        }
        var tail = rawTxt.match(/(\S+)$/);
        if(tail){
          for(var e2 = 0; e2 < exact.length; e2++){
            var cn = normField(faDigits(exact[e2].name));
            if(cn !== normField(faDigits(pl.name)) &&
               cn.slice(-tail[1].length - 1) === ' ' + tail[1]) return exact[e2];
          }
        }
      }
      return exact[0];
    }

    /* رشته در نام کلاس آمده ولی در میدان field ثبت نشده.
       اینجا جست‌وجوی زیررشته لازم است و کلید مستقیم کار نمی‌کند؛
       ولی دامنه به کلاس‌های همان پایه محدود می‌شود، نه کل فهرست. */
    var sameGrade = (idx.byGrade[pl.grade] || []).concat(
      Object.keys(idx.byGF).reduce(function(acc, k){
        if(k.indexOf(pl.grade + '|') === 0) acc = acc.concat(idx.byGF[k]);
        return acc;
      }, []));
    for(var i = 0; i < sameGrade.length; i++){
      if(normField(sameGrade[i].name).indexOf(nf) > -1) return sameGrade[i];
    }
  }

  /* ۳) پایه + شاخهٔ کلاس (ابتدایی و متوسطه اول) */
  if(pl.grade && !pl.field){
    var cands = idx.byGrade[pl.grade] || [];
    if(pl.section){
      var ns = normField(faDigits(pl.section));
      for(var j = 0; j < cands.length; j++){
        if(normField(faDigits(cands[j].name)).indexOf(ns) > -1) return cands[j];
      }
    } else if(cands.length === 1) return cands[0];
  }
  return null;
}

/**
 * آیا کاربر شعبه را صریح مشخص کرده؟
 *
 * ⚠️ دام: detectSection برای کلاس‌های رشته‌ای (پایهٔ ۱۰ به بالا)
 * شماره را نمی‌خواند و pl.section خالی می‌ماند. یعنی
 * «دهم علوم تجربی ۳» و «دهم تجربی» هر دو pl یکسان می‌دهند.
 * پس متن خام هم باید سنجیده شود، نه فقط pl.section.
 */
function hasExplicitSection(pl, idx){
  if(!pl) return false;
  if(pl.section) return true;
  var raw = normField(faDigits(pl.raw || ''));
  if(!raw) return false;
  var canon = normField(faDigits(pl.name || ''));

  /* متن دقیقاً همان نام متعارف است ⇒ انتخاب صریح نیست.
     ⚠️ «دهم علوم تجربی» اسم رشته است نه اسم شعبه؛ اگر مدرسه
     کلاسی هم‌نام داشته باشد نباید همه آنجا تلنبار شوند. */
  if(raw === canon) return false;

  /* چیزی بیش از نام متعارف در متن هست ⇒ شعبه مشخص شده */
  if(canon && raw.indexOf(canon) === 0 && raw.slice(canon.length).trim()) return true;

  /* نشانهٔ شعبه در پایان متن: عدد یا حرف الفبایی تک.
     مدارس ایرانی هر دو شکل «دهم تجربی ۲» و «دهم تجربی الف» را
     می‌نویسند. */
  if(/\s\d+$/.test(raw) && !/^\d+$/.test(raw)) return true;
  if(/\s(الف|ب|ج|د|ه|و|ز)$/.test(raw)) return true;

  /* واپسین راه: نام یک کلاس موجود عیناً آمده باشد.
     ⚠️ اینجا پیش‌تر حلقه روی نامزدها بود. سنجش تفکیکی نشان داد
     با ۱۵۱ نامزد، ۷۵۱ms از ۹۰۴ms کل زمان را می‌خورد — چون برای
     هر ردیف روی همهٔ نامزدها normField صدا می‌زد. حالا نقشهٔ
     byNameDigit یک بار در buildClassIndex ساخته می‌شود و اینجا
     فقط یک جست‌وجوی کلید انجام می‌گیرد. */
  return !!(idx && idx.byNameDigit && idx.byNameDigit[raw]);
}

/**
 * برنامهٔ کلاس‌بندی برای مجموعه‌ای از ردیف‌های اکسل.
 * می‌گوید کدام کلاس‌ها باید ساخته شوند و هر دانش‌آموز کجا می‌رود.
 *
 * @param {Array} rows  آرایه‌ای از {index, text}
 * @returns {{plan:Object, create:Array, warnings:Array}}
 */
function planPlacement(rows, schoolId, opts){
  var plan = Object.create(null);   /* index → {classId|key} */
  var create = [];                  /* کلاس‌های نو */
  var seen = Object.create(null);
  var warnings = [];
  var manual = [];                  /* ردیف‌هایی که جا نشدند */
  /* نقشه یک بار ساخته می‌شود، نه به ازای هر ردیف */
  var idx = buildClassIndex(schoolId);

  var cfg = Object.assign({}, placeSettings(schoolId), opts || {});
  /* اشغال فقط وقتی لازم است که توزیع روشن باشد */
  var occ = cfg.autoDistribute ? buildOccupancy(schoolId) : null;
  /* فقط وقتی کلید روشن است ساخته می‌شود؛ null یعنی ردگیری خاموش */
  var famClass = cfg.keepSiblings ? Object.create(null) : null;

  /* 🔒 ترتیب ردیف‌ها حفظ می‌شود؛ مرتب‌سازی دوباره تکرارپذیری را
     می‌شکند وقتی دو ردیف امتیاز برابر دارند. */
  rows.forEach(function(r){
    var pl = parsePlacement(r.text, schoolId);
    if(!pl){ plan[r.index] = null; return; }

    /* رشته‌ای که مدرسه ارائه نمی‌دهد */
    if(pl.field && !pl.offered){
      warnings.push({ index: r.index, text: r.text, field: pl.field,
        msg: 'رشتهٔ «' + pl.field + '» جزو شاخه‌های این مدرسه نیست' });
    }

    /* ── ۱) تطبیق: اگر فایل شعبه را صریح گفته، همان محترم است ──
       ⚠️ دام: وقتی چند شعبهٔ هم‌پایه/هم‌رشته هست، findClassFor
       بی‌دلیل اولی را برمی‌گرداند. آنجا انتخاب کار توزیع است نه
       تطبیق. پس فقط تطبیق «بدون ابهام» محترم شمرده می‌شود:
       نام دقیق، یا شعبهٔ صریح، یا تنها نامزد موجود. */
    var ambiguous = false;
    var cands = cfg.autoDistribute ? branchCandidates(pl, idx) : [];
    if(cfg.autoDistribute && cands.length > 1 && !hasExplicitSection(pl, idx)){
      /* ⚠️ دام واقعی: مدرسه‌ای که یک کلاس بی‌شماره به نام «دهم علوم
         تجربی» دارد و بعد شعبهٔ ۱ و ۲ اضافه کرده. تطبیق نام دقیق
         روی همان کلاس بی‌شماره می‌افتد و همهٔ دانش‌آموزان آنجا
         تلنبار می‌شوند. وقتی چند شعبهٔ هم‌رشته هست، نام متعارف
         دیگر یک انتخاب صریح نیست. */
      ambiguous = true;
    }

    var ex = ambiguous ? null : findClassFor(pl, schoolId, idx);
    if(ex){
      plan[r.index] = { classId: ex.id, name: ex.name, pl: pl };
      if(occ && occ[ex.id]) bumpOcc(occ[ex.id], r.gender);
      if(occ) rememberFamily(famClass, r, ex.id, pl.grade);
      return;
    }

    /* ── ۲) توزیع: چند شعبهٔ هم‌پایه هست ولی کدام؟ ── */
    if(cfg.autoDistribute){
      if(cands.length){
        var fk = familyKey(r);
        var got = pickBranch(cands, occ, {
          gender: r.gender || null,
          separateGender: cfg.separateGender,
          /* ⚠️ فقط در همان پایه؛ خواهر و برادر معمولاً هم‌پایه نیستند */
          prefer: (famClass && fk && famClass[fk] !== undefined
                   && famClass[fk].grade === pl.grade) ? famClass[fk].id : null
        });

        if(got && got.cls){
          plan[r.index] = { classId: got.cls.id, name: got.cls.name, pl: pl, auto: true };
          bumpOcc(occ[got.cls.id], r.gender);
          rememberFamily(famClass, r, got.cls.id, pl.grade);
          return;
        }
        if(got && got.full){
          /* ⚠️ نه ساخت خودکار کلاس، نه نادیده گرفتن ظرفیت */
          var caps = cands.map(function(c){
            var o = occ[c.id] || {};
            return { id: c.id, name: c.name, n: o.n || 0, cap: o.cap || 0 };
          });
          manual.push({ index: r.index, text: r.text, name: pl.name, candidates: caps });
          plan[r.index] = { classId: null, manual: true, name: pl.name, pl: pl };
          return;
        }
      }
    }

    /* ── ۳) هیچ نامزدی نبود ⇒ کلاس نو (رفتار پیشین) ── */
    var key = pl.name;
    if(!seen[key]){
      seen[key] = true;
      create.push(pl);
    }
    plan[r.index] = { classId: null, key: key, name: pl.name, pl: pl };
  });

  return { plan: plan, create: create, warnings: warnings, manual: manual, occ: occ };
}

/** افزودن یک نفر به شمارندهٔ درون‌حافظه‌ای کلاس */
function bumpOcc(o, gender){
  if(!o) return;
  o.n++;
  if(gender === 'پسر') o.boys++;
  else if(gender === 'دختر') o.girls++;
}

/**
 * ثبت کلاس خانواده برای ترجیح خواهر و برادر.
 * ⚠️ فقط در همان پایه معنا دارد؛ خواهر و برادر معمولاً هم‌پایه
 * نیستند و این قاعده عملاً برای دوقلوهاست.
 */
function rememberFamily(map, row, classId, grade){
  if(!map) return;
  var fk = familyKey(row);
  if(fk && map[fk] === undefined) map[fk] = { id: classId, grade: grade || null };
}

/* ══════════════════════════════════════════════════════════════
   توزیع خودکار میان شعبه‌های هم‌پایه
   ══════════════════════════════════════════════════════════════

   تفاوت «تطبیق» با «توزیع»:
   findClassFor تطبیق می‌کند — می‌فهمد «دهم تجربی ۲» کدام کلاس است.
   اگر فایل فقط بگوید «دهم تجربی» و سه شعبه باشد، null می‌دهد.
   توزیع یعنی سامانه خودش شعبه را انتخاب کند.

   ⚠️ توزیع فقط وقتی وارد می‌شود که تطبیق شکست خورده باشد. اگر
   مدرسه شعبه را در فایل نوشته، همان محترم است.

   🔒 تکرارپذیری تضمین‌شده: هیچ Math.random در این مسیر نیست و
   گره‌گشایی با شناسهٔ کوچک‌تر انجام می‌شود. همان فایل ⇒ همان نتیجه.
   ============================================================== */

/** تنظیمات توزیع؛ هر دو قانون اختیاری پیش‌فرض خاموش‌اند */
var PLACE_DEFAULTS = { autoDistribute: true, separateGender: false, keepSiblings: false };

/**
 * خواندن تنظیمات توزیع یک مدرسه.
 * ⚠️ در مدرسهٔ تک‌جنسیتی کلید تفکیک جنسیتی بی‌معناست و خاموش
 * برمی‌گردد، حتی اگر مدیر روشنش کرده باشد.
 */
function placeSettings(schoolId){
  var sc = (typeof byId === 'function') ? byId('schools', schoolId) : null;
  var saved = (sc && sc.place_rules) ? sc.place_rules : {};
  var out = Object.assign({}, PLACE_DEFAULTS, saved);
  var g = sc && sc.gender;
  if(g === 'پسرانه' || g === 'دخترانه') out.separateGender = false;
  return out;
}

/** آیا مدرسه مختلط است؟ کلید جنسیت فقط آنجا معنا دارد. */
function isMixedSchool(schoolId){
  var sc = (typeof byId === 'function') ? byId('schools', schoolId) : null;
  var g = sc && sc.gender;
  return !(g === 'پسرانه' || g === 'دخترانه');
}

/**
 * وضعیت اشغال کلاس‌های یک مدرسه: شمار ثبت‌نام و جنسیت غالب.
 *
 * ⚠️ این شمارنده در حافظه به‌روز می‌شود، نه از db خوانده. اگر هر
 * ردیف دوباره db را بخواند، هر سه هزار ردیف به یک کلاس می‌روند
 * چون هیچ‌کدام هنوز ثبت نشده‌اند.
 */
function buildOccupancy(schoolId){
  var occ = Object.create(null);
  db.classes.forEach(function(c){
    if(c.school_id !== schoolId) return;
    occ[c.id] = { n: 0, cap: Number(c.capacity) || 30, boys: 0, girls: 0 };
  });
  var byCls = (typeof idxEnrollByClass === 'function') ? idxEnrollByClass() : null;
  Object.keys(occ).forEach(function(cid){
    var list = byCls ? (byCls.get(Number(cid)) || [])
      : db.enrollments.filter(function(e){ return e.class_id === Number(cid); });
    occ[cid].n = list.length;
    list.forEach(function(e){
      var st = (typeof byId === 'function') ? byId('users', e.student_id) : null;
      if(!st) return;
      if(st.gender === 'پسر') occ[cid].boys++;
      else if(st.gender === 'دختر') occ[cid].girls++;
    });
  });
  return occ;
}

/** جنسیت غالب یک کلاس؛ کلاس خالی جنسیت ندارد و همه‌کس می‌تواند برود */
function classGender(o){
  if(!o || (!o.boys && !o.girls)) return null;
  return o.boys > o.girls ? 'پسر' : (o.girls > o.boys ? 'دختر' : null);
}

/**
 * انتخاب شعبه میان نامزدهای هم‌پایه.
 *
 * قاعده: کم‌جمعیت‌ترین شعبهٔ واجد شرایط.
 * این یک قاعده هم‌زمان ظرفیت و تعادل را برآورده می‌کند.
 *
 * @param {Array}  cands نامزدها (کلاس‌های هم‌پایه/هم‌رشته)
 * @param {Object} occ   خروجی buildOccupancy، در حافظه به‌روز
 * @param {Object} opt   {gender, separateGender, prefer}
 * @returns {{cls:Object}|{full:true}|null}
 */
function pickBranch(cands, occ, opt){
  if(!cands || !cands.length) return null;
  opt = opt || {};
  var fit = [], anyBlocked = false;

  cands.forEach(function(c){
    var o = occ[c.id] || { n: 0, cap: Number(c.capacity) || 30, boys: 0, girls: 0 };
    if(o.n >= o.cap){ anyBlocked = true; return; }
    if(opt.separateGender && opt.gender){
      var cg = classGender(o);
      if(cg && cg !== opt.gender){ anyBlocked = true; return; }
    }
    fit.push({ c: c, n: o.n });
  });

  if(!fit.length) return anyBlocked ? { full: true } : null;

  /* ترجیح خواهر و برادر: الزام نیست، فقط اگر جا باشد.
     ⚠️ ظرفیت مقدم است — کلاس پر از fit حذف شده و اینجا نمی‌آید. */
  if(opt.prefer){
    var sib = fit.filter(function(f){ return f.c.id === opt.prefer; })[0];
    if(sib) return { cls: sib.c };
  }

  /* 🔒 گره‌گشایی قطعی: امتیاز برابر ⇒ شناسهٔ کوچک‌تر.
     بدون این، ترتیب می‌تواند بین اجراها فرق کند و تکرارپذیری
     از بین برود. */
  fit.sort(function(a, b){ return (a.n - b.n) || (a.c.id - b.c.id); });
  return { cls: fit[0].c };
}

/** نامزدهای هم‌پایه (و هم‌رشته اگر رشته دارد) از نقشه */
function branchCandidates(pl, idx){
  if(!pl || !pl.grade) return [];
  /* ⚠️ بدون slice: این تابع به ازای هر ردیف صدا زده می‌شود و کپی
     گرفتن از فهرست ۱۵۰تایی، هزینهٔ درجه‌دوم تازه‌ای می‌سازد.
     سنجش: با slice ۹۱۷ms، بدون آن ۱۴۰ms.
     فراخوان‌ها این آرایه را تغییر نمی‌دهند. */
  if(pl.field) return idx.byGF[pl.grade + '|' + normField(pl.field)] || [];
  return idx.byGrade[pl.grade] || [];
}

/** کلید خانواده برای تشخیص خواهر و برادر — فقط کد ملی والدین */
function familyKey(row){
  if(!row) return null;
  /* ⚠️ نام خانوادگی مبنا نیست: «محمدی» در یک مدرسه ده‌ها نفر است */
  return row.father_nid || row.mother_nid || null;
}

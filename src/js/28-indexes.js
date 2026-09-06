/* ==================== لایه ایندکس و مقیاس‌پذیری ====================
   هدف: حذف جستجوی خطی O(n) از مسیرهای داغ و تبدیل آن به O(1).

   قرارداد صحت (مهم):
   هر ایندکس با شمارندهٔ نسخهٔ همان مجموعه اعتبارسنجی می‌شود. هر تغییر
   داده از مسیر applyOp شمارنده را جلو می‌برد و ایندکس در نخستین
   استفادهٔ بعدی بازساخته می‌شود. پس ایندکس هرگز داده‌ی کهنه نمی‌دهد.
   ==================================================================== */

/** شمارندهٔ نسخه به ازای هر مجموعه */
var IDX_VER = Object.create(null);
/** مخزن ایندکس‌های ساخته‌شده */
var IDX_CACHE = Object.create(null);
/** آمار برای سنجش کارایی */
var IDX_STATS = { builds:0, hits:0, misses:0 };

/** باطل‌سازی ایندکس‌های یک مجموعه (از applyOp صدا زده می‌شود) */
function idxInvalidate(coll){
  if(!coll){ IDX_VER=Object.create(null); IDX_CACHE=Object.create(null); return; }
  IDX_VER[coll] = (IDX_VER[coll]||0) + 1;
}

/**
 * درج افزایشی: رکورد تازه را به ایندکس‌های ساخته‌شده اضافه می‌کند
 * به‌جای دور انداختن آن‌ها.
 *
 * چرا لازم شد؟ هر insert ایندکس را باطل می‌کرد و insert بعدی مجبور
 * بود کل مجموعه را از نو بسازد. در ورود ۲٬۰۰۰ ردیف اکسل (۶٬۰۰۰ درج
 * روی جدولی با ۱۲٬۰۰۰ کاربر) این رفتار درجه‌دوم می‌شد:
 * سنجش پیش از رفع ⇒ ۱۴٬۲۵۷ms برای ۲۰۰۰ ردیف.
 *
 * ⚠️ فقط برای «درج» امن است. در ویرایش یا حذف، کلید ایندکس ممکن است
 * عوض شده باشد و رکورد قدیمی باید از سطل قبلی برداشته شود — آنجا
 * همچنان idxInvalidate درست است.
 */
function idxAppend(coll, rec){
  if(!rec) return;
  var ver = IDX_VER[coll]||0;
  var pre = coll+'::';
  Object.keys(IDX_CACHE).forEach(function(key){
    if(key.indexOf(pre) !== 0) return;
    var e = IDX_CACHE[key];
    if(!e || e.ver !== ver || !e.keyFn) return;
    var k;
    try{ k = e.keyFn(rec); }catch(err){ delete IDX_CACHE[key]; return; }
    if(k === undefined || k === null) return;
    if(e.uniq) e.map.set(k, rec);
    else {
      var b = e.map.get(k);
      if(b) b.push(rec); else e.map.set(k, [rec]);
    }
  });
}

/** باطل‌سازی کامل (پس از بازتولید داده یا ورود کاربر) */
function idxReset(){
  IDX_VER = Object.create(null);
  IDX_CACHE = Object.create(null);
  IDX_STATS = { builds:0, hits:0, misses:0 };
}

/**
 * ایندکس گروهی: کلید → آرایه‌ای از رکوردها
 * @param {string} coll نام مجموعه
 * @param {string} name نام یکتای ایندکس
 * @param {function} keyFn رکورد → کلید (یا undefined برای نادیده گرفتن)
 */
function idxGroup(coll, name, keyFn){
  var key = coll+'::'+name;
  var ver = IDX_VER[coll]||0;
  var hit = IDX_CACHE[key];
  if(hit && hit.ver===ver){ IDX_STATS.hits++; return hit.map; }
  IDX_STATS.misses++; IDX_STATS.builds++;
  var m = new Map(), arr = db[coll]||[];
  for(var i=0;i<arr.length;i++){
    var r = arr[i], k = keyFn(r);
    if(k===undefined || k===null) continue;
    var b = m.get(k);
    if(b) b.push(r); else m.set(k,[r]);
  }
  IDX_CACHE[key] = { ver:ver, map:m, keyFn:keyFn, uniq:false };
  return m;
}

/**
 * ایندکس یکتا: کلید → یک رکورد (آخرین برنده)
 */
function idxUnique(coll, name, keyFn){
  var key = coll+'::u::'+name;
  var ver = IDX_VER[coll]||0;
  var hit = IDX_CACHE[key];
  if(hit && hit.ver===ver){ IDX_STATS.hits++; return hit.map; }
  IDX_STATS.misses++; IDX_STATS.builds++;
  var m = new Map(), arr = db[coll]||[];
  for(var i=0;i<arr.length;i++){
    var r = arr[i], k = keyFn(r);
    if(k===undefined || k===null) continue;
    m.set(k,r);
  }
  IDX_CACHE[key] = { ver:ver, map:m, keyFn:keyFn, uniq:true };
  return m;
}

/* ---------- ایندکس‌های آماده برای مسیرهای داغ ---------- */

/** کد ملی → کاربر. nidOwner پیش‌تر خطی بود و در ورود انبوه اکسل
    به ازای هر ردیف کل جدول کاربران را می‌پیمود. */
function idxUserByNid(){
  return idxUnique('users','national_id',function(u){
    return u.national_id ? String(u.national_id) : undefined;
  });
}

/** id → رکورد (جایگزین find خطی در byId) */
function idxById(coll){
  return idxUnique(coll,'id',function(r){ return r.id; });
}

/** class_id → ثبت‌نام‌ها */
function idxEnrollByClass(){
  return idxGroup('enrollments','class_id',function(e){ return e.class_id; });
}

/** student_id → ثبت‌نام (هر دانش‌آموز یک کلاس فعال) */
function idxEnrollByStudent(){
  return idxUnique('enrollments','student_id',function(e){ return e.student_id; });
}

/** "class_id|date" → رکوردهای حضور آن روز */
function idxAttByClassDate(){
  return idxGroup('attendance','class_date',function(a){ return a.class_id+'|'+a.date; });
}

/** student_id → رکوردهای حضور */
function idxAttByStudent(){
  return idxGroup('attendance','student_id',function(a){ return a.student_id; });
}

/** student_id → نمرات */
function idxGradesByStudent(){
  return idxGroup('grades','student_id',function(g){ return g.student_id; });
}

/** teacher_id → برنامه‌ها */
function idxScheduleByTeacher(){
  return idxGroup('schedule','teacher_id',function(s){ return s.teacher_id; });
}

/* ---------- کمکی: مرتب‌سازی فارسی با کش کلید ----------
   localeCompare فارسی گران است. با Intl.Collator یک‌بار ساخته
   و کلید مرتب‌سازی کش می‌شود.                                */
var FA_COLLATOR = (function(){
  try { return new Intl.Collator('fa'); }
  catch(e){ return { compare:function(a,b){ return String(a).localeCompare(String(b)); } }; }
})();

function sortByNameFa(list){
  return list.slice().sort(function(a,b){
    return FA_COLLATOR.compare(a.full_name||'', b.full_name||'');
  });
}

/* ---------- گزارش سلامت ایندکس (برای پنل تشخیص) ---------- */
function idxReport(){
  var keys = Object.keys(IDX_CACHE), rows = [];
  for(var i=0;i<keys.length;i++){
    rows.push({ name:keys[i], size:IDX_CACHE[keys[i]].map.size, ver:IDX_CACHE[keys[i]].ver });
  }
  return { stats:IDX_STATS, indexes:rows };
}

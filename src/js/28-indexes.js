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
  IDX_CACHE[key] = { ver:ver, map:m };
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
  IDX_CACHE[key] = { ver:ver, map:m };
  return m;
}

/* ---------- ایندکس‌های آماده برای مسیرهای داغ ---------- */

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

/** school_id → کلاس‌ها */
function idxClassesBySchool(){
  return idxGroup('classes','school_id',function(c){ return c.school_id; });
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

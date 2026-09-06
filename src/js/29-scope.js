/* ==================== لایه محدودهٔ داده (Data Scope) ====================
   مسئله: در مقیاس ملی (۱۰ میلیون دانش‌آموز) هیچ مرورگری نمی‌تواند و
   نباید کل داده را داشته باشد — هم غیرممکن است، هم نقض امنیت.

   راه‌حل: مرورگر فقط «برش» متعلق به کاربر را می‌گیرد. حجم این برش
   مستقل از اندازهٔ کشور است و ثابت می‌ماند.

   این ماژول قرارداد رسمی بین کلاینت و سرور را تعریف می‌کند و در نسخهٔ
   دمو همان برش را به‌صورت محلی می‌سازد تا رفتار یکسان بماند.
   ======================================================================== */

/** سقف‌های محافظ: هیچ پاسخی نباید از این بزرگ‌تر باشد */
var SCOPE_LIMITS = {
  maxRecords: 60000,      // سقف کل رکورد در حافظهٔ مرورگر
  maxBytes: 8 * 1048576,  // سقف حجم بستهٔ داده (۸ مگابایت)
  attendanceDays: 45,     // پنجرهٔ زمانی حضور و غیاب
  gradesTerms: 2,         // فقط ترم جاری و قبلی
  pageSize: 50            // اندازهٔ صفحه در فهرست‌های سرورمحور
};

/**
 * توصیف محدودهٔ دادهٔ مورد نیاز یک کاربر.
 * سرور باید دقیقاً همین را برگرداند — نه بیشتر.
 * @returns {object} توصیف‌گر محدوده
 */
function scopeDescriptor(user, persona){
  var role = persona || (user && user.role);
  var d = { role: role, user_id: user && user.id, since: null, collections: [] };
  var cut = (typeof daysAgoISO === 'function')
    ? daysAgoISO(SCOPE_LIMITS.attendanceDays) : null;
  d.since = cut;

  if(role === 'student'){
    d.scope = { student_id: user.id };
    d.collections = ['self','my_class','my_school_meta','attendance:self','grades:self',
                     'discipline:self','announcements:mine','notifications:mine','tuition:self'];
  } else if(role === 'parent'){
    d.scope = { parent_id: user.id, children: 'resolved_server_side' };
    d.collections = ['self','children','attendance:children','grades:children',
                     'discipline:children','announcements:mine','notifications:mine','tuition:children'];
  } else if(role === 'teacher'){
    d.scope = { teacher_id: user.id, classes: 'resolved_server_side' };
    d.collections = ['self','my_classes','students:my_classes','subjects:my_schools',
                     'attendance:my_classes:window','grades:my_classes:current_terms',
                     'schedule:self','announcements:mine','notifications:mine'];
  } else if(role === 'manager'){
    d.scope = { school_id: user.school_id };
    d.collections = ['school','users:school','classes:school','subjects:school',
                     'attendance:school:window','grades:school:current_terms',
                     'discipline:school:window','schedule:school','tuition:school',
                     'announcements:school','notifications:mine'];
  } else if(role === 'counselor'){
    /* 🔴 محدودیت مشاور (دور ۶۳): فقط صف ارجاع مدرسهٔ خودش.
       نمره/برنامه/پروندهٔ کامل دانش‌آموز در برش مشاور نیست —
       students فقط به‌اندازهٔ نام و کلاسِ ارجاع‌شده‌ها. */
    d.scope = { school_id: user.school_id, queue_only: true };
    d.collections = ['self','counselor_refs:school','students:referees:name-class',
                     'announcements:mine','notifications:mine'];
  } else if(role === 'edu_office'){
    /* ادارهٔ آموزش‌وپرورش هرگز دادهٔ فردی نمی‌گیرد — فقط تجمیع */
    d.scope = { office_id: user.office_id, aggregate_only: true };
    d.collections = ['office','schools:scope:meta','stats:aggregated','notifications:mine'];
  } else if(role === 'superadmin'){
    d.scope = { global: true, aggregate_only: true };
    d.collections = ['stats:national','schools:paged','offices','app_settings'];
  }
  return d;
}

function countBy(coll, fn){
  var a = db[coll] || [], n = 0;
  for(var i=0;i<a.length;i++) if(fn(a[i])) n++;
  return n;
}

/** آیا برش کاربر از سقف امن عبور کرده؟ */
function scopeHealth(){
  var total = 0, biggest = null, bn = 0;
  for(var k in db){
    if(!Array.isArray(db[k])) continue;
    total += db[k].length;
    if(db[k].length > bn){ bn = db[k].length; biggest = k; }
  }
  var over = total > SCOPE_LIMITS.maxRecords;
  return {
    total: total,
    biggest: biggest,
    biggestCount: bn,
    limit: SCOPE_LIMITS.maxRecords,
    ok: !over,
    message: over
      ? 'حجم دادهٔ بارگذاری‌شده از سقف امن عبور کرده — سرور باید محدودهٔ کوچک‌تری بفرستد.'
      : 'حجم دادهٔ بارگذاری‌شده در محدودهٔ امن است.'
  };
}


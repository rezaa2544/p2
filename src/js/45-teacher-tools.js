/* ═══════════════════════════════════════════════════════════════════
   ابزارهای دبیر: سابقهٔ چندساله و یادداشت خصوصی
   ═══════════════════════════════════════════════════════════════════
   بخش ۱ ▸ سال تحصیلی یک رکورد            yearOfDate()
   بخش ۲ ▸ سابقهٔ چندسالهٔ دانش‌آموز        studentYearHistory()
   بخش ۳ ▸ گارد دسترسی دبیر               teacherMaySeeHistory()
   بخش ۴ ▸ کارت نمایش سابقه
   بخش ۵ ▸ یادداشت خصوصی دبیر             teacher_notes
   بخش ۶ ▸ کارت و فرم یادداشت

   ─────────── تصمیم‌های سیاستی کاربر (دور ۴۴) ───────────
   🔴 سابقهٔ چندساله:
      • فقط **نمرات و حضور/غیاب** — موارد انضباطی سال‌های گذشته
        در دسترس دبیر نیست. دلیل: قضاوت پیشینی دربارهٔ دانش‌آموز.
      • فقط دانش‌آموزانی که **امروز در کلاس همین دبیر** هستند.

   🔴 یادداشت خصوصی:
      • مدیر مدرسه می‌بیند · والدین نمی‌بینند.
      • هنگام تغییر مدرسهٔ دبیر، یادداشت‌ها **با مدرسه** می‌مانند
        نه با دبیر (پس `school_id` کلید مالکیت است).
      • هشدار صریح در رابط: «خصوصی» یعنی ولی نمی‌بیند، نه اینکه
        در بازرسی رسمی قابل مطالبه نباشد.
   ═══════════════════════════════════════════════════════════════════ */

/* ─────────────── بخش ۱: سال تحصیلی یک تاریخ ─────────────── */

/**
 * سال تحصیلی یک تاریخ میلادی («۱۴۰۴-۱۴۰۵»).
 *
 * ⚠️ سال تحصیلی ایران از **مهر** شروع می‌شود، نه فروردین. پس
 * تاریخ‌های ماه ۱ تا ۶ به سال تحصیلی قبل تعلق دارند. همان منطق
 * yearCode() ولی برای تاریخ دلخواه، نه امروز.
 */
function yearOfDate(iso){
  if(!iso) return null;
  var p = String(iso).slice(0, 10).split('-').map(Number);
  if(p.length < 3 || isNaN(p[0])) return null;
  var j;
  try{ j = toJalali(p[0], p[1], p[2]); }catch(e){ return null; }
  if(!j) return null;
  var st = j[1] >= 7 ? j[0] : j[0] - 1;
  return st + '-' + (st + 1);
}

/* ─────────────── بخش ۲: سابقهٔ چندساله ─────────────── */

/**
 * کارنامهٔ سال‌به‌سال یک دانش‌آموز.
 *
 * خروجی: [{year, isCurrent, grades:{n,avg}, attendance:{n,present,rate}}]
 * تازه‌ترین سال اول.
 *
 * ⚠️ عمداً موارد انضباطی برنمی‌گردد — تصمیم سیاستی کاربر.
 * اگر روزی خواستید اضافه شود، اینجا و در کارت نمایش هر دو باید
 * تغییر کند و آزمون نگهبانش هم به‌روز شود.
 */
function studentYearHistory(studentId){
  var byYear = Object.create(null);
  var touch = function(y){
    if(!byYear[y]) byYear[y] = {
      year: y, gN: 0, gSum: 0, aN: 0, aPresent: 0, aAbsent: 0, aLate: 0
    };
    return byYear[y];
  };

  var gi = (typeof idxGradesByStudent === 'function') ? idxGradesByStudent() : null;
  var grades = gi ? (gi.get(studentId) || [])
    : (db.grades || []).filter(function(g){ return g.student_id === studentId; });
  grades.forEach(function(g){
    var y = yearOfDate(g.created_at);
    if(!y) return;
    var max = Number(g.max_score) || 20;
    var sc = Number(g.score);
    if(isNaN(sc)) return;
    var r = touch(y);
    r.gN++;
    /* ⚠️ نرمال به ۲۰ — همان دلیل نمودار روند: ۸ از ۱۰ ≠ ۸ از ۲۰ */
    r.gSum += (sc / max) * 20;
  });

  var ai = (typeof idxAttByStudent === 'function') ? idxAttByStudent() : null;
  var att = ai ? (ai.get(studentId) || [])
    : (db.attendance || []).filter(function(a){ return a.student_id === studentId; });
  att.forEach(function(a){
    var y = yearOfDate(a.date);
    if(!y) return;
    var r = touch(y);
    r.aN++;
    if(a.status === 'present') r.aPresent++;
    else if(a.status === 'absent') r.aAbsent++;
    else if(a.status === 'late') r.aLate++;
  });

  var now = (typeof yearCode === 'function') ? yearCode() : null;
  return Object.keys(byYear).sort().reverse().map(function(y){
    var r = byYear[y];
    return {
      year: y,
      isCurrent: y === now,
      grades: { n: r.gN, avg: r.gN ? Math.round(r.gSum / r.gN * 100) / 100 : null },
      attendance: {
        n: r.aN, present: r.aPresent, absent: r.aAbsent, late: r.aLate,
        rate: r.aN ? Math.round(r.aPresent / r.aN * 1000) / 10 : null
      }
    };
  });
}

/* ─────────────── بخش ۳: گارد دسترسی ─────────────── */

/**
 * آیا این دبیر مجاز است سابقهٔ این دانش‌آموز را ببیند؟
 *
 * 🔴 شرط سیاستی: فقط دانش‌آموزانی که **اکنون** در یکی از
 * کلاس‌های همین دبیر هستند. دبیر سال گذشته حق ندارد.
 *
 * ⚠️ مدیر و مدیر کل سامانه استثنا هستند (سرپرستی)، ولی فقط در
 * محدودهٔ مدرسهٔ خودشان.
 */
function teacherMaySeeHistory(studentId, userId){
  var u = userId ? byId('users', userId)
        : ((typeof S !== 'undefined') ? S.user : null);
  if(!u) return false;
  var role = (typeof activePersona === 'function' && !userId)
    ? activePersona() : u.role;

  if(role === 'superadmin') return true;
  var st = byId('users', studentId);
  if(!st) return false;
  if(role === 'manager') return st.school_id === u.school_id;
  if(role !== 'teacher') return false;

  /* دانش‌آموزان کلاس‌های فعلی این دبیر */
  var cls = (typeof teacherClasses === 'function') ? teacherClasses(u.id) : [];
  for(var i = 0; i < cls.length; i++){
    var roster = (typeof studentsOfClass === 'function') ? studentsOfClass(cls[i].id) : [];
    for(var j = 0; j < roster.length; j++){
      if(roster[j].id === studentId) return true;
    }
  }
  return false;
}

/* ─────────────── بخش ۴: کارت نمایش سابقه ─────────────── */

/** کارت سابقهٔ سال‌به‌سال؛ رشتهٔ خالی اگر مجاز یا موجود نباشد */
function yearHistoryCard(studentId){
  if(!teacherMaySeeHistory(studentId)) return '';
  var rows = studentYearHistory(studentId);
  if(rows.length < 2) return '';        /* یک سال = سابقه نیست */

  var body = rows.map(function(r){
    var g = r.grades.avg === null ? '—' : fa(r.grades.avg.toFixed(2));
    var a = r.attendance.rate === null ? '—' : fa(r.attendance.rate) + '٪';
    var tone = r.grades.avg === null ? 'b-gray'
      : (r.grades.avg >= 17 ? 'b-green' : (r.grades.avg >= 12 ? 'b-blue' : 'b-red'));
    return '<tr' + (r.isCurrent ? ' class="yh-current"' : '') + '>'
      + '<td><b>' + esc(faD(r.year)) + '</b>'
      + (r.isCurrent ? ' <span class="badge b-blue">سال جاری</span>' : '') + '</td>'
      + '<td><span class="badge ' + tone + '">' + g + '</span>'
      + ' <span class="small muted">' + fa(r.grades.n) + ' نمره</span></td>'
      + '<td>' + a + ' <span class="small muted">'
      + fa(r.attendance.absent) + ' غیبت · ' + fa(r.attendance.late) + ' تأخیر</span></td>'
      + '</tr>';
  }).join('');

  return '<div class="card"><div class="card-head"><h3>📚 سابقهٔ سال‌به‌سال</h3>'
    + '<span class="badge b-gray">' + fa(rows.length) + ' سال</span></div>'
    + '<div class="table-wrap"><table class="table"><thead><tr>'
    + '<th>سال تحصیلی</th><th>میانگین نمرات</th><th>درصد حضور</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table></div>'
    /* ⚠️ شفافیت دربارهٔ آنچه عمداً نشان داده نمی‌شود */
    + '<div class="card-foot small muted" style="line-height:1.9">'
    + 'سوابق انضباطی سال‌های گذشته در این نما نمایش داده نمی‌شود.'
    + '</div></div>';
}

/* ─────────────── بخش ۵: یادداشت خصوصی دبیر ─────────────── */

/**
 * یادداشت‌های یک دانش‌آموز که کاربر فعلی حق دیدنشان را دارد.
 *
 * 🔴 قاعدهٔ دسترسی (تصمیم کاربر):
 *   • دبیر: فقط یادداشت‌های **خودش**
 *   • مدیر: همهٔ یادداشت‌های **مدرسهٔ خودش**
 *   • ولی و دانش‌آموز: هیچ
 *
 * ⚠️ مالکیت با **مدرسه** است نه دبیر. اگر دبیر مدرسه‌اش را عوض
 * کند، یادداشت‌ها در مدرسهٔ قبلی می‌مانند و او دیگر نمی‌بیندشان —
 * چون فیلتر `school_id === S.user.school_id` هم اعمال می‌شود.
 */
function teacherNotesFor(studentId){
  if(typeof S === 'undefined' || !S.user) return [];
  var role = (typeof activePersona === 'function') ? activePersona() : S.user.role;
  if(role === 'parent' || role === 'student') return [];

  var all = (db.teacher_notes || []).filter(function(n){
    return n.student_id === studentId;
  });

  if(role === 'superadmin') return all.slice().reverse();
  if(role === 'manager'){
    return all.filter(function(n){ return n.school_id === S.user.school_id; })
              .slice().reverse();
  }
  if(role === 'teacher'){
    /* هم نویسنده و هم مدرسه باید بخواند — دبیرِ منتقل‌شده
       یادداشت‌های مدرسهٔ قبلی‌اش را نمی‌بیند. */
    return all.filter(function(n){
      return n.teacher_id === S.user.id && n.school_id === S.user.school_id;
    }).slice().reverse();
  }
  return [];
}

/** آیا کاربر فعلی می‌تواند برای این دانش‌آموز یادداشت بنویسد؟ */
function mayWriteNote(studentId){
  if(typeof S === 'undefined' || !S.user) return false;
  var role = (typeof activePersona === 'function') ? activePersona() : S.user.role;
  if(role !== 'teacher') return false;
  return teacherMaySeeHistory(studentId);   /* همان دامنه: کلاس فعلی */
}

/** ثبت یادداشت تازه */
function addTeacherNote(studentId, text){
  if(!mayWriteNote(studentId)) return null;
  var body = String(text || '').trim();
  if(body.length < 3) return null;
  var st = byId('users', studentId);
  return insert('teacher_notes', {
    /* 🔴 مالکیت با مدرسه است — کلید ماندگاری یادداشت پس از
       جابه‌جایی دبیر. */
    school_id:  S.user.school_id || (st ? st.school_id : null),
    student_id: studentId,
    teacher_id: S.user.id,
    body:       body,
    created_at: new Date().toISOString()
  });
}

/** حذف یادداشت — فقط نویسنده‌اش */
function removeTeacherNote(noteId){
  var n = byId('teacher_notes', noteId);
  if(!n) return false;
  if(typeof S === 'undefined' || !S.user) return false;
  if(n.teacher_id !== S.user.id) return false;
  remove('teacher_notes', noteId);
  return true;
}

/* ─────────────── بخش ۶: کارت یادداشت ─────────────── */

/**
 * هشدار حقوقی — عیناً همان چیزی که کاربر خواست.
 * 🔴 نباید حذف یا نرم شود: دبیری که گمان کند یادداشتش کاملاً
 * محرمانه است، ممکن است چیزی بنویسد که در بازرسی علیه خودش
 * یا مدرسه استفاده شود.
 */
var NOTE_LEGAL_WARN =
  '«خصوصی» یعنی ولی دانش‌آموز آن را نمی‌بیند — نه اینکه در بازرسی '
  + 'رسمی قابل مطالبه نباشد. مدیر مدرسه همهٔ یادداشت‌ها را می‌بیند.';

/** کارت یادداشت‌های خصوصی در پروندهٔ دانش‌آموز */
function teacherNotesCard(studentId){
  if(typeof S === 'undefined' || !S.user) return '';
  var role = (typeof activePersona === 'function') ? activePersona() : S.user.role;
  if(role === 'parent' || role === 'student') return '';

  var notes = teacherNotesFor(studentId);
  var canWrite = mayWriteNote(studentId);
  if(!notes.length && !canWrite) return '';

  var list = notes.map(function(n){
    var t = byId('users', n.teacher_id);
    var mine = n.teacher_id === S.user.id;
    return '<div class="tn-row">'
      + '<div class="row"><b class="small">' + esc(t ? t.full_name : 'دبیر') + '</b>'
      + '<span class="small muted">' + esc(shortStamp(n.created_at)) + '</span>'
      + '<div class="spacer"></div>'
      + (mine ? '<button class="icon-btn danger" title="حذف" data-act="tnote-del" data-id="'
                + escAttr(n.id) + '">🗑️</button>' : '')
      + '</div>'
      + '<div class="small" style="line-height:2">' + esc(n.body) + '</div></div>';
  }).join('');

  return '<div class="card"><div class="card-head"><h3>🔒 یادداشت خصوصی دبیر</h3>'
    + (canWrite ? '<button class="btn ghost sm" data-act="tnote-new" data-id="'
        + escAttr(studentId) + '">✏️ یادداشت تازه</button>' : '')
    + '</div>'
    + '<div class="tn-warn small">⚠️ ' + esc(NOTE_LEGAL_WARN) + '</div>'
    + (notes.length
        ? '<div class="card-body" style="display:grid;gap:10px">' + list + '</div>'
        : '<div class="card-body small muted">یادداشتی ثبت نشده است.</div>')
    + '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   بخش ۷ ▸ دادهٔ نمونهٔ سال گذشته (فاز ۱۲)
   ═══════════════════════════════════════════════════════════════════
   🔴 چرا لازم بود؟ سنجش دور ۴۴ نشان داد **همهٔ** دادهٔ نمونه در
   ۹۰ روز اخیر ساخته می‌شود. یعنی «سابقهٔ چندساله» هیچ چیزی برای
   نمایش نداشت و قابلیت تازه در دمو نامرئی می‌ماند.

   ⚠️ حجم: به‌جای بازسازی کامل سال گذشته، فقط **نمونهٔ سبک**
   ساخته می‌شود: چند نمره و چند روز حضور برای هر دانش‌آموز.

   🔴 دام کشف‌شده در دور ۴۴: نخستین نسخه از `insert()` استفاده
   می‌کرد و بوت برنامه را از ۳۱۲ms به بیش از دو دقیقه می‌برد.
   علت: هر `insert` رکوردی در دفترچهٔ تغییرات می‌نویسد و
   `saveLog()` را صدا می‌زند. دادهٔ نمونه باید از **`add()`**
   استفاده کند — همان چیزی که بقیهٔ `generate*` می‌کنند — چون
   دادهٔ نمونه «تغییر کاربر» نیست و نباید در دفترچه بیاید.

   ⚠️ سقف‌ها سنجیده‌اند نه حدسی: با ۴۰ دانش‌آموز × (۶ نمره + ۱۲
   حضور) حجم `db` به **۵٫۱۰MB** رسید و از سقف ~۵MB مرورگر رد شد.
   با ۱۵ دانش‌آموز × (۴ + ۸) به ~۴٫۷MB برگشت. پیش از افزایش این
   اعداد، حجم را دوباره بسنجید.
   ═══════════════════════════════════════════════════════════════════ */

/** تاریخ ISO مربوط به n روز پیش (بدون وابستگی به ماژول دیگر) */
function _yearAgoISO(daysBack){
  var d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/**
 * ساخت نمونهٔ سال تحصیلی گذشته: نمرات و حضور و غیاب.
 * ⚠️ عمداً موارد انضباطی ساخته نمی‌شود — دبیر حق دیدنشان را
 * ندارد، پس دادهٔ نمونه‌اش هم بی‌فایده است.
 */
function generateP12(){
  if(typeof db === 'undefined' || !db.users) return 0;
  if(typeof add !== 'function') return 0;      /* فقط در بوت دادهٔ نمونه */
  /* اگر از قبل ساخته شده، دوباره نساز */
  var already = (db.grades || []).some(function(g){
    var y = yearOfDate(g.created_at);
    return y && typeof yearCode === 'function' && y !== yearCode();
  });
  if(already) return 0;

  var made = 0;
  /* ۴۰۰ تا ۵۰۰ روز پیش = مطمئناً سال تحصیلی گذشته */
  var pick = function(a){ return a[Math.floor(Math.random() * a.length)]; };
  var terms = ['اول', 'دوم'];
  var types = ['کتبی', 'شفاهی', 'عملی'];

  (db.schools || []).forEach(function(sc){
    if(sc.active === 0) return;
    var subs = (db.subjects || []).filter(function(x){ return x.school_id === sc.id; });
    if(!subs.length) return;
    var studs = (db.users || []).filter(function(u){
      return u.role === 'student' && u.school_id === sc.id;
    }).slice(0, 15);            /* سقف برای مهار حجم — بخش ۷ توضیح */

    studs.forEach(function(st){
      /* ۴ نمره در سال گذشته */
      for(var i = 0; i < 4; i++){
        var base = 11 + Math.random() * 8;
        add('grades', {
          school_id: sc.id, student_id: st.id, class_id: null,
          subject_id: pick(subs).id, teacher_id: null,
          term: pick(terms), exam_type: pick(types),
          score: Math.round(base * 4) / 4, max_score: 20,
          created_at: _yearAgoISO(400 + Math.floor(Math.random() * 100))
        });
        made++;
      }
      /* ۸ روز حضور در سال گذشته */
      for(var d = 0; d < 8; d++){
        var r = Math.random();
        var stt = r > 0.94 ? 'absent' : (r > 0.88 ? 'late' : 'present');
        add('attendance', {
          school_id: sc.id, class_id: null, student_id: st.id,
          date: _yearAgoISO(400 + d * 12), status: stt, note: null
        });
        made++;
      }
    });
  });
  return made;
}

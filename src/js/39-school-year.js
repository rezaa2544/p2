/* ═══════════════════════════════════════════════════════════════════
   چرخهٔ سال تحصیلی و چیدمان کلاس‌ها
   ═══════════════════════════════════════════════════════════════════
   بخش ۱ ▸ بستن سال تحصیلی و یادآوری تیرماه
   بخش ۲ ▸ ثبت‌نام مهر با تأیید شهریه
   بخش ۳ ▸ چیدمان کلاس: دستی و خودکار
   روت: schoolyear

   ⚠️ مسئله‌ای که این ماژول حل می‌کند:
   ارتقای پایه فقط عدد `grade_level` را زیاد می‌کرد و دانش‌آموز در
   کلاس پارسالش می‌ماند — یعنی دانش‌آموز یازدهم در کلاس «دهم تجربی».
   حالا پس از ارتقا، مرحلهٔ چیدمان کلاس انجام می‌شود.

   دو منطق متفاوت بر پایهٔ مقطع:
   • ابتدایی و متوسطه اول: کلاس‌محور — چیدمان هر سال از نو
   • متوسطه دوم: رشته‌محور — رشته تا پایان دوازدهم ثابت می‌ماند
   ═══════════════════════════════════════════════════════════════════ */

/* ─────────── بخش ۱: وضعیت سال تحصیلی ─────────── */

/** خواندن وضعیت سال تحصیلی یک مدرسه */
function yearState(sid){
  sid = sid || (S.user && S.user.school_id);
  var row = (db.school_years || []).filter(function(y){
    return y.school_id === sid && y.year_code === yearCode(); })[0];
  return row || { school_id: sid, year_code: yearCode(),
    closed: 0, closed_at: null, promoted: 0, placement: null };
}

/** ذخیرهٔ وضعیت سال تحصیلی */
function saveYearState(sid, patch){
  db.school_years = db.school_years || [];
  var row = (db.school_years).filter(function(y){
    return y.school_id === sid && y.year_code === yearCode(); })[0];
  if(row) update('school_years', row.id, patch);
  else insert('school_years', Object.assign(
    { school_id: sid, year_code: yearCode(), closed: 0, promoted: 0, placement: null }, patch));
}

/* ─────────── سال تحصیلی به‌عنوان موجودیت مستقل (بند ۰.۲) ───────────
   سال تحصیلی فقط «نتیجهٔ تاریخ» نیست؛ هر مدرسه ردیفی در school_years
   دارد و سالِ مقصدِ چیدمان (placement_year) هنگام بستن سال ثبت می‌شود.
   بنابراین چیدمان و پیش‌ثبت‌نام همیشه به سالِ مشخصی تعلق دارند،
   نه به «هر سال که باشد». */

/** سال تحصیلی بعد از یک سال (پیش‌فرض: سال جاری) — «۱۴۰۴-۱۴۰۵» ⇒ «۱۴۰۵-۱۴۰۶» */
function nextYearCode(c){
  var a = Number(String(c || yearCode()).split('-')[0]);
  return (a + 1) + '-' + (a + 2);
}

/** سالِ مقصدِ چیدمان/ثبت‌نام برای یک مدرسه:
    سالِ بسته‌شده، چیدمان برای «سال بعد» است (مورد ثبت‌نام شهریور). */
function targetYearOf(sid){
  var st = yearState(sid);
  if(st.placement_year) return st.placement_year;
  return st.closed ? nextYearCode(st.year_code) : st.year_code;
}

/** عنوان سال بعد، برای نمایش در قیف پیش‌ثبت‌نام */
function nextYearTitle(){ var c = nextYearCode().split('-'); return faD(c[0]) + '-' + faD(c[1]); }

/**
 * آیا اکنون فصل پایان سال است؟
 * تیر و مرداد (ماه ۴ و ۵ شمسی) فصل بستن سال است.
 */
function isYearEndSeason(){
  var p = todayISO().split('-').map(Number);
  var j = toJalali(p[0], p[1], p[2]);
  return j[1] === 4 || j[1] === 5;
}

/** آیا فصل ثبت‌نام است؟ شهریور (ماه ۶) */
function isEnrollSeason(){
  var p = todayISO().split('-').map(Number);
  var j = toJalali(p[0], p[1], p[2]);
  return j[1] === 6;
}

/**
 * یادآوری دوره‌ای به مدیر در فصل پایان سال.
 * هر هفت روز یک بار، تا زمانی که سال بسته نشده باشد.
 */
function yearEndReminder(){
  if(!S.user || S.user.role !== 'manager') return null;
  var sid = S.user.school_id;
  var st = yearState(sid);
  if(st.closed) return null;
  if(!isYearEndSeason()) return null;
  /* بررسی اینکه هفت روز از آخرین یادآوری گذشته باشد */
  var last = st.reminded_at || null;
  if(last && (Date.now() - Date.parse(last)) < 7 * 86400000) return null;
  saveYearState(sid, { reminded_at: new Date().toISOString() });
  insert('notifications', { user_id: S.user.id, school_id: sid, type: 'announcement',
    title: '📅 پایان سال تحصیلی نزدیک است',
    body: 'سال تحصیلی ' + yearTitle() + ' رو به پایان است. پس از برگزاری امتحانات، '
        + 'از بخش «چرخهٔ سال تحصیلی» سال را ببندید تا ارتقای پایه انجام شود.',
    link: 'schoolyear', read: 0, created_at: todayISO() });
  return true;
}

/* ─────────── بخش ۲: چیدمان کلاس ─────────── */

/** آیا این مقطع رشته‌محور است؟ (متوسطه دوم) */
function isFieldBased(grade){ return Number(grade) >= 10; }

/**
 * کلاس‌های مقصد برای یک پایه (و رشته، در متوسطه دوم).
 * اگر کلاسی نباشد، خالی برمی‌گرداند تا مدیر بسازد.
 */
function targetClasses(sid, grade, field){
  return db.classes.filter(function(c){
    if(c.school_id !== sid) return false;
    var g = c.grade_level || gradeFromName(c.name);
    if(Number(g) !== Number(grade)) return false;
    if(isFieldBased(grade) && field) return normHdr(c.field || '') === normHdr(field);
    return true;
  });
}

/** دانش‌آموزانی که پایه‌شان بالا رفته ولی کلاس مناسب ندارند */
function needPlacement(sid){
  var out = [];
  db.users.forEach(function(u){
    if(u.role !== 'student' || u.school_id !== sid) return;
    if((u.status || 'active') !== 'active') return;
    var g = Number(u.grade_level || 0);
    if(!g) return;
    var cls = classOf(u.id);
    var cg = cls ? Number(cls.grade_level || gradeFromName(cls.name) || 0) : null;
    /* بدون کلاس، یا کلاسش پایهٔ دیگری است */
    if(!cls || cg !== g) out.push({ user: u, grade: g, current: cls,
      field: u.field || (cls || {}).field || null });
  });
  return out;
}

/**
 * امتیاز یک دانش‌آموز برای چیدمان خودکار.
 * ترکیب معدل و انضباط؛ هرچه بالاتر، قوی‌تر.
 */
function placementScore(studentId){
  var gi = (typeof idxGradesByStudent === 'function') ? idxGradesByStudent() : null;
  var gs = gi ? (gi.get(studentId) || []) : db.grades.filter(function(g){ return g.student_id === studentId; });
  var avg = gs.length ? gs.reduce(function(a,b){ return a + b.score; }, 0) / gs.length : 12;
  var disc = db.discipline.filter(function(d){ return d.student_id === studentId; })
    .reduce(function(a,b){ return a + (b.points || 0); }, 0);
  /* انضباط با وزن کمتر تا معدل عامل اصلی بماند */
  return Math.round((avg + disc * 0.1) * 100) / 100;
}

/**
 * چیدمان خودکار: توزیع متوازن بر پایهٔ کارنامه.
 * روش «مارپیچ»: قوی‌ترین به کلاس اول، دومی به کلاس دوم… سپس برعکس.
 * نتیجه: میانگین کلاس‌ها به هم نزدیک می‌ماند و کلاس ضعیف شکل نمی‌گیرد.
 */
function autoPlacement(students, classes){
  /* دور ۱۰۰ (نقصِ ۴): خروجی {buckets, unplaced} — سرریزِ پیشین به کلاسِ
     اول (فراتر از ظرفیت!) حذف شد؛ جا‌نشده‌ها برمی‌گردند تا پیش‌نمایش
     نشانشان دهد و مدیر کلاسِ موازی بسازد. */
  if(!classes.length) return { buckets: [], unplaced: students.slice() };
  var ranked = students.slice().sort(function(a,b){
    return placementScore(b.user.id) - placementScore(a.user.id); });
  var buckets = classes.map(function(c){ return { cls: c, list: [] }; });
  var unplaced = [];
  var i = 0, dir = 1;
  ranked.forEach(function(s){
    /* رعایت ظرفیت: اگر کلاس پر بود، به بعدی می‌رود */
    var tries = 0;
    while(tries < buckets.length){
      var b = buckets[i];
      var cap = Number(b.cls.capacity || 40);
      if(b.list.length < cap){ b.list.push(s); break; }
      i += dir;
      if(i >= buckets.length){ i = buckets.length - 1; dir = -1; }
      else if(i < 0){ i = 0; dir = 1; }
      tries++;
    }
    if(tries >= buckets.length) unplaced.push(s);  /* همه پر: جا نشد */
    i += dir;
    if(i >= buckets.length){ i = buckets.length - 1; dir = -1; }
    else if(i < 0){ i = 0; dir = 1; }
  });
  return { buckets: buckets, unplaced: unplaced };
}

/** اعمال چیدمان: ثبت‌نام دانش‌آموزان در کلاس‌های تعیین‌شده.
    سالِ ثبت‌نام = سالِ مقصد (placement_year سالِ بسته‌شده) — بند ۰.۲.
    ردیفِ پیش‌ثبت‌نامِ دانش‌آموزِ چیده‌شده در همان سال، «چیده شد» می‌شود. */
function applyPlacement(pairs, sid){
  var n = 0;
  var targetYear = (sid != null) ? targetYearOf(sid) : null;
  batchWrites(function(){
    pairs.forEach(function(p){
      if(!p.classId || !p.studentId) return;
      var cls = byId('classes', p.classId);
      if(!cls) return;
      var ey = targetYear || targetYearOf(cls.school_id);
      db.enrollments.filter(function(e){ return e.student_id === p.studentId; })
        .forEach(function(e){ remove('enrollments', e.id); });
      insert('enrollments', { school_id: cls.school_id, class_id: cls.id,
        student_id: p.studentId, year: ey });
      /* رشته و پایهٔ دانش‌آموز با کلاس هماهنگ می‌شود */
      var patch = { grade_level: cls.grade_level || gradeFromName(cls.name) };
      if(cls.field) patch.field = cls.field;
      update('users', p.studentId, patch);
      (db.pre_enrollments || []).filter(function(pe){
        return pe.student_id === p.studentId && pe.year_code === ey && pe.status !== 'placed';
      }).forEach(function(pe){ update('pre_enrollments', pe.id, { status: 'placed' }); });
      n++;
    });
  });
  return n;
}

/**
 * ساخت کلاس تازه برای یک پایه و رشته.
 * وقتی تعداد دانش‌آموزان یک رشته از ظرفیت بیشتر شود، مدیر کلاس
 * دوم می‌سازد: «دهم تجربی الف» و «دهم تجربی ب».
 */
function createParallelClass(sid, grade, field, suffix){
  var base = (typeof GRADE_WORDS === 'object')
    ? Object.keys(GRADE_WORDS).filter(function(k){ return GRADE_WORDS[k] === Number(grade); })[0]
    : String(grade);
  var name = (base || grade) + (field ? ' ' + field : '') + (suffix ? ' ' + suffix : '');
  return insert('classes', { school_id: sid, name: name,
    grade: base || String(grade), grade_level: Number(grade),
    field: field || null, room: null, capacity: 40, homeroom_teacher_id: null });
}

/* ─────────── بخش ۳: ثبت‌نام سال تازه ─────────── */

/**
 * آیا شهریهٔ دانش‌آموز برای ثبت‌نام تأیید شده است؟
 * ملاک: دست‌کم یک قسط پرداخت‌شده در سال جاری.
 */
function tuitionCleared(studentId){
  var ins = db.installments.filter(function(i){ return i.student_id === studentId; });
  if(!ins.length) return false;
  return ins.some(function(i){ return i.status === 'paid' || Number(i.paid_amount || 0) > 0; });
}

/** فهرست ثبت‌نام: چه کسی شهریه داده و آماده چیدمان است */
function enrollmentList(sid){
  return needPlacement(sid).map(function(p){
    return Object.assign({}, p, { paid: tuitionCleared(p.user.id) });
  });
}

/* ─────────── قیف پیش‌ثبت‌نام سال آینده (بند ۰.۲) ───────────
   مدیر می‌تواند قبل از شروع سال تازه، دانش‌آموز تازه‌واردها و
   بازگشتی‌ها را برای «سال بعد» پیش‌ثبت‌نام کند. قیف چهار مرحله
   دارد: ثبت (registered) ← تأیید (confirmed) ← چیدمان
   (placed) | رد (rejected). تأیید یک پیش‌ثبت‌نام تازه‌وارد،
   حساب دانش‌آموز را می‌سازد؛ اگر کد ملی با دانش‌آموز فعلی یکی
   باشد، به همان حساب وصل می‌شود (ساخت تکراری نمی‌شود). */

const PRE_STATUS=[['registered','ثبت‌شده','b-blue'],['confirmed','تأییدشده','b-amber'],
                  ['placed','چیده شد','b-green'],['rejected','رد شد','b-gray']];

/** فهرست پیش‌ثبت‌نام‌های سال آیندهٔ یک مدرسه */
function preEnrollFor(sid){
  return (db.pre_enrollments || []).filter(function(p){
    return p.school_id === sid && p.year_code === nextYearCode(); });
}

/** ساخت ردیف پیش‌ثبت‌نام (بازگشتی یا تازه‌وارد) */
function preAddRow(sid, data){
  db.pre_enrollments = db.pre_enrollments || [];
  return insert('pre_enrollments', Object.assign({
    school_id: sid, year_code: nextYearCode(), student_id: null,
    source: 'new', status: 'registered', created_at: todayISO() }, data));
}

/**
 * تأیید پیش‌ثبت‌نام: حساب دانش‌آموز ساخته/وصل می‌شود.
 * بازگشت: {ok, student_id, created, err}
 */
function preConfirm(sid, preId){
  var pe = byId('pre_enrollments', preId);
  if(!pe || pe.school_id !== sid) return { ok:false, err:'ردیف یافت نشد' };
  if(pe.status === 'placed') return { ok:false, err:'این ردیف در کلاس چیده شده است' };
  var name = String(pe.name || '').trim();
  var nid = String(pe.national_id || '').trim();
  if(!name) return { ok:false, err:'نام الزامی است' };
  /* ۱) دانش‌آموز فعلی با همین کد ملی؟ وصل می‌شود */
  var existing = null;
  if(nid){
    existing = db.users.filter(function(u){
      return u.role === 'student' && u.school_id === sid && String(u.national_id || '') === nid;
    })[0] || null;
  }
  var sidStu, created = false;
  if(existing){ sidStu = existing.id; }
  else {
    /* ۲) کد ملیِ فرد دیگری در این مدرسه؟ */
    if(nid && db.users.some(function(u){
        return u.school_id === sid && String(u.national_id || '') === nid && u.role !== 'student'; })){
      return { ok:false, err:'این کد ملی قبلاً برای فرد دیگری ثبت شده است' };
    }
    var uname = 'st' + nid + String(Date.now()).slice(-4);
    sidStu = insert('users', {
      school_id: sid, role: 'student', full_name: name,
      username: uname, password: '123456', national_id: nid || null,
      phone: pe.phone || null, grade_level: Number(pe.grade || 0) || null,
      field: pe.field || null, status: 'active', active: 1,
      created_at: todayISO() }).id;
    created = true;
  }
  update('pre_enrollments', preId, { status: 'confirmed', student_id: sidStu,
    name: existing && existing.full_name ? existing.full_name : name });
  return { ok:true, student_id: sidStu, created: created };
}

/**
 * افزودن دانش‌آموزان فعلیِ مدرسه به پیش‌ثبت‌نام سال آینده
 * (یک‌بار؛ ردیف‌های تکراری ساخته نمی‌شوند).
 */
function preAddReturning(sid){
  var n = 0;
  db.pre_enrollments = db.pre_enrollments || [];
  db.users.forEach(function(u){
    if(u.role !== 'student' || u.school_id !== sid) return;
    if((u.status || 'active') !== 'active') return;
    var has = db.pre_enrollments.some(function(p){
      return p.school_id === sid && p.year_code === nextYearCode()
        && p.student_id === u.id; });
    if(has) return;
    preAddRow(sid, { student_id: u.id, name: u.full_name,
      national_id: u.national_id || null, phone: u.phone || null,
      grade: u.grade_level || null, field: u.field || null,
      source: 'returning' });
    n++;
  });
  return n;
}

/* ─────────── نما ─────────── */

function viewSchoolYear(){
  var sid = S.user.school_id;
  var st = yearState(sid);
  var tab = ['placement','enroll','pre'].indexOf(S.tab) > -1 ? S.tab : 'status';
  var pending = needPlacement(sid);
  var tabs = [['status','📅 وضعیت سال'],['placement','🏛️ چیدمان کلاس‌ها'],['enroll','💳 ثبت‌نام'],
              ['pre','📝 پیش‌ثبت‌نام سال آینده']]
    .map(function(t){
      return '<button class="btn ' + (tab === t[0] ? '' : 'ghost') + '" data-act="tab" data-t="'
        + t[0] + '">' + t[1] + '</button>'; }).join('');
  var body = '';

  if(tab === 'status'){
    var season = isYearEndSeason() ? 'پایان سال' : isEnrollSeason() ? 'ثبت‌نام' : 'میان سال';
    body = '<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,'
      + (st.closed ? 'var(--green-soft)' : 'var(--primary-soft)') + ',#fff)"><div class="card-body row">'
      + '<div style="font-size:34px">' + (st.closed ? '✅' : '📅') + '</div>'
      + '<div style="flex:1"><b style="font-size:16px">سال تحصیلی ' + yearTitle() + '</b>'
      + '<div class="small muted" style="line-height:2">'
      + (st.closed
          ? 'این سال بسته شده است. ارتقای پایه انجام شد و اکنون می‌توانید کلاس‌ها را بچینید.'
          : 'سال تحصیلی هنوز باز است. پس از پایان امتحانات، آن را ببندید تا ارتقای پایه انجام شود.')
      + '<br>فصل جاری: <b>' + season + '</b>'
      + (st.closed_at ? ' · بسته‌شده در ' + jalali(String(st.closed_at).slice(0,10)) : '')
      + '</div></div>'
      + (st.closed
          ? '<button class="btn ghost" data-act="year-reopen">↩️ بازگشایی سال</button>'
          : '<button class="btn" data-act="year-close">🔒 بستن سال و ارتقای پایه</button>')
      + '</div></div>'

      + (!st.closed && isYearEndSeason()
        ? '<div class="card" style="margin-bottom:14px;border-inline-start:4px solid var(--amber)">'
          + '<div class="card-body small" style="line-height:2">'
          + '⚠️ <b>اکنون فصل پایان سال است.</b> اگر امتحانات تمام شده، سال را ببندید. '
          + 'با بستن سال: پایهٔ همه یک واحد بالا می‌رود، پایهٔ دوازدهم فارغ‌التحصیل و بایگانی '
          + 'می‌شود، و پایهٔ ششم و نهم «در انتظار انتقال» می‌شوند.</div></div>' : '')

      + '<div class="grid g4" style="margin-bottom:14px">'
      + statCard('👥', fa(schoolStudents(sid).length), 'دانش‌آموز فعال', 'blue')
      + statCard('🏛️', fa(db.classes.filter(function(c){ return c.school_id === sid; }).length), 'کلاس', 'purple')
      + statCard('⏳', fa(pending.length), 'نیازمند چیدمان کلاس', pending.length ? 'amber' : 'green')
      + statCard('🎓', fa(db.student_archive.filter(function(a){ return a.school_id === sid; }).length),
          'فارغ‌التحصیل بایگانی‌شده', 'green') + '</div>'

      + '<div class="card"><div class="card-head"><h3>مراحل چرخهٔ سال</h3></div>'
      + '<div class="card-body"><table class="table"><tbody>'
      + [['۱', 'بستن سال تحصیلی', st.closed, 'تیر یا مرداد، پس از امتحانات'],
         ['۲', 'ارتقای پایه', st.promoted, 'خودکار هنگام بستن سال'],
         ['۳', 'چیدمان کلاس‌ها', pending.length === 0 && st.closed, 'دستی یا خودکار بر پایهٔ کارنامه'],
         ['۴', 'ثبت‌نام و تأیید شهریه', false, 'شهریور']]
        .map(function(r){
          return '<tr><td style="width:34px">' + (r[2] ? '✅' : '⬜') + '</td>'
            + '<td><b>' + r[1] + '</b></td><td class="small muted">' + r[3] + '</td></tr>';
        }).join('')
      + '</tbody></table></div></div>';
  }

  if(tab === 'placement'){
    /* گروه‌بندی بر پایهٔ پایه و رشته */
    var groups = Object.create(null);
    pending.forEach(function(p){
      var key = p.grade + '|' + (isFieldBased(p.grade) ? (p.field || 'بدون رشته') : '');
      (groups[key] = groups[key] || { grade: p.grade, field: isFieldBased(p.grade) ? p.field : null,
        list: [] }).list.push(p);
    });
    var keys = Object.keys(groups);

    body = '<div class="card" style="margin-bottom:14px"><div class="card-body small muted" style="line-height:2">'
      + '<b>ابتدایی و متوسطه اول</b> کلاس‌محورند: هر سال چیدمان از نو انجام می‌شود.<br>'
      + '<b>متوسطه دوم</b> رشته‌محور است: رشتهٔ دانش‌آموز تا پایان دوازدهم ثابت می‌ماند و '
      + 'فقط پایه‌اش بالا می‌رود. اگر تعداد یک رشته زیاد باشد، چند کلاس موازی بسازید.'
      + '</div></div>'

      + (keys.length ? keys.map(function(k){
          var g = groups[k];
          var cls = targetClasses(sid, g.grade, g.field);
          /* دور ۱۰۰ (نقصِ ۴): پیش‌نمایشِ جا‌نشده‌ها — دکمهٔ «کلاس موازی» کنارش هست */
          var prevUn = cls.length ? autoPlacement(g.list, cls).unplaced.length : g.list.length;
          var levelName = g.grade <= 6 ? 'ابتدایی' : g.grade <= 9 ? 'متوسطه اول' : 'متوسطه دوم';
          return '<div class="card" style="margin-bottom:12px"><div class="card-head">'
            + '<h3>پایهٔ ' + fa(g.grade) + (g.field ? ' — ' + esc(g.field) : '')
            + ' <span class="badge b-gray">' + fa(g.list.length) + ' دانش‌آموز</span></h3>'
            + '<div class="row" style="gap:6px">'
            + '<span class="small muted">' + levelName + ' · ' + fa(cls.length) + ' کلاس مقصد</span>'
            + (prevUn ? '<span class="badge b-red">⚠️ ' + fa(prevUn) + ' نفر جا نمی‌شوند</span>' : '')
            + '<button class="btn ghost sm" data-act="cls-parallel" data-g="' + g.grade
            + '" data-fl="' + esc(g.field || '') + '">➕ کلاس موازی</button>'
            + (cls.length ? '<button class="btn sm" data-act="place-auto" data-g="' + g.grade
                + '" data-fl="' + esc(g.field || '') + '">⚡ چیدمان خودکار</button>' : '')
            + '</div></div>'
            + (cls.length
              ? '<div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th>'
                + '<th>کلاس پارسال</th><th>امتیاز</th><th>کلاس مقصد</th></tr></thead><tbody>'
                + g.list.slice(0, 200).map(function(p){
                    return '<tr><td><b>' + esc(p.user.full_name) + '</b></td>'
                      + '<td class="small muted">' + esc((p.current || {}).name || '—') + '</td>'
                      + '<td class="small">' + fa(placementScore(p.user.id)) + '</td>'
                      + '<td><select class="select" data-f="place" data-s="' + p.user.id + '">'
                      + '<option value="">— انتخاب کنید —</option>'
                      + cls.map(function(c){
                          var n = db.enrollments.filter(function(e){ return e.class_id === c.id; }).length;
                          return '<option value="' + c.id + '">' + esc(c.name)
                            + ' (' + fa(n) + '/' + fa(c.capacity || 40) + ')</option>';
                        }).join('') + '</select></td></tr>';
                  }).join('')
                + '</tbody></table></div>'
              : '<div class="card-body">' + empty('🏛️','کلاسی برای این پایه نیست',
                  'با دکمهٔ «کلاس موازی» کلاس بسازید تا بتوانید دانش‌آموزان را بچینید.') + '</div>')
            + '</div>';
        }).join('')
        : empty('✅','همهٔ دانش‌آموزان کلاس دارند','چیدمانی در انتظار نیست.'));
  }

  if(tab === 'enroll'){
    var list = enrollmentList(sid);
    var paid = list.filter(function(x){ return x.paid; }).length;
    body = '<div class="grid g3" style="margin-bottom:14px">'
      + statCard('📋', fa(list.length), 'در انتظار ثبت‌نام', 'blue')
      + statCard('✅', fa(paid), 'شهریه تأییدشده', 'green')
      + statCard('⏳', fa(list.length - paid), 'بدون پرداخت', 'amber') + '</div>'
      + '<div class="card"><div class="card-head"><h3>ثبت‌نام سال تحصیلی تازه</h3>'
      + (paid ? '<button class="btn" data-act="enroll-paid">⚡ چیدمان خودکار پرداخت‌کرده‌ها</button>' : '')
      + '</div>'
      + '<div class="card-body small muted" style="line-height:2">'
      + 'دانش‌آموزی که شهریه‌اش تأیید شده، آمادهٔ چیدمان در کلاس سال تازه است. '
      + 'ملاک تأیید: دست‌کم یک قسط پرداخت‌شده.</div>'
      + (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th>'
        + '<th>پایهٔ جدید</th><th>رشته</th><th>شهریه</th><th>وضعیت</th></tr></thead><tbody>'
        + list.slice(0, 200).map(function(p){
            return '<tr' + (p.paid ? '' : ' style="background:var(--amber-soft)"') + '>'
              + '<td><b>' + esc(p.user.full_name) + '</b></td>'
              + '<td>' + fa(p.grade) + '</td>'
              + '<td class="small">' + esc(p.field || '—') + '</td>'
              + '<td><span class="badge ' + (p.paid ? 'b-green' : 'b-amber') + '">'
              + (p.paid ? 'تأیید شد' : 'در انتظار') + '</span></td>'
              + '<td class="small muted">نیازمند چیدمان کلاس</td></tr>';
          }).join('')
        + '</tbody></table></div>' : empty('✅','کسی در انتظار ثبت‌نام نیست','')) + '</div>';
  }

  if(tab === 'pre'){
    /* قیف پیش‌ثبت‌نام سال آینده (بند ۰.۲) */
    var list = preEnrollFor(sid);
    var cnt = { registered: 0, confirmed: 0, placed: 0, rejected: 0 };
    list.forEach(function(p){ cnt[p.status] = (cnt[p.status] || 0) + 1; });
    var gradeOpts = Object.keys(GRADE_WORDS).reverse().map(function(w){
      return [GRADE_WORDS[w], 'پایهٔ ' + w]; }).concat([[0,'بدون پایه (تازه‌واردهای مقطع پایین)']]);
    body = '<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--primary-soft),#fff)">'
      + '<div class="card-body row"><div style="font-size:30px">📝</div>'
      + '<div style="flex:1"><b style="font-size:15px">پیش‌ثبت‌نام سال تحصیلی ' + nextYearTitle() + '</b>'
      + '<div class="small muted" style="line-height:2">دانش‌آموزان تازه‌واردها و بازگشتی‌ها را از همین‌جا برای سال آینده ثبت کنید. با «تأیید»، حساب دانش‌آموز ساخته یا وصل می‌شود و در مرحلهٔ بعدی در کلاس چیده می‌شود.</div></div></div></div>'
      + '<div class="grid g4" style="margin-bottom:14px">'
      + statCard('📋', fa(cnt.registered), 'ثبت‌شده', 'blue')
      + statCard('✅', fa(cnt.confirmed), 'تأییدشده', 'amber')
      + statCard('🟢', fa(cnt.placed), 'چیده‌شده', 'green')
      + statCard('⚫', fa(cnt.rejected), 'ردشده', 'red') + '</div>'
      + '<div class="card" style="margin-bottom:14px"><div class="card-head">'
      + '<h3>افزودن پیش‌ثبت‌نام تازه</h3>'
      + '<button class="btn ghost sm" data-act="pre-returning">↩️ افزودن همهٔ دانش‌آموزان فعلی (بازگشتی)</button></div>'
      + '<div class="card-body">'
      + '<div class="grid g3">'
      + f('نام و نام خانوادگی *', inp('pre_name', ''))
      + f('کد ملی', inp('pre_nid', ''))
      + f('تلفن همراه', inp('pre_phone', ''))
      + f('پایهٔ ورود به سال آینده', sel('pre_grade', gradeOpts, 10))
      + f('رشته (در متوسطه دوم)', inp('pre_field', ''))
      + '</div>'
      + '<div class="row" style="margin-top:10px;gap:8px">'
      + '<button class="btn" data-act="pre-add">➕ ثبت پیش‌نویس</button>'
      + '<span class="small muted">اگر کد ملی با دانش‌آموز فعلی یکی باشد، در تأیید به همان حساب وصل می‌شود.</span></div>'
      + '</div></div>'
      + '<div class="card"><div class="card-head"><h3>فهرست پیش‌ثبت‌نام‌های سال ' + nextYearTitle() + '</h3></div>'
      + (list.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>نام</th><th>کد ملی</th>'
          + '<th>پایه</th><th>رشته</th><th>منبع</th><th>وضعیت</th><th></th></tr></thead><tbody>'
          + list.map(function(p){
              var st3 = PRE_STATUS.filter(function(x){ return x[0] === p.status; })[0] || PRE_STATUS[0];
              return '<tr><td><b>' + esc(p.name || '—') + '</b></td>'
                + '<td class="small muted">' + esc(p.national_id || '—') + '</td>'
                + '<td>' + fa(p.grade || '—') + '</td>'
                + '<td class="small">' + esc(p.field || '—') + '</td>'
                + '<td><span class="badge b-gray">' + (p.source === 'returning' ? 'بازگشتی' : 'تازه‌وارد') + '</span></td>'
                + '<td><span class="badge ' + st3[2] + '">' + st3[1] + '</span></td>'
                + '<td class="row" style="gap:4px">'
                + (p.status === 'registered' ? '<button class="btn sm" data-act="pre-confirm" data-id="' + p.id + '">✔ تأیید</button>' : '')
                + (p.status === 'registered' ? '<button class="btn ghost sm" data-act="pre-reject" data-id="' + p.id + '">رد</button>' : '')
                + (p.status !== 'placed' ? '<button class="btn ghost sm" data-act="pre-del" data-id="' + p.id + '">✖</button>' : '')
                + '</td></tr>';
            }).join('')
          + '</tbody></table></div>'
        : empty('📝', 'هنوز پیش‌ثبت‌نامی ثبت نشده',
            'از فرم بالا تازه‌واردها را ثبت کنید یا دکمهٔ «بازگشتی» را بزنید.'))
      + '</div>';
  }

  return '<div class="row" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">' + tabs + '</div>' + body;
}

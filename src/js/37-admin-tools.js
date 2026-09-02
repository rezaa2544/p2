/* ═══════════════════════════════════════════════════════════════════
   ابزارهای تکمیلی سوپرادمین
   ═══════════════════════════════════════════════════════════════════
   بخش ۱ ▸ وضعیت و فعالیت مدارس   (ستون‌های تازه در فهرست مدارس)
   بخش ۲ ▸ خروجی اکسل از فهرست‌ها  (اکشن: export-csv)
   بخش ۳ ▸ اطلاعیهٔ سراسری         (ارسال به همهٔ مدارس)

   ⚠️ خروجی با قالب csv و پیشوند BOM ساخته می‌شود تا اکسل فارسی
   بدون به‌هم‌ریختگی حروف بازش کند. این جزئیات ریز اما حیاتی است.
   ═══════════════════════════════════════════════════════════════════ */

/* ─────────── بخش ۱: وضعیت و فعالیت مدارس ─────────── */

/**
 * آخرین فعالیت هر مدرسه بر پایهٔ دفترچهٔ عملیات.
 * یک پیمایش، نه پیمایش دفترچه به‌ازای هر مدرسه.
 */
function schoolActivityMap(){
  var out = Object.create(null);
  var src = (typeof log !== 'undefined') ? log : [];
  for(var i = 0; i < src.length; i++){
    var op = src[i];
    if(!op || !op.at) continue;
    var sid = (op.data && op.data.school_id) || null;
    if(!sid && op.by){ var u = byId('users', op.by); sid = u ? u.school_id : null; }
    if(!sid) continue;
    if(!out[sid] || op.at > out[sid].at) out[sid] = { at: op.at, n: (out[sid] ? out[sid].n : 0) + 1 };
    else out[sid].n++;
  }
  return out;
}

/** خلاصهٔ وضعیت یک مدرسه: تعداد، اشتراک اولیا و آخرین فعالیت */
function schoolStatus(sid, activityMap, parentsMap, subMap){
  var students = 0, teachers = 0;
  db.users.forEach(function(u){
    if(u.school_id !== sid) return;
    if(u.role === 'student' && (u.status || 'active') === 'active') students++;
    else if(u.role === 'teacher') teachers++;
  });
  var pl = parentsMap[sid] ? Object.keys(parentsMap[sid]) : [];
  var active = 0;
  pl.forEach(function(p){ if(subMap[p] === 'active') active++; });
  var act = activityMap[sid] || null;
  var days = act ? Math.floor((Date.now() - Date.parse(act.at)) / 86400000) : null;
  return { students: students, teachers: teachers, parents: pl.length, activeSubs: active,
    conv: pl.length ? Math.round(active / pl.length * 1000) / 10 : 0,
    lastAt: act ? act.at : null, idleDays: days, ops: act ? act.n : 0,
    state: days === null ? 'never' : days <= 7 ? 'active' : days <= 30 ? 'slow' : 'idle' };
}

/** ساخت جدول وضعیت همهٔ مدارس — همهٔ گروه‌بندی‌ها یک‌باره */
function schoolsOverview(){
  var activity = schoolActivityMap();
  var studentSchool = Object.create(null);
  db.users.forEach(function(u){ if(u.role === 'student') studentSchool[u.id] = u.school_id; });
  var parentsMap = Object.create(null);
  db.parent_links.forEach(function(l){
    var sid = studentSchool[l.student_id];
    if(sid) (parentsMap[sid] = parentsMap[sid] || Object.create(null))[l.parent_id] = true;
  });
  var subMap = Object.create(null);
  db.parent_subscriptions.forEach(function(s){ subMap[s.user_id] = s.status; });
  return db.schools.map(function(sc){
    return { school: sc, st: schoolStatus(sc.id, activity, parentsMap, subMap) };
  });
}

/* ─────────── بخش ۲: خروجی اکسل ─────────── */

/** یک سلول امن برای قالب csv */
function csvCell(v){
  var s = (v === undefined || v === null) ? '' : String(v);
  /* جلوگیری از تفسیر شدن به‌عنوان فرمول در اکسل */
  if(/^[=+\-@]/.test(s)) s = "'" + s;
  if(/[",\n\r;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * ساخت و دانلود فایل csv.
 * پیشوند BOM لازم است وگرنه اکسل فارسی را به‌هم‌ریخته نشان می‌دهد.
 */
function downloadCSV(filename, headers, rows){
  var lines = [headers.map(csvCell).join(',')];
  rows.forEach(function(r){ lines.push(r.map(csvCell).join(',')); });
  var content = '\uFEFF' + lines.join('\r\n');
  try{
    var blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
    return true;
  }catch(e){ return false; }
}

/** دادهٔ خروجی بر پایهٔ صفحهٔ جاری */
function exportData(route){
  if(route === 'users'){
    var rows = db.users.filter(function(u){ return u.role !== 'superadmin'; });
    if(S.user.role !== 'superadmin')
      rows = rows.filter(function(u){ return u.school_id === S.user.school_id; });
    return { name: 'کاربران',
      headers: ['ردیف','نام و نام خانوادگی','نام کاربری','نقش','کد ملی','موبایل','مدرسه','وضعیت'],
      rows: rows.map(function(u, i){
        return [i + 1, u.full_name, u.username, ROLE_FA[u.role] || u.role,
          u.national_id || '', u.phone || '',
          (byId('schools', u.school_id) || {}).name || '', u.active ? 'فعال' : 'غیرفعال'];
      }) };
  }
  if(route === 'schools'){
    var ov = schoolsOverview();
    return { name: 'مدارس',
      headers: ['ردیف','نام مدرسه','کد','شهر','دانش‌آموز','دبیر','ولی','اشتراک فعال','نرخ تبدیل','آخرین فعالیت'],
      rows: ov.map(function(r, i){
        return [i + 1, r.school.name, r.school.code || '', r.school.city || '',
          r.st.students, r.st.teachers, r.st.parents, r.st.activeSubs,
          r.st.conv + '٪', r.st.lastAt ? jalali(r.st.lastAt.slice(0, 10)) : 'هرگز'];
      }) };
  }
  if(route === 'finance'){
    var d = financeSummary();
    return { name: 'گزارش مالی',
      headers: ['ردیف','مدرسه','ولی','اشتراک فعال','نرخ تبدیل','شهریه دریافتی'],
      rows: d.schools.map(function(r, i){
        return [i + 1, r.school.name, r.parents, r.active, r.conv + '٪', r.paid];
      }) };
  }
  if(route === 'audit'){
    var list = auditList({});
    return { name: 'سابقه تغییرات',
      headers: ['ردیف','عمل','نوع داده','انجام‌دهنده','نقش','زمان'],
      rows: list.slice(0, 1000).map(function(r, i){
        return [i + 1, (OP_FA[r.op.t] || ['—'])[0], COLL_FA[r.op.c] || r.op.c,
          r.actor ? r.actor.full_name : '—',
          r.actor ? (ROLE_FA[r.actor.role] || '') : '',
          r.at ? shortStamp(r.at) : ''];
      }) };
  }
  /* پیش‌فرض: فهرست دانش‌آموزان مدرسهٔ جاری با پروندهٔ کامل */
  var sts = schoolStudents(S.user.school_id);
  return { name: 'دانش‌آموزان',
    headers: ['ردیف','نام','نام خانوادگی','کد ملی','کلاس','رشته','معدل سال گذشته',
              'نام پدر','شغل پدر','موبایل پدر','تحت پوشش','آدرس'],
    rows: sts.map(function(u, i){
      return [i + 1, u.first_name || u.full_name, u.last_name || '', u.national_id || '',
        (classOf(u.id) || {}).name || '', u.field || '', u.last_gpa != null ? u.last_gpa : '',
        u.father_name || '', u.father_job || '', u.father_phone || '',
        u.covered === 1 ? 'بلی' : u.covered === 0 ? 'خیر' : '', u.address || ''];
    }) };
}

/* ─────────── بخش ۳: اطلاعیهٔ سراسری ─────────── */

/**
 * ارسال اطلاعیه به همهٔ مدارس یا مدارس یک اداره.
 * اطلاعیه با شناسهٔ مدرسهٔ خالی یعنی «همهٔ کشور».
 */
function broadcastAnnouncement(title, body, scope){
  var count = 0;
  batchWrites(function(){
    if(scope === 'all'){
      insert('announcements', { school_id: null, title: title, body: body,
        author_id: S.user.id, date: todayISO(), pinned: 0 });
      count = 1;
    } else {
      db.schools.forEach(function(sc){
        if(!sc.active && sc.active !== undefined) return;
        insert('announcements', { school_id: sc.id, title: title, body: body,
          author_id: S.user.id, date: todayISO(), pinned: 0 });
        count++;
      });
    }
  });
  return count;
}

/* ==================== چرخهٔ تحصیلی (Lifecycle) ====================
   ارتقای پایه پایان سال، فارغ‌التحصیلی و بایگانی، انتقال بین مدارس،
   تعارض کد ملی، و پرونده‌های ناقص.

   قواعد نظام آموزشی ایران:
     ابتدایی ۱–۶ · متوسطه اول ۷–۹ · متوسطه دوم ۱۰–۱۲
     پایه ۶ و ۹ = پایان مقطع ⇒ «در انتظار انتقال»
     پایه ۱۲ = فارغ‌التحصیلی ⇒ بایگانی

   ⚠️ این ماژول با الگوی ایندکس‌شده نوشته شده (نه کپی از مرجع):
   شمارش‌ها و جستجوها از idxEnrollByClass / idxGradesByStudent /
   idxAttByStudent می‌گذرند تا در مدرسهٔ بزرگ هم خطی بمانند.
   ================================================================= */

var GRADE_WORDS = {'اول':1,'دوم':2,'سوم':3,'چهارم':4,'پنجم':5,'ششم':6,
                   'هفتم':7,'هشتم':8,'نهم':9,'دهم':10,'یازدهم':11,'دوازدهم':12};

/** سال تحصیلی جاری به شکل «۱۴۰۴-۱۴۰۵» (شروع از مهر) */
function yearCode(){
  var p = todayISO().split('-').map(Number);
  var j = toJalali(p[0], p[1], p[2]);
  var st = j[1] >= 7 ? j[0] : j[0] - 1;
  return st + '-' + (st + 1);
}
function yearTitle(){ var c = yearCode().split('-'); return faD(c[0]) + '-' + faD(c[1]); }

/** پایان مقطع: ششم، نهم، دوازدهم */
function isTerminal(g){ return [6,9,12].indexOf(Number(g)) > -1; }

/** استنتاج پایه از نام کلاس («نهم ۲» → ۹) */
function gradeFromName(name){
  var s = String(name || '');
  var words = Object.keys(GRADE_WORDS).sort(function(a,b){ return b.length - a.length; });
  for(var i=0;i<words.length;i++) if(s.indexOf(words[i]) > -1) return GRADE_WORDS[words[i]];
  var m = s.match(/(?:^|\s|پایه)\s*(1[0-2]|[1-9])(?:\s|$|م)/);
  return m ? Number(m[1]) : null;
}

/** نام مقطع از روی پایه */
function levelOfLC(g){
  g = Number(g);
  if(!g) return '';
  if(g <= 6) return 'ابتدایی';
  if(g <= 9) return 'متوسطه اول';
  return 'متوسطه دوم';
}

/** دانش‌آموزان فعال یک کلاس (از ایندکس) */
function activeStudentsOfClass(cid){
  var m = (typeof idxEnrollByClass === 'function') ? idxEnrollByClass() : null;
  var es = m ? (m.get(Number(cid)) || []) : db.enrollments.filter(function(e){ return e.class_id === Number(cid); });
  var out = [];
  for(var i=0;i<es.length;i++){
    var u = byId('users', es[i].student_id);
    if(u && (u.status || 'active') === 'active') out.push(u);
  }
  return out;
}

/** فارغ‌التحصیل کردن یک دانش‌آموز + بایگانی کارنامه */
function graduateStudent(s, sid, cls){
  var gi = (typeof idxGradesByStudent === 'function') ? idxGradesByStudent() : null;
  var ai = (typeof idxAttByStudent === 'function') ? idxAttByStudent() : null;
  var g = gi ? (gi.get(s.id) || []) : db.grades.filter(function(x){ return x.student_id === s.id; });
  var a = ai ? (ai.get(s.id) || []) : db.attendance.filter(function(x){ return x.student_id === s.id; });
  var d = db.discipline.filter(function(x){ return x.student_id === s.id; })
            .reduce(function(x,y){ return x + (y.points || 0); }, 0);
  var present = a.filter(function(x){ return x.status === 'present'; }).length;
  insert('student_archive', {
    school_id: sid, student_id: s.id, full_name: s.full_name, national_id: s.national_id || null,
    class_name: cls ? cls.name : null, grade_level: 12,
    field: s.field || (cls || {}).field || null, year_code: yearCode(),
    avg_score: g.length ? Math.round(g.reduce(function(x,y){ return x + y.score; }, 0) / g.length * 100) / 100 : 0,
    attendance_rate: a.length ? Math.round(present / a.length * 1000) / 10 : 0,
    discipline_points: d, archived_at: todayISO()
  });
  update('users', s.id, { status: 'graduated', graduated_year: yearCode(), active: 0 });
  db.enrollments.filter(function(e){ return e.student_id === s.id; })
    .forEach(function(e){ remove('enrollments', e.id); });
  db.parent_links.filter(function(l){ return l.student_id === s.id; }).forEach(function(l){
    insert('notifications', { user_id: l.parent_id, school_id: sid, type: 'announcement',
      title: '🎓 فارغ‌التحصیلی',
      body: s.full_name + ' در سال تحصیلی ' + yearTitle() + ' فارغ‌التحصیل شد.',
      link: 'children', read: 0, created_at: todayISO() });
  });
}

/** انتقال دانش‌آموز به مدرسهٔ دیگر همراه کل پرونده */
function moveStudent(st, toSchool, classId, reason){
  var from = st.school_id;
  var gi = (typeof idxGradesByStudent === 'function') ? idxGradesByStudent() : null;
  var ai = (typeof idxAttByStudent === 'function') ? idxAttByStudent() : null;
  var counts = {
    grades: gi ? (gi.get(st.id) || []).length : db.grades.filter(function(g){ return g.student_id === st.id; }).length,
    attendance: ai ? (ai.get(st.id) || []).length : db.attendance.filter(function(a){ return a.student_id === st.id; }).length,
    discipline: db.discipline.filter(function(d){ return d.student_id === st.id; }).length
  };
  var cls = classId ? byId('classes', classId) : null;
  var grade = cls ? (cls.grade_level || gradeFromName(cls.name)) : st.grade_level;
  /* پروندهٔ تحصیلی با student_id گره خورده و خودبه‌خود همراه می‌آید؛
     فقط school_id رکوردها باید به‌روز شود تا در مدرسهٔ جدید دیده شوند. */
  ['grades','attendance','discipline'].forEach(function(coll){
    db[coll].filter(function(r){ return r.student_id === st.id; })
      .forEach(function(r){ update(coll, r.id, { school_id: toSchool }); });
  });
  update('users', st.id, { school_id: toSchool, grade_level: grade || st.grade_level, status: 'active', active: 1 });
  db.enrollments.filter(function(e){ return e.student_id === st.id; })
    .forEach(function(e){ remove('enrollments', e.id); });
  if(cls) insert('enrollments', { school_id: toSchool, class_id: cls.id, student_id: st.id });
  insert('student_transfers', { student_id: st.id, from_school_id: from, to_school_id: toSchool,
    from_grade: st.grade_level || null, to_grade: grade || null, year_code: yearCode(),
    reason: reason || null, moved_grades: counts.grades, moved_attendance: counts.attendance,
    moved_discipline: counts.discipline, created_at: todayISO() });
  var toName = (byId('schools', toSchool) || {}).name;
  db.parent_links.filter(function(l){ return l.student_id === st.id; }).forEach(function(l){
    insert('notifications', { user_id: l.parent_id, school_id: toSchool, type: 'announcement',
      title: '🔄 انتقال به مدرسه جدید',
      body: st.full_name + ' به «' + toName + '» منتقل شد. کل پرونده تحصیلی و انضباطی همراه ایشان منتقل شد.',
      link: 'children', read: 0, created_at: todayISO() });
  });
  db.users.filter(function(u){ return u.role === 'manager' && u.school_id === from; }).forEach(function(m){
    insert('notifications', { user_id: m.id, school_id: from, type: 'announcement',
      title: '📤 خروج دانش‌آموز', body: st.full_name + ' به «' + toName + '» منتقل شد.',
      link: 'lifecycle', read: 0, created_at: todayISO() });
  });
  return counts;
}

/** ثبت تعارض کد ملی (بدون تکرار) */
function recordConflict(sid, nid, name, other, source){
  if(db.nid_conflicts.some(function(c){ return c.school_id === sid && c.national_id === nid; })) return;
  insert('nid_conflicts', { school_id: sid, national_id: nid, full_name: name,
    other_school_id: other.school_id, other_student_id: other.id,
    source: source || 'manual', status: 'open', created_at: todayISO() });
}

/** فهرست کاربران با پروندهٔ ناقص */
function incompleteUsers(sid){
  var out = [];
  var linked = Object.create(null);
  db.parent_links.forEach(function(l){ linked[l.student_id] = true; });
  db.users.filter(function(u){
    return u.school_id === sid && ['student','teacher','manager'].indexOf(u.role) > -1
        && u.active && (u.status || 'active') === 'active';
  }).forEach(function(u){
    var miss = [];
    if(!u.national_id) miss.push('کد ملی');
    if(u.role === 'student'){
      if(!classOf(u.id)) miss.push('کلاس');
      if(!linked[u.id]) miss.push('ولی متصل');
      if(!u.birth_date) miss.push('تاریخ تولد');
      if(!u.gender) miss.push('جنسیت');
      if(!u.grade_level) miss.push('پایه تحصیلی');
    } else if(!u.phone) miss.push('شماره موبایل');
    if(miss.length) out.push({ u: u, missing: miss,
      severity: (miss.indexOf('کد ملی') > -1 || miss.indexOf('کلاس') > -1) ? 'high' : 'low' });
  });
  return out.sort(function(a,b){
    return (b.severity === 'high') - (a.severity === 'high') || b.missing.length - a.missing.length;
  });
}

/* ---------------------------- نما ---------------------------- */
function viewLifecycle(){
  var sid = S.user.school_id;
  var tab = ['transfers','conflicts','incomplete','archive'].indexOf(S.tab) > -1 ? S.tab : 'promotion';
  var tabs = [['promotion','🎓 ارتقای پایه'],['transfers','🔄 انتقالی‌ها'],
              ['conflicts','⚠️ کد ملی در مدرسه دیگر'],['incomplete','📋 داده ناقص'],['archive','🗄️ بایگانی']]
    .map(function(t){ return '<button class="btn ' + (tab === t[0] ? '' : 'ghost') +
      '" data-act="tab" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('');
  var body = '';

  if(tab === 'promotion'){
    var rows = db.classes.filter(function(c){ return c.school_id === sid; }).map(function(c){
      var g = c.grade_level || gradeFromName(c.name);
      var n = activeStudentsOfClass(c.id).length;
      var action = !g ? 'unknown' : g === 12 ? 'graduate' : isTerminal(g) ? 'transfer-out' : 'promote';
      return { c: c, g: g, n: n, action: action };
    });
    var sum = { promote:0, transferOut:0, graduate:0, unknown:0 };
    rows.forEach(function(r){
      if(r.action === 'promote') sum.promote += r.n;
      else if(r.action === 'transfer-out') sum.transferOut += r.n;
      else if(r.action === 'graduate') sum.graduate += r.n;
      else sum.unknown++;
    });
    var A = { promote:['ارتقا به پایه بعد','b-green'], 'transfer-out':['پایان مقطع — انتقال','b-amber'],
              graduate:['فارغ‌التحصیلی','b-purple'], unknown:['پایه نامشخص','b-red'] };
    body = '<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--primary-soft),#fff)"><div class="card-body">'
      + '<b>پایان سال تحصیلی ' + yearTitle() + '</b><div class="small muted" style="line-height:2">'
      + 'ابتدایی ۱ تا ۶ · متوسطه اول ۷ تا ۹ · متوسطه دوم ۱۰ تا ۱۲. '
      + 'دانش‌آموز پایه ۶ و ۹ با پایان مقطع «در انتظار انتقال» می‌شود و با ثبت‌نام در مدرسه بعدی کل پرونده‌اش منتقل می‌گردد. '
      + 'پایه ۱۲ فارغ‌التحصیل و در بایگانی همان سال ثبت می‌شود.</div></div></div>'
      + '<div class="grid g4" style="margin-bottom:14px">'
      + statCard('⬆️', fa(sum.promote), 'ارتقا به پایه بعد', 'green')
      + statCard('🚸', fa(sum.transferOut), 'پایان مقطع (۶ و ۹)', 'amber')
      + statCard('🎓', fa(sum.graduate), 'فارغ‌التحصیل (۱۲)', 'purple')
      + statCard('❓', fa(sum.unknown), 'کلاس با پایه نامشخص', 'red') + '</div>'
      + '<div class="card"><div class="card-head"><h3>وضعیت کلاس‌ها در پایان سال</h3>'
      + '<button class="btn" data-act="promote-run">⏭️ اجرای ارتقای پایه</button></div>'
      + '<div class="table-wrap"><table class="table"><thead><tr><th>کلاس</th><th>پایه</th><th>مقطع</th><th>دانش‌آموز</th><th>اقدام پایان سال</th></tr></thead><tbody>'
      + rows.map(function(r){
          return '<tr><td><b>' + esc(r.c.name) + '</b></td><td>' + (r.g ? fa(r.g) : '—') + '</td>'
            + '<td class="small">' + esc(levelOfLC(r.g) || '—') + '</td><td>' + fa(r.n) + '</td>'
            + '<td><span class="badge ' + A[r.action][1] + '">' + A[r.action][0] + '</span></td></tr>';
        }).join('')
      + '</tbody></table></div></div>';
  }

  if(tab === 'transfers'){
    var box = S.filters.box === 'out' ? 'out' : 'in';
    var reqs = db.transfer_requests.filter(function(r){
        return box === 'in' ? r.from_school_id === sid : r.to_school_id === sid; })
      .sort(function(a,b){ return (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || b.id - a.id; });
    var hist = db.student_transfers.filter(function(t){
        return t.from_school_id === sid || t.to_school_id === sid; })
      .sort(function(a,b){ return b.id - a.id; });
    body = '<div class="card" style="margin-bottom:14px"><div class="card-head">'
      + '<h3>' + (box === 'in' ? '📥 درخواست‌های ورودی (از مدارس دیگر)' : '📤 درخواست‌های ارسالی من') + '</h3>'
      + '<div class="row" style="gap:6px">'
      + '<button class="btn sm ' + (box === 'in' ? '' : 'ghost') + '" data-act="tr-box" data-r="in">ورودی</button>'
      + '<button class="btn sm ' + (box === 'out' ? '' : 'ghost') + '" data-act="tr-box" data-r="out">ارسالی</button>'
      + '<button class="btn sm" data-act="tr-new">➕ درخواست انتقال</button></div></div>'
      + (reqs.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>کد ملی</th><th>از</th><th>به</th><th>وضعیت</th><th></th></tr></thead><tbody>'
        + reqs.map(function(r){
            var st = byId('users', r.student_id) || {};
            var S_ = { pending:['در انتظار','b-amber'], approved:['تأیید شد','b-green'], rejected:['رد شد','b-red'] }[r.status];
            return '<tr><td><b>' + esc(st.full_name || '—') + '</b>'
              + (r.note ? '<div class="small muted">' + esc(r.note) + '</div>' : '') + '</td>'
              + '<td class="small muted">' + esc(r.national_id) + '</td>'
              + '<td class="small">' + esc((byId('schools', r.from_school_id) || {}).name || '—') + '</td>'
              + '<td class="small">' + esc((byId('schools', r.to_school_id) || {}).name || '—') + '</td>'
              + '<td><span class="badge ' + S_[1] + '">' + S_[0] + '</span></td>'
              + '<td>' + (box === 'in' && r.status === 'pending' ? '<div class="row" style="gap:5px;flex-wrap:nowrap">'
                + '<button class="btn sm" data-act="tr-ok" data-id="' + r.id + '">تأیید و انتقال</button>'
                + '<button class="btn ghost sm" data-act="tr-no" data-id="' + r.id + '">رد</button></div>' : '') + '</td></tr>';
          }).join('')
        + '</tbody></table></div>'
        : empty('📭','درخواستی نیست','برای ثبت‌نام دانش‌آموزی که در مدرسه دیگری است، درخواست انتقال بدهید.'))
      + '</div>'
      + (hist.length ? '<div class="card"><div class="card-head"><h3>سابقه انتقال‌ها</h3></div>'
        + '<div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>از</th><th>به</th><th>پایه</th><th>پرونده منتقل‌شده</th><th>تاریخ</th></tr></thead><tbody>'
        + hist.map(function(h){
            return '<tr><td><b>' + esc((byId('users', h.student_id) || {}).full_name || '—') + '</b></td>'
              + '<td class="small">' + esc((byId('schools', h.from_school_id) || {}).name || '—') + '</td>'
              + '<td class="small">' + esc((byId('schools', h.to_school_id) || {}).name || '—') + '</td>'
              + '<td>' + (h.from_grade ? fa(h.from_grade) + ' → ' + fa(h.to_grade || '') : '—') + '</td>'
              + '<td class="small">' + fa(h.moved_grades) + ' نمره · ' + fa(h.moved_attendance) + ' حضور · ' + fa(h.moved_discipline) + ' انضباطی</td>'
              + '<td class="small muted">' + jalali(h.created_at) + '</td></tr>';
          }).join('')
        + '</tbody></table></div></div>' : '');
  }

  if(tab === 'conflicts'){
    var crows = db.nid_conflicts.filter(function(c){ return c.school_id === sid; })
      .sort(function(a,b){ return (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.id - a.id; });
    body = '<div class="card"><div class="card-head"><h3>⚠️ کد ملی‌هایی که در مدرسه دیگری ثبت شده‌اند</h3>'
      + '<span class="badge b-amber">' + fa(crows.filter(function(r){ return r.status === 'open'; }).length) + ' باز</span></div>'
      + '<div class="card-body small muted" style="line-height:2">این دانش‌آموزان هنگام ثبت دستی یا ورود اکسل رد شده‌اند، '
      + 'چون کد ملی‌شان در مدرسه دیگری فعال است. با «درخواست انتقال»، مدرسه مبدأ مطلع می‌شود و پس از تأیید، '
      + 'دانش‌آموز با کل پرونده‌اش به مدرسه شما می‌آید.</div>'
      + (crows.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>نام</th><th>کد ملی</th><th>مدرسه فعلی</th><th>منبع</th><th>وضعیت</th><th></th></tr></thead><tbody>'
        + crows.map(function(c){
            var other = byId('schools', c.other_school_id) || {};
            var pend = db.transfer_requests.some(function(r){
              return r.national_id === c.national_id && r.to_school_id === sid && r.status === 'pending'; });
            var S_ = { open:[pend ? 'درخواست ارسال شد' : 'باز','b-amber'], resolved:['منتقل شد','b-green'],
                       dismissed:['بسته شد','b-gray'] }[c.status];
            return '<tr' + (c.status === 'open' ? ' style="background:var(--amber-soft)"' : '') + '>'
              + '<td><b>' + esc(c.full_name || '—') + '</b></td>'
              + '<td class="small muted">' + esc(c.national_id) + '</td>'
              + '<td class="small">' + esc(other.name || '—') + '<div class="muted">' + esc(other.landline || other.phone || '') + '</div></td>'
              + '<td class="small">' + (c.source === 'excel' ? 'ورود اکسل' : 'ثبت دستی') + '</td>'
              + '<td><span class="badge ' + S_[1] + '">' + S_[0] + '</span></td>'
              + '<td>' + (c.status === 'open' ? '<div class="row" style="gap:5px;flex-wrap:nowrap">'
                + (pend ? '' : '<button class="btn sm" data-act="tr-new" data-r="' + esc(c.national_id) + '">درخواست انتقال</button>')
                + '<button class="icon-btn" title="نادیده بگیر" data-act="conf-dismiss" data-id="' + c.id + '">✖️</button></div>' : '') + '</td></tr>';
          }).join('')
        + '</tbody></table></div>' : empty('✅','تعارضی وجود ندارد','')) + '</div>';
  }

  if(tab === 'incomplete'){
    var list = incompleteUsers(sid);
    var total = db.users.filter(function(u){
      return u.school_id === sid && u.active && (u.status || 'active') === 'active'; }).length;
    body = '<div class="grid g3" style="margin-bottom:14px">'
      + statCard('👥', fa(total), 'کل کاربران فعال', 'blue')
      + statCard('📋', fa(list.length), 'پرونده ناقص', 'amber')
      + statCard('⛔', fa(list.filter(function(i){ return i.severity === 'high'; }).length), 'نقص مهم', 'red') + '</div>'
      + '<div class="card"><div class="card-head"><h3>کاربرانی که اطلاعاتشان کامل نیست</h3></div>'
      + (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>نام</th><th>نقش</th><th>کلاس</th><th>موارد ناقص</th><th>شدت</th><th></th></tr></thead><tbody>'
        + list.slice(0, 200).map(function(i){
            return '<tr' + (i.severity === 'high' ? ' style="background:var(--red-soft)"' : '') + '>'
              + '<td><b>' + esc(i.u.full_name) + '</b><div class="small muted">' + esc(i.u.username) + '</div></td>'
              + '<td class="small">' + esc(ROLE_FA[i.u.role] || i.u.role) + '</td>'
              + '<td class="small">' + esc((classOf(i.u.id) || {}).name || '—') + '</td>'
              + '<td class="small">' + i.missing.map(function(m){
                  return '<span class="badge b-gray" style="margin-inline-end:4px">' + esc(m) + '</span>'; }).join('') + '</td>'
              + '<td><span class="badge ' + (i.severity === 'high' ? 'b-red' : 'b-amber') + '">'
              + (i.severity === 'high' ? 'مهم' : 'جزئی') + '</span></td>'
              + '<td><button class="btn ghost sm" data-act="user-edit" data-id="' + i.u.id + '">تکمیل</button></td></tr>';
          }).join('')
        + '</tbody></table></div>' : empty('🎉','همه پرونده‌ها کامل است','')) + '</div>';
  }

  if(tab === 'archive'){
    var arch = db.student_archive.filter(function(a){ return a.school_id === sid; });
    var years = [];
    arch.forEach(function(a){ if(years.indexOf(a.year_code) < 0) years.push(a.year_code); });
    years.sort().reverse();
    var y = S.filters.archYear || years[0] || yearCode();
    var items = arch.filter(function(a){ return a.year_code === y; });
    var avg = items.length ? Math.round(items.reduce(function(a,b){ return a + (b.avg_score || 0); }, 0) / items.length * 100) / 100 : 0;
    var attr = items.length ? Math.round(items.reduce(function(a,b){ return a + (b.attendance_rate || 0); }, 0) / items.length * 10) / 10 : 0;
    body = '<div class="card"><div class="card-head"><h3>🗄️ بایگانی فارغ‌التحصیلان</h3>'
      + (years.length ? '<select class="select" style="width:190px" data-f="archYear">'
        + years.map(function(v){
            var n = arch.filter(function(a){ return a.year_code === v; }).length;
            return '<option value="' + esc(v) + '" ' + (v === y ? 'selected' : '') + '>سال ' + faD(v) + ' — ' + fa(n) + ' نفر</option>';
          }).join('') + '</select>' : '') + '</div>'
      + '<div class="card-body"><div class="grid g3">'
      + '<div><div class="small muted">تعداد فارغ‌التحصیل</div><b style="font-size:20px">' + fa(items.length) + '</b></div>'
      + '<div><div class="small muted">میانگین معدل</div><b style="font-size:20px">' + fa(avg) + '</b></div>'
      + '<div><div class="small muted">میانگین حضور</div><b style="font-size:20px">' + fa(attr) + '٪</b></div></div></div>'
      + (items.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>نام</th><th>کد ملی</th><th>کلاس</th><th>رشته</th><th>معدل</th><th>حضور</th></tr></thead><tbody>'
        + items.map(function(a,i){
            return '<tr><td>' + fa(i+1) + '</td><td><b>' + esc(a.full_name) + '</b></td>'
              + '<td class="small muted">' + esc(a.national_id || '—') + '</td>'
              + '<td class="small">' + esc(a.class_name || '—') + '</td>'
              + '<td class="small">' + esc(a.field || '—') + '</td>'
              + '<td><b>' + fa(a.avg_score) + '</b></td><td>' + fa(a.attendance_rate) + '٪</td></tr>';
          }).join('')
        + '</tbody></table></div>'
        : empty('🗄️','بایگانی این سال خالی است','پس از فارغ‌التحصیل کردن پایه دوازدهم، پرونده‌ها اینجا بایگانی می‌شود.')) + '</div>';
  }

  return '<div class="row" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">' + tabs + '</div>' + body;
}

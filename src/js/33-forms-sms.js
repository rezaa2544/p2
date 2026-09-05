/* ============ فرم‌های رسمی و پنل پیامک ============
   دو تب در روت «formssms» (مدیر و سوپرادمین):
     forms — ساخت و چاپ سه فرم رسمی مدرسه روی کاغذ A4
     sms   — کیف پول پیامک، ارسال گروهی و گزارش ارسال

   ⚠️ با الگوی ایندکس‌شده نوشته شده، نه رونویسی از مرجع:
   آمار کلاس‌ها در «دفتر آمار» با یک پیمایش گروه‌بندی می‌شود؛
   در مرجع به‌ازای هر کلاس کل جدول نمرات و حضور پیمایش می‌شد
   که در مدرسهٔ بزرگ رفتار درجه‌دوم داشت.
   ==================================================== */

/** هر ۷۰ نویسهٔ فارسی یک پیامک حساب می‌شود */
var smsParts = function(t){
  return Math.max(1, Math.ceil(Array.from(String(t || '')).length / 70));
};

/** کیف پول پیامک مدرسه؛ در نبود رکورد، ساخته می‌شود */
function smsWalletOf(sid){
  var w = db.sms_wallet.find(function(x){ return x.school_id === sid; });
  if(!w) w = insert('sms_wallet', { school_id: sid, balance: 0 });
  var price = Number(subSettings().sms_price || 1200);
  return { w: w, balance: Number(w.balance), price: price };
}

/**
 * باز کردن یک سند قابل چاپ در پنجرهٔ تازه.
 * سبک چاپ جداست تا رنگ و سایهٔ رابط روی کاغذ نیاید.
 */
function printableDoc(o){
  var win;
  try{ win = window.open('', '_blank'); }catch(e){ win = null; }
  if(!win){ toast('اجازه باز کردن پنجره داده نشد', 'err'); return false; }
  var html = '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
    + '<title>' + esc(o.title) + '</title><style>'
    + '@page{size:A4 ' + (o.landscape ? 'landscape' : 'portrait') + ';margin:12mm}'
    + 'body{font-family:Vazirmatn,Tahoma,sans-serif;color:#10203a;font-size:12.5px;margin:0}'
    + '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #14225a;padding-bottom:8px;margin-bottom:10px}'
    + '.hd h1{font-size:16px;margin:0 0 3px;color:#14225a}.hd .s{font-size:11.5px;color:#5b6b8c}'
    + '.meta{display:flex;gap:16px;flex-wrap:wrap;font-size:11.5px;color:#33415c;margin-bottom:10px}'
    + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid #b9c4da;padding:5px 6px;text-align:right}'
    + 'th{background:#eef3fb;font-weight:800;font-size:11.5px}td.c,th.c{text-align:center}'
    + 'tr:nth-child(even) td{background:#fafcff}'
    + '.sign{display:flex;justify-content:space-between;margin-top:26px;font-size:11.5px;color:#5b6b8c}'
    + '.note{margin-top:10px;font-size:11px;color:#5b6b8c;line-height:1.9}.empty{height:22px}'
    + '@media print{.np{display:none}}</style></head><body>'
    + '<div class="hd"><div><h1>' + esc(o.title) + '</h1><div class="s">' + esc(o.school || '') + '</div></div>'
    + '<div style="text-align:left" class="s">' + esc(o.subtitle || '')
    + '<br>تاریخ چاپ: ' + isoToJalali(todayISO()) + '</div></div>'
    + o.body + (o.note ? '<div class="note">' + o.note + '</div>' : '')
    + '<div class="sign"><span>امضای دبیر / مسئول</span><span>مهر و امضای مدیر مدرسه</span></div>'
    + '<div class="np" style="text-align:center;margin-top:16px">'
    + '<button onclick="window.print()" style="padding:8px 22px;border:none;border-radius:9px;'
    + 'background:#1668f0;color:#fff;font-family:inherit;font-size:13px;cursor:pointer">🖨️ چاپ</button></div>'
    + '</body></html>';
  try{
    win.document.write(html);
    win.document.close();
    /* چاپ خودکار پس از بارگذاری فونت‌ها */
    setTimeout(function(){ try{ win.print(); }catch(e){} }, 500);
  }catch(e){ return false; }
  return true;
}

/* ---------- سازندهٔ بدنه سه فرم (جدا از چاپ، تا تست‌پذیر باشد) ---------- */

/**
 * گواهی نمرات یک دانش‌آموز برای یک نوبت (بند ۱.۶).
 * امروز: اچ‌تی‌ام‌الِ چاپ‌شونده (printableDoc). نسخهٔ PDF قفل‌شده است
 * در ARCHITECTURE_DECISIONS.md (بخش «قفل‌شده — منتظر پیاده‌سازی کامل»)
 * و فقط وقتی زمانش فرا برسد ساخته می‌شود.
 */
function transcriptCert(sid, term){
  const st = byId('users', sid);
  if(!st || st.role !== 'student') return {ok:false, msg:'دانش‌آموز پیدا نشد.'};
  const cls = classOf(sid);
  const school = byId('schools', st.school_id) || {};
  const list = db.grades.filter(g=>g.student_id===sid && (!term || g.term===term));
  if(!list.length) return {ok:false, msg:'برای این نوبت نمره‌ای ثبت نشده است.'};
  const bySub = Object.create(null);
  list.forEach(g=>{ (bySub[g.subject_id] = bySub[g.subject_id] || []).push(g); });
  let tw=0, ts=0;
  const rows = Object.keys(bySub).map(id=>{
    const sub = byId('subjects', Number(id)) || {};
    const arr = bySub[id];
    const av = Math.round(arr.reduce((a,g)=>a+g.score,0)/arr.length*100)/100;
    const w = Number(sub.weekly_hours) || 1;
    tw += w; ts += av*w;
    return {name: sub.name || '—', w: w, av: av, n: arr.length};
  }).sort((a,b)=>a.name < b.name ? -1 : 1);
  const gpa = tw ? Math.round(ts/tw*100)/100 : 0;
  const body =
    '<div class="meta"><span>نام: <b>' + esc(st.full_name) + '</b></span>'
    + '<span>کد ملی: <b>' + esc(st.national_id || '—') + '</b></span>'
    + '<span>کلاس: <b>' + esc(cls ? cls.name : '—') + '</b></span>'
    + '<span>پایه: <b>' + esc(cls ? (cls.grade || '—') : '—') + '</b></span></div>'
    + '<table><thead><tr><th class="c" style="width:34px">#</th><th>درس</th>'
    + '<th class="c" style="width:80px">ساعت هفتگی</th><th class="c" style="width:90px">تعداد برگه</th>'
    + '<th class="c" style="width:100px">نمره (از ۲۰)</th></tr></thead><tbody>'
    + rows.map((r,i)=>'<tr><td class="c">' + fa(i+1) + '</td><td>' + esc(r.name) + '</td>'
        + '<td class="c">' + fa(r.w) + '</td><td class="c">' + fa(r.n) + '</td>'
        + '<td class="c"><b>' + fa(r.av) + '</b></td></tr>').join('')
    + '</tbody></table>'
    + '<div class="meta" style="margin-top:10px"><span>معدل وزنی: <b style="font-size:13px">'
    + fa(gpa) + '</b> از ۲۰</span></div>';
  return {ok:true,
    title:'گواهی نمرات',
    school: esc(school.name || '') + (school.code ? ' — کد ' + esc(school.code) : ''),
    subtitle: 'دانش‌آموز: ' + esc(st.full_name) + ' · ' + (term || 'همهٔ نوبت‌ها') + ' · سال تحصیلی ' + yearTitle(),
    body: body,
    note:'نمرهٔ هر درس میانگین برگه‌های ثبت‌شدهٔ همان نوبت است و معدل با وزنی بر پایهٔ ساعت هفتگی محاسبه می‌شود. این گواهی از سامانهٔ پایش چاپ شده است.'};
}

/** لیست نمرات کلاس با ستون‌های خالی برای تکمیل دستی */
function formGradeSheet(cls, subj, term){
  var sts = studentsOfClass(cls.id);
  var gmap = Object.create(null);
  var gi = (typeof idxGradesByStudent === 'function') ? idxGradesByStudent() : null;
  sts.forEach(function(s){
    var list = gi ? (gi.get(s.id) || []) : db.grades.filter(function(g){ return g.student_id === s.id; });
    var arr = [];
    for(var i = 0; i < list.length; i++){
      var g = list[i];
      if(g.class_id !== cls.id) continue;
      if(subj && g.subject_id !== subj.id) continue;
      if(g.term !== term) continue;
      arr.push(g.score);
    }
    if(arr.length) gmap[s.id] = arr;
  });
  return { count: sts.length,
    body: '<div class="meta"><span>تعداد دانش‌آموز: <b>' + fa(sts.length) + '</b></span>'
      + '<span>دبیر: ____________</span></div>'
      + '<table><thead><tr><th class="c" style="width:34px">#</th><th>نام و نام خانوادگی</th>'
      + '<th class="c" style="width:100px">کد ملی</th><th class="c" style="width:70px">نمره ثبت‌شده</th>'
      + '<th class="c" style="width:70px">مستمر</th><th class="c" style="width:70px">پایانی</th>'
      + '<th class="c" style="width:80px">امضا</th></tr></thead><tbody>'
      + sts.map(function(s, i){
          var arr = gmap[s.id] || [];
          var av = arr.length ? Math.round(arr.reduce(function(a,b){ return a + b; }, 0) / arr.length * 100) / 100 : '';
          return '<tr><td class="c">' + fa(i + 1) + '</td><td>' + esc(s.full_name) + '</td>'
            + '<td class="c">' + esc(s.national_id || '—') + '</td>'
            + '<td class="c">' + (av === '' ? '' : fa(av)) + '</td>'
            + '<td class="empty"></td><td class="empty"></td><td class="empty"></td></tr>';
        }).join('')
      + '</tbody></table>' };
}

/** صورت‌جلسهٔ برگزاری امتحان با فهرست مراقبان و حاضران */
function formExamMinutes(e){
  var cls = byId('classes', e.class_id) || {}, subj = byId('subjects', e.subject_id) || {};
  var sts = studentsOfClass(e.class_id);
  var duties = db.exam_duties.filter(function(d){ return d.exam_id === e.id; });
  return { count: sts.length, cls: cls, subj: subj,
    body: '<div class="meta"><span>تاریخ: <b>' + jalaliLongFa(e.date) + '</b></span>'
      + '<span>ساعت: <b>' + faD(e.start_time) + ' تا ' + faD(toHHMMP(toMinP(e.start_time) + e.duration)) + '</b></span>'
      + '<span>مدت: <b>' + fa(e.duration) + ' دقیقه</b></span>'
      + '<span>محل: <b>' + esc(e.room || '—') + '</b></span>'
      + '<span>تعداد دانش‌آموز: <b>' + fa(sts.length) + '</b></span></div>'
      + '<table style="margin-bottom:10px"><thead><tr><th>مراقبان جلسه</th>'
      + '<th class="c" style="width:110px">سمت</th><th class="c" style="width:110px">امضا</th></tr></thead><tbody>'
      + (duties.length ? duties.map(function(d){
            return '<tr><td>' + esc((byId('users', d.teacher_id) || {}).full_name || '') + '</td>'
              + '<td class="c">' + (d.role === 'main' ? 'مراقب اصلی' : 'کمک‌مراقب') + '</td>'
              + '<td class="empty"></td></tr>';
          }).join('')
        : '<tr><td colspan="3" class="c">مراقبی ثبت نشده است</td></tr>')
      + '</tbody></table><table><thead><tr><th class="c" style="width:34px">#</th>'
      + '<th>نام و نام خانوادگی</th><th class="c" style="width:100px">کد ملی</th>'
      + '<th class="c" style="width:80px">حاضر/غایب</th><th class="c" style="width:90px">امضا</th></tr></thead><tbody>'
      + sts.map(function(s, i){
          return '<tr><td class="c">' + fa(i + 1) + '</td><td>' + esc(s.full_name) + '</td>'
            + '<td class="c">' + esc(s.national_id || '—') + '</td>'
            + '<td class="empty"></td><td class="empty"></td></tr>';
        }).join('') + '</tbody></table>' };
}

/** دفتر آمار مدرسه — یک پیمایش برای نمرات و یک پیمایش برای حضور */
function formStatistics(sid){
  var classes = db.classes.filter(function(c){ return c.school_id === sid; });
  /* گروه‌بندی یک‌باره به‌جای پیمایش کل جدول به ازای هر کلاس */
  var gSum = Object.create(null), gCnt = Object.create(null);
  db.grades.forEach(function(g){
    if(g.school_id !== sid) return;
    gSum[g.class_id] = (gSum[g.class_id] || 0) + g.score;
    gCnt[g.class_id] = (gCnt[g.class_id] || 0) + 1;
  });
  var absBy = Object.create(null), attAll = 0, presAll = 0;
  db.attendance.forEach(function(a){
    if(a.school_id !== sid) return;
    attAll++;
    if(a.status === 'present') presAll++;
    else if(a.status === 'absent') absBy[a.class_id] = (absBy[a.class_id] || 0) + 1;
  });
  var tot = { students:0, girls:0, boys:0, capacity:0 };
  var rows = classes.map(function(c){
    var sts = studentsOfClass(c.id);
    var girls = 0, boys = 0;
    for(var i = 0; i < sts.length; i++){
      if(sts[i].gender === 'دختر') girls++;
      else if(sts[i].gender === 'پسر') boys++;
    }
    tot.students += sts.length; tot.girls += girls; tot.boys += boys;
    tot.capacity += (c.capacity || 0);
    return { c: c, n: sts.length, girls: girls, boys: boys,
      avg: gCnt[c.id] ? Math.round(gSum[c.id] / gCnt[c.id] * 100) / 100 : 0,
      abs: absBy[c.id] || 0 };
  });
  var rate = attAll ? Math.round(presAll / attAll * 1000) / 10 : 0;
  var teachers = db.users.filter(function(u){ return u.school_id === sid && u.role === 'teacher'; }).length;
  return { tot: tot, rows: rows, rate: rate,
    body: '<div class="meta"><span>کل دانش‌آموزان: <b>' + fa(tot.students) + '</b></span>'
      + '<span>دختر: <b>' + fa(tot.girls) + '</b> · پسر: <b>' + fa(tot.boys) + '</b></span>'
      + '<span>کلاس‌ها: <b>' + fa(classes.length) + '</b></span>'
      + '<span>دبیران: <b>' + fa(teachers) + '</b></span>'
      + '<span>ظرفیت: <b>' + fa(tot.capacity) + '</b></span>'
      + '<span>میانگین حضور: <b>' + fa(rate) + '٪</b></span></div>'
      + '<table><thead><tr><th class="c" style="width:34px">#</th><th>کلاس</th><th class="c">پایه</th>'
      + '<th class="c">رشته</th><th class="c">دانش‌آموز</th><th class="c">دختر</th><th class="c">پسر</th>'
      + '<th class="c">ظرفیت</th><th class="c">میانگین</th><th class="c">غیبت</th></tr></thead><tbody>'
      + rows.map(function(r, i){
          return '<tr><td class="c">' + fa(i + 1) + '</td><td>' + esc(r.c.name) + '</td>'
            + '<td class="c">' + (r.c.grade_level ? fa(r.c.grade_level) : '—') + '</td>'
            + '<td class="c">' + esc(r.c.field || '—') + '</td>'
            + '<td class="c"><b>' + fa(r.n) + '</b></td><td class="c">' + fa(r.girls) + '</td>'
            + '<td class="c">' + fa(r.boys) + '</td><td class="c">' + fa(r.c.capacity || '—') + '</td>'
            + '<td class="c">' + fa(r.avg) + '</td><td class="c">' + fa(r.abs) + '</td></tr>';
        }).join('')
      + '<tr style="background:#eef3fb;font-weight:800"><td colspan="4" class="c">جمع کل</td>'
      + '<td class="c">' + fa(tot.students) + '</td><td class="c">' + fa(tot.girls) + '</td>'
      + '<td class="c">' + fa(tot.boys) + '</td><td class="c">' + fa(tot.capacity) + '</td>'
      + '<td class="c">—</td><td class="c">—</td></tr></tbody></table>' };
}

/** گیرندگان پیامک بر اساس مخاطب انتخاب‌شده — فقط شماره‌های معتبر */
function smsTargets(sid, aud, cid){
  var out = [], seen = Object.create(null), i;
  var push = function(u){
    if(u && !seen[u.id] && /^09\d{9}$/.test(u.phone || '')){ seen[u.id] = true; out.push(u); }
  };
  if(aud === 'class'){
    var ec = (typeof idxEnrollByClass === 'function') ? idxEnrollByClass() : null;
    var es = ec ? (ec.get(Number(cid)) || [])
                : db.enrollments.filter(function(e){ return e.class_id === Number(cid); });
    var kid = Object.create(null);
    es.forEach(function(e){ kid[e.student_id] = true; });
    db.parent_links.forEach(function(l){ if(kid[l.student_id]) push(byId('users', l.parent_id)); });
  } else if(aud === 'parents'){
    var mine = Object.create(null);
    schoolStudents(sid).forEach(function(s){ mine[s.id] = true; });
    db.parent_links.forEach(function(l){ if(mine[l.student_id]) push(byId('users', l.parent_id)); });
  } else {
    var role = aud === 'teachers' ? 'teacher' : 'student';
    db.users.forEach(function(u){ if(u.school_id === sid && u.role === role && u.active) push(u); });
  }
  return out;
}

/* ------------------------------- نما ------------------------------- */
function viewFormsSms(){
  var tab = S.tab === 'sms' ? 'sms' : 'forms';
  var sid = S.user.school_id;
  var head = '<div class="row" style="margin-bottom:14px;gap:8px">'
    + '<button class="btn ' + (tab === 'forms' ? '' : 'ghost') + '" data-act="tab" data-t="forms">🖨️ فرم‌های رسمی</button>'
    + '<button class="btn ' + (tab === 'sms' ? '' : 'ghost') + '" data-act="tab" data-t="sms">📱 پنل پیامک</button></div>';

  if(tab === 'forms'){
    var classes = visibleClasses(), subs = visibleSubjects();
    var exams = db.exams.filter(function(e){ return e.school_id === sid; }).slice(0, 50);
    var cards = [
      ['grade-sheet','لیست نمرات کلاس','با ستون خالی برای ثبت دستی نمره و امضا'],
      ['exam-minutes','صورت‌جلسه امتحانات','مشخصات جلسه، مراقبان و فهرست حاضران با امضا'],
      ['statistics','دفتر آمار مدرسه','آمار کلاس‌ها، جنسیت، ظرفیت، میانگین و غیبت']
    ].map(function(x){
      return '<div class="card"><div class="card-head"><h3>' + x[1] + '</h3></div><div class="card-body">'
        + '<div class="small muted" style="min-height:42px;line-height:2">' + x[2] + '</div>'
        + '<button class="btn" style="width:100%;justify-content:center" data-act="form-print" data-r="'
        + x[0] + '">🖨️ ساخت و چاپ</button></div></div>';
    }).join('');
    return head + '<div class="card" style="margin-bottom:14px"><div class="card-body"><div class="grid g4">'
      + f('کلاس', sel('fm_class', classes.map(function(c){ return [c.id, c.name]; })))
      + f('درس', sel('fm_subject', [['','— بدون درس —']].concat(subs.map(function(x){ return [x.id, x.name]; }))))
      + f('نوبت', sel('fm_term', TERMS.map(function(t){ return [t, t]; })))
      + f('جلسه امتحان', sel('fm_exam', [['','— انتخاب —']].concat(exams.map(function(e){
          return [e.id, jalali(e.date) + ' · ' + ((byId('classes', e.class_id) || {}).name || '')
                 + ' · ' + ((byId('subjects', e.subject_id) || {}).name || '')];
        }))))
      + '</div></div></div><div class="grid g3">' + cards + '</div>';
  }

  var wal = smsWalletOf(sid);
  var msgs = db.sms_log.filter(function(m){ return m.school_id === sid; })
    .sort(function(a,b){ return b.id - a.id; }).slice(0, 60);
  var sent = msgs.filter(function(m){ return m.status === 'sent'; }).length;
  return head + '<div class="grid g4" style="margin-bottom:14px">'
    + statCard('💬', fa(wal.balance), 'اعتبار پیامک', 'blue')
    + statCard('✅', fa(sent), 'ارسال موفق', 'green')
    + statCard('📅', fa(msgs.length), 'کل ارسال‌ها', 'amber')
    + statCard('💰', rialShort(wal.balance * wal.price), 'ارزش اعتبار (ریال)', 'purple') + '</div>'
    + '<div class="card" style="margin-bottom:14px"><div class="card-head"><h3>📱 ارسال پیامک</h3>'
    + '<div class="row" style="gap:8px"><button class="btn ghost" data-act="sms-topup">➕ شارژ اعتبار</button>'
    + '<button class="btn" data-act="sms-new">✉️ پیامک جدید</button></div></div>'
    + '<div class="card-body small muted" style="line-height:2">تعرفه هر پیامک: <b>' + rial(wal.price)
    + '</b> ریال · هر <b>۷۰</b> نویسه فارسی یک پیامک حساب می‌شود.'
    + (wal.balance < 50 ? '<div style="color:var(--red)">⚠️ اعتبار شما رو به پایان است.</div>' : '')
    + '</div></div>'
    + '<div class="card"><div class="card-head"><h3>گزارش ارسال</h3></div>'
    + (msgs.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>گیرنده</th><th>شماره</th>'
      + '<th>متن</th><th>وضعیت</th><th>زمان</th></tr></thead><tbody>'
      + msgs.map(function(m){
          return '<tr><td>' + esc((byId('users', m.user_id) || {}).full_name || '—') + '</td>'
            + '<td class="small muted">' + esc(m.phone) + '</td>'
            + '<td class="small" style="max-width:240px">' + esc(String(m.body).slice(0, 60)) + '…</td>'
            + '<td><span class="badge ' + (m.status === 'sent' ? 'b-green' : 'b-amber') + '">'
            + (m.status === 'sent' ? 'ارسال شد' : 'در صف') + '</span></td>'
            + '<td class="small muted">' + jalali(m.created_at) + '</td></tr>';
        }).join('')
      + '</tbody></table></div>' : empty('📭','پیامکی ارسال نشده','')) + '</div>';
}

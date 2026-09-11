/* ═══════════════════════════════════════════════════════════════════
   گزارش اختلاف با کارنامهٔ سیدا (بند ۱۰ / بند ۴.۱۲) — نسخهٔ سبک

   مدرسهٔ رسمی ایران نمره‌ها را در سامانهٔ «سیدا» دارد. مدیر هر از
   گاهی نمرهٔ سیدا را برای یک دانش‌آموز + درس + نوبت **دستی** وارد
   می‌کند؛ سامانه فقط **اختلاف** آن را با میانگینِ پایش همان
   دانش‌آموز/درس/نوبت نشان می‌دهد — هیچ چیزی را اصلاح نمی‌کند
   (قفل ۱۰.۱).

   داده:
     sedascores {school_id, student_id, subject_id, term, score,
                 entered_by, created_at, note}
   یک ردیف برای هر (دانش‌آموز، درس، نوبت) — ورودِ تکراری همان ردیف
   را به‌روز می‌کند (upsert) تا کلیدِ منحصربه‌فرد نشکند.

   مقایسه:
     نمرهٔ پایش  = میانگینِ برگه‌های `grades` همان دانش‌آموز/درس/نوبت
                   (همین منطقِ transcriptCert)
     اختلاف     = نمرهٔ سیدا − نمرهٔ پایش (۲ رقم اعشار)

   امنیت: همهٔ تغییرات فقط **مدیر** + دانش‌آموز و درس باید از مدرسهٔ
   خودِ مدیر + نمره باید عددِ ۰ تا ۲۰ باشد (روی داده، نه فقط دکمه).
   ═══════════════════════════════════════════════════════════════════ */

function sedasOf(schoolId, term){
  return db.sedascores
    .filter(function(r){ return r.school_id===schoolId && (!term || r.term===term); })
    .sort(function(a,b){
      var sa = (byId('users', a.student_id)||{}).full_name || '';
      var sb = (byId('users', b.student_id)||{}).full_name || '';
      if(sa !== sb) return sa.localeCompare(sb, 'fa');
      return (a.subject_id||0) - (b.subject_id||0);
    });
}
/** میانگینِ نمره‌های پایش برای یک دانش‌آموز/درس/نوبت (منطق کارنامه) */
function payeshAvgOf(studentId, subjectId, term){
  var rows = db.grades.filter(function(g){
    return g.student_id===studentId && g.subject_id===subjectId && g.term===term;
  });
  if(!rows.length) return null;
  var s = 0;
  rows.forEach(function(g){ s += Number(g.score) || 0; });
  return Math.round(s / rows.length * 100) / 100;
}
/** وضعیتِ یک ردیفِ سیدا: missing / same / payesh-high / seda-high */
function sedaRowStatus(studentId, subjectId, term, sedaScore){
  var p = payeshAvgOf(studentId, subjectId, term);
  if(p === null) return {key:'missing', payesh:null, seda:sedaScore, diff:null};
  var d = Math.round((Number(sedaScore) - p) * 100) / 100;
  return {
    key: d === 0 ? 'same' : (p > Number(sedaScore) ? 'payesh-high' : 'seda-high'),
    payesh: p, seda: Number(sedaScore), diff: d
  };
}

/* ─────────────── ثبت/حذف (مدیر) ─────────────── */

function sedasUpsert(studentId, subjectId, term, score, note){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند نمرهٔ سیدا را وارد کند'};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  var st = byId('users', studentId);
  if(!st || st.role !== 'student') return {ok:false, msg:'دانش‌آموز پیدا نشد'};
  if(st.school_id !== u.school_id) return {ok:false, msg:'این دانش‌آموز متعلق به مدرسهٔ شما نیست'};
  var sub = byId('subjects', subjectId);
  if(!sub) return {ok:false, msg:'درس پیدا نشد'};
  if(sub.school_id !== u.school_id) return {ok:false, msg:'این درس متعلق به مدرسهٔ شما نیست'};
  if(TERMS.indexOf(term) < 0) return {ok:false, msg:'نوبت معتبر نیست'};
  var sc = Number(score);
  if(isNaN(sc) || sc < 0 || sc > 20) return {ok:false, msg:'نمره باید عددی بین ۰ و ۲۰ باشد'};
  var now = new Date().toISOString();
  var existing = db.sedascores.filter(function(r){
    return r.school_id===u.school_id && r.student_id===studentId &&
           r.subject_id===subjectId && r.term===term;
  })[0];
  if(existing){
    update('sedascores', existing.id, {score: sc, entered_by: u.id, created_at: now, note: String(note||'').trim()});
    return {ok:true, rec: byId('sedascores', existing.id), updated:true};
  }
  var rec = {
    school_id: u.school_id,
    student_id: studentId,
    subject_id: subjectId,
    term: term,
    score: sc,
    entered_by: u.id,
    created_at: now,
    note: String(note||'').trim()
  };
  return {ok:true, rec: insert('sedascores', rec), updated:false};
}
function sedasDel(rowId){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند ردیف سیدا را حذف کند'};
  var r = byId('sedascores', rowId);
  if(!r) return {ok:false, msg:'ردیف پیدا نشد'};
  if(r.school_id !== u.school_id) return {ok:false, msg:'این ردیف متعلق به مدرسهٔ شما نیست'};
  remove('sedascores', rowId);
  return {ok:true};
}

/* ─────────────── نمای مدیر ─────────────── */

function viewSidaDiff(){
  var u = S.user;
  var term = S.filters && S.filters.term || '';
  var rows = sedasOf(u.school_id, term);
  var mismatches = 0, missing = 0;
  rows.forEach(function(r){
    var st = sedaRowStatus(r.student_id, r.subject_id, r.term, r.score);
    if(st.key==='payesh-high' || st.key==='seda-high') mismatches++;
    if(st.key==='missing') missing++;
  });
  var h = '<div class="page-head"><h2>⚖️ اختلاف با سیدا</h2></div>';
  h += '<div class="card"><div class="card-head"><div class="row" style="gap:8px;flex-wrap:wrap">'
    + '<select class="select" data-f="term" style="width:130px" aria-label="انتخاب نوبت"><option value="">همهٔ نوبت‌ها</option>'
    + TERMS.map(function(t){ return '<option' + (term===t?' selected':'') + '>' + esc(t) + '</option>'; }).join('')
    + '</select>'
    + '<span class="badge b-gray">ردیف: ' + fa(rows.length) + '</span>'
    + (mismatches ? '<span class="badge b-red">اختلاف: ' + fa(mismatches) + '</span>' : '<span class="badge b-green">بدون اختلاف</span>')
    + (missing ? '<span class="badge b-amber">بدون نمرهٔ پایش: ' + fa(missing) + '</span>' : '')
    + '</div><button class="btn" data-act="sd-new">➕ نمرهٔ سیدا</button></div><div class="card-body">';
  if(!rows.length){
    h += empty('⚖️','نمرهٔ سیدایی وارد نشده','نمرهٔ سیدا را دستی وارد کنید تا اختلاف با پایش محاسبه شود.');
  } else {
    h += '<div class="table-wrap"><table><thead><tr><th>دانش‌آموز</th><th>درس</th><th>نوبت</th>'
      + '<th class="c">پایش</th><th class="c">سیدا</th><th class="c">اختلاف (سیدا − پایش)</th><th></th></tr></thead><tbody>'
      + rows.map(function(r){
          var st2 = byId('users', r.student_id) || {};
          var sub = byId('subjects', r.subject_id) || {};
          var s = sedaRowStatus(r.student_id, r.subject_id, r.term, r.score);
          var badge = s.key==='same' ? 'b-green' : (s.key==='missing' ? 'b-amber' : 'b-red');
          var label = s.key==='same' ? 'هم‌خوان' : (s.key==='missing' ? 'بدون نمرهٔ پایش'
            : (s.key==='payesh-high' ? 'پایش بالاتر' : 'سیدا بالاتر'));
          var diffTxt = s.diff===null ? '—' : (s.diff>0 ? '+' : '') + fa(s.diff);
          return '<tr>'
            + '<td>' + esc(st2.full_name||'؟') + '</td>'
            + '<td>' + esc(sub.name||'—') + '</td>'
            + '<td><span class="badge b-gray">' + esc(r.term) + '</span></td>'
            + '<td class="c">' + (s.payesh===null ? '<span class="muted">—</span>' : fa(s.payesh)) + '</td>'
            + '<td class="c"><b>' + fa(s.seda) + '</b></td>'
            + '<td class="c"><span class="badge ' + badge + '">' + esc(label) + ' (' + diffTxt + ')</span></td>'
            + '<td class="c"><button class="btn ghost sm" data-act="sd-del" data-id="' + r.id + '">حذف</button></td>'
            + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + '<div class="muted small" style="margin-top:8px">نمرهٔ پایش = میانگینِ برگه‌های ثبت‌شدهٔ همان نوبت (منطقِ کارنامه). این صفحه فقط مقایسه می‌کند — هیچ نمره‌ای را اصلاح نمی‌کند.</div>';
  }
  return h + '</div></div>';
}

/* ─────────────── دادهٔ نمونه (قطعی، فقط دمو) ─────────────── */

function generateSidaDemo(){
  if(db.sedascores.length) return;
  var sc = db.schools.filter(function(s){ return s.active; })[0];
  if(!sc) return;
  var mgr = db.users.filter(function(x){ return x.role==='manager' && x.school_id===sc.id; })[0];
  var now = new Date().toISOString();
  /* ۳ دانش‌آموز + ۳ درسِ همان مدرسه که نمرهٔ پایش دارند */
  var studs = db.users.filter(function(x){ return x.role==='student' && x.school_id===sc.id; });
  var subs = db.subjects.filter(function(x){ return x.school_id===sc.id; });
  var mk = function(stId, subId, term, score, note){
    add('sedascores', {school_id: sc.id, student_id: stId, subject_id: subId,
      term: term, score: score, entered_by: mgr ? mgr.id : 0,
      created_at: now, note: note});
  };
  if(studs.length >= 3 && subs.length >= 3){
    var s0 = studs[0], s1 = studs[1], s2 = studs[2];
    var b0 = subs[0], b1 = subs[1], b2 = subs[2];
    /* هم‌خوان: دقیقاً همان میانگینِ پایش */
    var p0 = payeshAvgOf(s0.id, b0.id, 'نوبت اول');
    if(p0 !== null) mk(s0.id, b0.id, 'نوبت اول', p0, 'هم‌خوان');
    /* سیدا بالاتر */
    var p1 = payeshAvgOf(s1.id, b1.id, 'نوبت اول');
    if(p1 !== null) mk(s1.id, b1.id, 'نوبت اول', Math.min(20, Math.round((p1+0.5)*100)/100), 'برگهٔ دوبارهٔ سیدا');
    /* پایش بالاتر */
    var p2 = payeshAvgOf(s2.id, b2.id, 'نوبت دوم');
    if(p2 !== null) mk(s2.id, b2.id, 'نوبت دوم', Math.max(0, Math.round((p2-1.5)*100)/100), 'تفاوت میانگین‌گیری');
  }
}

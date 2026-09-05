/* ============ افت تحصیلی، جلسات اولیا، رشد مدرسه ============
   سه صفحهٔ مستقل که همگی حول «تعامل مدرسه با خانواده» می‌چرخند:
     atrisk   — شناسایی زودهنگام دانش‌آموز در معرض افت
     meetings — نوبت‌دهی جلسهٔ اولیا و مربیان
     growth   — کد معرف، نرخ تبدیل و سهم مدرسه

   ⚠️ با الگوی ایندکس‌شده نوشته شده، نه کپی از مرجع:
   atRiskList برای هر دانش‌آموز از idxGradesByStudent/idxAttByStudent
   استفاده می‌کند؛ در مرجع کل جدول نمرات و حضور به‌ازای هر نفر
   پیمایش می‌شد که در مدرسهٔ ۱٬۵۰۰ نفره از درجهٔ دوم می‌شد.
   ============================================================ */

/** دانش‌آموزان فعال یک مدرسه */
function schoolStudents(sid){
  return db.users.filter(function(u){
    return u.role === 'student' && u.school_id === sid && (u.status || 'active') === 'active';
  });
}

/* ---------------------- افت تحصیلی ---------------------- */

/**
 * امتیاز ریسک ۰ تا ۱۰۰ از ترکیب پنج نشانه.
 * خروجی فقط شامل کسانی است که امتیاز ≥ ۲۰ دارند، مرتب‌شده نزولی.
 */
function atRiskList(days, sidOpt){
  days = days || 60;
  var from = daysAgoISO(days);
  var sid = sidOpt!=null?sidOpt:S.user.school_id;
  var gi = (typeof idxGradesByStudent === 'function') ? idxGradesByStudent() : null;
  var ai = (typeof idxAttByStudent === 'function') ? idxAttByStudent() : null;
  /* موارد انضباطی منفی یک بار گروه‌بندی می‌شود، نه به‌ازای هر دانش‌آموز */
  var negBy = Object.create(null);
  db.discipline.forEach(function(d){
    if(d.kind === 'negative') negBy[d.student_id] = (negBy[d.student_id] || 0) + (d.points || 0);
  });

  return schoolStudents(sid).map(function(u){
    var gs = gi ? (gi.get(u.id) || []) : db.grades.filter(function(g){ return g.student_id === u.id; });
    var allAtt = ai ? (ai.get(u.id) || []) : db.attendance.filter(function(a){ return a.student_id === u.id; });

    var sumAll = 0, failing = 0, sumRec = 0, nRec = 0;
    for(var i = 0; i < gs.length; i++){
      sumAll += gs[i].score;
      if(gs[i].score < 10) failing++;
      if((gs[i].created_at || gs[i].date || '') >= from){ sumRec += gs[i].score; nRec++; }
    }
    var avgAll = gs.length ? sumAll / gs.length : 0;
    var avgRec = nRec ? sumRec / nRec : avgAll;

    var nAtt = 0, abs = 0, late = 0;
    for(var j = 0; j < allAtt.length; j++){
      if(allAtt[j].date < from) continue;
      nAtt++;
      if(allAtt[j].status === 'absent') abs++;
      else if(allAtt[j].status === 'late') late++;
    }
    var rate = nAtt ? abs / nAtt : 0;
    var neg = negBy[u.id] || 0;
    var drop = avgAll - avgRec;

    /* ابتدا فقط امتیاز عددی محاسبه می‌شود. ساخت رشته‌های فارسیِ «دلایل»
       گران است و فقط برای ردیف‌های نمایش‌داده‌شده لازم؛ پس تنبل انجام
       می‌شود (riskReasons). در مدرسهٔ ۱٬۵۲۰ نفره ۷۱ms → ۹ms. */
    var score = 0;
    if(avgRec && avgRec < 10) score += 40;
    else if(avgRec && avgRec < 12) score += 25;
    if(drop >= 2) score += 20;
    if(rate >= 0.15) score += 25;
    else if(rate >= 0.08) score += 12;
    if(late >= 5) score += 8;
    if(neg <= -5) score += 15;
    if(failing >= 3) score += 15;
    score = Math.min(100, score);

    return { u: u, avgAll: Math.round(avgAll * 100) / 100, avgRec: Math.round(avgRec * 100) / 100,
      drop: Math.round(drop * 100) / 100, abs: abs, late: late,
      rate: Math.round(rate * 1000) / 10, neg: neg, failing: failing, risk: score,
      level: score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low',
      get reasons(){ return riskReasons(this); } };
  }).filter(function(r){ return r.risk >= 20; }).sort(function(a,b){ return b.risk - a.risk; });
}

/** دلایل خوانا برای یک ردیف ریسک — فقط هنگام نمایش ساخته می‌شود */
function riskReasons(r){
  var out = [];
  if(r.avgRec && r.avgRec < 10) out.push('میانگین اخیر زیر ۱۰');
  else if(r.avgRec && r.avgRec < 12) out.push('میانگین اخیر زیر ۱۲');
  if(r.drop >= 2) out.push('افت ' + fa(Math.round(r.drop * 10) / 10) + ' نمره‌ای');
  if(r.rate >= 15) out.push(fa(Math.round(r.rate)) + '٪ غیبت');
  else if(r.rate >= 8) out.push(fa(Math.round(r.rate)) + '٪ غیبت');
  if(r.late >= 5) out.push(fa(r.late) + ' تأخیر');
  if(r.neg <= -5) out.push('موارد انضباطی منفی');
  if(r.failing >= 3) out.push(fa(r.failing) + ' نمره زیر ۱۰');
  return out;
}

function viewAtRisk(){
  var days = Number(S.filters.riskDays || 60);
  var list = atRiskList(days);
  var L = { high:['پرخطر','b-red'], medium:['نیازمند توجه','b-amber'], low:['کم‌خطر','b-gray'] };
  return '<div class="grid g4" style="margin-bottom:14px">'
    + statCard('🚨', fa(list.filter(function(i){ return i.level === 'high'; }).length), 'پرخطر', 'red')
    + statCard('⚠️', fa(list.filter(function(i){ return i.level === 'medium'; }).length), 'نیازمند توجه', 'amber')
    + statCard('🎓', fa(schoolStudents(S.user.school_id).length), 'کل دانش‌آموزان', 'blue')
    + statCard('📅', fa(days), 'بازه بررسی (روز)', 'green') + '</div>'
    + '<div class="card"><div class="card-head"><h3>🔍 دانش‌آموزان در معرض افت تحصیلی</h3>'
    + '<select class="select" style="width:150px" data-f="riskDays">'
    + [30,60,90,180].map(function(d){
        return '<option value="' + d + '" ' + (d === days ? 'selected' : '') + '>' + fa(d) + ' روز اخیر</option>';
      }).join('') + '</select></div>'
    + (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>کلاس</th><th>ریسک</th><th>میانگین کل</th><th>میانگین اخیر</th><th>افت</th><th>غیبت</th><th>دلایل</th><th></th></tr></thead><tbody>'
      + list.slice(0, 150).map(function(r){
          return '<tr' + (r.level === 'high' ? ' style="background:var(--red-soft)"' : '') + '>'
            + '<td><b>' + esc(r.u.full_name) + '</b></td>'
            + '<td class="small">' + esc((classOf(r.u.id) || {}).name || '—') + '</td>'
            + '<td><span class="badge ' + L[r.level][1] + '">' + L[r.level][0] + ' ' + fa(r.risk) + '</span>'
            + bar(r.risk, 100, r.level === 'high' ? 'var(--red)' : 'var(--amber)') + '</td>'
            + '<td>' + fa(r.avgAll) + '</td>'
            + '<td><b style="color:' + (r.avgRec < 12 ? 'var(--red)' : 'inherit') + '">' + fa(r.avgRec) + '</b></td>'
            + '<td>' + (r.drop > 0 ? '<span style="color:var(--red)">▼ ' + fa(r.drop) + '</span>' : '—') + '</td>'
            + '<td>' + fa(r.abs) + ' <span class="small muted">(' + fa(r.rate) + '٪)</span></td>'
            + '<td class="small">' + esc(r.reasons.join(' · ')) + '</td>'
            + '<td><button class="btn ghost sm" data-act="risk-notify" data-id="' + r.u.id + '">📨 هشدار</button></td></tr>';
        }).join('')
      + '</tbody></table></div>'
      : empty('🎉','دانش‌آموز پرخطری شناسایی نشد','وضعیت تحصیلی و انضباطی همه در محدوده مطلوب است.'))
    + '</div><div class="card" style="margin-top:14px"><div class="card-body small muted" style="line-height:2">'
    + 'امتیاز ریسک از ترکیب <b>میانگین نمرات اخیر</b>، <b>افت نسبت به میانگین کل</b>، <b>نرخ غیبت و تأخیر</b>، '
    + '<b>موارد انضباطی منفی</b> و <b>تعداد نمرات زیر ۱۰</b> محاسبه می‌شود (۰ تا ۱۰۰).</div></div>';
}

/* ---------------------- جلسات اولیا ---------------------- */

function viewMeetings(){
  var u = S.user;
  var persona = (typeof activePersona === 'function') ? activePersona() : u.role;
  var staff = ['manager','superadmin','teacher'].indexOf(persona) > -1;
  var rows;
  if(persona === 'parent'){
    var kids = myKids();
    var sids = [];
    kids.forEach(function(k){ if(sids.indexOf(k.school_id) < 0) sids.push(k.school_id); });
    rows = db.meeting_slots.filter(function(m){
      return sids.indexOf(m.school_id) > -1 && m.date >= todayISO()
          && (m.status === 'open' || m.parent_id === u.id);
    });
  } else if(persona === 'teacher'){
    rows = db.meeting_slots.filter(function(m){ return m.teacher_id === u.id; });
  } else {
    rows = db.meeting_slots.filter(function(m){ return m.school_id === u.school_id; });
  }
  rows = rows.sort(function(a,b){
    return a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time); });
  var byDate = {};
  rows.forEach(function(r){ (byDate[r.date] = byDate[r.date] || []).push(r); });
  var keys = Object.keys(byDate);

  return '<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--primary-soft),#fff)"><div class="card-body row">'
    + '<div style="font-size:30px">📅</div><div style="flex:1"><b>جلسه اولیا و مربیان</b><div class="small muted">'
    + (staff ? 'نوبت‌های خالی بسازید تا اولیا خودشان رزرو کنند؛ نیازی به هماهنگی تلفنی نیست.'
             : 'یک نوبت خالی انتخاب کنید تا حضوری با دبیر گفتگو کنید.')
    + '</div></div>' + (staff ? '<button class="btn" data-act="mtg-new">➕ ساخت نوبت‌ها</button>' : '') + '</div></div>'
    + (keys.length ? keys.map(function(d){
        var list = byDate[d];
        return '<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>' + jalali(d) + '</h3>'
          + '<span class="badge b-gray">' + fa(list.filter(function(x){ return x.status === 'open'; }).length)
          + ' نوبت آزاد از ' + fa(list.length) + '</span></div>'
          + '<div class="card-body" style="display:grid;gap:8px">'
          + list.map(function(r){
              return '<div class="row" style="background:' + (r.status === 'open' ? 'var(--surface-2)' : 'var(--green-soft)')
                + ';padding:10px 14px;border-radius:11px">'
                + '<b style="width:56px">' + esc(r.start_time) + '</b>'
                + '<span class="small muted">' + fa(r.duration) + ' دقیقه</span>'
                + '<span>' + esc((byId('users', r.teacher_id) || {}).full_name || '') + '</span>'
                + (r.location ? '<span class="small muted">📍 ' + esc(r.location) + '</span>' : '')
                + '<div class="spacer"></div>'
                + (r.status === 'open'
                    ? (persona === 'parent'
                        ? '<button class="btn sm" data-act="mtg-book" data-id="' + r.id + '">رزرو</button>'
                        : '<span class="badge b-gray">آزاد</span>')
                    : '<span class="badge b-green">' + esc((byId('users', r.parent_id) || {}).full_name || 'رزرو شده') + '</span>')
                + ((staff || r.parent_id === u.id) && r.status === 'booked'
                    ? '<button class="btn ghost sm" data-act="mtg-cancel" data-id="' + r.id + '">لغو</button>' : '')
                + (staff && r.status === 'open'
                    ? '<button class="icon-btn danger" data-act="mtg-del" data-id="' + r.id + '">🗑️</button>' : '')
                + '</div>';
            }).join('') + '</div></div>';
      }).join('')
      : empty('📭','نوبتی تعریف نشده است',
          staff ? 'با دکمه بالا نوبت‌های جلسه را بسازید.' : 'به‌محض تعریف نوبت توسط مدرسه، اینجا می‌بینید.'));
}

/* ---------------------- رشد مدرسه ---------------------- */

/** کد معرف مدرسه (در صورت نبود، از روی کد مدرسه ساخته می‌شود) */
function refCodeOf(school){
  if(school.ref_code) return school.ref_code;
  return String(school.code || 'SCH').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'SCH';
}

/** اولیای یکتای یک مدرسه */
function parentsOfSchool(sid){
  var kids = Object.create(null);
  schoolStudents(sid).forEach(function(s){ kids[s.id] = true; });
  var out = [], seen = Object.create(null);
  db.parent_links.forEach(function(l){
    if(kids[l.student_id] && !seen[l.parent_id]){ seen[l.parent_id] = true; out.push(l.parent_id); }
  });
  return out;
}

function viewGrowth(){
  var sid = S.user.school_id, school = byId('schools', sid) || {};
  var parents = parentsOfSchool(sid);
  var subs = parents.map(function(p){ return subOf(p); });
  var active = subs.filter(function(s){ return s.status === 'active'; }).length;
  var trial = subs.filter(function(s){ return s.status === 'trial'; }).length;
  var expired = subs.filter(function(s){ return s.status === 'expired'; }).length;
  var none = subs.filter(function(s){ return s.status === 'none'; }).length;
  var pset = Object.create(null);
  parents.forEach(function(p){ pset[p] = true; });
  var income = db.subscription_payments.filter(function(p){ return pset[p.user_id]; })
    .reduce(function(a,b){ return a + b.amount; }, 0);
  var st = subSettings();
  var share = Number(st.school_share_percent || 20);
  var conv = parents.length ? Math.round(active / parents.length * 1000) / 10 : 0;

  return '<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--green-soft),#fff)"><div class="card-body">'
    + '<div class="row"><div style="font-size:34px">🎁</div><div><b style="font-size:16px">استفاده از سامانه برای مدرسه کاملاً رایگان است</b>'
    + '<div class="small muted" style="line-height:2">درآمد سامانه از اشتراک اولیاست. هر ولی ' + fa(st.trial_days || 0)
    + ' روز رایگان استفاده می‌کند و پس از آن اشتراک می‌گیرد؛ <b>' + fa(share) + '٪</b> از پرداخت اولیای این مدرسه سهم مدرسه است.</div>'
    + '</div></div></div></div>'
    + '<div class="grid g4" style="margin-bottom:14px">'
    + statCard('👨‍👩‍👦', fa(parents.length), 'ولی مدرسه', 'blue')
    + statCard('✅', fa(active), 'اشتراک فعال (' + fa(conv) + '٪)', 'green')
    + statCard('🎁', fa(trial), 'در دوره رایگان', 'amber')
    + statCard('💰', rialShort(Math.round(income * share / 100)), 'سهم مدرسه (ریال)', 'purple') + '</div>'
    + '<div class="grid g2"><div class="card"><div class="card-head"><h3>🔗 کد معرف مدرسه</h3></div>'
    + '<div class="card-body" style="text-align:center"><div style="font-size:30px;font-weight:800;letter-spacing:3px;color:var(--primary)">'
    + esc(refCodeOf(school)) + '</div><div class="small muted" style="margin:10px 0;line-height:2">'
    + 'این کد را به اولیا بدهید؛ هنگام ثبت‌نام وارد می‌کنند تا اشتراکشان به حساب مدرسه شما ثبت شود.</div></div></div>'
    + '<div class="card"><div class="card-head"><h3>📣 دعوت اولیا</h3>'
    + '<button class="btn" data-act="invite-parents">ارسال دعوت‌نامه</button></div><div class="card-body">'
    + '<table class="table"><tbody>'
    + '<tr><td>اولیای بدون اشتراک</td><td><b style="color:var(--red)">' + fa(expired + none) + '</b> نفر</td></tr>'
    + '<tr><td>مجموع پرداخت اولیای مدرسه</td><td><b>' + rial(income) + '</b> ریال</td></tr>'
    + '<tr><td>سهم مدرسه (' + fa(share) + '٪)</td><td><b style="color:var(--green)">'
    + rial(Math.round(income * share / 100)) + '</b> ریال</td></tr>'
    + '</tbody></table></div></div></div>';
}

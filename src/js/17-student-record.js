/**
 * تعیین اینکه پروندهٔ کدام دانش‌آموز باید نمایش داده شود.
 * دانش‌آموز فقط خودش را می‌بیند؛ کارکنان و ولی می‌توانند با S.child
 * دانش‌آموز دیگری را انتخاب کنند، اما فقط در محدودهٔ مجاز خودشان.
 */
function recordTargetId(){
  var me = S.user;
  if(!me) return null;
  var persona = (typeof activePersona === 'function') ? activePersona() : me.role;
  if(persona === 'student') return me.id;
  var want = Number(S.child);
  if(!want) return me.id;
  var target = byId('users', want);
  if(!target || target.role !== 'student') return me.id;
  if(persona === 'parent'){
    /* ولی فقط فرزندان متصل به خودش */
    var mine = db.parent_links.some(function(l){
      return l.parent_id === me.id && l.student_id === want; });
    return mine ? want : me.id;
  }
  if(persona === 'superadmin') return want;
  /* مدیر و دبیر: فقط دانش‌آموز مدرسهٔ خودشان */
  return target.school_id === me.school_id ? want : me.id;
}

/* ═══════════════════════════════════════════════════════════════════
   کارنامه و پروندهٔ دانش‌آموز
   نمای دانش‌آموز از خودش و نمای ولی از فرزندان.
   ═══════════════════════════════════════════════════════════════════ */
function viewRecord(sid){
  const gr=db.grades.filter(g=>g.student_id===sid);
  const att=db.attendance.filter(a=>a.student_id===sid).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const disc=db.discipline.filter(d=>d.student_id===sid).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const bySub={};gr.forEach(g=>{(bySub[g.subject_id]=bySub[g.subject_id]||[]).push(g);});
  const tabs=[['grades','📝 کارنامه'],['attendance','✅ حضور و غیاب'],
              ['discipline','⚖️ پرونده انضباطی'],['profile','🪪 شناسنامه']];
  let body='';
  if(S.tab==='profile') body = studentProfileCard(sid)
    + ((typeof yearHistoryCard==='function')?yearHistoryCard(sid):'')
    + ((typeof teacherNotesCard==='function')?teacherNotesCard(sid):'');
  if(S.tab==='grades') body = Object.keys(bySub).length?`${gradeTrendCard(sid)}<div class="card-body" style="display:grid;gap:14px">${Object.entries(bySub).map(([id,l])=>{const a=avgOf(l);
    return `<div style="border:1px solid var(--border);border-radius:12px;padding:14px"><div class="row"><b>${esc((byId('subjects',Number(id))||{}).name||'—')}</b><div class="spacer"></div>
     <span class="badge ${a>=17?'b-green':a>=12?'b-blue':'b-red'}">میانگین ${fa(a.toFixed(2))}</span></div>
     <div style="margin:8px 0 12px">${bar(a,20,a>=17?'var(--green)':a>=12?'var(--primary)':'var(--red)')}</div>
     <div class="row">${l.map(g=>`<span class="badge b-gray">${esc(g.term)} • ${esc(g.exam_type)}: <b>${fa(g.score)}</b></span>`).join('')}</div></div>`;}).join('')}</div>`
    :empty('📝','نمره‌ای ثبت نشده','به محض ثبت نمره، کارنامه اینجا نمایش داده می‌شود.');
  if(S.tab==='attendance'){const cnt=k=>att.filter(a=>a.status===k).length;
    body= att.length?`<div class="card-body row">${['present','absent','late','excused'].map(k=>`<span class="badge ${ATT_BADGE[k]}">${ATT_FA[k]}: ${fa(cnt(k))} روز</span>`).join('')}</div>
     <div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>وضعیت</th><th>توضیح</th><th>تغییرات</th></tr></thead><tbody>
     ${att.slice(0,60).map(r=>`<tr><td>${jalali(r.date)}</td><td><span class="badge ${ATT_BADGE[r.status]}">${ATT_FA[r.status]}</span></td><td class="muted">${esc(r.note||'—')}</td>
      <td>${(typeof attHistory==='function'&&attHistory(r.id).length>1)?`<button class="btn ghost sm" data-act="att-hist" data-id="${escAttr(r.id)}">📜 سابقه</button>`:'<span class="small muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`
     :empty('✅','سابقه حضور و غیاب خالی است','');}
  if(S.tab==='discipline') body= disc.length?`<div class="card-body row">
     <span class="badge b-green">مجموع مثبت: ${fa(disc.filter(d=>d.points>0).reduce((a,b)=>a+b.points,0))}</span>
     <span class="badge b-red">مجموع منفی: ${fa(disc.filter(d=>d.points<0).reduce((a,b)=>a+b.points,0))}</span></div>
    <div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>نوع</th><th>عنوان</th><th>توضیحات</th><th>امتیاز</th></tr></thead><tbody>
    ${disc.map(d=>`<tr><td>${jalali(d.date)}</td><td><span class="badge ${d.kind==='positive'?'b-green':'b-red'}">${d.kind==='positive'?'👍 مثبت':'👎 منفی'}</span></td><td>${esc(d.title)}</td>
     <td class="muted small" style="white-space:normal;max-width:260px">${esc(d.description||'—')}</td><td><b style="color:${d.points>=0?'var(--green)':'var(--red)'}">${fa(d.points)}</b></td></tr>`).join('')}</tbody></table></div>`
    :empty('🌟','پرونده انضباطی پاک است','هیچ مورد انضباطی ثبت نشده است.');
  return `<div class="card"><div class="card-head" style="padding-bottom:0;border-bottom:none"><div class="tabs">
    ${tabs.map(t=>`<div class="tab ${S.tab===t[0]?'active':''}" data-act="tab" data-t="${escAttr(t[0])}">${t[1]}</div>`).join('')}</div></div>${body}</div>`;
}

function viewChildren(){
  const kids=db.parent_links.filter(p=>p.parent_id===S.user.id).map(p=>byId('users',p.student_id)).filter(Boolean);
  if(!kids.length)return `<div class="card">${empty('👨‍👩‍👦','دانش‌آموزی متصل نیست','با مدیر مدرسه تماس بگیرید.')}</div>`;
  const active=S.child||kids[0].id;
  return `<div class="card"><div class="card-body row">
   ${kids.map(k=>`<button class="btn ${active===k.id?'':'ghost'}" data-act="child" data-id="${escAttr(k.id)}">🎒 ${esc(k.full_name)} <span class="small">(${esc((classOf(k.id)||{}).name||'—')})</span></button>`).join('')}
   </div></div>${summaryBlock(active)}${viewRecord(active)}`;
}

/* ═══════════════════════════════════════════════════════════════════
   کارت شناسنامهٔ دانش‌آموز
   نمایش اطلاعاتی که از فایل اکسل مدرسه وارد می‌شود: هویت، والدین،
   خانواده، وضعیت حمایتی و نشانی. اگر فیلدی خالی باشد نمایش داده
   نمی‌شود تا کارت شلوغ نشود.
   ═══════════════════════════════════════════════════════════════════ */

/** یک ردیف اطلاعات؛ در نبود مقدار، رشتهٔ خالی برمی‌گرداند */
function infoRow(label, value){
  if(value === undefined || value === null || value === '') return '';
  return '<tr><td class="small muted" style="width:42%">' + esc(label) + '</td>'
       + '<td><b>' + esc(String(value)) + '</b></td></tr>';
}

/** یک بخش از کارت؛ اگر همهٔ ردیف‌هایش خالی باشند، بخش حذف می‌شود */
function infoBlock(title, rows){
  var body = rows.filter(Boolean).join('');
  if(!body) return '';
  return '<div class="card" style="box-shadow:none;border:1px solid var(--border)">'
       + '<div class="card-head"><h3 style="font-size:14px">' + esc(title) + '</h3></div>'
       + '<div class="card-body" style="padding-top:0">'
       + '<table class="table"><tbody>' + body + '</tbody></table></div></div>';
}

function studentProfileCard(sid){
  var u = byId('users', sid);
  if(!u) return empty('🪪','اطلاعاتی یافت نشد','');
  var cls = classOf(sid);
  var num = function(v){ return (v === undefined || v === null || v === '') ? '' : fa(v); };

  var blocks = [
    infoBlock('هویت', [
      infoRow('نام و نام خانوادگی', u.full_name),
      infoRow('کد ملی', u.national_id),
      infoRow('تاریخ تولد', u.birth_date ? jalali(u.birth_date) : ''),
      infoRow('جنسیت', u.gender),
      infoRow('سری شناسنامه', u.shenasname_seri),
      infoRow('سریال شناسنامه', u.shenasname_serial)
    ]),
    infoBlock('تحصیلی', [
      infoRow('کلاس', cls ? cls.name : ''),
      infoRow('رشته', u.field || (cls || {}).field),
      infoRow('پایه', num(u.grade_level)),
      infoRow('معدل سال گذشته', num(u.last_gpa)),
      infoRow('تعداد درس افتاده', num(u.failed_count)),
      infoRow('استعدادیابی', u.talent)
    ]),
    infoBlock('پدر', [
      infoRow('نام', u.father_name),
      infoRow('کد ملی', u.father_nid),
      infoRow('تحصیلات', u.father_edu),
      infoRow('شغل', u.father_job),
      infoRow('وضعیت حیات', u.father_alive),
      infoRow('موبایل', u.father_phone)
    ]),
    infoBlock('مادر', [
      infoRow('نام', u.mother_name),
      infoRow('کد ملی', u.mother_nid),
      infoRow('تحصیلات', u.mother_edu),
      infoRow('شغل', u.mother_job),
      infoRow('وضعیت حیات', u.mother_alive),
      infoRow('موبایل', u.mother_phone)
    ]),
    infoBlock('خانواده', [
      infoRow('سرپرست', u.guardian),
      infoRow('تعداد خواهر', num(u.sisters)),
      infoRow('تعداد برادر', num(u.brothers))
    ]),
    infoBlock('وضعیت حمایتی', [
      infoRow('تحت پوشش', u.covered === 1 ? 'بلی' : u.covered === 0 ? 'خیر' : ''),
      infoRow('نوع ارگان', u.org_type),
      infoRow('درصد حمایت', u.org_percent != null ? fa(u.org_percent) + '٪' : '')
    ]),
    infoBlock('تماس و نشانی', [
      infoRow('موبایل دانش‌آموز', u.phone),
      infoRow('تلفن ثابت', u.landline),
      infoRow('محل سکونت', u.residence),
      infoRow('روستا', u.village),
      infoRow('وضعیت اقامت', u.residence_status),
      infoRow('آدرس', u.address)
    ])
  ].filter(Boolean);

  if(!blocks.length)
    return '<div class="card-body">' + empty('🪪','اطلاعات تکمیلی ثبت نشده',
      'با ویزارد «ورود اطلاعات» می‌توانید پروندهٔ کامل را از فایل اکسل مدرسه وارد کنید.')
      + '</div>';

  return '<div class="card-body"><div class="grid g2" style="gap:12px">'
       + blocks.join('') + '</div></div>';
}

/* ═══════════════════════════════════════════════════════════════════
   نمودار روند نمرات در طول سال (دور ۴۳)
   ═══════════════════════════════════════════════════════════════════
   ولی و دانش‌آموز باید ببینند نمره‌ها **رو به بهبود** است یا افت.
   عدد نهایی به‌تنهایی این را نمی‌گوید: میانگین ۱۴ می‌تواند از
   ۱۸→۱۰ آمده باشد یا از ۱۰→۱۸ — دو وضعیت کاملاً متفاوت.

   ⚠️ دام داده‌ای: ترتیب باید بر پایهٔ `created_at` باشد نه ترتیب
   درج در آرایه. نمره‌ها ممکن است با تأخیر یا خارج از ترتیب ثبت
   شوند (مثلاً دبیر نمرهٔ آبان را در آذر وارد کند).

   ⚠️ نمره‌ها همیشه از ۲۰ نیستند؛ برای مقایسه به مقیاس ۲۰ نرمال
   می‌شوند وگرنه ۸ از ۱۰ کنار ۸ از ۲۰ گمراه‌کننده است.
   ═══════════════════════════════════════════════════════════════════ */

/** نمرات یک دانش‌آموز به‌ترتیب زمانی واقعی، نرمال‌شده به ۲۰ */
function gradeTrendData(sid, subjectId){
  var rows = (db.grades || []).filter(function(g){
    if(g.student_id !== sid) return false;
    if(subjectId && g.subject_id !== subjectId) return false;
    return !isNaN(Number(g.score));
  });
  /* ⚠️ ترتیب زمانی از created_at، نه ترتیب آرایه */
  rows.sort(function(a, b){
    var ta = String(a.created_at || ''), tb = String(b.created_at || '');
    if(ta !== tb) return ta.localeCompare(tb);
    return (a.id || 0) - (b.id || 0);       /* گره‌گشایی قطعی */
  });
  return rows.map(function(g){
    var max = Number(g.max_score) || 20;
    return {
      at:    g.created_at || null,
      score: Number(g.score),
      max:   max,
      norm:  Math.max(0, Math.min(20, (Number(g.score) / max) * 20)),
      term:  g.term || '',
      type:  g.exam_type || '',
      subject: (byId('subjects', g.subject_id) || {}).name || '—'
    };
  });
}

/** جهت روند: مقایسهٔ میانگین نیمهٔ اول با نیمهٔ دوم */
function gradeTrendDirection(pts){
  if(pts.length < 4) return null;            /* داده کم است، حکم ندهیم */
  var half = Math.floor(pts.length / 2);
  var avg = function(a){ return a.reduce(function(s, p){ return s + p.norm; }, 0) / a.length; };
  var first = avg(pts.slice(0, half));
  var last  = avg(pts.slice(pts.length - half));
  var diff  = last - first;
  if(Math.abs(diff) < 0.75) return { dir: 'flat', diff: diff };
  return { dir: diff > 0 ? 'up' : 'down', diff: diff };
}

/**
 * کارت نمودار روند.
 * @param {number} sid شناسهٔ دانش‌آموز
 */
function gradeTrendCard(sid){
  var subs = {};
  (db.grades || []).forEach(function(g){
    if(g.student_id === sid && g.subject_id) subs[g.subject_id] = 1;
  });
  var pick = Number(S.trendSub) || 0;
  var pts  = gradeTrendData(sid, pick || null);
  if(pts.length < 2){
    return '<div class="card"><div class="card-head"><h3>📈 روند نمرات</h3></div>'
      + empty('📈', 'برای نمایش روند دست‌کم دو نمره لازم است',
              'با ثبت نمرات بیشتر، نمودار پیشرفت اینجا دیده می‌شود.')
      + '</div>';
  }

  var chips = ['<button class="chip' + (pick ? '' : ' on')
    + '" data-act="trend-sub" data-id="0">همهٔ درس‌ها</button>'];
  Object.keys(subs).forEach(function(id){
    var nm = (byId('subjects', Number(id)) || {}).name || '—';
    chips.push('<button class="chip' + (pick === Number(id) ? ' on' : '')
      + '" data-act="trend-sub" data-id="' + escAttr(id) + '">' + esc(nm) + '</button>');
  });

  var dirInfo = gradeTrendDirection(pts);
  var badge = '';
  if(dirInfo){
    var m = { up:   ['b-green', '📈 رو به بهبود'],
              down: ['b-red',   '📉 رو به افت'],
              flat: ['b-blue',  '➖ تقریباً ثابت'] }[dirInfo.dir];
    badge = '<span class="badge ' + m[0] + '">' + m[1]
      + (dirInfo.dir === 'flat' ? '' : ' (' + fa(Math.abs(dirInfo.diff).toFixed(1)) + ' نمره)')
      + '</span>';
  }

  var avgAll = pts.reduce(function(s, p){ return s + p.norm; }, 0) / pts.length;
  var cols = pts.map(function(p){
    var h = (p.norm / 20) * 100;
    var color = p.norm >= 17 ? 'var(--green)' : (p.norm >= 12 ? 'var(--primary)' : 'var(--red)');
    var when = p.at ? jalali(String(p.at).slice(0, 10)) : '—';
    var tip = p.subject + ' • ' + p.type + ' • ' + fa(p.score) + ' از ' + fa(p.max) + ' • ' + when;
    return '<div class="col" title="' + escAttr(tip) + '">'
      + '<i style="height:' + h + '%;background:' + color + '"></i>'
      + '<span>' + esc(faD(String(p.score))) + '</span></div>';
  }).join('');

  return '<div class="card"><div class="card-head"><h3>📈 روند نمرات در طول سال</h3>'
    + badge + '</div>'
    + (chips.length > 2 ? '<div class="chips">' + chips.join('') + '</div>' : '')
    + '<div class="card-body">'
    + '<div class="chart trend-chart">' + cols + '</div>'
    + '<div class="row small muted" style="margin-top:10px;line-height:2">'
    +   '<span>میانگین: <b>' + fa(avgAll.toFixed(2)) + '</b> از ۲۰</span>'
    +   '<span>تعداد نمره: <b>' + fa(pts.length) + '</b></span>'
    +   '<span>ترتیب بر پایهٔ تاریخ ثبت</span>'
    + '</div></div></div>';
}

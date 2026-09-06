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

/** برنامهٔ هفتگی کلاسِ دانش‌آموز — فقط‌خواندنی.
    بند ۴: برنامهٔ کلاس دادهٔ پایه است و برای ولی همیشه رایگان است. */
function classScheduleCard(sid){
  var cls=classOf(sid);
  if(!cls) return '<div class="card-body">'+empty('🗓️','دانش‌آموزی کلاس ندارد','')+'</div>';
  var rows=db.schedule.filter(function(s){return s.class_id===cls.id;});
  if(!rows.length)
    return '<div class="card-body">'+empty('🗓️','برنامه‌ای ثبت نشده','برنامهٔ هفتگی این کلاس هنوز تنظیم نشده است.')+'</div>';
  var cell=function(d,p){return rows.find(function(r){return r.day===d&&r.period===p;});};
  var grid='<div class="table-wrap"><div class="timetable"><div></div>'
    +DAYS.map(function(d){return '<div class="tt-head"><b>'+d+'</b></div>';}).join('')
    +[1,2,3,4,5,6].map(function(p){
        return '<div class="tt-head" style="display:grid;place-items:center"><span class="badge b-blue">زنگ '+fa(p)+'</span></div>'
          +DAYS.map(function(_,d){
              var c=cell(d,p);
              if(c)return '<div class="tt-cell"><b>'+esc((byId('subjects',c.subject_id)||{}).name||'—')+'</b>'
                +'<span>'+esc(c.teacher_id?((byId('users',c.teacher_id)||{}).full_name||'—'):'بدون دبیر')+'</span></div>';
              return '<div class="tt-cell tt-empty"><span class="muted small">—</span></div>';
            }).join('');
      }).join('')
    +'</div></div>';
  return '<div class="card-body small muted" style="margin-bottom:10px">برنامهٔ هفتگی کلاس <b>'+esc(cls.name)+'</b></div>'+grid;
}

function viewRecord(sid){
  const gr=db.grades.filter(g=>g.student_id===sid);
  const att=db.attendance.filter(a=>a.student_id===sid).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const disc=db.discipline.filter(d=>d.student_id===sid).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const bySub={};gr.forEach(g=>{(bySub[g.subject_id]=bySub[g.subject_id]||[]).push(g);});
  const persona=(typeof activePersona==='function')?activePersona():S.user.role;
  const tabs=[['grades','📝 کارنامه'],['attendance','✅ حضور و غیاب'],
              ['schedule','📅 برنامه کلاس'],['discipline','⚖️ پرونده انضباطی'],['profile','🪪 شناسنامه']];
  if(persona==='student'||persona==='parent')tabs.push(['vclass','🖥️ کلاس مجازی']);
  if(persona==='student'||persona==='parent')tabs.push(['bus','🚌 سرویس']);
  /* بند ۵.۲ — مسیرِ دوازدهم↔مشاور (همهٔ نقش‌ها می‌بینند؛ ارسال فقط
     دانش‌آموز/ولی/مشاور — گاردِ داده در counselorMsgSend) */
  if((typeof isTwelfthGrader==='function')&&isTwelfthGrader(sid))tabs.push(['counsel','🕊️ مشاور']);
  let body='';
  if(S.tab==='profile') body = studentProfileCard(sid)
    + ((typeof pathwayGuideCard==='function')?pathwayGuideCard(sid):'')
    + ((typeof certsCard==='function')?certsCard(sid):'')
    + ((typeof yearHistoryCard==='function')?yearHistoryCard(sid):'')
    + ((typeof teacherNotesCard==='function')?teacherNotesCard(sid):'')
    + ((typeof iepCard==='function')?iepCard(sid):'')
    + ((typeof scholarshipBadge==='function')?scholarshipBadge(sid):'');
  /* نوار گواهی نمرات (بند ۱.۶): فقط وقتی نمره‌ای هست، بالای تب کارنامه */
  const certBar=(function(){
    if(S.tab!=='grades')return '';
    const certTerms=[];gr.forEach(g=>{if(certTerms.indexOf(g.term)<0)certTerms.push(g.term);});
    if(!certTerms.length)return '';
    return '<div class="card-body row" style="gap:10px;align-items:center;border:1px dashed var(--border);border-radius:12px;padding:10px 14px;flex-wrap:wrap">'
      + '<span>🖨️</span><span class="small"><b>گواهی نمرات</b> (چاپ — PDF بعداً)</span>'
      + '<select class="select" style="width:150px" id="cert_term">'
      + certTerms.map(t=>'<option value="'+escAttr(t)+'">'+esc(t)+'</option>').join('')
      + '<option value="">همهٔ نوبت‌ها</option></select>'
      + '<select class="select" style="width:150px" id="cert_tpl"><option value="classic" selected>قالبِ کلاسیک</option><option value="compact">قالبِ فشرده (دوستونه)</option></select>'
      + '<button class="btn sm" data-act="cert-print" data-sid="'+escAttr(sid)+'">چاپ گواهی</button>'
      + '<button class="btn ghost sm" data-act="report-print" data-sid="'+escAttr(sid)+'" title="قالبِ حرفه‌ایِ A4 — چاپ یا ذخیرهٔ PDF">🖨️ چاپ کارنامه</button>'
      + '</div>';
  })();
  if(S.tab==='grades'){const _cid=(typeof classOf==='function')?classOf(sid):null;S.__clsCtx=(typeof classScoreContext==='function'&&_cid)?classScoreContext(_cid.id):{};}
  if(S.tab==='grades') body = Object.keys(bySub).length?certBar+`${gradeTrendCard(sid)}<div class="card-body" style="display:grid;gap:14px">${Object.entries(bySub).map(([id,l])=>{const a=avgOf(l);
    return `<div style="border:1px solid var(--border);border-radius:12px;padding:14px"><div class="row"><b>${esc((byId('subjects',Number(id))||{}).name||'—')}</b><div class="spacer"></div>
     <span class="badge ${a>=17?'b-green':a>=12?'b-blue':'b-red'}">میانگین ${fa(a.toFixed(2))}</span></div>
     <div style="margin:8px 0 12px">${bar(a,20,a>=17?'var(--green)':a>=12?'var(--primary)':'var(--red)')}</div>
     <div class="row">${l.map(g=>{const c=(typeof classScoreContext!=='undefined'&&S.__clsCtx)?S.__clsCtx[Number(id)+'|'+g.term+'|'+g.exam_type]:null;
     return `<span class="badge b-gray">${esc(g.term)} • ${esc(g.exam_type)}${g.kind==='practical'?' • عملی':''}: <b>${fa(g.score)}</b>${c?' <span class="muted" style="font-weight:400">· کلاس: '+fa(c.avg.toFixed(2))+'</span>':''}</span>`;}).join('')}</div></div>`;}).join('')}</div>`
    :empty('📝','نمره‌ای ثبت نشده','به محض ثبت نمره، کارنامه اینجا نمایش داده می‌شود.');
  /* بند ۴.۲: کارتِ کارآموزی زیرِ کارنامه (فقط سالِ آخرِ رشته‌های فنی) */
  if(S.tab==='grades') body += (typeof internshipCard==='function')?internshipCard(sid):'';
  if(S.tab==='grades') body += (typeof reexamCard==='function')?reexamCard(sid):'';
  if(S.tab==='schedule') body = classScheduleCard(sid);
  if(S.tab==='counsel') body = ((typeof isTwelfthGrader==='function')&&isTwelfthGrader(sid)&&(typeof counselorChannelCard==='function'))?counselorChannelCard(sid):'';
  if(S.tab==='vclass') body = (typeof vclassRecordTab==='function')?vclassRecordTab(sid):'';
  if(S.tab==='bus') body = persona==='parent'
    ? ((typeof busParentTab==='function')?busParentTab(sid):'')
    : ((typeof busStudentTab==='function')?busStudentTab(sid):'');
  if(S.tab==='attendance'){
    /* Round 77: an EXCUSED record is REMOVED from the file (even if
       the manager approved the SMS) - trace stays in the data. */
    const attFile=att.filter(x=>!x.excused);
    const cnt=k=>attFile.filter(a=>a.status===k).length;
    body= attFile.length?`<div class="card-body row">${['present','absent','late','excused','early_exit'].map(k=>`<span class="badge ${ATT_BADGE[k]}">${ATT_FA[k]}: ${fa(cnt(k))} روز</span>`).join('')}</div>
     <div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>وضعیت</th><th>توضیح</th><th>تغییرات</th></tr></thead><tbody>
     ${attFile.slice(0,60).map(r=>{
       /* دور ۷۵: توضیح = یادداشت دبیر؛ اگر نبود، جزئیاتِ زمانِ خودکار:
          تأخیر (ساعت + دقیقه) / خروج از کلاس (بازهٔ خروج تا بازگشت + دقیقه) */
       /* Round 77: description is EVENT-based (works for the legacy
          statuses too) and EXCUSED events are not written in the file. */
       const _desc=(rr)=>{ if(rr.note)return rr.note;
         const _tf=(typeof timeFa==='function')?timeFa:null;
         const _parts=[];
         if(!rr.late_excused&&(rr.late_at||rr.status==='late'))
           _parts.push('تأخیر: ساعت '+(rr.late_at?(_tf?_tf(rr.late_at):rr.late_at):'—')+((rr.late_minutes!=null)?' — '+fa(rr.late_minutes)+' دقیقه':''));
         if(!rr.exit_excused&&(rr.exit_at||rr.status==='early_exit'))
           _parts.push('خروج از کلاس: ساعت '+(rr.exit_at?(_tf?_tf(rr.exit_at):rr.exit_at):'—')+((rr.exit_return_at)?' تا '+(_tf?_tf(rr.exit_return_at):rr.exit_return_at):'')+((rr.exit_minutes!=null)?' — '+fa(rr.exit_minutes)+' دقیقه':''));
         return _parts.length?_parts.join(' · '):'—'; };
       return `<tr><td>${jalali(r.date)}</td><td><span class="badge ${ATT_BADGE[r.status]}">${ATT_FA[r.status]}</span></td><td class="muted">${esc(_desc(r))}</td>
      <td>${(typeof attHistory==='function'&&attHistory(r.id).length>1)?`<button class="btn ghost sm" data-act="att-hist" data-id="${escAttr(r.id)}">📜 سابقه</button>`:'<span class="small muted">—</span>'}</td></tr>`;}).join('')}</tbody></table></div>`
     :empty('✅','سابقه حضور و غیاب خالی است','');}
  if(S.tab==='discipline') body= disc.length?`<div class="card-body row">
     <span class="badge b-green">مجموع مثبت: ${fa(disc.filter(d=>d.points>0).reduce((a,b)=>a+b.points,0))}</span>
     <span class="badge b-red">مجموع منفی: ${fa(disc.filter(d=>d.points<0).reduce((a,b)=>a+b.points,0))}</span>${typeof dojoBadge==='function'?dojoBadge(sid):''}</div>
    <div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>نوع</th><th>عنوان</th><th>توضیحات</th><th>امتیاز</th></tr></thead><tbody>
    ${disc.map(d=>`<tr><td>${jalali(d.date)}</td><td><span class="badge ${d.kind==='positive'?'b-green':'b-red'}">${d.kind==='positive'?'👍 مثبت':'👎 منفی'}</span></td><td>${esc(d.title)}</td>
     <td class="muted small" style="white-space:normal;max-width:260px">${esc(d.description||'—')}</td><td><b style="color:${d.points>=0?'var(--green)':'var(--red)'}">${fa(d.points)}</b></td></tr>`).join('')}</tbody></table></div>`
    :empty('🌟','پرونده انضباطی پاک است','هیچ مورد انضباطی ثبت نشده است.');
  /* دور ۷۶ — ترک تحصیل: نوارِ وضعیت (اگر dropped_out) + دکمهٔ ثبت (مدیر) */
  const _du=byId('users',sid);
  const _dropStrip=(typeof dropStatusStrip==='function')?dropStatusStrip(sid):'';
  const _persona2=(typeof activePersona==='function')?activePersona():S.user.role;
  const _dropBtn=(_du&&(_du.status||'active')==='active'&&(_persona2==='manager'||_persona2==='superadmin'))
    ? `<div style="padding:0 14px 10px;display:flex;justify-content:flex-end"><button class="btn danger ghost sm" data-act="drop-register" data-id="${escAttr(sid)}">🚪 ثبت ترک تحصیل (بدون حذفِ داده)</button></div>` : '';
  return `<div class="card">${_dropStrip}<div class="card-head" style="padding-bottom:0;border-bottom:none"><div class="tabs">
    ${tabs.map(t=>`<div class="tab ${S.tab===t[0]?'active':''}" data-act="tab" data-t="${escAttr(t[0])}">${t[1]}</div>`).join('')}</div></div>${_dropBtn}${body}</div>`;
}

/** بند ۴.۲ — کارتِ ساعتِ کارآموزی: فقط برای دانش‌آموزِ سالِ آخرِ
    رشته‌های فنی‌وحرفه‌ای/کاردانش در مدرسهٔ دارای رشته. */
function internshipCard(sid){
  var u=byId('users',sid);
  if(!u)return '';
  var school=byId('schools',u.school_id);
  if(!(school&&workshopSchool(school.id)))return '';
  if(!isFinalYearStudent(sid))return '';
  var rows=internshipSessions(sid);
  var tot=internshipTotals(sid);
  var persona=(typeof activePersona==='function')?activePersona():(S.user&&S.user.role);
  var canManage=persona==='manager'||persona==='superadmin';
  var canApprove=canManage||persona==='teacher';
  var h='<div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-top:14px">'
   +'<div class="row" style="align-items:center;gap:10px;flex-wrap:wrap"><b>🏭 ساعتِ کارآموزی</b>'
   +'<span class="badge b-green">مجموع: '+fa(tot.total)+' ساعت</span>'
   +'<span class="badge b-blue">تأییدشده: '+fa(tot.approved)+' ساعت</span>'
   +'<div class="spacer"></div>'
   +(canManage?'<button class="btn sm" data-act="internship-new" data-id="'+escAttr(sid)+'">➕ ثبتِ ساعت</button>':'')
   +'</div>';
  if(rows.length){
    h+='<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>تاریخ</th><th>ساعت</th><th>محل</th><th>وضعیت</th><th>تأییدکننده</th><th></th></tr></thead><tbody>';
    rows.forEach(function(r){
      var appr=r.approved_by?(((byId('users',r.approved_by)||{}).full_name)||'—'):'—';
      var acts='';
      if(r.status!=='approved'&&canApprove)acts+='<button class="btn ghost sm" data-act="internship-approve" data-id="'+escAttr(r.id)+'">✅ تأیید</button> ';
      if(canManage)acts+='<button class="icon-btn danger" data-act="internship-del" data-id="'+escAttr(r.id)+'" title="حذف">🗑️</button>';
      h+='<tr><td>'+jalali(r.date)+'</td><td><b>'+fa(r.hours)+'</b></td><td class="muted">'+esc(r.location||'—')+'</td>'
       +'<td><span class="badge '+(r.status==='approved'?'b-green':'b-amber')+'">'+(r.status==='approved'?'تأییدشده':'در انتظار تأیید')+'</span></td>'
       +'<td class="muted small">'+esc(appr)+'</td><td>'+acts+'</td></tr>';
    });
    h+='</tbody></table></div>';
  } else {
    h+='<div class="muted small" style="padding:10px 0">هنوز ساعتی ثبت نشده است.</div>';
  }
  return h+'</div>';
}

/** بند ۲.۲ — برنامهٔ آموزشی فردی (IEP): پروندهٔ انعطاف‌پذیر، نه فرمِ سفت.
    فقط در مدرسه‌ای با توانِ has_iep نمایش داده می‌شود. فیلدها آزادن:
    یادداشتِ نیازِ ویژه + کارکنانِ کمکیِ مرتبط. */
function iepCard(sid){
  var u=byId('users',sid);
  if(!u)return '';
  var school=byId('schools',u.school_id);
  var iepOn=!(!school||!(typeof hasCap==='function')||!hasCap(school.id,'has_iep'));
  if(!iepOn)return '';
  var persona=(typeof activePersona==='function')?activePersona():(S.user&&S.user.role);
  var canEdit=persona==='manager'||persona==='superadmin'||persona==='teacher';
  var notes=u.iep_notes||'', staff=u.iep_staff||'';
  var h='<div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-top:14px">'
   +'<div class="row" style="align-items:center;gap:10px;flex-wrap:wrap"><b>🌱 برنامهٔ آموزشی فردی (IEP)</b>'
   +(u.iep_updated?'<span class="badge b-gray small">به‌روزرسانی: '+jalali(u.iep_updated)+'</span>':'')
   +'<div class="spacer"></div>'
   +(canEdit?'<button class="btn sm" data-act="iep-edit" data-id="'+escAttr(sid)+'">'+(notes||staff?'✏️ ویرایش':'➕ ثبت')+'</button>':'')
   +'</div>';
  if(notes||staff){
    h+='<table class="table" style="margin-top:8px"><tbody>'
     +(notes?'<tr><td class="small muted" style="width:42%">یادداشتِ نیازِ ویژه</td><td style="white-space:normal;line-height:2">'+esc(notes)+'</td></tr>':'')
     +(staff?'<tr><td class="small muted">کارکنانِ کمکیِ مرتبط</td><td style="white-space:normal;line-height:2">'+esc(staff)+'</td></tr>':'')
     +'</tbody></table>';
  } else {
    h+='<div class="muted small" style="padding:8px 0">هنوز چیزی ثبت نشده است — این بخش برای نیازهای ویژهٔ یادگیری (به‌صورتِ آزاد، نه فرمِ سفت) است.</div>';
  }
  return h+'</div>';
}

/** کارت گواهی‌های رسمی (بند ۶) — تب شناسنامهٔ پرونده */
function certsCard(sid){
  return '<div style="border:1px dashed var(--border);border-radius:12px;padding:12px 14px;display:grid;gap:10px">'
    + '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">'
    + '<span>📜</span><span class="small"><b>گواهی‌های رسمی</b> (چاپ + کد احراز)</span>'
    + '<button class="btn sm" data-act="cert-enroll-print" data-sid="'+escAttr(sid)+'">گواهی اشتغال به تحصیل</button>'
    + '<button class="btn sm" data-act="cert-transfer-print" data-sid="'+escAttr(sid)+'">گواهی انتقالی</button>'
    + '</div>'
    + '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">'
    + '<label class="small">کد احراز:</label>'
    + '<input class="input" id="cert_code" placeholder="GHT-XXXXXX" style="width:170px;direction:ltr;text-align:left" />'
    + '<button class="btn ghost sm" data-act="cert-verify" data-sid="'+escAttr(sid)+'">راستی‌آزمایی</button>'
    + '</div></div>';
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
      subjectId: g.subject_id,
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
  /* بند ۴.۹ (دور ۷۹): پوشِ میانگینِ کلاس روی نمودارِ روند.
     منبع: classScoreContext (ناشناس؛ فقط عدد؛ حداقل ۲ دانش‌آموزِ عضو).
     ارتفاعِ تیک با همان فرمولِ ستون (norm/20) است — داخلِ .plot تا
     صفرِ هر دو یکی باشد. */
  var tcls = (typeof classOf === 'function') ? classOf(sid) : null;
  var tctx = (tcls && typeof classScoreContext === 'function') ? classScoreContext(tcls.id) : {};
  var hasTick = false;
  var cols = pts.map(function(p){
    var h = (p.norm / 20) * 100;
    var color = p.norm >= 17 ? 'var(--green)' : (p.norm >= 12 ? 'var(--primary)' : 'var(--red)');
    var when = p.at ? jalali(String(p.at).slice(0, 10)) : '—';
    var tip = p.subject + ' • ' + p.type + ' • ' + fa(p.score) + ' از ' + fa(p.max) + ' • ' + when;
    var cAvg = (tctx[p.subjectId + '|' + p.term + '|' + p.type] || {}).avgNorm;
    var tick = '';
    if (typeof cAvg === 'number' && isFinite(cAvg)) {
      hasTick = true;
      tip += ' • میانگین کلاس: ' + fa(cAvg.toFixed(2));
      tick = '<b class="avg-tick" style="bottom:' + ((cAvg / 20) * 100).toFixed(1) + '%"></b>';
    }
    return '<div class="col" title="' + escAttr(tip) + '">'
      + '<div class="plot">' + tick
      + '<i style="height:' + h + '%;background:' + color + '"></i></div>'
      + '<span>' + esc(faD(String(p.score))) + '</span></div>';
  }).join('');
  var tickLegend = hasTick
    ? '<span><b style="color:var(--amber)">- -</b> میانگین کلاس (حداقل ۲ هم‌کلاسیِ دارایِ همان نمره)</span>'
    : '';

  return '<div class="card"><div class="card-head"><h3>📈 روند نمرات در طول سال</h3>'
    + badge + '</div>'
    + (chips.length > 2 ? '<div class="chips">' + chips.join('') + '</div>' : '')
    + '<div class="card-body">'
    + '<div class="chart trend-chart">' + cols + '</div>'
    + '<div class="row small muted" style="margin-top:10px;line-height:2">'
    +   '<span>میانگین: <b>' + fa(avgAll.toFixed(2)) + '</b> از ۲۰</span>'
    +   tickLegend
    +   '<span>تعداد نمره: <b>' + fa(pts.length) + '</b></span>'
    +   '<span>ترتیب بر پایهٔ تاریخ ثبت</span>'
    + '</div></div></div>';
}

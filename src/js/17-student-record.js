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
  if(S.tab==='profile') body = studentProfileCard(sid);
  if(S.tab==='grades') body = Object.keys(bySub).length?`<div class="card-body" style="display:grid;gap:14px">${Object.entries(bySub).map(([id,l])=>{const a=avgOf(l);
    return `<div style="border:1px solid var(--border);border-radius:12px;padding:14px"><div class="row"><b>${esc(byId('subjects',Number(id)).name)}</b><div class="spacer"></div>
     <span class="badge ${a>=17?'b-green':a>=12?'b-blue':'b-red'}">میانگین ${fa(a.toFixed(2))}</span></div>
     <div style="margin:8px 0 12px">${bar(a,20,a>=17?'var(--green)':a>=12?'var(--primary)':'var(--red)')}</div>
     <div class="row">${l.map(g=>`<span class="badge b-gray">${esc(g.term)} • ${esc(g.exam_type)}: <b>${fa(g.score)}</b></span>`).join('')}</div></div>`;}).join('')}</div>`
    :empty('📝','نمره‌ای ثبت نشده','به محض ثبت نمره، کارنامه اینجا نمایش داده می‌شود.');
  if(S.tab==='attendance'){const cnt=k=>att.filter(a=>a.status===k).length;
    body= att.length?`<div class="card-body row">${['present','absent','late','excused'].map(k=>`<span class="badge ${ATT_BADGE[k]}">${ATT_FA[k]}: ${fa(cnt(k))} روز</span>`).join('')}</div>
     <div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>وضعیت</th><th>توضیح</th></tr></thead><tbody>
     ${att.slice(0,60).map(r=>`<tr><td>${jalali(r.date)}</td><td><span class="badge ${ATT_BADGE[r.status]}">${ATT_FA[r.status]}</span></td><td class="muted">${esc(r.note||'—')}</td></tr>`).join('')}</tbody></table></div>`
     :empty('✅','سابقه حضور و غیاب خالی است','');}
  if(S.tab==='discipline') body= disc.length?`<div class="card-body row">
     <span class="badge b-green">مجموع مثبت: ${fa(disc.filter(d=>d.points>0).reduce((a,b)=>a+b.points,0))}</span>
     <span class="badge b-red">مجموع منفی: ${fa(disc.filter(d=>d.points<0).reduce((a,b)=>a+b.points,0))}</span></div>
    <div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>نوع</th><th>عنوان</th><th>توضیحات</th><th>امتیاز</th></tr></thead><tbody>
    ${disc.map(d=>`<tr><td>${jalali(d.date)}</td><td><span class="badge ${d.kind==='positive'?'b-green':'b-red'}">${d.kind==='positive'?'👍 مثبت':'👎 منفی'}</span></td><td>${esc(d.title)}</td>
     <td class="muted small" style="white-space:normal;max-width:260px">${esc(d.description||'—')}</td><td><b style="color:${d.points>=0?'var(--green)':'var(--red)'}">${fa(d.points)}</b></td></tr>`).join('')}</tbody></table></div>`
    :empty('🌟','پرونده انضباطی پاک است','هیچ مورد انضباطی ثبت نشده است.');
  return `<div class="card"><div class="card-head" style="padding-bottom:0;border-bottom:none"><div class="tabs">
    ${tabs.map(t=>`<div class="tab ${S.tab===t[0]?'active':''}" data-act="tab" data-t="${t[0]}">${t[1]}</div>`).join('')}</div></div>${body}</div>`;
}

function viewChildren(){
  const kids=db.parent_links.filter(p=>p.parent_id===S.user.id).map(p=>byId('users',p.student_id)).filter(Boolean);
  if(!kids.length)return `<div class="card">${empty('👨‍👩‍👦','دانش‌آموزی متصل نیست','با مدیر مدرسه تماس بگیرید.')}</div>`;
  const active=S.child||kids[0].id;
  return `<div class="card"><div class="card-body row">
   ${kids.map(k=>`<button class="btn ${active===k.id?'':'ghost'}" data-act="child" data-id="${k.id}">🎒 ${esc(k.full_name)} <span class="small">(${esc((classOf(k.id)||{}).name||'—')})</span></button>`).join('')}
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

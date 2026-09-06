/* ═══════════════════════════════════════════════════════════════════
   مودال و فرم
   openModal, modalTpl, askConfirm و سازنده‌های فیلد: f, inp, sel, opt, V.
   ═══════════════════════════════════════════════════════════════════ */
function openModal(html){$('#modal').innerHTML=`<div class="modal-back" data-act="modal-back"><div class="modal">${html}</div></div>`;}
function closeModal(){$('#modal').innerHTML='';}
function modalTpl(title,body,saveAct,danger,okLabel){
  return `<div class="card-head"><h3>${esc(title)}</h3><button class="icon-btn" data-act="modal-close">✕</button></div>
   <div class="card-body">${body}</div>
   <div class="card-head" style="border-bottom:none;border-top:1px solid var(--border);justify-content:flex-end">
    <button class="btn ghost" data-act="modal-close">انصراف</button>
    <button class="btn ${danger?'danger':''}" data-act="${escAttr(saveAct)}">${okLabel||(danger?'حذف کن':'ذخیره')}</button></div>`;
}
const f=(label,inner)=>`<div class="field"><label>${label}</label>${inner}</div>`;
const inp=(id,val,type='text')=>`<input class="input" id="${escAttr(id)}" type="${escAttr(type)}" value="${esc(val??'')}" />`;
const sel=(id,opts,val)=>`<select class="select" id="${escAttr(id)}">${opts.map(o=>`<option value="${esc(o[0])}" ${String(val)===String(o[0])?'selected':''}>${esc(o[1])}</option>`).join('')}</select>`;
const V=id=>{const e=$('#'+id);return e?e.value.trim():'';};

/** گزینه‌های کشویی محدوده (استان › شهرستان › منطقه) */
function geoOptions(pid,cid){
  const provinces=[['','— انتخاب استان —'],...db.provinces.map(p=>[p.id,p.name])];
  const counties=[['','— انتخاب شهرستان —'],...db.counties.filter(c=>!pid||c.province_id===Number(pid)).map(c=>[c.id,c.name])];
  const districts=[['','— انتخاب منطقه/ناحیه —'],...db.districts.filter(d=>!cid||d.county_id===Number(cid)).map(d=>[d.id,d.name+(d.kind==='village'?' (روستایی)':'')])];
  return {provinces,counties,districts};
}
function officeForDistrict(pid,cid,did){
  return db.offices.find(o=>o.district_id&&o.district_id===Number(did))
      || db.offices.find(o=>o.county_id&&o.county_id===Number(cid)&&!o.district_id)
      || db.offices.find(o=>o.province_id&&o.province_id===Number(pid)&&!o.county_id)||null;
}
/* ---------- انتخابگر شاخه و رشتهٔ مدرسهٔ متوسطه دوم ----------
   یک مدرسه می‌تواند هم‌زمان چند شاخه داشته باشد (مثلاً هنرستانی که
   هم فنی و حرفه‌ای دارد هم کاردانش). پس چندانتخابی است، نه تک‌انتخابی.
   رشته‌های هر شاخه فقط وقتی نمایش داده می‌شوند که آن شاخه تیک خورده باشد. */
function branchPicker(s){
  const on = Array.isArray(s.branches) ? s.branches : [];
  const fields = Array.isArray(s.fields) ? s.fields : [];
  let h = '<div class="sec-title">🎓 شاخه‌ها و رشته‌های متوسطه دوم</div>'
        + '<div class="small muted" style="margin:-4px 0 10px">'
        + 'شاخه‌هایی که این مدرسه ارائه می‌دهد را انتخاب کنید. یک مدرسه می‌تواند چند شاخه داشته باشد.</div>';
  Object.keys(BRANCHES).forEach(function(b){
    const checked = on.indexOf(b) >= 0;
    h += '<div class="branch-card' + (checked ? ' on' : '') + '" data-branch="' + esc(b) + '">'
       +   '<label class="branch-head">'
       +     '<input type="checkbox" class="m-branch" value="' + esc(b) + '"' + (checked ? ' checked' : '') + '>'
       +     '<b>' + esc(b) + '</b>'
       +     '<span class="small muted">' + fieldsOfBranch(b).length + ' رشته</span>'
       +   '</label>'
       +   '<div class="branch-fields" style="display:' + (checked ? 'flex' : 'none') + '">';
    fieldsOfBranch(b).forEach(function(x){
      const fc = fields.indexOf(x) >= 0;
      h += '<label class="field-chip' + (fc ? ' on' : '') + '">'
         +   '<input type="checkbox" class="m-field" data-branch="' + esc(b) + '" value="' + esc(x) + '"' + (fc ? ' checked' : '') + '>'
         +   esc(x) + '</label>';
    });
    h += '</div></div>';
  });
  return h;
}

function schoolModal(s){
  s=s||{name:'',code:'',city:'',phone:'',landline:'',level:'متوسطه اول',gender:'پسرانه',capacity:300,active:1,address:'',
        province_id:'',county_id:'',district_id:''};
  const mgr=s.id?db.users.find(u=>u.school_id===s.id&&u.role==='manager'):null;
  const g=geoOptions(s.province_id,s.county_id);
  const off=officeForDistrict(s.province_id,s.county_id,s.district_id);
  openModal(modalTpl(s.id?'ویرایش مدرسه':'تعریف مدرسه جدید',
   `<div class="grid g2">${f('نام مدرسه *',inp('m_name',s.name))}${f('کد مدرسه *',inp('m_code',s.code))}</div>
    <div class="sec-title">📍 مکان و اداره مربوطه</div>
    <div class="grid g3">
      ${f('استان *',sel('m_prov',g.provinces,s.province_id||''))}
      ${f('شهرستان *',sel('m_county',g.counties,s.county_id||''))}
      ${f('منطقه / ناحیه',sel('m_district',g.districts,s.district_id||''))}</div>
    <div class="small muted" id="m_office" style="margin:-4px 0 10px">اداره مربوطه: <b>${esc(off?off.name:'—')}</b></div>
    <div class="grid g2">
      ${f('مقطع',sel('m_level',[['ابتدایی','ابتدایی'],['متوسطه اول','متوسطه اول'],['متوسطه دوم','متوسطه دوم']],s.level))}
      ${f('نوع',sel('m_type',SCHOOL_TYPES.map(x=>[x,x]),s.type||'عادی'))}
      ${f('جنسیت',sel('m_gender',[['پسرانه','پسرانه'],['دخترانه','دخترانه']],s.gender))}
      ${f('تلفن ثابت مدرسه',inp('m_landline',s.landline||''))}
      ${f('تلفن همراه رابط',inp('m_phone',s.phone||''))}
      ${f('ظرفیت',inp('m_cap',s.capacity,'number'))}
      ${f('وضعیت',sel('m_active',[[1,'فعال'],[0,'غیرفعال']],s.active?1:0))}
      ${f('شیفت',sel('m_shift',[['صبح','صبح'],['بعدازظهر','بعدازظهر'],['هر دو','هر دو شیفت']],s.shift||'صبح'))}</div>
    <div class="small muted" style="margin:-4px 0 10px">
      شیفت بر ساعت شروع زنگ‌ها اثر می‌گذارد. زمان‌بندی دقیق زنگ‌ها را
      مدیر مدرسه در صفحهٔ «زمان‌بندی زنگ‌ها» تعیین می‌کند.</div>
    <div class="sec-title">🗓️ روزهای کاری</div>
    <div class="row" style="gap:12px;flex-wrap:wrap;padding:4px 0">
      ${(typeof DAYS_FULL!=='undefined'?DAYS_FULL:['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه']).map((d,i)=>`<label class="row" style="gap:5px;cursor:pointer"><input type="checkbox" class="m-wd" value="${i}" ${((s.work_days&&s.work_days.length?s.work_days:(typeof DEFAULT_WORK_DAYS!=='undefined'?DEFAULT_WORK_DAYS:[0,1,2,3])).indexOf(i)>-1)?'checked':''}/> ${d}</label>`).join('')}
    </div>
    <div class="small muted" style="margin:-2px 0 10px">در روزِ غیرکاری، برنامهٔ زنگ و پیش‌گزینشِ خودکار کلاس فعال نیست. روزهای جبرانی را در «زمان‌بندی زنگ‌ها» ثبت کنید.</div>
    <div class="sec-title">🕓 پنجرهٔ موجهِ حضور و غیاب</div>
    ${f('دقیقهٔ بعد از پایان زنگ',`<input class="input" id="m_excuse_window" type="number" min="0" max="240" value="${s.excuse_window_minutes!=null?s.excuse_window_minutes:15}"/>`)}
    <div class="small muted" style="margin:-2px 0 10px">دبیر فقط تا این تعداد دقیقه بعد از پایانِ زنگِ رویداد می‌تواند تأخیر/خروج را موجه کند (دور ۷۷). پیش‌فرض: ۱۵ دقیقه.</div>
    <div class="sec-title">🏫 پروفایل قابلیت این مدرسه</div>
    <div class="small muted" style="margin-bottom:8px">هر کلید مستقل روشن/خاموش می‌شود؛ ماژول‌های غیرمرتبط از منوی این مدرسه پنهان می‌شوند.</div>
    ${typeof capPickerHTML==='function'?capPickerHTML(s):''}
    <div id="m_branch_box" style="display:${s.level==='متوسطه دوم'?'block':'none'}">${branchPicker(s)}</div>
    ${f('آدرس',`<textarea class="input" id="m_addr" rows="2">${esc(s.address||'')}</textarea>`)}
    <div class="sec-title">👤 مشخصات مدیر مدرسه ${mgr?'':'<span class="small muted">(حساب کاربری او ساخته می‌شود)</span>'}</div>
    <div class="grid g2">
      ${f('نام و نام خانوادگی'+(s.id?'':' *'),inp('mg_name',mgr?mgr.full_name:''))}
      ${f('کد ملی',inp('mg_nid',mgr?mgr.national_id:''))}
      ${f('تلفن همراه',inp('mg_phone',mgr?mgr.phone:''))}
      ${f('نام کاربری'+(s.id?'':' *'),inp('mg_user',mgr?mgr.username:''))}</div>`,
   'school-save'));
  window._edit=s;
}
function userModal(x){
  const isSuper=S.user.role==='superadmin';
  x=x||{full_name:'',username:'',role:'student',national_id:'',phone:'',active:1,school_id:isSuper?db.schools[0].id:S.user.school_id};
  const clsList=db.classes.filter(c=>c.school_id===(x.school_id||S.user.school_id));
  const cur=x.id?(classOf(x.id)||{}).id:'';
  openModal(modalTpl(x.id?'ویرایش کاربر':'افزودن کاربر',
   `<div class="grid g2">${f('نام و نام خانوادگی *',inp('u_name',x.full_name))}
    ${f('نام کاربری *',`<input class="input" id="u_user" value="${esc(x.username)}" ${x.id?'disabled':''} />`)}
    ${f('نقش',sel('u_role',[['manager','مدیر مدرسه'],['teacher','دبیر'],['student','دانش‌آموز'],['parent','ولی'],['counselor','مشاور'],['driver','راننده سرویس']],x.role))}
    ${isSuper?f('مدرسه',sel('u_school',db.schools.map(s=>[s.id,s.name]),x.school_id)):''}
    ${f('کد ملی',inp('u_nid',x.national_id))}${f('تلفن همراه',inp('u_phone',x.phone))}
    ${f('کلاس (برای دانش‌آموز)',sel('u_class',[['','— بدون کلاس —']].concat(clsList.map(c=>[c.id,c.name])),cur))}
    ${f('وضعیت',sel('u_active',[[1,'فعال'],[0,'غیرفعال']],x.active?1:0))}</div>`,'user-save'));
  window._edit=x;
}
/**
 * فرم تعریف و ویرایش کلاس.
 *
 * گزینهٔ «نوع چیدمان» افزوده شد تا مدیر سردرگم نشود:
 *  • کلاس‌محور (ابتدایی و متوسطه اول): ترکیب دانش‌آموزان تا پایان سال
 *    ثابت است و رشته معنا ندارد.
 *  • رشته‌محور (متوسطه دوم): دانش‌آموز تا پایان دوازدهم در همان رشته
 *    می‌ماند و انتخاب رشته الزامی است.
 * انتخاب پایه، نوع را خودکار پیشنهاد می‌دهد ولی مدیر می‌تواند عوض کند.
 */
function classModal(c){
  const isSuper=S.user.role==='superadmin';
  c=c||{name:'',grade:'',field:'',room:'',capacity:30,school_id:isSuper?db.schools[0].id:S.user.school_id};
  const teachers=db.users.filter(u=>u.role==='teacher'&&u.school_id===c.school_id);
  /* نوع ذخیره‌شده، وگرنه حدس از روی پایه */
  const gl = c.grade_level || (typeof gradeFromName==='function' ? gradeFromName(c.grade||c.name) : null);
  const mode = c.class_mode || (gl && Number(gl)>=10 ? 'field' : gl ? 'class' : '');
  /* رشته‌ها فقط از شاخه‌هایی که همین مدرسه اعلام کرده است.
     در دبیرستان نظری نباید بتوان کلاس «مکانیک خودرو» ساخت. */
  var fieldOpts = [];
  try{
    fieldOpts = (typeof schoolFields === 'function') ? schoolFields(c.school_id) : [];
  }catch(e){ fieldOpts = []; }
  /* اگر کلاس رشته‌ای دارد که دیگر جزو شاخه‌های مدرسه نیست (مثلاً شاخه
     بعداً حذف شده)، آن را نگه می‌داریم تا ویرایش کلاس داده را نپراند. */
  if(c.field && fieldOpts.indexOf(c.field) < 0) fieldOpts.unshift(c.field);
  openModal(modalTpl(c.id?'ویرایش کلاس':'کلاس جدید',
   `<div class="card" style="box-shadow:none;border:1px solid var(--border);margin-bottom:12px">
      <div class="card-body" style="padding:12px">
        ${f('نوع چیدمان کلاس',sel('c_mode',[
            ['','— خودکار بر پایهٔ پایه —'],
            ['class','کلاس‌محور (ابتدایی و متوسطه اول)'],
            ['field','رشته‌محور (متوسطه دوم)']
          ],mode))}
        <div class="small muted" style="line-height:2;margin-top:6px" id="c_mode_hint">
          در مدارس <b>کلاس‌محور</b> ترکیب دانش‌آموزان تا پایان سال ثابت است و رشته لازم نیست.<br>
          در مدارس <b>رشته‌محور</b> دانش‌آموز تا پایان دوازدهم در همان رشته می‌ماند و انتخاب رشته الزامی است.
        </div>
      </div></div>
    <div class="grid g2">${f('نام کلاس *',inp('c_name',c.name))}${f('پایه',inp('c_grade',c.grade))}
    <div id="c_fieldwrap_cls" style="${mode==='class'?'display:none':''}">${
      fieldOpts.length
        ? f('رشته',sel('c_field',[['','— بدون رشته —']].concat(fieldOpts.map(x=>[x,x])),c.field||''))
        : f('رشته',inp('c_field',c.field))}</div>
    ${f('اتاق',inp('c_room',c.room))}${f('ظرفیت',inp('c_cap',c.capacity,'number'))}
    ${f('سرپرست کلاس',sel('c_ht',[['','— انتخاب دبیر —']].concat(teachers.map(t=>[t.id,t.full_name])),c.homeroom_teacher_id||''))}
        ${(typeof hasCap==='function'&&hasCap(c.school_id,'has_multigrade'))?`
    <label style="display:flex;gap:8px;align-items:center;cursor:pointer" title="کلاسی که دانش‌آموزانِ چند پایه را یک‌جا دارد (مدرسه‌های کوچک/روستایی)">
      <input type="checkbox" id="c_multigrade" ${c.multigrade?'checked':''}/>
      <span class="small"><b>کلاسِ چندپایه</b> <span class="muted">— عضویتِ هر درس جدا انتخاب می‌شود</span></span>
    </label>`:''}
${isSuper?f('مدرسه',sel('c_school',db.schools.map(s=>[s.id,s.name]),c.school_id)):''}</div>`,'class-save'));
  window._edit=c;
}
/** بند ۲.۱ — ویرایشِ عضویتِ دروسِ کلاسِ چندپایه
   دروس از برنامهٔ هفتگیِ کلاس می‌آیند؛ برای هر درس انتخاب می‌کنیم
   کدام دانش‌آموزانِ کلاس آن درس را می‌خوانند. «همه انتخاب‌شده»
   = بدون ردیف (fallback تنبلِ classSubjectMembers) = رفتارِ امروز. */
function classMembershipModal(cid){
  const cls=byId('classes',Number(cid));
  if(!cls){toast('کلاس پیدا نشد','err');return;}
  var subs=Object.create(null);
  db.schedule.forEach(function(s){ if(s.class_id===cls.id&&s.subject_id) subs[s.subject_id]=1; });
  const subIds=Object.keys(subs).map(Number);
  const kids=studentsOfClass(cls.id);
  if(!subIds.length){toast('در برنامهٔ هفتگیِ این کلاس درسی نیست','err');return;}
  if(!kids.length){toast('این کلاس دانش‌آموزی ندارد','err');return;}
  const rows=(db.class_subject_members||[]).filter(function(x){return x.class_id===cls.id;});
  var html='<div class="small muted" style="line-height:2;margin-bottom:10px">برای هر درس انتخاب کنید <b>کدام دانش‌آموزان</b> آن درس را می‌خوانند. اگر برای درسی <b>همهٔ</b> کلاس انتخاب باشد، همان رفتارِ امروز دارد (بدون ردیف).</div>';
  html+='<div style="max-height:55vh;overflow:auto;display:grid;gap:12px">';
  subIds.forEach(function(subId){
    const sub=byId('subjects',subId)||{};
    const have=rows.filter(function(x){return x.subject_id===subId;}).map(function(x){return x.student_id;});
    const custom=have.length>0;
    html+='<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px">'
      +'<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><b>'+esc(sub.name||'—')+'</b>'
      +(custom?'<span class="badge b-amber">عضویتِ سفارشی</span>':'<span class="badge b-gray">همهٔ کلاس</span>')+'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px">';
    kids.forEach(function(k){
      const on=custom?have.indexOf(k.id)>-1:true;
      html+='<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" class="mem-cb" data-sub="'+subId+'" data-stu="'+k.id+'" '+(on?'checked':'')+' /><span class="small">'+esc(k.full_name)+'</span></label>';
    });
    html+='</div></div>';
  });
  html+='</div>';
  openModal(modalTpl('عضویتِ دروس — کلاسِ چندپایه', html, 'class-membership-save'));
  window._memCid=cls.id;
}
function subjectModal(s){
  const isSuper=S.user.role==='superadmin';
  s=s||{name:'',code:'',weekly_hours:2,grade:'',field:'',school_id:isSuper?db.schools[0].id:S.user.school_id};
  const lv=levelOfGrade(s.grade)||'';
  const br=branchOfField(s.field)||'';
  const allGrades=LEVELS.flatMap(l=>GRADES_OF_LEVEL[l].map(g=>[g,`${g} (${l})`]));
  openModal(modalTpl(s.id?'ویرایش درس / کتاب':'درس / کتاب جدید',
   `<div class="grid g2">
      ${f('نام کتاب / درس *',inp('s_name',s.name))}
      ${f('کد',inp('s_code',s.code))}
      ${f('ساعت هفتگی',inp('s_h',s.weekly_hours,'number'))}
      ${f('پایه',sel('s_grade',[['','— عمومی / بدون پایه —'],...allGrades],s.grade||''))}
    </div>
    <div id="s_fieldwrap" style="${needsField(lv)?'':'display:none'}">
      <div class="grid g2">
        ${f('شاخه',sel('s_branch',[['','— انتخاب شاخه —'],...schoolBranches(s.school_id).map(b=>[b,b])],br))}
        ${f('رشته',sel('s_field',[['','— انتخاب رشته —'],...fieldsOfBranch(br).map(x=>[x,x])],s.field||''))}
      </div>
      <div class="small muted" style="margin-top:-4px">در متوسطه دوم (پایه‌های دهم تا دوازدهم) کتاب‌ها بر اساس شاخه و رشته تفکیک می‌شوند.</div>
    </div>
    ${isSuper?`<div class="grid g2">${f('مدرسه',sel('s_school',db.schools.map(x=>[x.id,x.name]),s.school_id))}</div>`:''}`,
   'subject-save'));
  window._edit=s;
}
function gradeModal(g){
  const cls=visibleClasses(), subs=visibleSubjects();
  /* طرح زنگ (گام ثبت نمره، فرم): برای فرمِ تازه (نه ویرایش)، کلاس و
     درس از زنگ جاریِ دبیر پیش‌گزینش می‌شوند — همان الگویی که نماي
     فهرست و حضور و غیاب اجرا می‌کنند. انتخاب دستی همیشه مقدم است. */
  const _now=(S.bellNow||null);
  const _auto=(typeof bellAutoClass==='function')?bellAutoClass(null,null,_now):null;
  const _autoOk=!g&&_auto&&cls.some(c=>c.id===_auto.classId)&&subs.some(s=>s.id===_auto.subjectId);
  const cid=Number(S.filters.class||(_autoOk&&_auto.classId)||(cls[0]||{}).id);
  const studs=studentsOfClass(cid);
  if(!studs.length){toast('این کلاس دانش‌آموزی ندارد','err');return;}
  g=g||{student_id:studs[0].id,subject_id:(_autoOk?_auto.subjectId:subs[0].id),term:TERMS[0],exam_type:EXAM_TYPES[0],score:20,kind:'theory'};
  /* بند ۴.۲: در مدارسِ فنی‌وحرفه‌ای/کاردانش، نوعِ نمره (تئوری/عملی) انتخاب می‌شود */
  const _gsc=byId('schools',(byId('classes',cid)||{}).school_id);
  const _gkindOpts=(typeof workshopSchool==='function'&&workshopSchool(_gsc&&_gsc.id))?
    `${f('نوع نمره',sel('g_kind',[['theory','تئوری'],['practical','عملی/کارگاهی']],g.kind||'theory'))}`:'';
  openModal(modalTpl(g.id?'ویرایش نمره':'ثبت نمره جدید',
   `<div class="grid g2">
    ${f('دانش‌آموز',`<select class="select" id="g_st" ${g.id?'disabled':''}>${studs.map(s=>`<option value="${escAttr(s.id)}" ${s.id===g.student_id?'selected':''}>${esc(s.full_name)}</option>`).join('')}</select>`)}
    ${f('درس',`<select class="select" id="g_sub" ${g.id?'disabled':''}>${subs.map(s=>`<option value="${escAttr(s.id)}" ${s.id===g.subject_id?'selected':''}>${esc(s.name)}</option>`).join('')}</select>`)}
    ${f('نوبت',sel('g_term',TERMS.map(t=>[t,t]),g.term))}${f('نوع آزمون',sel('g_type',EXAM_TYPES.map(t=>[t,t]),g.exam_type))}
    ${_gkindOpts}
    ${f('نمره (از ۲۰)',`<input class="input" id="g_score" type="number" step="0.25" min="0" max="20" value="${escAttr(g.score)}" />`)}</div>`,'grade-save'));
  window._edit=g;window._gclass=cid;
}

/* بند ۴.۲ — مودالِ ثبت/ویرایشِ ساعتِ کارآموزی.
   fixedSid: اگر داده شود (از کارتِ پروندهٔ دانش‌آموز)، دانش‌آموز فیکس است. */
function internshipModal(i,fixedSid){
  const cls=visibleClasses();
  const cid=Number(S.filters.class||(cls[0]||{}).id);
  let studs=studentsOfClass(cid);
  if(fixedSid)studs=studs.filter(s=>s.id===Number(fixedSid));
  studs=studs.filter(s=>workshopStudent(s.id)&&isFinalYearStudent(s.id));
  if(!studs.length){toast('دانش‌آموزِ سالِ آخرِ رشتهٔ فنی/کاردانشی در این کلاس نیست','err');return;}
  i=i||{student_id:studs[0].id,date:todayISO(),hours:8,location:'',status:'pending',note:''};
  openModal(modalTpl(i.id?'ویرایشِ ساعتِ کارآموزی':'ثبتِ ساعتِ کارآموزی',
   `<div class="grid g2">
    ${f('دانش‌آموز',`<select class="select" id="in_st" ${i.id?'disabled':''}>${studs.map(s=>`<option value="${escAttr(s.id)}" ${s.id===i.student_id?'selected':''}>${esc(s.full_name)}</option>`).join('')}</select>`)}
    ${f('تاریخ',jdate('in_date',i.date))}
    ${f('تعدادِ ساعت',`<input class="input" id="in_hours" type="number" min="1" max="40" value="${escAttr(i.hours)}" />`)}
    ${f('محلِ کارآموزی',inp('in_loc',i.location))}</div>
    ${f('یادداشت',`<textarea class="input" id="in_note" rows="2">${esc(i.note||'')}</textarea>`)}`,'internship-save'));
  window._inEdit=i;window._inClass=cid;
}

/* بند ۲.۲ — مودالِ ویرایشِ برنامهٔ آموزشی فردی (IEP): فیلدهای آزاد */
function iepModal(sid){
  var u=byId('users',sid);
  if(!u)return;
  openModal(modalTpl('برنامهٔ آموزشی فردی (IEP) — '+u.full_name,
   `${f('یادداشتِ نیازِ ویژه',`<textarea class="input" id="iep_notes" rows="4" placeholder="مثلاً: نیاز به زمانِ بیشتر، توضیحِ صوتی، هدفِ امسال…">${esc(u.iep_notes||'')}</textarea>`)}
    ${f('کارکنانِ کمکیِ مرتبط',`<textarea class="input" id="iep_staff" rows="2" placeholder="مثلاً: مشاورِ مدرسه (هفتگی)، معاونِ آموزشی…">${esc(u.iep_staff||'')}</textarea>`)}
    ${u.iep_updated?`<div class="small muted">آخرین به‌روزرسانی: ${jalali(u.iep_updated)}</div>`:''}`,'iep-save'));
  window._iepSid=Number(sid);
}

/* بند ۴.۴ — مودالِ پیش‌ثبت‌نامِ تازه */
function preappModal(){
  openModal(modalTpl('پیش‌ثبت‌نامِ تازه',
   `<div class="grid g2">
    ${f('نام داوطلب *',inp('pa_name',''))}
    ${f('تلفن *',`<input class="input" id="pa_phone" type="tel" value="" style="direction:ltr;text-align:left" />`)}
    </div>
    ${f('یادداشت',`<textarea class="input" id="pa_note" rows="2"></textarea>`)}`,'preapp-save'));
}

/* بند ۲.۴ — مودالِ کمک‌هزینه: دانش‌آموزِ نیازمند + یادداشت */
function scholarshipModal(){
  var studs=db.users.filter(function(u){return u.role==='student'&&u.school_id===S.user.school_id&&u.active;})
    .sort(function(a,b){return a.full_name.localeCompare(b.full_name,'fa');});
  var opts=studs.map(function(u){return '<option value="'+u.id+'">'+esc(u.full_name)+'</option>';}).join('');
  openModal(modalTpl('ثبتِ دانش‌آموزِ نیازمند',
   `
   ${f('دانش‌آموز *',`<select class="input" id="sc_student">${opts}</select>`)}
   ${f('یادداشت (کوتاه)',`<textarea class="input" id="sc_note" rows="2" placeholder="مثلاً: بررسیِ وضعیتِ اقتصادی توسطِ انجمن"></textarea>`)}
   <div class="small muted">وضعیت از «درخواست‌شده» شروع می‌شود و بعداً از همان صفحه جابه‌جا می‌شود. این ماژول فقط ثبت است — به پرداخت وصل نیست.</div>
   `,'scholar-save'));
}

/* بند ۶.۱ — مودال‌های امتحاناتِ تجدیدی */
function reexamModal(){
  var studs=db.users.filter(function(u){return u.role==='student'&&u.school_id===S.user.school_id&&u.active;})
    .sort(function(a,b){return a.full_name.localeCompare(b.full_name,'fa');});
  var sopts=studs.map(function(u){return '<option value="'+u.id+'">'+esc(u.full_name)+'</option>';}).join('');
  var subopts=db.subjects.map(function(x){return '<option value="'+x.id+'">'+esc(x.name)+'</option>';}).join('');
  openModal(modalTpl('ثبتِ درسِ تجدیدی',
   `<div class="grid g2">
    ${f('دانش‌آموز *',`<select class="input" id="rx_student">${sopts}</select>`)}
    ${f('درس *',`<select class="input" id="rx_subject">${subopts}</select>`)}
    </div>
    <div class="grid g2">
    ${f('نمرهٔ اصلی *',`<input class="input" id="rx_orig" type="number" min="0" max="20" step="0.5" value="" />`)}
    ${f('تاریخِ امتحانِ مجدد',`<input class="input" id="rx_date" type="date" value="${todayISO()}" /> <span class="badge b-gray">${jalali(todayISO())}</span>`)}
    </div>
   `,'reexam-save'));
}
function reexamScoreModal(sid){
  var r=byId('reexams',sid);
  openModal(modalTpl('نمرهٔ مجدد — '+(r?esc((byId('users',r.student_id)||{}).full_name||''):''),
   `
   ${f('نمرهٔ مجدد (۰ تا ۲۰) *',`<input class="input" id="rx_new" type="number" min="0" max="20" step="0.5" value="${r&&r.new_score!=null?r.new_score:''}" />`)}
   <div class="small muted">با ثبت، وضعیت «انجام‌شده» می‌شود و <b>نمرهٔ نهایی</b> در کارنامه و پرونده همین نمره است.</div>
   `,'reexam-score-save'));
  window._rxSid=Number(sid);
}
/* بند ۶.۲ — مودالِ صورت‌جلسهٔ انجمن */
function assocMinModal(){
  openModal(modalTpl('صورت‌جلسهٔ جلسهٔ انجمن',
   `
   ${f('تاریخِ جلسه *',`<input class="input" id="am_date" type="date" value="${todayISO()}" /> <span class="badge b-gray">${jalali(todayISO())}</span>`)}
   ${f('حاضرین در جلسه * (هر خط یک مورد)',`<textarea class="input" id="am_att" rows="4" placeholder="مثلاً:\nآقای محمدی — رئیس انجمن\nسرکار خانم احمدی — نمایندهٔ اولیا\nآقای رضایی — مدیر مدرسه" style="line-height:1.9"></textarea>`)}
   ${f('مصوبات جلسه (هر خط یک مصوبه)',`<textarea class="input" id="am_res" rows="5" placeholder="مثلاً:\nتصویبِ کمکِ داوطلبانهٔ ۵ میلیونی برای کتابخانه\nتعیینِ اردوی پاییز در اواخرِ مهر" style="line-height:1.9"></textarea>`)}
   `,'assoc-min-save'));
}
/* بند ۶.۴ — مودال‌های کلاس‌های تابستانی */
function summerModal(){
  var ts=db.users.filter(function(u){return u.role==='teacher'&&u.school_id===S.user.school_id&&u.active;})
    .sort(function(a,b){return a.full_name.localeCompare(b.full_name,'fa');});
  var topts=ts.map(function(u){return '<option value="'+u.id+'">'+esc(u.full_name)+'</option>';}).join('');
  openModal(modalTpl('کلاسِ تابستانیِ تازه',
   `
   ${f('نام کلاس *',`<input class="input" id="su_name" value="" placeholder="مثلاً تکمیلی ریاضی تابستان" />`)}
   ${f('دبیر *',`<select class="input" id="su_teacher">${topts}</select>`)}
   <div class="grid g2">
   ${f('تاریخِ شروع *',`<input class="input" id="su_start" type="date" value="${todayISO()}" /> <span class="badge b-gray">${jalali(todayISO())}</span>`)}
   ${f('تاریخِ پایان',`<input class="input" id="su_end" type="date" value="" />`)}
   </div>
   ${f('یادداشت (اختیاری)',`<input class="input" id="su_note" value="" placeholder="مثلاً ساعت و روزهای برگزاری" />`)}
   `,'summer-save'));
}
function summerStudentsModal(){
  var sc=byId('summer_classes',window._suId);
  if(!sc)return;
  var have=sc.student_ids||[];
  var studs=db.users.filter(function(u){return u.role==='student'&&u.school_id===S.user.school_id&&u.active;})
    .sort(function(a,b){return a.full_name.localeCompare(b.full_name,'fa');});
  var rows=studs.map(function(u){
    var on=have.indexOf(u.id)>-1;
    return '<label style="display:flex;gap:8px;align-items:center;padding:4px 0;cursor:pointer">'
      +'<input type="checkbox" class="su-chk" value="'+u.id+'" '+(on?'checked':'')+' /> '+esc(u.full_name)+'</label>';
  }).join('');
  openModal(modalTpl('دانش‌آموزان — ' + sc.name,
   `<div class="small muted" style="margin-bottom:6px">دانش‌آموزانِ این کلاس را انتخاب کنید (هر کلاس تا ${fa(15)} نفر).</div>
   <div class="vscroll" style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px">${rows}</div>
   `,'summer-students-save'));
}
const PRESETS={positive:POS.map(p=>p[0]),negative:NEG.map(p=>p[0])};
function discModal(d){
  const cls=visibleClasses();
  const cid=Number(S.filters.class||(cls[0]||{}).id);
  const studs=studentsOfClass(cid);
  if(!studs.length&&!d){toast('دانش‌آموزی برای ثبت وجود ندارد','err');return;}
  d=d||{student_id:studs[0].id,kind:'negative',title:PRESETS.negative[0],description:'',points:-3,date:todayISO()};
  const opts=PRESETS[d.kind].includes(d.title)?PRESETS[d.kind]:PRESETS[d.kind].concat([d.title]);
  openModal(modalTpl(d.id?'ویرایش مورد انضباطی':'ثبت مورد انضباطی',
   `<div class="grid g2">
    ${f('دانش‌آموز',`<select class="select" id="d_st" ${d.id?'disabled':''}>${(d.id?[byId('users',d.student_id)]:studs).map(s=>`<option value="${escAttr(s.id)}" ${s.id===d.student_id?'selected':''}>${esc(s.full_name)}</option>`).join('')}</select>`)}
    ${f('نوع',sel('d_kind',[['positive','مثبت'],['negative','منفی']],d.kind))}
    ${f('عنوان',sel('d_title',opts.map(o=>[o,o]),d.title))}
    ${f('امتیاز',inp('d_points',d.points,'number'))}${f('تاریخ',jdate('d_date',d.date))}</div>
    ${(()=>{const _sid=d.student_id;try{if(typeof dojoAvailableForStudent!=='function'||!dojoAvailableForStudent(_sid))return '';const _sc=dojoSchoolOfStudent(_sid);return dojoChipsHtml(_sc.id);}catch(e){return '';}})()}
    ${f('توضیحات',`<textarea class="input" id="d_desc" rows="3">${esc(d.description||'')}</textarea>`)}`,'disc-save'));
  window._edit=d;
}
function annModal(a){
  a=a||{title:'',body:'',audience:'all'};
  openModal(modalTpl(a.id?'ویرایش اطلاعیه':'انتشار اطلاعیه',
   `${f('عنوان *',inp('a_title',a.title))}
    ${f('مخاطب',sel('a_aud',[['all','همه'],['teacher','دبیران'],['student','دانش‌آموزان'],['parent','اولیا'],['manager','مدیران']],a.audience))}
    ${f('متن *',`<textarea class="input" id="a_body" rows="5">${esc(a.body||'')}</textarea>`)}`,'ann-save'));
  window._annEdit=a.id||0;
}
function confirmModal(text,act,id){openModal(modalTpl('تأیید حذف',`<p style="margin:0;font-size:15px;font-weight:600;line-height:2.1">${esc(text)}</p>`,act,true));window._delId=id;}
/** پرسش تأیید عمومی — o: {title, ok, danger, note} */
function askConfirm(text,fn,o){
  o=o||{};
  window._askFn=fn;
  openModal(modalTpl(o.title||'تأیید عملیات',
    `<p style="margin:0;font-size:15px;font-weight:600;line-height:2.1">${esc(text)}</p>
     ${o.note===false?'':`<div class="small muted" style="margin-top:8px">${esc(o.note||'لطفاً پیش از ادامه از درستی این عملیات مطمئن شوید.')}</div>`}`,
    'ask-ok', o.danger!==false, o.ok));
}
/** پرسش تأیید حذف */
function askDelete(text,fn){
  askConfirm(text,fn,{title:'تأیید حذف',ok:'حذف کن',danger:true,note:'این عملیات قابل بازگشت نیست.'});
}

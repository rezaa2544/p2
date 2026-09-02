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
    <button class="btn ${danger?'danger':''}" data-act="${saveAct}">${okLabel||(danger?'حذف کن':'ذخیره')}</button></div>`;
}
const f=(label,inner)=>`<div class="field"><label>${label}</label>${inner}</div>`;
const inp=(id,val,type='text')=>`<input class="input" id="${id}" type="${type}" value="${esc(val??'')}" />`;
const sel=(id,opts,val)=>`<select class="select" id="${id}">${opts.map(o=>`<option value="${esc(o[0])}" ${String(val)===String(o[0])?'selected':''}>${esc(o[1])}</option>`).join('')}</select>`;
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
      ${f('جنسیت',sel('m_gender',[['پسرانه','پسرانه'],['دخترانه','دخترانه']],s.gender))}
      ${f('تلفن ثابت مدرسه',inp('m_landline',s.landline||''))}
      ${f('تلفن همراه رابط',inp('m_phone',s.phone||''))}
      ${f('ظرفیت',inp('m_cap',s.capacity,'number'))}
      ${f('وضعیت',sel('m_active',[[1,'فعال'],[0,'غیرفعال']],s.active?1:0))}</div>
    <div id="m_branch_box" style="display:${s.level==='متوسطه دوم'?'block':'none'}">${branchPicker(s)}</div>
    ${f('آدرس',`<textarea class="input" id="m_addr" rows="2">${esc(s.address||'')}</textarea>`)}
    <div class="sec-title">👤 مشخصات مدیر مدرسه ${mgr?'':'<span class="small muted">(حساب کاربری او ساخته می‌شود)</span>'}</div>
    <div class="grid g2">
      ${f('نام و نام خانوادگی'+(s.id?'':' *'),inp('mg_name',mgr?mgr.full_name:''))}
      ${f('کد ملی',inp('mg_nid',mgr?mgr.national_id:''))}
      ${f('تلفن همراه',inp('mg_phone',mgr?mgr.phone:''))}
      ${f('نام کاربری'+(s.id?'':' *'),inp('mg_user',mgr?mgr.username:''))}
      ${f(mgr?'رمز جدید (خالی = بدون تغییر)':'رمز عبور',inp('mg_pass',mgr?'':'123456'))}</div>`,
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
    ${f('نقش',sel('u_role',[['manager','مدیر مدرسه'],['teacher','دبیر'],['student','دانش‌آموز'],['parent','ولی']],x.role))}
    ${isSuper?f('مدرسه',sel('u_school',db.schools.map(s=>[s.id,s.name]),x.school_id)):''}
    ${f('کد ملی',inp('u_nid',x.national_id))}${f('تلفن همراه',inp('u_phone',x.phone))}
    ${f('کلاس (برای دانش‌آموز)',sel('u_class',[['','— بدون کلاس —']].concat(clsList.map(c=>[c.id,c.name])),cur))}
    ${f('رمز عبور',inp('u_pass',x.id?'':'123456'))}
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
  /* همهٔ رشته‌های شاخه‌های متوسطه دوم */
  var fieldOpts = [];
  try{
    if(typeof BRANCHES === 'object' && typeof fieldsOfBranch === 'function'){
      Object.keys(BRANCHES).forEach(function(b){
        (fieldsOfBranch(b) || []).forEach(function(x){
          if(fieldOpts.indexOf(x) < 0) fieldOpts.push(x); });
      });
    }
  }catch(e){ fieldOpts = []; }
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
    ${isSuper?f('مدرسه',sel('c_school',db.schools.map(s=>[s.id,s.name]),c.school_id)):''}</div>`,'class-save'));
  window._edit=c;
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
        ${f('شاخه',sel('s_branch',[['','— انتخاب شاخه —'],...Object.keys(BRANCHES).map(b=>[b,b])],br))}
        ${f('رشته',sel('s_field',[['','— انتخاب رشته —'],...fieldsOfBranch(br).map(x=>[x,x])],s.field||''))}
      </div>
      <div class="small muted" style="margin-top:-4px">در متوسطه دوم (پایه‌های دهم تا دوازدهم) کتاب‌ها بر اساس شاخه و رشته تفکیک می‌شوند.</div>
    </div>
    ${isSuper?`<div class="grid g2">${f('مدرسه',sel('s_school',db.schools.map(x=>[x.id,x.name]),s.school_id))}</div>`:''}`,
   'subject-save'));
  window._edit=s;
}
function gradeModal(g){
  const cls=visibleClasses();
  const cid=Number(S.filters.class||(cls[0]||{}).id);
  const studs=studentsOfClass(cid), subs=visibleSubjects();
  if(!studs.length){toast('این کلاس دانش‌آموزی ندارد','err');return;}
  g=g||{student_id:studs[0].id,subject_id:subs[0].id,term:TERMS[0],exam_type:EXAM_TYPES[0],score:20};
  openModal(modalTpl(g.id?'ویرایش نمره':'ثبت نمره جدید',
   `<div class="grid g2">
    ${f('دانش‌آموز',`<select class="select" id="g_st" ${g.id?'disabled':''}>${studs.map(s=>`<option value="${s.id}" ${s.id===g.student_id?'selected':''}>${esc(s.full_name)}</option>`).join('')}</select>`)}
    ${f('درس',`<select class="select" id="g_sub" ${g.id?'disabled':''}>${subs.map(s=>`<option value="${s.id}" ${s.id===g.subject_id?'selected':''}>${esc(s.name)}</option>`).join('')}</select>`)}
    ${f('نوبت',sel('g_term',TERMS.map(t=>[t,t]),g.term))}${f('نوع آزمون',sel('g_type',EXAM_TYPES.map(t=>[t,t]),g.exam_type))}
    ${f('نمره (از ۲۰)',`<input class="input" id="g_score" type="number" step="0.25" min="0" max="20" value="${g.score}" />`)}</div>`,'grade-save'));
  window._edit=g;window._gclass=cid;
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
    ${f('دانش‌آموز',`<select class="select" id="d_st" ${d.id?'disabled':''}>${(d.id?[byId('users',d.student_id)]:studs).map(s=>`<option value="${s.id}" ${s.id===d.student_id?'selected':''}>${esc(s.full_name)}</option>`).join('')}</select>`)}
    ${f('نوع',sel('d_kind',[['positive','مثبت'],['negative','منفی']],d.kind))}
    ${f('عنوان',sel('d_title',opts.map(o=>[o,o]),d.title))}
    ${f('امتیاز',inp('d_points',d.points,'number'))}${f('تاریخ',jdate('d_date',d.date))}</div>
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

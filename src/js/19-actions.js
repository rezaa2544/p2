/* ============================ actions ============================ */
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]'); if(!el)return;
  const a=el.dataset.act, id=Number(el.dataset.id);
  const A={
   pick(){ $('#lu').value=el.dataset.u; $('#lp').value='123456'; },
   login(){
     const u=db.users.find(x=>x.username===V('lu'));
     if(!u||u.password!==$('#lp').value){$('#lerr').innerHTML='<div class="badge b-red" style="padding:9px 12px;margin-bottom:8px">⚠️ نام کاربری یا رمز عبور نادرست است</div>';return;}
     if(!u.active){$('#lerr').innerHTML='<div class="badge b-red" style="padding:9px 12px">⚠️ حساب غیرفعال است</div>';return;}
     S.user=u;S.stack=[];S.persona=null;localStorage.removeItem(PERSONA_KEY);
     linkAsParent(u);
     S.showPicker=panelsOf(u).length>1;
     S.route=(u.role==='edu_office'?'officedash':'dashboard');localStorage.setItem(SESSION_KEY,u.username);toast('خوش آمدید، '+u.full_name,'ok');render();
   },
   logout(){S.user=null;S.boss=null;S.stack=[];S.persona=null;S.showPicker=false;
     localStorage.removeItem(SESSION_KEY);localStorage.removeItem(BOSS_KEY);localStorage.removeItem(PERSONA_KEY);render();},
   reset(){askConfirm('همه تغییرات شما پاک و داده‌های نمونه بازنشانی می‌شود. ادامه می‌دهید؟',()=>resetAll(),
     {title:'بازنشانی داده‌های نمونه',ok:'بازنشانی کن',danger:true,note:'تغییرات ذخیره‌شده در این مرورگر از بین می‌رود.'});},
   'do-reset'(){resetAll();},
   'ask-ok'(){ const fn=window._askFn; window._askFn=null; closeModal(); if(typeof fn==='function')fn(); },
   go(){go(el.dataset.r);},
   back(){ goBack(); },
   home(){ go(S.user.role==='edu_office'?'officedash':'dashboard'); },
   opennav(){S.sidebar=true;render();},
   closenav(){S.sidebar=false;render();},
   page(){S.page=Number(el.dataset.p);render();},
   tab(){S.tab=el.dataset.t;render();},
   child(){S.child=id;S.tab='grades';render();},
   'modal-close':closeModal,
   'modal-back'(){if(e.target.classList.contains('modal-back'))closeModal();},
   // schools
   'school-new'(){schoolModal(null);},

   'school-edit'(){schoolModal(byId('schools',id));},
   'school-toggle'(){const s=byId('schools',id);
     const on=!!s.active;
     askConfirm(on?`مدرسه «${s.name}» غیرفعال شود؟ کاربران این مدرسه تا زمان فعال‌سازی مجدد نمی‌توانند وارد سامانه شوند.`
                  :`مدرسه «${s.name}» دوباره فعال شود؟`,
       ()=>{update('schools',s.id,{active:on?0:1});toast(on?'مدرسه غیرفعال شد':'مدرسه فعال شد',on?'':'ok');render();},
       {title:on?'غیرفعال کردن مدرسه':'فعال کردن مدرسه', ok:on?'غیرفعال کن':'فعال کن', danger:!!on,
        note:on?'اطلاعات مدرسه حذف نمی‌شود و هر زمان می‌توانید دوباره فعالش کنید.':'کاربران این مدرسه دوباره می‌توانند وارد شوند.'});},
   'school-enter'(){
     const sc=byId('schools',id);
     const mgr=db.users.find(u=>u.school_id===id&&u.role==='manager'&&u.active);
     if(!mgr){toast('این مدرسه مدیر فعالی ندارد؛ ابتدا برای آن مدیر تعریف کنید','err');return;}
     askConfirm(`به‌عنوان «${mgr.full_name}» وارد پنل مدرسه «${sc.name}» می‌شوید. هر زمان می‌توانید با نوار بالای صفحه به پنل سوپر ادمین برگردید.`,
       ()=>{
         S.boss=S.user; S.user=mgr; S.stack=[]; S.route='dashboard'; S.page=1; S.filters={}; S.tab='grades'; S.child=null;
         localStorage.setItem(BOSS_KEY,S.boss.username); localStorage.setItem(SESSION_KEY,mgr.username);
         toast('وارد پنل «'+sc.name+'» شدید','ok'); render();
       },{title:'ورود به پنل مدرسه',ok:'ورود به پنل',danger:false,note:false});
   },
   'stop-imp'(){
     const boss=S.boss||db.users.find(u=>u.username===localStorage.getItem(BOSS_KEY));
     if(!boss){toast('حساب سوپر ادمین یافت نشد','err');return;}
     S.user=boss; S.boss=null; S.stack=[]; S.route='schools'; S.page=1; S.filters={}; S.child=null;
     localStorage.removeItem(BOSS_KEY); localStorage.setItem(SESSION_KEY,boss.username);
     toast('به پنل سوپر ادمین بازگشتید','ok'); render();
   },
   'school-del'(){confirmModal('حذف مدرسه و تمام کاربران، کلاس‌ها و اطلاعات آن؟','school-del-ok',id);},
   'school-del-ok'(){const sid=window._delId;
     db.users.filter(u=>u.school_id===sid).forEach(u=>remove('users',u.id));
     db.classes.filter(c=>c.school_id===sid).forEach(c=>remove('classes',c.id));
     remove('schools',sid);closeModal();toast('مدرسه حذف شد','ok');render();},
   'school-save'(){const s=window._edit;
     if(!V('m_name')||!V('m_code')){toast('نام و کد مدرسه الزامی است','err');return;}
     const pid=Number(V('m_prov'))||null, cid=Number(V('m_county'))||null, did=Number(V('m_district'))||null;
     if(!pid||!cid){toast('استان و شهرستان را انتخاب کنید','err');return;}
     if(db.schools.some(x=>x.code===V('m_code')&&x.id!==s.id)){toast('کد مدرسه تکراری است','err');return;}
     const dist=did?byId('districts',did):null;
     const data={name:V('m_name'),code:V('m_code'),
       province_id:pid,county_id:cid,district_id:did,
       city:(byId('counties',cid)||{}).name||'',
       area_kind:dist?(dist.kind||'district'):'district',
       phone:V('m_phone'),landline:V('m_landline'),
       level:V('m_level'),gender:V('m_gender'),capacity:Number(V('m_cap'))||300,
       active:Number(V('m_active')),address:V('m_addr')};

     const mgName=V('mg_name'), mgUser=V('mg_user'), mgNid=V('mg_nid'), mgPhone=V('mg_phone'), mgPass=V('mg_pass');
     const existing=s.id?db.users.find(u=>u.school_id===s.id&&u.role==='manager'):null;
     if(!s.id&&(!mgName||!mgUser)){toast('نام و نام کاربری مدیر مدرسه الزامی است','err');return;}
     if(mgNid&&!validNid(mgNid)){toast('کد ملی مدیر معتبر نیست','err');return;}
     if(mgNid&&nidOwner(mgNid,existing?existing.id:0)){toast('این کد ملی قبلاً برای فرد دیگری ثبت شده است','err');return;}
     if(mgUser&&db.users.some(u=>u.username===mgUser&&(!existing||u.id!==existing.id))){toast('نام کاربری مدیر تکراری است','err');return;}

     let sid=s.id;
     if(s.id)update('schools',s.id,data);
     else sid=insert('schools',Object.assign({created_at:todayISO()},data)).id;

     if(existing){
       const patch={full_name:mgName||existing.full_name,national_id:mgNid||existing.national_id,phone:mgPhone||existing.phone};
       if(mgUser)patch.username=mgUser;
       if(mgPass)patch.password=mgPass;
       update('users',existing.id,patch);
     } else if(mgName&&mgUser){
       insert('users',{school_id:sid,role:'manager',full_name:mgName,username:mgUser,password:mgPass||'123456',
         national_id:mgNid||makeNid(),phone:mgPhone||'',active:1,title:'مدیر مدرسه',created_at:todayISO()});
     }
     closeModal();toast(s.id?'تغییرات ذخیره شد':'مدرسه و حساب مدیر ثبت شد','ok');render();},
   // users
   'user-new'(){userModal(null);},
   'user-edit'(){userModal(byId('users',id));},
   'user-toggle'(){const u=byId('users',id);update('users',id,{active:u.active?0:1});render();},
   'user-del'(){confirmModal('حذف این کاربر؟ این عملیات قابل بازگشت نیست.','user-del-ok',id);},
   'user-del-ok'(){remove('users',window._delId);closeModal();toast('کاربر حذف شد','ok');render();},
   'user-save'(){const x=window._edit;
     if(!V('u_name')||!V('u_user')&&!x.id){toast('نام و نام کاربری الزامی است','err');return;}
     const schoolId=$('#u_school')?Number(V('u_school')):(x.school_id||S.user.school_id);
     const data={full_name:V('u_name'),role:V('u_role'),national_id:V('u_nid'),phone:V('u_phone'),active:Number(V('u_active')),school_id:schoolId};
     if(V('u_pass'))data.password=V('u_pass');
     let uid=x.id;
     if(uid)update('users',uid,data);
     else{ if(db.users.some(u=>u.username===V('u_user'))){toast('نام کاربری تکراری است','err');return;}
       uid=insert('users',Object.assign({username:V('u_user'),password:V('u_pass')||'123456',created_at:todayISO()},data)).id; }
     const cls=$('#u_class')?V('u_class'):'';
     if(data.role==='student'){db.enrollments.filter(en=>en.student_id===uid).forEach(en=>remove('enrollments',en.id));
       if(cls)insert('enrollments',{school_id:schoolId,class_id:Number(cls),student_id:uid});}
     closeModal();toast(x.id?'کاربر به‌روزرسانی شد':'کاربر ایجاد شد','ok');render();},
   // classes
   'class-new'(){classModal(null);},
   'class-edit'(){classModal(byId('classes',id));},
   'class-del'(){confirmModal('حذف این کلاس؟ ثبت‌نام‌های مرتبط نیز حذف می‌شوند.','class-del-ok',id);},
   'class-del-ok'(){const cid=window._delId;db.enrollments.filter(e=>e.class_id===cid).forEach(e=>remove('enrollments',e.id));remove('classes',cid);closeModal();toast('کلاس حذف شد','ok');render();},
   'class-save'(){const c=window._edit;
     if(!V('c_name')){toast('نام کلاس الزامی است','err');return;}
     const data={name:V('c_name'),grade:V('c_grade'),field:V('c_field'),room:V('c_room'),capacity:Number(V('c_cap'))||30,homeroom_teacher_id:V('c_ht')?Number(V('c_ht')):null};
     if($('#c_school'))data.school_id=Number(V('c_school'));else data.school_id=c.school_id;
     if(c.id)update('classes',c.id,data);else insert('classes',data);
     closeModal();toast('ذخیره شد','ok');render();},
   // subjects
   'subject-new'(){subjectModal(null);},
   'subject-edit'(){subjectModal(byId('subjects',id));},
   'subject-del'(){confirmModal('حذف این درس؟','subject-del-ok',id);},
   'subject-del-ok'(){remove('subjects',window._delId);closeModal();toast('درس حذف شد','ok');render();},
   'subject-save'(){const s=window._edit;
     if(!V('s_name')){toast('نام درس الزامی است','err');return;}
     const grade=V('s_grade')||'';
     const lv=levelOfGrade(grade);
     const field=needsField(lv)?(V('s_field')||''):'';
     if(needsField(lv)&&!field){toast('برای پایه‌های متوسطه دوم، انتخاب رشته الزامی است','err');return;}
     const data={name:V('s_name'),code:V('s_code'),weekly_hours:Number(V('s_h'))||2,grade,field,
       school_id:$('#s_school')?Number(V('s_school')):s.school_id};
     if(s.id)update('subjects',s.id,data);else insert('subjects',data);
     closeModal();toast('ذخیره شد','ok');render();},
   /* افزودن دسته‌جمعی کتاب‌های استاندارد بر اساس پایه/رشته */
   'subject-import'(){
     const isSuper=S.user.role==='superadmin';
     openModal(modalTpl('📥 افزودن کتاب‌های استاندارد',
      `<div class="small muted" style="margin-bottom:10px">کتاب‌های مصوب پایه‌ی انتخابی به فهرست دروس اضافه می‌شوند. کتاب‌های تکراری نادیده گرفته می‌شوند.</div>
       <div class="grid g2">
         ${f('مقطع *',sel('im_level',[['','— انتخاب مقطع —'],...LEVELS.map(l=>[l,l])]))}
         ${f('پایه *',sel('im_grade',[['','— ابتدا مقطع را انتخاب کنید —']]))}
       </div>
       <div id="im_fieldwrap" style="display:none"><div class="grid g2">
         ${f('شاخه *',sel('im_branch',[['','— انتخاب شاخه —'],...Object.keys(BRANCHES).map(b=>[b,b])]))}
         ${f('رشته *',sel('im_field',[['','— ابتدا شاخه را انتخاب کنید —']]))}
       </div></div>
       ${isSuper?`<div class="grid g2">${f('مدرسه',sel('im_school',db.schools.map(x=>[x.id,x.name])))}</div>`:''}
       <div id="im_preview" class="small muted" style="margin-top:8px"></div>`,
      'subject-import-save'));
   },
   'subject-import-save'(){
     const grade=V('im_grade'), lv=V('im_level');
     if(!lv||!grade){toast('مقطع و پایه را انتخاب کنید','err');return;}
     const field=needsField(lv)?V('im_field'):'';
     if(needsField(lv)&&!field){toast('شاخه و رشته را انتخاب کنید','err');return;}
     const sid=$('#im_school')?Number(V('im_school')):S.user.school_id;
     const books=booksFor(grade,field);
     if(!books.length){toast('برای این انتخاب کتابی تعریف نشده','err');return;}
     let added=0,skipped=0;
     books.forEach(([name,hours])=>{
       const dup=db.subjects.some(x=>x.school_id===sid&&x.name===name&&(x.grade||'')===grade&&(x.field||'')===(field||''));
       if(dup){skipped++;return;}
       insert('subjects',{school_id:sid,name,code:'',weekly_hours:Number(String(hours).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))||2,grade,field});
       added++;
     });
     closeModal();
     toast(`${fa(added)} کتاب اضافه شد${skipped?` — ${fa(skipped)} مورد تکراری بود`:''}`,'ok');
     render();
   },
   // attendance
   'att-set'(){const sid=id,st=el.dataset.s;const date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     const ex=db.attendance.find(x=>x.student_id===sid&&x.date===date);
     if(ex)update('attendance',ex.id,{status:st,class_id:cid});
     else insert('attendance',{school_id:byId('classes',cid).school_id,class_id:cid,student_id:sid,date,status:st,note:null});
     render();},
   'att-all'(){const st=el.dataset.s,date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     studentsOfClass(cid).forEach(s=>{const ex=db.attendance.find(x=>x.student_id===s.id&&x.date===date);
       if(ex)update('attendance',ex.id,{status:st});else insert('attendance',{school_id:byId('classes',cid).school_id,class_id:cid,student_id:s.id,date,status:st,note:null});});
     toast('همه دانش‌آموزان «'+ATT_FA[st]+'» ثبت شدند','ok');render();},
   // grades
   'grade-new'(){gradeModal(null);},
   'grade-edit'(){gradeModal(byId('grades',id));},
   'grade-del'(){confirmModal('حذف این نمره؟','grade-del-ok',id);},
   'grade-del-ok'(){remove('grades',window._delId);closeModal();toast('نمره حذف شد','ok');render();},
   'grade-save'(){const g=window._edit;const score=Number(V('g_score'));
     if(isNaN(score)||score<0||score>20){toast('نمره باید بین ۰ تا ۲۰ باشد','err');return;}
     if(g.id)update('grades',g.id,{score,term:V('g_term'),exam_type:V('g_type')});
     else{const sid=Number(V('g_st')),cid=window._gclass;
       insert('grades',{school_id:byId('classes',cid).school_id,student_id:sid,class_id:cid,subject_id:Number(V('g_sub')),teacher_id:S.user.role==='teacher'?S.user.id:null,term:V('g_term'),exam_type:V('g_type'),score,max_score:20,created_at:todayISO()});}
     closeModal();toast('نمره ثبت شد','ok');render();},
   // discipline
   'disc-new'(){discModal(null);},
   'disc-edit'(){discModal(byId('discipline',id));},
   'disc-del'(){confirmModal('حذف این مورد انضباطی؟','disc-del-ok',id);},
   'disc-del-ok'(){remove('discipline',window._delId);closeModal();toast('حذف شد','ok');render();},
   'disc-save'(){const d=window._edit;
     const data={kind:V('d_kind'),title:V('d_title'),description:V('d_desc'),points:Number(V('d_points'))||0,date:V('d_date')};
     if(d.id)update('discipline',d.id,data);
     else{const sid=Number(V('d_st'));insert('discipline',Object.assign({school_id:byId('users',sid).school_id,student_id:sid,created_by:S.user.id},data));}
     closeModal();toast('مورد انضباطی ثبت شد','ok');render();},
   // announcements
   'ann-new'(){annModal();},
   'ann-edit'(){annModal(byId('announcements',id));},
   'ann-del'(){const a=byId('announcements',id);askDelete(`اطلاعیه «${a.title}» حذف شود؟`,()=>{remove('announcements',id);toast('اطلاعیه حذف شد','ok');render();});},
   'ann-save'(){ if(!V('a_title')||!V('a_body')){toast('عنوان و متن الزامی است','err');return;}
     const data={title:V('a_title'),body:V('a_body'),audience:V('a_aud')};
     if(window._annEdit)update('announcements',window._annEdit,data);
     else insert('announcements',Object.assign({school_id:S.user.school_id||null,created_by:S.user.id,created_at:todayISO()},data));
     closeModal();toast(window._annEdit?'اطلاعیه ویرایش شد':'اطلاعیه منتشر شد','ok');window._annEdit=0;render();}
  };
  if(A[a]){e.preventDefault();A[a]();}
  else if(typeof F7_ACTIONS!=='undefined'&&F7_ACTIONS[a]){e.preventDefault();F7_ACTIONS[a](el,id);}
  else if(typeof P8_ACTIONS!=='undefined'&&P8_ACTIONS[a]){e.preventDefault();P8_ACTIONS[a](el,id);}
  else if(typeof P9_ACTIONS!=='undefined'&&P9_ACTIONS[a]){e.preventDefault();P9_ACTIONS[a](el,id);}
  else if(typeof P10_ACTIONS!=='undefined'&&P10_ACTIONS[a]){e.preventDefault();P10_ACTIONS[a](el,id);}
  else if(typeof JD_ACTIONS!=='undefined'&&JD_ACTIONS[a]){e.preventDefault();JD_ACTIONS[a](el,id);}
  else if(typeof FILTER_ACTIONS!=='undefined'&&FILTER_ACTIONS[a]){e.preventDefault();FILTER_ACTIONS[a](el,id);}
  else if(typeof SYNC_ACTIONS!=='undefined'&&SYNC_ACTIONS[a]){e.preventDefault();SYNC_ACTIONS[a](el,id);}
});

// live filters
document.addEventListener('input',e=>{
  const el=e.target.closest('[data-f]');if(!el)return;
  const k=el.dataset.f;
  if(el.tagName==='INPUT'&&el.type==='text'||el.placeholder){
    clearTimeout(window._deb);const v=el.value;
    window._deb=setTimeout(()=>{S.filters[k]=v;S.page=1;render();const n=$(`[data-f="${k}"]`);if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}},280);
  }
});
/* آبشاری: مقطع → پایه → شاخه → رشته (فرم درس و فرم افزودن کتاب) */
document.addEventListener('change',e=>{
  const id=e.target.id;
  const optsOf=(list,ph)=>[`<option value="">${ph}</option>`,...list.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`)].join('');

  /* فرم درس: تغییر پایه → نمایش یا پنهان‌کردن شاخه/رشته */
  if(id==='s_grade'){
    const lv=levelOfGrade(e.target.value);
    const w=$('#s_fieldwrap'); if(w)w.style.display=needsField(lv)?'':'none';
    if(!needsField(lv)){ if($('#s_branch'))$('#s_branch').value=''; if($('#s_field'))$('#s_field').value=''; }
    return;
  }
  if(id==='s_branch'){
    if($('#s_field'))$('#s_field').innerHTML=optsOf(fieldsOfBranch(e.target.value),'— انتخاب رشته —');
    return;
  }

  /* فرم افزودن کتاب استاندارد */
  if(id==='im_level'){
    const lv=e.target.value;
    if($('#im_grade'))$('#im_grade').innerHTML=optsOf(GRADES_OF_LEVEL[lv]||[],'— انتخاب پایه —');
    const w=$('#im_fieldwrap'); if(w)w.style.display=needsField(lv)?'':'none';
    if($('#im_preview'))$('#im_preview').innerHTML='';
    return;
  }
  if(id==='im_branch'){
    if($('#im_field'))$('#im_field').innerHTML=optsOf(fieldsOfBranch(e.target.value),'— انتخاب رشته —');
    return;
  }
  if(id==='im_grade'||id==='im_field'){
    const g=$('#im_grade')?$('#im_grade').value:'', fd=$('#im_field')?$('#im_field').value:'';
    const books=g?booksFor(g,fd):[];
    if($('#im_preview'))$('#im_preview').innerHTML=books.length
      ? `<b>${fa(books.length)} کتاب</b> اضافه خواهد شد: ${books.map(b=>esc(b[0])).join('، ')}`
      : (g?'برای این انتخاب کتابی تعریف نشده است.':'');
    return;
  }

/* آبشاری: استان → شهرستان → منطقه در فرم مدرسه */
  if(id==='m_prov'||id==='m_county'){
    const pid=$('#m_prov')?$('#m_prov').value:'', cid=id==='m_prov'?'':($('#m_county')?$('#m_county').value:'');
    const g=geoOptions(pid,cid);
    if(id==='m_prov'&&$('#m_county'))$('#m_county').innerHTML=g.counties.map(o=>`<option value="${o[0]}">${esc(o[1])}</option>`).join('');
    if($('#m_district'))$('#m_district').innerHTML=(id==='m_prov'?geoOptions(pid,'').districts:g.districts).map(o=>`<option value="${o[0]}">${esc(o[1])}</option>`).join('');
    const off=officeForDistrict(pid,$('#m_county')?$('#m_county').value:'',$('#m_district')?$('#m_district').value:'');
    if($('#m_office'))$('#m_office').innerHTML='اداره مربوطه: <b>'+esc(off?off.name:'—')+'</b>';
    return;
  }
  if(id==='m_district'){
    const off=officeForDistrict($('#m_prov').value,$('#m_county').value,$('#m_district').value);
    if($('#m_office'))$('#m_office').innerHTML='اداره مربوطه: <b>'+esc(off?off.name:'—')+'</b>';
    return;
  }
  const el=e.target.closest('[data-f]');if(!el)return;
  if(el.dataset.f==='duty-add'){
    const eid=Number(el.dataset.e), tid=Number(el.value); if(!tid)return;
    const ex=byId('exams',eid);
    const clash=db.exam_duties.some(d=>{ if(d.teacher_id!==tid)return false; const e2=byId('exams',d.exam_id);
      return e2&&e2.date===ex.date&&overlapP(ex.start_time,ex.duration,e2.start_time,e2.duration); });
    if(clash){toast('تداخل مراقبت: این دبیر در همان ساعت جای دیگری مراقب است','err');render();return;}
    insert('exam_duties',{exam_id:eid,teacher_id:tid,school_id:ex.school_id,role:db.exam_duties.filter(d=>d.exam_id===eid).length?'assistant':'main'});
    insert('notifications',{user_id:tid,school_id:ex.school_id,type:'announcement',title:'👁️ ابلاغ مراقبت امتحان',
      body:`${jalali(ex.date)} ساعت ${ex.start_time}`,link:'exams',read:0,created_at:todayISO()});
    toast('ابلاغ صادر شد','ok');render();return;
  }
  if(el.dataset.f==='sp'){S.filters.sp=el.value;S.filters.sc='';S.filters.sd='';S.page=1;render();return;}
  if(el.dataset.f==='sublevel'){S.filters.sublevel=el.value;S.filters.subgrade='';S.filters.subbranch='';S.filters.subfield='';S.page=1;render();return;}
  if(el.dataset.f==='subbranch'){S.filters.subbranch=el.value;S.filters.subfield='';S.page=1;render();return;}
  if(el.dataset.f==='sc'){S.filters.sc=el.value;S.filters.sd='';S.page=1;render();return;}
  if(el.dataset.f==='term'){S.filters.term=Number(el.value);render();return;}
  if(el.tagName==='SELECT'||el.type==='date'){S.filters[el.dataset.f]=el.value;S.page=1;render();}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ if($('#modal').innerHTML)closeModal(); else if(S.user)goBack(); }
  if((e.key==='Backspace')&&S.user&&!/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName||''))){e.preventDefault();goBack();}
  if(e.key==='Enter'&&!S.user&&$('#lu'))document.querySelector('[data-act="login"]').click();});

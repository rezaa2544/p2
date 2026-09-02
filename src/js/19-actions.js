/* ============================ actions ============================ */
/** شناسهٔ نوبت انتخاب‌شده برای رزرو (بین باز شدن مودال و ثبت آن) */
var SLOT_ID=null;
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]'); if(!el)return;
  const a=el.dataset.act, id=Number(el.dataset.id);
  /* گارد مجوز اکشن: حتی اگر مهاجم دکمه را دستی بسازد، اکشن‌های تغییردهندهٔ
     داده برای نقش‌های غیرمجاز اجرا نمی‌شوند. */
  if(S.user && typeof canAction==='function' && !canAction(a)){
    if(typeof toast==='function') toast('شما اجازهٔ انجام این عملیات را ندارید','err');
    return;
  }
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
     const _am=(typeof idxAttByClassDate==='function')?idxAttByClassDate():null;
     const _day=new Map();
     if(_am)(_am.get(cid+'|'+date)||[]).forEach(a=>_day.set(a.student_id,a));
     studentsOfClass(cid).forEach(s=>{const ex=_am?_day.get(s.id):db.attendance.find(x=>x.student_id===s.id&&x.date===date);
       if(ex)update('attendance',ex.id,{status:st});else insert('attendance',{school_id:byId('classes',cid).school_id,class_id:cid,student_id:s.id,date,status:st,note:null});});
     toast('همه دانش‌آموزان «'+ATT_FA[st]+'» ثبت شدند','ok');render();},
   // ---- افت تحصیلی / جلسات اولیا / رشد مدرسه ----
   'risk-notify'(){
     const st=byId('users',id); if(!st)return;
     const targets=[id].concat(db.parent_links.filter(l=>l.student_id===id).map(l=>l.parent_id));
     batchWrites(()=>targets.forEach(uid=>insert('notifications',{user_id:uid,school_id:st.school_id,
       type:'low_grade',title:'⚠️ هشدار وضعیت تحصیلی',
       body:'وضعیت تحصیلی '+st.full_name+' نیازمند توجه است. لطفاً با مدرسه در تماس باشید.',
       link:'record',read:0,created_at:todayISO()})));
     toast('هشدار برای خانواده ارسال شد','ok');
   },
   'invite-parents'(){
     const sid=S.user.school_id;
     const parents=parentsOfSchool(sid).filter(p=>!subOf(p).active);
     const school=byId('schools',sid)||{};
     if(!parents.length){toast('همه اولیا اشتراک فعال دارند','ok');return;}
     askConfirm('دعوت‌نامه برای '+fa(parents.length)+' ولی بدون اشتراک ارسال شود؟',()=>{
       batchWrites(()=>parents.slice(0,300).forEach(p=>insert('notifications',{user_id:p,school_id:sid,
         type:'announcement',title:'📱 دعوت به پنل اولیا',
         body:'اولیای گرامی، با نصب پایش نمرات و حضور و غیاب فرزندتان را لحظه‌ای ببینید. '
              +fa(subSettings().trial_days||0)+' روز رایگان — کد مدرسه: '+refCodeOf(school),
         link:'subscription',read:0,created_at:todayISO()})));
       toast('دعوت‌نامه برای '+fa(parents.length)+' ولی ارسال شد','ok'); render();
     },{title:'ارسال دعوت‌نامه',ok:'ارسال'});
   },
   'mtg-new'(){
     openModal(modalTpl('ساخت نوبت‌های جلسه',
       '<div class="grid g2">'+f('تاریخ',jdate('ms_date',addDaysISO(todayISO(),3)))
       +f('ساعت شروع',inp('ms_time','15:00','time'))
       +f('مدت هر نوبت (دقیقه)',inp('ms_dur',15,'number'))
       +f('تعداد نوبت',inp('ms_count',6,'number'))
       +f('محل برگزاری',inp('ms_place','دفتر مدرسه'))+'</div>','mtg-save'));
   },
   'mtg-save'(){
     const date=V('ms_date'), dur=Number(V('ms_dur'))||15, count=Math.min(40,Number(V('ms_count'))||6);
     const parts=String(V('ms_time')||'15:00').split(':').map(Number);
     let mins=(parts[0]||0)*60+(parts[1]||0), made=0;
     const tid=S.user.role==='teacher'?S.user.id
       :(db.users.find(u=>u.role==='teacher'&&u.school_id===S.user.school_id)||{}).id;
     if(!tid){toast('دبیری در مدرسه نیست','err');return;}
     if(!date){toast('تاریخ را وارد کنید','err');return;}
     batchWrites(()=>{
       for(let i=0;i<count;i++){
         const t=toHHMMP(mins);
         if(!db.meeting_slots.some(s=>s.teacher_id===tid&&s.date===date&&s.start_time===t)){
           insert('meeting_slots',{school_id:S.user.school_id,teacher_id:tid,date,start_time:t,
             duration:dur,location:V('ms_place'),status:'open',parent_id:null,student_id:null,
             created_at:todayISO()});made++;
         }
         mins+=dur;
       }
     });
     closeModal(); toast(fa(made)+' نوبت ساخته شد','ok'); render();
   },
   'mtg-book'(){
     const kids=myKids();
     if(!kids.length){toast('فرزندی ثبت نشده است','err');return;}
     openModal(modalTpl('رزرو نوبت',
       f('برای کدام فرزند؟',sel('bk_kid',kids.map(k=>[k.id,k.full_name])))
       +f('موضوع گفتگو (اختیاری)',inp('bk_note','')),'mtg-book-ok'));
     SLOT_ID=id;
   },
   'mtg-book-ok'(){
     const slot=byId('meeting_slots',SLOT_ID);
     if(!slot){toast('نوبت یافت نشد','err');return;}
     if(slot.status!=='open'){toast('این نوبت دیگر آزاد نیست','err');render();return;}
     if(db.meeting_slots.some(s=>s.parent_id===S.user.id&&s.date===slot.date&&s.status==='booked')){
       toast('برای این روز قبلاً نوبت گرفته‌اید','err');return;}
     update('meeting_slots',SLOT_ID,{status:'booked',parent_id:S.user.id,
       student_id:Number(V('bk_kid'))||null,note:V('bk_note'),booked_at:todayISO()});
     insert('notifications',{user_id:slot.teacher_id,school_id:slot.school_id,type:'announcement',
       title:'📅 نوبت جلسه رزرو شد',
       body:S.user.full_name+' برای '+jalali(slot.date)+' ساعت '+slot.start_time+' نوبت گرفت.',
       link:'meetings',read:0,created_at:todayISO()});
     closeModal(); toast('نوبت شما رزرو شد','ok'); render();
   },
   'mtg-cancel'(){
     const s=byId('meeting_slots',id); if(!s)return;
     askConfirm('نوبت '+jalali(s.date)+' ساعت '+s.start_time+' لغو شود؟',()=>{
       if(s.parent_id)insert('notifications',{user_id:s.parent_id,school_id:s.school_id,
         type:'announcement',title:'❌ لغو نوبت جلسه',
         body:'نوبت '+jalali(s.date)+' ساعت '+s.start_time+' لغو شد.',link:'meetings',read:0,created_at:todayISO()});
       update('meeting_slots',id,{status:'open',parent_id:null,student_id:null,note:null});
       toast('نوبت لغو شد',''); render();
     },{title:'لغو نوبت',ok:'لغو کن',danger:true});
   },
   'mtg-del'(){
     askConfirm('این نوبت حذف شود؟',()=>{remove('meeting_slots',id);toast('حذف شد','');render();},
       {title:'حذف نوبت',ok:'حذف',danger:true});
   },
   // ---- چرخه تحصیلی ----
   'tr-box'(){S.filters.box=el.dataset.r;render();},
   'promote-run'(){
     const sid=S.user.school_id;
     const rows=db.classes.filter(c=>c.school_id===sid);
     askConfirm('ارتقای پایه پایان سال اجرا شود؟ دانش‌آموزان پایه ۱۲ فارغ‌التحصیل و بایگانی می‌شوند و پایه ۶ و ۹ «در انتظار انتقال» می‌گردند.',()=>{
       let promoted=0,graduated=0,leavers=0;
       /* عملیات انبوه: یک بار ذخیره در پایان به‌جای هزاران بار */
       batchWrites(()=>{
         rows.forEach(c=>{
           const g=c.grade_level||gradeFromName(c.name); if(!g)return;
           activeStudentsOfClass(c.id).forEach(st=>{
             if(g===12){graduateStudent(st,sid,c);graduated++;}
             else if(isTerminal(g)){update('users',st.id,{status:'awaiting_transfer',grade_level:g+1});leavers++;}
             else {update('users',st.id,{grade_level:g+1});promoted++;}
           });
         });
       });
       toast(fa(promoted)+' ارتقا · '+fa(graduated)+' فارغ‌التحصیل · '+fa(leavers)+' پایان مقطع','ok');
       render();
     },{title:'ارتقای پایه پایان سال',ok:'اجرا کن'});
   },
   'tr-new'(){
     const nid=el.dataset.r||'';
     const cls=db.classes.filter(c=>c.school_id===S.user.school_id);
     openModal(modalTpl('درخواست انتقال دانش‌آموز',
       f('کد ملی دانش‌آموز',inp('tq_nid',nid))
      +f('کلاس مقصد (اختیاری)',sel('tq_class',[['','— بدون کلاس —']].concat(cls.map(c=>[c.id,c.name])),''))
      +f('توضیح',inp('tq_note','')),'tr-send'));
   },
   'tr-send'(){
     const nid=V('tq_nid');
     if(!validNid(nid)){toast('کد ملی معتبر نیست','err');return;}
     const st=db.users.find(u=>u.role==='student'&&u.national_id===nid);
     if(!st){toast('دانش‌آموزی با این کد ملی یافت نشد','err');return;}
     if(st.school_id===S.user.school_id){toast('این دانش‌آموز در همین مدرسه است','err');return;}
     if(db.transfer_requests.some(r=>r.national_id===nid&&r.to_school_id===S.user.school_id&&r.status==='pending')){
       toast('درخواست قبلاً ارسال شده است','err');return;}
     insert('transfer_requests',{national_id:nid,student_id:st.id,from_school_id:st.school_id,
       to_school_id:S.user.school_id,class_id:Number(V('tq_class'))||null,requested_by:S.user.id,
       note:V('tq_note'),status:'pending',created_at:todayISO()});
     db.users.filter(u=>u.role==='manager'&&u.school_id===st.school_id).forEach(m=>
       insert('notifications',{user_id:m.id,school_id:st.school_id,type:'announcement',
         title:'📨 درخواست انتقال دانش‌آموز',
         body:'«'+(byId('schools',S.user.school_id)||{}).name+'» درخواست انتقال '+st.full_name+' را دارد.',
         link:'lifecycle',read:0,created_at:todayISO()}));
     closeModal(); toast('درخواست انتقال ارسال شد','ok'); render();
   },
   'tr-ok'(){
     const r=byId('transfer_requests',id); if(!r)return;
     const st=byId('users',r.student_id); if(!st){toast('دانش‌آموز یافت نشد','err');return;}
     askConfirm('انتقال «'+st.full_name+'» تأیید شود؟ کل پرونده تحصیلی و انضباطی همراه ایشان منتقل می‌شود.',()=>{
       const c=batchWrites(()=>moveStudent(st,r.to_school_id,r.class_id,r.note));
       update('transfer_requests',r.id,{status:'approved'});
       db.nid_conflicts.filter(x=>x.national_id===r.national_id&&x.school_id===r.to_school_id&&x.status==='open')
         .forEach(x=>update('nid_conflicts',x.id,{status:'resolved'}));
       toast('منتقل شد — '+fa(c.grades)+' نمره، '+fa(c.attendance)+' حضور، '+fa(c.discipline)+' انضباطی','ok');
       render();
     },{title:'تأیید انتقال',ok:'تأیید و انتقال'});
   },
   'tr-no'(){
     const r=byId('transfer_requests',id); if(!r)return;
     update('transfer_requests',r.id,{status:'rejected'});
     toast('درخواست رد شد','ok'); render();
   },
   'conf-dismiss'(){ update('nid_conflicts',id,{status:'dismissed'}); render(); },
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

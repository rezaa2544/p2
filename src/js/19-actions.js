/* ═══════════════════════════════════════════════════════════════════
   کنترلگر مرکزی رویدادها
   همهٔ دکمه‌ها اینجا مدیریت می‌شوند (واگذاری رویداد با data-act). گارد مجوز در ابتدای شنونده اعمال می‌شود.
   ═══════════════════════════════════════════════════════════════════ */
/** شناسهٔ نوبت انتخاب‌شده برای رزرو (بین باز شدن مودال و ثبت آن) */
var SLOT_ID=null;
/** شناسهٔ کاربری که رمزش بازنشانی می‌شود (بین مودال و تأیید) */
/** بستهٔ پشتیبانی که کاربر برای بازیابی انتخاب کرده است */
var RESTORE_PKG=null;
/** پایه و رشتهٔ کلاس موازی در حال ساخت */
var PARALLEL=null;
/* F-3: نگهبان مدرسهٔ غیرفعال — حتی حساب فعال هم نمی‌تواند وارد مدرسه‌ای
   شود که در سطح مدرسه غیرفعال شده است. پیام باید برای انسانی باشد که
   حسابش را می‌شناسد، نه پیام فنی. (برگردانده: null اگر راه باز است؛
   کاربران بدون مدرسه مثل سوپرادمین را در بر نمی‌گیرد) */
function schoolInactiveMsg(u){
  const sch=(u&&u.school_id)?byId('schools',u.school_id):null;
  return (sch&&!sch.active)?'این مدرسه غیرفعال است؛ برای پیگیری با پشتیبانی سامانه تماس بگیرید':null;
}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]'); if(!el)return;
  const a=el.dataset.act, rawId=el.dataset.id,
       id=(rawId!=null && /^\d+$/.test(rawId))?Number(rawId):rawId; /* شناسهٔ عددی می‌ماند عدد؛ شناسهٔ متنی (مثل دکمه‌های تعمیرِ دیاگ) دست‌نخورده می‌ماند */
  /* گارد مجوز اکشن: حتی اگر مهاجم دکمه را دستی بسازد، اکشن‌های تغییردهندهٔ
     داده برای نقش‌های غیرمجاز اجرا نمی‌شوند. */
  if(S.user && typeof canAction==='function' && !canAction(a)){
    if(typeof toast==='function') toast('شما اجازهٔ انجام این عملیات را ندارید','err');
    return;
  }
  const A={
   pick(){
     /* دمو: فرم با شماره + کد ملیِ همان حساب پر می‌شود و کد ارسال (شبیه‌سازی)
        و در فیلد می‌نشیند — کاربر با «استعلام و ورود» کاملش می‌کند. */
     const u=db.users.find(x=>x.username===el.dataset.u);
     if(!u){toast('حساب یافت نشد','err');return;}
     if(!u.phone||!u.national_id){toast('این حساب شماره/کد ملی برای ورود ندارد','err');return;}
     const code=SmsPanel.sendCode(u.phone);
     $('#lpn').value=u.phone; $('#lnid').value=u.national_id; $('#lcode').value=code;
     loginDemoHint(code);
   },
   /* ارسالِ کد — پنلِ پیامکی (در دمو: شبیه‌سازی + نمایشِ کد روی صفحه) */
   'login-code'(){
     const phone=normPhone(V('lpn'));
     if(!phone){loginErr('شمارهٔ همراه را وارد کنید');return;}
     const u=db.users.find(x=>phoneMatches(x.phone,phone));
     if(!u){loginErr('برای این شماره حسابی یافت نشد');return;}
     const code=SmsPanel.sendCode(u.phone);
     $('#lcode').value='';
     loginDemoHint(code);
     toast('کد ارسال شد (دمو: روی صفحه نمایش داده شد)','ok');
   },
   /* سیاست حریم خصوصی — برای همه (حتی پیش از ورود) در دسترس است (ملاک گوگل‌پلی) */
   'privacy-open'(){ openPrivacyPolicy(); },
   login(){
     /* 📄 PLAN_PHONE_AUTH — جریانِ نهاییِ ورود: بدونِ هیچ رمزی.
        شماره + کد (پنلِ پیامکی) + کد ملی (استعلام در سامانهٔ تطبیقِ
        کد ملی — سامانه‌ای جدا از پنلِ پیامکی). نسخهٔ واقعی: درگاهِ
        واقعی + استعلامِ سمتِ سرور (SERVER_SECURITY_CONTRACT بند ۵). */
     const phone=normPhone(V('lpn'));
     const u=phone?db.users.find(x=>phoneMatches(x.phone,phone)):null;
     if(!u){loginErr('برای این شماره حسابی یافت نشد');return;}
     if(!SmsPanel.checkCode(u.phone,V('lcode'))){loginErr('کد اشتباه است یا منقضی شده');return;}
     const nidIn=String(V('lnid')||'').trim();
     if(!IdmSystem.match(nidIn)){loginErr('احراز هویت ناقص است: کد ملی در سامانهٔ تطبیق ثبت نیست');return;}
     if(String(u.national_id)!==nidIn){loginErr('احراز هویت ناقص است: کد ملی با این شماره مطابقت ندارد');return;}
     if(!u.active){loginErr('حساب غیرفعال است');return;}
     const _smsg=schoolInactiveMsg(u);
     if(_smsg){loginErr(_smsg);return;}
     S.user=u;S.stack=[];S.persona=null;Store.remove(PERSONA_KEY);
     linkAsParent(u);
     S.showPicker=panelsOf(u).length>1;
     /* روت خانهٔ هر نقش — مشاور به صف ارجاع می‌رود نه داشبورد */
     S.route=(typeof homeRoute==='function'?homeRoute(u.role):(u.role==='edu_office'?'officedash':'dashboard'));Store.set(SESSION_KEY,u.username);if(typeof trackVisit==='function')trackVisit(u.id);toast('خوش آمدید، '+u.full_name,'ok');render();
   },
   logout(){S.user=null;S.boss=null;S.stack=[];S.persona=null;S.showPicker=false;
     Store.remove(SESSION_KEY);Store.remove(BOSS_KEY);Store.remove(PERSONA_KEY);render();},
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
         Store.set(BOSS_KEY,S.boss.username); Store.set(SESSION_KEY,mgr.username);
         toast('وارد پنل «'+sc.name+'» شدید','ok'); render();
       },{title:'ورود به پنل مدرسه',ok:'ورود به پنل',danger:false,note:false});
   },
   'stop-imp'(){
     const boss=S.boss||db.users.find(u=>u.username===Store.get(BOSS_KEY));
     if(!boss){toast('حساب سوپر ادمین یافت نشد','err');return;}
     S.user=boss; S.boss=null; S.stack=[]; S.route='schools'; S.page=1; S.filters={}; S.child=null;
     Store.remove(BOSS_KEY); Store.set(SESSION_KEY,boss.username);
     toast('به پنل سوپر ادمین بازگشتید','ok'); render();
   },
   'school-del'(){confirmModal('حذف مدرسه و تمام کاربران، کلاس‌ها و اطلاعات آن؟','school-del-ok',id);},
   'school-del-ok'(){const sid=window._delId;
     db.users.filter(u=>u.school_id===sid).forEach(u=>remove('users',u.id));
     db.classes.filter(c=>c.school_id===sid).forEach(c=>remove('classes',c.id));
     remove('schools',sid);closeModal();toast('مدرسه حذف شد','ok');render();},
   'school-save'(){const s=window._edit;
     if(needAll([['m_name','نام و کد مدرسه الزامی است'],['m_code','نام و کد مدرسه الزامی است']]))return;
     const pid=Number(V('m_prov'))||null, cid=Number(V('m_county'))||null, did=Number(V('m_district'))||null;
     if(needAll([['m_prov','استان'],['m_county','شهرستان']]))return;
     if(db.schools.some(x=>x.code===V('m_code')&&x.id!==s.id)){toast('کد مدرسه تکراری است','err');return;}
     if(V('m_level')==='متوسطه دوم'&&!$$('.m-branch:checked').length){
       toast('برای متوسطه دوم دست‌کم یک شاخه (نظری، فنی و حرفه‌ای یا کاردانش) انتخاب کنید','err');
       const bx=$('#m_branch_box'); if(bx){bx.scrollIntoView({block:'center',behavior:'smooth'});}
       return;}
     const dist=did?byId('districts',did):null;
     const data={name:V('m_name'),code:V('m_code'),
       province_id:pid,county_id:cid,district_id:did,
       city:(byId('counties',cid)||{}).name||'',
       area_kind:dist?(dist.kind||'district'):'district',
       phone:V('m_phone'),landline:V('m_landline'),
       level:V('m_level'),type:V('m_type')||'عادی',gender:V('m_gender'),shift:V('m_shift')||'صبح',
       capacity:Number(V('m_cap'))||300,
       active:Number(V('m_active')),address:V('m_addr'),
       /* دور ۶۵ بند روزهای کاری: روزهای روشن‌شده در مودال */
       work_days:$$('.m-wd:checked').map(x=>Number(x.value)).sort((a,b)=>a-b),
       /* شاخه و رشته فقط برای متوسطه دوم معنا دارد؛ در بقیهٔ مقاطع خالی می‌ماند */
       branches:V('m_level')==='متوسطه دوم'?$$('.m-branch:checked').map(x=>x.value):[],
       fields:V('m_level')==='متوسطه دوم'?$$('.m-field:checked').filter(x=>$$('.m-branch:checked').some(b=>b.value===x.dataset.branch)).map(x=>x.value):[],
       /* پروفایل قابلیت (بند ۰.۱): هر کلید جداگانه خوانده می‌شود */
       capabilities:(typeof CAP_DEFS!=='undefined')?Object.fromEntries(CAP_DEFS.map(k=>[k[0],$$('.m-cap[value="'+k[0]+'"]').some(c=>c.checked)?1:0])):(s.capabilities||null)};

     const mgName=V('mg_name'), mgUser=V('mg_user'), mgNid=V('mg_nid'), mgPhone=V('mg_phone');
     const existing=s.id?db.users.find(u=>u.school_id===s.id&&u.role==='manager'):null;
     if(!s.id&&needAll([['mg_name','نام مدیر'],['mg_user','نام کاربری مدیر']]))return;
     if(invalid('mg_nid',mgNid&&!validNid(mgNid),'کد ملی مدیر معتبر نیست'))return;
     if(mgNid&&nidOwner(mgNid,existing?existing.id:0)){toast('این کد ملی قبلاً برای فرد دیگری ثبت شده است','err');return;}
     if(mgUser&&db.users.some(u=>u.username===mgUser&&(!existing||u.id!==existing.id))){toast('نام کاربری مدیر تکراری است','err');return;}

     let sid=s.id;
     if(s.id)update('schools',s.id,data);
     else sid=insert('schools',Object.assign({created_at:todayISO(),organization_id:null},data)).id;

     if(existing){
       const patch={full_name:mgName||existing.full_name,national_id:mgNid||existing.national_id,phone:mgPhone||existing.phone};
       if(mgUser)patch.username=mgUser;
       update('users',existing.id,patch);
     } else if(mgName&&mgUser){
       insert('users',{school_id:sid,role:'manager',full_name:mgName,username:mgUser,password:'123456', /* ستونِ آرشیوی — محصول رمز ندارد */
         national_id:mgNid||makeNid(),phone:mgPhone||'',active:1,title:'مدیر مدرسه',created_at:todayISO()});
     }
     closeModal();toast(s.id?'تغییرات ذخیره شد':'مدرسه و حساب مدیر ثبت شد','ok');render();},
   // users
   'makeup-add'(){
     var d=V('m_mk_date');
     if(!d){toast('تاریخ را انتخاب کنید','err');return;}
     var sid=(S.user.role==='superadmin')?(Number(S.filters.bschool)||db.schools[0].id):S.user.school_id;
     if((db.makeup_classes||[]).some(m=>m.school_id===sid&&m.date===d)){toast('این تاریخ قبلاً روز جبرانی است','err');return;}
     insert('makeup_classes',{school_id:sid,date:d,note:V('m_mk_note')||''});
     toast('روز جبرانی افزوده شد','ok');render();
   },
   'makeup-del'(){
     /* id از محیّطِ کلِک‌لیسنر (بسته‌بندیِ A) می‌آید — مثلِ بقیهٔ اکشن‌ها */
     remove('makeup_classes',Number(id));render();
   },
   'assoc-add'(){
     var sid=S.user.school_id;
     if(!sid||(typeof hasCap==='function')&&hasCap(sid,'has_tuition')){toast('این صفحه فقط برای مدارس دولتی است','err');return;}
     var amt=Number(String(V('a-aamt')).replace(/[^0-9]/g,''));
     var who=V('a-asoc');
     if(!who){toast('نام واریزکننده / بابتِ هزینه را بنویسید','err');return;}
     if(!(amt>0)){toast('مبلغ معتبر نیست','err');return;}
     var kind=V('a-akind')==='expense'?'expense':'income';
     var note=V('a-anote');
     insert('transactions',{school_id:sid,kind:kind,category:'کمک مردمی',amount:amt,date:todayISO(),description:who+(note?(' — '+note):''),by:S.user.id});
     toast('تراکنش انجمن ثبت شد','ok');render();
   },
   'nudge-send'(){
     var clsId=Number(id);
     var slot=currentSlot(S.user.school_id);
     if(slot.kind!=='lesson'||!slot.no){toast('الان زنگ درسی نیست','err');return;}
     var schedDay=(slot.schedDay!=null)?slot.schedDay:slot.day;
     var row=(db.schedule||[]).find(r=>r.school_id===S.user.school_id&&r.day===schedDay&&Number(r.period)===Number(slot.no)&&r.class_id===clsId);
     if(!row){toast('برنامهٔ این کلاس در این زنگ نیست','err');return;}
     var r=nudgeTeacher({schoolId:S.user.school_id,classId:clsId,teacherId:row.teacher_id,period:slot.no,dateISO:todayISO(),by:S.user.id});
     toast(r.msg,r.ok?'ok':'err');render();
   },
   'nudge-reply'(){
     var nu=byId('nudges',Number(id));
     if(!nu)return;
     var r=nudgeReply(Number(id), el&&el.dataset.r?el.dataset.r:'later');
     if(r.ok){
       /* میان‌برِ دبیر (تصمیم کاربر): «حالا ثبت می‌کنم» = پیش‌گزینشِ همان کلاس */
       if(el&&el.dataset.r==='ok-now'){S.filters.class=nu.class_id;S.filters.date=nu.date;}
     }
     toast(r.msg,r.ok?'ok':'err');render();
   },
   'user-new'(){userModal(null);},
   'user-edit'(){userModal(byId('users',id));},
   'user-toggle'(){const u=byId('users',id);update('users',id,{active:u.active?0:1});render();},
   'user-del'(){confirmModal('حذف این کاربر؟ این عملیات قابل بازگشت نیست.','user-del-ok',id);},
   'user-del-ok'(){remove('users',window._delId);closeModal();toast('کاربر حذف شد','ok');render();},
   'user-save'(){const x=window._edit;
     if(need('u_name','نام و نام خانوادگی الزامی است'))return;
     if(!x.id&&need('u_user','نام کاربری الزامی است'))return;
     const schoolId=$('#u_school')?Number(V('u_school')):(x.school_id||S.user.school_id);
     /* کد ملی اختیاری است، ولی اگر وارد شد باید معتبر باشد */
     if(invalid('u_nid',V('u_nid')&&!validNid(V('u_nid')),'کد ملی معتبر نیست'))return;
     if(invalid('u_phone',V('u_phone')&&!/^09\d{9}$/.test(V('u_phone')),'شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد'))return;
     const data={full_name:V('u_name'),role:V('u_role'),national_id:V('u_nid'),phone:V('u_phone'),active:Number(V('u_active')),school_id:schoolId};
     let uid=x.id;
     if(uid)update('users',uid,data);
     else{ if(db.users.some(u=>u.username===V('u_user'))){toast('نام کاربری تکراری است','err');return;}
       uid=insert('users',Object.assign({username:V('u_user'),password:'123456',created_at:todayISO()},data)).id; } /* ستونِ آرشیوی */
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
     if(need('c_name','نام کلاس الزامی است'))return;
     /* نوع چیدمان: انتخاب مدیر، وگرنه حدس از روی پایه */
     const _md=V('c_mode')||'';
     const _gl=(typeof gradeFromName==='function')?gradeFromName(V('c_grade')||V('c_name')):null;
     const _mode=_md||(_gl&&Number(_gl)>=10?'field':_gl?'class':'');
     /* در کلاس‌محور رشته معنا ندارد؛ در رشته‌محور الزامی است */
     if(invalid('c_field',_mode==='field'&&!V('c_field'),'در کلاس رشته‌محور، انتخاب رشته الزامی است'))return;
     const data={name:V('c_name'),grade:V('c_grade'),field:_mode==='class'?null:(V('c_field')||null),class_mode:_mode||null,grade_level:_gl||null,room:V('c_room'),capacity:Number(V('c_cap'))||30,homeroom_teacher_id:V('c_ht')?Number(V('c_ht')):null};
     if($('#c_school'))data.school_id=Number(V('c_school'));else data.school_id=c.school_id;
     /* رشتهٔ کلاس باید جزو شاخه‌های همان مدرسه باشد. رشتهٔ قبلی خودِ
        کلاس استثناست تا ویرایش کلاس‌های قدیمی مسدود نشود. */
     if(data.field&&typeof schoolFields==='function'){
       const mine=schoolFields(data.school_id)||[];
       if(mine.length&&mine.indexOf(data.field)<0&&data.field!==c.field){
         toast('رشتهٔ «'+data.field+'» جزو شاخه‌های این مدرسه نیست','err');return;}
     }
     if(c.id)update('classes',c.id,data);else insert('classes',data);
     closeModal();toast('ذخیره شد','ok');render();},
   /* ── زمان‌بندی زنگ‌ها (نسخهٔ ۲ — به تفکیک روز، دور ۶۳) ──
      مدیر ساعت شروع هر روز و ساعت پایان هر بازه را خودش تعیین
      می‌کند؛ زنجیرهٔ بازه‌ها خودکار جابه‌جا می‌شود. */
   'bell-edit'(){
     if(['manager','superadmin'].indexOf(S.user.role)<0){toast('دسترسی ندارید','err');return;}
     var sid=S.user.role==='superadmin'?(Number(S.filters.bschool)||db.schools[0].id):S.user.school_id;
     bellModal(sid);
   },
   'bell-add'(){
     var ed=window._edit; if(!ed||!ed.days)return;
     var day=Number(e.target.dataset.day);
     var kind=e.target.dataset.kind==='break'?'break':'lesson';
     ed.days[day].slots.push({kind:kind,min:kind==='break'?10:45});
     bellRenderDay(day);
   },
   'bell-del'(){
     var ed=window._edit; if(!ed||!ed.days)return;
     var day=Number(e.target.dataset.day);
     var i=Number(e.target.dataset.i);
     if(!Number.isFinite(i))return;
     if(ed.days[day].slots.length<=1){toast('دست‌کم یک زنگ لازم است','err');return;}
     ed.days[day].slots.splice(i,1);
     bellRenderDay(day);
   },
   /* کپی ساعت روز قبل — روز شنبه «روز قبل» ندارد */
   'bell-copy-prev'(){
     var ed=window._edit; if(!ed||!ed.days)return;
     var day=Number(e.target.dataset.day);
     if(day<1)return;
     ed.days[day]={start:ed.days[day-1].start,
       slots:ed.days[day-1].slots.map(function(x){return {kind:x.kind,min:Number(x.min)||0};})};
     bellRenderDay(day);
     toast('ساعت '+DAYS[day-1]+' روی '+DAYS[day]+' کپی شد','ok');
   },
   'bell-save'(){
     var ed=window._edit;
     if(!ed||!ed.days){toast('فرم زمان‌بندی آماده نیست','err');return;}
     var r=bellSaveDays(ed.school_id,ed.days);
     toast(r.msg,r.ok?'ok':'err');
     if(r.ok){closeModal();render();}
   },
   /* ── دیاگ سامانه ─────────────────────────────────────────────
      عیب‌یابی و تعمیر خودکار. همهٔ کنش‌ها ویژهٔ سوپرادمین‌اند و
      canAction آن را می‌سنجد. */
   'diag-run'(){
     if(S.user.role!=='superadmin'){toast('دسترسی ندارید','err');return;}
     /* data-cat روی دکمه: فقط همان خانواده اجرا شود */
     var cat=e.target.dataset.cat||'';
     var t=Date.now();
     try{ S.diag=runDiagnostics(cat||null); }
     catch(err){ toast('اجرای دیاگ ناموفق: '+err.message,'err'); return; }
     var sm=S.diag.summary;
     var what=cat?(DIAG_CATS[cat]?DIAG_CATS[cat].fa:cat):'بررسی کامل';
     toast(what+': نمرهٔ سلامت '+fa(sm.health)+' از ۱۰۰ ('+fa(Date.now()-t)+' میلی‌ثانیه)',
       sm.critical?'err':'ok');
     render();
   },
   'diag-fix'(){
     if(S.user.role!=='superadmin'){toast('دسترسی ندارید','err');return;}
     var r=diagFix(id);
     if(r&&r.then){
       r.then(function(x){ toast(x.short||x.msg, x.ok?'ok':'err'); S.diag=runDiagnostics(); render(); });
       return;
     }
     toast(r.msg, r.ok?'ok':'err');
     S.diag=runDiagnostics();
     render();
   },
   'diag-fixall'(){
     if(S.user.role!=='superadmin'){toast('دسترسی ندارید','err');return;}
     var r=diagFixAll();
     if(r&&r.then){
       r.then(function(res){
         if(!res.done.length && !res.failed.length) toast('چیزی برای تعمیر خودکار نبود','ok');
         else toast(fa(res.done.length)+' عیب برطرف شد'
           +(res.failed.length?' · '+fa(res.failed.length)+' ناموفق':''), res.failed.length?'err':'ok');
         S.diag=runDiagnostics();
         render();
       });
       return;
     }
     if(!r.done.length && !r.failed.length) toast('چیزی برای تعمیر خودکار نبود','ok');
     else toast(fa(r.done.length)+' عیب برطرف شد'
       +(r.failed.length?' · '+fa(r.failed.length)+' ناموفق':''), r.failed.length?'err':'ok');
     S.diag=runDiagnostics();
     render();
   },
   'diag-rollback'(){
     if(S.user.role!=='superadmin'){toast('دسترسی ندارید','err');return;}
     var r=diagRollback(Number(e.target.dataset.i));
     toast(r.msg, r.ok?'ok':'err');
     S.diag=runDiagnostics();
     render();
   },
   'diag-nav-restore'(){
     if(S.user.role!=='superadmin'){toast('دسترسی ندارید','err');return;}
     navRestoreAll();
     toast('گزینه‌های پنهان به منو برگشتند','ok');
     render();
   },
   'diag-clear-repairs'(){
     if(S.user.role!=='superadmin'){toast('دسترسی ندارید','err');return;}
     DIAG_REPAIRS.length=0;
     try{Store.setJSON('sms_diag_repairs_v1',[]);}catch(err){}
     toast('تاریخچهٔ تعمیرات پاک شد','ok');
     render();
   },
   'diag-probe'(){
     if(S.user.role!=='superadmin'){toast('دسترسی ندارید','err');return;}
     var p=diagProbeHealth();
     p.then(function(x){
       toast(x.msg, x.ok?'ok':'err');
       S.diag=runDiagnostics();
       render();
     });
   },
   'health-gauge-style'(){
     var s=el.dataset.s;
     if(s!=='needle'&&s!=='dial'&&s!=='bar')return;
     Store.set('payesh_health_gauge_v1', s);
     render();
   },
   'diag-auto'(){
     if(S.user.role!=='superadmin'){toast('دسترسی ندارید','err');return;}
     if(DIAG_AUTO.on){ diagAutoStop(); toast('پایش خودکار خاموش شد','ok'); }
     else { diagAutoStart(); toast('پایش خودکار روشن شد — هر ۵ دقیقه بررسی می‌شود','ok'); }
     render();
   },
   // subjects
   'subject-new'(){subjectModal(null);},
   'subject-edit'(){subjectModal(byId('subjects',id));},
   'subject-del'(){confirmModal('حذف این درس؟','subject-del-ok',id);},
   'subject-del-ok'(){remove('subjects',window._delId);closeModal();toast('درس حذف شد','ok');render();},
   'subject-save'(){const s=window._edit;
     if(need('s_name','نام درس الزامی است'))return;
     const grade=V('s_grade')||'';
     const lv=levelOfGrade(grade);
     const field=needsField(lv)?(V('s_field')||''):'';
     /* شناسهٔ درست فیلد رشته در فرم درس، s_field است نه c_field؛
        پیش‌تر کادر قرمز روی فیلدی می‌رفت که در این فرم وجود ندارد. */
     if(invalid('s_field',needsField(lv)&&!field,'برای پایه‌های متوسطه دوم، انتخاب رشته الزامی است'))return;
     const sid_=$('#s_school')?Number(V('s_school')):s.school_id;
     /* رشته باید جزو شاخه‌های اعلام‌شدهٔ همان مدرسه باشد */
     if(field&&typeof schoolFields==='function'){
       const mine=schoolFields(sid_)||[];
       if(mine.length&&mine.indexOf(field)<0){
         toast('رشتهٔ «'+field+'» جزو شاخه‌های این مدرسه نیست','err');return;}
     }
     const data={name:V('s_name'),code:V('s_code'),weekly_hours:Number(V('s_h'))||2,grade,field,
       school_id:sid_};
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
         ${f('شاخه *',sel('im_branch',[['','— انتخاب شاخه —'],...schoolBranches(S.user.school_id).map(b=>[b,b])]))}
         ${f('رشته *',sel('im_field',[['','— ابتدا شاخه را انتخاب کنید —']]))}
       </div></div>
       ${isSuper?`<div class="grid g2">${f('مدرسه',sel('im_school',db.schools.map(x=>[x.id,x.name])))}</div>`:''}
       <div id="im_preview" class="small muted" style="margin-top:8px"></div>`,
      'subject-import-save'));
   },
   'subject-import-save'(){
     const grade=V('im_grade'), lv=V('im_level');
     if(needAll([['s_level','مقطع'],['s_grade','پایه']]))return;
     const field=needsField(lv)?V('im_field'):'';
     if(invalid('s_field',needsField(lv)&&!field,'شاخه و رشته را انتخاب کنید'))return;
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
   // ---- حضور و غیاب ----
   /* ⚠️ تغییر رفتار دور ۴۲: تیک دیگر بی‌درنگ ذخیره نمی‌شود؛ به
      پیش‌نویس می‌رود. ثبت واقعی فقط با att-commit انجام می‌شود.
      دلیل: غیبت به خانواده پیامک می‌شود و تیک اشتباه هزینه دارد. */
   /* ─────────────── مهمان‌ها (بند ۷) ─────────────── */
   'vis-new'(){
     openModal(modalTpl('ثبت مهمان',
       f('نام *', inp('vis_name',''))
       + f('هدف مراجعه', inp('vis_purpose','')),
       'vis-save'));
   },
   'vis-save'(){
     const r = visitorRegister(V('vis_name'), V('vis_purpose'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('مهمان ثبت شد — ساعت ورود: ' + faD(new Date().toTimeString().slice(0,5)),'ok');
     render();
   },
   'vis-out'(){
     const r = visitorCheckout(Number(id));
     if(!r.ok){ toast(r.msg,'err'); return; }
     toast('خروج ثبت شد','ok');
     render();
   },
   /* ─────────────── کتابخانه (بند ۸) ─────────────── */
   'lib-new'(){
     openModal(modalTpl('کتاب جدید',
       f('عنوان *', inp('lib_title',''))
       + f('نویسنده', inp('lib_author',''))
       + f('کد/رگال (اختیاری)', inp('lib_code','')),
       'lib-save'));
   },
   'lib-save'(){
     const r = libAddBook(V('lib_title'), V('lib_author'), V('lib_code'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('کتاب ثبت شد','ok');
     render();
   },
   'lib-del'(){
     askConfirm('این کتاب و سابقهٔ امانت‌هایش حذف شود؟', function(){
       const r = libDelBook(Number(id));
       if(!r.ok){ toast(r.msg,'err'); return; }
       toast('کتاب حذف شد','ok'); render();
     }, {title:'حذف کتاب', ok:'حذف', danger:true});
   },
   'lib-lend'(){
     const b = byId('lib_books', Number(id));
     if(!b) return;
     const u = S.user;
     const studs = db.users.filter(function(x){
       return x.role==='student' && x.school_id===u.school_id && x.active!==0;
     }).sort(function(a,x){ return (a.full_name||'').localeCompare(x.full_name||'', 'fa'); });
     if(!studs.length){ toast('دانش‌آموزی برای امانت نیست','err'); return; }
     const defaultDue = new Date(Date.now() + LIB_DEFAULT_DAYS*86400000).toISOString().slice(0,10);
     window._libLendBook = b.id;
     openModal(modalTpl('امانت — ' + b.title,
       f('دانش‌آموز *', sel('lib_stu', studs.map(function(s){return [s.id, s.full_name];}), ''))
       + f('مهلت بازگشت (پیش‌فرض ' + fa(LIB_DEFAULT_DAYS) + ' روز)', inp('lib_due', defaultDue, 'date')),
       'lib-lend-save'));
   },
   'lib-lend-save'(){
     const sid = Number(V('lib_stu'));
     const due = V('lib_due');
     if(!sid){ toast('دانش‌آموز را انتخاب کنید','err'); return; }
     const r = libLend(window._libLendBook, sid, due);
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal();
     const stu = byId('users', sid) || {};
     toast('امانت به «' + (stu.full_name||'؟') + '» ثبت شد','ok');
     render();
   },
   'lib-return'(){
     const r = libReturn(Number(id));
     if(!r.ok){ toast(r.msg,'err'); return; }
     toast('بازگشت ثبت شد','ok');
     render();
   },
   'as-new'(){
     openModal(modalTpl('تجهیز جدید',
       f('نام *', inp('as_name',''))
       + f('دسته', inp('as_category',''))
       + f('مکان', inp('as_location',''))
       + f('وضعیت', sel('as_status',[['available','در دسترس'],['in_use','در حال استفاده'],['repair','در تعمیرات']],'available')),
       'as-save'));
   },
   'as-save'(){
     const r = assetAdd(V('as_name'), V('as_category'), V('as_location'), V('as_status'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('تجهیز ثبت شد','ok');
     render();
   },
   'as-status'(){
     const a = byId('assets', Number(id));
     if(!a) return;
     window._asEditId = a.id;
     openModal(modalTpl('وضعیت — ' + a.name,
       f('وضعیت', sel('as_status',[['available','در دسترس'],['in_use','در حال استفاده'],['repair','در تعمیرات']], a.status))
       + f('مکان', inp('as_location', a.location||'')),
       'as-status-save'));
   },
   'as-status-save'(){
     const r = assetSetStatus(window._asEditId, V('as_status'), V('as_location'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('وضعیت به‌روز شد','ok');
     render();
   },
   'as-del'(){
     askConfirm('این تجهیز حذف شود؟', function(){
       const r = assetDel(Number(id));
       if(!r.ok){ toast(r.msg,'err'); return; }
       toast('تجهیز حذف شد','ok'); render();
     }, {title:'حذف تجهیز', ok:'حذف', danger:true});
   },
   'sd-new'(){
     const u = S.user;
     const studs = db.users.filter(function(x){
       return x.role==='student' && x.school_id===u.school_id && x.active!==0;
     }).sort(function(a,x){ return (a.full_name||'').localeCompare(x.full_name||'', 'fa'); });
     if(!studs.length){ toast('دانش‌آموزی نیست','err'); return; }
     const subs = db.subjects.filter(function(x){ return x.school_id===u.school_id; })
       .sort(function(a,x){ return (a.name||'').localeCompare(x.name||'', 'fa'); });
     if(!subs.length){ toast('درسی تعریف نشده','err'); return; }
     openModal(modalTpl('نمرهٔ سیدا',
       f('دانش‌آموز *', sel('sd_stu', studs.map(function(x){return [x.id, x.full_name];}), ''))
       + f('درس *', sel('sd_sub', subs.map(function(x){return [x.id, x.name];}), ''))
       + f('نوبت *', sel('sd_term', TERMS.map(function(t){return [t, t];}), TERMS[0]))
       + f('نمرهٔ سیدا (از ۲۰) *', inp('sd_score','','number'))
       + f('یادداشت (اختیاری)', inp('sd_note','')),
       'sd-save'));
   },
   'sd-save'(){
     const r = sedasUpsert(Number(V('sd_stu')), Number(V('sd_sub')), V('sd_term'), V('sd_score'), V('sd_note'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal();
     const st = byId('users', Number(V('sd_stu'))) || {};
     toast('نمرهٔ سیدا برای «' + (st.full_name||'؟') + '» ثبت شد' + (r.updated?' (به‌روزرسانی)':''), 'ok');
     render();
   },
   'sd-del'(){
     askConfirm('این ردیفِ سیدا حذف شود؟', function(){
       const r = sedasDel(Number(id));
       if(!r.ok){ toast(r.msg,'err'); return; }
       toast('ردیف حذف شد','ok'); render();
     }, {title:'حذف ردیف سیدا', ok:'حذف', danger:true});
   },
   'att-set'(){const st=el.dataset.s;const date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     attDraftSet(cid,date,id,st);
     render();},
   'att-all'(){const st=el.dataset.s,date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     attDraftSetAll(cid,date,studentsOfClass(cid).map(s=>s.id),st);
     toast('همه «'+ATT_FA[st]+'» علامت خوردند — برای ذخیره «مرور و ثبت نهایی» را بزنید','ok');
     render();},
   /* خروج از پیش‌گزینش زنگ (گام ۳): انتخاب دستیِ صریح، پس
      پیش‌گزینش تا اتمام انتخاب دیگر اعمال نمی‌شود */
   'att-reset-class'(){const cls=visibleClasses();S.filters.class=cls.length?cls[0].id:null;render();},
   'grade-reset-auto'(){const cls=visibleClasses();S.filters.class=cls.length?cls[0].id:null;S.filters.subject='';render();},
   /* گام ۹: نمایش سابقهٔ تغییرات یک رکورد حضور و غیاب */
   'att-hist'(){
     const h=(typeof attHistoryCard==='function')?attHistoryCard(id):'';
     const r=byId('attendance',id);
     const st=r?byId('users',r.student_id):null;
     openModal(modalTpl('سابقهٔ تغییرات — '+esc(st?st.full_name:'')+' · '+(r?jalali(r.date):''),
       h||'<div class="small muted">تغییری برای این رکورد ثبت نشده است.</div>',null));
   },
   /* انتخاب درس در نمودار روند (دور ۴۳) */
   'trend-sub'(){ S.trendSub=Number(el.dataset.id)||0; render(); },
   /* ---- یادداشت خصوصی دبیر (دور ۴۴) ---- */
   'tnote-new'(){
     window._tnStudent=id;
     const st=byId('users',id);
     openModal(modalTpl('یادداشت خصوصی — '+esc(st?st.full_name:''),
       '<div class="tn-warn small" style="margin-bottom:10px">⚠️ '+esc(NOTE_LEGAL_WARN)+'</div>'
       +f('متن یادداشت','<textarea class="input" id="tn_body" rows="4" placeholder="مشاهدهٔ آموزشی یا رفتاری…"></textarea>'),
       'tnote-save'));
   },
   'tnote-save'(){
     const txt=(V('tn_body')||'').trim();
     if(invalid('tn_body',txt.length<3,'متن یادداشت باید دست‌کم سه نویسه باشد'))return;
     const r=addTeacherNote(window._tnStudent,txt);
     closeModal();
     toast(r?'یادداشت ثبت شد':'اجازهٔ ثبت یادداشت برای این دانش‌آموز را ندارید',r?'ok':'err');
     render();
   },
   'tnote-del'(){
     askDelete('این یادداشت حذف شود؟',()=>{
       const ok=removeTeacherNote(id);
       toast(ok?'یادداشت حذف شد':'فقط نویسندهٔ یادداشت می‌تواند حذفش کند',ok?'ok':'err');
       render();
     });
   },
   'att-tip-ok'(){
     const seen=Store.getJSON(ATT_TIP_KEY,{})||{};
     seen[(S.user&&S.user.id)||0]=1;
     Store.setJSON(ATT_TIP_KEY,seen);
     render();},
   'att-discard'(){
     const date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     askConfirm('تغییرات ثبت‌نشدهٔ این کلاس دور ریخته شود؟',()=>{
       attDraftClear(cid,date);toast('پیش‌نویس پاک شد','ok');render();
     },{title:'دور ریختن پیش‌نویس',ok:'دور بریز'});},
   /* صفحهٔ مرور نهایی: خلاصهٔ تغییرات پیش از نوشتن در پایگاه داده */
   'att-review'(){
     const date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     const d=attDraftDiff(cid,date);
     if(!d.changes.length){toast('تغییری برای ثبت وجود ندارد','err');return;}
     const nameList=a=>a.map(x=>esc(x)).join(' · ');
     const line=(icon,label,arr,tone)=>arr.length
       ? '<div class="rev-line"><span class="badge '+tone+'">'+icon+' '+label
         +' '+fa(arr.length)+'</span><div class="small">'+nameList(arr)+'</div></div>' : '';
     const cnt=d.counts||{};
     const other=(cnt.present||0)+(cnt.excused||0);
     /* پیامک فقط برای غیبت و تأخیرِ تازه ساخته می‌شود */
     const cfg=(typeof notifySettings==='function')?notifySettings(S.user.school_id):{enabled:false,kinds:{}};
     let smsN=0;
     if(cfg.enabled){
       if(cfg.kinds.absence)smsN+=d.newAbsent.length;
       if(cfg.kinds.late)smsN+=d.newLate.length;
     }
     const smsNote=smsN
       ? '<div class="rev-sms">📨 برای '+fa(smsN)+' مورد پیامک ساخته می‌شود'
         +(cfg.autoSend?' و <b>مستقیم ارسال می‌گردد</b>.':' و به صف تأیید مدیر می‌رود.')
         +'<div class="small muted">تا '+fa(cfg.graceMinutes||20)
         +' دقیقه فرصت دارید خودتان اصلاح کنید؛ در این مدت پیام لغو می‌شود.</div></div>'
       : '<div class="small muted">برای این تغییرات پیامکی ساخته نمی‌شود.</div>';
     openModal(modalTpl('مرور نهایی — '+esc(byId('classes',cid).name)+' · '+jalali(date),
       line('❌','غایب',d.newAbsent,'b-red')
       +line('⏰','تأخیر',d.newLate,'b-amber')
       +(other?'<div class="rev-line"><span class="badge b-green">✅ حاضر / موجه '+fa(other)+'</span></div>':'')
       +'<div class="rev-total small muted">مجموع '+fa(d.changes.length)+' تغییر ثبت می‌شود.</div>'
       +smsNote,
       'att-commit',false,'تأیید و ثبت'));},
   /* نوشتن واقعی در پایگاه داده */
   'att-commit'(){
     const date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     const d=attDraftDiff(cid,date);
     if(!d.changes.length){closeModal();return;}
     const school=byId('classes',cid).school_id;
     /* بند ۱۶: روزِ غیرحضوری، ثبتِ حضوری مسدود است (حضور فقط از کلاس مجازی) */
     if(typeof schoolVirtual==='function' && schoolVirtual(school, date)){
       closeModal();
       if(typeof toast==='function') toast('در روز غیرحضوری، ثبتِ حضوری مسدود است — حضور از «کلاس مجازی» ثبت می‌شود','err');
       return;
     }
     const made=[];
     batchWrites(()=>{
       d.changes.forEach(c=>{
         let recId=c.rec_id;
         if(recId){update('attendance',recId,{status:c.to,class_id:cid});
           /* ⚠️ اصلاح درون پنجرهٔ مهلت: پیام معلقِ همین رکورد که
              خود این دبیر ساخته بود، خاموش لغو می‌شود. اگر پیام
              رفته باشد، گام ۵ (اصلاحیه) کارش را می‌کند. */
           if(typeof notifyCancelIfFresh==='function'){
             /* 🔴 مدیر پس از پنجرهٔ مهلت هم می‌تواند لغو کند (دور ۴۳)،
                ولی رکورد نشان by_manager می‌گیرد تا ردپا بماند. */
             const role=(typeof activePersona==='function')?activePersona():S.user.role;
             const opt=(role==='manager'||role==='superadmin')?{byManager:true}:undefined;
             notifyCancelIfFresh('absence',recId,null,opt);
             notifyCancelIfFresh('late',recId,null,opt);
           }}
         else recId=insert('attendance',{school_id:school,class_id:cid,
           student_id:c.student_id,date,status:c.to,note:null}).id;
         made.push({c,recId});
       });
     });
     /* پیامک پس از نوشتن ساخته می‌شود تا source_ref شناسهٔ واقعی باشد */
     let sms=0,fix=0;
     if(typeof notifyRequest==='function'){
       made.forEach(({c,recId})=>{
         if(c.to!=='absent'&&c.to!=='late')return;
         /* ⚠️ اگر پیامی برای همین رکورد قبلاً ارسال شده، ساخت پیام
            تازه یعنی خانواده دو بار خبر یکسان می‌گیرد. آنجا کار
            اصلاحیه است نه پیام نو. */
         const already=(typeof notifyLastSent==='function')&&
           (notifyLastSent('absence',recId)||notifyLastSent('late',recId));
         if(already)return;
         const q=notifyRequest({school_id:school,kind:c.to==='absent'?'absence':'late',
           student_id:c.student_id,class_id:cid,student_name:c.name,
           date_fa:jalali(date),source_ref:recId});
         if(q)sms++;
       });
       /* خلاصهٔ روزانه (بند ۱.۷): برای هر دانش‌آموزی که وضعیتش در
          همین ثبت قطعی شد، اگر امروز هنوز خلاصه‌ای ساخته نشده،
          یک‌بار ساخته می‌شود (حذف تکراری در notifyDailySummary). */
       if(typeof notifyDailySummary==='function'){
         var _dailySeen=Object.create(null);
         made.forEach(function(m){
           if(_dailySeen[m.c.student_id])return;
           _dailySeen[m.c.student_id]=true;
           if(notifyDailySummary(m.c.student_id,date))sms++;
         });
       }
       /* اصلاحیه: برای رکوردهایی که پیامشان رفته و وضعیت عوض شده.
          پس از لغو درون پنجره اجرا می‌شود تا پیام‌های لغوشده
          دوباره اصلاحیه نگیرند. */
       if(typeof notifyReconcileMany==='function'){
         const r=notifyReconcileMany(made.map(m=>m.recId));
         fix=r.created;
       }
     }
     attDraftClear(cid,date);
     closeModal();
     toast(fa(d.changes.length)+' تغییر ثبت شد'
       +(sms?' — '+fa(sms)+' پیامک ساخته شد':'')
       +(fix?' — '+fa(fix)+' اصلاحیه ساخته شد':''),'ok');
     render();},
   // ---- پلان فروش و پشتیبان‌گیری ----
   'plan-settings'(){
     const st=subSettings();
     openModal(modalTpl('تنظیمات پلان و قیمت‌گذاری',
       '<div class="grid g2">'
       +f('قیمت ماهانه (ریال)',inp('pl_m',st.price_monthly||0,'number'))
       +f('قیمت فصلی (ریال)',inp('pl_s',st.price_seasonal||0,'number'))
       +f('قیمت سالانه (ریال)',inp('pl_y',st.price_yearly||0,'number'))
       +f('سهم مدرسه (درصد)',inp('pl_share',st.school_share_percent||20,'number'))
       +f('دورهٔ آزمایشی (روز)',inp('pl_trial',st.trial_days||0,'number'))
       +f('دیوار پرداخت',sel('pl_wall',[['1','فعال'],['0','غیرفعال']],String(st.paywall_enabled?1:0)))
       +'</div>'
       +'<div class="small muted" style="line-height:2;margin-top:8px">'
       +'تغییر قیمت روی اشتراک‌های فعال اثر ندارد؛ فقط خریدهای تازه.</div>','plan-save'));
   },
   'plan-save'(){
     const patch={
       price_monthly:Number(V('pl_m'))||0,
       price_seasonal:Number(V('pl_s'))||0,
       price_yearly:Number(V('pl_y'))||0,
       school_share_percent:Number(V('pl_share'))||0,
       trial_days:Number(V('pl_trial'))||0,
       trial_enabled:Number(V('pl_trial'))>0?1:0,
       paywall_enabled:Number(V('pl_wall'))?1:0
     };
     const errs=validatePlanSettings(patch);
     if(errs.length){toast(errs[0],'err');return;}
     saveSubSettings(patch);
     closeModal(); toast('تنظیمات پلان ذخیره شد','ok'); render();
   },
   'backup-make'(){
     try{
       const pkg=buildBackup();
       const blob=new Blob([JSON.stringify(pkg)],{type:'application/json'});
       const a=document.createElement('a');
       a.href=URL.createObjectURL(blob);
       a.download='payesh-backup-'+todayISO()+'.json';
       document.body.appendChild(a); a.click(); a.remove();
       setTimeout(()=>URL.revokeObjectURL(a.href),1000);
       toast(fa(pkg.counts.ops)+' عملیات پشتیبان‌گیری شد','ok');
     }catch(e){ toast('دریافت پشتیبان ممکن نشد','err'); }
   },
   'restore-pick'(){
     openModal(modalTpl('بازیابی از نسخهٔ پشتیبان',
       '<div class="small" style="line-height:2;color:var(--red)">'
       +'⚠️ بازیابی همهٔ تغییرات فعلی را با محتوای فایل جایگزین می‌کند.'
       +' پیش از ادامه یک پشتیبان تازه بگیرید.</div>'
       +'<div style="margin-top:12px;border:2px dashed var(--border);border-radius:12px;padding:20px;text-align:center">'
       +'<input type="file" id="rs_file" accept=".json" /></div>'
       +'<div id="rs_info" class="small muted" style="margin-top:10px;line-height:2"></div>',''));
   },
   'restore-ok'(){
     if(!RESTORE_PKG){toast('ابتدا فایل را انتخاب کنید','err');return;}
     const res=restoreBackup(RESTORE_PKG);
     if(!res.ok){toast(res.error||'بازیابی ناموفق','err');return;}
     RESTORE_PKG=null;
     closeModal(); toast(fa(res.ops)+' عملیات بازیابی شد','ok');
     S.route='dashboard'; render();
   },
   // ---- ابزارهای تکمیلی: خروجی و اطلاعیه سراسری ----
   'export-csv'(){
     const d=exportData(el.dataset.r||S.route);
     if(!d.rows.length){toast('داده‌ای برای خروجی نیست','err');return;}
     const okDl=downloadCSV('payesh-'+d.name+'-'+todayISO()+'.csv',d.headers,d.rows);
     toast(okDl?fa(d.rows.length)+' ردیف خروجی گرفته شد':'دریافت خروجی ممکن نشد',okDl?'ok':'err');
   },
   'ann-broadcast'(){
     openModal(modalTpl('اطلاعیه سراسری',
       f('عنوان',inp('bc_title',''))
       +f('متن','<textarea class="input" id="bc_body" rows="4" placeholder="متن اطلاعیه برای همه مدارس"></textarea>')
       +f('دامنه',sel('bc_scope',[['all','همه کشور (یک اطلاعیه سراسری)'],
                                   ['each','برای هر مدرسه جداگانه']]))
       +'<div class="small muted" style="line-height:2;margin-top:8px">'
       +'حالت «سراسری» یک اطلاعیه می‌سازد که همه می‌بینند. حالت «هر مدرسه» '
       +'برای هر مدرسه نسخه‌ای جدا می‌سازد تا مدیرش بتواند ویرایشش کند.</div>',
       'ann-broadcast-ok'));
   },
   'ann-broadcast-ok'(){
     const t=(V('bc_title')||'').trim(), b=(V('bc_body')||'').trim();
     if(invalid('bc_title',t.length<3,'عنوان باید دست‌کم سه نویسه باشد'))return;
     if(invalid('bc_body',b.length<5,'متن اطلاعیه باید دست‌کم پنج نویسه باشد'))return;
     const n=broadcastAnnouncement(t,b,V('bc_scope')||'all');
     closeModal(); toast(fa(n)+' اطلاعیه ثبت شد','ok'); render();
   },
   'health-reindex'(){
     if(typeof idxReset==='function')idxReset();
     toast('ایندکس‌ها بازسازی شدند','ok'); render();
   },
   'health-retry'(){
     if(typeof SYNC==='undefined'){toast('لایهٔ همگام‌سازی در دسترس نیست','err');return;}
     let n=0;
     SYNC.queue.forEach(q=>{ if(q.status==='failed'||q.status==='conflict'){q.status='pending';q.tries=0;q.error=null;n++;} });
     if(typeof saveQueue==='function')saveQueue();
     toast(n?fa(n)+' عملیات برای ارسال دوباره آماده شد':'عملیات ناموفقی وجود ندارد', n?'ok':'');
     render();
   },
   'health-backup'(){
     try{
       const payload=JSON.stringify({version:1,created_at:new Date().toISOString(),
         ops:(typeof log!=='undefined')?log:[]});
       const blob=new Blob([payload],{type:'application/json'});
       const a=document.createElement('a');
       a.href=URL.createObjectURL(blob);
       a.download='payesh-backup-'+todayISO()+'.json';
       document.body.appendChild(a); a.click(); a.remove();
       setTimeout(()=>URL.revokeObjectURL(a.href),1000);
       toast('نسخهٔ پشتیبان دریافت شد','ok');
     }catch(e){ toast('دریافت پشتیبان ممکن نشد','err'); }
   },
   // ---- ویزارد ورود اکسل ----
   'imp-back'(){
     const st=S.imp||{step:0,entity:'students'};
     S.imp=Object.assign({},st,{step:Math.max(0,st.step-1)});render();
   },
   'imp-reset'(){ S.imp={step:0,entity:'students'}; render(); },
   'imp-preview'(){
     const st=S.imp;
     if(!st||!st.sheet){toast('ابتدا فایل را انتخاب کنید','err');return;}
     const need=IMP_FIELDS[st.entity].filter(x=>x[2]).map(x=>x[0]);
     const have=Object.values(st.mapping||{});
     const miss=need.filter(k=>have.indexOf(k)<0);
     if(miss.length){toast('فیلد الزامی نگاشت نشده است','err');return;}
     /* نمرات و حضور: دانش‌آموز باید قابل شناسایی باشد —
        نام یا کد ملی (هر دو هم خوب است) */
     if((st.entity==='grades'||st.entity==='attendance')
        && have.indexOf('full_name')<0 && have.indexOf('national_id')<0){
       toast('نام یا کد ملی دانش‌آموز نگاشت نشده است','err');return;
     }
     const preview=validateImport(st.sheet.rows,st.mapping,st.entity);
     S.imp=Object.assign({},st,{step:2,preview});render();
   },
   'imp-raise-cap'(){
     /* ⚠️ ظرفیت فقط با عدد صریح مدیر بالا می‌رود؛ سامانه خودش
        بی‌سروصدا آن را زیاد نمی‌کند وگرنه مدیر ماه‌ها بعد کلاس
        ۵۵ نفره کشف می‌کند. */
     const id=Number(el.dataset.id), c=byId('classes',id);
     if(!c){toast('کلاس یافت نشد','err');return;}
     const v=Number(V('impcap_'+id));
     if(!v||v<1){toast('ظرفیت معتبر وارد کنید','err');return;}
     if(v<(c.capacity||0)){toast('ظرفیت تازه نباید کمتر از ظرفیت فعلی باشد','err');return;}
     update('classes',id,{capacity:v});
     toast('ظرفیت «'+c.name+'» به '+fa(v)+' نفر رسید','ok');
     /* پیش‌نمایش با ظرفیت تازه دوباره ساخته شود */
     const st=S.imp;
     if(st&&st.sheet){
       const preview=validateImport(st.sheet.rows,st.mapping,st.entity);
       S.imp=Object.assign({},st,{preview});
     }
     render();
   },
   'place-rules-save'(){
     /* دو قانون اختیاری؛ هر دو پیش‌فرض خاموش‌اند */
     const sid=S.user.school_id, sc=byId('schools',sid);
     if(!sc){toast('مدرسه یافت نشد','err');return;}
     const rules={
       autoDistribute:!!$('#pr_auto')?.checked,
       separateGender:!!$('#pr_gender')?.checked,
       keepSiblings:!!$('#pr_sib')?.checked };
     update('schools',sid,{place_rules:rules});
     toast('قواعد کلاس‌بندی ذخیره شد','ok'); render();
   },
   'imp-commit'(){
     const st=S.imp;
     if(!st||!st.preview){toast('داده‌ای برای ثبت نیست','err');return;}
     if(!st.preview.counts.ok){toast('هیچ ردیف سالمی برای ثبت وجود ندارد','err');return;}
     const result=commitImport(st);
     S.imp=Object.assign({},st,{step:3,result});
     toast('اطلاعات با موفقیت ثبت شد','ok'); render();
   },
   // ---- فرم‌های رسمی و پیامک ----
   'form-print'(){
     const kind=el.dataset.r, sid=S.user.school_id, school=byId('schools',sid)||{};
     const hd=esc(school.name||'')+(school.code?' — کد '+esc(school.code):'');
     if(kind==='grade-sheet'){
       const cls=byId('classes',Number(V('fm_class')));
       if(invalid('fm_class',!cls,'کلاس را انتخاب کنید'))return;
       const subj=V('fm_subject')?byId('subjects',Number(V('fm_subject'))):null;
       const term=V('fm_term')||TERMS[0];
       const d=formGradeSheet(cls,subj,term);
       printableDoc({title:'لیست نمرات کلاس',school:hd,
         subtitle:'کلاس '+esc(cls.name)+(subj?' — درس '+esc(subj.name):'')+' · '+esc(term)+' · سال تحصیلی '+yearTitle(),
         body:d.body,
         note:'ستون‌های «مستمر»، «پایانی» و «امضا» برای تکمیل دستی در کلاس در نظر گرفته شده است.'});
     }
     else if(kind==='exam-minutes'){
       const e=V('fm_exam')?byId('exams',Number(V('fm_exam'))):null;
       if(invalid('fm_exam',!e,'جلسه امتحان را انتخاب کنید'))return;
       const d=formExamMinutes(e);
       printableDoc({title:'صورت‌جلسه برگزاری امتحان',school:hd,
         subtitle:esc(d.subj.name||'')+' — کلاس '+esc(d.cls.name||''),body:d.body,
         note:'موارد تخلف یا حوادث جلسه: ______________________________________________________<br>'
              +'تعداد حاضران: ______ تعداد غایبان: ______ تعداد برگه تحویلی: ______'});
     }
     else if(kind==='statistics'){
       const d=formStatistics(sid);
       printableDoc({title:'دفتر آمار مدرسه',school:hd,landscape:true,
         subtitle:'سال تحصیلی '+yearTitle()+' · '+esc(school.level||'')+' '+esc(school.gender||''),
         body:d.body});
     }
   },
   /* گواهی نمرات (بند ۱.۶): چاپ از تب کارنامهٔ پروندهٔ دانش‌آموز.
      نسخهٔ PDF قفل‌شده است — اینجا فقط چاپِ اچ‌تی‌ام‌ال است. */
   'cert-print'(){
     const sid=Number(el.dataset.sid)||(S.user&&S.user.role==='student'?S.user.id:0);
     const d=transcriptCert(sid,V('cert_term'));
     if(!d.ok){toast(d.msg,'err');return;}
     printableDoc(d);
   },
   /* ─────── گواهی‌های رسمی دیگر (بند ۶) ───────
      همان الگوی cert-print؛ مجوز داده‌ای در certAllowedStudent. */
   'cert-enroll-print'(){
     const sid=Number(el.dataset.sid)||(S.user&&S.user.role==='student'?S.user.id:0);
     const chk=certAllowedStudent(sid);
     if(!chk.ok){toast(chk.msg,'err');return;}
     const d=enrollmentCert(sid);
     if(!d.ok){toast(d.msg,'err');return;}
     certRecord('enrollment',sid);
     printableDoc(d);
   },
   'cert-transfer-print'(){
     const sid=Number(el.dataset.sid)||(S.user&&S.user.role==='student'?S.user.id:0);
     const chk=certAllowedStudent(sid);
     if(!chk.ok){toast(chk.msg,'err');return;}
     const d=transferCert(sid);
     if(!d.ok){toast(d.msg,'err');return;}
     certRecord('transfer',sid);
     printableDoc(d);
   },
   'cert-verify'(){
     const sid=Number(el.dataset.sid)||(S.user&&S.user.role==='student'?S.user.id:0);
     const chk=certAllowedStudent(sid);
     if(!chk.ok){toast(chk.msg,'err');return;}
     const r=certVerify(V('cert_code'),sid);
     toast(r.msg,r.ok?'ok':'err');
   },
   'sms-new'(){
     openModal(modalTpl('ارسال پیامک گروهی',
       f('گیرندگان',sel('sm_aud',[['parents','همه اولیا'],['teachers','همه دبیران'],
         ['students','همه دانش‌آموزان'],['class','اولیای یک کلاس']]))
       +f('کلاس (در صورت انتخاب)',sel('sm_class',visibleClasses().map(c=>[c.id,c.name])))
       +f('متن پیام','<textarea class="input" id="sm_text" rows="4" placeholder="اولیای گرامی، جلسه اولیا و مربیان روز چهارشنبه ساعت ۱۶ برگزار می‌شود."></textarea>'),
       'sms-send'));
   },
   'sms-send'(){
     const sid=S.user.school_id, text=V('sm_text')||'';
     if(invalid('sm_text',text.trim().length<4,'متن پیام باید دست‌کم چهار نویسه باشد'))return;
     const targets=smsTargets(sid,V('sm_aud'),V('sm_class'));
     if(!targets.length){toast('گیرنده‌ای با شماره معتبر یافت نشد','err');return;}
     const parts=smsParts(text), need=targets.length*parts;
     const wal=smsWalletOf(sid);
     if(wal.balance<need){
       toast('اعتبار پیامک کافی نیست. نیاز: '+fa(need)+' — موجودی: '+fa(wal.balance),'err');return;}
     batchWrites(()=>{
       targets.forEach(t=>insert('sms_log',{school_id:sid,user_id:t.id,phone:t.phone,body:text,
         parts,status:'sent',created_at:todayISO()}));
       update('sms_wallet',wal.w.id,{balance:wal.balance-need});
     });
     closeModal(); toast(fa(targets.length)+' پیامک ارسال شد ('+fa(need)+' اعتبار)','ok'); render();
   },
   'sms-topup'(){
     const wal=smsWalletOf(S.user.school_id);
     openModal(modalTpl('شارژ اعتبار پیامک',
       f('تعداد پیامک',sel('sm_count',[500,1000,2000,5000].map(n=>[n,fa(n)+' پیامک — '+rial(n*wal.price)+' ریال'])))
       +'<div class="small muted" style="line-height:2;margin-top:8px">پرداخت آزمایشی است و مبلغی کسر نمی‌شود.</div>',
       'sms-topup-ok'));
   },
   // ---- اطلاع‌رسانی پیامکی به اولیا (دور ۴۲) ----
   'notify-filter'(){ S.filters.nkind = el.dataset.k || ''; render(); },
   'notify-pick-all'(){
     const on = el.checked;
     $$('.nq-pick').forEach(x => { x.checked = on; });
   },
   'notify-approve'(){ _notifyApprove([Number(el.dataset.id)]); },
   'notify-reject'(){
     const n = notifyReject([Number(el.dataset.id)]);
     if(n) toast('پیام رد شد','ok');
     render();
   },
   'notify-approve-sel'(){
     const ids = notifyPicked();
     if(!ids.length){ toast('هیچ پیامی انتخاب نشده است','err'); return; }
     _notifyApprove(ids);
   },
   'notify-reject-sel'(){
     const ids = notifyPicked();
     if(!ids.length){ toast('هیچ پیامی انتخاب نشده است','err'); return; }
     askConfirm(`${fa(ids.length)} پیام رد شود و برای اولیا ارسال نشود؟`, () => {
       const n = notifyReject(ids);
       toast(fa(n) + ' پیام رد شد','ok');
       render();
     }, { title:'رد پیام‌ها', ok:'رد کن' });
   },
   'notify-edit'(){
     const q = byId('notify_queue', Number(el.dataset.id));
     if(!q) return;
     window._nqEdit = q.id;
     openModal(modalTpl('ویرایش متن پیام',
       f('متن پیامک','<textarea class="input" id="nq_text" rows="4">' + esc(q.body) + '</textarea>')
       + '<div class="small muted" style="line-height:2">'
       + 'گیرندگان: ' + fa((q.parent_ids||[]).length) + ' نفر · '
       + 'هر ۷۰ نویسه یک قطعه پیامک حساب می‌شود.</div>',
       'notify-save-edit'));
   },
   'notify-save-edit'(){
     const id = window._nqEdit, txt = (V('nq_text')||'').trim();
     if(invalid('nq_text', txt.length < 4, 'متن پیام باید دست‌کم چهار نویسه باشد')) return;
     const q = byId('notify_queue', id);
     if(!q){ closeModal(); return; }
     /* ⚠️ ویرایش مدیر ممکن است پیام را دوقطعه‌ای کند ⇒ parts دوباره
        حساب می‌شود، وگرنه هزینه کمتر از واقع کسر می‌شود. */
     update('notify_queue', id, { body: txt, parts: smsParts(txt) });
     closeModal();
     toast('متن پیام ویرایش شد','ok');
     render();
   },
   'notify-auto-off'(){
     notifySaveSettings(S.user.school_id, { autoSend:false });
     toast('حالت ارسال خودکار خاموش شد','ok');
     render();
   },
   /* ─────── سرویس مدرسه — نسخهٔ بدون جی‌پی‌اس ─────── */
   'bus-route-new'(){ busRouteModal(null); },
   'bus-route-save'(){
     const r0 = window._busRoute || {};
     const name = V('br_name');
     if(!name) return toast('نام مسیر را بنویسید','err');
     const drv = V('br_driver') ? Number(V('br_driver')) : null;
     if(r0.id){ update('bus_routes', r0.id, {name:name, driver_id:drv}); }
     else { insert('bus_routes',{school_id:S.user.school_id, name:name, driver_id:drv, created_at:todayISO()}); }
     closeModal(); toast('مسیر ذخیره شد','ok'); render();
   },
   'bus-route-del'(){
     askConfirm('این مسیر حذف شود؟ رویدادهای ثبت‌شده حفظ می‌مانند ولی دانش‌آموزان از مسیر جدا می‌شوند.',
       function(){
         batchWrites(function(){
           db.bus_students.slice().forEach(function(b){
             if(b.route_id===id) remove('bus_students', b.id);
           });
           remove('bus_routes', id);
         });
         toast('مسیر حذف شد','ok'); render();
       },
       {title:'حذف مسیر', ok:'حذف کن', danger:true});
   },
   'bus-students'(){ busStudentsModal(Number(id)); },
   'bus-students-save'(){
     const rid = window._busRouteId;
     if(!rid) return;
     const checked = $$('.bs-chk:checked').map(function(c){ return Number(c.value); });
     batchWrites(function(){
       db.bus_students.slice().forEach(function(b){
         if(b.route_id===rid && checked.indexOf(b.student_id)<0) remove('bus_students', b.id);
       });
       checked.forEach(function(sid2){
         /* دانش‌آموز در مسیر دیگری باشد ⇒ رد می‌شود (قانون تک‌مسیر) */
         if(busRouteOfStudent(sid2) && busRouteOfStudent(sid2).id!==rid) return;
         if(!db.bus_students.some(function(b){ return b.route_id===rid && b.student_id===sid2; }))
           insert('bus_students',{route_id:rid, student_id:sid2});
       });
     });
     closeModal(); toast('دانش‌آموزان مسیر به‌روز شد','ok'); render();
   },
   /* ثبت رویداد سوار/پیاده — بررسی مالکیت مسیر در busEvent() روی داده */
   'bus-event'(){
     const t = el.dataset.t;
     const r = busEvent(Number(id), t);
     if(!r.ok) return toast(r.msg,'err');
     toast(t==='on' ? '🚌 سوار شد — پیامک در صف است' : '🏫 پیاده شد — پیامک در صف است','ok');
     render();
   },
   'bus-need-set'(){ busNeedModal(Number(id)); },
   'bus-need-save'(){
     const r = busNeedSet(window._busNeedStudent, (document.querySelector('input[name="bus_need_m"]:checked')||{}).value, V('bus_need_note'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('پاسخ سرویس ثبت شد','ok'); render();
   },
   'bus-need-parent-save'(){
     const v = (document.querySelector('#bus_need_opts input[name="bus_need"]:checked')||{}).value;
     if(!v){ toast('یکی از گزینه‌ها را انتخاب کنید','err'); return; }
     const r = busNeedSet(Number(id), v, '');
     if(!r.ok){ toast(r.msg,'err'); return; }
     toast('پاسخ شما ثبت شد','ok'); render();
   },
   'bus-event-student'(){
     const r = busEvent(Number(id), el.dataset.t, 'student');
     if(!r.ok) return toast(r.msg,'err');
     toast(el.dataset.t==='on' ? '🚌 ثبت شد — پیامک در صف است' : '🏫 ثبت شد — پیامک در صف است','ok');
     render();
   },
   'bus-loc-driver'(){
     busLocationReal('driver', 0).then(function(res){
       if(!res.ok) return toast(res.msg,'err');
       toast(res.real ? '📡 موقعیتِ واقعی ثبت شد' : '📍 موقعیت ثبت شد (دمو: نقطهٔ بعدیِ واقعیِ مسیر)','ok'); render();
     });
   },
   'bus-loc-student'(){
     busLocationReal('student', 0).then(function(res){
       if(!res.ok) return toast(res.msg,'err');
       toast('📍 موقعیت شما ثبت شد','ok'); render();
     });
   },
   /* بند ۱۴: پیگیریِ واقعیِ مغایرت */
   'bus-follow-open'(el){
     const st = byId('users', Number(id));
     openModal(modalTpl('پیگیری مغایرت — ' + (st ? st.full_name : ''),
       f('یادداشت پیگیری', inp('bf_note', '', 'مثلاً: با راننده تماس گرفتم…')),
       'bus-follow-save'));
     window._busFollow = {route: Number(el.dataset.r), student: Number(id)};
   },
   'bus-follow-save'(){
     const fo = window._busFollow || {};
     const r = busFollowStart(fo.route, fo.student, V('bf_note'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('🔎 پیگیری شروع شد','ok'); render();
   },
   'bus-follow-close'(){
     const f = byId('bus_followups', Number(id));
     if(!f) return;
     const st = byId('users', f.student_id);
     openModal(modalTpl('بستن پیگیری — ' + (st ? st.full_name : ''),
       f('نتیجهٔ پیگیری', inp('bf_close', '', 'مثلاً: تأیید شد که دانش‌آموز پیاده شده است')),
       'bus-follow-close-save'));
     window._busFollowId = Number(id);
   },
   'bus-follow-close-save'(){
     const r = busFollowClose(window._busFollowId, V('bf_close'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('✅ پیگیری بسته شد','ok'); render();
   },
   /* بند ۱۲: حضورِ خودکار کلاس مجازی */
   /* بند ۱۵: لینک‌های اختصاصیِ کلاس مجازی */
   'vclass-links'(){ vclassLinksModal(Number(id)); },
   'vclass-link-copy'(){
     const l = byId('vclass_links', Number(id));
     if(!l) return;
     const url = vclassLinkFullUrl(l);
     if(navigator.clipboard && navigator.clipboard.writeText){
       navigator.clipboard.writeText(url).then(function(){ toast('لینک کپی شد','ok'); },
         function(){ window.prompt('لینک را کپی کنید:', url); });
     } else { window.prompt('لینک را کپی کنید:', url); }
   },
   'vc-join'(){
     const r = vclassJoin(Number(id));
     if(!r.ok) return toast(r.msg,'err');
     toast('🚪 وارد کلاس شدید — حضورِ شما ثبت شد','ok'); render();
   },
   'vc-leave'(){
     const r = vclassLeave(Number(id));
     if(!r.ok) return toast(r.msg,'err');
     toast('خروج شما ثبت شد','ok'); render();
   },
   /* بند ۱۲: تکالیف — بازه/قفل + مشاهده */
   'hw-window'(){ hwWindowModal(Number(id)); },
   'hw-window-save'(){
     const locked = !!(document.getElementById('hww_locked')||{}).checked;
     const r = hwSetWindow(window._hwWindowId, locked, V('hww_open'), V('hww_close'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('بازهٔ ارسال به‌روز شد','ok'); render();
   },
   'hw-lock'(){
     const a = byId('hw_assignments', Number(id));
     if(!a) return;
     const r = hwSetWindow(Number(id), !a.locked, a.window_open||'', a.window_close||'');
     if(!r.ok){ toast(r.msg,'err'); return; }
     toast(r.rec.locked ? 'تکلیف قفل شد' : 'تکلیف باز شد','ok'); render();
   },
   'hw-view'(){ hwViewModal(Number(id)); },
   /* بند ۱۳: حالت حضوری/غیرحضوری مدرسه */
   'smode-open'(){ smodeModal(Number(id)); },
   'smode-save'(){
     const r = setSchoolMode(window._smodeId, V('sm_date'), V('sm_mode'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('حالت ثبت شد','ok'); render();
   },
   'smode-mgr'(){
     const t = todayISO();
     const cur = schoolModeOf(S.user.school_id, t);
     const r = setSchoolMode(S.user.school_id, t, cur==='virtual'?'in_person':'virtual');
     if(!r.ok){ toast(r.msg,'err'); return; }
     toast(r.rec.mode==='virtual' ? 'مدرسه امروز غیرحضوری (مجازی) شد' : 'مدرسه امروز حضوری شد','ok'); render();
   },
   /* خلاصهٔ روزانه (بند ۱.۷): برای همهٔ دانش‌آموزان فعال؛ تکراری رد می‌شود */
   'daily-summary'(){
     const r = notifyDailySummaryAll(S.user.school_id);
     toast(r.created
       ? fa(r.created)+' خلاصه در صف قرار گرفت'+(r.skipped?' ('+fa(r.skipped)+' تکراری یا بدون والد، رد شد)':'')
       : 'خلاصه‌ای ساخته نشد (همه تکراری یا بدون والد)', r.created?'ok':'err');
     render();
   },
   /* ─────────────── کلاس مجازی (نسخهٔ سبک) ─────────────── */
   'vclass-new'(){ vclassNewModal(Number(id)); },
   'vclass-save'(){
     const clsId = window._vclassClass;
     const title = V('vc_title');
     if(!title) return toast('عنوان نشست را بنویسید','err');
     const type = V('vc_type');
     const fEl = $('#vc_file');
     const file = (fEl && fEl.files && fEl.files[0]) ? fEl.files[0] : null;
     if(type==='video' && !file) return toast('فایل ویدیو را انتخاب کنید','err');
     closeModal();
     vclassCreateSession({classId:clsId, type:type, title:title,
       url:V('vc_url'), time:V('vc_time'), desc:V('vc_desc')}, file).then(function(r){
       if(!r.ok){ toast(r.msg,'err'); return; }
       toast('نشست در کلاس مجازی ثبت شد','ok');
       render();
     });
   },
   'vclass-del'(){
     askConfirm('این نشست (و در صورت وجود، فایل آن از ذخیره‌گاه) حذف شود؟', function(){
       const s = byId('vclass_sessions', id);
       if(!s) return;
       const u = S.user;
       const role = (typeof activePersona==='function') ? activePersona() : u.role;
       const isTeacher = role==='teacher' && teacherClasses(u.id).some(function(c){ return c.id===s.class_id; });
       if(!(isTeacher || role==='manager' || role==='superadmin')){
         toast('شما مجوز حذف این نشست را ندارید','err'); return;
       }
       vclassQuestionsOf(s.id).forEach(function(q){ remove('vclass_questions', q.id); });
       remove('vclass_sessions', s.id);
       /* فایل IDB ناهمگام است — پیام و رندر بعد از پاک‌شدن واقعی */
       vclassIdbDel(VCLASS_STORE, s.file_key || '').then(function(){
         toast('نشست حذف شد','ok'); render();
       });
     }, {title:'حذف نشست', ok:'حذف', danger:true});
   },
   'vclass-play'(){
     const s = byId('vclass_sessions', id);
     if(!s || !s.file_key){ toast('فایل این نشست در دسترس نیست','err'); return; }
     toast('فایل در حال بارگذاری است…','');
     vclassIdbGet(VCLASS_STORE, s.file_key).then(function(blob){
       if(!blob){ toast('فایل دیگر در ذخیره‌گاه نیست','err'); return; }
       const url = (typeof URL!=='undefined' && URL.createObjectURL) ? URL.createObjectURL(blob) : '';
       openModal(modalTpl('🎬 ' + (s.title||''),
         '<video controls style="width:100%;max-height:62vh;background:#000;border-radius:10px" data-vurl="'+escAttr(url)+'"></video>'
         + (s.description ? '<div class="small muted" style="margin-top:10px">'+esc(s.description)+'</div>' : ''), ''));
       setTimeout(function(){
         const v = document.querySelector('#modal video');
         if(v && v.getAttribute('data-vurl')) v.src = v.getAttribute('data-vurl');
       }, 60);
     });
   },
   'vclass-q-ask'(){
     window._vcQSession = id;
     openModal(modalTpl('❓ سؤال از دبیر',
       '<textarea id="vc_qbody" class="input" rows="4" placeholder="سؤال خود را بنویسید"></textarea>',
       'vclass-q-save'));
   },
   'vclass-q-save'(){
     const s = byId('vclass_sessions', window._vcQSession);
     if(!s) return;
     const body = V('vc_qbody');
     if(!body) return toast('متن سؤال را بنویسید','err');
     const u = S.user;
     const role = (typeof activePersona==='function') ? activePersona() : u.role;
     /* 🔴 سؤال فقط به اسم خودِ دانش‌آموز و فقط در نشستِ کلاس خودش */
     const sid2 = role==='student' ? u.id : S.child;
     const cls2 = sid2 ? classOf(sid2) : null;
     if(!cls2 || cls2.id !== s.class_id){ toast('این نشست مربوط به کلاس شما نیست','err'); return; }
     insert('vclass_questions', {
       session_id: s.id, student_id: sid2, body: body,
       created_at: new Date().toISOString(), answer:'', answered_at:'', answered_by:0
     });
     closeModal(); toast('سؤال ثبت شد — پاسخ دبیر همین‌جا می‌آید','ok'); render();
   },
   'vclass-q-answer'(){
     window._vcQId = id;
     openModal(modalTpl('✍️ پاسخ به سؤال',
       '<textarea id="vc_qans" class="input" rows="3" placeholder="پاسخ خود را بنویسید"></textarea>',
       'vclass-q-answer-save'));
   },
   'vclass-q-answer-save'(){
     const ans = V('vc_qans');
     if(!ans) return toast('متن پاسخ را بنویسید','err');
     update('vclass_questions', window._vcQId, {
       answer: ans, answered_at: new Date().toISOString(), answered_by: S.user.id
     });
     closeModal(); toast('پاسخ ثبت شد','ok'); render();
   },
   /* ─────────────── تکالیف (بند ۴) ─────────────── */
   'hw-new'(){
     const cls = byId('classes', Number(id));
     if(!cls) return;
     window._hwClass = Number(id);
     const subs = (typeof visibleSubjects==='function'?visibleSubjects():[]).filter(function(x){return x.school_id===cls.school_id;});
     openModal(modalTpl('تکلیف جدید — ' + cls.name,
       f('عنوان *', inp('hw_title',''))
       + f('درس', sel('hw_subject', [['','—']] .concat(subs.map(function(x){return [x.id,x.name];})), ''))
       + f('توضیح', inp('hw_desc',''))
       + f('مهلت (اختیاری)', inp('hw_due','','date'))
       , 'hw-save'));
   },
   'hw-save'(){
     const r = hwCreateAssignment({
       classId: window._hwClass,
       title: V('hw_title'),
       subjectId: Number(V('hw_subject')) || 0,
       description: V('hw_desc'),
       dueDate: V('hw_due')
     });
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('تکلیف ثبت شد','ok'); render();
   },
   'hw-del'(){
     askConfirm('این تکلیف و فهرست بارگذاری‌هایش حذف شود؟ (خود فایل‌ها در ذخیره‌گاه می‌مانند)', function(){
       const a = byId('hw_assignments', id);
       if(!a) return;
       const cls = byId('classes', a.class_id);
       const u = S.user;
       const role = (typeof activePersona==='function') ? activePersona() : u.role;
       const isTeacher = role==='teacher' && cls && teacherClasses(u.id).some(function(c){ return c.id===cls.id; });
       if(!(isTeacher || role==='manager' || role==='superadmin')){
         toast('شما مجوز حذف این تکلیف را ندارید','err'); return;
       }
       hwSubmissionsOf(a.id).forEach(function(s){ remove('hw_submissions', s.id); });
       remove('hw_assignments', a.id);
       toast('تکلیف حذف شد','ok'); render();
     }, {title:'حذف تکلیف', ok:'حذف', danger:true});
   },
   'hw-list'(){ hwListModal(Number(id)); },
   'hw-grade'(){ hwGradeModal(Number(id)); },
   'hw-grade-save'(){
     const raw = V('hw_score');
     const score = raw==='' ? null : Number(raw);
     if(raw!=='' && (isNaN(score) || score<0 || score>20)){ toast('نمره باید ۰ تا ۲۰ باشد','err'); return; }
     hwSaveGrading(score).then(function(r){
       if(!r.ok){ toast(r.msg,'err'); return; }
       closeModal(); toast('تصحیح ثبت شد','ok'); render();
     });
   },
   'hw-canvas-clear'(){ _hwStrokes = []; hwCanvasRedraw(); },
   'hw-submit'(){
     const inpEl = document.getElementById('hwfile_' + id);
     const file = (inpEl && inpEl.files && inpEl.files[0]) ? inpEl.files[0] : null;
     if(!file){ toast('تصویر تکلیف را انتخاب کنید','err'); return; }
     toast('در حال بارگذاری…','');
     hwSubmit(Number(id), file).then(function(r){
       if(!r.ok){ toast(r.msg,'err'); return; }
       toast('تکلیف بارگذاری شد — در انتظار تصحیح دبیر','ok');
       render();
     });
   },
   'notify-settings'(){
     const c = notifySettings(S.user.school_id);
     const row = (id,on,label,hint) =>
       '<label class="row" style="gap:10px;align-items:flex-start;padding:10px 0;'
       + 'border-bottom:1px solid var(--border)">'
       + '<input type="checkbox" id="' + id + '"' + (on?' checked':'')
       + ' style="margin-top:3px;flex:none" />'
       + '<span style="min-width:0"><b class="small">' + label + '</b>'
       + '<div class="small muted" style="margin-top:2px;line-height:1.9">' + hint + '</div>'
       + '</span></label>';
     openModal(modalTpl('تنظیمات اطلاع‌رسانی پیامکی',
       row('nf_on', c.enabled, 'اطلاع‌رسانی پیامکی فعال باشد',
           'با خاموش بودن، هیچ پیامی ساخته نمی‌شود.')
       + row('nf_auto', c.autoSend, '⚠️ ارسال خودکار بدون تأیید مدیر',
           'خطای دبیر مستقیم به خانواده اطلاع داده می‌شود. با احتیاط روشن کنید.')
       + row('nf_abs', c.kinds.absence, 'پیامک غیبت', 'پرتکرارترین پیام.')
       + row('nf_late', c.kinds.late, 'پیامک تأخیر', '')
       + row('nf_grade', c.kinds.grade, 'پیامک نمرهٔ پایین',
           'عدد نمره در پیامک نمی‌آید؛ فقط اطلاع کلی.')
       + row('nf_event', c.kinds.event, 'پیامک رویداد مدرسه', '')
       + row('nf_daily', c.kinds.daily, 'پیامک خلاصهٔ روزانه',
           'پس از ثبت حضور، یک پیام تجمیعی (زنگ‌ها + وضعیت حضور) به هر خانواده؛ با دکمهٔ «خلاصهٔ امروز» هم دستی ساخته می‌شود.')
       + row('nf_bus', (c.kinds.bus_on!==false&&c.kinds.bus_off!==false), 'پیامک رویدادهای سرویس (سوار/پیاده)',
           'با هر کلیک راننده، به خانوادهٔ دانش‌آموز پیامک می‌رود.')
       + '<div class="grid g2" style="margin-top:10px">'
       +   f('مهلت اصلاح دبیر (دقیقه)', inp('nf_grace', c.graceMinutes, 'number'))
       +   f('سقف روزانه (قطعه)', inp('nf_cap', c.dailyCap, 'number'))
       +   f('هشدار از این تعداد به بالا', inp('nf_bulk', c.bulkWarn, 'number'))
       + '</div>',
       'notify-save-settings'));
   },
   'notify-save-settings'(){
     const sid = S.user.school_id;
     const wasAuto = notifySettings(sid).autoSend;
     const nowAuto = $('#nf_auto').checked;
     const apply = () => {
       notifySaveSettings(sid, {
         enabled:  $('#nf_on').checked,
         autoSend: nowAuto,
         graceMinutes: Math.max(0, Number(V('nf_grace')) || 20),
         dailyCap:     Math.max(1, Number(V('nf_cap'))   || 300),
         bulkWarn:     Math.max(1, Number(V('nf_bulk'))  || 50),
         kinds: { absence:$('#nf_abs').checked, late:$('#nf_late').checked,
                  grade:$('#nf_grade').checked, event:$('#nf_event').checked,
                  daily:$('#nf_daily').checked,
                  bus_on:$('#nf_bus').checked, bus_off:$('#nf_bus').checked }
       });
       closeModal(); toast('تنظیمات ذخیره شد','ok'); render();
     };
     /* ⚠️ روشن‌کردن خودکار تأیید صریح می‌خواهد — تصمیم پرریسکی است
        و نباید با یک تیک بی‌توجه انجام شود. */
     if(nowAuto && !wasAuto){
       askConfirm('با روشن‌کردن ارسال خودکار، پیام‌ها بدون بازبینی شما به اولیا می‌روند.',
         apply, { title:'تأیید ارسال خودکار', ok:'می‌پذیرم و روشن کن',
                  note:'خطای دبیر در حضور و غیاب مستقیم به خانواده اطلاع داده می‌شود.' });
     } else apply();
   },
   'sms-topup-ok'(){
     const n=Number(V('sm_count'))||500;
     const wal=smsWalletOf(S.user.school_id);
     update('sms_wallet',wal.w.id,{balance:Number(wal.w.balance)+n});
     closeModal(); toast(fa(n)+' پیامک شارژ شد','ok'); render();
   },
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
     if(need('ms_date','تاریخ را وارد کنید'))return;
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
   // ---- چرخه سال تحصیلی: بستن، چیدمان، ثبت‌نام ----
   'year-close'(){
     const sid=S.user.school_id;
     const rows=db.classes.filter(c=>c.school_id===sid);
     askConfirm('سال تحصیلی '+yearTitle()+' بسته شود؟ پایهٔ همهٔ دانش‌آموزان یک واحد '
       +'بالا می‌رود، پایهٔ دوازدهم فارغ‌التحصیل و بایگانی می‌شود، و پایهٔ ششم و نهم '
       +'«در انتظار انتقال» می‌شوند. پس از آن باید کلاس‌ها را بچینید.',()=>{
       let promoted=0,graduated=0,leavers=0;
       batchWrites(()=>{
         rows.forEach(c=>{
           const g=c.grade_level||gradeFromName(c.name); if(!g)return;
           activeStudentsOfClass(c.id).forEach(st=>{
             if(g===12){graduateStudent(st,sid,c);graduated++;}
             else if(isTerminal(g)){update('users',st.id,{status:'awaiting_transfer',grade_level:g+1});leavers++;}
             else {update('users',st.id,{grade_level:g+1});promoted++;}
           });
         });
         /* بند ۰.۲: سالِ مقصدِ چیدمان همان لحظهٔ بستن ثبت می‌شود */
         saveYearState(sid,{closed:1,closed_at:new Date().toISOString(),promoted:1,
           placement_year:nextYearCode(yearCode())});
       });
       toast(fa(promoted)+' ارتقا · '+fa(graduated)+' فارغ‌التحصیل · '+fa(leavers)+' پایان مقطع','ok');
       S.tab='placement'; render();
     },{title:'بستن سال تحصیلی',ok:'ببند و ارتقا بده'});
   },
   'year-reopen'(){
     askConfirm('سال تحصیلی دوباره باز شود؟ ارتقای انجام‌شده برنمی‌گردد؛ فقط وضعیت سال '
       +'به «باز» تغییر می‌کند.',()=>{
       saveYearState(S.user.school_id,{closed:0,closed_at:null});
       toast('سال تحصیلی بازگشایی شد',''); render();
     },{title:'بازگشایی سال',ok:'باز کن'});
   },
   'place-auto'(){
     const sid=S.user.school_id;
     const g=Number(el.dataset.g), fl=el.dataset.fl||null;
     const cls=targetClasses(sid,g,fl);
     if(!cls.length){toast('برای این پایه کلاسی وجود ندارد','err');return;}
     const list=needPlacement(sid).filter(p=>p.grade===g&&
       (!isFieldBased(g)||normHdr(p.field||'')===normHdr(fl||'')||(!fl&&!p.field)));
     if(!list.length){toast('دانش‌آموزی برای چیدمان نیست','err');return;}
     askConfirm(fa(list.length)+' دانش‌آموز بر پایهٔ کارنامه و انضباط میان '+fa(cls.length)
       +' کلاس توزیع شوند؟ توزیع طوری انجام می‌شود که میانگین کلاس‌ها به هم نزدیک بماند.',()=>{
       const buckets=autoPlacement(list,cls);
       const pairs=[];
       buckets.forEach(b=>b.list.forEach(s=>pairs.push({studentId:s.user.id,classId:b.cls.id})));
       const n=applyPlacement(pairs, sid);
       toast(fa(n)+' دانش‌آموز در کلاس‌ها چیده شدند','ok'); render();
     },{title:'چیدمان خودکار',ok:'انجام بده'});
   },
   'cls-parallel'(){
     const g=el.dataset.g, fl=el.dataset.fl||'';
     PARALLEL={grade:Number(g),field:fl};
     openModal(modalTpl('ساخت کلاس موازی',
       '<div class="small muted" style="line-height:2;margin-bottom:10px">'
       +'وقتی تعداد دانش‌آموزان یک پایه یا رشته از ظرفیت یک کلاس بیشتر است، '
       +'کلاس موازی بسازید؛ مثلاً «دهم تجربی الف» و «دهم تجربی ب».</div>'
       +f('پایه',inp('cp_grade',g,'number'))
       +f('رشته (در متوسطه دوم)',inp('cp_field',fl))
       +f('پسوند نام کلاس',sel('cp_suffix',[['الف','الف'],['ب','ب'],['ج','ج'],['د','د'],['۱','۱'],['۲','۲']]))
       +f('ظرفیت',inp('cp_cap',40,'number')),'cls-parallel-ok'));
   },
   'cls-parallel-ok'(){
     const sid=S.user.school_id;
     const g=Number(V('cp_grade'))||0;
     if(need('cp_grade','پایه را وارد کنید'))return;
     const fl=(V('cp_field')||'').trim()||null;
     const sfx=V('cp_suffix')||'';
     const c=createParallelClass(sid,g,fl,sfx);
     if(Number(V('cp_cap'))) update('classes',c.id,{capacity:Number(V('cp_cap'))});
     closeModal(); toast('کلاس «'+c.name+'» ساخته شد','ok'); render();
   },
   'enroll-paid'(){
     const sid=S.user.school_id;
     const list=enrollmentList(sid).filter(x=>x.paid);
     if(!list.length){toast('دانش‌آموزی با شهریهٔ تأییدشده نیست','err');return;}
     askConfirm(fa(list.length)+' دانش‌آموز با شهریهٔ تأییدشده به‌صورت خودکار در کلاس‌ها '
       +'چیده شوند؟',()=>{
       const byGroup={};
       list.forEach(p=>{
         const k=p.grade+'|'+(isFieldBased(p.grade)?(p.field||''):'');
         (byGroup[k]=byGroup[k]||[]).push(p);
       });
       let total=0,skipped=0;
       Object.keys(byGroup).forEach(k=>{
         const g=Number(k.split('|')[0]), fl=k.split('|')[1]||null;
         const cls=targetClasses(sid,g,fl);
         if(!cls.length){skipped+=byGroup[k].length;return;}
         const buckets=autoPlacement(byGroup[k],cls);
         const pairs=[];
         buckets.forEach(b=>b.list.forEach(s=>pairs.push({studentId:s.user.id,classId:b.cls.id})));
         total+=applyPlacement(pairs, sid);
       });
       toast(fa(total)+' ثبت‌نام شد'+(skipped?' · '+fa(skipped)+' بدون کلاس مقصد':''),'ok');
       render();
     },{title:'ثبت‌نام خودکار',ok:'انجام بده'});
   },
   /* ---- قیف پیش‌ثبت‌نام سال آینده (بند ۰.۲) ---- */
   'pre-add'(){
     const sid=S.user.school_id;
     const name=V('pre_name');
     if(need('pre_name','نام الزامی است'))return;
     const nid=(V('pre_nid')||'').trim();
     if(nid&&!validNid(nid)){toast('کد ملی معتبر نیست','err');return;}
     preAddRow(sid,{name:name,national_id:nid||null,phone:(V('pre_phone')||'').trim()||null,
       grade:Number(V('pre_grade'))||0,field:(V('pre_field')||'').trim()||null});
     toast('پیش‌ثبت‌نام ثبت شد؛ حالا «تأیید» بزنید تا حساب ساخته شود','ok'); render();
   },
   'pre-returning'(){
     const sid=S.user.school_id;
     const n=preAddReturning(sid);
     toast(n?('تعداد '+fa(n)+' دانش‌آموز فعلی به پیش‌ثبت‌نام سال آینده افزوده شد'):'همهٔ دانش‌آموزان فعلی قبلاً ثبت‌اند','ok');
     render();
   },
   'pre-confirm'(el,id){
     const sid=S.user.school_id;
     askConfirm('این پیش‌ثبت‌نام تأیید شود؟ حساب دانش‌آموز ساخته یا به حساب موجود وصل می‌شود.',()=>{
       const r=preConfirm(sid,id);
       if(!r.ok){toast(r.err,'err');return;}
       toast(r.created?'تأیید شد و حساب دانش‌آموز ساخته شد':'تأیید شد و به حساب موجود وصل شد','ok');
       render();
     },{title:'تأیید پیش‌ثبت‌نام',ok:'تأیید کن'});
   },
   'pre-reject'(el,id){
     update('pre_enrollments',id,{status:'rejected'});
     toast('رد شد',''); render();
   },
   'pre-del'(el,id){
     askConfirm('این ردیف پیش‌ثبت‌نام حذف شود؟',()=>{
       remove('pre_enrollments',id);
       toast('حذف شد',''); render();
     },{title:'حذف پیش‌ثبت‌نام',ok:'حذف',danger:true});
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
     if(invalid('tq_nid',!validNid(nid),'کد ملی معتبر نیست'))return;
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
   'grade-del-ok'(){if(typeof notifyGradeCancel==='function')notifyGradeCancel(window._delId);remove('grades',window._delId);closeModal();toast('نمره حذف شد','ok');render();},
   'grade-save'(){const g=window._edit;const score=Number(V('g_score'));
     if(isNaN(score)||score<0||score>20){toast('نمره باید بین ۰ تا ۲۰ باشد','err');return;}
     /* امتحان نهایی فقط پایه‌های پایانی — همان قاعدهٔ finalGradeOk
        (26-curriculum) که در exam-save اعمال می‌شود */
     if(V('g_type')==='امتحان نهایی'){
       const gcls=byId('classes',window._gclass);
       if(!(typeof finalGradeOk==='function'&&finalGradeOk(gcls&&gcls.grade))){
         toast('نمرهٔ امتحان نهایی فقط برای پایه‌های پایانی (نهم و دوازدهم) ثبت می‌شود','err');return;
       }
     }
     let gid=g.id;
     if(g.id)update('grades',g.id,{score,term:V('g_term'),exam_type:V('g_type')});
     else{const sid=Number(V('g_st')),cid=window._gclass;
       const r=insert('grades',{school_id:byId('classes',cid).school_id,student_id:sid,class_id:cid,subject_id:Number(V('g_sub')),teacher_id:S.user.role==='teacher'?S.user.id:null,term:V('g_term'),exam_type:V('g_type'),score,max_score:20,created_at:todayISO()});
       gid=r.id;}
     /* گام ۷: نمرهٔ زیر آستانه برای اولیا پیامک می‌سازد (بعد از نوشتن
        تا source_ref شناسهٔ واقعی باشد) */
     let sms=0,fix=0;
     if(typeof notifyGradeSync==='function'){const r=notifyGradeSync(gid);sms=r.made;fix=r.fixed;}
     closeModal();toast('نمره ثبت شد'+(sms?' — '+fa(sms)+' پیامک ساخته شد':'')+(fix?' — '+fa(fix)+' اصلاحیه ساخته شد':''),'ok');render();},
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
   /* ─────────────── گیمیفیکیشن ابتدایی (بند ۵) ─────────────── */
   'dojo-config'(){ dojoConfigModal(); },
   'dojo-row-add'(){ dojoAddRow('⭐','', 1); },
   'dojo-apply-defaults'(){ dojoApplyDefaults(); },
   'dojo-row-del'(){ dojoRemoveRow(el); },
   'dojo-save'(){
     const r = dojoSaveModel();
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('مدل امتیازها ذخیره شد','ok'); render();
   },
   'dojo-pick'(){
     /* چیپ فقط فرمِ بازِ انضباط را پر می‌کند (ذخیره از مسیر مجاز disc-save) */
     var types = null;
     try{
       var d = window._edit;
       if(!d) return;
       var sc = (typeof dojoSchoolOfStudent==='function') ? dojoSchoolOfStudent(d.student_id) : null;
       if(!sc || (typeof dojoAvailableForStudent!=='function') || !dojoAvailableForStudent(d.student_id)) return;
       types = dojoTypes(sc.id);
     }catch(e){ return; }
     var t = types[Number(el.dataset.i)];
     if(!t) return;
     var kind = t.delta > 0 ? 'positive' : 'negative';
     function setVal(id, val){ var e2 = document.getElementById(id); if(e2) e2.value = val; }
     function setSelectVal(id, val){
       var e2 = document.getElementById(id);
       if(!e2) return;
       var has = false;
       for(var i2=0;i2<e2.options.length;i2++){ if(e2.options[i2].value===val){ has=true; break; } }
       if(!has){ var op=document.createElement('option'); op.value=val; op.textContent=val; e2.appendChild(op); }
       e2.value = val;
     }
     setSelectVal('d_title', t.label);
     setVal('d_points', String(t.delta));
     setSelectVal('d_kind', kind);
     toast(t.icon + ' «' + t.label + '» اعمال شد — توضیح را بنویسید و ذخیره کنید','');
   },
   // announcements
   // announcements
   'ann-new'(){annModal();},
   'ann-edit'(){annModal(byId('announcements',id));},
   'ann-del'(){const a=byId('announcements',id);askDelete(`اطلاعیه «${a.title}» حذف شود؟`,()=>{remove('announcements',id);toast('اطلاعیه حذف شد','ok');render();});},
   'ann-save'(){ if(needAll([['a_title','عنوان و متن الزامی است'],['a_body','عنوان و متن الزامی است']]))return;
     const data={title:V('a_title'),body:V('a_body'),audience:V('a_aud')};
     if(window._annEdit)update('announcements',window._annEdit,data);
     else insert('announcements',Object.assign({school_id:S.user.school_id||null,created_by:S.user.id,created_at:todayISO()},data));
     closeModal();toast(window._annEdit?'اطلاعیه ویرایش شد':'اطلاعیه منتشر شد','ok');window._annEdit=0;render();},
   /* ── مشاور مدرسه و پیگیری الگوها (دور ۶۳) ── */
   'fu-days'(){S.filters.fu_days=Number(el.dataset.d);render();},
   'counselor-ref'(){
     const stId=Number(el.dataset.s),key=el.dataset.k;
     const days=Number(S.filters.fu_days)>0?Number(S.filters.fu_days):30;
     const row=(patternFlagged(S.user.school_id,days)||[]).find(rw=>rw.user.id===stId);
     const bre=row&&row.breaches.find(b=>b.key===key);
     if(!bre){toast('الگو دیگر معتبر نیست — صفحه را تازه کنید','err');render();return;}
     const res=counselorRef(S.user.school_id,stId,bre,S.user.id);
     toast(res.msg,res.ok?'ok':'err');
     if(res.ok)render();
   },
   'counselor-handle'(){
     const ref=(typeof byId==='function')?byId('counselor_refs',Number(el.dataset.r)):null;
     if(!ref){toast('ارجاع پیدا نشد','err');return;}
     /* مرز بین‌مدرسه‌ای: فقط ارجاعِ مدرسهٔ خودت */
     if(ref.school_id!==S.user.school_id){toast('دسترسی به ارجاع مدرسهٔ دیگر مجاز نیست','err');return;}
     const inp=el.ownerDocument&&$('#ch_note_'+ref.id);
     const note=inp?inp.value.trim():'';
     if(counselorHandle(ref.id,S.user.id,note)){toast('ارجاع رسیدگی‌شده شد','ok');render();}
     else toast('این ارجاع از پیش رسیدگی شده است','err');
   },
   /* اعلان الگو به ولی (بند ۴ دور ۶۳): فقط مدیر. پیام نمی‌رود —
      در صف پیام اولیا می‌نشیند و با تأیید مدیر ارسال می‌شود. */
   'pattern-notify'(){
     const stId=Number(el.dataset.s);
     const days=Number(S.filters.fu_days)>0?Number(S.filters.fu_days):30;
     const row=(patternFlagged(S.user.school_id,days)||[]).find(rw=>rw.user.id===stId);
     /* بدترین الگو (بیشترین تعداد) ملاک متن پیام است */
     const bre=row&&row.breaches.slice().sort((a,b)=>b.count-a.count)[0];
     if(!bre){toast('الگو دیگر معتبر نیست — صفحه را تازه کنید','err');render();return;}
     const res=patternNotifyParent(stId,S.user.school_id,bre,days,S.user.id);
     toast(res.msg,res.ok?'ok':'err');
     if(res.ok)render();
   }
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
    window._deb=setTimeout(()=>{S.filters[k]=v;S.page=1;render();const n=$(`[data-f="${escAttr(k)}"]`);if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}},280);
  }
});
/* آبشاری: مقطع → پایه → شاخه → رشته (فرم درس و فرم افزودن کتاب) */
document.addEventListener('change',e=>{
  const id=e.target.id;

  /* زنگ‌ها: شروع روز ⇒ همهٔ بازه‌های همان روز جابه‌جا می‌شوند (دور ۶۳) */
  if(e.target.classList && e.target.classList.contains('bl-start') && window._edit){
    var bd0=Number(e.target.dataset.day);
    if(window._edit.days[bd0]){window._edit.days[bd0].start=e.target.value;bellRenderDay(bd0);}
    return;
  }
  /* زنگ‌ها: ساعت پایان یک بازه ⇒ مدت آن و زنجیرهٔ بعدی (دور ۶۳) */
  if(e.target.classList && e.target.classList.contains('bl-to') && window._edit){
    var edT=window._edit;
    var d1=Number(e.target.dataset.day), ri=Number(e.target.dataset.i);
    if(edT.days[d1]){
      var dd=edT.days[d1];
      var tl=bellDayTimeline(dd);
      var fm=tl[ri]?timeToMin(tl[ri].from):timeToMin(dd.start);
      var tm=timeToMin(e.target.value);
      if(fm!=null&&tm!=null){
        var dm=tm-fm;
        if(dm<=0){toast('ساعت پایان باید بعد از شروع باشد','err');}
        else dd.slots[ri].min=dm;
      }
      bellRenderDay(d1);
    }
    return;
  }
  /* زنگ‌ها: الگوی آماده برای یک روز مشخص (دور ۶۳) */
  if(id && id.indexOf('bl_preset_')===0 && window._edit){
    var dayP=Number(id.slice(10));
    var keyP=e.target.value;
    if(keyP && window._edit.days[dayP]){
      var pd=bellPresetDays(keyP);
      if(pd){window._edit.days[dayP]={start:pd[dayP].start,
        slots:pd[dayP].slots.map(function(x){return {kind:x.kind,min:x.min};})};
        bellRenderDay(dayP);}
    }
    return;
  }

  /* فرم مدرسه: تیک شاخه ⇒ باز یا بستهٔ شدن فهرست رشته‌های همان شاخه.
     این‌ها شناسه ندارند و با کلاس تشخیص داده می‌شوند، پس پیش از
     بررسی‌های مبتنی بر شناسه می‌آیند. */
  if(e.target.classList.contains('m-branch')){
    const card=e.target.closest('.branch-card');
    if(card){
      const box=card.querySelector('.branch-fields');
      card.classList.toggle('on',e.target.checked);
      if(box)box.style.display=e.target.checked?'flex':'none';
      /* شاخه که برداشته شد، رشته‌های زیرش هم برداشته شوند */
      if(!e.target.checked){
        $$('.m-field',card).forEach(c=>{c.checked=false;c.closest('.field-chip').classList.remove('on');});
      }
    }
    return;
  }
  if(e.target.classList.contains('m-field')){
    const chip=e.target.closest('.field-chip');
    if(chip)chip.classList.toggle('on',e.target.checked);
    return;
  }

  /* فرم کلاس: تغییر نوع چیدمان ⇒ نمایش یا پنهان‌کردن رشته */
  if(id==='c_mode'){
    const wrap=document.getElementById('c_fieldwrap_cls');
    const hint=document.getElementById('c_mode_hint');
    const v=e.target.value;
    if(wrap) wrap.style.display = (v==='class') ? 'none' : '';
    if(hint) hint.innerHTML = v==='class'
      ? 'کلاس‌محور: ترکیب دانش‌آموزان تا پایان سال ثابت است و رشته لازم نیست. '
        +'هر سال چیدمان از نو انجام می‌شود.'
      : v==='field'
        ? 'رشته‌محور: دانش‌آموز تا پایان دوازدهم در همان رشته می‌ماند. '
          +'اگر تعداد یک رشته زیاد شد، کلاس موازی بسازید.'
        : 'نوع بر پایهٔ پایه‌ای که وارد می‌کنید تعیین می‌شود: پایهٔ ۱۰ به بالا رشته‌محور.';
    return;
  }

  /* چیدمان دستی: انتخاب کلاس مقصد برای یک دانش‌آموز */
  if(e.target.dataset&&e.target.dataset.f==='place'){
    const sidStu=Number(e.target.dataset.s), cid=Number(e.target.value);
    if(!sidStu||!cid)return;
    const n=applyPlacement([{studentId:sidStu,classId:cid}], S.user&&S.user.school_id);
    if(n){const c=byId('classes',cid);toast('در کلاس «'+(c?c.name:'')+'» ثبت شد','ok');render();}
    return;
  }

  /* بازیابی: انتخاب فایل پشتیبان و نمایش خلاصهٔ آن پیش از تأیید */
  if(id==='rs_file'){
    const file=e.target.files&&e.target.files[0];
    const box=document.getElementById('rs_info');
    if(!file)return;
    file.text().then(txt=>{
      let obj=null;
      try{ obj=JSON.parse(txt); }catch(err){ obj=null; }
      const chk=obj?validateBackup(obj):{ok:false,error:'فایل json معتبر نیست'};
      if(!chk.ok){
        RESTORE_PKG=null;
        if(box)box.innerHTML='<span style="color:var(--red)">⛔ '+esc(chk.error)+'</span>';
        return;
      }
      RESTORE_PKG=obj;
      if(box)box.innerHTML='<b style="color:var(--green)">✅ فایل معتبر است</b><br>'
        +'عملیات: <b>'+fa(chk.ops)+'</b><br>'
        +(chk.created_at?'ساخته‌شده: '+esc(shortStamp(chk.created_at))+'<br>':'')
        +(chk.by?'توسط: '+esc(chk.by)+'<br>':'')
        +'<button class="btn" style="margin-top:10px" data-act="restore-ok">بازیابی کن</button>';
    }).catch(()=>{ if(box)box.innerHTML='<span style="color:var(--red)">⛔ خواندن فایل ممکن نشد</span>'; });
    return;
  }

  /* ویزارد ورود اکسل: انتخاب نوع اطلاعات */
  if(id==='imp_entity'){
    S.imp=Object.assign({},S.imp||{step:0},{entity:e.target.value});
    return;
  }
  /* ویزارد ورود اکسل: انتخاب فایل ⇒ خواندن و رفتن به مرحله نگاشت */
  if(id==='imp_file'){
    const file=e.target.files&&e.target.files[0];
    if(!file)return;
    const entity=(S.imp&&S.imp.entity)||'students';
    const done=rows=>{
      if(!rows||!rows.length){toast('فایل خالی یا ناخوانا است','err');return;}
      const sheet=prepSheet(rows,entity);
      if(!sheet.headers.length){toast('ردیف تیتر یافت نشد','err');return;}
      S.imp={step:1,entity,sheet,mapping:sheet.mapping,fileName:file.name};
      render();
    };
    const fail=err=>toast(err&&err.message?err.message:'خواندن فایل ممکن نشد','err');
    if(/\.csv$/i.test(file.name)){
      file.text().then(t=>done(parseCSV(t))).catch(fail);
    } else {
      if(!canReadXlsx()){toast('مرورگر شما xlsx را باز نمی‌کند؛ فایل را csv ذخیره کنید','err');return;}
      parseXLSX(file).then(sheets=>{
        const first=(sheets||[]).filter(x=>x.rows&&x.rows.length)[0];
        done(first?first.rows:null);
      }).catch(fail);
    }
    return;
  }
  /* ویزارد ورود اکسل: تغییر دستی نگاشت یک ستون */
  if(e.target.dataset&&e.target.dataset.f==='impmap'){
    const i=Number(e.target.dataset.i), val=e.target.value;
    const st=S.imp; if(!st)return;
    const map=Object.assign({},st.mapping);
    /* هر فیلد فقط به یک ستون نگاشت شود */
    if(val)Object.keys(map).forEach(k=>{ if(map[k]===val&&Number(k)!==i)delete map[k]; });
    if(val)map[i]=val; else delete map[i];
    S.imp=Object.assign({},st,{mapping:map});
    render();
    return;
  }
  const optsOf=(list,ph)=>[`<option value="">${ph}</option>`,...list.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`)].join('');
  /* رشته‌های یک شاخه، محدود به آنچه این مدرسه واقعاً ارائه می‌دهد.
     اگر مدرسه رشته‌ای از آن شاخه ثبت نکرده باشد، همهٔ رشته‌های شاخه
     برگردانده می‌شود تا فهرست خالی و بن‌بست نشود. */
  const fieldsHere=(branch,schoolId)=>{
    const all=fieldsOfBranch(branch)||[];
    if(typeof schoolFields!=='function')return all;
    const mine=schoolFields(schoolId||S.user.school_id)||[];
    const hit=all.filter(x=>mine.indexOf(x)>=0);
    return hit.length?hit:all;
  };

  /* فرم درس: تغییر پایه → نمایش یا پنهان‌کردن شاخه/رشته */
  if(id==='s_grade'){
    const lv=levelOfGrade(e.target.value);
    const w=$('#s_fieldwrap'); if(w)w.style.display=needsField(lv)?'':'none';
    if(!needsField(lv)){ if($('#s_branch'))$('#s_branch').value=''; if($('#s_field'))$('#s_field').value=''; }
    return;
  }
  if(id==='s_branch'){
    if($('#s_field'))$('#s_field').innerHTML=optsOf(fieldsHere(e.target.value,V('s_school')),'— انتخاب رشته —');
    return;
  }

  /* فرم مدرسه: مقطع متوسطه دوم → نمایش انتخابگر شاخه‌ها */
  if(id==='m_level'){
    const bx=$('#m_branch_box');
    if(bx){
      const on = e.target.value==='متوسطه دوم';
      bx.style.display = on ? 'block' : 'none';
      /* اگر مقطع عوض شد و دیگر متوسطه دوم نیست، تیک‌ها پاک شوند
         تا دادهٔ بی‌معنا (مثلاً دبستانِ دارای رشتهٔ حسابداری) ذخیره نشود */
      if(!on) $$('.m-branch,.m-field').forEach(c=>{c.checked=false;});
    }
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
    if($('#im_field'))$('#im_field').innerHTML=optsOf(fieldsHere(e.target.value,V('im_school')),'— انتخاب رشته —');
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
    if(id==='m_prov'&&$('#m_county'))$('#m_county').innerHTML=g.counties.map(o=>`<option value="${escAttr(o[0])}">${esc(o[1])}</option>`).join('');
    if($('#m_district'))$('#m_district').innerHTML=(id==='m_prov'?geoOptions(pid,'').districts:g.districts).map(o=>`<option value="${escAttr(o[0])}">${esc(o[1])}</option>`).join('');
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
  if(e.key==='Enter'&&!S.user&&$('#lnid'))document.querySelector('[data-act="login"]').click();});


/**
 * تأیید و ارسال دستهٔ پیام، با هشدار پیش از ارسال حجم بالا.
 *
 * ⚠️ سه وضعیت جدا هشدار می‌گیرند: اعتبار ناکافی (بازدارنده)،
 * فراتر از سقف روزانه (هشدار)، حجم بالا (هشدار). سقف ترمز است
 * نه دیوار: مدیر می‌تواند آگاهانه رد شود.
 */
function _notifyApprove(ids){
  var e = notifyEstimate(ids);
  if(!e.count){ toast('پیامی برای ارسال نیست','err'); return; }

  var go = function(){
    var r = notifySend(ids);
    if(r.sent) toast(fa(r.sent) + ' پیام ارسال شد (' + fa(r.used) + ' قطعه)', 'ok');
    if(r.reason === 'no-credit')
      toast('اعتبار پیامک تمام شد — ' + fa(r.skipped) + ' پیام در صف ماند', 'err');
    render();
  };

  if(!e.enough){
    toast('اعتبار کافی نیست. نیاز: ' + fa(e.parts) +
          ' قطعه — موجودی: ' + fa(e.balance) + ' قطعه', 'err');
    return;
  }
  if(e.overBulk || e.overCap){
    var note = e.overCap
      ? 'این ارسال از سقف روزانهٔ مدرسه فراتر می‌رود.'
      : 'موجودی پس از ارسال: ' + fa(e.after) + ' قطعه.';
    askConfirm(fa(e.count) + ' پیام (' + fa(e.parts) + ' قطعه) برای اولیا ارسال شود؟',
      go, { title:'تأیید ارسال گروهی', ok:'تأیید و ارسال', danger:false, note:note });
    return;
  }
  go();
}

/* ═══════════════════════════════════════════════════════════════════
   کنترلگر مرکزی رویدادها (هستهٔ فاز ۲ — شکستنِ 19-actions.js)
   همهٔ دکمه‌ها اینجا مدیریت می‌شوند (واگذاری رویداد با data-act). گارد مجوز در ابتدای شنونده اعمال می‌شود.
   اکشن‌ها در ۸ فایلِ دامنه‌ایِ خواهر (19-actions-dorm.js و …) و ۱۷ اکشنِ
   این فایل زندگی می‌کنند؛ آبجکتِ A در لحظهٔ کلیک از همهٔ آن‌ها ساخته می‌شود.
   ═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   کنترلگر مرکزی رویدادها
   همهٔ دکمه‌ها اینجا مدیریت می‌شوند (واگذاری رویداد با data-act). گارد مجوز در ابتدای شنونده اعمال می‌شود.
   ═══════════════════════════════════════════════════════════════════ */
/** شناسهٔ نوبت انتخاب‌شده برای رزرو (بین باز شدن مودال و ثبت آن) */
var SLOT_ID=null;
/** بند 15.1: وضعیتِ زمان‌دارِ در انتظارِ ثبتِ ساعت (بین مودال و تأیید) */
var attTimePending=null;
/** بند 15.1: شناسهٔ رکوردِ موجه‌سازی در انتظار تأیید (بین مودال و تأیید) */
var attExemptId=null;
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
function finishLogin(u){
   S.user=u;S.stack=[];S.persona=null;Store.remove(PERSONA_KEY);
   linkAsParent(u);
   S.showPicker=panelsOf(u).length>1;
   /* روت خانهٔ هر نقش — مشاور به صف ارجاع می‌رود نه داشبورد */
   S.route=(typeof homeRoute==='function'?homeRoute(u.role):(u.role==='edu_office'?'officedash':'dashboard'));
   Store.set(SESSION_KEY,u.username);if(typeof trackVisit==='function')trackVisit(u.id);toast('خوش آمدید، '+u.full_name,'ok');render();
}
/* نگاشتِ خطاهای سرور به پیامِ فارسیِ هم‌شکل با خطاهای محلی
   (سرور هیچ جزئیاتِ فنی به کاربر نمی‌دهد). */
function loginServerMsg(code){
  const m={ no_account:'برای این شماره حسابی یافت نشد',
    bad_code:'کد اشتباه است یا منقضی شده',
    nid_mismatch:'کد ملی با این شماره مطابقت ندارد',
    inactive:'حساب غیرفعال است',
    school_inactive:'مدرسهٔ این حساب فعال نیست',
    rate_limited:'تلاش‌های زیادی بود — کمی صبر کنید و دوباره امتحان کنید',
    missing_fields:'شماره، کد و کد ملی را کامل وارد کنید',
    no_session:'نشست منقضی شده است' };
  return m[code]||'ورود انجام نشد — دوباره تلاش کنید';
}

/* اکشن‌هایِ هسته: پایه (ورود/خروج/ناوبری) و اکشن‌هایِ بدونِ دامنهٔ
   اختصاصی. پارامترها همان محلی‌هایِ شنوندهٔ کلیک هستند. */
function coreActions(e, el, id, a, rawId){
  return {
   /* E.1 فرناز: تیکِ چک‌لیستِ فردا — فقط حافظهٔ محلی via Store (بدون سرور، بدون رندرِ مجدد) */
   /* E.6 فرناز: یادداشت شخصی ولی — فقط Store؛ فقط ولیِ لینک‌شده؛ سقف ۵۰۰ نویسه */
   'pnote-save'(){
     const sid=Number(id), u=S.user;
     if(!u||u.role!=='parent'||typeof noteLinkedParent!=='function'||!noteLinkedParent(u.id,sid)){toast('فقط ولیِ دانش‌آموز می‌تواند یادداشت ثبت کند','err');return;}
     const t=(V('note_text')||'').trim();
     if(t.length>500){toast('یادداشت حداکثر ۵۰۰ نویسه می‌تواند باشد','err');return;}
     if(!t){Store.remove(noteKey(u.id,sid));}
     else if(!Store.set(noteKey(u.id,sid),JSON.stringify({t:t,u:todayISO()}))){toast('ذخیره نشد — حافظهٔ محلی در دسترس نیست','err');return;}
     toast('یادداشت ذخیره شد','ok'); render();
   },
   /* E.3 فرناز: ثبت هدف نمره — فقط Store؛ گارد دوم: فقط خود/ولی (canAction نقش را چک می‌کند، این مالکیت را) */
   'goal-save'(){
     const sid=Number(id), sub=Number(el.dataset.sub);
     if(!sid||!sub)return;
     if(typeof goalViewerOk!=='function'||!goalViewerOk(sid)){toast('فقط خود دانش‌آموز یا ولیِ او می‌تواند هدف ثبت کند','err');return;}
     const raw=(V('goal_val')||'').trim();
     const v=Number(raw.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(',','.'));
     if(raw===''||isNaN(v)){toast('عدد هدف معتبر نیست','err');return;}
     if(v<0||v>20){toast('هدف باید بین ۰ تا ۲۰ باشد','err');return;}
     Store.set(goalKey(sid,sub),String(v));
     toast('🎯 هدف ثبت شد','ok'); render();
   },
   'tomorrow-check'(){
     const sid=Number(el.dataset.sid), iso=el.dataset.iso, idx=el.dataset.idx;
     if(!sid||!iso||!idx)return;
     /* دیسپچر روی کلیک preventDefault می‌کند (تاگِلِ بومی لغو می‌شود) — پس دستی تاگِل می‌زنیم */
     el.checked=!el.checked;
     const k=tomorrowCheckKey(sid,iso);
     let cur={}; try{cur=JSON.parse(Store.get(k,'{}'))||{};}catch(x){cur={};}
     cur[idx]=el.checked?1:0;
     Store.set(k,JSON.stringify(cur));
   },
   pick(){
     /* دمو: فرم با شماره + کد ملیِ همان حساب پر می‌شود و کد ارسال (شبیه‌سازی)
        و در فیلد می‌نشیند — کاربر با «استعلام و ورود» کاملش می‌کند. */
     const u=db.users.find(x=>x.username===el.dataset.u);
     if(!u){toast('حساب یافت نشد','err');return;}
     if(!u.phone||!u.national_id){toast('این حساب شماره/کد ملی برای ورود ندارد','err');return;}
     $('#lpn').value=u.phone; $('#lnid').value=u.national_id;
     if(typeof serverDetected==='function'&&serverDetected()){
       /* حالت سروری: کد واقعی از سرور (در فاز دمو: سرور آن را برمی‌گرداند) */
       $('#lcode').value='';
       Api.post('/api/auth/send-code',{phone:u.phone},{raw:true}).then(function(r){
         var b=r&&r.body;
         if(r.status<400&&b&&b.ok){ if(b.demo_code){ $('#lcode').value=b.demo_code; loginDemoHint(b.demo_code); } }
         else loginErr(loginServerMsg(b&&b.code));
       }).catch(function(){ loginErr('اتصال به سرور برقرار نشد'); });
       return;
     }
     const code=SmsPanel.sendCode(u.phone);
     $('#lcode').value=code;
     loginDemoHint(code);
   },
   /* ارسالِ کد — پنلِ پیامکی (در دمو: شبیه‌سازی + نمایشِ کد روی صفحه) */
   'login-code'(){
     const phone=normPhone(V('lpn'));
     if(!phone){loginErr('شمارهٔ همراه را وارد کنید');return;}
     if(typeof serverDetected==='function'&&serverDetected()){
       /* حالت سروری: کد توسطِ سرور ساخته و ثبت می‌شود (دروازهٔ واقعی
          جداست؛ در فاز دمو همان سرور، کد را در پاسخ برمی‌گرداند) */
       Api.post('/api/auth/send-code',{phone:phone},{raw:true}).then(function(r){
         var b=r&&r.body;
         if(r.status<400&&b&&b.ok){
           $('#lcode').value='';
           if(b.demo_code) loginDemoHint(b.demo_code);
           toast('کد ارسال شد','ok');
         } else loginErr(loginServerMsg(b&&b.code));
       }).catch(function(){ loginErr('اتصال به سرور برقرار نشد'); });
       return;
     }
     const u=db.users.find(x=>phoneMatches(x.phone,phone));
     if(!u){loginErr('برای این شماره حسابی یافت نشد');return;}
     const code=SmsPanel.sendCode(u.phone);
     $('#lcode').value='';
     loginDemoHint(code);
     toast('کد ارسال شد (دمو: روی صفحه نمایش داده شد)','ok');
   },
   /* سیاست حریم خصوصی — برای همه (حتی پیش از ورود) در دسترس است (ملاک گوگل‌پلی) */
   'privacy-open'(){ openPrivacyPolicy(); },
   /* حذف حساب (قفل ۹.۵) — تابع در 58-privacy.js */
   'delete-account-req'(){ if(typeof requestAccountDeletion === 'function') requestAccountDeletion(); },
   login(){
     /* 📄 PLAN_PHONE_AUTH — جریانِ نهاییِ ورود: بدونِ هیچ رمزی.
        شماره + کد (پنلِ پیامکی) + کد ملی (استعلام در سامانهٔ تطبیقِ
        کد ملی — سامانه‌ای جدا از پنلِ پیامکی). نسخهٔ واقعی: درگاهِ
        واقعی + استعلامِ سمتِ سرور (SERVER_SECURITY_CONTRACT بند ۵). */
     const phone=normPhone(V('lpn'));
     const nidIn=String(V('lnid')||'').trim();
     if(typeof serverDetected==='function'&&serverDetected()){
       /* حالت سروری: همهٔ اعتبارسنجی‌ها سمتِ سرور است (بند ۳ قرارداد
          امنیتی) — کلاینت فقط پیامِ خطا را نشان می‌دهد. */
       Api.post('/api/auth/login',{phone:phone,code:String(V('lcode')||'').trim(),national_id:nidIn},{raw:true}).then(function(r){
         var b=r&&r.body;
         if(r.status<400&&b&&b.ok&&b.user){
           const u=db.users.find(function(x){return x.id===b.user.id;})||db.users.find(function(x){return phoneMatches(x.phone,phone);});
           if(!u){loginErr('حساب در سرور تأیید شد اما در دادهٔ محلی نیست — صفحه را تازه کنید');return;}
           if(!u.active){loginErr('حساب غیرفعال است');return;}
           const _sm=schoolInactiveMsg(u);
           if(_sm){loginErr(_sm);return;}
           finishLogin(u);
         } else loginErr(loginServerMsg(b&&b.code));
       }).catch(function(){ loginErr('اتصال به سرور برقرار نشد'); });
       return;
     }
     const u=phone?db.users.find(x=>phoneMatches(x.phone,phone)):null;
     if(!u){loginErr('برای این شماره حسابی یافت نشد');return;}
     if(!SmsPanel.checkCode(u.phone,V('lcode'))){loginErr('کد اشتباه است یا منقضی شده');return;}
     if(!IdmSystem.match(nidIn)){loginErr('احراز هویت ناقص است: کد ملی در سامانهٔ تطبیق ثبت نیست');return;}
     if(String(u.national_id)!==nidIn){loginErr('احراز هویت ناقص است: کد ملی با این شماره مطابقت ندارد');return;}
     if(!u.active){loginErr('حساب غیرفعال است');return;}
     const _smsg=schoolInactiveMsg(u);
     if(_smsg){loginErr(_smsg);return;}
     finishLogin(u);
   },
   logout(){
     /* حالت سروری: نشستِ سرور را هم باطل می‌کنیم (jti → لیستِ سلب) */
     if(typeof serverDetected==='function'&&serverDetected()){
       try{ Api.post('/api/auth/logout'); }catch(e){}
     }
     S.user=null;S.boss=null;S.stack=[];S.persona=null;S.showPicker=false;
     Store.remove(SESSION_KEY);Store.remove(BOSS_KEY);Store.remove(PERSONA_KEY);render();
   },
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
   'stop-imp'(){
     const boss=S.boss||db.users.find(u=>u.username===Store.get(BOSS_KEY));
     if(!boss){toast('حساب سوپر ادمین یافت نشد','err');return;}
     S.user=boss; S.boss=null; S.stack=[]; S.route='schools'; S.page=1; S.filters={}; S.child=null;
     Store.remove(BOSS_KEY); Store.set(SESSION_KEY,boss.username);
     toast('به پنل سوپر ادمین بازگشتید','ok'); render();
   },
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
  /* ─────── بند ۶.۲: صورت‌جلسهٔ انجمن (فقط مدیر، فقط مدرسهٔ خود) ────── */
  'assoc-min-new'(){
    const sid=S.user.school_id;
    if(!sid||(typeof hasCap==='function')&&hasCap(sid,'has_tuition')){toast('این بخش فقط برای مدارس دولتی است','err');return;}
    assocMinModal();},
  'assoc-min-save'(){
    const sid=S.user.school_id;
    const date=V('am_date');const att=V('am_att');const res=V('am_res');
    if(!date){toast('تاریخِ جلسه لازم است','err');return;}
    if(!att){toast('حاضرین را بنویسید','err');return;}
    const typ=V('am_type');const mt=(typeof MIN_TYPES!=='undefined'&&MIN_TYPES.some(function(t){return t[0]===typ;}))?typ:'assoc';
    insert('assoc_minutes',{school_id:sid,meeting_date:date,meeting_type:mt,attendees:att,resolutions:res,archived:false,created_at:todayISO(),updated_at:todayISO()});
    closeModal();toast('صورت‌جلسه ثبت شد','ok');render();},
  'assoc-min-print'(){assocMinPrint(id);},
  /* C.3 فرناز: گزارش عمومی — فقط مدیر، فقط مدرسهٔ خود */
  'pubrep-print'(){
    if(!S.user||S.user.role!=='manager'||!S.user.school_id){toast('فقط مدیر مدرسه','err');return;}
    pubrepPrint();},
  'pubrep-csv'(){
    if(!S.user||S.user.role!=='manager'||!S.user.school_id){toast('فقط مدیر مدرسه','err');return;}
    const d=publicReportRows(S.user.school_id);
    const ok=downloadCSV('payesh-public-'+todayISO()+'.csv',d.headers,d.rows);
    toast(ok?'خروجی عمومی دانلود شد':'دریافت خروجی ممکن نشد',ok?'ok':'err');},
  'assoc-min-toggle'(){
    const m=byId('assoc_minutes',Number(id));
    if(!m)return;
    update('assoc_minutes',m.id,{archived:!m.archived,updated_at:todayISO()});
    toast(m.archived?'برگردانده شد: فعال':'بایگانی شد','ok');render();},
  'assoc-min-del'(){confirmModal('حذف این صورت‌جلسه؟','assoc-min-del-ok',id);},
  'assoc-min-del-ok'(){remove('assoc_minutes',Number(window._delId));closeModal();toast('حذف شد','ok');render();},
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
       + f('کد/رگال (اختیاری)', inp('lib_code',''))
       + f('شمارهٔ سریال (اختیاری — در هر مدرسه یکتا)', inp('lib_serial','')),
       'lib-save'));
   },
   'lib-save'(){
     const r = libAddBook(V('lib_title'), V('lib_author'), V('lib_code'), V('lib_serial'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('کتاب ثبت شد','ok');
     render();
   },
   /* بند ۶.۳ — شمارهٔ سریال کتاب */
   'lib-serial'(){
     const b = byId('lib_books', Number(id));
     if(!b) return;
     window._libSerialBook = b.id;
     openModal(modalTpl('شمارهٔ سریال — ' + b.title,
       f('شمارهٔ سریال (خالی = حذف سریال)', inp('lib_ser2', b.serial || ''))
       + '<div class="small muted">سریالِ هر کتابِ فیزیکی در همین مدرسه یکتا است؛ برای چندین کپیِ یک کتاب، چند ردیفِ جدا با سریال‌های متفاوت ثبت کنید.</div>',
       'lib-serial-save'));
   },
   'lib-serial-save'(){
     const r = libSetSerial(window._libSerialBook, V('lib_ser2'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('سریال ذخیره شد','ok');
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
     const _who=byId('users',id);
     const _tmAll=(typeof attTimersGet==='function')?attTimersGet(cid,date):{};
     /* Round 77: while the exit timer of this student runs, the other
        options are LOCKED - only the stop option is allowed. */
     if(st!=='early_exit'&&_tmAll[id]){
       toast('دانش‌آموز هنوز بیرون است — اول «⏱ توقف خروج» را بزنید','err');
       render();
       return;
     }

     /* دور ۷۵: «خروج از کلاس» تایمرِ رفت‌وبرگشتی است — نه مودالِ ساعت.
        ضربهٔ نخست: شروعِ تایمر (لحظهٔ خروج). ضربهٔ دوم: توقف +
        ثبتِ دقیقهٔ سپری‌شده (خروج تا بازگشت) در پیش‌نویس. */
     if(st==='early_exit'){
       const _tm=(typeof attTimersGet==='function')?attTimersGet(cid,date):{};
       if(_tm[id]){
         const r=(typeof attTimerStop==='function')?attTimerStop(cid,date,id):null;
         if(r) toast('خروج از کلاس ثبت شد — '+esc(_who?_who.full_name:'')+' : '+fa(r.minutes)+' دقیقه ('+timeFa(r.exit_at)+' تا '+timeFa(r.exit_return_at)+') — «مرور و ثبت نهایی» را بزنید','ok');
         else  toast('تایمرِ خروج بسته شد','err');
       } else {
         (typeof attTimerStart==='function')?attTimerStart(cid,date,id):null;
         toast('تایمرِ «خروج از کلاس» برای '+esc(_who?_who.full_name:'')+' شروع شد — هنگامِ برگشت، همین گزینه را دوباره بزنید','ok');
       }
       render();
       return;
     }
     /* ── دور ۷۷: تاخیر = رویدادِ مستقل از وضعیت ──
        - رویدادِ موجود (پیش‌نویس یا ثبت‌شده، غیرموجه) → مودالِ ویرایش
        - وضعیتِ مؤثر «غایب» → بدون مودال و **بدون تبدیل**:
          دقیقه از taken_at تا حالا (فقط فیلدهایِ رویداد؛ وضعیت
          دست‌نخورده — «اتومات غایب به حاضر تبدیل نمی‌شود»)
        - حاضر/ثبت‌نشده → مودالِ ساعت (بند 15.1) — فقط فیلدها */
     if(st==='late'){
       const _evs=(typeof attDraftEvents==='function')?attDraftEvents(cid,date):{};
       const _rec=(db.attendance||[]).find(a=>a.student_id===id&&a.date===date);
       const _de=(_evs[id]&&_evs[id].late)||null;
       const _hasEvent=_de||(_rec&&(_rec.late_at||_rec.status==='late')&&!_rec.late_excused);
       if(_hasEvent){
         attTimePending={cid,date,studentId:id,st};
         const _t0=(_de&&_de.late_at)||(_rec?_rec.late_at:null);
         openModal(modalTpl('ویرایشِ رویدادِ تاخیر',
           f('ساعتِ ورودِ تازه',`<input class="input" id="att_time" type="time" value="${escAttr(_t0||'')}" />`),
           'att-time-save',false,'ذخیره'))
         return;
       }
       const _mk=(typeof attDraftGet==='function')?attDraftGet(cid,date):{};
       const _eff=_mk[id]||(_rec?_rec.status:null);
       if(_eff==='absent'){
         const auto=(typeof attAutoLate==='function')?attAutoLate(cid,date,id):null;
         if(auto&&auto.converted){
           attDraftEvent(cid,date,id,'late',auto.fields);
           toast('تأخیرِ '+fa(auto.minutes)+' دقیقه ثبت شد (از ساعتِ '+auto.taken_label+') — وضعیتِ دانش‌آموز دست‌نخورده است؛ اگر برگشت «حاضر» را بزنید. ویرایش/حذف/موجه از گزارشِ پایین.','ok');
           render();
           return;
         }
       }
       const school=byId('classes',cid).school_id;
       const cur=(function(){
         const row=(db.attendance||[]).find(a=>a.student_id===id&&a.date===date);
         const t=st==='late'&&row&&row.late_at;
         const n=new Date();
        return t||((n.getHours()<10?'0':'')+n.getHours()+':'+(n.getMinutes()<10?'0':'')+n.getMinutes());
       })();
       const span=(typeof attDaySpan==='function')?attDaySpan(school,date):null;
       const hint=span
         ?(typeof timeFa==='function'?timeFa(minToTime(span.firstFrom)):minToTime(span.firstFrom))
         :null;
       attTimePending={cid,date,studentId:id,st};
       openModal(modalTpl('تأخیر با زمان',
         f('ساعت',`<input class="input" id="att_time" type="time" value="${escAttr(cur)}" />`)
         +(hint?`<div class="small muted" style="margin-top:8px">شروع مدرسه: ${hint}</div>`:'')
         +'<div class="small muted" style="margin-top:8px">میزانِ تأخیر بر پایهٔ زمان‌بندی زنگِ مدرسه محاسبه می‌شود. وضعیتِ حاضر/غایب دست‌نخورده می‌ماند.</div>',
         'att-time-save',false,'ثبت'))
       return;
     }
     attDraftSet(cid,date,id,st);
     /* دور ۱۰۲ (کارایی): به‌جای بازسازیِ کاملِ پوسته، فقط ردیفِ همان
        دانش‌آموز + شمارنده‌ها + نوارِ پیش‌نویس به‌روز می‌شود.
        سوپاپِ اطمینان: با هر تردیدی (false) رندرِ کامل صدا زده می‌شود —
        رفتار هرگز از وضعِ پیش از بهینه‌سازی بدتر نمی‌شود. */
     if(!(typeof attPartialSync==='function'&&attPartialSync(id))) render();},
   /* ثبت ساعتِ انتخابیِ وضعیتِ زمان‌دار (بند 15.1) */
   'att-time-save'(){
     if(!attTimePending)return;
     const {cid,date,studentId,st}=attTimePending;
     const v=($('#att_time')?String($('#att_time').value||''):'' );
     const school=byId('classes',cid).school_id;
     const fields=(typeof attTimeFields==='function')?attTimeFields(school,date,st,v):{};
      if(st==='late'){
        /* Round 77: late is an EVENT - status stays untouched */
        attDraftEvent(cid,date,studentId,'late',fields);
        attTimePending=null;closeModal();
        toast('رویدادِ تاخیر ثبت شد — ویرایش/حذف/موجه از گزارشِ پایین','ok');
        render();
        return;
      }
      attDraftSet(cid,date,studentId,st,fields);
     attTimePending=null;
     closeModal();
     toast(ATT_FA[st]+(v?' — ساعت ثبت شد':' ثبت شد')+'؛ «مرور و ثبت نهایی» را بزنید','ok');
     render();
   },
   'att-exempt'(){
     const rec=(typeof byId==='function')?byId('attendance',id):null;
     if(!rec){toast('رکورد پیدا نشد','err');return;}
     attExemptId=rec.id;
     const st=byId('users',rec.student_id);
     const _hasLate=rec.late_at||rec.status==='late';
     const _hasExit=rec.exit_at||rec.status==='early_exit';
     const _can=(rec.status==='absent'&&!rec.excused)||(_hasLate&&!rec.late_excused)||(_hasExit&&!rec.exit_excused);
     if(!_can){toast('این رکورد قابل موجه‌سازی نیست','err');return;}
     openModal(modalTpl('موجه‌سازی پس از ثبت',
       '<div class="small muted" style="margin-bottom:10px">'+esc(st?st.full_name:'—')
       +' · '+jalali(rec.date)+' · وضعیت: '+ATT_FA[rec.status]+'</div>'
       +f('دلیل موجه‌سازی',`<textarea class="input" id="att_exempt_reason" rows="2" placeholder="مثلاً: مرخصی کتبی ولی / هماهنگی پزشکی"></textarea>`),
       'att-exempt-confirm',false,'موجه‌سازی'));
   },
   'att-exempt-confirm'(){
     if(attExemptId==null){closeModal();return;}
     const rec=(typeof byId==='function')?byId('attendance',attExemptId):null;
     if(!rec){attExemptId=null;closeModal();return;}
     const reason=$('#att_exempt_reason')?String($('#att_exempt_reason').value||'').trim():'';
     if(!reason){toast('دلیل موجه‌سازی را بنویسید','err');return;}
    /* Round 77: unified excuse core - record + its events.
       A record-level excuse only makes sense for an ABSENT record
       (excused hides the record from the file); present records
       only get their EVENTS excused. */
    let r={ok:true,msg:'رکورد موجه شد'};
    if(rec.status==='absent'){
      r=(typeof attExcuseCore==='function')
        ?attExcuseCore(rec.id,'record',reason)
        :{ok:false,msg:'هستهٔ موجه در دسترس نیست'};
    }
    if(typeof attExcuseCore==='function'){
      const _rec2=byId('attendance',rec.id);
      if(_rec2.late_at||_rec2.status==='late') attExcuseCore(rec.id,'late',reason);
      if(_rec2.exit_at||_rec2.status==='early_exit') attExcuseCore(rec.id,'exit',reason);
    }
     attExemptId=null;
     closeModal();
     toast(r.ok?r.msg:r.msg,r.ok?'ok':'err');
     render();
   },
   /* ─────────── Round 77 - event report: edit/delete/excuse ─────────── */
   'att-event-edit'(){
     const which=el.dataset.w; if(which!=='late'&&which!=='exit')return;
     const sid=Number(id);
     const date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     const v=(typeof attEventView==='function')?attEventView(cid,date,sid):{late:null,exit:null};
     const ef=v[which];
     if(!ef){toast('رویداد پیدا نشد','err');return;}
     window._evtEdit={cid,date,sid,which};
     if(which==='late'){
       openModal(modalTpl('ویرایشِ رویدادِ تاخیر',
         f('ساعتِ ورود',`<input class="input" id="att_evt_time" type="time" value="${escAttr(ef.late_at||'')}" />`),
         'att-event-edit-save',false,'ذخیره'));
     } else {
       openModal(modalTpl('ویرایشِ رویدادِ خروج',
         '<div class="row" style="gap:8px">'
         +'<div class="col">'+f('ساعتِ خروج',`<input class="input" id="att_evt_from" type="time" value="${escAttr(ef.exit_at||'')}" />`)+'</div>'
         +'<div class="col">'+f('ساعتِ بازگشت',`<input class="input" id="att_evt_to" type="time" value="${escAttr(ef.exit_return_at||'')}" />`)+'</div>'
         +'</div>'
         +'<div class="small muted" style="margin-top:8px">دقیقهٔ خروج از فاصلهٔ دو ساعت محاسبه می‌شود.</div>',
         'att-event-edit-save',false,'ذخیره'));
     }
   },
   'att-event-edit-save'(){
     const e=window._evtEdit; if(!e){closeModal();return;}
     const sch=byId('classes',e.cid).school_id;
     if(e.which==='late'){
       const t=$('#att_evt_time')?String($('#att_evt_time').value||''):'';
       const fields=(typeof attTimeFields==='function')?attTimeFields(sch,e.date,'late',t):null;
       if(!fields||!Object.keys(fields).length){toast('ساعت معتبر وارد کنید','err');return;}
       attDraftEvent(e.cid,e.date,e.sid,'late',fields);
     } else {
       const tf=$('#att_evt_from')?String($('#att_evt_from').value||''):'';
       const tt=$('#att_evt_to')?String($('#att_evt_to').value||''):'';
       if(!tf||!tt){toast('هر دو ساعت را وارد کنید','err');return;}
       const mins=Math.max(0,(timeToMin(tt)||0)-(timeToMin(tf)||0));
       attDraftEvent(e.cid,e.date,e.sid,'exit',{
         exit_at:tf,exit_return_at:tt,exit_minutes:mins,
         note:'خروج از کلاس: '+tFa(tf)+' تا '+tFa(tt)+' ('+fa(mins)+' دقیقه)'});
     }
     window._evtEdit=null;closeModal();
     toast('ویرایشِ رویداد ذخیره شد — با «ثبت نهایی» قطعی می‌شود','ok');render();
   },
   'att-event-del'(){
     const which=el.dataset.w; if(which!=='late'&&which!=='exit')return;
     const sid=Number(id);
     const date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     askConfirm(which==='late'?'این رویدادِ تأخیر حذف شود؟':'این رویدادِ خروج حذف شود؟',
       ()=>{
         attDraftEvent(cid,date,sid,which,null);
         toast('حذفِ رویداد ذخیره شد — با «ثبت نهایی» قطعی می‌شود','ok');
         render();
       },
       {title:'حذف رویداد',ok:'حذف',danger:true,
        note:'رویداد از رکوردِ حضور (اگر ثبت‌شده باشد) حذف می‌شود؛ بقیهٔ رکورد دست‌نخورده می‌ماند.'});
   },
   'att-excuse-event'(){
     const which=el.dataset.w; if(which!=='late'&&which!=='exit')return;
     const sid=Number(id);
     const date=S.filters.date||todayISO();
     const cls=visibleClasses();const cid=Number(S.filters.class||cls[0].id);
     const v=(typeof attEventView==='function')?attEventView(cid,date,sid):{rec:null,late:null,exit:null};
     if(!v.rec){toast('این رویداد هنوز ثبتِ قطعی ندارد — پس از «ثبت نهایی» قابل موجه است','err');return;}
     const ef=v[which];
     if(!ef){toast('رویداد پیدا نشد','err');return;}
     const ex=which==='late'?!!ef.late_excused:!!ef.exit_excused;
     if(ex){toast('این رویداد از پیش موجه‌شده است','err');return;}
     const sc=byId('classes',cid).school_id;
     const w=(typeof attExcuseWindow==='function')
       ?attExcuseWindow(sc,date,which==='late'?ef.late_at:ef.exit_at):null;
     window._evtExcuse={recId:v.rec.id,which};
     openModal(modalTpl('موجه‌سازیِ '+(which==='late'?'تأخیر':'خروج از کلاس'),
       '<div class="small muted" style="margin-bottom:10px">رویداد از پروندهٔ حضور و غیابِ دانش‌آموز حذف می‌شود (حتی اگر مدیر تأیید کرده باشد) و پیامِ توضیحی با دلیل به صفِ اولیا و مدیر می‌رود.</div>'
       +(w?('<div class="small" style="margin-bottom:10px;font-weight:700">'+(w.open?'🕓 '+w.label:'⛔ پنجرهٔ موجه بسته است — '+w.label)+'</div>'):'')
       +f('دلیل (الزامی)',`<textarea class="input" id="att_exc_evt_reason" rows="2" placeholder="مثلاً: مأموریت اداری، مسمومیت، تماس اورژانس…"></textarea>`),
       'att-excuse-event-confirm',false,'موجه کن'));
   },
   'att-excuse-event-confirm'(){
     const e=window._evtExcuse; if(!e){closeModal();return;}
     const reason=$('#att_exc_evt_reason')?String($('#att_exc_evt_reason').value||'').trim():'';
     const r=(typeof attExcuseCore==='function')
       ?attExcuseCore(e.recId,e.which,reason)
       :{ok:false,msg:'هستهٔ موجه در دسترس نیست'};
     window._evtExcuse=null;
     closeModal();
     toast(r.ok?r.msg:r.msg,r.ok?'ok':'err');
     render();
   },
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
       attDraftClearKeepTimers(cid,date);toast('پیش‌نویس پاک شد','ok');render();
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
       if(cfg.kinds.exit)smsN+=d.newExit.length;
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
       +line('🚪','خروج از کلاس',d.newExit,'b-cyan')
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
          const evs=c.events||{};
          if(recId){const _old=byId('attendance',recId);
            const patch=Object.assign({status:c.to,class_id:cid},c.fields||{});
            /* Round 77: apply late/exit event fields (set or clear) */
            if(typeof applyAttEvents==='function')applyAttEvents(patch,evs,_old);
            patch.taken_at=(_old&&_old.taken_at)?_old.taken_at:new Date().toISOString();
            /* Round 77: 30% rule -> if total > 30% of the bell, absent */
            if(c.to!=='absent'&&typeof attOutRule==='function'){
              const view=Object.assign({},_old,patch);
              const rule=attOutRule(school,date,view);
              if(rule&&rule.over){
                patch.status='absent';
                patch.note='غیبت: مجموعِ تأخیر و خروج از کلاس بیش از ۳۰٪ زنگ بود'+
                  (patch.note?' — '+patch.note:'');
              }
            }
            update('attendance',recId,patch);
            /* ⚠️ in-window correction: silently cancel the pending
               messages this teacher created for this record. */
            if(typeof notifyCancelIfFresh==='function'){
              const role=(typeof activePersona==='function')?activePersona():S.user.role;
              const opt=(role==='manager'||role==='superadmin')?{byManager:true}:undefined;
              notifyCancelIfFresh('absence',recId,null,opt);
              notifyCancelIfFresh('late',recId,null,opt);
              notifyCancelIfFresh('exit',recId,null,opt);
            }}
          else {
            /* Round 77: event-only change with no record -> 'present' */
            const st=c.to||'present';
            const evf=Object.assign({},c.fields||{});
            if(typeof applyAttEvents==='function')applyAttEvents(evf,evs,null);
            const baseNote=(evf.note!=null)?evf.note:null;
            delete evf.note;
            const base={school_id:school,class_id:cid,
              student_id:c.student_id,date,status:st,note:baseNote,
              taken_at:new Date().toISOString()};
            if(st!=='absent'&&typeof attOutRule==='function'){
              const view=Object.assign({},base,evf);
              const rule=attOutRule(school,date,view);
              if(rule&&rule.over){
                base.status='absent';
                base.note='غیبت: مجموعِ تأخیر و خروج از کلاس بیش از ۳۰٪ زنگ بود'+
                  (baseNote?' — '+baseNote:'');
              }
            }
            recId=insert('attendance',Object.assign(base,evf)).id;
          }
          made.push({c,recId});
        });
     });
     /* پیامک پس از نوشتن ساخته می‌شود تا source_ref شناسهٔ واقعی باشد */
     let sms=0,fix=0;
     if(typeof notifyRequest==='function'){
        made.forEach(({c,recId})=>{
          const rec=(typeof byId==='function')?byId('attendance',recId):null;
          const evs=c.events||{};
          const kinds=[];
          if(rec&&rec.status==='absent')kinds.push('absence');
          if(evs.late&&evs.late!==null&&!evs.late.late_excused)kinds.push('late');
          if(evs.exit&&evs.exit!==null&&!evs.exit.exit_excused)kinds.push('exit');
          if(!kinds.length)return;
          /* ⚠️ if a message for this record was already sent, a new
             one means the family gets the same news twice. */
          const already=(typeof notifyLastSent==='function')&&
            kinds.some(k=>notifyLastSent(k,recId));
          if(already)return;
          kinds.forEach(k=>{
            const q=notifyRequest({school_id:school,kind:k,
              student_id:c.student_id,class_id:cid,student_name:c.name,
              date_fa:jalali(date),source_ref:recId});
            if(q)sms++;
          });
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
     /* E.5 فرناز: اعلان داخل‌برنامه‌ای غیبت برای والدین (با ref به رکورد).
        ضدتکرار داخل absenceNotifFor است؛ فقط برای رکوردهای غایب. */
     if(typeof absenceNotifFor==='function'){
       made.forEach(function(m){
         var rec=(typeof byId==='function')?byId('attendance',m.recId):null;
         if(rec&&rec.status==='absent')absenceNotifFor(rec);
       });
     }
     attDraftClearKeepTimers(cid,date);
     closeModal();
     toast(fa(d.changes.length)+' تغییر ثبت شد'
       +(sms?' — '+fa(sms)+' پیامک ساخته شد':'')
       +(fix?' — '+fa(fix)+' اصلاحیه ساخته شد':''),'ok');
     render();},
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
      نسخهٔ PDF قفل‌شده است — اینجا فقط چاپِ اچ‌تی‌ام‌ال است.
      🔴 دورِ ۸۹ — نشتِ دامنه (هم‌خانوادهٔ ics-export، §۰.۵.۲۰):
      این اکشن تنها عضوِ خانوادهٔ گواهی‌ها بود که `certAllowedStudent` را
      صدا نمی‌زد، درحالی‌که چهار خواهرش (`report-print`،
      `cert-enroll-print`، `cert-transfer-print`، `cert-verify`) می‌زدند.
      `sid` از `data-sid` می‌آید — یعنی ادعایِ DOM. اثباتِ زنده: ولیِ
      مدرسهٔ ۶ با دکمهٔ دست‌ساز، گواهیِ نمراتِ دانش‌آموزِ مدرسهٔ ۱ را گرفت
      **همراهِ نام و کدِ ملی**. از نشتِ ICS جدی‌تر است چون PII دارد.
      نگهبان: `tests/certify.js` بخشِ C8 (جهش‌آزموده). */
   'cert-print'(){
     const sid=Number(el.dataset.sid)||(S.user&&S.user.role==='student'?S.user.id:0);
     const chk=certAllowedStudent(sid);
     if(!chk.ok){toast(chk.msg,'err');return;}
     const d=transcriptCert(sid,V('cert_term'));
     if(!d.ok){toast(d.msg,'err');return;}
     printableDoc(d);
   },
   /* کارنامهٔ چاپ‌شونده (بند ۴.۳): قالبِ حرفه‌ایِ A4 از تبِ کارنامه.
      همان مجوزِ داده‌ایِ گواهی‌ها (certAllowedStudent). */
   'report-print'(){
     const sid=Number(el.dataset.sid)||(S.user&&S.user.role==='student'?S.user.id:0);
     const chk=certAllowedStudent(sid);
     if(!chk.ok){toast(chk.msg,'err');return;}
     const d=reportCardCert(sid,V('cert_term'),V('cert_tpl')||'classic');
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
   /* R95 (بند ۲.۵): داوریِ تعارضِ همگام‌سازی — مجوز و دامنهٔ مدرسه را
      سرور هم دوباره می‌سنجد (resolve-conflict). */
   'conflict-resolve'(){
     const cid = Number(el.dataset.cid);
     const winner = el.dataset.winner;
     if(!cid || (winner !== 'incoming' && winner !== 'server')){ toast('انتخابِ نامعتبر','err'); return; }
     if(typeof syncConflictsResolve === 'function') syncConflictsResolve(cid, winner);
   },
   /* خلاصهٔ روزانه (بند ۱.۷): برای همهٔ دانش‌آموزان فعال؛ تکراری رد می‌شود */
   'daily-summary'(){
     const r = notifyDailySummaryAll(S.user.school_id);
     toast(r.created
       ? fa(r.created)+' خلاصه در صف قرار گرفت'+(r.skipped?' ('+fa(r.skipped)+' تکراری یا بدون والد، رد شد)':'')
       : 'خلاصه‌ای ساخته نشد (همه تکراری یا بدون والد)', r.created?'ok':'err');
     render();
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
     /* دور ۱۰۰ (نقصِ ۴): پیش‌محاسبه برایِ اعلامِ جا‌نشده‌ها در تأییدیه */
     const prev=autoPlacement(list,cls);
     const unTxt=prev.unplaced.length?(' ⚠️ '+fa(prev.unplaced.length)+' نفر در ظرفیت نمی‌گنجند و چیده نمی‌شوند'
       +' (پس از ساخت کلاس موازی دوباره اجرا کنید).'):'';
     askConfirm(fa(list.length)+' دانش‌آموز بر پایهٔ کارنامه و انضباط میان '+fa(cls.length)
       +' کلاس توزیع شوند؟ توزیع طوری انجام می‌شود که میانگین کلاس‌ها به هم نزدیک بماند.'+unTxt,()=>{
       const pairs=[];
       prev.buckets.forEach(b=>b.list.forEach(s=>pairs.push({studentId:s.user.id,classId:b.cls.id})));
       const n=applyPlacement(pairs, sid);
       if(prev.unplaced.length)toast(fa(n)+' چیده شدند · ⚠️ '+fa(prev.unplaced.length)+' نفر جا نشدند — کلاس موازی بسازید','warn');
       else toast(fa(n)+' دانش‌آموز در کلاس‌ها چیده شدند','ok');
       render();
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
         const r=autoPlacement(byGroup[k],cls);
         const pairs=[];
         r.buckets.forEach(b=>b.list.forEach(s=>pairs.push({studentId:s.user.id,classId:b.cls.id})));
         total+=applyPlacement(pairs, sid);
         skipped+=r.unplaced.length; /* دور ۱۰۰ (نقصِ ۴): جا‌نشده‌ها هم «چیده‌نشده»‌اند */
       });
       toast(fa(total)+' ثبت‌نام شد'+(skipped?' · '+fa(skipped)+' نفر چیده نشدند (ظرفیت/کلاس مقصد)':''),'ok');
       render();
     },{title:'ثبت‌نام خودکار',ok:'انجام بده'});
   },
   /* ---- قیف پیش‌ثبت‌نام سال آینده (بند ۰.۲) ---- */
  /* ⚠️ دور ۷۹: اکشن‌هایِ A بدونِ پارامتر صدا زده می‌شوند (A[a]()) — el/id
     از محیّطِ کلِک‌لیسنر می‌آیند. هرگز پارامترِ اعلام‌شده نزنید؛ سایِ
     آن‌ها id/el را با undefined می‌پوشاند (باگِ واقعیِ پیشین: pre-confirm/
     pre-reject/pre-del/bus-follow-open). */
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
   'pre-confirm'(){
     const sid=S.user.school_id;
     askConfirm('این پیش‌ثبت‌نام تأیید شود؟ حساب دانش‌آموز ساخته یا به حساب موجود وصل می‌شود.',()=>{
       const r=preConfirm(sid,id);
       if(!r.ok){toast(r.err,'err');return;}
       toast(r.created?'تأیید شد و حساب دانش‌آموز ساخته شد':'تأیید شد و به حساب موجود وصل شد','ok');
       render();
     },{title:'تأیید پیش‌ثبت‌نام',ok:'تأیید کن'});
   },
   'pre-reject'(){
     update('pre_enrollments',id,{status:'rejected'});
     toast('رد شد',''); render();
   },
   'pre-del'(){
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
   /* ─────────────── بند ۴.۲: ساعتِ کارآموزی هنرستان ─────────────── */
   'internship-new'(){internshipModal(null,id?Number(id):null);},
   'internship-edit'(){internshipModal(byId('internships',id),Number(id));},
   'internship-del'(){confirmModal('حذف این ردیفِ کارآموزی؟','internship-del-ok',id);},
   'internship-del-ok'(){remove('internships',window._delId);closeModal();toast('حذف شد','ok');render();},
   'internship-save'(){const i=window._inEdit;if(!i)return;
     const hours=Number(V('in_hours'));
     if(!hours||hours<1||hours>40){toast('ساعت باید عددی بین ۱ تا ۰ باشد','err');return;}
     const data={date:V('in_date'),hours:hours,location:V('in_loc'),note:V('in_note')};
     if(i.id){update('internships',i.id,data);}
     else{const sid=Number(V('in_st'));const st=byId('users',sid);if(!st)return;
       insert('internships',Object.assign({school_id:st.school_id,student_id:sid,status:'pending',created_by:S.user.id,created_at:todayISO()},data));}
     closeModal();toast('ساعتِ کارآموزی ثبت شد','ok');render();},
   'internship-approve'(){const rec=byId('internships',id);if(!rec)return;
     if(rec.status==='approved'){toast('این رکورد از پیش تأیید شده است','err');return;}
     if(!(typeof canApproveInternship==='function'&&canApproveInternship(rec))){
       toast('فقط دبیرِ مربوطه یا مدیرِ مدرسه می‌تواند تأیید کند','err');return;}
     update('internships',rec.id,{status:'approved',approved_by:S.user.id,approved_at:todayISO()});
     toast('ساعتِ کارآموزی تأیید شد','ok');render();},
   /* ─────────────── بند ۲.۲: برنامهٔ آموزشی فردی (IEP) ─────────────── */
   'iep-edit'(){iepModal(Number(id));},
   'iep-save'(){const sid=window._iepSid;const u=byId('users',sid);if(!u)return;
     update('users',sid,{iep_notes:V('iep_notes'),iep_staff:V('iep_staff'),iep_updated:todayISO()});
     closeModal();toast('برنامهٔ آموزشی فردی ذخیره شد','ok');render();},   /* ─────────────── بند ۴.۴: قیف پیش‌ثبت‌نامِ رقابتی ─────────────── */
   'preapp-new'(){preappModal();},
   'preapp-save'(){const name=V('pa_name');const phone=V('pa_phone');
     if(!name||!phone){toast('نام و تلفن الزامی است','err');return;}
     insert('preapps',{school_id:S.user.school_id,name:name,phone:phone,note:V('pa_note'),stage:'contact',stage_at:todayISO(),created_at:todayISO()});
     closeModal();toast('پیش‌ثبت‌نام ساخته شد — مرحلهٔ تماسِ اولیه','ok');render();},
   'preapp-next'(){const r=byId('preapps',id);if(!r)return;
     let i=-1;
     for(var k=0;k<PREAPP_STAGES.length;k++){if(PREAPP_STAGES[k][0]===r.stage){i=k;break;}}
     if(i<0||i>=PREAPP_STAGES.length-1){toast('این مرحله آخرین مرحله است','err');return;}
     update('preapps',r.id,{stage:PREAPP_STAGES[i+1][0],stage_at:todayISO()});
     toast('مرحله تازه: '+PREAPP_STAGES[i+1][1],'ok');render();},
   'preapp-del'(){confirmModal('حذف این پیش‌ثبت‌نام؟','preapp-del-ok',id);},
   'preapp-del-ok'(){remove('preapps',window._delId);closeModal();toast('حذف شد','ok');render();},   /* ─────────────── بند ۲.۴: کمک‌هزینه و بورسیه ─────────────── */
   'scholar-new'(){scholarshipModal();},
   'scholar-save'(){const sid=Number(document.getElementById('sc_student').value);const u=byId('users',sid);
     if(!u){toast('دانش‌آموز انتخاب نشد','err');return;}
     insert('scholarships',{school_id:S.user.school_id,student_id:sid,status:'requested',note:V('sc_note'),created_at:todayISO(),updated_at:todayISO()});
     closeModal();toast('درخواستِ کمک‌هزینه ثبت شد','ok');render();},
   'scholar-set'(){const r=byId('scholarships',id);if(!r)return;
     const to=(el&&el.dataset)?el.dataset.to:null;
     const allowed=(SCHOLAR_NEXT[r.status]||[]).some(function(n){return n[0]===to;});
     if(!to||!allowed){toast('این جابه‌جایی مجاز نیست','err');return;}
     update('scholarships',r.id,{status:to,updated_at:todayISO()});
     const lbl=(SCHOLAR_STATUSES.find(function(x){return x[0]===to;})||['','؟'])[1];
     toast('وضعیت تازه: '+lbl,'ok');render();},
   'scholar-del'(){confirmModal('حذف رکوردِ کمک‌هزینه؟','scholar-del-ok',id);},
   'scholar-del-ok'(){remove('scholarships',window._delId);closeModal();toast('حذف شد','ok');render();},   /* ─────────────── بند ۶.۱: امتحاناتِ تجدیدی (شهریور) ─────────────── */
   'reexam-new'(){reexamModal();},
   'reexam-save'(){
     const sid=Number(document.getElementById('rx_student').value);
     const sub=Number(document.getElementById('rx_subject').value);
     const orig=V('rx_orig');
     if(!sid||!sub||orig===''){toast('دانش‌آموز، درس و نمرهٔ اصلی لازم است','err');return;}
     const o=Number(orig);
     if(o<0||o>20){toast('نمره باید ۰ تا ۲۰ باشد','err');return;}
     insert('reexams',{school_id:S.user.school_id,student_id:sid,subject_id:sub,original_score:o,exam_date:V('rx_date')||todayISO(),new_score:null,status:'scheduled',created_at:todayISO(),updated_at:todayISO()});
     closeModal();toast('درسِ تجدیدی ثبت شد','ok');render();},
   'reexam-score'(){reexamScoreModal(id);},
   'reexam-score-save'(){
     const sid=window._rxSid;const r=byId('reexams',sid);
     if(!r){closeModal();return;}
     const v=V('rx_new');
     if(v===''){toast('نمرهٔ مجدد لازم است','err');return;}
     const n=Number(v);
     if(n<0||n>20){toast('نمره باید ۰ تا ۲۰ باشد','err');return;}
     update('reexams',sid,{new_score:n,status:'done',updated_at:todayISO()});
     closeModal();toast('نمرهٔ نهایی: '+fa(n),'ok');render();},
   'reexam-del'(){confirmModal('حذف رکوردِ تجدیدی؟','reexam-del-ok',id);},
   'reexam-del-ok'(){remove('reexams',window._delId);closeModal();toast('حذف شد','ok');render();},
   /* ─────────────── بند ۶.۴: کلاس‌های تابستانی (فقط مدیر) ─────────────── */
   'summer-new'(){summerModal();},
   'summer-save'(){
     const name=V('su_name');
     const tid=Number(V('su_teacher'));
     const start=V('su_start');
     if(!name){toast('نام کلاس لازم است','err');return;}
     if(!tid){toast('دبیر را انتخاب کنید','err');return;}
     if(!start){toast('تاریخِ شروع لازم است','err');return;}
     insert('summer_classes',{school_id:S.user.school_id,name:name,teacher_id:tid,student_ids:[],start_date:start,end_date:V('su_end'),note:V('su_note'),created_at:todayISO(),updated_at:todayISO()});
     closeModal();toast('کلاسِ تابستانی ثبت شد','ok');render();},
   'summer-students'(){window._suId=Number(id);summerStudentsModal();},
   'summer-students-save'(){
     const sc=byId('summer_classes',window._suId);
     if(!sc){closeModal();return;}
     const sel=Array.from(document.querySelectorAll('.su-chk:checked')).map(c=>Number(c.value));
     if(sel.length>15){toast('هر کلاسِ تابستانی حداکثر ۱۵ نفر است','err');return;}
     update('summer_classes',sc.id,{student_ids:sel,updated_at:todayISO()});
     closeModal();toast('دانش‌آموزان به‌روز شد','ok');render();},
   'summer-del'(){confirmModal('حذف این کلاسِ تابستانی؟','summer-del-ok',id);},
   'summer-del-ok'(){remove('summer_classes',Number(window._delId));closeModal();toast('حذف شد','ok');render();},
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
    /* بند ۴.۲: نوعِ نمره — در مدرسهٔ غیرکارگاهی فیلد نیست و همیشه تئوری */
    const gkind=V('g_kind')==='practical'?'practical':'theory';
    if(g.id)update('grades',g.id,{score,term:V('g_term'),exam_type:V('g_type'),kind:gkind});
    else{const sid=Number(V('g_st')),cid=window._gclass;
      const r=insert('grades',{school_id:byId('classes',cid).school_id,student_id:sid,class_id:cid,subject_id:Number(V('g_sub')),teacher_id:S.user.role==='teacher'?S.user.id:null,term:V('g_term'),exam_type:V('g_type'),kind:gkind,score,max_score:20,created_at:todayISO()});
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
     /* د.۳ — سطح اهمیت: فقط مقدارهای معتبر؛ نبودِ فیلد (ناشرانِ بدون انتخابگر) = عادی */
     const sevEl=$('#a_sev');
     const sev=sevEl?sevEl.value:'normal';
     if(['normal','urgent','critical'].indexOf(sev)<0){toast('سطح اهمیت معتبر نیست','err');return;}
     data.severity=sev;
     if(window._annEdit)update('announcements',window._annEdit,data);
     else{
       /* اطلاعیهٔ اداره: در محدودهٔ ادارهٔ خود (school_id خالی + office_id خود)؛
          بقیهٔ نقش‌ها مثل پیش (مدرسه‌ای یا سراسری) — د.۳ */
       const base=S.user.role==='edu_office'
         ?{school_id:null,office_id:S.user.office_id||null,created_by:S.user.id,created_at:todayISO()}
         :{school_id:S.user.school_id||null,office_id:null,created_by:S.user.id,created_at:todayISO()};
       insert('announcements',Object.assign(base,data));
     }
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
  /* ── ۵.۲ — مسیرِ دوازدهم↔مشاور ── */
  'counselor-msg-send'(){
    const sid=Number(el.dataset.sid)||0;
    const target=S.user.role==='student'?S.user.id:sid;
    const res=counselorMsgSend(target,S.user,V('cmsg_body'));
    if(!res.ok){toast(res.msg,'err');return;}
    toast(res.msg,'ok');render();
  },
  'counselor-msg-reply'(){
    const sid=Number(el.dataset.sid)||0;
    const res=counselorMsgSend(sid,S.user,V('cmsg_body'));
    if(!res.ok){toast(res.msg,'err');return;}
    toast(res.msg,'ok');render();
  },
  'cmsg-open'(){S.filters.cmsg_stu=id;render();},
  'cmsg-close'(){S.filters.cmsg_stu=null;render();},
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
  /* فاز ۲: A از پارسیال‌هایِ ۱۳ ماژولِ 19-actions ساخته می‌شود —
     ترکیبِ آن (نام‌ها، بدنه‌ها، ترتیبِ تعریف) با نسخهٔ تک‌فایلی یکسان است. */
  const A=Object.assign({},
    coreActions(e,el,id,a,rawId),
    dormActions(e,el,id,a,rawId),
    dropoutActions(e,el,id,a,rawId),
    smsActions(e,el,id,a,rawId),
    financeActions(e,el,id,a,rawId),
    busActions(e,el,id,a,rawId),
    vclassActions(e,el,id,a,rawId),
    scheduleActions(e,el,id,a,rawId),
    adminActions(e,el,id,a,rawId),
    staffActions(e,el,id,a,rawId),
    trainingActions(e,el,id,a,rawId),
    drillsActions(e,el,id,a,rawId),
    donationsActions(e,el,id,a,rawId));
  if(A[a]){e.preventDefault();A[a]();}
  else if(typeof F7_ACTIONS!=='undefined'&&F7_ACTIONS[a]){e.preventDefault();F7_ACTIONS[a](el,id);}
  else if(typeof P8_ACTIONS!=='undefined'&&P8_ACTIONS[a]){e.preventDefault();P8_ACTIONS[a](el,id);}
  else if(typeof P9_ACTIONS!=='undefined'&&P9_ACTIONS[a]){e.preventDefault();P9_ACTIONS[a](el,id);}
  else if(typeof P10_ACTIONS!=='undefined'&&P10_ACTIONS[a]){e.preventDefault();P10_ACTIONS[a](el,id);}
  else if(typeof CF_ACTIONS!=='undefined'&&CF_ACTIONS[a]){e.preventDefault();CF_ACTIONS[a](el,id);} /* 66-client-features */
  else if(typeof JD_ACTIONS!=='undefined'&&JD_ACTIONS[a]){e.preventDefault();JD_ACTIONS[a](el,id);}
  else if(typeof FILTER_ACTIONS!=='undefined'&&FILTER_ACTIONS[a]){e.preventDefault();FILTER_ACTIONS[a](el,id);}
  else if(typeof SYNC_ACTIONS!=='undefined'&&SYNC_ACTIONS[a]){e.preventDefault();SYNC_ACTIONS[a](el,id);}
  else if(typeof TEVAL_ACTIONS!=='undefined'&&TEVAL_ACTIONS[a]){e.preventDefault();TEVAL_ACTIONS[a](el,id);} /* 73-teacher-eval */
  else if(typeof REGION_ACTIONS!=='undefined'&&REGION_ACTIONS[a]){e.preventDefault();REGION_ACTIONS[a](el,id);} /* 74-region-tools */
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

  /* انتخابگرِ پوسته (۶۷): <select data-act="theme-pick"> — روی change
     عمل می‌کند، نه click. `el` را محلی می‌سازیم چون این شنونده
     مثلِ شنوندهٔ click متغیّرِ el ندارد. */
  if(e.target.dataset && e.target.dataset.act==='theme-pick' &&
     typeof THEME_ACTIONS!=='undefined' && THEME_ACTIONS['theme-pick']){
    THEME_ACTIONS['theme-pick'](e.target);
    return;
  }

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



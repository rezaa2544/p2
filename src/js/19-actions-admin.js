/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات مدیریتی پایه: school-، user-، class-، subject- (office و geo در
   ماژولِ اداره‌ی کل هستند و در A نبوده‌اند).
   آبجکتِ A همچنان در همان لحظهٔ کلیک و با همان ترکیب ساخته می‌شود؛
   هر پارسیال فقط بخشِ خود را برمی‌گرداند. پارامترهای (el, id, a, rawId)
   همان محلی‌هایِ شنوندهٔ کلیک هستند — بدنهٔ اکشن‌ها عیناً جابه‌جا شده.
   ═══════════════════════════════════════════════════════════════════ */
function adminActions(e, el, id, a, rawId){
  return {
   // support tickets (G.2 farnaz)
   'ticket-new'(){ ticketModal(); },
   'ticket-save'(){
     const title=(V('tk_title')||'').trim(), pri=V('tk_pri'), desc=(V('tk_desc')||'').trim();
     if(!title){toast('عنوان درخواست الزامی است','err');return;}
     if(!TICKET_PRI[pri]){toast('اولویت معتبر نیست','err');return;}
     insert('support_tickets',{school_id:S.user.school_id,title:title,description:desc,priority:pri,status:'open',created_at:todayISO(),updated_at:todayISO()});
     closeModal(); toast('درخواست پشتیبانی ثبت شد','ok'); render();
   },
   'ticket-status'(){
     const t=byId('support_tickets',id), s=el.dataset.s;
     if(!t||!TICKET_ST[s]){toast('درخواست معتبر نیست','err');return;}
     update('support_tickets',t.id,{status:s,updated_at:todayISO()});
     toast('وضعیت تیکت: '+TICKET_ST[s][0],'ok'); render();
   },
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
       /* فاز ۰.۱ — نوع ساختاری؛ مقدارِ نامعتبر/خالی = governmental (fail-closed) */
       school_type:(typeof SCHOOL_TYPE_IDS!=='undefined'&&SCHOOL_TYPE_IDS.indexOf(V('m_school_type'))>-1)?V('m_school_type'):'governmental',
       capacity:Number(V('m_cap'))||300,
       active:Number(V('m_active')),address:V('m_addr'),boom_goals:V('m_boom'),
       public_goals:($('#m_boom_pub')&&$('#m_boom_pub').checked)?1:0,
       /* دور ۶۵ بند روزهای کاری: روزهای روشن‌شده در مودال */
       work_days:$$('.m-wd:checked').map(x=>Number(x.value)).sort((a,b)=>a-b),
       /* Round 77: excuse window (minutes after bell end) */
       excuse_window_minutes:(V('m_excuse_window')!==''?Number(V('m_excuse_window')):null),
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
   /* C.2 فرناز — برنامه ویژه مدرسه (بوم): مدیر فقط مدرسهٔ خودش */
   'school-boom'(){
     const sid=Number(id)||S.user.school_id;
     if(S.user.role!=='superadmin'&&sid!==S.user.school_id){toast('فقط مدرسهٔ خودتان','err');return;}
     boomModal(sid);},
   'school-boom-save'(){
     const sid=Number(window._boomSid)||S.user.school_id;
     if(S.user.role!=='superadmin'&&sid!==S.user.school_id){toast('فقط مدرسهٔ خودتان','err');return;}
     const g=V('boom_goals')||'';
     if(invalid('boom_goals',g.length>2000,'حداکثر ۲۰۰۰ نویسه'))return;
     update('schools',sid,{boom_goals:g,public_goals:($('#boom_pub')&&$('#boom_pub').checked)?1:0});
     closeModal();toast('برنامه ویژه ذخیره شد','ok');render();},
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
     /* S4 فرناز: معدل ورودی — خالی=null، عددِ ۰ تا ۲۰ (ارقام فارسی هم پذیرفته) */
     const _egRaw=(V('u_entry_gpa')||'').trim();
     const _egNum=Number(typeof toLatinDigits==='function'?toLatinDigits(_egRaw):_egRaw);
     const _eg=_egRaw===''?null:_egNum;
     if(invalid('u_entry_gpa',_eg!==null&&(isNaN(_eg)||_eg<0||_eg>20),'معدل ورودی باید عددی بین ۰ تا ۲۰ باشد'))return;
     const data={full_name:V('u_name'),role:V('u_role'),national_id:V('u_nid'),phone:V('u_phone'),active:Number(V('u_active')),school_id:schoolId};
     if(V('u_role')==='student')data.entry_gpa=_eg;
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
   /* ── بند ۲.۱ — کلاسِ چندپایه: عضویتِ جداگانهٔ هر درس ── */
   'class-membership'(){classMembershipModal(id);},
   'class-membership-save'(){
     const cid=window._memCid, cls=byId('classes',cid);
     if(!cls){closeModal();return;}
     const bySub=Object.create(null);
     document.querySelectorAll('.mem-cb').forEach(function(cb){
       bySub[cb.dataset.sub]=bySub[cb.dataset.sub]||[];
       if(cb.checked)bySub[cb.dataset.sub].push(Number(cb.dataset.stu));
     });
     const allKids=studentsOfClass(cls.id);
     Object.keys(bySub).forEach(function(subId){
       const s=Number(subId);
       (db.class_subject_members||[]).filter(function(x){return x.class_id===cls.id&&x.subject_id===s;})
         .forEach(function(x){remove('class_subject_members',x.id);});
       const chosen=bySub[subId];
       /* همهٔ کلاس (یا خالی) ⇒ بدون ردیف = fallback = رفتارِ امروز */
       if(chosen.length&&chosen.length<allKids.length)
         chosen.forEach(function(k){insert('class_subject_members',{class_id:cls.id,subject_id:s,student_id:k});});
     });
     closeModal();toast('عضویتِ دروس ذخیره شد','ok');render();
   },
   'class-save'(){const c=window._edit;
     if(need('c_name','نام کلاس الزامی است'))return;
     /* نوع چیدمان: انتخاب مدیر، وگرنه حدس از روی پایه */
     const _md=V('c_mode')||'';
     const _gl=(typeof gradeFromName==='function')?gradeFromName(V('c_grade')||V('c_name')):null;
     const _mode=_md||(_gl&&Number(_gl)>=10?'field':_gl?'class':'');
     /* در کلاس‌محور رشته معنا ندارد؛ در رشته‌محور الزامی است */
     if(invalid('c_field',_mode==='field'&&!V('c_field'),'در کلاس رشته‌محور، انتخاب رشته الزامی است'))return;
     const data={name:V('c_name'),grade:V('c_grade'),field:_mode==='class'?null:(V('c_field')||null),class_mode:_mode||null,grade_level:_gl||null,room:V('c_room'),capacity:Number(V('c_cap'))||30,homeroom_teacher_id:V('c_ht')?Number(V('c_ht')):null};
     if($('#c_multigrade'))data.multigrade=$('#c_multigrade').checked?1:0;
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
  };
}

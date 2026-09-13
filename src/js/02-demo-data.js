/* ═══════════════════════════════════════════════════════════════════
   دادهٔ نمونه
   ساخت دادهٔ قطعی با مولد شبه‌تصادفی ثابت. شیء db اینجا تعریف می‌شود.
   ═══════════════════════════════════════════════════════════════════ */
let SEED=20260901;
function rng(){SEED=(SEED*1664525+1013904223)%4294967296;return SEED/4294967296;}
const ri=n=>Math.floor(rng()*n), pick=a=>a[ri(a.length)], chance=p=>rng()<p;
const MALE=['امیرعلی','محمدحسین','آرش','سینا','پارسا','کیان','رضا','مهدی','علی','حسین','امیرحسین','یاسین','ماهان','بردیا','سبحان','ایلیا','دانیال','آرمین','فرهاد','بهنام','سعید','نیما','پویا','کامران','مسعود','حامد','شایان','رامتین','عرفان','میثم'];
const FEMALE=['زهرا','فاطمه','نازنین','هستی','ریحانه','مریم','سارا','یلدا','باران','ترنم','مبینا','دیانا','آیدا','نگار','الهام','شقایق','پرنیان','سوگند','ملیکا','رها','آناهیتا','کیمیا','هلیا','سمانه','بهاره','نیایش','آتنا','رعنا','مهسا','غزل'];
const LAST=['محمدی','حسینی','رضایی','کریمی','موسوی','جعفری','احمدی','صادقی','قاسمی','نوروزی','شریفی','عباسی','یوسفی','هاشمی','فرهادی','مرادی','اکبری','سلطانی','کاظمی','زارع','نجفی','رحیمی','بهرامی','امینی','طاهری','خسروی','دهقان','اسدی','فتحی','ملکی'];
const CITIES=['تهران','مشهد','اصفهان','شیراز','تبریز','کرج'];
const SUBJ=[['ریاضی','MATH',5],['علوم تجربی','SCI',4],['فیزیک','PHY',4],['شیمی','CHM',3],['ادبیات فارسی','LIT',4],['عربی','ARB',2],['زبان انگلیسی','ENG',3],['مطالعات اجتماعی','SOC',2],['دین و زندگی','REL',2],['هنر','ART',1],['تربیت بدنی','PE',2],['رایانه','CS',2]];
const POS=[['مشارکت فعال در کلاس',5],['کمک به همکلاسی',4],['نظم و انضباط نمونه',5],['رتبه برتر مسابقات علمی',10],['حضور در فعالیت فرهنگی',6]];
const NEG=[['تأخیر در ورود به کلاس',-3],['بی‌نظمی در کلاس',-5],['انجام‌ندادن تکالیف',-4],['استفاده از تلفن همراه',-6],['غیبت غیرموجه',-8]];
/* عنصر پنجم: شاخه‌های متوسطه دوم. مدارس غیرمتوسطه‌دوم آرایهٔ خالی دارند.
   «مجتمع ایران‌زمین» عمداً دو شاخه دارد تا حالت چندشاخه‌ای آزموده شود. */
const SCHOOL_DEFS=[
  ['دبیرستان شهید بهشتی','SH-101','متوسطه دوم','پسرانه',['نظری'],'علوم تجربی',{has_tuition:1,has_dorm:1,has_iep:1,has_workshop:1,has_multigrade:1,has_second_term_exam:1}],
  ['دبیرستان فرزانگان','FZ-102','متوسطه دوم','دخترانه',['نظری'],'ریاضی',{has_tuition:1,has_dorm:1,has_iep:1,has_workshop:1,has_multigrade:0,has_second_term_exam:1}],
  ['مدرسه نمونه علامه حلی','AH-103','متوسطه اول','پسرانه',[],'عادی',{has_tuition:1,has_dorm:1,has_iep:1,has_workshop:0,has_multigrade:0,has_second_term_exam:1}],
  /* MM-104: غیردولتی با شاخهٔ نوبت دوم (کلاس‌های شبانهٔ بزرگسالان) — دِمؤ توانِ has_evening (دور ۷۸) */
  ['دبیرستان مریم مقدس','MM-104','متوسطه اول','دخترانه',[],'عادی',{has_tuition:1,has_dorm:0,has_iep:0,has_workshop:0,has_multigrade:0,has_second_term_exam:1,has_evening:1}],
  ['مجتمع آموزشی ایران‌زمین','IZ-105','متوسطه دوم','پسرانه',['فنی و حرفه‌ای','کاردانش'],'فنی و حرفه‌ای',{has_tuition:1,has_dorm:1,has_iep:0,has_workshop:1,has_multigrade:1,has_second_term_exam:1}],
  ['دبستان و متوسطه اندیشه','AN-106','متوسطه اول','دخترانه',[],'عادی',{has_tuition:0,has_dorm:0,has_iep:0,has_workshop:0,has_multigrade:0,has_second_term_exam:1}]];

let db, ids={};
/* ستونِ password: آرشیوی — محصول رمز عبور ندارد (ورود فقط با تلفن؛ 📄 docs/PLAN_PHONE_AUTH.md).
   مقدار ثابت '123456' فقط پرکنندهٔ دمو است و در هیچ جایِ ورود استفاده نمی‌شود.
   (TODOی bcrypt که اینجا بود، با حذفِ مفهومِ رمز از محصول بی‌کاربرد شده و در دور ۷۸ پاک شد.) */

/* ---- شناسه‌های ساختگی برای نسخهٔ دمو ----
   ⚠️ قاعده: هیچ دادهٔ واقعی وارد نسخهٔ دمو نمی‌شود.
   کد ملی از بازهٔ ۹۹۹… ساخته می‌شود که در واقعیت صادر نمی‌شود، و
   تلفن با پیش‌شمارهٔ ۰۹۹۹ که در ایران به هیچ اپراتوری تخصیص نیافته
   است. اگر عدد کاملاً تصادفی می‌ساختیم، ممکن بود اتفاقاً با شمارهٔ
   یک شهروند واقعی یکی شود. */
/* کد ملی ساختگی معتبر. makeNid در 21-exams تعریف شده و آنجا بارگذاری
   می‌شود؛ اینجا تا آماده شدنش نسخهٔ محلی با همان قاعده کار می‌کند. */
const nid=()=>{
  let b='999'; for(let i=0;i<6;i++) b += Math.floor(rng()*10);
  const s=b.split('').reduce((a,d,i)=>a+Number(d)*(10-i),0)%11;
  return b+String(s<2?s:11-s);
};
/** شمارهٔ تلفن ساختگی — پیش‌شمارهٔ ۰۹۹۹ به هیچ اپراتوری تعلق ندارد */
const demoPhone=()=>'0999'+String(1000000+Math.floor(rng()*8999999));
function nextId(c){ids[c]=(ids[c]||0)+1;return ids[c];}
/**
 * افزودن رکورد به دادهٔ نمونه.
 * ⚠️ برخلاف insert()، این تابع در دفترچهٔ عملیات ثبت نمی‌شود چون
 * دادهٔ پایه است نه تغییر کاربر. اما باید ایندکس را باطل کند، وگرنه
 * اگر ایندکسی پیش از پایان تولید داده ساخته شده باشد کهنه می‌ماند و
 * byId() رکوردهای تازه را پیدا نمی‌کند.
 */
function add(c,o){
  o.id=nextId(c);
  db[c].push(o);
  if(typeof idxInvalidate==='function') idxInvalidate(c);
  return o;
}

function schoolDays(n){const out=[];for(let d=0;d<n*1.5&&out.length<n;d++){const iso=daysAgoISO(d);const w=new Date(iso).getDay();if(w===4||w===5)continue;out.push(iso);}return out;}

function generate(){
  SEED=20260901; ids={};
  db={school_years:[],teacher_notes:[],sms_wallet:[],sms_log:[],notify_queue:[],meeting_slots:[],student_transfers:[],transfer_requests:[],student_archive:[],nid_conflicts:[],schools:[],users:[],subjects:[],classes:[],enrollments:[],parent_links:[],schedule:[],substitutions:[],attendance:[],grades:[],discipline:[],announcements:[],notifications:[],leaves:[],calendar:[],messages:[],tuition_plans:[],tuitions:[],installments:[],transactions:[],teacher_schools:[],exam_terms:[],exams:[],exam_duties:[],parent_verifications:[],corrections:[],provinces:[],counties:[],districts:[],offices:[],parent_subscriptions:[],subscription_payments:[],app_settings:[],bell_schedules:[],counselor_refs:[],counselor_msgs:[],pre_enrollments:[],bus_routes:[],bus_students:[],bus_events:[],bus_needs:[],bus_locations:[],bus_followups:[],vclass_sessions:[],vclass_attendance:[],vclass_questions:[],vclass_links:[],class_subject_members:[],hw_assignments:[],hw_submissions:[],dojo_types:[],attendance_modes:[],certificates:[],visitors:[],lib_books:[],lib_loans:[],assets:[],sedascores:[],makeup_classes:[],nudges:[],teacher_sms:[],internships:[],preapps:[],scholarships:[],reexams:[],assoc_minutes:[],summer_classes:[],dorm_rooms:[],dorm_assignments:[],dorm_meals:[],support_tickets:[],staff_attendance:[],training_courses:[],safety_drills:[],donations:[],staff_posts:[],report_logs:[]};
  add('users',{school_id:null,role:'superadmin',full_name:'مدیر کل سامانه',username:'superadmin',password:'123456',national_id:nid(),phone:demoPhone(),active:1,created_at:daysAgoISO(400)});
  const dates=schoolDays(20);
  let sCount=0;
  SCHOOL_DEFS.forEach((def,si)=>{
    const [name,code,level,gender,branches,type,caps]=def, city=CITIES[si%CITIES.length];
    /* رشته‌های مدرسه = همهٔ رشته‌های شاخه‌هایی که ارائه می‌دهد */
    const sFields=(branches||[]).reduce((a,b)=>a.concat(fieldsOfBranch(b)),[]);
    const school=add('schools',{name,code,city,address:city+'، خیابان '+pick(['آزادی','ولیعصر','معلم','شریعتی','امام خمینی'])+'، پلاک '+(10+ri(200)),phone:demoPhone(),level,type:type||'عادی',gender,branches:branches||[],fields:sFields,
      /* si===3 (MM-104) «هر دو»: روز + شاخهٔ شبانهٔ بزرگسالان (دور ۷۸) */
      shift: si===4 ? 'بعدازظهر' : (si===1||si===3 ? 'هر دو' : 'صبح'),capacity:400+ri(200),active:si===5?0:1,public_goals:0,
      /* پروفایل قابلیت: هر مدرسه کلیدهای مستقل روشن/خاموش دارد؛
         در نبود مقدار، پیش‌فرض‌های CAP_DEFAULTS اعمال می‌شود. */
      capabilities: caps||null,
      /* بند ۵: ساختار «سازمان» — امروز همیشه خالی (تک‌مدرسه).
         قفل‌شده و مستند در ARCHITECTURE_DECISIONS.md: پیاده‌سازی کامل
         وقتی دو مدرسه با یک مالک مشترک وارد سامانه شوند. */
      /* دور ۶۵ بند روزهای کاری: پیش‌فرض شنبه تا چهارشنبه؛ SH-101 پنجشنبه هم کار می‌کند (دمو) */
      work_days: si===0?[0,1,2,3,4,5]:[0,1,2,3,4],
      organization_id: null,
      created_at:daysAgoISO(500-si*20)});
    const first = gender==='پسرانه'?MALE:FEMALE;
    const manager=add('users',{school_id:school.id,role:'manager',full_name:pick(first)+' '+pick(LAST),username:'manager'+(si+1),password:'123456',national_id:nid(),phone:demoPhone(),active:1,title:'مدیر مدرسه',created_at:daysAgoISO(480)});
    add('users',{school_id:school.id,role:'manager',full_name:pick(first)+' '+pick(LAST),username:'deputy'+(si+1),password:'123456',national_id:nid(),phone:demoPhone(),active:1,title:'معاون آموزشی',created_at:daysAgoISO(470)});
    /* روزِ جبرانی (دمو): اولین جمعهٔ پیشِ رو برای FZ-102 */
    if(si===1){/* جمعهٔ پیشِ رو — getDay در JS: جمعه=۵ (نزدِ جدولِ برنامه شنبه=۰!) */var _frOff=(5-new Date().getDay()+7)%7; if(_frOff===0)_frOff=7; add('makeup_classes',{school_id:school.id,date:addDaysISO(todayISO(),_frOff),note:'روزِ جبرانی (دمو)'});}
    /* دروس بر اساس برنامه‌ی درسی واقعی: پایه‌ها و (در متوسطه دوم) رشته‌ها */
    const _lvGrades = GRADES_OF_LEVEL[level] || [];
    const _lvFields = needsField(level) ? ['ریاضی فیزیک','علوم تجربی','ادبیات و علوم انسانی'] : [''];
    const subs=[];
    _lvGrades.forEach(g=>_lvFields.forEach(fd=>{
      booksFor(g,fd).forEach(([bn,bh])=>{
        if(subs.some(x=>x.name===bn&&x.grade===g&&(x.field||'')===fd))return;
        subs.push(add('subjects',{school_id:school.id,name:bn,code:'',
          weekly_hours:Number(String(bh).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))||2,
          grade:g,field:fd}));
      });
    }));
    const teachers=[];
    for(let t=0;t<12;t++){const s=subs[t%subs.length];
      teachers.push(add('users',{school_id:school.id,role:'teacher',full_name:pick(first)+' '+pick(LAST),username:'teacher'+(si+1)+'_'+(t+1),password:'123456',national_id:nid(),phone:demoPhone(),active:1,subject_id:s.id,subject:s.name,degree:pick(['کارشناسی','کارشناسی ارشد','دکتری']),created_at:daysAgoISO(460-t)}));}
    const grades = _lvGrades;
    const fields = needsField(level)?_lvFields:['عمومی'];
    const classes=[];
    grades.forEach(g=>fields.forEach((f,fi)=>{
      const cname = f==='عمومی'? g+' - '+['الف','ب','ج'][fi] : g+' '+f;
      classes.push(add('classes',{school_id:school.id,name:cname,grade:g,field:f,room:'کلاس '+(100+classes.length+1),capacity:30,homeroom_teacher_id:teachers[classes.length%teachers.length].id}));
    }));
    const chosen=subs.slice(0,8);
    /* ─────────── خانوادهٔ چندفرزندی (دور ۴۶) ───────────
       تا پیش از این هر دانش‌آموز یک ولیِ تازه می‌گرفت، پس رابطه
       همیشه یک‌به‌یک بود و قابلیت سوییچ بین فرزندان — که از نظر
       کد کار می‌کرد — در دمو نامرئی می‌ماند.

       ⚠️ انتخاب **قطعی** است نه تصادفی: generate() با SEED ثابت
       اجرا می‌شود و اگر این انتخاب به rng() وابسته باشد، هر بار
       خانوادهٔ متفاوتی چندفرزندی می‌شود و آزمون‌ها ناپایدار.

       قاعده: هر دومین دانش‌آموز از هر چهارتا به خانوادهٔ قبلی
       می‌پیوندد ⇒ حدود ۲۵٪ خانواده‌ها دوفرزندی. مبنا: بُعد خانوار
       ایران ~۳٫۳ نفر یعنی میانگین ~۱٫۳ فرزند.

       ⚠️ این تغییر حجم را **کم** می‌کند: هر ادغام یک رکورد ولی
       (۲۲۳ بایت) حذف می‌کند و فقط یک parent_links (۵۹ بایت)
       می‌ماند. */
    let famParent=null;          /* ولیِ خانوادهٔ در حال ساخت */
    let famSize=0;               /* چند فرزند تا الان گرفته */
    let famLast='';              /* نام خانوادگی مشترک */
    let famTarget=1;             /* این خانواده چند فرزند بگیرد */
    let famIndex=0;              /* شمارندهٔ خانواده در این مدرسه */
    classes.forEach(c=>{
      /* ⚠️ شش زنگ درسی (دور ۵۰): الگوی پیش‌فرض BELL_PRESETS پنج
         زنگ درسی دارد؛ با ۴ زنگ در جدول برنامه، زنگ ۵ هیچ کلاسی
         نداشت و `teacherNowClass` برایش null می‌داد — فنی درست
         ولی در دمو گیج‌کننده. تصمیم رضا: دادهٔ نمونه گسترش یابد،
         نه کاهش الگو. شش زنگ حاشیهٔ امن هم می‌دهد. */
      /* ⚠️ باگ پنجشنبه (ویو ۲۰): حلقهٔ قبلی روزها را سخت‌کد ۰ تا ۴
         می‌پیمود، ولی مدرسهٔ دمو (si=0) روزهای کاریِ [۰..۵] دارد و
         بلوک جابه‌جای هم برای پنجشنبه (dow0=5) اسلاتِ روز ۵ می‌خواست —
         در پنجشنبه‌ها اسلات پیدا نمی‌شد و `slot.teacher_id` کلِ ساختِ
         دمو را می‌کُشت. حالا پیمایش طبق work_days خود مدرسه است. */
      for(const d of (school.work_days&&school.work_days.length?school.work_days:[0,1,2,3,4]))for(let p=1;p<=6;p++){const s=chosen[(d*6+p)%chosen.length];const t=teachers.find(x=>x.subject_id===s.id)||teachers[0];
        add('schedule',{school_id:school.id,class_id:c.id,subject_id:s.id,teacher_id:t.id,day:d,period:p});}
      /* جابه‌جای موقت نمونه (بند ۱.۵): فقط برای مدرسهٔ اول و وقتی
         امروز روزِ مدرسه است — تا نمای «جابه‌جای» در دمو قابل دیدن
         باشد. تاریخِ امروز روی همان روز هفتهٔ زنگ است. */
      if(school.id===1){
        const dow0=(new Date(todayISO()+'T12:00:00').getDay()+1)%7;
        /* هفتهٔ مدرسه پنج‌روزه است (شنبه..چهارشنبه = 0..4)؛ روی پنجشنبه (۵) و
           جمعه (۶) زنگ روزِ جاری در جدول نیست و `slot` undefined می‌شد (کرشِ
           بوتِ دمو در چهارشنبه — دور ۱۱۱) → روزِ زنگ = اولین روز هفته.
           تاریخِ جابه‌جای همان قراردادِ پیشین می‌ماند: امروز (پنجشنبه) یا
           فردا (جمعه) تا بند ۱.۵ِ smoke «جابه‌جایِ امروز» دیده شود. */
        const dow=dow0<=4?dow0:0;
        const dt=dow0<=5?todayISO():addDaysISO(todayISO(),1);
        /* فِلبکِ دفاعی: اگر به‌هر‌دلیلی زنگِ همان روز نبود، همان period از
           هر روزِ معتبر انتخاب می‌شود. */
        let slot=db.schedule.find(x=>x.class_id===classes[0].id&&x.day===dow&&x.period===2);
        if(!slot) slot=db.schedule.find(x=>x.class_id===classes[0].id&&x.period===2);
        const sub=teachers.find(t=>t.id!==slot.teacher_id)||teachers[0];
        add('substitutions',{school_id:school.id,schedule_id:slot.id,sub_teacher_id:sub.id,date:dt,created_at:todayISO()});
      }
      const per=13+ri(4);
      for(let k=0;k<per;k++){
        sCount++;
        /* آیا این دانش‌آموز به خانوادهٔ قبلی می‌پیوندد؟ */
        const joinFamily = famParent && famSize < famTarget;
        const ln = joinFamily ? famLast : pick(LAST);
        const st=add('users',{school_id:school.id,role:'student',full_name:pick(first)+' '+ln,username:'student'+sCount,password:'123456',national_id:nid(),phone:demoPhone(),active:chance(.98)?1:0,created_at:daysAgoISO(300+ri(120))});
        add('enrollments',{school_id:school.id,class_id:c.id,student_id:st.id});
        if(joinFamily){
          /* خواهر/برادر: ولیِ موجود، نام خانوادگی یکسان، بدون رکورد کاربر تازه */
          add('parent_links',{parent_id:famParent.id,student_id:st.id,relation:'پدر'});
          famSize++;
        } else {
          const pa=add('users',{school_id:school.id,role:'parent',full_name:pick(MALE)+' '+ln,username:'parent'+sCount,password:'123456',national_id:nid(),phone:demoPhone(),active:1,job:pick(['کارمند','آزاد','پزشک','مهندس','معلم']),created_at:daysAgoISO(300)});
          add('parent_links',{parent_id:pa.id,student_id:st.id,relation:'پدر'});
          /* خانوادهٔ تازه: اندازه‌اش را همین‌جا قطعی تعیین می‌کنیم.
             دو خانوادهٔ نخستِ مدرسهٔ اول سه‌فرزندی می‌شوند تا حالت
             «بیش از دو» هم در دمو آزمودنی باشد. */
          famIndex++;
          famParent=pa; famSize=0; famLast=ln;
          famTarget = (si===0 && (famIndex===2 || famIndex===4)) ? 2
                    : (famIndex % 4 === 2 ? 1 : 0);
        }
        dates.forEach(iso=>{const r=rng();if(iso===todayISO())return; /* Round 77: today starts UNMARKED - the teacher marks it live (no preset 'حاضر'). ⚠️ rng() before the skip: the demo RNG stream must not shift (sample accounts!). */ let s='present';if(r>.97)s='absent';else if(r>.94)s='late';else if(r>.925)s='early_exit';else if(r>.915)s='excused';
          const rec={school_id:school.id,class_id:c.id,student_id:st.id,date:iso,status:s,note:s==='excused'?'مرخصی با اطلاع ولی':null};
          /* بند 15.1: وضعیت‌های زمان‌دار — ⚠️ بدون مصرفِ rng(): ساعت/دقیقه
             از هاشِ قطعیِ شناسه+تاریخ می‌آید تا جریانِ RNG (و حساب‌های
             دموِ بعدی) دست‌نخورده بماند. */
          const sv=(st.id*31+iso.charCodeAt(iso.length-1)*7+iso.charCodeAt(iso.length-2)*13)%97;
          if(s==='late'){rec.late_at='08:'+String(10+sv%45).padStart(2,'0');rec.late_minutes=15+sv%40;}
          if(s==='early_exit'){rec.exit_at='11:'+String(30+((sv>>2)%25)).padStart(2,'0');rec.exit_minutes=40+((sv>>3)%60);}
          /* دور ۷۵: لحظهٔ حاضر و غیاب‌زدن (مبنایِ تبدیلِ خودکارِ غیبت به
             تأخیر) — از همان هاشِ قطعی، بدونِ مصرفِ rng() */
          rec.taken_at=iso+'T07:'+String(50+(sv%10)).padStart(2,'0')+':00';
          add('attendance',rec);});
        chosen.forEach(s=>{const t=teachers.find(x=>x.subject_id===s.id)||teachers[0];const base=11+rng()*8;
          [['نوبت اول','کلاسی'],['نوبت اول','پایان‌ترم'],['نوبت دوم','میان‌ترم']].forEach(tt=>{
            const sc=Math.max(4,Math.min(20,base+(rng()*4-2)));
            add('grades',{school_id:school.id,student_id:st.id,class_id:c.id,subject_id:s.id,teacher_id:t.id,term:tt[0],exam_type:tt[1],score:Math.round(sc*4)/4,max_score:20,created_at:daysAgoISO(ri(90))});});});
        const n=ri(4);
        for(let e=0;e<n;e++){const p=chance(.55);const it=p?pick(POS):pick(NEG);
          add('discipline',{school_id:school.id,student_id:st.id,date:daysAgoISO(ri(60)),kind:p?'positive':'negative',title:it[0],description:p?'ثبت‌شده توسط دبیر مربوطه':'گزارش معاون انضباطی',points:it[1],created_by:manager.id});}
      }
    });
    add('announcements',{school_id:school.id,title:'برنامه امتحانات نوبت دوم',body:'برنامه امتحانات پایانی از تاریخ ۱۵ خرداد آغاز می‌شود. دانش‌آموزان موظف به رعایت زمان‌بندی اعلام‌شده هستند.',audience:'all',created_by:manager.id,created_at:daysAgoISO(3)});
    add('announcements',{school_id:school.id,title:'جلسه اولیا و مربیان',body:'جلسه عمومی اولیا و مربیان روز چهارشنبه ساعت ۱۶ در سالن اجتماعات مدرسه برگزار می‌شود. حضور والدین گرامی الزامی است.',audience:'parent',created_by:manager.id,created_at:daysAgoISO(5)});
    add('announcements',{school_id:school.id,title:'ثبت نمرات میان‌ترم',body:'همکاران محترم تا پایان هفته جاری نسبت به ثبت نمرات میان‌ترم در سامانه اقدام فرمایند.',audience:'teacher',created_by:manager.id,created_at:daysAgoISO(7)});
    /* امتحان نهایی (دور ۶۳، بند ۵): مدرسهٔ اول یک فصل منتشرشده با
       یک جلسهٔ نهاییِ دوازدهم دارد تا نشان «نهایی» در نماهای
       مدیر/دبیر/دانش‌آموز در دمو دیده شود. ⚠️ با add() — دادهٔ
       پایه، بدون ثبت در دفترچهٔ عملیات. */
    if(si===0){
      const f12=db.classes.filter(c=>c.school_id===school.id&&c.grade==='دوازدهم')[0];
      const fsub=f12?db.subjects.find(s2=>s2.school_id===school.id&&s2.grade==='دوازدهم'):null;
      if(f12&&fsub){
        const ft=add('exam_terms',{school_id:school.id,title:'امتحانات نهایی',term:'نوبت دوم',
          start_date:addDaysISO(todayISO(),5),end_date:addDaysISO(todayISO(),12),
          note:'جلسات امتحان نهایی پایهٔ دوازدهم',status:'published'});
        const fe=add('exams',{school_id:school.id,term_id:ft.id,class_id:f12.id,subject_id:fsub.id,
          date:ft.start_date,start_time:'09:00',duration:90,room:'سالن بزرگ',max_score:20,source:'national_final'});
        /* یک جلسهٔ جبرانی (بند ۳) تا منشأ سوم در دمو دیده شود */
        const f11=db.classes.filter(c=>c.school_id===school.id&&c.grade==='یازدهم')[0];
        const fsub11=f11?db.subjects.find(s2=>s2.school_id===school.id&&s2.grade==='یازدهم'):null;
        if(f11&&fsub11){
          add('exams',{school_id:school.id,term_id:ft.id,class_id:f11.id,subject_id:fsub11.id,
            date:addDaysISO(todayISO(),2),start_time:'11:00',duration:90,room:'سالن کوچک',max_score:20,source:'makeup'});
        }
        const ftch=db.users.find(u2=>u2.school_id===school.id&&u2.role==='teacher');
        if(ftch)add('exam_duties',{exam_id:fe.id,teacher_id:ftch.id,role:'main'});
      }
    }
    /* نمرهٔ عملی/کارگاهی + ساعتِ کارآموزی (بند ۴.۲): فقط مجتمع ایران‌زمین
       (فنی و حرفه‌ای/کاردانش). ⚠️ بدون مصرفِ rng(): همهٔ مقادیر قطعی‌اند
       تا جریانِ دنیای دمو (حساب‌های بعدی) دست‌نخورده بماند. */
    if(si===4){
      const w12=db.classes.filter(c=>c.school_id===school.id&&c.grade==='دوازدهم')[0];
      if(w12){
        const wstuds=db.users.filter(u=>u.role==='student'&&(db.enrollments.some(e=>e.class_id===w12.id&&e.student_id===u.id))&&u.active);
        const wteach=db.users.find(u=>u.school_id===school.id&&u.role==='teacher');
        const wsubs=db.subjects.filter(s2=>s2.school_id===school.id).slice(0,2);
        wstuds.slice(0,4).forEach(function(st,idx){
          if(idx<2&&wsubs[0]&&wteach){
            add('grades',{school_id:school.id,student_id:st.id,class_id:w12.id,subject_id:wsubs[0].id,teacher_id:wteach.id,term:'نوبت اول',exam_type:'کارگاهی',kind:'practical',score:16+idx*2,max_score:20,created_at:daysAgoISO(30-idx)});
          }
          /* E.1 — نمرهٔ ترکیبی تئوری/عملی (قطعی، بدون rng): دانش‌آموزِ
             نخست، درسِ دوم — تئوری ۱۵ + عملی ۱۷ ⇒ نهایی ۱۶ (میانگین). */
          if(idx===0&&wsubs[1]&&wteach){
            add('grades',{school_id:school.id,student_id:st.id,class_id:w12.id,subject_id:wsubs[1].id,teacher_id:wteach.id,term:'نوبت اول',exam_type:'میان‌ترم',kind:'theory',theoretical_score:15,practical_score:17,score:16,is_vocational:true,max_score:20,created_at:daysAgoISO(28)});
          }
          /* دو جلسهٔ کارآموزی: جلسهٔ اول تأییدشده، جلسهٔ دوم در انتظار (برای idx زوج) */
          add('internships',{school_id:school.id,student_id:st.id,date:daysAgoISO(21-idx*7),hours:16,location:idx%2?'کارگاهِ صنعتیِ شهر':'معاونتِ فنیِ منطقه',status:'approved',approved_by:wteach?wteach.id:null,approved_at:daysAgoISO(18-idx*7),note:'حضورِ کامل',created_by:manager.id,created_at:daysAgoISO(21-idx*7)});
          if(idx%2===0){
            add('internships',{school_id:school.id,student_id:st.id,date:daysAgoISO(7-idx*3),hours:24,location:'کارگاهِ صنعتیِ شهر',status:'pending',note:'در انتظارِ تأییدِ دبیر',created_by:manager.id,created_at:daysAgoISO(7-idx*3)});
          }
        });
      }
    }
  });
  /* قیف پیش‌ثبت‌نامِ رقابتی (بند ۴.۴): چند ردیف تا قیف در دمو دیده شود.
     ⚠️ بدون مصرفِ rng() — مقادیر قطعی. */
  (function(){
    var defs=[
      [1,'contact','تماسِ تلفنیِ اول — دربارهٔ شهریه پرسید',14],
      [1,'visit','بازدیدِ انجام شد؛ نوبتِ آزمونِ ورودی می‌گیرد',7],
      [2,'exam','آزمونِ ورودی را داد — در انتظارِ اعلامِ نتیجه',4],
      [5,'enrolled','با موفقیت قبول شد و ثبت‌نامِ قطعی انجام داد',2]
    ];
    var names=['سارا محمدی','امیرحسین رستمی','نگار احمدی','پارسا کریمی'];
    defs.forEach(function(d,idx){
      add('preapps',{school_id:d[0],name:names[idx],phone:'0912'+String(1000000+idx*137).slice(0,7),note:d[2],stage:d[1],stage_at:daysAgoISO(d[3]),created_at:daysAgoISO(d[3]+10)});
    });
  })();
  /* امتحاناتِ تجدیدی (بند ۶.۱): دو رکوردِ نمونه */
  (function(){
    var school1=db.schools.find(function(x){return x.id===1;});
    var studs=db.users.filter(function(u){return u.role==='student'&&u.school_id===1&&u.active;});
    var subs=db.subjects.slice(0,2);
    if(studs.length<2||subs.length<2) return;
    add('reexams',{school_id:1,student_id:studs[1].id,subject_id:subs[0].id,original_score:9,exam_date:daysAgoISO(-12),new_score:null,status:'scheduled',created_at:daysAgoISO(6),updated_at:daysAgoISO(6)});
    add('reexams',{school_id:1,student_id:studs[2].id,subject_id:subs[1].id,original_score:11,exam_date:daysAgoISO(3),new_score:14,status:'done',created_at:daysAgoISO(15),updated_at:daysAgoISO(2)});
  })();
  /* کمک‌هزینه (بند ۲.۴): رکوردهای نمونه — فقط ثبت، بدون پرداخت */
  /* صورت‌جلسهٔ انجمن (بند ۶.۲): دو رکوردِ نمونه — مدرسهٔ دولتیِ اندیشه (۶) */
  /* کلاس‌های تابستانی (بند ۶.۴): دو کلاسِ نمونه — جدا از سالِ رسمی */
  (function(){
    var t=db.users.filter(function(u){return u.role==='teacher'&&u.school_id===1&&u.active;});
    var studs=db.users.filter(function(u){return u.role==='student'&&u.school_id===1&&u.active;});
    if(t.length<2||studs.length<4) return;
    add('summer_classes',{school_id:1,name:'تکمیلی ریاضی تابستان',teacher_id:t[0].id,student_ids:[studs[0].id,studs[1].id,studs[2].id],start_date:'2026-06-14',end_date:'2026-07-15',note:'ساعت ۹ تا ۱۱ — سه‌شنبه‌ها',created_at:'2026-06-01',updated_at:'2026-06-10'});
    add('summer_classes',{school_id:1,name:'کارگاه انگلیسی تابستان',teacher_id:t[1].id,student_ids:[studs[3].id,studs[4].id],start_date:'2026-06-20',end_date:'',note:'',created_at:'2026-06-05',updated_at:'2026-06-05'});
  })();

  (function(){
    var s6=db.schools.find(function(x){return x.id===6;});
    if(!s6)return;
    add('assoc_minutes',{school_id:6,meeting_date:daysAgoISO(40),attendees:'آقای کریمی — رئیس انجمن\nسرکار خانم موسوی — نمایندهٔ اولیا\nآقای نجفی — مدیر مدرسه',resolutions:'تصویبِ کمکِ داوطلبانهٔ ۱۰ میلیونی برای کتابخانه\nتعیینِ اردوی پاییزی در اواخرِ مهر',archived:true,created_at:daysAgoISO(40),updated_at:daysAgoISO(38)});
    add('assoc_minutes',{school_id:6,meeting_date:daysAgoISO(5),attendees:'آقای کریمی — رئیس انجمن\nسرکار خانم موسوی — نمایندهٔ اولیا\nآقای نجفی — مدیر مدرسه',resolutions:'تصویبِ برگزاریِ جلسهٔ اطلاع‌رسانیِ ثبت‌نام\nانتخابِ سرپرستِ تازه برای انجمن',archived:false,created_at:daysAgoISO(5),updated_at:daysAgoISO(5)});
  })();

  (function(){
    var defs=[
      [1,'requested','بررسیِ وضعیتِ اقتصادیِ خانواده',5],
      [1,'review','در جلسهٔ هفته پیش مطرح شد',3],
      [1,'approved','تأییدِ انجمن برای ترمِ جاری',1],
      [2,'rejected','امسال بودجهٔ جدید نیست',2]
    ];
    defs.forEach(function(d,idx){
      var list=db.users.filter(function(u){return u.role==='student'&&u.school_id===d[0]&&u.active;});
      var st=list[idx%list.length];
      if(!st) return;
      add('scholarships',{school_id:d[0],student_id:st.id,status:d[1],note:d[2],created_at:daysAgoISO(d[3]+7),updated_at:daysAgoISO(d[3])});
    });
  })();
  /* IEP (بند ۲.۲): یک دانش‌آموزِ نمونه در مدرسه‌ای با توانِ has_iep
     یادداشتِ نیازِ ویژه و کارکنانِ کمکی دارد تا بخش در دمو دیده شود.
     ⚠️ تغییرِ مستقیمِ رکوردِ دمو (بدون add) — دادهٔ پایه. */
  (function(){
    var s1=db.schools[0];
    if(!s1||!(s1.capabilities&&s1.capabilities.has_iep))return;
    var cls=db.classes.find(function(c){return c.school_id===s1.id&&c.grade==='دوازدهم';});
    var st=cls?db.users.find(function(u){return u.role==='student'&&u.active&&(db.enrollments.some(function(e){return e.class_id===cls.id&&e.student_id===u.id;}));}):null;
    if(st){st.iep_notes='نیاز به زمانِ بیشتر در آزمون‌های کتبی؛ پاسخِ مثبت به توضیحِ صوتی. هدفِ امسال: تثبیتِ پایهٔ ریاضی و کاهشِ اضطرابِ آزمون.';
      st.iep_staff='مشاورِ مدرسه (هفتگی) + معاونِ آموزشی (پایشِ تکالیف)';
      st.iep_updated=daysAgoISO(12);}
  })();
  /* قیف پیش‌ثبت‌نام سال آینده (دور ۶۳، بند ۲): مدرسهٔ اول چند ردیف
     پیش‌ثبت‌نام برای سال بعد دارد تا قیف در دمو دیده شود.
     ⚠️ با add() — دادهٔ پایه، بدون ثبت در دفترچهٔ عملیات. */
  (function(){
    const s1=db.schools[0];
    if(!s1)return;
    const yNext=String(Number(yearCode().split('-')[0])+1)+'-'+String(Number(yearCode().split('-')[0])+2);
    const st1=db.users.find(u=>u.school_id===s1.id&&u.role==='student'&&(u.status||'active')==='active');
    if(st1)add('pre_enrollments',{school_id:s1.id,year_code:yNext,student_id:st1.id,
      name:st1.full_name,national_id:st1.national_id,phone:st1.phone,
      grade:Number(st1.grade_level)+1||null,field:st1.field||null,
      source:'returning',status:'confirmed',created_at:daysAgoISO(20),note:null});
    add('pre_enrollments',{school_id:s1.id,year_code:yNext,student_id:null,
      name:'آرمان رستگار',national_id:nid(),phone:demoPhone(),
      grade:10,field:'علوم تجربی',
      source:'new',status:'registered',created_at:daysAgoISO(9),note:'تازه‌وارد — منتظر تأیید'});
    add('pre_enrollments',{school_id:s1.id,year_code:yNext,student_id:null,
      name:'نیما صالحی',national_id:nid(),phone:demoPhone(),
      grade:11,field:'ریاضی',
      source:'new',status:'registered',created_at:daysAgoISO(4),note:null});
  })();
  /* اسکان/خوابگاه (دور ۷۸ بند ۷): چند مدرسهٔ دمو توانِ has_dorm دارند
     (SH-101، FZ-102، AH-103، IZ-105)؛ برای هرکدام چند اتاق + انتساب +
     وعدهٔ هفتگی تا ماژول در دمو دیده شود. ⚠️ انتخاب‌های قطعی (بدون
     rng) تا جریانِ تصادفیِ دمو جابه‌جا نشود. */
  (function(){
    const dormSchools=db.schools.filter(s=>s.capabilities&&s.capabilities.has_dorm);
    dormSchools.forEach(sch=>{
      const mkRoom=(name,capacity)=>add('dorm_rooms',{school_id:sch.id,name,capacity,created_at:daysAgoISO(120)});
      const r1=mkRoom('اتاق ۱۰',4), r2=mkRoom('اتاق ۱۰۲',3), r3=mkRoom('اتاق ۲۰۱',2);
      const studs=db.users.filter(u=>u.role==='student'&&u.school_id===sch.id&&(u.active||u.status!=='dropped_out')).slice(0,6);
      const rooms=[r1,r2,r3];
      studs.forEach((st,i)=>{
        add('dorm_assignments',{school_id:sch.id,room_id:rooms[i%rooms.length].id,student_id:st.id,since:daysAgoISO(100+i)});
      });
      /* وعده‌های هفتگی: شنبه تا چهارشنبه، سه وعده؛ منوهای ساده و ثابت */
      const menus={
        breakfast:['نوشاب، پنیر و سبزی','شیر و بیسکویت و ساندویچ','روغنی و کره و عسل'],
        lunch:['چلو و خورشت قورمه','ماکارونی و سالاد','برنج و خورشت فسنجان'],
        dinner:['چای و بیسکویت','ماست و خیار و نان','پنیر و سبزی و نان']
      };
      for(let d=0;d<5;d++){
        add('dorm_meals',{school_id:sch.id,day:d,kind:'breakfast',menu:menus.breakfast[d%menus.breakfast.length],created_at:daysAgoISO(30)});
        add('dorm_meals',{school_id:sch.id,day:d,kind:'lunch',menu:menus.lunch[d%menus.lunch.length],created_at:daysAgoISO(30)});
        add('dorm_meals',{school_id:sch.id,day:d,kind:'dinner',menu:menus.dinner[d%menus.dinner.length],created_at:daysAgoISO(30)});
      }
    });
  })();
  add('announcements',{school_id:null,title:'به‌روزرسانی سامانه',body:'نسخه جدید سامانه مدیریت مدارس با قابلیت گزارش‌گیری پیشرفته و پنل اولیا منتشر شد.',audience:'all',created_by:1,created_at:daysAgoISO(1)});
  /* بند B.1 (چت۱): سید حضور کادر — ۵ روزِ کاریِ اخیر × دبیرانِ هر مدرسه.
     ⚠️ صفر مصرفِ rng (هشِ قطعی): فازهای سیدِ پس‌از generate (اداره،
     مشاور، راننده) از همان جریان تغذیه می‌کنند و هر مصرفی تلفنِ
     حساب‌های نمونه را جابه‌جا می‌کند. امروز خالی می‌ماند تا مدیر زنده ثبت کند. */
  (function(){
    var days=schoolDays(5);
    var done={};
    db.users.filter(function(u){return u.role==='manager';}).forEach(function(mgr){
      if(done[mgr.school_id])return; done[mgr.school_id]=1;
      db.users.filter(function(u){return u.role==='teacher'&&u.school_id===mgr.school_id&&u.active;}).forEach(function(t){
        days.forEach(function(iso,di){
          if(iso===todayISO())return;
          /* ⚠️ صفر مصرفِ rng: پس‌از generate فازهای سید دیگری (اداره/مشاور/راننده)
             از همان جریان تغذیه می‌کنند — وضعیت از هشِ قطعی می‌آید. */
          var hv=(t.id*31+di*17+iso.charCodeAt(9)*7)%100,s='present';
          if(hv>96)s='absent';else if(hv>90)s='late';
          add('staff_attendance',{school_id:mgr.school_id,staff_id:t.id,date:iso,status:s,note:s==='late'?'تأخیر در ورود به مدرسه':null,registered_by:mgr.id,created_at:daysAgoISO(2)});
        });
      });
    });
  })();
  /* بند B.2 (چت۱): سید دوره‌های آموزشی — ۲ دورهٔ در حال برگزاری برای
     ۲ دبیر اول هر مدرسه. صفر مصرفِ rng (درس B.1)؛ بدون دورهٔ تکمیل‌شده
     تا ناوردای «تکمیل‌شده ⟺ گواهی» در سید برقرار بماند. */
  (function(){
    var titles=['روش‌های نوین تدریس','مدیریت کلاس درس'];
    var hours=[24,40];
    var offs=[10,25];
    var done={};
    db.users.filter(function(u){return u.role==='manager';}).forEach(function(mgr){
      if(done[mgr.school_id])return; done[mgr.school_id]=1;
      var teachers=db.users.filter(function(u){return u.role==='teacher'&&u.school_id===mgr.school_id&&u.active;}).slice(0,2);
      teachers.forEach(function(t,i){
        add('training_courses',{school_id:mgr.school_id,staff_id:t.id,title:titles[i%titles.length],hours:hours[i%hours.length],date:daysAgoISO(offs[i%offs.length]),status:'ongoing',created_at:daysAgoISO(2)});
      });
    });
  })();
  /* بند B.4 (چت۱): سید مانور ایمنی — هر مدرسه ۱ رکورد؛ فردها سبز (۳۰ روز پیش)، زوج‌ها قرمز (۴۰۰ روز پیش).
     ⚠️ صفر مصرفِ rng (هشِ قطعی از شناسهٔ مدرسه) — دلیل در سید B.1. */
  (function(){
    var done={};
    db.users.filter(function(u){return u.role==='manager';}).forEach(function(mgr){
      if(done[mgr.school_id])return; done[mgr.school_id]=1;
      var sid=mgr.school_id, recent=sid%2===1;
      add('safety_drills',{school_id:sid,date:daysAgoISO(recent?30:400),
        participant_count_students:120+((sid*37)%80),participant_count_staff:8+((sid*13)%6),
        notes:recent?'مانور زلزله':'مانور سال گذشته',registered_by:mgr.id,created_at:daysAgoISO(recent?29:399)});
    });
  })();
  /* بند B.5 (چت۱): سید کمک‌های داوطلبانه — هر مدرسه ۲ رکورد (۱ نامدار + ۱ ناشناس).
     ⚠️ صفر مصرفِ rng (هشِ قطعی از شناسهٔ مدرسه) — دلیل در سید B.1. */
  (function(){
    var done={};
    db.users.filter(function(u){return u.role==='manager';}).forEach(function(mgr){
      if(done[mgr.school_id])return; done[mgr.school_id]=1;
      var sid=mgr.school_id;
      add('donations',{school_id:sid,donor_name:'خیر مدرسه',amount:500000+((sid*7919)%7)*500000,date:daysAgoISO(20+sid),description:'کمک به تجهیز آزمایشگاه',registered_by:mgr.id,created_at:daysAgoISO(19+sid)});
      add('donations',{school_id:sid,donor_name:null,amount:1000000+((sid*104729)%5)*1000000,date:daysAgoISO(60+sid),description:'نذر فرهنگی',registered_by:mgr.id,created_at:daysAgoISO(59+sid)});
    });
  })();
  /* SIM-01..03 (چت ۳ — ماتریسِ daily-reports/SEED_SIM_ROLES_ACCEPTANCE.md):
     نقش‌های شبیه‌سازی که در دمو صفر بودند و مسیرهای E.9/کتابخانه/اموال را
     تست‌ناپذیر می‌کردند.
     ⚠️ صفر مصرفِ rng — دلیل در سید B.1 (شیفتِ جریانِ RNG = جابه‌جاییِ
     phone/nidِ حساب‌های نمونهٔ مستندشده). nid با همان قاعدهٔ ۹۹۹ + چک‌سام،
     ولی از رقم‌های ثابت؛ phone با پیش‌شمارهٔ ۰۹۹۹ رزرو دمو، بازهٔ ۰۰۰xxxx
     (بیرونِ بازهٔ مولد demoPhone که از 1000000 شروع می‌شود ⇒ بدون تصادم).
     در انتهای generate() تا idهای پیشین دست‌نخورده بمانند. */
  (function(){
    /* SIM-01: نگهبان/پذیرش (E.9) — کاربرِ تازه در مدرسهٔ ۱ (نمونهٔ اصلی دمو) */
    add('users',{school_id:1,role:'guard',full_name:'رضا نگهبانی',username:'guard1',password:'123456',
      national_id:'9990000311',phone:'09990000031',active:1,title:'نگهبان/پذیرش',created_at:daysAgoISO(200)});
    /* SIM-02/03: پرچم‌های تفویضی روی دبیرانِ *موجودِ* مدرسهٔ ۱ (بدون کاربر تازه —
       قراردادِ 54-library/55-assets: دبیرِ همان مدرسه با پرچم). انتخابِ قطعی:
       دو دبیرِ فعالِ *آخرِ* مدرسهٔ ۱ — فیکسچرهای سوئیت‌های موجود (library2 و
       هم‌خانواده‌ها) «دبیرِ [0]» را بی‌مجوز فرض می‌کنند؛ پرچم روی آخری‌ها
       آن قرارداد را دست نمی‌زند. */
    var t1=db.users.filter(function(u){return u.role==='teacher'&&u.school_id===1&&u.active===1;});
    if(t1.length>=2) t1[t1.length-1].lib_staff=1;   /* SIM-02: کتابدار */
    if(t1.length>=3) t1[t1.length-2].asset_staff=1; /* SIM-03: تحویلدارِ اموال */
  })();
}

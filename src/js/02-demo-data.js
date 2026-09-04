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
  ['دبیرستان شهید بهشتی','SH-101','متوسطه دوم','پسرانه',['نظری'],'علوم تجربی'],
  ['دبیرستان فرزانگان','FZ-102','متوسطه دوم','دخترانه',['نظری'],'ریاضی'],
  ['مدرسه نمونه علامه حلی','AH-103','متوسطه اول','پسرانه',[],'عادی'],
  ['دبیرستان مریم مقدس','MM-104','متوسطه اول','دخترانه',[],'عادی'],
  ['مجتمع آموزشی ایران‌زمین','IZ-105','متوسطه دوم','پسرانه',['فنی و حرفه‌ای','کاردانش'],'فنی و حرفه‌ای'],
  ['دبستان و متوسطه اندیشه','AN-106','متوسطه اول','دخترانه',[],'عادی']];

let db, ids={};
/* 🔴 TODO پیش از اتصال به سرور — رمز عبور
   رمز همهٔ کاربران نمونه رشتهٔ ثابت '123456' است و متن ساده ذخیره
   می‌شود. این برای دمو عمدی است ولی پیش از هر دادهٔ واقعی باید:
   ۱. رمز فقط سمت سرور با bcrypt (هزینه حداقل ۱۲) هش شود
   ۲. رمز خام هرگز در پایگاه داده، گزارش یا سابقه نوشته نشود
   ⚠️ دام: bcrypt ورودی بیش از ۷۲ بایت را بی‌صدا می‌بُرد و رمز فارسی
   هر حرف را ۲ بایت می‌کند ⇒ پیش از هش طول بایتی را بسنجید.
   📄 docs/SERVER_SECURITY_CONTRACT.md بند ۵ */

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
  db={school_years:[],teacher_notes:[],sms_wallet:[],sms_log:[],notify_queue:[],meeting_slots:[],student_transfers:[],transfer_requests:[],student_archive:[],nid_conflicts:[],schools:[],users:[],subjects:[],classes:[],enrollments:[],parent_links:[],schedule:[],attendance:[],grades:[],discipline:[],announcements:[],notifications:[],leaves:[],calendar:[],messages:[],tuition_plans:[],tuitions:[],installments:[],transactions:[],teacher_schools:[],exam_terms:[],exams:[],exam_duties:[],parent_verifications:[],corrections:[],provinces:[],counties:[],districts:[],offices:[],parent_subscriptions:[],subscription_payments:[],app_settings:[],bell_schedules:[],counselor_refs:[]};
  add('users',{school_id:null,role:'superadmin',full_name:'مدیر کل سامانه',username:'superadmin',password:'123456',national_id:nid(),phone:demoPhone(),active:1,created_at:daysAgoISO(400)});
  const dates=schoolDays(20);
  let sCount=0;
  SCHOOL_DEFS.forEach((def,si)=>{
    const [name,code,level,gender,branches,type]=def, city=CITIES[si%CITIES.length];
    /* رشته‌های مدرسه = همهٔ رشته‌های شاخه‌هایی که ارائه می‌دهد */
    const sFields=(branches||[]).reduce((a,b)=>a.concat(fieldsOfBranch(b)),[]);
    const school=add('schools',{name,code,city,address:city+'، خیابان '+pick(['آزادی','ولیعصر','معلم','شریعتی','امام خمینی'])+'، پلاک '+(10+ri(200)),phone:demoPhone(),level,type:type||'عادی',gender,branches:branches||[],fields:sFields,
      shift: si===4 ? 'بعدازظهر' : (si===1 ? 'هر دو' : 'صبح'),capacity:400+ri(200),active:si===5?0:1,created_at:daysAgoISO(500-si*20)});
    const first = gender==='پسرانه'?MALE:FEMALE;
    const manager=add('users',{school_id:school.id,role:'manager',full_name:pick(first)+' '+pick(LAST),username:'manager'+(si+1),password:'123456',national_id:nid(),phone:demoPhone(),active:1,title:'مدیر مدرسه',created_at:daysAgoISO(480)});
    add('users',{school_id:school.id,role:'manager',full_name:pick(first)+' '+pick(LAST),username:'deputy'+(si+1),password:'123456',national_id:nid(),phone:demoPhone(),active:1,title:'معاون آموزشی',created_at:daysAgoISO(470)});
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
      for(let d=0;d<5;d++)for(let p=1;p<=6;p++){const s=chosen[(d*6+p)%chosen.length];const t=teachers.find(x=>x.subject_id===s.id)||teachers[0];
        add('schedule',{school_id:school.id,class_id:c.id,subject_id:s.id,teacher_id:t.id,day:d,period:p});}
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
        dates.forEach(iso=>{const r=rng();let s='present';if(r>.965)s='absent';else if(r>.93)s='late';else if(r>.915)s='excused';
          add('attendance',{school_id:school.id,class_id:c.id,student_id:st.id,date:iso,status:s,note:s==='excused'?'مرخصی با اطلاع ولی':null});});
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
          date:ft.start_date,start_time:'09:00',duration:90,room:'سالن بزرگ',max_score:20,is_final:1});
        const ftch=db.users.find(u2=>u2.school_id===school.id&&u2.role==='teacher');
        if(ftch)add('exam_duties',{exam_id:fe.id,teacher_id:ftch.id,role:'main'});
      }
    }
  });
  add('announcements',{school_id:null,title:'به‌روزرسانی سامانه',body:'نسخه جدید سامانه مدیریت مدارس با قابلیت گزارش‌گیری پیشرفته و پنل اولیا منتشر شد.',audience:'all',created_by:1,created_at:daysAgoISO(1)});
}

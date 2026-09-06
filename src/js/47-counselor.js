/* ═══════════════════════════════════════════════════════════════════
   مشاور مدرسه و عوامل اجرایی (دور ۶۳)

   نقش تازهٔ «مشاور» را مدیر مدرسه مثل سایر کادرها تعریف می‌کند
   (بخش «دبیران و دانش‌آموزان» با نقش «مشاور»). اولین وظیفهٔ
   مشاور: دیدن صف دانش‌آموزانی که **دستوری** (نه خودکار) توسط
   مدیر ارجاع شده‌اند — بر پایهٔ شمارندهٔ الگوی تکرار، طرح
   ۴.۷ «حالت‌های حضور و غیاب» (docs/PLAN_ATTENDANCE_STATES.md).

   مکانیزم ارجاع: دکمهٔ «ارجاع به مشاور» در نمای پیگیری مدیر.
   سامانه **خودکار به اولیا پیام نمی‌دهد** (تصمیم بند ۴ دور ۶۳)؛
   پیگیری و ارتباط با خانواده با مشاور است.

   بخش «عوامل اجرایی»: EXEC_ROLES تک‌منبع حقیقت نقش‌های کادر
   اجرایی است؛ معاونت‌های آموزشی/اداری/فنی/تحصیلی رزرو شده‌اند
   و بعداً همان‌جا فعال می‌شوند — بدون بازطراحی کامل.

   ⚠️ محدوده: مشاور فقط صف ارجاع‌های مدرسهٔ خودش را می‌بیند.
   نمره، برنامهٔ درسی و پروندهٔ کامل دانش‌آموز در این صف نیست
   — فقط نام، کلاس و دادهٔ الگو (تأخیر/غیبت) که برای تصمیم
   پیگیری لازم است.
   ═══════════════════════════════════════════════════════════════ */

/** کادر اجرایی — فعلاً فقط مشاور فعال است؛ بقیه رزرو‌اند */
var EXEC_ROLES=[
  {key:'counselor',fa:'مشاور',active:true,desc:'صف دانش‌آموزان ارجاع‌شدهٔ الگوهای رفتاری را پیگیری می‌کند'},
  {key:'driver',fa:'راننده سرویس',active:true,desc:'رویدادهای سوار/پیاده شدن مسیر خودش را ثبت می‌کند؛ برای خانواده پیامک می‌رود (بدون جی‌پی‌اس)'},
  {key:'deputy_edu',fa:'معاون آموزشی',active:false,reserved:true,desc:''},
  {key:'deputy_exec',fa:'معاون اجرایی',active:false,reserved:true,desc:''},
  {key:'deputy_tech',fa:'معاون فنی',active:false,reserved:true,desc:''},
  {key:'deputy_culture',fa:'معاون پرورشی',active:false,reserved:true,desc:''}
];

/** آستانه‌های الگو — پیش‌فرض‌های طرح ۴.۷.
    ⚠️ وقتی طرح «حالت‌های حضور و غیاب» اجرا شد، این‌ها از
    `schools.discipline_rules` خوانده می‌شوند (قابل تنظیم مدرسه‌به‌مدرسه). */
var PATTERN_RULES={late_month:4,absent_month:3,exit_week:3,exit_min_week:45};
var BREACH_FA={late:'تأخیر مکرر',absent:'غیبت مکرر',exits:'خروج مکرر از کلاس'};
var TREND_FA={rising:'📈 رو به افزایش',steady:'➖ پایدار',falling:'📉 رو به کاهش'};

function patternRules(schoolId){
  var sc=(typeof byId==='function')?byId('schools',schoolId)||{}:{};
  var r=sc.discipline_rules||{};
  return {
    late_month:Number(r.pattern_late_month)>0?Number(r.pattern_late_month):PATTERN_RULES.late_month,
    absent_month:Number(r.pattern_absent_month)>0?Number(r.pattern_absent_month):PATTERN_RULES.absent_month,
    exit_week:Number(r.pattern_exit_week)>0?Number(r.pattern_exit_week):PATTERN_RULES.exit_week,
    exit_min_week:Number(r.pattern_exit_min)>0?Number(r.pattern_exit_min):PATTERN_RULES.exit_min_week
  };
}

/** روند: نیمهٔ اول بازه با نیمهٔ دوم مقایسه می‌شود
    (همان روش نمودار روند نمرات، دور ۴۳) */
function patternTrend(dates){
  var d=(dates||[]).slice().sort();
  if(d.length<2)return 'steady';
  var mid=Math.floor(d.length/2);
  var a=d.slice(0,mid).length,b=d.slice(mid).length;
  if(b>a*1.25)return 'rising';
  if(a>b*1.25)return 'falling';
  return 'steady';
}

/**
 * الگوی تکرار دانش‌آموز (طرح ۴.۷) — از داده‌ای که امروز وجود دارد:
 * تأخیر (رکوردهای حضور با status 'late') و غیبت (status 'absent').
 * ⚠️ شمارندهٔ خروج از کلاس با پیاده‌سازی جدول `class_exits`
 * (بخش ۳ طرح) می‌آید — تا آن‌جا صفر می‌ماند.
 * ⚠️ فیلد late_minutes هنوز در رکورد حضور نیست (بخش ۲ طرح)؛
 * با اضافه‌شدنش، مجموع دقیقه دقیق می‌شود.
 */
function patternCheck(studentId,days){
  var n=Number(days)>0?Number(days):30;
  var from=daysAgoISO(n);
  var late=[],absent=[],lateMin=0,unexcused=0,exit=[],exitMin=0;
  (db.attendance||[]).forEach(function(a){
    if(a.student_id!==studentId||a.date<from||a.date>todayISO())return;
    if(a.status==='late'){late.push(a.date);lateMin+=Number(a.late_minutes)||0;}
    else if(a.status==='absent'){absent.push(a.date);if(!a.excused)unexcused++;}
    /* بند 15.1: خروج زودهنگام */
    else if(a.status==='early_exit'){exit.push(a.date);exitMin+=Number(a.exit_minutes)||0;}
  });
  return {
    days:n,
    late:{count:late.length,totalMinutes:lateMin,trend:patternTrend(late)},
    absent:{count:absent.length,unexcused:unexcused,trend:patternTrend(absent)},
    exits:{count:exit.length,totalMinutes:exitMin,trend:patternTrend(exit)}
  };
}

/** الگوهای دانش‌آموزی که آستانهٔ (مدرسهٔ) خودش را رد کرده */
function patternBreaches(studentId,schoolId,days){
  var c=patternCheck(studentId,days);
  var r=patternRules(schoolId);
  var out=[];
  if(c.late.count>=r.late_month)
    out.push({key:'late',fa:BREACH_FA.late,count:c.late.count,totalMinutes:c.late.totalMinutes,trend:c.late.trend,limit:r.late_month+' بار در ماه'});
  if(c.absent.count>=r.absent_month)
    out.push({key:'absent',fa:BREACH_FA.absent,count:c.absent.count,unexcused:c.absent.unexcused,trend:c.absent.trend,limit:r.absent_month+' بار در ماه'});
  if(c.exits.count>=r.exit_week)
    out.push({key:'exits',fa:BREACH_FA.exits,count:c.exits.count,trend:c.exits.trend,limit:r.exit_week+' بار در هفته'});
  return out;
}

/**
 * دانش‌آموزان مدرسه با الگوی نیازمند پیگیری.
 * ⚠️ کارایی (هشدار گام ۹ طرح): شمارنده‌ها با **یک پیمایش** روی
 * جدول حضور ساخته می‌شوند نه با یک فیلتر کامل برای هر دانش‌آموز.
 */
function patternFlagged(schoolId,days){
  var n=Number(days)>0?Number(days):30;
  var from=daysAgoISO(n);
  var by=Object.create(null);
  (db.attendance||[]).forEach(function(a){
    if(a.date<from)return;
    var e=by[a.student_id];
    if(!e)e=by[a.student_id]={late:[],absent:[],lateMin:0,unexcused:0,exit:[],exitMin:0};
    if(a.status==='late'){e.late.push(a.date);e.lateMin+=Number(a.late_minutes)||0;}
    else if(a.status==='absent'){e.absent.push(a.date);if(!a.excused)e.unexcused++;}
    /* بند 15.1: خروج زودهنگام — شمارش + دقیقهٔ از‌دست‌رفته */
    else if(a.status==='early_exit'){e.exit.push(a.date);e.exitMin+=Number(a.exit_minutes)||0;}
  });
  var r=patternRules(schoolId);
  var out=[];
  (db.users||[]).forEach(function(st){
    if(st.role!=='student'||st.school_id!==schoolId||(st.status||'active')!=='active')return;
    var e=by[st.id];
    if(!e)return;
    var check={
      days:n,
      late:{count:e.late.length,totalMinutes:e.lateMin,trend:patternTrend(e.late)},
      absent:{count:e.absent.length,unexcused:e.unexcused,trend:patternTrend(e.absent)},
      exits:{count:e.exit.length,totalMinutes:e.exitMin,trend:patternTrend(e.exit)}
    };
    var br=[];
    if(check.late.count>=r.late_month)
      br.push({key:'late',fa:BREACH_FA.late,count:check.late.count,totalMinutes:check.late.totalMinutes,trend:check.late.trend,limit:r.late_month+' بار در ماه'});
    if(check.absent.count>=r.absent_month)
      br.push({key:'absent',fa:BREACH_FA.absent,count:check.absent.count,unexcused:check.absent.unexcused,trend:check.absent.trend,limit:r.absent_month+' بار در ماه'});
    /* بند 15.1: خروج مکرر — شمارش هفتگی یا مجموعِ دقیقه‌های از‌دست‌رفته */
    if(check.exits.count>=r.exit_week||check.exits.totalMinutes>=r.exit_min_week)
      br.push({key:'exits',fa:BREACH_FA.exits,count:check.exits.count,totalMinutes:check.exits.totalMinutes,trend:check.exits.trend,limit:r.exit_week+' بار در هفته یا '+r.exit_min_week+' دقیقه'});
    if(!br.length)return;
    out.push({user:st,cls:classOf(st.id),breaches:br,check:check});
  });
  out.sort(function(a,b){
    return b.breaches.reduce(function(s,x){return s+x.count;},0)
         - a.breaches.reduce(function(s,x){return s+x.count;},0);
  });
  return out;
}

/* ─────────── صف ارجاع به مشاور (counselor_refs) ─────────── */

/** صف ارجاع‌های مدرسه (onlyOpen: فقط بازها) — تازه‌ترین بالا */
function counselorQueue(schoolId,onlyOpen){
  var q=(db.counselor_refs||[]).filter(function(r){
    return r.school_id===schoolId&&(!onlyOpen||r.status==='open');
  });
  q.sort(function(a,b){return String(b.created_at||'').localeCompare(String(a.created_at||''));});
  return q;
}

/** ارجاع بازِ یک دانش‌آموز برای یک دلیل (وگرنه null) */
function counselorOpenRef(schoolId,studentId,breachKey){
  return (db.counselor_refs||[]).filter(function(r){
    return r.school_id===schoolId&&r.student_id===studentId&&r.breach_key===breachKey&&r.status==='open';
  })[0]||null;
}

/**
 * ارجاع یک دانش‌آموز به مشاور (دستوری — توسط مدیر).
 * اگر برای همان دلیل ارجاع باز وجود داشته باشد، تکرار نمی‌شود.
 */
function counselorRef(schoolId,studentId,breach,referrerId){
  var dupe=counselorOpenRef(schoolId,studentId,breach.key);
  if(dupe)return {ok:false,msg:'برای این دلیل از پیش ارجاع باز وجود دارد',ref:dupe};
  var c=patternCheck(studentId,30);
  var rec=insert('counselor_refs',{
    school_id:schoolId,student_id:studentId,breach_key:breach.key,
    reason:breach.fa+' — '+breach.count+' بار در '+c.days+' روز گذشته',
    pattern:JSON.parse(JSON.stringify(c)),
    referred_by:referrerId,status:'open',
    created_at:new Date().toISOString()
  });
  return {ok:true,msg:'دانش‌آموز به مشاور ارجاع شد',ref:rec};
}

/** رسیدگی به یک ارجاع (مشاور یا مدیر) — رکورد پاک نمی‌شود، وضعیتش عوض می‌شود */
function counselorHandle(refId,userId,note){
  var rec=(typeof byId==='function')?byId('counselor_refs',refId):null;
  if(!rec||rec.status!=='open')return false;
  update('counselor_refs',refId,{status:'handled',handled_by:userId,
    handled_at:new Date().toISOString(),note:note||null});
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   ۵.۲ — مسیر ارتباطِ ساختاریافته با مشاور برای دوازدهم
   دانش‌آموزِ دوازدهم (و ولی‌اش) می‌تواند مستقیم با مشاور مدرسه
   صحبت کند — نه از طریق صف ارجاعِ مدیر (بند ۱.۴). رشتهٔ گفت‌وگو
   فقط برای همان دانش‌آموز + مشاور (و دیده‌شدن در پرونده) است؛
   مشاور پروندهٔ کامل دانش‌آموز را نمی‌بیند (اصلِ دور ۶۳).
   ═══════════════════════════════════════════════════════════════════ */

/** آیا این دانش‌آموز دوازدهم است؟ (پایهٔ کاربر، وگرنه از نامِ کلاس) */
function isTwelfthGrader(sid){
  var u=(typeof byId==='function')?byId('users',sid):null;
  if(!u)return false;
  var cls=(typeof classOf==='function')?classOf(sid):null;
  var g=Number(u.grade_level||(cls&&(cls.grade_level||gradeFromName(cls.name)))||0);
  return g===12;
}

/** رشتهٔ گفت‌وگوی یک دانش‌آموز با مشاور (قدیمی به تازه) */
function counselorThread(studentId){
  return (db.counselor_msgs||[]).filter(function(m){return m.student_id===studentId;})
    .sort(function(a,b){return String(a.created_at||'').localeCompare(String(b.created_at||''))||((a.id||0)-(b.id||0));});
}

/** صندوقِ مشاور: تازه‌ترین رشته‌های دوازدهم (بالاترین فعالیت اول) */
function counselorMsgInbox(schoolId,limit){
  var by=Object.create(null);
  (db.counselor_msgs||[]).forEach(function(m){
    if(m.school_id!==schoolId)return;
    var e=by[m.student_id];
    if(!e)e=by[m.student_id]={last:'',n:0,fromStudent:0};
    e.n++;
    if(String(m.created_at||'')>e.last)e.last=String(m.created_at||'');
    if(m.author_role==='student'||m.author_role==='parent')e.fromStudent++;
  });
  var out=[];
  Object.keys(by).forEach(function(k){
    var st=(typeof byId==='function')?byId('users',Number(k)):null;
    if(!st||st.role!=='student')return;
    if(!isTwelfthGrader(st.id))return;
    out.push({student:st,cls:(typeof classOf==='function')?classOf(st.id):null,
      count:by[k].n,last:by[k].last,fromStudent:by[k].fromStudent});
  });
  out.sort(function(a,b){return String(b.last||'').localeCompare(String(a.last||''));});
  return out.slice(0,Number(limit)||15);
}

/**
 * ارسالِ پیام در مسیر دوازدهم↔مشاور (دانش‌آموز/ولی/مشاور).
 * گاردهای ساختاری: دوازدهم بودن، طول ۳–۵۰۰، هم‌خوانیِ هویتِ
 * فرستنده با رکورد (دانش‌آموز فقط خودش، ولی فقط فرزندش،
 * مشاور فقط مدرسهٔ خودش).
 */
function counselorMsgSend(studentId,authorUser,body){
  var st=(typeof byId==='function')?byId('users',studentId):null;
  if(!st||st.role!=='student')return {ok:false,msg:'دانش‌آموز پیدا نشد'};
  if(!isTwelfthGrader(studentId))return {ok:false,msg:'این مسیر برای دانش‌آموزانِ دوازدهم است'};
  var b=String(body||'').trim();
  if(b.length<3)return {ok:false,msg:'پیام خیلی کوتاه است'};
  if(b.length>500)return {ok:false,msg:'پیام خیلی بلند است (حداکثر ۵۰۰ نویسه)'};
  var role=authorUser.role, authorId=authorUser.id;
  if(role==='student'){
    if(authorId!==studentId)return {ok:false,msg:'فقط در رشتهٔ خودتان می‌توانید بنویسید'};
  } else if(role==='parent'){
    var kids=(db.parent_links||[]).filter(function(p){return p.parent_id===authorId;}).map(function(p){return p.student_id;});
    if(kids.indexOf(studentId)<0)return {ok:false,msg:'این دانش‌آموز از فرزندان شما نیست'};
  } else if(role==='counselor'){
    if(authorUser.school_id&&authorUser.school_id!==st.school_id)return {ok:false,msg:'فقط در رشته‌های مدرسهٔ خودتان پاسخ می‌دهید'};
  } else return {ok:false,msg:'شما نمی‌توانید در این مسیر بنویسید'};
  var rec=insert('counselor_msgs',{
    school_id:st.school_id,student_id:studentId,
    author_id:authorId,author_role:role,body:b,status:'open',
    created_at:new Date().toISOString()
  });
  return {ok:true,msg:role==='counselor'?'پاسخ ارسال شد':'پیام به مشاور ارسال شد',rec:rec};
}

/** کارتِ مسیرِ مشاور — در پروندهٔ دانش‌آموزِ دوازدهم (تب) */
function counselorChannelCard(sid){
  if(!(typeof isTwelfthGrader==='function'&&isTwelfthGrader(sid)))return '';
  var u=S.user;
  var persona=(typeof activePersona==='function')?activePersona():(u&&u.role);
  var st=byId('users',sid);
  if(!st)return '';
  var thread=counselorThread(sid);
  var canSend=persona==='student'?st.id===u.id
    :persona==='parent'?(db.parent_links||[]).some(function(p){return p.parent_id===u.id&&p.student_id===sid;})
    :persona==='counselor';
  var h='<div class="card-body"><div class="small muted" style="line-height:2;margin-bottom:10px">مسیرِ ساختاریافتهٔ گفت‌وگو با مشاورِ مدرسه — برای دوازدهم: امتحان نهایی، کنکور، انتخاب رشته و هر سؤالِ دیگری. مشاور فقط همین رشتهٔ گفت‌وگو را می‌بیند، نه پروندهٔ کامل.</div>';
  h+='<div style="display:grid;gap:8px;max-height:46vh;overflow:auto;margin-bottom:10px">';
  if(!thread.length)h+='<div class="small muted" style="padding:8px 0">هنوز پیامی نیست.</div>';
  thread.forEach(function(m){
    var a=byId('users',m.author_id)||{};
    var me=(persona==='student'&&m.author_role==='student'&&m.author_id===u.id)
      ||(persona==='counselor'&&m.author_role==='counselor');
    h+='<div style="border:1px solid var(--border);border-radius:10px;padding:8px 10px'+(me?';background:#f4f8ff':'')+'">'
      +'<div class="small" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>'+(m.author_role==='counselor'?'🕊️ مشاور':esc(a.full_name||'—'))+'</b>'
      +'<span class="muted">'+String(m.created_at||'').slice(0,10)+'</span></div>'
      +'<div style="margin-top:4px;line-height:1.9">'+esc(m.body)+'</div></div>';
  });
  h+='</div>';
  if(canSend){
    h+='<textarea class="input" id="cmsg_body" rows="2" maxlength="500" placeholder="پیام‌تان را بنویسید (حداکثر ۵۰۰ نویسه)…" style="width:100%"></textarea>'
      +'<div class="row" style="margin-top:8px;justify-content:flex-start"><button class="btn" data-act="counselor-msg-send" data-sid="'+escAttr(sid)+'">🕊️ ارسال به مشاور</button></div>';
  } else {
    h+='<div class="small muted">با نقشِ کنونی فقط می‌توانید این مسیر را ببینید.</div>';
  }
  return h+'</div>';
}

/* ─────────── اعلان الگو به ولی — فقط با تأیید مدیر (بند ۴) ───────────
   طرح ۴.۷ سه اثر برای رد آستانه می‌گوید: نشان در پرونده، رکورد
   در صف پیگیری، و اعلان به ولی — که **خودکار نیست**. اینجا همان
   مسیر سوم: مدیر از «پیگیری الگوها» یک کلیک می‌کند و پیام در صف
   پیام اولیا (سامانهٔ دور ۴۲) می‌نشیند — با همان سقف روزانه،
   اعتبار و تأیید نهایی.

   ⚠️ تفکیک عمدی: صف مشاور (cqueue) این دکمه را **ندارد**. مشاور
   با خانواده صحبت می‌کند؛ اعلان رسمی پیامکی اختیار مدیر است.

   ⚠️ تکرار: پیام معلقِ همین دانش‌آموز ⇒ رد می‌شود. پیامی که
   ۷ روز گذشته رفته ⇒ رد می‌شود (آزار خانواده). قدیمی‌تر ⇒
   مجاز — الگو ممکن است بعد از پیگیری ادامه داشته باشد. */

/** وضعیت اعلان الگوی یک دانش‌آموز: {pending, lastSentAt} */
function patternNotifyState(schoolId,studentId){
  var out={pending:null,lastSentAt:null};
  var cut=Date.now()-7*86400000;
  (db.notify_queue||[]).forEach(function(q){
    if(q.school_id!==schoolId||q.kind!=='pattern')return;
    if(q.student_id!==studentId)return;
    if(q.status==='pending'&&!out.pending)out.pending=q;
    else if(q.status==='sent'){
      var t=Date.parse(q.decided_at||q.created_at);
      if(!isNaN(t)&&t>=cut&&(!out.lastSentAt||t>out.lastSentAt))out.lastSentAt=t;
    }
  });
  return out;
}

/**
 * ساخت اعلان الگو برای ولی — فقط با فراخوانی صریح مدیر.
 * برمی‌گرداند: {ok,msg,rec?}
 * ⚠️ پیام را نمی‌فرستد — همان قرارداد notifyRequest: ساخت و ارسال
 * جدا می‌مانند تا سقف روزانه و اعتبار در یک نقطه سنجیده شوند.
 */
function patternNotifyParent(studentId,schoolId,breach,days,byUserId){
  var cfg=(typeof notifySettings==='function')?notifySettings(schoolId):null;
  if(!cfg||!cfg.enabled)return {ok:false,msg:'اطلاع‌رسانی پیامکی این مدرسه خاموش است'};
  if(cfg.kinds&&cfg.kinds.pattern===false)return {ok:false,msg:'اعلان الگو در تنظیمات اطلاع‌رسانی خاموش است'};
  var st=(typeof byId==='function')?byId('users',studentId):null;
  if(!st)return {ok:false,msg:'دانش‌آموز پیدا نشد'};
  var state=patternNotifyState(schoolId,studentId);
  if(state.pending)return {ok:false,msg:'پیام این دانش‌آموز در صف تأیید است — تکرار لازم نیست',rec:state.pending};
  if(state.lastSentAt)return {ok:false,msg:'در ۷ روز گذشته به اولیای این دانش‌آموز اعلان داده شده است'};
  var n=Number(days)>0?Number(days):30;
  var what={late:'تأخیر',absent:'غیبت',exits:'خروج از کلاس'}[breach.key]||breach.fa;
  var body=(typeof notifyBody==='function')?notifyBody('pattern',{
    student:st.full_name,count:fa(breach.count),what:what,
    days:fa(n),school:(typeof notifySchoolName==='function')?notifySchoolName(schoolId):'مدرسه'
  }):'';
  if(!body||body.length<4)return {ok:false,msg:'متن پیام ساخته نشد'};
  var cl=(typeof classOf==='function')?classOf(studentId):null;
  var q=(typeof notifyRequest==='function')?notifyRequest({
    school_id:schoolId,kind:'pattern',student_id:studentId,
    class_id:cl?cl.id:null,student_name:st.full_name,body:body
  }):null;
  if(!q)return {ok:false,msg:'پیام در صف قرار نگرفت: '+((typeof notifyRequest!=='undefined'&&notifyRequest.lastSkip)||'نامشخص')};
  return {ok:true,msg:'در صف پیام اولیا قرار گرفت — با تأیید شما ارسال می‌شود',rec:q};
}

/* ─────────── نماها ─────────── */

/** صف ارجاع‌ها — صفحهٔ خانهٔ مشاور */
function viewCounselorQueue(){
  var u=S.user,sid=u.school_id;
  var open=counselorQueue(sid,true);
  var done=counselorQueue(sid).filter(function(r){return r.status!=='open';}).slice(0,5);
  var h='<div class="card"><div class="card-head"><h3>📨 صف ارجاع به مشاور</h3>'
    +'<span class="badge '+(open.length?'b-amber':'b-green')+'">'+open.length+' باز</span></div><div class="card-body">';
  h+='<div class="small muted" style="margin-bottom:12px">دانش‌آموزانی که مدیر برای الگوی رفتاری (تأخیر/غیبت مکرر) به شما ارجاع داده است. فقط ارجاع‌های مدرسهٔ شما دیده می‌شود؛ نمره و پروندهٔ کامل در این صف نیست — تصمیم پیگیری و ارتباط با خانواده با شماست (سامانه خودکار به اولیا پیام نمی‌دهد).</div>';
  if(!open.length){
    h+=empty('📨','صف خالی است','هنوز دانش‌آموزی ارجاع نشده. وقتی الغویی آستانه را رد کند، مدیر از صفحهٔ «پیگیری الگوها» ارجاع می‌زند.');
  }
  open.forEach(function(r){
    var st=byId('users',r.student_id);
    if(!st){h+='<div class="small muted" style="padding:8px 0">ارجاع یتیم (رکورد دانش‌آموز نیست) — شمارهٔ '+r.id+'</div>';return;}
    var cls=classOf(st.id);
    var p=r.pattern||{};
    var byU=byId('users',r.referred_by);
    h+='<div class="counsel-ref" style="border:1px solid var(--border);border-radius:14px;padding:12px 14px;margin-bottom:10px">'
      +'<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">'
      +'<b style="font-size:15px">'+esc(st.full_name)+'</b>'
      +'<span class="badge b-gray">'+esc(cls?cls.name:'—')+'</span>'
      +'<span class="badge b-amber">'+esc(r.reason||'')+'</span>'
      +'</div>'
      +'<div class="small muted" style="margin-top:7px">'
      +(p.late?'تأخیر: '+p.late.count+' بار'+(p.late.totalMinutes?' ('+p.late.totalMinutes+' دقیقه)':'')+' · ':'')
      +(p.absent?'غیبت: '+p.absent.count+' بار ('+p.absent.unexcused+' غیرموجه) · ':'')
      +(p.late&&p.late.trend&&p.late.trend!=='steady'?'روند تأخیر: '+TREND_FA[p.late.trend]+' · ':'')
      +'ارجاع‌دهنده: '+(byU?esc(byU.full_name):'—')
      +' · '+String(r.created_at||'').slice(0,10)
      +'</div>'
      +'<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">'
      +'<input class="input" id="ch_note_'+r.id+'" placeholder="یادداشت پیگیری (اختیاری)" style="max-width:360px">'
      +'<button class="btn" data-act="counselor-handle" data-r="'+r.id+'">✅ رسیدگی شد</button>'
      +'</div></div>';
  });
  if(done.length){
    h+='<div class="card-head" style="margin-top:16px"><h3 style="font-size:14px">رسیدگی‌شده (۵ مورد آخر)</h3></div>';
    done.forEach(function(r){
      var st=byId('users',r.student_id);
      var byU=byId('users',r.handled_by);
      h+='<div class="small" style="padding:7px 0;border-bottom:1px solid #e8edf5">'
        +'<span class="badge b-green">رسیدگی‌شده</span> '+(st?esc(st.full_name):'—')
        +' · '+esc(r.reason||'')
        +(r.note?' · <span class="muted">یادداشت: '+esc(r.note)+'</span>':'')
        +' · توسط: '+(byU?esc(byU.full_name):'—')
        +'</div>';
    });
  }
  /* ── ۵.۲ — مسیرِ دوازدهم↔مشاور (صندوق + رشتهٔ باز) ── */
  var inbox=counselorMsgInbox(sid,10);
  if(inbox.length){
    h+='<div class="card-head" style="margin-top:16px"><h3 style="font-size:14px">💬 مسیرِ دوازدهم‌ها</h3></div>';
    var openStu=S.filters.cmsg_stu?byId('users',Number(S.filters.cmsg_stu)):null;
    if(openStu&&openStu.role==='student'&&isTwelfthGrader(openStu.id)){
      var th=counselorThread(openStu.id);
      h+='<div class="card-body">';
      th.forEach(function(m){
        var a=byId('users',m.author_id)||{};
        h+='<div style="border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin-bottom:8px'+(m.author_role==='counselor'?';background:#f4f8ff':'')+'">'
          +'<div class="small" style="display:flex;gap:8px;align-items:center"><b>'+(m.author_role==='counselor'?'🕊️ من (مشاور)':esc(a.full_name||'—'))+'</b>'
          +'<span class="muted">'+String(m.created_at||'').slice(0,10)+'</span></div>'
          +'<div style="margin-top:4px;line-height:1.9">'+esc(m.body)+'</div></div>';
      });
      h+='<textarea class="input" id="cmsg_body" rows="2" maxlength="500" placeholder="پاسخ مشاور…" style="width:100%"></textarea>'
        +'<div class="row" style="margin-top:8px;gap:8px">'
        +'<button class="btn" data-act="counselor-msg-reply" data-sid="'+escAttr(openStu.id)+'">ارسال پاسخ</button>'
        +'<button class="btn ghost" data-act="cmsg-close">← فهرستِ رشته‌ها</button></div></div>';
    } else {
      inbox.forEach(function(row){
        h+='<div class="small" style="padding:8px 0;border-bottom:1px solid #e8edf5;display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
          +'<b>'+esc(row.student.full_name)+'</b>'
          +'<span class="badge b-gray">'+esc(row.cls?row.cls.name:'—')+'</span>'
          +'<span class="badge '+(row.fromStudent?'b-amber':'b-blue')+'">'+fa(row.count)+' پیام</span>'
          +'<span class="muted">'+String(row.last||'').slice(0,10)+'</span><div class="spacer"></div>'
          +'<button class="btn ghost sm" data-act="cmsg-open" data-id="'+row.student.id+'">باز کردنِ رشته</button></div>';
      });
    }
  }
  return h+'</div></div>';
}

/** پیگیری الگوها — نمای مدیر: شمارنده + دکمهٔ ارجاع */
function viewFollowup(){
  var u=S.user,sid=u.school_id;
  var days=Number(S.filters.fu_days)>0?Number(S.filters.fu_days):30;
  var r=patternRules(sid);
  var flagged=patternFlagged(sid,days);
  var openRefs=counselorQueue(sid,true);
  var h='<div class="card"><div class="card-head"><h3>📈 پیگیری الگوها</h3>'
    +'<div style="display:flex;gap:6px">'
    +[30,60].map(function(d){
      return '<button class="btn'+(days===d?'':' ghost')+'" data-act="fu-days" data-d="'+d+'">'+d+' روز</button>';
    }).join('')
    +'</div></div><div class="card-body">';
  var ncfg=(typeof notifySettings==='function')?notifySettings(sid):null;
  var notifyOn=!!ncfg&&!!ncfg.enabled&&ncfg.kinds.pattern!==false;
  h+='<div class="small muted" style="margin-bottom:10px">آستانه‌ها: تأخیر مکرر '+r.late_month+' بار در ماه · غیبت مکرر '+r.absent_month+' بار در ماه · خروج مکرر '+r.exit_week+' بار در هفته. وقتی دانش‌آموزی آستانه را رد کند، او را به مشاور ارجاع دهید. اعلان به ولی **خودکار نیست** — با دکمهٔ «اعلان به ولی» پیام در صف پیام اولیا می‌نشیند و با تأیید شما ارسال می‌شود (در ۷ روز برای هر دانش‌آموز یک‌بار).</div>';
  if(!flagged.length){
    h+=empty('📈','الگویی در این بازه نیست','هیچ دانش‌آموزی در '+days+' روز گذشته آستانهٔ الگوها را رد نکرده است.');
  } else {
    h+='<div class="table-wrap"><table class="table"><thead><tr>'
      +'<th>دانش‌آموز</th><th>تأخیر</th><th>غیبت</th><th>خروج</th><th>روند</th><th>اقدام</th><th>اعلان به ولی</th>'
      +'</tr></thead><tbody>';
    flagged.forEach(function(row){
      var st=row.user;
      var br={};row.breaches.forEach(function(b){br[b.key]=b;});
      var tb=row.breaches[0]||{};
      var nst=patternNotifyState(sid,st.id);
      var notifyCell;
      if(!notifyOn)notifyCell='<span class="small muted">خاموش</span>';
      else if(nst.pending)notifyCell='<span class="badge b-blue" title="در صف پیام اولیا">در صف</span>';
      else if(nst.lastSentAt)notifyCell='<span class="badge b-green" title="در ۷ روز گذشته ارسال شده">اعلان‌شده</span>';
      else notifyCell='<button class="btn ghost sm" data-act="pattern-notify" data-s="'+st.id+'">📨 اعلان به ولی</button>';
      h+='<tr><td><b>'+esc(st.full_name)+'</b><div class="small muted">'+esc(row.cls?row.cls.name:'—')+'</div></td>'
        +'<td>'+(br.late?'<span class="badge b-amber">'+br.late.count+' بار</span>':'—')+'</td>'
        +'<td>'+(br.absent?'<span class="badge b-red">'+br.absent.count+' بار</span>':'—')+'</td>'
        +'<td>'+(br.exits?'<span class="badge b-cyan">'+br.exits.count+' بار · '+br.exits.totalMinutes+' دقیقه</span>':'—')+'</td>'
        +'<td class="small">'+TREND_FA[tb.trend||'steady']+'</td>'
        +'<td>'
        +row.breaches.map(function(b){
          var ref=counselorOpenRef(sid,st.id,b.key);
          return ref
            ?'<span class="badge b-blue" title="برای این دلیل ارجاع باز وجود دارد">ارجاع‌شده</span>'
            :'<button class="btn" data-act="counselor-ref" data-s="'+st.id+'" data-k="'+b.key+'">🕊️ ارجاع به مشاور</button>';
        }).join(' ')
        +'</td>'
        +'<td>'+notifyCell+'</td></tr>';
    });
    h+='</tbody></table></div>';
  }
  h+='<div class="card-head" style="margin-top:16px"><h3 style="font-size:14px">ارجاع‌های باز شما: '+openRefs.length+'</h3></div>';
  openRefs.slice(0,8).forEach(function(r2){
    var st=byId('users',r2.student_id);
    h+='<div class="small" style="padding:6px 0;border-bottom:1px solid #e8edf5">'
      +'<span class="badge b-amber">باز</span> '+(st?esc(st.full_name):'—')
      +' · '+esc(r2.reason||'')+' · '+String(r2.created_at||'').slice(0,10)
      +'</div>';
  });
  return h+'</div></div>';
}

/** عوامل اجرایی — مشاور فعال + معاونت‌های رزرو‌شده */
function viewStaff(){
  var u=S.user,sid=u.school_id;
  var h='<div class="card"><div class="card-head"><h3>📇 عوامل اجرایی</h3></div><div class="card-body">';
  h+='<div class="small muted" style="margin-bottom:12px">عوامل اجرایی مثل سایر کادرها در بخش «دبیران و دانش‌آموزان» توسط مدیر تعریف می‌شوند (با نقش «مشاور»). فعلاً فقط مشاور فعال است؛ معاونت‌ها رزرو شده‌اند و بعداً بدون بازطراحی کامل فعال می‌شوند.</div>';
  EXEC_ROLES.forEach(function(r){
    var people=r.active
      ?db.users.filter(function(x){return x.role===r.key&&x.school_id===sid&&x.active;})
      :[];
    h+='<div class="staff-row'+(r.active?'':' reserved')+'">'
      +'<div><b>'+esc(r.fa)+'</b> '
      +(r.active?'<span class="badge b-green">فعال</span>':'<span class="badge b-gray">رزرو</span>')
      +(r.desc?'<div class="small muted">'+esc(r.desc)+'</div>':'')
      +'</div>'
      +'<div class="staff-right">'
      +(r.active
        ?(people.length
           ?'<span class="small">'+esc(people.map(function(p){return p.full_name;}).join(' · '))+'</span>'
           :'<span class="badge b-amber">تعریف نشده</span> <button class="btn" data-act="user-new">افزودن '+esc(r.fa)+'</button>')
        :'به‌زودی')
      +'</div></div>';
  });
  return h+'</div></div>';
}

/** داشبورد مشاور */
function counselorDash(){
  var u=S.user,sid=u.school_id;
  var open=counselorQueue(sid,true).length;
  var done=counselorQueue(sid).filter(function(r){return r.status!=='open';}).length;
  var school=(typeof byId==='function')?byId('schools',sid):null;
  var h='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px">'
    +'<div class="card stat"><div class="stat-num">'+open+'</div><div class="stat-label">ارجاع باز</div></div>'
    +'<div class="card stat"><div class="stat-num">'+done+'</div><div class="stat-label">رسیدگی‌شده</div></div>'
    +'<div class="card stat"><div class="stat-num" style="font-size:15px">'+esc(school?school.name:'—')+'</div><div class="stat-label">مدرسهٔ من</div></div>'
    +'</div>';
  h+='<div class="card"><div class="card-body">'
    +(open
      ?'<button class="btn" data-act="go" data-r="cqueue">باز کردن صف ارجاع ←</button>'
      :'<div class="small muted">ارجاع بازی نیست. وقتی مدیر دانش‌آموزی را ارجاع کند، اینجا برای پیگیری می‌آید.</div>')
    +'</div></div>';
  return h;
}

/* ─────────── دادهٔ نمونه (فاز ۱۲) ─────────── */

/**
 * مشاوران + دانش‌آموزانِ دارای الگو + صف ارجاع اولیه.
 * ⚠️ قطعی است (rng با SEED ثابت) و با add() نوشته می‌شود،
 * نه insert() — دادهٔ پایه در دفترچهٔ عملیات ثبت نمی‌شود
 * (وگرنه «تولید داده نمونه صف را پر نکرده» آزمون را می‌شکست).
 */
function generateP12(){
  /* یک مشاور برای هر مدرسهٔ فعال */
  db.schools.filter(function(s){return s.active;}).forEach(function(s,si){
    var first=(s.gender==='دخترانه')?FEMALE:MALE;
    add('users',{school_id:s.id,role:'counselor',full_name:pick(first)+' '+pick(LAST),
      username:'counselor'+(si+1),password:'123456',national_id:nid(),phone:demoPhone(),
      active:1,title:'مشاور مدرسه',created_at:daysAgoISO(470-si)});
  });
  /* دانش‌آموزان الگودار — تا نمای پیگیری و صف مشاور در دمو خالی نباشد */
  /* nStart/nEnd: فاصله از انتهای بازهٔ زمانی (آخر = ۰).
     ⚠️ slice(-7,0) خالی برمی‌گردد — ایندکس‌ها مثبت می‌شوند. */
  function setRecent(stId,nStart,nEnd,status){
    var recs=db.attendance.filter(function(a){return a.student_id===stId;})
      .sort(function(a,b){return a.date<b.date?-1:1;});
    var n=recs.length;
    var a0=Math.max(0,n-nStart);
    var a1=nEnd<0?Math.max(0,n-nEnd):n;
    recs.slice(a0,a1).forEach(function(a){a.status=status;});
  }
  function mkRef(st,kind,who,counselor,dayAgo){
    var c=patternCheck(st.id,30);
    var part=kind==='late'?c.late:c.absent;
    add('counselor_refs',{
      school_id:st.school_id,student_id:st.id,breach_key:kind,
      reason:breachFa(kind)+' — '+part.count+' بار در ۳۰ روز گذشته',
      pattern:c,referred_by:who.id,status:'open',
      created_at:new Date(Date.now()-dayAgo*86400000).toISOString()
    });
    void counselor;
  }
  function breachFa(kind){return BREACH_FA[kind]||kind;}
  var sid1=db.schools[0].id,sid2=db.schools[1].id;
  var kids1=db.users.filter(function(x){return x.role==='student'&&x.school_id===sid1&&(x.status||'active')==='active';});
  var kids2=db.users.filter(function(x){return x.role==='student'&&x.school_id===sid2&&(x.status||'active')==='active';});
  if(kids1.length>=3){
    var k1=kids1[0],k2=kids1[1],k3=kids1[2];
    /* ۷ تأخیر در ۷ روزِ آخرینِ مدرسه → آستانهٔ ۴ رد می‌شود، روند رو به افزایش */
    setRecent(k1.id,7,0,'late');
    /* ۴ غیبت → آستانهٔ ۳ */
    setRecent(k2.id,4,0,'absent');
    /* ترکیبی: ۳ غیبت + ۴ تأخیر */
    setRecent(k3.id,7,4,'absent');
    setRecent(k3.id,4,0,'late');
    var mgr1=db.users.find(function(u){return u.role==='manager'&&u.school_id===sid1;});
    if(mgr1){mkRef(k1,'late',mgr1,null,1);mkRef(k2,'absent',mgr1,null,2);mkRef(k3,'late',mgr1,null,3);}
  }
  if(kids2.length>=1){
    /* یک الگو + یک ارجاع در مدرسهٔ دوم — برای سنجش مرز بین‌مدرسه‌ای */
    setRecent(kids2[0].id,4,0,'absent');
    var mgr2=db.users.find(function(u){return u.role==='manager'&&u.school_id===sid2;});
    if(mgr2)mkRef(kids2[0],'absent',mgr2,null,1);
  }
  /* اعلان الگو نمونه (بند ۴): مدرسهٔ اول اطلاع‌رسانی روشن دارد و
     یک اعلان الگوی معلق در صف پیام اولیا می‌بیند. مدرسهٔ دوم
     عمداً خاموش می‌ماند — مرز «مدرسهٔ بدون اطلاع‌رسانی» هم در
     دمو دیده شود و نشت رکورد به آن نشود.
     ⚠️ مثل بقیهٔ دادهٔ پایه با add() — در دفترچهٔ عملیات نمی‌نشیند. */
  if(mgr1){
    var s1rec=db.schools.filter(function(s){return s.id===sid1;})[0];
    if(s1rec)s1rec.notify_rules={enabled:true,autoSend:false};
    var hasWal=db.sms_wallet.filter(function(x){return x.school_id===sid1;})[0];
    if(!hasWal)add('sms_wallet',{school_id:sid1,balance:500});
    /* نخستین دانش‌آموز الگودارِ دارای ولی — پیام نمونه در صف اولیا */
    var patRow=(patternFlagged(sid1,30)||[]).filter(function(f){
      return notifyParentsOf(f.user.id).length>0;
    })[0];
    if(patRow){
      var pk=patRow.user;
      var pkey=patRow.breaches.slice().sort(function(a,b){return b.count-a.count;})[0].key;
      var ppart=pkey==='late'?patRow.check.late:patRow.check.absent;
      var pbody=(typeof notifyBody==='function')?notifyBody('pattern',{
        student:pk.full_name,count:fa(ppart.count),
        what:pkey==='late'?'تأخیر':'غیبت',days:fa(30),
        school:(typeof notifySchoolName==='function')?notifySchoolName(sid1):'مدرسه'
      }):'';
      if(pbody)add('notify_queue',{
        school_id:sid1,kind:'pattern',student_id:pk.id,
        class_id:(classOf(pk.id)||{}).id||null,
        parent_ids:notifyParentsOf(pk.id),
        body:pbody,parts:(typeof smsParts==='function')?smsParts(pbody):1,
        status:'pending',
        created_at:new Date(Date.now()-86400000).toISOString(),
        created_by:mgr1.id,auto:0
      });
    }
  }
  /* یک ارجاعِ رسیدگی‌شده برای مدرسهٔ اول — بخش «رسیدگی‌شده» خالی نماند */
  var kids3=db.users.filter(function(x){return x.role==='student'&&x.school_id===sid1&&(x.status||'active')==='active';});
  if(kids3.length>=4){
    setRecent(kids3[3].id,4,0,'late');
    var mgr1b=db.users.find(function(u){return u.role==='manager'&&u.school_id===sid1;});
    var cous1=db.users.find(function(u){return u.role==='counselor'&&u.school_id===sid1;});
    if(mgr1b&&cous1){
      var c=patternCheck(kids3[3].id,30);
      add('counselor_refs',{
        school_id:sid1,student_id:kids3[3].id,breach_key:'late',
        reason:breachFa('late')+' — '+c.late.count+' بار در ۳۰ روز گذشته',
        pattern:c,referred_by:mgr1b.id,status:'handled',
        referred_at:null,
        handled_by:cous1.id,
        handled_at:new Date(Date.now()-6*86400000).toISOString(),
        note:'جلسهٔ نخست برگزار شد؛ خانواده در جریان قرار گرفت',
        created_at:new Date(Date.now()-8*86400000).toISOString()
      });
    }
  }
  /* ۵.۲ — مسیرِ نمونهٔ دوازدهم↔مشاور تا بخشِ دمو خالی نباشد
     (همان مثلِ بقیهٔ دادهٔ پایه با add()) */
  (function(){
    var twelfth=null;
    db.users.forEach(function(st){
      if(st.role!=='student'||(st.status||'active')!=='active')return;
      var cls=(typeof classOf==='function')?classOf(st.id):null;
      var g=Number(st.grade_level||(cls&&(cls.grade_level||gradeFromName(cls.name)))||0);
      if(g===12&&!twelfth)twelfth=st;
    });
    if(!twelfth)return;
    var cous=db.users.find(function(u){return u.role==='counselor'&&u.school_id===twelfth.school_id;})||null;
    add('counselor_msgs',{school_id:twelfth.school_id,student_id:twelfth.id,
      author_id:twelfth.id,author_role:'student',
      body:'سلام، دربارهٔ تقسیم‌بندی نمرهٔ نهایی و انتخاب رشته سؤال دارم. کی می‌توانم بیایم؟',
      status:'open',created_at:new Date(Date.now()-2*86400000).toISOString()});
    if(cous)add('counselor_msgs',{school_id:twelfth.school_id,student_id:twelfth.id,
      author_id:cous.id,author_role:'counselor',
      body:'سلام! روز سه‌شنبه ساعت ۱۲ در دفتر مشغول شما هستم. برنامهٔ مشاوره کنکور را هم با خودتان بیاورید.',
      status:'open',created_at:new Date(Date.now()-1*86400000).toISOString()});
  })();
}

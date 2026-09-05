/* ============================ فاز ۱۰ — چندنقشی و اشتراک پنل اولیا ============================ */

const SUB_PLANS = [
  {code:'monthly',  title:'یک‌ماهه', months:1,  amount:250000,  desc:'دسترسی کامل به پرونده فرزندان برای ۳۰ روز'},
  {code:'seasonal', title:'سه‌ماهه', months:3,  amount:650000,  desc:'صرفه‌جویی ۱۳٪ نسبت به خرید ماهانه'},
  {code:'yearly',   title:'یک‌ساله', months:12, amount:2200000, desc:'به‌صرفه‌ترین گزینه — ۲۷٪ تخفیف'},
];
/* تنظیمات اشتراک (قابل تغییر در پنل سوپر ادمین) */
const SUB_DEFAULTS={trial_enabled:1,trial_days:21,paywall_enabled:1,price_monthly:250000,price_seasonal:650000,price_yearly:2200000};
function subSettings(){
  const row=(db.app_settings||[])[0]||null;
  return Object.assign({},SUB_DEFAULTS,row?row.data:{});
}
function saveSubSettings(patch){
  db.app_settings=db.app_settings||[];
  const cur=subSettings();
  const data=Object.assign({},cur,patch);
  if(db.app_settings.length)update('app_settings',db.app_settings[0].id,{data});
  else insert('app_settings',{data});
  return data;
}
function planList(){
  const st=subSettings();
  return SUB_PLANS.map(p=>Object.assign({},p,{amount:st['price_'+p.code]!=null?st['price_'+p.code]:p.amount}));
}
const PANEL_TITLE={superadmin:'پنل سوپر ادمین',manager:'پنل مدیر مدرسه',teacher:'پنل دبیر',student:'پنل دانش‌آموز',edu_office:'پنل اداره',parent:'پنل اولیا'};
const PANEL_ICON={superadmin:'🛡️',manager:'🏫',teacher:'👨‍🏫',student:'🎓',edu_office:'🏛️',parent:'👨‍👩‍👦'};

/* ---------------- نقش‌های یک شخص ---------------- */
/** فرزندان یک شخص (با هر نقشی) بر اساس پیوند یا کد ملی پدر/مادر */
function childrenOfUser(u){
  const ids=new Set(db.parent_links.filter(l=>l.parent_id===u.id).map(l=>l.student_id));
  if(u.national_id)db.users.filter(x=>x.role==='student'&&(x.father_nid===u.national_id||x.mother_nid===u.national_id)).forEach(x=>ids.add(x.id));
  return [...ids].map(id=>byId('users',id)).filter(Boolean);
}
/** اتصال خودکار شخص به فرزندانش (برای دبیر/مدیرِ ولی هم کار می‌کند) */
function linkAsParent(u){
  if(!u.national_id)return 0;
  let n=0;
  db.users.filter(x=>x.role==='student'&&(x.father_nid===u.national_id||x.mother_nid===u.national_id)).forEach(k=>{
    const rejected=db.parent_verifications.some(v=>v.parent_id===u.id&&v.student_id===k.id&&v.status==='rejected');
    if(rejected)return;
    if(!db.parent_links.some(l=>l.parent_id===u.id&&l.student_id===k.id)){
      insert('parent_links',{parent_id:u.id,student_id:k.id,relation:k.father_nid===u.national_id?'پدر':'مادر'}); n++;
    }
    if(!db.parent_verifications.some(v=>v.parent_id===u.id&&v.student_id===k.id))
      insert('parent_verifications',{parent_id:u.id,student_id:k.id,status:'pending'});
  });
  return n;
}
/** پنل‌های در دسترس کاربر جاری */
function panelsOf(u){
  const base=u.role;
  const list=[];
  if(base!=='parent')list.push({role:base,title:PANEL_TITLE[base]||base,icon:PANEL_ICON[base]||'👤',primary:true});
  const kids=childrenOfUser(u);
  if(kids.length||base==='parent')
    list.push({role:'parent',title:'پنل اولیا',icon:'👨‍👩‍👦',primary:base==='parent',children:kids,requiresSub:true});
  return list;
}
const activePersona=()=>S.persona||(S.user?S.user.role:null);
const isMultiRole=()=>S.user&&panelsOf(S.user).length>1;

/* ---------------- اشتراک پنل اولیا ---------------- */
function subOf(userId,createTrial){
  let row=db.parent_subscriptions.find(s=>s.user_id===userId);
  if(!row&&createTrial){
    const st=subSettings();
    if(st.trial_enabled&&st.trial_days>0)
      row=insert('parent_subscriptions',{user_id:userId,plan:'trial',amount:0,status:'trial',
        start_date:todayISO(),end_date:addDaysISO(todayISO(),st.trial_days)});
    else row=insert('parent_subscriptions',{user_id:userId,plan:'none',amount:0,status:'none'});
  }
  if(!row)return {status:'none',active:false,daysLeft:0,plan:null,end_date:null};
  const expired=row.end_date&&row.end_date<todayISO();
  if(expired&&row.status!=='expired'){update('parent_subscriptions',row.id,{status:'expired'});row=byId('parent_subscriptions',row.id);}
  const active=['active','trial'].includes(row.status)&&(!row.end_date||row.end_date>=todayISO());
  const daysLeft=row.end_date?Math.max(0,Math.round((new Date(row.end_date)-new Date(todayISO()))/864e5)):0;
  return Object.assign({},row,{active,daysLeft,trial:row.status==='trial'});
}
/* ═══════════════════════════════════════════════════════════════════
   قاعدهٔ کسب‌وکار: اشتراک به دانش‌آموز تعلق دارد، نه به ولی
   ═══════════════════════════════════════════════════════════════════
   خواستهٔ صریح کاربر (نکتهٔ بازاریابی):
   «کافی است پدر یا مادر یکی‌شان اشتراک را بپردازد؛ هر دو دسترسی
   پیدا می‌کنند. لازم نیست برای یک دانش‌آموز هم پدر و هم مادر
   جداگانه پرداخت کنند.»

   پس معیار قفل بودن پنل، اشتراکِ خودِ ولی نیست؛ بلکه این است که
   «آیا برای دست‌کم یکی از فرزندان او، کسی اشتراک فعال دارد؟»
   ═══════════════════════════════════════════════════════════════════ */

/**
 * اشتراک فعالِ یک دانش‌آموز را پیدا می‌کند — از میان همهٔ اولیای او.
 * خروجی: شیء اشتراک به‌همراه شناسه و نام پرداخت‌کننده، یا null.
 */
function studentSubscription(studentId){
  var links = db.parent_links.filter(function(l){ return l.student_id === Number(studentId); });
  for(var i = 0; i < links.length; i++){
    /* createTrial عمداً false است: بررسی وضعیت نباید عوارض جانبی داشته باشد */
    var sub = subOf(links[i].parent_id, false);
    if(sub && sub.active)
      return { sub: sub, payerId: links[i].parent_id,
               payer: byId('users', links[i].parent_id), relation: links[i].relation || null };
  }
  return null;
}

/**
 * دسترسی مؤثر یک ولی: اشتراک خودش، یا اشتراک هم‌ولیِ یکی از فرزندانش.
 * این تابع قلب قاعدهٔ «یک اشتراک برای هر دانش‌آموز» است.
 */
function effectiveParentAccess(parentId){
  parentId = parentId || (S.user && S.user.id);
  if(!parentId) return { active:false, own:false, via:null };

  /* ۱. اشتراک هم‌ولی زودتر بررسی می‌شود.
     چرا؟ چون subOf(id, true) در نخستین فراخوانی خودش دورهٔ آزمایشی
     می‌سازد. اگر اول آن را صدا بزنیم، ولیِ دومی که هم‌ولی‌اش پرداخت
     کرده بی‌جهت یک دورهٔ آزمایشی مصرف می‌کند و در گزارش‌ها به‌اشتباه
     «صاحب اشتراک» شمرده می‌شود. */
  var kids = db.parent_links.filter(function(l){ return l.parent_id === parentId; });
  for(var i = 0; i < kids.length; i++){
    var found = studentSubscription(kids[i].student_id);
    if(found && found.payerId !== parentId)
      return { active:true, own:false, via:found, sub:found.sub,
               student: byId('users', kids[i].student_id) };
  }

  /* ۲. اشتراک خودش — اینجا در نخستین ورود دورهٔ آزمایشی ساخته می‌شود */
  var own = subOf(parentId, true);
  if(own && own.active) return { active:true, own:true, via:null, sub:own };
  return { active:false, own:false, via:null, sub:own };
}

/** آیا پنل اولیای کاربر جاری قفل است؟ */
const parentLocked=()=>{
  if(activePersona()!=='parent')return false;
  if(!subSettings().paywall_enabled)return false;
  /* اشتراک به دانش‌آموز تعلق دارد: اگر هم‌ولی پرداخت کرده باشد، باز است */
  return !effectiveParentAccess(S.user.id).active;
};

/* ─────────── دیوار پرداخت (بند ۴) ───────────
   دادهٔ پایهٔ مدرسه همیشه رایگان است: نمره، حضور و غیاب، برنامهٔ
   کلاس، برنامهٔ امتحانات، تقویم و شهریهٔ فرزند. دیوار پرداخت فقط
   «ارتباط و درخواست‌ها» را می‌گیرد: نوبت جلسه، درخواست مرخصی،
   گفتگو. فهرست روت‌های همیشه‌باز برای ولی: */
const PARENT_FREE_ROUTES=['dashboard','children','record','exams','calendar','family','mytuition','subscription','notifications','announcements'];

/* ---------------- داده نمونه ---------------- */
function generateP10(){
  db.parent_subscriptions=db.parent_subscriptions||[];
  db.subscription_payments=db.subscription_payments||[];
  // همه اولیای نمونه اشتراک فعال دارند
  db.users.filter(u=>u.role==='parent').forEach(p=>{
    if(db.parent_subscriptions.some(s=>s.user_id===p.id))return;
    add('parent_subscriptions',{user_id:p.id,plan:'yearly',amount:2200000,status:'active',
      start_date:daysAgoISO(30),end_date:addDaysISO(todayISO(),300),paid_at:daysAgoISO(30),ref_id:'SUB-S'+p.id});
  });
  // یک «دبیرِ ولی» و یک «مدیرِ ولی» بدون اشتراک (برای نمایش صفحه پرداخت)
  const t=db.users.find(u=>u.role==='teacher'&&u.active);
  const m=db.users.find(u=>u.role==='manager'&&u.active);
  [[t,2],[m,1]].forEach(([person,count])=>{
    if(!person)return;
    // فرزندان این شخص در مدرسه‌ای دیگر درس می‌خوانند (سناریوی واقعی)
    const multi=db.users.find(u=>u.username==='parent_multi');
    const reserved=new Set(multi?db.parent_links.filter(l=>l.parent_id===multi.id).map(l=>l.student_id):[]);
    const kids=db.users.filter(x=>x.role==='student'&&x.school_id!==person.school_id&&!reserved.has(x.id)).slice(-count);
    kids.forEach(k=>{
      k.father_nid=person.national_id;
      // پیوند ولی قبلی برداشته می‌شود تا دو «پدر» ثبت نشود
      db.parent_links.filter(l=>l.student_id===k.id).forEach(l=>{
        const idx=db.parent_links.indexOf(l); if(idx>-1)db.parent_links.splice(idx,1);
      });
    });
    linkAsParent(person);
    if(person.role==='manager'&&!db.parent_subscriptions.some(s=>s.user_id===person.id))
      add('parent_subscriptions',{user_id:person.id,plan:'trial',amount:0,status:'expired',
        start_date:daysAgoISO(24),end_date:daysAgoISO(3)});   // منقضی: نمایش صفحه پرداخت
  });
}

/* ---------------- نمای انتخاب پنل ---------------- */
function panelPicker(){
  const panels=panelsOf(S.user);
  let cards='';
  panels.forEach(function(p){
    let sub='';
    if(p.role==='parent'){
      const s=subOf(S.user.id);
      const kidNames=p.children.map(function(k){return esc(k.full_name);}).join('، ');
      const badge=s.active
        ?(s.status==='trial'?'<span class="badge b-amber">🎁 تست رایگان — '+fa(s.daysLeft)+' روز</span>'
                            :'<span class="badge b-green">اشتراک فعال — '+fa(s.daysLeft)+' روز</span>')
        :(subSettings().trial_enabled&&!db.parent_subscriptions.some(x=>x.user_id===S.user.id)
            ?'<span class="badge b-blue">🎁 '+fa(subSettings().trial_days)+' روز تست رایگان</span>'
            :'<span class="badge b-amber">نیازمند پرداخت اشتراک</span>');
      sub='<div class="small muted" style="line-height:1.9">'
        +(p.children.length?fa(p.children.length)+' فرزند: '+kidNames:'بدون فرزند')+'<div>'+badge+'</div></div>';
    } else sub='<div class="small muted">پنل اصلی حساب شما</div>';
    cards+='<div class="demo-item" style="padding:14px 16px;justify-content:flex-start;gap:14px;cursor:pointer" data-act="pick-panel" data-r="'+p.role+'">'
      +'<span style="font-size:26px">'+p.icon+'</span>'
      +'<span style="text-align:right"><b style="font-size:15px">'+esc(p.title)+'</b>'+sub+'</span>'
      +(activePersona()===p.role?'<span class="badge b-blue" style="margin-inline-start:auto">پنل فعلی</span>':'')
      +'</div>';
  });
  return '<div class="modal-back" style="z-index:210"><div class="modal" style="max-width:560px">'
    +'<div class="card-head" style="background:linear-gradient(120deg,#14225a,#1668f0);color:#fff;border-radius:14px 14px 0 0">'
    +'<h3 style="color:#fff">🔄 انتخاب پنل</h3>'
    +'<span class="badge" style="background:rgba(255,255,255,.2);color:#fff">'+fa(panels.length)+' پنل</span></div>'
    +'<div class="card-body"><p style="margin:0 0 14px;line-height:2">سلام <b>'+esc(S.user.full_name)+'</b>؛ شما در سامانه بیش از یک نقش دارید. با کدام پنل وارد می‌شوید؟</p>'
    +'<div style="display:grid;gap:10px">'+cards+'</div></div>'
    +'<div class="card-head" style="border-bottom:none;border-top:1px solid var(--border);justify-content:flex-end">'
    +'<button class="btn ghost" data-act="close-picker">بستن</button></div></div></div>';
}

/* ---------------- صفحه اشتراک ---------------- */
function viewSubscription(){
  const s=subOf(S.user.id,true);
  const hist=db.subscription_payments.filter(x=>x.user_id===S.user.id).sort((a,b)=>b.id-a.id);
  /* اگر دسترسی از راه هم‌ولی است، به کاربر توضیح داده می‌شود که چرا
     پنلش باز است و لازم نیست دوباره پرداخت کند */
  const acc = effectiveParentAccess(S.user.id);
  let shared = '';
  if(acc.active && !acc.own && acc.via){
    const payer = acc.via.payer || {};
    const kid = acc.student || {};
    shared = '<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--green-soft),#fff)">'
      + '<div class="card-body row"><div style="font-size:32px">🤝</div>'
      + '<div style="flex:1"><b style="font-size:15px">اشتراک شما از پیش فعال است</b>'
      + '<div class="small muted" style="line-height:2">'
      + esc(payer.full_name || 'ولی دیگر')
      + (kid.full_name ? ' برای <b>' + esc(kid.full_name) + '</b>' : '')
      + ' اشتراک را پرداخت کرده است. اشتراک به <b>دانش‌آموز</b> تعلق دارد، '
      + 'پس نیازی به پرداخت دوباره ندارید و همهٔ بخش‌ها برایتان باز است.'
      + (acc.via.sub && acc.via.sub.daysLeft
          ? '<br>اعتبار تا <b>' + fa(acc.via.sub.daysLeft) + '</b> روز دیگر.' : '')
      + '</div></div></div></div>';
  }
  let plans='';
  planList().forEach(function(p){
    plans+='<div class="card" style="text-align:center"><div class="card-head" style="justify-content:center"><h3>'+esc(p.title)+'</h3></div>'
      +'<div class="card-body"><div style="font-size:26px;font-weight:700;color:var(--primary)">'+rial(p.amount)+'</div>'
      +'<div class="small muted">ریال / '+fa(p.months)+' ماه</div>'
      +'<div class="small" style="margin:12px 0;min-height:44px;line-height:2">'+esc(p.desc)+'</div>'
      +'<button class="btn" style="width:100%;justify-content:center" data-act="sub-pay" data-r="'+p.code+'">'
      +(s.active?'➕ تمدید':'💳 پرداخت و فعال‌سازی')+'</button></div></div>';
  });
  return shared+'<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,'+(s.active?'var(--green-soft)':'var(--amber-soft)')+',#fff)">'
    +'<div class="card-body"><div class="row"><div style="font-size:34px">'+(s.active?'✅':'🔒')+'</div><div>'
    +'<b style="font-size:16px">'+(s.active?'اشتراک پنل اولیا فعال است':'اشتراک پنل اولیا فعال نیست')+'</b>'
    +'<div class="small muted" style="line-height:2">'
    +(s.active?(s.status==='trial'
        ?('🎁 دوره تست رایگان — تا '+jalali(s.end_date)+' ('+fa(s.daysLeft)+' روز باقی‌مانده). برای ادامه دسترسی، پیش از پایان مهلت اشتراک بگیرید.')
        :('طرح '+esc((SUB_PLANS.find(p=>p.code===s.plan)||{title:s.plan}).title)+' — تا '+jalali(s.end_date)+' ('+fa(s.daysLeft)+' روز باقی‌مانده)'))
              :'برای مشاهده نمرات، حضور و غیاب، پرونده انضباطی و شهریه فرزندان، یکی از طرح‌های زیر را فعال کنید.')
    +'</div></div></div></div></div>'
    +'<div class="grid g3">'+plans+'</div>'
    +'<div class="card" style="margin-top:14px"><div class="card-head"><h3>سابقه پرداخت‌ها</h3></div>'
    +(hist.length?'<div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>طرح</th><th>مدت</th><th>مبلغ</th><th>کد رهگیری</th></tr></thead><tbody>'
      +hist.map(function(h){return '<tr><td>'+jalali(h.paid_at)+'</td><td>'+esc((SUB_PLANS.find(p=>p.code===h.plan)||{title:h.plan}).title)+'</td><td>'+fa(h.months)+' ماه</td><td>'+rial(h.amount)+' ریال</td><td class="small muted">'+esc(h.ref_id)+'</td></tr>';}).join('')
      +'</tbody></table></div>':'<div class="card-body small muted">هنوز پرداختی ثبت نشده است.</div>')+'</div>';
}

/** صفحه قفل — وقتی اشتراک فعال نیست */
function viewLocked(){
  /* بند ۴: دادهٔ پایه (نمره/حضور/برنامه کلاس/امتحانات/شهریه) همیشه رایگان است */
  return '<div class="card" style="text-align:center;padding:38px 20px">'
    +'<div style="font-size:44px">🔒</div>'
    +'<h3 style="margin:12px 0 6px;font-size:17px">برای این بخش، اشتراک پنل اولیا لازم است</h3>'
    +'<div class="small muted" style="line-height:2;max-width:460px;margin:0 auto 16px">'
    +'نمرات، حضور و غیاب، برنامهٔ کلاس، برنامهٔ امتحانات و شهریهٔ فرزندتان همیشه بدون اشتراک در دسترس است. '
    +'با فعال‌سازی اشتراک می‌توانید نوبت جلسهٔ اولیا بگیرید، درخواست مرخصی بفرستید و با مدرسه گفتگو کنید.</div>'
    +'<div><button class="btn" data-act="go" data-r="subscription">مشاهده طرح‌ها و پرداخت</button></div></div>';
}

/* ---------------- صفحه سوپر ادمین: اشتراک اولیا ---------------- */
function viewAdminSubs(){
  const st=subSettings();
  const subs=db.parent_subscriptions.map(function(x){
    const u=byId('users',x.user_id)||{};
    return Object.assign({},x,{full_name:u.full_name||'—',username:u.username||'',role:u.role||''});
  });
  const q=(S.filters.subq||'').trim();
  const rows=subs.filter(function(r){return !q||(r.full_name+r.username).includes(q);});
  const cnt=function(st_){return subs.filter(function(x){return x.status===st_;}).length;};
  const income=db.subscription_payments.reduce(function(a,b){return a+(b.amount||0);},0);
  const ST_={trial:['آزمایشی','b-amber'],active:['فعال','b-green'],expired:['منقضی','b-red'],none:['بدون اشتراک','b-gray']};
  const roleFa=function(r){return r==='parent'?'ولی':r==='teacher'?'دبیر (ولی)':r==='manager'?'مدیر (ولی)':r;};
  return '<div class="grid g4" style="margin-bottom:14px">'
    +statCard('🎁',fa(cnt('trial')),'در دوره تست رایگان','amber')
    +statCard('✅',fa(cnt('active')),'اشتراک فعال','green')
    +statCard('⏳',fa(cnt('expired')),'منقضی‌شده','red')
    +statCard('💰',rialShort(income),'درآمد اشتراک (ریال)','blue')+'</div>'
    +'<div class="card" style="margin-bottom:14px"><div class="card-head"><h3>⚙️ تنظیمات اشتراک اولیا</h3>'
    +'<button class="btn" data-act="subset-save">ذخیره تنظیمات</button></div><div class="card-body">'
    +'<div class="grid g3">'
    +f('مهلت تست رایگان (روز)',inp('ss_days',st.trial_days,'number'))
    +f('وضعیت تست رایگان',sel('ss_trial',[[1,'فعال'],[0,'غیرفعال']],st.trial_enabled?1:0))
    +f('الزام پرداخت برای دیدن داده‌ها',sel('ss_paywall',[[1,'فعال (نیازمند اشتراک)'],[0,'غیرفعال (رایگان)']],st.paywall_enabled?1:0))
    +'</div><div class="sec-title">💳 قیمت طرح‌ها (ریال)</div><div class="grid g3">'
    +f('یک‌ماهه',inp('ss_m',st.price_monthly,'number'))
    +f('سه‌ماهه',inp('ss_s',st.price_seasonal,'number'))
    +f('یک‌ساله',inp('ss_y',st.price_yearly,'number'))
    +'</div><div class="small muted" style="margin-top:10px;line-height:2">ℹ️ هر ولی در نخستین ورود، به‌صورت خودکار '
    +fa(st.trial_days)+' روز دسترسی رایگان می‌گیرد؛ پس از آن برای دیدن اطلاعات فرزندان باید اشتراک بخرد.</div></div></div>'
    +'<div class="card"><div class="card-head"><h3>👨‍👩‍👦 اشتراک اولیا</h3>'
    +'<input class="input" style="max-width:220px" placeholder="جستجوی نام یا نام کاربری…" data-f="subq" value="'+esc(q)+'" /></div>'
    +(rows.length?'<div class="table-wrap"><table class="table"><thead><tr><th>کاربر</th><th>نقش</th><th>طرح</th><th>وضعیت</th><th>پایان</th><th>مبلغ</th><th></th></tr></thead><tbody>'
      +rows.slice(0,100).map(function(r){
        const stx=ST_[r.status]||['—','b-gray'];
        return '<tr><td><b>'+esc(r.full_name)+'</b><div class="small muted">'+esc(r.username)+'</div></td>'
          +'<td class="small">'+esc(roleFa(r.role))+'</td>'
          +'<td class="small">'+esc(r.plan==='trial'?'آزمایشی':(r.plan==='none'?'—':((SUB_PLANS.find(p=>p.code===r.plan)||{title:r.plan}).title)))+'</td>'
          +'<td><span class="badge '+stx[1]+'">'+stx[0]+'</span></td>'
          +'<td class="small">'+(r.end_date?jalali(r.end_date):'—')+'</td>'
          +'<td class="small">'+(r.amount?rial(r.amount):'—')+'</td>'
          +'<td><div class="row" style="gap:5px;flex-wrap:nowrap">'
          +'<button class="btn ghost sm" data-act="sub-grant" data-id="'+r.user_id+'">🎁 فعال‌سازی</button>'
          +'<button class="icon-btn danger" title="بازنشانی" data-act="sub-reset" data-id="'+r.user_id+'">♻️</button>'
          +'</div></td></tr>';}).join('')
      +'</tbody></table></div>'
      +(rows.length>100?'<div class="card-body small muted">۱۰۰ مورد نخست نمایش داده شد.</div>':'')
      :empty('👨‍👩‍👦','اشتراکی ثبت نشده است',''))
    +'</div>';
}

/* ---------------- عملیات ---------------- */
const P10_ACTIONS = {
  'subset-save'(){
    const days=Number(V('ss_days'));
    if(isNaN(days)||days<0||days>365){toast('مهلت تست باید بین ۰ تا ۳۶۵ روز باشد','err');return;}
    saveSubSettings({trial_days:days,trial_enabled:Number(V('ss_trial')),paywall_enabled:Number(V('ss_paywall')),
      price_monthly:Number(V('ss_m'))||0,price_seasonal:Number(V('ss_s'))||0,price_yearly:Number(V('ss_y'))||0});
    toast('تنظیمات اشتراک ذخیره شد','ok'); render();
  },
  'sub-grant'(el,id){
    const u=byId('users',id);
    openModal(modalTpl('فعال‌سازی اشتراک — '+esc(u.full_name),
      f('مدت (روز)',inp('gr_days',30,'number')),'sub-grant-ok'));
    window._grantId=id;
  },
  'sub-grant-ok'(){
    const id=window._grantId, days=Number(V('gr_days'))||30;
    const cur=subOf(id);
    const from=(cur.active&&cur.end_date&&cur.end_date>todayISO())?cur.end_date:todayISO();
    const end=addDaysISO(from,days);
    const row=db.parent_subscriptions.find(s=>s.user_id===id);
    if(row)update('parent_subscriptions',row.id,{status:'active',start_date:todayISO(),end_date:end});
    else insert('parent_subscriptions',{user_id:id,plan:'gift',amount:0,status:'active',start_date:todayISO(),end_date:end});
    insert('notifications',{user_id:id,school_id:(byId('users',id)||{}).school_id||null,type:'announcement',
      title:'🎁 اشتراک پنل اولیا فعال شد',body:'اشتراک شما تا '+jalali(end)+' فعال است.',link:'subscription',read:0,created_at:todayISO()});
    closeModal(); toast('اشتراک فعال شد','ok'); render();
  },
  'sub-reset'(el,id){
    const u=byId('users',id);
    askConfirm('اشتراک «'+u.full_name+'» بازنشانی شود؟ دوره تست رایگان دوباره از ابتدا محاسبه می‌شود.',()=>{
      const row=db.parent_subscriptions.find(s=>s.user_id===id);
      if(row)remove('parent_subscriptions',row.id);
      toast('بازنشانی شد',''); render();
    },{title:'بازنشانی اشتراک',ok:'بازنشانی کن',danger:true,note:false});
  },
  'pick-panel'(el){
    const role=el.dataset.r;
    S.showPicker=false;
    if(role===S.user.role)S.persona=null; else S.persona=role;
    S.stack=[];S.filters={};S.child=null;
    S.route=(role==='parent')?(subOf(S.user.id,true).active?'dashboard':'subscription')
      :(role==='edu_office'?'officedash':'dashboard');
    Store.set(PERSONA_KEY,S.persona||'');
    toast('وارد '+(PANEL_TITLE[role]||'پنل')+' شدید','ok');
    render();
  },
  'close-picker'(){ S.showPicker=false; render(); },
  'open-picker'(){ S.showPicker=true; render(); },
  'sub-pay'(el){
    const plan=planList().find(p=>p.code===el.dataset.r);
    askConfirm('پرداخت اشتراک «'+plan.title+'» به مبلغ '+rial(plan.amount)+' ریال انجام شود؟',()=>{
      const cur=subOf(S.user.id);
      const from=(cur.active&&cur.end_date&&cur.end_date>todayISO())?cur.end_date:todayISO();
      const end=addDaysISO(from,plan.months*30);
      const ref='SUB-'+String(Date.now()).slice(-8);
      const row=db.parent_subscriptions.find(s=>s.user_id===S.user.id);
      if(row)update('parent_subscriptions',row.id,{plan:plan.code,amount:plan.amount,status:'active',start_date:todayISO(),end_date:end,paid_at:todayISO(),ref_id:ref});
      else insert('parent_subscriptions',{user_id:S.user.id,plan:plan.code,amount:plan.amount,status:'active',start_date:todayISO(),end_date:end,paid_at:todayISO(),ref_id:ref});
      insert('subscription_payments',{user_id:S.user.id,plan:plan.code,amount:plan.amount,months:plan.months,ref_id:ref,method:'online',paid_at:todayISO()});
      insert('notifications',{user_id:S.user.id,school_id:S.user.school_id||null,type:'announcement',
        title:'✅ اشتراک پنل اولیا فعال شد',body:'طرح '+plan.title+' تا '+jalali(end)+' فعال شد. کد رهگیری: '+ref,
        link:'subscription',read:0,created_at:todayISO()});
      toast('اشتراک فعال شد — کد رهگیری '+ref,'ok');
      render();
    },{title:'پرداخت اشتراک',ok:'پرداخت',danger:false,note:'پرداخت آزمایشی است و مبلغی از حساب شما کسر نمی‌شود.'});
  },
  'sub-cancel'(){
    askDelete('اشتراک پنل اولیا لغو شود؟ دسترسی به اطلاعات فرزندان بسته می‌شود.',()=>{
      const row=db.parent_subscriptions.find(s=>s.user_id===S.user.id);
      if(row)update('parent_subscriptions',row.id,{status:'expired',end_date:todayISO()});
      toast('اشتراک لغو شد',''); render();
    });
  },
};

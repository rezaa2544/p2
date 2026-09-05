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
 * اشتراکِ فعالِ یک دانش‌آموز — از میان همهٔ سطرهای مربوط به او.
 * سطرهای قدیمی (بدون student_id) «هر فرزندِ آن ولی» را می‌بازند؛
 * سطرهای جدید فقط همان دانش‌آموزِ مشخص را.
 * @param {number} studentId شناسهٔ دانش‌آموز
 * @param {number|null} asParent شناسهٔ ولیِ در حال عمل (برای ساختِ تست)
 * @param {boolean} createTrial اگر فعال باشد و سطر نباشد، دورهٔ تست بسازد
 */
function studentSubOf(studentId, asParent, createTrial){
  studentId = Number(studentId);
  const sidParents = new Set(db.parent_links.filter(l=>l.student_id===studentId).map(l=>l.parent_id));
  let best = null;
  db.parent_subscriptions.forEach(function(row){
    if(row.status === 'none') return;
    const isLegacy = !row.student_id;
    const owned = (asParent && row.user_id===asParent) || sidParents.has(row.user_id);
    if(!owned) return;
    if(!isLegacy && Number(row.student_id)!==studentId) return;
    if(!best || new Date(row.end_date||'0000') > new Date(best.end_date||'0000')) best = row;
  });
  if(!best && createTrial && asParent){
    const st = subSettings();
    if(st.trial_enabled && st.trial_days>0)
      best = insert('parent_subscriptions',{user_id:asParent,student_id:studentId,plan:'trial',amount:0,status:'trial',
        start_date:todayISO(),end_date:addDaysISO(todayISO(),st.trial_days)});
  }
  if(!best) return {status:'none',active:false,daysLeft:0,plan:null,end_date:null};
  const expired = best.end_date && best.end_date < todayISO();
  if(expired && best.status!=='expired'){update('parent_subscriptions',best.id,{status:'expired'});best=byId('parent_subscriptions',best.id);}
  const active = ['active','trial'].includes(best.status) && (!best.end_date || best.end_date>=todayISO());
  const daysLeft = best.end_date ? Math.max(0,Math.round((new Date(best.end_date)-new Date(todayISO()))/864e5)) : 0;
  return Object.assign({},best,{active:active,daysLeft:daysLeft,trial:best.status==='trial'});
}

/**
 * اشتراک فعالِ یک دانش‌آموز — از میان همهٔ اولیای او.
 * خروجی: {sub, payerId, payer, relation} یا null.
 * بررسی وضعیت عوارض جانبی ندارد (createTrial=false).
 */
function studentSubscription(studentId){
  var sub = studentSubOf(studentId, null, false);
  if(sub && sub.active){
    var link = db.parent_links.find(function(l){ return l.student_id===Number(studentId) && l.parent_id===sub.user_id; });
    return { sub:sub, payerId:sub.user_id,
             payer:byId('users',sub.user_id)||null,
             relation:(link && link.relation) || null };
  }
  return null;
}

/**
 * دسترسی مؤثر یک ولی: اگر برای دست‌کم یکی از فرزندانش اشتراک فعال
 * باشد (خودش یا هم‌ولیِ دیگر)، پنلش باز است.
 */
function effectiveParentAccess(parentId){
  parentId = parentId || (S.user && S.user.id);
  if(!parentId) return { active:false, own:false, via:null, sub:null };

  var kids = db.parent_links.filter(function(l){ return l.parent_id===parentId; });

  /* ۱. از راه هم‌ولی (برای یکی از فرزندان، دیگری پرداخت کرده) */
  for(var i=0;i<kids.length;i++){
    var found = studentSubscription(kids[i].student_id);
    if(found && found.payerId!==parentId)
      return { active:true, own:false, via:found, sub:found.sub,
               student:byId('users',kids[i].student_id) };
  }

  /* ۲. اشتراک خودش برای هر یک از فرزندان — اینجا تستِ هر فرزند ساخته می‌شود */
  for(var j=0;j<kids.length;j++){
    var own = studentSubOf(kids[j].student_id, parentId, true);
    if(own && own.active)
      return { active:true, own:true, via:null, sub:own,
               student:byId('users',kids[j].student_id) };
  }
  return { active:false, own:false, via:null, sub:null };
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
  // همه اولیای نمونه برای هر فرزندشان اشتراک فعال دارند (مدل فرزندبه‌فرزند)
  db.users.filter(u=>u.role==='parent').forEach(p=>{
    const kids=db.parent_links.filter(l=>l.parent_id===p.id).map(l=>byId('users',l.student_id)).filter(Boolean);
    kids.forEach(k=>{
      if(db.parent_subscriptions.some(s=>s.user_id===p.id&&(!s.student_id||Number(s.student_id)===k.id)))return;
      add('parent_subscriptions',{user_id:p.id,student_id:k.id,plan:'yearly',amount:2200000,status:'active',
        start_date:daysAgoISO(30),end_date:addDaysISO(todayISO(),300),paid_at:daysAgoISO(30),ref_id:'SUB-S'+p.id+'-'+k.id});
    });
  });
  // خانوادهٔ چندفرزندِ نمونه: اشتراکِ فرزندِ دوم — حتی از سمتِ ولیِ دیگر —
  // منقضی است تا وضعیتِ فرزندبه‌فرزند در پنل دیده شود
  {
    const multi=db.users.find(u=>u.username==='parent_multi');
    if(multi){
      const mk=db.parent_links.filter(l=>l.parent_id===multi.id).map(l=>byId('users',l.student_id)).filter(Boolean);
      if(mk.length>=2){
        const target=mk[1].id;
        db.parent_subscriptions
          .filter(s=>Number(s.student_id)===target
            ||(!s.student_id&&db.parent_links.some(l=>l.student_id===target&&l.parent_id===s.user_id)))
          .forEach(s=>update('parent_subscriptions',s.id,{status:'expired',end_date:daysAgoISO(3)}));
      }
    }
  }
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
      const kact=p.children.filter(k=>studentSubOf(k.id,S.user.id,false).active).length;
      const kidNames=p.children.map(function(k){return esc(k.full_name);}).join('، ');
      const badge=p.children.length
        ?(kact===p.children.length?'<span class="badge b-green">اشتراک فعال — همهٔ فرزندان</span>'
          :(kact>0?'<span class="badge b-amber">'+fa(kact)+' از '+fa(p.children.length)+' فرزند فعال</span>'
            :'<span class="badge b-amber">نیازمند پرداخت اشتراک</span>'))
        :'<span class="badge b-gray">بدون فرزند</span>';
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
/* ---------------- صفحه اشتراک (پرداختِ فرزندبه‌فرزند) ---------------- */
function viewSubscription(){
  const kids=childrenOfUser(S.user);
  const st=subSettings();
  const acc=effectiveParentAccess(S.user.id);
  let shared='';
  if(acc.active && !acc.own && acc.via){
    const payer=acc.via.payer||{};
    const kid=acc.student||{};
    shared='<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--green-soft),#fff)">'
      +'<div class="card-body row"><div style="font-size:32px">🤝</div>'
      +'<div style="flex:1"><b style="font-size:15px">برای '+esc(kid.full_name||'یکی از فرزندان')+'، '+esc(payer.full_name||'ولی دیگر')+' اشتراک را پرداخت کرده است</b>'
      +'<div class="small muted" style="line-height:2">اشتراک به <b>دانش‌آموز</b> تعلق دارد، پس نیازی به پرداخت دوباره برای همین فرزند ندارید.'
      +(acc.via.sub&&acc.via.sub.daysLeft?'<br>اعتبار تا <b>'+fa(acc.via.sub.daysLeft)+'</b> روز دیگر.':'')
      +'</div></div></div></div>';
  }
  let kidCards='';
  kids.forEach(function(k){
    const sub=studentSubOf(k.id,S.user.id,false);
    const act=sub.active;
    let badge,head;
    if(act&&sub.status==='trial'){badge='<span class="badge b-amber">🎁 تست رایگان — '+fa(sub.daysLeft)+' روز</span>';head='دورهٔ تست رایگان — تا '+jalali(sub.end_date);}
    else if(act){badge='<span class="badge b-green">✅ فعال — تا '+jalali(sub.end_date)+'</span>';head='طرح '+(SUB_PLANS.find(p=>p.code===sub.plan)||{title:sub.plan}).title+' — تا '+jalali(sub.end_date)+' ('+fa(sub.daysLeft)+' روز)';}
    else if(sub.status==='expired'){badge='<span class="badge b-red">منقضی — '+jalali(sub.end_date)+'</span>';head='اشتراک این فرزند منقضی شده است.';}
    else {badge='<span class="badge b-gray">بدون اشتراک</span>';head=st.trial_enabled?'با نخستین استفاده، '+fa(st.trial_days)+' روز تست رایگان فعال می‌شود.':'برای باز شدن این فرزند، اشتراک بگیرید.';}
    let btns='';
    planList().forEach(function(p){
      btns+='<div class="row" style="gap:6px;align-items:center"><b>'+esc(p.title)+'</b><span class="small muted">'+rial(p.amount)+' ریال</span>'
        +'<div class="spacer"></div><button class="btn sm" data-act="sub-pay" data-r="'+p.code+'" data-kid="'+escAttr(k.id)+'">'+(act?'➕ تمدید':'💳 پرداخت')+'</button></div>';
    });
    kidCards+='<div class="card" style="margin-bottom:12px;background:linear-gradient(120deg,'+(act?'var(--green-soft)':'var(--amber-soft)')+',#fff)">'
      +'<div class="card-body"><div class="row"><div style="font-size:30px">'+(act?'✅':'🔒')+'</div><div style="flex:1">'
      +'<b style="font-size:16px">'+esc(k.full_name)+'</b> '+badge
      +'<div class="small muted" style="line-height:1.9">'+head+'</div></div></div>'
      +'<div style="display:grid;gap:8px;margin-top:10px">'+btns+'</div>'
      +(act?'<div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="sub-cancel" data-kid="'+escAttr(k.id)+'">لغو اشتراک این فرزند</button></div>':'')
      +'</div></div>';
  });
  if(!kids.length)kidCards=empty('👨‍👩‍','فرزند ثبت نشده است','برای استفاده از این پنل، باید فرزند داشته باشید.');
  const hist=db.subscription_payments.filter(x=>x.user_id===S.user.id).sort((a,b)=>b.id-a.id);
  const kidName=id=>id?(byId('users',id)||{}).full_name||'—':'همهٔ فرزندان';
  const intro='<div class="card" style="margin-bottom:14px"><div class="card-body"><b style="font-size:15px">💳 اشتراک فرزندبه‌فرزند</b><div class="small muted" style="line-height:2">اشتراک به <b>هر دانش‌آموز</b> جداگانه تعلق دارد. کافی است یکی از والدین برای هر فرزند پرداخت کند؛ والدِ دیگر هم به‌صورت خودکار به همان فرزند دسترسی پیدا می‌کند. نمرات، حضور و غیاب، برنامهٔ کلاس، امتحانات و شهریه همیشه رایگان است.</div></div></div>';
  const histCard='<div class="card"><div class="card-head"><h3>سابقه پرداخت‌ها</h3></div>'
    +(hist.length?'<div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>فرزند</th><th>طرح</th><th>مدت</th><th>مبلغ</th><th>کد رهگیری</th></tr></thead><tbody>'
      +hist.map(function(h){return '<tr><td>'+jalali(h.paid_at)+'</td><td class="small">'+esc(kidName(h.student_id))+'</td><td>'+esc((SUB_PLANS.find(p=>p.code===h.plan)||{title:h.plan}).title)+'</td><td>'+fa(h.months)+' ماه</td><td>'+rial(h.amount)+' ریال</td><td class="small muted">'+esc(h.ref_id)+'</td></tr>';}).join('')
      +'</tbody></table></div>':'<div class="card-body small muted">هنوز پرداختی ثبت نشده است.</div>')+'</div>';
  return shared+intro+kidCards+histCard;
}

/** صفحه قفل — وقتی اشتراکِ لازم فعال نیست (childName برای قفلِ فرزندبه‌فرزند) */
function viewLocked(childName){
  const title=childName?('برای '+esc(childName)+'، اشتراک لازم است'):'برای این بخش، اشتراک پنل اولیا لازم است';
  const lead=childName
    ?('اشتراک این فرزند فعال نیست. نمرات، حضور و غیاب، برنامهٔ کلاس، امتحانات و شهریهٔ '+esc(childName)+' همیشه رایگان باز است؛ برای دریافت نوبت جلسه، درخواست مرخصی و گفتگو، اشتراک این فرزند را فعال کنید.')
    :('نمرات، حضور و غیاب، برنامهٔ کلاس، برنامهٔ امتحانات و شهریهٔ فرزندتان همیشه بدون اشتراک در دسترس است. با فعال‌سازی اشتراک می‌توانید نوبت جلسهٔ اولیا بگیرید، درخواست مرخصی بفرستید و با مدرسه گفتگو کنید.');
  return '<div class="card" style="text-align:center;padding:38px 20px">'
    +'<div style="font-size:44px">🔒</div>'
    +'<h3 style="margin:12px 0 6px;font-size:17px">'+title+'</h3>'
    +'<div class="small muted" style="line-height:2;max-width:480px;margin:0 auto 16px">'+lead+'</div>'
    +'<div><button class="btn" data-act="go" data-r="subscription">مشاهده طرح‌ها و پرداخت</button></div></div>';
}

/* ---------------- صفحه سوپر ادمین: اشتراک اولیا ---------------- */
function viewAdminSubs(){
  const st=subSettings();
  const subs=db.parent_subscriptions.map(function(x){
    const u=byId('users',x.user_id)||{};
    const k=x.student_id?(byId('users',x.student_id)||{}):null;
    return Object.assign({},x,{full_name:u.full_name||'—',username:u.username||'',role:u.role||'',
      kid_name:(k&&k.full_name)?k.full_name:'همهٔ فرزندان'});
  });
  const q=(S.filters.subq||'').trim();
  const rows=subs.filter(function(r){return !q||(r.full_name+r.username+r.kid_name).includes(q);});
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
    +(rows.length?'<div class="table-wrap"><table class="table"><thead><tr><th>کاربر</th><th>نقش</th><th>فرزند</th><th>طرح</th><th>وضعیت</th><th>پایان</th><th>مبلغ</th><th></th></tr></thead><tbody>'
      +rows.slice(0,100).map(function(r){
        const stx=ST_[r.status]||['—','b-gray'];
        return '<tr><td><b>'+esc(r.full_name)+'</b><div class="small muted">'+esc(r.username)+'</div></td>'
          +'<td class="small">'+esc(roleFa(r.role))+'</td>'
          +'<td class="small">'+esc(r.kid_name)+'</td>'
          +'<td class="small">'+esc(r.plan==='trial'?'آزمایشی':(r.plan==='none'?'—':((SUB_PLANS.find(p=>p.code===r.plan)||{title:r.plan}).title)))+'</td>'
          +'<td><span class="badge '+stx[1]+'">'+stx[0]+'</span></td>'
          +'<td class="small">'+(r.end_date?jalali(r.end_date):'—')+'</td>'
          +'<td class="small">'+(r.amount?rial(r.amount):'—')+'</td>'
          +'<td><div class="row" style="gap:5px;flex-wrap:nowrap">'
          +'<button class="btn ghost sm" data-act="sub-grant" data-id="'+r.user_id+'">🎁 فعال‌سازی</button>'
          +'<button class="icon-btn danger" title="بازنشانی" data-act="sub-reset" data-id="'+r.id+'">♻️</button>'
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
    const kids=childrenOfUser(u);
    openModal(modalTpl('فعال‌سازی اشتراک — '+esc(u.full_name),
      f('مدت (روز)',inp('gr_days',30,'number'))
      +f('برای کدام فرزند؟',sel('gr_kid',[['','همهٔ فرزندان']].concat(kids.map(k=>[k.id,k.full_name])),'')),
      'sub-grant-ok'));
    window._grantId=id;
  },
  'sub-grant-ok'(){
    const id=window._grantId, days=Number(V('gr_days'))||30;
    const kidId=V('gr_kid')?Number(V('gr_kid')):null;
    const kid=kidId?byId('users',kidId):null;
    const cur=kidId?studentSubOf(kidId,id,false):subOf(id,false);
    const from=(cur.active&&cur.end_date&&cur.end_date>todayISO())?cur.end_date:todayISO();
    const end=addDaysISO(from,days);
    const row=kidId?db.parent_subscriptions.find(s=>s.user_id===id&&Number(s.student_id)===kidId)
                   :db.parent_subscriptions.find(s=>s.user_id===id&&!s.student_id);
    if(row){
      const patch={status:'active',start_date:todayISO(),end_date:end};
      if(kidId)patch.student_id=kidId;
      update('parent_subscriptions',row.id,patch);
    }
    else insert('parent_subscriptions',{user_id:id,student_id:kidId,plan:'gift',amount:0,status:'active',start_date:todayISO(),end_date:end});
    const notifyIds=kidId?db.parent_links.filter(l=>l.student_id===kidId).map(l=>l.parent_id):[id];
    notifyIds.forEach(uid=>{
      insert('notifications',{user_id:uid,school_id:(byId('users',id)||{}).school_id||null,type:'announcement',
        title:'🎁 اشتراک پنل اولیا فعال شد',
        body:(kid?('اشتراک '+esc(kid.full_name)+' تا '):'اشتراک شما تا ')+jalali(end)+' فعال است.',
        link:'subscription',read:0,created_at:todayISO()});
    });
    closeModal(); toast('اشتراک فعال شد','ok'); render();
  },
  'sub-reset'(el,id){
    const row=byId('parent_subscriptions',id);
    const u=byId('users',(row||{}).user_id)||{};
    const kName=row&&row.student_id?((byId('users',row.student_id)||{}).full_name||''):'';
    askConfirm('اشتراک «'+(u.full_name||'—')+(kName?' برای '+kName:' (همهٔ فرزندان)')+'» بازنشانی شود؟',()=>{
      if(row)remove('parent_subscriptions',row.id);
      toast('بازنشانی شد',''); render();
    },{title:'بازنشانی اشتراک',ok:'بازنشانی کن',danger:true,note:false});
  },
  'pick-panel'(el){
    const role=el.dataset.r;
    S.showPicker=false;
    if(role===S.user.role)S.persona=null; else S.persona=role;
    S.stack=[];S.filters={};S.child=null;
    S.route=(role==='parent')?(effectiveParentAccess(S.user.id).active?'dashboard':'subscription')
      :(role==='edu_office'?'officedash':'dashboard');
    Store.set(PERSONA_KEY,S.persona||'');
    toast('وارد '+(PANEL_TITLE[role]||'پنل')+' شدید','ok');
    render();
  },
  'close-picker'(){ S.showPicker=false; render(); },
  'open-picker'(){ S.showPicker=true; render(); },
  'sub-pay'(el){
    const plan=planList().find(p=>p.code===el.dataset.r);
    const kidId=el.dataset.kid?Number(el.dataset.kid):null;
    const kid=kidId?byId('users',kidId):null;
    askConfirm('پرداخت اشتراک «'+plan.title+'»'+(kid?' برای '+kid.full_name:'')+' به مبلغ '+rial(plan.amount)+' ریال انجام شود؟',()=>{
      const ref='SUB-'+String(Date.now()).slice(-8);
      const cur=kidId?studentSubOf(kidId,S.user.id,false):subOf(S.user.id,false);
      const from=(cur.active&&cur.end_date&&cur.end_date>todayISO())?cur.end_date:todayISO();
      const end=addDaysISO(from,plan.months*30);
      const row=kidId?db.parent_subscriptions.find(s=>s.user_id===S.user.id&&Number(s.student_id)===kidId)
                     :db.parent_subscriptions.find(s=>s.user_id===S.user.id&&!s.student_id);
      if(row)update('parent_subscriptions',row.id,{plan:plan.code,amount:plan.amount,status:'active',start_date:todayISO(),end_date:end,paid_at:todayISO(),ref_id:ref});
      else insert('parent_subscriptions',{user_id:S.user.id,student_id:kidId,plan:plan.code,amount:plan.amount,status:'active',start_date:todayISO(),end_date:end,paid_at:todayISO(),ref_id:ref});
      insert('subscription_payments',{user_id:S.user.id,student_id:kidId,plan:plan.code,amount:plan.amount,months:plan.months,ref_id:ref,method:'online',paid_at:todayISO()});
      /* پرداختِ یکی از والدین، همهٔ والدینِ آن فرزند را باز می‌کند */
      const notifyIds=kidId?db.parent_links.filter(l=>l.student_id===kidId).map(l=>l.parent_id):[S.user.id];
      notifyIds.forEach(uid=>{
        insert('notifications',{user_id:uid,school_id:kid?(byId('users',kid)||{}).school_id:(S.user.school_id||null),type:'announcement',
          title:'✅ اشتراک پنل اولیا فعال شد',
          body:'طرح '+plan.title+(kid?' برای '+kid.full_name:'')+' تا '+jalali(end)+' فعال شد. کد رهگیری: '+ref,
          link:'subscription',read:0,created_at:todayISO()});
      });
      toast('اشتراک فعال شد — کد رهگیری '+ref,'ok');
      render();
    },{title:'پرداخت اشتراک',ok:'پرداخت',danger:false,note:'پرداخت آزمایشی است و مبلغی از حساب شما کسر نمی‌شود.'});
  },
  'sub-cancel'(el){
    const kidId=el.dataset.kid?Number(el.dataset.kid):null;
    const kid=kidId?byId('users',kidId):null;
    askDelete('اشتراک'+(kid?' «'+kid.full_name+'»':' پنل اولیا')+' لغو شود؟ دسترسی به بخش‌های اشتراکی'+(kid?' برای همین فرزند':'')+' بسته می‌شود؛ دادهٔ پایه همچنان رایگان باقی می‌ماند.',()=>{
      const row=db.parent_subscriptions.find(s=>s.user_id===S.user.id
        &&(kidId?(Number(s.student_id)===kidId):(!s.student_id))
        &&['active','trial'].includes(s.status));
      if(row)update('parent_subscriptions',row.id,{status:'expired',end_date:todayISO()});
      toast('اشتراک لغو شد',''); render();
    });
  },
};

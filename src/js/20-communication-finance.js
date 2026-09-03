/* ============================ boot ============================ */
/* ============================ فازهای ۳ تا ۷ — همگام‌سازی نسخه تک‌فایلی ============================ */
/* اعلان‌ها · مرخصی · تقویم آموزشی · گفتگو · شهریه و اقساط · دفتر مالی · آمار منطقه‌ای */

const F7 = { colls: ['notifications','leaves','calendar','messages','tuition_plans','tuitions','installments','transactions'] };
const rial = n => Number(n||0).toLocaleString('fa-IR');
/** نمایش کوتاه مبالغ بزرگ برای کارت‌های آماری: ۴۰٫۵ میلیارد */
function rialShort(n){
  n=Number(n||0);
  const f=(v,d)=>Number(v.toFixed(d)).toLocaleString('fa-IR');
  if(Math.abs(n)>=1e9)return f(n/1e9,1)+' میلیارد';
  if(Math.abs(n)>=1e6)return f(n/1e6,1)+' میلیون';
  if(Math.abs(n)>=1e3)return f(n/1e3,0)+' هزار';
  return f(n,0);
}
const addDaysISO = (iso,n)=>{const d=new Date(iso);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
const NOTIF_ICON={absence:'🚫',late:'⏰',discipline:'⚖️',discipline_positive:'👍',low_grade:'⚠️',announcement:'📢',leave:'📨',tuition:'🧾',tuition_paid:'✅',tuition_due:'⏳',chat:'💬'};
const LEAVE_FA={pending:['در انتظار بررسی','b-amber'],approved:['تأیید شده','b-green'],rejected:['رد شده','b-red']};
const INST_FA={pending:['در انتظار','b-amber'],partial:['جزئی','b-blue'],paid:['پرداخت شده','b-green'],canceled:['بخشوده','b-gray']};
const PAY_FA={cash:'نقدی',card:'کارت‌خوان',online:'آنلاین',cheque:'چک'};
const EXPENSE_CATS=['حقوق و دستمزد','اجاره و شارژ ساختمان','قبوض انرژی','تجهیزات آموزشی','تعمیرات و نگهداری','ایاب و ذهاب','لوازم اداری','فعالیت فرهنگی و اردو'];

/* ---------------- تولید داده نمونه فازهای جدید ---------------- */
function generateExtras(){
  F7.colls.forEach(c=>{ db[c]=db[c]||[]; });

  // تقویم آموزشی
  [['شروع سال تحصیلی',daysAgoISO(150),'event'],['امتحانات میان‌ترم نوبت اول',daysAgoISO(70),'exam'],
   ['تعطیلی رسمی',daysAgoISO(35),'holiday'],['جلسه اولیا و مربیان',daysAgoISO(12),'event'],
   ['اردوی علمی',addDaysISO(todayISO(),9),'event'],['امتحانات نوبت اول',addDaysISO(todayISO(),24),'exam']]
   .forEach(([title,date,kind])=>db.schools.forEach(s=>{ if(s.id<=3) add('calendar',{school_id:s.id,title,date,kind}); }));

  db.schools.forEach(school=>{
    const students=db.users.filter(u=>u.school_id===school.id&&u.role==='student');
    if(!students.length) return;

    // طرح‌های شهریه
    const base = school.level==='ابتدایی'?180000000:school.level==='متوسطه اول'?240000000:320000000;
    const plans=[
      add('tuition_plans',{school_id:school.id,title:`شهریه سالانه ${school.level} — پرداخت نقدی`,amount:Math.round(base*0.92),installments:1,first_due:daysAgoISO(60),interval_days:45,active:1}),
      add('tuition_plans',{school_id:school.id,title:`شهریه سالانه ${school.level} — ۴ قسط`,amount:base,installments:4,first_due:daysAgoISO(60),interval_days:45,active:1}),
      add('tuition_plans',{school_id:school.id,title:'شهریه سرویس رفت و برگشت',amount:60000000,installments:6,first_due:daysAgoISO(60),interval_days:30,active:1}),
    ];

    students.forEach(st=>{
      const plan = chance(0.65)?plans[1]:plans[0];
      const discount = chance(0.12)?Math.round(plan.amount*pick([0.1,0.15,0.25,0.5])):0;
      const payable = plan.amount-discount;
      const t = add('tuitions',{school_id:school.id,student_id:st.id,plan_id:plan.id,class_id:(classOf(st.id)||{}).id||null,total:plan.amount,discount,payable,paid:0,status:'open'});
      const n=plan.installments, per=Math.floor(payable/n); let paidSum=0;
      for(let i=1;i<=n;i++){
        const amount = i===n ? payable-per*(n-1) : per;
        const due = addDaysISO(plan.first_due,(i-1)*plan.interval_days);
        const past = due < todayISO(); const r=rng();
        let paid=0,status='pending',method=null,ref=null;
        if(past&&r<0.8){paid=amount;status='paid';method=pick(['cash','card','online']);ref='RC-'+(10000000+ri(89999999));}
        else if(past&&r<0.88){paid=Math.round(amount/2);status='partial';method='cash';ref='RC-'+(10000000+ri(89999999));}
        paidSum+=paid;
        const ins=add('installments',{tuition_id:t.id,school_id:school.id,student_id:st.id,seq:i,due_date:due,amount,paid_amount:paid,status,method,ref_id:ref,paid_at:paid?due:null});
        if(paid>0) add('transactions',{school_id:school.id,kind:'income',category:'شهریه',amount:paid,date:due,description:`دریافت قسط ${i}`,student_id:st.id,installment_id:ins.id});
      }
      t.paid=paidSum; t.status = paidSum>=payable?'settled':paidSum>0?'partial':'open';
    });

    // هزینه‌های ۶ ماه اخیر
    for(let m=0;m<6;m++) EXPENSE_CATS.forEach(cat=>{
      if(chance(0.25))return;
      add('transactions',{school_id:school.id,kind:'expense',category:cat,amount:Math.round((15000000+ri(300000000))/1000000)*1000000,date:daysAgoISO(m*30+1+ri(25)),description:'هزینه '+cat});
    });

    // مرخصی‌ها
    students.slice(0,14).forEach(st=>{
      if(chance(0.55))return;
      const from=daysAgoISO(2+ri(25));
      add('leaves',{school_id:school.id,student_id:st.id,from_date:from,to_date:from,reason:pick(['بیماری و مراجعه به پزشک','سفر خانوادگی ضروری','مراسم خانوادگی','مشکل جسمی']),status:pick(['pending','approved','approved','rejected']),created_at:from});
    });

    // اعلان‌های خانواده
    db.discipline.filter(d=>d.school_id===school.id).slice(0,10).forEach(d=>{
      const st=byId('users',d.student_id); if(!st)return;
      const targets=[st.id,...db.parent_links.filter(l=>l.student_id===st.id).map(l=>l.parent_id)];
      targets.forEach(uid=>add('notifications',{user_id:uid,school_id:school.id,type:d.kind==='positive'?'discipline_positive':'discipline',
        title:d.kind==='positive'?'👍 امتیاز مثبت':'⚖️ مورد انضباطی جدید',body:`«${d.title}» برای ${st.full_name} ثبت شد.`,link:'record',read:chance(0.5)?1:0,created_at:d.date}));
    });
    db.attendance.filter(a=>a.school_id===school.id&&a.status==='absent').slice(0,12).forEach(a=>{
      const st=byId('users',a.student_id); if(!st)return;
      db.parent_links.filter(l=>l.student_id===st.id).forEach(l=>add('notifications',{user_id:l.parent_id,school_id:school.id,type:'absence',
        title:'🚫 غیبت دانش‌آموز',body:`${st.full_name} در تاریخ ${jalali(a.date)} در مدرسه حاضر نبود.`,link:'children',read:0,created_at:a.date}));
    });
    db.installments.filter(i=>i.school_id===school.id&&i.status!=='paid'&&i.due_date<todayISO()).slice(0,10).forEach(i=>{
      const st=byId('users',i.student_id); if(!st)return;
      [i.student_id,...db.parent_links.filter(l=>l.student_id===i.student_id).map(l=>l.parent_id)].forEach(uid=>
        add('notifications',{user_id:uid,school_id:school.id,type:'tuition_due',title:'⏳ قسط سررسید گذشته',
          body:`قسط ${i.seq} به مبلغ ${rial(i.amount-i.paid_amount)} ریال — سررسید ${jalali(i.due_date)}`,link:'mytuition',read:0,created_at:i.due_date}));
    });

    // گفتگوی نمونه (مدیر ↔ اولیا)
    const mgr=db.users.find(u=>u.school_id===school.id&&u.role==='manager');
    db.users.filter(u=>u.school_id===school.id&&u.role==='parent').slice(0,4).forEach((p,k)=>{
      if(!mgr)return;
      add('messages',{school_id:school.id,from_id:p.id,to_id:mgr.id,body:pick(['سلام، وضعیت درسی فرزندم را چطور می‌بینید؟','با سلام، برای پرداخت شهریه امکان تقسیط بیشتر هست؟','سلام، جلسه اولیا چه ساعتی برگزار می‌شود؟']),created_at:daysAgoISO(6-k)});
      add('messages',{school_id:school.id,from_id:mgr.id,to_id:p.id,body:pick(['سلام، وضعیت ایشان مطلوب است؛ در جلسه حضوری مفصل صحبت می‌کنیم.','بله، با مراجعه به امور مالی قابل بررسی است.','ساعت ۱۶ روز چهارشنبه در سالن اجتماعات.']),created_at:daysAgoISO(6-k)});
    });
  });
}

/* ---------------- کوئری‌های کمکی ---------------- */
const myNotifs = ()=>db.notifications.filter(n=>n.user_id===S.user.id).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')||b.id-a.id);
const unreadCount = ()=>myNotifs().filter(n=>!n.read).length;
const myChildren = ()=>db.parent_links.filter(l=>l.parent_id===S.user.id).map(l=>byId('users',l.student_id)).filter(Boolean);
const schoolScope = c=>{const u=S.user;return u.role==='superadmin'?db[c]:db[c].filter(x=>x.school_id===u.school_id);};
function tuitionSummary(studentId){
  const ins=db.installments.filter(i=>i.student_id===studentId).sort((a,b)=>a.due_date.localeCompare(b.due_date));
  const total=ins.reduce((a,b)=>a+b.amount,0), paid=ins.reduce((a,b)=>a+b.paid_amount,0);
  const overdue=ins.filter(i=>i.status!=='paid'&&i.status!=='canceled'&&i.due_date<todayISO()).reduce((a,b)=>a+(b.amount-b.paid_amount),0);
  return {ins,total,paid,remaining:total-paid,overdue};
}
function financeStats(){
  const tu=schoolScope('tuitions'), ins=schoolScope('installments'), trx=schoolScope('transactions');
  const billed=tu.reduce((a,b)=>a+b.payable,0), collected=tu.reduce((a,b)=>a+b.paid,0);
  const od=ins.filter(i=>['pending','partial'].includes(i.status)&&i.due_date<todayISO());
  const soon=ins.filter(i=>['pending','partial'].includes(i.status)&&i.due_date>=todayISO()&&i.due_date<=addDaysISO(todayISO(),14));
  const income=trx.filter(t=>t.kind==='income').reduce((a,b)=>a+b.amount,0);
  const expense=trx.filter(t=>t.kind==='expense').reduce((a,b)=>a+b.amount,0);
  const debtors=tu.filter(t=>t.payable>t.paid).map(t=>({name:(byId('users',t.student_id)||{}).full_name||'—',cls:(byId('classes',t.class_id)||{}).name||'—',debt:t.payable-t.paid}))
    .sort((a,b)=>b.debt-a.debt).slice(0,10);
  const months={};
  trx.forEach(t=>{const m=t.date.slice(0,7);months[m]=months[m]||{income:0,expense:0};months[m][t.kind]+=t.amount;});
  return {count:tu.length,settled:tu.filter(t=>t.status==='settled').length,billed,collected,remaining:billed-collected,
    rate:billed?Math.round(collected/billed*1000)/10:0,odCount:od.length,odAmount:od.reduce((a,b)=>a+(b.amount-b.paid_amount),0),
    soonCount:soon.length,income,expense,balance:income-expense,debtors,months:Object.entries(months).sort().slice(-8)};
}

/* ---------------- اعلان‌ها ---------------- */
function viewNotifications(){
  const items=myNotifs();
  return `<div class="card"><div class="card-head"><h3>🔔 اعلان‌های من</h3>
    ${items.some(n=>!n.read)?'<button class="btn ghost sm" data-act="notif-readall">خواندن همه</button>':''}</div>
    ${items.length?items.map(n=>`<div class="row" style="padding:12px 16px;border-bottom:1px solid var(--border);background:${n.read?'#fff':'var(--primary-soft)'};cursor:pointer" data-act="notif-open" data-id="${escAttr(n.id)}">
      <span style="font-size:19px">${NOTIF_ICON[n.type]||'🔔'}</span>
      <div style="min-width:0"><b>${esc(n.title)}</b><div class="small muted" style="line-height:1.9">${esc(n.body||'')}</div>
      <div class="small muted" style="opacity:.7">${jalali(n.created_at)}</div></div></div>`).join('')
    :empty('🔕','اعلانی ندارید','رویدادهای مهم مدرسه اینجا نمایش داده می‌شود.')}</div>`;
}

function calModal(c){
  c=c||{title:'',date:todayISO(),kind:'event'};
  openModal(modalTpl(c.id?'ویرایش رویداد':'رویداد جدید تقویم',
    `${f('عنوان *',inp('cl_title',c.title))}
     <div class="grid g2">${f('تاریخ',jdate('cl_date',c.date))}
      ${f('نوع',sel('cl_kind',[['event','رویداد'],['exam','امتحان'],['holiday','تعطیلی']],c.kind))}</div>`,'cal-save'));
  window._calEdit=c;
}

/* ---------------- مرخصی ---------------- */
function viewLeaves(){
  const u=S.user, canCreate=['parent','student'].includes(u.role);
  let rows = u.role==='student'?db.leaves.filter(l=>l.student_id===u.id)
    : u.role==='parent'?db.leaves.filter(l=>myChildren().some(c=>c.id===l.student_id))
    : schoolScope('leaves');
  rows=rows.sort((a,b)=>(b.from_date||'').localeCompare(a.from_date||''));
  const canDecide=['manager','teacher','superadmin'].includes(u.role);
  return `<div class="card"><div class="card-head"><h3>📨 درخواست‌های مرخصی</h3>
    ${canCreate?'<button class="btn" data-act="leave-new">➕ ثبت درخواست</button>':`<span class="badge b-gray">${fa(rows.filter(r=>r.status==='pending').length)} در انتظار بررسی</span>`}</div>
    ${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>از تاریخ</th><th>تا تاریخ</th><th>دلیل</th><th>وضعیت</th>${canDecide?'<th></th>':''}</tr></thead><tbody>
      ${rows.map(l=>{const st=byId('users',l.student_id)||{};return `<tr><td><b>${esc(st.full_name||'—')}</b></td><td>${jalali(l.from_date)}</td><td>${jalali(l.to_date)}</td>
        <td class="small">${esc(l.reason||'')}</td><td><span class="badge ${LEAVE_FA[l.status][1]}">${LEAVE_FA[l.status][0]}</span></td>
        ${canDecide?`<td><div class="row" style="gap:5px;flex-wrap:nowrap">
          ${l.status==='pending'?`<button class="btn sm" data-act="leave-ok" data-id="${escAttr(l.id)}">تأیید</button><button class="btn ghost sm" data-act="leave-no" data-id="${escAttr(l.id)}">رد</button>`:''}
          <button class="icon-btn danger" title="حذف" data-act="leave-del" data-id="${escAttr(l.id)}">🗑️</button></div></td>`:''}</tr>`;}).join('')}
    </tbody></table></div>`:empty('📨','درخواستی ثبت نشده',canCreate?'با دکمه «ثبت درخواست» مرخصی فرزندتان را اعلام کنید.':'')}</div>`;
}

/* ---------------- تقویم آموزشی ---------------- */
function viewCalendar(){
  const rows=schoolScope('calendar').sort((a,b)=>a.date.localeCompare(b.date));
  const KIND={event:['رویداد','b-blue'],exam:['امتحان','b-amber'],holiday:['تعطیلی','b-red']};
  const upcoming=rows.filter(r=>r.date>=todayISO()), past=rows.filter(r=>r.date<todayISO());
  const canEdit=['manager','superadmin'].includes(S.user.role);
  const card=(title,list)=>`<div class="card"><div class="card-head"><h3>${title}</h3>
    <div class="row" style="gap:8px"><span class="badge b-gray">${fa(list.length)} مورد</span>
    ${canEdit&&title.includes('پیش‌رو')?`<button class="btn sm" data-act="cal-new">➕ رویداد جدید</button>`:''}</div></div>
    ${list.length?`<div class="card-body" style="display:grid;gap:8px">${list.map(r=>`<div class="row" style="background:var(--surface-2);padding:10px 14px;border-radius:10px">
      <span class="badge ${KIND[r.kind][1]}">${KIND[r.kind][0]}</span><b>${esc(r.title)}</b><div class="spacer"></div>
      <span class="small muted">${jalali(r.date)}</span>
      ${canEdit?`<button class="icon-btn" title="ویرایش" data-act="cal-edit" data-id="${escAttr(r.id)}">✏️</button>
        <button class="icon-btn danger" title="حذف" data-act="cal-del" data-id="${escAttr(r.id)}">🗑️</button>`:''}</div>`).join('')}</div>`:empty('📅','موردی ثبت نشده','')}</div>`;
  return `<div class="grid g2">${card('🗓️ رویدادهای پیش‌رو',upcoming)}${card('🕘 رویدادهای گذشته',past.reverse())}</div>`;
}

/* ---------------- گفتگو ---------------- */
function viewChat(){
  const u=S.user;
  const partners=[...new Set(db.messages.filter(m=>m.from_id===u.id||m.to_id===u.id).map(m=>m.from_id===u.id?m.to_id:m.from_id))];
  const cands=db.users.filter(x=>x.id!==u.id&&x.school_id===u.school_id&&(u.role==='manager'?true:['manager','teacher'].includes(x.role)));
  const list=[...new Set([...partners,...cands.slice(0,6).map(x=>x.id)])].map(id=>byId('users',id)).filter(Boolean);
  const active=S.filters.chat?byId('users',S.filters.chat):list[0];
  const msgs=active?db.messages.filter(m=>(m.from_id===u.id&&m.to_id===active.id)||(m.from_id===active.id&&m.to_id===u.id)).sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||'')||a.id-b.id):[];
  return `<div class="grid" style="grid-template-columns:260px 1fr;gap:14px;align-items:start">
    <div class="card"><div class="card-head"><h3>مخاطبان</h3></div>
      ${list.length?list.map(p=>`<div class="row" style="padding:11px 14px;border-bottom:1px solid var(--border);cursor:pointer;background:${active&&active.id===p.id?'var(--primary-soft)':'#fff'}" data-act="chat-open" data-id="${escAttr(p.id)}">
        <div class="avatar">${esc(p.full_name[0])}</div><div style="min-width:0"><b style="font-size:13px">${esc(p.full_name)}</b><div class="small muted">${ROLE_FA[p.role]}</div></div></div>`).join(''):empty('💬','مخاطبی نیست','')}
    </div>
    <div class="card"><div class="card-head"><h3>${active?esc(active.full_name):'گفتگو'}</h3></div>
      <div class="card-body" style="display:grid;gap:8px;max-height:420px;overflow:auto">
        ${msgs.length?msgs.map(m=>`<div style="justify-self:${m.from_id===u.id?'start':'end'};max-width:75%;background:${m.from_id===u.id?'var(--primary-soft)':'var(--surface-2)'};padding:9px 13px;border-radius:12px">
          <div style="line-height:1.9">${esc(m.body)}</div><div class="small muted" style="opacity:.7">${jalali(m.created_at)}</div></div>`).join(''):empty('💬','پیامی نیست','اولین پیام را بفرستید.')}
      </div>
      ${active?`<div class="card-head" style="border-top:1px solid var(--border);border-bottom:none;gap:8px">
        <input class="input" id="chat_body" placeholder="پیام خود را بنویسید…" style="flex:1" />
        <button class="btn" data-act="chat-send" data-id="${escAttr(active.id)}">ارسال</button></div>`:''}
    </div></div>`;
}

/* ---------------- شهریه (مدیر) ---------------- */
function viewTuition(){
  const st=financeStats(), tab=S.tab==='ledger'?'ledger':S.tab==='plans'?'plans':S.tab==='students'?'students':'dash';
  const tabs=[['dash','📊 نمای مالی'],['students','👨‍🎓 شهریه دانش‌آموزان'],['plans','📋 طرح‌ها'],['ledger','📒 درآمد و هزینه']]
    .map(([k,l])=>`<button class="btn ${tab===k?'':'ghost'}" data-act="tab" data-t="${escAttr(k)}">${l}</button>`).join('');
  const cards=`<div class="grid g4" style="margin-bottom:14px">
    ${statCard('🧾',rialShort(st.billed),'شهریه صادرشده (ریال)','blue')}
    ${statCard('💰',rialShort(st.collected),`وصول‌شده — ${fa(st.rate)}٪`,'green')}
    ${statCard('⏳',rialShort(st.remaining),'مانده مطالبات (ریال)','amber')}
    ${statCard('⚠️',rialShort(st.odAmount),`معوق — ${fa(st.odCount)} قسط`,'red')}</div>`;
  let body='';
  if(tab==='dash'){
    const max=Math.max(1,...st.months.flatMap(([,v])=>[v.income,v.expense]));
    body=`<div class="grid g2">
      <div class="card"><div class="card-head"><h3>وضعیت وصول</h3><span class="badge b-gray">${fa(st.settled)} تسویه کامل</span></div><div class="card-body">
        ${bar(st.collected,st.billed,'var(--green)')}
        <table class="table" style="margin-top:12px"><tbody>
          <tr><td>مبلغ صادرشده</td><td><b>${rial(st.billed)}</b> ریال</td></tr>
          <tr><td>وصول‌شده</td><td style="color:var(--green)"><b>${rial(st.collected)}</b> ریال</td></tr>
          <tr><td>مانده</td><td><b>${rial(st.remaining)}</b> ریال</td></tr>
          <tr><td>اقساط سررسید گذشته</td><td style="color:var(--red)"><b>${fa(st.odCount)}</b> قسط</td></tr>
          <tr><td>سررسید ۱۴ روز آینده</td><td><b>${fa(st.soonCount)}</b> قسط</td></tr></tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>تراز مالی</h3></div><div class="card-body">
        <div class="grid g3" style="margin-bottom:12px">
          <div><div class="small muted">درآمد</div><b style="color:var(--green)">${rial(st.income)}</b></div>
          <div><div class="small muted">هزینه</div><b style="color:var(--red)">${rial(st.expense)}</b></div>
          <div><div class="small muted">تراز</div><b>${rial(st.balance)}</b></div></div>
        ${st.months.length?`<div style="display:flex;gap:10px;align-items:flex-end;height:150px">${st.months.map(([m,v])=>`<div style="flex:1;text-align:center">
          <div style="display:flex;gap:3px;align-items:flex-end;height:110px;justify-content:center">
            <div style="width:12px;height:${(v.income/max)*100}%;background:var(--green);border-radius:4px 4px 0 0"></div>
            <div style="width:12px;height:${(v.expense/max)*100}%;background:var(--red);border-radius:4px 4px 0 0"></div></div>
          <div class="small muted" style="font-size:10px">${m.slice(2)}</div></div>`).join('')}</div>`:empty('📈','تراکنشی نیست','')}
      </div></div>
      <div class="card" style="grid-column:1/-1"><div class="card-head"><h3>بیشترین بدهکاران</h3></div>
        ${st.debtors.length?`<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>دانش‌آموز</th><th>کلاس</th><th>مانده بدهی</th></tr></thead><tbody>
          ${st.debtors.map((d,i)=>`<tr><td>${fa(i+1)}</td><td><b>${esc(d.name)}</b></td><td>${esc(d.cls)}</td><td style="color:var(--red)"><b>${rial(d.debt)}</b> ریال</td></tr>`).join('')}
        </tbody></table></div>`:empty('🎉','بدهی معوقی نیست','')}</div></div>`;
  } else if(tab==='students'){
    const all=schoolScope('tuitions'); const per=15, pages=Math.max(1,Math.ceil(all.length/per));
    const rows=all.slice((S.page-1)*per,S.page*per);
    body=`<div class="card"><div class="card-head"><h3>صورتحساب دانش‌آموزان</h3><span class="badge b-gray">${fa(all.length)} صورتحساب</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>کلاس</th><th>طرح</th><th>قابل پرداخت</th><th>پرداخت‌شده</th><th>وضعیت</th><th></th></tr></thead><tbody>
      ${rows.map(t=>{const s=byId('users',t.student_id)||{},p=byId('tuition_plans',t.plan_id)||{};
        const S_={open:['پرداخت‌نشده','b-amber'],partial:['جزئی','b-blue'],settled:['تسویه','b-green']}[t.status]||['—','b-gray'];
        return `<tr><td><b>${esc(s.full_name||'—')}</b></td><td>${esc((byId('classes',t.class_id)||{}).name||'—')}</td>
        <td class="small">${esc(p.title||'—')}</td><td>${rial(t.payable)}</td><td>${rial(t.paid)}</td>
        <td><span class="badge ${S_[1]}">${S_[0]}</span></td>
        <td><button class="btn sm" data-act="tuition-detail" data-id="${escAttr(t.student_id)}">اقساط</button></td></tr>`;}).join('')}
      </tbody></table></div>
      ${pages>1?`<div class="pager">${Array.from({length:pages},(_,i)=>`<button class="page ${S.page===i+1?'active':''}" data-act="page" data-p="${escAttr(i+1)}">${fa(i+1)}</button>`).slice(Math.max(0,S.page-4),S.page+3).join('')}</div>`:''}</div>`;
  } else if(tab==='plans'){
    const rows=schoolScope('tuition_plans');
    body=`<div class="card"><div class="card-head"><h3>طرح‌های شهریه</h3><button class="btn" data-act="plan-new">➕ طرح جدید</button></div>
      ${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>عنوان</th><th>مبلغ</th><th>اقساط</th><th>اولین سررسید</th><th>صادرشده</th><th></th></tr></thead><tbody>
      ${rows.map(p=>`<tr><td><b>${esc(p.title)}</b></td><td>${rial(p.amount)}</td><td>${fa(p.installments)} قسط / هر ${fa(p.interval_days)} روز</td>
        <td class="small">${jalali(p.first_due)}</td><td>${fa(db.tuitions.filter(t=>t.plan_id===p.id).length)}</td>
        <td><button class="icon-btn" title="ویرایش" data-act="plan-edit" data-id="${escAttr(p.id)}">✏️</button>
          <button class="icon-btn danger" title="حذف" data-act="plan-del" data-id="${escAttr(p.id)}">🗑️</button></td></tr>`).join('')}
      </tbody></table></div>`:empty('📋','طرحی تعریف نشده','')}</div>`;
  } else {
    const all=schoolScope('transactions').sort((a,b)=>b.date.localeCompare(a.date));
    const per=15,pages=Math.max(1,Math.ceil(all.length/per)),rows=all.slice((S.page-1)*per,S.page*per);
    body=`<div class="card"><div class="card-head"><h3>دفتر درآمد و هزینه</h3><button class="btn" data-act="trx-new">➕ ثبت تراکنش</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>نوع</th><th>دسته</th><th>شرح</th><th>مبلغ</th><th></th></tr></thead><tbody>
      ${rows.map(t=>`<tr><td class="small">${jalali(t.date)}</td><td><span class="badge ${t.kind==='income'?'b-green':'b-red'}">${t.kind==='income'?'درآمد':'هزینه'}</span></td>
        <td>${esc(t.category)}</td><td class="small">${esc(t.description||'—')}</td>
        <td style="color:${t.kind==='income'?'var(--green)':'var(--red)'}"><b>${rial(t.amount)}</b></td>
        <td>${t.installment_id?'<span class="small muted">مربوط به قسط</span>':`<button class="icon-btn" title="ویرایش" data-act="trx-edit" data-id="${escAttr(t.id)}">✏️</button>
          <button class="icon-btn danger" title="حذف" data-act="trx-del" data-id="${escAttr(t.id)}">🗑️</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      ${pages>1?`<div class="pager">${Array.from({length:pages},(_,i)=>`<button class="page ${S.page===i+1?'active':''}" data-act="page" data-p="${escAttr(i+1)}">${fa(i+1)}</button>`).slice(Math.max(0,S.page-4),S.page+3).join('')}</div>`:''}</div>`;
  }
  return cards+`<div class="row" style="margin-bottom:14px;flex-wrap:wrap">${tabs}</div>`+body;
}

/* ---------------- شهریه من (ولی/دانش‌آموز) ---------------- */
function viewMyTuition(){
  const u=S.user;
  const kids = u.role==='student'?[u]:myChildren();
  if(!kids.length) return empty('👨‍👩‍👦','دانش‌آموزی متصل نیست','');
  const sel_=S.child&&kids.some(k=>k.id===S.child)?S.child:kids[0].id;
  const s=tuitionSummary(sel_);
  return `<div class="card"><div class="card-head"><h3>💰 شهریه و اقساط</h3>
    ${kids.length>1?`<div class="row" style="gap:6px">${kids.map(k=>`<button class="btn ${k.id===sel_?'':'ghost'} sm" data-act="child" data-id="${escAttr(k.id)}">${esc(k.full_name)}</button>`).join('')}</div>`:''}</div>
    <div class="card-body">
      <div class="grid g3" style="margin-bottom:14px">
        <div><div class="small muted">مبلغ کل</div><b>${rial(s.total)} ریال</b></div>
        <div><div class="small muted">پرداخت‌شده</div><b style="color:var(--green)">${rial(s.paid)} ریال</b></div>
        <div><div class="small muted">مانده</div><b style="color:${s.remaining?'var(--red)':'var(--green)'}">${rial(s.remaining)} ریال</b></div></div>
      ${s.ins.length?`<div class="table-wrap"><table class="table"><thead><tr><th>قسط</th><th>سررسید</th><th>مبلغ</th><th>پرداختی</th><th>وضعیت</th><th>روش</th><th></th></tr></thead><tbody>
        ${s.ins.map(i=>{const od=i.status!=='paid'&&i.status!=='canceled'&&i.due_date<todayISO();
          return `<tr style="${od?'background:var(--red-soft)':''}"><td>${fa(i.seq)}</td>
          <td>${jalali(i.due_date)}${od?'<div class="small" style="color:var(--red)">سررسید گذشته</div>':''}</td>
          <td>${rial(i.amount)}</td><td>${rial(i.paid_amount)}</td>
          <td><span class="badge ${INST_FA[i.status][1]}">${INST_FA[i.status][0]}</span></td>
          <td class="small">${PAY_FA[i.method]||'—'}${i.ref_id?`<div class="small muted">${esc(i.ref_id)}</div>`:''}</td>
          <td><div class="row" style="gap:5px">
            ${i.status!=='paid'&&i.status!=='canceled'?`<button class="btn sm" data-act="pay-online" data-id="${escAttr(i.id)}">💳 پرداخت</button>`:''}
            ${i.paid_amount>0?`<button class="icon-btn" title="رسید" data-act="receipt" data-id="${escAttr(i.id)}">🧾</button>`:''}
          </div></td></tr>`;}).join('')}
      </tbody></table></div>`:empty('🧾','قسطی ثبت نشده','')}
    </div></div>`;
}

/* ---------------- آمار مناطق (سوپرادمین) ---------------- */
function viewRegions(){
  const groups={};
  db.schools.forEach(s=>{
    const k=s.city||'نامشخص'; groups[k]=groups[k]||{schools:0,students:0,teachers:0,classes:0,att:[0,0],grades:[]};
    const g=groups[k]; g.schools++;
    g.students+=db.users.filter(u=>u.school_id===s.id&&u.role==='student').length;
    g.teachers+=db.users.filter(u=>u.school_id===s.id&&u.role==='teacher').length;
    g.classes+=db.classes.filter(c=>c.school_id===s.id).length;
    db.attendance.filter(a=>a.school_id===s.id).forEach(a=>{g.att[1]++;if(a.status==='present')g.att[0]++;});
    db.grades.filter(x=>x.school_id===s.id).forEach(x=>g.grades.push(x.score));
  });
  const rows=Object.entries(groups).sort((a,b)=>b[1].students-a[1].students);
  const tot=rows.reduce((a,[,g])=>({s:a.s+g.schools,st:a.st+g.students,t:a.t+g.teachers,c:a.c+g.classes}),{s:0,st:0,t:0,c:0});
  return `<div class="grid g4" style="margin-bottom:14px">
    ${statCard('🏫',fa(tot.s),'مدرسه تحت پوشش','blue')}${statCard('🎓',fa(tot.st),'دانش‌آموز','green')}
    ${statCard('👨‍🏫',fa(tot.t),'دبیر','purple')}${statCard('🏛️',fa(tot.c),'کلاس','amber')}</div>
  <div class="card"><div class="card-head"><h3>📈 آمار به تفکیک منطقه</h3><span class="badge b-gray">${fa(rows.length)} منطقه</span></div>
   <div class="table-wrap"><table class="table"><thead><tr><th>منطقه</th><th>مدرسه</th><th>دانش‌آموز</th><th>دبیر</th><th>کلاس</th><th>نسبت دانش‌آموز/دبیر</th><th>درصد حضور</th><th>میانگین نمره</th></tr></thead><tbody>
    ${rows.map(([k,g])=>`<tr><td><b>${esc(k)}</b></td><td>${fa(g.schools)}</td><td>${fa(g.students)}</td><td>${fa(g.teachers)}</td><td>${fa(g.classes)}</td>
      <td>${fa(g.teachers?Math.round(g.students/g.teachers*10)/10:0)}</td>
      <td>${fa(g.att[1]?Math.round(g.att[0]/g.att[1]*1000)/10:0)}٪</td>
      <td>${fa(g.grades.length?Math.round(g.grades.reduce((a,b)=>a+b,0)/g.grades.length*100)/100:0)}</td></tr>`).join('')}
   </tbody></table></div></div>`;
}

/* ---------------- رسید چاپی ---------------- */
function printReceipt(instId){
  const i=byId('installments',instId); if(!i)return;
  const st=byId('users',i.student_id)||{}, sc=byId('schools',i.school_id)||{};
  const w=window.open('','_blank'); if(!w){toast('اجازه باز کردن پنجره داده نشد','err');return;}
  w.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta http-equiv="Cache-Control" content="no-transform" />
<meta name="referrer" content="no-referrer" /><title>رسید پرداخت شهریه</title>
  <style>@page{size:A5 landscape;margin:10mm}body{font-family:Vazirmatn,Tahoma,sans-serif;color:#0f172a}
  .box{border:2px solid #1e40af;border-radius:14px;padding:18px 22px;max-width:720px;margin:auto}
  h1{font-size:18px;margin:0 0 4px;color:#1e40af}.head{display:flex;justify-content:space-between;border-bottom:2px dashed #cbd5e1;padding-bottom:10px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:13.5px}td{padding:7px 4px;border-bottom:1px solid #e2e8f0}td:first-child{color:#64748b;width:38%}
  .amount{font-size:20px;font-weight:800;color:#16a34a}.stamp{border:2px solid #16a34a;color:#16a34a;border-radius:10px;padding:4px 14px;font-weight:800;transform:rotate(-6deg);display:inline-block}
  .sign{display:flex;justify-content:space-between;margin-top:26px;font-size:12px;color:#64748b}@media print{.noprint{display:none}}</style></head><body>
  <div class="box"><div class="head"><div><h1>${esc(sc.name||'مدرسه')}</h1><div style="font-size:12px;color:#64748b">${esc(sc.address||'')}</div></div>
    <div style="text-align:left"><b>رسید پرداخت شهریه</b><div style="font-size:12px;color:#64748b">شماره: ${esc(i.ref_id||i.id)}</div></div></div>
   <table><tr><td>نام دانش‌آموز</td><td><b>${esc(st.full_name||'')}</b></td></tr>
    <tr><td>بابت</td><td>شهریه — قسط ${i.seq}</td></tr>
    <tr><td>سررسید</td><td>${jalali(i.due_date)}</td></tr>
    <tr><td>تاریخ پرداخت</td><td>${jalali(i.paid_at||todayISO())}</td></tr>
    <tr><td>روش پرداخت</td><td>${PAY_FA[i.method]||'—'}</td></tr>
    <tr><td>مبلغ دریافتی</td><td class="amount">${rial(i.paid_amount)} ریال</td></tr></table>
   <div class="sign"><span>مهر و امضای امور مالی مدرسه</span><span class="stamp">پرداخت شد</span></div></div>
  <div class="noprint" style="text-align:center;margin-top:14px"><button onclick="window.print()" style="padding:8px 22px;border-radius:9px;border:none;background:#1e40af;color:#fff;font-family:inherit;cursor:pointer">🖨️ چاپ رسید</button></div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400)});<\/script></body></html>`);
  w.document.close();
}

/* ---------------- عملیات فازهای جدید ---------------- */
const F7_ACTIONS = {
  'cal-new'(){ calModal(null); },
  'cal-edit'(el,id){ calModal(byId('calendar',id)); },
  'cal-save'(){
    const c=window._calEdit||{};
    const data={school_id:S.user.school_id||null,title:V('cl_title'),date:V('cl_date'),kind:V('cl_kind')};
    if(!data.title){toast('عنوان الزامی است','err');return;}
    if(c.id)update('calendar',c.id,data); else insert('calendar',data);
    closeModal(); toast('رویداد ذخیره شد','ok'); render();
  },
  'cal-del'(el,id){ const c=byId('calendar',id);
    askDelete(`رویداد «${c.title}» حذف شود؟`,()=>{remove('calendar',id);toast('حذف شد','');render();}); },
  'notif-readall'(){ myNotifs().forEach(n=>{ if(!n.read) update('notifications',n.id,{read:1}); }); toast('همه اعلان‌ها خوانده شد','ok'); render(); },
  'notif-open'(el,id){ const n=byId('notifications',id); if(!n)return; if(!n.read)update('notifications',id,{read:1});
    const map={record:'record',children:'children',mytuition:'mytuition',announcements:'announcements'};
    go(map[n.link]||'notifications'); },
  'leave-new'(){
    const kids=S.user.role==='student'?[S.user]:myChildren();
    openModal(modalTpl('ثبت درخواست مرخصی',
      `${f('دانش‌آموز',sel('lv_st',kids.map(k=>[k.id,k.full_name])))}
       <div class="grid g2">${f('از تاریخ',jdate('lv_from',todayISO()))}${f('تا تاریخ',jdate('lv_to',todayISO()))}</div>
       ${f('دلیل مرخصی',`<textarea class="input" id="lv_reason" rows="3" placeholder="مثلاً مراجعه به پزشک"></textarea>`)}`,'leave-save'));
  },
  'leave-save'(){
    const sid=Number(V('lv_st')); const st=byId('users',sid);
    if(!V('lv_reason')){toast('دلیل مرخصی را بنویسید','err');return;}
    insert('leaves',{school_id:st.school_id,student_id:sid,from_date:V('lv_from'),to_date:V('lv_to'),reason:V('lv_reason'),status:'pending',created_at:todayISO()});
    const mgr=db.users.find(u=>u.school_id===st.school_id&&u.role==='manager');
    if(mgr)insert('notifications',{user_id:mgr.id,school_id:st.school_id,type:'leave',title:'📨 درخواست مرخصی جدید',body:`برای ${st.full_name} درخواست مرخصی ثبت شد.`,link:'leaves',read:0,created_at:todayISO()});
    closeModal(); toast('درخواست مرخصی ثبت شد','ok'); render();
  },
  'leave-del'(el,id){ const l=byId('leaves',id), st=byId('users',l.student_id)||{};
    askDelete(`درخواست مرخصی «${st.full_name||''}» حذف شود؟`,()=>{remove('leaves',id);toast('حذف شد','');render();}); },
  'leave-ok'(el,id){ decideLeave(id,'approved'); },
  'leave-no'(el,id){ decideLeave(id,'rejected'); },
  'chat-open'(el,id){ S.filters.chat=id; render(); },
  'chat-send'(el,id){
    const body=V('chat_body'); if(!body){toast('پیام خالی است','err');return;}
    insert('messages',{school_id:S.user.school_id,from_id:S.user.id,to_id:id,body,created_at:todayISO()});
    insert('notifications',{user_id:id,school_id:S.user.school_id,type:'chat',title:'💬 پیام جدید',body:`${S.user.full_name}: ${body.slice(0,60)}`,link:'chat',read:0,created_at:todayISO()});
    S.filters.chat=id; render();
  },
  'tuition-detail'(el,id){ S.child=id; go('mytuition'); },
  'pay-online'(el,id){
    const i=byId('installments',id); if(!i)return;
    const remaining=i.amount-i.paid_amount;
    openModal(modalTpl(`پرداخت قسط ${i.seq}`,
      `${f('مبلغ (ریال)',inp('pay_amount',remaining,'number'))}
       <div class="small muted" style="line-height:2">پرداخت به‌صورت آنلاین ثبت و رسید آن بلافاصله صادر می‌شود.</div>`,'pay-save'));
    window._payId=id;
  },
  'pay-save'(){
    const i=byId('installments',window._payId); if(!i)return;
    const amount=Math.min(i.amount-i.paid_amount,Number(V('pay_amount'))||0);
    if(amount<=0){toast('مبلغ نامعتبر است','err');return;}
    const paid=i.paid_amount+amount, ref='RC-'+String(Date.now()).slice(-8);
    const method=['parent','student'].includes(S.user.role)?'online':'cash';
    update('installments',i.id,{paid_amount:paid,status:paid>=i.amount?'paid':'partial',method,ref_id:ref,paid_at:todayISO()});
    const t=byId('tuitions',i.tuition_id);
    if(t){const sum=db.installments.filter(x=>x.tuition_id===t.id).reduce((a,b)=>a+b.paid_amount,0);
      update('tuitions',t.id,{paid:sum,status:sum>=t.payable?'settled':sum>0?'partial':'open'});}
    insert('transactions',{school_id:i.school_id,kind:'income',category:'شهریه',amount,date:todayISO(),description:`دریافت قسط ${i.seq}`,student_id:i.student_id,installment_id:i.id});
    [i.student_id,...db.parent_links.filter(l=>l.student_id===i.student_id).map(l=>l.parent_id)].forEach(uid=>
      insert('notifications',{user_id:uid,school_id:i.school_id,type:'tuition_paid',title:'✅ رسید پرداخت شهریه',body:`مبلغ ${rial(amount)} ریال بابت قسط ${i.seq} دریافت شد. کد رهگیری ${ref}`,link:'mytuition',read:0,created_at:todayISO()}));
    closeModal(); toast(`پرداخت ثبت شد — کد رهگیری ${ref}`,'ok'); render();
  },
  'receipt'(el,id){ printReceipt(id); },
  'plan-new'(){ planModal(null); },
  'plan-edit'(el,id){ planModal(byId('tuition_plans',id)); },
  'plan-del'(el,id){
    const p=byId('tuition_plans',id);
    const used=db.tuitions.filter(t=>t.plan_id===id).length;
    if(used){toast(`این طرح برای ${fa(used)} دانش‌آموز صادر شده و حذف نمی‌شود`,'err');return;}
    askDelete(`طرح «${p.title}» حذف شود؟`,()=>{remove('tuition_plans',id);toast('طرح حذف شد','');render();});
  },
  'plan-save'(){
    const p=window._edit||{};
    const data={title:V('pl_title'),amount:Number(V('pl_amount'))||0,installments:Math.max(1,Number(V('pl_inst'))||1),
      interval_days:Math.max(7,Number(V('pl_int'))||30),first_due:V('pl_due')||todayISO(),active:1,school_id:S.user.school_id};
    if(!data.title){toast('عنوان طرح الزامی است','err');return;}
    if(p.id)update('tuition_plans',p.id,data); else insert('tuition_plans',data);
    closeModal(); toast('طرح شهریه ذخیره شد','ok'); render();
  },
  'trx-edit'(el,id){
    const t=byId('transactions',id);
    openModal(modalTpl('ویرایش تراکنش',
      `<div class="grid g2">${f('نوع',sel('tx_kind',[['expense','هزینه'],['income','درآمد']],t.kind))}
        ${f('دسته',sel('tx_cat',[...EXPENSE_CATS,'کمک مردمی','فروش کتاب و لوازم','سایر'].map(c=>[c,c]),t.category))}
        ${f('مبلغ (ریال)',inp('tx_amount',t.amount,'number'))}${f('تاریخ',jdate('tx_date',t.date))}</div>
       ${f('شرح',inp('tx_desc',t.description||''))}`,'trx-edit-save'));
    window._trxEdit=id;
  },
  'trx-edit-save'(){
    const amount=Number(V('tx_amount'))||0;
    if(amount<=0){toast('مبلغ نامعتبر است','err');return;}
    update('transactions',window._trxEdit,{kind:V('tx_kind'),category:V('tx_cat'),amount,date:V('tx_date'),description:V('tx_desc')});
    closeModal(); toast('تراکنش ویرایش شد','ok'); render();
  },
  'trx-del'(el,id){
    const t=byId('transactions',id);
    if(t.installment_id){toast('تراکنش مربوط به قسط حذف نمی‌شود','err');return;}
    askDelete(`تراکنش ${rial(t.amount)} ریال (${esc(t.category)}) حذف شود؟`,()=>{remove('transactions',id);toast('تراکنش حذف شد','');render();});
  },
  'trx-new'(){
    openModal(modalTpl('ثبت تراکنش مالی',
      `<div class="grid g2">${f('نوع',sel('tx_kind',[['expense','هزینه'],['income','درآمد']],'expense'))}
        ${f('دسته',sel('tx_cat',[...EXPENSE_CATS,'کمک مردمی','فروش کتاب و لوازم','سایر'].map(c=>[c,c])))}
        ${f('مبلغ (ریال)',inp('tx_amount',10000000,'number'))}${f('تاریخ',inp('tx_date',todayISO(),'date'))}</div>
       ${f('شرح',inp('tx_desc',''))}`,'trx-save'));
  },
  'trx-save'(){
    const amount=Number(V('tx_amount'))||0;
    if(amount<=0){toast('مبلغ نامعتبر است','err');return;}
    insert('transactions',{school_id:S.user.school_id,kind:V('tx_kind'),category:V('tx_cat'),amount,date:V('tx_date'),description:V('tx_desc')});
    closeModal(); toast('تراکنش ثبت شد','ok'); render();
  },
};

function decideLeave(id,status){
  const l=byId('leaves',id); if(!l)return;
  update('leaves',id,{status});
  const st=byId('users',l.student_id)||{};
  if(status==='approved'){
    // ثبت غیبت موجه در روزهای کاری
    for(let d=new Date(l.from_date);d<=new Date(l.to_date);d.setDate(d.getDate()+1)){
      const iso=d.toISOString().slice(0,10), wd=new Date(iso).getDay();
      if(wd===4||wd===5)continue;
      const ex=db.attendance.find(a=>a.student_id===l.student_id&&a.date===iso);
      if(ex)update('attendance',ex.id,{status:'excused'});
      else insert('attendance',{school_id:l.school_id,class_id:(classOf(l.student_id)||{}).id||null,student_id:l.student_id,date:iso,status:'excused',note:'مرخصی تأییدشده'});
    }
  }
  [l.student_id,...db.parent_links.filter(x=>x.student_id===l.student_id).map(x=>x.parent_id)].forEach(uid=>
    insert('notifications',{user_id:uid,school_id:l.school_id,type:'leave',title:status==='approved'?'✅ مرخصی تأیید شد':'❌ مرخصی رد شد',
      body:`درخواست مرخصی ${st.full_name} ${status==='approved'?'تأیید':'رد'} شد.`,link:'leaves',read:0,created_at:todayISO()}));
  toast(status==='approved'?'مرخصی تأیید شد':'درخواست رد شد',status==='approved'?'ok':'');
  render();
}

function planModal(p){
  p=p||{title:'',amount:200000000,installments:4,interval_days:30,first_due:todayISO()};
  openModal(modalTpl(p.id?'ویرایش طرح شهریه':'طرح شهریه جدید',
    `<div class="grid g2">${f('عنوان *',inp('pl_title',p.title))}${f('مبلغ کل (ریال)',inp('pl_amount',p.amount,'number'))}
      ${f('تعداد اقساط',inp('pl_inst',p.installments,'number'))}${f('فاصله اقساط (روز)',inp('pl_int',p.interval_days,'number'))}
      ${f('اولین سررسید',jdate('pl_due',p.first_due))}</div>`,'plan-save'));
  window._edit=p;
}

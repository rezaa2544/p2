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

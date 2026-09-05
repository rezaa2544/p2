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

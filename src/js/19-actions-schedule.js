/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات برنامهٔ هفتگی و زنگ: bell- و sched- (اکشن‌های slot و exam و duty
   در ماژول‌های خودشان هستند و در A نبوده‌اند).
   آبجکتِ A همچنان در همان لحظهٔ کلیک و با همان ترکیب ساخته می‌شود؛
   هر پارسیال فقط بخشِ خود را برمی‌گرداند. پارامترهای (el, id, a, rawId)
   همان محلی‌هایِ شنوندهٔ کلیک هستند — بدنهٔ اکشن‌ها عیناً جابه‌جا شده.
   ═══════════════════════════════════════════════════════════════════ */
function scheduleActions(e, el, id, a, rawId){
  return {
   'bell-edit'(){
     if(['manager','superadmin'].indexOf(S.user.role)<0){toast('دسترسی ندارید','err');return;}
     var sid=S.user.role==='superadmin'?(Number(S.filters.bschool)||db.schools[0].id):S.user.school_id;
     bellModal(sid);
   },
   'bell-add'(){
     var ed=window._edit; if(!ed||!ed.days)return;
     var day=Number(e.target.dataset.day);
     var kind=e.target.dataset.kind==='break'?'break':'lesson';
     ed.days[day].slots.push({kind:kind,min:kind==='break'?10:45});
     bellRenderDay(day);
   },
   'bell-del'(){
     var ed=window._edit; if(!ed||!ed.days)return;
     var day=Number(e.target.dataset.day);
     var i=Number(e.target.dataset.i);
     if(!Number.isFinite(i))return;
     if(ed.days[day].slots.length<=1){toast('دست‌کم یک زنگ لازم است','err');return;}
     ed.days[day].slots.splice(i,1);
     bellRenderDay(day);
   },
   /* کپی ساعت روز قبل — روز شنبه «روز قبل» ندارد */
   'bell-copy-prev'(){
     var ed=window._edit; if(!ed||!ed.days)return;
     var day=Number(e.target.dataset.day);
     if(day<1)return;
     ed.days[day]={start:ed.days[day-1].start,
       slots:ed.days[day-1].slots.map(function(x){return {kind:x.kind,min:Number(x.min)||0};})};
     bellRenderDay(day);
     toast('ساعت '+DAYS[day-1]+' روی '+DAYS[day]+' کپی شد','ok');
   },
   'bell-save'(){
     var ed=window._edit;
     if(!ed||!ed.days){toast('فرم زمان‌بندی آماده نیست','err');return;}
     var r=bellSaveDays(ed.school_id,ed.days);
     toast(r.msg,r.ok?'ok':'err');
     if(r.ok){closeModal();render();}
   },
   /* ── دیاگ سامانه ─────────────────────────────────────────────
      عیب‌یابی و تعمیر خودکار. همهٔ کنش‌ها ویژهٔ سوپرادمین‌اند و
      canAction آن را می‌سنجد. */
   /* ─────────────── بند ۶.۵ (سبک): تداخل برنامه — پیشنهاد و جابه‌جایی ─────────────── */
   'sched-conf-sug'(){
     const key=el&&el.dataset.key?String(el.dataset.key):'';
     const sid=el&&el.dataset.sid?String(el.dataset.sid):'';
     const div=document.getElementById('conf-sug-'+key.replace(/[^a-z0-9]/gi,'')+'-'+sid);
     if(!div)return;
     div.style.display=(div.style.display==='none')?'flex':'none';
   },
   'sched-conf-move'(){
     const id=Number(el.dataset.sid), day=Number(el.dataset.day), period=Number(el.dataset.period);
     const r=byId('schedule',id);
     if(!r){render();return;}
     /* گاردِ لحظهٔ اجرا: کلاس و دبیر در مقصد واقعاً آزاد باشند */
     if(db.schedule.some(x=>x.class_id===r.class_id&&x.day===day&&x.period===period&&x.id!==id)){toast('این جایِ کلاس دیگر پر شده است','err');render();return;}
     if(r.teacher_id&&teacherBusyAt(r.teacher_id,day,period,id)){toast('این دبیر در آن ساعت مشغول است','err');render();return;}
     update('schedule',id,{day,period});
     toast('زنگ جابه‌جا شد: '+DAYS[day]+' زنگ '+fa(period),'ok');render();},
   /* ── E.6: تولید خودکار برنامه ── */
   'schedgen-open'(){
     const cid=Number(S.filters.class||(S.user.role==='student'?(classOf(S.user.id)||{}).id:(visibleClasses()[0]||{}).id));
     const c=byId('classes',cid);
     if(!c){toast('کلاسی انتخاب نشده است','err');return;}
     schedgenPreviewModal(c.school_id);
   },
   'schedgen-apply'(){
     const r=schedgenApply();
     toast(r.msg,r.ok?'ok':'err');
     if(r.ok){closeModal();render();}
   },
  };
}

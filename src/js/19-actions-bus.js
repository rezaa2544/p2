/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات سرویس مدرسه: bus-.
   آبجکتِ A همچنان در همان لحظهٔ کلیک و با همان ترکیب ساخته می‌شود؛
   هر پارسیال فقط بخشِ خود را برمی‌گرداند. پارامترهای (el, id, a, rawId)
   همان محلی‌هایِ شنوندهٔ کلیک هستند — بدنهٔ اکشن‌ها عیناً جابه‌جا شده.
   ═══════════════════════════════════════════════════════════════════ */
function busActions(e, el, id, a, rawId){
  return {
   /* ─────── سرویس مدرسه — نسخهٔ بدون جی‌پی‌اس ─────── */
   'bus-route-new'(){ busRouteModal(null); },
   'bus-route-save'(){
     const r0 = window._busRoute || {};
     const name = V('br_name');
     if(!name) return toast('نام مسیر را بنویسید','err');
     const drv = V('br_driver') ? Number(V('br_driver')) : null;
     if(r0.id){ update('bus_routes', r0.id, {name:name, driver_id:drv}); }
     else { insert('bus_routes',{school_id:S.user.school_id, name:name, driver_id:drv, created_at:todayISO()}); }
     closeModal(); toast('مسیر ذخیره شد','ok'); render();
   },
   'bus-route-del'(){
     askConfirm('این مسیر حذف شود؟ رویدادهای ثبت‌شده حفظ می‌مانند ولی دانش‌آموزان از مسیر جدا می‌شوند.',
       function(){
         batchWrites(function(){
           db.bus_students.slice().forEach(function(b){
             if(b.route_id===id) remove('bus_students', b.id);
           });
           remove('bus_routes', id);
         });
         toast('مسیر حذف شد','ok'); render();
       },
       {title:'حذف مسیر', ok:'حذف کن', danger:true});
   },
   'bus-students'(){ busStudentsModal(Number(id)); },
   'bus-students-save'(){
     const rid = window._busRouteId;
     if(!rid) return;
     const checked = $$('.bs-chk:checked').map(function(c){ return Number(c.value); });
     batchWrites(function(){
       db.bus_students.slice().forEach(function(b){
         if(b.route_id===rid && checked.indexOf(b.student_id)<0) remove('bus_students', b.id);
       });
       checked.forEach(function(sid2){
         /* دانش‌آموز در مسیر دیگری باشد ⇒ رد می‌شود (قانون تک‌مسیر) */
         if(busRouteOfStudent(sid2) && busRouteOfStudent(sid2).id!==rid) return;
         if(!db.bus_students.some(function(b){ return b.route_id===rid && b.student_id===sid2; }))
           insert('bus_students',{route_id:rid, student_id:sid2});
       });
     });
     closeModal(); toast('دانش‌آموزان مسیر به‌روز شد','ok'); render();
   },
   /* ثبت رویداد سوار/پیاده — بررسی مالکیت مسیر در busEvent() روی داده */
   'bus-event'(){
     const t = el.dataset.t;
     const r = busEvent(Number(id), t);
     if(!r.ok) return toast(r.msg,'err');
     toast(t==='on' ? '🚌 سوار شد — پیامک در صف است' : '🏫 پیاده شد — پیامک در صف است','ok');
     render();
   },
   'bus-need-set'(){ busNeedModal(Number(id)); },
   'bus-need-save'(){
     const r = busNeedSet(window._busNeedStudent, (document.querySelector('input[name="bus_need_m"]:checked')||{}).value, V('bus_need_note'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('پاسخ سرویس ثبت شد','ok'); render();
   },
   'bus-need-parent-save'(){
     const v = (document.querySelector('#bus_need_opts input[name="bus_need"]:checked')||{}).value;
     if(!v){ toast('یکی از گزینه‌ها را انتخاب کنید','err'); return; }
     const r = busNeedSet(Number(id), v, '');
     if(!r.ok){ toast(r.msg,'err'); return; }
     toast('پاسخ شما ثبت شد','ok'); render();
   },
   'bus-event-student'(){
     const r = busEvent(Number(id), el.dataset.t, 'student');
     if(!r.ok) return toast(r.msg,'err');
     toast(el.dataset.t==='on' ? '🚌 ثبت شد — پیامک در صف است' : '🏫 ثبت شد — پیامک در صف است','ok');
     render();
   },
   'bus-loc-driver'(){
     busLocationReal('driver', 0).then(function(res){
       if(!res.ok) return toast(res.msg,'err');
       toast(res.real ? '📡 موقعیتِ واقعی ثبت شد' : '📍 موقعیت ثبت شد (دمو: نقطهٔ بعدیِ واقعیِ مسیر)','ok'); render();
     });
   },
   'bus-loc-student'(){
     busLocationReal('student', 0).then(function(res){
       if(!res.ok) return toast(res.msg,'err');
       toast('📍 موقعیت شما ثبت شد','ok'); render();
     });
   },
   /* بند ۱۴: پیگیریِ واقعیِ مغایرت — el/id از محیّط (دور ۷۹: پارامترِ سای‌کننده برداشته شد) */
   'bus-follow-open'(){
     const st = byId('users', Number(id));
     openModal(modalTpl('پیگیری مغایرت — ' + (st ? st.full_name : ''),
       f('یادداشت پیگیری', inp('bf_note', '', 'مثلاً: با راننده تماس گرفتم…')),
       'bus-follow-save'));
     window._busFollow = {route: Number(el.dataset.r), student: Number(id)};
   },
   'bus-follow-save'(){
     const fo = window._busFollow || {};
     const r = busFollowStart(fo.route, fo.student, V('bf_note'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('🔎 پیگیری شروع شد','ok'); render();
   },
   'bus-follow-close'(){
     const f = byId('bus_followups', Number(id));
     if(!f) return;
     const st = byId('users', f.student_id);
     openModal(modalTpl('بستن پیگیری — ' + (st ? st.full_name : ''),
       f('نتیجهٔ پیگیری', inp('bf_close', '', 'مثلاً: تأیید شد که دانش‌آموز پیاده شده است')),
       'bus-follow-close-save'));
     window._busFollowId = Number(id);
   },
   'bus-follow-close-save'(){
     const r = busFollowClose(window._busFollowId, V('bf_close'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('✅ پیگیری بسته شد','ok'); render();
   },
  };
}

/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات اسکان (خوابگاه): dorm-.
   آبجکتِ A همچنان در همان لحظهٔ کلیک و با همان ترکیب ساخته می‌شود؛
   هر پارسیال فقط بخشِ خود را برمی‌گرداند. پارامترهای (el, id, a, rawId)
   همان محلی‌هایِ شنوندهٔ کلیک هستند — بدنهٔ اکشن‌ها عیناً جابه‌جا شده.
   ═══════════════════════════════════════════════════════════════════ */
function dormActions(e, el, id, a, rawId){
  return {
   /* ─────────────── خوابگاه/اسکان (دور ۷۸ بند ۷) ─────────────── */
   'dorm-room-new'(){
     openModal(modalTpl('اتاق جدید',
       f('نام اتاق *', inp('dorm_room_name',''))
       + f('ظرفیت *', inp('dorm_room_cap','4','number')),
       'dorm-room-save'));
   },
   'dorm-room-edit'(){
     const r=byId('dorm_rooms',id)||{};
     openModal(modalTpl('ویرایش اتاق',
       `<input type="hidden" id="dorm_room_id" value="${escAttr(id)}" />`
       + f('نام اتاق *', inp('dorm_room_name',r.name||''))
       + f('ظرفیت *', inp('dorm_room_cap',r.capacity||1,'number')),
       'dorm-room-save'));
   },
   'dorm-room-save'(){
     const sid=S.user.school_id;
     const name=V('dorm_room_name').trim(), cap=Number(V('dorm_room_cap'))||1;
     if(!name){toast('نام اتاق را بنویسید','err');return;}
     const rid=V('dorm_room_id');
     if(rid) update('dorm_rooms',Number(rid),{name,capacity:cap});
     else insert('dorm_rooms',{school_id:sid,name,capacity:cap,created_at:todayISO()});
     closeModal(); toast('اتاق ذخیره شد','ok'); render();
   },
   'dorm-room-del'(){
     const r=byId('dorm_rooms',id); if(!r)return;
     if((db.dorm_assignments||[]).some(a=>a.room_id===id)){
       toast('اول ساکنان این اتاق را بردارید','err');return;
     }
     askDelete(`اتاق «${r.name}» حذف شود؟`,()=>{remove('dorm_rooms',id);toast('حذف شد','');render();});
   },
   'dorm-assign'(){
     const sid=S.user.school_id, roomId=Number(id);
     const room=byId('dorm_rooms',roomId); if(!room)return;
     const occ=(db.dorm_assignments||[]).filter(a=>a.room_id===roomId).length;
     const assignedIds=(db.dorm_assignments||[]).filter(a=>a.school_id===sid).map(a=>a.student_id);
     const free=db.users.filter(u=>u.role==='student'&&u.school_id===sid&&u.active&&assignedIds.indexOf(u.id)<0)
       .sort((a,b)=>a.full_name.localeCompare(b.full_name,'fa'));
     if(!free.length){toast('دانش‌آموزِ فعالِ بدونِ اتاقی نیست','err');return;}
     openModal(modalTpl(`انتساب به اتاق ${room.name} (${occ}/${room.capacity})`,
       free.map(u=>`<div class="row" style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;cursor:pointer" data-act="dorm-assign-pick" data-id="${escAttr(roomId)}" data-sid="${escAttr(u.id)}"><b>${esc(u.full_name)}</b><span class="small muted">${esc((classOf(u.id)||{}).name||'—')}</span></div>`).join('')));
   },
   'dorm-assign-pick'(){
     const roomId=Number(id), studentId=Number(el.dataset.sid);
     const room=byId('dorm_rooms',roomId); if(!room||!studentId)return;
     const occ=(db.dorm_assignments||[]).filter(a=>a.room_id===roomId).length;
     if(occ>=(Number(room.capacity)||0)){toast('اتاق پر است — ظرفیت را بیشتر کنید یا اتاق دیگری انتخاب کنید','err');render();return;}
     const old=dormAssignOf(studentId);
     if(old)remove('dorm_assignments',old.id);
     insert('dorm_assignments',{school_id:S.user.school_id,room_id:roomId,student_id:studentId,since:todayISO()});
     closeModal(); toast('انتساب شد','ok'); render();
   },
   'dorm-unassign'(){
     const studentId=Number(el.dataset.sid);
     const a=studentId?dormAssignOf(studentId):null;
     if(!a){render();return;}
     const st=byId('users',studentId)||{};
     askDelete(`«${st.full_name||''}» از اتاق برشود؟`,()=>{remove('dorm_assignments',a.id);toast('برداشت شد','');render();});
   },
   'dorm-meal'(){
     const day=Number(el.dataset.day), kind=el.dataset.kind;
     const m=dormMealOf(S.user.school_id,day,kind);
     const kindFa=(DORM_MEAL_KINDS.find(k=>k[0]===kind)||['','؟'])[1];
     openModal(modalTpl(`منوی ${DORM_DAYS[day]} — ${kindFa}`,
       `<input type="hidden" id="dorm_meal_day" value="${day}" /><input type="hidden" id="dorm_meal_kind" value="${escAttr(kind)}" />`
       + f('منو (خالی = حذف)', `<textarea class="input" id="dorm_meal_menu" rows="3" placeholder="مثلاً برنج و خورشت قورمه + سالاد">`+(m&&m.menu?esc(m.menu):'')+`</textarea>`),
       'dorm-meal-save'));
   },
   'dorm-meal-save'(){
     const sid=S.user.school_id, day=Number(V('dorm_meal_day')), kind=V('dorm_meal_kind');
     const menu=V('dorm_meal_menu').trim();
     const old=dormMealOf(sid,day,kind);
     if(!menu){ if(old)remove('dorm_meals',old.id); }
     else if(old) update('dorm_meals',old.id,{menu});
     else insert('dorm_meals',{school_id:sid,day,kind,menu,created_at:todayISO()});
     closeModal(); toast('منو ذخیره شد','ok'); render();
   },
   /* مرخصیِ رفت‌وبرگشتِ آخر هفته: جدا از مرخصیِ آکادمیک — مستقیمِ
      مدیر (بدونِ صفِ بررسی)، پنجشنبه→جمعهٔ پیشِ رو، بدونِ اثر روی
      حضور (weekend اصلاً رکوردِ حضور ندارد). */
   'dorm-leave'(){
     const studentId=Number(el.dataset.sid);
     const st=studentId?byId('users',studentId):null;
     if(!st){render();return;}
     const jsDay=new Date().getDay(); /* ۰=یکشنبه … ۵=پنجشنبه */
     const dUntilFri=((5-jsDay)+7)%7; /* اگر امروز پنجشنبه باشد: ۰ */
     const from=addDaysISO(todayISO(),dUntilFri), to=addDaysISO(from,1);
     const l=insert('leaves',{school_id:st.school_id,student_id:st.id,from_date:from,to_date:to,
       reason:'مرخصیِ رفت‌وبرگشتِ آخر هفته (خوابگاه)',kind:'dorm_weekend',status:'approved',created_at:todayISO()});
     [st.id,...db.parent_links.filter(x=>x.student_id===st.id).map(x=>x.parent_id)].forEach(uid=>
       insert('notifications',{user_id:uid,school_id:st.school_id,type:'leave',title:'🏠 مرخصیِ آخر هفتهٔ خوابگاه',
         body:`${st.full_name} از ${faD(from)} تا ${faD(to)} مرخصیِ رفت‌وبرگشتِ آخر هفته دارد.`,link:'leaves',read:0,created_at:todayISO()}));
     toast('مرخصیِ آخر هفته ثبت شد: '+faD(from)+' تا '+faD(to),'ok');
     render();
   },
  };
}

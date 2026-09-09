/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات پیامک و اطلاع‌رسانی: notify- و sms- (با _notifyApprove).
   آبجکتِ A همچنان در همان لحظهٔ کلیک و با همان ترکیب ساخته می‌شود؛
   هر پارسیال فقط بخشِ خود را برمی‌گرداند. پارامترهای (el, id, a, rawId)
   همان محلی‌هایِ شنوندهٔ کلیک هستند — بدنهٔ اکشن‌ها عیناً جابه‌جا شده.
   ═══════════════════════════════════════════════════════════════════ */
function smsActions(e, el, id, a, rawId){
  return {
   'sms-new'(){
     openModal(modalTpl('ارسال پیامک گروهی',
       f('گیرندگان',sel('sm_aud',[['parents','همه اولیا'],['teachers','همه دبیران'],
         ['students','همه دانش‌آموزان'],['class','اولیای یک کلاس']]))
       +f('کلاس (در صورت انتخاب)',sel('sm_class',visibleClasses().map(c=>[c.id,c.name])))
       +f('متن پیام','<textarea class="input" id="sm_text" rows="4" placeholder="اولیای گرامی، جلسه اولیا و مربیان روز چهارشنبه ساعت ۱۶ برگزار می‌شود."></textarea>'),
       'sms-send'));
   },
   'sms-send'(){
     const sid=S.user.school_id, text=V('sm_text')||'';
     if(invalid('sm_text',text.trim().length<4,'متن پیام باید دست‌کم چهار نویسه باشد'))return;
     const targets=smsTargets(sid,V('sm_aud'),V('sm_class'));
     if(!targets.length){toast('گیرنده‌ای با شماره معتبر یافت نشد','err');return;}
     const parts=smsParts(text), need=targets.length*parts;
     const wal=smsWalletOf(sid);
     if(wal.balance<need){
       toast('اعتبار پیامک کافی نیست. نیاز: '+fa(need)+' — موجودی: '+fa(wal.balance),'err');return;}
     batchWrites(()=>{
       targets.forEach(t=>insert('sms_log',{school_id:sid,user_id:t.id,phone:t.phone,body:text,
         parts,status:'sent',created_at:todayISO()}));
       update('sms_wallet',wal.w.id,{balance:wal.balance-need});
     });
     closeModal(); toast(fa(targets.length)+' پیامک ارسال شد ('+fa(need)+' اعتبار)','ok'); render();
   },
   'sms-topup'(){
     const wal=smsWalletOf(S.user.school_id);
     openModal(modalTpl('شارژ اعتبار پیامک',
       f('تعداد پیامک',sel('sm_count',[500,1000,2000,5000].map(n=>[n,fa(n)+' پیامک — '+rial(n*wal.price)+' ریال'])))
       +'<div class="small muted" style="line-height:2;margin-top:8px">پرداخت آزمایشی است و مبلغی کسر نمی‌شود.</div>',
       'sms-topup-ok'));
   },
   // ---- اطلاع‌رسانی پیامکی به اولیا (دور ۴۲) ----
   'notify-filter'(){ S.filters.nkind = el.dataset.k || ''; render(); },
   'notify-pick-all'(){
     const on = el.checked;
     $$('.nq-pick').forEach(x => { x.checked = on; });
   },
   'notify-approve'(){ _notifyApprove([Number(el.dataset.id)]); },
   'notify-reject'(){
     const n = notifyReject([Number(el.dataset.id)]);
     if(n) toast('پیام رد شد','ok');
     render();
   },
   'notify-approve-sel'(){
     const ids = notifyPicked();
     if(!ids.length){ toast('هیچ پیامی انتخاب نشده است','err'); return; }
     _notifyApprove(ids);
   },
   'notify-reject-sel'(){
     const ids = notifyPicked();
     if(!ids.length){ toast('هیچ پیامی انتخاب نشده است','err'); return; }
     askConfirm(`${fa(ids.length)} پیام رد شود و برای اولیا ارسال نشود؟`, () => {
       const n = notifyReject(ids);
       toast(fa(n) + ' پیام رد شد','ok');
       render();
     }, { title:'رد پیام‌ها', ok:'رد کن' });
   },
   'notify-edit'(){
     const q = byId('notify_queue', Number(el.dataset.id));
     if(!q) return;
     window._nqEdit = q.id;
     openModal(modalTpl('ویرایش متن پیام',
       f('متن پیامک','<textarea class="input" id="nq_text" rows="4">' + esc(q.body) + '</textarea>')
       + '<div class="small muted" style="line-height:2">'
       + 'گیرندگان: ' + fa((q.parent_ids||[]).length) + ' نفر · '
       + 'هر ۷۰ نویسه یک قطعه پیامک حساب می‌شود.</div>',
       'notify-save-edit'));
   },
   'notify-save-edit'(){
     const id = window._nqEdit, txt = (V('nq_text')||'').trim();
     if(invalid('nq_text', txt.length < 4, 'متن پیام باید دست‌کم چهار نویسه باشد')) return;
     const q = byId('notify_queue', id);
     if(!q){ closeModal(); return; }
     /* ⚠️ ویرایش مدیر ممکن است پیام را دوقطعه‌ای کند ⇒ parts دوباره
        حساب می‌شود، وگرنه هزینه کمتر از واقع کسر می‌شود. */
     update('notify_queue', id, { body: txt, parts: smsParts(txt) });
     closeModal();
     toast('متن پیام ویرایش شد','ok');
     render();
   },
   'notify-auto-off'(){
     notifySaveSettings(S.user.school_id, { autoSend:false });
     toast('حالت ارسال خودکار خاموش شد','ok');
     render();
   },
   'notify-settings'(){
     const c = notifySettings(S.user.school_id);
     const row = (id,on,label,hint) =>
       '<label class="row" style="gap:10px;align-items:flex-start;padding:10px 0;'
       + 'border-bottom:1px solid var(--border)">'
       + '<input type="checkbox" id="' + id + '"' + (on?' checked':'')
       + ' style="margin-top:3px;flex:none" />'
       + '<span style="min-width:0"><b class="small">' + label + '</b>'
       + '<div class="small muted" style="margin-top:2px;line-height:1.9">' + hint + '</div>'
       + '</span></label>';
     openModal(modalTpl('تنظیمات اطلاع‌رسانی پیامکی',
       row('nf_on', c.enabled, 'اطلاع‌رسانی پیامکی فعال باشد',
           'با خاموش بودن، هیچ پیامی ساخته نمی‌شود.')
       + row('nf_auto', c.autoSend, '⚠️ ارسال خودکار بدون تأیید مدیر',
           'خطای دبیر مستقیم به خانواده اطلاع داده می‌شود. با احتیاط روشن کنید.')
       + row('nf_urgauto', (c.urgentAutoSend !== false), '🚨 پیام‌هایِ فوری/بحرانی بی‌درنگ ارسال شوند',
           'فوری‌ها منتظرِ تأییدِ شما نمی‌مانند و پیش از بقیهٔ صف می‌روند (سقفِ روزانه همچنان پابرجاست). '
           + 'اگر خاموش شود، فوری فقط قرمز و بالایِ صف است و مانند بقیه تأیید می‌خواهد.')
       + row('nf_abs', c.kinds.absence, 'پیامک غیبت', 'پرتکرارترین پیام.')
       + row('nf_late', c.kinds.late, 'پیامک تأخیر', '')
       + row('nf_exit', c.kinds.exit, 'پیامک خروج زودهنگام از کلاس',
           'رویدادِ ایمنی است — پیش‌فرض روشن است؛ با هر خروجِ ثبت‌شده، خانواده همان لحظه خبر می‌گیرد.')
       + row('nf_grade', c.kinds.grade, 'پیامک نمرهٔ پایین',
           'عدد نمره در پیامک نمی‌آید؛ فقط اطلاع کلی.')
       + row('nf_event', c.kinds.event, 'پیامک رویداد مدرسه', '')
       + row('nf_daily', c.kinds.daily, 'پیامک خلاصهٔ روزانه',
           'پس از ثبت حضور، یک پیام تجمیعی (زنگ‌ها + وضعیت حضور) به هر خانواده؛ با دکمهٔ «خلاصهٔ امروز» هم دستی ساخته می‌شود.')
       + row('nf_bus', (c.kinds.bus_on!==false&&c.kinds.bus_off!==false), 'پیامک رویدادهای سرویس (سوار/پیاده)',
           'با هر کلیک راننده، به خانوادهٔ دانش‌آموز پیامک می‌رود.')
       + '<div class="grid g2" style="margin-top:10px">'
       +   f('مهلت اصلاح دبیر (دقیقه)', inp('nf_grace', c.graceMinutes, 'number'))
       +   f('سقف روزانه (قطعه)', inp('nf_cap', c.dailyCap, 'number'))
       +   f('هشدار از این تعداد به بالا', inp('nf_bulk', c.bulkWarn, 'number'))
       + '</div>',
       'notify-save-settings'));
   },
   'notify-save-settings'(){
     const sid = S.user.school_id;
     const wasAuto = notifySettings(sid).autoSend;
     const nowAuto = $('#nf_auto').checked;
     const apply = () => {
       notifySaveSettings(sid, {
         enabled:  $('#nf_on').checked,
         autoSend: nowAuto,
         /* D.3: ارسالِ بی‌درنگِ فوری‌ها — جدا از autoSendِ عادی */
         urgentAutoSend: !!$('#nf_urgauto').checked,
         graceMinutes: Math.max(0, Number(V('nf_grace')) || 20),
         dailyCap:     Math.max(1, Number(V('nf_cap'))   || 300),
         bulkWarn:     Math.max(1, Number(V('nf_bulk'))  || 50),
         kinds: { absence:$('#nf_abs').checked, late:$('#nf_late').checked,
                  exit:$('#nf_exit').checked,
                  grade:$('#nf_grade').checked, event:$('#nf_event').checked,
                  daily:$('#nf_daily').checked,
                  bus_on:$('#nf_bus').checked, bus_off:$('#nf_bus').checked }
       });
       closeModal(); toast('تنظیمات ذخیره شد','ok'); render();
     };
     /* ⚠️ روشن‌کردن خودکار تأیید صریح می‌خواهد — تصمیم پرریسکی است
        و نباید با یک تیک بی‌توجه انجام شود. */
     if(nowAuto && !wasAuto){
       askConfirm('با روشن‌کردن ارسال خودکار، پیام‌ها بدون بازبینی شما به اولیا می‌روند.',
         apply, { title:'تأیید ارسال خودکار', ok:'می‌پذیرم و روشن کن',
                  note:'خطای دبیر در حضور و غیاب مستقیم به خانواده اطلاع داده می‌شود.' });
     } else apply();
   },
   'sms-topup-ok'(){
     const n=Number(V('sm_count'))||500;
     const wal=smsWalletOf(S.user.school_id);
     update('sms_wallet',wal.w.id,{balance:Number(wal.w.balance)+n});
     closeModal(); toast(fa(n)+' پیامک شارژ شد','ok'); render();
   },
  };
}

/**
 * تأیید و ارسال دستهٔ پیام، با هشدار پیش از ارسال حجم بالا.
 *
 * ⚠️ سه وضعیت جدا هشدار می‌گیرند: اعتبار ناکافی (بازدارنده)،
 * فراتر از سقف روزانه (هشدار)، حجم بالا (هشدار). سقف ترمز است
 * نه دیوار: مدیر می‌تواند آگاهانه رد شود.
 */
function _notifyApprove(ids){
  var e = notifyEstimate(ids);
  if(!e.count){ toast('پیامی برای ارسال نیست','err'); return; }

  var go = function(){
    var r = notifySend(ids);
    if(r.sent) toast(fa(r.sent) + ' پیام ارسال شد (' + fa(r.used) + ' قطعه)', 'ok');
    if(r.reason === 'no-credit')
      toast('اعتبار پیامک تمام شد — ' + fa(r.skipped) + ' پیام در صف ماند', 'err');
    render();
  };

  if(!e.enough){
    toast('اعتبار کافی نیست. نیاز: ' + fa(e.parts) +
          ' قطعه — موجودی: ' + fa(e.balance) + ' قطعه', 'err');
    return;
  }
  if(e.overBulk || e.overCap){
    var note = e.overCap
      ? 'این ارسال از سقف روزانهٔ مدرسه فراتر می‌رود.'
      : 'موجودی پس از ارسال: ' + fa(e.after) + ' قطعه.';
    askConfirm(fa(e.count) + ' پیام (' + fa(e.parts) + ' قطعه) برای اولیا ارسال شود؟',
      go, { title:'تأیید ارسال گروهی', ok:'تأیید و ارسال', danger:false, note:note });
    return;
  }
  go();
}

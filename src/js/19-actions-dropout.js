/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات ترک تحصیل: drop-.
   آبجکتِ A همچنان در همان لحظهٔ کلیک و با همان ترکیب ساخته می‌شود؛
   هر پارسیال فقط بخشِ خود را برمی‌گرداند. پارامترهای (el, id, a, rawId)
   همان محلی‌هایِ شنوندهٔ کلیک هستند — بدنهٔ اکشن‌ها عیناً جابه‌جا شده.
   ═══════════════════════════════════════════════════════════════════ */
function dropoutActions(e, el, id, a, rawId){
  return {
   /* ─────────── دور ۷۶ — ترک تحصیل (بدون حذف داده) ─────────── */
   'drop-register'(){
     const u=byId('users',id);
     if(!u||u.role!=='student'){toast('فقط پروندهٔ دانش‌آموز','err');return;}
     if((u.status||'active')!=='active'){toast('این دانش‌آموز در وضعیتِ فعال نیست','err');return;}
     const reasons=(typeof DROP_REASONS==='object')?DROP_REASONS:{};
     window._dropId=id;
     openModal(modalTpl('ثبت ترک تحصیل — '+esc(u.full_name),
       '<div class="callout red" style="margin-bottom:10px"><b>هیچ داده‌ای حذف نمی‌شود:</b> فقط وضعیتِ دانش‌آموز «ترک تحصیل» می‌شود؛ نمرات، حضور و سابقهٔ کاملِ پرونده دست‌نخورده می‌ماند.</div>'
       +f('تاریخ ثبت (الزامی)',`<input class="input" id="drop_date" type="date" value="${escAttr(todayISO())}" />`)
       +f('دلیل (الزامی)',`<select class="select" id="drop_reason"><option value="">— انتخاب کنید —</option>${Object.keys(reasons).map(k=>`<option value="${escAttr(k)}">${esc(reasons[k])}</option>`).join('')}</select>`)
       +f('توضیحِ آزاد (اختیاری)','<textarea class="input" id="drop_note" rows="2" placeholder="جزئیاتِ بیشتر (برای «سایر» الزامی است)"></textarea>')
       +'<div class="small muted" style="margin-top:8px">با ثبت، به آمارِ ترک تحصیلِ داشبوردِ اداره می‌پیوندد و برای پیگیریِ سلسله‌مراتب (در آینده: تا سطحِ رئیسِ کل) در دسترس است.</div>',
       'drop-register-confirm',false,'ثبت'));
   },
   'drop-register-confirm'(){
     const sid=window._dropId;
     const u=byId('users',sid);
     if(!u){closeModal();return;}
     const date=V('drop_date'), reason=V('drop_reason'), note=V('drop_note');
     if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('تاریخِ ثبت را درستی کنید','err');return;}
     if(!reason){toast('دلیلِ ترک تحصیل الزامی است','err');return;}
     if(reason==='other'&&!note){toast('برای «سایر»، توضیحِ آزاد الزامی است','err');return;}
     const r=(typeof dropRegister==='function')?dropRegister(sid,date,reason,note):{ok:false,msg:'تابع موجود نیست'};
     if(!r.ok){toast(r.msg,'err');return;}
     closeModal();
     toast('ترک تحصیل ثبت شد — پروندهٔ کامل دست‌نخورده باقی است','ok');
     render();
   },
   'drop-return'(){
     const u=byId('users',id);
     if(!u||u.role!=='student'){toast('فقط پروندهٔ دانش‌آموز','err');return;}
     if((u.status||'active')!=='dropped_out'){toast('این دانش‌آموز در وضعیتِ ترک تحصیل نیست','err');return;}
     window._dropretId=id;
     openModal(modalTpl('بازگشت به تحصیل — '+esc(u.full_name),
       '<div class="callout green" style="margin-bottom:10px">وضعیت به «فعال» برمی‌گردد و تاریخِ بازگشت ثبت می‌شود. سابقهٔ ترک (دلیل و تاریخ) در پرونده می‌ماند.</div>'
       +f('تاریخ بازگشت (الزامی)',`<input class="input" id="dropret_date" type="date" value="${escAttr(todayISO())}" />`),
       'drop-return-confirm',false,'ثبت بازگشت'));
   },
   'drop-return-confirm'(){
     const sid=window._dropretId;
     const u=byId('users',sid);
     if(!u){closeModal();return;}
     const date=V('dropret_date');
     if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('تاریخِ بازگشت را درستی کنید','err');return;}
     const r=(typeof dropReturn==='function')?dropReturn(sid,date):{ok:false,msg:'تابع موجود نیست'};
     if(!r.ok){toast(r.msg,'err');return;}
     closeModal();
     toast('بازگشت به تحصیل ثبت شد','ok');
     render();
   },
  };
}

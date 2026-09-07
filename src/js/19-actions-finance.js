/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات مالی: plan- (اکشن‌های tuition و trx و receipt در ماژول‌های
   مالیِ خودشان هستند و در A نبوده‌اند).
   آبجکتِ A همچنان در همان لحظهٔ کلیک و با همان ترکیب ساخته می‌شود؛
   هر پارسیال فقط بخشِ خود را برمی‌گرداند. پارامترهای (el, id, a, rawId)
   همان محلی‌هایِ شنوندهٔ کلیک هستند — بدنهٔ اکشن‌ها عیناً جابه‌جا شده.
   ═══════════════════════════════════════════════════════════════════ */
function financeActions(e, el, id, a, rawId){
  return {
   // ---- پلان فروش و پشتیبان‌گیری ----
   'plan-settings'(){
     const st=subSettings();
     openModal(modalTpl('تنظیمات پلان و قیمت‌گذاری',
       '<div class="grid g2">'
       +f('قیمت ماهانه (ریال)',inp('pl_m',st.price_monthly||0,'number'))
       +f('قیمت فصلی (ریال)',inp('pl_s',st.price_seasonal||0,'number'))
       +f('قیمت سالانه (ریال)',inp('pl_y',st.price_yearly||0,'number'))
       +f('سهم مدرسه (درصد)',inp('pl_share',st.school_share_percent||20,'number'))
       +f('دورهٔ آزمایشی (روز)',inp('pl_trial',st.trial_days||0,'number'))
       +f('دیوار پرداخت',sel('pl_wall',[['1','فعال'],['0','غیرفعال']],String(st.paywall_enabled?1:0)))
       +'</div>'
       +'<div class="small muted" style="line-height:2;margin-top:8px">'
       +'تغییر قیمت روی اشتراک‌های فعال اثر ندارد؛ فقط خریدهای تازه.</div>','plan-save'));
   },
   'plan-save'(){
     const patch={
       price_monthly:Number(V('pl_m'))||0,
       price_seasonal:Number(V('pl_s'))||0,
       price_yearly:Number(V('pl_y'))||0,
       school_share_percent:Number(V('pl_share'))||0,
       trial_days:Number(V('pl_trial'))||0,
       trial_enabled:Number(V('pl_trial'))>0?1:0,
       paywall_enabled:Number(V('pl_wall'))?1:0
     };
     const errs=validatePlanSettings(patch);
     if(errs.length){toast(errs[0],'err');return;}
     saveSubSettings(patch);
     closeModal(); toast('تنظیمات پلان ذخیره شد','ok'); render();
   },
  };
}

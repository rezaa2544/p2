/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات کمک‌های داوطلبانه: don-. (بند B.5 فرناز — چت۱)
   پارسیالِ سیزدهمِ A: ترکیب در شنوندهٔ کلیکِ 19-actions-core انجام می‌شود.
   قراردادِ تحلیلِ استاتیک (tools/check-authz.js): ظرف دقیقاً
   `  return {` تا `  };` و ورودی‌ها `'نام'(){` بدون پارامتر.
   ═══════════════════════════════════════════════════════════════════ */
function donationsActions(e, el, id, a, rawId){
  return {
   /* ─────────────── کمک‌های داوطلبانه (بند B.5) ─────────────── */
   'don-new'(){
     openModal(modalTpl('ثبت کمک داوطلبانه',
       '<input type="hidden" id="don_f_id" value="" />'
       + f('نام کمک‌کننده (خالی = ناشناس)', inp('don_f_donor', ''))
       + f('مبلغ به ریال *', inp('don_f_amount', '', 'number'))
       + f('تاریخ *', inp('don_f_date', todayISO(), 'date'))
       + f('شرح', '<textarea class="input" id="don_f_desc" rows="2"></textarea>'),
       'don-save'));
   },
   'don-edit'(){
     var d = byId('donations', Number(id));
     if(!d) { toast('رکورد یافت نشد', 'err'); return; }
     openModal(modalTpl('ویرایش کمک',
       '<input type="hidden" id="don_f_id" value="' + escAttr(d.id) + '" />'
       + f('نام کمک‌کننده (خالی = ناشناس)', inp('don_f_donor', d.donor_name || ''))
       + f('مبلغ به ریال *', inp('don_f_amount', d.amount, 'number'))
       + f('تاریخ *', inp('don_f_date', d.date, 'date'))
       + f('شرح', '<textarea class="input" id="don_f_desc" rows="2">' + esc(d.description || '') + '</textarea>'),
       'don-save'));
   },
   'don-save'(){
     var res = saveDonation(V('don_f_id') || null, V('don_f_donor'), V('don_f_amount'), V('don_f_date'), V('don_f_desc'));
     if(!res.ok){ toast(res.msg, 'err'); return; }
     closeModal(); toast(res.updated ? 'کمک ویرایش شد' : 'کمک ثبت شد', 'ok'); render();
   },
   'don-del'(){ confirmModal('این کمک حذف شود؟', 'don-del-ok', id); },
   'don-del-ok'(){
     var res = deleteDonation(window._delId);
     if(!res.ok){ toast(res.msg, 'err'); return; }
     closeModal(); toast('کمک حذف شد', 'ok'); render();
   },
   'don-print'(){ donPrint(id); }
  };
}

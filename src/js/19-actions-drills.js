/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات مانور ایمنی: drill-. (بند B.4 فرناز — چت۱)
   پارسیالِ دوازدهمِ A: ترکیب در شنوندهٔ کلیکِ 19-actions-core انجام می‌شود.
   قراردادِ تحلیلِ استاتیک (tools/check-authz.js): ظرف دقیقاً
   `  return {` تا `  };` و ورودی‌ها `'نام'(){` بدون پارامتر.
   ═══════════════════════════════════════════════════════════════════ */
function drillsActions(e, el, id, a, rawId){
  return {
   /* ─────────────── مانور ایمنی (بند B.4) ─────────────── */
   'drill-new'(){
     openModal(modalTpl('ثبت مانور ایمنی/زلزله',
       '<input type="hidden" id="drill_f_id" value="" />'
       + f('تاریخ *', inp('drill_f_date', todayISO(), 'date'))
       + f('شمار دانش‌آموزان شرکت‌کننده *', inp('drill_f_students', '', 'number'))
       + f('شمار کادر شرکت‌کننده *', inp('drill_f_staff', '', 'number'))
       + f('یادداشت', '<textarea class="input" id="drill_f_notes" rows="2"></textarea>'),
       'drill-save'));
   },
   'drill-edit'(){
     var d = byId('safety_drills', Number(id));
     if(!d) { toast('رکورد یافت نشد', 'err'); return; }
     openModal(modalTpl('ویرایش مانور',
       '<input type="hidden" id="drill_f_id" value="' + escAttr(d.id) + '" />'
       + f('تاریخ *', inp('drill_f_date', d.date, 'date'))
       + f('شمار دانش‌آموزان شرکت‌کننده *', inp('drill_f_students', d.participant_count_students, 'number'))
       + f('شمار کادر شرکت‌کننده *', inp('drill_f_staff', d.participant_count_staff, 'number'))
       + f('یادداشت', '<textarea class="input" id="drill_f_notes" rows="2">' + esc(d.notes || '') + '</textarea>'),
       'drill-save'));
   },
   'drill-save'(){
     var res = saveDrill(V('drill_f_id') || null, V('drill_f_date'), V('drill_f_students'), V('drill_f_staff'), V('drill_f_notes'));
     if(!res.ok){ toast(res.msg, 'err'); return; }
     closeModal(); toast(res.updated ? 'مانور ویرایش شد' : 'مانور ثبت شد', 'ok'); render();
   },
   'drill-del'(){ confirmModal('این مانور حذف شود؟', 'drill-del-ok', id); },
   'drill-del-ok'(){
     var res = deleteDrill(window._delId);
     if(!res.ok){ toast(res.msg, 'err'); return; }
     closeModal(); toast('مانور حذف شد', 'ok'); render();
   }
  };
}

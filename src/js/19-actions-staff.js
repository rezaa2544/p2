/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات حضور کادر: staffatt-. (بند B.1 فرناز — چت۱)
   پارسیالِ دهمِ A: ترکیب در شنوندهٔ کلیکِ 19-actions-core انجام می‌شود.
   قراردادِ تحلیلِ استاتیک (tools/check-authz.js): ظرف دقیقاً
   `  return {` تا `  };` و ورودی‌ها `'نام'(){` بدون پارامتر.
   ═══════════════════════════════════════════════════════════════════ */
function staffActions(e, el, id, a, rawId){
  return {
   /* ─────────────── حضور کادر (بند B.1) ─────────────── */
   'staffatt-day'(){
     var parts = String(id == null ? '' : id).split('_');
     var sid = Number(parts[0]);
     var iso = parts.slice(1).join('_');
     var st = byId('users', sid);
     if (!st || !staffAttValidDate(iso)){ toast('درخواست معتبر نیست', 'err'); return; }
     var rec = staffAttRec(sid, iso);
     openModal(modalTpl('ثبت حضور — ' + st.full_name,
       '<input type="hidden" id="staffatt_f_staff" value="' + sid + '" />'
       + '<input type="hidden" id="staffatt_f_date" value="' + escAttr(iso) + '" />'
       + f('تاریخ', '<div><b>' + jalaliLongFa(iso) + '</b> <span style="color:#888">(' + esc(iso) + ')</span></div>')
       + f('وضعیت *', sel('staffatt_f_status', STAFF_ATT_STATUS, rec ? rec.status : 'present'))
       + f('یادداشت', inp('staffatt_f_note', rec ? (rec.note || '') : '')),
       'staffatt-save'));
   },
   'staffatt-save'(){
     var sid = Number(V('staffatt_f_staff'));
     var iso = V('staffatt_f_date');
     var res = markStaffAttendance(sid, iso, V('staffatt_f_status'), V('staffatt_f_note'));
     if (!res.ok){ toast(res.msg, 'err'); return; }
     closeModal();
     /* به‌روزرسانیِ هدفمند: همان خانه + همان سطرِ خلاصه (بدون رندرِ کامل) */
     var cell = document.getElementById('sac_' + sid + '_' + iso);
     if (cell){
       var rec = staffAttRec(sid, iso);
       cell.innerHTML = staffAttCellInner(iso, rec);
       if (rec && rec.note) cell.setAttribute('title', String(rec.note).slice(0, 120));
       else cell.removeAttribute('title');
     }
     var row = document.getElementById('sas_' + sid);
     if (row && S.user){
       var mst = staffAttState();
       var list = staffAttSummary(S.user.school_id, mst.jy, mst.jm);
       for (var i = 0; i < list.length; i++) if (list[i].id === sid) row.innerHTML = staffAttSumCells(list[i]);
     }
     toast(res.updated ? 'حضور ویرایش شد' : 'حضور ثبت شد', 'ok');
   },
   'staffatt-prev'(){
     var st = staffAttState();
     st.jm--; if (st.jm < 1){ st.jm = 12; st.jy--; }
     render();
   },
   'staffatt-next'(){
     var st = staffAttState();
     st.jm++; if (st.jm > 12){ st.jm = 1; st.jy++; }
     render();
   },
   'staffatt-today'(){
     S.staffatt = null;
     staffAttState();
     render();
   },
   'staffatt-pick'(){
     staffAttState().staffId = Number(id);
     render();
   }
  };
}

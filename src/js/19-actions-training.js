/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات دوره‌های آموزشی کادر: trn-. (بند B.2 فرناز — چت۱)
   پارسیالِ یازدهمِ A: ترکیب در شنوندهٔ کلیکِ 19-actions-core انجام می‌شود.
   قراردادِ تحلیلِ استاتیک (tools/check-authz.js): ظرف دقیقاً
   `  return {` تا `  };` و ورودی‌ها `'نام'(){` بدون پارامتر.
   ═══════════════════════════════════════════════════════════════════ */
function trainingActions(e, el, id, a, rawId){
  return {
   /* ─────────────── دوره‌های آموزشی کادر (بند B.2) ─────────────── */
   'trn-new'(){
     var staff = staffOfSchool(S.user.school_id);
     if (!staff.length){ toast('در این مدرسه همکاری برای ثبت دوره وجود ندارد', 'err'); return; }
     openModal(modalTpl('دورهٔ تازه',
       f('همکار *', sel('trn_f_staff', staff.map(function(s){ return [s.id, s.full_name]; }), staff[0].id))
       + f('عنوان دوره *', inp('trn_f_title', ''))
       + f('ساعت دوره * (معمولاً ۲۰ تا ۶۰)', inp('trn_f_hours', '', 'number'))
       + f('تاریخ برگزاری *', jdate('trn_f_date', todayISO()))
       + f('وضعیت *', sel('trn_f_status', TRAINING_STATUS, 'ongoing')),
       'trn-save'));
   },
   'trn-edit'(){
     var c = byId('training_courses', Number(id)) || {};
     var staff = staffOfSchool(S.user.school_id);
     openModal(modalTpl('ویرایش دوره',
       '<input type="hidden" id="trn_f_id" value="' + escAttr(id) + '" />'
       + f('همکار *', sel('trn_f_staff', staff.map(function(s){ return [s.id, s.full_name]; }), c.staff_id))
       + f('عنوان دوره *', inp('trn_f_title', c.title || ''))
       + f('ساعت دوره * (معمولاً ۲۰ تا ۶۰)', inp('trn_f_hours', c.hours == null ? '' : c.hours, 'number'))
       + f('تاریخ برگزاری *', jdate('trn_f_date', c.date || todayISO()))
       + f('وضعیت *', sel('trn_f_status', TRAINING_STATUS, c.status || 'ongoing')),
       'trn-save'));
   },
   'trn-save'(){
     var res = saveTrainingCourse(V('trn_f_id') || null, {
       staff_id: V('trn_f_staff'), title: V('trn_f_title'), hours: V('trn_f_hours'),
       date: V('trn_f_date'), status: V('trn_f_status')
     });
     if (!res.ok){ toast(res.msg, 'err'); return; }
     closeModal();
     toast(res.cert ? 'دوره ذخیره و گواهی صادر شد — کد: ' + res.cert : 'دوره ذخیره شد', 'ok');
     render();
   },
   'trn-complete'(){
     var c = byId('training_courses', Number(id));
     if (!c){ toast('دوره پیدا نشد', 'err'); return; }
     var res = saveTrainingCourse(c.id, { staff_id: c.staff_id, title: c.title, hours: c.hours, date: c.date, status: 'completed' });
     if (!res.ok){ toast(res.msg, 'err'); return; }
     toast('دوره تکمیل و گواهی صادر شد — کد: ' + res.cert, 'ok');
     render();
   },
   'trn-print'(){
     var d = trainingCert(Number(id));
     if (!d.ok){ toast(d.msg, 'err'); return; }
     printableDoc(d);
   },
   'trn-verify'(){
     var c = byId('training_courses', Number(id));
     if (!c){ toast('دوره پیدا نشد', 'err'); return; }
     var st = byId('users', c.staff_id) || {};
     openModal(modalTpl('راستی‌آزمایی گواهی',
       '<input type="hidden" id="trn_v_id" value="' + c.id + '" />'
       + f('دوره', '<div><b>' + esc(c.title) + '</b> — ' + esc(st.full_name || '') + '</div>')
       + f('کد احراز *', inp('trn_v_code', '')),
       'trn-verify-check'));
   },
   'trn-verify-check'(){
     var r = staffCertVerify(V('trn_v_code'), V('trn_v_id'));
     closeModal();
     toast(r.msg, r.ok ? 'ok' : 'err');
   }
  };
}

/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بازبینیِ معماری — شکستنِ 19-actions.js به ماژول‌هایِ دامنه‌ای
      اقدامات کلاس مجازی و تکالیف: vclass-، vc-، hw-.
   آبجکتِ A همچنان در همان لحظهٔ کلیک و با همان ترکیب ساخته می‌شود؛
   هر پارسیال فقط بخشِ خود را برمی‌گرداند. پارامترهای (el, id, a, rawId)
   همان محلی‌هایِ شنوندهٔ کلیک هستند — بدنهٔ اکشن‌ها عیناً جابه‌جا شده.
   ═══════════════════════════════════════════════════════════════════ */
function vclassActions(e, el, id, a, rawId){
  return {
   /* بند ۱۲: حضورِ خودکار کلاس مجازی */
   /* بند ۱۵: لینک‌های اختصاصیِ کلاس مجازی */
   'vclass-links'(){ vclassLinksModal(Number(id)); },
   'vclass-link-copy'(){
     const l = byId('vclass_links', Number(id));
     if(!l) return;
     const url = vclassLinkFullUrl(l);
     if(navigator.clipboard && navigator.clipboard.writeText){
       navigator.clipboard.writeText(url).then(function(){ toast('لینک کپی شد','ok'); },
         function(){ window.prompt('لینک را کپی کنید:', url); });
     } else { window.prompt('لینک را کپی کنید:', url); }
   },
   'vc-join'(){
     const r = vclassJoin(Number(id));
     if(!r.ok) return toast(r.msg,'err');
     toast('🚪 وارد کلاس شدید — حضورِ شما ثبت شد','ok'); render();
   },
   'vc-leave'(){
     const r = vclassLeave(Number(id));
     if(!r.ok) return toast(r.msg,'err');
     toast('خروج شما ثبت شد','ok'); render();
   },
   /* بند ۱۲: تکالیف — بازه/قفل + مشاهده */
   'hw-window'(){ hwWindowModal(Number(id)); },
   'hw-window-save'(){
     const locked = !!(document.getElementById('hww_locked')||{}).checked;
     const r = hwSetWindow(window._hwWindowId, locked, V('hww_open'), V('hww_close'));
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('بازهٔ ارسال به‌روز شد','ok'); render();
   },
   'hw-lock'(){
     const a = byId('hw_assignments', Number(id));
     if(!a) return;
     const r = hwSetWindow(Number(id), !a.locked, a.window_open||'', a.window_close||'');
     if(!r.ok){ toast(r.msg,'err'); return; }
     toast(r.rec.locked ? 'تکلیف قفل شد' : 'تکلیف باز شد','ok'); render();
   },
   'hw-view'(){ hwViewModal(Number(id)); },
   /* ─────────────── کلاس مجازی (نسخهٔ سبک) ─────────────── */
   'vclass-new'(){ vclassNewModal(Number(id)); },
   'vclass-save'(){
     const clsId = window._vclassClass;
     const title = V('vc_title');
     if(!title) return toast('عنوان نشست را بنویسید','err');
     const type = V('vc_type');
     const fEl = $('#vc_file');
     const file = (fEl && fEl.files && fEl.files[0]) ? fEl.files[0] : null;
     if(type==='video' && !file) return toast('فایل ویدیو را انتخاب کنید','err');
     closeModal();
     vclassCreateSession({classId:clsId, type:type, title:title,
       url:V('vc_url'), time:V('vc_time'), desc:V('vc_desc')}, file).then(function(r){
       if(!r.ok){ toast(r.msg,'err'); return; }
       toast('نشست در کلاس مجازی ثبت شد','ok');
       render();
     });
   },
   'vclass-del'(){
     askConfirm('این نشست (و در صورت وجود، فایل آن از ذخیره‌گاه) حذف شود؟', function(){
       const s = byId('vclass_sessions', id);
       if(!s) return;
       const u = S.user;
       const role = (typeof activePersona==='function') ? activePersona() : u.role;
       const isTeacher = role==='teacher' && teacherClasses(u.id).some(function(c){ return c.id===s.class_id; });
       if(!(isTeacher || role==='manager' || role==='superadmin')){
         toast('شما مجوز حذف این نشست را ندارید','err'); return;
       }
       vclassQuestionsOf(s.id).forEach(function(q){ remove('vclass_questions', q.id); });
       remove('vclass_sessions', s.id);
       /* فایل IDB ناهمگام است — پیام و رندر بعد از پاک‌شدن واقعی */
       vclassIdbDel(VCLASS_STORE, s.file_key || '').then(function(){
         toast('نشست حذف شد','ok'); render();
       });
     }, {title:'حذف نشست', ok:'حذف', danger:true});
   },
   'vclass-play'(){
     const s = byId('vclass_sessions', id);
     if(!s || !s.file_key){ toast('فایل این نشست در دسترس نیست','err'); return; }
     toast('فایل در حال بارگذاری است…','');
     vclassIdbGet(VCLASS_STORE, s.file_key).then(function(blob){
       if(!blob){ toast('فایل دیگر در ذخیره‌گاه نیست','err'); return; }
       const url = (typeof URL!=='undefined' && URL.createObjectURL) ? URL.createObjectURL(blob) : '';
       openModal(modalTpl('🎬 ' + (s.title||''),
         '<video controls style="width:100%;max-height:62vh;background:#000;border-radius:10px" data-vurl="'+escAttr(url)+'"></video>'
         + (s.description ? '<div class="small muted" style="margin-top:10px">'+esc(s.description)+'</div>' : ''), ''));
       setTimeout(function(){
         const v = document.querySelector('#modal video');
         if(v && v.getAttribute('data-vurl')) v.src = v.getAttribute('data-vurl');
       }, 60);
     });
   },
   'vclass-q-ask'(){
     window._vcQSession = id;
     openModal(modalTpl('❓ سؤال از دبیر',
       '<textarea id="vc_qbody" class="input" rows="4" placeholder="سؤال خود را بنویسید"></textarea>',
       'vclass-q-save'));
   },
   'vclass-q-save'(){
     const s = byId('vclass_sessions', window._vcQSession);
     if(!s) return;
     const body = V('vc_qbody');
     if(!body) return toast('متن سؤال را بنویسید','err');
     const u = S.user;
     const role = (typeof activePersona==='function') ? activePersona() : u.role;
     /* 🔴 سؤال فقط به اسم خودِ دانش‌آموز و فقط در نشستِ کلاس خودش */
     const sid2 = role==='student' ? u.id : S.child;
     const cls2 = sid2 ? classOf(sid2) : null;
     if(!cls2 || cls2.id !== s.class_id){ toast('این نشست مربوط به کلاس شما نیست','err'); return; }
     insert('vclass_questions', {
       session_id: s.id, student_id: sid2, body: body,
       created_at: new Date().toISOString(), answer:'', answered_at:'', answered_by:0
     });
     closeModal(); toast('سؤال ثبت شد — پاسخ دبیر همین‌جا می‌آید','ok'); render();
   },
   'vclass-q-answer'(){
     window._vcQId = id;
     openModal(modalTpl('✍️ پاسخ به سؤال',
       '<textarea id="vc_qans" class="input" rows="3" placeholder="پاسخ خود را بنویسید"></textarea>',
       'vclass-q-answer-save'));
   },
   'vclass-q-answer-save'(){
     const ans = V('vc_qans');
     if(!ans) return toast('متن پاسخ را بنویسید','err');
     update('vclass_questions', window._vcQId, {
       answer: ans, answered_at: new Date().toISOString(), answered_by: S.user.id
     });
     closeModal(); toast('پاسخ ثبت شد','ok'); render();
   },
   /* ─────────────── تکالیف (بند ۴) ─────────────── */
   'hw-new'(){
     const cls = byId('classes', Number(id));
     if(!cls) return;
     window._hwClass = Number(id);
     const subs = (typeof visibleSubjects==='function'?visibleSubjects():[]).filter(function(x){return x.school_id===cls.school_id;});
     openModal(modalTpl('تکلیف جدید — ' + cls.name,
       f('عنوان *', inp('hw_title',''))
       + f('درس', sel('hw_subject', [['','—']] .concat(subs.map(function(x){return [x.id,x.name];})), ''))
       + f('توضیح', inp('hw_desc',''))
       + f('مهلت (اختیاری)', inp('hw_due','','date'))
       , 'hw-save'));
   },
   'hw-save'(){
     const r = hwCreateAssignment({
       classId: window._hwClass,
       title: V('hw_title'),
       subjectId: Number(V('hw_subject')) || 0,
       description: V('hw_desc'),
       dueDate: V('hw_due')
     });
     if(!r.ok){ toast(r.msg,'err'); return; }
     closeModal(); toast('تکلیف ثبت شد','ok'); render();
   },
   'hw-del'(){
     askConfirm('این تکلیف و فهرست بارگذاری‌هایش حذف شود؟ (خود فایل‌ها در ذخیره‌گاه می‌مانند)', function(){
       const a = byId('hw_assignments', id);
       if(!a) return;
       const cls = byId('classes', a.class_id);
       const u = S.user;
       const role = (typeof activePersona==='function') ? activePersona() : u.role;
       const isTeacher = role==='teacher' && cls && teacherClasses(u.id).some(function(c){ return c.id===cls.id; });
       if(!(isTeacher || role==='manager' || role==='superadmin')){
         toast('شما مجوز حذف این تکلیف را ندارید','err'); return;
       }
       hwSubmissionsOf(a.id).forEach(function(s){ remove('hw_submissions', s.id); });
       remove('hw_assignments', a.id);
       toast('تکلیف حذف شد','ok'); render();
     }, {title:'حذف تکلیف', ok:'حذف', danger:true});
   },
   'hw-list'(){ hwListModal(Number(id)); },
   'hw-grade'(){ hwGradeModal(Number(id)); },
   'hw-grade-save'(){
     const raw = V('hw_score');
     const score = raw==='' ? null : Number(raw);
     if(raw!=='' && (isNaN(score) || score<0 || score>20)){ toast('نمره باید ۰ تا ۲۰ باشد','err'); return; }
     hwSaveGrading(score).then(function(r){
       if(!r.ok){ toast(r.msg,'err'); return; }
       closeModal(); toast('تصحیح ثبت شد','ok'); render();
     });
   },
   'hw-canvas-clear'(){ _hwStrokes = []; hwCanvasRedraw(); },
   'hw-submit'(){
     const inpEl = document.getElementById('hwfile_' + id);
     const file = (inpEl && inpEl.files && inpEl.files[0]) ? inpEl.files[0] : null;
     if(!file){ toast('تصویر تکلیف را انتخاب کنید','err'); return; }
     toast('در حال بارگذاری…','');
     hwSubmit(Number(id), file).then(function(r){
       if(!r.ok){ toast(r.msg,'err'); return; }
       toast('تکلیف بارگذاری شد — در انتظار تصحیح دبیر','ok');
       render();
     });
   },
  };
}

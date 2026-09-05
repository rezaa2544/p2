/* ═══════════════════════════════════════════════════════════════════
   حالت حضوری/غیرحضوری مدرسه (بند ۱۳) — نسخهٔ سبک

   سرکار ادارهٔ آموزش و پرورش (edu_office) برای هر **مدرسه** و هر
   **روز** داخل محدودهٔ خودش (استان/شهرستان/منطقه — همان scope
   اداره) می‌تواند مدرسه را «غیرحضوری (مجازی)» کند؛ **مدیر** فقط
   مدرسهٔ خودش را. وقتی مدرسهٔ روزِ X غیرحضوری است، همهٔ کلاس/
   فضا/تجهیزاتش برای همان روز به‌صورت **خودکار** مجازی می‌شوند —
   در این نسخه این «خودکار» یعنی: نوارِ حالت در همهٔ نمای‌های
   فضا (حضور، کلاس‌ها، کلاس مجازی، کتابخانه، مهمان، املاک) و
   بجِ حالت در فهرست مدارسِ اداره (قفل ۱۳.۱ برای تغییرِ رفتاریِ
   واقعیِ ماژول‌ها).

   داده:
     attendance_modes {school_id, date, mode:'in_person'|'virtual',
                       set_by, set_at}
   یک ردیف برای هر (مدرسه، روز) — ثبتِ تکراری همان ردیف را
   به‌روز می‌کند (upsert). بدون ردیف = حضوری (پیش‌فرض).

   امنیت: مالکیتِ مدرسه روی داده در `setSchoolMode` (نه فقط
   دکمه): سوپرادمین همه؛ مدیر فقط مدرسهٔ خودش؛ edu_office فقط
   مدرسه‌هایِ داخل scope ادارهٔ خودش.
   ═══════════════════════════════════════════════════════════════════ */

const SM_MODES = {in_person:'حضوری', virtual:'غیرحضوری (مجازی)'};

/** ردیفِ حالتِ یک مدرسه در یک روز (یا null) */
function schoolModeRow(schoolId, dateISO){
  for(var i=0;i<db.attendance_modes.length;i++){
    var r = db.attendance_modes[i];
    if(r.school_id===Number(schoolId) && r.date===dateISO) return r;
  }
  return null;
}
/** حالتِ یک مدرسه در یک روز — بدون ردیف = حضوری */
function schoolModeOf(schoolId, dateISO){
  var r = schoolModeRow(schoolId, dateISO);
  return r ? (SM_MODES[r.mode] ? r.mode : 'in_person') : 'in_person';
}
function schoolVirtual(schoolId, dateISO){
  return schoolModeOf(schoolId, dateISO) === 'virtual';
}

/** ثبت/تغییر حالت — فقط سوپرادمین/مدیرِ مدرسه/ادارهٔ scope */
function setSchoolMode(schoolId, dateISO, mode, u){
  schoolId = Number(schoolId);
  dateISO = String(dateISO||'');
  mode = String(mode||'');
  if(!SM_MODES[mode]) return {ok:false, msg:'حالت نامعتبر است'};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || isNaN(Date.parse(dateISO)))
    return {ok:false, msg:'تاریخ معتبر نیست'};
  var s = byId('schools', schoolId);
  if(!s) return {ok:false, msg:'مدرسه یافت نشد'};
  u = u || S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  var okScope = false;
  if(role === 'superadmin') okScope = true;
  else if(role === 'manager') okScope = (u.school_id === schoolId);
  else if(role === 'edu_office'){
    var o = (typeof officeOf==='function') ? officeOf(u) : null;
    var list = (o && typeof officeScopeSchools==='function') ? officeScopeSchools(o) : [];
    okScope = list.some(function(x){ return x.id === schoolId; });
  }
  if(!okScope) return {ok:false, msg:'شما مجوز تغییر حالت این مدرسه را ندارید'};
  var now = new Date().toISOString();
  var row = schoolModeRow(schoolId, dateISO);
  var rec;
  if(row){
    update('attendance_modes', row.id, {mode:mode, set_by:u.id, set_at:now});
    rec = byId('attendance_modes', row.id);
  } else {
    rec = insert('attendance_modes',
      {school_id:schoolId, date:dateISO, mode:mode, set_by:u.id, set_at:now});
  }
  /* بند ۱۶: وقتی روزی غیرحضوری می‌شود، اولیا همان لحظه در صف پیام
     (نقشِ رویداد) خبر می‌گیرند؛ وقتی دوباره حضوری شد، پیام‌های
     معلقِ همان روز لغو می‌شوند. (ارسال واقعی = مرحلهٔ سرور) */
  var notify = (mode === 'virtual')
    ? smQueueVirtualNotice(schoolId, dateISO)
    : {cancelled: smCancelVirtualNotice(schoolId, dateISO)};
  return {ok:true, rec:rec, notify:notify};
}

/** صف‌کردنِ خبرِ «روزِ غیرحضوری» برای همهٔ اولیای فعالِ مدرسه */
function smQueueVirtualNotice(schoolId, dateISO){
  schoolId = Number(schoolId);
  var s = byId('schools', schoolId);
  if(!s || typeof notifyRequest !== 'function') return {created:0, skipped:0};
  var studs = db.users.filter(function(x){
    return x.role==='student' && x.school_id===schoolId && (x.status||'active')==='active';
  });
  var created = 0, skipped = 0;
  studs.forEach(function(st){
    /* ref برای هر دانش‌آموز جدا — تکراری یعنی همین اولیای همین دانش‌آموز */
    var ref = 'schoolmode:' + schoolId + ':' + dateISO + ':' + st.id;
    var dup = (db.notify_queue||[]).some(function(q){
      return q.source_ref===ref && q.status!=='rejected' && q.status!=='cancelled';
    });
    if(dup){ skipped++; return; }
    var q = notifyRequest({
      school_id: schoolId,
      kind: 'event',
      student_id: st.id,
      student_name: st.full_name,
      body: 'اولیای گرامی، مدرسهٔ ' + s.name + ' در تاریخ '
        + ((typeof jalali==='function') ? jalali(dateISO) : dateISO)
        + ' غیرحضوری (مجازی) است؛ کلاس‌ها از طریق «کلاس مجازی» برگزار می‌شود.',
      source_ref: ref
    });
    if(q) created++; else skipped++;
  });
  return {created:created, skipped:skipped};
}

/** لغوِ پیام‌های معلقِ خبرِ غیرحضوریِ یک روز (وقتی روز حضوری شد) */
function smCancelVirtualNotice(schoolId, dateISO){
  var pre = 'schoolmode:' + schoolId + ':' + dateISO + ':';
  var n = 0;
  (db.notify_queue||[]).slice().forEach(function(q){
    if(q.source_ref && q.source_ref.indexOf(pre)===0 && q.status==='pending'){
      update('notify_queue', q.id, {status:'cancelled'});
      n++;
    }
  });
  return n;
}

/** بجِ حالتِ یک مدرسه در یک روز (برای فهرستِ اداره) */
function schoolModeBadge(schoolId, dateISO){
  var m = schoolModeOf(schoolId, dateISO);
  return m === 'virtual'
    ? '<span class="badge b-purple">🏠 غیرحضوری</span>'
    : '<span class="badge b-gray">🏫 حضوری</span>';
}

/** نوارِ حالتِ غیرحضوری برای نمای‌هایِ فضا (فقط کارکنانِ همان مدرسه) */
function virtualModeBanner(dateISO){
  var d = dateISO || todayISO();
  var u = S.user;
  if(!u) return '';
  if(u.role!=='manager' && u.role!=='teacher' && u.role!=='counselor' && u.role!=='driver') return '';
  if(!u.school_id) return '';
  if(!schoolVirtual(u.school_id, d)) return '';
  return '<div class="bell-bar bell-bar-warn" style="margin-bottom:12px">'
    + '🏠 این مدرسه در تاریخ ' + esc((typeof jalali==='function' ? jalali(d) : d))
    + ' در حالت <b>غیرحضوری (مجازی)</b> است — همهٔ کلاس، فضا و تجهیزات '
    + 'برای این روز به‌صورت خودکار مجازی‌اند؛ حضورِ کلاس‌ها از «کلاس مجازی» '
    + 'ثبت می‌شود. ثبتِ حضوری، امانت کتاب، ثبت مهمان و «استفاده» از تجهیز '
    + 'برای این روز مسدود است. (تغییر: مدیر مدرسه یا ادارهٔ آموزش و پرورش)</div>';
}

/** مودالِ انتخابِ حالت (اداره/مدیر) */
function smodeModal(schoolId){
  var s = byId('schools', schoolId);
  if(!s) return;
  window._smodeId = schoolId;
  var t = todayISO();
  var row = schoolModeRow(schoolId, t);
  var cur = row ? row.mode : 'in_person';
  openModal(modalTpl('حالت مدرسه — ' + s.name,
    f('تاریخ *', inp('sm_date', t, '', 'date'))
    + f('حالت', sel('sm_mode',
        [['in_person', SM_MODES.in_person], ['virtual', SM_MODES.virtual]],
        cur))
    + '<div class="small muted" style="margin-top:8px">وقتی یک روز غیرحضوری باشد، همهٔ کلاس/فضا/تجهیزاتِ این مدرسه برای همان روز به‌صورت خودکار مجازی می‌شوند. بدون ردیف = حضوری.</div>',
    'smode-save'));
}

/* ─────────────── دادهٔ نمونه ────────────── */
/** دمو: دومین مدرسهٔ فعال «امروز» غیرحضوری است (برای نمایشِ بج و
    نوار) — مدرسهٔ اول حضوری می‌ماند تا جریانِ عادیِ دمو دست‌نخورده بماند */
function generateSchoolModeDemo(){
  if(db.attendance_modes.length) return;
  var list = db.schools.filter(function(s){ return s.active; });
  if(list.length < 2) return;
  add('attendance_modes', {
    school_id: list[1].id, date: todayISO(), mode: 'virtual',
    set_by: 0, set_at: new Date().toISOString()
  });
}

/* ═══════════════════════════════════════════════════════════════════
   مدیریت مراجعین (E.9) — میز پذیرش: ورود/خروج

   ورود/خروجِ افرادِ غیردانش‌آموز و غیرکارکنان (مهمان، پیمانکار،
   کارشناس، والد…) در میزِ پذیرشِ مدرسه.

   داده: visitors {school_id, name, national_id?, phone?, purpose,
   visiting_person?, in_at, out_at?, status:'in'|'out', registered_by,
   created_at} — زمان‌ها ISO ذخیره، نمایش شمسی.
   «در حال حاضر در مدرسه» = status 'in' (رکوردهای کهنهٔ بدونِ status:
   از out_at مشتق می‌شود).

   دسترسی (E.9):
   - مدیر + نگهبان (نقشِ تفویضی — سوپرادمین کاربرِ role=guard می‌سازد):
     ثبت ورود/خروج + مشاهدهٔ همه
   - معاون (کاربرِ مدیرِ سطحی با عنوانِ معاون): فقط‌خوان
     (گاردِ عنوان در visitorWriteOk، روی داده)
   - سایر نقش‌ها: دسترسی ندارند (گاردِ نقش در viewVisitors؛ مسیر فقط
     در منوی مدیر)
   - مالکیتِ مدرسه روی داده تکرار می‌شود، نه فقط دکمه.

   امنیت: fail-closedِ سرور از write-perms (vis-save/vis-out) +
   whitelistِ فیلدها در model.json (national_id/phone/visiting_person/
   status تازه‌اند). روزِ غیرحضوری (بند ۱۶): ورودِ فیزیکی ممکن نیست.
   ═══════════════════════════════════════════════════════════════════ */

function visitorsOf(schoolId){
  return db.visitors
    .filter(function(v){ return v.school_id === schoolId; })
    .sort(function(a,b){ return (b.in_at||'').localeCompare(a.in_at||''); });
}
/* status: در رکوردهای تازه صریح است؛ در رکوردهای کهنه از out_at مشتق */
function visitorStatus(v){
  if(!v) return 'out';
  if(v.status === 'in' || v.status === 'out') return v.status;
  return v.out_at ? 'out' : 'in';
}

/* ─────────────── دسترسی (E.9) ─────────────── */

function visitorViewOk(u){
  var role=(typeof activePersona==='function')?activePersona():u.role;
  return role==='manager'||role==='guard'||role==='superadmin';
}
/* نوشتن: مدیر + نگهبان. معاون (عنوان) فقط‌خوان — میزِ پذیرشِ فیزیکی
   با مدیر/نگهبان است. (الگوی رایجِ کد: گاردِ مالکیت/نقش روی داده،
   نه فقط دکمه.) */
function visitorWriteOk(u){
  if(!visitorViewOk(u)) return {ok:false,msg:'شما به مدیریتِ مراجعین دسترسی ندارید'};
  if(u.role==='manager'&&/معاون/.test(u.title||''))
    return {ok:false,msg:'معاون فقط‌خوان است؛ ثبتِ ورود/خروج با مدیر یا نگهبان انجام می‌شود'};
  return {ok:true};
}

/* ─────────────── ثبت مراجع (مدیر/نگهبان) ─────────────── */

function visitorRegister(name, purpose, extra){
  var u = S.user;
  var wr = visitorWriteOk(u);
  if(!wr.ok) return {ok:false, msg:wr.msg};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  /* بند ۱۶: روزِ غیرحضوری، ورودِ فیزیکیِ مهمان نیست */
  if(typeof schoolVirtual==='function' && schoolVirtual(u.school_id, todayISO()))
    return {ok:false, msg:'امروز مدرسه غیرحضوری است؛ ثبت مهمان امکان ندارد (مسدود)'};
  name = String(name || '').trim();
  if(!name) return {ok:false, msg:'نام مهمان خالی است'};
  extra = extra || {};
  var rec = {
    school_id: u.school_id,
    name: name,
    purpose: String(purpose || '').trim(),
    national_id: String(extra.national_id || '').trim(),
    phone: String(extra.phone || '').trim(),
    visiting_person: String(extra.visiting_person || '').trim(),
    in_at: new Date().toISOString(),
    out_at: '',
    status: 'in',
    registered_by: u.id,
    created_at: new Date().toISOString()
  };
  return {ok:true, rec: insert('visitors', rec)};
}

/* ─────────────── خروج مراجع (مدیر/نگهبان) ─────────────── */

function visitorCheckout(visitorId){
  var u = S.user;
  var wr = visitorWriteOk(u);
  if(!wr.ok) return {ok:false, msg:wr.msg};
  var v = byId('visitors', visitorId);
  if(!v) return {ok:false, msg:'مهمان پیدا نشد'};
  if(v.school_id !== u.school_id)
    return {ok:false, msg:'این مهمان متعلق به مدرسهٔ شما نیست'};
  if(visitorStatus(v)==='out') return {ok:false, msg:'خروج این مهمان قبلاً ثبت شده است'};
  update('visitors', visitorId, {out_at: new Date().toISOString(), status:'out'});
  return {ok:true};
}

/* ─────────────── نمای مراجعین (مدیر/نگهبان/معاون) ─────────────── */

function viewVisitors(){
  var u = S.user;
  if(!visitorViewOk(u)) return viewForbidden();
  var list = visitorsOf(u.school_id);
  /* جستجو: نام (متن) یا تاریخِ ورود */
  var q = String((S.filters&&S.filters.visQ)||'').trim();
  var d = String((S.filters&&S.filters.visDate)||'').trim();
  var shown = list;
  if(q) shown = shown.filter(function(v){
    return v.name.indexOf(q)>-1 || (v.visiting_person||'').indexOf(q)>-1;
  });
  if(d) shown = shown.filter(function(v){
    return String(v.in_at||'').slice(0,10)===d;
  });
  var nowIn = list.filter(function(v){ return visitorStatus(v)==='in'; }).length;
  var writable = visitorWriteOk(u).ok;
  var h = '<div class="page-head"><h2>🚪 مهمان‌ها</h2></div>'
    + ((typeof virtualModeBanner==='function') ? virtualModeBanner() : '');
  h += '<div class="card"><div class="card-head"><div class="row" style="gap:8px;flex-wrap:wrap">'
    + '<span class="badge b-amber">در حال حاضر در مدرسه: ' + fa(nowIn) + '</span>'
    + '<span class="badge b-gray">کل ثبت‌شده: ' + fa(list.length) + '</span></div>'
    + (writable ? '<button class="btn" data-act="vis-new">➕ ثبت مهمان</button>' : '')
    + '</div><div class="card-body">';
  h += '<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">'
    + '<input class="input" data-f="visQ" placeholder="جستجو بر اساسِ نام یا فردِ ملاقات‌شونده…" value="' + escAttr((S.filters&&S.filters.visQ)||'') + '" style="max-width:280px">'
    + '<input class="input" id="vis_date" type="date" title="فیلتر بر اساسِ تاریخِ ورود" value="' + escAttr(d) + '" style="max-width:180px">'
    + ((q||d) ? '<button class="btn ghost sm" data-act="vis-clear">پاک کردن</button>' : '')
    + '</div>';
  if(!shown.length){
    h += empty('🔍','مهمانی با این معیارها نیست', list.length ? 'جستجو را تغییر دهید.' : 'اولین مهمان را با دکمهٔ بالا ثبت کنید.');
  } else {
    h += '<div class="table-wrap"><table><thead><tr><th>نام</th><th>هدف مراجعه</th><th>ورود</th><th>خروج</th><th>وضعیت</th>' + (writable?'<th></th>':'') + '</tr></thead><tbody>';
    h += shown.slice(0,100).map(function(v){
      var inNow = visitorStatus(v)==='in';
      var sub = [];
      if(v.visiting_person) sub.push('ملاقات از: ' + esc(v.visiting_person));
      if(v.phone) sub.push(esc(v.phone));
      return '<tr><td><b>' + esc(v.name) + '</b>' + (sub.length ? '<div class="small muted">' + sub.join(' · ') + '</div>' : '') + '</td>'
        + '<td class="muted small" style="white-space:normal;max-width:260px">' + (v.purpose ? esc(v.purpose) : '—') + '</td>'
        + '<td class="muted small">' + (typeof jalaliDateTime==='function' ? jalaliDateTime(v.in_at) : esc(v.in_at||'—')) + '</td>'
        + '<td class="muted small">' + (v.out_at ? (typeof jalaliDateTime==='function' ? jalaliDateTime(v.out_at) : esc(v.out_at)) : '—') + '</td>'
        + '<td><span class="badge ' + (inNow ? 'b-green' : 'b-gray') + '">' + (inNow ? '🟢 در مدرسه' : '🔵 رفته') + '</span></td>'
        + (writable ? '<td>' + (inNow ? '<button class="btn ghost sm" data-act="vis-out" data-id="' + v.id + '">خروج</button>' : '') + '</td>' : '')
        + '</tr>';
    }).join('');
    h += '</tbody></table></div>';
  }
  return h + '</div></div>';
}

/* ─────────────── کارتِ داشبورد (E.9) ─────────────── */

function visitorDashCard(){
  var u=S.user;
  if(!u||(u.role!=='manager'&&u.role!=='guard')||!u.school_id) return '';
  var list=visitorsOf(u.school_id);
  var today=todayISO();
  var inNow=list.filter(function(v){return visitorStatus(v)==='in';});
  var todayN=list.filter(function(v){return String(v.in_at||'').slice(0,10)===today;}).length;
  var names=inNow.slice(0,3).map(function(v){return esc(v.name);}).join('، ');
  return '<div class="row" style="background:var(--surface-2);padding:10px 14px;border-radius:12px;align-items:center;flex-wrap:wrap">'
    + '<b>🚪 مراجعین</b>'
    + '<span class="small muted">امروز: <b>' + fa(todayN) + '</b> مراجعه · در حال حاضر در مدرسه: <b>' + fa(inNow.length) + '</b>'
    + (names ? ' — ' + names + (inNow.length>3 ? ' و ' + fa(inNow.length-3) + ' نفرِ دیگر' : '') : '')
    + '</span>'
    + '<div class="spacer"></div>'
    + '<button class="btn ghost sm" data-act="go" data-r="visitors">مشاهدهٔ همه</button>'
    + '</div>';
}

/* ─────────────── دادهٔ نمونه (قطعی — بدونِ rng، فقط دمو) ─────────────── */

function generateVisitorsDemo(){
  if(db.visitors.length) return;
  var sc = db.schools.filter(function(s){ return s.active; })[0];
  if(!sc) return;
  var mgr = db.users.filter(function(x){ return x.role==='manager' && x.school_id===sc.id; })[0];
  var d0 = daysAgoISO(0), d1 = daysAgoISO(1);
  add('visitors', {
    school_id: sc.id, name: 'پیمانکار تأسیسات', purpose: 'بازدید سالانهٔ سیستم گرمایشی',
    national_id: '', phone: '', visiting_person: '',
    in_at: d1+'T09:00:00.000Z', out_at: d1+'T10:30:00.000Z', status: 'out',
    registered_by: mgr ? mgr.id : 0, created_at: d1+'T09:00:00.000Z'
  });
  add('visitors', {
    school_id: sc.id, name: 'کارشناس ادارهٔ آموزش و پرورش', purpose: 'بازدید از کلاس‌ها',
    national_id: '', phone: '', visiting_person: 'مدیر',
    in_at: d0+'T08:30:00.000Z', out_at: '', status: 'in',
    registered_by: mgr ? mgr.id : 0, created_at: d0+'T08:30:00.000Z'
  });
  add('visitors', {
    school_id: sc.id, name: 'والد دانش‌آموزِ دوازدهمی', purpose: 'تحویل مدارک',
    national_id: '', phone: '', visiting_person: 'معاون آموزشی',
    in_at: d0+'T09:15:00.000Z', out_at: d0+'T09:45:00.000Z', status: 'out',
    registered_by: mgr ? mgr.id : 0, created_at: d0+'T09:15:00.000Z'
  });
}

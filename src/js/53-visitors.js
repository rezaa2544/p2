/* ═══════════════════════════════════════════════════════════════════
   مدیریت مهمان‌ها (بند ۷) — نسخهٔ سبک

   ورود/خروجِ افرادِ غیردانش‌آموز و غیرکارکنان (مهمان، پیمانکار،
   بازدیدکننده…) در یک صفحهٔ ساده برای **مدیر** (مدیر مدرسه،
   همان کسی که در دنیای واقعی پشتِ میز پذیرش می‌نشیند).

   داده: visitors {school_id, name, purpose, in_at, out_at,
   registered_by, created_at} — زمان‌ها ISO ذخیره، نمایش شمسی.
   «در حال حاضر در مدرسه» = out_at خالی.

   امنیت: ساخت/خروج فقط مدیر + ردیف باید از مدرسهٔ خودِ مدیر باشد
   (روی داده، نه فقط دکمه).
   ═══════════════════════════════════════════════════════════════════ */

function visitorsOf(schoolId){
  return db.visitors
    .filter(function(v){ return v.school_id === schoolId; })
    .sort(function(a,b){ return (b.in_at||'').localeCompare(a.in_at||''); });
}
function visitorStatus(v){
  return v.out_at ? 'out' : 'in';
}

/* ─────────────── ثبت مهمان (مدیر) ─────────────── */

function visitorRegister(name, purpose){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند مهمان ثبت کند'};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  /* بند ۱۶: روزِ غیرحضوری، ورودِ فیزیکیِ مهمان نیست */
  if(typeof schoolVirtual==='function' && schoolVirtual(u.school_id, todayISO()))
    return {ok:false, msg:'امروز مدرسه غیرحضوری است؛ ثبت مهمان امکان ندارد (مسدود)'};
  name = String(name || '').trim();
  if(!name) return {ok:false, msg:'نام مهمان خالی است'};
  var rec = {
    school_id: u.school_id,
    name: name,
    purpose: String(purpose || '').trim(),
    in_at: new Date().toISOString(),
    out_at: '',
    registered_by: u.id,
    created_at: new Date().toISOString()
  };
  return {ok:true, rec: insert('visitors', rec)};
}

/* ─────────────── خروج مهمان (مدیر) ─────────────── */

function visitorCheckout(visitorId){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند خروج ثبت کند'};
  var v = byId('visitors', visitorId);
  if(!v) return {ok:false, msg:'مهمان پیدا نشد'};
  if(v.school_id !== u.school_id)
    return {ok:false, msg:'این مهمان متعلق به مدرسهٔ شما نیست'};
  if(v.out_at) return {ok:false, msg:'خروج این مهمان قبلاً ثبت شده است'};
  update('visitors', visitorId, {out_at: new Date().toISOString()});
  return {ok:true};
}

/* ─────────────── نمای مدیر ─────────────── */

function viewVisitors(){
  var u = S.user;
  var list = visitorsOf(u.school_id);
  var nowIn = list.filter(function(v){ return visitorStatus(v)==='in'; }).length;
  var h = '<div class="page-head"><h2>🚪 مهمان‌ها</h2></div>'
    + ((typeof virtualModeBanner==='function') ? virtualModeBanner() : '');
  h += '<div class="card"><div class="card-head"><div class="row" style="gap:8px;flex-wrap:wrap">'
    + '<span class="badge b-amber">در حال حاضر در مدرسه: ' + fa(nowIn) + '</span>'
    + '<span class="badge b-gray">کل ثبت‌شده: ' + fa(list.length) + '</span></div>'
    + '<button class="btn" data-act="vis-new">➕ ثبت مهمان</button></div><div class="card-body">';
  if(!list.length){
    h += empty('🚪','مهمانی ثبت نشده','اولین مهمان را با دکمهٔ بالا ثبت کنید.');
  } else {
    h += '<div class="table-wrap"><table><thead><tr><th>نام</th><th>هدف مراجعه</th><th>ورود</th><th>خروج</th><th>وضعیت</th><th></th></tr></thead><tbody>';
    h += list.slice(0,100).map(function(v){
      var inNow = visitorStatus(v)==='in';
      return '<tr><td><b>' + esc(v.name) + '</b></td>'
        + '<td class="muted small" style="white-space:normal;max-width:260px">' + (v.purpose ? esc(v.purpose) : '—') + '</td>'
        + '<td class="muted small">' + (typeof jalaliDateTime==='function' ? jalaliDateTime(v.in_at) : esc(v.in_at||'—')) + '</td>'
        + '<td class="muted small">' + (v.out_at ? (typeof jalaliDateTime==='function' ? jalaliDateTime(v.out_at) : esc(v.out_at)) : '—') + '</td>'
        + '<td><span class="badge ' + (inNow ? 'b-green' : 'b-gray') + '">' + (inNow ? '🟢 در مدرسه' : '🔵 رفته') + '</span></td>'
        + '<td>' + (inNow ? '<button class="btn ghost sm" data-act="vis-out" data-id="' + v.id + '">خروج</button>' : '') + '</td></tr>';
    }).join('');
    h += '</tbody></table></div>';
  }
  return h + '</div></div>';
}

/* ─────────────── دادهٔ نمونه (قطعی، فقط دمو) ─────────────── */

function generateVisitorsDemo(){
  if(db.visitors.length) return;
  var sc = db.schools.filter(function(s){ return s.active; })[0];
  if(!sc) return;
  var mgr = db.users.filter(function(x){ return x.role==='manager' && x.school_id===sc.id; })[0];
  var now = new Date();
  var t1 = new Date(now.getTime() - 2*3600*1000);
  var t2 = new Date(now.getTime() - 40*60*1000);
  add('visitors', {
    school_id: sc.id, name: 'پیمانکار تأسیسات', purpose: 'بازدید سالانهٔ سیستم گرمایشی',
    in_at: t1.toISOString(), out_at: new Date(t1.getTime()+90*60*1000).toISOString(),
    registered_by: mgr ? mgr.id : 0, created_at: t1.toISOString()
  });
  add('visitors', {
    school_id: sc.id, name: 'کارشناس ادارهٔ آموزش و پرورش', purpose: 'بازدید از کلاس‌ها',
    in_at: t2.toISOString(), out_at: '',
    registered_by: mgr ? mgr.id : 0, created_at: t2.toISOString()
  });
}

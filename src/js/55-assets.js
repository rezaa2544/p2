/* ═══════════════════════════════════════════════════════════════════
   املاک و موجودی (بند ۹) — نسخهٔ سبک

   فهرست تجهیزات مدرسه با وضعیت + مکان.
   هر تجهیز یک ردیف است؛ وضعیت با دکمه عوض می‌شود (درستِ ذخیره‌شده،
   چون برخلاف امانتِ کتاب، هیچ تاریخ‌محوری ندارد).

   داده:
     assets {school_id, name, category, status, location, note,
             total_count, usable_count, created_at}
     total_count = تعدادِ کل (پیش‌فرض ۱)؛ usable_count = قابل‌استفاده
     (۰ ≤ usable ≤ total)؛ ردیف‌های قدیمِ بی‌شمار = تک‌قلم (۱/۰-۱).

   وضعیت‌های مجاز (ENUM):
     available = در دسترس
     in_use    = در حال استفاده
     repair    = در تعمیرات

   امنیت: ثبت/حذف فقط **مدیر**؛ به‌روزرسانی (وضعیت/مکان/یادداشت/شمار)
   مدیر یا **تحویلدار** (دبیرِ همان مدرسه با پرچمِ users.asset_staff=1).
   ردیف باید از مدرسهٔ خودِ عامل + وضعیت خارج از ENUM رد می‌شود
   (روی داده، نه فقط دکمه). سرور همین را آینه می‌کند (sync.js).
   ═══════════════════════════════════════════════════════════════════ */

var ASSET_STATUSES = {
  available: 'در دسترس',
  in_use: 'در حال استفاده',
  repair: 'در تعمیرات'
};

function assetsOf(schoolId){
  return db.assets
    .filter(function(a){ return a.school_id === schoolId; })
    .sort(function(a,b){ return (a.name||'').localeCompare(b.name||'', 'fa'); });
}
function assetStatusBadge(key){
  return key==='available' ? 'b-green' : (key==='in_use' ? 'b-blue' : 'b-amber');
}

/* تحویلدار = دبیرِ دارای پرچمِ تفویضیِ مدیر (همان مدرسه) */
function assetStaffCan(u){
  if(!u) return false;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role === 'manager' || role === 'superadmin') return true;
  return role === 'teacher' && u.asset_staff === 1 && !!u.school_id;
}
/* شمارها با پیش‌فرضِ سازگار (ردیفِ قدیم = تک‌قلم) */
function assetTotal(a){
  var t = a ? Math.floor(Number(a.total_count)) : NaN;
  return (t >= 1) ? t : 1;
}
function assetUsable(a){
  if(!a) return 0;
  if(a.usable_count === undefined || a.usable_count === null || a.usable_count === '') return (a.status === 'available') ? assetTotal(a) : 0;
  var u = Math.floor(Number(a.usable_count));
  if(!(u >= 0)) return 0;
  return Math.min(u, assetTotal(a));
}

/* ─────────────── ثبت/ویرایش (مدیر) ─────────────── */

function assetAdd(name, category, location, status, note, extra){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند تجهیز ثبت کند'};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  name = String(name || '').trim();
  if(!name) return {ok:false, msg:'نام تجهیز خالی است'};
  if(!ASSET_STATUSES[status]) return {ok:false, msg:'وضعیت معتبر نیست'};
  extra = extra || {};
  var total = Math.floor(Number(extra.total_count));
  if(!(total >= 1)) total = 1;
  var usable = (extra.usable_count === undefined || extra.usable_count === null || extra.usable_count === '')
    ? (status === 'available' ? total : 0)
    : Math.floor(Number(extra.usable_count));
  if(!(usable >= 0) || usable > total) return {ok:false, msg:'شمارِ قابل‌استفاده باید بین ۰ و تعدادِ کل باشد'};
  var rec = {
    school_id: u.school_id,
    name: name,
    category: String(category || '').trim(),
    status: status,
    location: String(location || '').trim(),
    note: String(note || '').trim(),
    total_count: total,
    usable_count: usable,
    created_at: new Date().toISOString()
  };
  return {ok:true, rec: insert('assets', rec)};
}
/* ویرایشِ شناسنامه (مدیر) — وضعیت این‌جا نیست (راهِ خودش: assetSetStatus) */
function assetEdit(assetId, patch){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند تجهیز را ویرایش کند'};
  var a = byId('assets', assetId);
  if(!a) return {ok:false, msg:'تجهیز پیدا نشد'};
  if(a.school_id !== u.school_id) return {ok:false, msg:'این تجهیز متعلق به مدرسهٔ شما نیست'};
  patch = patch || {};
  var upd = {};
  ['name','category','location','note'].forEach(function(k){
    if(patch[k] !== undefined) upd[k] = String(patch[k] || '').trim();
  });
  if(upd.name !== undefined && !upd.name) return {ok:false, msg:'نام تجهیز خالی است'};
  var total = (patch.total_count === undefined) ? assetTotal(a) : Math.floor(Number(patch.total_count));
  var usable = (patch.usable_count === undefined) ? assetUsable(a) : Math.floor(Number(patch.usable_count));
  if(!(total >= 1)) return {ok:false, msg:'تعدادِ کل باید دست‌کم ۱ باشد'};
  if(!(usable >= 0) || usable > total) return {ok:false, msg:'شمارِ قابل‌استفاده باید بین ۰ و تعدادِ کل باشد'};
  upd.total_count = total;
  upd.usable_count = usable;
  update('assets', assetId, upd);
  return {ok:true};
}
/* تفویض/لغوِ تحویلداری به دبیرِ همان مدرسه (مدیر) */
function assetSetCustodian(userId, on){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند تحویلدار تعیین کند'};
  var t = byId('users', userId);
  if(!t || t.role !== 'teacher') return {ok:false, msg:'فقط دبیر می‌تواند تحویلدار شود'};
  if(t.school_id !== u.school_id) return {ok:false, msg:'این دبیر متعلق به مدرسهٔ شما نیست'};
  update('users', userId, {asset_staff: on ? 1 : 0});
  return {ok:true};
}
function assetSetStatus(assetId, status, location, counts){
  var u = S.user;
  if(!assetStaffCan(u)) return {ok:false, msg:'به‌روزرسانی فقط با مدیر یا تحویلدارِ دارای مجوز است'};
  /* بند ۱۶: «استفاده» یعنی تحویلِ فیزیکی — در روزِ غیرحضوری مسدود
     (چکِ روز قبل از چکِ مالکیت است: روزِ غیرحضوری اصلاً تجهیز
     فیزیکی تحویل نمی‌شود) */
  if(status==='in_use' && typeof schoolVirtual==='function' && schoolVirtual(u.school_id, todayISO()))
    return {ok:false, msg:'امروز مدرسه غیرحضوری است؛ «استفاده» از تجهیز ثبت نمی‌شود (مسدود)'};
  var a = byId('assets', assetId);
  if(!a) return {ok:false, msg:'تجهیز پیدا نشد'};
  if(a.school_id !== u.school_id) return {ok:false, msg:'این تجهیز متعلق به مدرسهٔ شما نیست'};
  if(!ASSET_STATUSES[status]) return {ok:false, msg:'وضعیت معتبر نیست'};
  var patch = {status: status};
  if(location !== undefined) patch.location = String(location || '').trim();
  if(counts){
    var total = (counts.total_count === undefined) ? assetTotal(a) : Math.floor(Number(counts.total_count));
    var usable = (counts.usable_count === undefined) ? assetUsable(a) : Math.floor(Number(counts.usable_count));
    if(!(total >= 1)) return {ok:false, msg:'تعدادِ کل باید دست‌کم ۱ باشد'};
    if(!(usable >= 0) || usable > total) return {ok:false, msg:'شمارِ قابل‌استفاده باید بین ۰ و تعدادِ کل باشد'};
    patch.total_count = total;
    patch.usable_count = usable;
  }
  update('assets', assetId, patch);
  return {ok:true};
}
function assetDel(assetId){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند تجهیز حذف کند'};
  var a = byId('assets', assetId);
  if(!a) return {ok:false, msg:'تجهیز پیدا نشد'};
  if(a.school_id !== u.school_id) return {ok:false, msg:'این تجهیز متعلق به مدرسهٔ شما نیست'};
  remove('assets', assetId);
  return {ok:true};
}

/* جستجوی تجهیز (فقط‌خواندنی): نام/دسته/مکان/یادداشت */
function assetSearch(q, schoolId){
  q = String(q || '').trim();
  var list = assetsOf(schoolId);
  if(!q) return list;
  return list.filter(function(a){
    var hay = ((a.name||'') + ' ' + (a.category||'') + ' ' + (a.location||'') + ' ' + (a.note||'')).toLowerCase();
    return hay.indexOf(q.toLowerCase()) > -1;
  });
}

/* ─────────────── نمای مدیر ─────────────── */

function viewAssets(){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  var isMgr = (role === 'manager' || role === 'superadmin');
  var q = (typeof window !== 'undefined' && window._asQ) || '';
  var list = assetSearch(q, u.school_id);
  var inUse = list.filter(function(a){ return a.status==='in_use'; });
  var repair = list.filter(function(a){ return a.status==='repair'; });
  var h = '<div class="page-head"><h2>🧰 املاک و موجودی</h2></div>'
    + ((typeof virtualModeBanner==='function') ? virtualModeBanner() : '');
  h += '<div class="card"><div class="card-head"><div class="row" style="gap:8px;flex-wrap:wrap">'
    + '<input id="as_q" class="inp" style="max-width:220px" placeholder="جستجوی تجهیز…" value="' + esc(q) + '">'
    + '<button class="btn ghost sm" data-act="as-search">🔍 جستجو</button>'
    + '<span class="badge b-gray">تجهیز: ' + fa(list.length) + '</span>'
    + '<span class="badge b-green">در دسترس: ' + fa(list.length - inUse.length - repair.length) + '</span>'
    + '<span class="badge b-blue">در حال استفاده: ' + fa(inUse.length) + '</span>'
    + (repair.length ? '<span class="badge b-amber">در تعمیرات: ' + fa(repair.length) + '</span>' : '')
    + '</div>' + (isMgr ? '<button class="btn" data-act="as-new">➕ تجهیز جدید</button>' : '')
    + '</div><div class="card-body">';
  if(!list.length){
    h += empty('🧰','تجهیزی ثبت نشده','اولین تجهیز را با دکمهٔ بالا ثبت کنید.');
  } else {
    h += '<div style="display:grid;gap:10px">' + list.map(function(a){
      var label = ASSET_STATUSES[a.status] || a.status || '؟';
      return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 14px">'
        + '<div class="row" style="flex-wrap:wrap;gap:8px">'
        + '<b>' + esc(a.name) + '</b>'
        + (a.category ? '<span class="badge b-gray">' + esc(a.category) + '</span>' : '')
        + (a.location ? '<span class="muted small">📍 ' + esc(a.location) + '</span>' : '')
        + '<span class="badge ' + assetStatusBadge(a.status) + '">' + esc(label) + '</span>'
        + '<span class="badge b-gray">قابل‌استفاده: ' + fa(assetUsable(a)) + ' از ' + fa(assetTotal(a)) + '</span>'
        + '<div class="spacer"></div>'
        + '<button class="btn ghost sm" data-act="as-status" data-id="' + a.id + '">🔄 وضعیت</button>'
        + (isMgr ? '<button class="btn ghost sm" data-act="as-del" data-id="' + a.id + '">حذف</button>' : '')
        + '</div>'
        + (a.note ? '<div class="muted small" style="margin-top:6px">' + esc(a.note) + '</div>' : '')
        + '</div>';
    }).join('') + '</div>';
  }
  /* تفویضِ تحویلداری (فقط مدیر) */
  if(isMgr){
    var staff = db.users.filter(function(x){ return x.role==='teacher' && x.school_id===u.school_id && x.active!==0; })
      .sort(function(a,b){ return (a.full_name||'').localeCompare(b.full_name||'', 'fa'); });
    h += '<div class="card" style="margin-top:12px"><div class="card-head"><b>🧰 تفویضِ تحویلداری</b></div><div class="card-body">';
    if(!staff.length){
      h += '<div class="muted small">دبیری در این مدرسه نیست.</div>';
    } else {
      h += '<div style="display:grid;gap:6px">' + staff.map(function(t){
        var on = t.asset_staff === 1;
        return '<div class="row" style="gap:8px"><span>' + esc(t.full_name||'؟') + '</span>'
          + (on ? '<span class="badge b-green">تحویلدار</span>' : '<span class="badge b-gray">بدونِ مجوز</span>')
          + '<div class="spacer"></div>'
          + '<button class="btn ghost sm" data-act="as-cust-toggle" data-id="' + t.id + '">'
          + (on ? 'لغوِ مجوز' : 'اعطای مجوز') + '</button></div>';
      }).join('') + '</div>';
    }
    h += '</div></div>';
  }
  return h + '</div></div>';
}

/* ─────────────── دادهٔ نمونه (قطعی، فقط دمو) ─────────────── */

function generateAssetsDemo(){
  if(db.assets.length) return;
  var sc = db.schools.filter(function(s){ return s.active; })[0];
  if(!sc) return;
  var now = new Date().toISOString();
  add('assets', {school_id: sc.id, name: 'رایانهٔ کلاس ۱۰', category: 'کامپیوتر', status: 'in_use', location: 'کارگاه کامپیوتر', note: '', total_count: 1, usable_count: 0, created_at: now});
  add('assets', {school_id: sc.id, name: 'پروژکتور', category: 'پروژکتور', status: 'available', location: 'کلاس ۱۰۲', note: 'با ریموت', total_count: 1, usable_count: 1, created_at: now});
  add('assets', {school_id: sc.id, name: 'پروژکتور قدیمی', category: 'پروژکتور', status: 'repair', location: 'اداری', note: 'لامپ سوخته — برای تعمیر فرستاده شده', total_count: 1, usable_count: 0, created_at: now});
  add('assets', {school_id: sc.id, name: 'توپ فوتبال', category: 'ورزشی', status: 'available', location: 'سالن ورزش', note: '', total_count: 12, usable_count: 10, created_at: now});
}

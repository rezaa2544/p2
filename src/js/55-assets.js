/* ═══════════════════════════════════════════════════════════════════
   املاک و موجودی (بند ۹) — نسخهٔ سبک

   فهرست تجهیزات مدرسه با وضعیت + مکان.
   هر تجهیز یک ردیف است؛ وضعیت با دکمه عوض می‌شود (درستِ ذخیره‌شده،
   چون برخلاف امانتِ کتاب، هیچ تاریخ‌محوری ندارد).

   داده:
     assets {school_id, name, category, status, location, note,
             created_at}

   وضعیت‌های مجاز (ENUM):
     available = در دسترس
     in_use    = در حال استفاده
     repair    = در تعمیرات

   امنیت: همهٔ تغییرات فقط **مدیر** + ردیف باید از مدرسهٔ خودِ مدیر
   (روی داده، نه فقط دکمه) + وضعیت خارج از ENUM رد می‌شود.
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

/* ─────────────── ثبت/ویرایش (مدیر) ─────────────── */

function assetAdd(name, category, location, status, note){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند تجهیز ثبت کند'};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  name = String(name || '').trim();
  if(!name) return {ok:false, msg:'نام تجهیز خالی است'};
  if(!ASSET_STATUSES[status]) return {ok:false, msg:'وضعیت معتبر نیست'};
  var rec = {
    school_id: u.school_id,
    name: name,
    category: String(category || '').trim(),
    status: status,
    location: String(location || '').trim(),
    note: String(note || '').trim(),
    created_at: new Date().toISOString()
  };
  return {ok:true, rec: add('assets', rec)};
}
function assetSetStatus(assetId, status, location){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند وضعیت تجهیز را عوض کند'};
  var a = byId('assets', assetId);
  if(!a) return {ok:false, msg:'تجهیز پیدا نشد'};
  if(a.school_id !== u.school_id) return {ok:false, msg:'این تجهیز متعلق به مدرسهٔ شما نیست'};
  if(!ASSET_STATUSES[status]) return {ok:false, msg:'وضعیت معتبر نیست'};
  var patch = {status: status};
  if(location !== undefined) patch.location = String(location || '').trim();
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

/* ─────────────── نمای مدیر ─────────────── */

function viewAssets(){
  var u = S.user;
  var list = assetsOf(u.school_id);
  var inUse = list.filter(function(a){ return a.status==='in_use'; });
  var repair = list.filter(function(a){ return a.status==='repair'; });
  var h = '<div class="page-head"><h2>🧰 املاک و موجودی</h2></div>'
    + ((typeof virtualModeBanner==='function') ? virtualModeBanner() : '');
  h += '<div class="card"><div class="card-head"><div class="row" style="gap:8px;flex-wrap:wrap">'
    + '<span class="badge b-gray">تجهیز: ' + fa(list.length) + '</span>'
    + '<span class="badge b-green">در دسترس: ' + fa(list.length - inUse.length - repair.length) + '</span>'
    + '<span class="badge b-blue">در حال استفاده: ' + fa(inUse.length) + '</span>'
    + (repair.length ? '<span class="badge b-amber">در تعمیرات: ' + fa(repair.length) + '</span>' : '')
    + '</div><button class="btn" data-act="as-new">➕ تجهیز جدید</button></div><div class="card-body">';
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
        + '<div class="spacer"></div>'
        + '<button class="btn ghost sm" data-act="as-status" data-id="' + a.id + '">🔄 وضعیت</button>'
        + '<button class="btn ghost sm" data-act="as-del" data-id="' + a.id + '">حذف</button>'
        + '</div>'
        + (a.note ? '<div class="muted small" style="margin-top:6px">' + esc(a.note) + '</div>' : '')
        + '</div>';
    }).join('') + '</div>';
  }
  return h + '</div></div>';
}

/* ─────────────── دادهٔ نمونه (قطعی، فقط دمو) ─────────────── */

function generateAssetsDemo(){
  if(db.assets.length) return;
  var sc = db.schools.filter(function(s){ return s.active; })[0];
  if(!sc) return;
  var now = new Date().toISOString();
  add('assets', {school_id: sc.id, name: 'رایانهٔ کلاس ۱۰', category: 'کامپیوتر', status: 'in_use', location: 'کارگاه کامپیوتر', note: '', created_at: now});
  add('assets', {school_id: sc.id, name: 'پروژکتور', category: 'پروژکتور', status: 'available', location: 'کلاس ۱۰۲', note: 'با ریموت', created_at: now});
  add('assets', {school_id: sc.id, name: 'پروژکتور قدیمی', category: 'پروژکتور', status: 'repair', location: 'اداری', note: 'لامپ سوخته — برای تعمیر فرستاده شده', created_at: now});
  add('assets', {school_id: sc.id, name: 'توپ فوتبال', category: 'ورزشی', status: 'available', location: 'سالن ورزش', note: '', created_at: now});
}

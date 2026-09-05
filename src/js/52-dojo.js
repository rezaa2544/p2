/* ═══════════════════════════════════════════════════════════════════
   گیمیفیکیشن سبک ابتدایی (بند ۵) — لایهٔ امتیازِ ClassDojo-وار

   روی همین «یادداشت‌های فعلی دبیر» (جدول discipline که از پیش
   ستون points دارد) یک لایهٔ سبک می‌نشیند:
     • مدل امتیازِ پیکربندی‌شده توسط **مدرسه** (dojo_types):
       هر نوع = نام + آیکون + مقدار (مثلاً 🌟 احترام +۱، ⚠️ نظم -۱).
     • فقط مقطع **ابتدایی** (سطح مدرسه) — برای مقاطع دیگر هیچ UI
       تازه‌ای نمی‌آید و ستون امتیازِ فعلی انضباط دست‌نخورده می‌ماند.
     • ثبت امتیاز = همان ثبت مورد انضباطی؛ چیپ‌های مدل فقط فرم را
       پر می‌کنند (عنوان/نوع/امتیاز) — مسیر دادهٔ تازه‌ای نیست.
     • نمایش: بج «⭐ مجموع امتیاز» در نمای انضباطی دانش‌آموز و
       تب انضباطی پرونده (دانش‌آموز و ولی) — برای مدرسه‌های ابتدایی
       که مدل تعریف کرده‌اند.

   امنیت: مدل فقط مدیرِ مدرسه را می‌پذیرد (dojo-save روی داده
   school_id را به مدرسهٔ خودِ مدیر می‌خوابد). چیپ‌ها فقط فرم
   پر می‌کنند؛ ذخیره از مسیرِ مجاز disc-save می‌گذرد.
   ═══════════════════════════════════════════════════════════════════ */

var DOJO_LEVEL = 'ابتدایی';

function schoolIsElementary(schId){
  var s = byId('schools', schId);
  return !!s && s.level === DOJO_LEVEL;
}
function dojoSchoolOfStudent(sid){
  var c = classOf(sid);
  return (c && c.school_id) ? byId('schools', c.school_id) : null;
}
/** انواع مدل امتیازِ یک مدرسه (مرتب‌شده) */
function dojoTypes(schId){
  return db.dojo_types
    .filter(function(t){ return t.school_id === schId; })
    .sort(function(a,b){ return (a.order||0)-(b.order||0); });
}
/** آیا گیمیفیکیشن برای این دانش‌آموز فعال است (مقطع + مدل تعریف‌شده)؟ */
function dojoAvailableForStudent(sid){
  var s = dojoSchoolOfStudent(sid);
  return !!(s && schoolIsElementary(s.id) && dojoTypes(s.id).length > 0);
}
/** مجموع خالص امتیازهای یک دانش‌آموز (همین جدول discipline) */
function dojoTotal(sid){
  return db.discipline
    .filter(function(d){ return d.student_id === sid; })
    .reduce(function(a,d){ return a + (Number(d.points)||0); }, 0);
}
/** بج «⭐ مجموع امتیاز» — فقط وقتی فعال است، وگرنه خالی */
function dojoBadge(sid){
  if(!dojoAvailableForStudent(sid)) return '';
  var t = dojoTotal(sid);
  var cls = t > 0 ? 'b-green' : (t < 0 ? 'b-red' : 'b-gray');
  return '<span class="badge ' + cls + '" title="مجموع امتیازها از روی موارد انضباطی">⭐ مجموع امتیاز: ' + fa(t) + '</span>';
}
/** چیپ‌های مدل برای فرمِ ثبت مورد انضباطی (دبیر) */
function dojoChipsHtml(schId){
  var types = dojoTypes(schId);
  if(!types.length) return '';
  return '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px">'
    + '<span class="small muted">نوع امتیاز (اختیاری):</span>'
    + types.map(function(t,i){
        return '<button type="button" class="btn ghost sm" data-act="dojo-pick" data-i="' + i + '" '
          + 'title="' + escAttr(t.label) + '">' + esc(t.icon) + ' ' + esc(t.label)
          + ' (' + fa(t.delta) + ')</button>';
      }).join('')
    + '</div>';
}

/* ─────────────── مودال پیکربندی (مدیر) ─────────────── */

var DOJO_MAX_DELTA = 5;
function dojoDefaultTypes(){
  return [
    {label:'احترام', icon:'🌟', delta:1},
    {label:'همکاری', icon:'🤝', delta:1},
    {label:'تلاش',  icon:'💪', delta:1},
    {label:'نظم',   icon:'⚠️', delta:-1}
  ];
}
function dojoConfigModal(){
  var u = S.user;
  var sch = byId('schools', u.school_id);
  if(!sch) return;
  var rows = dojoTypes(sch.id);
  var deltaOpts = [];
  for(var v=-DOJO_MAX_DELTA; v<=DOJO_MAX_DELTA; v++){
    if(v!==0) deltaOpts.push([v, (v>0?'+':'') + v]);
  }
  function rowHtml(t, i){
    return '<div class="row" style="gap:8px;margin-bottom:8px" data-drow>'
      + (t.id ? '<input type="hidden" class="d_did" value="' + t.id + '">' : '')
      + '<input class="input d_icon" style="width:56px;text-align:center" maxlength="4" value="' + escAttr(t.icon||'') + '" />'
      + '<input class="input d_label" style="flex:1" value="' + escAttr(t.label||'') + '" />'
      + '<select class="select d_delta" style="width:90px">'
      + deltaOpts.map(function(o){ return '<option value="' + o[0] + '"' + (Number(t.delta)===o[0]?' selected':'') + '>' + o[1] + '</option>'; }).join('')
      + '</select>'
      + '<button class="icon-btn danger" data-act="dojo-row-del" title="حذف این ردیف">🗑️</button>'
      + '</div>';
  }
  var body =
    '<div class="small muted" style="margin-bottom:10px">این مدل فقط برای مقطعِ ابتدایی ظاهر می‌شود (چیپ‌ها در فرم ثبت انضباط + بجِ مجموع برای دانش‌آموز/ولی). نام و آیکون و مقدار هر نوع را مطابق فرهنگِ مدرسهٔ خود تنظیم کنید.'
    + (schoolIsElementary(sch.id) ? '' : ' <b>مقطعِ این مدرسه «' + esc(sch.level||'—') + '» است — تا وقتی مقطع ابتدایی باشد، هیچ UIِ امتیازی نمایش داده نمی‌شود.</b>')
    + '</div>'
    + (rows.length ? rows.map(rowHtml).join('') : '<div class="small muted" style="margin-bottom:10px">هنوز نوعی تعریف نشده است.</div>')
    + '<button class="btn ghost sm" data-act="dojo-row-add">➕ نوع جدید</button>'
    + (!rows.length && schoolIsElementary(sch.id) ? ' <button class="btn sm" data-act="dojo-apply-defaults"> بارگذاری پیش‌فرض (۴ نوع)</button>' : '');
  openModal(modalTpl('⭐ مدل امتیازها — ' + sch.name, body, 'dojo-save'));
}
function dojoApplyDefaults(){
  var host = document.querySelector('#modal');
  if(!host) return;
  if(host.querySelectorAll('[data-drow]').length){
    if(typeof toast==='function') toast('اول ردیف‌های فعلی را پاک کنید','err');
    return;
  }
  dojoDefaultTypes().forEach(function(d){ dojoAddRow(d.icon, d.label, d.delta); });
}
function dojoAddRow(icon, label, delta){
  var host = document.querySelector('#modal');
  if(!host) return;
  var btn = host.querySelector('[data-act="dojo-row-add"]');
  var row = document.createElement('div');
  row.setAttribute('data-drow','');
  row.className = 'row';
  row.style.cssText = 'gap:8px;margin-bottom:8px';
  row.innerHTML =
    '<input class="input d_icon" style="width:56px;text-align:center" maxlength="4" value="' + escAttr(icon||'') + '" />'
    + '<input class="input d_label" style="flex:1" value="' + escAttr(label||'') + '" />'
    + '<select class="select d_delta" style="width:90px">'
    + (function(){var o=[];for(var v=-DOJO_MAX_DELTA;v<=DOJO_MAX_DELTA;v++){if(v!==0)o.push('<option value="'+v+'"'+(Number(delta)===v?' selected':'')+'>'+(v>0?'+':'')+v+'</option>');}return o.join('');})()
    + '</select>'
    + '<button class="icon-btn danger" data-act="dojo-row-del" title="حذف این ردیف">🗑️</button>';
  btn.parentNode.insertBefore(row, btn);
}
function dojoRemoveRow(el){
  var row = el.closest('[data-drow]');
  if(row && row.parentElement) row.parentElement.removeChild(row);
}
function dojoCollectRows(){
  var host = document.querySelector('#modal');
  if(!host) return null;
  var rows = host.querySelectorAll('[data-drow]');
  if(!rows.length) return [];
  var out = [];
  rows.forEach(function(r){
    var didEl = r.querySelector('.d_did');
    out.push({
      id: didEl ? Number(didEl.value) || 0 : 0,
      icon: (r.querySelector('.d_icon')||{}).value || '',
      label: (r.querySelector('.d_label')||{}).value || '',
      delta: Number((r.querySelector('.d_delta')||{}).value) || 0
    });
  });
  return out;
}
/** ذخیرهٔ مدل — فقط مدیر؛ school_id روی داده به مدرسهٔ خودِ مدیر می‌خوابد */
function dojoSaveModel(){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager' && role !== 'superadmin') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند مدل را ویرایش کند'};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  var rows = dojoCollectRows();
  if(rows === null) return {ok:false, msg:'فرم پیدا نشد'};
  var valid = [];
  for(var i=0;i<rows.length;i++){
    var r = rows[i];
    if(!r.label.trim() && !r.icon.trim()) continue; /* ردیف خالی */
    if(!r.label.trim()) return {ok:false, msg:'نام نوعِ امتیاز خالی است (ردیف ' + (i+1) + ')'};
    if(!r.icon.trim()) r.icon = '⭐';
    if(!r.delta || r.delta===0) return {ok:false, msg:'مقدار نوع «' + r.label + '» نمی‌تواند صفر باشد'};
    if(Math.abs(r.delta) > DOJO_MAX_DELTA) return {ok:false, msg:'مقدار «' + r.label + '» از حد مجاز (' + DOJO_MAX_DELTA + ') بیشتر است'};
    valid.push({id:r.id, label:r.label.trim(), icon:r.icon.trim(), delta:Number(r.delta)});
  }
  var existing = dojoTypes(u.school_id);
  var kept = {};
  valid.forEach(function(t, idx){
    if(t.id){
      kept[t.id] = 1;
      update('dojo_types', t.id, {label:t.label, icon:t.icon, delta:t.delta, order:idx});
    } else {
      add('dojo_types', {school_id:u.school_id, label:t.label, icon:t.icon, delta:t.delta, order:idx});
    }
  });
  existing.forEach(function(t){
    if(!kept[t.id]) remove('dojo_types', t.id);
  });
  return {ok:true};
}

/* ─────────────── دادهٔ نمونه ───────────────
   در دادهٔ نمونه هیچ مدرسهٔ ابتدایی وجود ندارد (مقاطع دمو:
   متوسطه اول/دوم) — پس seed نمی‌شود؛ اولین مدرسهٔ ابتداییِ واقعی
   مدل خودش را با مدیر تعریف می‌کند. (سئوت‌ها فیکسور می‌سازند.) */

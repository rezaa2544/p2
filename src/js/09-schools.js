/* ═══════════════════════════════════════════════════════════════════
   مدیریت مدارس
   ساخت، ویرایش، فعال‌سازی و «ورود به مدرسه» توسط سوپرادمین.
   ═══════════════════════════════════════════════════════════════════ */

/* ─────────── پروفایل قابلیت مدرسه (دور ۶۳، بند ۰.۱) ───────────
   نوع مدرسه دیگر زنجیرهٔ شرط «اگر دولتی… اگر غیردولتی…» نیست؛
   هر مدرسه یک پروفایل کلید-قابلیت دارد که هر کلید مستقل
   روشن/خاموش می‌شود. رابط کاربری بر اساس همین کلیدها
   ماژول‌های غیرمرتبط را مخفی می‌کند (navFor در 07-shell.js).
   کلیدهایی که هنوز ماژولشان ساخته نشده (has_dorm و…) ساختاری
   هستند: قفل‌شده در ARCHITECTURE_DECISIONS.md منتظر پیاده‌سازی
   کامل — ماژول آتی باید همین کلید را بخواند، نه شرط جدید بسازد. */
const CAP_DEFS=[
  ['has_tuition','شهریه','مدرسه شهریه می‌گیرد — ماژول مالی و شهریه فعال است'],
  ['has_dorm','اسکان و خانه‌دانش‌آموزی','مدرسه بخش اسکان دارد'],
  ['has_iep','پشتیبانی ویژه (IEP)','طرح فردی یادگیری برای دانش‌آموزان نیازمند ویژه'],
  ['has_workshop','کارگاه و آزمایشگاه','فضای عملی/فنی برای پروژه‌های کارگاهی'],
  ['has_multigrade','کلاس‌های چندپایه','چند پایه در یک کلاس (روستایی/کوچک)'],
  ['has_second_term_exam','امتحان نوبت دوم','مدرسه امتحان نوبت دوم می‌گذارد'],
  ['has_evening','نوبت دوم / کلاس شبانه','برنامهٔ فشردهٔ بزرگسالان — کلاس‌های شبانه با تراکمِ هفتگیِ بالاتر']
];
const CAP_DEFAULTS={has_tuition:1,has_dorm:0,has_iep:0,has_workshop:0,has_multigrade:0,has_second_term_exam:1,has_evening:0};
/** پروفایل قابلیت یک مدرسه با اعمال پیش‌فرض‌ها */
function schoolCaps(sid){
  const s=(typeof byId==='function')?byId('schools',sid):null;
  const c=(s&&s.capabilities)?s.capabilities:{};
  const out={};
  CAP_DEFS.forEach(function(k){ out[k[0]]=c[k[0]]==null?CAP_DEFAULTS[k[0]]:Number(c[k[0]]); });
  return out;
}
/** آیا مدرسه صاحب این قابلیت است؟ */
function hasCap(sid,key){ return !!schoolCaps(sid)[key]; }
/** چیکنک‌های پروفایل قابلیت برای فرم مدرسه */
function capPickerHTML(s){
  const caps=schoolCaps(s&&s.id);
  return CAP_DEFS.map(function(k){
    return `<label style="display:flex;gap:8px;align-items:center;padding:7px 10px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;cursor:pointer"><input type="checkbox" class="m-cap" value="${k[0]}" ${caps[k[0]]?'checked':''} /><span><b class="small">${k[1]}</b><div class="small muted" style="font-size:11px">${k[2]}</div></span></label>`;
  }).join('');
}

function viewSchools(){
  const q=(S.filters.q||'').trim();
  const isAdmin=S.user.role==='superadmin';
  const fp=S.filters.sp||'', fc=S.filters.sc||'', fd=S.filters.sd||'', fl=S.filters.slevel||'', fg=S.filters.sgender||'', fa_=S.filters.sactive||'', fbr=S.filters.sbranch||'';
  let rows=isAdmin?db.schools.slice():db.schools.filter(s=>s.id===S.user.school_id);
  if(q)rows=rows.filter(s=>(s.name+s.code+(s.city||'')).includes(q));
  if(fp)rows=rows.filter(s=>String(s.province_id)===String(fp));
  if(fc)rows=rows.filter(s=>String(s.county_id)===String(fc));
  if(fd)rows=rows.filter(s=>String(s.district_id)===String(fd));
  if(fl)rows=rows.filter(s=>s.level===fl);
  if(fg)rows=rows.filter(s=>s.gender===fg);
  if(fa_)rows=rows.filter(s=>String(s.active?1:0)===fa_);
  if(fbr)rows=rows.filter(s=>(s.branches||[]).indexOf(fbr)>=0);
  const counties=db.counties.filter(c=>!fp||String(c.province_id)===String(fp));
  const districts=db.districts.filter(d=>fc?String(d.county_id)===String(fc):(!fp||String(d.province_id)===String(fp)));
  const opt=(list,val,label)=>[`<option value="">${label}</option>`,...list.map(o=>`<option value="${escAttr(o[0])}" ${String(val)===String(o[0])?'selected':''}>${esc(o[1])}</option>`)].join('');
  return `<div class="card"><div class="card-head">
    <h3>فهرست مدارس <span class="badge b-gray">${fa(rows.length)}</span></h3>
    <div class="row"><input class="input" style="width:180px" placeholder="جستجوی نام یا کد…" data-f="q" value="${esc(q)}" />
    ${isAdmin?`<button class="btn ghost" data-act="export-csv" data-r="schools">⬇️ خروجی</button>
    <button class="btn" data-act="school-new">➕ تعریف مدرسه جدید</button>`:''}</div></div>
   ${isAdmin?filterPanel('schools',`
       <select class="select" style="width:150px" data-f="sp">${opt(db.provinces.map(p=>[p.id,p.name]),fp,'همه استان‌ها')}</select>
       <select class="select" style="width:150px" data-f="sc">${opt(counties.map(c=>[c.id,c.name]),fc,'همه شهرستان‌ها')}</select>
       <select class="select" style="width:170px" data-f="sd">${opt(districts.map(d=>[d.id,d.name]),fd,'همه مناطق')}</select>
       <select class="select" style="width:140px" data-f="slevel">${opt([['ابتدایی','ابتدایی'],['متوسطه اول','متوسطه اول'],['متوسطه دوم','متوسطه دوم']],fl,'همه مقاطع')}</select>
       <select class="select" style="width:130px" data-f="sgender">${opt([['پسرانه','پسرانه'],['دخترانه','دخترانه']],fg,'همه جنسیت‌ها')}</select>
       <select class="select" style="width:130px" data-f="sactive">${opt([['1','فعال'],['0','غیرفعال']],fa_,'همه وضعیت‌ها')}</select>
       <select class="select" style="width:150px" data-f="sbranch">${opt(Object.keys(BRANCHES).map(b=>[b,b]),fbr,'همه شاخه‌ها')}</select>`):''}
   ${rows.length?`<div class="table-wrap"><table><thead><tr><th>نام مدرسه</th><th>کد</th><th>مکان</th><th>مقطع</th><th>مدیر</th><th>تلفن ثابت</th><th>دانش‌آموز</th><th>دبیر</th><th>کلاس</th><th>آخرین فعالیت</th><th>وضعیت</th>${isAdmin?'<th></th>':''}</tr></thead><tbody>
    ${(()=>{const _ov=schoolsOverview();const _by={};_ov.forEach(function(r){_by[r.school.id]=r.st;});return rows.map(s=>{const st_=_by[s.id]||{};const us=db.users.filter(u=>u.school_id===s.id);const mg=us.find(u=>u.role==='manager');
     return `<tr><td><b>${esc(s.name)}</b><div class="small muted">${esc(s.gender||'')}${s.shift&&s.shift!=='صبح'?' · '+esc(s.shift):''}</div></td><td class="muted">${esc(s.code)}</td>
      <td>${esc((byId('provinces',s.province_id)||{}).name||s.city||'—')}<div class="small muted">${esc((byId('counties',s.county_id)||{}).name||'')}${s.district_id?' › '+esc((byId('districts',s.district_id)||{}).name||''):''}</div></td>
      <td><span class="badge b-blue">${esc(s.level||'—')}</span>${s.type&&s.type!=='عادی'?`<div class="small muted" style="margin-top:4px">${esc(s.type)}</div>`:''}${(s.branches||[]).length?`<div class="small muted" style="margin-top:4px">${(s.branches||[]).map(b=>esc(b)).join('، ')}</div>`:''}</td><td class="muted">${esc(mg?mg.full_name:'—')}</td>
      <td class="small muted">${esc(s.landline||'—')}</td>
      <td>${fa(us.filter(u=>u.role==='student').length)}</td><td>${fa(us.filter(u=>u.role==='teacher').length)}</td><td>${fa(db.classes.filter(c=>c.school_id===s.id).length)}</td>
      <td><span class="badge ${s.active?'b-green':'b-gray'}${isAdmin?' tgl':''}" ${isAdmin?`data-act="school-toggle" data-id="${escAttr(s.id)}" title="برای تغییر وضعیت کلیک کنید"`:''}>${s.active?'فعال':'غیرفعال'}</span></td>
      ${isAdmin?`<td><div class="row" style="gap:5px;flex-wrap:nowrap">
        <button class="btn sm" data-act="school-enter" data-id="${escAttr(s.id)}" title="ورود به پنل این مدرسه به‌عنوان مدیر">🔑 ورود به پنل</button>
        <button class="icon-btn" title="ویرایش" data-act="school-edit" data-id="${escAttr(s.id)}">✏️</button>
        <button class="icon-btn danger" title="حذف" data-act="school-del" data-id="${escAttr(s.id)}">🗑️</button></div></td>`:''}</tr>`;}).join('');})()}
    </tbody></table></div>`:empty('🏫','مدرسه‌ای یافت نشد',q?'نتیجه‌ای برای جستجو نبود.':'اولین مدرسه را تعریف کنید.',isAdmin?'<button class="btn" data-act="school-new">تعریف مدرسه</button>':'')}
   </div>`;
}

/* ============================ فاز ۹ — اداره آموزش و پرورش (تقسیمات کشوری، ادارات، پنل اداره) ============================ */

const P9 = { colls: ['provinces','counties','districts','offices'] };
const OFFICE_LEVEL = { province:'اداره کل استان', county:'اداره شهرستان', district:'اداره منطقه' };
const AREA_KIND = { district:'منطقه', village:'روستا' };

/* ---------------- داده نمونه ---------------- */
const GEO_DEFS = [
  ['کردستان', [
    ['سنندج', ['ناحیه ۱ سنندج','ناحیه ۲ سنندج','حومه سنندج']],
    ['بانه', ['بانه مرکزی','آرمرده']],
    ['سقز', ['سقز مرکزی','زیویه']],
  ]],
  ['تهران', [
    ['تهران', ['منطقه ۲','منطقه ۵','منطقه ۱۲']],
    ['شهریار', ['شهریار مرکزی','وحیدیه']],
  ]],
  ['خراسان رضوی', [
    ['مشهد', ['ناحیه ۱ مشهد','ناحیه ۴ مشهد','تبادکان']],
    ['نیشابور', ['نیشابور مرکزی','زبرخان']],
  ]],
];

function generateP9(){
  P9.colls.forEach(c=>{ db[c]=db[c]||[]; });

  GEO_DEFS.forEach(([pName,counties])=>{
    const p=add('provinces',{name:pName,code:'P'+(db.provinces.length+1)});
    counties.forEach(([cName,districts])=>{
      const c=add('counties',{province_id:p.id,name:cName,code:'C'+(db.counties.length+1)});
      districts.forEach(dName=>add('districts',{province_id:p.id,county_id:c.id,name:dName,
        kind:dName.includes('حومه')||dName.includes('آرمرده')||dName.includes('زیویه')?'village':'district'}));
    });
  });

  // اتصال مدارس موجود به تقسیمات کشوری
  db.schools.forEach((s,i)=>{
    const d=db.districts[(i*5)%db.districts.length];   // پخش مدارس بین استان‌های مختلف
    s.province_id=d.province_id; s.county_id=d.county_id; s.district_id=d.id;
    s.area_kind=d.kind||'district';
    if(!s.landline)s.landline='0'+(21+ri(66))+'-'+(33000000+ri(9999999));
    s.city=(byId('counties',d.county_id)||{}).name||s.city;
  });

  // ادارات + حساب کارشناس
  const mk=(name,level,scope,username)=>{
    const o=add('offices',Object.assign({name,level,active:1},scope));
    const u=add('users',{school_id:null,office_id:o.id,role:'edu_office',full_name:'کارشناس '+name,
      username,password:'123456',national_id:makeNid(),phone:'0918'+(1000000+ri(8999999)),active:1,created_at:daysAgoISO(320)});
    o.user_id=u.id;
    return o;
  };
  const kurd=db.provinces[0], baneh=db.counties.find(c=>c.name==='بانه'), sanandaj=db.counties.find(c=>c.name==='سنندج');
  mk('اداره کل آموزش و پرورش استان کردستان','province',{province_id:kurd.id},'edu_kurdistan');
  mk('اداره آموزش و پرورش شهرستان بانه','county',{province_id:kurd.id,county_id:baneh.id},'edu_baneh');
  mk('اداره آموزش و پرورش ناحیه ۱ سنندج','district',{province_id:kurd.id,county_id:sanandaj.id,
    district_id:(db.districts.find(d=>d.name==='ناحیه ۱ سنندج')||{}).id},'edu_sanandaj1');
  const tehran=db.provinces[1];
  mk('اداره کل آموزش و پرورش استان تهران','province',{province_id:tehran.id},'edu_tehran');
}

/* ---------------- دامنه دید اداره ---------------- */
function officeOf(u){ return u.office_id?byId('offices',u.office_id):null; }
function officeScopeSchools(o,filters){
  filters=filters||{};
  let list=db.schools.slice();
  const pid=Number(filters.province||(o?o.province_id:0))||0;
  const cid=Number(filters.county||(o?o.county_id:0))||0;
  const did=Number(filters.district||(o?o.district_id:0))||0;
  if(pid)list=list.filter(s=>s.province_id===pid);
  if(cid)list=list.filter(s=>s.county_id===cid);
  if(did)list=list.filter(s=>s.district_id===did);
  return list;
}
function officeStats(schools){
  const ids=new Set(schools.map(s=>s.id));
  const users=db.users.filter(u=>ids.has(u.school_id));
  const students=users.filter(u=>u.role==='student');
  const teachers=users.filter(u=>u.role==='teacher');
  const classes=db.classes.filter(c=>ids.has(c.school_id));
  const att=db.attendance.filter(a=>ids.has(a.school_id));
  const present=att.filter(a=>a.status==='present').length;
  const grades=db.grades.filter(g=>ids.has(g.school_id));
  const disc=db.discipline.filter(d=>ids.has(d.school_id));
  const capacity=schools.reduce((a,b)=>a+(b.capacity||0),0);
  return {
    schools:schools.length, active:schools.filter(s=>s.active).length,
    students:students.length, teachers:teachers.length, classes:classes.length,
    capacity, fill:capacity?Math.round(students.length/capacity*1000)/10:0,
    ratio:teachers.length?Math.round(students.length/teachers.length*10)/10:0,
    attendance:att.length?Math.round(present/att.length*1000)/10:0,
    avg:grades.length?Math.round(grades.reduce((a,b)=>a+b.score,0)/grades.length*100)/100:0,
    discipline:{pos:disc.filter(d=>d.kind==='positive').length,neg:disc.filter(d=>d.kind!=='positive').length},
    village:schools.filter(s=>s.area_kind==='village').length,
    girls:schools.filter(s=>s.gender==='دخترانه').length,
    boys:schools.filter(s=>s.gender==='پسرانه').length,
  };
}
function perSchoolRows(schools){
  return schools.map(s=>{
    const st=db.users.filter(u=>u.school_id===s.id&&u.role==='student').length;
    const te=db.users.filter(u=>u.school_id===s.id&&u.role==='teacher').length;
    const g=db.grades.filter(x=>x.school_id===s.id);
    const a=db.attendance.filter(x=>x.school_id===s.id);
    return {s, students:st, teachers:te,
      avg:g.length?Math.round(g.reduce((x,y)=>x+y.score,0)/g.length*100)/100:0,
      att:a.length?Math.round(a.filter(x=>x.status==='present').length/a.length*1000)/10:0,
      fill:s.capacity?Math.round(st/s.capacity*1000)/10:0};
  }).sort((a,b)=>b.avg-a.avg);
}

/* ---------------- صفحه: تقسیمات کشوری (سوپرادمین) ---------------- */
function viewGeo(){
  const pid=Number(S.filters.gp||0), cid=Number(S.filters.gc||0);
  const counties=pid?db.counties.filter(c=>c.province_id===pid):db.counties;
  const districts=cid?db.districts.filter(d=>d.county_id===cid):(pid?db.districts.filter(d=>d.province_id===pid):db.districts);
  const cnt=(o,f)=>db.schools.filter(s=>s[f]===o.id).length;
  return `<div class="grid g3" style="margin-bottom:14px">
    ${statCard('🗺️',fa(db.provinces.length),'استان','blue')}
    ${statCard('🏙️',fa(db.counties.length),'شهرستان','green')}
    ${statCard('📍',fa(db.districts.length),'منطقه / ناحیه','purple')}</div>
  <div class="grid g3">
    <div class="card"><div class="card-head"><h3>استان‌ها</h3><button class="btn sm" data-act="geo-new" data-t="province">➕</button></div>
      ${db.provinces.length?db.provinces.map(p=>`<div class="row" style="padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;background:${pid===p.id?'var(--primary-soft)':'#fff'}" data-act="geo-pick" data-t="province" data-id="${p.id}">
        <b>${esc(p.name)}</b><div class="spacer"></div><span class="small muted">${fa(cnt(p,'province_id'))} مدرسه</span>
        <button class="icon-btn" title="ویرایش" data-act="geo-edit" data-t="provinces" data-id="${p.id}">✏️</button>
        <button class="icon-btn danger" title="حذف" data-act="geo-del" data-t="provinces" data-id="${p.id}">🗑️</button></div>`).join(''):empty('🗺️','استانی ثبت نشده','')}
    </div>
    <div class="card"><div class="card-head"><h3>شهرستان‌ها</h3><button class="btn sm" data-act="geo-new" data-t="county">➕</button></div>
      ${counties.length?counties.map(c=>`<div class="row" style="padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;background:${cid===c.id?'var(--primary-soft)':'#fff'}" data-act="geo-pick" data-t="county" data-id="${c.id}">
        <b>${esc(c.name)}</b><span class="small muted">${esc((byId('provinces',c.province_id)||{}).name||'')}</span><div class="spacer"></div>
        <span class="small muted">${fa(cnt(c,'county_id'))} مدرسه</span>
        <button class="icon-btn" title="ویرایش" data-act="geo-edit" data-t="counties" data-id="${c.id}">✏️</button>
        <button class="icon-btn danger" title="حذف" data-act="geo-del" data-t="counties" data-id="${c.id}">🗑️</button></div>`).join(''):empty('🏙️','شهرستانی نیست','')}
    </div>
    <div class="card"><div class="card-head"><h3>مناطق / نواحی</h3><button class="btn sm" data-act="geo-new" data-t="district">➕</button></div>
      ${districts.length?districts.map(d=>`<div class="row" style="padding:10px 14px;border-bottom:1px solid var(--border)">
        <b>${esc(d.name)}</b><span class="badge ${d.kind==='village'?'b-amber':'b-gray'}">${AREA_KIND[d.kind]||'منطقه'}</span>
        <div class="spacer"></div><span class="small muted">${fa(cnt(d,'district_id'))} مدرسه</span>
        <button class="icon-btn" title="ویرایش" data-act="geo-edit" data-t="districts" data-id="${d.id}">✏️</button>
        <button class="icon-btn danger" title="حذف" data-act="geo-del" data-t="districts" data-id="${d.id}">🗑️</button></div>`).join(''):empty('📍','منطقه‌ای نیست','')}
    </div></div>`;
}

/* ---------------- صفحه: تعریف ادارات (سوپرادمین) ---------------- */
function viewOffices(){
  const rows=db.offices.map(o=>{
    const schools=officeScopeSchools(o);
    const u=db.users.find(x=>x.office_id===o.id);
    return {o,u,schools:schools.length,students:db.users.filter(x=>x.role==='student'&&schools.some(s=>s.id===x.school_id)).length};
  });
  return `<div class="card"><div class="card-head"><h3>🏛️ ادارات آموزش و پرورش</h3>
    <button class="btn" data-act="office-new">➕ تعریف اداره جدید</button></div>
   ${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>نام اداره</th><th>سطح</th><th>محدوده</th><th>مدارس</th><th>دانش‌آموزان</th><th>حساب کارشناس</th><th></th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td><b>${esc(r.o.name)}</b></td>
      <td><span class="badge b-purple">${OFFICE_LEVEL[r.o.level]||'—'}</span></td>
      <td class="small">${esc((byId('provinces',r.o.province_id)||{}).name||'—')}${r.o.county_id?' › '+esc((byId('counties',r.o.county_id)||{}).name||''):''}${r.o.district_id?' › '+esc((byId('districts',r.o.district_id)||{}).name||''):''}</td>
      <td>${fa(r.schools)}</td><td>${fa(r.students)}</td>
      <td class="small">${r.u?`<b>${esc(r.u.username)}</b><div class="muted">${esc(r.u.full_name)}</div>`:'<span class="badge b-amber">بدون حساب</span>'}</td>
      <td><div class="row" style="gap:5px;flex-wrap:nowrap">
        <button class="btn ghost sm" data-act="office-toggle" data-id="${r.o.id}">${r.o.active?'⏸️ غیرفعال':'▶️ فعال'}</button>
        <button class="icon-btn" title="ویرایش" data-act="office-edit" data-id="${r.o.id}">✏️</button>
        <button class="icon-btn danger" title="حذف" data-act="office-del" data-id="${r.o.id}">🗑️</button></div></td></tr>`).join('')}
   </tbody></table></div>`:empty('🏛️','اداره‌ای تعریف نشده','با دکمه بالا اداره کل استان، اداره شهرستان یا منطقه را تعریف کنید.')}</div>`;
}

/* ---------------- صفحه: داشبورد اداره ---------------- */
function viewOfficeDash(){
  const u=S.user, o=officeOf(u);
  const isSuper=u.role==='superadmin';
  const schools=officeScopeSchools(o,S.filters);
  const st=officeStats(schools);
  const rows=perSchoolRows(schools);
  // فیلترهای درون‌محدوده
  const provinces=isSuper?db.provinces:db.provinces.filter(p=>!o||!o.province_id||p.id===o.province_id);
  const counties=db.counties.filter(c=>(!S.filters.province||c.province_id===Number(S.filters.province))&&(!o||!o.county_id||c.id===o.county_id)&&(!o||!o.province_id||c.province_id===o.province_id));
  const byCounty={};
  schools.forEach(s=>{const k=(byId('counties',s.county_id)||{}).name||'نامشخص';
    byCounty[k]=byCounty[k]||{schools:0,students:0};
    byCounty[k].schools++; byCounty[k].students+=db.users.filter(x=>x.school_id===s.id&&x.role==='student').length;});
  const cRows=Object.entries(byCounty).sort((a,b)=>b[1].students-a[1].students);
  const maxS=Math.max(1,...cRows.map(r=>r[1].students));

  return `<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--primary-soft),#fff)">
    <div class="card-body"><div class="row">
      <div><b style="font-size:15px">${esc(o?o.name:'نمای کل کشور')}</b>
        <div class="small muted">${o?OFFICE_LEVEL[o.level]:'سوپر ادمین — همه مدارس'} · گزارش‌ها تجمیعی است و اطلاعات فردی دانش‌آموزان نمایش داده نمی‌شود.</div></div>
      <div class="spacer"></div>
      </div>
      ${filterPanel('officedash',`
        <select class="select" style="width:150px" data-f="province"><option value="">همه استان‌ها</option>
          ${provinces.map(p=>`<option value="${p.id}" ${String(S.filters.province)===String(p.id)?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
        <select class="select" style="width:150px" data-f="county"><option value="">همه شهرستان‌ها</option>
          ${counties.map(c=>`<option value="${c.id}" ${String(S.filters.county)===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`)}
      </div></div>

   <div class="grid g4" style="margin-bottom:14px">
    ${statCard('🏫',fa(st.schools),'مدرسه تحت پوشش','blue')}
    ${statCard('🎓',fa(st.students),'دانش‌آموز','green')}
    ${statCard('👨‍🏫',fa(st.teachers),'دبیر','purple')}
    ${statCard('🏛️',fa(st.classes),'کلاس','amber')}</div>

   <div class="grid g4" style="margin-bottom:14px">
    ${statCard('📈',fa(st.attendance)+'٪','میانگین حضور','green')}
    ${statCard('📝',fa(st.avg),'میانگین نمرات','blue')}
    ${statCard('👥',fa(st.ratio),'نسبت دانش‌آموز به دبیر','purple')}
    ${statCard('🪑',fa(st.fill)+'٪','اشغال ظرفیت','amber')}</div>

   <div class="grid g2">
    <div class="card"><div class="card-head"><h3>پراکندگی به تفکیک شهرستان</h3><span class="badge b-gray">${fa(cRows.length)} شهرستان</span></div>
      ${cRows.length?`<div class="card-body" style="display:grid;gap:10px">${cRows.map(([k,v])=>`<div>
        <div class="row" style="justify-content:space-between"><span class="small"><b>${esc(k)}</b> — ${fa(v.schools)} مدرسه</span><b class="small">${fa(v.students)} دانش‌آموز</b></div>
        ${bar(v.students,maxS,'var(--primary)')}</div>`).join('')}</div>`:empty('📊','داده‌ای نیست','')}</div>

    <div class="card"><div class="card-head"><h3>ترکیب مدارس محدوده</h3></div>
      <div class="card-body"><table class="table"><tbody>
        <tr><td>مدارس فعال</td><td><b>${fa(st.active)}</b> از ${fa(st.schools)}</td></tr>
        <tr><td>مدارس دخترانه / پسرانه</td><td><b>${fa(st.girls)}</b> / <b>${fa(st.boys)}</b></td></tr>
        <tr><td>مدارس روستا</td><td><b>${fa(st.village)}</b></td></tr>
        <tr><td>ظرفیت کل</td><td><b>${fa(st.capacity)}</b> نفر</td></tr>
        <tr><td>موارد انضباطی مثبت / منفی</td><td style="color:var(--green)"><b>${fa(st.discipline.pos)}</b> <span class="muted">/</span> <span style="color:var(--red)"><b>${fa(st.discipline.neg)}</b></span></td></tr>
      </tbody></table></div></div>
   </div>

   <div class="card" style="margin-top:14px"><div class="card-head"><h3>عملکرد مدارس محدوده</h3>
     <button class="btn ghost sm" data-act="office-print">🖨️ چاپ گزارش</button></div>
    ${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>مدرسه</th><th>شهرستان</th><th>مقطع</th><th>دانش‌آموز</th><th>دبیر</th><th>میانگین نمره</th><th>درصد حضور</th><th>اشغال ظرفیت</th></tr></thead><tbody>
      ${rows.map((r,i)=>`<tr><td>${fa(i+1)}</td><td><b>${esc(r.s.name)}</b><div class="small muted">${esc(r.s.code||'')}</div></td>
        <td class="small">${esc((byId('counties',r.s.county_id)||{}).name||'—')}</td><td class="small">${esc(r.s.level||'—')}</td>
        <td>${fa(r.students)}</td><td>${fa(r.teachers)}</td><td><b>${fa(r.avg)}</b></td>
        <td>${fa(r.att)}٪</td><td>${fa(r.fill)}٪</td></tr>`).join('')}
    </tbody></table></div>`:empty('🏫','مدرسه‌ای در این محدوده نیست','')}</div>`;
}

/* ---------------- صفحه: مدارس منطقه (اداره) ---------------- */
function viewOfficeSchools(){
  const o=officeOf(S.user);
  let schools=officeScopeSchools(o,S.filters);
  const q=(S.filters.q||'').trim();
  const ol=S.filters.olevel||'', og=S.filters.ogender||'', ok=S.filters.okind||'';
  if(q)schools=schools.filter(s=>(s.name+(s.code||'')).includes(q));
  if(ol)schools=schools.filter(s=>s.level===ol);
  if(og)schools=schools.filter(s=>s.gender===og);
  if(ok)schools=schools.filter(s=>(s.area_kind||'district')===ok);
  const rows=perSchoolRows(schools);
  const oopt=(list,val,label)=>[`<option value="">${label}</option>`,
    ...list.map(x=>`<option value="${esc(x[0])}" ${String(val)===String(x[0])?'selected':''}>${esc(x[1])}</option>`)].join('');
  return `<div class="card"><div class="card-head"><h3>🏫 مدارس تحت پوشش</h3>
    <div class="row"><input class="input" style="width:180px" placeholder="جستجوی نام مدرسه…" data-f="q" value="${esc(q)}" />
    <span class="badge b-blue">${fa(schools.length)} مدرسه</span></div></div>
   ${filterPanel('officeschools',`
     <select class="select" style="width:145px" data-f="olevel">${oopt(LEVELS.map(l=>[l,l]),ol,'همه مقاطع')}</select>
     <select class="select" style="width:130px" data-f="ogender">${oopt([['پسرانه','پسرانه'],['دخترانه','دخترانه']],og,'همه جنسیت‌ها')}</select>
     <select class="select" style="width:130px" data-f="okind">${oopt(Object.entries(AREA_KIND),ok,'منطقه و روستا')}</select>`)}
   ${rows.length?`<div class="card-body" style="display:grid;gap:10px">
    ${rows.map(r=>`<div class="row" style="background:var(--surface-2);padding:12px 14px;border-radius:12px">
      <div style="min-width:0"><b>${esc(r.s.name)}</b>
        <div class="small muted">${esc(r.s.level||'')} · ${esc(r.s.gender||'')} · ${esc((byId('counties',r.s.county_id)||{}).name||'')} › ${esc((byId('districts',r.s.district_id)||{}).name||'')}</div>
        <div class="small muted">مدیر: ${esc((db.users.find(u=>u.school_id===r.s.id&&u.role==='manager')||{}).full_name||'—')} · تلفن: ${esc(r.s.phone||'—')}</div></div>
      <div class="spacer"></div>
      <div class="row" style="gap:14px">
        <div style="text-align:center"><b>${fa(r.students)}</b><div class="small muted">دانش‌آموز</div></div>
        <div style="text-align:center"><b>${fa(r.teachers)}</b><div class="small muted">دبیر</div></div>
        <div style="text-align:center"><b>${fa(r.avg)}</b><div class="small muted">میانگین</div></div>
        <div style="text-align:center"><b>${fa(r.att)}٪</b><div class="small muted">حضور</div></div>
        <span class="badge ${r.s.active?'b-green':'b-red'}">${r.s.active?'فعال':'غیرفعال'}</span>
      </div></div>`).join('')}</div>`:empty('🏫','مدرسه‌ای در محدوده شما نیست','')}</div>`;
}

/* ---------------- عملیات فاز ۹ ---------------- */
const P9_ACTIONS = {
  'geo-pick'(el,id){ const t=el.dataset.t;
    if(t==='province'){S.filters.gp=String(id);S.filters.gc='';} else S.filters.gc=String(id);
    render(); },
  'geo-new'(el){
    const t=el.dataset.t;
    const title={province:'استان جدید',county:'شهرستان جدید',district:'منطقه / ناحیه جدید'}[t];
    let body=f('نام *',inp('g_name',''));
    if(t==='county')body+=f('استان',sel('g_parent',db.provinces.map(p=>[p.id,p.name]),S.filters.gp));
    if(t==='district'){
      body+=f('شهرستان',sel('g_parent',db.counties.map(c=>[c.id,c.name+' ('+((byId('provinces',c.province_id)||{}).name||'')+')']),S.filters.gc));
      body+=f('نوع منطقه',sel('g_kind',[['district','منطقه'],['village','روستا']]));
    }
    openModal(modalTpl(title,body,'geo-save'));
    window._geoType=t;
  },
  'geo-save'(){
    const t=window._geoType, name=V('g_name');
    if(!name){toast('نام الزامی است','err');return;}
    if(t==='province')insert('provinces',{name,code:'P'+(db.provinces.length+1)});
    if(t==='county'){const pid=Number(V('g_parent'));if(!pid){toast('استان را انتخاب کنید','err');return;}
      insert('counties',{province_id:pid,name,code:'C'+(db.counties.length+1)});}
    if(t==='district'){const cid=Number(V('g_parent'));if(!cid){toast('شهرستان را انتخاب کنید','err');return;}
      const c=byId('counties',cid);
      insert('districts',{province_id:c.province_id,county_id:cid,name,kind:V('g_kind')||'district'});}
    closeModal(); toast('ثبت شد','ok'); render();
  },
  'geo-edit'(el,id){
    const t=el.dataset.t, row=byId(t,id);
    let body=f('نام *',inp('g_name',row.name));
    if(t==='counties')body+=f('استان',sel('g_parent',db.provinces.map(p=>[p.id,p.name]),row.province_id));
    if(t==='districts'){
      body+=f('شهرستان',sel('g_parent',db.counties.map(c=>[c.id,c.name]),row.county_id));
      body+=f('نوع منطقه',sel('g_kind',[['district','منطقه'],['village','روستا']],row.kind||'district'));
    }
    openModal(modalTpl('ویرایش '+({provinces:'استان',counties:'شهرستان',districts:'منطقه'}[t]),body,'geo-edit-save'));
    window._geoEdit={t,id};
  },
  'geo-edit-save'(){
    const {t,id}=window._geoEdit; const name=V('g_name');
    if(!name){toast('نام الزامی است','err');return;}
    const data={name};
    if(t==='counties')data.province_id=Number(V('g_parent'));
    if(t==='districts'){const c=byId('counties',Number(V('g_parent')));data.county_id=c.id;data.province_id=c.province_id;data.kind=V('g_kind');}
    update(t,id,data);
    if(t!=='provinces'){ // همگام‌سازی مدارس با محدوده جدید
      db.schools.filter(x=>x[t==='counties'?'county_id':'district_id']===id).forEach(x=>{
        if(t==='counties')update('schools',x.id,{province_id:data.province_id});
        else update('schools',x.id,{county_id:data.county_id,province_id:data.province_id,area_kind:data.kind});
      });
    }
    closeModal(); toast('ویرایش شد','ok'); render();
  },
  'geo-del'(el,id){
    const t=el.dataset.t;
    const field={provinces:'province_id',counties:'county_id',districts:'district_id'}[t];
    if(db.schools.some(s=>s[field]===id)){toast('این محدوده مدرسه دارد و حذف نمی‌شود','err');return;}
    if(t==='provinces'&&db.counties.some(c=>c.province_id===id)){toast('ابتدا شهرستان‌های آن را حذف کنید','err');return;}
    if(t==='counties'&&db.districts.some(d=>d.county_id===id)){toast('ابتدا مناطق آن را حذف کنید','err');return;}
    if(db.offices.some(o=>o[field]===id)){toast('یک اداره روی این محدوده تعریف شده است','err');return;}
    const row=byId(t,id);
    askDelete(`«${row.name}» حذف شود؟`,()=>{remove(t,id);toast('حذف شد','');render();});
  },
  'office-new'(){
    openModal(modalTpl('تعریف اداره آموزش و پرورش',
      `${f('نام اداره *',inp('of_name','اداره آموزش و پرورش '))}
       ${f('سطح',sel('of_level',[['province','اداره کل استان'],['county','اداره شهرستان'],['district','اداره منطقه/ناحیه']]))}
       <div class="grid g3">
         ${f('استان',sel('of_p',[['','—'],...db.provinces.map(p=>[p.id,p.name])]))}
         ${f('شهرستان',sel('of_c',[['','—'],...db.counties.map(c=>[c.id,c.name])]))}
         ${f('منطقه',sel('of_d',[['','—'],...db.districts.map(d=>[d.id,d.name])]))}</div>
       <div class="grid g2">${f('نام کارشناس',inp('of_user','کارشناس اداره'))}${f('نام کاربری *',inp('of_username','edu_'))}</div>
       <div class="small muted" style="line-height:2;margin-top:8px">ℹ️ رمز عبور پیش‌فرض <b>123456</b> است. اداره فقط آمار تجمیعی محدوده خود را می‌بیند و به پرونده فردی دانش‌آموزان دسترسی ندارد.</div>`,'office-save'));
  },
  'office-save'(){
    const name=V('of_name'), username=V('of_username');
    if(!name||!username){toast('نام اداره و نام کاربری الزامی است','err');return;}
    if(db.users.some(u=>u.username===username)){toast('نام کاربری تکراری است','err');return;}
    const o=insert('offices',{name,level:V('of_level'),province_id:Number(V('of_p'))||null,
      county_id:Number(V('of_c'))||null,district_id:Number(V('of_d'))||null,active:1});
    const u=insert('users',{school_id:null,office_id:o.id,role:'edu_office',full_name:V('of_user')||('کارشناس '+name),
      username,password:'123456',national_id:makeNid(),phone:'',active:1,created_at:todayISO()});
    update('offices',o.id,{user_id:u.id});
    closeModal(); toast('اداره و حساب کارشناس ساخته شد','ok'); render();
  },
  'office-edit'(el,id){
    const o=byId('offices',id), u=db.users.find(x=>x.office_id===id)||{};
    openModal(modalTpl('ویرایش اداره',
      `${f('نام اداره *',inp('of_name',o.name))}
       ${f('سطح',sel('of_level',[['province','اداره کل استان'],['county','اداره شهرستان'],['district','اداره منطقه/ناحیه']],o.level))}
       <div class="grid g3">
         ${f('استان',sel('of_p',[['','—'],...db.provinces.map(p=>[p.id,p.name])],o.province_id||''))}
         ${f('شهرستان',sel('of_c',[['','—'],...db.counties.map(c=>[c.id,c.name])],o.county_id||''))}
         ${f('منطقه',sel('of_d',[['','—'],...db.districts.map(d=>[d.id,d.name])],o.district_id||''))}</div>
       <div class="grid g2">${f('نام کارشناس',inp('of_user',u.full_name||''))}${f('نام کاربری',inp('of_username',u.username||''))}</div>
       ${f('رمز عبور جدید (خالی = بدون تغییر)',inp('of_pass',''))}`,'office-edit-save'));
    window._officeEdit=id;
  },
  'office-edit-save'(){
    const id=window._officeEdit, o=byId('offices',id), u=db.users.find(x=>x.office_id===id);
    const name=V('of_name'), username=V('of_username');
    if(!name){toast('نام اداره الزامی است','err');return;}
    if(u&&username&&username!==u.username&&db.users.some(x=>x.username===username)){toast('نام کاربری تکراری است','err');return;}
    update('offices',id,{name,level:V('of_level'),province_id:Number(V('of_p'))||null,county_id:Number(V('of_c'))||null,district_id:Number(V('of_d'))||null});
    if(u){
      const patch={full_name:V('of_user')||u.full_name};
      if(username)patch.username=username;
      if(V('of_pass'))patch.password=V('of_pass');
      update('users',u.id,patch);
    }
    closeModal(); toast('اداره ویرایش شد','ok'); render();
  },
  'office-toggle'(el,id){
    const o=byId('offices',id), on=!!o.active;
    askConfirm(on?`اداره «${o.name}» غیرفعال شود؟ کارشناس آن نمی‌تواند وارد شود.`:`اداره «${o.name}» فعال شود؟`,()=>{
      update('offices',id,{active:on?0:1});
      const u=db.users.find(x=>x.office_id===id);
      if(u)update('users',u.id,{active:on?0:1});
      toast(on?'اداره غیرفعال شد':'اداره فعال شد',on?'':'ok'); render();},
      {title:on?'غیرفعال کردن اداره':'فعال کردن اداره', ok:on?'غیرفعال کن':'فعال کن', danger:!!on,
       note:'اطلاعات اداره حذف نمی‌شود.'});
  },
  'office-del'(el,id){
    const o=byId('offices',id);
    askDelete(`اداره «${o.name}» و حساب کارشناس آن حذف شود؟`,()=>{
      const u=db.users.find(x=>x.office_id===id);
      if(u)remove('users',u.id);
      remove('offices',id); toast('اداره حذف شد',''); render();});
  },
  'office-print'(){
    const o=officeOf(S.user);
    const schools=officeScopeSchools(o,S.filters);
    const rows=perSchoolRows(schools), st=officeStats(schools);
    const w=window.open('','_blank'); if(!w){toast('اجازه باز کردن پنجره داده نشد','err');return;}
    w.document.write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش اداره</title>'
      +'<style>body{font-family:Vazirmatn,Tahoma;padding:22px;color:#0f172a}h1{font-size:19px;color:#1668f0;margin:0 0 4px}'
      +'table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:right}'
      +'th{background:#eff6ff}.sum{display:flex;gap:18px;margin-top:10px;font-size:13px}@media print{.np{display:none}}</style></head><body>'
      +'<h1>'+esc(o?o.name:'گزارش کل')+'</h1>'
      +'<div class="sum"><span>مدارس: <b>'+fa(st.schools)+'</b></span><span>دانش‌آموز: <b>'+fa(st.students)+'</b></span>'
      +'<span>دبیر: <b>'+fa(st.teachers)+'</b></span><span>میانگین نمره: <b>'+fa(st.avg)+'</b></span><span>حضور: <b>'+fa(st.attendance)+'٪</b></span></div>'
      +'<table><thead><tr><th>#</th><th>مدرسه</th><th>شهرستان</th><th>دانش‌آموز</th><th>دبیر</th><th>میانگین</th><th>حضور</th></tr></thead><tbody>'
      +rows.map(function(r,i){return '<tr><td>'+fa(i+1)+'</td><td>'+esc(r.s.name)+'</td><td>'+esc((byId('counties',r.s.county_id)||{}).name||'—')
        +'</td><td>'+fa(r.students)+'</td><td>'+fa(r.teachers)+'</td><td>'+fa(r.avg)+'</td><td>'+fa(r.att)+'٪</td></tr>';}).join('')
      +'</tbody></table><div class="np" style="text-align:center;margin-top:14px"><button onclick="window.print()" style="padding:8px 20px;border:none;border-radius:8px;background:#1668f0;color:#fff;font-family:inherit;cursor:pointer">🖨️ چاپ</button></div></body></html>');
    w.document.close();
  },
};

/* مودال تأیید فرزندان — بدون template literal ساخته می‌شود تا در هیچ مرورگر/پروکسی‌ای خام نمایش داده نشود */
function parentGate(){
  var list=pendingKids();
  if(!list.length)return '';
  var head='<div class="card-head" style="background:linear-gradient(120deg,#14225a,#1668f0);color:#fff;border-radius:14px 14px 0 0">'
    +'<h3 style="color:#fff">👨‍👩‍👦 تأیید فرزندان</h3>'
    +'<span class="badge" style="background:rgba(255,255,255,.2);color:#fff">'+fa(list.length)+' مورد</span></div>';
  var intro='<p style="margin:0 0 14px;line-height:2">بر اساس <b>کد ملی شما</b> ('
    +esc(S.user.national_id||'—')+') دانش‌آموزان زیر به‌عنوان فرزندان شما شناسایی شده‌اند. '
    +'لطفاً صحت اطلاعات را تأیید کنید. اگر موردی متعلق به شما نیست، گزارش آن برای اصلاح به همان مدرسه ارسال می‌شود.</p>';
  var cards='';
  for(var i=0;i<list.length;i++){
    var k=list[i];
    cards+='<div style="border:1px solid var(--border);border-radius:12px;padding:12px 14px">'
      +'<div class="row"><div class="avatar">'+esc(String(k.full_name||'?').charAt(0))+'</div>'
      +'<div style="min-width:0"><b>'+esc(k.full_name)+'</b>'
      +'<div class="small muted">'+esc(k.school_name)+' · '+esc(k.class_name)+' · نسبت: '+esc(k.relation)+'</div>'
      +'<div class="small muted">کد ملی: '+esc(k.national_id||'—')+'</div></div>'
      +'<div class="spacer"></div>'
      +'<button class="btn sm" data-act="kid-confirm" data-id="'+k.id+'">✅ بله، فرزند من است</button>'
      +'<button class="btn ghost sm" data-act="kid-reject" data-id="'+k.id+'">❌ فرزند من نیست</button>'
      +'</div></div>';
  }
  var foot='<div class="card-head" style="border-bottom:none;border-top:1px solid var(--border);justify-content:space-between">'
    +'<span class="small muted">تا بررسی همه موارد، این پرسش نمایش داده می‌شود.</span>'
    +'<button class="btn ghost" data-act="gate-later">بعداً بررسی می‌کنم</button></div>';
  return '<div class="modal-back" style="z-index:200"><div class="modal" style="max-width:620px">'
    +head+'<div class="card-body">'+intro+'<div style="display:grid;gap:10px">'+cards+'</div></div>'+foot+'</div></div>';
}

/* ---------------- عملیات فاز ۸ ---------------- */
const P8_ACTIONS = {
  /* --- تأیید فرزند --- */
  'kid-confirm'(el,id){
    const v=db.parent_verifications.find(x=>x.parent_id===S.user.id&&x.student_id===id);
    if(v)update('parent_verifications',v.id,{status:'confirmed'});
    else insert('parent_verifications',{parent_id:S.user.id,student_id:id,status:'confirmed'});
    toast('تأیید شد. سپاسگزاریم.','ok'); render();
  },
  'kid-reject'(el,id){
    const st=byId('users',id);
    openModal(modalTpl('گزارش به مدرسه',
      `<p style="margin:0 0 10px;line-height:2">اعلام می‌کنید <b>${esc(st.full_name)}</b> فرزند شما نیست. گزارش برای اصلاح به «${esc((byId('schools',st.school_id)||{}).name||'مدرسه')}» ارسال می‌شود.</p>
       ${f('توضیح (اختیاری)',`<textarea class="input" id="rj_note" rows="3" placeholder="مثلاً: من این دانش‌آموز را نمی‌شناسم؛ احتمالاً کد ملی پدر اشتباه ثبت شده است."></textarea>`)}`,'kid-reject-ok'));
    window._rejectId=id;
  },
  'kid-reject-ok'(){
    const id=window._rejectId, st=byId('users',id);
    const v=db.parent_verifications.find(x=>x.parent_id===S.user.id&&x.student_id===id);
    const note=V('rj_note')||'ولی اعلام کرده این دانش‌آموز فرزند او نیست.';
    if(v)update('parent_verifications',v.id,{status:'rejected',note});
    else insert('parent_verifications',{parent_id:S.user.id,student_id:id,status:'rejected',note});
    const link=db.parent_links.find(l=>l.parent_id===S.user.id&&l.student_id===id);
    if(link)remove('parent_links',link.id);
    insert('corrections',{school_id:st.school_id,student_id:id,parent_id:S.user.id,parent_nid:S.user.national_id,
      message:note,status:'open',created_at:todayISO()});
    db.users.filter(u=>u.role==='manager'&&u.school_id===st.school_id).forEach(m=>
      insert('notifications',{user_id:m.id,school_id:st.school_id,type:'announcement',title:'⚠️ درخواست اصلاح اطلاعات ولی',
        body:`${S.user.full_name} اعلام کرد ${st.full_name} فرزند او نیست.`,link:'corrections',read:0,created_at:todayISO()}));
    closeModal(); toast('گزارش شما به مدرسه ارسال شد','ok'); render();
  },
  'gate-later'(){ S.gateSkipped=true; render(); },
  'child-open'(el,id){ S.child=id; go('children'); },

  /* --- درخواست اصلاح (مدیر) --- */
  'corr-fix'(el,id){
    const c=byId('corrections',id), st=byId('users',c.student_id)||{};
    openModal(modalTpl('اصلاح اطلاعات — '+esc(st.full_name||''),
      `<div class="small" style="background:var(--amber-soft);padding:10px 12px;border-radius:10px;line-height:2;margin-bottom:12px">پیام ولی: ${esc(c.message||'')}</div>
       <div class="grid g2">${f('کد ملی پدر',inp('cf_father',st.father_nid||''))}${f('کد ملی مادر',inp('cf_mother',st.mother_nid||''))}</div>
       ${f('پاسخ به ولی',inp('cf_resp','اطلاعات بررسی و اصلاح شد.'))}`,'corr-save'));
    window._corrId=id;
  },
  'corr-save'(){
    const c=byId('corrections',window._corrId), st=byId('users',c.student_id);
    const fnid=V('cf_father'), mnid=V('cf_mother');
    if(fnid&&!validNid(fnid)){toast('کد ملی پدر معتبر نیست','err');return;}
    if(mnid&&!validNid(mnid)){toast('کد ملی مادر معتبر نیست','err');return;}
    update('users',st.id,{father_nid:fnid||null,mother_nid:mnid||null});
    update('corrections',c.id,{status:'resolved',response:V('cf_resp'),resolved_at:todayISO()});
    // اتصال خودکار به ولی جدید
    [[fnid,'پدر'],[mnid,'مادر']].forEach(([nid,rel])=>{
      if(!nid)return;
      const p=db.users.find(u=>u.role==='parent'&&u.national_id===nid);
      if(!p)return;
      if(!db.parent_links.some(l=>l.parent_id===p.id&&l.student_id===st.id))
        insert('parent_links',{parent_id:p.id,student_id:st.id,relation:rel});
      if(!db.parent_verifications.some(v=>v.parent_id===p.id&&v.student_id===st.id))
        insert('parent_verifications',{parent_id:p.id,student_id:st.id,status:'pending'});
    });
    if(c.parent_id)insert('notifications',{user_id:c.parent_id,school_id:c.school_id,type:'announcement',
      title:'✅ درخواست اصلاح بررسی شد',body:V('cf_resp'),link:'family',read:0,created_at:todayISO()});
    closeModal(); toast('اصلاح ثبت شد','ok'); render();
  },

  /* --- دبیر چندمدرسه‌ای --- */
  'teacher-add'(){
    openModal(modalTpl('افزودن دبیر با کد ملی',
      `${f('کد ملی دبیر',inp('ts_nid',''))}
       <div class="grid g2">${f('نوع همکاری',sel('ts_emp',[['حق‌التدریس','حق‌التدریس'],['رسمی','رسمی'],['پیمانی','پیمانی'],['قراردادی','قراردادی']]))}
        ${f('سقف ساعت هفتگی',inp('ts_quota',12,'number'))}</div>
       <div class="small muted" style="line-height:2;margin-top:8px">ℹ️ یک دبیر می‌تواند در چند مدرسه تدریس کند؛ هنگام چیدن برنامه، ساعت‌های او در همه مدارس بررسی و از تداخل جلوگیری می‌شود.</div>`,'teacher-add-ok'));
  },
  'teacher-add-ok'(){
    const nid=V('ts_nid');
    if(!validNid(nid)){toast('کد ملی معتبر نیست','err');return;}
    const t=nidOwner(nid);
    if(!t){toast('کاربری با این کد ملی یافت نشد؛ ابتدا او را در «کاربران» تعریف کنید','err');return;}
    if(t.role!=='teacher'){toast(`این کد ملی متعلق به ${t.full_name} با نقش دیگری است`,'err');return;}
    if(t.school_id===S.user.school_id||db.teacher_schools.some(x=>x.teacher_id===t.id&&x.school_id===S.user.school_id)){toast('این دبیر قبلاً در مدرسه شما است','err');return;}
    insert('teacher_schools',{teacher_id:t.id,school_id:S.user.school_id,employment:V('ts_emp'),weekly_quota:Number(V('ts_quota'))||12,active:1});
    insert('notifications',{user_id:t.id,school_id:S.user.school_id,type:'announcement',title:'🏫 تدریس در مدرسه جدید',
      body:`شما به مدرسه «${(byId('schools',S.user.school_id)||{}).name}» اضافه شدید.`,link:'schedule',read:0,created_at:todayISO()});
    closeModal(); toast('دبیر به مدرسه اضافه شد','ok'); render();
  },
  'ts-edit'(el,id){
    const ts=db.teacher_schools.find(x=>x.teacher_id===id&&x.school_id===S.user.school_id);
    if(!ts){toast('این دبیر، دبیر اصلی همین مدرسه است','err');return;}
    const t=byId('users',id);
    openModal(modalTpl('ویرایش همکاری — '+esc(t.full_name),
      `<div class="grid g2">${f('نوع همکاری',sel('ts_emp',[['حق‌التدریس','حق‌التدریس'],['رسمی','رسمی'],['پیمانی','پیمانی'],['قراردادی','قراردادی']],ts.employment))}
       ${f('سقف ساعت هفتگی',inp('ts_quota',ts.weekly_quota||12,'number'))}</div>`,'ts-edit-save'));
    window._tsEdit=ts.id;
  },
  'ts-edit-save'(){ update('teacher_schools',window._tsEdit,{employment:V('ts_emp'),weekly_quota:Number(V('ts_quota'))||12});
    closeModal(); toast('ویرایش شد','ok'); render(); },
  'ts-del'(el,id){
    const ts=db.teacher_schools.find(x=>x.teacher_id===id&&x.school_id===S.user.school_id);
    const t=byId('users',id);
    const hours=db.schedule.filter(x=>x.teacher_id===id&&x.school_id===S.user.school_id).length;
    if(hours){toast(`این دبیر ${fa(hours)} زنگ فعال در مدرسه شما دارد؛ ابتدا برنامه او را خالی کنید`,'err');return;}
    askDelete(`همکاری «${t.full_name}» با این مدرسه پایان یابد؟`,()=>{remove('teacher_schools',ts.id);toast('حذف شد','');render();});
  },
  'teacher-plan'(el,id){
    const t=byId('users',id);
    const slots=db.schedule.filter(s=>s.teacher_id===id);
    const schools=[...new Set(slots.map(s=>(byId('schools',s.school_id)||{}).name))];
    const colors=['var(--primary-soft)','var(--green-soft)','var(--amber-soft)','var(--purple-soft)'];
    const cmap={}; schools.forEach((n,i)=>cmap[n]=colors[i%colors.length]);
    const periods=[...new Set(slots.map(s=>s.period))].sort((a,b)=>a-b);
    openModal(`<div class="card-head"><h3>برنامه کامل — ${esc(t.full_name)}</h3><button class="icon-btn" data-act="modal-close">✕</button></div>
      <div class="card-body">
        <div class="row" style="gap:8px;margin-bottom:12px"><span class="badge b-blue">مجموع ${fa(slots.length)} زنگ</span>
        ${schools.map(n=>`<span class="badge" style="background:${cmap[n]};color:var(--text)">${esc(n)}: ${fa(slots.filter(s=>(byId('schools',s.school_id)||{}).name===n).length)} زنگ</span>`).join('')}</div>
        ${periods.length?`<div class="table-wrap"><table class="table"><thead><tr><th>زنگ</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>
          ${periods.map(p=>`<tr><td><b>${fa(p)}</b></td>${DAYS.map((_,d)=>{
            const s=slots.find(x=>x.day===d&&x.period===p);
            const sn=s?(byId('schools',s.school_id)||{}).name:'';
            return `<td style="${s?`background:${cmap[sn]}`:''};font-size:12px">${s?`<b>${esc((byId('subjects',s.subject_id)||{}).name||'')}</b><div class="small muted">${esc((byId('classes',s.class_id)||{}).name||'')} · ${esc(sn)}</div>`:'<span class="muted">—</span>'}</td>`;}).join('')}</tr>`).join('')}
        </tbody></table></div>`:empty('🗓️','برنامه‌ای ثبت نشده','')}
      </div>`);
  },

  /* --- فصل امتحانات --- */
  'term-new'(){ termModal(null); },
  'term-edit'(el,id){ termModal(byId('exam_terms',id)); },
  'term-save'(){
    const t=window._edit||{};
    const data={school_id:S.user.school_id,title:V('tm_title'),term:V('tm_term'),start_date:V('tm_start'),end_date:V('tm_end'),
      status:t.status||'draft',note:V('tm_note')};
    if(!data.title){toast('عنوان الزامی است','err');return;}
    if(data.end_date<data.start_date){toast('تاریخ پایان قبل از شروع است','err');return;}
    if(t.id)update('exam_terms',t.id,data); else {const n=insert('exam_terms',data);S.filters.term=n.id;}
    closeModal(); toast('فصل امتحانات ذخیره شد','ok'); render();
  },
  'term-publish'(el,id){
    const t=byId('exam_terms',id);
    const was=t.status;                              // update شیء را در جا تغییر می‌دهد
    update('exam_terms',id,{status:was==='published'?'draft':'published'});
    if(was!=='published'){
      db.users.filter(u=>u.school_id===t.school_id&&['student','parent','teacher'].includes(u.role)).slice(0,400).forEach(u=>
        insert('notifications',{user_id:u.id,school_id:t.school_id,type:'announcement',title:'📝 برنامه امتحانات منتشر شد',
          body:`${t.title} — از ${jalali(t.start_date)} تا ${jalali(t.end_date)}`,link:'exams',read:0,created_at:todayISO()}));
      toast('برنامه منتشر و به اولیا و دبیران اطلاع داده شد','ok');
    } else toast('به حالت پیش‌نویس بازگشت','');
    render();
  },
  'exam-new'(el,id){ examModal(null,byId('exam_terms',id)); },
  'exam-edit'(el,id){ const e=byId('exams',id); examModal(e,byId('exam_terms',e.term_id)); },
  'exam-del'(el,id){ const e=byId('exams',id);
    askDelete(`جلسه امتحان ${esc((byId('subjects',e.subject_id)||{}).name||'')} کلاس ${esc((byId('classes',e.class_id)||{}).name||'')} در ${jalali(e.date)} حذف شود؟ ابلاغ‌های مراقبت آن هم حذف می‌شود.`,
      ()=>{db.exam_duties.filter(d=>d.exam_id===id).forEach(d=>remove('exam_duties',d.id));remove('exams',id);toast('جلسه امتحان حذف شد','ok');render();}); },
  'term-del'(el,id){ const t=byId('exam_terms',id);
    askDelete(`فصل «${t.title}» با همه جلسات و ابلاغ‌های مراقبت آن حذف شود؟`,()=>{
      db.exams.filter(e=>e.term_id===id).forEach(e=>{db.exam_duties.filter(d=>d.exam_id===e.id).forEach(d=>remove('exam_duties',d.id));remove('exams',e.id);});
      remove('exam_terms',id); S.filters.term=null; toast('فصل امتحانات حذف شد','ok'); render();}); },
  'exam-save'(){
    const e=window._edit||{}, term=window._term;
    const date=V('ex_date'), st=V('ex_time'), dur=Number(V('ex_dur'))||90, cid=Number(V('ex_class'));
    if(date<term.start_date||date>term.end_date){toast('تاریخ باید در بازه فصل امتحانات باشد','err');return;}
    const clash=db.exams.find(x=>x.class_id===cid&&x.date===date&&x.id!==e.id&&overlapP(st,dur,x.start_time,x.duration));
    if(clash){toast(`تداخل: این کلاس در ساعت ${clash.start_time} امتحان دیگری دارد`,'err');return;}
    const data={school_id:S.user.school_id,term_id:term.id,class_id:cid,subject_id:Number(V('ex_subject')),date,
      start_time:st,duration:dur,room:V('ex_room'),max_score:Number(V('ex_max'))||20};
    if(e.id)update('exams',e.id,data); else insert('exams',data);
    closeModal(); toast('جلسه امتحان ذخیره شد','ok'); render();
  },
  'duty-del'(el,id){ const d=byId('exam_duties',id), t=byId('users',d.teacher_id)||{};
    askDelete(`ابلاغ مراقبت «${t.full_name||''}» لغو شود؟`,()=>{remove('exam_duties',id);toast('ابلاغ لغو شد','');render();}); },
  'duty-auto'(el,id){
    const exams=db.exams.filter(e=>e.term_id===id);
    const teachers=schoolTeachers();
    if(!teachers.length){toast('دبیری تعریف نشده','err');return;}
    const load={}; teachers.forEach(t=>load[t.id]=db.exam_duties.filter(d=>d.teacher_id===t.id).length);
    let assigned=0, skipped=0;
    exams.forEach(ex=>{
      const have=db.exam_duties.filter(d=>d.exam_id===ex.id);
      const owner=db.schedule.find(s=>s.class_id===ex.class_id&&s.subject_id===ex.subject_id);
      for(let k=have.length;k<2;k++){
        const cands=teachers.filter(t=>!db.exam_duties.some(d=>d.exam_id===ex.id&&d.teacher_id===t.id))
          .filter(t=>!db.exam_duties.some(d=>{ if(d.teacher_id!==t.id)return false; const e2=byId('exams',d.exam_id);
            return e2&&e2.date===ex.date&&overlapP(ex.start_time,ex.duration,e2.start_time,e2.duration); }))
          .map(t=>({t,own:owner&&owner.teacher_id===t.id?1:0,load:load[t.id]||0}))
          .sort((a,b)=>a.own-b.own||a.load-b.load);
        if(!cands.length){skipped++;break;}
        const p=cands[0];
        insert('exam_duties',{exam_id:ex.id,teacher_id:p.t.id,school_id:ex.school_id,role:k===0?'main':'assistant'});
        load[p.t.id]=(load[p.t.id]||0)+1; assigned++;
      }
    });
    toast(`${fa(assigned)} ابلاغ صادر شد${skipped?` — ${fa(skipped)} جلسه بدون مراقب آزاد`:''}`,'ok'); render();
  },
  'exam-print'(el,id){
    const term=byId('exam_terms',id);
    const rows=db.exams.filter(e=>e.term_id===id).sort((a,b)=>a.date.localeCompare(b.date)||a.start_time.localeCompare(b.start_time));
    const w=window.open('','_blank'); if(!w){toast('اجازه باز کردن پنجره داده نشد','err');return;}
    w.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(term.title)}</title>
      <style>body{font-family:Vazirmatn,Tahoma;padding:22px;color:#0f172a}h1{font-size:19px;color:#1668f0;margin:0 0 4px}
      table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:right}
      th{background:#eff6ff}@media print{.np{display:none}}</style></head><body>
      <h1>${esc(term.title)}</h1><div style="color:#64748b;font-size:12.5px">${jalali(term.start_date)} تا ${jalali(term.end_date)}</div>
      <table><thead><tr><th>تاریخ</th><th>ساعت</th><th>کلاس</th><th>درس</th><th>سالن</th><th>مراقبان</th></tr></thead><tbody>
      ${rows.map(e=>`<tr><td>${jalali(e.date)}</td><td>${e.start_time} - ${toHHMMP(toMinP(e.start_time)+e.duration)}</td>
        <td>${esc((byId('classes',e.class_id)||{}).name||'')}</td><td>${esc((byId('subjects',e.subject_id)||{}).name||'')}</td>
        <td>${esc(e.room||'—')}</td><td>${db.exam_duties.filter(d=>d.exam_id===e.id).map(d=>esc((byId('users',d.teacher_id)||{}).full_name||'')).join('، ')||'—'}</td></tr>`).join('')}
      </tbody></table>
      <div class="np" style="text-align:center;margin-top:14px"><button onclick="window.print()" style="padding:8px 20px;border:none;border-radius:8px;background:#1668f0;color:#fff;font-family:inherit;cursor:pointer">🖨️ چاپ</button></div>
      </body></html>`);
    w.document.close();
  },

  /* --- برنامه هفتگی با کنترل تداخل --- */
  'slot-edit'(el){
    const day=Number(el.dataset.day), period=Number(el.dataset.period), sid=Number(el.dataset.sid)||0;
    const cls=byId('classes',Number(S.filters.class||el.dataset.class));
    if(!cls){toast('ابتدا کلاس را انتخاب کنید','err');return;}
    slotModal(sid?byId('schedule',sid):{day,period,class_id:cls.id});
  },
  'slot-save'(){
    const s=window._edit;
    const day=Number(V('sl_day')), period=Number(V('sl_period')), tid=Number(V('sl_teacher'))||null;
    const dup=db.schedule.find(x=>x.class_id===s.class_id&&x.day===day&&x.period===period&&x.id!==s.id);
    if(dup){toast('این کلاس در آن زنگ درس دیگری دارد','err');return;}
    if(tid){
      const busy=teacherBusyAt(tid,day,period,s.id||0);
      if(busy){
        const sc=byId('schools',busy.school_id)||{}, c=byId('classes',busy.class_id)||{};
        toast(`تداخل ساعت: این دبیر در ${DAYS[day]} زنگ ${fa(period)} در «${sc.name}» کلاس «${c.name}» را دارد`,'err');
        return;
      }
    }
    const data={school_id:byId('classes',s.class_id).school_id,class_id:s.class_id,subject_id:Number(V('sl_subject')),teacher_id:tid,day,period};
    if(s.id)update('schedule',s.id,data); else insert('schedule',data);
    closeModal(); toast('برنامه ذخیره شد','ok'); render();
  },
  'slot-del'(el,id){ const s=byId('schedule',id);
    askDelete(`درس «${esc((byId('subjects',s.subject_id)||{}).name||'')}» در ${DAYS[s.day]} زنگ ${fa(s.period)} حذف شود؟`,
      ()=>{remove('schedule',id);toast('زنگ حذف شد','');render();}); },
};

function termModal(t){
  t=t||{title:'امتحانات نوبت اول',term:'نوبت اول',start_date:addDaysISO(todayISO(),10),end_date:addDaysISO(todayISO(),24),note:''};
  openModal(modalTpl(t.id?'ویرایش فصل امتحانات':'فصل امتحانات جدید',
    `<div class="grid g2">${f('عنوان *',inp('tm_title',t.title))}
      ${f('نوبت',sel('tm_term',['نوبت اول','نوبت دوم','میان‌ترم','جبرانی','شهریور'].map(x=>[x,x]),t.term))}
      ${f('تاریخ شروع',jdate('tm_start',t.start_date))}${f('تاریخ پایان',jdate('tm_end',t.end_date))}</div>
     ${f('توضیح برای اولیا',`<textarea class="input" id="tm_note" rows="2">${esc(t.note||'')}</textarea>`)}`,'term-save'));
  window._edit=t;
}
function examModal(e,term){
  const classes=visibleClasses(), subs=visibleSubjects();
  e=e||{class_id:(classes[0]||{}).id,subject_id:(subs[0]||{}).id,date:term.start_date,start_time:'08:00',duration:90,room:'',max_score:20};
  openModal(modalTpl(e.id?'ویرایش جلسه امتحان':'افزودن جلسه امتحان',
    `<div class="grid g2">
      ${f('کلاس',sel('ex_class',classes.map(c=>[c.id,c.name]),e.class_id))}
      ${f('درس',sel('ex_subject',subs.map(s=>[s.id,s.name]),e.subject_id))}
      ${f('تاریخ',jdate('ex_date',e.date))}${f('ساعت شروع',inp('ex_time',e.start_time,'time'))}
      ${f('مدت (دقیقه)',inp('ex_dur',e.duration,'number'))}${f('سالن',inp('ex_room',e.room||''))}
      ${f('بارم',inp('ex_max',e.max_score,'number'))}</div>
     <div class="small muted" style="margin-top:10px;line-height:2">ℹ️ تداخل ساعت با امتحان دیگرِ همین کلاس خودکار بررسی می‌شود.</div>`,'exam-save'));
  window._edit=e; window._term=term;
}
function slotModal(s){
  const subs=visibleSubjects();
  const teachers=schoolTeachers().map(t=>{
    const busy=teacherBusyAt(t.id,s.day,s.period,s.id||0);
    const sc=busy?(byId('schools',busy.school_id)||{}).name:'';
    return {id:t.id,name:`${busy?'🔴':'🟢'} ${t.full_name}${busy?` — مشغول در ${sc}`:''}`,busy:!!busy};
  });
  openModal(modalTpl(s.id?'ویرایش زنگ':`افزودن درس — ${DAYS[s.day]} زنگ ${fa(s.period)}`,
    `<div class="grid g2">
      ${f('روز',sel('sl_day',DAYS.map((d,i)=>[i,d]),s.day))}
      ${f('زنگ',sel('sl_period',[1,2,3,4,5,6].map(p=>[p,'زنگ '+fa(p)]),s.period))}
      ${f('درس',sel('sl_subject',subs.map(x=>[x.id,x.name]),s.subject_id))}
      ${f('دبیر',sel('sl_teacher',[['','— بدون دبیر —'],...teachers.map(t=>[t.id,t.name])],s.teacher_id||''))}</div>
     <div class="small muted" style="margin-top:10px;line-height:2">🟢 آزاد · 🔴 مشغول در همان ساعت (در این مدرسه یا مدرسه دیگر) — ثبت دبیر مشغول ممکن نیست.</div>`,'slot-save'));
  window._edit=s;
}

function safeHTML(html){
  /* اگر رشته‌ای شامل placeholder خام باشد (مثلاً به دلیل دستکاری اسکریپت توسط پروکسی)، نمایش داده نمی‌شود */
  return (typeof html==='string' && html.indexOf('${')>-1) ? '' : (html||'');
}
function render(){
  const picker=(S.user&&S.showPicker&&isMultiRole())?panelPicker():'';
  const gate=(S.user&&activePersona()==='parent'&&!parentLocked()&&!S.gateSkipped&&!picker)?safeHTML(parentGate()):'';
  $('#root').innerHTML = (S.user?renderShell():renderLogin())+picker+gate;
}
setTimeout(()=>{
  generate(); generateExtras(); generateP8(); generateP9(); generateP10(); loadLog(); applyLog(); initSync();
  const su=localStorage.getItem(SESSION_KEY);
  if(su){const u=db.users.find(x=>x.username===su);if(u){S.user=u;if(u.role==='edu_office'&&S.route==='dashboard')S.route='officedash';}}
  const pk=localStorage.getItem(PERSONA_KEY);
  if(pk&&S.user){S.persona=pk;if(S.route==='dashboard'&&pk==='parent'&&!subOf(S.user.id).active)S.route='subscription';}
  const bs=localStorage.getItem(BOSS_KEY);
  if(bs&&S.user){const b=db.users.find(x=>x.username===bs);if(b&&b.id!==S.user.id)S.boss=b;else localStorage.removeItem(BOSS_KEY);}
  render();
  console.log('داده نمونه:',{مدارس:db.schools.length,کاربران:db.users.length,کلاس‌ها:db.classes.length,حضوروغیاب:db.attendance.length,نمرات:db.grades.length,انضباطی:db.discipline.length,اعلان‌ها:db.notifications.length,اقساط:db.installments.length,تراکنش‌ها:db.transactions.length});
},50);
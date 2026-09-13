/* ═══════════════════════════════════════════════════════════════════
   اطلاعیه‌ها
   اطلاعیهٔ مدرسه یا سراسری (با شناسهٔ مدرسهٔ خالی).
   د.۳ — اطلاعیهٔ فوری/بحرانی اداره:
   - `severity` ∈ normal/urgent/critical (رکوردهای قدیمی بدون فیلد = عادی)
   - `office_id` = ادارهٔ منتشرکننده؛ مدارس فقط اطلاعیهٔ ادارهٔ
     محدودهٔ خود را می‌بینند (فیلتر در myAnnouncements).
   - نمایش: بحرانی بنر قرمز، فوری نوار کهربایی، بج «اطلاعیهٔ اداره».
   - مرتب‌سازی: بحرانی، فوری، سپس تازه‌ترین.
   ═══════════════════════════════════════════════════════════════════ */
const ANN_SEVERITY = { normal: ['عادی', 'b-gray'], urgent: ['فوری', 'b-amber'], critical: ['بحرانی', 'b-red'] };

function viewAnnouncements(){
  const canEdit=['superadmin','manager','teacher'].includes(S.user.role)||S.user.role==='edu_office';
  const rows=myAnnouncements();
  const AUD={all:'همه',teacher:'دبیران',student:'دانش‌آموزان',parent:'اولیا',manager:'مدیران'};
  /* د.۳: فقط اطلاعیه‌های خودِ اداره قابل ویرایش/حذفِ کارشناس است */
  const editable=(a)=>{
    if(S.user.role==='superadmin')return true;
    if(S.user.role==='edu_office')return a.office_id!=null&&Number(a.office_id)===Number(S.user.office_id);
    return canEdit&&(a.school_id===S.user.school_id||a.school_id===null);
  };
  return `<div class="card"><div class="card-head"><h3>اطلاعیه‌ها</h3>${S.user.role==='superadmin'?`<button class="btn ghost" data-act="ann-broadcast">📢 اطلاعیه سراسری</button> `:''}${canEdit?`<button class="btn" data-act="ann-new">➕ اطلاعیه جدید</button>`:''}</div>
   ${rows.length?`<div class="card-body" style="display:grid;gap:12px">${rows.map(a=>{const au=a.created_by?byId('users',a.created_by):null;
    const sev=a.severity&&ANN_SEVERITY[a.severity]?a.severity:'normal';
    const border=sev==='critical'?'3px solid var(--red)':sev==='urgent'?'3px solid var(--amber)':'1px solid var(--border)';
    const bg=sev==='critical'?'var(--red-soft)':sev==='urgent'?'var(--amber-soft)':'var(--surface-2)';
    const office=a.office_id?byId('offices',a.office_id):null;
    return `<div class="card" style="padding:15px;box-shadow:none;background:${bg};border:${border}">
     ${sev!=='normal'?`<div class="row" style="margin-bottom:8px"><span class="badge ${ANN_SEVERITY[sev][1]}" style="font-size:12px">${sev==='critical'?'🚨':'⚠️'} اطلاعیهٔ ${ANN_SEVERITY[sev][0]}</span>${office?`<span class="badge b-purple">🏛️ ${esc(office.name)}</span>`:''}</div>`:''}
     <div class="row"><b style="font-size:15px">${esc(a.title)}</b><span class="badge b-blue">${AUD[a.audience]||'همه'}</span>${office&&sev==='normal'?`<span class="badge b-purple">🏛️ ${esc(office.name)}</span>`:''}<div class="spacer"></div>
      <span class="small muted">${jalali(a.created_at)}</span>${editable(a)?`<button class="icon-btn" title="ویرایش" data-act="ann-edit" data-id="${escAttr(a.id)}">✏️</button> <button class="icon-btn danger" title="حذف" data-act="ann-del" data-id="${escAttr(a.id)}">🗑️</button>`:''}</div>
     <p style="margin:10px 0 0;line-height:2">${esc(a.body)}</p>${au?`<div class="small muted" style="margin-top:6px">✍️ ${esc(au.full_name)}</div>`:''}</div>`;}).join('')}</div>`
   :empty('📢','اطلاعیه‌ای وجود ندارد',canEdit?'اولین اطلاعیه را منتشر کنید.':'به محض انتشار، اینجا نمایش داده می‌شود.')}</div>`;
}

/* ─────────────── د.۳: دادهٔ نمونهٔ اطلاعیه‌های فوری/بحرانی ───────────────
   فقط افزودنیِ محلی (add) — وارد صف همگام‌سازی نمی‌رود.
   رکوردهای قدیمی عمداً بدون severity می‌مانند تا سازگاریِ گذشته آزموده شود. */
function generateUrgentAnnDemo(){
  if(!db.offices || !db.offices.length) return;
  if(db.announcements.some(a=>a.severity==='critical'||a.severity==='urgent')) return;
  const o = db.offices.find(x=>x.county_id) || db.offices[0];
  add('announcements',{school_id:null,office_id:o.id,audience:'all',severity:'critical',pinned:1,
    title:'بحرانی: فردا مدارس محدوده به‌دلیل برودت هوا تعطیل است',
    body:'به اطلاع مدیران می‌رساند فردا تمامی مدارس محدوده تعطیل است. کلاس‌های جبرانی متعاقباً برنامه‌ریزی می‌شود.',
    created_by:(db.users.find(u=>u.office_id===o.id)||{}).id||null,created_at:todayISO(),date:todayISO()});
  add('announcements',{school_id:null,office_id:o.id,audience:'manager',severity:'urgent',pinned:0,
    title:'فوری: ارسال گزارش ایمنی تا پایان هفته',
    body:'مدیران محترم، گزارش مانور ایمنی سالانه را تا پایان هفته در سامانه ثبت کنید.',
    created_by:(db.users.find(u=>u.office_id===o.id)||{}).id||null,created_at:todayISO(),date:todayISO()});
}

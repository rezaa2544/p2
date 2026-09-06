/* ═══════════════════════════════════════════════════════════════════
   اسکان و خانه‌دانش‌آموزی (خوابگاه) — نسخهٔ سبک (دور ۷۸ بند ۷)

   کلیدِ توان: `has_dorm` (پروفایلِ قابلیتِ مدرسه — کلید از دورِ نخست
   وجود داشت ولی ماژولش ساخته نشده بود؛ این ماژول همان کلید را می‌خواند
   و شرطِ تازه‌ای نساخته — قفلِ AD ۱.۱).

   چهار بخش (سبک، روی رکورد، بدون جدولِ پنهان):
   ۱. اتاق‌ها: `dorm_rooms` — نام + ظرفیت.
   ۲. انتصاب: `dorm_assignments` — هر دانش‌آموز حداکثر یک اتاق.
   ۳. وعده‌های غذاییِ هفتگی: `dorm_meals` — (روز، وعده) → منو.
   ۴. مرخصیِ رفت‌وبرگشتِ آخر هفته: روی همان جدولِ `leaves` با
      `kind:'dorm_weekend'` — از مرخصیِ آکادمیک (درخواستِ دانش‌آموز/ولی
      با بررسی) جداست: مدیرِ خوابگاه مستقیم می‌سازد و به اولیا نوتیف
      می‌رود.
   ═══════════════════════════════════════════════════════════════════ */
const DORM_MEAL_KINDS=[['breakfast','صبحانه'],['lunch','ناهار'],['dinner','شام']];
/* روزهای هفته: ۰=شنبه … ۶=جمعه (همان قراردادِ بقیهٔ برنامه) */
const DORM_DAYS=(typeof DAYS_FULL!=='undefined')?DAYS_FULL:['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];

/** اتاق‌های یک مدرسه با شمارِ ساکنان */
function dormRoomList(sid){
  const rooms=(db.dorm_rooms||[]).filter(r=>r.school_id===sid);
  return rooms.map(r=>{
    const occ=(db.dorm_assignments||[]).filter(a=>a.room_id===r.id).length;
    return Object.assign({},r,{occ});
  });
}
/** تک‌واحدیِ انتصاب: دانش‌آموزی حداکثر یک اتاق دارد */
function dormAssignOf(studentId){
  return (db.dorm_assignments||[]).find(a=>a.student_id===studentId)||null;
}
/** وعدهٔ (روز، نوع) یک مدرسه */
function dormMealOf(sid,day,kind){
  return (db.dorm_meals||[]).find(m=>m.school_id===sid&&m.day===day&&m.kind===kind)||null;
}

function viewDorm(){
  const u=S.user, sid=u.school_id;
  if(!sid||!(typeof hasCap==='function')||!hasCap(sid,'has_dorm'))
    return `<div class="card"><div class="card-body">${empty('🏠','این مدرسه بخش اسکان ندارد','توانِ «اسکان و خانه‌دانش‌آموزی» در مودالِ مدرسه روشن است. این صفحه برای همین مدارس معنا دارد.')}</div></div>`;
  const rooms=dormRoomList(sid);
  const assigned=(db.dorm_assignments||[]).filter(a=>a.school_id===sid);
  const occ=assigned.length;
  const cap=rooms.reduce((t,r)=>t+(Number(r.capacity)||0),0);
  return `
  <div class="grid g3" style="margin-bottom:14px">
    ${statCard('🛏️',fa(rooms.length),'اتاق','blue')}
    ${statCard('🧳',fa(occ),'ساکن','green')}
    ${statCard('📏',cap?fa(Math.round(occ/cap*100))+'٪':'—','پرشدگی','amber')}
  </div>
  <div class="card" style="margin-bottom:14px"><div class="card-head">
    <h3>🛏️ اتاق‌ها و ساکنان</h3>
    <button class="btn" data-act="dorm-room-new">➕ اتاق جدید</button></div>
   <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
    ${rooms.length?rooms.map(r=>{
      const list=(db.dorm_assignments||[]).filter(a=>a.room_id===r.id)
        .map(a=>byId('users',a.student_id)).filter(Boolean);
      return `<div style="border:1px solid var(--border);border-radius:12px;padding:12px">
        <div class="row"><b>${esc(r.name)}</b><span class="badge b-gray">${fa(r.occ)}/${fa(r.capacity)}</span>
        <div class="spacer"></div>
        <button class="icon-btn" title="ویرایش" data-act="dorm-room-edit" data-id="${escAttr(r.id)}">✏️</button>
        <button class="icon-btn danger" title="حذف" data-act="dorm-room-del" data-id="${escAttr(r.id)}">🗑️</button></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
        ${list.length?list.map(st=>`<span class="badge b-blue" style="display:inline-flex;gap:5px;align-items:center">${esc(st.full_name)}
           <span role="button" style="cursor:pointer" title="برداشتن از اتاق" data-act="dorm-unassign" data-sid="${escAttr(st.id)}">✕</span></span>`).join(''):'<span class="small muted">خالی</span>'}
        </div>
        <button class="btn ghost sm" style="margin-top:8px;width:100%" data-act="dorm-assign" data-id="${escAttr(r.id)}">➕ انتساب دانش‌آموز</button>
      </div>`;}).join(''):`${empty('🛏️','اتاقی تعریف نشده','اولین اتاق را بسازید.')}`}
   </div></div>
  <div class="card" style="margin-bottom:14px"><div class="card-head">
    <h3>🍽️ وعده‌های غذاییِ هفتگی</h3>
    <span class="small muted">با کلیک روی هر خانه، منوی همان روز/وعده ثبت می‌شود</span></div>
   <div class="card-body" style="overflow-x:auto">
    <table style="min-width:640px"><thead><tr><th style="width:110px">روز</th>${DORM_MEAL_KINDS.map(k=>`<th>${esc(k[1])}</th>`).join('')}</tr></thead><tbody>
    ${DORM_DAYS.map((d,i)=>`<tr><td><b>${esc(d)}</b></td>
      ${DORM_MEAL_KINDS.map(k=>{const m=dormMealOf(sid,i,k[0]);
        return `<td><span style="cursor:pointer;display:block;padding:6px 8px;border:1px dashed var(--border);border-radius:8px;min-height:32px" data-act="dorm-meal" data-day="${i}" data-kind="${k[0]}">${m&&m.menu?esc(m.menu):'<span class="muted small">—</span>'}</span></td>`;}).join('')}</tr>`).join('')}
    </tbody></table></div></div>
  <div class="card"><div class="card-head">
    <h3>🏠 مرخصیِ رفت‌وبرگشتِ آخر هفته</h3>
    <span class="small muted">جدا از مرخصیِ آکادمیک: مستقیمِ مدیر، برای پنجشنبه→جمعهٔ پیشِ رو</span></div>
   <div class="card-body">
    ${occ?`<table><thead><tr><th>دانش‌آموز</th><th>اتاق</th><th>آخرین مرخصیِ آخر هفته</th><th></th></tr></thead><tbody>
    ${assigned.map(a=>{const st=byId('users',a.student_id)||{};const rm=byId('dorm_rooms',a.room_id)||{};
      const last=(db.leaves||[]).filter(l=>l.student_id===st.id&&l.kind==='dorm_weekend')
        .sort((x,y)=>String(y.from_date).localeCompare(String(x.from_date)))[0];
      return `<tr><td><b>${esc(st.full_name||'—')}</b></td><td class="muted">${esc(rm.name||'—')}</td>
      <td class="muted small">${last?(esc(last.from_date)+' تا '+esc(last.to_date)):'—'}</td>
      <td><button class="btn sm" data-act="dorm-leave" data-sid="${escAttr(st.id)}">🏠 مرخصیِ آخر هفته</button></td></tr>`;}).join('')}
    </tbody></table>`
   :`${empty('🧳','هنوز دانش‌آموزی انتصاب نشده است','از بخشِ اتاق‌ها، دانش‌آموز انتصاب کنید.')}`}
   </div></div>`;
}

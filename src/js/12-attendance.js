/* ═══════════════════════════════════════════════════════════════════
   حضور و غیاب
   ثبت روزانه بر پایهٔ کلاس و تاریخ. از ایندکس کلاس+روز استفاده می‌کند.
   ═══════════════════════════════════════════════════════════════════ */
function viewAttendance(){
  const cls=visibleClasses();
  if(!cls.length)return `<div class="card">${empty('🏛️','کلاسی در دسترس نیست','ابتدا باید کلاسی به شما تخصیص یابد.')}</div>`;
  const cid=Number(S.filters.class||cls[0].id), date=S.filters.date||todayISO(), q=(S.filters.q||'').trim();
  const roster=studentsOfClass(cid);
  let studs=roster;
  if(q)studs=roster.filter(s=>s.full_name.includes(q));
  /* ایندکس یک‌بارهٔ حضورِ همان کلاس و همان روز: O(1) به‌جای پیمایش کل جدول */
  const _am=(typeof idxAttByClassDate==='function')?idxAttByClassDate():null;
  let _day;
  if(_am){ _day=new Map(); const _rows=_am.get(cid+'|'+date)||[];
    for(let i=0;i<_rows.length;i++)_day.set(_rows[i].student_id,_rows[i]); }
  const rec=s=>_day?_day.get(s.id):db.attendance.find(a=>a.student_id===s.id&&a.date===date);
  const all=roster.map(rec);
  const cnt=k=>all.filter(a=>a&&a.status===k).length;
  return `<div class="card"><div class="card-head">
    <div class="row"><select class="select" style="width:180px" data-f="class">${cls.map(c=>`<option value="${escAttr(c.id)}" ${c.id===cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
     <input class="input" style="width:160px" type="date" data-f="date" value="${escAttr(date)}" /><span class="badge b-gray">${jalali(date)}</span></div>
    <div class="row"><input class="input" style="width:160px" placeholder="جستجوی دانش‌آموز…" data-f="q" value="${esc(q)}" />
     <button class="btn ghost sm" data-act="att-all" data-s="present">✅ همه حاضر</button>
     <button class="btn ghost sm" data-act="att-all" data-s="absent">❌ همه غایب</button></div></div>
   <div class="card-body row" style="border-bottom:1px solid var(--border)">
    ${['present','absent','late','excused'].map(k=>`<span class="badge ${ATT_BADGE[k]}">${ATT_FA[k]}: ${fa(cnt(k))}</span>`).join('')}
    <span class="badge b-gray">ثبت‌نشده: ${fa(all.filter(a=>!a).length)}</span><div class="spacer"></div><span class="small muted">تغییرات بلافاصله ذخیره می‌شود</span></div>
   ${studs.length?`<div class="table-wrap"><table><thead><tr><th>#</th><th>نام دانش‌آموز</th><th>ثبت وضعیت</th><th>وضعیت فعلی</th></tr></thead><tbody>
    ${studs.map((s,i)=>{const r=rec(s);return `<tr><td class="muted">${fa(i+1)}</td><td><b>${esc(s.full_name)}</b>${r&&r.note?`<div class="small muted">${esc(r.note)}</div>`:''}</td>
     <td>${['present','absent','late','excused'].map(k=>`<button class="att-btn ${r&&r.status===k?'on-'+k:''}" data-act="att-set" data-id="${escAttr(s.id)}" data-s="${escAttr(k)}">${ATT_FA[k]}</button>`).join('')}</td>
     <td>${r?`<span class="badge ${ATT_BADGE[r.status]}">${ATT_FA[r.status]}</span>`:'<span class="badge b-gray">ثبت نشده</span>'}</td></tr>`;}).join('')}
   </tbody></table></div>`:empty('🔍','دانش‌آموزی یافت نشد','این کلاس دانش‌آموزی ندارد یا جستجو نتیجه‌ای نداشت.')}</div>`;
}

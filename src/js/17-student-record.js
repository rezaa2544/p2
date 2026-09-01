/* ============================ student record ============================ */
function viewRecord(sid){
  const gr=db.grades.filter(g=>g.student_id===sid);
  const att=db.attendance.filter(a=>a.student_id===sid).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const disc=db.discipline.filter(d=>d.student_id===sid).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const bySub={};gr.forEach(g=>{(bySub[g.subject_id]=bySub[g.subject_id]||[]).push(g);});
  const tabs=[['grades','📝 کارنامه'],['attendance','✅ حضور و غیاب'],['discipline','⚖️ پرونده انضباطی']];
  let body='';
  if(S.tab==='grades') body = Object.keys(bySub).length?`<div class="card-body" style="display:grid;gap:14px">${Object.entries(bySub).map(([id,l])=>{const a=avgOf(l);
    return `<div style="border:1px solid var(--border);border-radius:12px;padding:14px"><div class="row"><b>${esc(byId('subjects',Number(id)).name)}</b><div class="spacer"></div>
     <span class="badge ${a>=17?'b-green':a>=12?'b-blue':'b-red'}">میانگین ${fa(a.toFixed(2))}</span></div>
     <div style="margin:8px 0 12px">${bar(a,20,a>=17?'var(--green)':a>=12?'var(--primary)':'var(--red)')}</div>
     <div class="row">${l.map(g=>`<span class="badge b-gray">${esc(g.term)} • ${esc(g.exam_type)}: <b>${fa(g.score)}</b></span>`).join('')}</div></div>`;}).join('')}</div>`
    :empty('📝','نمره‌ای ثبت نشده','به محض ثبت نمره، کارنامه اینجا نمایش داده می‌شود.');
  if(S.tab==='attendance'){const cnt=k=>att.filter(a=>a.status===k).length;
    body= att.length?`<div class="card-body row">${['present','absent','late','excused'].map(k=>`<span class="badge ${ATT_BADGE[k]}">${ATT_FA[k]}: ${fa(cnt(k))} روز</span>`).join('')}</div>
     <div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>وضعیت</th><th>توضیح</th></tr></thead><tbody>
     ${att.slice(0,60).map(r=>`<tr><td>${jalali(r.date)}</td><td><span class="badge ${ATT_BADGE[r.status]}">${ATT_FA[r.status]}</span></td><td class="muted">${esc(r.note||'—')}</td></tr>`).join('')}</tbody></table></div>`
     :empty('✅','سابقه حضور و غیاب خالی است','');}
  if(S.tab==='discipline') body= disc.length?`<div class="card-body row">
     <span class="badge b-green">مجموع مثبت: ${fa(disc.filter(d=>d.points>0).reduce((a,b)=>a+b.points,0))}</span>
     <span class="badge b-red">مجموع منفی: ${fa(disc.filter(d=>d.points<0).reduce((a,b)=>a+b.points,0))}</span></div>
    <div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>نوع</th><th>عنوان</th><th>توضیحات</th><th>امتیاز</th></tr></thead><tbody>
    ${disc.map(d=>`<tr><td>${jalali(d.date)}</td><td><span class="badge ${d.kind==='positive'?'b-green':'b-red'}">${d.kind==='positive'?'👍 مثبت':'👎 منفی'}</span></td><td>${esc(d.title)}</td>
     <td class="muted small" style="white-space:normal;max-width:260px">${esc(d.description||'—')}</td><td><b style="color:${d.points>=0?'var(--green)':'var(--red)'}">${fa(d.points)}</b></td></tr>`).join('')}</tbody></table></div>`
    :empty('🌟','پرونده انضباطی پاک است','هیچ مورد انضباطی ثبت نشده است.');
  return `<div class="card"><div class="card-head" style="padding-bottom:0;border-bottom:none"><div class="tabs">
    ${tabs.map(t=>`<div class="tab ${S.tab===t[0]?'active':''}" data-act="tab" data-t="${t[0]}">${t[1]}</div>`).join('')}</div></div>${body}</div>`;
}

function viewChildren(){
  const kids=db.parent_links.filter(p=>p.parent_id===S.user.id).map(p=>byId('users',p.student_id)).filter(Boolean);
  if(!kids.length)return `<div class="card">${empty('👨‍👩‍👦','دانش‌آموزی متصل نیست','با مدیر مدرسه تماس بگیرید.')}</div>`;
  const active=S.child||kids[0].id;
  return `<div class="card"><div class="card-body row">
   ${kids.map(k=>`<button class="btn ${active===k.id?'':'ghost'}" data-act="child" data-id="${k.id}">🎒 ${esc(k.full_name)} <span class="small">(${esc((classOf(k.id)||{}).name||'—')})</span></button>`).join('')}
   </div></div>${summaryBlock(active)}${viewRecord(active)}`;
}

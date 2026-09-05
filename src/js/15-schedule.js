/* ═══════════════════════════════════════════════════════════════════
   برنامهٔ هفتگی
   جدول شش‌روزه؛ نمای دبیر و دانش‌آموز متفاوت است.

   بند ۱.۲ — برنامهٔ کلاسی با دبیر پایه (درس، دبیر، پایه):
   - نمای مدیر/سوپرادمین برای هر کلاس، پایهٔ کلاس و دبیر پایه
     (سرپرست) را نشان می‌دهد.
   - دبیری که دبیر پایهٔ کلاسی است، با یک انتخابگر، برنامهٔ کامل
     همان کلاس (همهٔ درس‌ها و دبیرها) را می‌بیند — نه فقط کلاس‌های
     خودش.
   ═══════════════════════════════════════════════════════════════════ */
function viewSchedule(){
  const u=S.user;
  const byTeacher=u.role==='teacher';
  const cls=visibleClasses();
  /* کلاس‌هایی که این دبیر دبیر پایه (سرپرست) آن‌هاست */
  const homeCls=byTeacher?cls.filter(c=>c.homeroom_teacher_id===u.id):[];
  const homePick=byTeacher?Number(S.filters.homepick||0):0;
  const inHome=!!(homePick&&homeCls.some(c=>c.id===homePick));
  const cid=byTeacher?(inHome?homePick:null):Number(S.filters.class||(u.role==='student'?(classOf(u.id)||{}).id:(cls[0]||{}).id));
  const rows=inHome?db.schedule.filter(s=>s.class_id===cid):(byTeacher?db.schedule.filter(s=>s.teacher_id===u.id):db.schedule.filter(s=>s.class_id===cid));
  const cell=(d,p)=>rows.find(r=>r.day===d&&r.period===p);
  const canEditSched=['manager','superadmin'].includes(u.role)&&!!cid;
  const cObj=(byTeacher&&!inHome)?null:byId('classes',cid);
  const ht=cObj&&cObj.homeroom_teacher_id?byId('users',cObj.homeroom_teacher_id):null;
  /* در نمای «سرپرستی» نام دبیرِ هر خانه مهم است؛ در نمای عادی دبیر
     نام کلاس را می‌بیند. */
  const showTeacher=!byTeacher||inHome;
  const title=inHome?'برنامهٔ کلاسی '+(cObj?esc(cObj.name):''):(byTeacher?'برنامه هفتگی تدریس من':'برنامه هفتگی');
  return `<div class="card"><div class="card-head"><h3>${title}</h3>
   ${!byTeacher&&u.role!=='student'?`<select class="select" style="width:190px" data-f="class">${cls.map(c=>`<option value="${escAttr(c.id)}" ${c.id===cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:''}
   ${byTeacher&&homeCls.length?`<select class="select" style="width:210px" data-f="homepick"><option value="">تدریس من</option>${homeCls.map(c=>`<option value="${escAttr(c.id)}" ${c.id===homePick?'selected':''}>سرپرستی: ${esc(c.name)}</option>`).join('')}</select>`:''}
   ${cObj?`<span class="badge b-gray" style="margin-inline-start:8px">پایه: ${esc(cObj.grade||'—')}</span><span class="badge b-purple" style="margin-inline-start:6px">دبیر پایه: ${ht?esc(ht.full_name):'بدون دبیر پایه'}</span>`:''}</div>
   ${(rows.length||canEditSched)?`<div class="card-body table-wrap"><div class="timetable"><div></div>${DAYS.map(d=>`<div class="tt-head"><b>${d}</b></div>`).join('')}
    ${[1,2,3,4,5,6].map(p=>`<div class="tt-head" style="display:grid;place-items:center"><span class="badge b-blue">زنگ ${fa(p)}</span></div>
     ${DAYS.map((_,d)=>{const c=cell(d,p);
       if(c)return `<div class="tt-cell" ${canEditSched?`style="cursor:pointer;position:relative" data-act="slot-edit" data-day="${escAttr(d)}" data-period="${escAttr(p)}" data-sid="${escAttr(c.id)}" data-class="${escAttr(cid)}"`:''}>
         <b>${esc((byId('subjects',c.subject_id)||{}).name||'—')}</b><span>${esc(showTeacher?(c.teacher_id?byId('users',c.teacher_id).full_name:'بدون دبیر'):byId('classes',c.class_id).name)}</span></div>`;
       return `<div class="tt-cell tt-empty" ${canEditSched?`style="cursor:pointer" data-act="slot-edit" data-day="${escAttr(d)}" data-period="${escAttr(p)}" data-class="${escAttr(cid)}"`:''}><span class="muted small">${canEditSched?'+ افزودن':'—'}</span></div>`;}).join('')}`).join('')}
   </div>${canEditSched?`<div class="small muted" style="margin-top:12px;line-height:2">💡 روی هر خانه بزنید تا درس و دبیر آن را تعیین کنید. اگر دبیر در همان ساعت در <b>مدرسه دیگری</b> کلاس داشته باشد، ثبت نمی‌شود.</div>`:''}</div>`:empty('🗓️','برنامه‌ای ثبت نشده','برنامه هفتگی هنوز تنظیم نشده است.')}</div>`;
}

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
/* ─────────────── بند ۶.۵ (نسخهٔ سبک): کنترل تداخل + پیشنهاد جایگزین ───────────────
   «تولید خودکار» نمی‌کنیم؛ فقط تداخلِ موجود را می‌یابیم و جایِ آزاد
   پیشنهاد می‌دهیم. مدیر خودش جابه‌جا می‌کند.
   تداخلِ دبیر **سراسری** است (دبیر می‌تواند در چند مدرسه باشد)؛
   تداخلِ کلاس طبیعتاً درونِ همان کلاس است. */
function scheduleConflicts(schoolId){
  const mine=(db.schedule||[]).filter(x=>x.school_id===schoolId);
  const out=[], seenT={}, seenC={};
  mine.forEach(r=>{
    if(r.teacher_id){
      const k='t|'+r.teacher_id+'|'+r.day+'|'+r.period;
      if(seenT[k])return; seenT[k]=1;
      const all=db.schedule.filter(x=>x.teacher_id===r.teacher_id&&x.day===r.day&&x.period===r.period);
      if(all.length>1)out.push({kind:'teacher',key:k,teacher_id:r.teacher_id,day:r.day,period:r.period,rows:all.slice().sort((a,b)=>a.id-b.id)});
    }
    const kc='c|'+r.class_id+'|'+r.day+'|'+r.period;
    if(seenC[kc])return; seenC[kc]=1;
    const allc=db.schedule.filter(x=>x.class_id===r.class_id&&x.day===r.day&&x.period===r.period);
    if(allc.length>1)out.push({kind:'class',key:kc,class_id:r.class_id,day:r.day,period:r.period,rows:allc.slice().sort((a,b)=>a.id-b.id)});
  });
  out.sort((a,b)=>(a.day-b.day)||(a.period-b.period)||(a.kind===b.kind?0:(a.kind==='class'?-1:1)));
  return out;
}
/** جای‌های آزادِ پیشنهادی برای یک زنگ (کلاس و دبیر هر دو آزاد) — حداکثر ۳ */
function suggestSlots(rowId){
  const row=byId('schedule',rowId);
  if(!row)return [];
  /* فقط روی روزهای کاریِ همین مدرسه (پیش‌فرض شنبه تا سه‌شنبه) */
  const days=(typeof workDaysOf==='function'?workDaysOf(row.school_id):[0,1,2,3])
    .filter(d=>(typeof isSchoolDay==='function'?isSchoolDay(d):(d>=0&&d<=4)));
  const out=[];
  for(let di=0;di<days.length&&out.length<3;di++){
    const d=days[di];
    for(let p=1;p<=6&&out.length<3;p++){
      if(d===row.day&&p===row.period)continue;
      if(db.schedule.some(x=>x.class_id===row.class_id&&x.day===d&&x.period===p&&x.id!==row.id))continue;
      if(row.teacher_id&&teacherBusyAt(row.teacher_id,d,p,row.id))continue;
      out.push({day:d,period:p});
    }
  }
  return out;
}
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
  /* جابه‌جای‌های امروز (بند ۱.۵): یک نقشهٔ زنگ ⇐ جابه‌جای برای
     نمایش در خانه‌ها — بدون پیمایش تکراری در هر خانه. */
  const subsToday=Object.create(null);
  if(typeof db!=='undefined'&&db.substitutions)db.substitutions.forEach(x=>{if(x.date===todayISO())subsToday[x.schedule_id]=x;});
  const cell=(d,p)=>rows.find(r=>r.day===d&&r.period===p);
  const canEditSched=['manager','superadmin'].includes(u.role)&&!!cid;
  const cObj=(byTeacher&&!inHome)?null:byId('classes',cid);
  const ht=cObj&&cObj.homeroom_teacher_id?byId('users',cObj.homeroom_teacher_id):null;
  /* در نمای «سرپرستی» نام دبیرِ هر خانه مهم است؛ در نمای عادی دبیر
     نام کلاس را می‌بیند. */
  const showTeacher=!byTeacher||inHome;
  const title=inHome?'برنامهٔ کلاسی '+(cObj?esc(cObj.name):''):(byTeacher?'برنامه هفتگی تدریس من':'برنامه هفتگی');
  /* کنترل تداخل (بند ۶.): مدیر = کامل با پیشنهاد؛ دبیر = فقط اطلاع */
  const confs=scheduleConflicts(u.school_id);
  let confBlock='';
  if(u.role==='manager'||u.role==='superadmin'){
    if(confs.length){
      confBlock=`<div class="card" style="border-color:var(--red);background:var(--red-soft,#fdf2f4)">
       <div class="card-body" style="line-height:2.2">
       <b style="color:var(--red)">⚠️ ${fa(confs.length)} تداخل در برنامهٔ هفتگی</b>
       ${confs.map(c=>{
         const who=c.kind==='teacher'?(byId('users',c.teacher_id)||{}).full_name:(byId('classes',c.class_id)||{}).name;
         const other=c.kind==='teacher'
           ?c.rows.map(r=>esc((byId('classes',r.class_id)||{}).name||'—')+((r.school_id!==u.school_id)?' («'+esc((byId('schools',r.school_id)||{}).name||'؟')+'»)':'')).join(' و ')
           :c.rows.map(r=>esc((byId('subjects',r.subject_id)||{}).name||'—')).join(' و ');
         return `<div style="margin-top:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:#fff">
          <div><b>${c.kind==='teacher'?'دبیر':'کلاس'}: ${esc(who)}</b> — ${DAYS[c.day]} زنگ ${fa(c.period)}: ${other}</div>
          ${c.rows.filter(r=>r.school_id===u.school_id).map(r=>{
            const sugs=suggestSlots(r.id);
            const label=c.kind==='teacher'?'زنگ «'+esc((byId('classes',r.class_id)||{}).name||'')+'»':'درس «'+esc((byId('subjects',r.subject_id)||{}).name||'')+'»';
            return `<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
             <span class="small muted">${label}:</span>
             <button class="btn ghost sm" data-act="sched-conf-sug" data-key="${escAttr(c.key)}" data-sid="${r.id}">🔎 پیشنهاد جایِ آزاد</button>
             <div id="conf-sug-${c.key.replace(/[^a-z0-9]/gi,'')}-${r.id}" style="display:none;flex-wrap:wrap;gap:6px">
               ${sugs.length?sugs.map(g=>`<button class="btn sm" data-act="sched-conf-move" data-sid="${r.id}" data-day="${g.day}" data-period="${g.period}">جا‌به‌جایی به ${DAYS[g.day]} زنگ ${fa(g.period)}</button>`).join(''):'<span class="small" style="color:var(--red)">جایِ آزاد پیدا نشد — یک زنگ را دستی خالی کنید.</span>'}
             </div></div>`;
          }).join('')}
         </div>`;
       }).join('')}
       </div></div>`;
    } else {
      confBlock=`<div class="card"><div class="card-body"><span class="badge b-green">✅ بدون تداخل — همهٔ زنگ‌ها آزاد است</span></div></div>`;
    }
  } else if(u.role==='teacher'){
    const mine=confs.filter(c=>c.kind==='teacher'&&c.teacher_id===u.id);
    if(mine.length){
      confBlock=`<div class="card" style="border-color:var(--amber)"><div class="card-body" style="line-height:2">
       <b style="color:var(--amber)">⚠️ ${fa(mine.length)} تداخل ساعتی شما در برنامه</b>
       <div class="small muted">${mine.map(c=>`${DAYS[c.day]} زنگ ${fa(c.period)} — با کلاس «${esc((byId('classes',c.rows[0].class_id)||{}).name||'')}»`).join(' · ')}</div>
       <div class="small muted">جابه‌جایی را مدیر انجام می‌دهد.</div></div></div>`;
    }
  }
  return confBlock+`<div class="card"><div class="card-head"><h3>${title}</h3>
   ${!byTeacher&&u.role!=='student'?`<select class="select" style="width:190px" data-f="class">${cls.map(c=>`<option value="${escAttr(c.id)}" ${c.id===cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:''}
   ${byTeacher&&homeCls.length?`<select class="select" style="width:210px" data-f="homepick" aria-label="انتخاب کلاس سرپرستی"><option value="">تدریس من</option>${homeCls.map(c=>`<option value="${escAttr(c.id)}" ${c.id===homePick?'selected':''}>سرپرستی: ${esc(c.name)}</option>`).join('')}</select>`:''}
   ${cObj?`<span class="badge b-gray" style="margin-inline-start:8px">پایه: ${esc(cObj.grade||'—')}</span><span class="badge b-purple" style="margin-inline-start:6px">دبیر پایه: ${ht?esc(ht.full_name):'بدون دبیر پایه'}</span>`:''}${canEditSched?`<button class="btn ghost sm" data-act="schedgen-open" style="margin-inline-start:8px">⚙️ تولید خودکار</button>`:''}</div>
   ${(rows.length||canEditSched)?`<div class="card-body table-wrap"><div class="timetable"><div></div>${DAYS.map(d=>`<div class="tt-head"><b>${d}</b></div>`).join('')}
    ${[1,2,3,4,5,6].map(p=>`<div class="tt-head" style="display:grid;place-items:center"><span class="badge b-blue">زنگ ${fa(p)}</span></div>
     ${DAYS.map((_,d)=>{const c=cell(d,p);
       if(c)return `<div class="tt-cell" ${canEditSched?`style="cursor:pointer;position:relative" data-act="slot-edit" data-day="${escAttr(d)}" data-period="${escAttr(p)}" data-sid="${escAttr(c.id)}" data-class="${escAttr(cid)}"`:''}>
         <b>${esc((byId('subjects',c.subject_id)||{}).name||'—')}</b><span>${esc(showTeacher?(c.teacher_id?byId('users',c.teacher_id).full_name:'بدون دبیر'):byId('classes',c.class_id).name)}</span>${subsToday[c.id]?`<span class="badge b-amber" style="display:block;margin-top:3px">🔁 جابه‌جای: ${esc((byId('users',subsToday[c.id].sub_teacher_id)||{}).full_name||'—')}</span>`:''}</div>`;
       return `<div class="tt-cell tt-empty" ${canEditSched?`style="cursor:pointer" data-act="slot-edit" data-day="${escAttr(d)}" data-period="${escAttr(p)}" data-class="${escAttr(cid)}"`:''}><span class="muted small">${canEditSched?'+ افزودن':'—'}</span></div>`;}).join('')}`).join('')}
   </div>${canEditSched?`<div class="small muted" style="margin-top:12px;line-height:2">💡 روی هر خانه بزنید تا درس و دبیر آن را تعیین کنید. اگر دبیر در همان ساعت در <b>مدرسه دیگری</b> کلاس داشته باشد، ثبت نمی‌شود.</div>`:''}
   ${canEditSched?(()=>{const clsSubs=db.substitutions.filter(x=>rows.some(r=>r.id===x.schedule_id)).sort((a,b)=>a.date<b.date?-1:1);
     return clsSubs.length?`<div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)">
       <b class="small">🔁 جابه‌جای‌های موقت این کلاس</b>
       <div style="line-height:2.3;margin-top:4px">${clsSubs.map(x=>{const r=rows.find(rr=>rr.id===x.schedule_id)||{};
         return `<span style="margin-inline-end:18px" data-l="جابه‌جای">${esc(jalali(x.date))} — ${esc(DAYS[r.day]||'')} زنگ ${fa(r.period||0)}، ${esc((byId('subjects',r.subject_id)||{}).name||'—')} — <b>${esc((byId('users',x.sub_teacher_id)||{}).full_name||'—')}</b> <a data-act="sub-del-route" data-id="${escAttr(x.id)}" style="color:var(--red);cursor:pointer;font-weight:600">حذف</a></span>`;}).join('')}</div>
     </div>`:'';})():''}</div>`:empty('🗓️','برنامه‌ای ثبت نشده','برنامه هفتگی هنوز تنظیم نشده است.')}</div>`;
}

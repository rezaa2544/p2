/* ═══════════════════════════════════════════════════════════════════
   داشبورد
   نمای کلی هر نقش. هر نقش تابع خودش را دارد؛ داده از ایندکس می‌آید.
   ═══════════════════════════════════════════════════════════════════ */
function statCard(icon,val,label,tone){const m={blue:['var(--primary-soft)','var(--primary)'],green:['var(--green-soft)','var(--green)'],red:['var(--red-soft)','var(--red)'],amber:['var(--amber-soft)','var(--amber)'],purple:['var(--purple-soft)','var(--purple)']}[tone||'blue'];
 return `<div class="card stat"><div class="stat-icon" style="background:${m[0]};color:${m[1]}">${icon}</div><div><b>${val}</b><span>${esc(label)}</span></div></div>`;}

function annCard(){
  const list=myAnnouncements().slice(0,3);
  return `<div class="card"><div class="card-head"><h3>📢 آخرین اطلاعیه‌ها</h3><button class="btn ghost sm" data-act="go" data-r="announcements">مشاهده همه</button></div>
   ${list.length?`<div class="card-body" style="display:grid;gap:12px">${list.map(a=>`<div style="border-right:3px solid var(--primary);padding-right:12px"><b>${esc(a.title)}</b><div class="small muted" style="line-height:1.9">${esc(a.body)}</div><div class="small muted">${jalali(a.created_at)}</div></div>`).join('')}</div>`:empty('📭','اطلاعیه‌ای وجود ندارد','هنوز اطلاعیه‌ای منتشر نشده است.')}</div>`;
}

function viewDashboard(){
  const u=S.user;
  if(u.role==='superadmin'||u.role==='manager')
    return adminDash()
      + (typeof notifyDailyCard==='function'?notifyDailyCard():'')
      + annCard();
  if(u.role==='teacher')return teacherDash()+annCard();
  return familyDash()+annCard();
}

function adminDash(){
  const u=S.user, sid=u.role==='manager'?u.school_id:null;
  const F=a=>sid?a.filter(x=>x.school_id===sid):a;
  const users=F(db.users.filter(x=>x.role!=='superadmin'));
  const counts={schools:sid?1:db.schools.length,students:users.filter(x=>x.role==='student').length,teachers:users.filter(x=>x.role==='teacher').length,parents:users.filter(x=>x.role==='parent').length,classes:F(db.classes).length};
  const att=F(db.attendance);
  const today=todayISO(), attToday=att.filter(a=>a.date===today);
  const tot=attToday.length;
  /* یک پیمایش به‌جای ۱۴ پیمایش کامل جدول حضور */
  const _agg=new Map();
  for(let i=0;i<att.length;i++){const a=att[i];let b=_agg.get(a.date);
    if(!b){b={n:0,p:0};_agg.set(a.date,b);}
    b.n++; if(a.status==='present')b.p++;}
  const dates=[..._agg.keys()].sort().slice(-14);
  const trend=dates.map(d=>{const b=_agg.get(d);return{d,rate:b&&b.n?Math.round(b.p/b.n*1000)/10:0};});
  const grades=F(db.grades);
  const _gs=new Map();
  for(let i=0;i<grades.length;i++){const g=grades[i];let b=_gs.get(g.school_id);
    if(!b){b={s:0,n:0};_gs.set(g.school_id,b);}
    b.s+=g.score; b.n++;}
  const avgBySchool=(sid?[byId('schools',sid)]:db.schools).map(s=>{const b=_gs.get(s.id);
    return {name:s.name,avg:(b&&b.n?b.s/b.n:0).toFixed(2)};}).filter(x=>x.avg>0).sort((a,b)=>b.avg-a.avg);
  const perStudent={};grades.forEach(g=>{(perStudent[g.student_id]=perStudent[g.student_id]||[]).push(g);});
  const top=Object.entries(perStudent).map(([id,l])=>({u:byId('users',Number(id)),avg:avgOf(l)})).filter(x=>x.u).sort((a,b)=>b.avg-a.avg).slice(0,5);
  const disc=F(db.discipline);
  return `<div class="grid g4">
    ${u.role==='superadmin'?statCard('🏫',fa(counts.schools),'مدرسه تحت پوشش','purple'):''}
    ${statCard('🎒',fa(counts.students),'دانش‌آموز','blue')}
    ${statCard('👩‍🏫',fa(counts.teachers),'دبیر','green')}
    ${statCard('🏛️',fa(counts.classes),'کلاس فعال','amber')}
    ${u.role==='manager'?statCard('👨‍👩‍👦',fa(counts.parents),'ولی ثبت‌شده','purple'):''}
   </div>
   <div class="grid g2">
    <div class="card"><div class="card-head"><h3>روند حضور روزهای اخیر</h3><span class="badge b-blue">درصد حضور</span></div>
     <div class="card-body">${trend.length?`<div class="chart">${trend.map(t=>`<div class="col" title="${escAttr(t.rate)}%"><i style="height:${t.rate}%"></i><span>${new Date(t.d).toLocaleDateString('fa-IR-u-ca-persian',{day:'numeric'})}</span></div>`).join('')}</div>`:empty('📈','داده‌ای نیست','')}</div></div>
    <div class="card"><div class="card-head"><h3>وضعیت حضور امروز</h3><span class="muted small">${fa(tot)} رکورد</span></div>
     ${tot?`<div class="card-body" style="display:grid;gap:13px">${['present','absent','late','excused'].map(k=>{const n=attToday.filter(a=>a.status===k).length;
      return `<div><div class="row"><span>${ATT_FA[k]}</span><div class="spacer"></div><b>${fa(n)}</b><span class="muted small">(${fa(Math.round(n/tot*100))}٪)</span></div>${bar(n,tot,ATT_COLOR[k])}</div>`;}).join('')}
      <div class="row"><span class="badge b-green">👍 موارد مثبت: ${fa(disc.filter(d=>d.kind==='positive').length)}</span><span class="badge b-red">👎 موارد منفی: ${fa(disc.filter(d=>d.kind==='negative').length)}</span></div></div>`
      :empty('🕗','امروز حضور و غیابی ثبت نشده','از پنل دبیر می‌توانید ثبت کنید.')}</div>
   </div>
   <div class="grid g2">
    <div class="card"><div class="card-head"><h3>میانگین نمرات ${u.role==='superadmin'?'به تفکیک مدرسه':'مدرسه'}</h3></div>
     <div class="card-body" style="display:grid;gap:12px">${avgBySchool.map(s=>`<div><div class="row"><span>${esc(s.name)}</span><div class="spacer"></div><b>${fa(s.avg)}</b></div>${bar(s.avg,20,'linear-gradient(90deg,#7b5cf0,#2f6bff)')}</div>`).join('')}</div></div>
    <div class="card"><div class="card-head"><h3>🏅 دانش‌آموزان برتر</h3></div>
     <div class="table-wrap"><table><thead><tr><th>#</th><th>نام</th><th>کلاس</th><th>معدل</th></tr></thead><tbody>
      ${top.map((t,i)=>`<tr><td>${fa(i+1)}</td><td>${esc(t.u.full_name)}</td><td class="muted">${esc((classOf(t.u.id)||{}).name||'—')}</td><td><span class="badge b-green">${fa(t.avg.toFixed(2))}</span></td></tr>`).join('')}
     </tbody></table></div></div>
   </div>`;
}

function teacherDash(){
  const u=S.user, cls=teacherClasses(u.id);
  const students=new Set();cls.forEach(c=>db.enrollments.filter(e=>e.class_id===c.id).forEach(e=>students.add(e.student_id)));
  const mine=db.grades.filter(g=>g.teacher_id===u.id);
  const sched=db.schedule.filter(s=>s.teacher_id===u.id).sort((a,b)=>a.day-b.day||a.period-b.period).slice(0,6);
  return `<div class="grid g4">
   ${statCard('🏛️',fa(cls.length),'کلاس تحت تدریس','blue')}
   ${statCard('🎒',fa(students.size),'دانش‌آموز','green')}
   ${statCard('📝',fa(mine.length),'نمره ثبت‌شده','amber')}
   ${statCard('📊',fa(avgOf(mine).toFixed(2)),'میانگین نمرات من','purple')}</div>
   <div class="grid g2">
    <div class="card"><div class="card-head"><h3>کلاس‌های من</h3><button class="btn sm" data-act="go" data-r="attendance">ثبت حضور و غیاب</button></div>
     ${cls.length?`<div class="card-body" style="display:grid;gap:8px">${cls.map(c=>`<div class="row" style="background:var(--surface-2);padding:10px 14px;border-radius:10px"><b>${esc(c.name)}</b><span class="muted small">${fa(db.enrollments.filter(e=>e.class_id===c.id).length)} دانش‌آموز</span><div class="spacer"></div><button class="btn ghost sm" data-act="go" data-r="grades">ثبت نمره</button></div>`).join('')}</div>`:empty('🏛️','کلاسی تخصیص نیافته','')}</div>
    <div class="card"><div class="card-head"><h3>🗓️ زنگ‌های پیش‌رو</h3><button class="btn ghost sm" data-act="go" data-r="schedule">برنامه کامل</button></div>
     <div class="table-wrap"><table><thead><tr><th>روز</th><th>زنگ</th><th>درس</th><th>کلاس</th></tr></thead><tbody>
     ${sched.map(s=>`<tr><td>${DAYS[s.day]}</td><td><span class="badge b-blue">زنگ ${fa(s.period)}</span></td><td>${esc((byId('subjects',s.subject_id)||{}).name||'—')}</td><td class="muted">${esc(byId('classes',s.class_id).name)}</td></tr>`).join('')}
     </tbody></table></div></div></div>`;
}

function studentSummary(sid){
  const st=byId('users',sid), cls=classOf(sid);
  const gr=db.grades.filter(g=>g.student_id===sid);
  const avg=avgOf(gr);
  const att=db.attendance.filter(a=>a.student_id===sid);
  const disc=db.discipline.filter(d=>d.student_id===sid);
  const bySub={};gr.forEach(g=>{(bySub[g.subject_id]=bySub[g.subject_id]||[]).push(g);});
  const subs=Object.entries(bySub).map(([id,l])=>({name:(byId('subjects',Number(id))||{}).name||'—',avg:avgOf(l)})).sort((a,b)=>b.avg-a.avg);
  let rank=1,size=0;
  if(cls){const peers=studentsOfClass(cls.id);size=peers.length;
    /* ایندکس نمره بر اساس دانش‌آموز: یک پیمایش به‌جای پیمایش کل جدول برای هر هم‌کلاسی */
    const _gi=(typeof idxGradesByStudent==='function')?idxGradesByStudent():null;
    rank=1+peers.filter(p=>{
      const gl=_gi?(_gi.get(p.id)||[]):db.grades.filter(g=>g.student_id===p.id);
      return avgOf(gl)>avg;
    }).length;}
  return {st,cls,avg,att,disc,subs,rank,size,points:disc.reduce((a,b)=>a+b.points,0)};
}

function summaryBlock(sid){
  const d=studentSummary(sid), tot=d.att.length;
  const cnt=k=>d.att.filter(a=>a.status===k).length;
  return `<div class="grid g4">
   ${statCard('🎒',esc(d.st.full_name),d.cls?'کلاس '+d.cls.name:'بدون کلاس','blue')}
   ${statCard('📊',fa(d.avg.toFixed(2)),'معدل کل','green')}
   ${statCard('🏅',fa(d.rank)+' از '+fa(d.size),'رتبه در کلاس','amber')}
   ${statCard('⚖️',fa(d.points),'امتیاز انضباطی ('+fa(d.disc.length)+' مورد)',d.points>=0?'purple':'red')}</div>
   <div class="grid g2">
    <div class="card"><div class="card-head"><h3>وضعیت حضور</h3><span class="badge b-green">${fa(tot?Math.round(cnt('present')/tot*100):0)}٪ حضور</span></div>
     <div class="card-body" style="display:grid;gap:12px">${['present','absent','late','excused'].map(k=>`<div><div class="row"><span>${ATT_FA[k]}</span><div class="spacer"></div><b>${fa(cnt(k))} روز</b></div>${bar(cnt(k),tot,ATT_COLOR[k])}</div>`).join('')}</div></div>
    <div class="card"><div class="card-head"><h3>میانگین به تفکیک درس</h3><button class="btn ghost sm" data-act="go" data-r="${escAttr(S.user.role==='student'?'record':'children')}">پرونده کامل</button></div>
     ${d.subs.length?`<div class="card-body" style="display:grid;gap:10px">${d.subs.map(s=>`<div><div class="row"><span>${esc(s.name)}</span><div class="spacer"></div><b style="color:${s.avg>=17?'var(--green)':s.avg>=12?'var(--text)':'var(--red)'}">${fa(s.avg.toFixed(2))}</b></div>${bar(s.avg,20,s.avg>=17?'var(--green)':s.avg>=12?'var(--primary)':'var(--red)')}</div>`).join('')}</div>`:empty('📝','نمره‌ای ثبت نشده','')}</div>
   </div>`;
}

function familyDash(){
  const u=S.user;
  const kids=u.role==='student'?[u.id]:db.parent_links.filter(p=>p.parent_id===u.id).map(p=>p.student_id);
  if(!kids.length)return `<div class="card">${empty('👨‍👩‍👦','دانش‌آموزی متصل نیست','با مدیر مدرسه تماس بگیرید.')}</div>`;
  return kids.map(summaryBlock).join('');
}

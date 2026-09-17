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
      + (typeof visitorDashCard==='function'?visitorDashCard():'') /* E.9 */
      + annCard();
  /* نگهبان (E.9): داشبوردش میزِ پذیرش است */
  if(u.role==='guard')
    return (typeof visitorDashCard==='function'?visitorDashCard():'') + annCard();
  if(u.role==='teacher')return teacherDash()+annCard();
  /* مشاور: نه داشبورد مدیر (دادهٔ سراسری مدرسه) نه داشبورد ولی —
     داشبورد خودش، مبتنی بر صف ارجاع */
  if(u.role==='counselor')return counselorDash()+annCard();
  return familyDash()+annCard();
}

function managerExceptionPanel(sid, attToday, users, perStudent){
  const items = [];
  const unexcused = (attToday || []).filter(a => a.status === 'absent');
  if(unexcused.length > 0){
    items.push({
      icon: '⚠️',
      title: 'غیبت‌های غیرموجه امروز',
      desc: `${fa(unexcused.length)} دانش‌آموز غایب بدون اطلاع ثبت شده‌اند (نیاز به تماس با اولیا)`,
      badge: '<span class="badge b-red">پیگیری فوری</span>',
      act: 'attendance',
      btn: '📞 بررسی حضور و غیاب'
    });
  }
  const lowGpaList = Object.entries(perStudent || {}).filter(([_, l]) => avgOf(l) < 10);
  if(lowGpaList.length > 0){
    items.push({
      icon: '📉',
      title: 'دانش‌آموزان با نمرات بحرانی',
      desc: `${fa(lowGpaList.length)} دانش‌آموز دارای معدل زیر ۱۰ هستند (نیازمند مداخله و آموزش جبرانی)`,
      badge: '<span class="badge b-amber">مداخله آموزشی</span>',
      act: 'grades',
      btn: '📊 بررسی نمرات'
    });
  }
  const pendingPreapps = (db.preapps || []).filter(p => p.school_id === sid && p.stage !== 'registered' && p.stage !== 'rejected');
  if(pendingPreapps.length > 0){
    items.push({
      icon: '📝',
      title: 'پیش‌ثبت‌نام‌های معلق',
      desc: `${fa(pendingPreapps.length)} متقاضی جدید در صف انتظار تعیین‌تکلیف نهایی`,
      badge: '<span class="badge b-blue">پذیرش</span>',
      act: 'preapps',
      btn: '📋 مدیریت پذیرش'
    });
  }
  const enrolledIds = new Set((db.enrollments || []).filter(e => e.school_id === sid).map(e => e.student_id));
  const unassigned = (users || []).filter(x => x.role === 'student' && !enrolledIds.has(x.id));
  if(unassigned.length > 0){
    items.push({
      icon: '🏛️',
      title: 'دانش‌آموزان بدون کلاس',
      desc: `${fa(unassigned.length)} دانش‌آموز فعال کلاسی برایشان ثبت نشده است`,
      badge: '<span class="badge b-purple">سازماندهی</span>',
      act: 'classes',
      btn: '🏛️ تخصیص کلاس'
    });
  }
  if(typeof drillAnnualStatus === 'function'){
    const dst = drillAnnualStatus(sid);
    if(!dst.done){
      items.push({
        icon: '⛑️',
        title: 'الزام قانونی مانور سالانه ایمنی و زلزله',
        desc: 'مانور سراسری ایمنی در سال تحصیلی جاری برای مدرسه ثبت نشده است',
        badge: '<span class="badge b-red">الزام آموزش و پرورش</span>',
        act: 'drills',
        btn: '⛑️ ثبت مانور'
      });
    }
  }

  if(items.length === 0){
    return `<div class="card" style="border:1px solid var(--green,#22c55e);background:var(--green-soft,#f2fbf4)" role="region" aria-label="میز فرماندهی مدیر">
      <div class="card-body" style="padding:12px 16px;display:flex;align-items:center;gap:12px">
        <span style="font-size:24px" aria-hidden="true">🛡️</span>
        <div><b>مرکز فرماندهی مدیر: وضعیت مدرسه کاملاً عادی است</b>
        <div class="small muted">هیچ هشدار اضطراری یا غیبت پیگیری‌نشده‌ای در این لحظه ثبت نشده است.</div></div>
      </div>
    </div>`;
  }

  return `<div class="card" style="border:1px solid var(--amber,#f59e0b);background:var(--surface-1)" role="region" aria-label="میز فرماندهی و هشدارهای نیازمند اقدام مدیر">
    <div class="card-head" style="background:var(--amber-soft,#fff9e6)">
      <h3>🚨 میز فرماندهی و هشدارهای نیازمند اقدام مدیر</h3>
      <span class="badge b-amber">${fa(items.length)} مورد نیازمند پیگیری</span>
    </div>
    <div class="card-body" style="display:grid;gap:10px;padding:12px 14px">
      ${items.map(it => `
        <div class="row" style="background:var(--surface-2);padding:10px 14px;border-radius:10px;align-items:center;flex-wrap:wrap;gap:8px">
          <span style="font-size:20px" aria-hidden="true">${it.icon}</span>
          <div style="flex:1;min-width:200px">
            <div style="display:flex;gap:8px;align-items:center">
              <b>${esc(it.title)}</b>
              ${it.badge}
            </div>
            <div class="small muted" style="margin-top:2px">${esc(it.desc)}</div>
          </div>
          <button class="btn ghost sm" data-act="go" data-r="${escAttr(it.act)}">${esc(it.btn)}</button>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function gradeDistributionCard(perStudent){
  const avgs = Object.values(perStudent || {}).map(l => avgOf(l)).filter(n => !isNaN(n));
  const tot = avgs.length;
  if(!tot) return '';
  let exc = 0, good = 0, fair = 0, weak = 0;
  for(let i = 0; i < avgs.length; i++){
    const v = avgs[i];
    if(v >= 17) exc++;
    else if(v >= 14) good++;
    else if(v >= 10) fair++;
    else weak++;
  }
  const pct = n => tot ? Math.round((n / tot) * 100) : 0;
  return `<div class="card" role="region" aria-label="توزیع سطح پیشرفت تحصیلی دانش‌آموزان">
    <div class="card-head">
      <h3>📊 توزیع سطح پیشرفت تحصیلی</h3>
      <span class="badge b-purple">${fa(tot)} دانش‌آموز ارزیابی‌شده</span>
    </div>
    <div class="card-body" style="display:grid;gap:12px">
      <div>
        <div class="row" style="margin-bottom:4px">
          <span>🟢 سطح خیلی خوب / عالی (۱۷ تا ۲۰)</span>
          <div class="spacer"></div>
          <b>${fa(exc)}</b> <span class="muted small">(${fa(pct(exc))}٪)</span>
        </div>
        ${bar(exc, tot, 'var(--green,#22c55e)')}
      </div>
      <div>
        <div class="row" style="margin-bottom:4px">
          <span>🔵 سطح خوب (۱۴ تا ۱۶.۹۹)</span>
          <div class="spacer"></div>
          <b>${fa(good)}</b> <span class="muted small">(${fa(pct(good))}٪)</span>
        </div>
        ${bar(good, tot, 'var(--blue,#3b82f6)')}
      </div>
      <div>
        <div class="row" style="margin-bottom:4px">
          <span>🟡 سطح قابل قبول (۱۰ تا ۱۳.۹۹)</span>
          <div class="spacer"></div>
          <b>${fa(fair)}</b> <span class="muted small">(${fa(pct(fair))}٪)</span>
        </div>
        ${bar(fair, tot, 'var(--amber,#f59e0b)')}
      </div>
      <div>
        <div class="row" style="margin-bottom:4px">
          <span>🔴 نیازمند تلاش و آموزش جبرانی (کمتر از ۱۰)</span>
          <div class="spacer"></div>
          <b>${fa(weak)}</b> <span class="muted small">(${fa(pct(weak))}٪)</span>
        </div>
        ${bar(weak, tot, 'var(--red,#ef4444)')}
      </div>
    </div>
  </div>`;
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
   ${u.role==='manager'?managerExceptionPanel(sid,attToday,users,perStudent):''}
   ${u.role==='manager'?`<div class="row" style="background:var(--surface-2);padding:10px 14px;border-radius:12px;align-items:center">
    <b>📰 گزارش عمومی</b><span class="small muted">خلاصهٔ قابل انتشار برای بیرون (بدون دادهٔ حساس)</span>
    <div class="spacer"></div>
    <button class="btn ghost sm" data-act="pubrep-print">🖨️ چاپ</button>
    <button class="btn ghost sm" data-act="pubrep-csv">⬇️ دانلود CSV</button>
   </div>`:''}
   ${u.role==='manager'&&typeof schoolModeBadge==='function'?`<div class="row" style="background:var(--surface-2);padding:10px 14px;border-radius:12px;align-items:center">
    <b>حالت مدرسه امروز:</b> ${schoolModeBadge(u.school_id,todayISO())}
    <div class="spacer"></div>
    <button class="btn ghost sm" data-act="smode-mgr">${schoolModeOf(u.school_id,todayISO())==='virtual'?'🏫 حضوری کردن امروز':'🏠 غیرحضوری کردن امروز'}</button>
   </div>`:''}
   ${u.role==='manager'?(()=>{const sc=byId('schools',sid)||{};const bg=(sc.boom_goals||'').trim();
    return `<div class="card"><div class="card-head"><h3>🎯 برنامه ویژه مدرسه (بوم)</h3><button class="btn ghost sm" data-act="school-boom" data-id="${escAttr(sid)}">${bg?'✏️ ویرایش اهداف':'➕ ثبت اهداف سالانه'}</button></div><div class="card-body">${bg?`<div style="white-space:pre-wrap;line-height:2">${esc(bg)}</div>`:empty('🎯','هنوز برنامه‌ای ثبت نشده','اهداف سالانه مدرسه را بنویسید تا در یک نگاه دیده شود.')}</div></div>`;})():''}
   ${u.role==='manager'&&typeof drillAnnualStatus==='function'?(()=>{const dst=drillAnnualStatus(u.school_id);
    return `<div class="row" style="background:${dst.done?'var(--green-soft,#dff5e1)':'var(--red-soft,#fde8e8)'};padding:10px 14px;border-radius:12px;align-items:center"><b>⛑️ مانور ایمنی امسال:</b> ${dst.done?`🟢 انجام شده <span class="small muted">(${esc(jalali(dst.last))})</span>`:'🔴 انجام نشده'}<div class="spacer"></div><button class="btn ghost sm" data-act="go" data-r="drills">${dst.done?'مشاهده':'ثبت مانور'}</button></div>`;})():''}
   ${((u.role==='manager'||u.role==='superadmin')&&typeof DATA_MODE!=='undefined'&&DATA_MODE==='server')?`<div class="card"><div class="card-head"><h3>⚖️ تعارض‌های همگام‌سازی</h3><span class="muted small">تغییرهای هم‌زمانِ در انتظارِ داوری (فقط حالت سروری)</span></div><div id="sync-conflicts-root"><div class="card-body" style="padding-top:12px"><div class="muted small">در حالِ خواندن…</div></div></div></div>`:''}
   <div class="grid g2">
    <div class="card"><div class="card-head"><h3>روند حضور روزهای اخیر</h3><span class="badge b-blue">درصد حضور</span></div>
     <div class="card-body">${trend.length?`<div class="chart">${trend.map(t=>`<div class="col" title="${escAttr(t.rate)}%"><i style="height:${t.rate}%"></i><span>${new Date(t.d).toLocaleDateString('fa-IR-u-ca-persian',{day:'numeric'})}</span></div>`).join('')}</div>`:empty('📈','داده‌ای نیست','')}</div></div>
    <div class="card"><div class="card-head"><h3>وضعیت حضور امروز</h3><span class="muted small">${fa(tot)} رکورد</span></div>
     ${tot?`<div class="card-body" style="display:grid;gap:13px">${['present','absent','late','excused','early_exit'].map(k=>{const n=attToday.filter(a=>a.status===k).length;
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
   </div>
   ${gradeDistributionCard(perStudent)}`;
}

function teacherDash(){
  const u=S.user, cls=teacherClasses(u.id);
  const students=new Set();cls.forEach(c=>db.enrollments.filter(e=>e.class_id===c.id).forEach(e=>students.add(e.student_id)));
  const mine=db.grades.filter(g=>g.teacher_id===u.id);
  const sched=db.schedule.filter(s=>s.teacher_id===u.id).sort((a,b)=>a.day-b.day||a.period-b.period).slice(0,6);
  /* نوار وضعیت زنگ (گام ۲ دور ۵۰) — فقط نمایش، بدون تغییر رفتار */
  const bellBar=(typeof bellNowBar==='function')?bellNowBar():'';
  return `<div class="bell-live-root" data-bell-live="teacher">${bellBar}</div><div class="grid g4">
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

/* ─────────────── کارت «امروز» (بند ۱.۷ — بستهٔ طراحی پایه) ───────────────
   سه تکه برای خانوادهٔ دانش‌آموز: تاریخ شمسی امروز، وضعیت حضور امروز
   (با رنگ معنادار) و زنگ‌های امروز از برنامهٔ کلاس. */

/** روز هفته با شنبه=۰ — همان قرارداد برنامهٔ کلاسی (بند ۱.۵) */
function todayDow(iso){
  var d=iso?new Date(iso.slice(0,10)+'T12:00:00'):new Date();
  return (d.getDay()+1)%7;
}

function todayCard(sid,iso){
  iso=iso||todayISO();
  var cls=classOf(sid);
  var recs=db.attendance.filter(function(a){ return a.student_id===sid&&a.date===iso; });
  var rec=recs.length?recs[recs.length-1]:null;
  var dow=todayDow(iso);
  var periods=cls
    ?db.schedule.filter(function(s){ return s.class_id===cls.id&&s.day===dow; })
              .sort(function(a,b){ return a.period-b.period; })
    :[];
  var attFA={present:'حاضر',absent:'غایب',late:'با تأخیر',excused:'موجه'};
  var attColor={present:'var(--green)',absent:'var(--red)',late:'var(--amber)',excused:'var(--primary)'};
  return `<div class="card today-card"><div class="card-head"><h3>🌅 امروز</h3>
    <span class="badge b-blue">${jalali(iso)} — ${DAYS_FULL[dow]}</span></div>
   <div class="card-body" style="display:grid;gap:12px">
    ${rec
     ?`<div class="row"><span>وضعیت حضور امروز</span><div class="spacer"></div><b style="color:${attColor[rec.status]||'var(--text)'}">${attFA[rec.status]||'—'}</b></div>`
     :`<div class="row"><span>وضعیت حضور امروز</span><div class="spacer"></div><span class="badge b-gray">ثبت نشده</span></div>`}
    ${periods.length
     ?`<div><div class="small muted" style="margin-bottom:6px">${fa(periods.length)} زنگ امروز:</div>
        ${periods.map(s=>`<div class="row" style="padding:7px 10px;background:var(--surface-2);border-radius:8px;margin-bottom:6px">
          <span class="badge b-blue" style="flex:none">زنگ ${fa(s.period)}</span>
          <b style="margin-inline-start:8px">${esc((byId('subjects',s.subject_id)||{}).name||'—')}</b>
          ${s.teacher_id?`<span class="muted small" style="margin-inline-start:auto">${esc((byId('users',s.teacher_id)||{}).full_name||'')}</span>`:''}
        </div>`).join('')}</div>`
     :empty('🗓️','امروز زنگی ثبت نشده','برنامهٔ هفتگی کلاس برای این روز خالی است.')}
   </div></div>`;
}

/* ── E.1 فرناز: چک‌لیستِ «فردا چی لازم دارم» ──
   درس‌های فردا از همان برنامهٔ هفتگی + وسیلهٔ خاصِ هر درس (کلیدواژه در نام).
   تیک‌ها فقط لوکال (حافظهٔ محلی به‌کلیدِ دانش‌آموز+تاریخ، از طریق Store) — بدون سرور. */
const TOMORROW_GEAR=[['ورزش','👕 لباس ورزش'],['تربیت بدنی','👕 لباس ورزش'],['هنر','🎨 وسایل نقاشی'],['آزمایشگاه','🥼 روپوش آزمایشگاه']];
function tomorrowGearFor(subjName){
  const n=String(subjName||'');
  for(let i=0;i<TOMORROW_GEAR.length;i++)if(n.indexOf(TOMORROW_GEAR[i][0])>-1)return TOMORROW_GEAR[i][1];
  return null;
}
function tomorrowCheckKey(sid,iso){ return 'payesh_tmr_'+sid+'_'+iso; }
function tomorrowChecksGet(sid,iso){
  try{ return JSON.parse(Store.get(tomorrowCheckKey(sid,iso),'{}'))||{}; }catch(e){ return {}; }
}
function tomorrowCard(sid,iso){
  iso=iso||todayISO();
  const tmr=addDaysISO(iso,1), dow=todayDow(tmr);
  const cls=classOf(sid);
  const periods=cls?db.schedule.filter(s=>s.class_id===cls.id&&s.day===dow).sort((a,b)=>a.period-b.period):[];
  const subs=Object.create(null);
  (db.substitutions||[]).forEach(x=>{ if(x.date===tmr)subs[x.schedule_id]=x; });
  const checks=tomorrowChecksGet(sid,tmr);
  return `<div class="card tomorrow-card"><div class="card-head"><h3>🎒 فردا چی لازم دارم</h3>
    <span class="badge b-green">${jalali(tmr)} — ${DAYS_FULL[dow]}</span></div>
   <div class="card-body" style="display:grid;gap:6px">
    ${periods.length
     ?periods.map(s=>{
        const sub=(byId('subjects',s.subject_id)||{}).name||'—';
        const gear=tomorrowGearFor(sub), sb=subs[s.id];
        const on=checks['p'+s.period]?'checked':'';
        return `<div class="row" style="padding:7px 10px;background:var(--surface-2);border-radius:8px;gap:8px">`
          + `<input type="checkbox" data-act="tomorrow-check" data-sid="${escAttr(sid)}" data-iso="${escAttr(tmr)}" data-idx="p${s.period}" ${on} aria-label="آماده‌سازی زنگ ${escAttr(fa(s.period))} — ${escAttr(sub)}" />`
          + `<span class="badge b-green" style="flex:none">زنگ ${fa(s.period)}</span>`
          + `<b>${esc(sub)}</b>`
          + (sb?`<span class="badge b-amber">🔁 جابه‌جای: ${esc((byId('users',sb.sub_teacher_id)||{}).full_name||'—')}</span>`:'')
          + (gear?`<span class="small">🎒 ${esc(gear)}</span>`:'')
          + `</div>`;}).join('')
     :empty('🎉','فردا کلاسی نیست','برنامهٔ هفتگی کلاس برای فردا خالی است.')}
   </div></div>`;
}

/* ── E.2 فرناز: شمارش‌معکوس امتحان + یادآوری ──
   نزدیک‌ترین امتحانِ کلاس از همان کالکشن exams؛ یادآوری با زیرساخت موجود:
   اعلان داخل‌برنامه (notifications) + صف پیامک (notify_queue via notifyRequest).
   فراخوانی از مسیر رندر کارت است پس هر دو مسیر ضدتکرارند: پیامک با source_ref
   روی دیتابیس، اعلان داخل‌برنامه با نشانِ حافظهٔ محلی (از طریق Store). */
function examDaysLeft(examDate,iso){
  return Math.round((Date.parse(examDate)-Date.parse(iso||todayISO()))/86400000);
}
function nextExamFor(sid,iso){
  iso=iso||todayISO();
  const cls=classOf(sid); if(!cls)return null;
  let best=null;
  (db.exams||[]).forEach(x=>{
    if(x.class_id!==cls.id||!x.date||x.date<iso)return;
    if(!best||x.date<best.date||(x.date===best.date&&(x.start_time||'')<(best.start_time||'')))best=x;
  });
  return best?{exam:best,days:examDaysLeft(best.date,iso)}:null;
}
function examRemindKey(id){ return 'payesh_exrem_'+id; }
function examReminderSend(sid,info){
  const ex=info.exam, st=byId('users',sid)||{};
  const subj=(byId('subjects',ex.subject_id)||{}).name||'—';
  const when=`${jalali(ex.date)} ساعت ${ex.start_time||'—'}`;
  /* ۱) صف پیامک موجود (kind=event): ضدتکرار دیتابیسی */
  const ref='examrem:'+ex.id;
  const dup=(db.notify_queue||[]).some(q=>q.kind==='event'&&q.source_ref===ref&&q.status!=='rejected'&&q.status!=='cancelled');
  if(!dup&&typeof notifyRequest==='function'){
    notifyRequest({school_id:ex.school_id,kind:'event',student_id:sid,student_name:st.full_name||'',
      body:`یادآوری امتحان ${subj} برای ${st.full_name||''} — ${when}، کلاس ${(byId('classes',ex.class_id)||{}).name||''}. ${typeof notifySchoolName==='function'?notifySchoolName(ex.school_id):''}`,
      source_ref:ref});
  }
  /* ۲) اعلان داخل‌برنامه برای دانش‌آموز + همهٔ والدین لینک‌شده */
  if(!Store.get(examRemindKey(ex.id))){
    const recips=[sid];
    (db.parent_links||[]).forEach(l=>{ if(l.student_id===sid&&recips.indexOf(l.parent_id)===-1)recips.push(l.parent_id); });
    recips.forEach(uid=>insert('notifications',{user_id:uid,school_id:ex.school_id,type:'exam_remind',
      title:'⏳ یادآوری امتحان',body:`امتحان ${subj} — ${when}`,link:'exams',read:0,created_at:todayISO()}));
    Store.set(examRemindKey(ex.id),'1');
  }
}
function examCountdownCard(sid,iso){
  iso=iso||todayISO();
  const nx=nextExamFor(sid,iso);
  if(!nx)return '';
  /* پنجرهٔ یادآوری: ۱-۲ روز قبل + روز امتحان (اگر داشبورد دیر باز شد) */
  if(nx.days<=2)examReminderSend(sid,nx);
  const subj=(byId('subjects',nx.exam.subject_id)||{}).name||'—';
  const head=nx.days===0?`امروز امتحان ${esc(subj)}`:nx.days===1?`فردا امتحان ${esc(subj)}`:`${fa(nx.days)} روز تا امتحان ${esc(subj)}`;
  return `<div class="card exam-card"><div class="card-head"><h3>⏳ ${head}</h3>
    <span class="badge b-amber">${jalali(nx.exam.date)} — ساعت ${esc(nx.exam.start_time||'—')}</span></div>
   <div class="card-body"><div class="small">🏫 کلاس ${esc((byId('classes',nx.exam.class_id)||{}).name||'—')}${nx.exam.room?` — اتاق ${esc(nx.exam.room)}`:''} — بارم ${fa(nx.exam.max_score||20)}</div></div></div>`;
}

function summaryBlock(sid){
  const d=studentSummary(sid), tot=d.att.length;
  const cnt=k=>d.att.filter(a=>a.status===k).length;
  return `${todayCard(sid)}${tomorrowCard(sid)}${examCountdownCard(sid)}<div class="grid g4">
   ${statCard('🎒',esc(d.st.full_name),d.cls?'کلاس '+d.cls.name:'بدون کلاس','blue')}
   ${statCard('📊',fa(d.avg.toFixed(2)),'معدل کل','green')}
   ${statCard('🏅',fa(d.rank)+' از '+fa(d.size),'رتبه در کلاس','amber')}
   ${statCard('⚖️',fa(d.points),'امتیاز انضباطی ('+fa(d.disc.length)+' مورد)',d.points>=0?'purple':'red')}</div>
   ${(typeof internshipProgressHtml==='function')?internshipProgressHtml(sid):''}
   ${(typeof dojoRecentHtml==='function')?dojoRecentHtml(sid):''}
    <div class="card"><div class="card-head"><h3>وضعیت حضور</h3><span class="badge b-green">${fa(tot?Math.round(cnt('present')/tot*100):0)}٪ حضور</span></div>
     <div class="card-body" style="display:grid;gap:12px">${['present','absent','late','excused','early_exit'].map(k=>`<div><div class="row"><span>${ATT_FA[k]}</span><div class="spacer"></div><b>${fa(cnt(k))} روز</b></div>${bar(cnt(k),tot,ATT_COLOR[k])}</div>`).join('')}</div></div>
    <div class="card"><div class="card-head"><h3>میانگین به تفکیک درس</h3><button class="btn ghost sm" data-act="go" data-r="${escAttr(S.user.role==='student'?'record':'children')}">پرونده کامل</button></div>
     ${d.subs.length?`<div class="card-body" style="display:grid;gap:10px">${d.subs.map(s=>`<div><div class="row"><span>${esc(s.name)}</span><div class="spacer"></div><b style="color:${s.avg>=17?'var(--green)':s.avg>=12?'var(--text)':'var(--red)'}">${fa(s.avg.toFixed(2))}</b></div>${bar(s.avg,20,s.avg>=17?'var(--green)':s.avg>=12?'var(--primary)':'var(--red)')}</div>`).join('')}</div>`:empty('📝','نمره‌ای ثبت نشده','')}</div>
   </div>`;
}

function familyDash(){
  const u=S.user;
  const kids=u.role==='student'?[u.id]:db.parent_links.filter(p=>p.parent_id===u.id).map(p=>p.student_id);
  const live=(typeof familyBellCards==='function')?familyBellCards():'';
  if(!kids.length)return live+`<div class="card">${empty('👨‍👩‍👦','دانش‌آموزی متصل نیست','با مدیر مدرسه تماس بگیرید.')}</div>`;
  return live+kids.map(summaryBlock).join('');
}

/* ── C.3 فرناز: گزارش عمومی قابل انتشار (فقط تجمیعی، بدون داده حساس) ──
   نرخ حضور + میانگین نمرات + تعداد رویدادها؛ بدون نام، بدون برترها، بدون انضباطی. */
function publicStats(sid){
  const att=(db.attendance||[]).filter(a=>a.school_id===sid);
  const p=att.filter(a=>a.status==='present').length;
  const gr=(db.grades||[]).filter(g=>g.school_id===sid);
  const ev=(db.calendar||[]).filter(c=>c.school_id===sid);
  return {
    att:att.length?Math.round(p/att.length*1000)/10:0,
    avg:gr.length?Math.round(gr.reduce((x,y)=>x+Number(y.score||0),0)/gr.length*100)/100:0,
    events:ev.length
  };
}
function publicReportRows(sid){
  const st=publicStats(sid);
  return {headers:['شاخص','مقدار'],rows:[['نرخ حضور (٪)',st.att],['میانگین نمرات (از ۲۰)',st.avg],['تعداد رویدادها',st.events]]};
}
function pubrepPrint(){
  const u=S.user;
  if(!u||u.role!=='manager'||!u.school_id)return;
  const s=byId('schools',u.school_id)||{};
  const st=publicStats(u.school_id);
  const w=window.open('','_blank');
  if(!w){toast('اجازهٔ باز کردنِ پنجره داده نشد','err');return;}
  w.document.write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش عمومی مدرسه</title>'
    +'<style>body{font-family:Vazirmatn,Tahoma;padding:28px;color:#0f172a;max-width:720px;margin:0 auto}'
    +'h1{font-size:20px;text-align:center;margin:0 0 2px}.meta{text-align:center;font-size:13px;color:#475569;margin-bottom:16px}'
    +'table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #cbd5e1;padding:10px;text-align:right}th{background:#eff6ff;width:40%}'
    +'.foot{margin-top:14px;font-size:12px;color:#64748b;text-align:center}'
    +'@media print{.np{display:none}}</style></head><body>'
    +'<h1>📰 گزارش عمومی مدرسه</h1>'
    +'<div class="meta">'+esc(s.name||'')+' — '+jalali(todayISO())+'</div>'
    +'<table><tr><th>نرخ حضور</th><td>'+fa(st.att)+'٪</td></tr>'
    +'<tr><th>میانگین نمرات (از ۲۰)</th><td>'+fa(st.avg)+'</td></tr>'
    +'<tr><th>تعداد رویدادها</th><td>'+fa(st.events)+'</td></tr></table>'
    +'<div class="foot">نسخهٔ عمومی — بدون دادهٔ حساس؛ مناسب انتشار برای بیرون مدرسه.</div>'
    +'<div class="np" style="text-align:center;margin-top:14px"><button onclick="window.print()" style="padding:8px 22px;border:none;border-radius:8px;background:#1668f0;color:#fff;font-family:inherit;cursor:pointer">🖨️ چاپ</button></div></body></html>');
  w.document.close();
}

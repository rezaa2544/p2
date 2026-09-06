/* ============================ فاز ۸ — پایش: چندمدرسه‌ای، امتحانات، تأیید اولیا ============================ */

const P8 = { colls: ['teacher_schools','exam_terms','exams','exam_duties','parent_verifications','corrections'] };
const TIME_SLOTS = ['08:00','10:00','10:30','13:00'];
const toMinP = t => { const [h,m]=String(t||'0:0').split(':').map(Number); return (h||0)*60+(m||0); };
const toHHMMP = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const overlapP = (a,ad,b,bd) => toMinP(a) < toMinP(b)+bd && toMinP(b) < toMinP(a)+ad;

/** کد ملی معتبر ایرانی */
function validNid(nid){
  const s=String(nid||'').replace(/\D/g,'');
  if(!/^\d{10}$/.test(s)||/^(\d)\1{9}$/.test(s))return false;
  const c=Number(s[9]), sum=s.slice(0,9).split('').reduce((a,d,i)=>a+Number(d)*(10-i),0)%11;
  return sum<2?c===sum:c===11-sum;
}
/* ---- ساخت کد ملی ساختگی ولی معتبر ----
   ⚠️ در نسخهٔ دمو هیچ کد ملی واقعی نباید ساخته شود. اگر ۱۰ رقم را
   کاملاً تصادفی بسازیم، ممکن است اتفاقاً کد ملی یک شهروند واقعی
   دربیاید. پس سه رقم اول را روی ۹۹۹ ثابت می‌کنیم که سازمان ثبت احوال
   صادر نمی‌کند، و شش رقم بعد را تصادفی می‌گیریم.
   رقم کنترل با همان الگوریتم رسمی حساب می‌شود تا validNid قبولش کند
   و مسیرهای اعتبارسنجی برنامه واقعاً آزموده شوند. */
const DEMO_NID_PREFIX = '999';
function makeNid(){
  let b = DEMO_NID_PREFIX;
  for(let i=0;i<6;i++) b += ri(10);
  const s = b.split('').reduce((a,d,i)=>a+Number(d)*(10-i),0)%11;
  return b + String(s<2?s:11-s);
}
/** کد ملی در کل سامانه یکتاست */
/* یافتن دارندهٔ یک کد ملی. از ایندکس استفاده می‌کند تا در ورود انبوه
   اکسل رفتار درجه‌دوم نسازد؛ اگر ایندکس در دسترس نبود به جستجوی خطی
   برمی‌گردد. ⚠️ ایندکس یکتاست و «آخرین برنده» است، پس وقتی exceptId
   داده شده و همان رکورد برگشت، جستجوی خطی لازم می‌شود. */
const nidOwner=(nid,exceptId=0)=>{
  const key=String(nid);
  if(typeof idxUserByNid==='function'){
    const hit=idxUserByNid().get(key);
    if(!hit) return undefined;
    if(hit.id!==exceptId) return hit;
    return db.users.find(u=>u.national_id===key&&u.id!==exceptId);
  }
  return db.users.find(u=>u.national_id===key&&u.id!==exceptId);
};

/* ---------------- داده نمونه فاز ۸ ---------------- */
function generateP8(){
  P8.colls.forEach(c=>{ db[c]=db[c]||[]; });

  // کد ملی معتبر برای همه + کد ملی پدر برای فرزندان
  db.users.forEach(u=>{ if(!validNid(u.national_id)) u.national_id=makeNid(); });
  db.parent_links.forEach(l=>{
    const p=byId('users',l.parent_id), s=byId('users',l.student_id);
    if(p&&s&&!s.father_nid) s.father_nid=p.national_id;
  });
  db.users.filter(u=>u.role==='student').forEach(s=>{ if(chance(0.35)&&!s.mother_nid) s.mother_nid=makeNid(); });

  // ولی با فرزندان در سه مدرسه مختلف
  const multiNid=makeNid();
  const dad=add('users',{school_id:db.schools[0].id,role:'parent',full_name:'کاظم رستمی',username:'parent_multi',password:'123456',
    national_id:multiNid,phone:'09990001234',active:1,created_at:daysAgoISO(300)});
  db.schools.slice(0,3).forEach(sc=>{
    const st=db.users.find(u=>u.role==='student'&&u.school_id===sc.id);
    if(!st)return;
    st.father_nid=multiNid;
    add('parent_links',{parent_id:dad.id,student_id:st.id,relation:'پدر'});
  });
  // رکورد تأیید برای همه پیوندها
  db.parent_links.forEach(l=>{
    if(!db.parent_verifications.some(v=>v.parent_id===l.parent_id&&v.student_id===l.student_id))
      add('parent_verifications',{parent_id:l.parent_id,student_id:l.student_id,status:chance(0.7)?'confirmed':'pending',note:null});
  });
  // ولی چندمدرسه‌ای همیشه در انتظار تأیید بماند (برای نمایش قابلیت)
  db.parent_verifications.filter(v=>v.parent_id===dad.id).forEach(v=>v.status='pending');

  // دبیران مشترک بین مدارس + چند زنگ در مدرسه دوم بدون تداخل
  for(let i=0;i<db.schools.length-1;i++){
    const home=db.schools[i], guest=db.schools[i+1];
    db.users.filter(u=>u.role==='teacher'&&u.school_id===home.id).slice(0,2).forEach(t=>{
      add('teacher_schools',{teacher_id:t.id,school_id:guest.id,employment:'حق‌التدریس',weekly_quota:12,active:1});
      const busy=new Set(db.schedule.filter(s=>s.teacher_id===t.id).map(s=>s.day+'-'+s.period));
      const classes=db.classes.filter(c=>c.school_id===guest.id).slice(0,3);
      const subs=db.subjects.filter(s=>s.school_id===guest.id);
      let added=0;
      classes.forEach(c=>{
        for(let d=0;d<5&&added<4;d++) for(let p=1;p<=5&&added<4;p++){
          const k=d+'-'+p;
          if(busy.has(k))continue;
          if(db.schedule.some(s=>s.class_id===c.id&&s.day===d&&s.period===p))continue;
          add('schedule',{school_id:guest.id,class_id:c.id,subject_id:pick(subs).id,teacher_id:t.id,day:d,period:p});
          busy.add(k); added++;
        }
      });
    });
  }
  // رفع تداخل‌های احتمالی داده نمونه
  const seen={};
  db.schedule.forEach(s=>{
    if(!s.teacher_id)return;
    const k=s.teacher_id+'-'+s.day+'-'+s.period;
    if(seen[k]){
      const free=db.users.find(u=>u.role==='teacher'&&u.school_id===s.school_id&&!db.schedule.some(x=>x.teacher_id===u.id&&x.day===s.day&&x.period===s.period));
      s.teacher_id=free?free.id:null;
    } else seen[k]=1;
  });

  // فصل امتحانات + برنامه مراقبت
  db.schools.slice(0,4).forEach(sc=>{
    const start=addDaysISO(todayISO(),12), end=addDaysISO(todayISO(),24);
    const term=add('exam_terms',{school_id:sc.id,title:'امتحانات نوبت اول',term:'نوبت اول',start_date:start,end_date:end,
      status:'published',note:'حضور دانش‌آموزان ۳۰ دقیقه پیش از شروع الزامی است.'});
    const classes=db.classes.filter(c=>c.school_id===sc.id);
    const subs=db.subjects.filter(s=>s.school_id===sc.id).slice(0,6);
    const teachers=db.users.filter(u=>u.role==='teacher'&&(u.school_id===sc.id||db.teacher_schools.some(t=>t.teacher_id===u.id&&t.school_id===sc.id)));
    classes.forEach(c=>{
      subs.forEach((sub,i)=>{
        const date=addDaysISO(start,i*2); if(date>end)return;
        const st=i%2===0?'08:00':'10:30', dur=90;
        const ex=add('exams',{school_id:sc.id,term_id:term.id,class_id:c.id,subject_id:sub.id,date,start_time:st,duration:dur,room:'سالن '+(1+ri(4)),max_score:20});
        let placed=0;
        teachers.slice().sort(()=>rng()-0.5).forEach(t=>{
          if(placed>=2)return;
          const clash=db.exam_duties.some(d=>{ if(d.teacher_id!==t.id)return false; const e=byId('exams',d.exam_id); return e&&e.date===date&&overlapP(st,dur,e.start_time,e.duration); });
          if(clash)return;
          add('exam_duties',{exam_id:ex.id,teacher_id:t.id,school_id:sc.id,role:placed?'assistant':'main'});
          placed++;
        });
      });
    });
  });
}

/* ---------------- کوئری‌ها ---------------- */
const myKids = ()=>db.parent_links.filter(l=>l.parent_id===S.user.id).map(l=>{
  const st=byId('users',l.student_id); if(!st)return null;
  const v=db.parent_verifications.find(x=>x.parent_id===S.user.id&&x.student_id===st.id);
  return {...st, relation:l.relation, school_name:(byId('schools',st.school_id)||{}).name||'—',
    class_name:(classOf(st.id)||{}).name||'—', verify:(v&&v.status)||'pending'};
}).filter(Boolean);
const pendingKids = ()=>myKids().filter(k=>k.verify==='pending');
const teacherSchoolsOf = tid=>{
  const u=byId('users',tid); const out=[];
  if(u&&u.school_id)out.push({school_id:u.school_id,name:(byId('schools',u.school_id)||{}).name,primary:true,employment:'رسمی'});
  db.teacher_schools.filter(t=>t.teacher_id===tid&&t.active).forEach(t=>out.push({school_id:t.school_id,name:(byId('schools',t.school_id)||{}).name,employment:t.employment,id:t.id}));
  return out;
};
const teacherBusyAt=(tid,day,period,exceptId=0)=>db.schedule.find(s=>s.teacher_id===tid&&s.day===day&&s.period===period&&s.id!==exceptId);
const schoolTeachers=()=>db.users.filter(u=>u.role==='teacher'&&u.active&&(u.school_id===S.user.school_id||db.teacher_schools.some(t=>t.teacher_id===u.id&&t.school_id===S.user.school_id&&t.active)));

/* ---------------- صفحه: دبیران و مدارس ---------------- */
function viewTeachers(){
  const rows=schoolTeachers().map(t=>{
    const all_=db.schedule.filter(s=>s.teacher_id===t.id);
    return {...t, here:all_.filter(s=>s.school_id===S.user.school_id).length, total:all_.length,
      schools:teacherSchoolsOf(t.id), shared:t.school_id!==S.user.school_id};
  });
  const clashes=[];
  const map={};
  db.schedule.forEach(s=>{ if(!s.teacher_id)return; const k=s.teacher_id+'-'+s.day+'-'+s.period;
    if(map[k])clashes.push([byId('users',s.teacher_id),map[k],s]); else map[k]=s; });
  return `
  ${clashes.length?`<div class="card" style="border-color:var(--red);background:var(--red-soft);margin-bottom:14px">
    <div class="card-head"><h3>⚠️ تداخل ساعت</h3><span class="badge b-red">${fa(clashes.length)}</span></div>
    <div class="card-body small" style="line-height:2">${clashes.map(c=>`<div><b>${esc((c[0]||{}).full_name||'')}</b> — ${DAYS[c[1].day]} زنگ ${fa(c[1].period)}</div>`).join('')}</div></div>`:''}
  <div class="card"><div class="card-head"><h3>👨‍🏫 دبیران مدرسه</h3>
    <button class="btn" data-act="teacher-add">➕ افزودن دبیر با کد ملی</button></div>
   ${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>نام دبیر</th><th>کد ملی</th><th>نوع همکاری</th><th>ساعت اینجا</th><th>مجموع ساعت</th><th>مدارس</th><th></th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td><b>${esc(r.full_name)}</b></td><td class="small muted">${esc(r.national_id||'—')}</td>
      <td>${r.shared?'<span class="badge b-purple">مشترک با مدرسه دیگر</span>':'<span class="badge b-blue">دبیر همین مدرسه</span>'}</td>
      <td>${fa(r.here)} زنگ</td><td>${fa(r.total)} زنگ</td>
      <td class="small">${r.schools.map(s=>esc(s.name)).join('، ')}</td>
      <td><div class="row" style="gap:5px;flex-wrap:nowrap">
        <button class="btn ghost sm" data-act="teacher-plan" data-id="${escAttr(r.id)}">برنامه کامل</button>
        ${r.shared?`<button class="icon-btn" title="ویرایش همکاری" data-act="ts-edit" data-id="${escAttr(r.id)}">✏️</button>
        <button class="icon-btn danger" title="حذف از این مدرسه" data-act="ts-del" data-id="${escAttr(r.id)}">🗑️</button>`:''}</div></td></tr>`).join('')}
   </tbody></table></div>`:empty('👨‍🏫','دبیری ثبت نشده','')}</div>`;
}

/* ---------------- صفحه: امتحانات ---------------- */
function viewExams(){
  const u=S.user;
  if(u.role==='teacher'){
    const duties=db.exam_duties.filter(d=>d.teacher_id===u.id).map(d=>({...d,e:byId('exams',d.exam_id)}))
      .filter(x=>x.e).sort((a,b)=>a.e.date.localeCompare(b.e.date)||a.e.start_time.localeCompare(b.e.start_time));
    return `<div class="card"><div class="card-head"><h3>👁️ برنامه مراقبت من</h3><span class="badge b-blue">${fa(duties.length)} جلسه</span></div>
      ${duties.length?`<div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>ساعت</th><th>مدرسه</th><th>کلاس</th><th>درس</th><th>سالن</th><th>نقش</th></tr></thead><tbody>
      ${duties.map(d=>`<tr><td>${jalali(d.e.date)}</td><td>${d.e.start_time} تا ${toHHMMP(toMinP(d.e.start_time)+d.e.duration)}</td>
        <td>${esc((byId('schools',d.e.school_id)||{}).name||'—')}</td><td>${esc((byId('classes',d.e.class_id)||{}).name||'—')}</td>
        <td>${esc((byId('subjects',d.e.subject_id)||{}).name||'—')}${examSourceBadge(d.e)}}</td><td>${esc(d.e.room||'—')}</td>
        <td><span class="badge ${d.role==='main'?'b-blue':'b-gray'}">${d.role==='main'?'مراقب اصلی':'کمک‌مراقب'}</span></td></tr>`).join('')}
      </tbody></table></div>`:empty('🗓️','ابلاغ مراقبتی ندارید','')}</div>`;
  }

  if(u.role==='student'||u.role==='parent'){
    const kids=u.role==='student'?[u]:myKids();
    const sel=S.child&&kids.some(k=>k.id===S.child)?S.child:(kids[0]||{}).id;
    const cls=classOf(sel);
    const list=db.exams.filter(e=>cls&&e.class_id===cls.id&&(byId('exam_terms',e.term_id)||{}).status==='published')
      .sort((a,b)=>a.date.localeCompare(b.date)||a.start_time.localeCompare(b.start_time));
    const term=list.length?byId('exam_terms',list[0].term_id):null;
    return `<div class="card"><div class="card-head"><h3>📝 برنامه امتحانات</h3>
      ${kids.length>1?`<div class="row" style="gap:6px">${kids.map(k=>`<button class="btn ${k.id===sel?'':'ghost'} sm" data-act="child" data-id="${escAttr(k.id)}">${esc(k.full_name)}</button>`).join('')}</div>`:''}</div>
      ${term?`<div class="card-body"><div class="row" style="gap:18px">
        <div><div class="small muted">بازه امتحانات</div><b>${jalali(term.start_date)} تا ${jalali(term.end_date)}</b></div>
        ${term.note?`<div class="small" style="background:var(--amber-soft);padding:8px 12px;border-radius:10px">ℹ️ ${esc(term.note)}</div>`:''}</div></div>`:''}
      ${list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>ساعت</th><th>درس</th><th>مدت</th><th>سالن</th></tr></thead><tbody>
        ${list.map(e=>`<tr><td><b>${jalali(e.date)}</b></td><td>${e.start_time} تا ${toHHMMP(toMinP(e.start_time)+e.duration)}</td>
          <td>${esc((byId('subjects',e.subject_id)||{}).name||'—')}${examSourceBadge(e)}}</td><td>${fa(e.duration)} دقیقه</td><td>${esc(e.room||'—')}</td></tr>`).join('')}
      </tbody></table></div>`:empty('📭','برنامه‌ای منتشر نشده','به‌محض انتشار برنامه توسط مدرسه، اینجا نمایش داده می‌شود.')}</div>`;
  }

  /* مدیر */
  const terms=db.exam_terms.filter(t=>u.role==='superadmin'||t.school_id===u.school_id);
  const term=S.filters.term?byId('exam_terms',S.filters.term):terms[terms.length-1];
  const exams=term?db.exams.filter(e=>e.term_id===term.id).sort((a,b)=>a.date.localeCompare(b.date)||a.start_time.localeCompare(b.start_time)):[];
  const tab=S.tab==='duties'?'duties':'schedule';
  const dutyOf=eid=>db.exam_duties.filter(d=>d.exam_id===eid);
  const load={};
  exams.forEach(e=>dutyOf(e.id).forEach(d=>{const n=(byId('users',d.teacher_id)||{}).full_name||'—';load[n]=(load[n]||0)+1;}));
  const loadArr=Object.entries(load).sort((a,b)=>b[1]-a[1]);

  return `<div class="card" style="margin-bottom:14px"><div class="card-head"><h3>📝 فصل امتحانات</h3>
    <div class="row" style="gap:8px">
      ${terms.length?`<select class="select" style="max-width:260px" data-f="term">${terms.map(t=>`<option value="${escAttr(t.id)}" ${term&&term.id===t.id?'selected':''}>${esc(t.title)} (${t.status==='published'?'منتشر شده':'پیش‌نویس'})</option>`).join('')}</select>`:''}
      <button class="btn" data-act="term-new">➕ فصل جدید</button></div></div>
   ${term?`<div class="card-body">
      <div class="grid g4">
        <div><div class="small muted">بازه</div><b>${jalali(term.start_date)} تا ${jalali(term.end_date)}</b></div>
        <div><div class="small muted">نوبت</div><b>${esc(term.term)}</b></div>
        <div><div class="small muted">جلسات</div><b>${fa(exams.length)}</b></div>
        <div><div class="small muted">وضعیت</div><span class="badge ${term.status==='published'?'b-green':'b-amber'}">${term.status==='published'?'منتشر شده':'پیش‌نویس'}</span></div>
      </div>
      <div class="row" style="margin-top:14px;gap:8px">
        <button class="btn ghost sm" data-act="term-edit" data-id="${escAttr(term.id)}">✏️ ویرایش</button>
        <button class="btn sm ${term.status==='published'?'ghost':''}" data-act="term-publish" data-id="${escAttr(term.id)}">${term.status==='published'?'↩️ بازگشت به پیش‌نویس':'📣 انتشار برای اولیا و دبیران'}</button>
        <button class="btn ghost sm" data-act="exam-print" data-id="${escAttr(term.id)}">🖨️ چاپ برنامه</button>
        <div class="spacer"></div>
        <button class="btn ghost sm danger" data-act="term-del" data-id="${escAttr(term.id)}">🗑️ حذف فصل</button>
      </div></div>`:empty('🗓️','فصلی تعریف نشده','برای شروع یک فصل امتحانات بسازید.')}</div>
   ${term?`<div class="row" style="margin-bottom:14px;gap:8px">
     <button class="btn ${tab==='schedule'?'':'ghost'}" data-act="tab" data-t="schedule">🗓️ برنامه امتحانات</button>
     <button class="btn ${tab==='duties'?'':'ghost'}" data-act="tab" data-t="duties">👁️ برنامه مراقبت</button></div>`:''}
   ${!term?'':tab==='schedule'?`
    <div class="card"><div class="card-head"><h3>جلسات امتحان</h3><button class="btn" data-act="exam-new" data-id="${escAttr(term.id)}">➕ افزودن جلسه</button></div>
     ${exams.length?`<div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>ساعت</th><th>کلاس</th><th>درس</th><th>سالن</th><th>مراقبان</th><th></th></tr></thead><tbody>
      ${exams.map(e=>`<tr><td>${jalali(e.date)}</td><td><b>${e.start_time}</b><div class="small muted">تا ${toHHMMP(toMinP(e.start_time)+e.duration)}</div></td>
        <td>${esc((byId('classes',e.class_id)||{}).name||'—')}</td><td>${esc((byId('subjects',e.subject_id)||{}).name||'—')}${examSourceBadge(e)}}</td>
        <td>${esc(e.room||'—')}</td>
        <td class="small">${dutyOf(e.id).map(d=>esc((byId('users',d.teacher_id)||{}).full_name||'')).join('، ')||'<span class="badge b-amber">بدون مراقب</span>'}</td>
        <td><button class="icon-btn" data-act="exam-edit" data-id="${escAttr(e.id)}">✏️</button> <button class="icon-btn danger" data-act="exam-del" data-id="${escAttr(e.id)}">🗑️</button></td></tr>`).join('')}
     </tbody></table></div>`:empty('📝','جلسه‌ای ثبت نشده','تداخل ساعت هر کلاس خودکار بررسی می‌شود.')}</div>`
   :`<div class="grid" style="grid-template-columns:1fr 280px;gap:14px;align-items:start">
      <div class="card"><div class="card-head"><h3>ابلاغ مراقبت دبیران</h3>
        <button class="btn" data-act="duty-auto" data-id="${escAttr(term.id)}">⚡ تخصیص خودکار</button></div>
        ${exams.length?`<div class="table-wrap"><table class="table"><thead><tr><th>تاریخ و ساعت</th><th>کلاس / درس</th><th>مراقبان</th><th>افزودن</th></tr></thead><tbody>
        ${exams.map(e=>`<tr><td><b>${jalali(e.date)}</b><div class="small muted">${e.start_time}</div></td>
          <td>${esc((byId('classes',e.class_id)||{}).name||'')}<div class="small muted">${esc((byId('subjects',e.subject_id)||{}).name||'')}</div></td>
          <td><div class="row" style="gap:5px">${dutyOf(e.id).map(d=>`<span class="badge ${d.role==='main'?'b-blue':'b-gray'}" style="cursor:pointer" data-act="duty-del" data-id="${escAttr(d.id)}">${esc((byId('users',d.teacher_id)||{}).full_name||'')} ✕</span>`).join('')||'<span class="badge b-amber">بدون مراقب</span>'}</div></td>
          <td><select class="select" data-f="duty-add" data-e="${escAttr(e.id)}"><option value="">انتخاب دبیر…</option>
            ${schoolTeachers().map(t=>`<option value="${escAttr(t.id)}">${esc(t.full_name)}</option>`).join('')}</select></td></tr>`).join('')}
        </tbody></table></div>`:empty('👁️','ابتدا جلسات را تعریف کنید','')}</div>
      <div class="card"><div class="card-head"><h3>توزیع بار مراقبت</h3></div>
        ${loadArr.length?`<div class="card-body" style="display:grid;gap:9px">${loadArr.map(([n,v])=>`<div>
          <div class="row" style="justify-content:space-between"><span class="small">${esc(n)}</span><b class="small">${fa(v)}</b></div>
          ${bar(v,loadArr[0][1],'var(--primary)')}</div>`).join('')}</div>`:empty('⚖️','ابلاغی صادر نشده','')}</div>
    </div>`}`;
}

/* ---------------- صفحه: خانواده (اولیا) ---------------- */
function viewFamily(){
  const kids=myKids();
  const schools=[...new Set(kids.map(k=>k.school_name))];
  const groups={};
  kids.forEach(k=>{(groups[k.school_name]=groups[k.school_name]||[]).push(k);});
  return `<div class="grid g3" style="margin-bottom:14px">
    ${statCard('👨‍👩‍👦',fa(kids.length),'فرزند','blue')}
    ${statCard('🏫',fa(schools.length),'مدرسه','green')}
    ${statCard('🕵️',fa(pendingKids().length),'در انتظار تأیید شما','amber')}</div>
   ${kids.length?Object.entries(groups).map(([sc,list])=>`<div class="card" style="margin-bottom:14px">
      <div class="card-head"><h3>🏫 ${esc(sc)}</h3><span class="badge b-gray">${fa(list.length)} فرزند</span></div>
      <div class="card-body" style="display:grid;gap:10px">
      ${list.map(k=>`<div class="row" style="background:var(--surface-2);padding:12px 14px;border-radius:12px">
        <div class="avatar">${esc(k.full_name[0])}</div>
        <div style="min-width:0"><b>${esc(k.full_name)}</b>
          <div class="small muted">${esc(k.class_name)} · نسبت: ${esc(k.relation)} · کد ملی: ${esc(k.national_id||'—')}</div></div>
        <div class="spacer"></div>
        ${k.verify==='confirmed'?'<span class="badge b-green">تأیید شده</span>'
          :`<span class="badge b-amber">در انتظار تأیید</span>
            <button class="btn sm" data-act="kid-confirm" data-id="${escAttr(k.id)}">تأیید</button>
            <button class="btn ghost sm" data-act="kid-reject" data-id="${escAttr(k.id)}">فرزند من نیست</button>`}
        <button class="btn ghost sm" data-act="child-open" data-id="${escAttr(k.id)}">پرونده</button>
      </div>`).join('')}</div></div>`).join('')
    :empty('👨‍👩‍👦','فرزندی به کد ملی شما متصل نیست','از مدرسه بخواهید کد ملی شما را در پرونده فرزندتان ثبت کند.')}`;
}

/* ---------------- صفحه: درخواست‌های اصلاح (مدیر) ---------------- */
function viewCorrections(){
  const rows=db.corrections.filter(c=>c.school_id===S.user.school_id||S.user.role==='superadmin')
    .sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  return `<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--primary-soft),#fff)">
    <div class="card-body small" style="line-height:2"><b>درخواست‌های اصلاح اطلاعات</b><br>
    اگر ولی هنگام ورود اعلام کند دانش‌آموزی فرزند او نیست، ارتباط برداشته می‌شود و گزارش آن اینجا می‌آید.
    معمولاً علت، اشتباه در ثبت کد ملی پدر یا مادر است.</div></div>
   <div class="card"><div class="card-head"><h3>📮 درخواست‌ها</h3><span class="badge b-gray">${fa(rows.filter(r=>r.status==='open').length)} باز</span></div>
    ${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>دانش‌آموز</th><th>کد ملی پدر ثبت‌شده</th><th>ولی معترض</th><th>پیام</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${rows.map(r=>{const st=byId('users',r.student_id)||{},p=byId('users',r.parent_id)||{};
      return `<tr><td class="small">${jalali(r.created_at)}</td><td><b>${esc(st.full_name||'—')}</b><div class="small muted">${esc(st.national_id||'')}</div></td>
      <td class="small">${esc(st.father_nid||'—')}</td><td>${esc(p.full_name||'—')}<div class="small muted">${esc(p.national_id||'')}</div></td>
      <td class="small">${esc(r.message||'')}</td>
      <td><span class="badge ${r.status==='open'?'b-amber':'b-green'}">${r.status==='open'?'در انتظار بررسی':'اصلاح شد'}</span></td>
      <td>${r.status==='open'?`<button class="btn sm" data-act="corr-fix" data-id="${escAttr(r.id)}">بررسی و اصلاح</button>`:''}</td></tr>`;}).join('')}
    </tbody></table></div>`:empty('✅','درخواستی وجود ندارد','همه اطلاعات اولیا تأیید شده است.')}</div>`;
}

/* ---------------- مودال تأیید فرزندان (نخستین ورود ولی) ---------------- */

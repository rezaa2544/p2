/* ═══════════════════════════════════════════════════════════════════
   E.8 — کلاس‌های تابستانی
   ------------------------------------------------------------------
   دوره‌های جبرانی/تقویتی/هنری/ورزشی تابستان، جدا از سال تحصیلی رسمی.
   مدل تازه:
     summer_classes      {school_id,title,subject,teacher_id,start_date,end_date,
                          schedule,capacity,status,created_at,updated_at}
     summer_enrollments  {school_id,summer_class_id,student_id,enrolled_at,status,
                          attendance:{date:status},created_at,updated_at}
   سازگاری: رکوردهای قدیمیِ دور ۶.۴ با name/student_ids همچنان خوانده می‌شوند.
   ═══════════════════════════════════════════════════════════════════ */

const SUMMER_STATUS = [['planned','برنامه‌ریزی‌شده'],['active','در حال برگزاری'],['done','تمام‌شده']];
const SUMMER_ENROLL_STATUS = [['enrolled','ثبت‌نام‌شده'],['withdrawn','انصراف داده']];
const SUMMER_ATT_STATUS = [['present','حاضر'],['absent','غایب'],['late','تاخیر'],['excused','موجه']];
const SUMMER_DAY_FA = {saturday:'شنبه',sunday:'یکشنبه',monday:'دوشنبه',tuesday:'سه‌شنبه',wednesday:'چهارشنبه',thursday:'پنجشنبه',friday:'جمعه'};
function summerTitle(c){ return (c && (c.title || c.name)) || '—'; }
function summerStatusLabel(v){ const x=SUMMER_STATUS.find(s=>s[0]===v); return x?x[1]:'برنامه‌ریزی‌شده'; }
function summerEnrollLabel(v){ const x=SUMMER_ENROLL_STATUS.find(s=>s[0]===v); return x?x[1]:'ثبت‌نام‌شده'; }
function summerAttLabel(v){ const x=SUMMER_ATT_STATUS.find(s=>s[0]===v); return x?x[1]:'—'; }
function summerScheduleObj(c){
  const raw=c&&c.schedule;
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)) return raw;
  if(typeof raw==='string'&&raw.trim()){
    try{ const o=JSON.parse(raw); if(o&&typeof o==='object'&&!Array.isArray(o)) return o; }catch(e){}
  }
  return {};
}
function summerScheduleText(c){
  const o=summerScheduleObj(c), keys=Object.keys(o);
  if(keys.length) return keys.map(k=>`${SUMMER_DAY_FA[k]||k}: ${o[k]}`).join('، ');
  return c&&c.note?String(c.note):'—';
}
function summerEnrollmentRows(classId){
  return (db.summer_enrollments||[]).filter(e=>Number(e.summer_class_id)===Number(classId));
}
function summerActiveEnrollments(classId){
  return summerEnrollmentRows(classId).filter(e=>(e.status||'enrolled')==='enrolled');
}
function summerStudentIds(c){
  const ids=[];
  summerActiveEnrollments(c.id).forEach(e=>{ if(ids.indexOf(e.student_id)===-1)ids.push(e.student_id); });
  (c.student_ids||[]).forEach(sid=>{ if(ids.indexOf(sid)===-1)ids.push(sid); });
  return ids;
}
function summerClassesForRole(u){
  const all=(db.summer_classes||[]).slice().sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
  if(!u) return [];
  if(u.role==='superadmin') return all;
  if(u.role==='manager') return all.filter(c=>Number(c.school_id)===Number(u.school_id));
  if(u.role==='teacher') return all.filter(c=>Number(c.teacher_id)===Number(u.id));
  if(u.role==='student') return all.filter(c=>summerStudentIds(c).indexOf(u.id)>-1);
  if(u.role==='parent'){
    const kids=(db.parent_links||[]).filter(l=>l.parent_id===u.id).map(l=>l.student_id);
    return all.filter(c=>summerStudentIds(c).some(sid=>kids.indexOf(sid)>-1));
  }
  return [];
}
function summerEnsureEnrollment(c, sid, status){
  let e=(db.summer_enrollments||[]).find(x=>Number(x.summer_class_id)===Number(c.id)&&Number(x.student_id)===Number(sid));
  if(e){ update('summer_enrollments',e.id,{status:status||'enrolled',updated_at:todayISO()}); return e.id; }
  const rec={school_id:c.school_id,summer_class_id:c.id,student_id:sid,enrolled_at:todayISO(),status:status||'enrolled',attendance:{},created_at:todayISO(),updated_at:todayISO()};
  const ne=insert('summer_enrollments',rec);
  return ne&&ne.id;
}
function summerClassesForStudent(sid){ return (db.summer_classes||[]).filter(c=>summerStudentIds(c).indexOf(Number(sid))>-1); }
function summerDashboardCard(sid){
  const rows=summerClassesForStudent(sid).filter(c=>(c.status||'planned')!=='done');
  if(!rows.length) return '';
  return `<div class="card summer-card"><div class="card-head"><h3>☀️ کلاس‌های تابستانی من</h3><span class="badge b-amber">${fa(rows.length)} کلاس</span></div>
    <div class="card-body" style="display:grid;gap:8px">${rows.map(c=>{
      const t=byId('users',c.teacher_id)||{};
      return `<div style="border:1px solid var(--border);border-radius:10px;padding:8px 10px">
        <b>${esc(summerTitle(c))}</b> <span class="badge b-gray">${esc(c.subject||'عمومی')}</span>
        <div class="small muted">دبیر: ${esc(t.full_name||'—')} · ${summerStatusLabel(c.status)} · ${summerScheduleText(c)}</div>
      </div>`;
    }).join('')}</div></div>`;
}

function summerTeacherDashboardPanel(){
  if(!S.user||S.user.role!=='teacher') return '';
  const rows=summerClassesForRole(S.user).filter(c=>(c.status||'planned')!=='done');
  if(!rows.length) return '';
  return `<div class="card summer-teacher-card"><div class="card-head"><h3>☀️ کلاس‌های تابستانی من</h3><span class="badge b-amber">${fa(rows.length)} کلاس</span></div>
    <div class="card-body" style="display:grid;gap:8px">${rows.map(c=>`<div class="row" style="gap:8px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;flex-wrap:wrap"><b>${esc(summerTitle(c))}</b><span class="badge b-gray">${esc(c.subject||'عمومی')}</span><span class="small muted">${summerScheduleText(c)}</span><div class="spacer"></div><button class="btn ghost sm" data-act="summer-att" data-id="${c.id}">✅ ثبت حضور</button></div>`).join('')}</div></div>`;
}

function viewSummerClasses(){
  var u=S.user;
  var rows=summerClassesForRole(u);
  var canManage=u.role==='manager'||u.role==='superadmin';
  var canAttend=u.role==='teacher'||canManage;
  var enrolls=rows.reduce(function(a,s){return a+summerActiveEnrollments(s.id).length;},0);
  var h='<div class="card">';
  h+='<div class="card-body" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">';
  h+='<div style="border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center">'
    +'<div class="small muted">کلاس‌های تابستانی</div>'
    +'<div style="font-size:26px;font-weight:800;color:var(--primary)">'+fa(rows.length)+'</div></div>';
  h+='<div style="border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center">'
    +'<div class="small muted">ثبت‌نام فعال</div>'
    +'<div style="font-size:26px;font-weight:800;color:var(--primary)">'+fa(enrolls)+'</div></div>';
  h+='</div>';
  h+='<div class="card-head" style="border-bottom:1px solid var(--border)"><div class="row" style="flex-wrap:wrap;gap:8px">'
    +'<span class="small muted">دوره‌های تابستانی مستقل از کارنامه و حضور رسمی هستند.</span><div class="spacer"></div>'
    +(canManage?'<button class="btn sm" data-act="summer-new">➕ کلاس تابستانی تازه</button>':'')+'</div></div>';
  if(rows.length){
    h+='<div style="display:grid;gap:10px;padding:12px">';
    rows.forEach(function(s){
      var t=byId('users',s.teacher_id)||{};
      var studs=summerStudentIds(s).map(function(sid){var x=byId('users',sid);return x?x.full_name:'؟';});
      var cap=Number(s.capacity)||15;
      h+='<div style="border:1px solid var(--border);border-radius:10px;padding:10px 14px">'
        +'<div class="row" style="flex-wrap:wrap;gap:8px">'
        +'<b>'+esc(summerTitle(s))+'</b>'
        +'<span class="badge b-cyan">'+esc(s.subject||'عمومی')+'</span>'
        +'<span class="muted small">دبیر: '+esc(t.full_name||'—')+'</span>'
        +'<span class="badge b-gray">شروع: '+(s.start_date?jalali(s.start_date):'—')+'</span>'
        +(s.end_date?'<span class="badge b-gray">پایان: '+jalali(s.end_date)+'</span>':'')
        +'<span class="badge b-amber">'+summerStatusLabel(s.status)+'</span>'
        +'<span class="badge b-blue">دانش‌آموز: '+fa(studs.length)+'/'+fa(cap)+'</span>'
        +'<div class="spacer"></div>'
        +(canManage?'<button class="btn ghost sm" data-act="summer-edit" data-id="'+s.id+'">✏️ ویرایش</button> ':'')
        +(canManage?'<button class="btn ghost sm" data-act="summer-students" data-id="'+s.id+'">👥 ثبت‌نام</button> ':'')
        +(canAttend?'<button class="btn ghost sm" data-act="summer-att" data-id="'+s.id+'">✅ حضور</button> ':'')
        +(canManage?'<button class="icon-btn danger" data-act="summer-del" data-id="'+s.id+'" title="حذف">🗑️</button>':'')
        +'</div>'
        +'<div class="small muted" style="margin-top:6px">برنامه: '+esc(summerScheduleText(s))+'</div>'
        +(studs.length?'<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:6px">'
          +studs.map(function(n){return '<span class="badge b-blue small">'+esc(n)+'</span>';}).join('')
          +'</div>':'')
        +'</div>';
    });
    h+='</div>';
  } else {
    h+='<div class="card-body">'+empty('☀️','کلاس تابستانی مرتبطی نیست','مدیر مدرسه می‌تواند دوره تعریف کند؛ دبیر فقط کلاس‌های خودش را می‌بیند.')+'</div>';
  }
  return h+'</div>';
}

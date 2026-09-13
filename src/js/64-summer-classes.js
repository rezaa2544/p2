/* ═══════════════════════════════════════════════════════════════════
   بند ۶.۴ — کلاس‌های تابستانی (نسخهٔ سبک)
   نام + دبیر + دانش‌آموزان + تاریخ‌ها؛ کاملاً جدا از سالِ
   تحصیلیِ رسمی (تأثیر روی کارنامه/حضور ندارد). فقط مدیر.

   داده:
     summer_classes {school_id, name, teacher_id, student_ids:[],
                     start_date, end_date, note,
                     created_at, updated_at}
   ═══════════════════════════════════════════════════════════════════ */

function summerOf(schoolId){
  return (db.summer_classes||[]).filter(function(s){return s.school_id===schoolId;})
    .slice().sort(function(a,b){return String(b.updated_at||'').localeCompare(String(a.updated_at||''));});
}

function viewSummerClasses(){
  var u=S.user;
  var rows=summerOf(u.school_id);
  var enrolls=rows.reduce(function(a,s){return a+((s.student_ids||[]).length);},0);
  var h='<div class="card">';
  h+='<div class="card-body" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">';
  h+='<div style="border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center">'
    +'<div class="small muted">کلاس‌های تابستانی</div>'
    +'<div style="font-size:26px;font-weight:800;color:var(--primary)">'+fa(rows.length)+'</div></div>';
  h+='<div style="border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center">'
    +'<div class="small muted">دانش‌آموزِ ثبت‌نام‌شده</div>'
    +'<div style="font-size:26px;font-weight:800;color:var(--primary)">'+fa(enrolls)+'</div></div>';
  h+='</div>';
  h+='<div class="card-head" style="border-bottom:1px solid var(--border)"><div class="row" style="flex-wrap:wrap;gap:8px">'
    +'<span class="small muted">مجموعهٔ کلاس‌های تابستان — جدا از سالِ تحصیلیِ رسمی؛ روی کارنامه و حضور اثر ندارد.</span><div class="spacer"></div>'
    +'<button class="btn sm" data-act="summer-new">➕ کلاسِ تابستانیِ تازه</button></div></div>';
  if(rows.length){
    h+='<div style="display:grid;gap:10px;padding:12px">';
    rows.forEach(function(s){
      var t=byId('users',s.teacher_id)||{};
      var studs=(s.student_ids||[]).map(function(sid){var x=byId('users',sid);return x?x.full_name:'؟';});
      h+='<div style="border:1px solid var(--border);border-radius:10px;padding:10px 14px">'
        +'<div class="row" style="flex-wrap:wrap;gap:8px">'
        +'<b>'+esc(s.name)+'</b>'
        +'<span class="muted small">دبیر: '+esc(t.full_name||'—')+'</span>'
        +'<span class="badge b-gray">شروع: '+(s.start_date?jalali(s.start_date):'—')+'</span>'
        +(s.end_date?'<span class="badge b-gray">پایان: '+jalali(s.end_date)+'</span>':'')
        +'<span class="badge b-cyan">دانش‌آموز: '+fa(studs.length)+'</span>'
        +'<div class="spacer"></div>'
        +'<button class="btn ghost sm" data-act="summer-students" data-id="'+s.id+'">👥 دانش‌آموزان</button> '
        +'<button class="icon-btn danger" data-act="summer-del" data-id="'+s.id+'" title="حذف">🗑️</button>'
        +'</div>'
        +(s.note?'<div class="small muted" style="margin-top:6px">'+esc(s.note)+'</div>':'')
        +(studs.length?'<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:6px">'
          +studs.map(function(n){return '<span class="badge b-blue small">'+esc(n)+'</span>';}).join('')
          +'</div>':'')
        +'</div>';
    });
    h+='</div>';
  } else {
    h+='<div class="card-body">'+empty('☀️','کلاسِ تابستانی ثبت نشده','نام، دبیر و تاریخ‌ها را ثبت کنید و بعد دانش‌آموزان را اضافه کنید.')+'</div>';
  }
  return h+'</div>';
}

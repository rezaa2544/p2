/* ═══════════════════════════════════════════════════════════════════
   بند ۶.۱ — گردش کار امتحانات شهریور/تجدیدی
   ثبتِ درسِ تجدیدی + تاریخِ امتحانِ مجدد + نمرهٔ نهاییِ پس از
   تجدیدی. نمرهٔ نهایی = نمرهٔ مجدد (وقتی ثبت شد)، وگرنه نمرهٔ
   اصلی.
   ═══════════════════════════════════════════════════════════════════ */
const REEXAM_STATUSES=[['scheduled','برنامه‌ریزی‌شده'],['done','انجام‌شده']];
const REEXAM_BADGE={scheduled:'b-blue',done:'b-green'};

function reexamFinalScore(r){
  if(r.status==='done' && r.new_score!=null && r.new_score!=='') return Number(r.new_score);
  return r.original_score!=null?Number(r.original_score):null;
}

function viewReexams(){
  var u=S.user;
  var rows=(db.reexams||[]).filter(function(r){return r.school_id===u.school_id;})
    .slice().sort(function(a,b){return String(b.updated_at||'').localeCompare(String(a.updated_at||''));});
  var counts={scheduled:0,done:0};
  rows.forEach(function(r){counts[r.status]=(counts[r.status]||0)+1;});
  var h='<div class="card">';
  h+='<div class="card-body" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">';
  REEXAM_STATUSES.forEach(function(s){
    h+='<div style="border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center">'
      +'<div class="small muted">'+esc(s[1])+'</div>'
      +'<div style="font-size:26px;font-weight:800;color:var(--primary)">'+fa(counts[s[0]]||0)+'</div></div>';
  });
  h+='</div>';
  h+='<div class="card-head" style="border-bottom:1px solid var(--border)"><div class="row" style="flex-wrap:wrap;gap:8px">'
    +'<span class="small muted">دروسِ نیازمندِ امتحانِ مجدد (شهریور/تجدیدی) — نمرهٔ نهایی پس از ثبتِ نمرهٔ مجدد به‌روز می‌شود.</span><div class="spacer"></div>'
    +'<button class="btn sm" data-act="reexam-new">➕ ثبتِ درسِ تجدیدی</button></div></div>';
  if(rows.length){
    h+='<div class="table-wrap"><table><thead><tr><th>دانش‌آموز</th><th>درس</th><th>نمرهٔ اصلی</th><th>تاریخِ مجدد</th><th>نمرهٔ مجدد</th><th>نمرهٔ نهایی</th><th>وضعیت</th><th></th></tr></thead><tbody>';
    rows.forEach(function(r){
      var st=(REEXAM_STATUSES.find(function(x){return x[0]===r.status;})||['','—'])[1];
      h+='<tr><td><b>'+esc((byId('users',r.student_id)||{}).full_name||'—')+'</b></td>'
        +'<td>'+esc((byId('subjects',r.subject_id)||{}).name||'—')+'</td>'
        +'<td>'+fa(r.original_score)+'</td>'
        +'<td class="muted small">'+(r.exam_date?jalali(r.exam_date):'—')+'</td>'
        +'<td>'+(r.new_score!=null&&r.new_score!==''?fa(r.new_score):'—')+'</td>'
        +'<td><b>'+(reexamFinalScore(r)!=null?fa(reexamFinalScore(r)):'—')+'</b></td>'
        +'<td><span class="badge '+(REEXAM_BADGE[r.status]||'b-gray')+'">'+esc(st)+'</span></td>'
        +'<td style="white-space:nowrap">'
        +'<button class="btn ghost sm" data-act="reexam-score" data-id="'+escAttr(r.id)+'">✍️ '+(r.status==='done'?'تغییرِ نمرهٔ مجدد':'ثبتِ نمرهٔ مجدد')+'</button> '
        +'<button class="icon-btn danger" data-act="reexam-del" data-id="'+escAttr(r.id)+'" title="حذف">🗑️</button></td></tr>';
    });
    h+='</tbody></table></div>';
  } else {
    h+='<div class="card-body">'+empty('📝','درسی برای تجدیدی ثبت نشده','دانش‌آموز و درسِ نیازمندِ امتحانِ مجدد را ثبت کنید.')+'</div>';
  }
  return h+'</div>';
}

/** کارتِ فقط‌خواندنی در تبِ کارنامهٔ پرونده: دروسِ تجدیدی این دانش‌آموز */
function reexamCard(sid){
  var rows=(db.reexams||[]).filter(function(r){return r.student_id===sid;});
  if(!rows.length)return '';
  var h='<div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-top:14px">'
    +'<div class="row" style="align-items:center;gap:10px;margin-bottom:8px"><b>📝 امتحاناتِ تجدیدی (شهریور)</b></div>';
  h+='<table class="table" style="margin-top:0"><thead><tr><th>درس</th><th>نمرهٔ اصلی</th><th>تاریخِ مجدد</th><th>نمرهٔ نهایی</th><th>وضعیت</th></tr></thead><tbody>';
  rows.forEach(function(r){
    var st=(REEXAM_STATUSES.find(function(x){return x[0]===r.status;})||['','—'])[1];
    h+='<tr><td>'+esc((byId('subjects',r.subject_id)||{}).name||'—')+'</td>'
      +'<td>'+fa(r.original_score)+'</td>'
      +'<td class="muted small">'+(r.exam_date?jalali(r.exam_date):'—')+'</td>'
      +'<td><b>'+(reexamFinalScore(r)!=null?fa(reexamFinalScore(r)):'—')+'</b></td>'
      +'<td><span class="badge '+(REEXAM_BADGE[r.status]||'b-gray')+' small">'+esc(st)+'</span></td></tr>';
  });
  return h+'</tbody></table></div>';
}

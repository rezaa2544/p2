/* ═══════════════════════════════════════════════════════════════════
   بند ۴.۴ — قیف پیش‌ثبت‌نامِ رقابتی (مدارس غیردولتی با آزمون ورودی)
   مرحله‌ها: تماسِ اولیه → بازدید از مدرسه → آزمونِ ورودی → ثبت‌نامِ قطعی
   ⚠️ این قیف جدا از ثبت‌نامِ رسمی (enrollments) است و هیچ تبدیلِ
   خودکاری ندارد؛ مدیر خودش تصمیم می‌گیرد.
   ═══════════════════════════════════════════════════════════════════ */
const PREAPP_STAGES=[['contact','تماسِ اولیه'],['visit','بازدید از مدرسه'],['exam','آزمونِ ورودی'],['enrolled','ثبت‌نامِ قطعی']];
const PREAPP_BADGE={contact:'b-gray',visit:'b-blue',exam:'b-purple',enrolled:'b-green'};

function viewPreapps(){
  var u=S.user;
  var rows=(db.preapps||[]).filter(function(r){return r.school_id===u.school_id;})
    .slice().sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at));});
  var counts={};
  PREAPP_STAGES.forEach(function(s){counts[s[0]]=0;});
  rows.forEach(function(r){counts[r.stage]=(counts[r.stage]||0)+1;});
  var h='<div class="card">';
  h+='<div class="card-body" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">';
  PREAPP_STAGES.forEach(function(s){
    h+='<div style="border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center">'
      +'<div class="small muted">'+esc(s[1])+'</div>'
      +'<div style="font-size:26px;font-weight:800;color:var(--primary)">'+fa(counts[s[0]]||0)+'</div></div>';
  });
  h+='</div>';
  h+='<div class="card-head" style="border-bottom:1px solid var(--border)"><div class="row" style="flex-wrap:wrap;gap:8px">'
    +'<span class="small muted">پیگیریِ داوطلبان — این قیف جدا از ثبت‌نامِ رسمی است.</span><div class="spacer"></div>'
    +'<button class="btn sm" data-act="preapp-new">➕ ثبتِ تازه</button></div></div>';
  if(rows.length){
    h+='<div class="table-wrap"><table><thead><tr><th>نام</th><th>تلفن</th><th>مرحله</th><th>تغییرِ مرحله</th><th>یادداشت</th><th></th></tr></thead><tbody>';
    rows.forEach(function(r){
      var i=-1;
      for(var k=0;k<PREAPP_STAGES.length;k++){if(PREAPP_STAGES[k][0]===r.stage){i=k;break;}}
      var next=(i>-1&&i<PREAPP_STAGES.length-1)?PREAPP_STAGES[i+1]:null;
      var label=(i>-1?PREAPP_STAGES[i][1]:'—');
      h+='<tr><td><b>'+esc(r.name)+'</b></td><td dir="ltr" class="muted">'+esc(r.phone)+'</td>'
        +'<td><span class="badge '+(PREAPP_BADGE[r.stage]||'b-gray')+'">'+esc(label)+'</span></td>'
        +'<td class="muted small">'+jalali(r.stage_at)+'</td>'
        +'<td class="muted small" style="white-space:normal;max-width:240px">'+esc(r.note||'—')+'</td>'
        +'<td style="white-space:nowrap">'
        +(next?'<button class="btn ghost sm" data-act="preapp-next" data-id="'+escAttr(r.id)+'">→ '+esc(next[1])+'</button> ':'')
        +'<button class="icon-btn danger" data-act="preapp-del" data-id="'+escAttr(r.id)+'" title="حذف">🗑️</button></td></tr>';
    });
    h+='</tbody></table></div>';
  } else {
    h+='<div class="card-body">'+empty('📥','هنوز پیش‌ثبت‌نامی نیست','برای پیگیریِ داوطلب، «ثبتِ تازه» را بزنید.')+'</div>';
  }
  return h+'</div>';
}

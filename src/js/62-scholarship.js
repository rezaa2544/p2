/* ═══════════════════════════════════════════════════════════════════
   بند ۲.۴ — بورسیه/کمک‌هزینه (فاز ۲: شمول)
   ماژولِ سبک: مدیر دانش‌آموزِ نیازمند را علامت می‌زند، وضعیت
   کمک‌هزینه را ثبت می‌کند (درخواست‌شده → در حال بررسی → تأییدشده
   / ردشده) و یادداشتِ کوتاه می‌گذارد.
   ⚠️ بدونِ اتصال به سیستمِ پرداخت — فقط ثبت و پیگیری.
   ═══════════════════════════════════════════════════════════════════ */
const SCHOLAR_STATUSES=[['requested','درخواست‌شده'],['review','در حال بررسی'],['approved','تأییدشده'],['rejected','ردشده']];
const SCHOLAR_BADGE={requested:'b-gray',review:'b-blue',approved:'b-green',rejected:'b-red'};
/* فقط حرکت‌های مجاز — پرش و عقب‌رفتنِ دل‌خواه نیست */
const SCHOLAR_NEXT={
  requested:[['review','→ در حال بررسی'],['rejected','✗ رد']],
  review:[['approved','✓ تأیید'],['rejected','✗ رد']],
  approved:[['review','↩ بازگشایی']],
  rejected:[['review','↩ بازگشایی']]
};

function viewScholarships(){
  var u=S.user;
  var rows=(db.scholarships||[]).filter(function(r){return r.school_id===u.school_id;})
    .slice().sort(function(a,b){return String(b.updated_at||'').localeCompare(String(a.updated_at||''));});
  var counts={};
  SCHOLAR_STATUSES.forEach(function(s){counts[s[0]]=0;});
  rows.forEach(function(r){counts[r.status]=(counts[r.status]||0)+1;});
  var h='<div class="card">';
  h+='<div class="card-body" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">';
  SCHOLAR_STATUSES.forEach(function(s){
    h+='<div style="border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center">'
      +'<div class="small muted">'+esc(s[1])+'</div>'
      +'<div style="font-size:26px;font-weight:800;color:var(--primary)">'+fa(counts[s[0]]||0)+'</div></div>';
  });
  h+='</div>';
  h+='<div class="card-head" style="border-bottom:1px solid var(--border)"><div class="row" style="flex-wrap:wrap;gap:8px">'
    +'<span class="small muted">علامت‌گذاری دانش‌آموزانِ نیازمند و پیگیریِ کمک‌هزینه — بدونِ اتصال به پرداخت، فقط ثبت.</span><div class="spacer"></div>'
    +'<button class="btn sm" data-act="scholar-new">➕ ثبتِ دانش‌آموزِ نیازمند</button></div></div>';
  if(rows.length){
    h+='<div class="table-wrap"><table><thead><tr><th>دانش‌آموز</th><th>وضعیت</th><th>یادداشت</th><th>به‌روزرسانی</th><th></th></tr></thead><tbody>';
    rows.forEach(function(r){
      var st=(SCHOLAR_STATUSES.find(function(x){return x[0]===r.status;})||['','—'])[1];
      var nexts=SCHOLAR_NEXT[r.status]||[];
      h+='<tr><td><b>'+esc((byId('users',r.student_id)||{}).full_name||'—')+'</b></td>'
        +'<td><span class="badge '+(SCHOLAR_BADGE[r.status]||'b-gray')+'">'+esc(st)+'</span></td>'
        +'<td class="muted small" style="white-space:normal;max-width:260px">'+esc(r.note||'—')+'</td>'
        +'<td class="muted small">'+(r.updated_at?jalali(r.updated_at):'—')+'</td>'
        +'<td style="white-space:nowrap">'
        +nexts.map(function(n){return '<button class="btn ghost sm" data-act="scholar-set" data-id="'+escAttr(r.id)+'" data-to="'+n[0]+'">'+esc(n[1])+'</button> ';}).join('')
        +'<button class="icon-btn danger" data-act="scholar-del" data-id="'+escAttr(r.id)+'" title="حذف">🗑️</button></td></tr>';
    });
    h+='</tbody></table></div>';
  } else {
    h+='<div class="card-body">'+empty('🎓','هنوز دانش‌آموزی علامت نخورده','دانش‌آموزِ نیازمند را انتخاب کنید و وضعیتش را ثبت کنید.')+'</div>';
  }
  return h+'</div>';
}

/** نشانِ کمکی: در تبِ شناسنامهٔ پرونده، اگر رکوردِ کمک‌هزینهٔ این
    دانش‌آموز وجود داشته باشد فقط‌خواندنی نشان داده می‌شود. */
function scholarshipBadge(sid){
  var rec=(db.scholarships||[]).find(function(r){return r.student_id===sid;});
  if(!rec)return '';
  var st=(SCHOLAR_STATUSES.find(function(x){return x[0]===rec.status;})||['','—'])[1];
  return '<div class="row" style="border:1px solid var(--border);border-radius:12px;padding:10px 14px;margin-top:14px;align-items:center;gap:8px;flex-wrap:wrap">'
    +'<b>🎓 کمک‌هزینه</b><span class="badge '+(SCHOLAR_BADGE[rec.status]||'b-gray')+'">'+esc(st)+'</span>'
    +(rec.note?'<span class="muted small">'+esc(rec.note)+'</span>':'')
    +'</div>';
}

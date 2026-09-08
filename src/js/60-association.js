/* ─────────────────────────────────────────────────────────────
   انجمن اولیا و مربیان — کمک داوطلبانه (دور ۶۵ بند ۵)
   مدارس دولتی: ماژول شهریه خاموش است؛ به‌جای آن انجمن،
   کمک‌های داوطلبانهٔ اولیا را به‌صورت شفاف ثبت می‌کند.
   داده: transactions با category='کمک مردمی' — همان دسته‌ای
   که مالی مدرسه از قبل می‌شناخت؛ هیچ جدول جدیدی ساخته نمی‌شود.
   ───────────────────────────────────────────────────────────── */

const ASSOC_CAT = 'کمک مردمی';

function assocTxns(schoolId){
  return (db.transactions||[]).filter(function(t){
    return t.school_id===schoolId && t.category===ASSOC_CAT;
  });
}

function viewAssociation(){
  const u=S.user;
  const role=(typeof activePersona==='function')?activePersona():u.role;
  if(['manager','superadmin'].indexOf(role)<0){
    return empty('🔒','فقط مدیر مدرسه','این صفحه جزو امور مالی مدرسه است');
  }
  const sid=u.school_id;
  const pub=sid && (typeof hasCap==='function') && !hasCap(sid,'has_tuition');
  if(!pub){
    return empty('🏫','برای این مدرسه قابل‌اعمال نیست',
      'انجمن و کمک داوطلبانه مخصوص مدارس دولتی است؛ این مدرسه ماژول شهریه دارد و امور مالی‌اش از صفحهٔ «شهریه و امور مالی» پیگیری می‌شود.');
  }
  const tx=assocTxns(sid);
  const sum=(k)=>tx.filter(t=>t.kind===k).reduce((a,t)=>a+Number(t.amount||0),0);
  const inc=sum('income'), exp=sum('expense');
  const ym=todayISO().slice(0,7);
  const monthN=tx.filter(t=>String(t.date||'').slice(0,7)===ym).length;
  const rows=tx.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,50);
  const rowsHtml=rows.length?`
    <div class="table-wrap"><table>
    <thead><tr><th>تاریخ</th><th>شرح</th><th>نوع</th><th>مبلغ</th></tr></thead>
    <tbody>${rows.map(t=>`
      <tr>
        <td>${jalali(t.date)}</td>
        <td>${esc(t.description||'—')}</td>
        <td>${t.kind==='income'?'<span class="badge b-green">کمک‌هزینه</span>':'<span class="badge b-red">هزینه</span>'}</td>
        <td class="num">${rial(t.amount)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`:empty('🤝','هنوز تراکنشی ثبت نشده','اولین کمک یا هزینهٔ انجمن را از فرم بالای صفحه ثبت کنید');
  return `
  <div class="card">
    <h3>🤝 انجمن اولیا و مربیان — کمک داوطلبانه</h3>
    <div class="small" style="line-height:1.9">
      این مدرسه دولتی است و ماژول شهریه ندارد. کمک‌های داوطلبانهٔ اولیا از طریق انجمن
      جمع‌آوری و در همین صفحه به‌صورت شفاف ثبت می‌شود؛ این دفتر، حسابداریِ درون‌مدرسه است و
      در پنل اولیا نمایش داده نمی‌شود.
    </div>
  </div>
  <div class="card grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
    <div class="stat"><div class="stat-n">${rial(inc)}</div><div class="stat-l">کل کمک‌های دریافتی</div></div>
    <div class="stat"><div class="stat-n">${rial(exp)}</div><div class="stat-l">کل هزینه‌های انجمن</div></div>
    <div class="stat"><div class="stat-n">${rial(inc-exp)}</div><div class="stat-l">ماندهٔ انجمن</div></div>
    <div class="stat"><div class="stat-n">${fa(monthN)} تراکنش</div><div class="stat-l">ماه جاری</div></div>
  </div>
  <div class="card">
    <h3>ثبت تراکنش جدید</h3>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">
      ${f('نام واریزکننده / بابتِ هزینه',`<input class="input" id="a-asoc" placeholder="مثلاً ولیٔ فرزند ۱۲ / خرید کتاب دانش‌خانه">`)}
      ${f('نوع',sel('a-akind',[['income','کمک‌هزینهٔ داوطلبانه'],['expense','هزینهٔ انجمن']],'income'))}
      ${f('مبلغ (ریال)',`<input class="input" id="a-aamt" type="number" min="0" step="1000000" placeholder="5000000">`)}
      ${f('یادداشت (اختیاری)',`<input class="input" id="a-anote" placeholder="مثلاً برای اردوی پاییزی">`)}
      <div style="display:flex;align-items:flex-end"><button class="btn btn-primary" data-act="assoc-add">ثبت</button></div>
    </div>
  </div>
  <div class="card">
    <h3>تراکنش‌های انجمن <span class="small" style="font-weight:normal">(${fa(rows.length)} مورد اخیر از ${fa(tx.length)})</span></h3>
    ${rowsHtml}
  </div>
  ${assocMinutesSection(sid)}`;
}

/* ─────────────── بند ۶.۲ — صورت‌جلسهٔ رسمیِ جلساتِ انجمن ─────────────── */
function assocMinutes(schoolId){
  return (db.assoc_minutes||[]).filter(function(m){return m.school_id===schoolId;})
    .slice().sort(function(a,b){return String(b.meeting_date).localeCompare(String(a.meeting_date));});
}
/* ─────────────── C.1 فرناز — نوعِ جلسه (همان جدول، بدونِ جدولِ تازه) ─────────────── */
const MIN_TYPES=[['assoc','انجمن اولیا و مربیان'],['teachers','شورای معلمان'],['students','شورای دانش‌آموزان']];
function minTypeOf(m){ return (m&&MIN_TYPES.some(function(t){return t[0]===m.meeting_type;}))?m.meeting_type:'assoc'; }
function minTypeFa(m){ const t=MIN_TYPES.filter(function(x){return x[0]===minTypeOf(m);})[0]; return t?t[1]:MIN_TYPES[0][1]; }
function assocMinPrint(mid){
  const m=byId('assoc_minutes',Number(mid));
  if(!m)return;
  const w=window.open('','_blank');
  if(!w){toast('اجازهٔ باز کردنِ پنجره داده نشد','err');return;}
  const sc=((byId('schools',m.school_id)||{}).name)||'';
  const att=String(m.attendees||'').split('\n').filter(Boolean);
  const res=String(m.resolutions||'').split('\n').filter(Boolean);
  w.document.write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>صورت‌جلسهٔ '+jalali(m.meeting_date)+'</title>'
    +'<style>body{font-family:Vazirmatn,Tahoma;padding:28px;color:#0f172a;max-width:820px;margin:0 auto}'
    +'h1{font-size:20px;color:#1668f0;margin:0 0 2px;text-align:center}'
    +'.meta{text-align:center;font-size:13px;color:#475569;margin-bottom:16px}'
    +'hr{border:none;border-top:1px dashed #cbd5e1;margin:14px 0}'
    +'h2{font-size:15px;margin:16px 0 6px}.body{font-size:13.5px;line-height:2.1;white-space:pre-wrap;margin:0}'
    +'table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}'
    +'th,td{border:1px solid #cbd5e1;padding:8px;text-align:right}th{background:#eff6ff}'
    +'@media print{.np{display:none}}</style></head><body>'
    +'<h1>صورت‌جلسهٔ جلسهٔ '+esc(minTypeFa(m))+'</h1>'
    +'<div class="meta">'+esc(sc)+' — تاریخِ جلسه: '+jalali(m.meeting_date)+(m.archived?' — <b>بایگانی‌شده</b>':'')+'</div>'
    +'<hr><h2>حاضرین در جلسه</h2><p class="body">'+(att.length?att.map(esc).join('\n'):'—')+'</p>'
    +'<h2>مصوبات جلسه</h2><p class="body">'+(res.length?res.map(esc).join('\n'):'—')+'</p>'
    +'<hr><table><tr><th style="width:50%">رئیسِ جلسه</th><th>دستیار / دبیرِ جلسه</th></tr><tr><td style="height:56px"></td><td style="height:56px"></td></tr></table>'
    +'<div class="np" style="text-align:center;margin-top:14px"><button onclick="window.print()" style="padding:8px 22px;border:none;border-radius:8px;background:#1668f0;color:#fff;font-family:inherit;cursor:pointer">🖨️ چاپ</button></div></body></html>');
  w.document.close();
}
function assocMinutesSection(sid){
  const all=assocMinutes(sid);
  const ft=(S.filters&&S.filters.mtype)||'';
  const rows=ft?all.filter(function(m){return minTypeOf(m)===ft;}):all;
  const opts=[['','همهٔ جلسات']].concat(MIN_TYPES).map(function(o){
    return '<option value="'+o[0]+'"'+(ft===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('');
  let h='<div class="card"><h3>📄 صورت‌جلسهٔ جلسات <span class="small" style="font-weight:normal">('+fa(rows.length)+')</span> '
    +'<select class="input sm" data-f="mtype" style="max-width:200px;display:inline-block">'+opts+'</select> '
    +'<button class="btn btn-primary sm" data-act="assoc-min-new" style="float:left">➕ صورت‌جلسهٔ تازه</button></h3>';
  if(rows.length){
    h+='<div class="table-wrap"><table><thead><tr><th>تاریخِ جلسه</th><th>نوع جلسه</th><th>مصوبات</th><th>وضعیت</th><th></th></tr></thead><tbody>';
    rows.forEach(function(m){
      const res=String(m.resolutions||'').replace(/\s+/g,' ');
      h+='<tr><td>'+jalali(m.meeting_date)+'</td>'
        +'<td><span class="badge b-blue">'+esc(minTypeFa(m))+'</span></td>'
        +'<td style="max-width:420px"><span class="small">'+esc(res.length>60?res.slice(0,60)+'…':(res||'—'))+'</span></td>'
        +'<td>'+(m.archived?'<span class="badge b-gray">بایگانی‌شده</span>':'<span class="badge b-green">فعال</span>')+'</td>'
        +'<td style="white-space:nowrap">'
        +'<button class="btn ghost sm" data-act="assoc-min-print" data-id="'+m.id+'" title="چاپِ رسمی">🖨️ چاپ</button> '
        +'<button class="btn ghost sm" data-act="assoc-min-toggle" data-id="'+m.id+'">'+(m.archived?'♻️ برگرداندن':'🗄️ بایگانی')+'</button> '
        +'<button class="icon-btn danger" data-act="assoc-min-del" data-id="'+m.id+'" title="حذف">🗑️</button></td></tr>';
    });
    h+='</tbody></table></div>';
  } else {
    h+=empty('📄','صورت‌جلسه‌ای ثبت نشده','تاریخِ جلسه، حاضرین و مصوبات را ثبت کنید؛ بایگانی و چاپِ رسمی هم همین‌جا است.');
  }
  return h+'</div>';
}

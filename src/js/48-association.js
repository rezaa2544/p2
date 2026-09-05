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
        <td>${t.kind==='income'?'<span class="badge badge-green">کمک‌هزینه</span>':'<span class="badge badge-red">هزینه</span>'}</td>
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
  </div>`;
}

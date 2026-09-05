/* ═══════════════════════════════════════════════════════════════════
   حضور و غیاب
   ثبت روزانه بر پایهٔ کلاس و تاریخ. از ایندکس کلاس+روز استفاده می‌کند.

   ⚠️ تغییر رفتار در دور ۴۲: پیش از این هر تیک بلافاصله ذخیره
   می‌شد. حالا تیک‌ها در پیش‌نویس جمع می‌شوند و با دکمهٔ «تأیید و
   ثبت» یک‌جا نوشته می‌شوند. دلیل: غیبت به خانواده پیامک می‌شود و
   تیک اشتباه هزینه دارد.

   پیش‌نویس در Store است نه S ⇒ تعویض کلاس یا بستن مرورگر آن را
   گم نمی‌کند. منطقش در 44-sms-notify.js بخش ۱۰.
   ═══════════════════════════════════════════════════════════════════ */

/** کلید یادآوری تغییر رفتار؛ هر دبیر یک‌بار می‌بیند */
var ATT_TIP_KEY = 'sms_att_tip_v1';

/**
 * نوار راهنمای تغییر رفتار.
 *
 * چرا لازم است؟ دبیری که ماه‌ها با ثبت فوری کار کرده، با دیدن
 * صفحهٔ تازه گمان می‌کند تیک‌هایش ذخیره نشده. یک‌بار توضیح
 * می‌دهیم و با زدن «متوجه شدم» دیگر نشان داده نمی‌شود.
 */
function attChangeTip(){
  var uid = (S.user && S.user.id) || 0;
  var seen = Store.getJSON(ATT_TIP_KEY, {}) || {};
  if(seen[uid]) return '';
  return '<div class="att-tip">'
    + '<b>🆕 روش ثبت عوض شد</b>'
    + '<div class="small">پیش از این هر تیک بی‌درنگ ذخیره می‌شد. '
    + 'حالا وضعیت‌ها جمع می‌شوند و با دکمهٔ <b>«مرور و ثبت نهایی»</b> '
    + 'یک‌جا ذخیره می‌شوند. پیش از ثبت، خلاصه‌ای از غایبان را می‌بینید '
    + 'تا اگر اشتباهی رخ داده باشد اصلاحش کنید. '
    + 'کار نیمه‌تمام شما محفوظ می‌ماند، حتی اگر به کلاس دیگری بروید.</div>'
    + '<button class="btn sm" data-act="att-tip-ok">متوجه شدم</button>'
    + '</div>';
}

function viewAttendance(){
  const cls=visibleClasses();
  if(!cls.length)return `<div class="card">${empty('🏛️','کلاسی در دسترس نیست','ابتدا باید کلاسی به شما تخصیص یابد.')}</div>`;
  /* پیش‌گزینش زنگ (گام ۳ طرح PLAN_BELL_AUTOCLASS): اگر دبیر هنوز
     کلاسی انتخاب نکرده و الان زنگ درسیِ مدرسهٔ واقعی است، کلاس
     جاریِ برنامهٔ خودش پیش‌گزینش می‌شود. 🔴 انتخاب دستی (فیلتر
     کلاس) همیشه بر پیش‌گزینش مقدم است. S.bellNow فقط برای
     آزمون‌پذیری است — همان الگوی bellNowBar(now). */
  const _now=(S.bellNow||null);
  const _auto=(typeof bellAutoClass==='function')?bellAutoClass(null,null,_now):null;
  const _autoOk=_auto&&cls.some(c=>c.id===_auto.classId);
  const cid=Number(S.filters.class||(_autoOk&&_auto.classId)||cls[0].id), date=S.filters.date||todayISO(), q=(S.filters.q||'').trim();
  const _autoShown=_autoOk&&!S.filters.class&&cid===_auto.classId;
  const _smBanner=(typeof virtualModeBanner==='function')?virtualModeBanner(date):'';
  const roster=studentsOfClass(cid);
  let studs=roster;
  if(q)studs=roster.filter(s=>s.full_name.includes(q));
  /* ایندکس یک‌بارهٔ حضورِ همان کلاس و همان روز: O(1) به‌جای پیمایش کل جدول */
  const _am=(typeof idxAttByClassDate==='function')?idxAttByClassDate():null;
  let _day;
  if(_am){ _day=new Map(); const _rows=_am.get(cid+'|'+date)||[];
    for(let i=0;i<_rows.length;i++)_day.set(_rows[i].student_id,_rows[i]); }
  const rec=s=>_day?_day.get(s.id):db.attendance.find(a=>a.student_id===s.id&&a.date===date);

  /* پیش‌نویس: تیک‌های ثبت‌نشده. نمایش = پیش‌نویس اگر بود، وگرنه پایگاه داده. */
  const draft=(typeof attDraftGet==='function')?attDraftGet(cid,date):{};
  const nDraft=Object.keys(draft).length;
  const shown=s=>draft[s.id]||((rec(s)||{}).status||null);

  const all=roster.map(s=>shown(s));
  const cnt=k=>all.filter(x=>x===k).length;
  const unset=all.filter(x=>!x).length;

  /* تفاوت واقعی با پایگاه داده — مبنای دکمهٔ ثبت */
  const diff=(typeof attDraftDiff==='function')?attDraftDiff(cid,date):{changes:[]};
  const nChange=diff.changes.length;

  const bannerDraft = nDraft ? `<div class="att-draft-bar">
     <b>✏️ ${fa(nChange)} تغییر ثبت‌نشده</b>
     <span class="small">تا زمانی که «مرور و ثبت نهایی» را نزنید ذخیره نمی‌شود.</span>
     <button class="btn" data-act="att-review">مرور و ثبت نهایی</button>
     <button class="btn ghost sm" data-act="att-discard">دور ریختن</button>
   </div>` : '';

  return `${_smBanner}${attChangeTip()}${bannerDraft}<div class="card"><div class="card-head">
    <div class="row"><select class="select" style="width:180px" data-f="class">${cls.map(c=>`<option value="${escAttr(c.id)}" ${c.id===cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
     ${_autoShown?`<span class="badge b-blue" title="بر اساس زنگ جاری و برنامهٔ هفتگی شما — انتخاب دستی بر این مقدم است">🔔 انتخاب خودکار بر اساس زنگ</span><button class="btn ghost sm" data-act="att-reset-class">همهٔ کلاس‌ها</button>`:''}
     <input class="input" style="width:160px" type="date" data-f="date" value="${escAttr(date)}" /><span class="badge b-gray">${jalali(date)}</span></div>
    <div class="row"><input class="input" style="width:160px" placeholder="جستجوی دانش‌آموز…" data-f="q" value="${esc(q)}" />
     <button class="btn ghost sm" data-act="att-all" data-s="present">✅ همه حاضر</button>
     <button class="btn ghost sm" data-act="att-all" data-s="absent">❌ همه غایب</button></div></div>
   <div class="card-body row" style="border-bottom:1px solid var(--border)">
    ${['present','absent','late','excused'].map(k=>`<span class="badge ${ATT_BADGE[k]}">${ATT_FA[k]}: ${fa(cnt(k))}</span>`).join('')}
    <span class="badge b-gray">ثبت‌نشده: ${fa(unset)}</span><div class="spacer"></div>
    <span class="small muted">${nDraft?'تغییرات هنوز ذخیره نشده‌اند':'همه‌چیز ذخیره شده است'}</span></div>
   ${studs.length?`<div class="table-wrap"><table><thead><tr><th>#</th><th>نام دانش‌آموز</th><th>ثبت وضعیت</th><th>وضعیت فعلی</th></tr></thead><tbody>
    ${studs.map((s,i)=>{const r=rec(s);const d=draft[s.id];const v=d||((r||{}).status||null);
      return `<tr${d?' class="att-row-draft"':''}><td class="muted">${fa(i+1)}</td><td><b>${esc(s.full_name)}</b>${r&&r.note?`<div class="small muted">${esc(r.note)}</div>`:''}</td>
     <td>${['present','absent','late','excused'].map(k=>`<button class="att-btn ${v===k?'on-'+k:''}" data-act="att-set" data-id="${escAttr(s.id)}" data-s="${escAttr(k)}">${ATT_FA[k]}</button>`).join('')}</td>
     <td>${v?`<span class="badge ${ATT_BADGE[v]}">${ATT_FA[v]}</span>${d?'<span class="badge b-amber">ثبت‌نشده</span>':''}`:'<span class="badge b-gray">ثبت نشده</span>'}</td></tr>`;}).join('')}
   </tbody></table></div>`:empty('🔍','دانش‌آموزی یافت نشد','این کلاس دانش‌آموزی ندارد یا جستجو نتیجه‌ای نداشت.')}
   ${nDraft?`<div class="card-foot row">
     <button class="btn" data-act="att-review">✅ مرور و ثبت نهایی (${fa(nChange)} تغییر)</button>
     <button class="btn ghost" data-act="att-discard">دور ریختن تغییرات</button></div>`:''}
   </div>`;
}

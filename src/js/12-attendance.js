/* ═══════════════════════════════════════════════════════════════════
   حضور و غیاب
   ثبت روزانه بر پایهٔ کلاس و تاریخ. از ایندکس کلاس+روز استفاده می‌کند.

   ⚠️ تغییر رفتار در دور ۴۲: پیش از این هر تیک بلافاصله ذخیره
   می‌شد. حالا تیک‌ها در پیش‌نویس جمع می‌شوند و با دکمهٔ «تأیید و
   ثبت» یک‌جا نوشته می‌شوند. دلیل: غیبت به خانواده پیامک می‌شود و
   تیک اشتباه هزینه دارد.

   ── دور ۷۷: مدلِ جدید ──
   دکمه‌هایِ سطر: [حاضر][غایب][تاخیر]  + فاصله + [🚪 خروج از کلاس].
   - حاضر/غایب = وضعیتِ پایه. تاخیر و خروج **رویداد** هستند —
     وضعیتِ پایه را عوض نمی‌کنند و در «گزارشِ رویدادها» پایینِ
     لیست نوشته می‌شوند (با ویرایش/حذف/موجه).
   - وقتی تایمرِ خروجِ دانش‌آموزی فعال است، سه گزینهٔ دیگرِ او
     قفل می‌شوند (فقط «⏱ توقف خروج»).
   - قبل از ثبتِ هرچه، هیچ دکمه‌ای حالتِ فعال ندارد.
   - مجموعِ تأخیر+خروج بیش از ۳۰٪ زنگ ⇒ در ثبتِ نهایی غیبت.
   - موجه فقط در پنجرهٔ زمانیِ زنگ (تنظیماتِ مدرسه) مجاز است.

   پیش‌نویس در Store است نه S ⇒ تعویض کلاس یا بستن مرورگر آن را
   گم نمی‌کند. منطقش در 44-sms-notify.js بخش ۱۰ و ۱۰-ب.
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
    + 'یک‌جا ذخیره می‌شوند. تاخیر و خروج از کلاس «رویداد» هستند: '
    + 'در گزارشِ پایینِ لیست می‌نشینند و همان‌جا ویرایش/حذف/موجه '
    + 'می‌شوند. کار نیمه‌تمام شما محفوظ می‌ماند، حتی اگر به کلاس دیگری بروید.</div>'
    + '<button class="btn sm" data-act="att-tip-ok">متوجه شدم</button>'
    + '</div>';
}

function viewAttendance(){
  /* Round 75: اگر تایمرِ «خروج از کلاس» فعال است، تیکِ یک‌ثانیه‌ای روشن می‌ماند */
  if(typeof attTickSync==='function')attTickSync();
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
  /* Round 65 بند N2: کارتِ مدیر (کلاس‌های ثبت‌نشده + یادآوری) و بنرِ دبیر */
  /* ⚠️ پرانتز الزامی: سلسلۀ ternary ضعیف‌تر از + است — بدون آن بنر گم می‌شود */
  const _nudge=((typeof nudgeManagerCard==='function')?nudgeManagerCard(_now):'')+((typeof nudgeTeacherBanner==='function')?nudgeTeacherBanner(_now):'');
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
  /* Round 77: رویدادهایِ پیش‌نویس (تاخیر/خروج) */
  const dev=(typeof attDraftEvents==='function')?attDraftEvents(cid,date):{};
  /* بند 15.1: موجه‌سازیِ پس از ثبت فقط برای مدیر/سوپرادمین (ستونِ اقدام) */
  const canExempt=!!(S.user&&(S.user.role==='manager'||S.user.role==='superadmin'));
  /* Round 75: تایمرهایِ «خروج از کلاس»ِ فعالِ همین کلاس و روز */
  const _timers=(typeof attTimersGet==='function')?attTimersGet(cid,date):{};
  const _nTimers=Object.keys(_timers).length;
  const nDraft=Object.keys(draft).length;

  /* Round 77: وضعیتِ پایه = فقط حاضر/غایب (وضعیت‌هایِ کهنهٔ
     late/early_exit/excused به پایهٔ «حاضر» + رویداد/نشان تبدیل
     می‌شوند — رکوردِ excused یعنی غایبِ موجه‌شده). */
  const baseStatus=s=>{
    const d=draft[s.id];
    if(d)return d;
    const r=rec(s);
    if(!r)return null;
    if(r.status==='absent')return 'absent';
    return 'present';
  };

  const all=roster.map(baseStatus);
  const cnt=k=>all.filter(x=>x===k).length;
  const unset=all.filter(x=>!x).length;

  /* Round 77: شمارشِ رویدادهایِ مؤثر (پیش‌نویس بر رکورد ارجح) */
  const evOf=s=>(typeof attEventView==='function')?attEventView(cid,date,s.id):{rec:rec(s),late:null,exit:null};
  const nLateEv=roster.filter(s=>{const e=evOf(s);return e.late&&!(e.late.late_excused);}).length;
  const nExitEv=roster.filter(s=>{const e=evOf(s);return e.exit&&!(e.exit.exit_excused);}).length;

  /* تفاوت واقعی با پایگاه داده — مبنای دکمهٔ ثبت */
  const diff=(typeof attDraftDiff==='function')?attDraftDiff(cid,date):{changes:[]};
  const nChange=diff.changes.length;

  const bannerDraft = nDraft||Object.keys(dev).length ? `<div class="att-draft-bar">
     <b>✏️ ${fa(nChange)} تغییر ثبت‌نشده</b>
     <span class="small">تا زمانی که «مرور و ثبت نهایی» را نزنید ذخیره نمی‌شود.</span>
     <button class="btn" data-act="att-review">مرور و ثبت نهایی</button>
     <button class="btn ghost sm" data-act="att-discard">دور ریختن</button>
   </div>` : '';

  /* ── Round 77: گزارشِ رویدادها (پایینِ لیست) ──
     هر رویدادِ تاخیر/خروج (مؤثر) با زمان/دقیقه + ویرایش/حذف/موجه.
     موجه فقط روی رویدادِ ثبت‌شده (رکورد) و درونِ پنجرهٔ زمانی
     (برایِ دبیر) مجاز است. */
  const repRows=[];
  roster.forEach(s=>{
    const e=evOf(s);
    const add=(which,f,pending,committed)=>{
      if(!f)return;
      repRows.push({s,e,f,which,pending,committed:committed&&!f.late_excused&&!(which==='exit'&&f.exit_excused)&&!(which==='late'&&f.late_excused)});
    };
    add('late',e.late,dev[s.id]&&dev[s.id].late!==undefined||dev[s.id]&&dev[s.id].late===null,!!e.rec);
    add('exit',e.exit,dev[s.id]&&dev[s.id].exit!==undefined||dev[s.id]&&dev[s.id].exit===null,!!e.rec);
  });
  const _tfa=(typeof timeFa==='function')?timeFa:(x=>x);
  const repHtml=repRows.length?`<div class="card att-report">
    <div class="card-head row"><b>📋 گزارشِ رویدادها — تأخیر و خروج از کلاس</b>
      <span class="small muted">مجموعِ تأخیر و خروجِ بیش از ۳۰٪ زنگ در ثبتِ نهایی غیبت می‌شود. موجه‌سازی فقط در پنجرهٔ زمانیِ زنگِ رویداد مجاز است.</span></div>
    <div class="table-wrap"><table class="att-report-tbl"><thead><tr>
      <th>دانش‌آموز</th><th>رویداد</th><th>زمان</th><th>میزان</th><th>وضعیت</th><th>عملیات</th>
    </tr></thead><tbody>
    ${repRows.map(r=>{
      const f=r.f;
      const isLate=r.which==='late';
      const exc=isLate?!!f.late_excused:!!f.exit_excused;
      const excReason=isLate?f.late_excuse_reason:f.exit_excuse_reason;
      const timeTxt=isLate
        ?(f.late_at?('⏰ '+_tfa(f.late_at)):'')
        :('🚪 '+(f.exit_at?_tfa(f.exit_at):'')+(f.exit_return_at?' – '+_tfa(f.exit_return_at):''));
      const mins=isLate?f.late_minutes:f.exit_minutes;
      const committed=!!r.e.rec&&(isLate?(r.e.rec.late_at||r.e.rec.status==='late'):(r.e.rec.exit_at||r.e.rec.status==='early_exit'));
      const excBtn=(committed&&!exc)
        ?`<button class="btn ghost sm" data-act="att-excuse-event" data-id="${escAttr(r.s.id)}" data-w="${r.which}">✅ موجه</button>`
        :(exc?`<span class="badge b-purple" title="موجه — ${esc(excReason||'')}">موجه‌شده</span>`
             :`<span class="small muted" title="موجه فقط روی رویدادِ ثبت‌شده (پس از ثبتِ نهایی)">—</span>`);
      return `<tr${exc?' class="att-excused-row"':''} data-st="${escAttr(r.s.id)}">
        <td><b>${esc(r.s.full_name)}</b></td>
        <td>${isLate?'⏰ تأخیر':'🚪 خروج از کلاس'}</td>
        <td class="small">${timeTxt||'—'}</td>
        <td class="small">${mins!=null?fa(Number(mins))+' دقیقه':'—'}</td>
        <td>${exc?'<span class="badge b-purple">موجه‌شده</span>'
            :(committed?'':'<span class="badge b-amber">ثبت‌نشده</span>')}</td>
        <td class="att-report-actions">
          <button class="btn ghost sm" data-act="att-event-edit" data-id="${escAttr(r.s.id)}" data-w="${r.which}">✏️ ویرایش</button>
          <button class="btn ghost sm" data-act="att-event-del" data-id="${escAttr(r.s.id)}" data-w="${r.which}">🗑 حذف</button>
          ${excBtn}
        </td>
      </tr>`;
    }).join('')}
    </tbody></table></div>
  </div>`:'';

  return `${_smBanner}${_nudge}${attChangeTip()}${bannerDraft}<div class="card"><div class="card-head">
    <div class="row"><select class="select" style="width:180px" data-f="class">${cls.map(c=>`<option value="${escAttr(c.id)}" ${c.id===cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
     ${_autoShown?`<span class="badge b-blue" title="بر اساس زنگ جاری و برنامهٔ هفتگی شما — انتخاب دستی بر این مقدم است">🔔 انتخاب خودکار بر اساس زنگ</span><button class="btn ghost sm" data-act="att-reset-class">همهٔ کلاس‌ها</button>`:''}
     <input class="input" style="width:160px" type="date" data-f="date" value="${escAttr(date)}" /><span class="badge b-gray">${jalali(date)}</span></div>
    <div class="row"><input class="input" style="width:160px" placeholder="جستجوی دانش‌آموز…" data-f="q" value="${esc(q)}" />
     <button class="btn ghost sm" data-act="att-all" data-s="present">✅ همه حاضر</button>
     <button class="btn ghost sm" data-act="att-all" data-s="absent">❌ همه غایب</button></div></div>
   <div class="card-body row" style="border-bottom:1px solid var(--border)">
    <span class="badge b-green">حاضر: ${fa(cnt('present'))}</span>
    <span class="badge b-red">غایب: ${fa(cnt('absent'))}</span>
    <span class="badge b-amber" title="رویدادهایِ تاخیر (رویدادها وضعیتِ پایه را عوض نمی‌کنند)">⏰ تاخیر: ${fa(nLateEv)}</span>
    <span class="badge b-cyan" title="رویدادهایِ خروج از کلاس">🚪 خروج: ${fa(nExitEv)}</span>
    <span class="badge b-gray">ثبت‌نشده: ${fa(unset)}</span>${_nTimers?`<span class="badge b-cyan" title="دانش‌آموزی که تایمرِ خروجش فعال است — هنگامِ برگشت، دکمهٔ «⏱ توقف خروج» را بزنید">⏱ خروج فعال: ${fa(_nTimers)}</span>`:''}<div class="spacer"></div>
    <span class="small muted">${nDraft||Object.keys(dev).length?'تغییرات هنوز ذخیره نشده‌اند':'همه‌چیز ذخیره شده است'}</span></div>
   ${studs.length?`<div class="table-wrap"><table><thead><tr><th>#</th><th>نام دانش‌آموز</th><th>ثبت وضعیت</th><th>وضعیت فعلی</th>${canExempt?'<th>اقدام</th>':''}</tr></thead><tbody>
    ${studs.map((s,i)=>{
      const r=rec(s);const d=draft[s.id];const v=baseStatus(s);
      const e=evOf(s);
      /* Round 75: زمان + دقیقه + بازهٔ خروج (تا بازگشت) از پیش‌نویس یا رکورد */
      const _tmRun=_timers[s.id]||'';
      const _lock=_tmRun?' disabled':'';
      const _lockCls=_tmRun?' att-btn-lock':'';
      /* رویدادِ تاخیر — متنِ زیرِ وضعیت */
      let _lateTxt='';
      if(e.late){
        _lateTxt=(e.late.late_at?_tfa(e.late.late_at):'')+(e.late.late_minutes!=null?' · '+fa(Number(e.late.late_minutes))+' دقیقه':'');
      }
      let _exitTxt='';
      if(e.exit){
        _exitTxt=(e.exit.exit_at?_tfa(e.exit.exit_at):'')+(e.exit.exit_return_at?'–'+_tfa(e.exit.exit_return_at):'')+(e.exit.exit_minutes!=null?' · '+fa(Number(e.exit.exit_minutes))+' دقیقه':'');
      }
      /* Round 77: قاعدهٔ ۳۰٪ — زنده، پیش از ثبت */
      const _view={late_at:e.late?e.late.late_at:null,late_minutes:e.late?e.late.late_minutes:null,late_excused:e.late?!!e.late.late_excused:false,
                   exit_at:e.exit?e.exit.exit_at:null,exit_minutes:e.exit?e.exit.exit_minutes:null,exit_excused:e.exit?!!e.exit.exit_excused:false};
      const _rule=(typeof attOutRule==='function')?attOutRule(byId('classes',cid).school_id,date,_view):null;
      const _over30=_rule&&_rule.over&&v!=='absent';
      const _timerBadge=_tmRun?`<span class="badge b-cyan" data-att-timer="${escAttr(s.id)}" data-att-start="${escAttr(_tmRun)}">🚪 خروج از کلاس — ⏱ 0:00:00</span>`:'';
      const _just=!d&&r&&r.excused;
      const _exempt=!d&&r&&(r.status==='absent'&&!r.excused||((r.late_at||r.status==='late')&&!r.late_excused)||((r.exit_at||r.status==='early_exit')&&!r.exit_excused));
      return `<tr${d?' class="att-row-draft"':''}><td class="muted">${fa(i+1)}</td><td><b>${esc(s.full_name)}</b>${r&&r.note?`<div class="small muted">${esc(r.note)}</div>`:''}</td>
     <td class="att-ctrl">
       <span class="att-group">
         <button class="att-btn${v==='present'?' on-present':''}${_lockCls}" data-act="att-set" data-id="${escAttr(s.id)}" data-s="present"${_lock}>حاضر</button>
         <button class="att-btn${v==='absent'?' on-absent':''}${_lockCls}" data-act="att-set" data-id="${escAttr(s.id)}" data-s="absent"${_lock}>غایب</button>
         <button class="att-btn" data-act="att-set" data-id="${escAttr(s.id)}" data-s="late"${_lock}>⏰ تاخیر</button>
       </span>
       <span class="att-sep" aria-hidden="true"></span>
       <button class="att-btn att-btn-exit${_tmRun?' att-btn-running':''}" data-act="att-set" data-id="${escAttr(s.id)}" data-s="early_exit">${_tmRun?'⏱ توقف خروج':'🚪 خروج از کلاس'}</button>
     </td>
     <td class="att-status-cell">${v?`<span class="badge ${ATT_BADGE[v]}">${ATT_FA[v]}</span>`:'<span class="badge b-gray">ثبت نشده</span>'}
       ${e.late?`<div class="att-sub">${e.late.late_excused?'<span class="badge b-purple">⏰ تاخیر — موجه‌شده</span>':`<span class="badge b-amber">⏰ تاخیر</span> <span class="small muted">${_lateTxt}</span>`}</div>`:''}
       ${e.exit?`<div class="att-sub">${e.exit.exit_excused?'<span class="badge b-purple">🚪 خروج — موجه‌شده</span>':`<span class="badge b-cyan">🚪 خروج</span> <span class="small muted">${_exitTxt}</span>`}</div>`:''}
       ${_over30?`<div class="att-sub"><span class="badge b-red" title="مجموعِ ${fa(_rule.total)} دقیقه بیشتر از ۳۰٪ زنگ (${fa(_rule.limit)} دقیقه) — در ثبتِ نهایی غیبت ثبت می‌شود">⚠️ بیش از ۳۰٪ زنگ — غیبت</span></div>`:''}
       ${_just?'<div class="att-sub"><span class="badge b-purple" title="موجه‌شده پس از ثبت — ردپا در سابقه">موجه‌شده</span></div>':''}
       ${d?'<div class="att-sub"><span class="badge b-amber">ثبت‌نشده</span></div>':''}
       ${(_tmRun&&!e.exit)?_timerBadge:''}
     </td>${canExempt?`<td>${_exempt?`<button class="btn ghost sm" data-act="att-exempt" data-id="${escAttr(r.id)}">موجه‌سازی</button>`:''}</td>`:''}</tr>`;
    }).join('')}
   </tbody></table></div>`:empty('🔍','دانش‌آموزی یافت نشد','این کلاس دانش‌آموزی ندارد یا جستجو نتیجه‌ای نداشت.')}
   ${nDraft||Object.keys(dev).length?`<div class="card-foot row">
     <button class="btn" data-act="att-review">✅ مرور و ثبت نهایی (${fa(nChange)} تغییر)</button>
     <button class="btn ghost" data-act="att-discard">دور ریختن تغییرات</button></div>`:''}
   </div>${repHtml}`;
}

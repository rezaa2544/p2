/* ═══════════════════════════════════════════════════════════════════
   ویژگی‌های سمتِ کلاینت (پایلوت):
   - چک‌لیستِ «فردا» از برنامهٔ هفتگیِ موجود
   - شمارشِ معکوسِ امتحان از دادهٔ امتحاناتِ موجود
   - خروجیِ تقویم (ICS) برای امتحانات و رویدادهای مدرسه
   - پاسخِ سریعِ ولی به غیبت: دکمهٔ «موجه اعلام کنم» روی رکورد
     (درخواستِ مرخصیِ pending می‌سازد — همانِ جریانِ موجودِ تأییدِ مدیر)
   ═══════════════════════════════════════════════════════════════════ */

/* روزِ هفته به سبکِ برنامه (شنبه=0..جمعه=6) */
function cfAppDay(iso){
  var p=String(iso).split('-');
  var d=new Date(+p[0],+p[1]-1,+p[2]);
  return (d.getDay()+1)%7;
}
function cfAddDays(iso,n){
  var p=String(iso).split('-');
  var d=new Date(+p[0],+p[1]-1,+p[2]);
  d.setDate(d.getDate()+n);
  var q=function(x){return String(x).padStart(2,'0');};
  return d.getFullYear()+'-'+q(d.getMonth()+1)+'-'+q(d.getDate());
}
/* پالایشِ مقدارِ TEXT در ICS (RFC 5545): بک‌اسلش/سمیکالن/کاما/خط‌تجزیه
   — بدونِ آن، دادهٔ ورودی می‌تواند فیلدِ کاذب به فایل تزریق کند.
   (esc() اینجا صحیح نیست: آن پالایشِ HTML است، نه ICS) */
function icsEsc(s){
  return String(s==null?'':s)
    .replace(/\\/g,'\\\\')
    .replace(/;/g,'\\;')
    .replace(/,/g,'\\,')
    .replace(/\r\n|\r|\n/g,'\\n');
}

/* ویژگی ۱: چک‌لیستِ فردا — برنامهٔ کلاس + امتحانِ همان روز */
function tomorrowChecklistItems(sid){
  var cls=(typeof classOf==='function')?classOf(sid):null;
  if(!cls||!cls.id) return {school:false};
  var tomorrow=cfAddDays(todayISO(),1);
  var day=cfAppDay(tomorrow);
  /* روزهای کاریِ خودِ مدرسه (work_days + روزهای جبرانی) — نه فقط ۰ تا ۴ */
  var out={date:tomorrow, day:day,
    school:(typeof isWorkDay==='function')?isWorkDay(cls.school_id,tomorrow):(day>=0&&day<=4),
    rows:[], exams:[]};
  if(out.school){
    out.rows=db.schedule.filter(function(x){return x.class_id===cls.id&&x.day===day;})
      .map(function(x){return {period:Number(x.period),
        subject:(byId('subjects',x.subject_id)||{}).name||'—',
        teacher:(byId('users',x.teacher_id)||{}).full_name||'—'};})
      .sort(function(a,b){return a.period-b.period;});
    out.exams=db.exams.filter(function(e){return e.class_id===cls.id&&e.date===tomorrow;})
      .map(function(e){return {subject:(byId('subjects',e.subject_id)||{}).name||'—',time:e.start_time||'',room:e.room||''};});
  }
  return out;
}

/* ویژگی ۲: شمارشِ معکوسِ نزدیک‌ترین امتحانِ کلاس */
function nextExamOf(sid){
  var cls=(typeof classOf==='function')?classOf(sid):null;
  if(!cls||!cls.id) return null;
  var today=todayISO();
  var list=db.exams.filter(function(e){return e.class_id===cls.id&&e.date>=today;});
  if(!list.length) return null;
  list.sort(function(a,b){return a.date.localeCompare(b.date)||(a.start_time||'').localeCompare(b.start_time||'');});
  var e=list[0];
  var a=today.split('-').map(Number), b=e.date.split('-').map(Number);
  var days=Math.round((Date.UTC(b[0],b[1]-1,b[2])-Date.UTC(a[0],a[1]-1,a[2]))/86400000);
  return {subject:(byId('subjects',e.subject_id)||{}).name||'—', date:e.date, time:e.start_time||'', room:e.room||'', days:days};
}

/* ویژگی ۳: ICS — امتحاناتِ کلاس + رویدادهای تقویمِ مدرسه (۳۰ روزِ آینده) */
function icsForStudent(sid){
  var cls=(typeof classOf==='function')?classOf(sid):null;
  if(!cls||!cls.id) return '';
  var today=todayISO(), horizon=cfAddDays(today,30);
  var L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Payesh//FA','CALSCALE:GREGORIAN'];
  db.exams.filter(function(e){return e.class_id===cls.id&&e.date>=today&&e.date<=horizon;})
    .forEach(function(e){
      /* امتحانِ ساعت‌دار = رویدادِ DATE-TIME (ساعتِ محلیِ شناور — بدونِ Z،
         چون ساعتِ مدرسه به وقتِ محلی است، نه UTC)؛ بدونِ ساعت = تمام‌روز */
      var hm=/^\d{1,2}:\d{2}/.test(String(e.start_time||''))?String(e.start_time).slice(0,5).replace(':',''):'';
      var dtstart=hm?('DTSTART:'+e.date.replace(/-/g,'')+'T'+(hm.length===4?hm:'0'+hm)+'00')
                    :('DTSTART;VALUE=DATE:'+e.date.replace(/-/g,''));
      L.push('BEGIN:VEVENT','UID:payesh-exam-'+e.id+'@payesh',
        'DTSTAMP:'+today.replace(/-/g,'')+'T000000Z',
        dtstart,
        'SUMMARY:امتحان '+icsEsc((byId('subjects',e.subject_id)||{}).name||'امتحان')+(e.start_time?' '+icsEsc(e.start_time):''),
        e.room?('LOCATION:'+icsEsc(e.room)):'','END:VEVENT');
    });
  db.calendar.filter(function(c){return c.school_id===cls.school_id&&c.date>=today&&c.date<=horizon;})
    .forEach(function(c){
      L.push('BEGIN:VEVENT','UID:payesh-cal-'+c.id+'@payesh',
        'DTSTAMP:'+today.replace(/-/g,'')+'T000000Z',
        'DTSTART;VALUE=DATE:'+c.date.replace(/-/g,''),
        'SUMMARY:'+icsEsc(c.title||'رویداد مدرسه'),'END:VEVENT');
    });
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}
function icsDownload(sid){
  var text=icsForStudent(sid);
  if(!text){ toast('برنامه‌ای برای خروجی یافت نشد','err'); return; }
  try{
    var url;
    if(typeof Blob!=='undefined'&&typeof URL!=='undefined'&&URL.createObjectURL){
      url=URL.createObjectURL(new Blob([text],{type:'text/calendar'}));
    } else {
      url='data:text/calendar;charset=utf-8,'+encodeURIComponent(text);
    }
    var a=document.createElement('a');
    a.href=url; a.download='payesh-calendar.ics';
    document.body.appendChild(a); a.click(); a.remove();
    if(typeof URL!=='undefined'&&URL.revokeObjectURL&&url.indexOf('blob:')===0) URL.revokeObjectURL(url);
    toast('فایل تقویم (ICS) آماده شد','ok');
  }catch(e){ toast('دانلود در این مرورگر ممکن نشد','err'); }
}

/* کارتِ «فردا و امتحانات» — بالایِ پروندهٔ دانش‌آموز (ولی/دانش‌آموز) */
function clientFeaturesCard(sid){
  var tc=tomorrowChecklistItems(sid);
  var ne=nextExamOf(sid);
  var h='<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>🗓️ فردا و امتحانات</h3><div class="spacer"></div>'
    /* بدونِ data-sid/data-id عمدی — هدف در خودِ اکشن از recordTargetId()
       گرفته می‌شود تا شناسهٔ آمده از DOM نتواند دامنه را بشکند (دورِ ۸۹). */
    + '<button class="btn ghost sm" data-act="ics-export" title="دانلودِ تقویمِ امتحانات و رویدادهای مدرسه (فایل ICS — با هر تقویمی باز می‌شود)">📥 تقویم (ICS)</button></div>'
    + '<div class="card-body" style="display:grid;gap:10px">';
  if(tc.school){
    h+='<div><b>فردا — '+jalali(tc.date)+'</b>';
    if(tc.exams.length){
      h+='<div class="small" style="margin:6px 0">'+tc.exams.map(function(x){
        return '📝 <b>امتحان '+esc(x.subject)+'</b>'+(x.time?' ساعت '+esc(x.time):'')+(x.room?' — '+esc(x.room):'');
      }).join(' · ')+'</div>';
    }
    h+= tc.rows.length
      ? '<div style="margin-top:6px;display:grid;gap:4px">'+tc.rows.map(function(r){
          return '<div class="row" style="gap:8px;align-items:center"><span class="badge b-gray">زنگ '+fa(r.period)+'</span><b>'+esc(r.subject)+'</b><span class="muted small">'+esc(r.teacher)+'</span></div>';
        }).join('')+'</div>'
      : '<div class="muted small" style="margin-top:4px">برنامه‌ای برای فردا نیست</div>';
    h+='</div>';
  } else {
    h+='<div class="row" style="gap:8px"><b>فردا</b><span class="badge b-gray">روز درسی نیست</span></div>';
  }
  h+= ne
    ? '<div class="row" style="gap:8px;align-items:center"><span class="badge '+(ne.days<=3?'b-red':'b-blue')+'">⏳ '+fa(ne.days)+' روز مانده</span><b>امتحان '+esc(ne.subject)+'</b><span class="muted small">'+jalali(ne.date)+(ne.time?' ساعت '+esc(ne.time):'')+'</span></div>'
    : '<div class="muted small">امتحان پیش‌رو در ۳۰ روزِ آینده نیست</div>';
  return h+'</div></div>';
}

/* نقشِ فعال (حالتِ چندنقشی) — همانِ الگوی 17-student-record */
function cfPersona(u){
  return (typeof activePersona==='function')?activePersona():((u&&u.role)||null);
}
/* گاردِ مشترک: آیا این کاربر می‌تواند روی همین رکوردِ حضور موجه اعلام کند؟ */
function cfCanExcuse(u,rec){
  var persona=cfPersona(u);
  if(persona==='parent') return (db.parent_links||[]).some(function(p){return p.parent_id===u.id&&p.student_id===rec.student_id;});
  if(persona==='student') return u.id===rec.student_id;
  return false;
}

/* اکشن‌ها */
const CF_ACTIONS = {
  /* ویژگی ۳: خروجی ICS
     🔴 دورِ ۸۹ — نشتِ دامنه (کشف با پروبِ زنده، بازبینیِ خودکار ندیده بود):
     نسخهٔ پیشین اگر `data-id` می‌آمد همان را بی‌چون‌وچرا هدف می‌گرفت:
        var sid = id ? Number(id) : recordTargetId();
     دکمهٔ واقعی `data-sid` دارد و دیسپچر فقط `data-id` را می‌خواند، پس در
     استفادهٔ عادی همیشه شاخهٔ امن اجرا می‌شد و کسی متوجه نمی‌شد. ولی مهاجم
     (کاربرِ معتبرِ سامانه) با ساختنِ دستیِ یک دکمه:
        <button data-act="ics-export" data-id="<شناسهٔ بیگانه>">
     تقویمِ دانش‌آموزِ **مدرسهٔ دیگر** را دانلود می‌کرد (اثباتِ زنده: مدرسهٔ ۶
     فایلِ مدرسهٔ ۱ را گرفت). `canAction` جلویش را نمی‌گیرد چون این اکشن
     بی‌برچسب است، و `server/idor.js` هم نه — این خواندنِ حافظهٔ محلی است،
     نه درخواستِ شبکه.
     رفع: هدف **همیشه** از `recordTargetId()` می‌آید که ولی را به
     `parent_links` خودش و دانش‌آموز را به خودش محدود می‌کند. ورودیِ
     `id` عمداً نادیده گرفته می‌شود (اصلِ نهم: دادهٔ بیرون از دامنه اصلاً
     نباید ساخته شود). نگهبان: `tests/client-features.js` بخشِ F5. */
  'ics-export'(){
    var sid=(typeof recordTargetId==='function')?recordTargetId():null;
    if(sid) icsDownload(sid);
  },
  /* ویژگی ۴: موجه‌سازیِ سریع — بازکردنِ فرم */
  'quick-excuse'(el,id){
    var rec=byId('attendance',id);
    if(!rec) return;
    var u=S.user;
    if(!u||!cfCanExcuse(u,rec)){ toast('این دسترسی را ندارید','err'); return; }
    if(rec.excused){ toast('این غیبت از قبل موجه است','err'); return; }
    S.__cfRid=rec.id;
    openModal(modalTpl('موجه‌سازی غیبت — '+jalali(rec.date),
      f('توضیح (اختیاری)',`<textarea class="input" id="qe_reason" rows="3" placeholder="مثلاً مراجعه به پزشک"></textarea>`)
      +'<p class="small muted" style="margin-top:8px">درخواستِ موجه برای غیبتِ <b>'+jalali(rec.date)+'</b> ثبت می‌شود؛ پس از تأییدِ مدیر، این غیبت از پروندهٔ حضور موجه خواهد شد.</p>',
      'qe-save'));
  },
  /* ویژگی ۴: ذخیره — همانِ جریانِ موجودِ درخواست/تأیید (pending) */
  'qe-save'(){
    var rec=byId('attendance',S.__cfRid||0);
    var u=S.user;
    /* بررسیِ دوبارهٔ مالکیت در لحظهٔ ذخیره — S.__cfRid ادعای کلاینت است؛
       باورِ کور آن = درخواستِ جعلی برای رکوردِ دیگران (تأییدِ Devin) */
    if(!rec||!u||!cfCanExcuse(u,rec)){ S.__cfRid=0; closeModal(); toast('این دسترسی را ندارید','err'); return; }
    var reason=V('qe_reason');
    var st=byId('users',rec.student_id)||{};
    insert('leaves',{school_id:rec.school_id,student_id:rec.student_id,from_date:rec.date,to_date:rec.date,
      reason:'موجه‌سازیِ والد: '+(reason||'غیبتِ موجه (بدونِ توضیح)'),status:'pending',created_at:todayISO()});
    var mgr=db.users.find(function(x){return x.school_id===rec.school_id&&x.role==='manager';});
    if(mgr)insert('notifications',{user_id:mgr.id,school_id:rec.school_id,type:'leave',
      title:'📨 درخواست موجه (غیبت)',
      body:'برای '+((st.full_name)||'')+' غیبتِ '+jalali(rec.date)+' موجه اعلام شد — در انتظارِ بررسی.',
      link:'leaves',read:0,created_at:todayISO()});
    S.__cfRid=0;
    closeModal(); toast('درخواستِ موجه ثبت شد — پس از تأییدِ مدیر اعمال می‌شود','ok'); render();
  }
};

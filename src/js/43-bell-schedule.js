/* ═══════════════════════════════════════════════════════════════════
   زمان‌بندی زنگ‌ها و زنگ تفریح

   هر مدرسه و هر منطقه ساعت‌های متفاوتی دارد؛ مدرسهٔ روستایی زودتر
   شروع می‌کند، مدرسهٔ شیفت بعدازظهر بعد از ظهر، و طول زنگ تفریح در
   ابتدایی با متوسطه فرق دارد. پس این زمان‌ها **سخت‌کدشده نیستند**
   و مدیر مدرسه خودش تعریفشان می‌کند.

   ساختار داده (نسخهٔ ۲ — دور ۶۳): هر مدرسه یک رکورد در
   `db.bell_schedules` دارد با آرایهٔ `days`؛ **هر روز هفته ساعت
   کاملاً مستقل** دارد:

       { school_id, days: [
           { start:'07:30', slots:[{kind:'lesson',min:45},{kind:'break',min:10},…] },  // شنبه
           { start:…,      slots:[…] },  // یکشنبه … تا چهارشنبه
       ] }

   تعریف هر زنگ **با ساعت شروع و پایان مشخص** است: زنگ اول از X
   تا Y، زنگ دوم از Y تا Z و همین‌طور (زنجیرهٔ پیوسته؛ زنگ تفریح
   هم یک بازه از همین زنجیره است).

   ⚠️ رکورد نسخهٔ ۱ (میراثی): `{ school_id, start, slots }` — بدون
   `days`. برای خواندن، همان برنامه به **همهٔ روزها** اعمال می‌شود
   (`bellDayData`)؛ با اولین ذخیرهٔ تازه، رکورد به نسخهٔ ۲ ارتقا
   می‌یابد.

   تعداد زنگ هیچ سقفی ندارد: مدیر خودش تعداد و ساعت هر زنگ را
   تعریف می‌کند (سه، چهار، شش، هر چند که لازم باشد).
   ═══════════════════════════════════════════════════════════════════ */

/* الگوهای آماده — نقطهٔ شروع، نه اجبار. مدیر می‌تواند تغییرشان دهد. */
var BELL_PRESETS = {
  'صبح': {
    title: 'شیفت صبح (پیش‌فرض رایج)',
    start: '07:30',
    slots: [
      { kind:'lesson', min:45 }, { kind:'break', min:10 },
      { kind:'lesson', min:45 }, { kind:'break', min:15 },
      { kind:'lesson', min:45 }, { kind:'break', min:10 },
      { kind:'lesson', min:45 }, { kind:'break', min:10 },
      { kind:'lesson', min:45 }
    ]
  },
  'بعدازظهر': {
    title: 'شیفت بعدازظهر',
    start: '13:00',
    slots: [
      { kind:'lesson', min:45 }, { kind:'break', min:10 },
      { kind:'lesson', min:45 }, { kind:'break', min:15 },
      { kind:'lesson', min:45 }, { kind:'break', min:10 },
      { kind:'lesson', min:45 }
    ]
  },
  'ابتدایی': {
    title: 'ابتدایی (زنگ کوتاه‌تر، تفریح بلندتر)',
    start: '07:45',
    slots: [
      { kind:'lesson', min:40 }, { kind:'break', min:15 },
      { kind:'lesson', min:40 }, { kind:'break', min:20 },
      { kind:'lesson', min:40 }, { kind:'break', min:15 },
      { kind:'lesson', min:40 }
    ]
  }
};

/* ---------- ابزار زمان ---------- */

/** «۰۷:۳۰» → ۴۵ دقیقه از نیمه‌شب */
function timeToMin(t){
  var s = String(t || '').trim();
  if(typeof faDigits === 'function') s = faDigits(s);
  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  var h = Number(m[1]), mi = Number(m[2]);
  if(h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** ۴۵۰ → «۰۷:۳۰» */
function minToTime(n){
  n = ((Math.round(Number(n) || 0)) % 1440 + 1440) % 1440;
  var h = Math.floor(n / 60), m = n % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

/** نمایش فارسی ساعت */
function timeFa(t){ return typeof faD === 'function' ? faD(t) : t; }

/* ---------- خواندن ---------- */

/** رکورد زمان‌بندی یک مدرسه (یا null) */
function bellRec(schoolId){
  return (db.bell_schedules || []).filter(function(b){
    return b.school_id === schoolId; })[0] || null;
}

/** آیا رکورد نسخهٔ ۲ است (ساعت به تفکیک روز)؟ */
function bellIsPerDay(rec){
  return !!(rec && rec.days && rec.days.length);
}

/**
 * دادهٔ یک روز از رکورد.
 * ⚠️ رکورد نسخهٔ ۱ (بدون `days`): همان start/slots را برای هر روز
 * برمی‌گردانیم — دادهٔ قدیمی گم نمی‌شود.
 */
function bellDayData(rec, dayIdx){
  if(!rec) return null;
  if(rec.days && rec.days[dayIdx] && rec.days[dayIdx].slots) return rec.days[dayIdx];
  if(rec.slots && rec.slots.length) return { start: rec.start, slots: rec.slots };
  return null;
}

/**
 * زمان‌بندی یک روز از یک مدرسه. اگر تعریف نشده باشد، الگوی متناسب
 * با شیفت و مقطعش برگردانده می‌شود — تا برنامه هرگز بدون ساعت نماند.
 */
function bellOf(schoolId, day){
  var d = (day == null) ? 0 : day;
  var rec = bellRec(schoolId);
  var dd = bellDayData(rec, d);
  if(dd){
    return { school_id: schoolId, start: dd.start,
             slots: dd.slots.map(function(x){ return { kind:x.kind, min:Number(x.min) || 0 }; }),
             _day: d, _perDay: bellIsPerDay(rec), _custom: true };
  }

  var s = byId('schools', schoolId) || {};
  var key = (s.level === 'ابتدایی') ? 'ابتدایی'
          : (s.shift === 'بعدازظهر') ? 'بعدازظهر' : 'صبح';
  var p = BELL_PRESETS[key];
  return { school_id: schoolId, start: p.start,
           slots: p.slots.map(function(x){ return { kind:x.kind, min:x.min }; }),
           _day: d, _perDay: false, preset: key, _default: true };
}

/**
 * بازه‌ها را به ساعت واقعی تبدیل می‌کند (برای یک روز مشخص).
 * خروجی: [{ no, kind, from, to, min, label }]
 * «no» فقط برای زنگ‌های درسی شماره می‌خورد، تفریح شماره ندارد.
 *
 * ⚠️ `day` پیش‌فرض صفر (شنبه) است — برای «الان» استفاده نکنید؛
 * `currentSlot` در زنگ جاری روز صحیح را خودش می‌فرستد.
 */
function bellTimeline(schoolId, day){
  return bellDayTimeline(bellOf(schoolId, day));
}

/** خط زمانی یک روز از دادهٔ خام `{start, slots}` */
function bellDayTimeline(d){
  var cur = timeToMin(d.start);
  if(cur == null) cur = 450;
  var out = [], lesson = 0;
  (d.slots || []).forEach(function(sl){
    var min = Number(sl.min) || 0;
    var from = cur, to = cur + min;
    cur = to;
    if(sl.kind === 'lesson'){
      lesson++;
      out.push({ no: lesson, kind:'lesson', min: min,
        from: minToTime(from), to: minToTime(to),
        label: 'زنگ ' + (typeof fa === 'function' ? fa(lesson) : lesson) });
    } else {
      out.push({ no: null, kind:'break', min: min,
        from: minToTime(from), to: minToTime(to),
        label: 'تفریح' });
    }
  });
  return out;
}

/** ساعت زنگ شمارهٔ n در روز مشخص — برای نمایش کنار برنامهٔ هفتگی */
function bellTimeOf(schoolId, period, day){
  var tl = bellTimeline(schoolId, day);
  var hit = tl.filter(function(x){ return x.kind === 'lesson' && x.no === Number(period); })[0];
  return hit ? (hit.from + ' تا ' + hit.to) : '';
}

/** تعداد زنگ درسی یک روز */
function bellLessonCount(schoolId, day){
  return bellTimeline(schoolId, day).filter(function(x){ return x.kind === 'lesson'; }).length;
}

/** ساعت پایان یک روز */
function bellEndTime(schoolId, day){
  var tl = bellTimeline(schoolId, day);
  return tl.length ? tl[tl.length - 1].to : '';
}

/** پنج روز کامل یک مدرسه (با جایگزینی الگو برای روزهای بدون داده) */
function bellCurrentDays(schoolId){
  return DAYS.map(function(_, i){
    var b = bellOf(schoolId, i);
    return { start: b.start,
             slots: b.slots.map(function(x){ return { kind:x.kind, min:Number(x.min) || 0 }; }) };
  });
}

/* ---------- اعتبارسنجی و نوشتن ---------- */

/** اعتبارسنجی یک روز. خروجی: پیام خطا یا null */
function bellValidateDay(d){
  if(timeToMin(d.start) == null) return 'ساعت شروع معتبر نیست';
  if(!d.slots || !d.slots.length) return 'دست‌کم یک زنگ لازم است';
  var bad = d.slots.filter(function(s){ return !(Number(s.min) > 0); });
  if(bad.length) return 'مدت هر بازه باید بیشتر از صفر باشد';
  var total = d.slots.reduce(function(a,s){ return a + Number(s.min); }, 0);
  if(timeToMin(d.start) + total > 1440)
    return 'مجموع زمان‌ها از پایان شبانه‌روز می‌گذرد';
  return null;
}

/** اعتبارسنجی پنج روز. خروجی: پیام خطا (با نام روز) یا null */
function bellValidateDays(days){
  for(var i = 0; i < DAYS.length; i++){
    var err = bellValidateDay(days[i] || {});
    if(err) return DAYS[i] + ': ' + err;
  }
  return null;
}

/** الگوی آماده → پنج روز یکسان (خالص) */
function bellPresetDays(key){
  var p = BELL_PRESETS[key];
  if(!p) return null;
  return DAYS.map(function(){
    return { start: p.start,
             slots: p.slots.map(function(x){ return { kind:x.kind, min:x.min }; }) };
  });
}

/**
 * ذخیرهٔ زمان‌بندی کامل (پنج روز).
 * ⚠️ اعتبارسنجی اینجا انجام می‌شود نه در نما، چون داده می‌تواند از
 * همگام‌سازی هم بیاید.
 */
function bellSaveDays(schoolId, days){
  var err = bellValidateDays(days);
  if(err) return { ok:false, msg: err };
  var norm = DAYS.map(function(_, i){
    var d = days[i] || {};
    return { start: d.start,
             slots: (d.slots || []).map(function(s){
               return { kind: s.kind === 'break' ? 'break' : 'lesson',
                        min: Number(s.min) }; }) };
  });
  var rec = bellRec(schoolId);
  var data = { school_id: schoolId, days: norm };
  if(rec) update('bell_schedules', rec.id, data);
  else insert('bell_schedules', data);
  return { ok:true, msg:'زمان‌بندی ذخیره شد' };
}

/**
 * ذخیرهٔ یک برنامه برای **همهٔ روزها** (سازگاری با نسخهٔ ۱).
 * فرم تازه `bellSaveDays` را صدا می‌زند؛ این تابع برای سازگاری باقی مانده.
 */
function bellSave(schoolId, start, slots){
  var err = bellValidateDay({ start:start, slots:slots });
  if(err) return { ok:false, msg: err };
  var norm = (slots || []).map(function(s){
    return { kind: s.kind === 'break' ? 'break' : 'lesson', min: Number(s.min) }; });
  var days = DAYS.map(function(){
    return { start: start, slots: norm.map(function(s){ return { kind:s.kind, min:s.min }; }) };
  });
  return bellSaveDays(schoolId, days);
}

/** بازگرداندن به الگوی آماده — برای یک روز، یا همهٔ روزها (dayIdx=null) */
function bellApplyPreset(schoolId, key, dayIdx){
  var pd = bellPresetDays(key);
  if(!pd) return { ok:false, msg:'الگو یافت نشد' };
  var rec = bellRec(schoolId);
  var days = bellCurrentDays(schoolId);
  if(dayIdx == null){
    days = pd.map(function(d){ return { start:d.start,
      slots:d.slots.map(function(x){ return { kind:x.kind, min:x.min }; }) }; });
  } else {
    days[dayIdx] = { start: pd[dayIdx].start,
      slots: pd[dayIdx].slots.map(function(x){ return { kind:x.kind, min:x.min }; }) };
  }
  return bellSaveDays(schoolId, days);
}

/* ------------------------------------------------------------------ */
/*  نما                                                                */
/* ------------------------------------------------------------------ */

function viewBells(){
  var u = S.user;
  var isSuper = u.role === 'superadmin';
  var sid = isSuper ? (Number(S.filters.bschool) || db.schools[0].id) : u.school_id;
  var school = byId('schools', sid) || {};
  var rec = bellRec(sid);
  var perDay = bellIsPerDay(rec);
  var today = (typeof todayIndex === 'function') ? todayIndex() : 0;
  var canEdit = ['manager','superadmin'].indexOf(u.role) > -1;
  var b0 = bellOf(sid, 0);
  var tl0 = bellDayTimeline(b0);

  var h = '<div class="card"><div class="card-head">'
    + '<h3>🔔 زمان‌بندی زنگ‌ها</h3><div class="row">'
    + (isSuper
      ? '<select class="select" style="width:200px" data-f="bschool">'
        + db.schools.map(function(s){
            return '<option value="' + s.id + '"' + (s.id === sid ? ' selected' : '') + '>'
              + esc(s.name) + '</option>'; }).join('')
        + '</select>' : '')
    + (canEdit ? '<button class="btn" data-act="bell-edit">✏️ تعریف زنگ‌ها</button>' : '')
    + '</div></div><div class="card-body">';

  /* خلاصهٔ کلی */
  h += '<div class="grid g3" style="margin-bottom:14px">'
    + bellStat('شیفت', school.shift || 'صبح', '🕐')
    + bellStat('شنبه: شروع', timeFa(b0.start), '▶️')
    + bellStat('شنبه: پایان', timeFa(bellEndTime(sid, 0)), '⏹️')
    + '</div>';

  /* آیا ساعت روزها با هم فرق دارند؟ */
  var differs = false;
  for(var di = 1; di < DAYS.length && !differs; di++){
    var tdi = bellDayTimeline(bellOf(sid, di));
    differs = JSON.stringify(tdi) !== JSON.stringify(tl0);
  }
  if(perDay && differs){
    h += '<div class="diag-item" style="border-inline-start-color:var(--blue);margin-bottom:14px">'
      + '<b>📅 ساعت روزها با هم متفاوت است</b>'
      + '<div class="small muted" style="margin-top:5px">'
      + 'این مدرسه هر روز را با ساعت مستقل تعریف کرده است.</div></div>';
  }

  if(b0._default){
    h += '<div class="diag-item" style="border-inline-start-color:var(--amber);margin-bottom:14px">'
      + '<b>⚠️ هنوز زمان‌بندی اختصاصی تعریف نشده</b>'
      + '<div class="small muted" style="margin-top:5px">'
      + 'آنچه می‌بینید الگوی پیشنهادی «' + esc(b0.preset) + '» است. '
      + 'با دکمهٔ «تعریف زنگ‌ها» آن را متناسب با مدرسهٔ خود تنظیم کنید.</div></div>';
  }

  /* خط زمانی هر روز جدا — روز جاری برجسته */
  DAYS.forEach(function(name, i){
    var b = bellOf(sid, i);
    var tl = bellDayTimeline(b);
    var isToday = (i === today);
    var dayDiff = i > 0 && JSON.stringify(tl) !== JSON.stringify(tl0);
    h += '<div class="bell-day-block' + (isToday ? ' today' : '') + '" style="margin-top:14px">'
      + '<div class="row" style="margin-bottom:7px">'
      + '<div class="sec-title" style="margin:0">' + name
      + (isToday ? ' <span class="badge b-blue">امروز</span>' : '')
      + (dayDiff ? ' <span class="badge b-amber">ساعت متفاوت</span>' : '')
      + '</div>'
      + '<span class="small muted" style="direction:ltr">'
      + timeFa(b.start) + ' — ' + timeFa(bellEndTime(sid, i))
      + '</span></div>'
      + '<div class="bell-line">'
      + tl.map(function(x){
          return '<div class="bell-slot ' + x.kind + '">'
            + '<div class="bell-when">' + timeFa(x.from) + ' — ' + timeFa(x.to) + '</div>'
            + '<div class="bell-what"><b>' + esc(x.label) + '</b>'
            + '<span class="small muted"> ' + fa(x.min) + ' دقیقه</span></div>'
            + '</div>'; }).join('')
      + '</div></div>';
  });

  h += '<div class="small muted" style="margin-top:12px">'
    + 'هر روز به‌تنهایی قابل تعریف است · تعداد زنگ سقف ندارد'
    + '</div>';

  return h + '</div></div>';
}

function bellStat(label, val, icon){
  return '<div class="card stat"><div class="stat-icon b-blue">' + icon + '</div>'
    + '<div><b style="font-size:20px">' + esc(String(val)) + '</b>'
    + '<span>' + esc(label) + '</span></div></div>';
}

/* ---------- فرم تعریف زنگ‌ها (به تفکیک روز) ---------- */

/**
 * فرم تازه: پنج روز، هر روز با ساعت کاملاً مستقل.
 * مدیر ساعت شروع روز و **ساعت پایان هر بازه** را می‌بیند و
 * ویرایش می‌کند؛ ساعت شروع هر بازه از قبل محاسبه می‌شود (زنجیره).
 * دکمهٔ «کپی از روز قبل» روز دوم به بعد، ساعت روز پیش را می‌آورد.
 */
function bellModal(sid){
  var days = bellCurrentDays(sid);
  window._edit = { school_id: sid, days: days };
  openModal(modalTpl('تعریف زنگ‌ها — به تفکیک روز',
    '<div class="small muted" style="margin-bottom:10px">'
    + 'هر زنگ با ساعت شروع و پایان مشخص: زنگ اول از X تا Y، زنگ دوم از Y تا Z. '
    + 'ساعت پایان یک بازه را عوض کنید؛ بازه‌های بعد خودکار جابه‌جا می‌شوند. '
    + 'تعداد زنگ سقف ندارد.</div>'
    + DAYS.map(function(_, i){ return bellDayForm(days[i], i); }).join('')
    + '<div class="row" style="margin-top:6px;justify-content:center">'
    +   '<button class="btn" data-act="bell-save">💾 ذخیره همهٔ روزها</button>'
    + '</div>',
    'bell-save'));
}

function bellDayForm(d, i){
  var tl = bellDayTimeline(d);
  return '<div class="bell-day" data-day="' + i + '">'
    + '<div class="row" style="margin-bottom:7px">'
    +   '<div class="sec-title" style="margin:0">' + DAYS[i] + '</div>'
    +   (i > 0
        ? '<button class="btn ghost sm" data-act="bell-copy-prev" data-day="' + i + '"'
          + ' title="ساعت ' + DAYS[i-1] + ' را به ' + DAYS[i] + ' کپی کن">'
          + '⧉ کپی از روز قبل</button>'
        : '')
    +   '<select class="select" id="bl_preset_' + i + '" style="width:auto" '
    +     'title="الگوی آماده روی همین روز اعمال می‌شود">'
    +     '<option value="">الگوی آماده…</option>'
    +     Object.keys(BELL_PRESETS).map(function(k){
        return '<option value="' + esc(k) + '">' + esc(BELL_PRESETS[k].title) + '</option>';
      }).join('') + '</select>'
    + '</div>'
    + '<div class="row" style="margin-bottom:7px">'
    +   '<span class="small">شروع روز:</span>'
    +   '<input class="input bl-start" data-day="' + i + '" value="' + esc(d.start)
    +     '" placeholder="07:30" style="width:100px;direction:ltr;text-align:center">'
    + '</div>'
    + '<div class="bl-rows">'
    + tl.map(function(x, ri){ return bellRowForm(x, i, ri); }).join('')
    + '</div>'
    + '<div class="row" style="margin-top:4px">'
    +   '<button class="btn ghost sm" data-act="bell-add" data-day="' + i + '" data-kind="lesson">➕ زنگ درس</button>'
    +   '<button class="btn ghost sm" data-act="bell-add" data-day="' + i + '" data-kind="break">☕ زنگ تفریح</button>'
    + '</div>'
    + '</div>';
}

/** یک بازه در فرم: نوع · از (محاسبه‌شده) · تا (قابل ویرایش) · حذف */
function bellRowForm(x, day, i){
  var isBreak = x.kind === 'break';
  return '<div class="bell-edit-row">'
    + '<span class="bell-tag ' + (isBreak ? 'br' : 'ls') + '">'
    + (isBreak ? '☕ تفریح' : '📘 ' + esc(x.label)) + '</span>'
    + '<span class="small muted">از</span>'
    + '<span class="bl-from" style="font-variant-numeric:tabular-nums;min-width:52px;text-align:center;direction:ltr">'
    + esc(x.from) + '</span>'
    + '<span class="small muted">تا</span>'
    + '<input class="input bl-to" data-day="' + day + '" data-i="' + i
    + '" value="' + esc(x.to) + '" placeholder="08:15" '
    + 'style="width:100px;direction:ltr;text-align:center" title="ساعت پایان این بازه">'
    + '<button class="icon-btn danger" data-act="bell-del" data-day="' + day + '" data-i="' + i
    + '" title="حذف این بازه">🗑️</button>'
    + '</div>';
}

/** بازرندر یک روز از فرم (پس از افزودن/حذف/کپی/تغییر ساعت) */
function bellRenderDay(day){
  var ed = window._edit;
  if(!ed || !ed.days[day]) return;
  var box = $('.bell-day[data-day="' + day + '"]');
  if(box) box.outerHTML = bellDayForm(ed.days[day], day);
}

/* ═══════════════════════════════════════════════════════════════════
   دادهٔ نمونهٔ نوبت‌های جلسهٔ اولیا و زمان‌بندی زنگ
   ═══════════════════════════════════════════════════════════════════

   چرا اینجا و نه در 02-demo-data.js؟
   این داده به توابع همین ماژول (BELL_PRESETS) و به کاربرانی که در
   فازهای بعدی ساخته می‌شوند وابسته است. الگوی generateP8/9/10.

   ⚠️ نوبت جلسه باید در آینده باشد، نه گذشته. نوبت گذشته در صفحهٔ
   ولی «قابل رزرو» نیست و صفحه دوباره خالی به نظر می‌رسد.
   ═══════════════════════════════════════════════════════════════════ */

/** افزودن n روز به امروز — نوبت‌ها باید آینده باشند */
function daysAheadISO(n){
  var t = new Date();
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
}

/**
 * دادهٔ نمونهٔ فاز ۱: نوبت جلسهٔ اولیا + زمان‌بندی زنگ مدرسه‌ها.
 * بدون این، دو صفحه خالی باز می‌شوند در حالی که کدشان سالم است.
 */
function generateP11(){
  db.meeting_slots = db.meeting_slots || [];
  db.bell_schedules = db.bell_schedules || [];

  /* ── ۱) زمان‌بندی زنگ ──────────────────────────────────────────
     الگوی آماده بر پایهٔ مقطع و شیفت مدرسه ذخیره می‌شود تا صفحه
     به‌جای «هنوز تعریف نشده» زمان‌بندی واقعی نشان دهد.
     نسخهٔ ۲: پنج روز با ساعت یکسان (مدیر بعداً می‌تواند هر روز را
     جدا کند).
     ⚠️ مدرسهٔ غیرفعال کنار گذاشته می‌شود. */
  db.schools.forEach(function(s){
    if(!s.active) return;
    if(db.bell_schedules.some(function(b){ return b.school_id === s.id; })) return;
    var key = (s.level === 'ابتدایی') ? 'ابتدایی'
            : (s.shift === 'بعدازظهر') ? 'بعدازظهر' : 'صبح';
    var pre = BELL_PRESETS[key] || BELL_PRESETS['صبح'];
    add('bell_schedules', { school_id: s.id,
      days: DAYS.map(function(){
        return { start: pre.start,
          slots: pre.slots.map(function(x){
            return { kind: x.kind, min: x.min }; }) }; }) });
  });

  /* ── ) نوبت‌های نوبت‌های جلسهٔ اولیا ─────────────────────────
     برای هر مدرسهٔ فعال، دو دبیر نخست در دو روز آینده نوبت دارند.
     بخشی رزروشده تا هر دو حالت «آزاد» و «رزرو» در صفحه دیده شود. */
  var PLACES = ['دفتر مدرسه', 'اتاق مشاور', 'سالن اجتماعات'];

  db.schools.forEach(function(s, si){
    if(!s.active) return;
    var teachers = db.users.filter(function(u){
      return u.role === 'teacher' && u.school_id === s.id; }).slice(0, 2);
    if(!teachers.length) return;

    /* اولیای همین مدرسه، برای رزروهای نمونه */
    var kids = db.users.filter(function(u){
      return u.role === 'student' && u.school_id === s.id; });
    var links = db.parent_links.filter(function(l){
      return kids.some(function(k){ return k.id === l.student_id; }); });

    teachers.forEach(function(t, ti){
      /* دو روز آینده: پس‌فردا و چهار روز بعد */
      [2 + ti, 4 + ti].forEach(function(off, di){
        var date = daysAheadISO(off);
        var mins = 15 * 60;              /* شروع ساعت ۱۵:۰۰ */
        var dur = 15;
        for(var i = 0; i < 6; i++){
          var hh = Math.floor(mins / 60), mm = mins % 60;
          var time = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
          /* دو نوبت نخست هر روز رزروشده، بقیه آزاد */
          var booked = (i < 2 && links.length > i);
          var lk = booked ? links[(si + ti + i) % links.length] : null;
          add('meeting_slots', {
            school_id: s.id, teacher_id: t.id, date: date, start_time: time,
            duration: dur, location: PLACES[(ti + di) % PLACES.length],
            status: booked ? 'booked' : 'open',
            parent_id: lk ? lk.parent_id : null,
            student_id: lk ? lk.student_id : null,
            note: booked ? 'پیگیری وضعیت درسی' : null,
            created_at: daysAgoISO(3) });
          mins += dur;
        }
      });
    });
  });
}

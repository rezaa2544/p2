/* ═══════════════════════════════════════════════════════════════════
   زمان‌بندی زنگ‌ها و زنگ تفریح

   هر مدرسه و هر منطقه ساعت‌های متفاوتی دارد؛ مدرسهٔ روستایی زودتر
   شروع می‌کند، مدرسهٔ شیفت بعدازظهر بعد از ظهر، و طول زنگ تفریح در
   ابتدایی با متوسطه فرق دارد. پس این زمان‌ها **سخت‌کدشده نیستند** و
   مدیر مدرسه خودش تعریفشان می‌کند.

   ساختار داده: هر مدرسه یک رکورد در `db.bell_schedules` دارد که
   شامل آرایه‌ای از بازه‌هاست. هر بازه یا «درس» است یا «تفریح».
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

/** «۰۷:۳۰» → ۴۵۰ دقیقه از نیمه‌شب */
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

/* ---------- خواندن و نوشتن ---------- */

/**
 * زمان‌بندی یک مدرسه. اگر تعریف نشده باشد، الگوی متناسب با شیفت و
 * مقطعش برگردانده می‌شود — تا برنامه هرگز بدون ساعت نماند.
 */
function bellOf(schoolId){
  var rec = (db.bell_schedules || []).filter(function(b){
    return b.school_id === schoolId; })[0];
  if(rec && rec.slots && rec.slots.length) return rec;

  var s = byId('schools', schoolId) || {};
  var key = (s.level === 'ابتدایی') ? 'ابتدایی'
          : (s.shift === 'بعدازظهر') ? 'بعدازظهر' : 'صبح';
  var p = BELL_PRESETS[key];
  return { school_id: schoolId, start: p.start,
           slots: p.slots.map(function(x){ return { kind:x.kind, min:x.min }; }),
           preset: key, _default: true };
}

/**
 * بازه‌ها را به ساعت واقعی تبدیل می‌کند.
 * خروجی: [{ no, kind, from, to, min, label }]
 * «no» فقط برای زنگ‌های درسی شماره می‌خورد، تفریح شماره ندارد.
 */
function bellTimeline(schoolId){
  var b = bellOf(schoolId);
  var cur = timeToMin(b.start);
  if(cur == null) cur = 450;
  var out = [], lesson = 0;
  (b.slots || []).forEach(function(sl){
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

/** ساعت زنگ شمارهٔ n — برای نمایش کنار برنامهٔ هفتگی */
function bellTimeOf(schoolId, period){
  var tl = bellTimeline(schoolId);
  var hit = tl.filter(function(x){ return x.kind === 'lesson' && x.no === Number(period); })[0];
  return hit ? (hit.from + ' تا ' + hit.to) : '';
}

/** تعداد زنگ درسی */
function bellLessonCount(schoolId){
  return bellTimeline(schoolId).filter(function(x){ return x.kind === 'lesson'; }).length;
}

/** ساعت پایان مدرسه */
function bellEndTime(schoolId){
  var tl = bellTimeline(schoolId);
  return tl.length ? tl[tl.length - 1].to : '';
}

/**
 * ذخیرهٔ زمان‌بندی.
 * ⚠️ اعتبارسنجی اینجا انجام می‌شود نه در نما، چون داده می‌تواند از
 * همگام‌سازی هم بیاید.
 */
function bellSave(schoolId, start, slots){
  if(timeToMin(start) == null) return { ok:false, msg:'ساعت شروع معتبر نیست' };
  if(!slots || !slots.length) return { ok:false, msg:'دست‌کم یک زنگ لازم است' };
  var bad = slots.filter(function(s){ return !(Number(s.min) > 0); });
  if(bad.length) return { ok:false, msg:'مدت هر بازه باید بیشتر از صفر باشد' };

  var total = slots.reduce(function(a,s){ return a + Number(s.min); }, 0);
  if(timeToMin(start) + total > 1440)
    return { ok:false, msg:'مجموع زمان‌ها از پایان شبانه‌روز می‌گذرد' };

  var rec = (db.bell_schedules || []).filter(function(b){
    return b.school_id === schoolId; })[0];
  var data = { school_id: schoolId, start: start,
               slots: slots.map(function(s){
                 return { kind: s.kind === 'break' ? 'break' : 'lesson',
                          min: Number(s.min) }; }) };
  if(rec) update('bell_schedules', rec.id, data);
  else insert('bell_schedules', data);
  return { ok:true, msg:'زمان‌بندی ذخیره شد' };
}

/** بازگرداندن به الگوی آماده */
function bellApplyPreset(schoolId, key){
  var p = BELL_PRESETS[key];
  if(!p) return { ok:false, msg:'الگو یافت نشد' };
  return bellSave(schoolId, p.start,
    p.slots.map(function(x){ return { kind:x.kind, min:x.min }; }));
}

/* ------------------------------------------------------------------ */
/*  نما                                                                */
/* ------------------------------------------------------------------ */

function viewBells(){
  var u = S.user;
  var isSuper = u.role === 'superadmin';
  var sid = isSuper ? (Number(S.filters.bschool) || db.schools[0].id) : u.school_id;
  var school = byId('schools', sid) || {};
  var b = bellOf(sid);
  var tl = bellTimeline(sid);
  var canEdit = ['manager','superadmin'].indexOf(u.role) > -1;

  var h = '<div class="card"><div class="card-head">'
    + '<h3>🔔 زمان‌بندی زنگ‌ها</h3><div class="row">'
    + (isSuper
      ? '<select class="select" style="width:200px" data-f="bschool">'
        + db.schools.map(function(s){
            return '<option value="' + s.id + '"' + (s.id === sid ? ' selected' : '') + '>'
              + esc(s.name) + '</option>'; }).join('')
        + '</select>' : '')
    + (canEdit ? '<button class="btn" data-act="bell-edit">✏️ ویرایش زمان‌ها</button>' : '')
    + '</div></div><div class="card-body">';

  /* خلاصه */
  h += '<div class="grid g3" style="margin-bottom:14px">'
    + bellStat('شیفت', school.shift || 'صبح', '🕐')
    + bellStat('شروع', timeFa(b.start), '▶️')
    + bellStat('پایان', timeFa(bellEndTime(sid)), '⏹️')
    + '</div>';

  if(b._default){
    h += '<div class="diag-item" style="border-inline-start-color:var(--amber);margin-bottom:14px">'
      + '<b>⚠️ هنوز زمان‌بندی اختصاصی تعریف نشده</b>'
      + '<div class="small muted" style="margin-top:5px">'
      + 'آنچه می‌بینید الگوی پیشنهادی «' + esc(b.preset) + '» است. '
      + 'با دکمهٔ «ویرایش زمان‌ها» آن را متناسب با مدرسهٔ خود تنظیم کنید.</div></div>';
  }

  /* خط زمانی */
  h += '<div class="bell-line">';
  tl.forEach(function(x){
    h += '<div class="bell-slot ' + x.kind + '">'
      + '<div class="bell-when">' + timeFa(x.from) + ' — ' + timeFa(x.to) + '</div>'
      + '<div class="bell-what"><b>' + esc(x.label) + '</b>'
      + '<span class="small muted"> ' + fa(x.min) + ' دقیقه</span></div>'
      + '</div>';
  });
  h += '</div>';

  h += '<div class="small muted" style="margin-top:12px">'
    + 'مجموع ' + fa(bellLessonCount(sid)) + ' زنگ درسی · '
    + fa(tl.filter(function(x){ return x.kind === 'break'; }).length) + ' زنگ تفریح'
    + '</div>';

  return h + '</div></div>';
}

function bellStat(label, val, icon){
  return '<div class="card stat"><div class="stat-icon b-blue">' + icon + '</div>'
    + '<div><b style="font-size:20px">' + esc(String(val)) + '</b>'
    + '<span>' + esc(label) + '</span></div></div>';
}

/** فرم ویرایش */
function bellModal(sid){
  var b = bellOf(sid);
  var rows = (b.slots || []).map(function(s, i){ return bellRow(s, i); }).join('');
  openModal(modalTpl('ویرایش زمان‌بندی زنگ‌ها',
    '<div class="grid g2">'
    + f('ساعت شروع مدرسه *', '<input class="input" id="bl_start" value="'
        + esc(b.start) + '" placeholder="07:30" style="direction:ltr;text-align:center">')
    + f('الگوی آماده', '<select class="select" id="bl_preset">'
        + '<option value="">— بدون تغییر —</option>'
        + Object.keys(BELL_PRESETS).map(function(k){
            return '<option value="' + esc(k) + '">' + esc(BELL_PRESETS[k].title) + '</option>';
          }).join('') + '</select>')
    + '</div>'
    + '<div class="small muted" style="margin:-4px 0 12px">'
    + 'انتخاب الگو، همهٔ بازه‌های زیر را جایگزین می‌کند.</div>'
    + '<div class="sec-title">بازه‌ها</div>'
    + '<div id="bl_rows">' + rows + '</div>'
    + '<div class="row" style="margin-top:10px">'
    +   '<button class="btn ghost sm" data-act="bell-add" data-kind="lesson">➕ زنگ درس</button>'
    +   '<button class="btn ghost sm" data-act="bell-add" data-kind="break">☕ زنگ تفریح</button>'
    + '</div>',
    'bell-save'));
  window._edit = { school_id: sid };
}

function bellRow(s, i){
  var isBreak = s.kind === 'break';
  return '<div class="bell-edit-row" data-i="' + i + '">'
    + '<span class="bell-tag ' + (isBreak ? 'br' : 'ls') + '">'
    +   (isBreak ? '☕ تفریح' : '📘 درس') + '</span>'
    + '<input class="input bl-min" type="number" min="1" max="240" value="' + (Number(s.min) || 0)
    +   '" style="width:90px" data-kind="' + (isBreak ? 'break' : 'lesson') + '">'
    + '<span class="small muted">دقیقه</span>'
    + '<button class="icon-btn danger" data-act="bell-del" data-i="' + i + '" title="حذف">🗑️</button>'
    + '</div>';
}

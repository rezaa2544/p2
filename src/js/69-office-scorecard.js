/* ═══════════════════════════════════════════════════════════════════
   کارتِ امتیازیِ محدودهٔ اداره (بند D.2 از دستورِ جامعِ فرناز)
   ───────────────────────────────────────────────────────────────────
   پنج بُعدِ کارتِ امتیازیِ متوازن، همه از دادهٔ موجودِ سامانه و همه
   «تجمیعی» — برای ارائه به استان:

     ۱. وضعیتِ مالی        — فقط نرخِ وصول (درصد)؛ نه مبلغ، نه وضعیتِ خانواده
     ۲. فرایندهایِ داخلی   — نرخِ ثبتِ حضور و نرخِ ثبتِ نمره
     ۳. رشد و یادگیری      — روندِ میانگینِ نمره (نوبتِ جاری در برابرِ پیشین)
     ۴. رضایتِ اولیا       — منبعِ داده (نظرسنجی) هنوز در سامانه نیست ⇒ تهی
     ۵. مدیریتِ مدرسه‌داری — صورتجلساتِ انجمن + مانورِ ایمنی (قلاب)

   🔴 سه قاعدهٔ ثابتِ این ماژول:
     • **هرگز عدد نسازیم:** بُعدی که داده ندارد `score: null` می‌گیرد و
       در میانگینِ کل هم نمی‌آید. نمرهٔ ساختگی از «بی‌داده‌بودن» بدتر است.
     • **این ماژول فقط می‌خواند** — هیچ insert/update/remove ندارد؛ پس
       نیازی به مجوزِ نوشتن ندارد و در sync هم ردیفی نمی‌سازد.
     • **نقطهٔ اتصالِ سطحِ اداره (سندِ D.1):** امروز سطح از `offices.level`
       خوانده می‌شود (برچسب فقط)؛ پس از تصویبِ آن سند، سطح از
       `users.office_level` می‌آید و همین‌جا کافی است عوض شود.
   ═══════════════════════════════════════════════════════════════════ */

/* باندهایِ وضعیت — یک تعریف برای همهٔ ابعاد تا رنگ/واژه در گزارش یکی باشد */
var SC_BANDS = {
  good: ['خوب',      'b-green',  '#16a34a'],
  warn: ['نیازمندِ توجه', 'b-amber', '#d97706'],
  bad:  ['بحرانی',   'b-red',    '#dc2626'],
  none: ['داده‌ای نیست', 'b-gray',  '#94a3b8']
};
/** باند از روی نمره (۷۵+ خوب · ۵۰–۷۴ نیازمندِ توجه · کمتر بحرانی) */
function scBand(score){
  if(score === null || score === undefined || isNaN(score)) return 'none';
  if(score >= 75) return 'good';
  if(score >= 50) return 'warn';
  return 'bad';
}
var SC_DIM_KEYS = ['finance','process','growth','parent','manage'];
var SC_DIM_TITLES = {
  finance: 'مالی', process: 'فرایندهایِ داخلی', growth: 'رشد و یادگیری',
  parent: 'رضایتِ اولیا', manage: 'مدیریتِ مدرسه‌داری'
};

/* ─────────────────────────── ابزار ─────────────────────────── */
function scIsoOf(d){
  var m = String(d.getMonth() + 1), day = String(d.getDate());
  return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
}
/** ISOِ n روز پیش — بدون وابستگی به منطقهٔ زمانی (toISOString در UTC است) */
function scDaysAgoISO(n){
  var d = new Date(String(todayISO()).slice(0, 10) + 'T00:00:00');
  if(isNaN(d.getTime())) return '';
  d.setDate(d.getDate() - n);
  return scIsoOf(d);
}
function scClamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
/** میانگین با محافظت در برابرِ آرایهٔ تهی */
function scAvg(list, pick){
  if(!list.length) return null;
  var s = 0;
  for(var i = 0; i < list.length; i++) s += Number(pick ? pick(list[i]) : list[i]) || 0;
  return s / list.length;
}
/** درصدِ امن: مخرجِ صفر ⇒ تهی (نه ۰ — صفر یعنی «هیچ وصولی» و تهی یعنی «بی‌داده») */
function scPct(num, den){
  if(!den) return null;
  return scClamp((num / den) * 100, 0, 100);
}
/** نرخِ «چند مدرسه از محدوده این ویژگی را دارند» */
function scSchoolRate(rows, schoolIds){
  var total = Object.keys(schoolIds || {}).length;
  if(!total) return null;
  var hit = {};
  rows.forEach(function(r){ if(schoolIds[r.school_id]) hit[r.school_id] = 1; });
  return scPct(Object.keys(hit).length, total);
}

/* ───────────────── قلاب‌هایِ دادهٔ بیرونی (بعدهای ۴ و ۵) ─────────────────
   این دو تابع «تنها نقطهٔ تعریفِ» آن دو بُعدند. امروز منبعِ داده در سامانه
   نیست (نه مجموعهٔ نظرسنجی هست، نه مجموعهٔ مانورِ ایمنی) و هر دو تهی
   برمی‌گردانند؛ به‌محض افزوده‌شدنِ مجموعه، بدون تغییر در نمایی که اینجا
   ساخته می‌شود، بعد پُر می‌شود. آزمون‌ها با تزریقِ مجموعهٔ موقت، زنده‌بودنِ
   همین قلاب را می‌سنجند (نه این‌که فقط تهی برگرداند).                */
function parentSatisfactionScore(schoolIds){
  if(!db.parent_surveys || !db.parent_surveys.length) return null;
  var rows = db.parent_surveys.filter(function(r){ return !schoolIds || schoolIds[r.school_id]; });
  if(!rows.length) return null;
  var v = scAvg(rows, function(r){ return r.score; });
  return v === null ? null : scClamp(Math.round(v), 0, 100);
}
function safetyDrillRate(schoolIds){
  if(!db.safety_drills || !db.safety_drills.length) return null;
  var rows = db.safety_drills.filter(function(r){ return !schoolIds || schoolIds[r.school_id]; });
  return rows.length ? scSchoolRate(rows, schoolIds) : null;
}

/* ─────────────────────────── بُعدِ ۱: مالی ───────────────────────────
   فقط نرخِ وصولِ تجمیعی. **درصد، نه مبلغ** — چون این گزارش به استان
   می‌رود و مبلغ/وضعیتِ تک‌تکِ خانواده‌ها محرمانه است.                  */
function scDimFinance(schoolIds, schools){
  var parts = [], scores = [];
  var tus = (db.tuitions || []).filter(function(t){ return schoolIds[t.school_id]; });
  var payable = 0, paid = 0;
  tus.forEach(function(t){ payable += Number(t.payable || t.total || 0); paid += Number(t.paid || 0); });
  var col = scPct(paid, payable);
  if(col !== null){ scores.push(col); parts.push(['نرخِ وصولِ شهریه', fa(Math.round(col)) + '٪']); }

  var insts = (db.installments || []).filter(function(i){ return schoolIds[i.school_id] && i.status !== 'canceled'; });
  var iPaid = insts.filter(function(i){ return i.status === 'paid'; }).length;
  var iRate = scPct(iPaid, insts.length);
  if(iRate !== null){ scores.push(iRate); parts.push(['اقساطِ پرداخت‌شده', fa(Math.round(iRate)) + '٪']); }

  var withData = {};
  tus.forEach(function(t){ withData[t.school_id] = 1; });
  var score = scores.length ? Math.round(scAvg(scores)) : null;
  return {
    key: 'finance', title: SC_DIM_TITLES.finance, score: score, band: scBand(score),
    parts: parts,
    coverage: Object.keys(withData).length,
    note: 'فقط درصدِ تجمیعی — مبلغِ شهریه و وضعیتِ هیچ خانواده‌ای در این گزارش نیست.'
  };
}

/* ─────────────────── بُعدِ ۲: فرایندهایِ داخلی ─────────────────── */
function scDimProcess(schoolIds, schools){
  var since = scDaysAgoISO(30);
  var att = (db.attendance || []).filter(function(a){ return schoolIds[a.school_id]; });
  var recent = att.filter(function(a){ return since && String(a.date || '') >= since; });
  var activeRate = scSchoolRate(recent, schoolIds);
  var presentRate = scPct(recent.filter(function(a){ return a.status === 'present'; }).length, recent.length);

  var cur = scCurrentTerm(schoolIds);
  var grades = (db.grades || []).filter(function(g){ return schoolIds[g.school_id]; });
  var gradeRate = cur ? scSchoolRate(grades.filter(function(g){ return scTermIndex(g.term) === cur; }), schoolIds) : null;

  var scores = [activeRate, presentRate, gradeRate].filter(function(v){ return v !== null; });
  var score = scores.length ? Math.round(scAvg(scores)) : null;
  var parts = [];
  if(activeRate !== null) parts.push(['مدارسِ دارای ثبتِ حضور (۳۰ روز)', fa(Math.round(activeRate)) + '٪']);
  if(presentRate !== null) parts.push(['نرخِ حضور (۳۰ روز)', fa(Math.round(presentRate)) + '٪']);
  if(gradeRate !== null) parts.push(['مدارسِ دارای نمرهٔ نوبتِ جاری', fa(Math.round(gradeRate)) + '٪']);
  return {
    key: 'process', title: SC_DIM_TITLES.process, score: score, band: scBand(score),
    parts: parts, coverage: Object.keys(recent.reduce(function(a, r){ a[r.school_id] = 1; return a; }, {})).length,
    note: 'نرخِ ثبت (آیا مدرسه داده وارد می‌کند؟) در کنارِ نرخِ کیفیت (حضورِ واقعی).'
  };
}

/* ─────────────────── بُعدِ ۳: رشد و یادگیری ─────────────────── */
/** نوبتِ جاری = بزرگ‌ترین نوبتِ موجود در دادهٔ محدوده (۱/۲/۳) */
function scTermIndex(t){
  var s = String(t || '').trim();
  if(s === '1' || s === 'نوبت اول' || s === 'اول') return 1;
  if(s === '2' || s === 'نوبت دوم' || s === 'دوم') return 2;
  if(s === '3' || s === 'نوبت سوم' || s === 'سوم') return 3;
  return null;
}
function scCurrentTerm(schoolIds){
  var max = null;
  (db.grades || []).forEach(function(g){
    if(!schoolIds[g.school_id]) return;
    var i = scTermIndex(g.term);
    if(i !== null && (max === null || i > max)) max = i;
  });
  return max;
}
function scDimGrowth(schoolIds, schools){
  var cur = scCurrentTerm(schoolIds);
  var rows = (db.grades || []).filter(function(g){ return schoolIds[g.school_id]; });
  var curRows = cur ? rows.filter(function(g){ return scTermIndex(g.term) === cur; }) : [];
  var avgCur = scAvg(curRows, function(g){ return g.score; });
  var parts = [], score = null, note = '', label = '';
  if(avgCur !== null){
    parts.push(['میانگینِ نمرهٔ نوبتِ جاری', fa(Math.round(avgCur * 100) / 100)]);
    var prevRows = rows.filter(function(g){ return scTermIndex(g.term) === cur - 1; });
    var avgPrev = prevRows.length ? scAvg(prevRows, function(g){ return g.score; }) : null;
    if(avgPrev !== null){
      var delta = avgCur - avgPrev;
      /* هر +۱ نمره ≈ ۱۲ امتیاز؛ ۵۰ = بدون تغییر */
      score = scClamp(Math.round(50 + delta * 12), 0, 100);
      parts.push(['نوبتِ پیشین', fa(Math.round(avgPrev * 100) / 100)]);
      parts.push(['تغییر', (delta > 0 ? '+' : '') + fa(Math.round(delta * 100) / 100)]);
      note = 'امتیاز = ۵۰ (بدون تغییر) ± ۱۲ به‌ازای هر نمرهٔ تغییرِ میانگین.';
      /* 🔴 باندِ این بُعد از «جهتِ تغییر» می‌آید نه از خودِ نمره — وگرنه
         میانگینِ بدون تغییر (نمرهٔ ۵۰) «نیازمندِ توجه» دیده می‌شد. */
      label = delta > 0.3 ? 'روبه‌رشد' : (delta < -0.3 ? 'نزولی' : 'تقریباً ثابت');
      var band = delta > 0.3 ? 'good' : (delta < -0.3 ? 'bad' : 'warn');
      return {
        key: 'growth', title: SC_DIM_TITLES.growth, score: score, band: band, label: label,
        parts: parts, coverage: Object.keys(curRows.reduce(function(a, r){ a[r.school_id] = 1; return a; }, {})).length,
        note: note
      };
    } else {
      note = 'روند محاسبه نشد — فقط یک نوبت در دادهٔ محدوده هست.';
      label = 'بدونِ روند';
    }
  } else {
    note = 'نمره‌ای در محدوده ثبت نشده است.';
    label = 'بی‌داده';
  }
  return {
    key: 'growth', title: SC_DIM_TITLES.growth, score: score, band: scBand(score), label: label,
    parts: parts, coverage: Object.keys(curRows.reduce(function(a, r){ a[r.school_id] = 1; return a; }, {})).length,
    note: note
  };
}

/* ─────────────────── بُعدِ ۴: رضایتِ اولیا ─────────────────── */
function scDimParent(schoolIds, schools){
  var score = parentSatisfactionScore(schoolIds);
  return {
    key: 'parent', title: SC_DIM_TITLES.parent, score: score, band: scBand(score),
    parts: [], coverage: 0,
    note: 'منبعِ دادهٔ این بُعد (نظرسنجیِ اولیا) هنوز در سامانه تعریف نشده است؛ ' +
          'به‌محض افزوده‌شدن، بدون تغییر در این گزارش پُر می‌شود.'
  };
}

/* ─────────────────── بُعدِ ۵: مدیریتِ مدرسه‌داری ─────────────────── */
function scDimManage(schoolIds, schools){
  var since = scDaysAgoISO(120);
  var minutes = (db.assoc_minutes || []).filter(function(m){ return schoolIds[m.school_id]; });
  var minRate = scSchoolRate(minutes.filter(function(m){ return !since || String(m.meeting_date || '') >= since; }), schoolIds);
  var drill = safetyDrillRate(schoolIds);

  var scores = [minRate, drill].filter(function(v){ return v !== null; });
  var score = scores.length ? Math.round(scAvg(scores)) : null;
  var parts = [];
  if(minRate !== null) parts.push(['مدارسِ دارای صورتجلسهٔ انجمن (۱۲۰ روز)', fa(Math.round(minRate)) + '٪']);
  if(drill !== null) parts.push(['مدارسِ دارای مانورِ ایمنی', fa(Math.round(drill)) + '٪']);
  else parts.push(['مانورِ ایمنی', 'داده‌ای نیست']);
  return {
    key: 'manage', title: SC_DIM_TITLES.manage, score: score, band: scBand(score),
    parts: parts,
    coverage: Object.keys(minutes.reduce(function(a, r){ a[r.school_id] = 1; return a; }, {})).length,
    note: 'صورتجلساتِ انجمنِ اولیا و مربیان + مانورِ ایمنی (قلاب — منبعِ داده ندارد).'
  };
}

/* ─────────────────────────── مونتاژ ─────────────────────────── */
/**
 * کارتِ امتیازیِ محدوده.
 * @param {object} office  رکوردِ اداره (برای سوپرادمین می‌تواند تهی باشد)
 * @param {array}  schools مدارسِ محدوده (پیش‌فرض: officeScopeSchools)
 */
function officeScorecard(office, schools){
  schools = schools || ((typeof officeScopeSchools === 'function') ? officeScopeSchools(office) : []) || [];
  var ids = {};
  schools.forEach(function(s){ ids[s.id] = 1; });
  var dims = [
    scDimFinance(ids, schools),
    scDimProcess(ids, schools),
    scDimGrowth(ids, schools),
    scDimParent(ids, schools),
    scDimManage(ids, schools)
  ];
  var have = dims.filter(function(d){ return d.score !== null; });
  var total = have.length ? Math.round(scAvg(have, function(d){ return d.score; })) : null;
  return {
    office: office || null,
    office_name: office ? office.name : 'کلِ کشور (سوپرادمین)',
    office_level: office ? (OFFICE_LEVEL[office.level] || 'اداره') : 'سراسری',
    schools: schools.length,
    date: todayISO(),
    dims: dims,
    total: total,
    band: scBand(total),
    available: have.length,
    missing: dims.filter(function(d){ return d.score === null; }).map(function(d){ return d.key; })
  };
}

/* ═══════════════════ نمای صفحه (روت: officescore) ═══════════════════ */
function viewOfficeScore(){
  var u = S.user, o = (typeof officeOf === 'function') ? officeOf(u) : null;
  var schools = (typeof officeScopeSchools === 'function') ? officeScopeSchools(o) : [];
  var sc = officeScorecard(o, schools);

  if(!schools.length){
    return '<div class="card"><div class="card-head"><h3>📊 کارتِ امتیازیِ محدوده</h3></div>'
      + empty('🗺️', 'مدرسه‌ای در محدودهٔ شما نیست',
              'کارتِ امتیازی از دادهٔ مدارسِ زیرمجموعه ساخته می‌شود.') + '</div>';
  }

  var head = '<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--primary-soft),#fff)">'
    + '<div class="card-body"><div class="row">'
    + '<div><b style="font-size:15px">' + esc(sc.office_name) + '</b>'
    + '<div class="small muted">کارتِ امتیازیِ ' + esc(sc.office_level) + ' · ' + fa(sc.schools)
    + ' مدرسه · ' + esc(jalali(sc.date)) + ' · <b>فقط دادهٔ تجمیعی</b> — اطلاعاتِ فردی ندارد</div></div>'
    + '<div class="spacer"></div>'
    + '<button class="btn sm" data-act="office-score-print">🖨️ نسخهٔ چاپی</button>'
    + '</div></div></div>';

  var totalCard = '<div class="card" style="margin-bottom:14px"><div class="card-body"><div class="row">'
    + '<div><div class="small muted">امتیازِ کلِ کارت</div>'
    + '<b style="font-size:34px;line-height:1.2;color:' + SC_BANDS[sc.band][2] + '">'
    + (sc.total === null ? '—' : fa(sc.total)) + '</b>'
    + ' <span class="badge ' + SC_BANDS[sc.band][1] + '">' + SC_BANDS[sc.band][0] + '</span></div>'
    + '<div class="spacer"></div>'
    + '<div class="small muted" style="max-width:420px;line-height:2">' + esc('امتیازِ کل = میانگینِ فقط بُعدهایی که داده دارند ('
      + String(sc.available) + ' از ۵)؛ بُعدِ بی‌داده حذف می‌شود، نه این‌که صفر گرفته شود.') + '</div>'
    + '</div></div></div>';

  var cards = '<div class="grid g2">' + sc.dims.map(function(d){
    var b = SC_BANDS[d.band];
    return '<div class="card"><div class="card-head"><h3>' + esc(d.title) + '</h3>'
      + '<div class="row" style="gap:6px">' + (d.label ? '<span class="small muted">' + esc(d.label) + '</span>' : '')
      + '<span class="badge ' + b[1] + '">' + (d.score === null ? b[0] : fa(d.score)) + '</span></div></div>'
      + '<div class="card-body">'
      + (d.parts.length ? '<table class="table"><tbody>' + d.parts.map(function(p){
          return '<tr><td class="small">' + esc(p[0]) + '</td><td><b>' + esc(p[1]) + '</b></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="small muted">شاخصی برای این بُعد محاسبه نشد.</div>')
      + '<div class="small muted" style="margin-top:6px;line-height:1.9">' + esc(d.note || '') + '</div>'
      + '</div></div>';
  }).join('') + '</div>';

  var method = '<div class="card" style="margin-top:14px"><div class="card-head"><h3>روش‌شناسی و پوششِ داده</h3>'
    + '<span class="badge b-gray">' + fa(sc.available) + ' از ۵ بُعد دارای داده</span></div>'
    + '<div class="card-body"><div class="table-wrap"><table class="table"><thead><tr>'
    + '<th>بُعد</th><th>مدارسِ دارای داده</th><th>وضعیت</th></tr></thead><tbody>'
    + sc.dims.map(function(d){
        return '<tr><td><b>' + esc(d.title) + '</b></td><td>' + fa(d.coverage || 0) + ' از ' + fa(sc.schools) + '</td>'
          + '<td>' + (d.score === null ? '<span class="badge b-gray">بی‌داده</span>' : '<span class="badge b-green">محاسبه‌شده</span>') + '</td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div class="small muted" style="margin-top:8px;line-height:2">' + esc(
        'آستانهٔ باندها: ۷۵ به بالا «خوب»، ۵۰ تا ۷۴ «نیازمندِ توجه»، کمتر از ۵۰ «بحرانی» (بُعدِ رشد استثناست: '
      + 'باندش از جهتِ تغییرِ میانگین می‌آید: بیش از ۰.۳+ روبه‌رشد، کمتر از ۰.۳− نزولی، در غیر این صورت تقریباً ثابت). '
      + 'بازه‌ها: ثبتِ حضور ۳۰ روز و صورتجلسه ۱۲۰ روزِ گذشته · رشد = بزرگ‌ترین نوبتِ موجود در برابرِ نوبتِ پیش از آن · '
      + 'مالی فقط نرخِ وصول است و هیچ مبلغی در گزارش نیست. این صفحه فقط می‌خواند و چیزی در پایگاه داده تغییر نمی‌دهد.')
    + '</div></div></div>';

  return head + totalCard + cards + method;
}

/* ═══════════════════ خروجیِ چاپی (قابل‌ارائه به استان) ═══════════════════ */
/** رشتهٔ HTMLِ کامل و مستقل — آزمون‌پذیر بدون نیاز به window.open */
function officeScorecardPrintHTML(sc){
  var b = SC_BANDS[sc.band];
  var rows = sc.dims.map(function(d){
    var db2 = SC_BANDS[d.band];
    return '<tr><td><b>' + esc(d.title) + '</b></td>'
      + '<td style="text-align:center;color:' + db2[2] + '"><b>' + (d.score === null ? '—' : fa(d.score)) + '</b></td>'
      + '<td style="text-align:center">' + esc(d.label ? d.label : db2[0]) + '</td>'
      + '<td class="small">' + (d.parts.length
          ? esc(d.parts.map(function(p){ return p[0] + ': ' + p[1]; }).join(' · '))
          : '—') + '</td>'
      + '<td class="small muted">' + esc(d.note || '') + '</td></tr>';
  }).join('');
  return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
    + '<title>کارتِ امتیازی — ' + esc(sc.office_name) + '</title>'
    + '<style>'
    + 'body{font-family:Vazirmatn,Tahoma,Arial;padding:24px;color:#0f172a;line-height:1.9}'
    + 'h1{font-size:20px;margin:0 0 2px;color:#1668f0}h2{font-size:15px;margin:22px 0 6px}'
    + '.sub{font-size:12.5px;color:#556}'
    + 'table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}'
    + 'th,td{border:1px solid #cbd5e1;padding:7px;text-align:right;vertical-align:top}'
    + 'th{background:#eff6ff}tr:nth-child(even) td{background:#fafcff}'
    + '.tot{font-size:15px;margin-top:6px}'
    + '.foot{margin-top:18px;font-size:11.5px;color:#667;border-top:1px solid #e2e8f0;padding-top:8px}'
    + '@media print{.np{display:none}body{padding:0}}'
    + '</style></head><body>'
    + '<h1>کارتِ امتیازیِ ' + esc(sc.office_level) + ' — ' + esc(sc.office_name) + '</h1>'
    + '<div class="sub">' + esc(jalali(sc.date)) + ' · ' + fa(sc.schools) + ' مدرسهٔ تحتِ پوشش · '
    + 'تولیدِ خودکارِ سامانهٔ پایش</div>'
    + '<div class="tot">امتیازِ کل: <b style="color:' + b[2] + '">' + (sc.total === null ? '—' : fa(sc.total))
    + '</b> — ' + esc(b[0]) + ' <span class="sub">(' + fa(sc.available) + ' بُعد از ۵ دارای داده)</span></div>'
    + '<h2>پنج بُعدِ کارتِ امتیازی</h2>'
    + '<table><thead><tr><th>بُعد</th><th>امتیاز</th><th>وضعیت</th><th>شاخص‌ها</th><th>توضیح</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>'
    + '<h2>پوششِ داده</h2>'
    + '<table><thead><tr><th>بُعد</th><th>مدارسِ دارای داده</th><th>وضعیت</th></tr></thead><tbody>'
    + sc.dims.map(function(d){
        return '<tr><td>' + esc(d.title) + '</td><td>' + fa(d.coverage || 0) + ' از ' + fa(sc.schools) + '</td>'
          + '<td>' + (d.score === null ? 'بی‌داده' : 'محاسبه‌شده') + '</td></tr>';
      }).join('')
    + '</tbody></table>'
    + '<div class="foot">' + esc('این گزارش فقط دادهٔ تجمیعیِ محدوده است: نام و وضعیتِ هیچ دانش‌آموز، '
      + 'خانواده یا مبلغِ شهریه‌ای در آن نیست. امتیازِ کل میانگینِ بُعدهایِ دارای داده است و بُعدِ بی‌داده حذف می‌شود.')
    + '</div>'
    + '<div class="np" style="text-align:center;margin-top:14px"><button onclick="window.print()" '
    + 'style="padding:9px 22px;border:none;border-radius:8px;background:#1668f0;color:#fff;font-family:inherit;cursor:pointer">'
    + '🖨️ چاپ / ذخیرهٔ PDF</button></div>'
    + '</body></html>';
}

/* اکشنِ چاپ — تنها جایی که پنجره باز می‌شود (هم‌الگوی office-print) */
var SC_ACTIONS = {
  'office-score-print'(){
    var o = (typeof officeOf === 'function') ? officeOf(S.user) : null;
    var schools = (typeof officeScopeSchools === 'function') ? officeScopeSchools(o) : [];
    var html = officeScorecardPrintHTML(officeScorecard(o, schools));
    var w = window.open('', '_blank');
    if(!w){ toast('اجازهٔ باز کردنِ پنجره داده نشد', 'err'); return; }
    w.document.write(html);
    w.document.close();
  }
};

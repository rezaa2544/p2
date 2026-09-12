/* ═══════════════════════════════════════════════════════════════════
   گزارش‌های پیشرفته (موج ۲۳ — گزارش‌دهی استاندارد وزارتی)
   ───────────────────────────────────────────────────────────────────
   چهار گزارش رسمی برای مدیر مدرسه / کارشناس اداره / سوپرادمین:
     ۱. حضور و غیاب ماهانه — به تفکیک کلاس (+نرخ حضور)
     ۲. پیشرفت تحصیلی — میانگین بر مقیاس ۲۰، نرخ قبولی، روند و توصیه
     ۳. مالی مدارس شهریه‌دار (شاهد/غیرانتفاعی/…) — شهریه/تخفیف/اقساط/بورسیه
     ۴. عملکرد معلمان — حضور کادر + جانشینی + دوره‌های ضمن خدمت

   🔴 Offline-First: همهٔ تجمیع‌ها روی db محلی انجام می‌شود (بدون شبکه).
   خروجی‌گیری (CSV/چاپ) یک ردیف در مجموعهٔ همگام‌شوندهٔ report_logs
   ثبت می‌کند که از مسیر عادی insert → applyOp → enqueueOp عبور کرده
   و با برقراری اتصال، خودکار به سرور می‌رسد (سرور همتای همین
   تجمیع‌ها را در /api/v1/reports/* دارد — server/routes/reports.js).

   دامنهٔ دید (آینهٔ policy سرور):
     manager    → فقط مدرسهٔ خودش
     edu_office → مدارسِ هندسهٔ اداره (officeScopeSchools)
     superadmin → همهٔ مدارس
   ═══════════════════════════════════════════════════════════════════ */

const RPT_KINDS = [
  ['attendance', '✅', 'حضور و غیاب ماهانه'],
  ['academic',   '📈', 'پیشرفت تحصیلی'],
  ['finance',    '💰', 'مالی شهریه‌دار'],
  ['teachers',   '👨‍🏫', 'عملکرد معلمان']
];
const RPT_ATT_STS = ['present', 'absent', 'late', 'excused', 'early_exit'];
const RPT_ATT_FA = { present: 'حاضر', absent: 'غایب', late: 'تأخیر', excused: 'موجه', early_exit: 'خروج زودتر' };

/* وضعیت صفحه — بین renderها می‌ماند */
var RPT_STATE = null;
function rptState(){
  if (!RPT_STATE){
    var j = toJalali.apply(null, todayISO().split('-').map(Number));
    RPT_STATE = { kind: 'attendance', jy: j[0], jm: j[1], term: '' };
  }
  return RPT_STATE;
}

/** مدارس در دامنهٔ کاربر (آینهٔ scopedSchools سرور) */
function rptSchools(){
  var u = S.user;
  if (!u) return [];
  if (u.role === 'manager') return db.schools.filter(function(s){ return s.id === u.school_id; });
  if (u.role === 'edu_office'){
    var o = officeOf(u);
    return o ? officeScopeSchools(o) : [];
  }
  if (u.role === 'superadmin') return db.schools.slice();
  return [];
}

/** ماه شمسی یک تاریخ ISO — null اگر خراب */
function rptJOf(iso){
  if (!iso) return null;
  var p = String(iso).slice(0, 10).split('-').map(Number);
  if (!p[0] || !p[1] || !p[2]) return null;
  return toJalali(p[0], p[1], p[2]);
}

/* ════ ۱) حضور و غیاب ماهانه ═══════════════════════════════════════ */
function rptAttendanceData(){
  var st = rptState(), schools = rptSchools();
  var sIds = {}; schools.forEach(function(s){ sIds[s.id] = 1; });
  var classes = db.classes.filter(function(c){ return sIds[c.school_id]; });
  var byClass = {};
  db.attendance.forEach(function(r){
    if (!sIds[r.school_id]) return;
    var j = rptJOf(r.date);
    if (!j || j[0] !== st.jy || j[1] !== st.jm) return;
    var a = byClass[r.class_id];
    if (!a){ a = { present: 0, absent: 0, late: 0, excused: 0, early_exit: 0, total: 0 }; byClass[r.class_id] = a; }
    var k = RPT_ATT_STS.indexOf(r.status) > -1 ? r.status : 'absent';
    a[k]++; a.total++;
  });
  return schools.map(function(s){
    var rows = classes.filter(function(c){ return c.school_id === s.id; }).map(function(c){
      var a = byClass[c.id] || { present: 0, absent: 0, late: 0, excused: 0, early_exit: 0, total: 0 };
      var att = a.present + a.late + a.early_exit;
      return { cls: c, agg: a, rate: a.total ? Math.round(att / a.total * 1000) / 10 : null };
    });
    var t = { present: 0, absent: 0, late: 0, excused: 0, early_exit: 0, total: 0 };
    rows.forEach(function(r){ RPT_ATT_STS.concat(['total']).forEach(function(k){ t[k] += r.agg[k]; }); });
    var att = t.present + t.late + t.early_exit;
    return { school: s, rows: rows, totals: t, rate: t.total ? Math.round(att / t.total * 1000) / 10 : null };
  });
}

/* ════ ۲) پیشرفت تحصیلی ════════════════════════════════════════════ */
function rptAcademicData(){
  var st = rptState(), schools = rptSchools();
  var sIds = {}; schools.forEach(function(s){ sIds[s.id] = 1; });
  var classes = db.classes.filter(function(c){ return sIds[c.school_id]; });
  var byClass = {}, byTerm = {};
  db.grades.forEach(function(g){
    if (!sIds[g.school_id]) return;
    var mx = Number(g.max_score) || 20;
    if (mx <= 0) return;
    var v = Number(g.score) / mx * 20;
    if (!isFinite(v)) return;
    var tKey = g.school_id + '|' + (g.term || '—');
    var tr = byTerm[tKey]; if (!tr){ tr = { sum: 0, n: 0 }; byTerm[tKey] = tr; }
    tr.sum += v; tr.n++;
    if (st.term && g.term !== st.term) return;
    var r = byClass[g.class_id]; if (!r){ r = { sum: 0, n: 0, pass: 0 }; byClass[g.class_id] = r; }
    r.sum += v; r.n++;
    if (v >= 10) r.pass++;
  });
  var r1 = function(n){ return Math.round(n * 10) / 10; };
  return schools.map(function(s){
    var rows = classes.filter(function(c){ return c.school_id === s.id; }).map(function(c){
      var a = byClass[c.id] || { sum: 0, n: 0, pass: 0 };
      return { cls: c, n: a.n, avg: a.n ? r1(a.sum / a.n) : null, pass: a.n ? Math.round(a.pass / a.n * 1000) / 10 : null };
    });
    var sum = 0, n = 0;
    rows.forEach(function(r){ if (r.n){ sum += r.avg * r.n; n += r.n; } });
    var avg = n ? r1(sum / n) : null;
    var trend = [];
    for (var k in byTerm){
      var p = k.split('|');
      if (Number(p[0]) !== s.id) continue;
      trend.push({ term: p[1], avg: r1(byTerm[k].sum / byTerm[k].n), n: byTerm[k].n });
    }
    /* توصیه‌های قاعده‌محور — همان قواعد سرور */
    var recs = [];
    if (avg != null && avg < 10) recs.push('میانگین مدرسه زیر حد قبولی است؛ برنامهٔ تقویتی فوری پیشنهاد می‌شود.');
    rows.forEach(function(r){
      if (r.avg != null && r.avg < 10) recs.push('کلاس «' + r.cls.name + '» میانگین ' + r.avg + ' دارد؛ کلاس جبرانی پیشنهاد می‌شود.');
      else if (r.pass != null && r.pass < 70) recs.push('کلاس «' + r.cls.name + '» نرخ قبولی ' + r.pass + '٪ دارد؛ بازبینی روش تدریس پیشنهاد می‌شود.');
    });
    if (!recs.length && avg != null) recs.push('وضعیت تحصیلی در محدودهٔ قابل قبول است؛ روند فعلی حفظ شود.');
    return { school: s, rows: rows, avg: avg, trend: trend, recs: recs };
  });
}

/* ════ ۳) مالی مدارس شهریه‌دار ═════════════════════════════════════ */
function rptFinanceData(){
  var schools = rptSchools().filter(function(s){ return hasCap(s.id, 'has_tuition'); });
  var sIds = {}; schools.forEach(function(s){ sIds[s.id] = 1; });
  var agg = {};
  var blank = function(){ return { tu: { n: 0, total: 0, discount: 0, payable: 0, paid: 0 },
    ins: { paid: 0, pending: 0, partial: 0, canceled: 0, overdue: 0, paid_amount: 0 },
    sch: { n: 0, ok: 0 } }; };
  var today = todayISO();
  db.tuitions.forEach(function(t){
    if (!sIds[t.school_id]) return;
    var a = agg[t.school_id] || (agg[t.school_id] = blank());
    a.tu.n++; a.tu.total += Number(t.total) || 0; a.tu.discount += Number(t.discount) || 0;
    a.tu.payable += Number(t.payable) || 0; a.tu.paid += Number(t.paid) || 0;
  });
  db.installments.forEach(function(i){
    if (!sIds[i.school_id]) return;
    var a = agg[i.school_id] || (agg[i.school_id] = blank());
    var k = ['paid', 'pending', 'partial', 'canceled'].indexOf(i.status) > -1 ? i.status : 'pending';
    a.ins[k]++; a.ins.paid_amount += Number(i.paid_amount) || 0;
    if ((k === 'pending' || k === 'partial') && i.due_date && String(i.due_date) < today) a.ins.overdue++;
  });
  db.scholarships.forEach(function(sc){
    if (!sIds[sc.school_id]) return;
    var a = agg[sc.school_id] || (agg[sc.school_id] = blank());
    a.sch.n++; if (sc.status === 'approved') a.sch.ok++;
  });
  return schools.map(function(s){
    var a = agg[s.id] || blank();
    return { school: s, agg: a,
      rate: a.tu.payable ? Math.round(a.tu.paid / a.tu.payable * 1000) / 10 : null };
  });
}

/* ════ ۴) عملکرد معلمان ════════════════════════════════════════════ */
function rptTeachersData(){
  var st = rptState(), schools = rptSchools();
  return schools.map(function(s){
    /* حضور کادر از خلاصهٔ موجود (69-staff-attendance.js) */
    var rows = staffAttSummary(s.id, st.jy, st.jm).map(function(r){
      var total = r.present + r.absent + r.late;
      return { id: r.id, name: r.name, present: r.present, absent: r.absent, late: r.late,
        rate: total ? Math.round((r.present + r.late) / total * 1000) / 10 : null,
        subs: 0, trHours: 0, trDone: 0 };
    });
    var byId = {}; rows.forEach(function(r){ byId[r.id] = r; });
    db.substitutions.forEach(function(r){
      if (r.school_id !== s.id) return;
      var j = rptJOf(r.date);
      if (!j || j[0] !== st.jy || j[1] !== st.jm) return;
      if (byId[r.sub_teacher_id]) byId[r.sub_teacher_id].subs++;
    });
    db.training_courses.forEach(function(r){
      if (r.school_id !== s.id) return;
      var t = byId[r.staff_id];
      if (!t) return;
      t.trHours += Number(r.hours) || 0;
      if (r.status === 'completed' || r.status === 'done') t.trDone++;
    });
    return { school: s, rows: rows };
  });
}

/* ── ثبتِ آفلاینِ خروجی در report_logs (صف همگام‌سازی خودش می‌برد) ── */
function rptLog(format){
  var st = rptState();
  var schools = rptSchools();
  if (st.kind === 'finance') schools = schools.filter(function(s){ return hasCap(s.id, 'has_tuition'); });
  schools.forEach(function(s){
    insert('report_logs', { school_id: s.id, kind: st.kind, format: format, status: 'generated',
      generated_by: String(S.user.id), meta: { jy: st.jy, jm: st.jm, term: st.term || null },
      created_at: new Date().toISOString() });
  });
}

/* ── خروجی CSV ─────────────────────────────────────────────────── */
function rptCsvData(){
  var st = rptState();
  if (st.kind === 'attendance'){
    var rows = [];
    rptAttendanceData().forEach(function(g){
      g.rows.forEach(function(r){
        rows.push([g.school.name, r.cls.name, r.cls.grade || '', String(r.agg.present), String(r.agg.absent),
          String(r.agg.late), String(r.agg.excused), String(r.agg.early_exit), String(r.agg.total),
          r.rate == null ? '' : String(r.rate)]);
      });
    });
    return { name: 'attendance', headers: ['مدرسه', 'کلاس', 'پایه', 'حاضر', 'غایب', 'تأخیر', 'موجه', 'خروج زودتر', 'کل', 'نرخ حضور ٪'], rows: rows };
  }
  if (st.kind === 'academic'){
    var rows2 = [];
    rptAcademicData().forEach(function(g){
      g.rows.forEach(function(r){
        rows2.push([g.school.name, r.cls.name, r.cls.grade || '', String(r.n),
          r.avg == null ? '' : String(r.avg), r.pass == null ? '' : String(r.pass)]);
      });
    });
    return { name: 'academic', headers: ['مدرسه', 'کلاس', 'پایه', 'تعداد نمره', 'میانگین (از ۲۰)', 'نرخ قبولی ٪'], rows: rows2 };
  }
  if (st.kind === 'finance'){
    var rows3 = rptFinanceData().map(function(r){
      return [r.school.name, String(r.agg.tu.n), String(r.agg.tu.total), String(r.agg.tu.discount),
        String(r.agg.tu.payable), String(r.agg.tu.paid), r.rate == null ? '' : String(r.rate),
        String(r.agg.ins.paid), String(r.agg.ins.pending + r.agg.ins.partial), String(r.agg.ins.overdue),
        String(r.agg.sch.ok) + '/' + String(r.agg.sch.n)];
    });
    return { name: 'finance', headers: ['مدرسه', 'تعداد شهریه', 'جمع کل', 'تخفیف', 'قابل پرداخت', 'پرداخت‌شده', 'نرخ وصول ٪', 'اقساط پرداخت‌شده', 'اقساط باز', 'اقساط معوق', 'بورسیه (مصوب/کل)'], rows: rows3 };
  }
  var rows4 = [];
  rptTeachersData().forEach(function(g){
    g.rows.forEach(function(r){
      rows4.push([g.school.name, r.name, String(r.present), String(r.absent), String(r.late),
        r.rate == null ? '' : String(r.rate), String(r.subs), String(r.trHours), String(r.trDone)]);
    });
  });
  return { name: 'teachers', headers: ['مدرسه', 'همکار', 'حاضر', 'غایب', 'تأخیر', 'نرخ حضور ٪', 'جانشینی', 'ساعت دوره', 'دورهٔ کامل'], rows: rows4 };
}

/* ── چاپ / PDF (پنجرهٔ A4 مشترک — 33-forms-sms.js) ────────────────── */
function rptPrint(){
  var st = rptState(), d = rptCsvData();
  var kindFa = ''; RPT_KINDS.forEach(function(k){ if (k[0] === st.kind) kindFa = k[2]; });
  var body = '<table><thead><tr>' + d.headers.map(function(h){ return '<th>' + esc(h) + '</th>'; }).join('')
    + '</tr></thead><tbody>'
    + d.rows.map(function(r){ return '<tr>' + r.map(function(c, i){ return '<td' + (i > 1 ? ' class="c"' : '') + '>' + esc(faD(c)) + '</td>'; }).join('') + '</tr>'; }).join('')
    + '</tbody></table>';
  var schools = rptSchools();
  var sub = (st.kind === 'attendance' || st.kind === 'teachers')
    ? J_MONTHS[st.jm - 1] + ' ' + faD(st.jy)
    : (st.kind === 'academic' && st.term ? st.term : 'کل داده‌ها');
  var ok = printableDoc({
    title: 'گزارش ' + kindFa,
    school: schools.length === 1 ? schools[0].name : faD(schools.length) + ' مدرسه',
    subtitle: sub,
    body: body,
    note: 'این گزارش به‌صورت خودکار از سامانهٔ پایش تولید شده و مطابق تجمیع رسمی سرور است.',
    landscape: d.headers.length > 7
  });
  if (ok) rptLog('pdf');
}

/* ── نما ───────────────────────────────────────────────────────── */
function rptMonthNav(){
  var st = rptState();
  return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0 12px">'
    + '<button class="btn ghost sm" data-act="rpt-prev">→ ماه قبل</button>'
    + '<b>' + J_MONTHS[st.jm - 1] + ' ' + fa(st.jy) + '</b>'
    + '<button class="btn ghost sm" data-act="rpt-next">ماه بعد ←</button>'
    + '</div>';
}
function rptExportBar(){
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
    + '<button class="btn sm" data-act="rpt-csv">📄 خروجی CSV</button>'
    + '<button class="btn ghost sm" data-act="rpt-print">🖨️ چاپ / PDF</button>'
    + '</div>';
}

/* P0-2: نشانگرِ «دادهٔ جزئی/کهنه» — وقتی snapshot گزارشی کران‌خورده
   (partial) یا از TTL گذشته (stale) است، کاربر باید بداند اعدادِ صفحه
   ممکن است کاملِ دامنه نباشند (rptCacheStatus در 29-pull.js). */
function rptPartialBanner(){
  var st = typeof rptCacheStatus === 'function' ? rptCacheStatus() : null;
  if (!st || (!st.partial.length && !st.stale)) return '';
  var msgs = [];
  if (st.partial.length) msgs.push('این گزارش روی «دادهٔ جزئی» محاسبه شده است (کشِ مرورگر کران‌دار است: ' + st.partial.length + ' مجموعهٔ بریده‌شده)');
  if (st.stale) msgs.push('کشِ گزارشی کهنه است (بیش از ۲۴ ساعت) — برای اعدادِ قطعی همگام‌سازی کنید');
  return '<div class="card" role="status" data-rpt-partial="1" style="border-right:4px solid #d99114;margin-bottom:12px">'
    + '<div class="card-body small">⚠️ ' + msgs.join(' · ') + '</div></div>';
}

function rptViewAttendance(){
  var data = rptAttendanceData();
  return rptMonthNav() + rptExportBar() + data.map(function(g){
    if (!g.rows.length) return '';
    var trs = g.rows.map(function(r){
      return '<tr><td>' + esc(r.cls.name) + '</td><td>' + esc(r.cls.grade || '—') + '</td>'
        + '<td class="c">' + fa(r.agg.present) + '</td><td class="c">' + fa(r.agg.absent) + '</td>'
        + '<td class="c">' + fa(r.agg.late) + '</td><td class="c">' + fa(r.agg.excused) + '</td>'
        + '<td class="c">' + fa(r.agg.early_exit) + '</td><td class="c">' + fa(r.agg.total) + '</td>'
        + '<td style="min-width:120px">' + (r.rate == null ? '<span class="small">—</span>'
          : bar(r.rate, 100, r.rate >= 85 ? 'var(--ok,#1e9e63)' : (r.rate >= 70 ? '#d99114' : '#d64545')) + '<span class="small">' + fa(r.rate) + '٪</span>') + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-head"><h3>🏫 ' + esc(g.school.name) + '</h3>'
      + '<span class="small">نرخ حضور کل: ' + (g.rate == null ? '—' : fa(g.rate) + '٪') + '</span></div>'
      + '<div class="card-body"><div class="table-wrap"><table class="table">'
      + '<thead><tr><th>کلاس</th><th>پایه</th><th>حاضر</th><th>غایب</th><th>تأخیر</th><th>موجه</th><th>خروج زودتر</th><th>کل</th><th>نرخ حضور</th></tr></thead>'
      + '<tbody>' + trs + '</tbody></table></div></div></div>';
  }).join('') || empty('✅', 'داده‌ای نیست', 'برای این ماه رکورد حضوری ثبت نشده است');
}

function rptViewAcademic(){
  var st = rptState();
  var terms = ['', 'نوبت اول', 'نوبت دوم'];
  var chips = '<div class="chips" style="margin-bottom:10px">' + terms.map(function(t){
    return '<button class="btn ghost sm' + ((st.term || '') === t ? ' on' : '') + '" data-act="rpt-term" data-id="' + esc(t) + '">' + (t || 'همهٔ ترم‌ها') + '</button>';
  }).join('') + '</div>';
  var data = rptAcademicData();
  return chips + rptExportBar() + data.map(function(g){
    if (!g.rows.length) return '';
    var trs = g.rows.map(function(r){
      return '<tr><td>' + esc(r.cls.name) + '</td><td class="c">' + fa(r.n) + '</td>'
        + '<td style="min-width:120px">' + (r.avg == null ? '<span class="small">—</span>'
          : bar(r.avg, 20, r.avg >= 14 ? 'var(--ok,#1e9e63)' : (r.avg >= 10 ? '#d99114' : '#d64545')) + '<span class="small">' + fa(r.avg) + '</span>') + '</td>'
        + '<td class="c">' + (r.pass == null ? '—' : fa(r.pass) + '٪') + '</td></tr>';
    }).join('');
    var trend = g.trend.length ? '<div class="small" style="margin-top:8px">📉 روند: '
      + g.trend.map(function(t){ return esc(t.term) + ': ' + fa(t.avg); }).join(' · ') + '</div>' : '';
    var recs = g.recs.length ? '<ul class="small" style="margin:8px 0 0;padding-right:18px">'
      + g.recs.slice(0, 6).map(function(r){ return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' : '';
    return '<div class="card"><div class="card-head"><h3>🏫 ' + esc(g.school.name) + '</h3>'
      + '<span class="small">میانگین مدرسه: ' + (g.avg == null ? '—' : fa(g.avg) + ' از ۲۰') + '</span></div>'
      + '<div class="card-body"><div class="table-wrap"><table class="table">'
      + '<thead><tr><th>کلاس</th><th>تعداد نمره</th><th>میانگین (از ۲۰)</th><th>نرخ قبولی</th></tr></thead>'
      + '<tbody>' + trs + '</tbody></table></div>' + trend + recs + '</div></div>';
  }).join('') || empty('📈', 'داده‌ای نیست', 'نمره‌ای در این محدوده ثبت نشده است');
}

function rptViewFinance(){
  var data = rptFinanceData();
  if (!data.length) return empty('💰', 'مدرسهٔ شهریه‌داری در دامنهٔ شما نیست',
    'گزارش مالی فقط برای مدارس دارای قابلیت شهریه (شاهد/غیرانتفاعی و مشابه) است');
  return rptExportBar() + data.map(function(r){
    var t = r.agg.tu, i = r.agg.ins, sc = r.agg.sch;
    return '<div class="card"><div class="card-head"><h3>🏫 ' + esc(r.school.name) + '</h3>'
      + '<span class="small">نرخ وصول: ' + (r.rate == null ? '—' : fa(r.rate) + '٪') + '</span></div>'
      + '<div class="card-body">'
      + (r.rate == null ? '' : bar(r.rate, 100, r.rate >= 70 ? 'var(--ok,#1e9e63)' : (r.rate >= 40 ? '#d99114' : '#d64545')))
      + '<div class="table-wrap" style="margin-top:10px"><table class="table"><tbody>'
      + '<tr><td>تعداد پروندهٔ شهریه</td><td class="c">' + fa(t.n) + '</td></tr>'
      + '<tr><td>جمع کل شهریه</td><td class="c">' + rial(t.total) + ' ریال</td></tr>'
      + '<tr><td>تخفیف/معافیت</td><td class="c">' + rial(t.discount) + ' ریال</td></tr>'
      + '<tr><td>قابل پرداخت</td><td class="c">' + rial(t.payable) + ' ریال</td></tr>'
      + '<tr><td>پرداخت‌شده</td><td class="c">' + rial(t.paid) + ' ریال</td></tr>'
      + '<tr><td>اقساط (پرداخت‌شده / باز / معوق)</td><td class="c">' + fa(i.paid) + ' / ' + fa(i.pending + i.partial) + ' / ' + fa(i.overdue) + '</td></tr>'
      + '<tr><td>بورسیه (مصوب / کل درخواست)</td><td class="c">' + fa(sc.ok) + ' / ' + fa(sc.n) + '</td></tr>'
      + '</tbody></table></div></div></div>';
  }).join('');
}

function rptViewTeachers(){
  var data = rptTeachersData();
  return rptMonthNav() + rptExportBar() + data.map(function(g){
    if (!g.rows.length) return '';
    var trs = g.rows.map(function(r){
      return '<tr><td>' + esc(r.name) + '</td>'
        + '<td class="c">' + fa(r.present) + '</td><td class="c">' + fa(r.absent) + '</td><td class="c">' + fa(r.late) + '</td>'
        + '<td style="min-width:120px">' + (r.rate == null ? '<span class="small">—</span>'
          : bar(r.rate, 100, r.rate >= 90 ? 'var(--ok,#1e9e63)' : (r.rate >= 75 ? '#d99114' : '#d64545')) + '<span class="small">' + fa(r.rate) + '٪</span>') + '</td>'
        + '<td class="c">' + fa(r.subs) + '</td><td class="c">' + fa(r.trHours) + '</td><td class="c">' + fa(r.trDone) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-head"><h3>🏫 ' + esc(g.school.name) + '</h3></div>'
      + '<div class="card-body"><div class="table-wrap"><table class="table">'
      + '<thead><tr><th>همکار</th><th>حاضر</th><th>غایب</th><th>تأخیر</th><th>نرخ حضور</th><th>جانشینی</th><th>ساعت دوره</th><th>دورهٔ کامل</th></tr></thead>'
      + '<tbody>' + trs + '</tbody></table></div></div></div>';
  }).join('') || empty('👨‍🏫', 'داده‌ای نیست', 'برای این ماه حضوری از کادر ثبت نشده است');
}

function viewReports(){
  var st = rptState();
  var tabs = '<div class="chips" style="margin-bottom:12px">' + RPT_KINDS.map(function(k){
    return '<button class="btn ghost sm' + (st.kind === k[0] ? ' on' : '') + '" data-act="rpt-tab" data-id="' + k[0] + '">' + k[1] + ' ' + k[2] + '</button>';
  }).join('') + '</div>';
  var body = st.kind === 'attendance' ? rptViewAttendance()
    : st.kind === 'academic' ? rptViewAcademic()
    : st.kind === 'finance' ? rptViewFinance()
    : rptViewTeachers();
  return tabs + rptPartialBanner() + body;
}

const RPT_ACTIONS = {
  'rpt-tab'(el, id){ rptState().kind = id || 'attendance'; render(); },
  'rpt-term'(el, id){ rptState().term = id || ''; render(); },
  'rpt-prev'(){ var st = rptState(); st.jm--; if (st.jm < 1){ st.jm = 12; st.jy--; } render(); },
  'rpt-next'(){ var st = rptState(); st.jm++; if (st.jm > 12){ st.jm = 1; st.jy++; } render(); },
  'rpt-csv'(){
    var d = rptCsvData();
    var ok = downloadCSV('payesh-report-' + d.name + '-' + todayISO() + '.csv', d.headers, d.rows);
    if (ok) rptLog('csv');
    toast(ok ? 'فایل CSV گزارش دانلود شد' : 'خطا در ساخت فایل', ok ? 'ok' : 'err');
  },
  'rpt-print'(){ rptPrint(); }
};

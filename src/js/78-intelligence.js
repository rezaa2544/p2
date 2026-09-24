/* ═══════════════════════════════════════════════════════════════════
   ۷۸) مرکز هوشمندی مدرسه — داشبورد لایهٔ هوش (D6)
   ───────────────────────────────────────────────────────────────────
   این ماژول مصرف‌کنندهٔ کلاینتِ REST API لایهٔ هوش است. پیش از این،
   کلِ `src/js` هیچ فراخوانی به `/api/v1/analytics/*` نداشت — یعنی
   ۲۰ موتور هوشمندی روی سرور محاسبه می‌شدند و گزارش می‌دادند، ولی
   کاربر نهایی هیچ راهی برای دیدنشان در کلاینت نداشت (D6).

   🔴 دامنهٔ دید (آینهٔ policy سرور — server/routes/analytics.js):
     manager / superadmin / edu_office → شاخص سلامت مدرسه، پرچم‌های
     بحرانی و اقدامات اولویت‌دار مدیر.

   🔴 Offline-First: اگر سرور در دسترس نباشد، صفحه به‌جای شکستن، حالت
     برون‌خط/خالی نشان می‌دهد (الگوی رایجِ همین پوشه). سرور «سد نهایی»
     است و این لایه صرفاً نماست — دسترسی واقعی در ۳۰-authz و سمت سرور
     بررسی می‌شود.
   ═══════════════════════════════════════════════════════════════════ */

/* وضعیت صفحه — بین renderها می‌ماند */
var INT_STATE = null;

function intState(){
  if (!INT_STATE){
    INT_STATE = { loading: false, error: null, snapshot: null };
  }
  return INT_STATE;
}

/** مدرسه‌ای که کاربرِ فعلی مجاز به دیدنش است (scope از سمت سرور اعمال
 *  می‌شود؛ این فقط انتخاب پیش‌فرضِ کاربر است). */
function intSchoolId(){
  var u = (typeof S !== 'undefined') ? S.user : null;
  if (u && u.school_id) return u.school_id;
  /* superadmin/edu_office: اگر مدرسه‌ای در فیلتر نیست، اولین مدرسه‌ی
     دامنه را برمی‌داریم تا صفحهٔ اول خالی نباشد. */
  var schools = (typeof db !== 'undefined' && db && Array.isArray(db.schools)) ? db.schools : [];
  if (schools.length) return schools[0].id;
  return null;
}

/** سال تحصیلی جاری بر اساس تاریخ شمسی */
function intAcademicYear(){
  var j = toJalali.apply(null, todayISO().split('-').map(Number));
  var y = j[0];
  return y + '-' + String(y + 1).slice(2);
}

var INT_STATUS_FA = {
  HEALTHY: 'سالم',
  NEEDS_MONITORING: 'نیازمند پایش',
  NEEDS_ATTENTION: 'نیازمند توجه',
  NEEDS_IMMEDIATE_ACTION: 'نیازمند اقدام فوری',
  NO_DATA: 'بدون داده',
  COMPLETE: 'کامل',
  PARTIAL: 'جزئی',
  INSUFFICIENT: 'ناکافی'
};

var INT_STATUS_TONE = {
  HEALTHY: 'green',
  NEEDS_MONITORING: 'blue',
  NEEDS_ATTENTION: 'amber',
  NEEDS_IMMEDIATE_ACTION: 'red',
  NO_DATA: 'red'
};

/** بارگذاری شاخص سلامت مدرسه از سرور */
function intLoad(){
  var st = intState();
  var sid = intSchoolId();
  if (!sid){
    st.error = 'مدرسه‌ای برای نمایش هوشمندی موجود نیست.';
    st.loading = false;
    render();
    return;
  }
  st.loading = true;
  st.error = null;
  render();
  Api.get('/api/v1/analytics/school-intelligence?school_id=' + encodeURIComponent(sid)
      + '&academic_year=' + encodeURIComponent(intAcademicYear()))
    .then(function (res){
      intState().loading = false;
      intState().snapshot = (res && res.snapshot) || null;
      render();
    })
    .catch(function (err){
      intState().loading = false;
      intState().error = (err && err.message) ? err.message : 'خطا در دریافت داده‌های هوشمندی.';
      render();
    });
}

/** کارت آماریِ کوچک با لحنِ رنگی (هم‌سبکِ ۳۵-superadmin) */
function intStatCard(emoji, value, label, tone){
  return '<div class="stat-card stat-' + tone + '">'
    + '<div class="stat-emoji">' + emoji + '</div>'
    + '<div class="stat-value">' + esc(String(value == null ? '—' : value)) + '</div>'
    + '<div class="stat-label">' + esc(label) + '</div>'
    + '</div>';
}

/** نوار وضعیتِ شاخص سلامت با توضیحِ کیفیت داده */
function intHealthPanel(hi, dq){
  if (!hi) {
    return empty('🧠', 'شاخص سلامت در دسترس نیست',
      'هنوز داده‌ای برای این مدرسه در لایهٔ هوشمندی ثبت نشده است.');
  }
  var status = hi.status || 'NO_DATA';
  var tone = INT_STATUS_TONE[status] || 'blue';
  var score = (hi.score == null) ? null : Math.round(hi.score * 10) / 10;
  var comps = hi.components || {};
  var compRows = Object.keys(comps).map(function (k){
    var v = comps[k];
    var vtxt = (v == null) ? '<span class="muted">بدون داده</span>' : fa(Math.round(v * 10) / 10);
    var vtone = (v == null) ? '' : (v >= 75 ? 'green' : v >= 50 ? 'amber' : 'red');
    return '<div class="bar-row"><span>' + esc(intDimFa(k)) + '</span>'
      + '<span class="badge ' + vtone + '">' + vtxt + '</span></div>';
  }).join('');

  var dqStatus = (dq && dq.status) || 'NO_DATA';
  var dqText = intDataQualityText(dq);

  return '<div class="card" style="margin-bottom:14px">'
    + '<div class="card-head"><h3>🧠 شاخص سلامت مدرسه</h3>'
    + '<span class="badge ' + tone + '">' + esc(INT_STATUS_FA[status] || status) + '</span></div>'
    + '<div style="font-size:34px;font-weight:800;margin:6px 0 2px">'
      + (score == null ? '<span class="muted">—</span>' : fa(score)) + '</div>'
    + '<div class="small muted" style="margin-bottom:12px">از ۱۰۰ — '
      + esc(dqText) + '</div>'
    + compRows
    + '</div>';
}

function intDimFa(k){
  return { academic: 'تحصیلی', attendance: 'حضور و غیاب', engagement: 'مشارکت',
           intervention: 'مداخله' }[k] || k;
}

function intDataQualityText(dq){
  if (!dq) return 'وضعیت داده نامشخص است.';
  var st = dq.status || 'NO_DATA';
  if (st === 'NO_DATA'){
    return 'داده‌ای برای هیچ بُعدی ثبت نشده — اعداد، حدسِ خوش‌بینانه نیستند، بلکه غایب‌اند.';
  }
  if (st === 'PARTIAL'){
    var missing = Array.isArray(dq.missing_dimensions) ? dq.missing_dimensions : [];
    return 'دادهٔ ناقص: بُعد(های) «' + missing.map(intDimFa).join('، ')
      + '» خالی‌اند. شاخص فقط روی ابعادِ موجود محاسبه شده است.';
  }
  if (st === 'INSUFFICIENT'){
    return 'دادهٔ کافی نیست — نتایج باید با احتیاط تفسیر شوند.';
  }
  return 'دادهٔ کامل — شاخص روی همهٔ ابعاد محاسبه شده است.';
}

/** پرچم‌های بحرانی و اولویت‌ها */
function intRiskPanel(risk){
  if (!risk) return '';
  var rows = (risk.top_risks || []).map(function (r){
    var lvl = r.severity || r.level || 'medium';
    var tone = lvl === 'critical' ? 'red' : lvl === 'high' ? 'amber' : 'blue';
    return '<div class="bar-row"><span>' + esc(r.title || r.label || 'خطر')
      + (r.target ? ' — <span class="muted">' + esc(r.target) + '</span>' : '') + '</span>'
      + '<span class="badge ' + tone + '">' + esc(INT_STATUS_FA[lvl] || lvl) + '</span></div>';
  }).join('');
  return '<div class="card" style="margin-bottom:14px">'
    + '<div class="card-head"><h3>🚩 پرچم‌های هوشمندی</h3></div>'
    + (rows || '<div class="small muted">پرچم بحرانی‌ای ثبت نشده است. 🎉</div>')
    + '</div>';
}

/** اقدامات اولویت‌دارِ مدیر */
function intActionPanel(actions){
  var list = Array.isArray(actions) ? actions : [];
  var rows = list.map(function (a){
    var pr = a.priority || 'medium';
    var tone = pr === 'high' || pr === 'critical' ? 'red' : pr === 'medium' ? 'amber' : 'blue';
    return '<div class="bar-row"><span>' + esc(a.title || a.action || a.recommendation || '')
      + (a.owner ? ' — <span class="muted">' + esc(a.owner) + '</span>' : '') + '</span>'
      + '<span class="badge ' + tone + '">' + esc(pr) + '</span></div>';
  }).join('');
  return '<div class="card" style="margin-bottom:14px">'
    + '<div class="card-head"><h3>🎯 اقدامات اولویت‌دار مدیر</h3></div>'
    + (rows || '<div class="small muted">اقدام بازِ اولویت‌داری نیست.</div>')
    + '</div>';
}

/** خلاصه‌های تحصیلی/حضور — هر متغیر، وقتی داده‌ای نیست null نشان می‌دهد */
function intSummaryCards(sn){
  if (!sn) return '';
  var a = sn.academic_summary || {};
  var t = sn.attendance_summary || {};
  return '<div class="grid g4" style="margin-bottom:14px">'
    + intStatCard('📊', a.average_gpa == null ? null : fa(Math.round(a.average_gpa * 10) / 10),
        'میانگین نمرات', a.average_gpa == null ? 'red' : (a.average_gpa >= 14 ? 'green' : 'amber'))
    + intStatCard('📉', a.failing_students_ratio == null ? null : fa(Math.round(a.failing_students_ratio)) + '٪',
        'نسبت دانش‌آموزان مردود', a.failing_students_ratio == null ? 'red' : (a.failing_students_ratio >= 20 ? 'red' : 'green'))
    + intStatCard('✅', t.calendar_rate == null ? null : fa(Math.round(t.calendar_rate)) + '٪',
        'نرخ حضور', t.calendar_rate == null ? 'red' : (t.calendar_rate >= 90 ? 'green' : 'amber'))
    + intStatCard('🔁', t.chronic_absence_rate == null ? null : fa(Math.round(t.chronic_absence_rate)) + '٪',
        'نرخ غیبت مزمن', t.chronic_absence_rate == null ? 'red' : (t.chronic_absence_rate >= 10 ? 'red' : 'green'))
    + '</div>';
}

/** نمایشِ اصلیِ صفحهٔ هوشمندی مدرسه */
function viewIntelligence(){
  var st = intState();
  var u = (typeof S !== 'undefined') ? S.user : null;

  var head = '<div class="page-head">'
    + '<h2>🧠 مرکز هوشمندی مدرسه</h2>'
    + '<div class="small muted">شاخص سلامت، پرچم‌های بحرانی و اقدامات اولویت‌دار — '
      + 'محاسبه‌شده توسط موتورهای هوشمندی سرور</div></div>';

  /* بارگذاریِ اولیهٔ غیرهمزمان. loading را همینجا روشن می‌کنیم تا اولین
   * نقاشی، حالتِ بارگذاری نشان دهد — نه حالتِ خالی را. */
  if (!st.loading && !st.snapshot && !st.error && !st.__started){
    st.__started = true;
    st.loading = true;
    setTimeout(intLoad, 0);
  }

  if (st.loading){
    return head + '<div class="card"><div class="small muted" style="padding:18px">'
      + 'در حال محاسبهٔ شاخص‌های هوشمندی…</div></div>';
  }

  if (st.error){
    return head + empty('🔌', 'دریافت داده‌ها ناموفق بود', esc(st.error),
      '<button class="btn" data-act="intelligence-retry">تلاش دوباره</button>');
  }

  var snap = st.snapshot || {};
  var hi = snap.health_index || null;
  var dq = (hi && hi.data_quality) || null;

  return head
    + intSummaryCards(snap)
    + intHealthPanel(hi, dq)
    + intRiskPanel(snap.risk_summary)
    + intActionPanel(snap.action_center)
    + '<div class="card"><div class="card-head"><h3>ℹ️ دربارهٔ این شاخص‌ها</h3></div>'
    + '<div class="small muted">شاخص سلامت، میانگینِ وزن‌دارِ چهار بُعدِ تحصیلی، '
      + 'حضور و غیاب، مشارکت و مداخله است. وقتی برای بُعدی داده‌ای نباشد، آن '
      + 'بُعد «بدون داده» نشان داده می‌شود و شاخص فقط روی ابعادِ موجود '
      + 'محاسبه می‌شود — هیچ‌گاه با حدسِ خوش‌بینانه پر نمی‌شود.</div></div>';
}

/* رجیستریِ اکشن‌ها — هم‌الگوی RPT_ACTIONS/TEVAL_ACTIONS در سایر ماژول‌ها
 * (به‌کمکِ typeof در 19-actions-core شناسایی می‌شود). */
var INT_ACTIONS = {
  'intelligence-retry': function (){ intState().__started = true; intLoad(); }
};

/* ═══════════════════════════════════════════════════════════════════
   بند د.۲ — کارت امتیازی منطقه (D.2)
   ───────────────────────────────────────────────────────────────────
   کارشناس اداره، مدارس تحت پوشش را با امتیاز ۰ تا ۱۰۰ در پنج بعد
   می‌بیند و اولویت بازدید را از روی بازهٔ رنگی تشخیص می‌دهد:

     مالی      ← نرخ پرداخت اقساط دانش‌آموزان مدرسه
     داخلی     ← حضور و غیاب + اشغال ظرفیت
     رشد       ← روند نمرات (نوبت دوم در برابر نوبت اول)
     رضایت     ← شکایت‌ها به ازای هر دانش‌آموز (درخواست اصلاح + انضباطی منفی)
     مدیریت    ← نسبت دانش‌آموز/دبیر + مدیر فعال + فصل امتحان منتشرشده + مانور سالانه

   قراردادها (مثل طرحِ پیش‌نویس + الگوی شاخص سلامت G.1):
   - هر بعد بدون داده = null ⇒ «داده ناکافی»، نه صفر (مدرسهٔ تازه‌تأسیس
     جریمه نمی‌شود).
   - امتیاز کل = میانگین وزنیِ فقط بعدهای موجود (بازنرمال‌شده).
   - بازه‌ها: سبز ≥۶۰ · کهربایی ≥۳۵ · قرمز <۳۵.
   - دلیل کوتاه = ضعیف‌ترین بعد موجود (برای اولویت‌بندی بازدید).
   - دامنه: دقیقاً officeScopeSchools؛ سوپرادمین همه را می‌بیند.
   - فقط‌خواندنی + خروجی CSV؛ هیچ نوشتنی ندارد.
   ═══════════════════════════════════════════════════════════════════ */

const RSCORE_DIMS = [
  ['finance',      'مالی'],
  ['internal',     'داخلی'],
  ['growth',       'رشد'],
  ['satisfaction', 'رضایت'],
  ['management',   'مدیریت']
];
const RSCORE_WEIGHTS = { finance: 0.20, internal: 0.25, growth: 0.20, satisfaction: 0.15, management: 0.20 };
const RSCORE_GREEN = 60, RSCORE_AMBER = 35;

const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

/**
 * بعد مالی: نسبت اقساط پرداخت‌شدهٔ دانش‌آموزان مدرسه.
 * بدون قسط = داده ناکافی (null).
 */
function dimFinance(schoolId, IX){
  const kids = IX.studentsBySchool[schoolId] || [];
  if(!kids.length) return null;
  const kidSet = new Set(kids);
  let total = 0, paid = 0;
  (db.installments || []).forEach(function(i){
    if(!kidSet.has(i.student_id)) return;
    total++;
    if(i.paid || i.status === 'paid') paid++;
  });
  if(!total) return null;
  return clamp100(paid / total * 100);
}

/**
 * بعد داخلی: حضور (۶۰٪) + اشغال ظرفیت (۴۰٪) — هرکدام نبود، سهمش حذف می‌شود.
 */
function dimInternal(s, IX){
  const parts = [];
  const att = IX.attBySchool[s.id];
  if(att && att.total){
    parts.push([att.present / att.total * 100, 0.6]);
  }
  if(s.capacity){
    const n = (IX.studentsBySchool[s.id] || []).length;
    parts.push([Math.min(100, n / s.capacity * 100), 0.4]);
  }
  if(!parts.length) return null;
  const w = parts.reduce(function(a, p){ return a + p[1]; }, 0);
  return clamp100(parts.reduce(function(a, p){ return a + p[0] * p[1]; }, 0) / w);
}

/**
 * بعد رشد: روند نمرات مدرسه.
 * ترجیحاً نوبت دوم در برابر نوبت اول؛ وگرنه نیمهٔ دومِ زمانی در برابر نیمهٔ اول.
 * امتیاز = ۵۰ + دلتا×۵ (بدون تغییر = ۵۰؛ هر نمره رشد = ۵ امتیاز).
 */
function dimGrowth(schoolId, IX){
  const gs = (IX.gradesBySchool[schoolId] || []).filter(function(g){ return typeof g.score === 'number'; });
  if(gs.length < 4) return null; /* روند با دادهٔ کم معنا ندارد */
  const t1 = gs.filter(function(g){ return String(g.term || '').indexOf('نوبت اول') > -1; });
  const t2 = gs.filter(function(g){ return String(g.term || '').indexOf('نوبت دوم') > -1; });
  let a = null, b = null;
  const avg = (arr) => arr.length ? arr.reduce(function(x, g){ return x + g.score; }, 0) / arr.length : null;
  if(t1.length && t2.length){ a = avg(t1); b = avg(t2); }
  else {
    const sorted = gs.slice().sort(function(x, y){ return String(x.date || '').localeCompare(String(y.date || '')); });
    const half = Math.floor(sorted.length / 2);
    if(half >= 2){ a = avg(sorted.slice(0, half)); b = avg(sorted.slice(half)); }
  }
  if(a == null || b == null) return null;
  return clamp100(50 + (b - a) * 5);
}

/**
 * بعد رضایت: ۱۰۰ منهای شکایت به ازای هر دانش‌آموز (ضریب ۲۰۰).
 * شکایت = درخواست اصلاح اولیا + موارد انضباطی منفی.
 */
function dimSatisfaction(schoolId, IX){
  const kids = (IX.studentsBySchool[schoolId] || []).length;
  if(!kids) return null;
  const complaints = (IX.correctionsBySchool[schoolId] || []).length
    + (IX.discNegBySchool[schoolId] || []).length;
  return clamp100(100 - complaints / kids * 200);
}

/**
 * بعد مدیریت: نسبت دانش‌آموز/دبیر (۵۰٪) + نشانه‌های ادارهٔ مدرسه (۵۰٪):
 * مدیر فعال، فصل امتحان منتشرشده، مانور ایمنی سالانه.
 */
function dimManagement(s, IX){
  const teachers = (IX.teachersBySchool[s.id] || []).length;
  const students = (IX.studentsBySchool[s.id] || []).length;
  if(!teachers || !students) return null;
  const ratio = students / teachers;
  const ratioScore = ratio <= 25 ? 100 : (ratio >= 45 ? 0 : 100 - (ratio - 25) * 5);
  let ops = 0;
  if((db.users || []).some(function(u){ return u.role === 'manager' && u.school_id === s.id && u.active; })) ops++;
  if((db.exam_terms || []).some(function(t){ return t.school_id === s.id && t.status === 'published'; })) ops++;
  if(typeof drillAnnualStatus === 'function' && drillAnnualStatus(s.id).done) ops++;
  return clamp100(ratioScore * 0.5 + ops / 3 * 100 * 0.5);
}

/** ایندکس‌های یک‌بارمصرف برای محاسبهٔ دسته‌ای — از مسیر رندر خارج است */
function rscoreIndex(){
  const IX = { studentsBySchool: {}, teachersBySchool: {}, attBySchool: {},
    gradesBySchool: {}, correctionsBySchool: {}, discNegBySchool: {} };
  (db.users || []).forEach(function(u){
    if(u.school_id == null) return;
    if(u.role === 'student'){ (IX.studentsBySchool[u.school_id] = IX.studentsBySchool[u.school_id] || []).push(u.id); }
    if(u.role === 'teacher'){ (IX.teachersBySchool[u.school_id] = IX.teachersBySchool[u.school_id] || []).push(u.id); }
  });
  (db.attendance || []).forEach(function(a){
    const x = IX.attBySchool[a.school_id] = IX.attBySchool[a.school_id] || { total: 0, present: 0 };
    x.total++; if(a.status === 'present') x.present++;
  });
  (db.grades || []).forEach(function(g){
    (IX.gradesBySchool[g.school_id] = IX.gradesBySchool[g.school_id] || []).push(g);
  });
  (db.corrections || []).forEach(function(c){
    (IX.correctionsBySchool[c.school_id] = IX.correctionsBySchool[c.school_id] || []).push(c);
  });
  (db.discipline || []).forEach(function(d){
    if(d.kind === 'positive') return;
    (IX.discNegBySchool[d.school_id] = IX.discNegBySchool[d.school_id] || []).push(d);
  });
  return IX;
}

/** امتیاز کامل یک مدرسه — خروجی: {dims, score, band, reason, missing} */
function schoolScoreRow(s, IX){
  const dims = {
    finance: dimFinance(s.id, IX),
    internal: dimInternal(s, IX),
    growth: dimGrowth(s.id, IX),
    satisfaction: dimSatisfaction(s.id, IX),
    management: dimManagement(s, IX)
  };
  let sum = 0, wsum = 0, worst = null;
  RSCORE_DIMS.forEach(function(d){
    const v = dims[d[0]];
    if(v == null) return;
    sum += v * RSCORE_WEIGHTS[d[0]];
    wsum += RSCORE_WEIGHTS[d[0]];
    if(!worst || v < worst.v) worst = { k: d[0], label: d[1], v: v };
  });
  if(!wsum) return { s: s, dims: dims, score: null, band: 'nodata', reason: '', missing: RSCORE_DIMS.map(function(d){ return d[1]; }) };
  const score = Math.round(sum / wsum * 10) / 10;
  const band = score >= RSCORE_GREEN ? 'green' : (score >= RSCORE_AMBER ? 'amber' : 'red');
  const missing = RSCORE_DIMS.filter(function(d){ return dims[d[0]] == null; }).map(function(d){ return d[1]; });
  return { s: s, dims: dims, score: score, band: band, reason: worst ? ('ضعف در ' + worst.label) : '', missing: missing };
}

/** ردیف‌های امتیازی محدوده — مرتب: امتیاز نزولی، ناکافی‌ها آخر */
function regionScoreRows(schools){
  const IX = rscoreIndex();
  return schools.map(function(s){ return schoolScoreRow(s, IX); })
    .sort(function(a, b){
      if(a.score == null && b.score == null) return 0;
      if(a.score == null) return 1;
      if(b.score == null) return -1;
      return b.score - a.score;
    });
}

const RSCORE_BAND_FA = { green: 'سبز', amber: 'کهربایی', red: 'قرمز', nodata: 'داده ناکافی' };
const RSCORE_BADGE = { green: 'b-green', amber: 'b-amber', red: 'b-red', nodata: 'b-gray' };

/* ─────────────── نما ─────────────── */
function viewRegionScore(){
  const u = S.user;
  const isSuper = u.role === 'superadmin';
  if(u.role !== 'edu_office' && !isSuper) return viewForbidden();
  const o = officeOf(u);
  const schools = officeScopeSchools(o, S.filters);
  const rows = regionScoreRows(schools);
  const cnt = { green: 0, amber: 0, red: 0, nodata: 0 };
  rows.forEach(function(r){ cnt[r.band]++; });
  /* فیلترهای درون‌محدوده (الگوی داشبورد اداره) */
  const provinces = isSuper ? db.provinces : db.provinces.filter(function(p){ return !o || !o.province_id || p.id === o.province_id; });
  const counties = db.counties.filter(function(c){
    return (!S.filters.province || c.province_id === Number(S.filters.province))
      && (!o || !o.county_id || c.id === o.county_id)
      && (!o || !o.province_id || c.province_id === o.province_id);
  });
  const dimCell = (v) => v == null ? '<span class="small muted" title="داده ناکافی">—</span>' : `<b class="small">${fa(v)}</b>`;
  return `<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--primary-soft),#fff)">
    <div class="card-body"><div class="row">
      <div><b style="font-size:15px">🎯 کارت امتیازی ${o ? esc(o.name) : 'کل کشور'}</b>
        <div class="small muted">امتیاز ۰ تا ۱۰۰ در ۵ بعد · بازه: سبز ≥۶۰ · کهربایی ≥۳۵ · قرمز &lt;۳۵ · «—» یعنی داده ناکافی نه صفر</div></div>
      <div class="spacer"></div>
      <button class="btn ghost sm" data-act="rscore-csv">⬇️ خروجی CSV</button></div>
      ${filterPanel('regionscore', `
        <select class="select" style="width:150px" data-f="province"><option value="">همه استان‌ها</option>
          ${provinces.map(function(p){ return `<option value="${escAttr(p.id)}" ${String(S.filters.province) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`; }).join('')}</select>
        <select class="select" style="width:150px" data-f="county"><option value="">همه شهرستان‌ها</option>
          ${counties.map(function(c){ return `<option value="${escAttr(c.id)}" ${String(S.filters.county) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`; }).join('')}</select>`)}
    </div></div>
  <div class="grid g4" style="margin-bottom:14px">
    ${statCard('🟢', fa(cnt.green), 'مدرسه سبز', 'green')}
    ${statCard('🟠', fa(cnt.amber), 'مدرسه کهربایی', 'amber')}
    ${statCard('🔴', fa(cnt.red), 'مدرسه قرمز', 'red')}
    ${statCard('⚪', fa(cnt.nodata), 'داده ناکافی', 'blue')}</div>
  <div class="card"><div class="card-head"><h3>امتیاز مدارس محدوده</h3>
    <span class="badge b-gray">${fa(rows.length)} مدرسه</span></div>
  ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>
    <th>#</th><th>مدرسه</th><th>شهرستان</th>
    ${RSCORE_DIMS.map(function(d){ return `<th class="small">${esc(d[1])}</th>`; }).join('')}
    <th>امتیاز کل</th><th>بازه</th><th>سیگنال اصلی</th></tr></thead><tbody>
    ${rows.map(function(r, i){
      return `<tr><td>${fa(i + 1)}</td>
        <td><b>${esc(r.s.name)}</b><div class="small muted">${esc(r.s.level || '')}</div></td>
        <td class="small">${esc((byId('counties', r.s.county_id) || {}).name || '—')}</td>
        ${RSCORE_DIMS.map(function(d){ return `<td>${dimCell(r.dims[d[0]])}</td>`; }).join('')}
        <td><b style="font-size:15px">${r.score == null ? '<span class="small muted">داده ناکافی</span>' : fa(r.score)}</b></td>
        <td><span class="badge ${RSCORE_BADGE[r.band]}">${RSCORE_BAND_FA[r.band]}</span></td>
        <td class="small">${esc(r.reason || (r.band === 'nodata' ? 'نیازمند ثبت داده' : 'وضع مناسب'))}</td></tr>`;
    }).join('')}
  </tbody></table></div>` : empty('🎯', 'مدرسه‌ای در این محدوده نیست', '')}</div>`;
}

/* ─────────────── خروجی CSV ─────────────── */
function regionScoreCsvData(){
  const u = S.user || {};
  const o = u.role === 'superadmin' ? null : officeOf(u || {});
  const schools = officeScopeSchools(o, S.filters);
  const rows = regionScoreRows(schools);
  const headers = ['مدرسه', 'شهرستان', 'مقطع', 'امتیاز کل', 'بازه']
    .concat(RSCORE_DIMS.map(function(d){ return d[1]; }))
    .concat(['سیگنال اصلی', 'ابعاد بدون داده']);
  const lines = rows.map(function(r){
    return [r.s.name, (byId('counties', r.s.county_id) || {}).name || '', r.s.level || '',
      r.score == null ? '' : String(r.score), RSCORE_BAND_FA[r.band]]
      .concat(RSCORE_DIMS.map(function(d){ return r.dims[d[0]] == null ? '' : String(r.dims[d[0]]); }))
      .concat([r.reason || '', r.missing.join('؛ ')]);
  });
  return { headers: headers, rows: lines };
}

const REGION_ACTIONS = {
  'rscore-csv'(){
    const d = regionScoreCsvData();
    const ok = downloadCSV('payesh-region-scorecard-' + todayISO() + '.csv', d.headers, d.rows);
    toast(ok ? 'فایل CSV کارت امتیازی دانلود شد' : 'خطا در ساخت فایل', ok ? 'ok' : 'err');
  }
};

/* ═══════════════════════════════════════════════════════════════════
   بند ب.۳ — ارزشیابی ناشناس معلم (P1 کیفیت آموزشی)
   ───────────────────────────────────────────────────────────────────
   دانش‌آموز و ولی، معلم‌های مدرسهٔ خود را با ۵ معیار ثابت + متن آزاد
   ارزشیابی می‌کنند؛ مدیر و اداره نتیجهٔ **تجمیعی** را می‌بینند.

   🔒 قرارداد ناشناسی (غیرقابل چشم‌پوشی):
   ۱. رکورد فقط مدرسه، معلم، معیارها، متن و تاریخ دارد — هیچ فیلد
      هویتی (created_by/author/…) در مدل تعریف نشده و این ماژول هرگز
      چنین فیلدی نمی‌نویسد؛ دروازهٔ فیلد سرور هم هر فیلد ناشناخته را
      رد می‌کند ⇒ حتی کلاینت دستکاری‌شده نمی‌تواند هویت ذخیره کند.
   ۲. سرور در مسیر موفقِ همگام‌سازی هیچ ممیزی‌ای از نویسنده ثبت
      نمی‌کند و رکورد را همان‌گونه که آمده ذخیره می‌کند.
   ۳. دفترچهٔ محلیِ همگام‌سازی فقط روی دستگاه خودِ پاسخ‌دهنده است و
      پس از اعمال پاک می‌شود — برای هیچ کاربر دیگری قابل مشاهده نیست.
   ۴. نتایج فقط تجمیعی نمایش می‌شود (تعداد + میانگین + متن آزاد)؛
      هیچ نما و لاگی نام پاسخ‌دهنده را نشان نمی‌دهد.

   ⚠️ محدودیت ذاتی: چون هویت ذخیره نمی‌شود، جلوگیری فنی از ثبتِ
   چندبارهٔ همان پاسخ بدون شکستن ناشناسی ممکن نیست؛ این در متن نما
   به کاربر گفته می‌شود و در آمار با «تعداد پاسخ» شفاف است.
   ═══════════════════════════════════════════════════════════════════ */

/** معیارهای پنج‌گانه — کلید ثابت (معیارِ ذخیره‌شده) + برچسب فارسی */
const TEVAL_CRITERIA = [
  ['mastery',  'تسلط بر محتوای درس'],
  ['behavior', 'برختر محترمانه با دانش‌آموز'],
  ['discipline','نظم و وقت‌شناسی'],
  ['feedback', 'تکالیف و بازخورد'],
  ['fairness', 'عدالت در نمره‌دهی']
];
const TEVAL_MAX_FEEDBACK = 500;
const TEVAL_LABEL = 'ارزشیابی ناشناس';

/** مدارسِ پاسخ‌دهنده: دانش‌آموز → مدرسهٔ خودش؛ ولی → مدرسهٔ فرزندان */
function tevalSchoolIdsFor(u){
  if(!u) return [];
  if(u.role === 'student') return u.school_id != null ? [u.school_id] : [];
  if(u.role === 'parent'){
    const kids = (db.parent_links || []).filter(function(l){ return l.parent_id === u.id; })
      .map(function(l){ return (byId('users', l.student_id) || {}).school_id; })
      .filter(function(x){ return x != null; });
    return [...new Set(kids)];
  }
  return [];
}

/** دبیرانِ مدارسِ پاسخ‌دهنده (اصلی + چندمدرسه‌ای از طریق teacher_schools) */
function tevalTeachersFor(u){
  const sids = new Set(tevalSchoolIdsFor(u));
  if(!sids.size) return [];
  const out = [];
  (db.users || []).forEach(function(t){
    if(t.role !== 'teacher') return;
    const main = sids.has(t.school_id);
    const linked = (db.teacher_schools || []).some(function(x){
      return x.teacher_id === t.id && sids.has(x.school_id) && x.active;
    });
    if(main || linked) out.push(t);
  });
  return out.sort(function(a, b){ return (a.full_name || '').localeCompare(b.full_name || '', 'fa'); });
}

/** آیا معلمِ داده‌شده واقعاً در مدرسهٔ کاربر پاسخ‌دهنده تدریس می‌کند؟ */
function tevalTeacherAllowed(u, teacherId){
  return tevalTeachersFor(u).some(function(t){ return t.id === teacherId; });
}

/* ─────────────── تجمیع (خالص — بدون دسترسی به نقش) ───────────────
   ورودی: فهرست شناسهٔ مدارس (یا null = همه) و شناسهٔ دبیر (اختیاری)
   خروجی: نگاشت teacher_id → {teacher, school_id, n, sums, avgs, overall, feedbacks} */
function evalAggregate(schoolIds, teacherId){
  const scope = schoolIds ? new Set(schoolIds) : null;
  const out = {};
  (db.teacher_evaluations || []).forEach(function(ev){
    if(scope && !scope.has(ev.school_id)) return;
    if(teacherId != null && ev.teacher_id !== teacherId) return;
    const t = byId('users', ev.teacher_id);
    if(!t) return;
    let row = out[ev.teacher_id];
    if(!row){
      row = { teacher: t, school_id: ev.school_id, n: 0, sums: {}, feedbacks: [] };
      TEVAL_CRITERIA.forEach(function(c){ row.sums[c[0]] = 0; });
      out[ev.teacher_id] = row;
    }
    row.n++;
    const cr = ev.criteria || {};
    TEVAL_CRITERIA.forEach(function(c){
      const v = Number(cr[c[0]]);
      if(v >= 1 && v <= 5) row.sums[c[0]] += v;
    });
    if(ev.feedback && String(ev.feedback).trim())
      row.feedbacks.push({ text: String(ev.feedback).trim(), date: (ev.created_at || '').slice(0, 10) });
  });
  Object.keys(out).forEach(function(k){
    const r = out[k];
    r.avgs = {};
    let tot = 0, have = 0;
    TEVAL_CRITERIA.forEach(function(c){
      r.avgs[c[0]] = r.n ? Math.round(r.sums[c[0]] / r.n * 100) / 100 : 0;
      if(r.n){ tot += r.avgs[c[0]]; have++; }
    });
    r.overall = have ? Math.round(tot / have * 100) / 100 : 0;
    r.feedbacks.sort(function(a, b){ return (b.date || '').localeCompare(a.date || ''); });
  });
  return out;
}

/** وضعیتِ فرمِ پاسخِ فعلی در فیلترها (بين رندرها حفظ می‌شود) */
function tevalState(){
  if(!S.filters._teval) S.filters._teval = { tid: 0, rates: {} };
  return S.filters._teval;
}

/* ─────────────── نما: فرم پاسخ (دانش‌آموز / ولی) ─────────────── */
function viewTeachEvalForm(u){
  const teachers = tevalTeachersFor(u);
  const st = tevalState();
  const done = Object.keys(st.rates).filter(function(k){ return st.rates[k] > 0; }).length;
  return `<div class="card"><div class="card-head"><h3>🌟 ${TEVAL_LABEL} معلم</h3>
    <span class="badge b-green">🔒 کاملاً ناشناس</span></div>
  <div class="card-body">
    <div class="small" style="background:var(--green-soft);padding:10px 12px;border-radius:10px;line-height:2;margin-bottom:12px">
      🔒 پاسخ شما <b>بدون نام و نشان</b> ثبت می‌شود؛ هیچ‌جا (نه در پایگاه داده، نه در
      گزارش‌ها) نام پاسخ‌دهنده ذخیره یا نمایش داده نمی‌شود. چون هویتی ذخیره نمی‌شود،
      امکان ثبت دوبارهٔ یک نظر وجود دارد — لطفاً هر معلم را فقط یک بار ارزشیابی کنید.</div>
    ${teachers.length ? `
    ${f('دبیر موردنظر *', sel('ev_teacher', teachers.map(function(t){ return [t.id, t.full_name]; }), st.tid || ''))}
    <div style="display:grid;gap:10px;margin-top:10px">
      ${TEVAL_CRITERIA.map(function(c){
        const v = st.rates[c[0]] || 0;
        return `<div class="row" style="justify-content:space-between;background:var(--surface-2);padding:10px 12px;border-radius:10px">
          <span class="small"><b>${esc(c[1])}</b></span>
          <span class="row" style="gap:4px">${[1,2,3,4,5].map(function(i){
            return `<button class="icon-btn" title="${fa(i)} از ۵" data-act="eval-rate" data-c="${escAttr(c[0])}" data-v="${i}"
              style="font-size:18px;${i <= v ? '' : 'opacity:.35;filter:grayscale(1)'}">⭐</button>`;
          }).join('')}</span></div>`;
      }).join('')}
    </div>
    ${f('توضیح آزاد (اختیاری — بدون نام)', `<textarea class="input" id="ev_feedback" rows="3" maxlength="${TEVAL_MAX_FEEDBACK}" placeholder="هر نکته‌ای که به بهبود آموزش کمک می‌کند…">${esc(st.fb || '')}</textarea>`)}
    <div class="row" style="margin-top:12px">
      <button class="btn" data-act="eval-save">✅ ثبت ارزشیابی ناشناس</button>
      <span class="small muted">${fa(done)} از ${fa(TEVAL_CRITERIA.length)} معیار امتیاز گرفته</span>
    </div>` : empty('👨‍🏫', 'دبیری برای ارزشیابی نیست', 'مدرسهٔ شما هنوز دبیر ثبت‌شده ندارد.')}
  </div></div>`;
}

/* ─────────────── نما: نتایج تجمیعی (مدیر / اداره / سوپرادمین) ─────────────── */
function viewTeachEvalResults(u){
  const isOffice = u.role === 'edu_office';
  const o = isOffice ? officeOf(u) : null;
  const schools = isOffice ? officeScopeSchools(o, S.filters)
    : (u.role === 'superadmin' ? db.schools : db.schools.filter(function(s){ return s.id === u.school_id; }));
  const rows = Object.values(evalAggregate(schools.map(function(s){ return s.id; })))
    .sort(function(a, b){ return b.n - a.n || a.teacher.full_name.localeCompare(b.teacher.full_name, 'fa'); });
  const total = rows.reduce(function(s, r){ return s + r.n; }, 0);
  return `<div class="grid g3" style="margin-bottom:14px">
    ${statCard('🌟', fa(total), 'پاسخ دریافتی', 'blue')}
    ${statCard('👨‍🏫', fa(rows.length), 'دبیر ارزشیابی‌شده', 'green')}
    ${statCard('🏫', fa(schools.length), 'مدرسه در محدوده', 'purple')}</div>
  <div class="card"><div class="card-head"><h3>نتیجهٔ تجمیعی ارزشیابی — بدون نام پاسخ‌دهنده</h3>
    <span class="badge b-green">🔒 ناشناس</span></div>
  ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>
    <th>دبیر</th>${isOffice ? '<th>مدرسه</th>' : ''}<th>پاسخ‌ها</th>
    ${TEVAL_CRITERIA.map(function(c){ return `<th class="small">${esc(c[1])}</th>`; }).join('')}
    <th>میانگین کل</th></tr></thead><tbody>
    ${rows.map(function(r){
      return `<tr><td><b>${esc(r.teacher.full_name)}</b></td>
        ${isOffice ? `<td class="small">${esc((byId('schools', r.school_id) || {}).name || '—')}</td>` : ''}
        <td><span class="badge ${r.n >= 5 ? 'b-green' : 'b-amber'}">${fa(r.n)}</span></td>
        ${TEVAL_CRITERIA.map(function(c){ const v = r.avgs[c[0]];
          return `<td>${bar(v, 5, v >= 4 ? 'var(--green)' : (v >= 3 ? 'var(--amber)' : 'var(--red)'))}<span class="small">${fa(v)}</span></td>`; }).join('')}
        <td><b style="font-size:15px">${fa(r.overall)}</b> <span class="small muted">از ۵</span></td></tr>`;
    }).join('')}
  </tbody></table></div>` : empty('🌟', 'هنوز پاسخی ثبت نشده', 'نتایج به‌صورت تجمیعی و ناشناس اینجا نمایش داده می‌شود.')}
  ${rows.some(function(r){ return r.feedbacks.length; }) ? `
  <div class="card-head" style="border-top:1px solid var(--border)"><h3>💬 بازخوردهای آزاد (بدون نام)</h3></div>
  <div class="card-body" style="display:grid;gap:8px">
    ${rows.map(function(r){ return r.feedbacks.slice(0, 5).map(function(fb){
      return `<div style="background:var(--surface-2);padding:10px 12px;border-radius:10px">
        <span class="small">${esc(fb.text)}</span>
        <div class="small muted" style="margin-top:4px">👨‍🏫 ${esc(r.teacher.full_name)} · 📅 ${fb.date ? jalali(fb.date) : '—'} · ناشناس</div></div>`;
    }).join(''); }).join('')}
  </div>` : ''}
  </div>`;
}

/** روت ب.۳ — بر اساس نقش، فرم یا نتیجه */
function viewTeachEval(){
  const u = S.user;
  if(u.role === 'student' || u.role === 'parent') return viewTeachEvalForm(u);
  if(u.role === 'manager' || u.role === 'edu_office' || u.role === 'superadmin') return viewTeachEvalResults(u);
  return viewForbidden();
}

/* ─────────────── اکشن‌ها ─────────────── */
const TEVAL_ACTIONS = {
  'eval-rate'(el){
    const st = tevalState();
    st.rates[el.dataset.c] = Number(el.dataset.v) || 0;
    const fb = $('#ev_feedback'); if(fb) st.fb = fb.value;
    render();
  },
  'eval-save'(){
    const u = S.user;
    if(u.role !== 'student' && u.role !== 'parent'){ toast('فقط دانش‌آموز و ولی می‌توانند ارزشیابی ثبت کنند', 'err'); return; }
    const st = tevalState();
    /* معلم از سلکت؛ اگر مقدار نداشت (سلکت بدون گزینه) حالتِ ذخیره */
    const selEl = $('#ev_teacher');
    const tid = Number(selEl && selEl.value ? selEl.value : (st.tid || 0));
    if(!tid){ toast('دبیر را انتخاب کنید', 'err'); return; }
    /* گارد دامنه: فقط دبیرانِ مدرسهٔ خودِ پاسخ‌دهنده */
    if(!tevalTeacherAllowed(u, tid)){ toast('این دبیر در مدرسهٔ شما نیست', 'err'); return; }
    const rates = {};
    let missing = 0;
    TEVAL_CRITERIA.forEach(function(c){
      const v = Number(st.rates[c[0]]) || 0;
      if(!(v >= 1 && v <= 5)) missing++;
      rates[c[0]] = v;
    });
    if(missing){ toast(`به همهٔ ${fa(TEVAL_CRITERIA.length)} معیار امتیاز دهید (${fa(TEVAL_CRITERIA.length - missing)} ثبت شده)`, 'err'); return; }
    const fbEl = $('#ev_feedback');
    const fb = fbEl ? String(fbEl.value || '').trim().slice(0, TEVAL_MAX_FEEDBACK) : '';
    /* مدرسهٔ ثبت = مدرسه‌ای که این دبیر برای این پاسخ‌دهنده در آن تدریس می‌کند */
    const t = byId('users', tid);
    const sids = tevalSchoolIdsFor(u);
    const scId = sids.indexOf(t.school_id) > -1 ? t.school_id
      : ((db.teacher_schools || []).find(function(x){ return x.teacher_id === tid && sids.indexOf(x.school_id) > -1 && x.active; }) || {}).school_id;
    if(!scId){ toast('مدرسهٔ این دبیر برای شما مشخص نیست', 'err'); return; }
    /* 🔒 تنها فیلدهای مدل — هیچ فیلد هویتی نوشته نمی‌شود */
    insert('teacher_evaluations', {
      school_id: scId, teacher_id: tid,
      criteria: rates, feedback: fb, created_at: todayISO()
    });
    S.filters._teval = { tid: 0, rates: {} };
    toast('ارزشیابی شما به‌صورت ناشناس ثبت شد — سپاسگزاریم 🌟', 'ok');
    render();
  }
};

/* ─────────────── دادهٔ نمونه (فقط افزودنیِ محلی — وارد صف نمی‌رود) ─────────────── */
function generateTeacherEvalDemo(){
  db.teacher_evaluations = db.teacher_evaluations || [];
  if(db.teacher_evaluations.length) return;
  const FEEDS = [
    'درس را خیلی روشن توضیح می‌دهد.',
    'کاش تکالیف را زودتر بررسی کنند.',
    'با دانش‌آموزان با احترام برخورد می‌کنند.',
    'امتحان‌ها عادلانه است.',
    'سر وقت می‌آیند و کلاس منظم است.',
    ''
  ];
  db.schools.slice(0, 6).forEach(function(sc){
    const ts = db.users.filter(function(u){ return u.role === 'teacher' && u.school_id === sc.id; }).slice(0, 2);
    ts.forEach(function(t){
      const n = 3 + ri(6);
      for(let i = 0; i < n; i++){
        const cr = {};
        TEVAL_CRITERIA.forEach(function(c){ cr[c[0]] = 2 + ri(4); });
        add('teacher_evaluations', {
          school_id: sc.id, teacher_id: t.id, criteria: cr,
          feedback: pick(FEEDS), created_at: daysAgoISO(ri(60))
        });
      }
    });
  });
}

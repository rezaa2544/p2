/* ═══════════════════════════════════════════════════════════════════
   کلاس چندپایه (موج ۲۱ — مدارس روستایی و عشایری)
   ───────────────────────────────────────────────────────────────────
   مسئله: در مدارس روستایی یک معلم هم‌زمان چند پایه را در یک کلاس
   درس می‌دهد (مثلاً سوم + چهارم + پنجم در یک اتاق). صفحه‌های عادی
   «حضور و غیاب» و «نمرات» کلاس را تک‌پایه فرض می‌کنند و معلمِ
   چندپایه مجبور است ذهنی تفکیک کند.

   راه‌حل: نمای ماتریسی — سطر = دانش‌آموز، ستون = پایه. هر دانش‌آموز
   فقط در ستونِ پایهٔ خودش کنترل دارد؛ ستون‌های دیگرش کم‌رنگ‌اند.
   یک ضربه روی سرستونِ پایه، همهٔ دانش‌آموزانِ همان پایه را یک‌جا
   علامت می‌زند (ثبت گروهی).

   🔴 Offline-First دست‌نخورده است:
   - حضور: از همان لایهٔ پیش‌نویسِ Store (attDraftSet/attDraftSetAll
     در 44-sms-notify.js) استفاده می‌شود و ثبتِ نهایی از همان
     att-review → att-commit می‌گذرد (پیامک، قاعده‌ها و صفِ
     همگام‌سازی همگی سرِ جای خودشان).
   - نمره: از insert('grades') می‌گذرد که خودش واردِ صفِ آفلاین
     (applyOp → enqueueOp در 03-persistence.js) می‌شود.

   پایهٔ دانش‌آموز: اول users.grade_level (همان فیلدی که چرخهٔ
   ارتقا می‌نویسد)، وگرنه پایهٔ کلاسِ ثبت‌نامی (grade_level یا
   استنتاج از نام — gradeFromName در 31-student-lifecycle.js).

   شرط نمایش: کلاس c.multigrade داشته باشد + مدرسه قابلیتِ
   has_multigrade (پیش‌فرضِ نوعِ «روستایی / عشایری» — 09-schools.js).
   ═══════════════════════════════════════════════════════════════════ */

/** وضعیت‌های سریعِ نمای چندپایه: حاضر / غایب / مرخصی (=excused) */
const MG_STS = [['present','حاضر'],['absent','غایب'],['excused','مرخصی']];

/** نام فارسی پایه از روی عدد (وارونهٔ GRADE_WORDS) */
function mgGradeName(n){
  n = Number(n);
  if(!n) return '—';
  for(var w in GRADE_WORDS) if(GRADE_WORDS[w] === n) return w;
  return fa(n);
}

/** پایهٔ عددی یک دانش‌آموز در یک کلاسِ چندپایه */
function mgStudentGradeNum(st, cls){
  var g = Number(st && st.grade_level) || 0;
  if(!g && cls){
    g = Number(cls.grade_level) || 0;
    if(!g && typeof gradeFromName === 'function')
      g = gradeFromName(cls.grade) || gradeFromName(cls.name) || 0;
  }
  return g || 0;
}

/** کلاس‌های چندپایهٔ قابل‌دیدنِ کاربر (کلاسِ نشان‌دار + قابلیتِ مدرسه) */
function mgClasses(){
  return visibleClasses().filter(function(c){
    if(!c.multigrade) return false;
    return (typeof hasCap === 'function') ? hasCap(c.school_id, 'has_multigrade') : true;
  });
}

/** وضعیتِ مؤثرِ حضور: پیش‌نویس اگر بود، وگرنه رکوردِ پایگاه داده */
function mgEffStatus(sid, draft, recMap){
  if(draft[sid]) return { st: draft[sid], draft: true };
  var r = recMap.get(Number(sid));
  return r ? { st: r.status, draft: false } : { st: null, draft: false };
}

function viewMultigrade(){
  const u = S.user;
  const canEdit = ['superadmin','manager','teacher'].includes(u.role);
  const mcls = mgClasses();
  if(!mcls.length)
    return `<div class="card">${empty('🏔️','کلاس چندپایه‌ای در دسترس نیست',
      'در «کلاس‌ها» گزینهٔ «چندپایه» را برای کلاس فعال کنید. این قابلیت مخصوص مدارس با پروفایلِ روستایی/عشایری (has_multigrade) است.')}</div>`;

  let cls = mcls.find(c => c.id === Number(S.filters.class)) || mcls[0];
  const cid = cls.id;
  /* att-review / att-commit کلاس را از S.filters.class می‌خوانند —
     پیش از نمایشِ نوارِ پیش‌نویس باید قفل باشد که ثبتِ نهایی به
     کلاسِ دیگری نرود. */
  S.filters.class = cid;
  const date = S.filters.date || todayISO();
  const tab = S.filters.mgtab || 'att';

  const roster = studentsOfClass(cid);
  const withG = roster.map(s => ({ s: s, g: mgStudentGradeNum(s, cls) }));
  const gradeCols = [...new Set(withG.map(x => x.g))].sort((a, b) => a - b);
  const gFilter = Number(S.filters.mggrade || 0);
  const rows = gFilter ? withG.filter(x => x.g === gFilter) : withG;

  const head = `<div class="card-head">
    <div class="row">
      <select class="select" style="width:180px" data-f="class" aria-label="انتخاب کلاس چندپایه">${mcls.map(c =>
        `<option value="${escAttr(c.id)}" ${c.id === cid ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <span class="badge b-amber">چندپایه</span>
      <select class="select" style="width:140px" data-f="mggrade" aria-label="فیلتر پایه">
        <option value="">همهٔ پایه‌ها</option>${gradeCols.map(g =>
        `<option value="${escAttr(g)}" ${gFilter === g ? 'selected' : ''}>پایهٔ ${esc(mgGradeName(g))}</option>`).join('')}</select>
      ${tab === 'att' ? `<input class="input" style="width:160px" type="date" data-f="date" aria-label="تاریخ حضور و غیاب" value="${escAttr(date)}" /><span class="badge b-gray">${jalali(date)}</span>` : ''}
    </div>
    <div class="row">
      <button class="btn ${tab === 'att' ? '' : 'ghost'} sm" data-act="mg-tab" data-id="att">✅ حضور و غیاب</button>
      <button class="btn ${tab === 'grades' ? '' : 'ghost'} sm" data-act="mg-tab" data-id="grades">📝 نمرات</button>
    </div></div>`;

  if(!rows.length)
    return `<div class="card">${head}${empty('🔍','دانش‌آموزی یافت نشد','این کلاس دانش‌آموزی ندارد یا فیلترِ پایه نتیجه‌ای نداشت.')}</div>`;

  return tab === 'grades'
    ? mgGradesMatrix(cls, rows, gradeCols, head, canEdit)
    : mgAttMatrix(cls, date, rows, gradeCols, head, canEdit);
}

/* ─────────────── ماتریسِ حضور: سطر=دانش‌آموز، ستون=پایه ─────────────── */
function mgAttMatrix(cls, date, rows, gradeCols, head, canEdit){
  const cid = cls.id;
  const draft = (typeof attDraftGet === 'function') ? attDraftGet(cid, date) : {};
  const am = (typeof idxAttByClassDate === 'function') ? idxAttByClassDate() : null;
  const recMap = new Map();
  if(am) (am.get(cid + '|' + date) || []).forEach(a => recMap.set(a.student_id, a));
  else (db.attendance || []).forEach(a => { if(a.class_id === cid && a.date === date) recMap.set(a.student_id, a); });

  const diff = (typeof attDraftDiff === 'function') ? attDraftDiff(cid, date) : { changes: [] };
  const nChange = diff.changes.length;
  const nDraft = Object.keys(draft).length;
  const bar = nDraft ? attDraftBarHTML(nChange) : '';

  /* شمارنده‌ها به تفکیک پایه */
  const cnt = { present: 0, absent: 0, excused: 0, unset: 0 };
  rows.forEach(x => {
    const e = mgEffStatus(x.s.id, draft, recMap);
    if(e.st === 'present') cnt.present++;
    else if(e.st === 'absent') cnt.absent++;
    else if(e.st === 'excused') cnt.excused++;
    else cnt.unset++;
  });

  /* سرستون: نام پایه + ثبتِ گروهیِ یک‌ضربه‌ای همان پایه */
  const th = g => `<th scope="col">پایهٔ ${esc(mgGradeName(g))}
     <span class="small muted">(${fa(rows.filter(x => x.g === g).length)})</span>
     ${canEdit ? `<div class="row" style="gap:2px;margin-top:4px">${MG_STS.map(([k, l]) =>
       `<button class="att-btn" data-act="mg-att-col" data-g="${escAttr(g)}" data-s="${k}" title="همهٔ پایهٔ ${escAttr(mgGradeName(g))}: ${l}">${l === 'حاضر' ? '✅' : l === 'غایب' ? '❌' : '🏖'} همه</button>`).join('')}</div>` : ''}</th>`;

  const cell = (x, g) => {
    if(x.g !== g) return '<td class="mg-off"></td>';
    if(!canEdit) return '<td></td>';
    const e = mgEffStatus(x.s.id, draft, recMap);
    return `<td><span class="att-group">${MG_STS.map(([k, l]) =>
      `<button class="att-btn${e.st === k ? ' on-' + k : ''}" data-act="mg-att-set" data-id="${escAttr(x.s.id)}" data-s="${k}">${l}</button>`).join('')}</span></td>`;
  };

  const row = (x, i) => {
    const e = mgEffStatus(x.s.id, draft, recMap);
    const lbl = e.st === 'excused' ? 'مرخصی' : (ATT_FA[e.st] || '');
    return `<tr${e.draft ? ' class="att-row-draft"' : ''}>
      <td class="muted">${fa(i + 1)}</td>
      <td><b>${esc(x.s.full_name)}</b><div class="small muted">پایهٔ ${esc(mgGradeName(x.g))}</div></td>
      ${gradeCols.map(g => cell(x, g)).join('')}
      <td>${e.st ? `<span class="badge ${ATT_BADGE[e.st] || 'b-gray'}">${lbl}</span>` : '<span class="badge b-gray">ثبت نشده</span>'}
        ${e.draft ? '<div class="att-sub"><span class="badge b-amber">ثبت‌نشده</span></div>' : ''}</td></tr>`;
  };

  return `${bar}<div class="card">${head}
   <div class="card-body row" style="border-bottom:1px solid var(--border)">
     <span class="badge b-green">حاضر: ${fa(cnt.present)}</span>
     <span class="badge b-red">غایب: ${fa(cnt.absent)}</span>
     <span class="badge b-purple">مرخصی: ${fa(cnt.excused)}</span>
     <span class="badge b-gray">ثبت‌نشده: ${fa(cnt.unset)}</span>
     <div class="spacer"></div>
     <span class="small muted">${nDraft ? 'تغییرات هنوز ذخیره نشده‌اند' : 'همه‌چیز ذخیره شده است'}</span></div>
   <div class="table-wrap"><table>
    <thead><tr><th scope="col">#</th><th scope="col">دانش‌آموز</th>${gradeCols.map(th).join('')}<th scope="col">وضعیت فعلی</th></tr></thead>
    <tbody>${rows.map(row).join('')}</tbody></table></div>
   ${nDraft ? attCardFootHTML(nChange) : ''}</div>`;
}

/* ─────────────── ماتریسِ نمره: سطر=دانش‌آموز، ستون=پایه ─────────────── */
function mgGradesMatrix(cls, rows, gradeCols, head, canEdit){
  const cid = cls.id;
  const u = S.user;
  const subs = visibleSubjects();
  const subId = Number(S.filters.mgsub || (subs[0] || {}).id || 0);
  const term = S.filters.mgterm || TERMS[0];
  /* امتحان نهایی کشوری عمداً نیست: از بیرون وارد می‌شود (فاز ۰.۳) و
     ثبتِ گروهی‌اش از این نما بی‌معناست — همان گاردِ grade-save. */
  const types = EXAM_TYPES.filter(t => t !== NATIONAL_EXAM_TYPE);
  const etype = types.includes(S.filters.mgtype) ? S.filters.mgtype : types[0];

  const last = sid => {
    let best = null;
    (db.grades || []).forEach(g => {
      if(g.student_id !== sid || g.class_id !== cid || g.subject_id !== subId) return;
      if(term && g.term !== term) return;
      if(!best || g.id > best.id) best = g;
    });
    return best;
  };

  const cell = (x, g) => {
    if(x.g !== g) return '<td class="mg-off"></td>';
    if(!canEdit) return '<td></td>';
    return `<td><input class="input mg-score" style="width:86px" type="number" min="0" max="20" step="0.25"
      id="mg_sc_${escAttr(x.s.id)}" data-sid="${escAttr(x.s.id)}" aria-label="نمرهٔ ${escAttr(x.s.full_name)}" /></td>`;
  };

  const row = (x, i) => {
    const gOld = last(x.s.id);
    return `<tr><td class="muted">${fa(i + 1)}</td>
      <td><b>${esc(x.s.full_name)}</b><div class="small muted">پایهٔ ${esc(mgGradeName(x.g))}</div></td>
      ${gradeCols.map(g => cell(x, g)).join('')}
      <td>${gOld ? `<span class="badge ${gOld.score >= 17 ? 'b-green' : gOld.score >= 12 ? 'b-blue' : 'b-red'}">${fa(gOld.score)} / ${fa(gOld.max_score)}</span> <span class="small muted">${esc(gOld.exam_type)}</span>` : '<span class="badge b-gray">ثبت نشده</span>'}</td></tr>`;
  };

  return `<div class="card">${head}
   <div class="card-body row" style="border-bottom:1px solid var(--border)">
     <select class="select" style="width:170px" data-f="mgsub" aria-label="انتخاب درس">${subs.map(s =>
       `<option value="${escAttr(s.id)}" ${s.id === subId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
     <select class="select" style="width:130px" data-f="mgterm" aria-label="انتخاب نوبت">${TERMS.map(t =>
       `<option ${term === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
     <select class="select" style="width:130px" data-f="mgtype" aria-label="نوع آزمون">${types.map(t =>
       `<option ${etype === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
     <div class="spacer"></div>
     <span class="small muted">فقط خانه‌های پُرشده ثبت می‌شوند — از ۲۰</span></div>
   <div class="table-wrap"><table>
    <thead><tr><th scope="col">#</th><th scope="col">دانش‌آموز</th>${gradeCols.map(g =>
      `<th scope="col">پایهٔ ${esc(mgGradeName(g))} <span class="small muted">(${fa(rows.filter(x => x.g === g).length)})</span></th>`).join('')}<th scope="col">آخرین نمرهٔ این درس</th></tr></thead>
    <tbody>${rows.map(row).join('')}</tbody></table></div>
   ${canEdit ? `<div class="card-foot row">
     <button class="btn" data-act="mg-grades-save">💾 ثبت گروهی نمره‌ها</button>
     <span class="small muted">هر نمره یک رکوردِ مستقل است و واردِ صفِ همگام‌سازی می‌شود.</span></div>` : ''}</div>`;
}

/* ─────────────── اکشن‌ها ─────────────── */
const MG_ACTIONS = {
  'mg-tab'(el, id){
    S.filters.mgtab = (id === 'grades') ? 'grades' : 'att';
    render();
  },
  /* تیکِ تکیِ حضور — همان لایهٔ پیش‌نویسِ آفلاین (زدنِ دوباره = برداشتن) */
  'mg-att-set'(el, id){
    const mcls = mgClasses(); if(!mcls.length) return;
    const cid = Number(S.filters.class || mcls[0].id);
    const date = S.filters.date || todayISO();
    attDraftSet(cid, date, Number(id), el.dataset.s);
    render();
  },
  /* ثبتِ گروهیِ یک‌ضربه‌ای: همهٔ دانش‌آموزانِ یک پایه */
  'mg-att-col'(el){
    const mcls = mgClasses(); if(!mcls.length) return;
    const cid = Number(S.filters.class || mcls[0].id);
    const cls = byId('classes', cid);
    const date = S.filters.date || todayISO();
    const g = Number(el.dataset.g), st = el.dataset.s;
    const ids = studentsOfClass(cid)
      .filter(s => mgStudentGradeNum(s, cls) === g)
      .map(s => s.id);
    if(!ids.length){ toast('دانش‌آموزی در این پایه نیست', 'err'); return; }
    attDraftSetAll(cid, date, ids, st);
    const lbl = st === 'excused' ? 'مرخصی' : ATT_FA[st];
    toast('پایهٔ ' + mgGradeName(g) + ': همه «' + lbl + '» علامت خوردند — برای ذخیره «مرور و ثبت نهایی» را بزنید', 'ok');
    render();
  },
  /* ثبتِ گروهیِ نمره — هر خانهٔ پُرشده یک insert مستقل (صفِ آفلاین) */
  'mg-grades-save'(){
    const mcls = mgClasses(); if(!mcls.length) return;
    const cid = Number(S.filters.class || mcls[0].id);
    const cls = byId('classes', cid);
    if(!cls){ toast('کلاس پیدا نشد', 'err'); return; }
    const subs = visibleSubjects();
    const subId = Number(S.filters.mgsub || (subs[0] || {}).id || 0);
    if(!subId){ toast('درسی برای این مدرسه تعریف نشده است', 'err'); return; }
    const term = S.filters.mgterm || TERMS[0];
    const types = EXAM_TYPES.filter(t => t !== NATIONAL_EXAM_TYPE);
    const etype = types.includes(S.filters.mgtype) ? S.filters.mgtype : types[0];
    /* گاردِ دفاعی — نما گزینهٔ نهایی را نمی‌دهد، ولی state دستکاری‌پذیر است */
    if(etype === NATIONAL_EXAM_TYPE){ toast('نمرهٔ امتحان نهایی کشوری از این نما ثبت نمی‌شود', 'err'); return; }
    let n = 0, bad = 0;
    const madeIds = [];
    const write = () => {
      document.querySelectorAll('.mg-score').forEach(inp => {
        const v = String(inp.value || '').trim();
        if(v === '') return;
        const sc = Number(v);
        if(isNaN(sc) || sc < 0 || sc > 20){ bad++; return; }
        const r = insert('grades', {
          school_id: cls.school_id, student_id: Number(inp.dataset.sid), class_id: cid,
          subject_id: subId, teacher_id: S.user.role === 'teacher' ? S.user.id : null,
          score: sc, max_score: 20, term: term, exam_type: etype,
          kind: 'theory', source: 'internal', created_at: todayISO() });
        madeIds.push(r.id); n++;
      });
    };
    if(typeof batchWrites === 'function') batchWrites(write); else write();
    /* پیامکِ نمرهٔ زیرِ آستانه — همان مسیرِ grade-save */
    if(typeof notifyGradeSync === 'function') madeIds.forEach(gid => { try{ notifyGradeSync(gid); }catch(e){} });
    if(bad) toast('نمره باید بین ۰ تا ۲۰ باشد — ' + fa(bad) + ' خانه ثبت نشد', 'err');
    else if(!n){ toast('هیچ نمره‌ای وارد نشده است', 'err'); return; }
    if(n) toast(fa(n) + ' نمره ثبت شد', 'ok');
    render();
  }
};

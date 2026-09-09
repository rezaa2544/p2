/* ═══════════════════════════════════════════════════════════════════
   بند ۶.۵ — گردشِ کارِ کاملِ امتحاناتِ تجدیدی (شهریور) — فاز ۵
   ───────────────────────────────────────────────────────────────────
   مکملِ بند ۶.۱ (63-reexam.js)؛ آن ماژول «رکوردِ تجدیدی» را نگه
   می‌دارد و این ماژول «منشأ و پیامد» را:
     ۱. کشفِ خودکارِ دانش‌آموزانِ مردود از دفترِ نمرات (نه ورودِ دستی)
     ۲. پیوندِ نمرهٔ مجدد به دفترِ نمرات (grades) با برچسبِ واضح
     ۳. نمرهٔ مؤثر (تجدیدی اگر ثبت شده باشد، وگرنه اصلی)
     ۴. مشارکتِ دبیر (ثبتِ نمرهٔ مجدد — فقط کلاس‌هایی که درس می‌دهد)
     ۵. گزارشِ چاپیِ تجدیدی‌ها برای مدرسه
   قواعدِ تصمیم (یک‌جا، برای تست‌پذیری):
     · آستانهٔ قبولی = نیمی از بیشینهٔ نمره → ۱۰ از ۲۰ (RETAKE_PASS_RATIO)
     · مبنایِ مردودی: آخرین نمرهٔ هر (دانش‌آموز، درس) — نوبت دوم مقدم بر
       نوبت اول است و در صورت برابری، تاریخِ جدیدتر.
     · نمرهٔ اصلی هرگز دست نمی‌خورد؛ تجدیدی یک ردیفِ تازه در grades است
       با is_retake=1 و retake_of_grade_id=شناسهٔ نمرهٔ مردود.
   ═══════════════════════════════════════════════════════════════════ */

const RETAKE_PASS_RATIO = 0.5;          /* نمرهٔ قبولی = نیمی از بیشینه (۱۰ از ۲۰) */
const RETAKE_EXAM_TYPE  = 'تجدیدی';     /* برچسبِ واضح در دفترِ نمرات */

/** آستانهٔ قبولیِ یک نمره با بیشینهٔ دلخواه (پیش‌فرض ۲۰) */
function retakePassMark(maxScore){
  const mx = Number(maxScore);
  return (mx > 0 ? mx : 20) * RETAKE_PASS_RATIO;
}

/** آیا این ردیفِ نمره «مردود» است؟ (نمرهٔ تجدیدی خودش مردود حساب نمی‌شود) */
function retakeIsFail(g){
  if(!g) return false;
  if(Number(g.is_retake) === 1) return false;
  if(g.score == null || g.score === '') return false;
  return Number(g.score) < retakePassMark(g.max_score);
}

/** ردیفِ نمرهٔ تجدیدیِ این نمره (اگر تاکنون ثبت شده باشد) */
function retakeGradeOf(gradeId){
  const gid = Number(gradeId);
  return (db.grades || []).find(function(g){
    return Number(g.is_retake) === 1 && Number(g.retake_of_grade_id) === gid;
  }) || null;
}

/** رکوردِ تجدیدیِ متناظر با این نمرهٔ مردود */
function reexamOfGrade(gradeId){
  const gid = Number(gradeId);
  return (db.reexams || []).find(function(r){ return Number(r.grade_id) === gid; }) || null;
}

/* رتبهٔ نوبت: «نوبت دوم»/«دوم» بر «نوبت اول»/«اول» مقدم است */
function retakeTermRank(t){
  const s = String(t || '');
  if(s.indexOf('دوم') > -1) return 2;
  if(s.indexOf('اول') > -1) return 1;
  return 0;
}

/** آخرین نمرهٔ هر (دانش‌آموز، درس) — مبنایِ تشخیصِ مردودی */
function subjectFinalGrades(schoolId){
  const map = {};
  (db.grades || []).forEach(function(g){
    if(Number(g.is_retake) === 1) return;
    if(schoolId != null && Number(g.school_id) !== Number(schoolId)) return;
    if(!g.student_id || !g.subject_id) return;
    if(g.score == null || g.score === '') return;
    const k = Number(g.student_id) + '|' + Number(g.subject_id);
    const prev = map[k];
    if(!prev){ map[k] = g; return; }
    const d = retakeTermRank(g.term) - retakeTermRank(prev.term);
    if(d > 0){ map[k] = g; return; }
    if(d === 0 && String(g.date || '') >= String(prev.date || '')) map[k] = g;
  });
  return map;
}

/** دانش‌آموزان/دروسِ مردودِ مدرسه (بر اساسِ آخرین نمرهٔ هر درس) */
function failingRows(schoolId){
  const sid = (schoolId != null) ? Number(schoolId)
            : (S.user ? S.user.school_id : null);
  const map = subjectFinalGrades(sid);
  return Object.keys(map).map(function(k){ return map[k]; })
    .filter(retakeIsFail)
    .sort(function(a, b){
      const na = (byId('users', a.student_id) || {}).full_name || '';
      const nb = (byId('users', b.student_id) || {}).full_name || '';
      return na.localeCompare(nb, 'fa');
    });
}

/** مردودی‌هایی که هنوز برای تجدیدی ثبت نشده‌اند (نامزدهایِ شهریور) */
function retakeCandidates(schoolId){
  return failingRows(schoolId).filter(function(g){ return !reexamOfGrade(g.id); });
}

/** نمرهٔ مؤثرِ یک ردیفِ نمره: تجدیدی اگر ثبت شده باشد، وگرنه خودش */
function retakeEffective(g){
  if(!g) return null;
  const r = retakeGradeOf(g.id);
  return r != null ? Number(r.score) : Number(g.score);
}

/** آیا این نمره با تجدیدی جبران شده (قبولِ پس از تجدیدی)؟ */
function retakeIsCleared(g){
  if(!retakeIsFail(g)) return false;
  const e = retakeEffective(g);
  return e != null && e >= retakePassMark(g.max_score);
}

/** ثبتِ درسِ تجدیدی برای یک نمرهٔ مردود — فقط مدیر (منشأ از دفترِ نمرات) */
function retakeRegister(gradeId){
  const g = byId('grades', gradeId);
  if(!g) return { ok: false, err: 'نمره یافت نشد' };
  if(!retakeIsFail(g)) return { ok: false, err: 'این نمره مردود نیست' };
  if(reexamOfGrade(g.id)) return { ok: false, err: 'تجدیدیِ این درس قبلاً ثبت شده' };
  insert('reexams', {
    school_id: g.school_id, student_id: g.student_id, subject_id: g.subject_id,
    grade_id: g.id, original_score: Number(g.score),
    exam_date: todayISO(), new_score: null, status: 'scheduled',
    created_at: todayISO(), updated_at: todayISO()
  });
  return { ok: true, id: (db.reexams[db.reexams.length - 1] || {}).id };
}

/** ثبت/ویرایشِ نمرهٔ مجدد + پیوند به دفترِ نمرات (مدیر، یا دبیرِ همان کلاس) */
function retakeApplyScore(reexamId, score){
  const r = byId('reexams', reexamId);
  if(!r) return { ok: false, err: 'رکورد یافت نشد' };
  if(score === '' || score == null) return { ok: false, err: 'نمرهٔ مجدد لازم است' };
  const n = Number(score);
  if(isNaN(n)) return { ok: false, err: 'نمرهٔ مجدد معتبر نیست' };
  if(n < 0 || n > 20) return { ok: false, err: 'نمره باید ۰ تا ۲۰ باشد' };
  const orig  = r.grade_id ? byId('grades', r.grade_id) : null;
  const fresh = retakeGradeOf(r.grade_id);
  update('reexams', Number(reexamId), { new_score: n, status: 'done', updated_at: todayISO() });
  if(!orig) return { ok: true, score: n, gradeId: null };   /* رکوردِ دستیِ قدیمی: فقط نمره */
  if(fresh){
    update('grades', fresh.id, { score: n, date: todayISO(), updated_at: todayISO() });
    return { ok: true, score: n, gradeId: fresh.id };
  }
  const cls = (typeof classOf === 'function') ? (classOf(r.student_id) || {}) : {};
  insert('grades', {
    school_id: r.school_id, class_id: orig.class_id || cls.id || null,
    student_id: r.student_id, subject_id: r.subject_id,
    teacher_id: (S.user && S.user.role === 'teacher') ? S.user.id : (orig.teacher_id || null),
    term: orig.term || '', exam_type: RETAKE_EXAM_TYPE, kind: '',
    score: n, max_score: orig.max_score || 20, date: todayISO(), source: '',
    is_retake: 1, retake_of_grade_id: orig.id,
    created_at: todayISO(), updated_at: todayISO()
  });
  return { ok: true, score: n, gradeId: (db.grades[db.grades.length - 1] || {}).id };
}

/** ردیف‌هایِ گزارشِ تجدیدیِ مدرسه (مدیر/دبیر) */
function retakeReportRows(schoolId){
  const sid = (schoolId != null) ? Number(schoolId)
            : (S.user ? S.user.school_id : null);
  return (db.reexams || [])
    .filter(function(r){ return sid == null || Number(r.school_id) === sid; })
    .map(function(r){
      const orig = r.grade_id ? byId('grades', r.grade_id) : null;
      const mx   = (orig && orig.max_score) || 20;
      const fin  = (r.status === 'done' && r.new_score != null)
                 ? Number(r.new_score)
                 : (orig ? Number(orig.score) : Number(r.original_score));
      return {
        id: r.id, student_id: r.student_id, subject_id: r.subject_id,
        student: (byId('users', r.student_id) || {}).full_name || '—',
        subject: (byId('subjects', r.subject_id) || {}).name || '—',
        original: r.original_score != null ? Number(r.original_score) : null,
        retake:   (r.status === 'done' && r.new_score != null) ? Number(r.new_score) : null,
        final:    fin,
        status:   r.status,
        exam_date: r.exam_date || '',
        pass_mark: retakePassMark(mx),
        passed:   fin != null ? fin >= retakePassMark(mx) : null,
        linked:   !!(r.grade_id && retakeGradeOf(r.grade_id))
      };
    })
    .sort(function(a, b){
      const s = a.student.localeCompare(b.student, 'fa');
      return s !== 0 ? s : a.subject.localeCompare(b.subject, 'fa');
    });
}

/* ─────────────────────────── نماها ─────────────────────────── */

/** کارتِ نامزدها در صفحهٔ مدیر: مردودی‌هایِ کشف‌شده + ثبتِ یک‌کلیکی */
function retakeCandidatesCard(){
  if(!(S.user && (S.user.role === 'manager' || S.user.role === 'superadmin'))) return '';
  const rows = retakeCandidates(S.user.school_id);
  const h = '<div class="card" style="margin-top:14px">'
    + '<div class="card-head"><div class="row" style="gap:8px"><b>🔍 مردودی‌هایِ کشف‌شده از دفترِ نمرات</b>'
    + '<span class="badge b-gray" title="آستانهٔ قبولی = نیمی از بیشینهٔ نمره (۱۰ از ۲۰)">حدّ نصاب: '
    + fa(retakePassMark(20)) + '</span></div></div>';
  if(!rows.length){
    return h + '<div class="card-body">' + empty('✅', 'دانش‌آموزِ مردودیِ ثبت‌نشده ندارید',
      'هر نمرهٔ زیرِ حدّ نصاب که تجدیدی نشده باشد، اینجا می‌آید.') + '</div></div>';
  }
  return h + '<div class="table-wrap"><table><thead><tr><th>دانش‌آموز</th><th>درس</th>'
    + '<th>نوبت</th><th>نمره</th><th></th></tr></thead><tbody>'
    + rows.map(function(g){
        return '<tr><td><b>' + esc((byId('users', g.student_id) || {}).full_name || '—') + '</b></td>'
          + '<td>' + esc((byId('subjects', g.subject_id) || {}).name || '—') + '</td>'
          + '<td class="muted small">' + esc(g.term || '—') + '</td>'
          + '<td><span class="badge b-red">' + fa(g.score) + ' / ' + fa(g.max_score) + '</span></td>'
          + '<td style="white-space:nowrap"><button class="btn sm" data-act="rt-register" data-id="'
          + escAttr(g.id) + '">🔁 ثبت برای شهریور</button></td></tr>';
      }).join('')
    + '</tbody></table></div></div>';
}

/** کارتِ دبیر در صفحهٔ نمرات: تجدیدی‌هایی که باید نمرهٔ مجدد بگیرند */
function retakeTeacherCard(){
  const u = S.user;
  if(!u || (u.role !== 'teacher' && u.role !== 'manager' && u.role !== 'superadmin')) return '';
  const schoolId = u.school_id;
  /* دبیر فقط دانش‌آموزانِ کلاس‌هایی که درس می‌دهد (هم‌راستا با inScopeِ سرور) */
  const myStudents = (u.role === 'teacher')
    ? function(sid){
        const cls = (typeof classOf === 'function') ? (classOf(sid) || {}) : {};
        if(!cls.id) return false;
        if(cls.homeroom_teacher_id === u.id) return true;
        return (db.schedule || []).some(function(s){ return s.class_id === cls.id && s.teacher_id === u.id; });
      }
    : function(){ return true; };
  const rows = (db.reexams || []).filter(function(r){
    return Number(r.school_id) === Number(schoolId) && myStudents(r.student_id);
  });
  if(!rows.length) return '';
  const todo = rows.filter(function(r){ return r.status !== 'done'; }).length;
  return '<div class="card" style="margin-top:14px">'
    + '<div class="card-head"><div class="row" style="gap:8px"><b>🔁 امتحاناتِ تجدیدی (شهریور)</b>'
    + '<span class="badge b-blue">' + fa(todo) + ' منتظرِ نمره</span>'
    + '<span class="badge b-gray">جمع: ' + fa(rows.length) + '</span></div>'
    + '<button class="btn ghost sm" data-act="rt-print">🖨️ گزارشِ تجدیدی‌ها</button></div>'
    + '<div class="table-wrap"><table><thead><tr><th>دانش‌آموز</th><th>درس</th><th>نمرهٔ اصلی</th>'
    + '<th>تاریخِ مجدد</th><th>نمرهٔ مجدد</th><th>وضعیت</th><th></th></tr></thead><tbody>'
    + rows.map(function(r){
        const st = r.status === 'done' ? 'انجام‌شده' : 'برنامه‌ریزی‌شده';
        return '<tr><td><b>' + esc((byId('users', r.student_id) || {}).full_name || '—') + '</b></td>'
          + '<td>' + esc((byId('subjects', r.subject_id) || {}).name || '—') + '</td>'
          + '<td>' + fa(r.original_score) + '</td>'
          + '<td class="muted small">' + (r.exam_date ? jalali(r.exam_date) : '—') + '</td>'
          + '<td>' + (r.new_score != null && r.new_score !== '' ? fa(r.new_score) : '—') + '</td>'
          + '<td><span class="badge ' + (r.status === 'done' ? 'b-green' : 'b-blue') + '">' + st + '</span></td>'
          + '<td style="white-space:nowrap"><button class="btn sm" data-act="rt-score" data-id="'
          + escAttr(r.id) + '">✍️ ' + (r.status === 'done' ? 'تغییرِ نمرهٔ مجدد' : 'ثبتِ نمرهٔ مجدد')
          + '</button></td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div class="card-body small muted">با ثبتِ نمرهٔ مجدد، یک ردیف با برچسبِ «'
    + esc(RETAKE_EXAM_TYPE) + '» در دفترِ نمرات ساخته می‌شود و نمرهٔ اصلی دست‌نخورده می‌ماند.</div>'
    + '</div>';
}

/** بدنهٔ چاپیِ گزارشِ تجدیدی‌ها */
function retakePrintBody(schoolId){
  const rows = retakeReportRows(schoolId);
  const done = rows.filter(function(r){ return r.status === 'done'; });
  const passed = done.filter(function(r){ return r.passed; }).length;
  let b = '<div class="meta"><span>تعدادِ رکوردها: <b>' + esc(fa(rows.length)) + '</b></span>'
    + '<span>انجام‌شده: <b>' + esc(fa(done.length)) + '</b></span>'
    + '<span>قبولِ پس از تجدیدی: <b>' + esc(fa(passed)) + '</b></span>'
    + '<span>حدّ نصاب: <b>' + esc(fa(retakePassMark(20))) + ' از ۲۰</b></span></div>';
  if(!rows.length) return b + '<div class="note">رکوردی برای گزارش نیست.</div>';
  b += '<table><thead><tr><th class="c">#</th><th>دانش‌آموز</th><th>درس</th>'
    + '<th class="c">نمرهٔ اصلی</th><th class="c">تاریخِ مجدد</th><th class="c">نمرهٔ مجدد</th>'
    + '<th class="c">نمرهٔ نهایی</th><th class="c">نتیجه</th></tr></thead><tbody>';
  rows.forEach(function(r, i){
    const res = r.status !== 'done' ? 'در انتظار'
              : (r.passed ? 'قبول' : 'مردود');
    b += '<tr><td class="c">' + fa(i + 1) + '</td><td>' + esc(r.student) + '</td><td>' + esc(r.subject) + '</td>'
      + '<td class="c">' + fa(r.original) + '</td>'
      + '<td class="c">' + (r.exam_date ? esc(jalali(r.exam_date)) : '—') + '</td>'
      + '<td class="c">' + (r.retake != null ? fa(r.retake) : '—') + '</td>'
      + '<td class="c"><b>' + fa(r.final) + '</b></td><td class="c">' + esc(res) + '</td></tr>';
  });
  return b + '</tbody></table>';
}

/** چاپِ گزارشِ تجدیدی‌هایِ مدرسه */
function retakePrint(){
  const sc = (typeof byId === 'function' && S.user) ? (byId('schools', S.user.school_id) || {}) : {};
  return printableDoc({
    title: 'گزارشِ امتحاناتِ تجدیدی (شهریور)',
    school: sc.name || '',
    subtitle: 'حدّ نصابِ قبولی: ' + fa(retakePassMark(20)) + ' از ۲۰',
    landscape: false,
    body: retakePrintBody(S.user ? S.user.school_id : null),
    note: 'نمرهٔ نهایی = نمرهٔ مجدد برای رکوردهایِ انجام‌شده، وگرنه نمرهٔ اصلی. '
        + 'نمرهٔ اصلی در دفترِ نمرات دست‌نخورده می‌ماند و تجدیدی با برچسبِ «' + esc(RETAKE_EXAM_TYPE) + '» افزوده می‌شود.'
  });
}

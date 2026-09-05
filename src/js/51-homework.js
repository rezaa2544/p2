/* ═══════════════════════════════════════════════════════════════════
   تکالیف — بارگذاری فایل + تصحیح دیجیتال (نسخهٔ سبک)

   جریان:
     ۱. دبیر تکلیف می‌سازد (عنوان، درس، مهلت) — برای کلاس خودش.
     ۲. دانش‌آموز تصویرِ تکلیفش را بارگذاری می‌کند (فایل در IDB،
        استور hw_files — همان ماژول 49-vclass-idb.js؛ سقف نرم مشترک).
     ۳. دبیر روی تصویر **خوددست خط می‌کشد** (canvas ساده — نه PDF)
        و نمره ثبت می‌کند؛ تصویر تصحیح‌شده به‌صورت PNG در IDB می‌ماند.

   امنیت: ساخت/حذف/تصحیح فقط دبیرِ کلاس یا مدیر؛ بارگذاری فقط
   دانش‌آموزِ کلاسِ تکلیف — همه روی داده (نه فقط روی دکمه).
   ═══════════════════════════════════════════════════════════════════ */

var HW_STORE = 'hw_files';

function hwAssignmentsOfClass(classId){
  return db.hw_assignments
    .filter(function(a){ return a.class_id===classId; })
    .sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
}
function hwSubmissionsOf(assignmentId){
  return db.hw_submissions
    .filter(function(s){ return s.assignment_id===assignmentId; })
    .sort(function(a,b){ return (b.submitted_at||'').localeCompare(a.submitted_at||''); });
}
function hwSubmissionKey(subId){ return 'hw:' + subId; }
function hwAnnotatedKey(subId){ return 'hwann:' + subId; }

/* ─────────────── ساخت تکلیف (دبیر) ─────────────── */

function hwCreateAssignment(opts){
  var cls = byId('classes', opts.classId);
  if(!cls) return {ok:false, msg:'کلاس یافت نشد'};
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  var isTeacher = role === 'teacher' && teacherClasses(u.id).some(function(c){ return c.id === cls.id; });
  if(!(isTeacher || role === 'manager' || role === 'superadmin'))
    return {ok:false, msg:'شما دبیر این کلاس نیستید'};
  if(!opts.title) return {ok:false, msg:'عنوان تکلیف خالی است'};
  var rec = {
    school_id: cls.school_id, class_id: cls.id,
    subject_id: opts.subjectId || 0,
    title: opts.title, description: opts.description || '',
    due_date: opts.dueDate || '',
    created_at: new Date().toISOString(), created_by: u.id
  };
  return {ok:true, rec: insert('hw_assignments', rec)};
}

/* ─────────────── بارگذاری دانش‌آموز ─────────────── */

/**
 * بارگذاری تصویر تکلیف (فایل در IDB + رکورد در db).
 * @returns {Promise<{ok:boolean,msg?:string,rec?:object}>}
 */
function hwSubmit(assignmentId, file){
  var a = byId('hw_assignments', assignmentId);
  if(!a) return Promise.resolve({ok:false, msg:'تکلیف یافت نشد'});
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  /* 🔴 فقط خودِ دانش‌آموز (ولی نمی‌تواند به‌جای فرزند بارگذاری کند)
     و فقط تکلیفِ کلاس خودش */
  if(role !== 'student')
    return Promise.resolve({ok:false, msg:'فقط دانش‌آموز می‌تواند تکلیف بارگذاری کند'});
  var sid = u.id;
  var cls = classOf(sid);
  if(!cls || cls.id !== a.class_id)
    return Promise.resolve({ok:false, msg:'این تکلیف مربوط به کلاس شما نیست'});
  if(vclassOverCap(file.size))
    return Promise.resolve({ok:false, msg:'حجم فایل از ' + idbSizeLabel(VCLASS_FILE_CAP) + ' بیشتر است'});
  var exists = db.hw_submissions.some(function(s){
    return s.assignment_id===a.id && s.student_id===sid;
  });
  if(exists) return Promise.resolve({ok:false, msg:'شما قبلاً این تکلیف را بارگذاری کرده‌اید'});
  var key = 'hw:tmp:' + Date.now() + ':' + Math.floor(Math.random()*1e6);
  return vclassIdbPut(HW_STORE, key, file).then(function(ok){
    if(!ok) return {ok:false, msg:'فایل در ذخیره‌گاه ثبت نشد'};
    var rec = insert('hw_submissions', {
      assignment_id: a.id, student_id: sid,
      file_key: key, file_name: file.name || 'file',
      mime: file.type || 'image/png', size: file.size,
      score: null, annotated_key: '',
      submitted_at: new Date().toISOString(), graded_at: '', graded_by: 0
    });
    /* کلید قطعی بعد از شناخت شناسهٔ رکورد */
    var finalKey = hwSubmissionKey(rec.id);
    return vclassIdbDel(HW_STORE, key).then(function(){
      return vclassIdbPut(HW_STORE, finalKey, file).then(function(ok2){
        if(!ok2) return {ok:false, msg:'فایل نهایی ثبت نشد'};
        rec.file_key = finalKey;
        update('hw_submissions', rec.id, {file_key: finalKey});
        return {ok:true, rec: rec};
      });
    });
  });
}

/* ─────────────── مودال تصحیح (دبیر) ─────────────── */

function hwGradeModal(submissionId){
  var s = byId('hw_submissions', submissionId);
  if(!s || !s.file_key) return;
  window._hwGrading = submissionId;
  vclassIdbGet(HW_STORE, s.file_key).then(function(blob){
    if(!blob){ toast('فایل تکلیف در دسترس نیست','err'); return; }
    var url = (typeof URL!=='undefined' && URL.createObjectURL) ? URL.createObjectURL(blob) : '';
    var stu = byId('users', s.student_id) || {};
    var body =
      '<div style="display:grid;gap:10px;direction:rtl">'
      + '<div class="small"><b>' + esc(stu.full_name || '—') + '</b>'
      + (s.score!=null ? ' <span class="badge b-green">نمرهٔ فعلی: ' + fa(s.score) + '</span>' : '')
      + (s.annotated_key ? ' <span class="badge b-blue">تصویر تصحیح‌شده موجود است</span>' : '')
      + '</div>'
      + '<div style="position:relative;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#f6f7f9">'
      +   '<img id="hw_img" src="' + escAttr(url) + '" style="width:100%;display:block" />'
      +   '<canvas id="hw_canvas" style="position:absolute;inset:0;width:100%;height:100%;cursor:crosshair"></canvas>'
      + '</div>'
      + '<div class="row" style="gap:8px;flex-wrap:wrap">'
      +   '<label class="small">رنگ خط</label>'
      +   '<input type="color" id="hw_color" value="#e11d48" style="width:42px;height:30px;border:none;background:none" />'
      +   '<label class="small">ضخامت</label>'
      +   '<input type="range" id="hw_size" min="2" max="14" value="5" style="width:120px" />'
      +   '<button class="btn ghost sm" data-act="hw-canvas-clear">پاک‌کردن خطوط</button>'
      + '</div>'
      + f('نمره (از ' + '۲۰' + ')', inp('hw_score', s.score!=null?String(s.score):''))
      + '</div>';
    openModal(modalTpl('✏️ تصحیح تکلیف',
      body,
      'hw-grade-save'));
    setTimeout(hwCanvasInit, 60);
  });
}

/* نقشهٔ خطِ خوددست در مختصات تصویر اصلی (برای ترکیب نهایی) */
var _hwStrokes = [];
function hwCanvasInit(){
  var img = document.getElementById('hw_img');
  var cv = document.getElementById('hw_canvas');
  if(!img || !cv) return;
  _hwStrokes = [];
  function sync(){
    cv.width = img.clientWidth;
    cv.height = img.clientHeight;
    hwCanvasRedraw();
  }
  /* jsdom canvas ندارد — در محیط تست خط‌ها بی‌صدا رد می‌شوند */
  var _probe = null;
  try{ _probe = cv.getContext ? cv.getContext('2d') : null; }catch(e){ _probe = null; }
  if(!_probe) return;
  var drawing = false, cur = null;
  cv.onpointerdown = function(e){
    var r = cv.getBoundingClientRect();
    drawing = true;
    cur = {color: (document.getElementById('hw_color')||{}).value || '#e11d48',
           size: Number((document.getElementById('hw_size')||{}).value || 5),
           pts: [{x: e.clientX-r.left, y: e.clientY-r.top}]};
  };
  cv.onpointermove = function(e){
    if(!drawing) return;
    var r = cv.getBoundingClientRect();
    cur.pts.push({x: e.clientX-r.left, y: e.clientY-r.top});
    hwCanvasRedraw();
  };
  window.__hwUp = function(e){
    if(!drawing) return;
    drawing = false;
    if(cur && cur.pts.length) _hwStrokes.push(cur);
    cur = null;
  };
  cv.onpointerup = window.__hwUp;
  cv.onpointerleave = window.__hwUp;
  window.__hwSync = sync;
  if(img.complete) sync(); else img.onload = sync;
}
function hwCanvasRedraw(){
  var cv = document.getElementById('hw_canvas');
  if(!cv) return;
  var ctx = null;
  try{ ctx = cv.getContext ? cv.getContext('2d') : null; }catch(e){ ctx = null; }
  if(!ctx) return;
  ctx.clearRect(0,0,cv.width,cv.height);
  (_hwStrokes||[]).forEach(function(st){
    if(!st.pts.length) return;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(st.pts[0].x, st.pts[0].y);
    st.pts.forEach(function(p){ ctx.lineTo(p.x, p.y); });
    ctx.stroke();
  });
}

/* ذخیرهٔ تصحیح: تصویر + خطوط → PNG در IDB + نمره */
function hwSaveGrading(score){
  var subId = window._hwGrading;
  var s = byId('hw_submissions', subId);
  if(!s) return Promise.resolve({ok:false, msg:'تکلیف یافت نشد'});
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  var a = byId('hw_assignments', s.assignment_id);
  var cls = a ? byId('classes', a.class_id) : null;
  var isTeacher = role === 'teacher' && cls && teacherClasses(u.id).some(function(c){ return c.id === cls.id; });
  if(!(isTeacher || role === 'manager' || role === 'superadmin'))
    return Promise.resolve({ok:false, msg:'شما مجوز تصحیح این تکلیف را ندارید'});
  var img = document.getElementById('hw_img');
  if(!img || !img.naturalWidth){
    /* بدون تصویر (فایل نامعتبر) — فقط نمره */
    update('hw_submissions', s.id, {score: score, graded_at: new Date().toISOString(), graded_by: u.id});
    return Promise.resolve({ok:true});
  }
  /* ترکیب: تصویر اصلی + خطوط در مختصات اصلی */
  var out = document.createElement('canvas');
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;
  var octx = null;
  try{ octx = out.getContext ? out.getContext('2d') : null; }catch(e){ octx = null; }
  if(!octx){
    /* بدون canvas (محیط تست) — فقط نمره */
    update('hw_submissions', s.id, {score: score, graded_at: new Date().toISOString(), graded_by: u.id});
    return Promise.resolve({ok:true});
  }
  octx.drawImage(img, 0, 0);
  var sx = img.naturalWidth / (img.clientWidth || img.naturalWidth);
  var sy = img.naturalHeight / (img.clientHeight || img.naturalHeight);
  (_hwStrokes||[]).forEach(function(st){
    if(!st.pts.length) return;
    octx.strokeStyle = st.color;
    octx.lineWidth = st.size * sx;
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.beginPath();
    octx.moveTo(st.pts[0].x * sx, st.pts[0].y * sy);
    st.pts.forEach(function(p){ octx.lineTo(p.x * sx, p.y * sy); });
    octx.stroke();
  });
  var annKey = hwAnnotatedKey(s.id);
  return new Promise(function(resolve){
    out.toBlob(function(blob){
      if(!blob){ resolve({ok:false, msg:'ساخت تصویر تصحیح‌شده ناموفق بود'}); return; }
      vclassIdbPut(HW_STORE, annKey, blob).then(function(ok){
        update('hw_submissions', s.id, {
          score: score, annotated_key: ok ? annKey : s.annotated_key,
          graded_at: new Date().toISOString(), graded_by: u.id
        });
        resolve(ok ? {ok:true} : {ok:false, msg:'تصویر تصحیح‌شده ذخیره نشد (اما نمره ثبت شد)'});
      });
    }, 'image/png');
  });
}

/* ─────────────── نمای دبیر ─────────────── */

function viewHomework(){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  var isStudent = role === 'student';
  var h = '<div class="page-head"><h2>' + (isStudent ? '📓 تکالیف من' : '📓 تکالیف') + '</h2></div>';
  if(isStudent) return h + hwStudentView();
  var clsList = (role === 'teacher') ? teacherClasses(u.id)
             : db.classes.filter(function(c){ return c.school_id === u.school_id; });
  h += '<div class="small muted" style="margin-bottom:14px">تصویر تکلیف در IndexedDB می‌ماند؛ تصحیح با خطِ خوددست روی تصویر + نمره (نه PDF).</div>';
  if(!clsList.length) return h + '<div class="card">' + empty('📓','کلاسی در دسترس نیست','') + '</div>';
  clsList.forEach(function(c){
    var list = hwAssignmentsOfClass(c.id);
    h += '<div class="card"><div class="card-head"><h3>' + esc(c.name) + '</h3>'
      + '<button class="btn sm" data-act="hw-new" data-id="' + c.id + '">➕ تکلیف جدید</button></div><div class="card-body">';
    if(!list.length){
      h += empty('📓','تکلیفی ثبت نشده','');
    } else {
      h += '<div style="display:grid;gap:10px">' + list.map(function(a){
        var subs = hwSubmissionsOf(a.id);
        var sub = byId('subjects', a.subject_id) || {};
        return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 14px">'
          + '<div class="row" style="flex-wrap:wrap;gap:8px">'
          + '<b>' + esc(a.title) + '</b>'
          + (sub.name ? '<span class="badge b-gray">' + esc(sub.name) + '</span>' : '')
          + (a.due_date ? '<span class="muted small">⏳ مهلت: ' + jalali(a.due_date) + '</span>' : '')
          + '<span class="muted small">' + jalali(a.created_at) + '</span>'
          + '<span class="badge b-amber">بارگذاری: ' + fa(subs.length) + '</span>'
          + '<div class="spacer"></div>'
          + '<button class="btn ghost sm" data-act="hw-list" data-id="' + a.id + '">مشاهدهٔ بارگذاری‌ها</button>'
          + '<button class="btn ghost sm" data-act="hw-del" data-id="' + a.id + '">حذف</button>'
          + '</div>'
          + '</div>';
      }).join('') + '</div>';
    }
    return h + '</div></div>';
  });
  return h;
}

/* فهرست بارگذاری‌های یک تکلیف (مودال) */
function hwListModal(assignmentId){
  var a = byId('hw_assignments', assignmentId);
  if(!a) return;
  var subs = hwSubmissionsOf(assignmentId);
  var rows = subs.map(function(s){
    var stu = byId('users', s.student_id) || {};
    return '<div class="row" style="gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding:8px 0">'
      + '<b class="small">' + esc(stu.full_name || '—') + '</b>'
      + '<span class="muted small">' + jalali(s.submitted_at) + '</span>'
      + (s.score!=null ? '<span class="badge b-green">نمره: ' + fa(s.score) + '</span>' : '<span class="badge b-gray">تصحیح‌نشده</span>')
      + (s.annotated_key ? '<span class="badge b-blue">تصحیح‌شده</span>' : '')
      + '<div class="spacer"></div>'
      + '<button class="btn ghost sm" data-act="hw-grade" data-id="' + s.id + '">✏️ تصحیح</button>'
      + '</div>';
  }).join('');
  openModal(modalTpl('بارگذاری‌ها — ' + a.title,
    rows || empty('📓','هنوز کسی بارگذاری نکرده است',''), ''));
}

/* ─────────────── نمای دانش‌آموز ─────────────── */

function hwStudentView(){
  var u = S.user;
  var cls = classOf(u.id);
  if(!cls) return '<div class="card">' + empty('📓','برای شما کلاسی ثبت نشده','') + '</div>';
  var list = hwAssignmentsOfClass(cls.id);
  if(!list.length) return '<div class="card">' + empty('📓','تکلیفی ثبت نشده','دبیر هنوز تکلیفی نگذاشته است.') + '</div>';
  var h = '<div class="card"><div class="card-body" style="display:grid;gap:12px">';
  list.forEach(function(a){
    var sub = byId('subjects', a.subject_id) || {};
    var mine = db.hw_submissions.filter(function(s){
      return s.assignment_id===a.id && s.student_id===u.id;
    })[0];
    h += '<div style="border:1px solid var(--border);border-radius:12px;padding:14px">'
      + '<div class="row" style="flex-wrap:wrap;gap:8px">'
      + '<b>' + esc(a.title) + '</b>'
      + (sub.name ? '<span class="badge b-gray">' + esc(sub.name) + '</span>' : '')
      + (a.due_date ? '<span class="muted small">⏳ مهلت: ' + jalali(a.due_date) + '</span>' : '')
      + '</div>'
      + (a.description ? '<div class="small muted" style="margin-top:6px">' + esc(a.description) + '</div>' : '')
      + (mine
          ? '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">'
            + '<span class="badge b-blue">✅ بارگذاری شده — ' + esc(mine.file_name) + ' (' + idbSizeLabel(mine.size) + ')</span>'
            + (mine.score!=null
                ? '<span class="badge b-green">نمره: ' + fa(mine.score) + '</span>'
                : '<span class="badge b-amber">در انتظار تصحیح</span>')
            + '</div>'
          : '<div style="margin-top:10px">'
            + '<input type="file" id="hwfile_' + a.id + '" accept="image/*" class="input" />'
            + ' <button class="btn sm" data-act="hw-submit" data-id="' + a.id + '">⬆️ بارگذاری</button>'
            + '</div>')
      + '</div>';
  });
  return h + '</div></div>';
}

/* ─────────────── دادهٔ نمونه (قطعی، فقط دمو) ─────────────── */

function generateHomeworkDemo(){
  if(db.hw_assignments.length) return;
  var sc = db.schools.filter(function(s){ return s.active; })[0];
  if(!sc) return;
  var cls = db.classes.filter(function(c){ return c.school_id === sc.id; })[0];
  if(!cls) return;
  var t = db.users.filter(function(x){ return x.role === 'teacher' && x.school_id === sc.id; })[0];
  var sub = db.subjects.filter(function(x){ return x.school_id === sc.id; })[0];
  var now = new Date().toISOString();
  var a = add('hw_assignments', {
    school_id: sc.id, class_id: cls.id, subject_id: sub ? sub.id : 0,
    title: 'تکلیف فصل ۲', description: 'تمرین‌های ۱ تا ۵ را عکس بگیرید و بفرستید.',
    due_date: now.slice(0,10),
    created_at: now, created_by: t ? t.id : 0
  });
  var stud = db.users.filter(function(x){
    return x.role === 'student' && x.school_id === sc.id;
  })[0];
  if(!stud) return;
  /* تصویر دمو: یک PNG کوچک رنگی با canvas (اگر موجود باشد) */
  /* PNGِ ۱x۱ کدگذاری‌شده — دمو بدون وابستگی به canvas
     (jsdom canvas ندارد و خطای «not implemented» می‌زند) */
  var b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  try{
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for(var bi=0; bi<bin.length; bi++) bytes[bi] = bin.charCodeAt(bi);
    var blob = new Blob([bytes], {type: 'image/png'});
    hwDemoPut(a.id, stud.id, blob, now, t);
  }catch(e){}
}
function hwDemoPut(assignmentId, studentId, blob, now, t){
  if(!blob) return;
  var key = 'hw:demo:' + assignmentId;
  add('hw_submissions', {
    assignment_id: assignmentId, student_id: studentId,
    file_key: key, file_name: 'demo-homework.png',
    mime: 'image/png', size: blob.size,
    score: null, annotated_key: '',
    submitted_at: now, graded_at: '', graded_by: 0
  });
  vclassIdbPut(HW_STORE, key, blob); /* async؛ بدون backend بی‌صدا رد می‌شود */
}

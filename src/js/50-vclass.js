/* ═══════════════════════════════════════════════════════════════════
   کلاس مجازی — نسخهٔ سبک (طرح تأییدشده: docs/PLAN_VIRTUAL_CLASS.md)

   پایش میزبان ویدیوی زنده نمی‌شود. دو حالت:
     (الف) نشست «شاد» — لینک + زمان؛ اطلاع‌رسانی از صف پیام
     (ب) فایل/ویدیوی ضبط‌شده — آپلود در IndexedDB (ماژول
         49-vclass-idb.js) + توضیح + سؤالات متنی زیر آن

   پنل‌ها:
     • دبیر: مسیر `vclass` — فهرست کلاس‌ها، نشست جدید، حذف
     • دانش‌آموز: تب «کلاس مجازی» در پروندهٔ من
     • ولی: تب «کلاس مجازی» در پروندهٔ فرزند (فقط‌خوان)

   سقف نرم هر فایل: ۲۰ مگابایت + نمایش فضای باقی‌مانده.
   فایل در IDB می‌نشیند؛ در db فعلی فقط متادیتا.
   ═══════════════════════════════════════════════════════════════════ */

var VCLASS_STORE = 'vclass_files';

/** نشست‌های یک کلاس، تازه‌ترین اول */
function vclassSessionsOf(classId){
  return db.vclass_sessions
    .filter(function(s){ return s.class_id===classId; })
    .sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
}

/** آیا فایلِ این نشست هنوز در IDB هست؟ (فقط علامت‌گذاری؛ async) */
function vclassHasFile(session){
  if(!session || !session.file_key) return Promise.resolve(false);
  return vclassIdbGet(VCLASS_STORE, session.file_key).then(function(b){
    return !!b;
  });
}

/** سؤالات یک نشست */
function vclassQuestionsOf(sessionId){
  return db.vclass_questions
    .filter(function(q){ return q.session_id===sessionId; })
    .sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
}

/* ─────────────── مودال نشست جدید (دبیر) ─────────────── */

function vclassNewModal(classId){
  var cls = byId('classes', classId);
  if(!cls) return;
  window._vclassClass = classId;
  openModal(modalTpl('نشست جدید کلاس مجازی — ' + cls.name,
    f('عنوان *', inp('vc_title',''))
    + f('نوع نشست', sel('vc_type', [['shad','لینک جلسهٔ شاد'],['video','فایل/ویدیوی ضبط‌شده']], 'shad'))
    + '<div id="vc_shad" class="grid g2" style="margin-top:8px">'
    +   f('لینک شاد *', inp('vc_url',''))
    +   f('زمان جلسه', inp('vc_time','','datetime-local'))
    + '</div>'
    + '<div id="vc_video" style="display:none;margin-top:8px">'
    +   f('فایل ویدیو * (حداکثر ' + idbSizeLabel(VCLASS_FILE_CAP) + ')',
      '<input type="file" id="vc_file" class="input" accept="video/*,audio/*,.pdf,.ppt,.doc,.docx" />')
    +   f('توضیح زیر ویدیو', inp('vc_desc',''))
    + '</div>'
    + '<div class="small muted" style="margin-top:8px" id="vc_space">…</div>',
    'vclass-save'));
  /* جابه‌جایی بخش‌ها با نوع */
  document.getElementById('vc_type').onchange = function(){
    var shad = this.value === 'shad';
    document.getElementById('vc_shad').style.display = shad ? '' : 'none';
    document.getElementById('vc_video').style.display = shad ? 'none' : '';
  };
  /* فضای باقی‌مانده (async) */
  vclassIdbSpace().then(function(sp){
    var el = document.getElementById('vc_space');
    if(!el) return;
    el.innerHTML = 'فضای ذخیرهٔ فایل: ' + (sp.known
      ? idbSizeLabel(sp.usage) + ' از ' + idbSizeLabel(sp.quota) + ' (باقی‌ماندهٔ تقریبی ' + idbSizeLabel(sp.left) + ')'
      : 'تقریباً ' + idbSizeLabel(sp.left) + ' (تخمین)');
  });
}

/* ─────────────── ساخت نشست ─────────────── */

/**
 * ساخت نشست + (در صورت ویدیو) آپلود فایل در IDB + اطلاع‌رسانی کلاس.
 * @returns {Promise<{ok:boolean,msg?:string,rec?:object}>}
 */
function vclassCreateSession(opts, file){
  var cls = byId('classes', opts.classId);
  if(!cls) return Promise.resolve({ok:false, msg:'کلاس یافت نشد'});
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  /* 🔴 فقط دبیرِ کلاس یا مدیر */
  var isTeacher = role === 'teacher' && teacherClasses(u.id).some(function(c){ return c.id === cls.id; });
  if(!(isTeacher || role === 'manager' || role === 'superadmin'))
    return Promise.resolve({ok:false, msg:'شما دبیر این کلاس نیستید'});
  var rec = {
    school_id: cls.school_id, class_id: cls.id,
    type: opts.type === 'video' ? 'video' : 'shad',
    title: opts.title,
    shad_url: opts.type === 'shad' ? (opts.url || '') : '',
    shad_time: opts.type === 'shad' ? (opts.time || '') : '',
    file_key: '', file_name: '', mime: '', size: 0,
    description: opts.type === 'video' ? (opts.desc || '') : '',
    created_at: new Date().toISOString(), created_by: u.id
  };
  var chain = Promise.resolve(true);
  if(opts.type === 'video' && file){
    if(vclassOverCap(file.size))
      return Promise.resolve({ok:false, msg:'حجم فایل از ' + idbSizeLabel(VCLASS_FILE_CAP) + ' بیشتر است'});
    rec.file_key = 'vclass:' + Date.now() + ':' + Math.floor(Math.random() * 1e6);
    rec.file_name = file.name || 'file';
    rec.mime = file.type || '';
    rec.size = file.size;
    chain = vclassIdbPut(VCLASS_STORE, rec.file_key, file);
  }
  return chain.then(function(ok){
    if(ok === false) return {ok:false, msg:'فایل در ذخیره‌گاه ثبت نشد'};
    var inserted = insert('vclass_sessions', rec);
    /* اطلاع‌رسانی کلاس از صف موجود (نوع event) */
    vclassNotifyClass(cls, rec.title, rec.type);
    return {ok:true, rec:inserted};
  });
}

/** آیا حجم فایل به سقف نرم می‌رسد یا از آن می‌گذرد؟ (تابع خالص برای تست/جهش) */
function vclassOverCap(bytes){
  return (bytes == null || bytes >= VCLASS_FILE_CAP);
}

/** اطلاع‌رسانی به همهٔ اولیای کلاس (از صف پیام، نوع event) */
function vclassNotifyClass(cls, title, type){
  if(typeof notifySettings !== 'function') return;
  var cfg = notifySettings(cls.school_id);
  if(!cfg.enabled || cfg.kinds.event === false) return;
  var pids = [];
  db.enrollments.filter(function(e){ return e.class_id === cls.id; })
    .forEach(function(e){
      notifyParentsOf(e.student_id).forEach(function(p){
        if(pids.indexOf(p) < 0) pids.push(p);
      });
    });
  if(!pids.length) return;
  notifyRequest({
    school_id: cls.school_id, kind: 'event', parent_ids: pids,
    body: 'اولیای گرامی، در کلاس ' + cls.name + ' نشست «' + title +
          '» کلاس مجازی ثبت شد (' + (type === 'shad' ? 'لینک شاد' : 'فایل ضبط‌شده') + '). ' +
          notifySchoolName(cls.school_id)
  });
}

/* ─────────────── نمای دبیر ─────────────── */

function viewVclass(){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  var clsList = (role === 'teacher') ? teacherClasses(u.id)
             : db.classes.filter(function(c){ return c.school_id === u.school_id; });
  var h = '<div class="page-head"><h2>🖥️ کلاس مجازی</h2></div>'
    + '<div class="small muted" style="margin-bottom:14px">'
    + 'پایش میزبان ویدیوی زنده نیست: یا لینک جلسهٔ شاد ثبت می‌شود، یا فایل/ویدیوی ضبط‌شده + سؤالات متنی. '
    + 'هر دانش‌آموز یک <b>لینکِ اختصاصی</b> دارد: با باز کردنِ آن وارد کلاس می‌شود و حضورش خودکار ثبت می‌شود (مرحلهٔ بعد: اتصال به اتاق شاد — قفل ۱۲.۱). '
    + 'فایل‌ها در IndexedDB ذخیره می‌شوند (سقف نرم ' + idbSizeLabel(VCLASS_FILE_CAP) + ' برای هر فایل).</div>'
  + ((typeof virtualModeBanner==='function') ? virtualModeBanner() : '');
  if(!clsList.length){
    return h + '<div class="card">' + empty('🖥️','کلاسی در دسترس نیست','') + '</div>';
  }
  clsList.forEach(function(c){
    var list = vclassSessionsOf(c.id);
    h += '<div class="card"><div class="card-head">'
      + '<h3>' + esc(c.name) + '</h3>'
      + (role !== 'student'
          ? '<button class="btn sm" data-act="vclass-new" data-id="' + c.id + '">➕ نشست جدید</button>'
          : '')
      + '</div><div class="card-body">';
    if(!list.length){
      h += empty('🖥️','نشستی ثبت نشده','دکمهٔ «نشست جدید» را بزنید.');
    } else {
      h += '<div style="display:grid;gap:10px">' + list.map(function(s){
        var qs = vclassQuestionsOf(s.id);
        var att = vclassParticipantsOf(s.id);
        var now = vclassPresentNow(s.id);
        return '<div class="row" style="border:1px solid var(--border);border-radius:10px;padding:10px 14px;flex-wrap:wrap;gap:8px">'
          + '<span class="badge ' + (s.type === 'shad' ? 'b-blue' : 'b-purple') + '">'
          + (s.type === 'shad' ? '🔗 شاد' : '🎬 ویدیو') + '</span>'
          + '<b>' + esc(s.title) + '</b>'
          + (s.shad_time ? '<span class="muted small">🕐 ' + esc(s.shad_time) + '</span>' : '')
          + (s.size ? '<span class="muted small">' + idbSizeLabel(s.size) + '</span>' : '')
          + (att.length ? '<span class="badge b-green">🟢 الان: ' + fa(now.length) + '</span><span class="badge b-gray">شرکت‌کردن: ' + fa(att.length) + '</span>' : '')
          + '<span class="muted small">' + jalali(s.created_at) + '</span>'
          + (qs.length ? '<span class="badge b-amber">❓ ' + fa(qs.length) + ' سؤال</span>' : '')
          + '<div class="spacer"></div>'
          + (s.type === 'shad' && s.shad_url
              ? '<a class="btn ghost sm" href="' + escAttr(s.shad_url) + '" target="_blank" rel="noopener">ورود به شاد</a>'
              : (s.file_key
                  ? '<button class="btn ghost sm" data-act="vclass-play" data-id="' + s.id + '">پخش</button>' : ''))
          + (role === 'student'
              ? (function(){
                  var _a = vclassAttOf(s.id, u.id);
                  return (_a && !_a.left_at)
                    ? '<button class="btn ghost sm" data-act="vc-leave" data-id="' + s.id + '">🚪 خروج از کلاس</button>'
                    : '';
                })()
              : '')
          + (role !== 'student'
              ? '<button class="btn ghost sm" data-act="vclass-links" data-id="' + s.id + '">🔗 لینک‌ها</button>'
              : '')
          + (role !== 'student'
              ? '<button class="btn ghost sm" data-act="vclass-del" data-id="' + s.id + '">حذف</button>'
              : '')
          + '</div>'
          /* سؤالات (دبیر/مدیر: همه + پاسخ‌گویی) */
          + (qs.length ? '<div style="display:grid;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)">'
            + qs.map(function(q){
                var st = byId('users', q.student_id) || {};
                return '<div class="row" style="gap:8px;flex-wrap:wrap">'
                  + '<span class="small muted">سؤال ' + esc(st.full_name || '—') + ':</span>'
                  + '<span class="small">' + esc(q.body) + '</span>'
                  + (q.answer
                      ? '<span class="badge b-green">پاسخ: ' + esc(q.answer) + '</span>'
                      : (role === 'teacher' || role === 'manager'
                          ? '<button class="btn ghost sm" data-act="vclass-q-answer" data-id="' + q.id + '">پاسخ</button>'
                          : '<span class="badge b-gray">در انتظار پاسخ</span>'))
                  + '</div>';
              }).join('') + '</div>' : '')
        + '</div>';
      }).join('') + '</div>';
    }
    return h + '</div></div>';
  });
  return h;
}

/* ─────────────── تب پرونده (دانش‌آموز/ولی) ─────────────── */

function vclassRecordTab(sid){
  var cls = classOf(sid);
  var isParent = (typeof activePersona === 'function' ? activePersona() : S.user.role) === 'parent';
  if(!cls) return empty('🖥️','برای این دانش‌آموز کلاسی ثبت نشده','');
  var list = vclassSessionsOf(cls.id);
  var h = '<div class="card-body" style="display:grid;gap:12px">';
  if(!list.length) return '<div>' + empty('🖥️','نشستی برای کلاس ثبت نشده','دبیر هنوز نشستی ثبت نکرده است.') + '</div>';
  list.forEach(function(s){
    h += '<div style="border:1px solid var(--border);border-radius:12px;padding:14px">'
      + '<div class="row" style="flex-wrap:wrap;gap:8px">'
      + '<span class="badge ' + (s.type === 'shad' ? 'b-blue' : 'b-purple') + '">'
      + (s.type === 'shad' ? '🔗 شاد' : '🎬 ویدیو') + '</span>'
      + '<b>' + esc(s.title) + '</b>'
      + '<span class="muted small">' + jalali(s.created_at) + '</span></div>'
      + (s.type === 'shad'
          ? '<div class="row" style="margin-top:10px;gap:8px">'
            + (s.shad_time ? '<span class="small muted">🕐 زمان: ' + esc(s.shad_time) + '</span>' : '')
            + (s.shad_url
                ? '<a class="btn sm" href="' + escAttr(s.shad_url) + '" target="_blank" rel="noopener">ورود به جلسهٔ شاد</a>'
                : '<span class="small muted">لینک ثبت نشده</span>')
            + '</div>'
          : '<div style="margin-top:10px;display:grid;gap:8px">'
            + (s.description ? '<div class="small muted">' + esc(s.description) + '</div>' : '')
            + (s.file_key
                ? '<button class="btn sm" data-act="vclass-play" data-id="' + s.id + '">▶️ پخش فایل (' + idbSizeLabel(s.size) + ')</button>'
                : '<span class="small muted">فایل در دسترس نیست</span>')
            + '</div>')
      + (typeof vclassAttCard === 'function' ? vclassAttCard(s, sid) : '')
      + '</div>';
    /* سؤالات — هر کس (دانش‌آموز یا ولی) فقط سؤالات خودِ فرزند/دانش‌آموز را می‌بیند */
    var qs = vclassQuestionsOf(s.id).filter(function(q){ return q.student_id === sid; });
    if(!isParent){
      h += '<div style="margin-top:10px"><button class="btn ghost sm" data-act="vclass-q-ask" data-id="' + s.id + '">❓ سؤال بپرس</button></div>';
    }
    if(qs.length){
      h += '<div style="display:grid;gap:6px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">'
        + qs.map(function(q){
            return '<div class="row" style="gap:8px;flex-wrap:wrap">'
              + '<span class="small">' + esc(q.body) + '</span>'
              + (q.answer
                  ? '<span class="badge b-green">پاسخ دبیر: ' + esc(q.answer) + '</span>'
                  : '<span class="badge b-gray">در انتظار پاسخ</span>')
              + '</div>';
          }).join('') + '</div>';
    }
  });
  return h + '</div>';
}

/* ─────────────── دادهٔ نمونه (قطعی، فقط دمو) ─────────────── */

function generateVclassDemo(){
  if(db.vclass_sessions.length) return;
  var sc = db.schools.filter(function(s){ return s.active; })[0];
  if(!sc) return;
  var cls = db.classes.filter(function(c){ return c.school_id === sc.id; })[0];
  if(!cls) return;
  var t = db.users.filter(function(x){ return x.role === 'teacher' && x.school_id === sc.id; })[0];
  var now = new Date().toISOString();
  var s1 = add('vclass_sessions', {
    school_id: sc.id, class_id: cls.id, type: 'shad',
    title: 'جلسهٔ مرور ریاضی', shad_url: 'https://shad.ir/class/123',
    shad_time: now.slice(0,16) + ':00', file_key:'', file_name:'', mime:'', size:0,
    description:'', created_at: now, created_by: t ? t.id : 0
  });
  /* فایل دمو: چند کیلوبایت بایت (پخش واقعی ندارد ولی مکانیزم کامل است) */
  var blob = null;
  try{ blob = new Blob([new Uint8Array(2048).fill(7)], {type:'video/mp4'}); }catch(e){}
  var key = 'vclass:demo:' + s1.id;
  add('vclass_sessions', {
    school_id: sc.id, class_id: cls.id, type: 'video',
    title: 'ویدیوی توضیح فصل ۲', shad_url:'', shad_time:'',
    file_key: key, file_name: 'demo-lesson.mp4', mime: 'video/mp4', size: blob ? 2048 : 0,
    description: 'مرور کلی فصل دوم با تمرین‌ها',
    created_at: now, created_by: t ? t.id : 0
  }).id;
  var s2 = db.vclass_sessions[db.vclass_sessions.length - 1];
  if(blob && typeof vclassIdbPut === 'function'){
    vclassIdbPut(VCLASS_STORE, key, blob); /* async؛ اگر backend نباشد بی‌صدا رد می‌شود */
  }
  var studs = db.users.filter(function(x){
    return x.role === 'student' && x.school_id === sc.id;
  });
  /* بند ۱۲: حضورِ خودکار — یکی الان داخل، یکی شرکت‌کرده و خارج */
  if(studs.length && !db.vclass_attendance.length){
    add('vclass_attendance', {session_id: s1.id, student_id: studs[0].id,
      joined_at: now.slice(0,11) + '10:00', left_at: '', by: studs[0].id});
    if(studs.length > 1) add('vclass_attendance', {session_id: s1.id, student_id: studs[1].id,
      joined_at: now.slice(0,11) + '08:00', left_at: now.slice(0,11) + '11:30', by: studs[1].id});
  }
  if(studs.length){
    add('vclass_questions', {
      session_id: s2.id, student_id: studs[0].id,
      body: 'سؤال ۳ تمرین را کامل نکردم، می‌شود توضیح دهید؟',
      created_at: now, answer: 'بله، جلسهٔ بعد توضیح می‌دهم.', answered_at: now, answered_by: t ? t.id : 0
    });
    if(studs.length > 1){
      add('vclass_questions', {
        session_id: s2.id, student_id: studs[1].id,
        body: 'ویدیو را دوباره می‌توانم ببینم؟',
        created_at: now, answer: '', answered_at: '', answered_by: 0
      });
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   افزودۀ بند ۱۲ — حضورِ خودکارِ کلاس مجازی (شاد/ویدیو)

   «فضای کلاس توی پایش اجرا می‌شود؛ حضور و غیاب اتوماتیک است:
   دانش‌آموز با ورود به کلاس حاضر و با خروجش مشخص می‌شود و در
   پرونده درج می‌شود.»

   جدول: vclass_attendance{session_id, student_id, joined_at,
   left_at, by} — یک ردیف برای هر (نشست، دانش‌آموز)؛ ورود =
   ثبت joined_at (یا بازموردن = پاک‌کردن left_at)، خروج = ثبت
   left_at. «حالا داخل کلاس» = joined_at دارد و left_at خالی است.
   نمایش: تب کلاس مجازیِ پرونده (دانش‌آموز/ولی) + شمارندهٔ
   شرکت‌کنندگان در نمای دبیر.

   🔴 ورود/خروج فقط خودِ دانش‌آموز و فقط نشستِ کلاس خودش
   (روی داده، نه فقط دکمه).
   ═══════════════════════════════════════════════════════════════════ */

/** ردیفِ شرکتِ یک دانش‌آموز در یک نشست (یا null) */
function vclassAttOf(sessionId, studentId){
  for(var i=0;i<db.vclass_attendance.length;i++){
    var a = db.vclass_attendance[i];
    if(a.session_id===sessionId && a.student_id===studentId) return a;
  }
  return null;
}
/** همهٔ شرکت‌کنندگان یک نشست (تازه‌ترین joined اول) */
function vclassParticipantsOf(sessionId){
  return db.vclass_attendance
    .filter(function(a){ return a.session_id===sessionId; })
    .sort(function(a,b){ return (b.joined_at||'').localeCompare(a.joined_at||''); });
}
/** حالا داخل کلاس (joined و left خالی) */
function vclassPresentNow(sessionId){
  return vclassParticipantsOf(sessionId).filter(function(a){ return !a.left_at; });
}

/** ورود به کلاس (حضورِ خودکار) — فقط دانش‌آموزِ کلاسِ نشست */
function vclassJoin(sessionId){
  var s = byId('vclass_sessions', sessionId);
  if(!s) return {ok:false, msg:'نشست یافت نشد'};
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  if(role!=='student') return {ok:false, msg:'فقط دانش‌آموز می‌تواند وارد کلاس شود'};
  var cls = byId('classes', s.class_id);
  var myCls = classOf(u.id);
  if(!cls || !myCls || myCls.id!==cls.id)
    return {ok:false, msg:'این نشست مربوط به کلاس شما نیست'};
  var now = new Date().toISOString();
  var existing = vclassAttOf(sessionId, u.id);
  if(existing && !existing.left_at) return {ok:false, msg:'شما همین الان داخل کلاس هستید'};
  if(existing){
    /* بازموردن: left پاک و joined تازه */
    update('vclass_attendance', existing.id, {joined_at: now, left_at: '', by: u.id});
    return {ok:true, rec: byId('vclass_attendance', existing.id)};
  }
  var rec = {session_id: sessionId, student_id: u.id,
             joined_at: now, left_at: '', by: u.id};
  return {ok:true, rec: insert('vclass_attendance', rec)};
}

/** خروج از کلاس — فقط اگر هنوز داخل است */
function vclassLeave(sessionId){
  var s = byId('vclass_sessions', sessionId);
  if(!s) return {ok:false, msg:'نشست یافت نشد'};
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  if(role!=='student') return {ok:false, msg:'فقط دانش‌آموز می‌تواند از کلاس خارج شود'};
  var existing = vclassAttOf(sessionId, u.id);
  if(!existing || !existing.joined_at) return {ok:false, msg:'شما وارد کلاس نشده‌اید'};
  if(existing.left_at) return {ok:false, msg:'شما قبلاً از کلاس خارج شده‌اید'};
  update('vclass_attendance', existing.id, {left_at: new Date().toISOString(), by: u.id});
  return {ok:true};
}

/** کارتِ شرکتِ من در تب پرونده (دانش‌آموز: با دکمه؛ ولی: فقط‌خوان) */
function vclassAttCard(session, sid){
  var isParent = (typeof activePersona === 'function' ? activePersona() : S.user.role) === 'parent';
  var a = vclassAttOf(session.id, sid);
  var h = '<div style="margin-top:10px;padding:10px 12px;border:1px dashed var(--border);border-radius:10px">'
    + '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">';
  if(a && !a.left_at){
    h += '<span class="badge b-green">🟢 الان داخل کلاس — از ' + fa((a.joined_at||'').slice(11,16)) + '</span>';
  } else if(a && a.left_at){
    h += '<span class="badge b-gray">✅ شرکت‌کرد — ' + fa((a.joined_at||'').slice(11,16)) + ' تا ' + fa((a.left_at||'').slice(11,16)) + '</span>';
  } else {
    h += '<span class="badge b-amber">هنوز وارد نشده</span>';
  }
  h += '<div class="spacer"></div>';
  if(!isParent){
    if(a && !a.left_at){
      h += '<button class="btn ghost sm" data-act="vc-leave" data-id="' + session.id + '">🚪 خروج از کلاس</button>';
    } else {
      h += '<button class="btn sm" data-act="vc-join" data-id="' + session.id + '">🚪 ورود به کلاس (حضورِ خودکار)</button>';
    }
  }
  var _link = vclassLinkEnsure(session.id, sid);
  h += '<div class="row" style="gap:8px;align-items:center;margin-top:8px">'
    + '<span class="small muted">🔗 لینکِ اختصاصی:</span>'
    + '<code class="small" style="direction:ltr">' + esc(_link.token) + '</code>'
    + '<button class="btn ghost sm" data-act="vclass-link-copy" data-id="' + _link.id + '">کپی</button>'
    + '</div>';
  return h + '</div></div>';
}

/* ═══════════════════════════════════════════════════════════════════
   بند ۱۵ (اصلِ واقعیت) — لینکِ اختصاصیِ واقعیِ هر دانش‌آموز

   «حضورِ خودکار» واقعی: هر دانش‌آموز برای هر نشست یک لینکِ
   اختصاصی دارد (جدول vclass_links، توکنِ قطعی از hash). وقتی
   دانش‌آموز لینکش را باز کند، واردِ همان نشست می‌شود و حضورش
   ثبت می‌شود (vclassJoinLink) — با همهٔ گاردهای روی داده
   (فقط مالکِ لینک + فقط دانش‌آموز + فقط کلاسِ خودش). خروج هم
   واقعی است (دکمهٔ خروج / لینکِ بعدی). مرحلهٔ باقی‌مانده:
   تشخیصِ حضورِ واقعی از داخلِ اتاق شاد (API/سرور) — قفل ۱۲.۱.
   ═══════════════════════════════════════════════════════════════════ */

const VC_LINK_PREFIX = 'vc-';

/** hash قطعی djb2 → base36 (توکنِ بدونِ تصادف؛ در سرورِ واقعی:
    توکنِ نامشخصِ سمت سرور — ساختارِ جدول دست‌نخورده) */
function vclassHash36(str){
  var h = 5381;
  for(var i=0;i<str.length;i++){ h = ((h<<5)+h+str.charCodeAt(i))|0; }
  return (h>>>0).toString(36);
}
function vclassLinkOf(sessionId, studentId){
  for(var i=0;i<db.vclass_links.length;i++){
    var l = db.vclass_links[i];
    if(l.session_id===sessionId && l.student_id===studentId) return l;
  }
  return null;
}
/** لینکِ اختصاصی (ساختِ به‌تأخیر، upsert بر پایهٔ نشست+دانش‌آموز) */
function vclassLinkEnsure(sessionId, studentId){
  var existing = vclassLinkOf(sessionId, studentId);
  if(existing) return existing;
  var token = VC_LINK_PREFIX + vclassHash36(sessionId + ':' + studentId);
  return insert('vclass_links', {
    session_id: sessionId, student_id: studentId, token: token,
    created_at: new Date().toISOString()
  });
}
/** آدرسِ کاملِ لینک (در پوستهٔ دمو: همین فایل + hash) */
function vclassLinkFullUrl(link){
  var base = (typeof location!=='undefined' && location.href) ? String(location.href).split('#')[0] : 'index.html';
  return base + '#' + link.token;
}
/** ورود از لینک: فقط مالک + گاردهای عادیِ حضور */
function vclassJoinLink(token){
  var t = String(token||'').replace(/^#/,'');
  var link = null;
  for(var i=0;i<db.vclass_links.length;i++){
    if(db.vclass_links[i].token===t){ link = db.vclass_links[i]; break; }
  }
  if(!link) return {ok:false, msg:'این لینک معتبر نیست'};
  var s = byId('vclass_sessions', link.session_id);
  if(!s) return {ok:false, msg:'این نشست دیگر وجود ندارد'};
  var u = S.user;
  if(!u) return {ok:false, msg:'وارد نشده‌اید'};
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  if(role !== 'student') return {ok:false, msg:'فقط دانش‌آموز می‌تواند با لینکِ اختصاصی وارد شود'};
  if(u.id !== link.student_id) return {ok:false, msg:'این لینک متعلق به دانش‌آموز دیگری است'};
  var r = vclassJoin(s.id);
  if(!r.ok) return r;
  return {ok:true, rec:r.rec, session:s};
}
/** خودکار: وقتی صفحه با hashِ لینک باز می‌شود (بارگذاری/تغییر hash) */
function vclassAutoJoinFromHash(){
  if(typeof location === 'undefined') return;
  var h = String(location.hash||'').replace(/^#/,'');
  if(h.indexOf(VC_LINK_PREFIX) !== 0) return;
  var r = vclassJoinLink(h);
  if(!r.ok){ toast(r.msg,'err'); return; }
  toast('🚪 وارد کلاس مجازی شدید — حضور شما ثبت شد','ok');
  S.route = 'vclass'; S.filters = {}; S.page = 1;
  render();
}
/** مودالِ لینک‌های اختصاصی (دبیرِ کلاس/مدیر مدرسه/سوپرادمین — گارد روی داده) */
function vclassLinksModal(sessionId){
  var s = byId('vclass_sessions', sessionId);
  if(!s) return;
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  var cls = byId('classes', s.class_id);
  if(role === 'teacher'){
    if(!(cls && teacherClasses(u.id).some(function(c){ return c.id===cls.id; })))
      return toast('شما فقط لینکِ کلاس‌های خودتان را می‌توانید ببینید','err');
  } else if(role === 'manager'){
    if(!(cls && cls.school_id === u.school_id))
      return toast('این نشست متعلق به مدرسهٔ شما نیست','err');
  } else if(role !== 'superadmin'){
    return;
  }
  var studs = studentsOfClass(s.class_id);
  var body = '<div class="small muted" style="margin-bottom:8px">لینکِ اختصاصیِ هر دانش‌آموز: وقتی بازش کند وارد این نشست می‌شود و حضورش خودکار ثبت می‌شود. (مرحلهٔ بعد: اتصالِ مستقیم به اتاق شاد — قفل ۱۲.۱)</div>'
    + '<div style="display:grid;gap:6px;max-height:55vh;overflow:auto">';
  studs.forEach(function(st){
    var l = vclassLinkEnsure(s.id, st.id);
    body += '<div class="row" style="gap:8px;align-items:center">'
      + '<b class="small" style="min-width:110px;max-width:110px;overflow:hidden;text-overflow:ellipsis">' + esc(st.full_name) + '</b>'
      + '<code class="small" style="direction:ltr;flex:1;overflow:hidden;text-overflow:ellipsis">' + esc(l.token) + '</code>'
      + '<button class="btn ghost sm" data-act="vclass-link-copy" data-id="' + l.id + '">کپی</button>'
      + '</div>';
  });
  openModal(modalTpl('لینک‌های اختصاصی — ' + s.title, body + '</div>', ''));
}

/* ═══════════════════════════════════════════════════════════════════
   کتابخانهٔ مدرسه (بند ۸) — نسخهٔ سبک

   فهرست کتاب‌ها + امانت به دانش‌آموز + بازگشت.
   هر کتاب یک ردیف است (کپی متعدد = چند بار امانت هم‌زمان).

   داده:
     lib_books  {school_id, title, author, code, serial, isbn, location,
                 total_copies, created_at}
     serial = شمارهٔ سریالِ فیزیکیِ کتاب (اختیاری، در هر مدرسه یکتا)
     isbn/location = اختیاری (شابک/محلِ قفسه)
     total_copies = سقفِ امانتِ هم‌زمان (۰/خالی = نامحدود، سازگار با قدیم)
     lib_loans  {school_id, book_id, student_id, loan_at, due_at,
                 returned_at, registered_by, created_at}

   وضعیت (محاسبه‌شده، ذخیره نمی‌شود):
     • بازگشته   = returned_at دارد
     • امانت‌رفته = بازگشت ندارد و هنوز به مهلت نرسیده
     • دیرکرد    = بازگشت ندارد و از مهلت گذشته
   وضعیت کتاب = اگر امانتِ فعالِ دیرکرد داشته «دیرکرد»،
   اگر امانتِ فعال داشته «امانت‌رفته» (با نام و مهلت)،
   وگرنه «در دسترس».

   امنیت: کتاب (ثبت/ویرایش/حذف) فقط **مدیر**؛ امانت/بازگشت مدیر یا
   **کتابدار** (دبیرِ همان مدرسه با پرچمِ تفویضیِ users.lib_staff=1 که
   مدیر می‌دهد/پس‌می‌گیرد)؛ دانش‌آموز فقط کتاب‌ها + امانتِ خودش را
   می‌بیند. ردیف‌ها باید از مدرسهٔ خودِ عامل + دانش‌آموزِ همان مدرسه
   (روی داده، نه فقط دکمه). سرور همین را آینه می‌کند (sync.js).
   ═══════════════════════════════════════════════════════════════════ */

var LIB_DEFAULT_DAYS = 14; /* مهلت پیش‌فرض امانت: ۱۴ روز */

function libBooksOf(schoolId){
  return db.lib_books
    .filter(function(b){ return b.school_id === schoolId; })
    .sort(function(a,b){ return (a.title||'').localeCompare(b.title||'', 'fa'); });
}
function libLoansOf(bookId){
  return db.lib_loans
    .filter(function(l){ return l.book_id === bookId; })
    .sort(function(a,b){ return (b.loan_at||'').localeCompare(a.loan_at||''); });
}
function libLoanStatus(l, nowIso){
  if(!l) return 'none';
  if(l.returned_at) return 'returned';
  var due = (l.due_at||'').slice(0,10);
  var today = (nowIso || new Date().toISOString()).slice(0,10);
  return due && today > due ? 'late' : 'loaned';
}
/** وضعیتِ نمایشیِ یک کتاب (جدول فهرست) */
function libBookStatus(bookId, nowIso){
  var actives = libLoansOf(bookId).filter(function(l){ return !l.returned_at; });
  if(!actives.length) return {key:'free', label:'در دسترس'};
  var late = actives.find(function(l){ return libLoanStatus(l, nowIso)==='late'; });
  var pick = late || actives[0];
  var stu = byId('users', pick.student_id) || {};
  var due = (pick.due_at||'').slice(0,10);
  return late
    ? {key:'late', label:'دیرکرد — ' + (stu.full_name||'؟') + ' (مهلت: ' + (typeof jalali==='function'?jalali(due):due) + ')'}
    : {key:'loaned', label:'امانت‌رفته — ' + (stu.full_name||'؟') + ' (تا ' + (typeof jalali==='function'?jalali(due):due) + ')'};
}

/* کتابدار = دبیرِ دارای پرچمِ تفویضیِ مدیر (users.lib_staff=1، همان مدرسه) */
function libStaffCan(u){
  if(!u) return false;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role === 'manager' || role === 'superadmin') return true;
  return role === 'teacher' && u.lib_staff === 1 && !!u.school_id;
}
/* امانتِ فعال + موجودی (total<=0 یعنی نامحدود — رفتارِ قدیم) */
function libActiveCount(bookId){
  return libLoansOf(bookId).filter(function(l){ return !l.returned_at; }).length;
}
function libAvail(bookId){
  var b = byId('lib_books', bookId);
  if(!b) return 0;
  var total = Number(b.total_copies) || 0;
  if(total <= 0) return 9999;
  return Math.max(0, total - libActiveCount(bookId));
}

/* ─────────────── کتاب (مدیر) ─────────────── */

function libAddBook(title, author, code, serial, extra){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند کتاب ثبت کند'};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  title = String(title || '').trim();
  if(!title) return {ok:false, msg:'عنوان کتاب خالی است'};
  serial = String(serial || '').trim();
  if(serial && db.lib_books.some(function(x){ return x.school_id===u.school_id && x.serial===serial; }))
    return {ok:false, msg:'این شمارهٔ سریال برای کتاب دیگری در همین مدرسه ثبت شده است'};
  extra = extra || {};
  var total = Math.floor(Number(extra.total_copies) || 0);
  if(total < 0) total = 0;
  var rec = {
    school_id: u.school_id,
    title: title,
    author: String(author || '').trim(),
    code: String(code || '').trim(),
    serial: serial,
    isbn: String(extra.isbn || '').trim(),
    location: String(extra.location || '').trim(),
    total_copies: total,
    created_at: new Date().toISOString()
  };
  return {ok:true, rec: insert('lib_books', rec)};
}
/* ویرایشِ کتاب (مدیر) — patch با کلیدهای مجاز؛ total از امانتِ فعال کمتر نشود */
function libEditBook(bookId, patch){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند کتاب را ویرایش کند'};
  var b = byId('lib_books', bookId);
  if(!b) return {ok:false, msg:'کتاب پیدا نشد'};
  if(b.school_id !== u.school_id) return {ok:false, msg:'این کتاب متعلق به مدرسهٔ شما نیست'};
  patch = patch || {};
  var upd = {};
  ['title','author','code','isbn','location'].forEach(function(k){
    if(patch[k] !== undefined) upd[k] = String(patch[k] || '').trim();
  });
  if(upd.title !== undefined && !upd.title) return {ok:false, msg:'عنوان کتاب خالی است'};
  if(patch.serial !== undefined){
    var serial = String(patch.serial || '').trim();
    if(serial && db.lib_books.some(function(x){ return x.school_id===b.school_id && x.serial===serial && x.id!==bookId; }))
      return {ok:false, msg:'این شمارهٔ سریال برای کتاب دیگری در همین مدرسه ثبت شده است'};
    upd.serial = serial;
  }
  if(patch.total_copies !== undefined){
    var total = Math.floor(Number(patch.total_copies) || 0);
    if(total < 0) total = 0;
    if(total > 0 && total < libActiveCount(bookId))
      return {ok:false, msg:'سقفِ نسخه‌ها از امانتِ فعال کمتر است'};
    upd.total_copies = total;
  }
  update('lib_books', bookId, upd);
  return {ok:true};
}
/* تفویض/لغوِ کتابداری به دبیرِ همان مدرسه (مدیر) */
function libSetStaff(userId, on){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند کتابدار تعیین کند'};
  var t = byId('users', userId);
  if(!t || t.role !== 'teacher') return {ok:false, msg:'فقط دبیر می‌تواند کتابدار شود'};
  if(t.school_id !== u.school_id) return {ok:false, msg:'این دبیر متعلق به مدرسهٔ شما نیست'};
  update('users', userId, {lib_staff: on ? 1 : 0});
  return {ok:true};
}
function libSetSerial(bookId, serial){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند سریال را ویرایش کند'};
  var b = byId('lib_books', bookId);
  if(!b) return {ok:false, msg:'کتاب پیدا نشد'};
  if(b.school_id !== u.school_id) return {ok:false, msg:'این کتاب متعلق به مدرسهٔ شما نیست'};
  serial = String(serial || '').trim();
  if(serial && db.lib_books.some(function(x){ return x.school_id===b.school_id && x.serial===serial && x.id!==bookId; }))
    return {ok:false, msg:'این شمارهٔ سریال برای کتاب دیگری در همین مدرسه ثبت شده است'};
  update('lib_books', bookId, {serial: serial});
  return {ok:true};
}
function libDelBook(bookId){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند کتاب حذف کند'};
  var b = byId('lib_books', bookId);
  if(!b) return {ok:false, msg:'کتاب پیدا نشد'};
  if(b.school_id !== u.school_id) return {ok:false, msg:'این کتاب متعلق به مدرسهٔ شما نیست'};
  var actives = libLoansOf(bookId).filter(function(l){ return !l.returned_at; });
  if(actives.length) return {ok:false, msg:'این کتاب هنوز امانت‌رفته است — اول بازگشتش را ثبت کنید'};
  libLoansOf(bookId).forEach(function(l){ remove('lib_loans', l.id); });
  remove('lib_books', bookId);
  return {ok:true};
}

/* ─────────────── امانت (مدیر) ─────────────── */

function libLend(bookId, studentId, dueDate){
  var u = S.user;
  if(!libStaffCan(u)) return {ok:false, msg:'امانت فقط با مدیر یا کتابدارِ دارای مجوز است'};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  /* بند ۱۶: روزِ غیرحضوری، کتابخانهٔ فیزیکی کار نمی‌کند */
  if(typeof schoolVirtual==='function' && schoolVirtual(u.school_id, todayISO()))
    return {ok:false, msg:'امروز مدرسه غیرحضوری است؛ امانت کتاب انجام نمی‌شود (مسدود)'};
  var b = byId('lib_books', bookId);
  if(!b) return {ok:false, msg:'کتاب پیدا نشد'};
  if(b.school_id !== u.school_id) return {ok:false, msg:'این کتاب متعلق به مدرسهٔ شما نیست'};
  if(libAvail(bookId) < 1) return {ok:false, msg:'موجودیِ این کتاب تمام شده است'};
  var st = byId('users', studentId);
  if(!st || st.role !== 'student') return {ok:false, msg:'دانش‌آموز پیدا نشد'};
  if(st.school_id !== u.school_id) return {ok:false, msg:'این دانش‌آموز متعلق به مدرسهٔ شما نیست'};
  /* مهلت: تاریخِ داده‌شده یا پیش‌فرض +۱۴ روز */
  var due;
  if(dueDate && !isNaN(Date.parse(dueDate))){
    due = String(dueDate);
  } else {
    due = new Date(Date.now() + LIB_DEFAULT_DAYS*86400000).toISOString().slice(0,10);
  }
  var now = new Date().toISOString();
  var rec = {
    school_id: u.school_id,
    book_id: bookId,
    student_id: studentId,
    loan_at: now,
    due_at: due,
    returned_at: '',
    registered_by: u.id,
    created_at: now
  };
  return {ok:true, rec: insert('lib_loans', rec)};
}
function libReturn(loanId){
  var u = S.user;
  if(!libStaffCan(u)) return {ok:false, msg:'بازگشت فقط با مدیر یا کتابدارِ دارای مجوز است'};
  var l = byId('lib_loans', loanId);
  if(!l) return {ok:false, msg:'امانت پیدا نشد'};
  if(l.school_id !== u.school_id) return {ok:false, msg:'این امانت متعلق به مدرسهٔ شما نیست'};
  if(l.returned_at) return {ok:false, msg:'بازگشت قبلاً ثبت شده است'};
  update('lib_loans', loanId, {returned_at: new Date().toISOString()});
  return {ok:true};
}

/* جستجوی کتاب (فقط‌خواندنی): عنوان/نویسنده/کد/شابک */
function libSearch(q, schoolId){
  q = String(q || '').trim();
  var books = libBooksOf(schoolId);
  if(!q) return books;
  return books.filter(function(b){
    var hay = ((b.title||'') + ' ' + (b.author||'') + ' ' + (b.code||'') + ' ' + (b.isbn||'')).toLowerCase();
    return hay.indexOf(q.toLowerCase()) > -1;
  });
}
/* امانت‌های یک دانش‌آموز (تازه‌تر اول) */
function libMyLoans(studentId){
  return db.lib_loans
    .filter(function(l){ return l.student_id === studentId; })
    .sort(function(a,b){ return (b.loan_at||'').localeCompare(a.loan_at||''); });
}

/* ─────────────── نمای مدیر ─────────────── */

function viewLibrary(){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role === 'student') return viewLibraryStudent();
  var isMgr = (role === 'manager' || role === 'superadmin');
  var q = (typeof window !== 'undefined' && window._libQ) || '';
  var books = libSearch(q, u.school_id);
  var actives = db.lib_loans.filter(function(l){ return l.school_id===u.school_id && !l.returned_at; });
  var lates = actives.filter(function(l){ return libLoanStatus(l)==='late'; });
  var h = '<div class="page-head"><h2>📚 کتابخانه</h2></div>'
    + ((typeof virtualModeBanner==='function') ? virtualModeBanner() : '');
  h += '<div class="card"><div class="card-head"><div class="row" style="gap:8px;flex-wrap:wrap">'
    + '<input id="lib_q" class="inp" style="max-width:220px" placeholder="جستجوی کتاب…" value="' + esc(q) + '">'
    + '<button class="btn ghost sm" data-act="lib-search">🔍 جستجو</button>'
    + '<span class="badge b-gray">کتاب: ' + fa(books.length) + '</span>'
    + '<span class="badge b-cyan">با سریال: ' + fa(books.filter(function(b){return b.serial;}).length) + '</span>'
    + '<span class="badge b-amber">امانت‌رفته: ' + fa(actives.length) + '</span>'
    + (lates.length ? '<span class="badge b-red">دیرکرد: ' + fa(lates.length) + '</span>' : '')
    + '</div>' + (isMgr ? '<button class="btn" data-act="lib-new">➕ کتاب جدید</button>' : '')
    + '</div><div class="card-body">';
  if(!books.length){
    h += empty('📚','کتابی ثبت نشده','اولین کتاب را با دکمهٔ بالا ثبت کنید.');
  } else {
    h += '<div style="display:grid;gap:10px">' + books.map(function(b){
      var st = libBookStatus(b.id);
      var badge = st.key==='free' ? 'b-green' : (st.key==='late' ? 'b-red' : 'b-blue');
      var openLoans = libLoansOf(b.id).filter(function(l){ return !l.returned_at; });
      return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 14px">'
        + '<div class="row" style="flex-wrap:wrap;gap:8px">'
        + '<b>' + esc(b.title) + '</b>'
        + (b.author ? '<span class="muted small">' + esc(b.author) + '</span>' : '')
        + (b.code ? '<span class="badge b-gray">' + esc(b.code) + '</span>' : '')
        + (b.serial ? '<span class="badge b-cyan">🔢 سریال: ' + esc(b.serial) + '</span>' : '')
        + ((Number(b.total_copies) || 0) > 0 ? '<span class="badge b-gray">موجودی: ' + fa(libAvail(b.id)) + ' از ' + fa(Number(b.total_copies)) + '</span>' : '')
        + ((b.location) ? '<span class="badge b-gray">📍 ' + esc(b.location) + '</span>' : '')
        + '<span class="badge ' + badge + '">' + esc(st.label) + '</span>'
        + '<div class="spacer"></div>'
        + (isMgr ? '<button class="btn ghost sm" data-act="lib-serial" data-id="' + b.id + '" title="ویرایش کتاب">✏️ ویرایش</button>' : '')
        + '<button class="btn ghost sm" data-act="lib-lend" data-id="' + b.id + '">📤 امانت</button>'
        + (isMgr ? '<button class="btn ghost sm" data-act="lib-del" data-id="' + b.id + '">حذف</button>' : '')
        + '</div>'
        + (openLoans.length
            ? '<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:8px">'
              + openLoans.map(function(l){
                  var s2 = byId('users', l.student_id) || {};
                  var bk = byId('lib_books', l.book_id) || {};
                  return '<span class="badge ' + (libLoanStatus(l)==='late'?'b-red':'b-blue') + '">'
                    + esc(s2.full_name||'؟') + (bk.serial ? ' (سریال: ' + esc(bk.serial) + ')' : '') + ' — مهلت: ' + (typeof jalali==='function'?jalali(l.due_at):esc(l.due_at||'—'))
                    + ' <button class="icon-btn" data-act="lib-return" data-id="' + l.id + '" title="ثبت بازگشت">↩️</button></span>';
                }).join('')
              + '</div>'
            : '')
        + '</div>';
    }).join('') + '</div>';
  }
  /* تفویضِ کتابداری (فقط مدیر) */
  if(isMgr){
    var staff = db.users.filter(function(x){ return x.role==='teacher' && x.school_id===u.school_id && x.active!==0; })
      .sort(function(a,b){ return (a.full_name||'').localeCompare(b.full_name||'', 'fa'); });
    h += '<div class="card" style="margin-top:12px"><div class="card-head"><b>📚 تفویضِ کتابداری</b></div><div class="card-body">';
    if(!staff.length){
      h += '<div class="muted small">دبیری در این مدرسه نیست.</div>';
    } else {
      h += '<div style="display:grid;gap:6px">' + staff.map(function(t){
        var on = t.lib_staff === 1;
        return '<div class="row" style="gap:8px"><span>' + esc(t.full_name||'؟') + '</span>'
          + (on ? '<span class="badge b-green">کتابدار</span>' : '<span class="badge b-gray">بدونِ مجوز</span>')
          + '<div class="spacer"></div>'
          + '<button class="btn ghost sm" data-act="lib-staff-toggle" data-id="' + t.id + '">'
          + (on ? 'لغوِ مجوز' : 'اعطای مجوز') + '</button></div>';
      }).join('') + '</div>';
    }
    h += '</div></div>';
  }
  return h + '</div></div>';
}

/* نمای دانش‌آموز: جستجو + امانت‌های خودش (فقط‌خواندنی) */
function viewLibraryStudent(){
  var u = S.user;
  var q = (typeof window !== 'undefined' && window._libQ) || '';
  var books = libSearch(q, u.school_id);
  var mine = libMyLoans(u.id).filter(function(l){ return !l.returned_at; });
  var h = '<div class="page-head"><h2>📚 کتابخانه</h2></div>'
    + '<div class="card"><div class="card-head"><div class="row" style="gap:8px;flex-wrap:wrap">'
    + '<input id="lib_q" class="inp" style="max-width:220px" placeholder="جستجوی کتاب…" value="' + esc(q) + '">'
    + '<button class="btn ghost sm" data-act="lib-search">🔍 جستجو</button>'
    + '</div></div><div class="card-body">';
  h += '<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">'
    + '<span class="badge b-gray">کتاب: ' + fa(books.length) + '</span>'
    + '<span class="badge b-blue">امانتِ من: ' + fa(mine.length) + '</span></div>';
  if(mine.length){
    h += '<div style="display:grid;gap:6px;margin-bottom:12px">' + mine.map(function(l){
      var b = byId('lib_books', l.book_id) || {};
      var late = libLoanStatus(l) === 'late';
      return '<div class="row" style="gap:8px"><b>' + esc(b.title||'؟') + '</b>'
        + '<span class="badge ' + (late ? 'b-red' : 'b-blue') + '">' + (late ? 'دیرکرد' : 'امانت‌رفته')
        + ' — مهلت: ' + esc((l.due_at||'').slice(0,10) || '—') + '</span></div>';
    }).join('') + '</div>';
  }
  if(!books.length){
    h += empty('📚','کتابی پیدا نشد','');
  } else {
    h += '<div style="display:grid;gap:8px">' + books.map(function(b){
      var av = libAvail(b.id);
      return '<div class="row" style="gap:8px"><b>' + esc(b.title) + '</b>'
        + (b.author ? '<span class="muted small">' + esc(b.author) + '</span>' : '')
        + '<span class="badge ' + (av > 0 ? 'b-green' : 'b-red') + '">' + (av > 0 ? 'موجود' : 'ناموجود') + '</span></div>';
    }).join('') + '</div>';
  }
  return h + '</div></div>';
}

/* ─────────────── دادهٔ نمونه (قطعی، فقط دمو) ─────────────── */

function generateLibraryDemo(){
  if(db.lib_books.length) return;
  var sc = db.schools.filter(function(s){ return s.active; })[0];
  if(!sc) return;
  var mgr = db.users.filter(function(x){ return x.role==='manager' && x.school_id===sc.id; })[0];
  var now = new Date();
  var day = 86400000;
  var mk = function(title, author, code, serial){
    return add('lib_books', {school_id: sc.id, title: title, author: author, code: code, serial: serial || '', isbn: '', location: '', total_copies: 0, created_at: now.toISOString()});
  };
  var b1 = mk('شیمی دهم — بنیادی', 'نویسندگان سازمان سنجش', 'K10-01', 'SN-K10-001');
  var b2 = mk('آدینه‌ها', 'صادق هدایت', 'LIT-114', 'SN-LIT-114');
  var b3 = mk('ریاضی ششم — تمرین‌های تکمیلی', 'مجلهٔ ریاضی', 'K6-203', 'SN-K6-203');
  var st = db.users.filter(function(x){ return x.role==='student' && x.school_id===sc.id; });
  if(st.length >= 2){
    /* امانتِ فعالِ بامهلت */
    add('lib_loans', {
      school_id: sc.id, book_id: b1.id, student_id: st[0].id,
      loan_at: new Date(now.getTime()-5*day).toISOString(),
      due_at: new Date(now.getTime()+9*day).toISOString().slice(0,10),
      returned_at: '', registered_by: mgr ? mgr.id : 0, created_at: now.toISOString()
    });
    /* امانتِ دیرکرد */
    add('lib_loans', {
      school_id: sc.id, book_id: b3.id, student_id: st[1].id,
      loan_at: new Date(now.getTime()-25*day).toISOString(),
      due_at: new Date(now.getTime()-11*day).toISOString().slice(0,10),
      returned_at: '', registered_by: mgr ? mgr.id : 0, created_at: now.toISOString()
    });
  }
  /* امانتِ برگشتهٔ قدیمی (سابقه) */
  if(st.length){
    add('lib_loans', {
      school_id: sc.id, book_id: b2.id, student_id: st[0].id,
      loan_at: new Date(now.getTime()-60*day).toISOString(),
      due_at: new Date(now.getTime()-46*day).toISOString().slice(0,10),
      returned_at: new Date(now.getTime()-48*day).toISOString(),
      registered_by: mgr ? mgr.id : 0, created_at: now.toISOString()
    });
  }
}

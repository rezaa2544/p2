/* ═══════════════════════════════════════════════════════════════════
   کتابخانهٔ مدرسه (بند ۸) — نسخهٔ سبک

   فهرست کتاب‌ها + امانت به دانش‌آموز + بازگشت.
   هر کتاب یک ردیف است (کپی متعدد = چند بار امانت هم‌زمان).

   داده:
     lib_books  {school_id, title, author, code, serial, created_at}
     serial = شمارهٔ سریالِ فیزیکیِ کتاب (اختیاری، در هر مدرسه یکتا)
     lib_loans  {school_id, book_id, student_id, loan_at, due_at,
                 returned_at, registered_by, created_at}

   وضعیت (محاسبه‌شده، ذخیره نمی‌شود):
     • بازگشته   = returned_at دارد
     • امانت‌رفته = بازگشت ندارد و هنوز به مهلت نرسیده
     • دیرکرد    = بازگشت ندارد و از مهلت گذشته
   وضعیت کتاب = اگر امانتِ فعالِ دیرکرد داشته «دیرکرد»،
   اگر امانتِ فعال داشته «امانت‌رفته» (با نام و مهلت)،
   وگرنه «در دسترس».

   امنیت: همهٔ تغییرات فقط **مدیر** + ردیف‌ها باید از مدرسهٔ
   خودِ مدیر + دانش‌آموزِ امانت باید دانش‌آموزِ همان مدرسه باشد
   (روی داده، نه فقط دکمه).
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

/* ─────────────── کتاب (مدیر) ─────────────── */

function libAddBook(title, author, code, serial){
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند کتاب ثبت کند'};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  title = String(title || '').trim();
  if(!title) return {ok:false, msg:'عنوان کتاب خالی است'};
  serial = String(serial || '').trim();
  if(serial && db.lib_books.some(function(x){ return x.school_id===u.school_id && x.serial===serial; }))
    return {ok:false, msg:'این شمارهٔ سریال برای کتاب دیگری در همین مدرسه ثبت شده است'};
  var rec = {
    school_id: u.school_id,
    title: title,
    author: String(author || '').trim(),
    code: String(code || '').trim(),
    serial: serial,
    created_at: new Date().toISOString()
  };
  return {ok:true, rec: insert('lib_books', rec)};
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
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند امانت بدهد'};
  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};
  /* بند ۱۶: روزِ غیرحضوری، کتابخانهٔ فیزیکی کار نمی‌کند */
  if(typeof schoolVirtual==='function' && schoolVirtual(u.school_id, todayISO()))
    return {ok:false, msg:'امروز مدرسه غیرحضوری است؛ امانت کتاب انجام نمی‌شود (مسدود)'};
  var b = byId('lib_books', bookId);
  if(!b) return {ok:false, msg:'کتاب پیدا نشد'};
  if(b.school_id !== u.school_id) return {ok:false, msg:'این کتاب متعلق به مدرسهٔ شما نیست'};
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
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager') return {ok:false, msg:'فقط مدیر مدرسه می‌تواند بازگشت ثبت کند'};
  var l = byId('lib_loans', loanId);
  if(!l) return {ok:false, msg:'امانت پیدا نشد'};
  if(l.school_id !== u.school_id) return {ok:false, msg:'این امانت متعلق به مدرسهٔ شما نیست'};
  if(l.returned_at) return {ok:false, msg:'بازگشت قبلاً ثبت شده است'};
  update('lib_loans', loanId, {returned_at: new Date().toISOString()});
  return {ok:true};
}

/* ─────────────── نمای مدیر ─────────────── */

function viewLibrary(){
  var u = S.user;
  var books = libBooksOf(u.school_id);
  var actives = db.lib_loans.filter(function(l){ return l.school_id===u.school_id && !l.returned_at; });
  var lates = actives.filter(function(l){ return libLoanStatus(l)==='late'; });
  var h = '<div class="page-head"><h2>📚 کتابخانه</h2></div>'
    + ((typeof virtualModeBanner==='function') ? virtualModeBanner() : '');
  h += '<div class="card"><div class="card-head"><div class="row" style="gap:8px;flex-wrap:wrap">'
    + '<span class="badge b-gray">کتاب: ' + fa(books.length) + '</span>'
    + '<span class="badge b-cyan">با سریال: ' + fa(books.filter(function(b){return b.serial;}).length) + '</span>'
    + '<span class="badge b-amber">امانت‌رفته: ' + fa(actives.length) + '</span>'
    + (lates.length ? '<span class="badge b-red">دیرکرد: ' + fa(lates.length) + '</span>' : '')
    + '</div><button class="btn" data-act="lib-new">➕ کتاب جدید</button></div><div class="card-body">';
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
        + '<span class="badge ' + badge + '">' + esc(st.label) + '</span>'
        + '<div class="spacer"></div>'
        + '<button class="btn ghost sm" data-act="lib-serial" data-id="' + b.id + '" title="شمارهٔ سریال">🔢 سریال</button>'
        + '<button class="btn ghost sm" data-act="lib-lend" data-id="' + b.id + '">📤 امانت</button>'
        + '<button class="btn ghost sm" data-act="lib-del" data-id="' + b.id + '">حذف</button>'
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
    return add('lib_books', {school_id: sc.id, title: title, author: author, code: code, serial: serial || '', created_at: now.toISOString()});
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

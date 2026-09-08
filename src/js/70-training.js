/* ═══════════════════════════════════════════════════════════════════
   بند B.2 فرناز (چت۱) — دوره‌های آموزش ضمن خدمت کادر + گواهی پایان دوره
   ─────────────────────────────────────────────────────────────────
   • مجموعهٔ تازه: training_courses (مدرسه/همکار/عنوان/ساعت/تاریخ/وضعیت).
   • گواهی: همان الگوی گواهی دانش‌آموز — کد قطعی (certHash) + سطر در
     مجموعهٔ certificates با type='staff_training' + چاپ با printableDoc.
     کد به (دوره، همکار، مدرسه، سال) مقید است و بدون سرور بازسازی می‌شود.
   • صدور در لحظهٔ «تکمیل‌شده» شدن رخ می‌دهد (idempotent: هر دوره یک
     گواهی)؛ چاپ، چاپِ مجدد است. فقط مدیر می‌نویسد (سه‌لایه، مانند B.1).
   ═══════════════════════════════════════════════════════════════════ */
var TRAINING_STATUS = [['ongoing', 'در حال برگزاری'], ['completed', 'تکمیل‌شده']];

/** برچسب فارسی وضعیت دوره */
function trainingStatusFa(s){
  for (var i = 0; i < TRAINING_STATUS.length; i++) if (TRAINING_STATUS[i][0] === s) return TRAINING_STATUS[i][1];
  return '—';
}

/** دوره‌های یک مدرسه (تازه‌ترین اول) */
function coursesOfSchool(schoolId){
  return (db.training_courses || []).filter(function(c){
    return c.school_id === schoolId;
  }).sort(function(a, b){
    if (a.date === b.date) return b.id - a.id;
    return a.date < b.date ? 1 : -1;
  });
}

/** کد احراز گواهی پایان دوره — همان الگوی certCodeCalc با پیشوند DOR- */
function staffCertCode(courseId, staffId, schoolId){
  var s = 'staff_training:' + courseId + ':' + staffId + ':' + schoolId + ':' + (typeof yearCode === 'function' ? yearCode() : '');
  return certHash(s, 'DOR-');
}

/** راستی‌آزمایی کد گواهی (بازسازی قطعی از شناسه‌ها) */
function staffCertVerify(code, courseId){
  var c = byId('training_courses', Number(courseId));
  if (!c) return { ok: false, msg: 'دوره پیدا نشد.' };
  var want = staffCertCode(c.id, c.staff_id, c.school_id);
  if (String(code || '').trim().toUpperCase() === want) return { ok: true, msg: 'کدِ گواهی پایان دوره معتبر است' };
  return { ok: false, msg: 'کد معتبر نیست' };
}

/* ── نویسندهٔ واحد: ثبت/ویرایش دوره + صدور idempotent گواهی در تکمیل ── */
function saveTrainingCourse(id, f){
  var role = (typeof activePersona === 'function') ? activePersona() : (S.user && S.user.role);
  if (role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر مدرسه می‌تواند دوره ثبت کند' };
  if (!S.user || !S.user.school_id) return { ok: false, msg: 'نشست معتبر نیست' };
  var staffId = Number(f.staff_id);
  var st = byId('users', staffId);
  if (!st || !st.active) return { ok: false, msg: 'همکار معتبر نیست' };
  if (STAFF_ATT_ROLES.indexOf(st.role) < 0) return { ok: false, msg: 'این کاربر عضو کادر نیست' };
  if (st.school_id !== S.user.school_id) return { ok: false, msg: 'همکارِ مدرسهٔ دیگری است' };
  var title = String(f.title == null ? '' : f.title).trim();
  if (!title) return { ok: false, msg: 'عنوان دوره را بنویسید' };
  if (title.length > 100) return { ok: false, msg: 'عنوان دوره حداکثر ۱۰۰ نویسه' };
  var hours = Number(f.hours);
  if (!isFinite(hours) || hours <= 0) return { ok: false, msg: 'ساعت دوره باید عدد مثبت باشد' };
  if (!staffAttValidDate(f.date)) return { ok: false, msg: 'تاریخ معتبر نیست' };
  if (f.status !== 'ongoing' && f.status !== 'completed') return { ok: false, msg: 'وضعیت معتبر نیست' };
  var sid = S.user.school_id;
  var rec = null;
  if (id){
    rec = byId('training_courses', Number(id));
    if (!rec || rec.school_id !== sid) return { ok: false, msg: 'دوره پیدا نشد' };
    /* Devin-R1: دورهٔ تکمیل‌شده قفل است — هر تغییری کد گواهیِ صادرشده را باطل می‌کند.
       فقط بازذخیرهٔ عینیِ همان داده (تکمیلِ دوباره، T4) مجاز است. */
    if (rec.status === 'completed' && (staffId !== rec.staff_id || title !== rec.title ||
        hours !== rec.hours || f.date !== rec.date || f.status !== rec.status))
      return { ok: false, msg: 'دوره تکمیل شده قابل ویرایش نیست' };
    update('training_courses', rec.id, { staff_id: staffId, title: title, hours: hours, date: f.date, status: f.status });
    rec = byId('training_courses', rec.id);
  } else {
    rec = insert('training_courses', { school_id: sid, staff_id: staffId, title: title, hours: hours, date: f.date, status: f.status });
  }
  var certCode = null;
  if (rec.status === 'completed'){
    var code = staffCertCode(rec.id, rec.staff_id, rec.school_id);
    var ex = (db.certificates || []).filter(function(x){ return x.type === 'staff_training' && x.code === code; })[0];
    if (!ex){
      ex = insert('certificates', { school_id: rec.school_id, type: 'staff_training',
        year: (typeof yearCode === 'function' ? yearCode() : ''), code: code,
        issued_at: new Date().toISOString(), issued_by: (S.user && S.user.id) || 0 });
    }
    certCode = ex.code;
  }
  return { ok: true, id: rec.id, cert: certCode };
}

/** سند چاپی گواهی پایان دوره (همان شکل enrollmentCert) */
function trainingCert(courseId){
  var c = byId('training_courses', Number(courseId));
  if (!c) return { ok: false, msg: 'دوره پیدا نشد.' };
  if (c.status !== 'completed') return { ok: false, msg: 'گواهی فقط برای دورهٔ تکمیل‌شده صادر می‌شود.' };
  var st = byId('users', c.staff_id) || {};
  var school = byId('schools', c.school_id) || {};
  var code = staffCertCode(c.id, c.staff_id, c.school_id);
  var roleFa = (st.role === 'counselor') ? 'مشاور' : 'دبیر';
  var body =
    '<div class="meta"><span>نام: <b>' + esc(st.full_name || '—') + '</b></span>'
    + '<span>کد ملی: <b>' + esc(st.national_id || '—') + '</b></span>'
    + '<span>سمت: <b>' + roleFa + '</b></span>'
    + '</div>'
    + '<div style="font-size:14px;line-height:2.5;background:#f6f9ff;border:1px solid #cdd9f2;border-radius:10px;padding:14px 16px;margin-top:8px">'
    + 'گواهی می‌شود که همکار گرامی <b>' + esc(st.full_name || '—') + '</b>'
    + ' دورهٔ آموزشی ضمن خدمت با عنوان <b>' + esc(c.title) + '</b>'
    + ' به مدت <b>' + fa(c.hours) + ' ساعت</b>'
    + ' (تاریخ برگزاری: ' + esc(jalaliLongFa(c.date)) + ')'
    + ' را در <b>' + esc(school.name || '—') + '</b> با موفقیت به پایان رسانده است.'
    + '</div>'
    + '<div class="meta" style="margin-top:12px"><span>کد احراز: <b style="letter-spacing:2px;direction:ltr;display:inline-block">' + code + '</b></span></div>';
  return { ok: true,
    title: 'گواهی پایان دورهٔ آموزشی ضمن خدمت',
    school: esc(school.name || '') + (school.code ? ' — کد ' + esc(school.code) : ''),
    subtitle: 'همکار: ' + esc(st.full_name || '') + ' · ' + esc(c.title),
    body: body,
    note: 'این گواهی از سامانهٔ پایش چاپ شده است و با کد احرازِ درج‌شده قابل راستی‌آزمایی است؛ نسخهٔ الکترونیکی و بدون نیاز به مهر است.' };
}

/** سطر جدول یک دوره */
function trainingRowInner(c){
  var st = byId('users', c.staff_id) || {};
  var done = c.status === 'completed';
  var badge = done
    ? '<span class="badge" style="background:#dafbe1;color:#1a7f37">تکمیل‌شده</span>'
    : '<span class="badge" style="background:#ddf4ff;color:#0969da">در حال برگزاری</span>';
  var code = done ? staffCertCode(c.id, c.staff_id, c.school_id) : null;
  var ops = '<button class="btn ghost sm" data-act="trn-edit" data-id="' + c.id + '">ویرایش</button>';
  if (!done) ops += ' <button class="btn ghost sm" data-act="trn-complete" data-id="' + c.id + '">تکمیل و صدور گواهی</button>';
  else ops += ' <button class="btn ghost sm" data-act="trn-print" data-id="' + c.id + '">🖨️ چاپ گواهی</button>'
    + ' <button class="btn ghost sm" data-act="trn-verify" data-id="' + c.id + '">راستی‌آزمایی</button>';
  return '<td>' + esc(st.full_name || '—') + '</td>'
    + '<td>' + esc(c.title) + '</td>'
    + '<td>' + fa(c.hours) + ' ساعت</td>'
    + '<td>' + esc(jalaliLongFa(c.date)) + '</td>'
    + '<td>' + badge + '</td>'
    + '<td>' + (code ? '<b style="letter-spacing:1px;direction:ltr;display:inline-block">' + code + '</b>' : '—') + '</td>'
    + '<td style="white-space:nowrap">' + ops + '</td>';
}

/** نمای دوره‌های آموزشی کادر (روت training — فقط مدیر) */
function viewTraining(){
  var u = S.user;
  var list = coursesOfSchool(u.school_id);
  var rows = list.length ? list.map(function(c){
    return '<tr id="trnrow_' + c.id + '">' + trainingRowInner(c) + '</tr>';
  }).join('') : '<tr><td colspan="7" style="text-align:center;color:#888">هنوز دوره‌ای ثبت نشده است.</td></tr>';
  return '<div class="card"><div class="card-body">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<h3 style="margin:0">📚 دوره‌های آموزش ضمن خدمت کادر</h3>'
    + '<button class="btn" data-act="trn-new">+ دورهٔ تازه</button>'
    + '</div>'
    + '<table style="width:100%;border-collapse:collapse;margin-top:12px">'
    + '<thead><tr><th>همکار</th><th>عنوان دوره</th><th>ساعت</th><th>تاریخ برگزاری</th><th>وضعیت</th><th>کد گواهی</th><th>عملیات</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>'
    + '<p style="color:#888;font-size:12px">با «تکمیل و صدور گواهی»، گواهی پایان دوره با کد احراز صادر و در سوابق ثبت می‌شود.</p>'
    + '</div></div>';
}

/* ═══════════════════════════════════════════════════════════════════
   بند B.1 فرناز (چت۱) — حضور و غیاب کارکنان
   ─────────────────────────────────────────────────────────────────
   • مجموعهٔ جدا: staff_attendance — هیچ اشتراکی با attendanceِ
     دانش‌آموز ندارد: نه رکورد، نه تابع، نه اکشن، نه روت، نه سید.
   • فقط مدیر می‌نویسد (گارد سه‌لایه: ACTION_ROLES ‏+ گاردِ canActionِ
     دسپاتچ + گاردِ داخلِ markStaffAttendance). سوپرادمین طبق اصلِ
     سراسریِ «بدون محدودیت» (و canOp سرور) نیز مجاز است.
   • school_id همیشه از نشست (S.user) می‌آید، هرگز از ورودی (R98).
   • ذخیره = به‌روزرسانیِ هدفمندِ همان خانه + همان سطرِ خلاصه؛
     بدون رندرِ کامل (قاعدهٔ Render Optimization).
   ═══════════════════════════════════════════════════════════════════ */
var STAFF_ATT_STATUS = [['present', 'حاضر'], ['absent', 'غایب'], ['late', 'تأخیر']];
var STAFF_ATT_ROLES = ['teacher', 'counselor'];
var STAFF_ATT_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
var STAFF_ATT_WDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
var STAFF_ATT_COLORS = {
  present: ['#1a7f37', '#dafbe1'],
  absent: ['#cf222e', '#ffebe9'],
  late: ['#9a6700', '#fff8c5']
};

/** برچسب فارسی وضعیت */
function staffAttStatusFa(s){
  for (var i = 0; i < STAFF_ATT_STATUS.length; i++) if (STAFF_ATT_STATUS[i][0] === s) return STAFF_ATT_STATUS[i][1];
  return '—';
}

/** همکاران فعال یک مدرسه (فقط نقش‌های کادری) */
function staffOfSchool(schoolId){
  return (db.users || []).filter(function(u){
    return u.school_id === schoolId && u.active && STAFF_ATT_ROLES.indexOf(u.role) > -1;
  });
}

/** تاریخ ISO معتبر و واقعاً تقویمی؟ (fail-closed) */
function staffAttValidDate(s){
  if (typeof s !== 'string') return false;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  var d = new Date(s + 'T00:00:00');
  return !isNaN(d) && d.getFullYear() === +m[1] && d.getMonth() + 1 === +m[2] && d.getDate() === +m[3];
}

/** رکورد یک همکار در یک روز (یا null) */
function staffAttRec(staffId, iso){
  var rows = db.staff_attendance || [];
  for (var i = 0; i < rows.length; i++) if (rows[i].staff_id === staffId && rows[i].date === iso) return rows[i];
  return null;
}

/** رکوردهای یک مدرسه در یک ماه شمسی */
function staffAttMonthRecs(schoolId, jy, jm){
  var out = [];
  var rows = db.staff_attendance || [];
  for (var i = 0; i < rows.length; i++){
    var r = rows[i];
    if (r.school_id !== schoolId) continue;
    var p = String(r.date || '').split('-');
    if (p.length !== 3) continue;
    var j = toJalali(+p[0], +p[1], +p[2]);
    if (j[0] !== jy || j[1] !== jm) continue;
    out.push(r);
  }
  return out;
}

/** خلاصهٔ ماهانهٔ هر همکار: [{id, name, present, absent, late}] */
function staffAttSummary(schoolId, jy, jm){
  var agg = Object.create(null);
  staffAttMonthRecs(schoolId, jy, jm).forEach(function(r){
    var a = agg[r.staff_id] || (agg[r.staff_id] = { present: 0, absent: 0, late: 0 });
    if (a[r.status] !== undefined) a[r.status]++;
  });
  return staffOfSchool(schoolId).map(function(u){
    var a = agg[u.id] || { present: 0, absent: 0, late: 0 };
    return { id: u.id, name: u.full_name, present: a.present, absent: a.absent, late: a.late };
  });
}

/* ── نویسندهٔ واحد (upsert با کلید staff_id+date) ────────────────
   همهٔ ورودی‌ها از نو اعتبارسنجی می‌شوند؛ حتی اگر مهاجم DOM را
   دست‌کاری کند، بدترین حالت پیام خطاست نه دادهٔ خراب. */
function markStaffAttendance(staffId, dateISO, status, note){
  var role = (typeof activePersona === 'function') ? activePersona() : (S.user && S.user.role);
  if (role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر مدرسه می‌تواند حضور کادر را ثبت کند' };
  if (!S.user || !S.user.school_id) return { ok: false, msg: 'نشست معتبر نیست' };
  staffId = Number(staffId);
  var st = byId('users', staffId);
  if (!st || !st.active) return { ok: false, msg: 'همکار معتبر نیست' };
  if (STAFF_ATT_ROLES.indexOf(st.role) < 0) return { ok: false, msg: 'این کاربر عضو کادر نیست' };
  if (st.school_id !== S.user.school_id) return { ok: false, msg: 'همکارِ مدرسهٔ دیگری است' };
  if (!staffAttValidDate(dateISO)) return { ok: false, msg: 'تاریخ معتبر نیست' };
  if (dateISO > todayISO()) return { ok: false, msg: 'ثبت برای روزهای آینده مجاز نیست' };
  if (status !== 'present' && status !== 'absent' && status !== 'late') return { ok: false, msg: 'وضعیت معتبر نیست' };
  note = String(note == null ? '' : note).slice(0, 2000);
  var sid = S.user.school_id;
  var ex = staffAttRec(staffId, dateISO);
  if (ex){
    update('staff_attendance', ex.id, { status: status, note: note, registered_by: S.user.id });
    return { ok: true, id: ex.id, updated: true };
  }
  var r = insert('staff_attendance', { school_id: sid, staff_id: staffId, date: dateISO, status: status, note: note, registered_by: S.user.id });
  return { ok: true, id: r.id, updated: false };
}

/** وضعیت نمای ماهانه (ماه پیش‌فرض = ماه جاری) */
function staffAttState(){
  if (!S.staffatt) S.staffatt = {};
  var st = S.staffatt;
  if (!st.jy || !st.jm){
    var t = todayISO().split('-');
    var j = toJalali(+t[0], +t[1], +t[2]);
    st.jy = j[0]; st.jm = j[1];
  }
  return st;
}

/** محتوای یک خانهٔ روز (مشترکِ نما و به‌روزرسانیِ پس‌ازذخیره) */
function staffAttCellInner(iso, rec){
  var p = iso.split('-');
  var jd = toJalali(+p[0], +p[1], +p[2])[2];
  var wd = STAFF_ATT_WDAYS[new Date(iso + 'T00:00:00').getDay()];
  var h = '<div style="font-weight:700">' + fa(jd) + '</div><div style="font-size:11px;opacity:.7">' + wd + '</div>';
  if (rec && rec.status){
    var c = STAFF_ATT_COLORS[rec.status] || ['#333', '#eee'];
    h += '<div style="margin-top:4px"><span class="badge" style="background:' + c[1] + ';color:' + c[0] + '">' + staffAttStatusFa(rec.status) + '</span></div>';
  } else {
    h += '<div style="margin-top:4px;color:#999">—</div>';
  }
  return h;
}

/** سطر خلاصهٔ یک همکار (مشترکِ نما و به‌روزرسانیِ پس‌ازذخیره) */
function staffAttSumCells(r){
  return '<td>' + esc(r.name) + '</td><td>' + fa(r.present) + '</td><td>' + fa(r.absent) + '</td><td>' + fa(r.late) + '</td><td>' + fa(r.present + r.absent + r.late) + '</td>';
}

/** نمای ماهانهٔ حضور کادر (روت staffatt — فقط مدیر) */
function viewStaffAtt(){
  var u = S.user;
  var staff = staffOfSchool(u.school_id);
  if (!staff.length){
    return '<div class="card"><div class="card-body"><div class="empty">'
      + '<div style="font-size:40px">🗓️</div><p>در این مدرسه همکاری برای ثبت حضور وجود ندارد.</p>'
      + '</div></div></div>';
  }
  var st = staffAttState();
  var cur = null;
  for (var i = 0; i < staff.length; i++) if (staff[i].id === st.staffId) cur = staff[i];
  if (!cur) cur = staff[0];
  st.staffId = cur.id;
  var jy = st.jy, jm = st.jm;
  var today = todayISO();
  /* نوار همکاران */
  var chips = '<div class="chips">' + staff.map(function(s){
    return '<button class="btn ghost sm' + (s.id === cur.id ? ' on' : '') + '" data-act="staffatt-pick" data-id="' + s.id + '">' + esc(s.full_name) + '</button>';
  }).join('') + '</div>';
  /* ناوبری ماه */
  var nav = '<div style="display:flex;gap:8px;align-items:center;margin:12px 0">'
    + '<button class="btn ghost sm" data-act="staffatt-prev">→ ماه قبل</button>'
    + '<b>' + STAFF_ATT_MONTHS[jm - 1] + ' ' + fa(jy) + '</b>'
    + '<button class="btn ghost sm" data-act="staffatt-next">ماه بعد ←</button>'
    + '<button class="btn ghost sm" data-act="staffatt-today">ماه جاری</button>'
    + '</div>';
  /* شبکهٔ روزها */
  var n = jMonthDays(jy, jm);
  var cells = '';
  for (var d = 1; d <= n; d++){
    var g = toGregorian(jy, jm, d);
    var iso = g[0] + '-' + String(g[1]).padStart(2, '0') + '-' + String(g[2]).padStart(2, '0');
    var rec = staffAttRec(cur.id, iso);
    var future = iso > today;
    var tip = rec && rec.note ? ' title="' + escAttr(String(rec.note).slice(0, 120)) + '"' : '';
    cells += '<div id="sac_' + cur.id + '_' + iso + '"' + tip
      + (future ? ' style="border:1px solid #eee;border-radius:10px;padding:8px;text-align:center;opacity:.45"'
        : ' data-act="staffatt-day" data-id="' + cur.id + '_' + iso + '" style="border:1px solid #e3e3e3;border-radius:10px;padding:8px;text-align:center;cursor:pointer;background:#fff"')
      + '>' + staffAttCellInner(iso, rec) + '</div>';
  }
  var grid = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">' + cells + '</div>';
  /* جدول خلاصهٔ همهٔ همکاران */
  var sum = staffAttSummary(u.school_id, jy, jm);
  var rows = sum.map(function(r){
    return '<tr id="sas_' + r.id + '">' + staffAttSumCells(r) + '</tr>';
  }).join('');
  var table = '<table style="width:100%;border-collapse:collapse;margin-top:8px">'
    + '<thead><tr><th>همکار</th><th>حاضر</th><th>غایب</th><th>تأخیر</th><th>جمع ثبت‌ها</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>';
  return '<div class="card"><div class="card-body">'
    + '<h3 style="margin-top:0">🗓️ حضور و غیاب کادر — ' + esc(cur.full_name) + '</h3>'
    + chips + nav + grid
    + '</div></div>'
    + '<div class="card"><div class="card-body">'
    + '<h3 style="margin-top:0">خلاصهٔ ماه ' + STAFF_ATT_MONTHS[jm - 1] + '</h3>'
    + table
    + '<p style="color:#888;font-size:12px">این بخش مستقل از حضور و غیاب دانش‌آموزان است و فقط مدیر مدرسه امکان ثبت دارد.</p>'
    + '</div></div>';
}

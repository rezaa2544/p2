/* ═══════════════════════════════════════════════════════════════════
   بند B.4 فرناز (چت۱) — مانور سالانهٔ ایمنی/زلزله
   ─────────────────────────────────────────────────────────────────
   • مجموعهٔ جدا: safety_drills — school_id همیشه از نشست (S.user)
     می‌آید، هرگز از ورودی (R98).
   • «سالانه» = پنجرهٔ غلتانِ ۳۶۵ روزه (نه سالِ شمسی/تحصیلی): بدونِ
     محاسباتِ تقویمی، بدونِ لبهٔ نوروز/مهر، و پایدار در تست.
   • فقط مدیر می‌نویسد (گارد سه‌لایه: ACTION_ROLES ‏+ گاردِ canActionِ
     دسپاتچ + گاردِ داخلِ saveDrill). سوپرادمین طبق اصلِ سراسریِ
     «بدون محدودیت» مجاز است ولی چون مدرسه ندارد، عملاً از «ورود
     به پنل مدرسه» ثبت می‌کند (الگوی B.1).
   • خوانشِ تجمیعی برای رئیس اداره (drillStatsFor) هیچ دادهٔ فردی
     برنمی‌گرداند.
   ═══════════════════════════════════════════════════════════════════ */
var DRILL_YEAR_DAYS = 365;
var DRILL_MAX_COUNT = 100000;

/** تاریخ ISO معتبر و واقعاً تقویمی؟ (fail-closed — مستقل از B.1) */
function drillValidDate(s){
  if(typeof s !== 'string') return false;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!m) return false;
  var d = new Date(s + 'T00:00:00');
  return !isNaN(d) && d.getFullYear() === +m[1] && d.getMonth() + 1 === +m[2] && d.getDate() === +m[3];
}

/** مانورهای یک مدرسه — تازه‌ترین اول */
function drillsOf(schoolId){
  return (db.safety_drills || []).filter(function(d){ return d.school_id === schoolId; })
    .sort(function(a, b){ return String(a.date) < String(b.date) ? 1 : -1; });
}

/** مرز پنجرهٔ سالانه */
function drillCutoff(){
  return daysAgoISO(DRILL_YEAR_DAYS);
}

/** وضعیت سالانهٔ یک مدرسه: {done, last, count} */
function drillAnnualStatus(schoolId){
  var inWin = drillsOf(schoolId).filter(function(d){ return d.date >= drillCutoff(); });
  return { done: inWin.length > 0, last: inWin.length ? inWin[0].date : null, count: inWin.length };
}

/** آمار تجمیعی چند مدرسه برای گزارش اداره: {schools, done, drills, students, staff} */
function drillStatsFor(schoolIds){
  var set = {};
  (schoolIds || []).forEach(function(id){ set[id] = 1; });
  var cut = drillCutoff();
  var out = { schools: (schoolIds || []).length, done: 0, drills: 0, students: 0, staff: 0 };
  var seen = {};
  (db.safety_drills || []).forEach(function(d){
    if(!set[d.school_id]) return;
    if(d.date < cut) return;
    out.drills++;
    out.students += Number(d.participant_count_students) || 0;
    out.staff += Number(d.participant_count_staff) || 0;
    if(!seen[d.school_id]){ seen[d.school_id] = 1; out.done++; }
  });
  return out;
}

/* ── نویسندهٔ واحد (ثبت/ویرایش) ────────────────
   همهٔ ورودی‌ها از نو اعتبارسنجی می‌شوند؛ id ویرایش باید از همان
   مدرسهٔ نشست باشد (ضد IDOR بین‌مدرسه‌ای). */
function saveDrill(id, dateISO, nStudents, nStaff, notes){
  var role = (typeof activePersona === 'function') ? activePersona() : (S.user && S.user.role);
  if(role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر مدرسه می‌تواند مانور ثبت کند' };
  if(!S.user || !S.user.school_id) return { ok: false, msg: 'نشست معتبر نیست' };
  if(!drillValidDate(dateISO)) return { ok: false, msg: 'تاریخ معتبر نیست' };
  if(dateISO > todayISO()) return { ok: false, msg: 'ثبت برای روزهای آینده مجاز نیست' };
  nStudents = Number(nStudents); nStaff = Number(nStaff);
  if(!Number.isInteger(nStudents) || nStudents < 0 || nStudents > DRILL_MAX_COUNT) return { ok: false, msg: 'شمار دانش‌آموزان معتبر نیست' };
  if(!Number.isInteger(nStaff) || nStaff < 0 || nStaff > DRILL_MAX_COUNT) return { ok: false, msg: 'شمار کادر معتبر نیست' };
  notes = String(notes == null ? '' : notes).slice(0, 2000);
  var sid = S.user.school_id;
  if(id){
    var ex = byId('safety_drills', Number(id));
    if(!ex || ex.school_id !== sid) return { ok: false, msg: 'رکورد معتبر نیست' };
    update('safety_drills', ex.id, { date: dateISO, participant_count_students: nStudents, participant_count_staff: nStaff, notes: notes });
    return { ok: true, id: ex.id, updated: true };
  }
  var r = insert('safety_drills', { school_id: sid, date: dateISO, participant_count_students: nStudents, participant_count_staff: nStaff, notes: notes, registered_by: S.user.id });
  return { ok: true, id: r.id, updated: false };
}

/** حذف یک مانور (فقط همان مدرسهٔ نشست) */
function deleteDrill(id){
  var role = (typeof activePersona === 'function') ? activePersona() : (S.user && S.user.role);
  if(role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر مدرسه می‌تواند حذف کند' };
  if(!S.user || !S.user.school_id) return { ok: false, msg: 'نشست معتبر نیست' };
  var ex = byId('safety_drills', Number(id));
  if(!ex || ex.school_id !== S.user.school_id) return { ok: false, msg: 'رکورد معتبر نیست' };
  remove('safety_drills', ex.id);
  return { ok: true };
}

/** نمای مانور ایمنی (روت drills — فقط مدیر) */
function viewDrills(){
  var u = S.user;
  var list = drillsOf(u.school_id);
  var st = drillAnnualStatus(u.school_id);
  var banner = st.done
    ? '<div class="row" style="background:var(--green-soft,#dff5e1);padding:10px 14px;border-radius:12px;align-items:center">'
      + '<b>🟢 مانور امسال انجام شده</b><span class="small muted">آخرین: ' + esc(jalali(st.last)) + '</span></div>'
    : '<div class="row" style="background:var(--red-soft,#fde8e8);padding:10px 14px;border-radius:12px;align-items:center">'
      + '<b>🔴 مانور امسال هنوز انجام نشده</b></div>';
  var rows = list.map(function(d){
    return '<tr><td><b>' + esc(jalali(d.date)) + '</b><div class="small muted">' + esc(d.date) + '</div></td>'
      + '<td>' + fa(d.participant_count_students) + '</td><td>' + fa(d.participant_count_staff) + '</td>'
      + '<td class="small">' + esc(d.notes || '—') + '</td>'
      + '<td><div class="row" style="gap:5px;flex-wrap:nowrap">'
      + '<button class="icon-btn" title="ویرایش" data-act="drill-edit" data-id="' + escAttr(d.id) + '">✏️</button>'
      + '<button class="icon-btn danger" title="حذف" data-act="drill-del" data-id="' + escAttr(d.id) + '">🗑️</button>'
      + '</div></td></tr>';
  }).join('');
  return '<div class="card"><div class="card-head"><h3>⛑️ مانور ایمنی/زلزله</h3>'
    + '<button class="btn" data-act="drill-new">➕ ثبت مانور</button></div>'
    + '<div class="card-body">' + banner
    + (list.length
      ? '<div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>دانش‌آموز</th><th>کادر</th><th>یادداشت</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : empty('⛑️', 'مانوری ثبت نشده', ''))
    + '</div></div>';
}

/* ═══════════════════════════════════════════════════════════════════
   بند B.5 فرناز (چت۱) — ثبت کمک‌های داوطلبانه
   ─────────────────────────────────────────────────────────────────
   • مجموعهٔ جدا: donations — هیچ اشتراکی با ماژولِ شهریه ندارد: نه
     رکورد (tuitions/installments/transactions)، نه تابع، نه اکشن،
     نه روت. فقط rial() و jalali() که ابزارِ عمومی‌اند.
   • school_id همیشه از نشست (S.user) می‌آید، هرگز از ورودی (R98).
   • فقط مدیر می‌نویسد (گارد سه‌لایه: ACTION_ROLES ‏+ گاردِ canActionِ
     دسپاتچ + گاردِ داخلِ saveDonation). سوپرادمین طبق اصلِ سراسریِ
     «بدون محدودیت» مجاز است ولی عملاً از «ورود به پنل مدرسه» ثبت
     می‌کند (الگوی B.1/B.4).
   • نامِ کمک‌کننده اختیاری است؛ خالی = «ناشناس».
   ═══════════════════════════════════════════════════════════════════ */
var DON_MAX_AMOUNT = 10000000000;

/** تاریخ ISO معتبر و واقعاً تقویمی؟ (fail-closed — مستقل) */
function donValidDate(s){
  if(typeof s !== 'string') return false;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!m) return false;
  var d = new Date(s + 'T00:00:00');
  return !isNaN(d) && d.getFullYear() === +m[1] && d.getMonth() + 1 === +m[2] && d.getDate() === +m[3];
}

/** کمک‌های یک مدرسه — تازه‌ترین اول */
function donationsOf(schoolId){
  return (db.donations || []).filter(function(d){ return d.school_id === schoolId; })
    .sort(function(a, b){ return String(a.date) < String(b.date) ? 1 : -1; });
}

/** جمع کمک‌های یک مدرسه */
function donationsTotal(schoolId){
  return donationsOf(schoolId).reduce(function(a, d){ return a + (Number(d.amount) || 0); }, 0);
}

/** نام نمایشی کمک‌کننده (خالی = ناشناس) */
function donorFa(d){
  var n = d ? String(d.donor_name || '').trim() : '';
  return n || 'ناشناس';
}

/* ── نویسندهٔ واحد (ثبت/ویرایش) ────────────────
   همهٔ ورودی‌ها از نو اعتبارسنجی می‌شوند؛ id ویرایش باید از همان
   مدرسهٔ نشست باشد (ضد IDOR بین‌مدرسه‌ای). */
function saveDonation(id, donorName, amount, dateISO, description){
  var role = (typeof activePersona === 'function') ? activePersona() : (S.user && S.user.role);
  if(role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر مدرسه می‌تواند کمک ثبت کند' };
  if(!S.user || !S.user.school_id) return { ok: false, msg: 'نشست معتبر نیست' };
  if(!donValidDate(dateISO)) return { ok: false, msg: 'تاریخ معتبر نیست' };
  if(dateISO > todayISO()) return { ok: false, msg: 'ثبت برای روزهای آینده مجاز نیست' };
  amount = Number(amount);
  if(!Number.isInteger(amount) || amount < 1 || amount > DON_MAX_AMOUNT) return { ok: false, msg: 'مبلغ معتبر نیست' };
  donorName = String(donorName == null ? '' : donorName).trim().slice(0, 100);
  description = String(description == null ? '' : description).slice(0, 2000);
  var sid = S.user.school_id;
  if(id){
    var ex = byId('donations', Number(id));
    if(!ex || ex.school_id !== sid) return { ok: false, msg: 'رکورد معتبر نیست' };
    update('donations', ex.id, { donor_name: donorName || null, amount: amount, date: dateISO, description: description });
    return { ok: true, id: ex.id, updated: true };
  }
  var r = insert('donations', { school_id: sid, donor_name: donorName || null, amount: amount, date: dateISO, description: description, registered_by: S.user.id });
  return { ok: true, id: r.id, updated: false };
}

/** حذف یک کمک (فقط همان مدرسهٔ نشست) */
function deleteDonation(id){
  var role = (typeof activePersona === 'function') ? activePersona() : (S.user && S.user.role);
  if(role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر مدرسه می‌تواند حذف کند' };
  if(!S.user || !S.user.school_id) return { ok: false, msg: 'نشست معتبر نیست' };
  var ex = byId('donations', Number(id));
  if(!ex || ex.school_id !== S.user.school_id) return { ok: false, msg: 'رکورد معتبر نیست' };
  remove('donations', ex.id);
  return { ok: true };
}

/** رسید چاپی سادهٔ یک کمک */
function donPrint(id){
  var d = byId('donations', Number(id));
  if(!d) { toast('رکورد یافت نشد', 'err'); return; }
  if(S.user && S.user.school_id && d.school_id !== S.user.school_id) { toast('رکوردِ مدرسهٔ دیگری است', 'err'); return; }
  var w = window.open('', '_blank');
  if(!w){ toast('اجازه باز کردن پنجره داده نشد', 'err'); return; }
  var sc = byId('schools', d.school_id) || {};
  w.document.write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>رسید کمک داوطلبانه</title>'
    + '<style>body{font-family:Vazirmatn,Tahoma;padding:28px;color:#0f172a;max-width:520px;margin:auto}'
    + 'h1{font-size:20px;color:#1668f0;margin:0 0 4px}table{width:100%;border-collapse:collapse;font-size:14px;margin-top:14px}'
    + 'td{border:1px solid #cbd5e1;padding:8px}@media print{.np{display:none}}</style></head><body>'
    + '<h1>🧾 رسید کمک داوطلبانه</h1>'
    + '<div>' + esc(sc.name || '') + ' — شمارهٔ رسید: <b>' + fa(d.id) + '</b></div>'
    + '<table><tbody>'
    + '<tr><td>کمک‌کننده</td><td><b>' + esc(donorFa(d)) + '</b></td></tr>'
    + '<tr><td>مبلغ</td><td><b>' + rial(d.amount) + ' ریال</b></td></tr>'
    + '<tr><td>تاریخ</td><td>' + esc(jalali(d.date)) + '</td></tr>'
    + '<tr><td>شرح</td><td>' + esc(d.description || '—') + '</td></tr>'
    + '</tbody></table><div class="np" style="text-align:center;margin-top:14px"><button onclick="window.print()" style="padding:8px 20px;border:none;border-radius:8px;background:#1668f0;color:#fff;font-family:inherit;cursor:pointer">🖨️ چاپ</button></div></body></html>');
  w.document.close();
}

/** نمای کمک‌های داوطلبانه (روت donations — فقط مدیر) */
function viewDonations(){
  var u = S.user;
  var list = donationsOf(u.school_id);
  var total = donationsTotal(u.school_id);
  var rows = list.map(function(d){
    return '<tr><td><b>' + esc(jalali(d.date)) + '</b></td>'
      + '<td>' + esc(donorFa(d)) + '</td><td><b>' + rial(d.amount) + '</b> <span class="small muted">ریال</span></td>'
      + '<td class="small">' + esc(d.description || '—') + '</td>'
      + '<td><div class="row" style="gap:5px;flex-wrap:nowrap">'
      + '<button class="icon-btn" title="رسید چاپی" data-act="don-print" data-id="' + escAttr(d.id) + '">🖨️</button>'
      + '<button class="icon-btn" title="ویرایش" data-act="don-edit" data-id="' + escAttr(d.id) + '">✏️</button>'
      + '<button class="icon-btn danger" title="حذف" data-act="don-del" data-id="' + escAttr(d.id) + '">🗑️</button>'
      + '</div></td></tr>';
  }).join('');
  return '<div class="card"><div class="card-head"><h3>🎁 کمک‌های داوطلبانه</h3>'
    + '<span class="badge b-green">جمع: ' + rial(total) + ' ریال</span>'
    + '<button class="btn" data-act="don-new">➕ ثبت کمک</button></div>'
    + '<div class="card-body">'
    + (list.length
      ? '<div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>کمک‌کننده</th><th>مبلغ</th><th>شرح</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : empty('🎁', 'کمکی ثبت نشده', ''))
    + '<p class="small muted">این بخش کاملاً جدا از شهریه است و روی حساب‌های شهریه اثری ندارد.</p>'
    + '</div></div>';
}

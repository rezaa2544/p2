/* ═══════════════════════════════════════════════════════════════════
   کمبودِ نیروی انسانی به تفکیکِ درس (بند D.4 از دستورِ جامعِ فرناز)
   ───────────────────────────────────────────────────────────────────
   دو سویِ یک قراردادِ ساده:

     • مدیرِ مدرسه  ⇒ «در درسِ X به N دبیر نیاز دارم» (یک رکورد)
     • رئیسِ اداره  ⇒ جدولِ ساده: کدام مدرسه، در کدام درس، چقدر کمبود

   🔴 قاعده‌های ثابت:
     ۱. **اداره فقط می‌خواند** — نوشتنِ این مجموعه برای `edu_office`
        بسته است (در مدلِ مجوزها هم). اداره «نیاز» را اعلام نمی‌کند،
        گزارش می‌بیند.
     ۲. **مدیر فقط مدرسهٔ خودش** — هم در رابط (این فایل) و هم در
        سرور (`inScope` روی school_id). دستکاریِ `school_id` سمت
        کلاینت بی‌اثر است چون سرور مستقل بررسی می‌کند.
     ۳. **تأمین‌شده حذف نمی‌شود** — وضعیت `filled` می‌گیرد تا سابقهٔ
        اینکه چه کمبودی چه وقت برطرف شد، بماند.
   ═══════════════════════════════════════════════════════════════════ */

var NEED_STATUS = {
  open:   ['نیازمندِ دبیر', 'b-red'],
  filled: ['تأمین شد',      'b-green']
};

/** نیازهایِ یک مدرسه (جدیدترین اول) */
function needsOfSchool(schoolId){
  return (db.staff_needs || []).filter(function(n){ return n.school_id === schoolId; })
    .sort(function(a, b){
      var sa = a.status === 'filled' ? 1 : 0, sb = b.status === 'filled' ? 1 : 0;
      if(sa !== sb) return sa - sb;                 /* بازها اول */
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
}
/** نامِ درس از روی شناسه (حذفِ رکورد هم بدترین حالت «—» است، نه کرش) */
function needSubjectName(n){
  var s = byId('subjects', n && n.subject_id);
  return (s && s.name) ? s.name : '—';
}
/** درس‌هایِ یک مدرسه برای انتخابگر — نام‌های تکراری (پایه‌های مختلف) یکی می‌شوند */
function subjectOptionsFor(schoolId){
  var seen = {}, out = [];
  (db.subjects || []).forEach(function(s){
    if(s.school_id !== schoolId) return;
    if(seen[s.name]) return;
    seen[s.name] = 1;
    out.push([s.id, s.name]);
  });
  return out.sort(function(a, b){ return a[1].localeCompare(b[1], 'fa'); });
}

/* ─────────────────────────── نمای مدیر مدرسه ─────────────────────────── */
function viewStaffNeedsManager(){
  var sid = S.user.school_id;
  var rows = needsOfSchool(sid);
  var openN = rows.filter(function(n){ return n.status !== 'filled'; }).length;
  var head = '<div class="card"><div class="card-head"><h3>🧑‍🏫 اعلامِ کمبودِ نیرو</h3>'
    + '<div class="row"><span class="badge ' + (openN ? 'b-red' : 'b-green') + '">'
    + fa(openN) + ' موردِ باز</span>'
    + '<button class="btn" data-act="need-new">➕ اعلام کمبود</button></div></div>';
  if(!rows.length){
    return head + '<div class="card-body">' + empty('🧑‍🏫', 'کمبودی اعلام نشده است',
      'اگر در درسی دبیر کم دارید، همین‌جا اعلام کنید — اداره در گزارشِ منطقه می‌بیند.') + '</div></div>';
  }
  return head + '<div class="table-wrap"><table class="table"><thead><tr>'
    + '<th>درس</th><th>تعدادِ دبیرِ مورد نیاز</th><th>وضعیت</th><th>توضیح</th><th>تاریخ</th><th></th>'
    + '</tr></thead><tbody>'
    + rows.map(function(n){
      var st = NEED_STATUS[n.status] || NEED_STATUS.open;
      return '<tr><td><b>' + esc(needSubjectName(n)) + '</b></td>'
        + '<td>' + fa(n.count || 1) + ' نفر</td>'
        + '<td><span class="badge ' + st[1] + '">' + st[0] + '</span></td>'
        + '<td class="small muted">' + esc(n.note || '—') + '</td>'
        + '<td class="small muted">' + esc(jalali(n.created_at || todayISO())) + '</td>'
        + '<td class="row nowrap">'
        + (n.status === 'filled'
            ? '<button class="btn ghost sm" data-act="need-reopen" data-id="' + escAttr(n.id) + '">بازگشایی</button>'
            : '<button class="btn sm" data-act="need-fill" data-id="' + escAttr(n.id) + '">تأمین شد</button>')
        + '<button class="icon-btn danger" title="حذف" data-act="need-del" data-id="' + escAttr(n.id) + '">🗑️</button>'
        + '</td></tr>';
    }).join('')
    + '</tbody></table></div></div>';
}

/* ───────────────────── نمای اداره / سوپرادمین (فقط خواندن) ───────────────────── */
/**
 * ردیف‌هایِ تجمیعیِ محدوده.
 * برمی‌گرداند: {rows, bySubject, schoolsWithNeed, openCount}
 */
function officeNeedsRows(schools){
  var ids = {};
  schools.forEach(function(s){ ids[s.id] = 1; });
  var rows = (db.staff_needs || []).filter(function(n){ return ids[n.school_id]; })
    .map(function(n){
      var sc = byId('schools', n.school_id);
      return {
        need: n,
        school: sc ? sc.name : 'مدرسهٔ حذف‌شده',
        county: (byId('counties', sc ? sc.county_id : 0) || {}).name || '—',
        subject: needSubjectName(n),
        count: Number(n.count) || 1,
        open: n.status !== 'filled'
      };
    })
    .sort(function(a, b){
      if(a.open !== b.open) return a.open ? -1 : 1;          /* بازها اول */
      if(b.count !== a.count) return b.count - a.count;      /* بعد پرنیازتر */
      return a.school.localeCompare(b.school, 'fa');
    });
  var bySubject = {}, schoolsWith = {}, openCount = 0;
  rows.forEach(function(r){
    if(!r.open) return;
    openCount++;
    schoolsWith[r.need.school_id] = 1;
    var k = r.subject;
    bySubject[k] = bySubject[k] || { subject: k, schools: {}, count: 0 };
    bySubject[k].schools[r.need.school_id] = 1;
    bySubject[k].count += r.count;
  });
  var subjList = Object.keys(bySubject).map(function(k){
    return { subject: k, schools: Object.keys(bySubject[k].schools).length, count: bySubject[k].count };
  }).sort(function(a, b){ return (b.count - a.count) || (b.schools - a.schools); });
  return { rows: rows, bySubject: subjList, schoolsWithNeed: Object.keys(schoolsWith).length, openCount: openCount };
}

function viewStaffNeedsOffice(){
  var o = (typeof officeOf === 'function') ? officeOf(S.user) : null;
  var schools = (typeof officeScopeSchools === 'function') ? officeScopeSchools(o) : [];
  var agg = officeNeedsRows(schools);
  var label = o ? esc(o.name) : 'کلِ کشور (سوپرادمین)';

  var head = '<div class="card" style="margin-bottom:14px"><div class="card-head">'
    + '<h3>🧑‍🏫 کمبودِ نیروی انسانی — مدارسِ تحتِ پوشش</h3>'
    + '<div class="row"><span class="badge b-gray">' + esc(label) + '</span>'
    + '<button class="btn ghost sm" data-act="staff-needs-print">🖨️ نسخهٔ چاپی</button></div></div>'
    + '<div class="card-body"><div class="grid g3">'
    + statCard('🚨', fa(agg.openCount), 'موردِ کمبودِ باز', agg.openCount ? 'red' : 'green')
    + statCard('🏫', fa(agg.schoolsWithNeed), 'مدرسهٔ نیازمند', 'amber')
    + statCard('📚', fa(agg.bySubject.length), 'درسِ درگیر', 'blue')
    + '</div>'
    + '<div class="small muted" style="margin-top:8px;line-height:2">'
    + esc('این جدول فقط از اعلامِ خودِ مدیران ساخته می‌شود؛ اداره چیزی در آن نمی‌نویسد.')
    + '</div></div></div>';

  if(!agg.rows.length){
    return head + '<div class="card"><div class="card-body">' + empty('✅', 'هیچ کمبودی اعلام نشده است',
      'وقتی مدیرِ مدرسه‌ای در درسی کمبودِ دبیر اعلام کند، اینجا دیده می‌شود.') + '</div></div>';
  }

  var bySubj = agg.bySubject.length
    ? '<div class="card" style="margin-bottom:14px"><div class="card-head"><h3>خلاصه به تفکیکِ درس</h3>'
      + '<span class="badge b-gray">فقط مواردِ باز</span></div><div class="table-wrap"><table class="table">'
      + '<thead><tr><th>درس</th><th>مدارسِ نیازمند</th><th>مجموعِ دبیرِ مورد نیاز</th></tr></thead><tbody>'
      + agg.bySubject.map(function(s){
          return '<tr><td><b>' + esc(s.subject) + '</b></td><td>' + fa(s.schools) + '</td>'
            + '<td>' + fa(s.count) + ' نفر</td></tr>';
        }).join('')
      + '</tbody></table></div></div>'
    : '';

  var table = '<div class="card"><div class="card-head"><h3>جزئیات به تفکیکِ مدرسه</h3></div>'
    + '<div class="table-wrap"><table class="table"><thead><tr>'
    + '<th>مدرسه</th><th>شهرستان</th><th>درس</th><th>تعداد</th><th>وضعیت</th><th>توضیح</th><th>تاریخ</th>'
    + '</tr></thead><tbody>'
    + agg.rows.map(function(r){
      var st = NEED_STATUS[r.open ? 'open' : 'filled'];
      return '<tr' + (r.open ? ' style="background:var(--red-soft)"' : '') + '>'
        + '<td><b>' + esc(r.school) + '</b></td>'
        + '<td class="small muted">' + esc(r.county) + '</td>'
        + '<td>' + esc(r.subject) + '</td>'
        + '<td>' + fa(r.count) + ' نفر</td>'
        + '<td><span class="badge ' + st[1] + '">' + st[0] + '</span></td>'
        + '<td class="small muted">' + esc(r.need.note || '—') + '</td>'
        + '<td class="small muted">' + esc(jalali(r.need.created_at || todayISO())) + '</td></tr>';
    }).join('')
    + '</tbody></table></div></div>';

  return head + bySubj + table;
}

/** یک نما برای هر دو نقش — تصمیم با نقش است، نه با روتِ جدا */
function viewStaffNeeds(){
  var role = (typeof activePersona === 'function') ? activePersona() : (S.user && S.user.role);
  if(role === 'manager') return viewStaffNeedsManager();
  if(role === 'edu_office' || role === 'superadmin') return viewStaffNeedsOffice();
  return '<div class="card"><div class="card-body">' + empty('🧑‍🏫', 'این صفحه برای این نقش نیست',
    'کمبودِ نیرو را مدیرِ مدرسه اعلام می‌کند و اداره می‌بیند.') + '</div></div>';
}

/* ─────────────────────────── خروجیِ چاپی (اداره) ─────────────────────────── */
function staffNeedsPrintHTML(agg, title){
  var rows = (agg.rows || []).map(function(r){
    return '<tr><td>' + esc(r.school) + '</td><td>' + esc(r.county) + '</td><td>' + esc(r.subject) + '</td>'
      + '<td>' + fa(r.count) + '</td><td>' + (r.open ? 'نیازمندِ دبیر' : 'تأمین‌شده') + '</td>'
      + '<td class="small">' + esc(r.need.note || '—') + '</td></tr>';
  }).join('');
  var subj = (agg.bySubject || []).map(function(s){
    return '<tr><td>' + esc(s.subject) + '</td><td>' + fa(s.schools) + '</td><td>' + fa(s.count) + '</td></tr>';
  }).join('');
  return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
    + '<title>کمبودِ نیروی انسانی — ' + esc(title) + '</title>'
    + '<style>body{font-family:Vazirmatn,Tahoma,Arial;padding:24px;color:#0f172a;line-height:1.9}'
    + 'h1{font-size:19px;margin:0 0 2px;color:#1668f0}h2{font-size:15px;margin:20px 0 6px}'
    + '.sub{font-size:12.5px;color:#556}'
    + 'table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}'
    + 'th,td{border:1px solid #cbd5e1;padding:7px;text-align:right}th{background:#eff6ff}'
    + '.foot{margin-top:16px;font-size:11.5px;color:#667;border-top:1px solid #e2e8f0;padding-top:8px}'
    + '@media print{.np{display:none}body{padding:0}}</style></head><body>'
    + '<h1>کمبودِ نیروی انسانی — ' + esc(title) + '</h1>'
    + '<div class="sub">' + esc(jalali(todayISO())) + ' · ' + fa(agg.openCount || 0) + ' موردِ باز در '
    + fa(agg.schoolsWithNeed || 0) + ' مدرسه</div>'
    + '<h2>خلاصه به تفکیکِ درس (فقط مواردِ باز)</h2>'
    + '<table><thead><tr><th>درس</th><th>مدارسِ نیازمند</th><th>مجموعِ دبیر</th></tr></thead><tbody>'
    + (subj || '<tr><td colspan="3">موردی نیست</td></tr>') + '</tbody></table>'
    + '<h2>جزئیات به تفکیکِ مدرسه</h2>'
    + '<table><thead><tr><th>مدرسه</th><th>شهرستان</th><th>درس</th><th>تعداد</th><th>وضعیت</th><th>توضیح</th></tr></thead><tbody>'
    + (rows || '<tr><td colspan="6">موردی نیست</td></tr>') + '</tbody></table>'
    + '<div class="foot">' + esc('این گزارش از اعلامِ مدیرانِ مدارس ساخته شده و فقط دادهٔ تجمیعی است.')
    + '</div>'
    + '<div class="np" style="text-align:center;margin-top:14px"><button onclick="window.print()" '
    + 'style="padding:9px 22px;border:none;border-radius:8px;background:#1668f0;color:#fff;font-family:inherit;cursor:pointer">'
    + '🖨️ چاپ / ذخیرهٔ PDF</button></div></body></html>';
}

/* ─────────────────────────── فرم و عملیات ─────────────────────────── */
function staffNeedModal(n){
  n = n || null;
  var sid = S.user.school_id;
  var opts = subjectOptionsFor(sid);
  var body = f('درس *', opts.length
      ? sel('nd_subject', opts, n ? n.subject_id : '')
      : '<div class="small muted">برای این مدرسه درسی تعریف نشده است.</div>')
    + f('تعدادِ دبیرِ مورد نیاز *', inp('nd_count', n ? (n.count || 1) : 1, 'number'))
    + f('توضیح', '<textarea class="input" id="nd_note" rows="3" placeholder="مثلاً: دبیرِ فیزیک در مرخصی است">' + esc(n ? (n.note || '') : '') + '</textarea>');
  openModal(modalTpl(n ? 'ویرایشِ اعلامِ کمبود' : 'اعلامِ کمبودِ نیرو', body, 'need-save'));
  window._needEdit = n ? n.id : 0;
}

/**
 * آیا کاربرِ فعلی می‌تواند این رکورد را تغییر دهد؟
 * 🔴 فقط مدرسهٔ خودش (سوپرادمین استثناست). این guard سمتِ کلاینت است —
 * سرور هم مستقل در `inScope` همان را می‌سنجد؛ اینجا برای این است که رابط
 * اصلاً پیشنهادِ غلط ندهد و خطا بی‌صدا رد نشود.
 */
function needWritable(id){
  var n = byId('staff_needs', id);
  if(!n) return false;
  if(S.user.role === 'superadmin') return true;
  return n.school_id === S.user.school_id;
}

var NEED_ACTIONS = {
  'need-new'(){ staffNeedModal(null); },
  'need-edit'(el, id){
    if(!needWritable(id)){ toast('این اعلامِ کمبود برای مدرسهٔ شما نیست', 'err'); return; }
    staffNeedModal(byId('staff_needs', id));
  },
  'need-save'(){
    var sid = S.user.school_id;
    var sub = Number(V('nd_subject')) || 0;
    var cnt = Math.max(1, Math.min(20, Number(V('nd_count')) || 1));
    if(invalid('nd_subject', !sub, 'درس را انتخاب کنید')) return;
    /* درس باید از همان مدرسه باشد — انتخابگر محدود است، ولی اینجا هم سنجیده
       می‌شود چون مقدار از DOM می‌آید و قابلِ دستکاری است. */
    var s = byId('subjects', sub);
    if(!s || s.school_id !== sid){ toast('درس نامعتبر است', 'err'); return; }
    var data = { subject_id: sub, count: cnt, note: (V('nd_note') || '').slice(0, 300) };
    if(window._needEdit) update('staff_needs', window._needEdit, data);
    else insert('staff_needs', Object.assign({
      school_id: sid, status: 'open', created_by: S.user.id, created_at: todayISO()
    }, data));
    closeModal(); toast(window._needEdit ? 'اعلامِ کمبود ویرایش شد' : 'کمبود اعلام شد', 'ok');
    window._needEdit = 0; render();
  },
  'need-fill'(el, id){
    if(!needWritable(id)){ toast('این اعلامِ کمبود برای مدرسهٔ شما نیست', 'err'); return; }
    update('staff_needs', id, { status: 'filled', updated_at: todayISO() });
    toast('تأمین شد — در گزارشِ اداره دیگر «باز» نیست', 'ok'); render();
  },
  'need-reopen'(el, id){
    if(!needWritable(id)){ toast('این اعلامِ کمبود برای مدرسهٔ شما نیست', 'err'); return; }
    update('staff_needs', id, { status: 'open', updated_at: todayISO() });
    toast('دوباره باز شد', 'ok'); render();
  },
  'need-del'(el, id){
    if(!needWritable(id)){ toast('این اعلامِ کمبود برای مدرسهٔ شما نیست', 'err'); return; }
    var n = byId('staff_needs', id);
    askDelete('اعلامِ کمبودِ «' + needSubjectName(n) + '» حذف شود؟', function(){
      remove('staff_needs', id); toast('حذف شد', 'ok'); render();
    });
  },
  'staff-needs-print'(){
    var o = (typeof officeOf === 'function') ? officeOf(S.user) : null;
    var schools = (typeof officeScopeSchools === 'function') ? officeScopeSchools(o) : [];
    var html = staffNeedsPrintHTML(officeNeedsRows(schools), o ? o.name : 'کلِ کشور');
    var w = window.open('', '_blank');
    if(!w){ toast('اجازهٔ باز کردنِ پنجره داده نشد', 'err'); return; }
    w.document.write(html); w.document.close();
  }
};

/* ═══════════════════════════════════════════════════════════════════
   پنل سوپرادمین — سه ابزار مدیریت کل سامانه
   ═══════════════════════════════════════════════════════════════════
   بخش ۱ ▸ داشبورد مالی سراسری   روت: finance
   بخش ۲ ▸ بازنشانی رمز کاربر     اکشن: pass-reset
   بخش ۳ ▸ سلامت سامانه           روت: health

   ⚠️ همهٔ محاسبه‌ها با یک پیمایش گروه‌بندی می‌شوند، نه پیمایش جدول
   به‌ازای هر مدرسه. در مقیاس ملی این تفاوت میان خطی و درجه‌دوم است.
   ═══════════════════════════════════════════════════════════════════ */

/* ───────────────────────── بخش ۱: مالی ───────────────────────── */

/**
 * خلاصهٔ مالی کل سامانه با یک پیمایش روی هر جدول.
 * خروجی: درآمد اشتراک، شهریه، وضعیت اشتراک‌ها و رتبهٔ مدارس.
 */
function financeSummary(){
  var today = todayISO();
  var soon = addDaysISO(today, 30);

  /* اشتراک اولیا — یک پیمایش */
  var sub = { active:0, trial:0, expired:0, none:0, revenue:0, expiringSoon:0 };
  db.parent_subscriptions.forEach(function(s){
    var st = s.status || 'none';
    if(sub[st] !== undefined) sub[st]++;
    if(s.paid_at) sub.revenue += Number(s.amount || 0);
    if((st === 'active' || st === 'trial') && s.end_date && s.end_date >= today && s.end_date <= soon)
      sub.expiringSoon++;
  });

  /* شهریه — یک پیمایش روی اقساط و یک پیمایش روی تراکنش‌ها */
  var tuition = { billed:0, paid:0, overdue:0, overdueCount:0 };
  db.installments.forEach(function(i){
    tuition.billed += Number(i.amount || 0);
    tuition.paid += Number(i.paid_amount || 0);
    if(i.status !== 'paid' && i.due_date && i.due_date < today){
      tuition.overdue += Number(i.amount || 0) - Number(i.paid_amount || 0);
      tuition.overdueCount++;
    }
  });

  /* درآمد ماه‌های اخیر برای نمودار ساده */
  var byMonth = Object.create(null);
  db.transactions.forEach(function(t){
    if(t.kind !== 'income') return;
    var m = String(t.date || '').slice(0, 7);
    if(m) byMonth[m] = (byMonth[m] || 0) + Number(t.amount || 0);
  });
  var months = Object.keys(byMonth).sort().slice(-6).map(function(m){
    return { month:m, amount:byMonth[m] };
  });

  /* رتبهٔ مدارس بر پایهٔ پرداخت شهریه — گروه‌بندی یک‌باره */
  var paidBySchool = Object.create(null);
  db.installments.forEach(function(i){
    if(!i.school_id) return;
    paidBySchool[i.school_id] = (paidBySchool[i.school_id] || 0) + Number(i.paid_amount || 0);
  });
  /* شمار اولیای هر مدرسه و اشتراک فعالشان */
  var studentSchool = Object.create(null);
  db.users.forEach(function(u){
    if(u.role === 'student') studentSchool[u.id] = u.school_id;
  });
  var parentsOf = Object.create(null);
  db.parent_links.forEach(function(l){
    var sid = studentSchool[l.student_id];
    if(!sid) return;
    (parentsOf[sid] = parentsOf[sid] || Object.create(null))[l.parent_id] = true;
  });
  var subStatus = Object.create(null);
  db.parent_subscriptions.forEach(function(s){ subStatus[s.user_id] = s.status; });

  var schools = db.schools.map(function(sc){
    var pl = parentsOf[sc.id] ? Object.keys(parentsOf[sc.id]) : [];
    var act = 0;
    pl.forEach(function(pid){ if(subStatus[pid] === 'active') act++; });
    return { school: sc, parents: pl.length, active: act,
      conv: pl.length ? Math.round(act / pl.length * 1000) / 10 : 0,
      paid: paidBySchool[sc.id] || 0 };
  }).sort(function(a, b){ return b.paid - a.paid; });

  return { sub: sub, tuition: tuition, months: months, schools: schools };
}

function viewFinance(){
  var d = financeSummary();
  var maxM = d.months.reduce(function(a, b){ return Math.max(a, b.amount); }, 0) || 1;
  var totalParents = d.sub.active + d.sub.trial + d.sub.expired + d.sub.none;
  var conv = totalParents ? Math.round(d.sub.active / totalParents * 1000) / 10 : 0;

  return '<div class="grid g4" style="margin-bottom:14px">'
    + statCard('💰', rialShort(d.sub.revenue), 'درآمد اشتراک (ریال)', 'green')
    + statCard('🏦', rialShort(d.tuition.paid), 'شهریه دریافتی (ریال)', 'blue')
    + statCard('⏳', rialShort(d.tuition.overdue), 'شهریه معوق (ریال)', 'red')
    + statCard('📈', fa(conv) + '٪', 'نرخ تبدیل اشتراک', 'purple') + '</div>'

    + '<div class="grid g2" style="margin-bottom:14px">'
    /* وضعیت اشتراک‌ها */
    + '<div class="card"><div class="card-head"><h3>وضعیت اشتراک اولیا</h3>'
    + (d.sub.expiringSoon ? '<span class="badge b-amber">' + fa(d.sub.expiringSoon)
        + ' انقضا تا ۳۰ روز آینده</span>' : '') + '</div>'
    + '<div class="card-body"><table class="table"><tbody>'
    + [['فعال', d.sub.active, 'var(--green)'], ['در دورهٔ آزمایشی', d.sub.trial, 'var(--amber)'],
       ['منقضی‌شده', d.sub.expired, 'var(--red)'], ['بدون اشتراک', d.sub.none, 'var(--muted)']]
      .map(function(r){
        var pct = totalParents ? Math.round(r[1] / totalParents * 100) : 0;
        return '<tr><td>' + r[0] + '</td><td style="width:52%">' + bar(pct, 100, r[2]) + '</td>'
          + '<td style="width:70px;text-align:left"><b>' + fa(r[1]) + '</b>'
          + '<span class="small muted"> (' + fa(pct) + '٪)</span></td></tr>';
      }).join('')
    + '</tbody></table></div></div>'

    /* شهریه */
    + '<div class="card"><div class="card-head"><h3>وضعیت شهریه</h3></div>'
    + '<div class="card-body"><table class="table"><tbody>'
    + '<tr><td>کل صورت‌حساب</td><td style="text-align:left"><b>' + rial(d.tuition.billed) + '</b> ریال</td></tr>'
    + '<tr><td>دریافت‌شده</td><td style="text-align:left"><b style="color:var(--green)">'
      + rial(d.tuition.paid) + '</b> ریال</td></tr>'
    + '<tr><td>معوق</td><td style="text-align:left"><b style="color:var(--red)">'
      + rial(d.tuition.overdue) + '</b> ریال</td></tr>'
    + '<tr><td>اقساط سررسیدگذشته</td><td style="text-align:left"><b>'
      + fa(d.tuition.overdueCount) + '</b> فقره</td></tr>'
    + '</tbody></table>'
    + bar(d.tuition.billed ? Math.round(d.tuition.paid / d.tuition.billed * 100) : 0, 100, 'var(--green)')
    + '<div class="small muted" style="margin-top:6px">درصد وصول شهریه</div>'
    + '</div></div></div>'

    /* روند درآمد */
    + (d.months.length ? '<div class="card" style="margin-bottom:14px">'
      + '<div class="card-head"><h3>روند درآمد شش ماه اخیر</h3></div><div class="card-body">'
      + d.months.map(function(m){
          return '<div class="row" style="gap:10px;margin-bottom:7px">'
            + '<span class="small muted" style="width:74px">' + faD(m.month) + '</span>'
            + '<div style="flex:1">' + bar(Math.round(m.amount / maxM * 100), 100, 'var(--primary)') + '</div>'
            + '<b class="small" style="width:110px;text-align:left">' + rialShort(m.amount) + '</b></div>';
        }).join('') + '</div></div>' : '')

    /* رتبهٔ مدارس */
    + '<div class="card"><div class="card-head"><h3>عملکرد مالی مدارس</h3></div>'
    + '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>مدرسه</th>'
    + '<th>ولی</th><th>اشتراک فعال</th><th>نرخ تبدیل</th><th>شهریه دریافتی</th></tr></thead><tbody>'
    + d.schools.map(function(r, i){
        return '<tr><td>' + fa(i + 1) + '</td><td><b>' + esc(r.school.name) + '</b></td>'
          + '<td>' + fa(r.parents) + '</td><td>' + fa(r.active) + '</td>'
          + '<td><span class="badge ' + (r.conv >= 50 ? 'b-green' : r.conv >= 25 ? 'b-amber' : 'b-gray')
          + '">' + fa(r.conv) + '٪</span></td>'
          + '<td><b>' + rialShort(r.paid) + '</b></td></tr>';
      }).join('')
    + '</tbody></table></div></div>';
}

/* ──────────────────── بخش ۲: بازنشانی رمز ──────────────────── */

/** رمز موقت خوانا: چهار حرف + چهار رقم، بدون نویسهٔ مبهم */
function tempPassword(){
  var letters = 'abcdefghjkmnpqrstuvwxyz', digits = '23456789', out = '';
  for(var i = 0; i < 4; i++) out += letters[Math.floor(Math.random() * letters.length)];
  for(var j = 0; j < 4; j++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}

/**
 * بازنشانی رمز یک کاربر.
 * حساب‌های هم‌رده یا بالاتر محافظت می‌شوند تا مدیر نتواند رمز
 * سوپرادمین را عوض کند و کنترل سامانه را بگیرد.
 */
function canResetPassword(target, actorRole){
  if(!target) return false;
  actorRole = actorRole || (S.user && S.user.role);
  if(actorRole === 'superadmin') return target.role !== 'superadmin' || target.id === S.user.id;
  if(actorRole === 'manager'){
    return target.school_id === S.user.school_id
        && ['student','teacher','parent'].indexOf(target.role) > -1;
  }
  return false;
}

function resetPassword(userId){
  var u = byId('users', userId);
  if(!canResetPassword(u)) return null;
  var pass = tempPassword();
  update('users', userId, { password: pass, must_change_password: 1 });
  insert('notifications', { user_id: userId, school_id: u.school_id || null,
    type: 'announcement', title: '🔑 رمز عبور شما بازنشانی شد',
    body: 'رمز تازهٔ شما «' + pass + '» است. پس از ورود آن را تغییر دهید.',
    link: 'dashboard', read: 0, created_at: todayISO() });
  return pass;
}

/* ─────────────────── بخش ۳: سلامت سامانه ─────────────────── */

/**
 * جمع‌آوری نشانه‌های سلامت از لایه‌های موجود.
 * هیچ محاسبهٔ تازه‌ای انجام نمی‌شود؛ فقط ابزارهای آماده خوانده می‌شوند.
 */
function healthReport(){
  var out = { storage:{}, index:{}, sync:{}, scope:{}, data:{} };

  /* حافظهٔ مرورگر */
  var logBytes = 0, queueBytes = 0;
  logBytes = Store.bytes(LOG_KEY);
  queueBytes = Store.bytes(SYNC_QUEUE_KEY);
  var used = logBytes + queueBytes, limit = 5 * 1024 * 1024;
  out.storage = { used: used, limit: limit,
    percent: Math.round(used / limit * 1000) / 10,
    ops: (typeof log !== 'undefined') ? log.length : 0,
    full: (typeof STORAGE_FULL !== 'undefined') ? !!STORAGE_FULL : false };

  /* لایهٔ ایندکس */
  if(typeof idxReport === 'function'){
    var r = idxReport();
    var st = r.stats || {};
    var tot = (st.hits || 0) + (st.misses || 0);
    out.index = { hits: st.hits || 0, misses: st.misses || 0, builds: st.builds || 0,
      rate: tot ? Math.round((st.hits || 0) / tot * 1000) / 10 : 0 };
  }

  /* صف همگام‌سازی */
  if(typeof SYNC !== 'undefined'){
    var q = SYNC.queue || [];
    out.sync = { total: q.length,
      pending: q.filter(function(x){ return x.status === 'pending'; }).length,
      failed: q.filter(function(x){ return x.status === 'failed'; }).length,
      conflict: q.filter(function(x){ return x.status === 'conflict'; }).length,
      online: (typeof navigator !== 'undefined') ? navigator.onLine !== false : true,
      demo: !!SYNC.demoMode, lastSync: SYNC.lastSync || null };
  }

  /* محدودهٔ دادهٔ نقش‌ها */
  if(typeof scopeHealth === 'function'){
    try{ out.scope = scopeHealth() || {}; }catch(e){ out.scope = {}; }
  }

  /* حجم داده */
  var counts = {}, total = 0;
  Object.keys(db).forEach(function(k){
    if(Array.isArray(db[k])){ counts[k] = db[k].length; total += db[k].length; }
  });
  var top = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; }).slice(0, 8);
  out.data = { total: total, collections: Object.keys(counts).length,
    top: top.map(function(k){ return { name: k, n: counts[k] }; }) };

  return out;
}

/** یک ردیف نشانه با چراغ وضعیت */
function healthRow(label, value, level, hint){
  var color = level === 'bad' ? 'var(--red)' : level === 'warn' ? 'var(--amber)' : 'var(--green)';
  var icon = level === 'bad' ? '⛔' : level === 'warn' ? '⚠️' : '✅';
  return '<tr><td style="width:34px">' + icon + '</td><td>' + esc(label) + '</td>'
    + '<td style="text-align:left"><b style="color:' + color + '">' + value + '</b></td>'
    + '<td class="small muted">' + esc(hint || '') + '</td></tr>';
}

/* ═══════════════════════════════════════════════════════════════════
   دایره‌های آنالوگِ صفحهٔ سلامت — نسل دوم (گرافیک بالا‌برده)
   کاربر یکی از سه شیوهٔ نمایش را انتخاب می‌کند (در
   payesh_health_gauge_v1 ماندگار است): عقربه‌ای / آنالوگ / میله‌ای.
   نکات کلیدی:
   • رنگِ عقربه پیروِ «محدوده‌ای» است که در آن ایستاده (سبز/کهربایی/سرخ).
   • همهٔ ترسیم‌ها SVG خالص با گرادیان و فیلتر نور — بدون تصویر و
     بدون وابستگی. شناسهٔ تعریف‌ها (uid) به هر دایره جداگانه داده
     می‌شود تا تداخل id رخ ندهد.
   • مقادیر همیشه به ۰..۱ سنجاق می‌شوند.
   ═══════════════════════════════════════════════════════════════════ */
var HGT_TONES = {
  ok:   'var(--green)',
  warn: 'var(--amber)',
  bad:  'var(--red)',
  blue: 'var(--primary)'
};
var HGT_STYLES = [
  ['needle', '⏱️', 'عقربه‌ای'],
  ['dial',   '🕹️', 'آنالوگ'],
  ['bar',    '📊', 'میله‌ای عمودی']
];

function hgtFrac(value, max){
  var f = Number(value) / Number(max);
  if(isNaN(f) || !isFinite(f)) f = 0;
  return Math.max(0, Math.min(1, f));
}

/* رنگِ محدودهٔ فعلی — همان رنگی که عقربه باید بگیرد */
function hgtZoneTone(f, goodHigh){
  if(goodHigh) return f >= .7 ? HGT_TONES.ok : f >= .4 ? HGT_TONES.warn : HGT_TONES.bad;
  return f < .6 ? HGT_TONES.ok : f < .85 ? HGT_TONES.warn : HGT_TONES.bad;
}

/* مسیر کمان SVG بین دو زاویه (درجه) */
function hgtArcPath(cx, cy, r, a0, a1){
  var x0 = cx + r * Math.cos(a0 * Math.PI / 180), y0 = cy + r * Math.sin(a0 * Math.PI / 180);
  var x1 = cx + r * Math.cos(a1 * Math.PI / 180), y1 = cy + r * Math.sin(a1 * Math.PI / 180);
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) +
         ' A' + r + ' ' + r + ' 0 ' + ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' +
         x1.toFixed(2) + ' ' + y1.toFixed(2);
}

/* تعریف‌های مشترک (گرادیان‌ها + فیلتر نور) — با شناسهٔ یکتا برای هر دایره */
function hgtDefs(uid, tone){
  return '<defs>' +
    '<filter id="hgtGlow' + uid + '" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feGaussianBlur stdDeviation="2.4" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
    '</filter>' +
    '<linearGradient id="hgtArc' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="' + tone + '" stop-opacity=".5"/>' +
      '<stop offset="1" stop-color="' + tone + '"/>' +
    '</linearGradient>' +
    '<radialGradient id="hgtFace' + uid + '" cx=".5" cy=".42" r=".8">' +
      '<stop offset="0" stop-color="#ffffff"/>' +
      '<stop offset="1" stop-color="#e9f0fc"/>' +
    '</radialGradient>' +
    '<linearGradient id="hgtBar' + uid + '" x1="0" y1="1" x2="0" y2="0">' +
      '<stop offset="0" stop-color="' + tone + '" stop-opacity=".82"/>' +
      '<stop offset="1" stop-color="' + tone + '"/>' +
    '</linearGradient>' +
  '</defs>';
}

/* برچسبِ کوتاه برای اعداد بزرگ (۱٬۲۳۴ ← ۱.۲ هزار) */
function hgtShortNum(n){
  n = Number(n) || 0;
  if(n >= 10000) return fa(Math.round(n / 10000)) + ' هزار';
  if(n >= 1000) return fa(Math.round(n / 1000)) + ' هزار';
  return fa(Math.round(n));
}

/* ── شیوهٔ ۱: عقربه‌ای ────────────────────────────────────────────
   رنگِ عقربه رنگِ همان محدوده‌ای است که در آن ایستاده است. */
function healthGaugeNeedle(g, uid){
  var f = hgtFrac(g.value, g.max);
  var tone = HGT_TONES[g.tone] || HGT_TONES.blue;
  var zoneTone = hgtZoneTone(f, g.goodHigh);
  var zones = g.goodHigh
    ? [ [0, .4, HGT_TONES.bad], [.4, .7, HGT_TONES.warn], [.7, 1, HGT_TONES.ok] ]
    : [ [0, .6, HGT_TONES.ok], [.6, .85, HGT_TONES.warn], [.85, 1, HGT_TONES.bad] ];
  var A0 = -210, SWEEP = 240, GAP = 2.2;
  var z = zones.map(function(zn){
    return '<path d="' + hgtArcPath(60, 68, 47, A0 + zn[0] * SWEEP + GAP, A0 + zn[1] * SWEEP - GAP) +
      '" fill="none" stroke="' + zn[2] + '" stroke-width="9" stroke-linecap="round" opacity=".85"/>';
  }).join('');
  var ticks = '';
  for(var i = 0; i <= 12; i++){
    var a = (A0 + (i / 12) * SWEEP) * Math.PI / 180;
    var major = i % 3 === 0;
    ticks += '<line x1="' + (60 + (major ? 41 : 43) * Math.cos(a)).toFixed(1) + '" y1="' + (68 + (major ? 41 : 43) * Math.sin(a)).toFixed(1) +
      '" x2="' + (60 + 37 * Math.cos(a)).toFixed(1) + '" y2="' + (68 + 37 * Math.sin(a)).toFixed(1) +
      '" stroke="' + (major ? 'var(--border-strong)' : 'var(--border)') + '" stroke-width="' + (major ? 2 : 1) + '"/>';
  }
  /* برچسب‌های عددی: صفر، میانه، حداکثر */
  var lb = function(t, txt){
    var a = (A0 + t * SWEEP) * Math.PI / 180;
    return '<text x="' + (60 + 54 * Math.cos(a)).toFixed(1) + '" y="' + (68 + 54 * Math.sin(a) + 3).toFixed(1) +
      '" text-anchor="middle" font-size="7.5" fill="var(--muted)">' + txt + '</text>';
  };
  var labels = lb(0, '۰') + lb(.5, hgtShortNum(g.max / 2)) + lb(1, hgtShortNum(g.max));
  var rot = (-120 + f * 240).toFixed(2);
  var valTxt = fa(Math.round(Number(g.value) || 0));
  return '<svg viewBox="0 0 120 122" class="hgt-svg">' +
    hgtDefs(uid, tone) +
    '<circle cx="60" cy="68" r="44" fill="url(#hgtFace' + uid + ')" stroke="var(--border)" stroke-width="1"/>' +
    z + ticks + labels +
    '<g class="hgt-needle" style="transform:rotate(' + rot + 'deg)">' +
      '<path class="hgt-needle-body" d="M60 29 L56.6 66 L60 71 L63.4 66 Z" fill="' + zoneTone +
        '" filter="url(#hgtGlow' + uid + ')" stroke="#ffffff" stroke-width=".6" stroke-opacity=".5"/>' +
      '<line x1="60" y1="71" x2="60" y2="81" stroke="' + zoneTone + '" stroke-width="3" stroke-linecap="round" opacity=".45"/>' +
    '</g>' +
    '<circle cx="60" cy="68" r="7" fill="var(--surface)" stroke="' + zoneTone + '" stroke-width="2.5"/>' +
    '<circle cx="60" cy="68" r="2.8" fill="' + zoneTone + '"/>' +
    '<text x="60" y="105" text-anchor="middle" font-size="17" font-weight="800" fill="' + zoneTone + '">' + valTxt + '</text>' +
    '<text x="60" y="117" text-anchor="middle" font-size="8.5" fill="var(--muted)">' + esc(g.unit) + '</text>' +
  '</svg>';
}

/* ── شیوهٔ ۲: آنالوگ ──────────────────────────────────────────────
   نیم‌دایره با قوسِ گرادیانی، سایهٔ درونی ریل و نقطهٔ دمیده. */
function healthGaugeDial(g, uid){
  var f = hgtFrac(g.value, g.max);
  var tone = HGT_TONES[g.tone] || HGT_TONES.blue;
  var endA = 180 + f * 180;
  var dx = 60 + 40 * Math.cos(endA * Math.PI / 180);
  var dy = 66 + 40 * Math.sin(endA * Math.PI / 180);
  var ticks = '';
  for(var i = 0; i <= 10; i++){
    var a = (180 + (i / 10) * 180) * Math.PI / 180;
    var major = i % 5 === 0;
    ticks += '<line x1="' + (60 + (major ? 46 : 48) * Math.cos(a)).toFixed(1) + '" y1="' + (66 + (major ? 46 : 48) * Math.sin(a)).toFixed(1) +
      '" x2="' + (60 + 52 * Math.cos(a)).toFixed(1) + '" y2="' + (66 + 52 * Math.sin(a)).toFixed(1) +
      '" stroke="' + (major ? 'var(--border-strong)' : 'var(--border)') + '" stroke-width="' + (major ? 2 : 1) + '"/>';
  }
  var valTxt = fa(Math.round(Number(g.value) || 0));
  return '<svg viewBox="0 0 120 86" class="hgt-svg">' +
    hgtDefs(uid, tone) +
    '<path d="' + hgtArcPath(60, 67, 40, 180, 360) + '" fill="none" stroke="var(--border-strong)" stroke-width="13" stroke-linecap="round" opacity=".25"/>' +
    '<path d="' + hgtArcPath(60, 66, 40, 180, 360) + '" fill="none" stroke="var(--surface)" stroke-width="11" stroke-linecap="round"/>' +
    '<path d="' + hgtArcPath(60, 66, 40, 180, 360) + '" fill="none" stroke="var(--border)" stroke-width="11" stroke-linecap="round" opacity=".5"/>' +
    (f > 0.004
      ? '<path d="' + hgtArcPath(60, 66, 40, 180, Math.max(181.5, endA)) + '" fill="none" stroke="url(#hgtArc' + uid + ')" stroke-width="11" stroke-linecap="round" filter="url(#hgtGlow' + uid + ')"/>'
      : '') +
    ticks +
    '<circle class="hgt-dot" cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="7" fill="var(--surface)" stroke="' + tone + '" stroke-width="3" filter="url(#hgtGlow' + uid + ')"/>' +
    '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="2.5" fill="' + tone + '"/>' +
    '<text x="18" y="82" text-anchor="middle" font-size="7.5" fill="var(--muted)">۰</text>' +
    '<text x="102" y="82" text-anchor="middle" font-size="7.5" fill="var(--muted)">' + hgtShortNum(g.max) + '</text>' +
    '<text x="60" y="58" text-anchor="middle" font-size="18" font-weight="800" fill="var(--text)">' + valTxt + '</text>' +
    '<text x="60" y="74" text-anchor="middle" font-size="8.5" fill="var(--muted)">' + esc(g.unit) + '</text>' +
  '</svg>';
}

/* ── شیوهٔ ۳: میله‌ای عمودی ───────────────────────────────────────
   میلهٔ گرد با پرشدگی گرادیانی، براقیت شیشه‌ای، خط سطح و درجه‌بندی. */
function healthGaugeBar(g, uid){
  var f = hgtFrac(g.value, g.max);
  var tone = HGT_TONES[g.tone] || HGT_TONES.blue;
  var topY = 130 - f * 116;
  var ticks = '';
  [0, .25, .5, .75, 1].forEach(function(t){
    var y = 130 - t * 116;
    ticks += '<line x1="62" y1="' + y.toFixed(1) + '" x2="68" y2="' + y.toFixed(1) + '" stroke="var(--border-strong)" stroke-width="1.5"/>' +
      '<text x="71" y="' + (y + 3).toFixed(1) + '" font-size="7.5" fill="var(--muted)">' + fa(Math.round(t * 100)) + '</text>';
  });
  var valTxt = fa(Math.round(Number(g.value) || 0));
  return '<svg viewBox="0 0 96 152" class="hgt-svg">' +
    hgtDefs(uid, tone) +
    '<rect x="36" y="12" width="20" height="124" rx="10" fill="#edf2fb" stroke="var(--border)" stroke-width="1.2"/>' +
    (f > 0.004
      ? '<g class="hgt-fill" filter="url(#hgtGlow' + uid + ')">' +
        '<rect x="39" y="' + topY.toFixed(1) + '" width="14" height="' + (130 - topY).toFixed(1) + '" rx="7" fill="url(#hgtBar' + uid + ')"/>' +
        '<rect x="41" y="' + topY.toFixed(1) + '" width="10" height="2.6" rx="1.3" fill="#ffffff" opacity=".55"/>' +
      '</g>'
      : '') +
    '<rect x="39.5" y="15" width="4.5" height="118" rx="2.25" fill="#ffffff" opacity=".5"/>' +
    ticks +
    '<text x="46" y="146" text-anchor="middle" font-size="12" font-weight="800" fill="' + tone + '">' + valTxt + '</text>' +
    '<text x="46" y="150.5" text-anchor="middle" font-size="7" fill="var(--muted)">' + esc(g.unit) + '</text>' +
  '</svg>';
}

function healthGauge(style, g, uid){
  if(style === 'dial') return healthGaugeDial(g, uid);
  if(style === 'bar') return healthGaugeBar(g, uid);
  return healthGaugeNeedle(g, uid);
}

/* کارتِ دایره‌ها با انتخاب‌گر شیوهٔ نمایش (مردگار) */
function healthGaugePanel(h, stLevel, idxLevel, syncLevel){
  var style = Store.get('payesh_health_gauge_v1') || 'needle';
  if(style === 'thermo') style = 'bar'; /* سازگاری با نامِ قدیمی */
  if(HGT_STYLES.filter(function(s){ return s[0] === style; }).length === 0) style = 'needle';
  var gauges = [
    { label: 'مصرف حافظهٔ مرورگر', unit: '٪ از ۵ مگابایت', value: h.storage.percent, max: 100, tone: stLevel },
    { label: 'نرخ اصابت ایندکس', unit: '٪', value: h.index.rate, max: 100, tone: idxLevel, goodHigh: true },
    { label: 'صف ارسال به سرور', unit: 'عملیات', value: h.sync.pending || 0, max: Math.max(50, (h.sync.pending || 0) * 1.5), tone: syncLevel },
    { label: 'کل رکوردها', unit: 'رکورد', value: h.data.total, max: Math.max(1000, Math.ceil((h.data.total || 1) * 1.25)), tone: 'blue' }
  ];
  var seg = HGT_STYLES.map(function(s){
    return '<button class="btn sm ghost' + (style === s[0] ? ' on' : '') + '" '
      + 'data-act="health-gauge-style" data-s="' + s[0] + '">' + s[1] + ' ' + s[2] + '</button>';
  }).join('');
  return '<div class="card" style="margin-bottom:14px"><div class="card-head">'
    + '<h3>📟 دایره‌های آنالوگ</h3>'
    + '<div class="row hgt-seg">' + seg + '</div></div>'
    + '<div class="card-body"><div class="grid g4 hgt-grid">'
    + gauges.map(function(g, gi){
        return '<div class="hgt-tile">' + healthGauge(style, g, 'g' + gi)
          + '<div class="hgt-lbl">' + esc(g.label) + '</div></div>';
      }).join('')
    + '</div></div></div>';
}


function viewHealth(){
  var h = healthReport();
  var stLevel = h.storage.percent >= 80 ? 'bad' : h.storage.percent >= 50 ? 'warn' : 'ok';
  var idxLevel = h.index.rate >= 90 ? 'ok' : h.index.rate >= 70 ? 'warn' : 'bad';
  var syncLevel = (h.sync.failed || h.sync.conflict) ? 'bad'
    : (h.sync.pending > 20) ? 'warn' : 'ok';

  return '<div class="grid g4" style="margin-bottom:14px">'
    + statCard('💾', fa(h.storage.percent) + '٪', 'مصرف حافظه مرورگر',
        stLevel === 'bad' ? 'red' : stLevel === 'warn' ? 'amber' : 'green')
    + statCard('⚡', fa(h.index.rate) + '٪', 'نرخ اصابت ایندکس',
        idxLevel === 'ok' ? 'green' : 'amber')
    + statCard('🔄', fa(h.sync.pending || 0), 'در صف ارسال به سرور',
        syncLevel === 'ok' ? 'green' : syncLevel === 'warn' ? 'amber' : 'red')
    + statCard('🗃️', fa(h.data.total), 'کل رکوردها', 'blue') + '</div>'

    + healthGaugePanel(h, stLevel, idxLevel, syncLevel)

    + '<div class="card" style="margin-bottom:14px"><div class="card-head"><h3>نشانه‌های سلامت</h3></div>'
    + '<div class="table-wrap"><table class="table"><tbody>'
    + healthRow('حافظهٔ مرورگر', fa(h.storage.percent) + '٪ از ۵ مگابایت', stLevel,
        h.storage.full ? 'حافظه پر شده — تغییرات تازه ذخیره نمی‌شوند'
          : stLevel === 'warn' ? 'به نیمهٔ ظرفیت رسیده' : 'در محدودهٔ مطلوب')
    + healthRow('دفترچهٔ عملیات', fa(h.storage.ops) + ' عملیات',
        h.storage.ops > 10000 ? 'warn' : 'ok', 'تغییرات ثبت‌شده از ابتدا')
    + healthRow('نرخ اصابت ایندکس', fa(h.index.rate) + '٪', idxLevel,
        fa(h.index.hits) + ' اصابت · ' + fa(h.index.builds) + ' بازسازی')
    + healthRow('اتصال شبکه', h.sync.online ? 'برخط' : 'برون‌خط',
        h.sync.online ? 'ok' : 'warn',
        h.sync.online ? 'تغییرات بلافاصله ارسال می‌شوند' : 'تغییرات در صف می‌مانند')
    + healthRow('صف همگام‌سازی', fa(h.sync.total || 0) + ' عملیات', syncLevel,
        (h.sync.failed ? fa(h.sync.failed) + ' ناموفق · ' : '')
        + (h.sync.conflict ? fa(h.sync.conflict) + ' تعارض · ' : '')
        + (h.sync.demo ? 'حالت نمایشی — سرور واقعی متصل نیست' : 'متصل به سرور'))
    + healthRow('محدودهٔ دادهٔ نقش‌ها',
        h.scope.records != null ? fa(h.scope.records) + ' رکورد' : '—',
        h.scope.ok === false ? 'warn' : 'ok', 'حجم دادهٔ ارسالی به هر مرورگر')
    + '</tbody></table></div></div>'

    + '<div class="grid g2">'
    + '<div class="card"><div class="card-head"><h3>بزرگ‌ترین جدول‌ها</h3>'
    + '<span class="badge b-gray">' + fa(h.data.collections) + ' مجموعه</span></div>'
    + '<div class="card-body"><table class="table"><tbody>'
    + h.data.top.map(function(t){
        var pct = h.data.total ? Math.round(t.n / h.data.total * 100) : 0;
        return '<tr><td class="small">' + esc(t.name) + '</td>'
          + '<td style="width:45%">' + bar(pct, 100, 'var(--primary)') + '</td>'
          + '<td style="width:78px;text-align:left"><b>' + fa(t.n) + '</b></td></tr>';
      }).join('')
    + '</tbody></table></div></div>'

    + '<div class="card"><div class="card-head"><h3>ابزارهای نگهداری</h3></div>'
    + '<div class="card-body" style="display:grid;gap:10px">'
    + '<div class="row"><div style="flex:1"><b class="small">پشتیبان‌گیری</b>'
    + '<div class="small muted">دریافت نسخهٔ پشتیبان از همهٔ تغییرات ثبت‌شده</div></div>'
    + '<button class="btn ghost sm" data-act="backup-make">⬇️ دریافت</button></div>'
    + '<div class="row"><div style="flex:1"><b class="small">بازیابی از پشتیبان</b>'
    + '<div class="small muted">بازگرداندن وضعیت از روی فایل پشتیبان</div></div>'
    + '<button class="btn ghost sm" data-act="restore-pick">⬆️ بازیابی</button></div>'
    + '<div class="row"><div style="flex:1"><b class="small">بازسازی ایندکس‌ها</b>'
    + '<div class="small muted">اگر نرخ اصابت پایین است، ایندکس‌ها را از نو بساز</div></div>'
    + '<button class="btn ghost sm" data-act="health-reindex">♻️ بازسازی</button></div>'
    + '<div class="row"><div style="flex:1"><b class="small">پاک‌سازی صف ناموفق</b>'
    + '<div class="small muted">عملیات ناموفق را برای ارسال دوباره آماده کن</div></div>'
    + '<button class="btn ghost sm" data-act="health-retry">🔁 تلاش دوباره</button></div>'
    + '</div></div></div>';
}

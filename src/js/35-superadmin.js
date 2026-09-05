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
   دایره‌های آنالوگِ صفحهٔ سلامت
   کاربر یکی از سه شیوهٔ نمایش را انتخاب می‌کند (در
   payesh_health_gauge_v1 ماندگار است): عقربه‌ای / آنالوگ / دماسنجی.
   همهٔ سه، SVG خالص هستند: بدون تصویر، بدون وابستگی، و در صفحه‌نماهای
   با ترازی بالا هم تیز می‌مانند. مقدارها همیشه به بازهٔ ۰..۱
   سنجاق می‌شوند تا دایره هرگز «بیش از حد» نشود.
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
  ['thermo', '🌡️', 'دماسنجی']
];

function hgtFrac(value, max){
  var f = Number(value) / Number(max);
  if(isNaN(f) || !isFinite(f)) f = 0;
  return Math.max(0, Math.min(1, f));
}

/* مسیر کمان SVG بین دو زاویه (درجه؛ در دستگاه SVG، افزایش = پادساعت‌گردِ بصری) */
function hgtArcPath(cx, cy, r, a0, a1){
  var x0 = cx + r * Math.cos(a0 * Math.PI / 180), y0 = cy + r * Math.sin(a0 * Math.PI / 180);
  var x1 = cx + r * Math.cos(a1 * Math.PI / 180), y1 = cy + r * Math.sin(a1 * Math.PI / 180);
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) +
         ' A' + r + ' ' + r + ' 0 ' + ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' +
         x1.toFixed(2) + ' ' + y1.toFixed(2);
}

/* شیوهٔ ۱ — عقربه‌ای: ۲۴۰ درجه، سه ناحیهٔ رنگی، عقربهٔ چرخان با پیکان مرکزی */
function healthGaugeNeedle(g){
  var f = hgtFrac(g.value, g.max);
  var tone = HGT_TONES[g.tone] || HGT_TONES.blue;
  var zones = g.goodHigh
    ? [ [0, .4, HGT_TONES.bad], [.4, .7, HGT_TONES.warn], [.7, 1, HGT_TONES.ok] ]
    : [ [0, .6, HGT_TONES.ok], [.6, .85, HGT_TONES.warn], [.85, 1, HGT_TONES.bad] ];
  var A0 = -210, SWEEP = 240;
  var z = zones.map(function(zn){
    return '<path d="' + hgtArcPath(60, 68, 46, A0 + zn[0] * SWEEP, A0 + zn[1] * SWEEP) +
      '" fill="none" stroke="' + zn[2] + '" stroke-width="8" opacity=".45"/>';
  }).join('');
  var ticks = '';
  for(var i = 0; i <= 10; i++){
    var a = (A0 + (i / 10) * SWEEP) * Math.PI / 180;
    ticks += '<line x1="' + (60 + 40 * Math.cos(a)).toFixed(1) + '" y1="' + (68 + 40 * Math.sin(a)).toFixed(1) +
      '" x2="' + (60 + 35 * Math.cos(a)).toFixed(1) + '" y2="' + (68 + 35 * Math.sin(a)).toFixed(1) +
      '" stroke="var(--border-strong)" stroke-width="' + (i % 5 === 0 ? 2 : 1) + '"/>';
  }
  var rot = (-120 + f * 240).toFixed(2);
  var valTxt = fa(Math.round(Number(g.value) || 0));
  return '<svg viewBox="0 0 120 120" class="hgt-svg">' +
    '<circle cx="60" cy="68" r="36" fill="' + tone + '" opacity=".07"/>' +
    z + ticks +
    '<g class="hgt-needle" style="transform:rotate(' + rot + 'deg)">' +
      '<line x1="60" y1="68" x2="60" y2="30" stroke="' + tone + '" stroke-width="3.5" stroke-linecap="round"/>' +
      '<line x1="60" y1="68" x2="60" y2="79" stroke="var(--text)" stroke-width="3" stroke-linecap="round" opacity=".55"/>' +
    '</g>' +
    '<circle cx="60" cy="68" r="5.5" fill="var(--surface)" stroke="' + tone + '" stroke-width="2.5"/>' +
    '<text x="60" y="103" text-anchor="middle" font-size="17" font-weight="800" fill="var(--text)">' + valTxt + '</text>' +
    '<text x="60" y="115" text-anchor="middle" font-size="8.5" fill="var(--muted)">' + esc(g.unit) + '</text>' +
  '</svg>';
}

/* شیوهٔ ۲ — آنالوگ: نیم‌دایرهٔ قوس‌دار با پرشدگی گرد و نقطهٔ دمیده‌شونده */
function healthGaugeDial(g){
  var f = hgtFrac(g.value, g.max);
  var tone = HGT_TONES[g.tone] || HGT_TONES.blue;
  var endA = 180 + f * 180;
  var dx = 60 + 40 * Math.cos(endA * Math.PI / 180);
  var dy = 66 + 40 * Math.sin(endA * Math.PI / 180);
  var ticks = '';
  for(var i = 0; i <= 8; i++){
    var a = (180 + (i / 8) * 180) * Math.PI / 180;
    ticks += '<line x1="' + (60 + 45 * Math.cos(a)).toFixed(1) + '" y1="' + (66 + 45 * Math.sin(a)).toFixed(1) +
      '" x2="' + (60 + 49 * Math.cos(a)).toFixed(1) + '" y2="' + (66 + 49 * Math.sin(a)).toFixed(1) +
      '" stroke="var(--border-strong)" stroke-width="' + (i % 4 === 0 ? 2 : 1) + '"/>';
  }
  var valTxt = fa(Math.round(Number(g.value) || 0));
  return '<svg viewBox="0 0 120 82" class="hgt-svg">' +
    '<path d="' + hgtArcPath(60, 66, 40, 180, 360) + '" fill="none" stroke="var(--border)" stroke-width="10" stroke-linecap="round" opacity=".45"/>' +
    (f > 0.004
      ? '<path d="' + hgtArcPath(60, 66, 40, 180, Math.max(181, endA)) + '" fill="none" stroke="' + tone + '" stroke-width="10" stroke-linecap="round"/>'
      : '') +
    ticks +
    '<circle class="hgt-dot" cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="6" fill="var(--surface)" stroke="' + tone + '" stroke-width="3"/>' +
    '<text x="60" y="58" text-anchor="middle" font-size="18" font-weight="800" fill="var(--text)">' + valTxt + '</text>' +
    '<text x="60" y="74" text-anchor="middle" font-size="8.5" fill="var(--muted)">' + esc(g.unit) + '</text>' +
  '</svg>';
}

/* شیوهٔ ۳ — دماسنجی: لولهٔ شیشه‌ای، حباب نورانی، ستون مایع و درجه‌بندی */
function healthGaugeThermo(g){
  var f = hgtFrac(g.value, g.max);
  var tone = HGT_TONES[g.tone] || HGT_TONES.blue;
  var topY = 116 - f * 100;
  var ticks = '';
  [0, .25, .5, .75, 1].forEach(function(t){
    var y = 116 - t * 100;
    ticks += '<line x1="38" y1="' + y.toFixed(1) + '" x2="44" y2="' + y.toFixed(1) + '" stroke="var(--border-strong)" stroke-width="1.5"/>' +
      '<text x="47" y="' + (y + 3).toFixed(1) + '" font-size="7.5" fill="var(--muted)">' + fa(Math.round(t * 100)) + '</text>';
  });
  var valTxt = fa(Math.round(Number(g.value) || 0));
  return '<svg viewBox="0 0 64 160" class="hgt-svg">' +
    '<circle class="hgt-glow" cx="30" cy="128" r="19" fill="' + tone + '"/>' +
    '<rect x="25" y="16" width="10" height="104" rx="5" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5"/>' +
    '<rect class="hgt-liquid" x="26.5" y="' + topY.toFixed(1) + '" width="7" height="' + (116 - topY).toFixed(1) + '" rx="3.5" fill="' + tone + '"/>' +
    '<circle cx="30" cy="128" r="13" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5"/>' +
    '<circle cx="30" cy="128" r="10" fill="' + tone + '"/>' +
    ticks +
    '<text x="32" y="150" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text)">' + valTxt + '</text>' +
    '<text x="32" y="159" text-anchor="middle" font-size="7.5" fill="var(--muted)">' + esc(g.unit) + '</text>' +
  '</svg>';
}

function healthGauge(style, g){
  if(style === 'dial') return healthGaugeDial(g);
  if(style === 'thermo') return healthGaugeThermo(g);
  return healthGaugeNeedle(g);
}

/* کارتِ دایره‌ها با انتخاب‌گر شیوهٔ نمایش (مردگار) */
function healthGaugePanel(h, stLevel, idxLevel, syncLevel){
  var style = Store.get('payesh_health_gauge_v1') || 'needle';
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
    + gauges.map(function(g){
        return '<div class="hgt-tile">' + healthGauge(style, g)
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

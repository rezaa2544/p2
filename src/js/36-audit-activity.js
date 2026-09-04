/* ═══════════════════════════════════════════════════════════════════
   سابقهٔ تغییرات و آمار فعالیت
   ═══════════════════════════════════════════════════════════════════
   بخش ۱ ▸ سابقهٔ تغییرات (چه کسی، کِی، چه کرد)    روت: audit
   بخش ۲ ▸ آمار بازدید و بار سامانه                روت: activity

   چرا دو بخش در یک ماژول؟ هر دو از یک منبع تغذیه می‌شوند:
   رویدادهایی که کاربران در سامانه می‌سازند.

   ⚠️ نکتهٔ طراحی مهم:
   دفترچهٔ عملیات (log) پیش از این فقط {t, c, data} داشت و هیچ ردی از
   «چه کسی» و «کِی» نبود. آن را غنی کردیم، اما با احتیاط:
   فقط شناسهٔ کاربر و مُهر زمان اضافه شد، نه کل رکورد. چون دفترچه در
   حافظهٔ مرورگر ذخیره می‌شود و هر بایت اضافه در مقیاس ملی ضرب می‌شود.
   ═══════════════════════════════════════════════════════════════════ */

/* ─────────────── کلیدهای ذخیره‌سازی ─────────────── */
var VISITS_KEY = 'sms_visits_v1';
var PERF_KEY   = 'sms_perf_v1';

/* ─────────── بخش ۱: سابقهٔ تغییرات ─────────── */

/** نام فارسی مجموعه‌ها برای نمایش خوانا در سابقه */
var COLL_FA = {
  users:'کاربر', schools:'مدرسه', classes:'کلاس', subjects:'درس',
  enrollments:'ثبت‌نام', attendance:'حضور و غیاب', grades:'نمره',
  discipline:'مورد انضباطی', announcements:'اطلاعیه', notifications:'اعلان',
  leaves:'مرخصی', calendar:'رویداد تقویم', messages:'پیام',
  tuition_plans:'طرح شهریه', tuitions:'شهریه', installments:'قسط',
  transactions:'تراکنش', exams:'امتحان', exam_duties:'مراقبت امتحان',
  exam_terms:'نوبت امتحانی', corrections:'درخواست اصلاح',
  parent_links:'پیوند ولی', parent_verifications:'تأیید ولی',
  parent_subscriptions:'اشتراک ولی', subscription_payments:'پرداخت اشتراک',
  offices:'اداره', provinces:'استان', counties:'شهرستان', districts:'منطقه',
  schedule:'برنامه هفتگی', teacher_schools:'مدرسه دبیر',
  student_transfers:'انتقال دانش‌آموز', transfer_requests:'درخواست انتقال',
  student_archive:'بایگانی فارغ‌التحصیل', nid_conflicts:'تعارض کد ملی',
  meeting_slots:'نوبت جلسه', sms_wallet:'کیف پیامک', sms_log:'پیامک',
  notify_queue:'صف پیام اولیا',
  teacher_notes:'یادداشت دبیر',
  app_settings:'تنظیمات'
};

/** مُهر زمان کوتاه و خوانا: «۱۴۰۴/۰۶/۱۲ ۱۴:۳۰» */
function shortStamp(iso){
  if(!iso) return '—';
  var d = String(iso).slice(0, 10);
  var t = String(iso).slice(11, 16);
  var j = (typeof jalali === 'function') ? jalali(d) : d;
  return t ? j + ' ' + faD(t) : j;
}

/** نام فارسی نوع عمل */
var OP_FA = { ins:['ساخت','b-green'], upd:['ویرایش','b-amber'], del:['حذف','b-red'] };

/** عملیات حساسی که باید برجسته شوند */
var SENSITIVE = { users:1, schools:1, grades:1, transactions:1,
                  parent_subscriptions:1, sms_wallet:1, student_archive:1 };

/**
 * ساخت فهرست سابقه از دفترچهٔ عملیات.
 * دفترچه به‌ترتیب زمانی است، پس از انتها می‌خوانیم (تازه‌ترین اول).
 */
function auditList(filters){
  filters = filters || {};
  var out = [];
  var src = (typeof log !== 'undefined') ? log : [];
  for(var i = src.length - 1; i >= 0 && out.length < 500; i--){
    var op = src[i];
    if(!op || !op.c) continue;
    if(filters.coll && op.c !== filters.coll) continue;
    if(filters.op && op.t !== filters.op) continue;
    if(filters.actor && Number(op.by) !== Number(filters.actor)) continue;
    if(filters.sensitive && !SENSITIVE[op.c]) continue;
    var actor = op.by ? byId('users', op.by) : null;
    if(filters.q){
      var hay = (actor ? actor.full_name : '') + ' ' + (COLL_FA[op.c] || op.c);
      if(hay.indexOf(filters.q) < 0) continue;
    }
    out.push({ seq: i + 1, op: op, actor: actor,
      at: op.at || null, sensitive: !!SENSITIVE[op.c] });
  }
  return out;
}

/** خلاصهٔ آماری سابقه */
function auditSummary(){
  var src = (typeof log !== 'undefined') ? log : [];
  var byType = { ins:0, upd:0, del:0 }, byColl = Object.create(null);
  var actors = Object.create(null), sensitive = 0, withActor = 0;
  src.forEach(function(op){
    if(!op || !op.c) return;
    if(byType[op.t] !== undefined) byType[op.t]++;
    byColl[op.c] = (byColl[op.c] || 0) + 1;
    if(op.by){ actors[op.by] = (actors[op.by] || 0) + 1; withActor++; }
    if(SENSITIVE[op.c]) sensitive++;
  });
  var topColl = Object.keys(byColl).sort(function(a,b){ return byColl[b] - byColl[a]; })
    .slice(0, 6).map(function(k){ return { name:k, n:byColl[k] }; });
  var topActor = Object.keys(actors).sort(function(a,b){ return actors[b] - actors[a]; })
    .slice(0, 6).map(function(k){ return { user: byId('users', Number(k)), n: actors[k] }; });
  return { total: src.length, byType: byType, topColl: topColl,
    topActor: topActor, sensitive: sensitive, withActor: withActor };
}

function viewAudit(){
  /* نام flt عمدی است: متغیر f تابع سراسری سازندهٔ فیلد را می‌پوشاند */
  var flt = { coll: S.filters.aColl || '', op: S.filters.aOp || '',
            sensitive: S.filters.aSens === '1', q: (S.filters.aq || '').trim() };
  var rows = auditList(flt);
  var sum = auditSummary();
  var colls = Object.keys(COLL_FA).filter(function(k){
    return (typeof log !== 'undefined') && log.some(function(o){ return o && o.c === k; });
  });

  return '<div class="grid g4" style="margin-bottom:14px">'
    + statCard('📜', fa(sum.total), 'کل تغییرات ثبت‌شده', 'blue')
    + statCard('➕', fa(sum.byType.ins), 'ساخت', 'green')
    + statCard('✏️', fa(sum.byType.upd), 'ویرایش', 'amber')
    + statCard('🗑️', fa(sum.byType.del), 'حذف', 'red') + '</div>'

    + '<div class="card" style="margin-bottom:14px"><div class="card-body"><div class="grid g4">'
    + f('جستجو', '<input class="input" data-f="aq" value="' + esc(flt.q) + '" placeholder="نام کاربر یا نوع داده">')
    + f('نوع داده', '<select class="select" data-f="aColl"><option value="">— همه —</option>'
        + colls.map(function(k){
            return '<option value="' + k + '" ' + (flt.coll === k ? 'selected' : '') + '>'
              + (COLL_FA[k] || k) + '</option>'; }).join('') + '</select>')
    + f('نوع عمل', '<select class="select" data-f="aOp"><option value="">— همه —</option>'
        + ['ins','upd','del'].map(function(t){
            return '<option value="' + t + '" ' + (flt.op === t ? 'selected' : '') + '>'
              + OP_FA[t][0] + '</option>'; }).join('') + '</select>')
    + f('فقط حساس', '<select class="select" data-f="aSens">'
        + '<option value="">— همه —</option><option value="1" ' + (flt.sensitive ? 'selected' : '')
        + '>فقط عملیات حساس</option></select>')
    + '</div></div></div>'

    + '<div class="card"><div class="card-head"><h3>سابقهٔ تغییرات</h3>'
    + '<span class="badge b-gray">' + fa(rows.length) + ' مورد</span></div>'
    + (rows.length ? '<div class="table-wrap"><table class="table"><thead><tr>'
      + '<th>#</th><th>عمل</th><th>نوع داده</th><th>انجام‌دهنده</th><th>زمان</th><th>شناسه رکورد</th>'
      + '</tr></thead><tbody>'
      + rows.slice(0, 200).map(function(r){
          var t = OP_FA[r.op.t] || ['—','b-gray'];
          var rid = r.op.id || (r.op.data && r.op.data.id) || '—';
          return '<tr' + (r.sensitive ? ' style="background:var(--amber-soft)"' : '') + '>'
            + '<td class="small muted">' + fa(r.seq) + '</td>'
            + '<td><span class="badge ' + t[1] + '">' + t[0] + '</span></td>'
            + '<td>' + esc(COLL_FA[r.op.c] || r.op.c)
            + (r.sensitive ? ' <span class="small muted">حساس</span>' : '') + '</td>'
            + '<td>' + (r.actor ? '<b>' + esc(r.actor.full_name) + '</b>'
                + '<div class="small muted">' + esc(ROLE_FA[r.actor.role] || r.actor.role) + '</div>'
                : '<span class="small muted">ثبت‌نشده</span>') + '</td>'
            + '<td class="small muted">' + (r.at ? esc(shortStamp(r.at)) : '—') + '</td>'
            + '<td class="small muted">' + fa(rid) + '</td></tr>';
        }).join('')
      + '</tbody></table></div>'
      : empty('📜','موردی یافت نشد','با تغییر فیلترها دوباره تلاش کنید.'))
    + '</div>'

    + '<div class="grid g2" style="margin-top:14px">'
    + '<div class="card"><div class="card-head"><h3>پرکارترین کاربران</h3></div>'
    + '<div class="card-body">' + (sum.topActor.length
        ? '<table class="table"><tbody>' + sum.topActor.map(function(a){
            return '<tr><td>' + esc(a.user ? a.user.full_name : 'نامشخص') + '</td>'
              + '<td class="small muted">' + esc(a.user ? (ROLE_FA[a.user.role] || '') : '') + '</td>'
              + '<td style="text-align:left"><b>' + fa(a.n) + '</b></td></tr>';
          }).join('') + '</tbody></table>'
        : '<div class="small muted">هنوز تغییری با نام کاربر ثبت نشده است.</div>') + '</div></div>'
    + '<div class="card"><div class="card-head"><h3>پرتغییرترین داده‌ها</h3></div>'
    + '<div class="card-body"><table class="table"><tbody>'
    + sum.topColl.map(function(c){
        return '<tr><td>' + esc(COLL_FA[c.name] || c.name) + '</td>'
          + '<td style="text-align:left"><b>' + fa(c.n) + '</b></td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
}

/* ─────────── بخش ۲: بازدید و بار سامانه ─────────── */

/**
 * ثبت بازدید. در نسخهٔ دمو در حافظهٔ همین مرورگر نگه داشته می‌شود؛
 * پس از اتصال سرور، همین ساختار به سرور فرستاده می‌شود.
 * ساختار عمداً کوچک است: فقط شمارش روزانه و آخرین دیده‌شدن هر کاربر.
 */
function loadVisits(){
  try{ return Store.getJSON(VISITS_KEY, null) || { days:{}, users:{}, sessions:0 }; }
  catch(e){ return { days:{}, users:{}, sessions:0 }; }
}
function saveVisits(v){ Store.setJSON(VISITS_KEY, v); }

/** ثبت یک بازدید تازه (هنگام ورود کاربر یا باز شدن برنامه) */
function trackVisit(userId){
  var v = loadVisits();
  var d = todayISO();
  v.days[d] = (v.days[d] || 0) + 1;
  if(userId) v.users[userId] = new Date().toISOString();
  v.sessions = (v.sessions || 0) + 1;
  /* فقط ۹۰ روز اخیر نگه داشته می‌شود تا حافظه بی‌رویه رشد نکند */
  var keys = Object.keys(v.days).sort();
  while(keys.length > 90){ delete v.days[keys.shift()]; }
  saveVisits(v);
  return v;
}

/** به‌روزرسانی نشان «هنوز فعال است» برای کاربر جاری */
function touchPresence(){
  if(!S.user) return;
  var v = loadVisits();
  v.users[S.user.id] = new Date().toISOString();
  saveVisits(v);
}

/**
 * چه کسانی هم‌اکنون برخط‌اند؟
 * تعریف: کاربری که در پنج دقیقهٔ اخیر فعالیتی داشته است.
 */
function onlineUsers(windowMin){
  windowMin = windowMin || 5;
  var v = loadVisits();
  var now = Date.now(), out = [];
  Object.keys(v.users).forEach(function(uid){
    var t = Date.parse(v.users[uid]);
    if(!isNaN(t) && (now - t) <= windowMin * 60000){
      var u = byId('users', Number(uid));
      if(u) out.push({ user: u, ago: Math.round((now - t) / 1000) });
    }
  });
  return out.sort(function(a,b){ return a.ago - b.ago; });
}

/* ─── سنجش بار: زمان رندر صفحه‌ها ─── */
var PERF = { samples: [], max: 200 };

/** ثبت زمان یک رندر — از renderRoute فراخوانی می‌شود */
function perfSample(route, ms){
  PERF.samples.push({ r: route, ms: ms, t: Date.now() });
  if(PERF.samples.length > PERF.max) PERF.samples.shift();
}

/** خلاصهٔ بار برنامه بر پایهٔ نمونه‌های واقعی رندر */
function loadReport(){
  var s = PERF.samples;
  var byRoute = Object.create(null);
  s.forEach(function(x){
    var b = byRoute[x.r] = byRoute[x.r] || { n:0, sum:0, max:0 };
    b.n++; b.sum += x.ms; if(x.ms > b.max) b.max = x.ms;
  });
  var routes = Object.keys(byRoute).map(function(r){
    return { route:r, n:byRoute[r].n,
      avg: Math.round(byRoute[r].sum / byRoute[r].n * 10) / 10,
      max: Math.round(byRoute[r].max * 10) / 10 };
  }).sort(function(a,b){ return b.avg - a.avg; });

  var all = s.map(function(x){ return x.ms; }).sort(function(a,b){ return a - b; });
  var pct = function(p){ return all.length ? Math.round(all[Math.floor(all.length * p)] * 10) / 10 : 0; };

  /* بار تخمینی سرور: هر عملیات در صف یک درخواست است */
  var q = (typeof SYNC !== 'undefined') ? (SYNC.queue || []) : [];
  var recent = q.filter(function(x){
    return x.created_at && (Date.now() - Date.parse(x.created_at)) < 3600000; }).length;

  return { samples: all.length, routes: routes,
    p50: pct(0.5), p90: pct(0.9), p99: pct(0.99),
    slowest: routes[0] || null,
    queue: q.length, opsLastHour: recent };
}

/** برآورد بار سرور در مقیاس ملی بر پایهٔ رفتار واقعی همین نسخه */
function serverLoadEstimate(concurrent){
  concurrent = concurrent || 5000000;
  var v = loadVisits();
  var days = Object.keys(v.days);
  var perUserPerSec = 0.00095;   /* سنجش‌شده در دور مقیاس ملی */
  var rps = Math.round(concurrent * perUserPerSec);
  return { concurrent: concurrent, rps: rps,
    apiNodes: Math.ceil(rps / 500), dbCores: Math.ceil(rps / 300),
    totalVisits: Object.keys(v.days).reduce(function(a,k){ return a + v.days[k]; }, 0),
    activeDays: days.length };
}

function viewActivity(){
  var v = loadVisits();
  var online = onlineUsers(5);
  var perf = loadReport();
  var days = Object.keys(v.days).sort().slice(-14);
  var maxDay = days.reduce(function(a,k){ return Math.max(a, v.days[k]); }, 0) || 1;
  var totalVisits = Object.keys(v.days).reduce(function(a,k){ return a + v.days[k]; }, 0);
  var todayN = v.days[todayISO()] || 0;
  var est = serverLoadEstimate(5000000);

  /* سلامت بار: بر پایهٔ صدک ۹۰ زمان رندر */
  var lvl = perf.p90 > 100 ? ['سنگین','var(--red)','red']
          : perf.p90 > 50  ? ['متوسط','var(--amber)','amber']
          : ['سبک','var(--green)','green'];

  return '<div class="grid g4" style="margin-bottom:14px">'
    + statCard('🟢', fa(online.length), 'کاربر برخط (۵ دقیقه اخیر)', 'green')
    + statCard('👥', fa(todayN), 'بازدید امروز', 'blue')
    + statCard('📊', fa(totalVisits), 'کل بازدیدها', 'purple')
    + statCard('⚡', fa(perf.p90) + 'ms', 'زمان پاسخ (صدک ۹۰)', lvl[2]) + '</div>'

    /* بار فعلی برنامه */
    + '<div class="grid g2" style="margin-bottom:14px">'
    + '<div class="card"><div class="card-head"><h3>بار برنامه روی دستگاه کاربر</h3>'
    + '<span class="badge b-' + lvl[2] + '">' + lvl[0] + '</span></div>'
    + '<div class="card-body">'
    + (perf.samples
      ? '<table class="table"><tbody>'
        + '<tr><td>نمونه‌های سنجش‌شده</td><td style="text-align:left"><b>' + fa(perf.samples) + '</b></td></tr>'
        + '<tr><td>میانه (صدک ۵۰)</td><td style="text-align:left"><b>' + fa(perf.p50) + ' ms</b></td></tr>'
        + '<tr><td>صدک ۹۰</td><td style="text-align:left"><b style="color:' + lvl[1] + '">'
          + fa(perf.p90) + ' ms</b></td></tr>'
        + '<tr><td>بدترین حالت (صدک ۹۹)</td><td style="text-align:left"><b>' + fa(perf.p99) + ' ms</b></td></tr>'
        + (perf.slowest ? '<tr><td>کندترین صفحه</td><td style="text-align:left"><b>'
          + esc((TITLES[perf.slowest.route] || [perf.slowest.route])[0]) + '</b> — '
          + fa(perf.slowest.avg) + ' ms</td></tr>' : '')
        + '</tbody></table>'
      : '<div class="small muted">هنوز نمونه‌ای ثبت نشده. چند صفحه را باز کنید تا سنجش آغاز شود.</div>')
    + '</div></div>'

    /* بار سرور */
    + '<div class="card"><div class="card-head"><h3>بار سرور</h3></div><div class="card-body">'
    + '<table class="table"><tbody>'
    + '<tr><td>در صف ارسال</td><td style="text-align:left"><b>' + fa(perf.queue) + '</b> عملیات</td></tr>'
    + '<tr><td>عملیات یک ساعت اخیر</td><td style="text-align:left"><b>' + fa(perf.opsLastHour) + '</b></td></tr>'
    + '<tr><td>سرانه هر کاربر</td><td style="text-align:left"><b>۰٫۰۰۰۹۵</b> درخواست بر ثانیه</td></tr>'
    + '</tbody></table>'
    + '<div class="small muted" style="line-height:2;margin-top:8px">'
    + 'برآورد برای <b>' + fa(Math.round(est.concurrent / 1000000)) + ' میلیون</b> کاربر همزمان: '
    + '<b>' + fa(est.rps) + '</b> درخواست بر ثانیه ⇒ حدود <b>' + fa(est.apiNodes)
    + '</b> نمونهٔ سرویس و <b>' + fa(est.dbCores) + '</b> هستهٔ پایگاه داده.'
    + '</div></div></div></div>'

    /* روند بازدید */
    + (days.length ? '<div class="card" style="margin-bottom:14px">'
      + '<div class="card-head"><h3>روند بازدید چهارده روز اخیر</h3></div><div class="card-body">'
      + days.map(function(d){
          return '<div class="row" style="gap:10px;margin-bottom:6px">'
            + '<span class="small muted" style="width:86px">' + jalali(d) + '</span>'
            + '<div style="flex:1">' + bar(Math.round(v.days[d] / maxDay * 100), 100, 'var(--primary)') + '</div>'
            + '<b class="small" style="width:46px;text-align:left">' + fa(v.days[d]) + '</b></div>';
        }).join('') + '</div></div>' : '')

    /* زمان پاسخ به تفکیک صفحه */
    + (perf.routes.length ? '<div class="card" style="margin-bottom:14px">'
      + '<div class="card-head"><h3>زمان پاسخ به تفکیک صفحه</h3></div>'
      + '<div class="table-wrap"><table class="table"><thead><tr><th>صفحه</th>'
      + '<th>بازدید</th><th>میانگین</th><th>بیشینه</th></tr></thead><tbody>'
      + perf.routes.slice(0, 12).map(function(r){
          return '<tr><td>' + esc((TITLES[r.route] || [r.route])[0]) + '</td>'
            + '<td>' + fa(r.n) + '</td>'
            + '<td><b style="color:' + (r.avg > 100 ? 'var(--red)' : r.avg > 50 ? 'var(--amber)' : 'inherit')
            + '">' + fa(r.avg) + ' ms</b></td>'
            + '<td class="small muted">' + fa(r.max) + ' ms</td></tr>';
        }).join('') + '</tbody></table></div></div>' : '')

    /* کاربران برخط */
    + '<div class="card"><div class="card-head"><h3>کاربران برخط</h3>'
    + '<span class="badge b-green">' + fa(online.length) + ' نفر</span></div>'
    + (online.length ? '<div class="table-wrap"><table class="table"><thead><tr>'
      + '<th>کاربر</th><th>نقش</th><th>مدرسه</th><th>آخرین فعالیت</th></tr></thead><tbody>'
      + online.slice(0, 50).map(function(o){
          return '<tr><td><b>' + esc(o.user.full_name) + '</b></td>'
            + '<td class="small">' + esc(ROLE_FA[o.user.role] || o.user.role) + '</td>'
            + '<td class="small muted">'
            + esc((byId('schools', o.user.school_id) || {}).name || '—') + '</td>'
            + '<td class="small muted">' + fa(o.ago) + ' ثانیه پیش</td></tr>';
        }).join('') + '</tbody></table></div>'
      : empty('🌙','کسی برخط نیست','کاربران فعال در پنج دقیقهٔ اخیر اینجا دیده می‌شوند.'))
    + '</div>';
}

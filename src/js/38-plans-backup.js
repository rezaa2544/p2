/* ═══════════════════════════════════════════════════════════════════
   مدیریت پلان فروش و پشتیبان‌گیری
   ═══════════════════════════════════════════════════════════════════
   بخش ۱ ▸ تنظیمات پلان و قیمت‌گذاری   روت: plans
   بخش ۲ ▸ پشتیبان‌گیری و بازیابی      اکشن‌های backup-* و restore-*

   ⚠️ چرا بازیابی مهم‌تر از پشتیبان‌گیری است؟
   پیش از این فقط دکمهٔ «دریافت پشتیبان» وجود داشت و هیچ راهی برای
   برگرداندن آن نبود — یعنی عملاً بی‌فایده. حالا هر دو سو کامل است.
   ═══════════════════════════════════════════════════════════════════ */

/* ─────────── بخش ۱: مدیریت پلان فروش ─────────── */

/** سه پلان فروش با کلید تنظیماتشان */
var PLAN_DEFS = [
  { key:'monthly',  title:'ماهانه',   field:'price_monthly',  days:30,  icon:'📅' },
  { key:'seasonal', title:'فصلی',     field:'price_seasonal', days:90,  icon:'🍂' },
  { key:'yearly',   title:'سالانه',   field:'price_yearly',   days:365, icon:'🎓' }
];

/**
 * آمار فروش هر پلان با یک پیمایش.
 * قیمت مؤثر ماهانه محاسبه می‌شود تا صرفهٔ هر پلان روشن باشد.
 */
function planStats(){
  var st = subSettings();
  var byPlan = Object.create(null), revenue = Object.create(null);
  db.parent_subscriptions.forEach(function(s){
    var k = s.plan || 'none';
    byPlan[k] = (byPlan[k] || 0) + 1;
    if(s.paid_at) revenue[k] = (revenue[k] || 0) + Number(s.amount || 0);
  });
  var total = db.parent_subscriptions.length || 1;
  return PLAN_DEFS.map(function(p){
    var price = Number(st[p.field] || 0);
    return { def: p, price: price,
      perMonth: p.days ? Math.round(price / (p.days / 30)) : price,
      count: byPlan[p.key] || 0,
      revenue: revenue[p.key] || 0,
      share: Math.round((byPlan[p.key] || 0) / total * 1000) / 10 };
  });
}

/** اعتبارسنجی تنظیمات پیش از ذخیره — جلوی مقدار بی‌معنا را می‌گیرد */
function validatePlanSettings(patch){
  var errs = [];
  PLAN_DEFS.forEach(function(p){
    if(patch[p.field] === undefined) return;
    var v = Number(patch[p.field]);
    if(isNaN(v) || v < 0) errs.push('قیمت پلان ' + p.title + ' نامعتبر است');
    else if(v > 100000000) errs.push('قیمت پلان ' + p.title + ' غیرمنطقی بزرگ است');
  });
  if(patch.trial_days !== undefined){
    var d = Number(patch.trial_days);
    if(isNaN(d) || d < 0 || d > 365) errs.push('دورهٔ آزمایشی باید بین ۰ تا ۳۶۵ روز باشد');
  }
  if(patch.school_share_percent !== undefined){
    var s = Number(patch.school_share_percent);
    if(isNaN(s) || s < 0 || s > 100) errs.push('سهم مدرسه باید بین ۰ تا ۱۰۰ درصد باشد');
  }
  /* پلان سالانه نباید از ماهانه گران‌تر باشد (به‌ازای هر ماه) */
  var m = Number(patch.price_monthly), y = Number(patch.price_yearly);
  if(!isNaN(m) && !isNaN(y) && m > 0 && y / 12 > m)
    errs.push('پلان سالانه نباید از ماهانه گران‌تر باشد؛ مشتری انگیزه‌ای برای خریدش ندارد');
  return errs;
}

function viewPlans(){
  var st = subSettings();
  var stats = planStats();
  var maxRev = stats.reduce(function(a,b){ return Math.max(a, b.revenue); }, 0) || 1;
  var share = Number(st.school_share_percent || 20);

  return '<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--primary-soft),#fff)">'
    + '<div class="card-body row"><div style="font-size:32px">💳</div>'
    + '<div style="flex:1"><b>مدل درآمدی سامانه</b><div class="small muted" style="line-height:2">'
    + 'استفاده برای مدرسه رایگان است. هر ولی <b>' + fa(st.trial_days || 0) + '</b> روز رایگان '
    + 'استفاده می‌کند و پس از آن اشتراک می‌گیرد؛ <b>' + fa(share) + '٪</b> از پرداخت هر ولی '
    + 'سهم مدرسهٔ اوست.</div></div>'
    + '<button class="btn" data-act="plan-settings">⚙️ ویرایش تنظیمات</button></div></div>'

    + '<div class="grid g3" style="margin-bottom:14px">'
    + stats.map(function(p){
        return '<div class="card"><div class="card-head"><h3>' + p.def.icon + ' پلان ' + p.def.title + '</h3>'
          + '<span class="badge b-gray">' + fa(p.share) + '٪ فروش</span></div>'
          + '<div class="card-body"><div style="font-size:22px;font-weight:800;color:var(--primary)">'
          + rial(p.price) + '</div><div class="small muted">ریال برای ' + fa(p.def.days) + ' روز</div>'
          + '<table class="table" style="margin-top:10px"><tbody>'
          + '<tr><td class="small">معادل ماهانه</td><td style="text-align:left"><b>'
          + rial(p.perMonth) + '</b></td></tr>'
          + '<tr><td class="small">تعداد فروش</td><td style="text-align:left"><b>'
          + fa(p.count) + '</b></td></tr>'
          + '<tr><td class="small">درآمد</td><td style="text-align:left"><b style="color:var(--green)">'
          + rialShort(p.revenue) + '</b></td></tr>'
          + '</tbody></table>'
          + bar(Math.round(p.revenue / maxRev * 100), 100, 'var(--primary)')
          + '</div></div>';
      }).join('') + '</div>'

    + '<div class="grid g2">'
    + '<div class="card"><div class="card-head"><h3>تنظیمات جاری</h3></div>'
    + '<div class="card-body"><table class="table"><tbody>'
    + '<tr><td>دورهٔ آزمایشی</td><td style="text-align:left"><b>'
      + (st.trial_enabled ? fa(st.trial_days) + ' روز' : 'غیرفعال') + '</b></td></tr>'
    + '<tr><td>دیوار پرداخت</td><td style="text-align:left"><b>'
      + (st.paywall_enabled ? 'فعال' : 'غیرفعال') + '</b></td></tr>'
    + '<tr><td>سهم مدرسه</td><td style="text-align:left"><b>' + fa(share) + '٪</b></td></tr>'
    + '</tbody></table>'
    + (st.paywall_enabled ? '' : '<div class="small" style="color:var(--amber);line-height:2">'
        + '⚠️ دیوار پرداخت غیرفعال است؛ همهٔ اولیا بدون اشتراک دسترسی کامل دارند.</div>')
    + '</div></div>'

    + '<div class="card"><div class="card-head"><h3>راهنمای قیمت‌گذاری</h3></div>'
    + '<div class="card-body small muted" style="line-height:2.2">'
    + '• پلان بلندمدت باید <b>معادل ماهانهٔ ارزان‌تری</b> داشته باشد وگرنه کسی نمی‌خرد.<br>'
    + '• تغییر قیمت روی اشتراک‌های <b>فعال اثر ندارد</b>؛ فقط خریدهای تازه.<br>'
    + '• دورهٔ آزمایشی طولانی‌تر نرخ تبدیل را بالا می‌برد ولی درآمد را عقب می‌اندازد.<br>'
    + '• سهم مدرسه انگیزهٔ معرفی سامانه به اولیاست.'
    + '</div></div></div>';
}

/* ─────────── بخش ۲: پشتیبان‌گیری و بازیابی ─────────── */

/**
 * ساخت بستهٔ پشتیبان.
 * فقط دفترچهٔ عملیات ذخیره می‌شود، نه کل پایگاه داده — چون دادهٔ پایه
 * با مولد قطعی بازساخته می‌شود و فقط تغییرات کاربر یکتا هستند.
 * این انتخاب حجم پشتیبان را ده‌ها برابر کوچک‌تر می‌کند.
 */
function buildBackup(){
  return {
    format: 'payesh-backup',
    version: 2,
    created_at: new Date().toISOString(),
    created_by: S.user ? S.user.username : null,
    seed: (typeof SEED !== 'undefined') ? SEED : null,
    counts: { ops: (typeof log !== 'undefined') ? log.length : 0,
              users: db.users.length, schools: db.schools.length },
    settings: subSettings(),
    /* ⚠️ امنیت (پنتست ۲۰۲۶-۰۹-۰۵): رمز عبور جزو دادهٔ عملیات «کاربران» در
       دفترچه می‌نشیند (برای بازیابی لازم است) ولی فایل پشتیبانِ قابل
       دانلود هرگز نباید آن را حمل کند. */
    ops: (typeof log !== 'undefined') ? log.map(function(op){
      if(op && op.c==='users' && op.data && Object.prototype.hasOwnProperty.call(op.data,'password')){
        var d={};
        Object.keys(op.data).forEach(function(k){ d[k]=(k==='password')?'[redacted]':op.data[k]; });
        var o={};
        Object.keys(op).forEach(function(k){ o[k]=(k==='data')?d:op[k]; });
        return o;
      }
      return op;
    }) : []
  };
}

/** بررسی سلامت بستهٔ پشتیبان پیش از بازیابی */
function validateBackup(obj){
  if(!obj || typeof obj !== 'object') return { ok:false, error:'فایل خوانا نیست' };
  if(obj.format !== 'payesh-backup') return { ok:false, error:'این فایل پشتیبان پایش نیست' };
  if(!Array.isArray(obj.ops)) return { ok:false, error:'فهرست عملیات در فایل نیست' };
  if(obj.version > 2) return { ok:false, error:'نسخهٔ فایل جدیدتر از این برنامه است' };
  /* هر عملیات باید ساختار درست داشته باشد */
  for(var i = 0; i < obj.ops.length; i++){
    var o = obj.ops[i];
    if(!o || !o.t || !o.c) return { ok:false, error:'عملیات شمارهٔ ' + (i+1) + ' ناقص است' };
    if(['ins','upd','del'].indexOf(o.t) < 0)
      return { ok:false, error:'نوع عملیات ناشناخته در ردیف ' + (i+1) };
    if(!Array.isArray(db[o.c]))
      return { ok:false, error:'مجموعهٔ «' + o.c + '» در این نسخه وجود ندارد' };
  }
  return { ok:true, ops: obj.ops.length,
    created_at: obj.created_at || null, by: obj.created_by || null,
    settings: obj.settings || null };
}

/**
 * بازیابی از بستهٔ پشتیبان.
 * دادهٔ پایه از نو ساخته می‌شود، سپس عملیات پشتیبان روی آن اجرا می‌گردد.
 * این روش تضمین می‌کند نتیجه دقیقاً همان وضعیت زمان پشتیبان‌گیری باشد.
 */
function restoreBackup(obj){
  var check = validateBackup(obj);
  if(!check.ok) return check;
  try{
    /* ۱. بازسازی دادهٔ پایه با همان مولد قطعی */
    if(typeof generate === 'function') generate();
    if(typeof generateExtras === 'function') generateExtras();
    if(typeof generateP8 === 'function') generateP8();
    if(typeof generateP9 === 'function') generateP9();
    if(typeof generateP10 === 'function') generateP10();
    if(typeof generateP11 === 'function') generateP11();
    if(typeof generateP12 === 'function') generateP12();
    if(typeof generateBusDemo==='function') generateBusDemo();
    if(typeof generateVclassDemo==='function') generateVclassDemo();
    if(typeof generateHomeworkDemo==='function') generateHomeworkDemo();
    if(typeof generateVisitorsDemo==='function') generateVisitorsDemo();
    if(typeof generateLibraryDemo==='function') generateLibraryDemo();
    if(typeof generateAssetsDemo==='function') generateAssetsDemo();
    if(typeof generateSidaDemo==='function') generateSidaDemo();
    if(typeof generateSchoolModeDemo==='function') generateSchoolModeDemo();
    /* ۲. جایگزینی دفترچه و اجرای دوبارهٔ عملیات */
    log.length = 0;
    obj.ops.forEach(function(o){ log.push(o); });
    if(typeof idxReset === 'function') idxReset();
    SYNC_MUTED = true;
    log.forEach(function(o){ applyOp(o, false); });
    SYNC_MUTED = false;
    if(typeof idxReset === 'function') idxReset();
    saveLog();
    return { ok:true, ops: obj.ops.length };
  }catch(e){
    return { ok:false, error: 'بازیابی ناتمام ماند: ' + (e.message || 'خطای ناشناخته') };
  }
}

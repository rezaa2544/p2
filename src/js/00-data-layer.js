/* ═══════════════════════════════════════════════════════════════════
   لایهٔ داده — تنها دروازهٔ برنامه به دنیای بیرون
   ═══════════════════════════════════════════════════════════════════

   ⚠️ قاعدهٔ طلایی این فایل:
   هیچ جای دیگری از برنامه نباید مستقیم `localStorage` یا `fetch` را
   صدا بزند. هر دسترسی به داده از همین‌جا رد می‌شود.

   چرا؟ چون امروز داده در حافظهٔ مرورگر است و فردا روی سرور خواهد بود.
   اگر صدها نقطه در برنامه مستقیم با حافظهٔ مرورگر حرف بزنند، روز
   اتصال به سرور یعنی بازنویسی کل برنامه. با این لایه، آن روز فقط
   بدنهٔ چند تابع در همین فایل عوض می‌شود و نما و منطق دست‌نخورده
   می‌مانند.

   ── نقشهٔ فایل ──────────────────────────────────────────────
   ۱. DATA_MODE ....... محلی یا سروری
   ۲. Store ........... انبار کلید-مقدار (امروز: حافظهٔ مرورگر)
   ۳. Api ............. گفتگو با سرور (امروز: خاموش)
   ۴. Data ............ چهار عمل داده: خواندن، افزودن، ویرایش، حذف
   ─────────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────────
   ۱. حالت داده
   ───────────────────────────────────────────────────────────── */

/** 'local' = همه‌چیز در مرورگر (دمو) · 'server' = پشت سر واقعی */
var DATA_MODE = 'local';

/** ریشهٔ نشانی سرور. در حالت محلی استفاده نمی‌شود. */
var API_BASE = '';

/** آیا به سرور واقعی وصلیم؟ */
function isServerMode(){ return DATA_MODE === 'server'; }


/* ─────────────────────────────────────────────────────────────
   ۲. Store — انبار کلید-مقدار

   امروز پشتش حافظهٔ مرورگر است. فردا می‌تواند حافظهٔ مرورگر برای
   حالت آفلاین باشد و همگام‌سازی با سرور روی آن سوار شود.

   هر متد در برابر خطا مقاوم است: مرورگر در حالت ناشناس یا با
   حافظهٔ پر، استثنا پرتاب می‌کند و برنامه نباید از پا بیفتد.
   ───────────────────────────────────────────────────────────── */

var Store = {

  /** خواندن رشتهٔ خام. اگر نبود یا خطا داد، `fallback` برمی‌گردد. */
  get: function(key, fallback){
    try{
      var v = localStorage.getItem(key);
      return v === null ? (fallback === undefined ? null : fallback) : v;
    }catch(e){ return fallback === undefined ? null : fallback; }
  },

  /** نوشتن رشتهٔ خام. خروجی: آیا موفق بود؟ */
  set: function(key, value){
    try{ localStorage.setItem(key, value); return true; }
    catch(e){ return false; }
  },

  /** پاک کردن یک کلید. */
  remove: function(key){
    try{ localStorage.removeItem(key); return true; }
    catch(e){ return false; }
  },

  /** خواندن مقدار JSON. اگر خراب بود `fallback` برمی‌گردد، نه استثنا. */
  getJSON: function(key, fallback){
    try{
      var raw = localStorage.getItem(key);
      if(raw === null) return fallback;
      return JSON.parse(raw);
    }catch(e){ return fallback; }
  },

  /** نوشتن مقدار JSON. خروجی: آیا موفق بود؟ */
  setJSON: function(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){ return false; }
  },

  /** اندازهٔ یک کلید بر حسب کاراکتر — برای سنجش فشار حافظه. */
  bytes: function(key){
    try{ return (localStorage.getItem(key) || '').length; }
    catch(e){ return 0; }
  },

  /** آیا انبار اصلاً در دسترس است؟ (حالت ناشناس بعضی مرورگرها) */
  available: function(){
    try{
      var k = '__probe__' + Date.now();
      localStorage.setItem(k, '1');
      var ok = localStorage.getItem(k) === '1';
      localStorage.removeItem(k);
      return ok;
    }catch(e){ return false; }
  }
};


/* ─────────────────────────────────────────────────────────────
   ۳. Api — گفتگو با سرور

   امروز در حالت محلی هر فراخوانی استثنا می‌دهد؛ این عمدی است تا
   اگر کسی زودتر از موعد به سرور تکیه کند، بی‌صدا رد نشود.

   روز اتصال، فقط بدنهٔ `request` باز می‌شود و بقیهٔ برنامه
   نمی‌فهمد چیزی عوض شده.
   ───────────────────────────────────────────────────────────── */

var Api = {

  /**
   * درخواست به سرور.
   * @param {string} path مسیر نسبی مثل '/students'
   * @param {object} opts { method, body, headers }
   * @returns {Promise<any>}
   */
  request: function(path, opts){
    /* در حالت محلی فقط نشانی مطلق (که همگام‌سازی صریح تنظیمش کرده)
       اجازهٔ عبور دارد؛ بقیه رد می‌شوند تا اگر کسی زودتر از موعد به
       سرور تکیه کند، بی‌صدا نماند. */
    var absolute = /^https?:\/\//.test(path);
    if(!isServerMode() && !absolute)
      return Promise.reject(new Error('حالت محلی است؛ سرور در دسترس نیست: ' + path));

    opts = opts || {};
    var init = {
      method: opts.method || 'GET',
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        Api.authHeader(),
        opts.headers || {}
      ),
      /* کوکی نشست سرور همراه درخواست برود */
      credentials: 'include'
    };
    if(opts.body !== undefined) init.body = JSON.stringify(opts.body);

    return fetch((absolute ? '' : API_BASE) + path, init).then(function(res){
      if(!res.ok) throw new Error('خطای سرور ' + res.status + ' در ' + path);
      return res.status === 204 ? null : res.json();
    });
  },

  /** سرآیند احراز هویت. امروز خالی؛ فردا ژتون نشست. */
  authHeader: function(){ return {}; },

  get:  function(p){        return Api.request(p, { method:'GET' }); },
  post: function(p, body){  return Api.request(p, { method:'POST',  body:body }); },
  put:  function(p, body){  return Api.request(p, { method:'PUT',   body:body }); },
  del:  function(p){        return Api.request(p, { method:'DELETE' }); }
};


/* ─────────────────────────────────────────────────────────────
   ۴. Data — چهار عمل داده

   نما و منطق برنامه باید این چهار تا را صدا بزنند، نه دستکاری
   مستقیم آرایه‌های `db` را.

   ⚠️ نکتهٔ مهم دربارهٔ همگامی و ناهمگامی:
   امروز این توابع نتیجه را فوری برمی‌گردانند چون داده در حافظه
   است. در حالت سروری، نوشتن‌ها همچنان فوری‌اند — چون به صف
   همگام‌سازی (27-sync.js) می‌روند و در پس‌زمینه ارسال می‌شوند.
   این همان طراحی «اول آفلاین» است و دلیلش این است که دبیری که
   وسط حضور و غیاب اینترنتش قطع می‌شود نباید منتظر سرور بماند.
   پس امضای این توابع با اتصال به سرور هم عوض نمی‌شود.
   ───────────────────────────────────────────────────────────── */

var Data = {

  /** همهٔ رکوردهای یک مجموعه. */
  all: function(collection){
    return db[collection] || [];
  },

  /** یک رکورد با شناسه. از ایندکس استفاده می‌کند تا خطی نگردد. */
  find: function(collection, id){
    if(typeof idxById === 'function'){
      var m = idxById(collection);
      if(m) return m.get(Number(id)) || null;
    }
    return (db[collection] || []).find(function(x){ return x.id === Number(id); }) || null;
  },

  /** رکوردهایی که شرط را دارند. */
  where: function(collection, predicate){
    return (db[collection] || []).filter(predicate);
  },

  /**
   * افزودن رکورد. شناسه خودکار ساخته می‌شود.
   * @returns رکورد ساخته‌شده (همراه شناسه)
   */
  create: function(collection, obj){
    return insert(collection, obj);
  },

  /** ویرایش رکورد — فقط کلیدهای داده‌شده جایگزین می‌شوند. */
  update: function(collection, id, patch){
    return update(collection, id, patch);
  },

  /** حذف رکورد. */
  delete: function(collection, id){
    return remove(collection, id);
  },

  /**
   * چند نوشتن با یک بار ذخیره‌سازی.
   * در عملیات انبوه (ورود اکسل، ارتقای پایه) حتماً استفاده شود،
   * وگرنه هزینه درجه‌دوم می‌شود.
   */
  batch: function(fn){
    return batchWrites(fn);
  }
};

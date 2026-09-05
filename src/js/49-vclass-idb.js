/* ═══════════════════════════════════════════════════════════════════
   IndexedDB — ماژول فایل (کلاس مجازی + تکالیف؛ یک‌بار ساخت، دوبار استفاده)

   چرا IndexedDB؟ سقف ذخیرهٔ محلی (db فعلی) ~۵ مگابایت است و دمو از آن ~۴٫۷
   مگابایت اشغال کرده؛ فایل/ویدیو فقط در IDB جا می‌شود. (هر دو در مرورگر، نه سرور.) الگو:
     • فایل (Blob)     → IndexedDB (دیتابیس `payesh`)
     • متادیتا + متون  → db فعلی (ذخیرهٔ محلی)

   سطح API به ۵ عضو محدود است (open/transaction/put/get/delete)؛
   wrapper روی Promise است تا مستقل از بستر باشد.

   🧪 تست (smoke/jsdom): jsdom IndexedDB ندارد؛ `vclassIdbSetBackend`
   یک fake کوچک می‌پذیرد (سطح همان ۵ عضو) — wrapper بدون تغییر روی
   fake کار می‌کند. در مرورگر واقعی، IndexedDB خودِ مرورگر.
   ═══════════════════════════════════════════════════════════════════ */

/* backend: پیش‌فرض = IndexedDB واقعیِ مرورگر؛ تست fake جایگزین می‌کند */
var _IDB_BACKEND = null;
function vclassIdbBackend(){
  if(_IDB_BACKEND) return _IDB_BACKEND;
  if(typeof indexedDB !== 'undefined' && indexedDB) return indexedDB;
  return null; /* بدون backend — همهٔ فراخوانی‌ها promise خالی می‌دهند */
}
/** تزریق backend (تست) یا برگرداندن به واقعی (null) — کش دیتابیس هم تازه می‌شود */
function vclassIdbSetBackend(b){ _IDB_BACKEND = b || null; _IDB_DB = null; }

/** باز کردن دیتابیس و مطمئن شدن از وجود استورها
 *
 * ⚠️ رویهٔ مهم (باگ واقعیِ ۱۴۰۵/۰۶/۱۴): onupgradeneeded فقط هنگامِ
 * «نسخهٔ بالاتر» اجرا می‌شود. دیتابیسِ قدیمی (مثلاً نسخه‌ای که فقط
 * store اول را ساخته) اگر دوباره با همان نسخه باز شود، استورِ دوم
 * هرگز ساخته نمی‌شود و transaction خطای «store not found» می‌دهد.
 * راه‌حل: نسخهٔ فعلی را پیدا کن؛ اگر استوری لازم نباشد، با نسخهٔ
 * یکی بالاتر دوباره باز کن تا upgradeneeded استورها را بسازد. */
var _IDB_DB = null;
var _IDB_NAME = 'payesh';
function vclassIdbOpen(storeNames){
  var idb = vclassIdbBackend();
  var names = storeNames || [];
  return new Promise(function(resolve, reject){
    if(!idb) return resolve(null);
    var openAt = function(ver, allowBump){
      var req;
      try{ req = idb.open(_IDB_NAME, ver); }
      catch(e){ return reject(e); }
      req.onupgradeneeded = function(e){
        var d = e.target.result;
        names.forEach(function(n){
          if(!d.objectStoreNames.contains(n)) d.createObjectStore(n);
        });
      };
      req.onsuccess = function(e){
        var d = e.target.result;
        var missing = names.filter(function(n){ return !d.objectStoreNames.contains(n); });
        if(missing.length && allowBump && ver < 10){
          /* استورِ لازم در این نسخه ساخته نشده — نسخه را یکی بالا ببر
             تا onupgradeneeded استورها را بسازد */
          try{ d.close(); }catch(e){}
          _IDB_DB = null;
          return openAt(ver + 1, allowBump);
        }
        _IDB_DB = d;
        resolve(_IDB_DB);
      };
      req.onerror = function(){
        if(allowBump && ver < 10){
          /* دیتابیس روی نسخهٔ بالاتری است (خطای نسخه) — نسخهٔ بالاتر امتحان می‌شود */
          return openAt(ver + 1, allowBump);
        }
        reject((req && req.error) || new Error('idb-open'));
      };
    };
    var start = function(ver){ openAt(ver, true); };
    if(typeof idb.databases === 'function'){
      Promise.resolve(idb.databases()).then(function(list){
        var hit = (list || []).filter(function(d){ return d.name === _IDB_NAME; })[0];
        start(hit ? Math.max(1, Number(hit.version) || 1) : 1);
      }).catch(function(){ start(1); });
    } else {
      start(1);
    }
  });
}

/** ذخیرهٔ فایل/بلاگ */
function vclassIdbPut(store, key, value){
  return vclassIdbOpen([store]).then(function(db){
    if(!db) return Promise.resolve(false);
    return new Promise(function(resolve){
      db.transaction(store, 'readwrite').objectStore(store)
        .put(value, key).onsuccess = function(){ resolve(true); };
    });
  });
}

/** خواندن فایل/بلاگ */
function vclassIdbGet(store, key){
  return vclassIdbOpen([store]).then(function(db){
    if(!db) return Promise.resolve(null);
    return new Promise(function(resolve){
      var req = db.transaction(store).objectStore(store).get(key);
      req.onsuccess = function(){ resolve(req.result || null); };
    });
  });
}

/** حذف فایل */
function vclassIdbDel(store, key){
  return vclassIdbOpen([store]).then(function(db){
    if(!db) return Promise.resolve(false);
    return new Promise(function(resolve){
      db.transaction(store, 'readwrite').objectStore(store)
        .delete(key).onsuccess = function(){ resolve(true); };
    });
  });
}

/* ─────────────── کمک‌های ظرفیت و فرمت ─────────────── */

var VCLASS_FILE_CAP = 200 * 1024 * 1024; /* سقف نرم ۲۰۰ مگابایت */

/** برچسب خوانا برای بایت */
function idbSizeLabel(bytes){
  if(bytes == null || isNaN(bytes)) return '—';
  var mb = bytes / 1048576;
  if(mb >= 1) return fa(Math.round(mb * 10) / 10) + ' مگابایت';
  var kb = bytes / 1024;
  if(kb >= 1) return fa(Math.round(kb)) + ' کیلوبایت';
  return fa(bytes) + ' بایت';
}

/**
 * تخمین فضای باقی‌ماندهٔ IDB (navigator.storage.estimate).
 * promise است؛ در نبود API، حدس محافظه‌کارانهٔ ۴۰ مگابایت برمی‌گرداند.
 */
function vclassIdbSpace(){
  return new Promise(function(resolve){
    try{
      if(typeof navigator !== 'undefined' && navigator.storage &&
         typeof navigator.storage.estimate === 'function'){
        navigator.storage.estimate().then(function(est){
          var usage = est.usage || 0, quota = est.quota || 0;
          resolve({usage:usage, quota:quota,
            left: quota > usage ? quota - usage : 0,
            known: quota > 0});
        }).catch(function(){
          resolve({usage:0, quota:400*1048576, left:400*1048576, known:false});
        });
        return;
      }
    }catch(e){}
    resolve({usage:0, quota:400*1048576, left:400*1048576, known:false});
  });
}

/* ─────────────── fake کوچک برای تست (سطح ۵ عضو) ─────────────── */

/**
 * fake حداقلی IndexedDB — فقط برای تست (jsdom).
 *
 * ⚠️ باید **هم‌رفتارِ واقعی** باشد، نه راحت‌تر:
 *  • onupgradeneeded فقط وقتی اجرا می‌شود که نسخه بالاتر خواسته شود
 *  • transaction روی استورِ ناموجود **throw** می‌کند (مثل مرورگر واقعی)
 *  • باز کردن با نسخهٔ پایین‌تر از موجود → خطای نسخه
 * fake قدیمی استورها را خودکار می‌ساخت و این باگ‌ها را پنهان می‌کرد.
 *
 * ساخت: vclassIdbSetBackend(makeIdbFake());  — بازنشانی: null
 */
function makeIdbFake(){
  var stores = new Map();
  var version = 0;
  function mkDb(){
    return {
      close: function(){},
      objectStoreNames: { contains: function(n){ return stores.has(n); } },
      createObjectStore: function(n){ stores.set(n, new Map()); },
      transaction: function(storeName){
        if(!stores.has(storeName)){
          var e = new Error("Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found.");
          e.name = 'InvalidStateError';
          throw e;
        }
        var m = stores.get(storeName);
        return {
          objectStore: function(n){
            return {
              put: function(value, key){
                var req = {};
                m.set(String(key), value);
                setTimeout(function(){ if(req.onsuccess) req.onsuccess(); }, 0);
                return req;
              },
              get: function(key){
                var req = { result: m.has(String(key)) ? m.get(String(key)) : undefined };
                setTimeout(function(){ if(req.onsuccess) req.onsuccess(); }, 0);
                return req;
              },
              delete: function(key){
                var req = {};
                m.delete(String(key));
                setTimeout(function(){ if(req.onsuccess) req.onsuccess(); }, 0);
                return req;
              }
            };
          }
        };
      }
    };
  }
  var db = mkDb();
  return {
    databases: function(){ return Promise.resolve([{ name:'payesh', version: version }]); },
    open: function(name, ver){
      var req = {};
      setTimeout(function(){
        if(ver < version){
          var e = new Error('VersionError: cannot open ' + _IDB_NAME + ' at ' + ver + ' (current ' + version + ')');
          e.name = 'VersionError';
          req.error = e;
          if(req.onerror) req.onerror({ target: req });
          return;
        }
        if(ver > version){
          version = ver;
          if(req.onupgradeneeded){
            try{ req.onupgradeneeded({ target:{ result: db } }); }catch(err){}
          }
        }
        req.result = db;
        if(req.onsuccess) req.onsuccess({ target:{ result: db } });
      }, 0);
      return req;
    },
    __stores: stores
  };
}


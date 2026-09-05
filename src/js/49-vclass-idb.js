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

/** باز کردن دیتابیس و مطمئن شدن از وجود استورها */
var _IDB_DB = null;
function vclassIdbOpen(storeNames){
  var idb = vclassIdbBackend();
  return new Promise(function(resolve, reject){
    if(!idb) return resolve(null);
    var req = idb.open('payesh', 1);
    req.onupgradeneeded = function(e){
      var d = e.target.result;
      (storeNames || []).forEach(function(n){
        if(!d.objectStoreNames.contains(n)) d.createObjectStore(n);
      });
    };
    req.onsuccess = function(e){
      _IDB_DB = e.target.result;
      resolve(_IDB_DB);
    };
    req.onerror = function(){ reject(req.error || new Error('idb-open')); };
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
 * fake حداقلی IndexedDB — فقط برای smoke (jsdom).
 * ساخت: vclassIdbSetBackend(makeIdbFake());  — بازنشانی: null
 */
function makeIdbFake(){
  var stores = new Map();
  function mkDb(){
    return {
      transaction: function(storeName){
        return {
          objectStore: function(n){
            if(!stores.has(n)) stores.set(n, new Map());
            var m = stores.get(n);
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
      },
      objectStoreNames: {
        contains: function(n){ return stores.has(n); }
      }
    };
  }
  var db = mkDb();
  return {
    open: function(name, version){
      var req = { result: db };
      setTimeout(function(){
        var ev = { target:{ result: db } };
        if(req.onupgradeneeded){
          try{ req.onupgradeneeded(ev); }catch(e){}
        }
        if(req.onsuccess){
          try{ req.onsuccess(ev); }catch(e){}
        }
      }, 0);
      return req;
    },
    __stores: stores
  };
}

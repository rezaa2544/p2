/* ═══════════════════════════════════════════════════════════════════
   src/js/03-idb-persistence.js — معماری ذخیره‌سازی آفلاین IndexedDB
   فاز ۴: بندهای ۱۶ تا ۲۰ (Client Offline IndexedDB Architecture)
   ═══════════════════════════════════════════════════════════════════ */

var OFFLINE_DB_NAME = 'payesh_offline_v2';
var OFFLINE_DB_VERSION = 2;

/**
 * کلاس مدیریت ذخیره‌سازی آفلاین با استفاده از IndexedDB
 * دارای سه Object Store مجزا:
 *  ۱. entities: نگهداری موجودیت‌ها به همراه ایندکس کالکشن و شناسه مدرسه
 *  ۲. sync_queue: صف عملیات معلق جهت همگام‌سازی با سرور با ایندکس وضعیت و زمان
 *  ۳. metadata: ذخیره کلید/مقدارهای تنظیمات، لاگ، و وضعیت همگام‌سازی
 *
 * @constructor
 * @param {string} [dbName] نام دیتابیس (پیش‌فرض: payesh_offline_v2)
 * @param {number} [dbVersion] نسخه دیتابیس (پیش‌فرض: 2)
 */
function OfflineStorage(dbName, dbVersion) {
  this.name = dbName || OFFLINE_DB_NAME;
  this.dbName = this.name;
  this.version = dbVersion || OFFLINE_DB_VERSION;
  this.db = null;
  this.backend = null;
}

/**
 * تعیین یا تغییر بک‌اند IndexedDB (برای تست‌ها یا محیط‌های بدون window.indexedDB)
 * @param {IDBFactory|object|null} customIdb
 */
OfflineStorage.prototype.setBackend = function(customIdb) {
  this.backend = customIdb;
  this.db = null;
};

/**
 * دریافت موتور IndexedDB فعال
 * @returns {IDBFactory|object|null}
 */
OfflineStorage.prototype.getIdb = function() {
  if (this.backend !== null) return this.backend;
  if (typeof window !== 'undefined') {
    return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB || null;
  }
  if (typeof indexedDB !== 'undefined') return indexedDB;
  return null;
};

/**
 * آیا محیط جاری از IndexedDB پشتیبانی می‌کند؟
 * @returns {boolean}
 */
OfflineStorage.prototype.isSupported = function() {
  return this.getIdb() !== null && typeof this.getIdb().open === 'function';
};

/**
 * راه‌اندازی و باز کردن پایگاه داده IndexedDB و ساخت جداول و ایندکس‌ها
 * @returns {Promise<IDBDatabase|null>}
 */
OfflineStorage.prototype.init = function() {
  var self = this;
  if (!self.isSupported()) {
    return Promise.resolve(null);
  }
  if (self.db) {
    return Promise.resolve(self.db);
  }

  return new Promise(function(resolve, reject) {
    try {
      var idb = self.getIdb();
      var req = idb.open(self.name, self.version);

      req.onupgradeneeded = function(e) {
        var db = e.target.result;

        // ۱. استور موجودیت‌ها (entities)
        if (!db.objectStoreNames.contains('entities')) {
          var entStore = db.createObjectStore('entities', { keyPath: ['c', 'id'] });
          entStore.createIndex('by_coll', 'c', { unique: false });
          entStore.createIndex('by_school', 'school_id', { unique: false });
        }

        // ۲. استور صف همگام‌سازی (sync_queue)
        if (!db.objectStoreNames.contains('sync_queue')) {
          var queueStore = db.createObjectStore('sync_queue', { keyPath: 'uid' });
          queueStore.createIndex('by_status', 'status', { unique: false });
          queueStore.createIndex('by_time', 'created_at', { unique: false });
        }

        // ۳. استور متادیتا و تنظیمات (metadata)
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };

      req.onsuccess = function(e) {
        self.db = e.target.result;
        resolve(self.db);
      };

      req.onerror = function(e) {
        reject(e.target.error || new Error('خطا در باز کردن IndexedDB'));
      };
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * ذخیره یا به‌روزرسانی یک رکورد در استور entities
 * @param {string} collection نام کالکشن (مثلاً 'students')
 * @param {object} record رکورد حاوی فیلد id
 * @returns {Promise<boolean>}
 */
OfflineStorage.prototype.putEntity = function(collection, record) {
  var self = this;
  if (!record || record.id == null) return Promise.reject(new Error('شناسه رکورد نامعتبر است'));

  return self.init().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['entities'], 'readwrite');
        var store = tx.objectStore('entities');
        var item = {
          c: collection,
          id: record.id,
          school_id: record.school_id != null ? record.school_id : (record.schoolId != null ? record.schoolId : 0),
          data: record,
          updated_at: new Date().toISOString()
        };
        var req = store.put(item);
        req.onsuccess = function() { resolve(true); };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * دریافت یک موجودیت مشخص بر اساس شناسه
 * @param {string} collection نام کالکشن
 * @param {number|string} id شناسه موجودیت
 * @returns {Promise<object|null>}
 */
OfflineStorage.prototype.getEntity = function(collection, id) {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return null;
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['entities'], 'readonly');
        var store = tx.objectStore('entities');
        var req = store.get([collection, id]);
        req.onsuccess = function(e) {
          var res = e.target.result;
          resolve(res ? (res.data || res) : null);
        };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * خواندن تمام رکوردهای متعلق به یک کالکشن
 * @param {string} collection نام کالکشن
 * @returns {Promise<Array<object>>}
 */
OfflineStorage.prototype.getCollection = function(collection) {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return [];
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['entities'], 'readonly');
        var store = tx.objectStore('entities');
        var req;
        if (store.index && store.indexNames && store.indexNames.contains('by_coll')) {
          var idx = store.index('by_coll');
          req = (typeof idx.getAll === 'function') ? idx.getAll(collection) : store.getAll();
        } else {
          req = store.getAll();
        }

        req.onsuccess = function(e) {
          var list = e.target.result || [];
          var res = [];
          for (var i = 0; i < list.length; i++) {
            if (list[i].c === collection) {
              res.push(list[i].data || list[i]);
            }
          }
          resolve(res);
        };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * واکشی رکوردهای یک مدرسه بر اساس ایندکس by_school
 * @param {number|string} schoolId
 * @returns {Promise<Array<object>>}
 */
OfflineStorage.prototype.getEntitiesBySchool = function(schoolId) {
  var self = this;
  var sid = Number(schoolId);
  return self.init().then(function(db) {
    if (!db) return [];
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['entities'], 'readonly');
        var store = tx.objectStore('entities');
        var req;
        if (store.index && store.indexNames && store.indexNames.contains('by_school')) {
          var idx = store.index('by_school');
          req = (typeof idx.getAll === 'function') ? idx.getAll(sid) : store.getAll();
        } else {
          req = store.getAll();
        }

        req.onsuccess = function(e) {
          var list = e.target.result || [];
          var res = [];
          for (var i = 0; i < list.length; i++) {
            if (Number(list[i].school_id) === sid) {
              res.push(list[i].data || list[i]);
            }
          }
          resolve(res);
        };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * حذف یک موجودیت مشخص از IndexedDB
 * @param {string} collection نام کالکشن
 * @param {number|string} id شناسه موجودیت
 * @returns {Promise<boolean>}
 */
OfflineStorage.prototype.removeEntity = function(collection, id) {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['entities'], 'readwrite');
        var store = tx.objectStore('entities');
        var req = store.delete([collection, id]);
        req.onsuccess = function() { resolve(true); };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * تولید شناسه یکتا برای صف همگام‌سازی با استفاده از CSPRNG مرورگر
 * @returns {string}
 */
function generateQueueUid() {
  var g = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : null);
  var c = g && g.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    var bytes = new Uint8Array(8);
    c.getRandomValues(bytes);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += ('0' + bytes[i].toString(16)).slice(-2);
    }
    return 'q_' + Date.now() + '_' + hex;
  }
  // fallback برای محیط‌های فاقد crypto (غیرامن، صرفاً برای سازگاری)
  return 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

/**
 * افزودن عملیات تغییر به صف همگام‌سازی آفلاین
 * @param {object} op شیء عملیات
 * @returns {Promise<string>} شناسه یکتای عملیات (uid)
 */
OfflineStorage.prototype.addToQueue = function(op) {
  var self = this;
  var uid = op.uid || generateQueueUid();
  var actualOp = (op.op && typeof op.op === 'object') ? op.op : op;
  var item = {
    uid: uid,
    op: actualOp,
    status: op.status || 'pending',
    attempts: op.attempts != null ? op.attempts : 0,
    created_at: op.created_at || new Date().toISOString(),
    next_retry: op.next_retry || 0
  };

  return self.init().then(function(db) {
    if (!db) return uid;
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['sync_queue'], 'readwrite');
        var store = tx.objectStore('sync_queue');
        var req = store.put(item);
        req.onsuccess = function() { resolve(uid); };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * خواندن تمام آیتم‌های صف همگام‌سازی
 * @returns {Promise<Array<object>>}
 */
OfflineStorage.prototype.getQueue = function() {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return [];
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['sync_queue'], 'readonly');
        var store = tx.objectStore('sync_queue');
        var req = store.getAll();
        req.onsuccess = function(e) { resolve(e.target.result || []); };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * دریافت کلیه آیتم‌های معلق صف همگام‌سازی (pending یا failed)
 * @returns {Promise<Array<object>>}
 */
OfflineStorage.prototype.getPendingQueue = function() {
  var self = this;
  return self.getQueue().then(function(all) {
    return all.filter(function(item) {
      return item.status === 'pending' || item.status === 'failed';
    });
  });
};

/**
 * فیلتر صف بر اساس وضعیت عملیات (pending / processing / failed)
 * @param {string} status وضعیت مورد نظر
 * @returns {Promise<Array<object>>}
 */
OfflineStorage.prototype.getQueueByStatus = function(status) {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return [];
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['sync_queue'], 'readonly');
        var store = tx.objectStore('sync_queue');
        var req;
        if (store.index && store.indexNames && store.indexNames.contains('by_status')) {
          var idx = store.index('by_status');
          req = (typeof idx.getAll === 'function') ? idx.getAll(status) : store.getAll();
        } else {
          req = store.getAll();
        }

        req.onsuccess = function(e) {
          var list = e.target.result || [];
          var res = [];
          for (var i = 0; i < list.length; i++) {
            if (list[i].status === status) {
              res.push(list[i]);
            }
          }
          resolve(res);
        };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * حذف یک عملیات از صف همگام‌سازی پس از پردازش یا انصراف
 * @param {string} uid شناسه عملیات
 * @returns {Promise<boolean>}
 */
OfflineStorage.prototype.removeFromQueue = function(uid) {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['sync_queue'], 'readwrite');
        var store = tx.objectStore('sync_queue');
        var req = store.delete(uid);
        req.onsuccess = function() { resolve(true); };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * به‌روزرسانی وضعیت یک عملیات در صف همگام‌سازی
 * @param {string} uid شناسه یکتای عملیات
 * @param {string} status وضعیت جدید ('pending' | 'processing' | 'failed' | 'synced')
 * @param {string} [reason] دلیل خطا در صورت بروز مشکل
 * @returns {Promise<boolean>}
 */
OfflineStorage.prototype.updateQueueStatus = function(uid, status, reason) {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['sync_queue'], 'readwrite');
        var store = tx.objectStore('sync_queue');
        var req = store.get(uid);
        req.onsuccess = function(e) {
          var item = e.target.result;
          if (!item) {
            resolve(false);
            return;
          }
          item.status = status;
          if (status === 'failed') {
            item.attempts = (item.attempts || 0) + 1;
            item.last_error = reason || 'Unknown error';
            item.next_retry = Date.now() + Math.min(60000, Math.pow(2, item.attempts) * 1000);
          } else if (status === 'synced' || status === 'completed') {
            item.synced_at = new Date().toISOString();
          }
          item.updated_at = new Date().toISOString();
          var putReq = store.put(item);
          putReq.onsuccess = function() { resolve(true); };
          putReq.onerror = function(errEvt) { reject(errEvt.target.error); };
        };
        req.onerror = function(errEvt) { reject(errEvt.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * ذخیره متادیتا با کلید مشخص
 * @param {string} key کلید متادیتا
 * @param {*} value مقدار (شیء، رشته، آرایه و ...)
 * @returns {Promise<boolean>}
 */
OfflineStorage.prototype.setMetadata = function(key, value) {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['metadata'], 'readwrite');
        var store = tx.objectStore('metadata');
        var req = store.put({ key: key, value: value, updated_at: new Date().toISOString() });
        req.onsuccess = function() { resolve(true); };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * خواندن مقدار متادیتا بر اساس کلید
 * @param {string} key کلید مورد نظر
 * @returns {Promise<*>} مقدار ذخیره‌شده یا null
 */
OfflineStorage.prototype.getMetadata = function(key) {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return null;
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['metadata'], 'readonly');
        var store = tx.objectStore('metadata');
        var req = store.get(key);
        req.onsuccess = function(e) {
          var item = e.target.result;
          resolve(item ? item.value : null);
        };
        req.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * پاک‌سازی تمام استورها و داده‌های ذخیره‌شده در IndexedDB
 * @returns {Promise<boolean>}
 */
OfflineStorage.prototype.clearAll = function() {
  var self = this;
  return self.init().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(['entities', 'sync_queue', 'metadata'], 'readwrite');
        var c1 = tx.objectStore('entities').clear();
        var c2 = tx.objectStore('sync_queue').clear();
        var c3 = tx.objectStore('metadata').clear();

        var completed = 0;
        function checkDone() {
          completed++;
          if (completed >= 3) resolve(true);
        }
        if (c1) c1.onsuccess = checkDone; else checkDone();
        if (c2) c2.onsuccess = checkDone; else checkDone();
        if (c3) c3.onsuccess = checkDone; else checkDone();

        tx.onerror = function(e) { reject(e.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  });
};

/* ═══════════════════════════════════════════════════════════════════
   شبیه‌ساز حافظه‌ای استاندارد W3C IndexedDB برای محیط‌های تست (Node/jsdom)
   ═══════════════════════════════════════════════════════════════════ */
function makeOfflineIdbFake() {
  var dbs = {};

  return {
    open: function(name, version) {
      var req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null, error: null };
      setTimeout(function() {
        var isNew = !dbs[name];
        if (isNew) {
          dbs[name] = {
            name: name,
            version: 0,
            stores: {},
            objectStoreNames: {
              _list: [],
              contains: function(s) { return this._list.indexOf(s) >= 0; },
              includes: function(s) { return this._list.indexOf(s) >= 0; },
              item: function(i) { return this._list[i]; },
              get length() { return this._list.length; }
            }
          };
        }
        var targetDb = dbs[name];
        var dbHandle = {
          name: targetDb.name,
          version: version || 1,
          objectStoreNames: targetDb.objectStoreNames,
          createObjectStore: function(sname, opts) {
            if (!targetDb.objectStoreNames.contains(sname)) {
              targetDb.objectStoreNames._list.push(sname);
            }
            targetDb.stores[sname] = targetDb.stores[sname] || {
              name: sname,
              keyPath: opts ? opts.keyPath : null,
              data: {},
              indices: {}
            };
            return {
              createIndex: function(iname, keyPath, iopts) {
                targetDb.stores[sname].indices[iname] = { keyPath: keyPath, unique: !!(iopts && iopts.unique) };
              }
            };
          },
          transaction: function(storeNames, mode) {
            var txObj = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: function(sname) {
                var s = targetDb.stores[sname];
                if (!s) throw new Error('ObjectStore not found: ' + sname);
                return {
                  name: sname,
                  indexNames: {
                    contains: function(n) { return !!s.indices[n]; }
                  },
                  index: function(iname) {
                    var idxDef = s.indices[iname];
                    return {
                      getAll: function(query) {
                        var req2 = { onsuccess: null, onerror: null, result: null };
                        setTimeout(function() {
                          var res = [];
                          for (var k in s.data) {
                            var item = s.data[k];
                            var val = idxDef ? item[idxDef.keyPath] : null;
                            if (query === undefined || val === query || String(val) === String(query)) {
                              res.push(JSON.parse(JSON.stringify(item)));
                            }
                          }
                          req2.result = res;
                          if (req2.onsuccess) req2.onsuccess({ target: req2 });
                        }, 0);
                        return req2;
                      }
                    };
                  },
                  put: function(val) {
                    var req2 = { onsuccess: null, onerror: null, result: null };
                    setTimeout(function() {
                      var key;
                      if (Array.isArray(s.keyPath)) {
                        key = s.keyPath.map(function(kp) { return val[kp]; }).join('::');
                      } else if (typeof s.keyPath === 'string') {
                        key = val[s.keyPath];
                      } else {
                        key = JSON.stringify(val);
                      }
                      s.data[key] = JSON.parse(JSON.stringify(val));
                      req2.result = key;
                      if (req2.onsuccess) req2.onsuccess({ target: req2 });
                    }, 0);
                    return req2;
                  },
                  get: function(key) {
                    var req2 = { onsuccess: null, onerror: null, result: null };
                    setTimeout(function() {
                      var k = Array.isArray(key) ? key.join('::') : key;
                      req2.result = s.data[k] ? JSON.parse(JSON.stringify(s.data[k])) : undefined;
                      if (req2.onsuccess) req2.onsuccess({ target: req2 });
                    }, 0);
                    return req2;
                  },
                  getAll: function() {
                    var req2 = { onsuccess: null, onerror: null, result: null };
                    setTimeout(function() {
                      var res = [];
                      for (var k in s.data) res.push(JSON.parse(JSON.stringify(s.data[k])));
                      req2.result = res;
                      if (req2.onsuccess) req2.onsuccess({ target: req2 });
                    }, 0);
                    return req2;
                  },
                  delete: function(key) {
                    var req2 = { onsuccess: null, onerror: null, result: null };
                    setTimeout(function() {
                      var k = Array.isArray(key) ? key.join('::') : key;
                      delete s.data[k];
                      req2.result = undefined;
                      if (req2.onsuccess) req2.onsuccess({ target: req2 });
                    }, 0);
                    return req2;
                  },
                  clear: function() {
                    var req2 = { onsuccess: null, onerror: null, result: null };
                    setTimeout(function() {
                      s.data = {};
                      req2.result = undefined;
                      if (req2.onsuccess) req2.onsuccess({ target: req2 });
                    }, 0);
                    return req2;
                  }
                };
              }
            };
            setTimeout(function() {
              if (txObj.oncomplete) txObj.oncomplete({ target: txObj });
            }, 0);
            return txObj;
          }
        };

        if (targetDb.version < (version || 1)) {
          targetDb.version = version || 1;
          if (req.onupgradeneeded) {
            req.onupgradeneeded({ target: { result: dbHandle } });
          }
        }
        req.result = dbHandle;
        if (req.onsuccess) req.onsuccess({ target: req });
      }, 0);
      return req;
    }
  };
}

// ایجاد نمونه پیش‌فرض سراسری
var offlineStorage = new OfflineStorage();

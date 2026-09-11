/* ═══════════════════════════════════════════════════════════════════
   src/js/29-pull.js — دریافت داده‌ها و دلتاهای سرور (Pull & Delta Sync)
   A01: پیاده‌سازی Pull/Bootstrap عمومی و همگام‌سازی دوطرفه کلاینت
   ═══════════════════════════════════════════════════════════════════ */

var PULL_MIGRATION_FLAG = 'payesh_pull_migrated';
var PULL_SYNC_CURSOR_KEY = 'payesh_last_pull_time';
var PULL_IS_SYNCING = false;

/**
 * دریافت اسنپ‌شات یا دلتای تغییرات از سرور و ادغام در پایگاه داده کلاینت
 * @param {object} [options] تنظیمات دلتا یا اسنپ‌شات کامل
 * @returns {Promise<object>}
 */
function pullFromServer(options) {
  options = options || {};
  if (PULL_IS_SYNCING && !options.force) {
    return Promise.resolve({ ok: false, busy: true });
  }

  // در صورتی که سرور در دسترس نباشد یا حالت صرفاً محلی فعال باشد
  if (!isServerMode() && !options.forceOnline && !options.customApi) {
    return Promise.resolve({ ok: false, fallback: true, message: 'حالت محلی فعال است' });
  }

  PULL_IS_SYNCING = true;

  var since = null;
  if (!options.forceSnapshot) {
    since = options.since || (typeof Store !== 'undefined' ? Store.get(PULL_SYNC_CURSOR_KEY) : null);
  }

  var queryParts = [];
  if (since) {
    queryParts.push('since=' + encodeURIComponent(since));
  }
  if (options.collections && Array.isArray(options.collections) && options.collections.length > 0) {
    queryParts.push('collections=' + encodeURIComponent(options.collections.join(',')));
  }

  var endpoint = '/api/v1/pull' + (queryParts.length > 0 ? ('?' + queryParts.join('&')) : '');
  var apiCaller = options.customApi || (typeof Api !== 'undefined' ? Api : null);

  if (!apiCaller || typeof apiCaller.get !== 'function') {
    PULL_IS_SYNCING = false;
    return Promise.resolve({ ok: false, fallback: true });
  }

  return apiCaller.get(endpoint).then(function(payload) {
    PULL_IS_SYNCING = false;
    if (!payload || !payload.ok) {
      return { ok: false, payload: payload };
    }

    // ادغام تغییرات در پایگاه داده کلاینت
    mergeServerDelta(payload);

    // ثبت زمان آخرین همگام‌سازی موفق
    if (payload.server_time && typeof Store !== 'undefined') {
      Store.set(PULL_SYNC_CURSOR_KEY, payload.server_time);
      Store.set(PULL_MIGRATION_FLAG, 'true');
    }

    if (typeof offlineStorage !== 'undefined' && offlineStorage.isSupported() && payload.server_time) {
      try {
        offlineStorage.setMetadata(PULL_SYNC_CURSOR_KEY, payload.server_time).catch(function(){});
        if (payload.server_version != null) {
          offlineStorage.setMetadata('server_version', payload.server_version).catch(function(){});
        }
      } catch (e) {}
    }

    return { ok: true, payload: payload };
  }).catch(function(err) {
    PULL_IS_SYNCING = false;
    // Fallback: خطای ارتباط نباید برنامه را متوقف کند
    return { ok: false, fallback: true, error: err ? err.message : 'network_error' };
  });
}

/**
 * ادغام ایمن داده‌های دریافتی از سرور در حافظه محلی و IndexedDB
 * محافظت در برابر بازنویسی تغییرات ارسال‌نشده در صف محلی (sync_queue)
 * @param {object} payload بدنه پاسخ دریافتی از GET /api/v1/pull
 * @returns {boolean}
 */
function mergeServerDelta(payload) {
  if (!payload || typeof payload !== 'object' || !payload.collections) {
    return false;
  }

  // استخراج شناسه‌های رکوردهایی که در صف آفلاین منتظر ارسال هستند تا بازنویسی نشوند
  var pendingSet = {};
  if (typeof SYNC !== 'undefined' && Array.isArray(SYNC.queue)) {
    for (var qi = 0; qi < SYNC.queue.length; qi++) {
      var qItem = SYNC.queue[qi];
      if (qItem && qItem.c) {
        var opId = qItem.id != null ? qItem.id : (qItem.data ? qItem.data.id : null);
        if (opId != null) {
          pendingSet[qItem.c + '::' + opId] = true;
        }
      }
    }
  }

  var cols = payload.collections;
  var touchedCols = {};
  /* Gap 1 (Delta Hardening Phase 2): اسنپ‌شات کامل یعنی «حالتِ واقعیِ سرور» —
     هر ردیفی که در پاسخِ کاملِ یک مجموعه نیست، دیگر وجود ندارد. ادغامِ
     صرفِ by-id ردیف‌های حذف‌شدهٔ قدیمی را برای همیشه نگه می‌داشت؛ پس
     مجموعه‌های بازگشدهٔ اسنپ‌شاتِ کامل جایگزین می‌شوند — به‌جز ردیف‌های
     محافظت‌شده توسط صفِ آفلاین (pendingSet). دلتا (full_snapshot=false)
     عینِ قبل merge می‌شود. */
  var isFullSnapshot = payload.full_snapshot === true;

  for (var c in cols) {
    if (!Object.prototype.hasOwnProperty.call(cols, c)) continue;
    var records = cols[c];
    if (!Array.isArray(records)) continue;

    if (!Array.isArray(db[c])) {
      db[c] = [];
    }

    touchedCols[c] = true;

    if (isFullSnapshot) {
      var keptRows = [];
      for (var ki = 0; ki < db[c].length; ki++) {
        var oldRow = db[c][ki];
        if (oldRow && oldRow.id != null && pendingSet[c + '::' + oldRow.id]) {
          keptRows.push(oldRow);
        }
      }
      db[c] = keptRows;
    }

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec || rec.id == null) continue;

      var key = c + '::' + rec.id;
      // اگر در صف محلی عملیات ثبت‌نشده برای این رکورد باشد، دست نزن
      if (pendingSet[key]) {
        continue;
      }

      var existingIdx = db[c].findIndex(function(x) { return x.id === rec.id; });
      if (existingIdx > -1) {
        Object.assign(db[c][existingIdx], rec);
      } else {
        db[c].push(rec);
      }

      var numId = Number(rec.id);
      if (numId > (ids[c] || 0)) {
        ids[c] = numId;
      }

      // همگام‌سازی پس‌زمینه با IndexedDB
      if (typeof offlineStorage !== 'undefined' && offlineStorage.isSupported()) {
        try { offlineStorage.putEntity(c, rec).catch(function(){}); } catch (e) {}
      }
    }
  }

  // پردازش رکوردهای حذف‌شده در سرور (Tombstones)
  if (Array.isArray(payload.deleted)) {
    for (var di = 0; di < payload.deleted.length; di++) {
      var del = payload.deleted[di];
      if (!del || !del.c || del.id == null) continue;

      var delKey = del.c + '::' + del.id;
      if (pendingSet[delKey]) {
        continue; // اگر کاربر به صورت محلی ویرایش کرده، حذف سرور را نگه دار
      }

      if (Array.isArray(db[del.c])) {
        var dIdx = db[del.c].findIndex(function(x) { return x.id === del.id; });
        if (dIdx > -1) {
          db[del.c].splice(dIdx, 1);
          touchedCols[del.c] = true;
        }
      }

      if (typeof offlineStorage !== 'undefined' && offlineStorage.isSupported()) {
        try { offlineStorage.removeEntity(del.c, del.id).catch(function(){}); } catch (e) {}
      }
    }
  }

  // باطل‌سازی ایندکس‌های کش‌شده برای رندرهای بعدی
  for (var tc in touchedCols) {
    if (typeof idxInvalidate === 'function') {
      try { idxInvalidate(tc); } catch (e) {}
    }
  }

  return true;
}

/**
 * راه‌اندازی اولیه و بارگذاری کلی داده‌ها از سرور در اولین اجرای برنامه
 * @returns {Promise<object>}
 */
function bootstrapFromServer() {
  return pullFromServer({ forceSnapshot: true });
}

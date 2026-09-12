/* ═══════════════════════════════════════════════════════════════════
   src/js/29-pull.js — دریافت داده‌ها و دلتاهای سرور (Pull & Delta Sync)
   A01: پیاده‌سازی Pull/Bootstrap عمومی و همگام‌سازی دوطرفه کلاینت
   ═══════════════════════════════════════════════════════════════════ */

var PULL_MIGRATION_FLAG = 'payesh_pull_migrated';
var PULL_SYNC_CURSOR_KEY = 'payesh_last_pull_time';
/* Delta Hardening Phase 2 (gap 2): کلیدِ ذخیرهٔ کرسرِ امضاشدهٔ سرور.
   وقتی موجود است، به‌جای `since` خام ارسال می‌شود و سرور آن را راستی‌آزمایی
   می‌کند (امضا + TTL یک‌ساعته). `payesh_last_pull_time` به‌عنوان مسیرِ
   سازگاری با کلاینت‌های قدیمی/سرورِ بدون کلید باقی می‌ماند. */
var PULL_CURSOR_KEY = 'payesh_pull_cursor';
var PULL_IS_SYNCING = false;

/* ── P0-2 (پ۳ 2026-09-12): کشِ کرانداِر گزارش‌ها — لایهٔ کلاینت ──────
   دفاعِ دولایه: سرور مجموعه‌های سنگینِ گزارشی را کران‌دار می‌فرستد
   (server/pull.js) و کلاینت هم مستقلاً هرگز بیش از این سقف‌ها را در
   حافظه/IndexedDB نگه نمی‌دارد — سرورِ قدیمی/جعلی نمی‌تواند مرورگر را
   با جدولِ ملی پر کند. متادیتای snapshot جزئی + TTL هم این‌جاست. */
var RPT_CACHE_HEAVY_COLS = ['attendance', 'grades', 'discipline', 'hw_submissions'];
var RPT_CACHE_MAX_ROWS = 5000;          /* هم‌ارزِ سقفِ سرور */
var RPT_CACHE_TTL_MS = 24 * 3600 * 1000; /* پس از ۲۴h snapshot گزارشی کهنه است */
var RPT_CACHE_META_KEY = 'payesh_report_cache_meta';

function rptCacheRecency(r){
  var t = r && (r.updated_at || r.created_at);
  var ms = t ? new Date(t).getTime() : NaN;
  if (!isNaN(ms)) return ms;
  var id = r && Number(r.id);
  return isFinite(id) ? id : 0;
}

/** اعمالِ کرانِ کلاینت روی یک مجموعهٔ سنگین — تازه‌ترین‌ها می‌مانند. */
function rptCacheBound(c){
  if (RPT_CACHE_HEAVY_COLS.indexOf(c) === -1) return false;
  if (!Array.isArray(db[c]) || db[c].length <= RPT_CACHE_MAX_ROWS) return false;
  db[c].sort(function(a, b){ return rptCacheRecency(b) - rptCacheRecency(a); });
  var dropped = db[c].splice(RPT_CACHE_MAX_ROWS);
  /* ردیف‌های بریده از IndexedDB هم پاک می‌شوند تا بوتِ بعدی برنگردند */
  if (typeof offlineStorage !== 'undefined' && offlineStorage.isSupported()) {
    for (var i = 0; i < dropped.length; i++) {
      try { offlineStorage.removeEntity(c, dropped[i].id).catch(function(){}); } catch (e) {}
    }
  }
  return true;
}

/** ثبت متادیتای snapshot گزارشی — قراردادِ union (بازخوردِ بازبین #129،
    کامنت ۲): «جزئی» ویژگیِ وضعیتِ محلیِ کلِ مجموعه است نه آخرین پاسخ؛
    دلتای کوچک نمی‌تواند پرچمِ مجموعه‌ای را که هنوز ناقص است پاک کند یا
    TTL را تازه کند. فقط snapshot کاملِ واقعاً نبریدهٔ همان مجموعه پرچم را
    برمی‌دارد و زمانِ تازگی را می‌نشاند.
    @param partialCols مجموعه‌های جزئیِ این پاسخ
    @param opts {fullSnapshot:bool, touched:{col:1}} — پاسخ full بود؟ کدام
           مجموعه‌ها در پاسخ آمدند؟ */
function rptCacheSetMeta(partialCols, opts){
  opts = opts || {};
  var prev = typeof Store !== 'undefined' ? (Store.getJSON(RPT_CACHE_META_KEY, null) || {}) : {};
  var prevPartial = Array.isArray(prev.partial) ? prev.partial : [];
  var nowPartial = partialCols || [];
  var merged;
  if (opts.fullSnapshot) {
    /* snapshot کامل: پرچمِ مجموعه‌های حاضر در پاسخ از نو تعیین می‌شود
       (نبریده = پاک)؛ مجموعه‌های غایب پرچمِ قبلی‌شان را نگه می‌دارند. */
    merged = nowPartial.slice();
    for (var i = 0; i < prevPartial.length; i++) {
      var pc = prevPartial[i];
      if (!(opts.touched && opts.touched[pc]) && merged.indexOf(pc) === -1) merged.push(pc);
    }
  } else {
    /* دلتا: فقط اجتماع — دلتا هرگز پرچم پاک نمی‌کند. */
    merged = prevPartial.slice();
    for (var j = 0; j < nowPartial.length; j++) {
      if (merged.indexOf(nowPartial[j]) === -1) merged.push(nowPartial[j]);
    }
  }
  var meta = {
    /* TTL فقط با snapshot کامل تازه می‌شود؛ دلتا زمانِ قبلی را نگه می‌دارد. */
    at: opts.fullSnapshot ? Date.now() : (prev.at || Date.now()),
    partial: merged,
    /* resume در جریان؟ (برای نشانگرِ «در حال تکمیل» در UI) */
    resuming: !!opts.resuming
  };
  if (typeof Store !== 'undefined') Store.setJSON(RPT_CACHE_META_KEY, meta);
  return meta;
}

/** وضعیتِ کش گزارشی برای UI: {partial:[…], stale:bool} یا null. */
function rptCacheStatus(){
  var meta = typeof Store !== 'undefined' ? Store.getJSON(RPT_CACHE_META_KEY, null) : null;
  if (!meta) return null;
  return {
    partial: Array.isArray(meta.partial) ? meta.partial : [],
    stale: (Date.now() - (meta.at || 0)) > RPT_CACHE_TTL_MS,
    resuming: !!meta.resuming
  };
}

/* پ۳ — resume دلتای بریده (کامنت ۱ بازبین #129): وقتی سرور اعلام کند
   دلتای مجموعه‌ای بریده شده (full_snapshot_required_collections)،
   کلاینت باید برای همان مجموعه‌ها یک snapshot کاملِ کران‌دار بگیرد؛
   وگرنه تغییراتِ پشتِ کرسرِ جلورفته برای همیشه گم می‌شوند.
   حداکثر یک resume هم‌زمان؛ حلقه ممنوع (پاسخ snapshot، دلتا نیست). */
var RPT_RESUME_IN_FLIGHT = false;
function rptResumeTruncatedDelta(cols, baseOptions){
  if (RPT_RESUME_IN_FLIGHT || !cols || !cols.length) return Promise.resolve({ ok: false, skipped: true });
  RPT_RESUME_IN_FLIGHT = true;
  return pullFromServer({
    forceSnapshot: true,       /* بدونِ since/cursor ⇒ full snapshot کران‌دار */
    collections: cols.slice(), /* فقط مجموعه‌های بریده — نه کل دنیا */
    force: true,               /* از سدِ PULL_IS_SYNCING عبور (پاسخِ در جریان) */
    _resume: true,             /* حلقه‌شکن: پاسخِ resume دوباره resume نمی‌کند */
    /* همان کانالِ pull اصلی (آزمون‌ها/ابزارها customApi می‌دهند) */
    customApi: baseOptions && baseOptions.customApi,
    forceOnline: baseOptions && baseOptions.forceOnline
  }).then(function(r){
    RPT_RESUME_IN_FLIGHT = false;
    return r;
  }).catch(function(e){
    RPT_RESUME_IN_FLIGHT = false;
    return { ok: false, error: e && e.message };
  });
}

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
  var cursorToken = null;
  if (!options.forceSnapshot) {
    since = options.since || (typeof Store !== 'undefined' ? Store.get(PULL_SYNC_CURSOR_KEY) : null);
    /* Gap 2: کرسرِ امضاشده مقدم بر `since` خام است — مگر اینکه فراخواننده
       صریحاً since داده باشد (آزمون‌ها/ابزارها). سرور sinceِ داخلِ توکن را
       معتبر می‌شمارد، نه ادعای آزادِ کلاینت را. فقط توکنِ سالمِ شکل‌دار
       (pc1.… — نه رشتهٔ «null» یا مقدارِ کهنهٔ خراب) ارسال می‌شود. */
    if (!options.since && typeof Store !== 'undefined') {
      var storedCursor = Store.get(PULL_CURSOR_KEY);
      if (typeof storedCursor === 'string' && storedCursor.indexOf('pc1.') === 0 && storedCursor.length > 10) {
        cursorToken = storedCursor;
      }
    }
  }

  var queryParts = [];
  if (cursorToken) {
    queryParts.push('cursor=' + encodeURIComponent(cursorToken));
  } else if (since) {
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

  /* Gap 2: حالت raw تا کدِ وضعیت (۴۰۱ cursor_expired) هم دیده شود؛
     stubهای آزمونی که آرگومان دوم را نادیده می‌گیرند و خودِ payload را
     برمی‌گردانند هم با همان نرمال‌سازی پایین کار می‌کنند. */
  return apiCaller.get(endpoint, { raw: true }).then(function(raw) {
    PULL_IS_SYNCING = false;

    var status = 200;
    var payload = raw;
    if (raw && typeof raw === 'object' && typeof raw.status === 'number' && raw.body != null) {
      status = raw.status;
      payload = raw.body;
    }

    /* Gap 2: تمدید خودکار — کرسرِ منقضی/نامعتبر ⇒ یک pull کامل (فقط یک
       بار؛ خروجی‌اش next_cursor تازه دارد و چرخه ادامه می‌یابد). */
    if (status === 401 && payload && payload.cursor_renewal === 'full_pull') {
      if (typeof Store !== 'undefined') { Store.set(PULL_CURSOR_KEY, null); }
      if (!options._renewing) {
        return pullFromServer({
          forceSnapshot: true,
          _renewing: true,
          customApi: options.customApi,
          collections: options.collections
        });
      }
      return { ok: false, code: payload.code || 'cursor_expired', payload: payload };
    }

    if (status !== 200 || !payload || !payload.ok) {
      return { ok: false, status: status, payload: payload };
    }

    // ادغام تغییرات در پایگاه داده کلاینت
    mergeServerDelta(payload);

    // ثبت زمان آخرین همگام‌سازی موفق + کرسرِ امضاشدهٔ بعدی (gap 2)
    if (payload.server_time && typeof Store !== 'undefined') {
      Store.set(PULL_SYNC_CURSOR_KEY, payload.server_time);
      Store.set(PULL_MIGRATION_FLAG, 'true');
    }
    if (typeof Store !== 'undefined') {
      if (payload.next_cursor) {
        Store.set(PULL_CURSOR_KEY, payload.next_cursor);
      } else if (!payload.full_snapshot) {
        /* سرورِ بدونِ کلیدِ کرسر: مسیرِ legacy را نگه دار و توکنِ کهنه را
           دور بریز تا دفعهٔ بعد since ارسال شود. */
        Store.set(PULL_CURSOR_KEY, null);
      }
    }

    if (typeof offlineStorage !== 'undefined' && offlineStorage.isSupported() && payload.server_time) {
      try {
        offlineStorage.setMetadata(PULL_SYNC_CURSOR_KEY, payload.server_time).catch(function(){});
        if (payload.next_cursor) {
          offlineStorage.setMetadata(PULL_CURSOR_KEY, payload.next_cursor).catch(function(){});
        }
        if (payload.server_version != null) {
          offlineStorage.setMetadata('server_version', payload.server_version).catch(function(){});
        }
      } catch (e) {}
    }

    /* پ۳ — resume دلتای بریده: سرور اعلام کرده این مجموعه‌ها snapshot
       کامل لازم دارند. فقط اگر خودِ این پاسخ resume نبود (حلقه‌شکن). */
    var needFull = Array.isArray(payload.full_snapshot_required_collections)
      ? payload.full_snapshot_required_collections : [];
    if (needFull.length && !options._resume) {
      return rptResumeTruncatedDelta(needFull, options).then(function(resumeResult){
        /* پس از resume موفق، پرچمِ «در حال تکمیل» برداشته می‌شود
           (متادیتای partial خودِ پاسخِ resume طبق قراردادِ union نوشته شده). */
        if (resumeResult && resumeResult.ok && typeof Store !== 'undefined') {
          var meta = Store.getJSON(RPT_CACHE_META_KEY, null);
          if (meta) { meta.resuming = false; Store.setJSON(RPT_CACHE_META_KEY, meta); }
        }
        return { ok: true, payload: payload, resumed: needFull, resume_result: resumeResult };
      });
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

  /* P0-2: کرانِ مستقلِ کلاینت روی مجموعه‌های سنگینِ گزارشی + ثبت
     متادیتای «جزئی» (اعلامِ سرور ∪ برشِ خودِ کلاینت). scope دست‌نخورده:
     کران فقط از ردیف‌هایِ همان دامنه می‌کاهد، چیزی اضافه نمی‌کند.
     پ۳: متادیتا با قراردادِ union نوشته می‌شود (کامنت ۲ بازبین #129) —
     دلتا پرچم پاک نمی‌کند و TTL را تازه نمی‌کند. */
  var partialCols = Array.isArray(payload.partial_collections) ? payload.partial_collections.slice() : [];
  for (var bc = 0; bc < RPT_CACHE_HEAVY_COLS.length; bc++) {
    var hcol = RPT_CACHE_HEAVY_COLS[bc];
    if (touchedCols[hcol] && rptCacheBound(hcol) && partialCols.indexOf(hcol) === -1) {
      partialCols.push(hcol);
    }
  }
  var needResume = Array.isArray(payload.full_snapshot_required_collections)
    ? payload.full_snapshot_required_collections : [];
  rptCacheSetMeta(partialCols, {
    fullSnapshot: payload.full_snapshot === true,
    touched: touchedCols,
    resuming: needResume.length > 0
  });

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

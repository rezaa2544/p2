/* ═══════════════════════════════════════════════════════════════════
   src/js/00-migration.js — مهاجرت خودکار داده‌ها به IndexedDB
   فاز ۴: بندهای ۱۶ تا ۲۰ — انتقال بدون قطعی به IndexedDB
   ═══════════════════════════════════════════════════════════════════ */

var IDB_MIGRATION_FLAG = 'payesh_idb_migrated_v2';

/**
 * مهاجرت خودکار داده‌های محلی به IndexedDB در اولین اجرا
 * @param {OfflineStorage} [customStorage] شیء ذخیره‌سازی آفلاین اختیاری (برای تست‌ها)
 * @returns {Promise<boolean>} وضعیت اتمام مهاجرت
 */
function migrateFromLocalStorageToIdb(customStorage) {
  var storage = customStorage || (typeof offlineStorage !== 'undefined' ? offlineStorage : null);
  if (!storage || !storage.isSupported()) {
    return Promise.resolve(false);
  }

  // اگر قبلاً مهاجرت انجام شده باشد
  try {
    if (typeof Store !== 'undefined' && Store.get(IDB_MIGRATION_FLAG) === 'true') {
      return Promise.resolve(true);
    }
  } catch (e) {
    return Promise.resolve(false);
  }

  return storage.init().then(function() {
    var promises = [];

    // ۱. انتقال لاگ و سابقه تغییرات
    try {
      if (typeof Store !== 'undefined') {
        var rawLog = Store.get('sms_log_v1') || Store.get('payesh_log');
        if (rawLog) {
          var logEntries = JSON.parse(rawLog);
          if (Array.isArray(logEntries) && logEntries.length > 0) {
            promises.push(storage.setMetadata('legacy_log', logEntries));
          }
        }
      }
    } catch (errLog) {
      console.warn('هشدار در خواندن لاگ قدیمی جهت مهاجرت:', errLog);
    }

    // ۲. انتقال صف همگام‌سازی معلق
    //    W7-5 (باگ‌هانت چت ۵، نشست ۴): کلیدِ واقعیِ صف `sms_syncq_v1`
    //    (SYNC_QUEUE_KEY در 27-sync.js) است؛ پیش‌تر فقط کلیدِ کهنهٔ
    //    `sms_queue_v1`/`payesh_sync_queue` خوانده می‌شد، پس صفِ معلقِ
    //    واقعی هیچ‌وقت مهاجرت نمی‌کرد و پرچم با صفِ ناتمام سبز می‌شد.
    try {
      if (typeof Store !== 'undefined') {
        var rawQueue = Store.get('sms_syncq_v1') || Store.get('sms_queue_v1') || Store.get('payesh_sync_queue');
        if (rawQueue) {
          var queueEntries = JSON.parse(rawQueue);
          if (Array.isArray(queueEntries)) {
            for (var i = 0; i < queueEntries.length; i++) {
              var op = queueEntries[i];
              if (op && (op.uid || op.id)) {
                if (!op.uid) op.uid = op.id;
                promises.push(storage.addToQueue(op));
              }
            }
          }
        }
      }
    } catch (errQ) {
      console.warn('هشدار در انتقال صف همگام‌سازی جهت مهاجرت:', errQ);
    }

    // ۳. انتقال تنظیمات برنامه
    try {
      if (typeof Store !== 'undefined') {
        var rawSettings = Store.get('sms_app_settings') || Store.get('payesh_app_settings');
        if (rawSettings) {
          var settings = JSON.parse(rawSettings);
          promises.push(storage.setMetadata('app_settings', settings));
        }
      }
    } catch (errSet) {
      console.warn('هشدار در انتقال تنظیمات جهت مهاجرت:', errSet);
    }

    return Promise.all(promises).then(function() {
      try {
        if (typeof Store !== 'undefined') Store.set(IDB_MIGRATION_FLAG, 'true');
      } catch (e) {}
      return true;
    }).catch(function(err) {
      console.error('خطا در فرآیند مهاجرت داده‌ها به IndexedDB:', err);
      return false;
    });
  }).catch(function() {
    return false;
  });
}

// تلاش برای اجرای مهاجرت در پس‌زمینه هنگام بوت در صورت آمادگی محیط
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        try { migrateFromLocalStorageToIdb(); } catch (e) {}
      });
    } else {
      setTimeout(function() {
        try { migrateFromLocalStorageToIdb(); } catch (e) {}
      }, 0);
    }
  } catch (e) {}
}

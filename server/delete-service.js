/* ═══════════════════════════════════════════════════════════════════
   server/delete-service.js — P0-17: سرویس حذف واحد (حذفِ نرم + سنگ‌قبر)
   ───────────────────────────────────────────────────────────────────
   حذف‌ها دیگر اسپلایسِ خام نیستند. هر حذف از اینجا می‌گذرد:
   ۱) نسخهٔ رکورد بالا می‌رود — نوشتِ همزمانی که روی نسخهٔ کهنه نشسته،
      در پی۰-۱۸ با ۴۰۹ می‌خورد.
   ۲) تمامِ رکورد با متادیتای حذف به `store.tombstones` می‌رود —
      قابلِ بازیابی، ممیزی‌پذیر؛ هیچ داده‌ای بی‌صدا نابود نمی‌شود.
   ۳) رویدادِ `<col>.deleted` به صندوق برون‌مرزی می‌رود تا نمونه‌های
      دیگر و مصرف‌کننده‌ها حذف را ببینند.
   ۴) سپس از مجموعهٔ زنده خارج می‌شود + عملیاتِ حذف در پستگرس + ممیزی.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const COLLECTIONS = new Set(['attendance', 'classes', 'grades', 'users']);

function createDeleteService({ store, db, markDirty, outbox }) {
  if (!Array.isArray(store.tombstones)) store.tombstones = [];

  const matches = (rec, match) => {
    for (const k of Object.keys(match)) {
      if (rec[k] !== match[k]) return false;
    }
    return true;
  };

  /**
   * @param {string} collection — attendance | classes | grades | users
   * @param {object} match — فیلدهای برابریِ رکورد هدف، مانند {id} یا {id, role}
   * @param {object} meta — { actor, audit, reason }؛ audit = (event, fields) => void
   * @returns {Promise<{ok:boolean, status:number, record?:object}>}
   */
  async function softDelete(collection, match, meta) {
    meta = meta || {};
    if (!COLLECTIONS.has(collection)) return { ok: false, status: 500 };
    const arr = Array.isArray(store[collection]) ? store[collection] : null;
    if (!arr) return { ok: false, status: 404 };

    const idx = arr.findIndex(r => matches(r, match));
    if (idx === -1) return { ok: false, status: 404 };

    const rec = arr[idx];
    /* ۱) نسخه — پیش از بایگانی بالا می‌رود */
    rec.version = (Number(rec.version) || 0) + 1;

    /* ۲) سنگ‌قبر: نسخهٔ کامل + متادیتای حذف */
    store.tombstones.push({
      collection,
      record: rec,
      deleted_by: meta.actor ? meta.actor.id : null,
      deleted_at: new Date().toISOString(),
      reason: meta.reason || null
    });
    /* سنگ‌قبرها بی‌نهایت نمی‌مانند — اما سقف‌شان بسیار بالاتر از صفِ رویداد است */
    if (store.tombstones.length > 20000) {
      store.tombstones.splice(0, store.tombstones.length - 20000);
    }

    /* ۴-نیم) خروج از مجموعهٔ زنده */
    arr.splice(idx, 1);
    if (typeof markDirty === 'function') markDirty();

    /* حذف در پستگرس (رفتار پیشین، بدون تغییر) */
    const delId = Number(match.id);
    if (db && typeof db.persistOp === 'function' && Number.isFinite(delId)) {
      await db.persistOp({ c: collection, t: 'del', id: delId });
    }

    /* ۳) رویداد برون‌مرزی — ویو ۸: مهارِ مدرسه در payload تا کارگر
       بتواند بدون رکورد (که حذف شده) محدوده را حل کند */
    if (outbox) {
      await outbox.append({
        type: collection + '.deleted',
        collection,
        record_id: Number.isFinite(delId) ? delId : null,
        actor_id: meta.actor ? meta.actor.id : null,
        version: rec.version,
        payload: { school_id: rec.school_id != null ? rec.school_id : null }
      });
    }

    if (typeof meta.audit === 'function') {
      try { meta.audit(rec); } catch (e) {}
    }

    return { ok: true, status: 200, record: rec };
  }

  return { softDelete };
}

module.exports = { createDeleteService };

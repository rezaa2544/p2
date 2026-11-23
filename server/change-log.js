/* ═══════════════════════════════════════════════════════════════════
   server/change-log.js — خوانندهٔ sync_change_log (WP-06 / #434)
   -------------------------------------------------------------------
   تولیدکنندهٔ لاگ در server/db.js داخلِ همان تراکنشِ persistOpsBatch
   می‌نویسد (هیچ نوشتِ کامیتی بدونِ سطرِ لاگش وجود ندارد). این ماژول
   خوانندهٔ cursor-مبناست: پیمایشِ مونوتون روی id با فیلترِ اجباریِ
   tenant (گارد PHASE6 — سؤالِ بدونِ school_id برای کاربرِ غیرملی = خطا).

   سازگاریِ رو به عقب: مسیرِ deltaِ موجود (cursor v3 + chg watermark در
   server/syncdelta.js و undo-log) دست‌نخورده می‌ماند؛ این خواننده
   مبنای مهاجرتِ تدریجیِ خوانندهٔ delta به جریانِ واحدِ seq است.
   PAYESH_SYNC_LOG=off ⇒ تولیدکننده نمی‌نویسد و این خواننده fallback
   صریح می‌دهد (قفلِ rollback).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/**
 * خواندنِ تغییرهای بعد از یک seq برای یک tenant.
 * @param {object} db لایهٔ db فعال (server/db.js)
 * @param {object} opts
 * @param {number|null} opts.sinceSeq آخرین seq دیده‌شده (id از sync_change_log)
 * @param {number|null} opts.schoolId شناسهٔ مدرسه (اجباری برای غیر superadmin)
 * @param {boolean} [opts.isSuperadmin=false] نقشِ ملی = بدون فیلتر مدرسه
 * @param {string[]} [opts.collections] محدودکردن به مجموعه‌ها
 * @param {number} [opts.limit=500] سقفِ هر صفحه
 * @returns {Promise<{ok:true, rows:Array, nextSeq:number|null}|{ok:false, code:string, message:string}>}
 */
async function readChangeLogSince(db, opts) {
  const o = opts || {};
  const sinceSeq = Number.isFinite(Number(o.sinceSeq)) ? Math.max(0, Math.trunc(Number(o.sinceSeq))) : 0;
  const limit = Math.min(2000, Math.max(1, Math.trunc(Number(o.limit) || 500)));
  const isSuperadmin = !!o.isSuperadmin;
  const schoolId = o.schoolId != null && Number.isFinite(Number(o.schoolId)) ? Number(o.schoolId) : null;

  /* PHASE6: بدونِ school_id و بدونِ نقشِ ملی ⇒ fail-closed (نه استنتاجِ
     استان، نه پیش‌فرضِ جادویی) */
  if (!isSuperadmin && schoolId == null) {
    return { ok: false, code: 'PHASE6_TENANT_ISOLATION_BREACH', message: 'PHASE6_UNRESOLVED_PROVINCE' };
  }

  let rows;
  try {
    const params = [sinceSeq, limit];
    let sql = 'SELECT id, collection, record_id, school_id, op, version, at FROM public.sync_change_log WHERE id > $1';
    if (!isSuperadmin) {
      sql += ' AND school_id = $3';
      params.push(schoolId);
    }
    if (Array.isArray(o.collections) && o.collections.length) {
      const cols = o.collections.map((c) => String(c).replace(/[^a-zA-Z0-9_]/g, '')).filter(Boolean);
      if (cols.length) {
        sql += ' AND collection = ANY($' + (params.length + 1) + ')';
        params.push(cols);
      }
    }
    sql += ' ORDER BY id ASC LIMIT $2';
    const r = await db.query(sql, params);
    rows = (r && r.rows) || [];
  } catch (e) {
    if (e && /relation "(public\.)?sync_change_log" does not exist/.test(String(e.message))) {
      return { ok: false, code: 'CHANGE_LOG_UNAVAILABLE', message: 'sync_change_log missing (migration 028 not applied or PAYESH_SYNC_LOG=off)' };
    }
    throw e;
  }

  const nextSeq = rows.length === limit ? (rows.length ? Number(rows[rows.length - 1].id) : sinceSeq) : (rows.length ? Number(rows[rows.length - 1].id) : sinceSeq);
  return { ok: true, rows, nextSeq: rows.length ? nextSeq : sinceSeq };
}

module.exports = { readChangeLogSince };

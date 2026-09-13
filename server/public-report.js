/* ═══════════════════════════════════════════════════════════════════
   server/public-report.js — GET /api/public-report (امنیت C.3، اصلاح ۳)
   -------------------------------------------------------------------
   گزارش عمومیِ بدون ورود، دادهٔ واقعیِ سرور را از همین endpoint می‌گیرد
   (به‌جای اتکا به دادهٔ نمایشیِ دستگاه). عمداً بدون نشست است (عمومی
   بودن، ذاتِ گزارش است) پس خروجی فقط تجمیعی و از پیش تصویب‌شده است:
     - schools: فقط {id, name} مدارس فعال — برای سلکتور
     - report:  {sid, name, level, city, students, teachers, classes,
                 meetings:[{key,n,last}], goals} (برچسب نوع را کاربر می‌گذارد)
                 goals فقط وقتی متن دارد که public_goals=1 باشد
   هیچ رکورد کاربر، هیچ نام/تلفن/کدملی، هیچ شناسهٔ داخلیِ دیگری بیرون
   نمی‌آید — با ساختار، نه با امید (پدافند در عمق، هم‌ردیف bell.js).
   Wave 9: اسکنِ O(n) روی کلکسیون‌ها از رشتهٔ اصلی به ورکرِ عملیاتِ
   سنگین رفت (هستهٔ محاسباتی مشترک: public-report-core.js). تازگیِ داده
   با نسخه‌ها تضمین می‌شود — اگر نوشتنی بعد از آخرین اسنپ‌شات آمده
   باشد، پیش از محاسبه اسنپ‌شاتِ تازه می‌رود. شکستِ ورکر → محاسبهٔ
   درون‌پروسه‌ایِ همان هسته (فال‌بک، بدونِ تغییرِ رفتار).
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const url = require('url');
const { computePublicReport } = require('./public-report-core');
const { publicReportFromPg } = require('./public-report-sql');

function createPublicReport(ctx){
  const store = ctx.store;
  const sendJson = ctx.sendJson;
  const db = ctx.db || null;

  async function apiPublicReport(req, res){
    const query = (url.parse(req.url, true).query) || {};
    let sid = Number(query.school_id) || null;
    /* P1-3 (Wave 18 §۵-۸): PG زنده ⇒ تجمیع در دیتابیس (COUNT/GROUP BY با
       ایندکس)، نه اسکنِ آینهٔ مقیّد — «تقریبِ نمونهٔ محدود» جای اعدادِ ملی
       را نمی‌گیرد. worker برای بارِ CPU مسیرِ حافظه است؛ این‌جا تجمیع در DB
       است و خروجی bounded. خطای DB ⇒ 503 صادقانه (fail-closed)، نه
       fallbackِ بی‌صدا به عددِ تقریبی. */
    if(db && typeof db.isPostgres === 'function' && db.isPostgres()){
      try{
        return sendJson(res, 200, await publicReportFromPg(db, sid));
      }catch(e){
        return sendJson(res, 503, { ok: false, code: 'public_report_pg_failed' });
      }
    }
    let out;
    if(ctx.workers && typeof ctx.workers.runReport === 'function'){
      try{ out = await ctx.workers.runReport(sid); }
      catch(e){ out = computePublicReport(store, sid); } /* فال‌بک: همان هسته، درون‌پروسه‌ای */
    }else{
      out = computePublicReport(store, sid);
    }
    return sendJson(res, 200, out);
  }

  return { apiPublicReport };
}

module.exports = { createPublicReport };

/* ═══════════════════════════════════════════════════════════════════
   server/json-fast.js — سریال‌سازیِ JSON با خروجیِ ASCII (Wave 24, KPI-3)
   -------------------------------------------------------------------
   چرا: JSON.parse روی بایت‌های چندبایتیِ UTF-8 (متنِ فارسیِ استور)
   کندتر از ASCII خالص است — V8 برای رشته‌های ASCII مسیرِ یک‌بایتیِ
   سریع دارد. با نوشتنِ payesh.json به‌صورت \uXXXX-escaped:
     پارسِ استورِ مرجع (۵.۸MB): ~۵۲ms → ~۴۱ms (گرم، میانه)
   خروجی همچنان JSON استاندارد و ۱۰۰٪ هم‌ارز است (JSON.parse همان
   object را می‌دهد)؛ هر مصرف‌کننده‌ای — از جمله نسخه‌های قدیمیِ
   loadStore — بدونِ تغییر می‌خواند. بهایش +۲۲٪ حجمِ فایل است که
   در برابرِ بردِ پارس (مسیرِ داغِ بوت) پذیرفته شد.

   escape با جدولِ یادسپاری (LUT) و regexِ run-based انجام می‌شود:
   ~۴۴ms روی استورِ مرجع (سه برابر سریع‌تر از replace تک‌نویسه‌ای) و
   در ورکرِ persist اجرا می‌شود — نه event-loop اصلی.

   جفت‌های surrogate: charCodeAt هر نیمه را جدا می‌دهد و \uD8xx\uDCxx
   escaped-pair معتبرِ JSON است — رفت‌وبرگشت بی‌کم‌وکاست.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* LUT تنبل — فقط کدهای واقعاً دیده‌شده پر می‌شوند (فارسی ≈ ۱۰۰ نویسه) */
const LUT = Object.create(null);
const RUN_RE = /[\u0080-\uffff]+/g;

function escapeRun(run){
  let out = '';
  for (let i = 0; i < run.length; i++){
    const c = run.charCodeAt(i);
    out += LUT[c] || (LUT[c] = '\\u' + c.toString(16).padStart(4, '0'));
  }
  return out;
}

/** JSON.stringify با خروجیِ ASCII خالص — پارسِ سریع‌تر در V8. */
function stringifyAscii(obj){
  return JSON.stringify(obj).replace(RUN_RE, escapeRun);
}

module.exports = { stringifyAscii };

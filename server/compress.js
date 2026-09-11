/* ═══════════════════════════════════════════════════════════════════
   server/compress.js — فشرده‌سازیِ پاسخِ JSON (Delta Phase 4, gap 2)
   ─────────────────────────────────────────────────────────────────
   چرا: پاسخِ دلتا JSON خام است؛ برایِ فیکسچرِ واقعی (۹۲۳k ردیفِ فاز ۲،
   پاسخِ کامل چند ده مگابایت) یعنی پهنای‌باندِ بریده‌شده و TLS بدونِ
   دستاورد. این‌جا مذاکرهٔ Content-Encoding روی همان پاسخ:

     gzip  ارجح (سریع، همه‌جا)
     br    فقط وقتی کلاینت gzip نمی‌فهمد ولی brotli می‌فهمد
           (کیفیت ۵ — نه ۱۱ پیش‌فرضِ zlib که برایِ درخواستِ زنده کند است)

   قواعد:
   - آستانه: فقط بدنه‌های >= آستانه فشرده می‌شوند (پیش‌فرض ۱KB،
     env PAYESH_DELTA_COMPRESS_MIN_BYTES) — فشرده‌کردنِ ۲۰۰ بایت
     ضدهدف است (هدرها بزرگ‌تر از صرفه‌جویی‌اند).
   - سازگاری: اگر res.writeHead قابل‌فراخوانی نباشد (هارنس‌های تستِ
     قدیمی که فقط sendJson تزریق می‌کنند)، عیناً همان مسیرِ نافشرده —
     رفتارِ پیشین.
   - Vary: Accept-Encoding همیشه روی پاسخِ مذاکره‌شده (کشِ مشترکِ
     downstream خراب نشود).
   - شکستِ zlib (نظری) = fallback به بدنهٔ نافشرده — پاسخ هرگز
     به‌خاطرِ فشرده‌سازی نمی‌میرد.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const zlib = require('zlib');

function minBytes() {
  const n = Number(process.env.PAYESH_DELTA_COMPRESS_MIN_BYTES);
  if (!Number.isFinite(n)) return 1024;
  return Math.min(4 * 1024 * 1024, Math.max(0, Math.trunc(n)));
}

/** رمزگذاریِ مذاکره‌شده از سرآیندِ Accept-Encoding — gzip ارجح. */
function negotiateEncoding(acceptHeader) {
  const ae = String(acceptHeader || '');
  if (/\bgzip\b/.test(ae)) return 'gzip';
  if (/\bbr\b/.test(ae)) return 'br';
  return null;
}

/**
 * پاسخِ JSON را با مذاکرهٔ فشرده‌سازی بفرست.
 * @param {object} res پاسخِ HTTP (writeHead/end) — یا شیءِ هارنسِ قدیمی
 * @param {object} req درخواست (برایِ Accept-Encoding)
 * @param {number} status
 * @param {object} obj بدنهٔ JSON
 * @param {function} sendJson مسیرِ نافشردهٔ ctx (fallback)
 * @returns {{encoding:string|null, rawBytes:number, wireBytes:number}}
 *   برای متریک — encoding=null یعنی نافشرده فرستاده شد.
 */
function sendJsonCompressed(res, req, status, obj, sendJson) {
  let json;
  try { json = JSON.stringify(obj); } catch (e) { json = null; }
  if (json == null) {
    return { encoding: null, rawBytes: 0, wireBytes: 0, reply: sendJson(res, status, obj) };
  }
  const raw = Buffer.from(json, 'utf8');
  const headers = req && req.headers ? req.headers : {};

  const enc = raw.length >= minBytes() ? negotiateEncoding(headers['accept-encoding']) : null;
  if (!enc || typeof res.writeHead !== 'function' || typeof res.end !== 'function') {
    return { encoding: null, rawBytes: raw.length, wireBytes: raw.length, reply: sendJson(res, status, obj) };
  }
  try {
    const out = enc === 'gzip'
      ? zlib.gzipSync(raw, { level: 6 })
      : zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Encoding': enc,
      'Vary': 'Accept-Encoding'
    });
    res.end(out);
    return { encoding: enc, rawBytes: raw.length, wireBytes: out.length, reply: undefined };
  } catch (e) {
    /* شکستِ فشرده‌سازی هرگز پاسخ را نمی‌کشد */
    return { encoding: null, rawBytes: raw.length, wireBytes: raw.length, reply: sendJson(res, status, obj) };
  }
}

module.exports = { sendJsonCompressed, negotiateEncoding, minBytes };

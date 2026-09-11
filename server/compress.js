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
const { promisify } = require('util');
const gzipAsync = promisify(zlib.gzip);
const brotliAsync = promisify(zlib.brotliCompress);

function minBytes() {
  const n = Number(process.env.PAYESH_DELTA_COMPRESS_MIN_BYTES);
  if (!Number.isFinite(n)) return 1024;
  return Math.min(4 * 1024 * 1024, Math.max(0, Math.trunc(n)));
}

/** رمزگذاریِ مذاکره‌شده از سرآیندِ Accept-Encoding — gzip ارجح.
 *
 *  S9-2 (باگ‌هانت نشست ۹): نسخهٔ پیشین دو اشکال داشت:
 *   ۱) `q=0` را نمی‌فهمید؛ `Accept-Encoding: gzip;q=0` یعنی «gzip را
 *      نمی‌خواهم» ولی پاسخ با Content-Encoding: gzip می‌رفت — کلاینتِ
 *      صریحاً مخالف، بدنهٔ خراب می‌دید (نقض RFC 9110 §12.5.3).
 *   ۲) تطبیق حساس به بزرگی/کوچکی بود؛ `GZIP` ⇒ هیچ فشرده‌سازی.
 *  حالا پارسِ کامل با q: توکنِ q=0 حذف می‌شود، `*` پوششِ پیش‌فرض است،
 *  و سیاستِ «gzip ارجح» دست‌نخورده می‌ماند (تنها میانِ گزینه‌های مجاز).
 *  qِ بدشکل/منفی = همان توکن نامعتبر (fail-closed برای آن توکن).
 */
function negotiateEncoding(acceptHeader) {
  const ae = String(acceptHeader || '').toLowerCase();
  if (!ae.trim()) return null;
  const q = {};
  for (const part of ae.split(',')) {
    const tok = part.trim();
    if (!tok) continue;
    const m = /^([a-z0-9*._-]+)\s*(?:;\s*q\s*=\s*([0-9]*\.?[0-9]*))?$/.exec(tok);
    if (!m) continue;
    let qv = m[2] === undefined || m[2] === '' ? 1 : Number(m[2]);
    if (!Number.isFinite(qv)) qv = 0;
    qv = Math.min(1, Math.max(0, qv));
    q[m[1]] = Math.max(q[m[1]] || 0, qv);
  }
  const allowed = (n) => (q[n] !== undefined ? q[n] : (q['*'] !== undefined ? q['*'] : 0));
  if (allowed('gzip') > 0) return 'gzip';
  if (allowed('br') > 0) return 'br';
  return null;
}

/**
 * پاسخِ JSON را با مذاکرهٔ فشرده‌سازی بفرست.
 * @param {object} res پاسخِ HTTP (writeHead/end) — یا شیءِ هارنسِ قدیمی
 * @param {object} req درخواست (برایِ Accept-Encoding)
 * @param {number} status
 * @param {object} obj بدنهٔ JSON
 * @param {function} sendJson مسیرِ نافشردهٔ ctx (fallback)
 * @returns {Promise<{encoding:string|null, rawBytes:number, wireBytes:number}>}
 *   برای متریک — encoding=null یعنی نافشرده فرستاده شد.
 *   S9-3: ناهمگام است (Promise) — فراخوان باید await کند.
 */
async function sendJsonCompressed(res, req, status, obj, sendJson) {
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
    /* S9-3 (باگ‌هانت نشست ۹): zlibِ ناهمگام به‌جای gzipSync/brotliCompressSync.
       نسخهٔ پیشین بدنهٔ دلتا را *سنکرون* فشرده می‌کرد: ۴٫۷ms به‌ازای هر
       مگابایت اندازه‌گیری شد، یعنی برای دلتای واقعیِ ~۳۰MB حدود ۱۵۰ms قفلِ
       کاملِ حلقهٔ رویداد در هر pull — با چند کاربرِ هم‌زمان، همهٔ درخواست‌ها
       پشتِ همان یک فشرده‌سازی صف می‌بستند. حالا کار روی threadpool می‌رود و
       حلقهٔ رویداد بین‌شان نفس می‌کشد؛ خروجی بیت‌به‌بیت یکسان است. */
    const out = enc === 'gzip'
      ? await gzipAsync(raw, { level: 6 })
      : await brotliAsync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
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

/* ═══════════════════════════════════════════════════════════════════
   server/static-cache.js — کشِ خواندنِ فایل‌های استاتیک (Wave 9)
   -------------------------------------------------------------------
   تا پیش از Wave 9، هر درخواستِ استاتیک fs.existsSync + fs.readFileSync
   داشت: index.html ‏(~۲MB) و USER_GUIDE.html ‏(~۲.۴MB) رویِ هر request
   به‌صورتِ سنکرون از دیسک خوانده می‌شدند — I/O سنکرون در مسیرِ درخواست.
   حالا: خواندنِ async (fs.promises — صفِ threadpool، بدونِ بستنِ event-loop)
   + کشِ درون‌حافظه با اعتبارسنجیِ mtime/size (بازخوانیِ خودکار پس از
   build) و سقفِ بایت (LRU — فایل‌های بزرگْ قدیمی‌ها را بیرون می‌اندازند).
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024; /* ۳۲MB — چهار فایلِ استاتیکِ فعلی ≈ ۵MB */

function createStaticCache(maxBytes){
  const cap = (Number(maxBytes) > 0) ? Number(maxBytes) : DEFAULT_MAX_BYTES;
  const cache = new Map(); /* file -> { mtimeMs, size, html, bytes } — ترتیبِ درج = LRU */
  let bytes = 0;

  /**
   * خواندنِ فایل با کش — mtime/size تغییر کرده باشد بازخوانی می‌شود.
   * @returns {Promise<string|null>} محتوا، یا null اگر فایل موجود نیست
   */
  async function read(file){
    let st = null;
    try{ st = await fs.promises.stat(file); }catch(e){ return null; }
    const hit = cache.get(file);
    if(hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size){
      /* تازگیِ LRU: بخوان = تازه‌ترین */
      cache.delete(file);
      cache.set(file, hit);
      return hit.html;
    }
    const html = await fs.promises.readFile(file, 'utf8');
    if(hit){ bytes -= hit.bytes; cache.delete(file); }
    const b = Buffer.byteLength(html, 'utf8');
    if(b <= cap){
      /* سقفِ بایت: قدیمی‌ترین‌ها را بیرون بگذار تا جا شود */
      while(cache.size && bytes + b > cap){
        const k = cache.keys().next().value;
        const it = cache.get(k);
        if(it){ bytes -= it.bytes; }
        cache.delete(k);
      }
      cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, html: html, bytes: b });
      bytes += b;
    }
    return html;
  }

  function stats(){ return { entries: cache.size, bytes: bytes, cap: cap }; }
  function clear(){ cache.clear(); bytes = 0; }

  return { read, stats, clear };
}

module.exports = { createStaticCache, DEFAULT_MAX_BYTES };

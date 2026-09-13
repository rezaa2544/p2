#!/usr/bin/env node
/**
 * پایش — اسکریپت ساخت (Build)
 * ماژول‌های src/ را دوباره در یک فایل HTML تک‌فایلی و کاملاً آفلاین ادغام می‌گند.
 *
 *   node build.js            → dist/payesh.html
 *   node build.js --check    → فقط بررسی می‌گند خروجی با index.html یکسان است
 *                              + هماهنگی مجوزها:
 *                              tools/generate-write-perms.js --check (R99:
 *                              جدولِ تولیدشدهٔ سرور با تک‌منبع یکسان باشد)
 *                              + tools/check-authz.js (اکشن‌ها ↔ WRITE_PERMS)
 */
const fs = require('fs');
const path = require('path');
/* Wave 24 (KPI-1): کوچک‌سازیِ محافظه‌کار — حذفِ کامنت/تورفتگی خارج از
   رشته/تمپلیت/regex؛ هیچ توکن و newlineِ کدی عوض نمی‌شود (ASI امن،
   assertهای ساختاریِ آزمون‌ها برقرار). جزئیات: tools/minify-source.js
   (require تنبل — فقط وقتی کش ناقص است بارگذاری می‌شود) */
let _minify = null;
const minify = () => (_minify || (_minify = require('./tools/minify-source.js')));

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const read = (p) => fs.readFileSync(p, 'utf8');

// ترتیب فایل‌های CSS — نباید تغییر کند (fonts باید اول باشد)
const CSS_ORDER = ['fonts.css', 'base.css', 'mobile.css'];

// ترتیب فایل‌های JS از روی _order.json خوانده می‌شود
const JS_ORDER = JSON.parse(read(path.join(SRC, 'js', '_order.json')));

/* ── Wave 24 (KPI-2): کشِ افزایشیِ strip ─────────────────────────────
   strip کلِ ~1.7MB سورس ≈ ۸۵ms است؛ با کش روی دیسک فقط فایل‌های
   تغییرکرده دوباره strip می‌شوند. قالبِ کش دوفایلی است تا JSON.parse/
   stringifyِ یک بلابِ بزرگ (۱۶ms+) حذف شود:
     .build-cache.meta.json  فهرست {rel,m,s,off,len} + version
     .build-cache.blob       الحاقِ خروجی‌های strip (برش با off/len)
   هر دو تولیدی و gitignore؛ خراب/غایب/ناسازگار = بازساختِ کامل
   (همیشه صحیح، فقط کندتر). env PAYESH_BUILD_NO_CACHE=1 → بدونِ کش. */
const CACHE_META = path.join(ROOT, '.build-cache.meta.json');
const CACHE_BLOB = path.join(ROOT, '.build-cache.blob');
const CACHE_VERSION = 3; /* عوض شود اگر منطقِ strip عوض شد */
const useCache = !process.env.PAYESH_BUILD_NO_CACHE;

function loadCache(){
  if (!useCache) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(CACHE_META, 'utf8'));
    if (!meta || meta.version !== CACHE_VERSION || !meta.entries) return null;
    const blob = fs.readFileSync(CACHE_BLOB, 'utf8');
    if (blob.length !== meta.blobLen) return null;
    return { entries: meta.entries, blob };
  } catch (e) { return null; }
}

function build() {
  const cache = loadCache();
  let cacheDirty = false;
  const newEntries = {};
  const newParts = []; /* خروجی‌های strip به‌ترتیب — blob جدید */
  let newOff = 0;
  const keep = (rel, m, s, out) => {
    newEntries[rel] = { m, s, off: newOff, len: out.length };
    newParts.push(out);
    newOff += out.length;
    return out;
  };
  /* strip با کش: کلید = مسیر نسبی، اعتبار = mtimeMs+size */
  const stripped = (rel, abs, which) => {
    let st = null;
    try { st = fs.statSync(abs); } catch (e) { /* read پایین‌تر خطا می‌دهد */ }
    const hit = cache && cache.entries[rel];
    if (st && hit && hit.m === st.mtimeMs && hit.s === st.size){
      return keep(rel, hit.m, hit.s, cache.blob.substr(hit.off, hit.len));
    }
    const fn = which === 'css' ? minify().stripCss : minify().stripJs;
    const out = fn(read(abs));
    cacheDirty = true;
    return st ? keep(rel, st.mtimeMs, st.size, out) : out;
  };

  const head = read(path.join(SRC, 'head.html'));
  const body = read(path.join(SRC, 'body.html'));

  const css = CSS_ORDER
    .map((f) => stripped('styles/' + f, path.join(SRC, 'styles', f), 'css'))
    .join('');

  const js = JS_ORDER
    .map((f) => stripped('js/' + f, path.join(SRC, 'js', f), 'js'))
    .join('\n');

  build._flushCache = () => {
    if (useCache && cacheDirty){
      try {
        fs.writeFileSync(CACHE_BLOB, newParts.join(''));
        fs.writeFileSync(CACHE_META, JSON.stringify({ version: CACHE_VERSION, blobLen: newOff, entries: newEntries }));
      } catch (e) { /* کش اختیاری است */ }
    }
  };

  /* CSP nonce (قرارداد امنیت سرور، بند ۵٫۶٫۲): بیلد جای‌نکهدار می‌کزارد
     و سرورِ واقعی آن را با مقدار تصادفیِ هر درخواست پر می‌گند — بدون
     'unsafe-inline'. در حالت فایلِ محلی (file://) سرآیندی نیست و
     جای‌نکهدار بی‌ضرر باقی می‌ماند. */
  const html =
    head + '\n' +
    '<style nonce="__PAYESH_NONCE__">\n' + css + '\n</style>\n' +
    '</head>\n' +
    body + '\n' +
    '<script nonce="__PAYESH_NONCE__">\n' + js + '\n</script>\n' +
    '</body>\n' +
    '</html>\n';

  return html;
}

function main() {
  const html = build();
  if (build._flushCache) build._flushCache(); /* Wave 24: کشِ strip ذخیره */
  const check = process.argv.includes('--check');

  if (check) {
    const original = read(path.join(ROOT, 'index.html'));
    const same = html === original;
    if (same) {
      console.log('✅ خروجی build با index.html بیت‌به‌بیت یکسان است.');
      syncGuide(html, true);
      /* هماهنگی مجوزها:
         ۱. (R99) جدولِ تولیدشدهٔ سرور با تک‌منبع یکسان باشد: مولد را
            اجرا کن و با authz/write-perms.json مقایسه + سازگاریِ
            ACTION_ROLES ↔ مدل (fail-closed).
         ۲. (فاز ۲ بند ۳) اکشن‌هایِ نویسندهٔ کلاینت ↔ WRITE_PERMS سرور.
            ناهماهنگی = عملیاتی که سرور رد می‌کند و صفِ همگام‌سازی را
            گیر می‌اندازد. */
      const { execFileSync } = require('child_process');
      try {
        execFileSync(process.execPath, [path.join(ROOT, 'tools/generate-write-perms.js'), '--check'], { stdio: 'inherit' });
        execFileSync(process.execPath, [path.join(ROOT, 'tools/check-authz.js')], { stdio: 'inherit' });
        process.exit(0);
      } catch (e) {
        process.exit(e.status || 1);
      }
    } else {
      console.error('❌ خروجی build با index.html تفاوت دارد.');
      console.error(`   طول اصلی: ${original.length} | طول ساخته‌شده: ${html.length}`);
      // اولین نقطه اختلاف
      let i = 0;
      while (i < Math.min(html.length, original.length) && html[i] === original[i]) i++;
      console.error(`   اولین اختلاف در کاراکتر ${i}:`);
      console.error(`   اصلی : ${JSON.stringify(original.slice(i, i + 80))}`);
      console.error(`   ساخته: ${JSON.stringify(html.slice(i, i + 80))}`);
      process.exit(1);
    }
  }

  fs.mkdirSync(DIST, { recursive: true });
  /* Wave 24 (KPI-2): نوشتنِ بی‌تغییر حذف — اگر محتوا همان است، ننویس
     (دو نوشتنِ ~۱.۶MB در هر build صرفه‌جویی می‌شود). مقایسه بافری است:
     خواندنِ باینری + Buffer.equals — بدونِ هزینهٔ decode UTF-8. */
  const htmlBuf = Buffer.from(html, 'utf8');
  const writeIfChanged = (fp) => {
    try {
      if (fs.statSync(fp).size === htmlBuf.length &&
          fs.readFileSync(fp).equals(htmlBuf)) return false;
    } catch (e) { /* غایب → بنویس */ }
    fs.writeFileSync(fp, htmlBuf);
    return true;
  };
  writeIfChanged(path.join(DIST, 'payesh.html'));
  // خروجی را به‌عنوان index.html ریشه هم به‌روز می‌کنیم (نسخه قابل توزیع)
  writeIfChanged(path.join(ROOT, 'index.html'));

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`✅ ساخته شد: dist/payesh.html  (${kb} KB)`);
  console.log(`   CSS: ${CSS_ORDER.length} فایل | JS: ${JS_ORDER.length} ماژول`);
  console.log('   تک‌فایلی، کاملاً آفلاین، بدون وابستگی خارجی.');

  /* اصل همگامی: راهنما و index.html همیشه با هم به‌روز می‌شوند.
     هر بارِ build، مُهرِ بیلد داخل USER_GUIDE.html تازه می‌شود.
     (محتوای راهنما — متن و عکس — هم باید در همان دور به‌روز شود؛
     این بند در docs/PLAY_STORE_CHECKLIST نیست؛ اصل: CONTRIBUTING.md) */
  syncGuide(html, false);
}

/* ═══ مُهرِ همگامیِ راهنما (USER_GUIDE.html) ══════════════════════ */
const GUIDE = path.join(ROOT, 'USER_GUIDE.html');
const buildHash = (h) => require('crypto').createHash('sha1').update(h).digest('hex').slice(0, 12);
const GUIDE_STAMP_RE = /<meta name="payesh-build" content="([0-9a-f]{12})"\s*\/?>/;

function syncGuide(html, check){
  if(!fs.existsSync(GUIDE)) return;
  /* Wave 24 (KPI-2): مُهر در <head> است — اول فقط ۸KB اول خوانده می‌شود؛
     خواندنِ کاملِ فایلِ ~2.4MB فقط وقتی لازم است که مُهر باید عوض شود. */
  let m = null;
  try {
    const fd = fs.openSync(GUIDE, 'r');
    const buf = Buffer.alloc(8192);
    const nread = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    m = buf.toString('utf8', 0, nread).match(GUIDE_STAMP_RE);
  } catch (e) { /* fallback به خواندنِ کامل در ادامه */ }
  if(m){
    const hash0 = buildHash(html);
    if(m[1] === hash0){
      if(check) console.log('✅ راهنما همگام با index.html است.');
      return; /* مُهر درست است — نه خواندنِ کامل لازم شد نه نوشتن */
    }
  }
  const g = read(GUIDE);
  if(!m) m = g.match(GUIDE_STAMP_RE);
  if(!m){
    if(check){
      console.error('❌ USER_GUIDE.html مُهرِ بیلد ندارد — این meta را به head اضافه کنید:');
      console.error('   <meta name="payesh-build" content="000000000000">');
      process.exit(1);
    }
    return;
  }
  const hash = buildHash(html);
  if(check){
    if(m[1] !== hash){
      console.error(`❌ راهنما (USER_GUIDE.html) همگام با index.html نیست (مُهر ${m[1]} ≠ ${hash}).`);
      console.error('   node build.js را بزنید (مُهر خودکار تازه می‌شود) و محتوای راهنما را هم به‌روز کنید.');
      process.exit(1);
    }
    console.log('✅ راهنما همگام با index.html است.');
    return;
  }
  if(m[1] !== hash){
    const tail = m[0].slice(m[0].lastIndexOf('"') + 1); /* شکلِ پایانیِ تگ (مثلِ " />") حفظ شود */
    fs.writeFileSync(GUIDE, g.replace(m[0], '<meta name="payesh-build" content="' + hash + '"' + tail), 'utf8');
    console.log('   مُهرِ راهنما تازه شد: ' + hash);
  }
}

main();

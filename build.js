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

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const read = (p) => fs.readFileSync(p, 'utf8');

// ترتیب فایل‌های CSS — نباید تغییر کند (fonts باید اول باشد)
const CSS_ORDER = ['fonts.css', 'base.css', 'mobile.css'];

// ترتیب فایل‌های JS از روی _order.json خوانده می‌شود
const JS_ORDER = JSON.parse(read(path.join(SRC, 'js', '_order.json')));

function build() {
  const head = read(path.join(SRC, 'head.html'));
  const body = read(path.join(SRC, 'body.html'));

  const css = CSS_ORDER
    .map((f) => read(path.join(SRC, 'styles', f)))
    .join('');

  const js = JS_ORDER
    .map((f) => read(path.join(SRC, 'js', f)))
    .join('\n');

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
  const out = path.join(DIST, 'payesh.html');
  fs.writeFileSync(out, html, 'utf8');

  // خروجی را به‌عنوان index.html ریشه هم به‌روز می‌کنیم (نسخه قابل توزیع)
  fs.writeFileSync(path.join(ROOT, 'index.html'), html, 'utf8');

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
  const g = read(GUIDE);
  const m = g.match(GUIDE_STAMP_RE);
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

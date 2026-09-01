#!/usr/bin/env node
/**
 * پایش — اسکریپت ساخت (Build)
 * ماژول‌های src/ را دوباره در یک فایل HTML تک‌فایلی و کاملاً آفلاین ادغام می‌کند.
 *
 *   node build.js            → dist/payesh.html
 *   node build.js --check    → فقط بررسی می‌کند خروجی با index.html یکسان است
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

  const html =
    head + '\n' +
    '<style>\n' + css + '\n</style>\n' +
    '</head>\n' +
    body + '\n' +
    '<script>\n' + js + '\n</script>\n' +
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
      process.exit(0);
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
}

main();

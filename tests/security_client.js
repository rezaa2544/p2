#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور ۷۳ — پایش امنیتیِ کلاینت (C1: loginErr — innerHTML روی
   رشتهٔ سرور) — اجرای واقعیِ jsdom
     K1  پیامِ معمول: باگِ قرمز ساخته می‌شود (textContent، بدون markup)
     K2  payloadِ شیطانی: عنصرِ img ساخته نمی‌شود / onerror نمی‌افتد
         (موتانتِ innerHTML این تست را می‌کُشد)
   اجرا: node tests/security_client.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}

function boot() {
  const dom = new JSDOM('<!doctype html><html><body><div id="lerr"></div><div id="ldemo" style="display:none"></div></body></html>', {
    url: 'http://localhost/', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.db = { users: [] };
  w.toast = function () {};
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/js/06-login.js'), 'utf8');
  w.eval(src);
  return { dom, w };
}

function main() {
  console.log('\n▸ دور ۷۳ — امنیتِ کلاینت (loginErr)');
  const { w } = boot();
  const lerr = () => w.document.getElementById('lerr');

  /* K1: پیامِ معمول */
  w.eval("loginErr('کد اشتباه است یا منقضی شده')");
  chk('K1 پیامِ معمول: باگِ قرمز با متنِ کامل', lerr().textContent.indexOf('کد اشتباه است') > -1, lerr().textContent);
  chk('K1-B بدونِ عنصرِ غیرمنتظره (فقط یک div)', lerr().children.length === 1 && lerr().firstElementChild.tagName === 'DIV', lerr().innerHTML);

  /* K2: payload شیطانی (موتانتِ innerHTML را می‌کُشد) */
  const payload = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2<\/script>';
  w.eval('loginErr(' + JSON.stringify(payload) + ')');
  chk('K2 img ساخته نشد', lerr().querySelector('img') === null, lerr().innerHTML);
  chk('K2-B کدِ جاوااسکریپت اجرا نشد', w.__pwned === undefined, String(w.__pwned));
  chk('K2-C payload به‌عنوانِ متنِ ساده باقی ماند', lerr().textContent.indexOf('<img') > -1, lerr().textContent);

  console.log('\nsecurity_client: ' + pass + ' ✅ / ' + fail + ' ❌');
  if (fail) { errors.forEach((e) => console.log('  — ' + e)); process.exit(1); }
}

main();

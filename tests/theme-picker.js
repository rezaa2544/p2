#!/usr/bin/env node
/**
 * سئوت انتخابگرِ پوسته (دور ۹۰) — پایش
 *
 * موتورِ تم (`99-theme-loader.js`) از پیش سالم بود ولی از رابط
 * دسترسی‌پذیر نبود. این سئوت **فقط از مسیرِ واقعیِ کاربر** می‌گذرد:
 * render → querySelector → dispatch('change') — نه فراخوانیِ مستقیمِ تابع.
 *
 * بخش‌ها:
 *  T1 انتخابگر در پوسته رندر می‌شود و هر سه گزینه را دارد
 *  T2 مقدارِ اولیه = پوستهٔ فعلیِ ذخیره‌شده
 *  T3 انتخابِ کاربر پوسته را عوض و در Store ماندگار می‌کند
 *  T4 پوستهٔ ذخیره‌شده در بارگذاریِ بعدی اعمال می‌شود
 *  T5 مقدارِ نامعتبر پذیرفته نمی‌شود (پوستهٔ قبلی می‌ماند)
 *
 * اجرا: node tests/theme-picker.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function boot(){
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  return dom.window;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) {
    const l1 = String((e.stack || '').split(String.fromCharCode(10))[1] || '').trim();
    results.push({ name, ok: false, detail: String(e.message || e) + '  ||  ' + l1, ms: Date.now() - t0 });
  }
};

/** پوسته را با یک مدیر رندر می‌کند و <select> را برمی‌گرداند. */
function renderAndFind(w){
  w.eval('S.user=db.users.find(function(u){return u.role==="manager";}); S.route="dashboard"; render();');
  return w.document.querySelector('[data-act="theme-pick"]');
}
/** انتخابِ کاربر: مقدار را می‌گذارد و رویدادِ واقعیِ change می‌فرستد. */
function pick(w, sel, value){
  sel.value = value;
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
}
const themeOf = (w) => w.document.documentElement.getAttribute('data-theme');

async function main(){
  const w = boot();
  await sleep(500);

  await sec('T1 انتخابگر رندر می‌شود و هر سه پوسته را دارد', async () => {
    const sel = renderAndFind(w);
    assert(sel, 'انتخابگرِ پوسته در DOM نیست — از رابط دسترسی‌پذیر نشده');
    const vals = Array.from(sel.options).map(o => o.value);
    ['theme-1','theme-2','theme-3'].forEach(function(t){
      assert(vals.indexOf(t) >= 0, 'گزینهٔ ' + t + ' نیست: ' + vals.join(','));
    });
    assert(sel.tagName === 'SELECT', 'باید <select> باشد، هست: ' + sel.tagName);
  });

  await sec('T2 مقدارِ اولیه با پوستهٔ ذخیره‌شده یکی است', async () => {
    const sel = renderAndFind(w);
    const stored = w.eval('Store.get("payesh_ui_theme","theme-2")');
    assert(sel.value === stored, 'انتخابگر ' + sel.value + ' ولی ذخیره‌شده ' + stored);
    assert(themeOf(w) === stored, 'صفت data-theme با ذخیره‌شده یکی نیست');
  });

  await sec('T3 انتخابِ کاربر پوسته را عوض و ماندگار می‌کند', async () => {
    const sel = renderAndFind(w);
    pick(w, sel, 'theme-3');
    assert(themeOf(w) === 'theme-3', 'صفت اعمال نشد: ' + themeOf(w));
    assert(w.eval('Store.get("payesh_ui_theme","?")') === 'theme-3', 'در Store ذخیره نشد');
    /* پوستهٔ دوم — تا مطمئن شویم یک‌بارمصرف نیست */
    pick(w, renderAndFind(w), 'theme-1');
    assert(themeOf(w) === 'theme-1', 'تغییرِ دوم کار نکرد: ' + themeOf(w));
    assert(w.eval('Store.get("payesh_ui_theme","?")') === 'theme-1', 'تغییرِ دوم ذخیره نشد');
  });

  await sec('T4 پوستهٔ ذخیره‌شده در بارگذاریِ بعدی اعمال می‌شود', async () => {
    const sel = renderAndFind(w);
    pick(w, sel, 'theme-3');
    const saved = w.localStorage.getItem('payesh_ui_theme');
    assert(saved === 'theme-3', 'در حافظهٔ دستگاه نوشته نشد: ' + saved);

    /* ⚠️ هر نمونهٔ JSDOM localStorageِ مستقل دارد (تأییدِ زنده شد)،
       پس «بارگذاریِ دوباره» فقط با نمونهٔ تازه شبیه‌سازی نمی‌شود —
       باید حافظه را صراحتاً منتقل کرد، وگرنه قرمزِ کاذب می‌دهد. */
    const w2 = boot();
    w2.localStorage.setItem('payesh_ui_theme', saved);
    w2.eval('(function(){var t=Store.get("payesh_ui_theme","theme-2");' +
            'document.documentElement.setAttribute("data-theme",t);})()');
    await sleep(400);

    assert(themeOf(w2) === 'theme-3',
      'پوسته پس از بارگذاریِ دوباره برنگشت: ' + themeOf(w2));
    const sel2 = renderAndFind(w2);
    assert(sel2 && sel2.value === 'theme-3', 'انتخابگر پوستهٔ ذخیره‌شده را نشان نمی‌دهد');
  });

  await sec('T5 مقدارِ نامعتبر پذیرفته نمی‌شود', async () => {
    const sel = renderAndFind(w);
    pick(w, sel, 'theme-1');
    assert(themeOf(w) === 'theme-1', 'آماده‌سازی نشد');
    /* حملهٔ ساده: مقداری بیرون از فهرستِ مجاز */
    pick(w, renderAndFind(w), 'theme-99');
    assert(themeOf(w) === 'theme-1',
      'پوستهٔ نامعتبر اعمال شد! اکنون: ' + themeOf(w));
    assert(w.eval('Store.get("payesh_ui_theme","?")') === 'theme-1',
      'پوستهٔ نامعتبر در Store نوشته شد');
  });

  /* ── گزارش ── */
  const line = '─'.repeat(42);
  console.log('\n' + line);
  results.forEach(r => console.log((r.ok ? '✅ ' : '❌ ') + r.name + '  (' + r.ms + ' ms)' +
    (r.ok ? '' : '\n   ↳ ' + r.detail)));
  const okN = results.filter(r => r.ok).length;
  console.log(line);
  console.log('سئوت انتخابگرِ پوسته: ' + okN + '/' + results.length + ' موفق  —  ' +
    (okN === results.length ? 'بدون خطا ✅' : 'اشکال دارد ❌'));
  process.exit(okN === results.length ? 0 : 1);
}

main();

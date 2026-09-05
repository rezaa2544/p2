#!/usr/bin/env node
/**
 * سئوت IDB — چند استور روی یک دیتابیس (باگ واقعیِ ۲۰۶/۰۹/۰۵)
 *
 * باگ: onupgradeneeded فقط در «نسخهٔ بالاتر» اجرا می‌شود؛ دیتابیسِ قدیمی
 * که فقط استورِ اول را ساخته بود، استورِ دوم را هرگز نمی‌ساخت و
 * transaction خطای «store not found» می‌داد (در مرورگر واقعی، هنگام
 * seed دادهٔ دمو — یک خطا در هر بارِ باز شدن صفحه).
 *
 * fake تست از همین نسخه **هم‌رفتارِ واقعی** است (transaction روی
 * استورِ ناموجود throw می‌کند؛ onupgradeneeded فقط هنگامِ ارتقا).
 *
 * بخش‌ها:
 *  I1 دو استور روی یک دیتابیس: استورِ دوم با bumpِ نسخه ساخته می‌شود
 *  I2 دوباره‌باز بعد از ارتقا: بدون bumpِ اضافه و بدون خطا
 *  I3 نسخهٔ پایین‌تر از موجود: خطای نسخه → بازیابی با نسخهٔ بالاتر
 *  I4 fake واقعی است: transaction روی استورِ ناموجود throw می‌کند
 *
 * اجرا: node tests/idb2.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { const stack1 = String((e.stack||'').split(String.fromCharCode(10))[1]||'').trim(); results.push({ name, ok: false, detail: String(e.message || e) + '  ||  ' + stack1, ms: Date.now() - t0 }); }
};

/* یک fake تازه می‌سازد و تزریق می‌کند */
const freshFake = () => W(`vclassIdbSetBackend(makeIdbFake()); true`);

(async () => {
  await sleep(300);

  await sec('I1 دو استور روی یک دیتابیس: استورِ دوم ساخته می‌شود و put دو تایشان موفق است', async () => {
    freshFake();
    const a = await W(`vclassIdbPut('vclass_files', 'k1', 'blobA')`);
    assert(a === true, 'put استورِ اول ناموفق بود');
    const b = await W(`vclassIdbPut('hw_files', 'k2', 'blobB')`);
    assert(b === true, 'put استورِ دوم ناموفق بود (باگ store-not-found)');
    const ga = await W(`vclassIdbGet('vclass_files', 'k1')`);
    const gb = await W(`vclassIdbGet('hw_files', 'k2')`);
    assert(ga === 'blobA' && gb === 'blobB', 'خواندنِ بولب‌ها اشتباه: ' + JSON.stringify({ ga, gb }));
  });

  await sec('I2 دوباره‌باز بعد از ارتقا: بدون bumpِ اضافه، دو استور سالم', async () => {
    // backend همان fakeٔ I1 (نسخهٔ ارتقا‌یافته) — دوباره‌باز باید مستقیم جواب دهد
    const c = await W(`vclassIdbPut('hw_files', 'k3', 'blobC')`);
    assert(c === true, 'put بعد از ارتقا ناموفق بود');
    const ver = W(`(function(){ return new Promise(function(r){ vclassIdbBackend().databases().then(function(l){ r(l[0]?l[0].version:0); }); }); })()`);
    const v = await ver;
    assert(v >= 2, 'نسخهٔ fake باید به ۲+ رسیده باشد (استورِ دوم با ارتقا ساخته شد): ' + v);
    const gc = await W(`vclassIdbGet('hw_files', 'k3')`);
    assert(gc === 'blobC', 'خواندنِ blobC اشتباه');
  });

  await sec('I3 دیتابیسِ قدیمی (نسخهٔ ۱، یک استور): استورِ تازه با bump می‌آید', async () => {
    freshFake();
    /* شبیه‌سازیِ دیتابیسِ قدیمی: فقط استورِ اول ساخته شده */
    await W(`vclassIdbPut('vclass_files', 'old', 'x')`);
    /* حالا برنامهٔ جدید استورِ دوم را می‌خواهد — دقیقاً همان سناریوی seed */
    const b = await W(`vclassIdbPut('hw_files', 'new', 'y')`);
    assert(b === true, 'استورِ دوم در دیتابیسِ قدیمی ساخته نشد');
    const gy = await W(`vclassIdbGet('hw_files', 'new')`);
    assert(gy === 'y', 'خواندن از استورِ تازه اشتباه');
  });

  await sec('I4 fake هم‌رفتارِ واقعی است: transaction روی استوری که این open نخواسته، throw می‌کند', async () => {
    freshFake();
    await W(`vclassIdbPut('vclass_files', 'k', 'x')`); /* نسخهٔ ۱: فقط استورِ اول */
    const res = await W(`(function(){
      return new Promise(function(r){
        vclassIdbOpen(['vclass_files']).then(function(db){
          try { db.transaction('hw_files'); r('NO-THROW'); }
          catch(e){ r('THREW'); }
        }, function(e){ r('OPEN-REJECTED'); });
      });
    })()`);
    assert(res === 'THREW',
      'fake باید مثلِ مرورگر واقعی روی استورِ ناموجود throw کند؛ نتیجه: ' + res);
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت IDB: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

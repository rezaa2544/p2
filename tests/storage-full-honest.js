/* ─────────────────────────────────────────────────────────────
   storage-full-honest.js — W7-4 (باگ‌هانت چت ۵، نشست ۲، موج ۷)
   ─────────────────────────────────────────────────────────────
   وقتی نوشتنِ لاگ در Store (localStorage) شکست می‌خورد ولی IndexedDB در
   دسترس بود، saveLog هشدارِ «حافظه پر است» را سرکوب می‌کرد — با این فرض که
   آینهٔ IDB تورِ نجات است. اما آینهٔ IDB فقط-نوشتنی است (هیچ مسیرِ بازگشتی
   در بوت ندارد — getMetadata/getAllEntities هیچ صدازننده‌ای ندارند) و حتی
   موفقیتِ همان نوشتن هم بررسی نمی‌شد: ویرایش‌هایِ کاربر فقط در RAM می‌ماند
   و با بستنِ تب بی‌صدا از دست می‌رفت. حالا شکستِ Store همیشه بلند است.
   ───────────────────────────────────────────────────────────── */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jres = (obj, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => obj, headers: { get: () => null } });

(async () => {
  console.log('\n▸ W7-4 — شکستِ Store همیشه بلند است (حتی با IDB) (jsdom)');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = function (url) {
        const p = String(url).split('?')[0];
        if (p === '/api/health') return Promise.resolve(jres({ ok: true }));
        if (p === '/api/auth/me') return Promise.resolve(jres({ ok: false, code: 'no_session' }, 401));
        return Promise.resolve(jres({}, 404));
      };
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);
  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' };`);

  /* شنودِ toast + کلیدِ قطع/وصلِ Store */
  W(`window.__toasts = []; window.__storeFail = false;
     window.__toastReal = toast;
     toast = function(msg, kind){ window.__toasts.push(String(msg||'')); };
     window.__storeSetReal = Store.set;
     Store.set = function(k, v){ if(window.__storeFail) return false; return window.__storeSetReal(k, v); }; 0;`);
  const reset = () => W(`window.__toasts = []; STORAGE_FULL = false; STORAGE_WARNED = true; 0;`);
  /* STORAGE_WARNED=true تا هشدارِ ۸۰٪ در مسیرِ موفق نویز نکند */

  /* ── ۱) پینِ رفتارِ موجود: بیِ IDB، شکست بلند است ── */
  reset();
  W(`window.__storeFail = true; saveLog(); window.__storeFail = false; 0;`);
  chk('F1 بیِ IDB: STORAGE_FULL بالا رفت', W(`storageFull()`) === true);
  chk('F2 بیِ IDB: toastِ «حافظه پر» آمد', W(`window.__toasts.join(' ').indexOf('حافظهٔ دستگاه پر است') > -1`),
    JSON.stringify(W(`window.__toasts`)));

  /* ── ۲) با IDB: شکستِ Store هنوز بلند است (رفعِ W7-4) ── */
  reset();
  W(`offlineStorage.setBackend(makeOfflineIdbFake()); 0;`);
  chk('F3 پیش‌شرط: بک‌اندِ IDB فعال است', W(`offlineStorage.isSupported()`) === true);
  W(`window.__storeFail = true; saveLog(); window.__storeFail = false; 0;`);
  chk('F4 با IDB: STORAGE_FULL بالا رفت (سرکوب نشد)', W(`storageFull()`) === true);
  chk('F5 با IDB: toastِ «حافظه پر» آمد', W(`window.__toasts.join(' ').indexOf('حافظهٔ دستگاه پر است') > -1`),
    JSON.stringify(W(`window.__toasts`)));

  /* ── ۳) شاهد: مسیرِ موفق ساکت است ── */
  reset();
  W(`saveLog(); 0;`);
  chk('F6 موفق: STORAGE_FULL پایین ماند', W(`storageFull()`) === false);
  chk('F7 موفق: toast نیامد', W(`window.__toasts.length`) === 0);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });

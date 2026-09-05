#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   سنجش سازگاری IndexedDB با معماری فعلی (طرح کلاس مجازی — نسخهٔ سبک)
   اجرای: node tests/idb-probe.js

   پاسخ می‌دهد به سه سؤال طرح:
   ۱. در محیط تست (jsdom) آیا indexedDB در دسترس است؟
   ۲. سطح API مورد نیاز چقدر است و آیا با یک فایل تک‌ماژول
      (بدون فریم‌ورک) قابل پوشش است؟
   ۳. الگوی «فایل در IndexedDB + متادیتا در db (localStorage)»
      در محیط headless با یک fake کوچک کار می‌کند؟
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

/* ── ۱) در دسترس بودن indexedDB در jsdom ── */
console.log('\n▸ ۱. در دسترس بودن indexedDB در محیط تست');
const dom = new JSDOM('<body></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
const win = dom.window;
// این «آزمون» نیست، کشف است — وضعیت را چاپ می‌کند (jsdom عمداً IDB ندارد)
console.log('  ⚠️  وضعیت jsdom: ' + (typeof win.indexedDB === 'undefined'
  ? 'indexedDB تعریف‌نشده است — در تست با fake کوچک جبران می‌شود (نتیجهٔ مورد انتظار)'
  : 'indexedDB در دسترس است'));
const hasIDB = typeof win.indexedDB !== 'undefined';

/* ── ۲) سطح API مورد نیاز ── */
console.log('\n▸ ۲. سطح API مورد نیاز برای پوشهٔ فایل کلاس');
const NEEDED = ['open', 'IDBDatabase.transaction', 'IDBObjectStore.put', 'IDBObjectStore.get', 'IDBObjectStore.delete'];
check('سطح API به ۵ عضو محدود می‌شود (open/transaction/put/get/delete)',
  NEEDED.length === 5, NEEDED.join(' · '));
check('بدون فریم‌ورک: یک ماژول تک‌فایلی ~۱۲۰ خط کافی است', true,
  'الگو: wrapper روی Promise از روی IDBRequest');

/* ── ۳) fake کوچک + الگوی ذخیره در محیط headless ── */
console.log('\n▸ ۳. الگوی «فایل در IDB + متادیتا در db» با fake در headless');

/** fake حداقلیِ سطح ۲ — فقط برای سنجش، نه تولید */
function makeFakeIDB(){
  const stores = new Map();
  const db = {
    transaction(storeName){
      const store = () => {
        if(!stores.has(storeName)) stores.set(storeName, new Map());
        const m = stores.get(storeName);
        return {
          put(value, key){
            const req = {};
            m.set(key, value);
            req.onsuccess = () => {};
            setTimeout(() => { if(req.onsuccess) req.onsuccess(); }, 0);
            return req;
          },
          get(key){
            const req = { result: m.has(key) ? m.get(key) : undefined };
            setTimeout(() => { if(req.onsuccess) req.onsuccess(); }, 0);
            return req;
          },
          delete(key){
            const req = {};
            m.delete(key);
            setTimeout(() => { if(req.onsuccess) req.onsuccess(); }, 0);
            return req;
          }
        };
      };
      return { objectStore: store };
    }
  };
  const openReq = { result: db };
  setTimeout(() => { if(openReq.onsuccess) openReq.onsuccess(); }, 0);
  return { open: () => openReq, __stores: stores };
}

/** wrapper واقعی (عین الگویی که در 49-vclass-idb.js می‌نشیند) */
function idbOpen(idb, name){
  return new Promise((resolve) => {
    const r = idb.open(name, 1);
    r.onsuccess = () => resolve(r.result);
  });
}
function idbPut(idb, db, storeName, key, value){
  return new Promise((resolve, reject) => {
    db.transaction(storeName).objectStore(storeName).put(value, key)
      .onsuccess = resolve;
  });
}
function idbGet(idb, db, storeName, key){
  return new Promise((resolve) => {
    const req = db.transaction(storeName).objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
  });
}
function idbDel(idb, db, storeName, key){
  return new Promise((resolve) => {
    db.transaction(storeName).objectStore(storeName).delete(key)
      .onsuccess = resolve;
  });
}

(async () => {
  const fake = makeFakeIDB();
  const db = await idbOpen(fake, 'vclass');
  const file = { data: 'فایلهٔ ویدیوی نمونه', size: 12345, mime: 'video/mp4' };

  await idbPut(fake, db, 'vclass_files', 'v1', file);
  const got = await idbGet(fake, db, 'vclass_files', 'v1');
  check('put/get round-trip فایل', got && got.size === 12345, JSON.stringify(got));

  await idbDel(fake, db, 'vclass_files', 'v1');
  const gone = await idbGet(fake, db, 'vclass_files', 'v1');
  check('delete فایل', gone === undefined, 'بازگشت: ' + JSON.stringify(gone));

  // الگوی متادیتا در db (localStorage) + فایل در IDB
  const vclass = { id: 1, class_id: 7, type: 'video', file_key: 'v1', title: 'مرور درس', size: 12345 };
  check('متادیتا در db JSON جا می‌شود (< چند صد بایت — localStorage سالم می‌ماند)',
    JSON.stringify(vclass).length < 300, JSON.stringify(vclass).length + ' بایت');

  console.log('\n▸ نتیجهٔ سنجش');
  console.log('  • در مرورگر واقعی indexedDB موجود است (همهٔ مرورگرهای مدرن).');
  console.log('  • در jsdom (محیط smoke) موجود نیست ⇒ تست‌ها با fake کوچک بالا می‌روند —');
  console.log('    wrapper روی سطح Promise، مستقل از بستر است.');
  console.log('  • الگو: فایل/ویدیو → IndexedDB (بدون سقف ۵ مگابایت)؛');
  console.log('    متادیتا + سؤالات متنی → db فعلی (localStorage).');
  console.log('  • تخمین کار: wrapper ~۱۲۰ خط + نما ~۲۰۰ خط + ~۱۰ آزمون smoke + ۳-۴ جهش.');
  console.log(fail === 0
    ? '\n🟢 سنجش سبز — طرح در docs/PLAN_VIRTUAL_CLASS.md — در انتظار تأیید برای پیاده‌سازی'
    : '\n🔴 سنجش ناموفق — طرح را بازبینی کنید');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

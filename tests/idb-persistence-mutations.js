#!/usr/bin/env node
/**
 * تست‌های جهش (Mutation Testing) پایداری و تاب‌آوری ذخیره‌سازی آفلاین IndexedDB
 *
 * سنجش تاب‌آوری در برابر ۳ جهش بحرانی:
 *  جهش ۱ (M1): قطع ناگهانی یا پرتاب خطا در تراکنش IndexedDB و ادامه کار برنامه بدون شکست
 *  جهش ۲ (M2): سقط تراکنش (Transaction Abort / Lock) و توانایی بازیابی و دسترسی مجدد
 *  جهش ۳ (M3): ورودی‌های ناقص یا مخدوش در صف همگام‌سازی و متادیتا بدون تخریب داده‌های سالم
 *
 * اجرا: node tests/idb-persistence-mutations.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.log('⏭️  jsdom نصب نیست — سئوت رد شد.');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {})
});

const win = dom.window;
const W = (expr) => win.eval(expr);
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || 'شرط جهش برقرار نیست');
};

let pass = 0, fail = 0;

async function testMutation(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}

(async () => {
  console.log('\n▸ تست‌های جهش پایداری IndexedDB (Mutations)');

  // مقداردهی بک‌اند استاندارد
  W('offlineStorage.setBackend(makeOfflineIdbFake());');
  await W('offlineStorage.init()');

  // ─────────────────────────────────────────────────────────────
  // جهش ۱: پرتاب خطا و قطع درایور IndexedDB در حین نوشتن
  // ─────────────────────────────────────────────────────────────
  await testMutation('جهش ۱: پرتاب خطای تراکنش باعث کرش برنامه نشده و پرامیس با خطا رد می‌شود', async () => {
    const result = await W(`
      (function(){
        var customStorage = new OfflineStorage('mut_db_1', 1);
        customStorage.setBackend({
          open: function() {
            var req = { onsuccess: null, onerror: null };
            setTimeout(function() {
              var fakeDb = {
                objectStoreNames: { contains: function() { return true; } },
                transaction: function() {
                  throw new Error('Disk IO Failure simulated');
                }
              };
              req.result = fakeDb;
              if (req.onsuccess) req.onsuccess({ target: req });
            }, 0);
            return req;
          }
        });

        return customStorage.putEntity('grades', { id: 1, score: 18 })
          .then(function() { return { ok: false }; })
          .catch(function(err) {
            return { ok: true, msg: err.message };
          });
      })()
    `);

    assert(result && result.ok === true, 'پرتاب خطا در تراکنش مدیریت نشد و پرامیس رد نشد');
    assert(result.msg && result.msg.includes('Disk IO Failure'), 'پیام خطای شبیه‌سازی‌شده دریافت نشد');
  });

  // ─────────────────────────────────────────────────────────────
  // جهش ۲: سقط تراکنش (Abort) و بازیابی اتصال در عملیات بعدی
  // ─────────────────────────────────────────────────────────────
  await testMutation('جهش ۲: سقط تراکنش IndexedDB و امکان تلاش مجدد بدون قفل دائمی', async () => {
    const result = await W(`
      (function(){
        var customStorage = new OfflineStorage('mut_db_2', 1);
        var fake = makeOfflineIdbFake();
        customStorage.setBackend(fake);

        return customStorage.init().then(function() {
          // درج اول موفق
          return customStorage.putEntity('teachers', { id: 1, name: 'احمدی' });
        }).then(function() {
          // بستن دیتابیس برای شبیه‌سازی قطع ناگهانی یا ابورت
          customStorage.db = null;
          // عملیات بعدی باید خودکار دیتابیس را باز کرده و با موفقیت درج کند
          return customStorage.putEntity('teachers', { id: 2, name: 'بهرامی' });
        }).then(function() {
          return customStorage.getCollection('teachers');
        }).then(function(list) {
          return { ok: true, count: list.length };
        }).catch(function(err) {
          return { ok: false, err: err.message };
        });
      })()
    `);

    assert(result && result.ok === true, 'بازیابی پس از قطع اتصال با شکست مواجه شد');
    assert(result.count === 2, 'تعداد رکوردهای بازیابی‌شده اشتباه است: ' + (result ? result.count : ''));
  });

  // ─────────────────────────────────────────────────────────────
  // جهش ۳: ورودی‌های مخدوش در صف همگام‌سازی و متادیتا
  // ─────────────────────────────────────────────────────────────
  await testMutation('جهش ۳: ورودی‌های ناقص و نامعتبر بدون اختلال در داده‌های موجود ثبت یا رد می‌شوند', async () => {
    const result = await W(`
      (function(){
        var customStorage = new OfflineStorage('mut_db_3', 1);
        customStorage.setBackend(makeOfflineIdbFake());

        return customStorage.init().then(function() {
          // درج آیتم سالم
          return customStorage.addToQueue({ uid: 'valid-1', op: { t: 'ins', c: 'users' }, status: 'pending' });
        }).then(function() {
          // تلاش برای درج بدون id در entities (باید با خطا رد شود)
          return customStorage.putEntity('users', { name: 'بدون شناسه' })
            .then(function() { return false; })
            .catch(function() { return true; }); // انتظار رد شدن
        }).then(function(rejectedOk) {
          if (!rejectedOk) throw new Error('رکورد بدون id نباید ذخیره می‌شد');
          // متادیتای با کلید خالی یا مقادیر متنوع (آرایه خالی، عدد صفر، شیء تودرتو)
          return Promise.all([
            customStorage.setMetadata('zero_val', 0),
            customStorage.setMetadata('empty_arr', []),
            customStorage.setMetadata('nested', { a: { b: 123 } })
          ]);
        }).then(function() {
          return Promise.all([
            customStorage.getMetadata('zero_val'),
            customStorage.getMetadata('empty_arr'),
            customStorage.getMetadata('nested'),
            customStorage.getQueue()
          ]);
        }).then(function(res) {
          return {
            ok: true,
            zero: res[0],
            arr: res[1],
            nested: res[2],
            queueLen: res[3].length
          };
        }).catch(function(err) {
          return { ok: false, err: err.message };
        });
      })()
    `);

    assert(result && result.ok === true, 'تست جهش ورودی‌های مخدوش با خطا روبرو شد: ' + (result ? result.err : ''));
    assert(result.zero === 0, 'مقدار عددی صفر مخدوش شده است');
    assert(Array.isArray(result.arr) && result.arr.length === 0, 'آرایه خالی مخدوش شده است');
    assert(result.nested && result.nested.a.b === 123, 'شیء تودرتو مخدوش شده است');
    assert(result.queueLen === 1, 'طول صف همگام‌سازی مخدوش شده است');
  });

  console.log('\n' + '─'.repeat(52));
  console.log(`نتیجه تست‌های جهش: ${pass}/${pass + fail} تست موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('─'.repeat(52) + '\n');

  process.exit(fail ? 1 : 0);
})();

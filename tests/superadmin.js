#!/usr/bin/env node
/**
 * سئوت اصل «سوپرادمین بدون محدودیت» (تصمیمِ کاربر ۲۰۶/۰۹/۵) — پایش
 *
 * باگِ محرک: export-csv در جدولِ مجوزها فقط ['manager'] بود و سوپرادمین
 * روی صفحهٔ کاربران «اجازهٔ انجامِ این عملیات را ندارید» می‌گرفت.
 * اصل: سوپرادمین هیچ محدودیتی ندارد — هیچ جدولِ مجوزی (مسیر یا اکشن،
 * فعلی یا آینده) نباید او را نگه دارد.
 *
 * بخش‌ها:
 *  S1 هر اکشنِ جدولِ مجوزها برای سوپرادمین آزاد است
 *  S2 هر مسیرِ همهٔ نقش‌ها برای سوپرادمین آزاد است
 *  S3 کلیکِ واقعی روی دکمهٔ «خروجی» صفحهٔ کاربران: بدونِ ردِ مجوز
 *
 * اجرا: node tests/superadmin.js
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

(async () => {
  await sleep(300);

  await sec('S1 هر اکشنِ جدولِ مجوزها برای سوپرادمین آزاد است', async () => {
    const bad = W(`(function(){
      var out = [];
      Object.keys(ACTION_ROLES).forEach(function(a){
        if(!canAction(a, 'superadmin')) out.push(a);
      });
      return out;
    })()`);
    assert(bad.length === 0, 'این اکشن‌ها سوپرادمین را نگه می‌دارند: ' + JSON.stringify(bad));
  });

  await sec('S2 هر مسیرِ همهٔ نقش‌ها برای سوپرادمین آزاد است', async () => {
    const bad = W(`(function(){
      var out = [], seen = Object.create(null);
      Object.keys(NAV).forEach(function(role){
        (NAV[role] || []).forEach(function(g){
          (g[1] || []).forEach(function(it){
            if(seen[it[0]]) return;
            seen[it[0]] = true;
            if(!canRoute(it[0], 'superadmin')) out.push(it[0]);
          });
        });
      });
      (COMMON_ROUTES || []).forEach(function(r){ if(!seen[r]){ seen[r]=true; if(!canRoute(r,'superadmin')) out.push(r); } });
      return out;
    })()`);
    assert(bad.length === 0, 'این مسیرها برای سوپرادمین بسته‌اند: ' + JSON.stringify(bad));
  });

  await sec('S3 کلیکِ واقعی روی «خروجی» صفحهٔ کاربران: بدونِ ردِ مجوز', async () => {
    W(`(function(){
      (function(){var u=db.users.find(x=>x.username==='superadmin');
        document.getElementById('lpn').value=u.phone;
        document.getElementById('lnid').value=u.national_id;
        document.getElementById('lcode').value=SmsPanel.sendCode(u.phone);})();
      document.querySelector('[data-act="login"]').click();
    })()`);
    await sleep(400);
    assert(W('S.user && S.user.role') === 'superadmin', 'ورودِ سوپرادمین انجام نشد');
    W(`S.route='users'; render(); true`);
    const found = W(`!!document.querySelector('[data-act="export-csv"]')`);
    assert(found, 'دکمهٔ خروجی در صفحهٔ کاربران نیست');
    W(`(function(){
      document.querySelector('[data-act="export-csv"]').click();
    })()`);
    await sleep(300);
    const toast = W(`(document.getElementById('toasts')||{}).textContent || ''`);
    assert(toast.indexOf('اجازه') < 0, 'سوپرادمین در خروجی ردِ مجوز گرفت: ' + toast);
    assert(toast.indexOf('ردیف') > -1 || toast.indexOf('خروجی') > -1, 'اکشنِ خروجی اصلاً اجرا نشد: ' + toast);
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت اصلِ سوپرادمین: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

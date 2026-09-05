#!/usr/bin/env node
/**
 * سئوت سیاست حریم خصوصی (ملاک گوگل‌پلی: سیاست داخلِ اپ) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  P1 صفحهٔ ورود: لینکِ سیاست وجود دارد (data-act="privacy-open")
 *  P2 پیش از ورود (بدون کاربر): کلیک روی لینک، مودالِ سیاست را باز می‌کند
 *     با بخش‌های لازم (داده‌ها/عدمِ جمع‌آوری/موقعیت/حذفِ حساب/تماس)
 *  P3 با کاربرِ ورودکرده (سوپرادمین): باز هم کار می‌کند
 *
 * اجرا: node tests/privacy.js
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

const clickPrivacy = () => W(`(function(){
  var el = document.createElement('span');
  el.setAttribute('data-act','privacy-open');
  document.body.appendChild(el);
  el.click();
  el.remove();
  return true;
})()`);

(async () => {
  await sleep(300);

  await sec('P1 صفحهٔ ورود: لینکِ سیاست وجود دارد', async () => {
    const out = W(`renderLogin()`);
    assert(out.indexOf('data-act="privacy-open"')>=0, 'لینکِ سیاست در صفحهٔ ورود نیست');
    assert(out.indexOf('حریم خصوصی')>=0, 'متنِ لینک درست نیست');
  });

  await sec('P2 پیش از ورود: مودال با بخش‌های لازم باز می‌شود', async () => {
    try{
      W(`S.user=null;S.persona=null;S.boss=null;S.child=null;`);
      clickPrivacy();
      const m = W(`(document.getElementById('modal')||{}).innerHTML || ''`);
      assert(m.indexOf('سیاست حریم خصوصی')>=0, 'مودال باز نشده: ' + m.slice(0,80));
      for(const k of ['چه داده‌ای داریم','جمع','موقعیت','حذف حساب','تماس']){
        assert(m.indexOf(k)>=0, 'بخشِ «' + k + '» در متنِ سیاست نیست');
      }
      assert(m.indexOf('هیچ درخواستی به شبکه نمی‌فرستد')>=0, 'ادعای آفلاینِ نسخهٔ دمو نیست');
    } finally { W(`closeModal()`); }
  });

  await sec('P3 با کاربرِ ورودکرده هم کار می‌کند', async () => {
    try{
      W(`S.user=db.users.filter(function(x){return x.role==='superadmin';})[0];S.persona=null;S.boss=null;S.child=null;`);
      clickPrivacy();
      const m = W(`(document.getElementById('modal')||{}).innerHTML || ''`);
      assert(m.indexOf('سیاست حریم خصوصی')>=0, 'مودال برای کاربرِ ورودکرده باز نشد');
    } finally { W(`closeModal()`); }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت حریم خصوصی: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

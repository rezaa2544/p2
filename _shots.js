#!/usr/bin/env node
/**
 * عکس‌های واقعیِ راهنما — با مرورگر واقعی (puppeteer)
 * ورود از فرمِ واقعیِ برنامه، پیمایش با کلیکِ واقعیِ منو.
 * خروجی: _guide_shots/*.jpg
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '_guide_shots');
fs.mkdirSync(OUT, { recursive: true });
const FILE = 'file://' + path.join(__dirname, 'index.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* [کلید، حساب (null = صفحهٔ ورود)، مسیر] */
const SHOTS = [
  ['login',        null,         ''],
  ['sa-dashboard', 'superadmin', 'dashboard'],
  ['sa-schools',   'superadmin', 'schools'],
  ['sa-diag',      'superadmin', 'diag'],
  ['mg-dashboard', 'manager1',   'dashboard'],
  ['mg-attendance','manager1',   'attendance'],
  ['mg-bus',       'manager1',   'busservice'],
  ['mg-tuition',   'manager1',   'tuition'],
  ['tc-dashboard', 'teacher1_1', 'dashboard'],
  ['tc-vclass',    'teacher1_1', 'vclass'],
  ['tc-homework',  'teacher1_1', 'homework'],
  ['st-dashboard', 'student1',   'dashboard'],
  ['st-schedule',  'student1',   'schedule'],
  ['st-homework',  'student1',   'homework'],
  ['pa-dashboard', 'parent_multi','dashboard'],
  ['pa-children',  'parent_multi','children'],
  ['ed-office',    'edu_kurdistan','officedash'],
  ['ed-schools',   'edu_kurdistan','officeschools'],
  ['co-queue',     'counselor1', 'cqueue'],
  ['dr-service',   'driver1',    'myservice'],
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  let lastUser = '__none__';
  for (const [key, user, route] of SHOTS) {
    try {
      if (user !== lastUser) {
        // حافظهٔ مرورگر خالی ⇒ جلسهٔ نقشِ قبلی باقی نماند
        await page.evaluateOnNewDocument(() => {});
        await page.goto(FILE, { waitUntil: 'load', timeout: 60000 });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'load', timeout: 60000 });
        await sleep(900);
        if (user) {
          await page.evaluate((u) => {
            document.getElementById('lu').value = u;
            document.getElementById('lp').value = '123456';
            document.querySelector('[data-act="login"]').click();
          }, user);
          await sleep(1200);
          // پنلِ چندنقشی اگر خودکار باز شده، ببندیم تا صفحهٔ اصلی دیده شود
          await page.evaluate(() => {
            if (document.getElementById('modal') && document.getElementById('modal').innerHTML) closeModal();
            render();
          });
          await sleep(500);
        }
        lastUser = user;
        // پس از ورود، اگر مسیرِ هدف خانه نبود، از منو به آن برو
        if (user && route) {
          await page.evaluate((r) => {
            if (S.route !== r) {
              const it = document.querySelector('.nav-item[data-r="' + r + '"]');
              if (it) it.click(); else { S.route = r; render(); }
            }
          }, route);
          await sleep(900);
        }
      } else {
        // همان نقش — فقط مسیر را عوض می‌کنیم
        if (route) {
          await page.evaluate((r) => {
            const it = document.querySelector('.nav-item[data-r="' + r + '"]');
            if (it) it.click();
            else { S.route = r; render(); }
          }, route);
          await sleep(900);
        }
      }
      // دیگ: بررسی را واقعاً اجرا کنیم تا گیج و نتایج دیده شود
      if (route === 'diag') {
        await page.evaluate(() => { S.diag = runDiagnostics(); render(); });
        await sleep(700);
      }
      const f = path.join(OUT, key + '.jpg');
      await page.screenshot({ path: f, type: 'jpeg', quality: 82 });
      const kb = Math.round(fs.statSync(f).size / 1024);
      console.log('OK  ' + key + '  (' + kb + ' KB)');
    } catch (e) {
      console.log('ERR ' + key + ' : ' + String(e.message).slice(0, 120));
    }
  }
  await browser.close();
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

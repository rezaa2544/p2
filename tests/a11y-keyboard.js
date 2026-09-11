#!/usr/bin/env node
'use strict';
/**
 * تستِ رفتاریِ ناوبریِ صفحه‌کلید (focus trap + tab order) — Chromium واقعی.
 *
 * بدهیِ ثبت‌شده در HANDOFF دورِ قبل: «focus-trap و ترتیبِ tab سنجیده نشد —
 * axe برایش rule ندارد». این هارنس با فشردنِ کلیدهایِ واقعی (page.keyboard)
 * رفتار را می‌سنجد، نه فقط ساختارِ DOM را:
 *
 *   برایِ هر مودال (۱۰ مودال، نقش‌هایِ manager/teacher/superadmin):
 *     ۱. باز شدن → focus باید واردِ مودال شود (initial focus)
 *     ۲. Tab از آخرین عنصر → چرخش به اولین (trap + wrap)
 *     ۳. Shift+Tab از اولین عنصر → چرخش به آخرین (wrap معکوس)
 *     ۴. سه Tab پیاپی → focus هرگز از مودال بیرون نرود (trap)
 *     ۵. Escape → مودال بسته + focus به عنصرِ بازکننده برگردد
 *
 *   برایِ پوسته (هر ۵ نقش: manager/teacher/parent/student/counselor):
 *     ۶. skip-link: نخستین Tab بعدِ ورود → پیوندِ «پرش به محتوا»؛ Enter → focus رویِ main
 *     ۷. nav-item: با Tab قابلِ رسیدن و با Enter فعال (تغییرِ مسیر)
 *
 *   برایِ dropdown/فرم:
 *     ۸. منویِ پوسته: Enter رویِ دکمه → باز؛ ArrowDown/ArrowUp پیمایش؛ Escape → بسته + focus برگردد
 *     ۹. select درونِ فرمِ مودال: ArrowDown مقدار را عوض کند (رفتارِ بومی — نباید شکسته باشد)
 *
 * قبولی = صفر شکست. خروجی 3 اگر playwright نصب نیست؛ خروجی 2 خطایِ مهلک.
 * ضدِ سبزِ جعلی: هر سناریو اول وجودِ واقعیِ حالت (مودالِ باز و…) را assert می‌کند.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('✗ playwright نصب نیست — npm install --no-save playwright && npx playwright install chromium --with-deps');
  process.exit(3);
}

const PORT = 3195;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name); }
}

function startStaticServer() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'));
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

/* ── ابزارهایِ درون‌صفحه (همه با eval — db/S با const تعریف شده‌اند) ── */
async function bootPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    try { return eval(`typeof db === 'object' && db && Array.isArray(db.users) && db.users.length > 0`); }
    catch (e) { return false; }
  }, null, { timeout: 60000 });
  return page;
}
async function login(page, picker) {
  return page.evaluate((p) => eval(`(function(){
    const u = ${p};
    if (!u) return null;
    finishLogin(u); S.showPicker=false;
    if (typeof closeModal==='function') closeModal();
    render();
    return u.username;
  })()`), picker);
}
const activeInModal = (page) => page.evaluate(() =>
  !!document.querySelector('#modal .modal') &&
  document.querySelector('#modal .modal').contains(document.activeElement));
const modalOpen = (page) => page.evaluate(() => !!document.querySelector('#modal .modal'));
const focusablesInfo = (page) => page.evaluate(() => {
  const m = document.querySelector('#modal .modal');
  if (!m) return null;
  const sel = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
  const vis = [...m.querySelectorAll(sel)].filter(el =>
    !el.disabled && el.offsetParent !== null);
  return { n: vis.length };
});
async function focusEdge(page, which) { /* which: 'first'|'last' */
  return page.evaluate((w) => {
    const m = document.querySelector('#modal .modal');
    if (!m) return false;
    const sel = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
    const vis = [...m.querySelectorAll(sel)].filter(el => !el.disabled && el.offsetParent !== null);
    if (!vis.length) return false;
    (w === 'first' ? vis[0] : vis[vis.length - 1]).focus();
    return true;
  }, which);
}
const atEdge = (page, which) => page.evaluate((w) => {
  const m = document.querySelector('#modal .modal');
  if (!m) return false;
  const sel = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
  const vis = [...m.querySelectorAll(sel)].filter(el => !el.disabled && el.offsetParent !== null);
  if (!vis.length) return false;
  return document.activeElement === (w === 'first' ? vis[0] : vis[vis.length - 1]);
}, which);

/* مودال‌هایِ زیرِ آزمون */
/* nav: ناوبری (render کامل) — جدا از open تا مثلِ جریانِ واقعی، trigger بعدِ
   ناوبری فوکوس شود و openModal همان عنصرِ زنده را به‌عنوانِ opener ثبت کند. */
const MODALS = [
  { name: 'user-new',    login: `db.users.find(x=>x.username==='manager1')`,  nav: `S.route='users'; render();`,     open: `userModal(null);` },
  { name: 'user-edit',   login: `db.users.find(x=>x.username==='manager1')`,  nav: `S.route='users'; render();`,     open: `userModal(db.users.find(u=>u.role==='student'&&u.school_id===S.user.school_id));` },
  { name: 'class',       login: `db.users.find(x=>x.username==='manager1')`,  nav: `S.route='classes'; render();`,   open: `classModal(null);` },
  { name: 'subject',     login: `db.users.find(x=>x.username==='manager1')`,  nav: `S.route='subjects'; render();`,  open: `subjectModal(null);` },
  { name: 'calendar',    login: `db.users.find(x=>x.username==='manager1')`,  nav: `S.route='calendar'; render();`,  open: `calModal(null);` },
  { name: 'ticket',      login: `db.users.find(x=>x.username==='manager1')`,  nav: `S.route='dashboard'; render();`, open: `ticketModal();` },
  { name: 'confirm-del', login: `db.users.find(x=>x.username==='manager1')`,  nav: `S.route='users'; render();`,     open: `confirmModal('حذف شود؟','user-del-ok',1);` },
  { name: 'ask-confirm', login: `db.users.find(x=>x.username==='manager1')`,  nav: `S.route='dashboard'; render();`, open: `askConfirm('ادامه؟',function(){},{danger:false});` },
  { name: 'sync-panel',  login: `db.users.find(x=>x.username==='manager1')`,  nav: `S.route='dashboard'; render();`, open: `syncPanelModal();` },
  { name: 'grade',       login: `db.users.find(x=>x.username==='teacher1_1')`, nav: `S.route='grades'; render();`,   open: `gradeModal(null);` },
  { name: 'school',      login: `db.users.find(x=>x.role==='superadmin')`,    nav: `S.route='schools'; render();`,   open: `schoolModal(null);` },
];

/* نقش‌ها برایِ آزمونِ پوسته (skip-link + nav) */
const SHELL_ROLES = [
  ['manager',   `db.users.find(x=>x.username==='manager1')`],
  ['teacher',   `db.users.find(x=>x.username==='teacher1_1')`],
  ['parent',    `db.users.find(x=>x.username==='parent_multi')`],
  ['student',   `db.users.find(x=>x.role==='student')`],
  ['counselor', `db.users.find(x=>x.username==='counselor1')`],
];

(async () => {
  const srv = await startStaticServer();
  const browser = await chromium.launch();

  console.log('\n▸ A11y Keyboard — focus trap، ترتیبِ tab، Escape، skip-link (کلیدهایِ واقعی)');

  /* ═══ ۱) مودال‌ها: trap + wrap + escape + focus return ═══ */
  for (const M of MODALS) {
    console.log(`\n— مودالِ ${M.name} —`);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await bootPage(context);
      const who = await login(page, M.login);
      if (!who) { check(false, `${M.name}: کاربرِ آزمون پیدا نشد`); await context.close(); continue; }

      /* اول ناوبری (render کامل)، بعد فوکوسِ trigger، بعد باز کردنِ مودال —
         مثلِ جریانِ واقعیِ کاربر که دکمه را فوکوس/کلیک می‌کند */
      await page.evaluate((code) => { eval(code); }, M.nav);
      await page.waitForTimeout(100);
      const trigOk = await page.evaluate(() => {
        /* دکمهٔ «مرئیِ» صفحه (burger در دسکتاپ display:none است و focus نمی‌گیرد) */
        const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null);
        if (!b) return false;
        b.id = 'kb-trigger'; b.focus();
        return document.activeElement === b;
      });
      if (!trigOk) { check(false, `${M.name}: عنصرِ بازکنندهٔ مرئی برایِ فوکوس پیدا نشد`); await context.close(); continue; }
      await page.evaluate((code) => { eval(code); }, M.open);
      await page.waitForTimeout(sleepFor(M));

      if (!(await modalOpen(page))) { check(false, `${M.name}: مودال باز نشد`); await context.close(); continue; }

      /* ۱. focus اولیه داخلِ مودال */
      check(await activeInModal(page), `${M.name}: focus اولیه واردِ مودال می‌شود`);

      const info = await focusablesInfo(page);
      if (!info || info.n < 1) { check(false, `${M.name}: عنصرِ فوکوس‌پذیر در مودال نیست`); await context.close(); continue; }

      /* ۲. Tab از آخرین → اولین (wrap) */
      await focusEdge(page, 'last');
      await page.keyboard.press('Tab');
      check(await atEdge(page, 'first'), `${M.name}: Tab از آخرین عنصر به اولین می‌چرخد`);

      /* ۳. Shift+Tab از اولین → آخرین */
      await focusEdge(page, 'first');
      await page.keyboard.press('Shift+Tab');
      check(await atEdge(page, 'last'), `${M.name}: Shift+Tab از اولین عنصر به آخرین می‌چرخد`);

      /* ۴. سه Tab پیاپی — focus بیرون نرود */
      let stayed = true;
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Tab');
        if (!(await activeInModal(page))) { stayed = false; break; }
      }
      check(stayed, `${M.name}: focus با Tabهایِ پیاپی از مودال بیرون نمی‌رود (trap)`);

      /* ۵. Escape → بسته + بازگشتِ focus */
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
      const closed = !(await modalOpen(page));
      check(closed, `${M.name}: Escape مودال را می‌بندد`);
      if (closed) {
        const returned = await page.evaluate(() => document.activeElement && document.activeElement.id === 'kb-trigger');
        check(returned, `${M.name}: پس از بستن، focus به عنصرِ بازکننده برمی‌گردد`);
      }
    } catch (e) {
      check(false, `${M.name}: خطایِ سناریو — ${String(e).slice(0, 120)}`);
    } finally { await context.close(); }
  }

  /* ═══ ۲) پوسته برایِ ۵ نقش: skip-link + ناوبریِ nav با کیبورد ═══ */
  for (const [role, picker] of SHELL_ROLES) {
    console.log(`\n— پوسته (${role}) —`);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await bootPage(context);
      const who = await login(page, picker);
      if (!who) { check(false, `${role}: کاربر پیدا نشد`); await context.close(); continue; }

      /* ۶. skip-link: نخستین Tab از بالایِ سند */
      await page.evaluate(() => { document.body.focus(); });
      await page.keyboard.press('Tab');
      const onSkip = await page.evaluate(() => {
        const a = document.activeElement;
        return !!(a && a.classList && a.classList.contains('skip-link'));
      });
      check(onSkip, `${role}: نخستین Tab رویِ skip-link می‌نشیند`);
      if (onSkip) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(60);
        const inMain = await page.evaluate(() => {
          const m = document.querySelector('.main');
          return !!m && (document.activeElement === m || m.contains(document.activeElement));
        });
        check(inMain, `${role}: Enter رویِ skip-link → focus به محتوایِ اصلی`);
      }

      /* ۷. nav-item: فوکوس‌پذیر و با Enter فعال */
      const navOk = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.nav-item')];
        if (items.length < 2) return { reach: false };
        const target = items.find(i => !i.classList.contains('active')) || items[1];
        target.focus();
        return { reach: document.activeElement === target, r: target.getAttribute('data-r') };
      });
      check(navOk.reach, `${role}: nav-item با کیبورد فوکوس‌پذیر است (tabindex)`);
      if (navOk.reach) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        const routed = await page.evaluate((r) => eval(`S.route === ${JSON.stringify(r)}`), navOk.r);
        check(routed, `${role}: Enter رویِ nav-item مسیر را عوض می‌کند`);
      }
    } catch (e) {
      check(false, `${role}: خطایِ سناریو — ${String(e).slice(0, 120)}`);
    } finally { await context.close(); }
  }

  /* ═══ ۳) dropdown پوسته + فرم ═══ */
  {
    console.log('\n— منویِ پوسته (dropdown) + فرم —');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await bootPage(context);
      await login(page, `db.users.find(x=>x.username==='manager1')`);

      /* ۸. منویِ پوسته با کیبورد */
      const hasPop = await page.evaluate(() => {
        const b = document.querySelector('[data-tpop]');
        if (!b) return false;
        /* رویِ دسکتاپ پاپ‌اور پنهانِ سگمنت است — نمایش برایِ آزمون */
        b.style.display = ''; b.focus();
        return document.activeElement === b;
      });
      check(hasPop, 'dropdown: دکمهٔ منویِ پوسته فوکوس‌پذیر است');
      if (hasPop) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(80);
        const menuOpen = await page.evaluate(() => {
          const m = document.querySelector('[data-tpopmenu]');
          return !!m && !m.hidden;
        });
        check(menuOpen, 'dropdown: Enter منو را باز می‌کند');
        if (menuOpen) {
          await page.keyboard.press('ArrowDown');
          const onItem1 = await page.evaluate(() => {
            const m = document.querySelector('[data-tpopmenu]');
            return !!m && m.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON';
          });
          check(onItem1, 'dropdown: ArrowDown به گزینهٔ نخست می‌رود');
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('ArrowUp');
          const backTo1 = await page.evaluate(() => {
            const m = document.querySelector('[data-tpopmenu]');
            const btns = m ? [...m.querySelectorAll('button')] : [];
            return btns.length > 0 && document.activeElement === btns[0];
          });
          check(backTo1, 'dropdown: ArrowUp به گزینهٔ قبلی برمی‌گردد');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(60);
          const closedBack = await page.evaluate(() => {
            const m = document.querySelector('[data-tpopmenu]');
            const b = document.querySelector('[data-tpop]');
            return !!m && m.hidden && document.activeElement === b;
          });
          check(closedBack, 'dropdown: Escape منو را می‌بندد و focus به دکمه برمی‌گردد');
        }
      }

      /* ۹. select فرم: ArrowDown مقدار را عوض می‌کند (رفتارِ بومی سالم) */
      await page.evaluate(() => eval(`S.route='users'; render(); userModal(null);`));
      await page.waitForTimeout(150);
      const selReady = await page.evaluate(() => {
        const s = document.querySelector('#modal select#u_role');
        if (!s) return null;
        s.focus();
        return { before: s.selectedIndex };
      });
      if (selReady) {
        await page.keyboard.press('ArrowDown');
        const changed = await page.evaluate((b) => {
          const s = document.querySelector('#modal select#u_role');
          return !!s && s.selectedIndex !== b;
        }, selReady.before);
        check(changed, 'form: ArrowDown رویِ select گزینه را عوض می‌کند (رفتارِ بومی)');
      } else {
        check(false, 'form: select#u_role در مودال پیدا نشد');
      }
    } catch (e) {
      check(false, `dropdown/form: خطا — ${String(e).slice(0, 120)}`);
    } finally { await context.close(); }
  }

  await browser.close();
  srv.close();

  console.log(`\nجمع: ${pass} قبول، ${fail} رد`);
  if (fail) {
    console.log('\nشکست‌ها:');
    for (const f of failures) console.log('  • ' + f);
    process.exit(1);
  }
  console.log('✅ ناوبریِ صفحه‌کلید کامل است.');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });

function sleepFor(M) { return M.name === 'sync-panel' ? 400 : 200; }

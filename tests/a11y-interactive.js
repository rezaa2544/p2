#!/usr/bin/env node
'use strict';
/**
 * راستی‌آزماییِ دسترس‌پذری در حالت‌هایِ تعاملی — مودال‌ها، ولیدیشن، toast،
 * سایدبارِ باز، منویِ پوسته (dropdown) — axe-core رویِ DOM زندهٔ Chromium.
 *
 * ادامهٔ tests/a11y-runtime.js که فقط نماهایِ سطحِ NAV را می‌دید (بدهیِ
 * ثبت‌شده در HANDOFF دورِ قبل). این هارنس هر «حالت» را جدا اسکن می‌کند:
 *
 *   ▸ مودال‌هایِ CRUD: کاربر (ثبت‌نام/ویرایش)، مدرسه، کلاس، درس، نمره،
 *     رویدادِ تقویم، تیکتِ پشتیبانی
 *   ▸ مودال‌هایِ تأیید: confirmModal (حذف)، askConfirm (عمومی)
 *   ▸ مودالِ گزارش/پنل: syncPanelModal، storageQuotaModal
 *   ▸ حالتِ خطایِ فرم (form validation): invalid() → has-error + field-error-msg + toast err
 *   ▸ toastهایِ ok/err/warn نمایان
 *   ▸ سایدبارِ بازِ موبایل (S.sidebar=true + scrim)
 *   ▸ منویِ بازِ پوسته (data-tpopmenu — dropdown)
 *   ▸ مودالِ انتخابِ پنل (showPicker — همان که بعدِ ورود می‌آید)
 *
 * قبولی = صفر critical و صفر serious. خروجی 3 اگر playwright نصب نیست
 * (پیش‌نیازِ محیط؛ با شکستِ a11y فرق دارد — سبزِ جعلی ممنوع). خروجی 2 خطایِ مهلک.
 *
 * نکته‌هایِ فنی (مثل هارنسِ runtime):
 *   - db/S/NAV با const تعریف شده‌اند → دسترسی فقط با eval درونِ صفحه.
 *   - CSP تک‌فایلی تزریقِ axe را می‌بندد → bypassCSP فقط برایِ تزریقِ اسکنر.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium, AxeBuilder;
try {
  ({ chromium } = require('playwright'));
  ({ AxeBuilder } = require('@axe-core/playwright'));
} catch (e) {
  console.error('✗ playwright/@axe-core/playwright نصب نیست — نصب: npm install --no-save playwright @axe-core/playwright && npx playwright install chromium');
  process.exit(3);
}

const PORT = 3196;
const ROOT = path.join(__dirname, '..');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

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

/* هر سناریو: نام + کدِ درون‌صفحه (با eval اجرا می‌شود) که حالت را می‌سازد.
   کد باید بعدِ login اجرا شود؛ اگر نقشِ خاص لازم است، loginAs مشخص می‌کند. */
const SCENARIOS = [
  /* ── مودال‌هایِ CRUD (نقش manager) ── */
  { name: 'modal:user-new (افزودن کاربر)', loginAs: 'manager1',
    js: `S.route='users'; render(); userModal(null);` },
  { name: 'modal:user-edit (ویرایش کاربر)', loginAs: 'manager1',
    js: `S.route='users'; render(); userModal(db.users.find(u=>u.role==='student'&&u.school_id===S.user.school_id));` },
  { name: 'modal:class (کلاس)', loginAs: 'manager1',
    js: `S.route='classes'; render(); classModal(null);` },
  { name: 'modal:subject (درس/کتاب)', loginAs: 'manager1',
    js: `S.route='subjects'; render(); subjectModal(null);` },
  { name: 'modal:calendar (رویداد تقویم)', loginAs: 'manager1',
    js: `S.route='calendar'; render(); calModal(null);` },
  { name: 'modal:ticket (تیکت پشتیبانی)', loginAs: 'manager1',
    js: `S.route='dashboard'; render(); ticketModal();` },
  { name: 'modal:school (مدرسه — superadmin)', loginAs: 'superadmin',
    js: `S.route='schools'; render(); schoolModal(null);` },
  { name: 'modal:grade (ثبت نمره — teacher)', loginAs: 'teacher1_1',
    js: `S.route='grades'; render(); gradeModal(null);` },

  /* ── مودال‌هایِ تأیید ── */
  { name: 'modal:confirm-delete (تأیید حذف)', loginAs: 'manager1',
    js: `S.route='users'; render(); confirmModal('آیا از حذف این کاربر مطمئن هستید؟','user-del-ok',1);` },
  { name: 'modal:ask-confirm (تأیید عمومی)', loginAs: 'manager1',
    js: `S.route='dashboard'; render(); askConfirm('این عملیات ارسال پیامک دارد. ادامه می‌دهید؟',function(){},{title:'تأیید ارسال',ok:'ادامه',danger:false});` },

  /* ── مودال‌هایِ گزارش/پنل ── */
  { name: 'modal:sync-panel (پنل همگام‌سازی)', loginAs: 'manager1',
    js: `S.route='dashboard'; render(); syncPanelModal();` },
  { name: 'modal:storage-quota (حافظهٔ دستگاه)', loginAs: 'manager1',
    js: `S.route='dashboard'; render(); storageQuotaModal();`, waitMs: 600 },

  /* ── حالتِ خطایِ فرم (validation error) ── */
  { name: 'state:form-error (فرم کاربر با خطای ولیدیشن)', loginAs: 'manager1',
    js: `S.route='users'; render(); userModal(null);
         document.getElementById('u_name').value='';
         invalid('u_name', true, 'نام و نام خانوادگی الزامی است');` },
  { name: 'state:form-error-nid (کد ملی نامعتبر)', loginAs: 'manager1',
    js: `S.route='users'; render(); userModal(null);
         document.getElementById('u_nid').value='123';
         invalid('u_nid', true, 'کد ملی معتبر نیست');` },

  /* ── toastها ── */
  { name: 'state:toasts (ok + err + warn هم‌زمان)', loginAs: 'manager1',
    js: `S.route='dashboard'; render();
         toast('ذخیره شد','ok'); toast('خطا در ارسال','err'); toast('اتصال ناپایدار است','warn');` },

  /* ── سایدبارِ بازِ موبایل + scrim ── */
  { name: 'state:sidebar-open (سایدبار موبایل باز)', loginAs: 'manager1',
    js: `S.route='dashboard'; S.sidebar=true; render();`, viewport: { width: 420, height: 900 } },

  /* ── منویِ بازِ پوسته (dropdown) ── */
  { name: 'state:theme-menu-open (منوی پوسته باز)', loginAs: 'manager1',
    js: `S.route='dashboard'; render();
         var m=document.querySelector('[data-tpopmenu]'); if(m) m.hidden=false;` },

  /* ── مودالِ انتخابِ پنل بعدِ ورود ── */
  { name: 'modal:panel-picker (انتخاب پنل بعد از ورود)', loginAs: 'manager1', keepPicker: true,
    js: `` },
];

const out = { when: new Date().toISOString(), tags: TAGS, results: [] };
let totalCrit = 0, totalSer = 0, totalMod = 0, totalMin = 0;
const ruleAgg = new Map();

(async () => {
  const srv = await startStaticServer();
  const browser = await chromium.launch();

  async function freshPage(context) {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      try { return eval(`typeof db === 'object' && db && Array.isArray(db.users) && db.users.length > 0`); }
      catch (e) { return false; }
    }, null, { timeout: 60000 });
    return page;
  }

  console.log('\n▸ A11y Interactive — مودال‌ها و حالت‌هایِ تعاملی (axe-core، Chromium headless)');
  console.log(`  ${SCENARIOS.length} سناریو\n`);

  for (const sc of SCENARIOS) {
    const context = await browser.newContext({
      bypassCSP: true,
      viewport: sc.viewport || { width: 1280, height: 900 },
    });
    let page;
    try {
      page = await freshPage(context);

      /* ورود با نقشِ لازم */
      const okLogin = await page.evaluate(([uname, keepPicker]) => {
        return eval(`(function(){
          const u = ${uname === 'superadmin'
            ? `db.users.find(x=>x.role==='superadmin')`
            : `db.users.find(x=>x.username===${JSON.stringify(uname)})`};
          if (!u) return null;
          finishLogin(u);
          if (!${keepPicker ? 'true' : 'false'}) { S.showPicker = false; if (typeof closeModal==='function') closeModal(); }
          render();
          return u.username;
        })()`);
      }, [sc.loginAs, !!sc.keepPicker]);
      if (!okLogin) {
        console.log(`  ⚠️ ${sc.name}: کاربرِ «${sc.loginAs}» پیدا نشد — رد شد`);
        await context.close();
        continue;
      }

      /* ساختِ حالت */
      if (sc.js && sc.js.trim()) {
        await page.evaluate((code) => { eval(code); }, sc.js);
      }
      await page.waitForTimeout(sc.waitMs || 200);

      /* برایِ سناریوهایِ مودال، مطمئن شو مودال واقعاً باز است (سبزِ جعلی ممنوع) */
      if (sc.name.startsWith('modal:')) {
        const open = await page.evaluate(() => !!document.querySelector('.modal-back .modal, .modal'));
        if (!open) {
          console.log(`  ❌ ${sc.name}: مودال باز نشد — سناریو شکست`);
          out.results.push({ scenario: sc.name, error: 'modal-did-not-open' });
          totalCrit++; /* شکستِ سناریو را مثلِ critical می‌شماریم تا سبزِ جعلی نشود */
          await context.close();
          continue;
        }
      }
      if (sc.name === 'state:toasts') {
        const n = await page.evaluate(() => document.querySelectorAll('#toasts .toast').length);
        if (n < 3) {
          console.log(`  ❌ ${sc.name}: toastها نمایان نشدند (${n}/3)`);
          out.results.push({ scenario: sc.name, error: 'toasts-missing' });
          totalCrit++;
          await context.close();
          continue;
        }
      }
      if (sc.name.startsWith('state:form-error')) {
        const hasErr = await page.evaluate(() => !!document.querySelector('.has-error') && !!document.querySelector('.field-error-msg'));
        if (!hasErr) {
          console.log(`  ❌ ${sc.name}: حالتِ خطایِ فرم ساخته نشد`);
          out.results.push({ scenario: sc.name, error: 'error-state-missing' });
          totalCrit++;
          await context.close();
          continue;
        }
      }

      /* اسکن */
      const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      const items = [];
      for (const v of res.violations) {
        const impact = v.impact || 'minor';
        const nodes = v.nodes.length;
        if (counts[impact] != null) counts[impact] += nodes;
        items.push({ id: v.id, impact, nodes, help: v.help,
          sample: v.nodes[0] ? v.nodes[0].target.join(' ') : '',
          html: v.nodes[0] ? String(v.nodes[0].html).slice(0, 160) : '' });
        const k = impact + ':' + v.id;
        const agg = ruleAgg.get(k) || { impact, id: v.id, nodes: 0, scans: 0, help: v.help };
        agg.nodes += nodes; agg.scans++;
        ruleAgg.set(k, agg);
      }
      totalCrit += counts.critical; totalSer += counts.serious;
      totalMod += counts.moderate; totalMin += counts.minor;
      out.results.push({ scenario: sc.name, counts, items });
      const mark = counts.critical || counts.serious ? '❌' : '✅';
      console.log(`  ${mark} ${sc.name.padEnd(52)} critical:${counts.critical} serious:${counts.serious} moderate:${counts.moderate} minor:${counts.minor}`);
    } catch (e) {
      console.log(`  ❌ ${sc.name}: خطا — ${String(e).slice(0, 160)}`);
      out.results.push({ scenario: sc.name, error: String(e).slice(0, 300) });
      totalCrit++; /* سناریویِ شکسته = شکست، نه ردشدنِ ساکت */
    } finally {
      await context.close();
    }
  }

  await browser.close();
  srv.close();

  if (ruleAgg.size) {
    console.log('\n  ── قانون‌هایِ نقض‌شده (تجمیعی) ──');
    for (const a of [...ruleAgg.values()].sort((x, y) => y.nodes - x.nodes)) {
      console.log(`   [${a.impact}] ${a.id} — ${a.nodes} node در ${a.scans} سناریو — ${a.help}`);
    }
  }
  console.log(`\n  جمعِ کل: critical=${totalCrit} serious=${totalSer} moderate=${totalMod} minor=${totalMin}`);

  out.totals = { critical: totalCrit, serious: totalSer, moderate: totalMod, minor: totalMin };
  const outDir = path.join(ROOT, 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'a11y-interactive.json'), JSON.stringify(out, null, 1));
  console.log(`  گزارشِ JSON: out/a11y-interactive.json (${out.results.length} سناریو)`);

  if (totalCrit || totalSer) {
    console.log('\n  ❌ قبولی نگرفت: critical/serious باید صفر باشند.');
    process.exit(1);
  }
  console.log('\n  ✅ قبول: صفر critical، صفر serious.');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });

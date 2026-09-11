/* ─────────────────────────────────────────────────────────────
   a11y-runtime.js — Accessibility Runtime Verification (a11y v2)
   ═════════════════════════════════════════════════════════════
   تفاوت با ممیزی‌هایِ قبلی: این تست در «مرورگرِ واقعی» (Chromium
   headless با Playwright) اجرا می‌شود، نه jsdom — axe-core رویِ
   DOM زنده با CSSOM/layout واقعی می‌دود، پس contrast و focus و
   hidden-state واقعی سنجیده می‌شوند.

   پوشش: ۵ نقش × تا ۱۰ نمایِ اصلیِ هر نقش (از PANELS خودِ برنامه).
   نقش‌ها: manager, teacher, parent, student, counselor.
   ⚠️ صادقانه: brief نقشِ «staff» خواسته بود؛ در این مخزن نقشی به
   نامِ staff وجود ندارد (ROLE_FA) — نزدیک‌ترین نقشِ کادر، counselor
   است و جایگزین شد.

   خروجی: جدولِ violations به تفکیکِ severity
   (critical / serious / moderate / minor).
   قبولی: صفر critical و صفر serious.

   پیش‌نیاز: npm i --no-save playwright @axe-core/playwright
             npx playwright install chromium
   اجرا:     node tests/a11y-runtime.js
   خروجی JSON: out/a11y-runtime.json (برایِ سند)
   ───────────────────────────────────────────────────────────── */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const PORT = Number(process.env.A11Y_PORT || 3199);

/* نقش‌ها و کاربرِ دمو هر کدام (username از 02-demo-data.js) */
const ROLES = [
  { role: 'manager',   pickJs: `db.users.find(u=>u.username==='manager1')` },
  { role: 'teacher',   pickJs: `db.users.find(u=>u.username==='teacher1_1')` },
  { role: 'parent',    pickJs: `db.users.find(u=>u.username==='parent_multi')||db.users.find(u=>u.role==='parent')` },
  { role: 'student',   pickJs: `db.users.find(u=>u.role==='student')` },
  /* brief گفته staff؛ نقشِ staff در مخزن نیست — counselor جایگزینِ صادقانه */
  { role: 'counselor', pickJs: `db.users.find(u=>u.username==='counselor1')||db.users.find(u=>u.role==='counselor')` },
];
const MAX_VIEWS_PER_ROLE = 10;

/* ---------- سرور استاتیک production-like برایِ index.html ---------- */
function startStaticServer() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'));
  const srv = http.createServer((req, res) => {
    const p = String(req.url || '/').split('?')[0];
    if (p === '/' || p === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (p === '/manifest.json' || p === '/sw.js') {
      try {
        const f = fs.readFileSync(path.join(ROOT, p.slice(1)));
        res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'application/json' });
        res.end(f);
        return;
      } catch (e) { /* پایین ۴۰۴ */ }
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((resolve) => srv.listen(PORT, '127.0.0.1', () => resolve(srv)));
}

(async () => {
  let chromium, AxeBuilder;
  try {
    chromium = require('playwright').chromium;
    AxeBuilder = require('@axe-core/playwright').default;
  } catch (e) {
    console.error('⚠️ playwright/@axe-core/playwright نصب نیست — این تست فقط با آن‌ها معنا دارد.');
    console.error('   npm i --no-save playwright @axe-core/playwright && npx playwright install chromium');
    process.exit(3); /* exit 3 = پیش‌نیازِ محیط، نه شکستِ a11y (سبزِ جعلی هم نیست) */
  }

  const srv = await startStaticServer();
  const browser = await chromium.launch();
  /* bypassCSP فقط برایِ تزریقِ axe-core لازم است (CSP تک‌فایلی nonce دارد)؛
     خودِ سنجشِ a11y ربطی به CSP ندارد. */
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  console.log('\n▸ A11y Runtime — axe-core رویِ DOM زنده (Chromium headless)');
  console.log(`  سرو: http://127.0.0.1:${PORT}/ (index.html تک‌فایلی، دادهٔ دمو)\n`);

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  /* صبر تا دادهٔ دمو ساخته شود و صفحهٔ ورود رندر شود.
     ⚠️ db با const تعریف شده و رویِ window نیست — eval درونِ صفحه لازم است. */
  await page.waitForFunction(() => {
    try { return eval(`typeof db === 'object' && db && Array.isArray(db.users) && db.users.length > 0`); }
    catch (e) { return false; }
  }, null, { timeout: 60000 });

  /* ۱) خودِ صفحهٔ ورود هم اسکن می‌شود (نمایِ مشترکِ همهٔ نقش‌ها) */
  const results = [];   /* {role, route, critical, serious, moderate, minor, items:[]} */
  async function scan(role, route) {
    const axe = new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    const r = await axe.analyze();
    const bySev = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const items = [];
    for (const v of r.violations) {
      const sev = v.impact || 'minor';
      bySev[sev] = (bySev[sev] || 0) + v.nodes.length;
      items.push({ id: v.id, impact: sev, help: v.help, nodes: v.nodes.length,
        sample: (v.nodes[0] && v.nodes[0].target && String(v.nodes[0].target[0]).slice(0, 90)) || '' });
    }
    results.push({ role, route, ...bySev, items });
    const flag = (bySev.critical || bySev.serious) ? '❌' : '✅';
    console.log(`  ${flag} ${role.padEnd(10)} ${route.padEnd(15)} critical:${bySev.critical} serious:${bySev.serious} moderate:${bySev.moderate} minor:${bySev.minor}`);
  }

  await scan('(login)', 'login');

  /* ۲) پنج نقش × تا ۱۰ نمایِ اصلی — نمای هر نقش از PANELS خودِ برنامه */
  for (const R of ROLES) {
    /* توجه: db/S/NAV با const تعریف شده‌اند و رویِ window نیستند —
       دسترسی از راهِ eval درونِ صفحه انجام می‌شود. */
    const ok = await page.evaluate((pickJs) => {
      /* eslint-disable no-eval */
      return eval(`(function(){
        const u = ${pickJs};
        if (!u) return null;
        finishLogin(u);
        S.showPicker = false;
        if (typeof closeModal === 'function') closeModal();
        render();
        return { username: u.username, role: u.role };
      })()`);
    }, R.pickJs);
    if (!ok) { console.log(`  ⚠️ ${R.role}: کاربرِ دمو پیدا نشد — رد شد`); continue; }

    const routes = await page.evaluate((max) => {
      return eval(`(function(){
        const u = S.user;
        const groups = NAV[u.role] || [];
        const out = [];
        for (const g of groups) for (const it of g[1]) { if (out.length < ${max}) out.push(it[0]); }
        return out;
      })()`);
    }, MAX_VIEWS_PER_ROLE);

    for (const route of routes) {
      await page.evaluate((r) => {
        eval(`S.route = ${JSON.stringify(r)}; S.filters = {}; S.page = 1; S.stack = [];
          if (typeof closeModal === 'function') closeModal();
          render();`);
      }, route);
      await page.waitForTimeout(120); /* بگذار paint تمام شود */
      await scan(R.role, route);
    }
  }

  await browser.close();
  srv.close();

  /* ---------- جمع‌بندی ---------- */
  const tot = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  results.forEach((r) => { tot.critical += r.critical; tot.serious += r.serious; tot.moderate += r.moderate; tot.minor += r.minor; });

  /* قانون‌هایِ یکتا به تفکیک severity برایِ گزارش */
  const ruleAgg = {};
  results.forEach((r) => r.items.forEach((v) => {
    const k = v.impact + ':' + v.id;
    if (!ruleAgg[k]) ruleAgg[k] = { id: v.id, impact: v.impact, help: v.help, nodes: 0, views: 0 };
    ruleAgg[k].nodes += v.nodes; ruleAgg[k].views += 1;
  }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'a11y-runtime.json'),
    JSON.stringify({ date: new Date().toISOString(), totals: tot, rules: Object.values(ruleAgg), results }, null, 2));

  console.log('\n  ── قانون‌هایِ نقض‌شده (تجمیعی) ──');
  Object.values(ruleAgg)
    .sort((a, b) => ['critical','serious','moderate','minor'].indexOf(a.impact) - ['critical','serious','moderate','minor'].indexOf(b.impact))
    .forEach((v) => console.log(`   [${v.impact}] ${v.id} — ${v.nodes} node در ${v.views} نما — ${v.help}`));

  console.log(`\n  جمعِ کل: critical=${tot.critical} serious=${tot.serious} moderate=${tot.moderate} minor=${tot.minor}`);
  console.log(`  گزارشِ JSON: out/a11y-runtime.json (${results.length} اسکن)`);

  if (tot.critical || tot.serious) {
    console.log('\n  ❌ قبولی نگرفت: critical/serious باید صفر باشند.');
    process.exit(1);
  }
  console.log('\n  ✅ قبول: صفر critical، صفر serious.');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });

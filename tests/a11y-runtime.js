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

/* 🔴 بدونِ eval: db/S/NAV/finishLogin/closeModal/render متغیرهایِ lexicalِ
   سراسریِ برنامهٔ مرورگر هستند و رویِ window نیستند، ولی توابعِ واقعی را
   مستقیماً به page.evaluate می‌فرستیم — مرورگر آن‌ها را در scopeِ صفحه
   اجرا می‌کند و نیازی به ساختنِ متنِ کد نیست. */
/* global db, S, NAV, finishLogin, closeModal, render */

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const PORT = Number(process.env.A11Y_PORT || 3199);

/* 🔴 نقش‌ها و کاربرِ دمو هر کدام (username از 02-demo-data.js).
   pickUser یک تابعِ انتخاب‌گر است که در scopeِ صفحه اجرا می‌شود؛
   هیچ متنِ کدی ساخته یا الحاق نمی‌شود. */
const ROLES = [
  { role: 'manager',   pickSpec: { username: 'manager1' } },
  { role: 'teacher',   pickSpec: { username: 'teacher1_1' } },
  { role: 'parent',    pickSpec: { username: 'parent_multi', fallbackRole: 'parent' } },
  { role: 'student',   pickSpec: { role: 'student' } },
  /* brief گفته staff؛ نقشِ staff در مخزن نیست — counselor جایگزینِ صادقانه */
  { role: 'counselor', pickSpec: { username: 'counselor1', fallbackRole: 'counselor' } },
];
const MAX_VIEWS_PER_ROLE = 10;
const THEMES = (process.env.A11Y_THEMES ? process.env.A11Y_THEMES.split(',').map((s) => s.trim()).filter(Boolean) : ['theme-1', 'theme-2', 'theme-3']);

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
  const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: launchArgs } : { args: launchArgs });
  /* bypassCSP فقط برایِ تزریقِ axe-core لازم است (CSP تک‌فایلی nonce دارد)؛
     خودِ سنجشِ a11y ربطی به CSP ندارد. */
  const context = await browser.newContext({
    bypassCSP: true,
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  console.log('\n▸ A11y Runtime — axe-core رویِ DOM زنده (Chromium headless)');
  console.log(`  سرو: http://127.0.0.1:${PORT}/ (index.html تک‌فایلی، دادهٔ دمو)\n`);

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  /* صبر تا دادهٔ دمو ساخته شود و صفحهٔ ورود رندر شود.
     db یک متغیرِ lexicalِ سراسری است؛ predicate مستقیماً در scopeِ صفحه
     اجرا می‌شود (بدونِ ساختنِ متنِ کد). */
  await page.waitForFunction(() => {
    try { return typeof db === 'object' && !!db && Array.isArray(db.users) && db.users.length > 0; }
    catch (e) { return false; }
  }, null, { timeout: 60000 });

  /* صبرِ قطعی برایِ بارگذاریِ فونت‌ها، اتمامِ انیمیشن‌هایِ متناهیِ CSS (مانند pop روی .toast پس از ورود)،
     و دو فریمِ کاملِ نقاشی پیش از اجرای axe-core تا هیچ عنصری در میانهٔ انیمیشنِ opacity اسکن نشود. */
  async function settleBeforeScan() {
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (e) { /* فونت از پیش آماده */ }
      }
      if (typeof document.getAnimations === 'function') {
        const finite = document.getAnimations({ subtree: true }).filter((a) => {
          try {
            const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
            return t && t.iterations !== Infinity;
          } catch (e) {
            return false;
          }
        });
        if (finite.length) {
          await Promise.race([
            Promise.allSettled(finite.map((a) => a.finished)),
            new Promise((resolve) => setTimeout(resolve, 1000))
          ]);
        }
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await page.waitForTimeout(150); /* بگذار paint تمام شود */
  }

  /* ۱) اسکن در هر سه تم (theme-1, theme-2, theme-3): هم صفحهٔ ورود و هم ۵ نقش × تا ۱۰ نما */
  const results = [];   /* {theme, role, route, critical, serious, moderate, minor, items:[]} */
  async function scan(theme, role, route) {
    const axe = new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    const r = await axe.analyze();
    const bySev = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const items = [];
    for (const v of r.violations) {
      const sev = v.impact || 'minor';
      bySev[sev] = (bySev[sev] || 0) + v.nodes.length;
      const nodeDetails = v.nodes.slice(0, 5).map((n) => ({
        target: Array.isArray(n.target) ? n.target.map(String).join(' > ').slice(0, 140) : '',
        html: String(n.html || '').replace(/\s+/g, ' ').slice(0, 180),
        summary: String(n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220),
        data: (n.any && n.any[0] && n.any[0].data) || null
      }));
      items.push({ id: v.id, impact: sev, help: v.help, nodes: v.nodes.length,
        sample: (nodeDetails[0] && nodeDetails[0].target.slice(0, 90)) || '',
        details: nodeDetails });
    }
    results.push({ theme, role, route, ...bySev, items });
    const flag = (bySev.critical || bySev.serious) ? '❌' : '✅';
    console.log(`  ${flag} ${theme.padEnd(8)} ${role.padEnd(10)} ${route.padEnd(15)} critical:${bySev.critical} serious:${bySev.serious} moderate:${bySev.moderate} minor:${bySev.minor}`);
    if (bySev.critical || bySev.serious) {
      for (const it of items) {
        if (it.impact !== 'critical' && it.impact !== 'serious') continue;
        for (const d of (it.details || [])) {
          console.log(`     ↳ [${it.impact}] ${it.id} (${theme}/${role}/${route}) target=${d.target} data=${JSON.stringify(d.data)} html=${d.html}`);
        }
      }
    }
  }

  for (const theme of THEMES) {
    await page.evaluate((th) => {
      document.documentElement.setAttribute('data-theme', th);
      S.user = null;
      S.showPicker = false;
      if (typeof closeModal === 'function') closeModal();
      render();
    }, theme);
    await settleBeforeScan();
    await scan(theme, '(login)', 'login');

    /* ۲) پنج نقش × تا ۱۰ نمایِ اصلی — نمای هر نقش از PANELS خودِ برنامه */
    for (const R of ROLES) {
      const ok = await page.evaluate((arg) => {
        const spec = arg.spec;
        document.documentElement.setAttribute('data-theme', arg.theme);
        const u = (spec.username && db.users.find((x) => x.username === spec.username))
          || (spec.fallbackRole && db.users.find((x) => x.role === spec.fallbackRole))
          || (spec.role && db.users.find((x) => x.role === spec.role));
        if (!u) return null;
        finishLogin(u);
        S.showPicker = false;
        if (typeof closeModal === 'function') closeModal();
        /* حذف هر toast باقیمانده از ورود یا سوئیچ قبلی پس از تست کنتراست خودِ toast */
        render();
        return { username: u.username, role: u.role };
      }, { spec: R.pickSpec, theme });
      if (!ok) { console.log(`  ⚠️ ${theme} ${R.role}: کاربرِ دمو پیدا نشد — رد شد`); continue; }

      const routes = await page.evaluate((max) => {
        const u = S.user;
        const groups = NAV[u.role] || [];
        const out = [];
        for (const g of groups) for (const it of g[1]) { if (out.length < max) out.push(it[0]); }
        return out;
      }, MAX_VIEWS_PER_ROLE);

      for (const route of routes) {
        await page.evaluate((r) => {
          S.route = r; S.filters = {}; S.page = 1; S.stack = [];
          if (typeof closeModal === 'function') closeModal();
          render();
        }, route);
        await settleBeforeScan();
        await scan(theme, R.role, route);
      }
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
    JSON.stringify({
      date: new Date().toISOString(),
      totals: tot,
      rules: Object.values(ruleAgg),
      conditions: { themes: THEMES, viewport: '1280x900', dpr: 1, reduced_motion: 'reduce', tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      results
    }, null, 2));

  console.log('\n  ── قانون‌هایِ نقض‌شده (تجمیعی) ──');
  Object.values(ruleAgg)
    .sort((a, b) => ['critical','serious','moderate','minor'].indexOf(a.impact) - ['critical','serious','moderate','minor'].indexOf(b.impact))
    .forEach((v) => console.log(`   [${v.impact}] ${v.id} — ${v.nodes} node در ${v.views} نما — ${v.help}`));

  console.log(`\n  جمعِ کل: critical=${tot.critical} serious=${tot.serious} moderate=${tot.moderate} minor=${tot.minor}`);
  console.log(`  گزارشِ JSON: out/a11y-runtime.json (${results.length} اسکن)`);

  if (tot.critical || tot.serious) {
    const first = results
      .filter((r) => r.critical || r.serious)
      .flatMap((r) => r.items.filter((i) => i.impact === 'critical' || i.impact === 'serious')
        .slice(0, 1).map((i) => ({
          theme: r.theme, role: r.role, route: r.route, rule: i.id, impact: i.impact,
          node: i.details && i.details[0] ? { target: i.details[0].target, html: i.details[0].html, data: i.details[0].data } : null
        })));
    console.log('A11Y-EVIDENCE ' + JSON.stringify({ totals: tot, first_failures: first.slice(0, 3) }));
    for (let i = 0; i < 10; i++) console.log('');
    console.log('  ❌ قبولی نگرفت: critical/serious باید صفر باشند (شاهد: خطِ A11Y-EVIDENCE بالا).');
    process.exit(1);
  }
  console.log('\n  ✅ قبول: صفر critical، صفر serious.');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });

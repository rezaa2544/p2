#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/reports-pdf-e2e.js — P1-1: تولید PDF از مسیرِ واقعیِ UI
   ───────────────────────────────────────────────────────────────────
   تفاوت با tests/reports-export.js (که دست‌نخورده ماند): آن سوئیت
   سندِ چاپی را خودش در تست می‌سازد؛ اینجا سند دقیقاً همان HTML ای است
   که کاربر می‌بیند — مسیرِ کامل:
     روت reports (canRoute گارد) → render → کلیک «چاپ / PDF»
     (RPT_ACTIONS['rpt-print'] → rptPrint() → printableDoc())
     → HTML ی پنجرهٔ چاپ عیناً گرفته می‌شود → Chromium (playwright-core)
     → page.pdf() → امضای %PDF + متنِ استخراجی از خودِ PDF شاملِ
     نشانگرهایِ tenant (نام مدرسهٔ همان مدیر) و بدونِ نشتِ مدرسهٔ دیگر.
   سناریوها:
     A) مدیرِ مدرسهٔ ۱ (مجاز): PDF واقعی + محتوایِ tenant-scoped
     B) نقشِ غیرمجاز (student): canRoute رد می‌کند، دکمهٔ چاپ در DOM
        نیست و rptPrint هیچ سندی تولید نمی‌کند — رد پیش از تولید PDF.
   قاعدهٔ صداقت (الگوی reports-export): بدونِ playwright-core/Chromium
   بخشِ PDF صراحتاً SKIP می‌شود — سبزِ جعلی ممنوع.
   اجرا: node tests/reports-pdf-e2e.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.error('jsdom نصب نیست — npm i --no-save jsdom'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0, skipped = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}
async function testAsync(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

/* استخراجِ متن از PDF برای یافتنِ نشانگرهایِ tenant.
   مسیرِ اصلی: pdftotext (poppler) — فارسی/RTL را درست درمی‌آورد.
   اگر pdftotext نبود null برمی‌گردد و آزمونِ محتوا صادقانه SKIP می‌شود
   (امضای %PDF و حجم در A4 جدا سنجیده شده‌اند — سبزِ جعلی ممنوع). */
function pdfText(buf) {
  const { execFileSync } = require('child_process');
  const tmp = path.join(os.tmpdir(), 'payesh-pdftxt-' + Date.now() + '.pdf');
  try {
    fs.writeFileSync(tmp, buf);
    const txt = execFileSync('pdftotext', [tmp, '-'], { timeout: 30000 }).toString('utf8');
    return txt;
  } catch (e) {
    return null; /* pdftotext در دسترس نیست */
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error('offline'));
    w.scrollTo = () => {};
    w.URL.createObjectURL = () => 'blob:mock';
    w.URL.revokeObjectURL = () => {};
  }
});

setTimeout(async () => {
  const W = (code) => dom.window.eval(code);

  console.log('\n▸ P1-1 — PDF E2E از مسیرِ واقعیِ UI (روت reports → rptPrint → printableDoc → Chromium)');

  /* ───────── سناریوی A: مدیرِ مدرسهٔ خودش (مجاز) ───────── */
  console.log('\n— سناریوی A: مدیرِ مدرسهٔ ۱ (مجاز)');

  W("S.user = db.users.find(u => u.role === 'manager' && u.school_id === 1);"
    + "SYNC.demoMode = true; S.showPicker = false; S.route = 'reports'; render();");

  test('A1 روت reports برای مدیر مجاز است (canRoute) و رندر شد', () => {
    if (W("canRoute('reports')") !== true) throw new Error('canRoute=false');
    const hasBtn = W("!!document.querySelector('[data-act=\"rpt-print\"]')");
    if (!hasBtn) throw new Error('دکمهٔ «چاپ / PDF» در DOM نیست');
  });

  /* کلیک واقعی روی دکمهٔ چاپ؛ printableDoc پنجرهٔ چاپ باز می‌کند —
     window.open را قلاب می‌کنیم تا HTML ی «واقعاً تولید شده برای کاربر»
     عیناً گرفته شود (نه HTML ی تست‌ساخته). */
  let printedHtml = null;
  test('A2 کلیکِ UI روی «چاپ / PDF» سندِ چاپیِ واقعی تولید کرد (rptPrint → printableDoc)', () => {
    const okStr = W(`(function(){
      var captured = null;
      var origOpen = window.open;
      window.open = function(){
        captured = { html: '' };
        return { document: { write: function(h){ captured.html = h; }, close: function(){} }, print: function(){} };
      };
      rptState().kind = 'attendance';
      var before = db.report_logs.length;
      var btn = document.querySelector('[data-act="rpt-print"]');
      btn.click();                        /* مسیرِ واقعیِ رویداد UI */
      window.open = origOpen;
      return JSON.stringify({
        html: captured ? captured.html : null,
        logged: db.report_logs.length === before + 1,
        format: db.report_logs.length ? db.report_logs[db.report_logs.length-1].format : null
      });
    })()`);
    const o = JSON.parse(okStr);
    if (!o.html) throw new Error('printableDoc باز نشد');
    if (!o.logged || o.format !== 'pdf') throw new Error('ثبتِ report_logs با format=pdf نشد');
    if (o.html.indexOf('size:A4') < 0 || o.html.indexOf('<table>') < 0) throw new Error('سندِ چاپی ناقص');
    printedHtml = o.html;
  });

  const schoolName = W("db.schools.find(s => s.id === 1).name");
  const otherSchool = W("db.schools.find(s => s.id === 2).name");

  test('A3 سندِ چاپی tenant-scoped است (مدرسهٔ مدیر داخل، مدرسهٔ دیگر غایب)', () => {
    if (!printedHtml) throw new Error('سندی از A2 نیست');
    if (printedHtml.indexOf(schoolName) < 0) throw new Error('نام مدرسهٔ مدیر در سند نیست: ' + schoolName);
    if (printedHtml.indexOf(otherSchool) > -1) throw new Error('نشتِ tenant: ' + otherSchool + ' در سند است');
  });

  /* ── Chromium: همان HTML → PDF واقعی ── */
  let chromium = null;
  try { ({ chromium } = require('playwright-core')); } catch (e) {
    try { ({ chromium } = require('playwright')); } catch (e2) {}
  }

  if (!chromium) {
    skipped++;
    console.log('  ⚠️ SKIP: playwright-core نصب نیست — تولید PDF واقعی آزموده نشد (سبزِ جعلی ممنوع)');
  } else {
    await testAsync('A4 همان سندِ UI در Chromium به PDF واقعی تبدیل شد (%PDF + حجم)', async () => {
      const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      try {
        const page = await browser.newPage();
        await page.setContent(printedHtml, { waitUntil: 'load' });
        const out = path.join(os.tmpdir(), 'payesh-rpt-e2e-' + Date.now() + '.pdf');
        await page.pdf({ path: out, format: 'A4' });
        const buf = fs.readFileSync(out);
        fs.unlinkSync(out);
        if (buf.slice(0, 5).toString() !== '%PDF-') throw new Error('امضای %PDF نیست');
        if (buf.length < 3000) throw new Error('PDF مشکوکاً کوچک: ' + buf.length + 'B');
        dom.window.__pdfBuf = buf; /* برای A5 */
      } finally {
        await browser.close();
      }
    });

    const bufA5 = dom.window.__pdfBuf;
    const txtA5 = bufA5 ? pdfText(bufA5) : null;
    if (txtA5 === null) {
      skipped++;
      console.log('  ⚠️ SKIP: pdftotext (poppler) در دسترس نیست — محتوایِ PDF متن‌کاوی نشد (امضا و حجم در A4 سنجیده شد)');
    } else {
      await testAsync('A5 محتوایِ PDF نشانگرِ tenant دارد (نام مدرسهٔ مدیر) و مدرسهٔ دیگر ندارد', async () => {
        if (txtA5.length < 50) throw new Error('استخراج متن PDF ناکافی: ' + txtA5.length + ' نویسه');
        /* pdftotext نویسه‌های کنترلِ جهت (RLE/PDF) لابه‌لای متن می‌گذارد؛
           برای مقایسهٔ پایدار حذف می‌شوند. */
        const clean = (s) => String(s).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
        const hay = clean(txtA5);
        if (hay.indexOf(clean(schoolName)) < 0) throw new Error('نام مدرسهٔ مدیر در متنِ PDF نیست');
        if (hay.indexOf(clean(otherSchool)) > -1) throw new Error('نشتِ tenant در PDF: ' + otherSchool);
      });
    }
  }

  /* ───────── سناریوی B: نقشِ غیرمجاز — رد پیش از تولید PDF ───────── */
  console.log('\n— سناریوی B: دانش‌آموز (غیرمجاز) — رد پیش از هر تولیدی');

  W("S.user = db.users.find(u => u.role === 'student' && u.school_id === 1);"
    + "S.route = 'reports'; S.child = null; S.persona = null; render();");

  test('B1 canRoute برای student روی reports رد می‌کند', () => {
    if (W("canRoute('reports')") !== false) throw new Error('canRoute=true — نباید');
  });

  test('B2 رندرِ روت، صفحهٔ ممنوع است و دکمهٔ چاپ اصلاً در DOM نیست', () => {
    const hasBtn = W("!!document.querySelector('[data-act=\"rpt-print\"]')");
    if (hasBtn) throw new Error('دکمهٔ چاپ برای نقش غیرمجاز رندر شده');
    const out = W("renderRoute()");
    if (typeof out !== 'string' || !out.length) throw new Error('renderRoute خروجی نداد');
    if (out.indexOf('rpt-print') > -1) throw new Error('خروجی روت شامل دکمهٔ چاپ است');
  });

  test('B3 حتی صدازدنِ مستقیم rptPrint برای student سندی با دادهٔ مدرسه تولید نمی‌کند (rptSchools=[])', () => {
    const okStr = W(`(function(){
      var captured = null;
      var origOpen = window.open;
      window.open = function(){
        captured = { html: '' };
        return { document: { write: function(h){ captured.html = h; }, close: function(){} }, print: function(){} };
      };
      var before = db.report_logs.length;
      rptState().kind = 'attendance';
      rptPrint();
      window.open = origOpen;
      var schools = rptSchools();
      return JSON.stringify({
        scopeEmpty: schools.length === 0,
        html: captured ? captured.html : null
      });
    })()`);
    const o = JSON.parse(okStr);
    if (!o.scopeEmpty) throw new Error('rptSchools برای student خالی نیست — نشتِ scope');
    /* دفاع در عمق: اگر پنجره باز شد، نباید هیچ نام مدرسه‌ای در آن باشد */
    if (o.html && (o.html.indexOf(schoolName) > -1 || o.html.indexOf(otherSchool) > -1))
      throw new Error('سند چاپیِ نقش غیرمجاز نام مدرسه دارد — نشتِ tenant');
  });

  console.log('');
  console.log('────────────────────────────────────────────────────');
  console.log(`reports-pdf-e2e: ${pass} سبز / ${fail} قرمز${skipped ? ' / ' + skipped + ' SKIP' : ''} ${fail ? '❌' : '✅'}`);
  process.exit(fail ? 1 : 0);
}, 1700);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/reports-export.js — Wave 23: خروجی گزارش‌ها (CSV + چاپ/PDF)
   ───────────────────────────────────────────────────────────────────
   بخش ۱ (JSDOM):
   - rptCsvData برای هر چهار گزارش: سرستون/ردیف هم‌طول، دادهٔ ناخالی
   - ایمنی تزریق فرمول: نام کلاسِ خصمانه (=cmd) با csvCell خنثی می‌شود
   - rpt-csv اکشن: downloadCSV صدا می‌خورد + ردیف report_logs با
     format='csv' ثبت می‌شود
   - rptPrint: printableDoc باز می‌شود (پنجرهٔ چاپ A4) + ثبت format='pdf'
   بخش ۲ (playwright، در صورت نصب):
   - سند چاپیِ ساخته‌شده از rptCsvData در کرومیوم به PDF واقعی تبدیل
     می‌شود (page.pdf) — سند مسیر «چاپ → PDF». اگر playwright/کرومیوم
     در دسترس نیست، این بخش SKIP اعلام می‌شود (نه سبزِ جعلی).
   اجرا: node tests/reports-export.js
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

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error('offline'));
    w.scrollTo = () => {};
    /* Blob/URL برای downloadCSV */
    w.URL.createObjectURL = () => 'blob:mock';
    w.URL.revokeObjectURL = () => {};
  }
});

setTimeout(async () => {
  const W = (code) => dom.window.eval(code);

  console.log('\n▸ Wave 23 — گزارش‌ها: خروجی CSV و چاپ/PDF');

  W("S.user = db.users.find(u => u.role === 'manager' && u.school_id === 1);"
    + "SYNC.demoMode = true; S.showPicker = false; S.route = 'reports'; render();");

  test('rptCsvData: هر چهار گزارش سرستون و ردیف هم‌طول دارند', () => {
    const okStr = W(`(function(){
      var out = [];
      ['attendance','academic','finance','teachers'].forEach(function(k){
        rptState().kind = k;
        var d = rptCsvData();
        var sameLen = d.rows.every(function(r){ return r.length === d.headers.length; });
        out.push({ kind: k, rows: d.rows.length, sameLen: sameLen });
      });
      return JSON.stringify(out);
    })()`);
    const arr = JSON.parse(okStr);
    for (const o of arr) {
      if (!o.rows) throw new Error(o.kind + ': صفر ردیف');
      if (!o.sameLen) throw new Error(o.kind + ': طول ردیف ≠ سرستون');
    }
  });

  test('ایمنی تزریق فرمول: نام خصمانه با csvCell خنثی می‌شود', () => {
    const cell = W(`(function(){
      /* کلاس خصمانه — فقط در حافظهٔ همین تست */
      var evil = { id: 99999, school_id: 1, name: '=cmd|/C calc!A1', grade: 'دهم' };
      db.classes.push(evil);
      rptState().kind = 'attendance';
      var d = rptCsvData();
      db.classes.pop();
      var row = null;
      d.rows.forEach(function(r){ if (r[1] === '=cmd|/C calc!A1') row = r; });
      if (!row) return '"row-not-found"';
      return JSON.stringify(csvCell(row[1]));
    })()`);
    const v = JSON.parse(cell);
    if (v === 'row-not-found') throw new Error('ردیف کلاس خصمانه ساخته نشد');
    if (v[0] === '=' || (v[0] === '"' && v[1] === '=')) throw new Error('فرمول خنثی نشد: ' + v);
    if (v.indexOf("'=") === -1 && v.indexOf('\t') === -1) throw new Error('الگوی خنثی‌سازی ناشناخته: ' + v);
  });

  test("اکشن rpt-csv: دانلود + ثبت report_logs با format='csv'", () => {
    const okStr = W(`(function(){
      rptState().kind = 'attendance';
      var before = db.report_logs.length;
      var clicks = 0;
      var origClick = HTMLElement.prototype.click;
      HTMLElement.prototype.click = function(){ clicks++; };
      RPT_ACTIONS['rpt-csv']();
      HTMLElement.prototype.click = origClick;
      var last = db.report_logs[db.report_logs.length - 1];
      return JSON.stringify({
        added: db.report_logs.length === before + 1,
        clicked: clicks > 0,
        format: last ? last.format : null,
        kind: last ? last.kind : null
      });
    })()`);
    const o = JSON.parse(okStr);
    if (!o.added) throw new Error('report_logs ثبت نشد');
    if (!o.clicked) throw new Error('لینک دانلود کلیک نشد');
    if (o.format !== 'csv' || o.kind !== 'attendance') throw new Error(JSON.stringify(o));
  });

  test("rptPrint: پنجرهٔ چاپ A4 باز و report_logs با format='pdf' ثبت می‌شود", () => {
    const okStr = W(`(function(){
      var before = db.report_logs.length;
      var opened = null;
      var origOpen = window.open;
      window.open = function(){
        opened = { html: '' };
        return { document: { write: function(h){ opened.html = h; }, close: function(){} }, print: function(){} };
      };
      rptState().kind = 'attendance';
      rptPrint();
      window.open = origOpen;
      var last = db.report_logs[db.report_logs.length - 1];
      return JSON.stringify({
        opened: !!opened,
        a4: opened ? opened.html.indexOf('size:A4') > -1 : false,
        rtl: opened ? opened.html.indexOf('dir="rtl"') > -1 : false,
        hasTable: opened ? opened.html.indexOf('<table>') > -1 : false,
        logged: db.report_logs.length === before + 1,
        format: last ? last.format : null
      });
    })()`);
    const o = JSON.parse(okStr);
    if (!o.opened) throw new Error('پنجرهٔ چاپ باز نشد');
    if (!o.a4 || !o.rtl || !o.hasTable) throw new Error('سند چاپی ناقص: ' + JSON.stringify(o));
    if (!o.logged || o.format !== 'pdf') throw new Error('ثبت pdf نشد: ' + JSON.stringify(o));
  });

  /* ── بخش ۲: PDF واقعی با playwright (در صورت نصب) ─────────────── */
  let chromium = null;
  try { ({ chromium } = require('playwright')); } catch (e) {}

  if (!chromium) {
    skipped++;
    console.log('  ⚠️ SKIP: playwright نصب نیست — تولید PDF واقعی آزموده نشد (سبزِ جعلی ممنوع)');
  } else {
    await testAsync('playwright: سند چاپی گزارش به PDF واقعی تبدیل می‌شود', async () => {
      /* همان جدول CSV → سند A4 مستقل (بدون وابستگی به window.open) */
      const docHtml = W(`(function(){
        rptState().kind = 'attendance';
        var d = rptCsvData();
        var body = '<table><thead><tr>' + d.headers.map(function(h){ return '<th>' + esc(h) + '</th>'; }).join('')
          + '</tr></thead><tbody>'
          + d.rows.map(function(r){ return '<tr>' + r.map(function(c){ return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('')
          + '</tbody></table>';
        return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
          + '<style>@page{size:A4 landscape;margin:12mm}body{font-family:sans-serif}'
          + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px}</style>'
          + '</head><body><h1>گزارش حضور و غیاب ماهانه</h1>' + body + '</body></html>';
      })()`);
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.setContent(docHtml, { waitUntil: 'load' });
        const out = path.join(os.tmpdir(), 'payesh-report-' + Date.now() + '.pdf');
        await page.pdf({ path: out, format: 'A4', landscape: true });
        const buf = fs.readFileSync(out);
        fs.unlinkSync(out);
        if (buf.length < 1000) throw new Error('PDF خیلی کوچک: ' + buf.length);
        if (buf.slice(0, 5).toString() !== '%PDF-') throw new Error('امضای PDF نیست');
      } finally {
        await browser.close();
      }
    });
  }

  console.log('');
  console.log('────────────────────────────────────────────────────');
  console.log(`reports-export: ${pass} سبز / ${fail} قرمز${skipped ? ' / ' + skipped + ' SKIP' : ''} ${fail ? '❌' : '✅'}`);
  process.exit(fail ? 1 : 0);
}, 1700);

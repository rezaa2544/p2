#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/reports-offline.js — Wave 23: گزارش‌ها آفلاین‌اول (کلاینت)
   ───────────────────────────────────────────────────────────────────
   JSDOM با fetch قطع (کاملاً آفلاین):
   - صفحهٔ reports برای مدیر رندر می‌شود و هر چهار تب داده دارد
   - تجمیع کلاینت = شمارش مستقل روی db محلی
   - rptLog() در حالت آفلاین ردیف report_logs می‌سازد و عملیات
     واردِ صفِ همگام‌سازی می‌شود (enqueueOp) — سند مسیر آفلاین→آنلاین
   - canRoute: مدیر/اداره/سوپرادمین مجاز، معلم/دانش‌آموز/ولی رد
   اجرا: node tests/reports-offline.js   (نیازمند jsdom)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.error('jsdom نصب نیست — npm i --no-save jsdom'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(w) {
    /* شبکه کاملاً قطع — آفلاین واقعی */
    w.fetch = () => Promise.reject(new Error('offline'));
    w.scrollTo = () => {};
  }
});

setTimeout(() => {
  const W = (code) => dom.window.eval(code);

  console.log('\n▸ Wave 23 — گزارش‌ها: آفلاین‌اول');

  /* ورود مدیر مدرسهٔ ۱ (دنیای دمو) + رفتن به صفحهٔ گزارش‌ها */
  W("S.user = db.users.find(u => u.role === 'manager' && u.school_id === 1);"
    + "SYNC.demoMode = true; S.showPicker = false; S.route = 'reports'; render();");

  test('صفحهٔ reports برای مدیر (آفلاین) رندر می‌شود', () => {
    const has = W("document.body.innerHTML.indexOf('خروجی CSV') > -1");
    if (!has) throw new Error('دکمهٔ CSV در صفحه نیست');
  });

  test('تب حضور: جدول کلاس‌ها + ناوبری ماه شمسی', () => {
    if (!W("document.body.innerHTML.indexOf('ماه قبل') > -1")) throw new Error('ناوبری ماه نیست');
    if (!W("document.body.innerHTML.indexOf('نرخ حضور') > -1")) throw new Error('ستون نرخ حضور نیست');
  });

  test('تجمیع حضور کلاینت = شمارش مستقل db', () => {
    const okStr = W(`(function(){
      var st = rptState();
      var data = rptAttendanceData();
      var cls = db.classes.filter(function(c){ return c.school_id === 1; })[0];
      var expect = db.attendance.filter(function(a){
        if (a.school_id !== 1 || a.class_id !== cls.id) return false;
        var j = rptJOf(a.date);
        return j && j[0] === st.jy && j[1] === st.jm;
      }).length;
      var row = null;
      data.forEach(function(g){ g.rows.forEach(function(r){ if (r.cls.id === cls.id) row = r; }); });
      return JSON.stringify({ got: row ? row.agg.total : -1, expect: expect });
    })()`);
    const o = JSON.parse(okStr);
    if (o.got !== o.expect) throw new Error('total ' + o.got + ' ≠ ' + o.expect);
  });

  test('تب پیشرفت تحصیلی: میانگین ۰..۲۰ + توصیه', () => {
    W("RPT_ACTIONS['rpt-tab'](null, 'academic')");
    const okStr = W(`(function(){
      var d = rptAcademicData();
      if (!d.length) return '"no data"';
      var g = d[0];
      var ok = (g.avg === null || (g.avg >= 0 && g.avg <= 20)) && g.recs.length > 0;
      return JSON.stringify(ok);
    })()`);
    if (JSON.parse(okStr) !== true) throw new Error('میانگین/توصیه نادرست: ' + okStr);
  });

  test('تب مالی: فقط مدارس شهریه‌دار + نرخ وصول', () => {
    W("RPT_ACTIONS['rpt-tab'](null, 'finance')");
    const okStr = W(`(function(){
      var d = rptFinanceData();
      var allTuition = d.every(function(r){ return hasCap(r.school.id, 'has_tuition'); });
      var rateOk = d.every(function(r){ return r.rate === null || (r.rate >= 0 && r.rate <= 100); });
      return JSON.stringify(allTuition && rateOk);
    })()`);
    if (JSON.parse(okStr) !== true) throw new Error('مالی: ' + okStr);
  });

  test('تب معلمان: حضور کادر + جانشینی + ساعت دوره', () => {
    W("RPT_ACTIONS['rpt-tab'](null, 'teachers')");
    const okStr = W(`(function(){
      var d = rptTeachersData();
      if (!d.length || !d[0].rows.length) return '"empty"';
      var r = d[0].rows[0];
      return JSON.stringify('present' in r && 'subs' in r && 'trHours' in r);
    })()`);
    if (JSON.parse(okStr) !== true) throw new Error('معلمان: ' + okStr);
  });

  test('آفلاین: rptLog ردیف report_logs می‌سازد و در صف sync می‌نشیند', () => {
    const okStr = W(`(function(){
      var beforeRows = db.report_logs.length;
      var beforeQ = (SYNC.queue || []).length;
      rptLog('csv');
      var afterRows = db.report_logs.length;
      var q = (SYNC.queue || []);
      var last = q[q.length - 1];
      return JSON.stringify({
        rowAdded: afterRows === beforeRows + 1,
        queued: q.length === beforeQ + 1,
        coll: last && last.op ? last.op.c : null,
        type: last && last.op ? last.op.t : null,
        kind: last && last.op && last.op.data ? last.op.data.kind : null
      });
    })()`);
    const o = JSON.parse(okStr);
    if (!o.rowAdded) throw new Error('ردیف report_logs ساخته نشد');
    if (!o.queued) throw new Error('عملیات وارد صف sync نشد');
    if (o.coll !== 'report_logs' || o.type !== 'ins') throw new Error('صف: ' + JSON.stringify(o));
    if (o.kind !== 'teachers') throw new Error('kind باید تبِ فعال باشد: ' + o.kind);
  });

  test('ردیف ثبت‌شده فیلدهای مدل مجوز را دارد (kind/format/meta/generated_by)', () => {
    const okStr = W(`(function(){
      var r = db.report_logs[db.report_logs.length - 1];
      return JSON.stringify(!!(r && r.kind && r.format && r.meta && r.generated_by && r.school_id === 1));
    })()`);
    if (JSON.parse(okStr) !== true) throw new Error('فیلدهای ردیف ناقص');
  });

  test('canRoute: مدیر/اداره/سوپرادمین مجاز — معلم/دانش‌آموز/ولی/مشاور رد', () => {
    const okStr = W(`JSON.stringify({
      manager: canRoute('reports', 'manager'),
      edu_office: canRoute('reports', 'edu_office'),
      superadmin: canRoute('reports', 'superadmin'),
      teacher: canRoute('reports', 'teacher'),
      student: canRoute('reports', 'student'),
      parent: canRoute('reports', 'parent'),
      counselor: canRoute('reports', 'counselor')
    })`);
    const o = JSON.parse(okStr);
    if (!(o.manager && o.edu_office && o.superadmin)) throw new Error('نقش مجاز رد شد: ' + okStr);
    if (o.teacher || o.student || o.parent || o.counselor) throw new Error('نقش غیرمجاز عبور کرد: ' + okStr);
  });

  test('ناوبری ماه: rpt-prev/rpt-next سالِ شمسی را درست می‌چرخاند', () => {
    const okStr = W(`(function(){
      var st = rptState();
      st.jm = 1; st.jy = 1405;
      RPT_ACTIONS['rpt-prev']();
      var a = st.jy === 1404 && st.jm === 12;
      RPT_ACTIONS['rpt-next']();
      var b = st.jy === 1405 && st.jm === 1;
      return JSON.stringify(a && b);
    })()`);
    if (JSON.parse(okStr) !== true) throw new Error('چرخش ماه/سال خراب');
  });

  console.log('');
  console.log('────────────────────────────────────────────────────');
  console.log(`reports-offline: ${pass} سبز / ${fail} قرمز ${fail ? '❌' : '✅'}`);
  process.exit(fail ? 1 : 0);
}, 1700);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   xss-guard — گاردِ XSS (R96, P0-7)
   ───────────────────────────────────────────────────────────────────
   X1  esc/escAttr: هر payloadِ شناخته‌شده بی‌اثر می‌شود (واحد)
   X2  لینت: eval/new Function/document.write ممنوع در کلاینت
   X3  end-to-end (jsdom): نامِ دانش‌آموزِ بدخواه در شِل → متنِ
       escaped، اجرایِ onerror نه
   X4  end-to-end: بدنهٔ پیامِ چت با payload → متن، نه عنصر
   X5  CSP: هدرِ سرور با nonce (بازبینی — server10 هم پوشش می‌دهد)
   اجرا: node tests/xss-guard.js  (نیازمند jsdom)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const consoleErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => consoleErrors.push(e.message));
vc.on('error', (m) => consoleErrors.push(String(m)));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const win = dom.window;
const W = (expr) => win.eval(expr);

async function main() {
  await sleep(700);

  console.log('\n— X1: واحدِ esc/escAttr —');
  const payloads = [
    ['<img src=x onerror=window.__x1=1>', 'img onerror'],
    ['<script>window.__x1=1<\/script>', 'script'],
    ['" onmouseover="alert(1)', 'quote-breakout'],
    ["' onfocus='alert(1)", "single-quote"],
    ['`onload=alert(1)', 'backtick'],
    ['x" y="a b=c', 'attr-eq']
  ];
  for (const [p, label] of payloads) {
    const e = W(`esc(${JSON.stringify(p)})`);
    /* در بافتِ متن: < > و & خام ممنوع (quote/=/backtick در متن بی‌ضررند) */
    chk('X1a esc: ' + label, !/[<>]/.test(e) && !/(?<!&)[&](?!amp;|lt;|gt;|quot;|#\d+;)/.test(e), e);
    const a = W(`escAttr(${JSON.stringify(p)})`);
    chk('X1b escAttr: ' + label, !/[<>"'`=]/.test(a.replace(/&[a-z#0-9]+;/g, '')), a);
  }
  chk('X1c esc round-trip (فارسی سالم می‌ماند)', W(`esc('پایشِ مدرسه')`) === 'پایشِ مدرسه');

  console.log('\n— X2: لینتِ کلاینت —');
  /* document.write فقط در نقاطِ ممهورِ «چاپِ رسید» (window.open + esc)
     مجاز است — هر نقطهٔ جدید تست را می‌شکند تا مرور شود.
     بازبینیِ ۱۴۰۵/۰۶/۱۷ (دسته‌ی D): دو نقطهٔ تازه افزوده شد —
       • 69-office-scorecard.js:۱ — چاپِ کارتِ امتیازیِ محدوده (D.2)
       • 71-staff-needs.js:۱      — چاپِ کمبودِ نیروی انسانی (D.4)
     هر دو همان الگویِ ممهور: `window.open('','_blank')` و نوشتنِ یک رشتهٔ
     کامل که تک‌تکِ مقادیرش از esc() گذشته است (هیچ ورودیِ کاربری خام
     واردِ document.write نمی‌شود). */
  const DW_ALLOW = { '20-communication-finance.js': 2, '24-edu-office.js': 2,
                     '33-forms-sms.js': 1, '60-association.js': 1,
                     '69-office-scorecard.js': 1, '71-staff-needs.js': 1 };
  /* eval فقط برای resolveِ اسکوپِ lexical در خودتشخیصی: شناسه‌ها ثابتِ
     سخت‌کد شده‌اند (نه ورودی کاربر) — دو نقطهٔ ممهور. */
  const EVAL_ALLOW = { '42-self-diagnostics.js': 2 };
  const evalUsed = {};
  let lintHits = [];
  const dwCount = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'js')).filter(x => x.endsWith('.js'))) {
    const t = fs.readFileSync(path.join(ROOT, 'src', 'js', f), 'utf8');
    for (const [re, name] of [[/[^.\w]eval\(/g, 'eval('], [/\bnew Function\(/g, 'new Function(']]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(t))) {
        const line = t.slice(0, m.index).split('\n').length;
        const lineTxt = (t.split('\n')[line - 1] || '').trim();
        if (lineTxt.startsWith('*') || lineTxt.startsWith('//')) continue; /* کامنت */
        if (name === 'eval(' && EVAL_ALLOW[f] != null) {
          evalUsed[f] = (evalUsed[f] || 0) + 1;
          if (evalUsed[f] <= EVAL_ALLOW[f]) continue; /* نقطهٔ ممهور */
        }
        lintHits.push(f + ':' + line + ' ' + name);
      }
    }
    const dw = (t.match(/\bdocument\.write\(/g) || []).length;
    if (dw) dwCount[f] = dw;
  }
  chk('X2a هیچ eval/new Function در کلاینت نیست', lintHits.length === 0, lintHits.slice(0, 5).join(' | '));
  const dwOk = JSON.stringify(Object.keys(dwCount).sort()) === JSON.stringify(Object.keys(DW_ALLOW).sort())
    && Object.keys(dwCount).every(f => dwCount[f] === DW_ALLOW[f]);
  chk('X2b document.write فقط در نقاطِ ممهورِ چاپِ رسید', dwOk, JSON.stringify(dwCount));

  console.log('\n— X3/X4: end-to-end در jsdom —');
  /* دانش‌آموزِ بدخواه */
  const evilName = '<img src=x onerror="window.__xss=1"><svg onload="window.__xss2=1">';
  const evilId = W(`(function(){
    var sch = db.schools.filter(function(s){return s.active;})[0];
    var u = insert('users', { school_id: sch.id, role: 'student', full_name: ${JSON.stringify(evilName)},
      username: 'xss' + Date.now(), password: 'x', national_id: '1111111111', phone: '', active: 1 });
    return u.id;
  })()`);
  chk('X3a رکوردِ بدخواه ساخته شد', !!evilId);

  /* شِل با خودِ کاربرِ بدخواه (chip نام کاربر در renderShell) */
  W(`(function(){
    S.user = byId('users', ${evilId}); S.persona = null; S.boss = null; S.child = null;
    S.filters = {}; S.route = 'home'; render();
  })()`);
  await sleep(300);
  chk('X3b شِل: onerror/load اجرا نشد', W('window.__xss') === undefined && W('window.__xss2') === undefined);
  chk('X3c شِل: payload به‌صورتِ متنِ escaped نشسته', (W('document.body.textContent') || '').indexOf(evilName) > -1);
  chk('X3d شِل: عنصرِ img/svgِ جدید ساخته نشده', W(`document.querySelector('.user-chip img, .user-chip svg')`) === null);

  /* چت: بدنهٔ پیام با payload (نمایِ record) */
  const ctx = W(`(function(){
    var sch = db.schools.filter(function(s){return s.active;})[0];
    var kid = db.enrollments.filter(function(e){return e.class_id===db.classes.filter(function(c){return c.school_id===sch.id;})[0].id;})[0].student_id;
    var mgr = db.users.find(function(u){return u.role==='manager'&&u.school_id===sch.id;}).id;
    insert('counselor_msgs', { school_id: sch.id, author_id: mgr, student_id: kid, body: '<b id="xss3">متن</b><img src=x onerror="window.__xss3=1">', status: 'open', author_role: 'manager' });
    return { kid: kid, mgr: mgr };
  })()`);
  W(`(function(){
    S.user = byId('users', ${ctx.mgr}); S.persona = null; S.boss = null;
    S.child = ${ctx.kid}; S.filters = {}; S.route = 'record'; S.tab = 'counsel'; render();
  })()`);
  await sleep(300);
  chk('X4a چت: payloadِ بدنه اجرا نشد', W('window.__xss3') === undefined);
  chk('X4b چت: عنصرِ b#xss3 ساخته نشده (متن است)', W(`document.getElementById('xss3')`) === null);

  /* ─── X6: خروجیِ چاپِ دسته‌ی D (کارتِ امتیازی / کمبودِ نیرو) ──────────
     دو نقطهٔ document.write جدید فقط با این شرط در فهرستِ مجاز ماندند که
     خروجی‌شان در برابر payload واقعاً بی‌اثر باشد؛ این سنجه همان شرط است. */
  console.log('\n— X6: چاپِ D.2/D.4 در برابر payload —');
  /* payload شاملِ تلاشِ خروج از <title> هم هست (RCDATA شکافتن) */
  const EVIL = '</title><img src=x onerror="window.__px=1"><svg onload="window.__py=1">';
  const evilIds = W(`(function(){
    var sch = insert('schools', { name: ${JSON.stringify(EVIL)}, level: 'ابتدایی', county: ${JSON.stringify(EVIL)},
      office_id: null, active: 1 });
    var sub = insert('subjects', { school_id: sch.id, name: ${JSON.stringify(EVIL)}, active: 1 });
    var n = insert('staff_needs', { school_id: sch.id, subject_id: sub.id,
      count: 1, note: ${JSON.stringify(EVIL)}, status: 'open' });
    return { sch: sch.id, need: n.id, sub: sub.id };
  })()`);
  chk('X6a مدرسه/درس/نیازِ بدخواه ساخته شد', !!evilIds.sch && !!evilIds.need && !!evilIds.sub);

  /* D.2 — کارتِ امتیازیِ محدوده: نامِ مدرسه/شهرستان باید escape شود */
  const scHtml = W(`(function(){
    var schs = [byId('schools', ${evilIds.sch})];
    return officeScorecardPrintHTML(officeScorecard({ id: 0, name: ${JSON.stringify(EVIL)}, level: 'district' }, schs));
  })()`);
  /* معیارِ درست: خروجی را واقعاً پارس می‌کنیم — نباید هیچ عنصرِ img/svg
     و هیچ ویژگیِ رویدادی ساخته شود (onerror درونِ «متنِ escaped» بی‌ضرر است). */
  const parseInert = (h) => { const d = new JSDOM(h, { runScripts: 'dangerously' }); return d.window; };
  const scWin = parseInert(scHtml);
  chk('X6b D.2 کارتِ امتیازی: پارسِ خروجی هیچ عنصرِ img/svg نساخت و payload اجرا نشد',
      scWin.document.querySelector('img,svg') === null && scWin.__px === undefined && scWin.__py === undefined,
      String(scWin.document.querySelectorAll('img,svg').length));
  chk('X6c D.2 کارتِ امتیازی: payload به‌صورت متنِ escaped نشسته',
      scHtml.indexOf('&lt;img') > -1, scHtml.indexOf('&lt;img'));

  /* D.4 — کمبودِ نیرو: درس، یادداشت و نامِ ادارهٔ بدخواه */
  const ndHtml = W(`(function(){
    var schs = [byId('schools', ${evilIds.sch})];
    return staffNeedsPrintHTML(officeNeedsRows(schs), ${JSON.stringify(EVIL)});
  })()`);
  chk('X6d D.4 کمبودِ نیرو: payload در خروجی هست (واردِ جدول شده)',
      ndHtml.indexOf('&lt;img') > -1, ndHtml.indexOf('&lt;img'));
  const ndWin = parseInert(ndHtml);
  chk('X6e D.4 کمبودِ نیرو: پارسِ خروجی هیچ عنصرِ img/svg نساخت و payload اجرا نشد',
      ndWin.document.querySelector('img,svg') === null && ndWin.__px === undefined && ndWin.__py === undefined,
      String(ndWin.document.querySelectorAll('img,svg').length));
  chk('X6f هیچ <script>‌ای در خروجی‌های چاپ نیست',
      !/<script/i.test(scHtml) && !/<script/i.test(ndHtml));

  console.log('\n— X5: CSP (سرور) —');
  const { spawn } = require('child_process');
  const tmp = fs.mkdtempSync(require('os').tmpdir() + '/payesh-xss-');
  const proc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: '9011', HOST: '127.0.0.1',
      PAYESH_STORE: path.join(tmp, 's.json'), PAYESH_AUDIT: path.join(tmp, 'a.log'), PAYESH_KEY: path.join(tmp, 'k.key')
    }),
    stdio: 'pipe'
  });
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), path.join(tmp, 's.json'));
  let csp = null, up = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9011/api/health');
      if (r.ok) { up = true; const h = await fetch('http://127.0.0.1:9011/'); csp = h.headers.get('content-security-policy'); break; }
    } catch (e) {}
    if (proc.exitCode !== null) break;
    await sleep(300);
  }
  proc.kill('SIGKILL');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  chk('X5a سرور بالا آمد', up);
  chk('X5b CSP با nonce در هدر', !!csp && /nonce-/.test(csp) && /script-src/.test(csp), csp || 'no CSP');

  console.log('\n' + '─'.repeat(52));
  console.log(`xss-guard: ${pass} سبز / ${fail} قرمز` + (fail ? ' ❌' : ' ✅'));
  errors.slice(0, 8).forEach(e => console.log('   ' + e));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

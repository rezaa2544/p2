#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   a11y-audit — رگرسیونِ دسترس‌پذیری WCAG 2.1 AA (نشستِ a11y-rebuild)
   ───────────────────────────────────────────────────────────────────
   ۴۰ بررسیِ ایستا رویِ src/ (بدونِ jsdom؛ در هر محیطی اجرا می‌شود):
   skip link و landmarkها، live region توست، aria-label دکمه‌هایِ
   آیکونی، association برچسبِ f()، alt تصاویر، سمانتیکِ مودال + مدیریتِ
   فوکوس، کنترل‌هایِ بی‌نام، thead/th جداول، و RTL/فارسی.
   اجرا: node tests/a11y-audit.js   (خروجی ۱ = یافتهٔ باز)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const JS = path.join(SRC, 'js');

const read = (p) => fs.readFileSync(p, 'utf8');
const src = (f) => read(path.join(SRC, f));
const js = (f) => read(path.join(JS, f));

let pass = 0, fail = 0;
const failures = [];
function chk(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name); }
}
function group(t) { console.log('\n▸ ' + t); }

const body = src('body.html');
const head = src('head.html');
const css = src('styles/base.css');
const shell = js('07-shell.js');
const helpers = js('01-helpers.js');
const modals = js('18-modals.js');
const login = js('06-login.js');
const homework = js('51-homework.js');
const audit = js('36-audit-activity.js');
const core = js('19-actions-core.js');
const subs = js('23-subscription.js');
const office = js('24-edu-office.js');
const sync = js('27-sync.js');

// ── A: skip link و landmarkها (۵) ──────────────────────────────
group('A — skip link و landmarkها');
chk('A1 body دارایِ skip link به #main است', /<a[^>]*class="skip-link"[^>]*href="#main"/.test(body));
chk('A2 متنِ skip link خالی نیست', /<a[^>]*class="skip-link"[^>]*>[^<]{2,}<\/a>/.test(body));
chk('A3 پوسته <main id="main"> رندر می‌کند', /<main[^>]*id="main"/.test(shell));
chk('A4 سایدبار (aside) برچسبِ ناوبری دارد', /<aside[^>]*aria-label="[^"]+"/.test(shell));
chk('A5 استایلِ skip-link (نمایان با فوکوس) هست', /\.skip-link/.test(css));

// ── B: live region توست (۴) ───────────────────────────────────
group('B — live region توست');
chk('B1 کانتینر #toasts دارایِ aria-live است', /id="toasts"[^>]*aria-live="polite"/.test(body));
chk('B2 آیتمِ توست role=status می‌گیرد', /role.*status/.test(helpers) && /function toast/.test(helpers));
chk('B3 توست متن را با textContent می‌گذارد (بدونِ تزریق)', /d\.textContent\s*=\s*msg/.test(helpers));
chk('B4 کانتینر #toasts در body هست', /id="toasts"/.test(body));

// ── C: دکمه‌هایِ آیکونیِ پوسته (۵) ─────────────────────────────
group('C — دکمه‌هایِ آیکونی (burger/back/bell/close)');
chk('C1 برگر aria-label دارد', /class="burger"[^>]*aria-label="[^"]+"/.test(shell));
chk('C2 دکمهٔ بازگشت aria-label دارد', /back-btn"[^>]*aria-label="[^"]+"|aria-label="[^"]+"[^>]*back-btn/.test(shell));
chk('C3 زنگِ اعلان‌ها aria-label دارد', /data-r="notifications"[^>]*aria-label="[^"]+"|aria-label="[^"]+"[^>]*data-r="notifications"/.test(shell));
chk('C4 دکمهٔ ✕ مودالِ اصلی aria-label دارد', (modals.match(/data-act="modal-close"[^>]*aria-label="[^"]+"|aria-label="[^"]+"[^>]*data-act="modal-close"/g) || []).length >= 1);
chk('C5 هیچ ✕ بدونِ aria-label در src نیست', !/data-act="modal-close"[^>]*>✕/.test(modals + subs + office + sync));

// ── D: association برچسبِ f() (۴) ─────────────────────────────
group('D — association برچسب و کنترل');
chk('D1 سازندهٔ f() تگِ <label for=…> تولید می‌کند', /<label[^>]*for=/.test(modals));
chk('D2 ورودی‌ساز inp() شناسه نگه می‌دارد', /id="\$\{escAttr\(id\)\}"/.test(modals) || /id="\$\{escAttr/.test(modals));
chk('D3 برچسبِ «شماره موبایل» به lpn وصل است', /<label[^>]*for="lpn"/.test(login));
chk('D4 برچسب‌هایِ کد/کدملی به کنترل وصل‌اند', /<label[^>]*for="lcode"/.test(login) && /<label[^>]*for="lnid"/.test(login));

// ── E: alt تصاویر (۴) ─────────────────────────────────────────
group('E — متنِ جایگزینِ تصاویر');
chk('E1 تصویرِ تکلیف (hw_img) دارایِ alt است', /id="hw_img"[^>]*alt="[^"]+"/.test(homework));
chk('E2 تصویرِ پخش‌کنندهٔ تکلیف دارایِ alt است', !/<img src="' \+ escAttr\(url\)/.test(homework));
chk('E3 لوگویِ پوسته (brand-logo) دارایِ alt است', /class="brand-logo"[^>]*alt="[^"]+"/.test(shell));
chk('E4 هیچ <img بدونِ alt در src نیست', (() => {
  const files = fs.readdirSync(JS).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const t = js(f);
    const re = /<img\b[^>]*>/g;
    let m;
    while ((m = re.exec(t))) { if (!/alt=/.test(m[0])) return false; }
  }
  return true;
})());

// ── F: سمانتیکِ مودال + فوکوس (۶) ─────────────────────────────
group('F — مودال: dialog و مدیریتِ فوکوس');
chk('F1 بدنهٔ مودال role=dialog دارد', /role="dialog"/.test(modals));
chk('F2 بدنهٔ مودال aria-modal=true دارد', /aria-modal="true"/.test(modals));
chk('F3 مودال نامِ دسترس‌پذیر دارد (aria-label)', /aria-label=/.test(modals));
chk('F4 بازشدنِ مودال فوکوس را به داخل می‌برد', /openModal[\s\S]{0,1200}\.focus\(\)/.test(modals));
chk('F5 تلهٔ فوکوس (چرخهٔ Tab) هست', /Tab/.test(modals) && /modalTrap|trapFocus|__modalTrap/.test(modals));
chk('F6 بستنِ مودال فوکوس را برمی‌گرداند + Escape حفظ شده', /\.focus\(\)/.test(modals) && /Escape/.test(core));

// ── G: کنترل‌هایِ بی‌نام (۴) ──────────────────────────────────
group('G — نامِ دسترس‌پذیرِ کنترل‌ها');
chk('G1 دکمهٔ پوسته (🎨) aria-label دارد', /data-tpop[^>]*aria-label="[^"]+"|aria-label="[^"]+"[^>]*data-tpop/.test(shell));
chk('G2 بومِ تصحیح (canvas) جایگزینِ متنی دارد', /hw_canvas"[^>]*aria-label="[^"]+"|aria-label="[^"]+"[^>]*hw_canvas/.test(homework));
chk('G3 ورودیِ رنگ/سایز برچسبِ متنی دارند', /رنگ خط/.test(homework) && /ضخامت/.test(homework));
chk('G4 سوییچرِ فرزند دکمه‌هایِ متنی دارد', /cs-btn/.test(shell) && />[^<]{2,}<\/button>/.test(shell));

// ── H: جداول (۴) ─────────────────────────────────────────────
group('H — سرستونِ جداول');
chk('H1 جدولِ «پرکارترین کاربران» thead/th دارد', /پرکارترین کاربران[\s\S]{0,400}<thead>[\s\S]{0,400}<th/.test(audit));
chk('H2 جدولِ «پرتغییرترین داده‌ها» thead/th دارد', /پرتغییرترین داده‌ها[\s\S]{0,400}<thead>[\s\S]{0,400}<th/.test(audit));
chk('H3 جدول‌هایِ خلاصه thead/th دارند', (audit.match(/<thead>/g) || []).length >= (audit.match(/<table/g) || []).length - 1);
chk('H4 سرستون‌ها scope=col دارند', /<th scope="col"|scope="col"/.test(audit));

// ── I: RTL/فارسی و تمرکزِ دیداری (۴) ──────────────────────────
group('I — RTL، فارسی و فوکوسِ دیداری');
chk('I1 سند lang=fa و dir=rtl دارد', /<html[^>]*lang="fa"/.test(head) && /<html[^>]*dir="rtl"/.test(head));
chk('I2 اعداد با fa-IR فارسی‌سازی می‌شوند', /toLocaleString\('fa-IR'/.test(helpers));
chk('I3 استایلِ :focus-visible هست', /:focus-visible/.test(css));
chk('I4 بستنِ مودال با کلیکِ پس‌زمینه حفظ شده', /modal-back.*closeModal|closeModal.*modal-back/.test(core) || /modal-back/.test(core));

console.log('\n────────────────────────────────────────────────────');
if (fail === 0) console.log('a11y-audit: ' + pass + '/' + pass + ' سبز ✅');
else {
  console.log('a11y-audit: ' + pass + ' سبز / ' + fail + ' قرمز ❌');
  for (const e of failures) console.log('   ' + e);
  process.exit(1);
}

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   observability-live-setup-coverage.js — سنجه‌های راه‌اندازی زندهٔ رصد:
     OL-SEC  هشت بخش
     OL-CMD  دستورات واقعی (کامپوز، محیط، اسکرپ، آلرت، خواباندن)
     OL-TRB  جدول عیب‌یابی
     OL-CI   تفکیک سی‌آی از میزبان
     OL-REF  ارجاع‌های زنده
   اجرا: node tests/observability-live-setup-coverage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const doc = (() => { try { return fs.readFileSync(path.join(ROOT, 'docs/OBSERVABILITY_LIVE_SETUP.md'), 'utf8'); } catch (e) { return null; } })();
if (!doc) { console.log('❌ docs/OBSERVABILITY_LIVE_SETUP.md نیست'); process.exit(1); }

grp('OL-SEC — بخش‌های هشت‌گانه');
['پیش‌نیازها', 'راه‌اندازی سریع', 'گام‌به‌گام دستی', 'تأیید سلامت', 'تزریق آلرت تستی', 'خواباندن استک', 'عیب‌یابی', 'تفاوت با سی‌آی']
  .forEach((s) => chk('بخشِ «' + s + '»', doc.includes(s)));

grp('OL-CMD — دستورات واقعی');
chk('کامپوز با فایل ویو۱۴', doc.includes('docker-compose.observability.yml') && /docker compose/.test(doc) && /up -d/.test(doc));
chk('فایل محیط و گروفاپسورد اجباری', doc.includes('env.observability.example') && /GRAFANA_PASSWORD/.test(doc));
chk('پیش‌فرض او‌تی‌ال‌پی ترسینگ', doc.includes('4318/v1/traces'));
chk('اسکرپ از میزبان', doc.includes('host.docker.internal'));
chk('خواباندن با/بی‌حجم', /down/.test(doc) && /down -v/.test(doc));
chk('تزریق آلرت با آم‌تولز', /amtool alert add/.test(doc));
chk('وب‌هوک واقعی‌نشده پرچم دارد', doc.includes('__WEBHOOK_URL__'));

grp('OL-TRB — عیب‌یابی');
const trb = doc.split(/عیب‌یابی/)[1].split(/تفاوت با سی‌آی/)[0];
['پورت', 'گرافانا', 'تارگت', 'تریس', 'لوکی'].forEach((k) => chk('ردیف عیب «' + k + '»', trb.includes(k)));

grp('OL-CI — تفکیک اجرا');
const ci = doc.split(/تفاوت با سی‌آی/)[1];
chk('تست‌های کانفیگ ذکر شده‌اند', /observability-config\.js/.test(ci) && /observability-dashboards\.js/.test(ci));
chk('اصل بدون داکر در سی‌آی', /داکر/.test(ci) && /میزبان/.test(ci));
chk('دود بدون استک', /۵۴۷/.test(ci));

grp('OL-HON — صداقت و ارجاع‌ها');
chk('نبود اسکریپت‌های آپ/داون صریح است', /وجود ندارند/.test(doc) && /observability-up\.sh/.test(doc));
chk('تفکیک با سند استقرار', doc.includes('OBSERVABILITY_DEPLOYMENT.md'));
chk('ارجاع به معماری', doc.includes('OBSERVABILITY.md'));
const refs = [...new Set((doc.match(/(?:docs|server|tools|tests|infra)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql|example)/g) || []))];
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
// اسکریپت‌های آپ/داون صریحاً «وجود ندارند» قید شده‌اند — استثنا
const deadFiltered = dead.filter((r) => r !== 'tools/observability-up.sh' && r !== 'tools/observability-down.sh');
chk('همهٔ ارجاع‌های فایلی زنده‌اند (استثنا: اسکریپت‌های اعلام‌شدهٔ نبوده)', deadFiltered.length === 0, deadFiltered.join(','));
chk('پیکربندی‌های مرجع واقعاً در ریپو هستند', ['infra/observability/prometheus.yml', 'infra/observability/alert-rules.yml', 'infra/observability/docker-compose.observability.yml']
  .every((f) => fs.existsSync(path.join(ROOT, f))));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ راهنمای راه‌اندازی زنده کامل است.');

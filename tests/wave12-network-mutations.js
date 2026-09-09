#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — ویو ۱۲: شبکه/لبه (Network / Edge)
   هر جهش باید tests/wave12-network.js را بشکاند؛ وگرنه تست بی‌اثر است.
   اجرا (از ریشهٔ ریپو): node tests/wave12-network-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'nginx/nginx.conf': fs.readFileSync('nginx/nginx.conf', 'utf8'),
  'server/index.js': fs.readFileSync('server/index.js', 'utf8'),
  'ci/pending/security-sast-sca.patch': fs.readFileSync('ci/pending/security-sast-sca.patch', 'utf8')
};

const SUITE = 'node tests/wave12-network.js';

const MUTS = [
  {
    file: 'nginx/nginx.conf',
    name: 'M1 بلاکِ لبهٔ سنجاق‌شده حذف شود (کلِ بلوکِ قانون‌ها)',
    badStart: '# wave12-edge-rules:start',
    badEnd: '# wave12-edge-rules:end',
    dropBlock: true,
    expectFail: 'EDGE-0'
  },
  {
    file: 'server/index.js',
    name: 'M2 خطِ HSTS حذف شود',
    bad: "if(https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');",
    mut: "/* MUT: HSTS removed */",
    expectFail: 'HDR-2'
  },
  {
    file: 'ci/pending/security-sast-sca.patch',
    name: 'M3 ممیزیِ وابستگی (SCA) از پچِ در انتظار حذف شود',
    bad: 'npm audit --omit=dev --audit-level=high',
    mut: 'REDACTED # MUT',
    replaceAll: true,
    expectFail: 'CIN-2'
  },
  {
    file: 'server/index.js',
    name: 'M4 ضدِکلیک‌دزدی ضعیف شود (DENY→SAMEORIGIN)',
    bad: "res.setHeader('X-Frame-Options', 'DENY');",
    mut: "res.setHeader('X-Frame-Options', 'SAMEORIGIN'); /* MUT */",
    expectFail: 'HDR-1'
  }
];

function restore() {
  Object.keys(FILES).forEach((f) => fs.writeFileSync(f, FILES[f]));
}

let killed = 0, total = MUTS.length;
console.log('\n▸ جهش‌های ویو ۱۲ — شبکه/لبه (M1–M4)');
try {
  MUTS.forEach((m) => {
    const src = fs.readFileSync(m.file, 'utf8');
    let next = null;
    if (m.dropBlock) {
      const a = src.indexOf(m.badStart);
      const b = src.indexOf(m.badEnd);
      if (a < 0 || b < 0) { console.log('  ⚠️ ' + m.name + ': نشانگر یافت نشد'); return; }
      next = src.slice(0, a) + src.slice(b + m.badEnd.length);
    } else {
      if (src.indexOf(m.bad) < 0) { console.log('  ⚠️ ' + m.name + ': لنگر یافت نشد — جهش اعمال نشد'); return; }
      next = m.replaceAll ? src.split(m.bad).join(m.mut) : src.replace(m.bad, m.mut);
    }
    fs.writeFileSync(m.file, next);
    let out = '', code = 0;
    try { out = execSync(SUITE, { stdio: 'pipe', timeout: 120000 }).toString(); }
    catch (e) { code = (e.status === null ? 1 : e.status); out = ((e.stdout || '') + (e.stderr || '')).toString(); }
    const sawFail = out.indexOf('❌ ' + m.expectFail) >= 0;
    const ok = code !== 0 && sawFail;
    if (ok) { killed++; console.log('  ✅ ' + m.name + ' کشته شد'); }
    else {
      console.log('  ❌ ' + m.name + ' زنده ماند' + (code === 0 ? ' (خروجیِ سوئیت ۰ شد)' : ' (❌ ' + m.expectFail + ' دیده نشد)'));
      const tail = out.split('\n').filter((l) => l.indexOf('❌') >= 0).slice(0, 4);
      if (tail.length) console.log('     ' + tail.join(' | ').slice(0, 300));
    }
    restore();
  });
} finally {
  restore();
}

/* خطِّ پایه باید پس از بازگردانی دوباره سبز باشد */
let baseOk = false;
try { execSync(SUITE, { stdio: 'pipe', timeout: 120000 }); baseOk = true; } catch (e) { baseOk = false; }
if (baseOk) console.log('  ✅ پس از بازگردانی، خطِّ پایه دوباره سبز است');
else { console.log('  ❌ خطِّ پایه پس از بازگردانی سبز نشد'); }

console.log('\n' + '─'.repeat(52));
const allOk = killed === total && baseOk;
console.log('جهش‌های ویو ۱۲: ' + (killed + (baseOk ? 1 : 0)) + '/' + (total + 1) + ' موفق' + (allOk ? ' — بدون خطا ✅' : ' — ' + (total + 1 - killed - (baseOk ? 1 : 0)) + ' ناموفق ❌'));
console.log('─'.repeat(52) + '\n');
process.exit(allOk ? 0 : 1);

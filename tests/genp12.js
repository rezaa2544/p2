/* ─────────────────────────────────────────────────────────────
   genp12.js — رفعِ تداخلِ generateP12 (دور ۱۰۰، نقصِ ۶)
   ─────────────────────────────────────────────────────────────
   ریشهٔ نقص: دو تعریفِ هم‌نام (سال‌گذشتهٔ دبیر در 45 + فاز ۱۲ مشاور
   در 47) — دومی اولی را سایه می‌انداخت و نمرات/حضورِ سال‌گذشته هرگز
   ساخته نمی‌شد. رفع: generatePriorYear + فراخوانیِ دوگانه در بوت و
   بازیابی + نگهبانِ یکتایی در run.js.

   G1 هر دو تابع تعریف‌اند (سایه‌ای در کار نیست)
   G2 دادهٔ سال‌گذشته پس از بوت هست (نمره + حضور)
   G3 دادهٔ فاز ۱۲ مشاور پس از بوت هست (مشاور + ارجاع)
   G4 پس از بازیابیِ پشتیبان، هر دو دسته بازتولید می‌شوند (فراخوانیِ
      دوگانه در restoreBackup)
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n▸ P2-6 — تداخلِ generateP12 (jsdom)');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  chk('G1a هر دو مولد تعریف‌اند',
    W(`typeof generateP12==='function' && typeof generatePriorYear==='function'`) === true);
  chk('G1b دو تابعِ متمایز‌اند (نه یک اشاره‌گر)',
    W(`typeof generatePriorYear==='function' && generateP12!==generatePriorYear`) === true);

  const priorGrades = W(`db.grades.filter(function(g){var y=yearOfDate(g.created_at);return y&&y!==yearCode();}).length`);
  const priorAtt = W(`db.attendance.filter(function(a){var y=yearOfDate(a.date);return y&&y!==yearCode();}).length`);
  chk('G2a پس از بوت: نمرهٔ سال‌گذشته هست (متنِ نقص)', priorGrades > 0, 'n=' + priorGrades);
  chk('G2b پس از بوت: حضورِ سال‌گذشته هست', priorAtt > 0, 'n=' + priorAtt);

  chk('G3a پس از بوت: کاربرِ مشاور هست',
    W(`db.users.some(function(u){return u.role==='counselor';})`) === true);
  chk('G3b پس از بوت: ارجاعِ مشاور هست', W(`db.counselor_refs.length`) > 0);

  /* ── G4: بازیابیِ پشتیبان هر دو دسته را بازتولید می‌کند ── */
  const r = W(`JSON.stringify(restoreBackup(buildBackup()))`);
  chk('G4a بازیابی موفق', JSON.parse(r).ok === true, String(r).slice(0, 160));
  chk('G4b پس از بازیابی: نمرهٔ سال‌گذشته بازتولید شد',
    W(`db.grades.some(function(g){var y=yearOfDate(g.created_at);return y&&y!==yearCode();})`) === true);
  chk('G4c پس از بازیابی: مشاور بازتولید شد',
    W(`db.users.some(function(u){return u.role==='counselor';})`) === true);

  dom.window.close();
  console.log('\ngenp12: ' + okc + '/' + (okc + failc) + (failc ? ' — شکست: ' + fails.join(' | ') : '  ✅'));
  process.exit(failc ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

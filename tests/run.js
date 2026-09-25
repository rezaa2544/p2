#!/usr/bin/env node
/**
 * تست‌های یکپارچگی پروژه پایش
 * اجرا: npm test
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/* P1-GAP-02 (Chat 2 remediation): engines >=22 in package.json is canonical.
   Node >= 22.0.0 is enforced across all test runners and CI jobs. */
(function assertNode22() {
  const major = Number(String(process.versions.node).split('.')[0]);
  if (!(major >= 22)) {
    console.error('✋ Node >= 22.0.0 canonical engine required. Current: ' + process.versions.node);
    console.error('   اجرای تست روی Node < 22 = skip پنهان = سبزِ کاذب — عمداً قرمز می‌شویم.');
    process.exit(1);
  }
})();

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    failures.push({ name, msg: e.message });
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'شرط برقرار نیست');
}

function group(title) {
  console.log(`\n▸ ${title}`);
}

const read = (p) => fs.readFileSync(p, 'utf8');

// ───────────────────────────── ساختار پروژه
group('ساختار پروژه');

['index.html', 'build.js', 'package.json', 'README.md'].forEach((f) => {
  test(`فایل ${f} وجود دارد`, () => assert(fs.existsSync(path.join(ROOT, f))));
});

['src', 'src/js', 'src/styles', 'scripts', 'tests', 'docs'].forEach((d) => {
  test(`پوشه ${d} وجود دارد`, () => assert(fs.existsSync(path.join(ROOT, d))));
});

// ───────────────────────────── ماژول‌ها
group('ماژول‌های منبع');

const order = JSON.parse(read(path.join(SRC, 'js', '_order.json')));

test('_order.json معتبر و غیرخالی است', () => {
  assert(Array.isArray(order) && order.length > 0, 'آرایه نیست یا خالی است');
});

test('همه‌ی ماژول‌های _order.json روی دیسک هستند', () => {
  order.forEach((f) => {
    assert(fs.existsSync(path.join(SRC, 'js', f)), `${f} یافت نشد`);
  });
});

test('هیچ فایل JS خارج از _order.json جا نمانده', () => {
  const onDisk = fs.readdirSync(path.join(SRC, 'js')).filter((f) => f.endsWith('.js'));
  const missing = onDisk.filter((f) => !order.includes(f));
  assert(missing.length === 0, `ثبت‌نشده: ${missing.join(', ')}`);
});

['fonts.css', 'base.css', 'mobile.css'].forEach((f) => {
  test(`استایل ${f} وجود دارد`, () => assert(fs.existsSync(path.join(SRC, 'styles', f))));
});

// ───────────────────────────── صحت build
group('صحت فرآیند build');

/* ترتیبِ این دو سنجه مهم است (C1-05، ۲۰۲۶-۰۹-۱۶ — رفعِ «سبزِ جعلی»):
   پیش‌تر نخست `build.js` در حالتِ **نوشتن** اجرا می‌شد و index.html (و مُهرِ
   USER_GUIDE.html) را بازمی‌ساخت و *بعد* یکسانیِ خروجی با index.html سنجیده
   می‌شد ⇒ سنجه همیشه سبز بود، حتی وقتی آرتیفکتِ کامیت‌شده کهنه باشد.
   شاهدِ واقعی: index.html روی `main` (b44eff9) ۱۱۹۰ کاراکتر از src/ عقب بود و
   اصلاحِ امنیتیِ CodeQL alert #25 (پاک‌سازیِ `<`/`>`) و دو ارتقایِ RNG به crypto
   را نداشت؛ هیچ تستی آن را نگرفت. ضمناً آن بازساختِ خودکار درختِ کاری را آلوده
   می‌کرد و گاردِ «dirty tree → exit 3» در scripts/run-all-tests.sh را می‌شکست.
   اکنون: **اول بررسی (read-only)، بعد ساخت**. */
test('خروجی build با index.html بیت‌به‌بیت یکسان است', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'build.js'), '--check'], { stdio: 'pipe' });
});

test('build.js بدون خطا اجرا می‌شود', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'pipe' });
});

test('dist/payesh.html تولید شده است', () => {
  assert(fs.existsSync(path.join(ROOT, 'dist', 'payesh.html')));
});

// ───────────────────────────── آفلاین بودن
group('تضمین آفلاین بودن');

const html = read(path.join(ROOT, 'index.html'));

test('هیچ ارجاع به http:// یا https:// خارجی در تگ‌ها نیست', () => {
  const bad = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi) || [];
  assert(bad.length === 0, `یافت شد: ${bad.slice(0, 3).join(' | ')}`);
});

test('اسکریپت Cloudflare (cdn-cgi) وجود ندارد', () => {
  assert(!html.includes('cdn-cgi'), 'اسکریپت تزریق‌شده Cloudflare هنوز هست');
});

test('فونت Vazirmatn به‌صورت base64 جاسازی شده', () => {
  assert(html.includes('data:font/woff2;base64,'), 'فونت جاسازی‌شده یافت نشد');
});

test('سرویس‌ورکر هیچ fetch خارجی ندارد (L-04)', () => {
  const sw = read(path.join(ROOT, 'sw.js'));
  const bad = sw.match(/https?:\/\/(?!localhost|127\.0\.0\.1)[^"'\s]+/gi) || [];
  assert(bad.length === 0, `یافت شد: ${bad.slice(0, 3).join(' | ')}`);
});

test('مانیفست فقط دارایی داخلی دارد و آیکن‌ها موجودند (L-05)', () => {
  const mf = JSON.parse(read(path.join(ROOT, 'manifest.json')));
  const urls = JSON.stringify(mf).match(/https?:\/\/[^"'\s]+/gi) || [];
  assert(urls.length === 0, `نشانی خارجی در مانیفست: ${urls.slice(0, 3).join(' | ')}`);
  for (const ic of (mf.icons || [])) {
    const rel = String(ic.src || '').replace(/^\//, '');
    assert(rel && !/^https?:\/\//i.test(rel), `آیکن خارجی: ${ic.src}`);
  }
});

test('هیچ درخواست fetch/XHR به دامنه خارجی نیست', () => {
  const bad = html.match(/(?:fetch|XMLHttpRequest)\s*\(\s*["']https?:\/\//gi) || [];
  assert(bad.length === 0, `یافت شد: ${bad.join(' | ')}`);
});

// ───────────────────────────── محتوای برنامه
group('یکپارچگی برنامه');

test('زبان فارسی و جهت RTL تنظیم شده', () => {
  assert(/<html[^>]*lang="fa"/.test(html), 'lang="fa" نیست');
  assert(/<html[^>]*dir="rtl"/.test(html), 'dir="rtl" نیست');
});

test('هر ۷ نقش کاربری در NAV تعریف شده‌اند', () => {
  ['superadmin', 'manager', 'teacher', 'student', 'parent', 'edu_office', 'counselor'].forEach((r) => {
    assert(new RegExp(`\\b${r}\\s*:\\s*\\[`).test(html), `نقش ${r} در NAV نیست`);
  });
});

test('همه‌ی routeها تابع view متناظر دارند', () => {
  const routes = [...html.matchAll(/case\s+'([a-z_]+)'\s*:\s*return\s+(\w+)\(/g)];
  assert(routes.length >= 25, `فقط ${routes.length} route پیدا شد`);
  routes.forEach(([, route, fn]) => {
    assert(new RegExp(`function\\s+${fn}\\s*\\(`).test(html), `تابع ${fn} برای route «${route}» تعریف نشده`);
  });
});

test('توابع کلیدی تقویم شمسی موجودند', () => {
  ['toJalali', 'toGregorian', 'isLeapJ', 'monthMatrix', 'isoToJalali', 'jalaliToIso'].forEach((f) => {
    assert(new RegExp(`function\\s+${f}\\s*\\(`).test(html), `${f} یافت نشد`);
  });
});

test('نقاط ورود اصلی (render/boot) موجودند', () => {
  ['function render(', 'function renderRoute(', 'function renderShell(', 'function renderLogin('].forEach((s) => {
    assert(html.includes(s), `${s} یافت نشد`);
  });
});

test('تگ‌های HTML متوازن‌اند', () => {
  // در رشته‌های قالبیِ چاپ، تگ بسته به شکل <\\/script> نوشته می‌شود؛ هر دو شکل شمرده می‌شوند
  const open = (html.match(/<script[\s>]/gi) || []).length;
  const close = (html.match(/<\\?\/script>/gi) || []).length;
  assert(open === close, `تگ script نامتوازن: ${open} باز / ${close} بسته`);
  const so = (html.match(/<style[\s>]/gi) || []).length;
  const sc = (html.match(/<\\?\/style>/gi) || []).length;
  assert(so === sc, `تگ style نامتوازن: ${so} باز / ${sc} بسته`);
});

test('سیستم paywall اولیا سالم است', () => {
  // parentLocked به شکل arrow function تعریف شده است
  assert(/(?:function\s+parentLocked\s*\(|parentLocked\s*=\s*\()/.test(html), 'parentLocked تعریف نشده');
  assert(/function\s+viewLocked\s*\(/.test(html), 'viewLocked تعریف نشده');
  assert(html.includes('parentLocked()') , 'paywall در مسیریاب استفاده نشده');
});

test('نام درس همه‌جا با گارد خوانده می‌شود', () => {
  /* 🔴 کشف دور ۴۲: نمره‌ای که درسش حذف شده، پنج صفحه را با
     «Cannot read properties of undefined» می‌شکست. درس حذف
     می‌شود ولی نمره‌اش در پایگاه داده می‌ماند.

     ⚠️ اینجا سنجیده می‌شود نه در tests/smoke.js: سنجش رفتاری
     نیازمند رندر ۸۳ صفحه بود و دقیقه‌ها طول می‌کشید. بررسی ایستا
     همان چیز را در چند میلی‌ثانیه می‌گیرد. */
  const js = order.map((f) => read(path.join(SRC, 'js', f))).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const bad = js.match(/byId\(\s*['"]subjects['"][^)]*\)\s*\.\s*name/g) || [];
  assert(bad.length === 0,
    'دسترسی بی‌گارد به نام درس (' + bad.length + ' مورد): ' + bad.slice(0, 3).join(' · '));
});

test('نام کلاس و کاربر در جدول‌های نمره گارد دارند', () => {
  /* همان دام برای جدول‌هایی که رکورد یتیم می‌گیرند */
  const js = read(path.join(SRC, 'js', '13-grades.js'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const risky = js.match(/byId\(\s*['"](?:classes|users)['"][^)]*\)\s*\.\s*(?:name|full_name)/g) || [];
  assert(risky.length === 0,
    'دسترسی بی‌گارد در جدول نمرات: ' + risky.join(' · '));
});

// ───────────────────────────── نگهبان ماندگاری (دور ۱۰۰، نقصِ ۲)
group('نگهبان add/insert');

test('فراخوانی سراسری add( فقط در مولدهای دادهٔ پایه مجاز است', () => {
  /* add() رکورد را فقط در حافظه می‌نشیند (بی دفترچه و بی صف) و پس از
     بوتِ تازه گم می‌شود؛ مسیرِ کاربر باید insert() باشد (۷ نقطه در
     دورِ ۱۰۰: مهمان/کتاب/امانت/تجهیز/سیدا/دوجو/گواهی). این نگهبان هر
     addِ تازهٔ بیرون از دادهٔ پایه را قرمز می‌کند. */
  const SEED_FN = /(demo|Demo)|^(generateExtras|generateP\d+|generatePriorYear)$/;
  const violations = [];
  order.forEach((f) => {
    if (f === '02-demo-data.js') return; /* تعریف add + دنیای دمو */
    const lines = read(path.join(SRC, 'js', f)).split('\n');
    const scopes = []; /* تابع‌های سطحِ بالا + constهای سطحِ بالا */
    lines.forEach((ln, i) => {
      let m = ln.match(/^function ([A-Za-z_$][\w$]*)/) || ln.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
      if (m) scopes.push({ line: i + 1, name: m[1] });
    });
    const enclosing = (lineNo) => {
      let name = '(سطح فایل)';
      for (const s of scopes) { if (s.line <= lineNo) name = s.name; }
      return name;
    };
    /* addِ محلیِ سایه‌انداز (مثل const add در 12-attendance.js): فقط
       همان حوزه از شمول بیرون است، نه کل فایل */
    const localAddScope = (() => {
      for (let i = 0; i < lines.length; i++) {
        if (/(^|[^A-Za-z0-9_$])(const|let|var|function)\s+add\b/.test(lines[i])) return enclosing(i + 1);
      }
      return null;
    })();
    lines.forEach((ln, i) => {
      const code = ln.replace(/\/\/[^'"]*$/, ''); /* نظرِ خطیِ ساده */
      if (!/(^|[^A-Za-z0-9_$.])add\(\s*['"]/.test(code)) return;
      const scope = enclosing(i + 1);
      if (localAddScope && scope === localAddScope) return;
      if (SEED_FN.test(scope)) return;
      violations.push(`${f}:${i + 1} در ${scope} :: ${ln.trim().slice(0, 70)}`);
    });
  });
  assert(violations.length === 0,
    'فراخوانی add( در مسیر کاربر (باید insert شود):\n     ' + violations.join('\n     '));
});

// ───────────────────────────── نگهبان یکتایی تابع (دور ۱۰۰، نقصِ ۶)
group('نگهبان یکتایی تابع');

test('نامِ تابعِ سطحِ‌بالا در همهٔ ماژول‌ها یکتاست', () => {
  /* نقصِ ۶: دو generateP12 (سال‌گذشتهٔ دبیر در 45 + فاز ۱۲ مشاور در 47) —
     دومی اولی را سایه می‌انداخت و دادهٔ سال‌گذشته هرگز ساخته نمی‌شد.
     این نگهبان هر تعریفِ تکراریِ تازه را قرمز می‌کند. */
  const seen = {};
  const dups = [];
  order.forEach((f) => {
    const lines = read(path.join(SRC, 'js', f)).split('\n');
    lines.forEach((ln, i) => {
      const m = ln.match(/^function ([A-Za-z_$][\w$]*)/);
      if (!m) return;
      if (seen[m[1]]) dups.push(m[1] + ' در ' + seen[m[1]] + ' و ' + f + ':' + (i + 1));
      else seen[m[1]] = f + ':' + (i + 1);
    });
  });
  assert(dups.length === 0, 'تعریفِ تکراریِ تابعِ سطحِ بالا:\n     ' + dups.join('\n     '));
});

// ───────────────────────────── نحو JavaScript
group('صحت نحوی');

test('کد جاوااسکریپت خطای نحوی ندارد', () => {
  const js = order.map((f) => read(path.join(SRC, 'js', f))).join('\n');
  new (require('vm').Script)(js, { filename: 'app.js' });
});

// ───────────────────────────── نتیجه
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`نتیجه: ${pass}/${total} تست موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
console.log('─'.repeat(52) + '\n');

process.exit(fail ? 1 : 0);

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

test('build.js بدون خطا اجرا می‌شود', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'pipe' });
});

test('خروجی build با index.html بیت‌به‌بیت یکسان است', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'build.js'), '--check'], { stdio: 'pipe' });
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

test('هر ۶ نقش کاربری در NAV تعریف شده‌اند', () => {
  ['superadmin', 'manager', 'teacher', 'student', 'parent', 'edu_office'].forEach((r) => {
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
  const open = (html.match(/<script[\s>]/g) || []).length;
  const close = (html.match(/<\\?\/script>/g) || []).length;
  assert(open === close, `تگ script نامتوازن: ${open} باز / ${close} بسته`);
  const so = (html.match(/<style[\s>]/g) || []).length;
  const sc = (html.match(/<\\?\/style>/g) || []).length;
  assert(so === sc, `تگ style نامتوازن: ${so} باز / ${sc} بسته`);
});

test('سیستم paywall اولیا سالم است', () => {
  // parentLocked به شکل arrow function تعریف شده است
  assert(/(?:function\s+parentLocked\s*\(|parentLocked\s*=\s*\()/.test(html), 'parentLocked تعریف نشده');
  assert(/function\s+viewLocked\s*\(/.test(html), 'viewLocked تعریف نشده');
  assert(html.includes('parentLocked()') , 'paywall در مسیریاب استفاده نشده');
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

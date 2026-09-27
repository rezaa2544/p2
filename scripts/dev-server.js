#!/usr/bin/env node
/**
 * سرور توسعه — فایل تک‌فایلی را سرو می‌کند و با هر تغییر در src/ دوباره build می‌گیرد.
 * اجرا:  npm run dev
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/* whitelist مسیرِ درخواست — مانندِ NAME_RE در server/dr.js، یک ثابتِ
   نام‌دار است که پیش از رسیدنِ ورودی به path بررسی می‌شود. */
const URL_PATH_RE = /^\/[A-Za-z0-9_./@:~-]*$/;
const DOTDOT_RE = /(?:^|[/\\])\.\.?(?:[/\\]|$)/;

/* نگهبانِ مسیرِ سروشده: مسیرِ resolve‌شده باید داخلِ ریشهٔ پروژه بماند.
   یک startsWith(ROOT) ساده کافی نیست («/a/b» مسیرِ «/a/bc» را می‌بخشد)،
   پس لنگر با جداکنندهٔ ریشه چک می‌شود. */
function assertServed(p) {
  const root = path.resolve(ROOT);
  if (p !== root && p.indexOf(root + path.sep) !== 0) throw new Error('escape: ' + p);
  return p;
}

let building = false;
function rebuild(reason) {
  if (building) return;
  building = true;
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'inherit' });
    console.log(`   ↳ بازسازی شد (${reason})`);
  } catch (e) {
    console.error('   ✗ خطا در build');
  } finally {
    setTimeout(() => { building = false; }, 150);
  }
}

// تماشای پوشه src
const watchDirs = ['src', 'src/js', 'src/styles'];
watchDirs.forEach((d) => {
  const full = path.join(ROOT, d);
  if (!fs.existsSync(full)) return;
  fs.watch(full, (evt, file) => {
    if (file && !file.startsWith('.')) rebuild(`${d}/${file}`);
  });
});

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '/index.html') urlPath = '/index.html';

  /* whitelist + containment: مسیرِ درخواست ابتدا شکل‌سنجی می‌شود (بدون
     null، بدون قطعهٔ '..'، فقط کاراکترهای مجاز) و سپس resolve‌شده توسطِ
     assertServed داخلِ ریشهٔ پروژه نگه داشته می‌شود. */
  if (!URL_PATH_RE.test(urlPath) || DOTDOT_RE.test(urlPath) || urlPath.indexOf('\0') !== -1) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let filePath;
  try {
    filePath = assertServed(path.resolve(path.resolve(ROOT), '.' + urlPath.replace(/\//g, path.sep)));
  } catch (e) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('یافت نشد');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
});

rebuild('شروع');
server.listen(PORT, HOST, () => {
  console.log(`\n🚀 پایش در حال اجرا: http://${HOST}:${PORT}`);
  console.log('   تغییرات src/ به‌صورت خودکار build می‌شوند.\n');
});

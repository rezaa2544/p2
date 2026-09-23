#!/usr/bin/env node
/**
 * tests/analytics-wiring-guard.test.js
 * نگهبان اتصال رانتایم موتورهای هوشمندی آموزشی (Phase 9.0 Wiring Gate)
 *
 * انگیزه (یافتهٔ F-EI-01): هشت موتور آموزشی در server/analytics/ وجود داشتند
 * که هیچ فایل سروری آن‌ها را require نمی‌کرد. کد «موجود اما مرده» است که
 * در گزارش‌ها به‌اشتباه «پیاده‌سازی‌شده» خوانده می‌شد. این نگهبان تضمین
 * می‌کند که هر ماژول analytics حداقل یک مصرف‌کنندهٔ رانتایم (route یا ماژول
 * سروری) داشته باشد — وگرنه قرمز می‌شود.
 *
 * این تست مستقل است (تنها وابستگی‌اش fs است) تا روی هر Node ای اجرا شود.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ANALYTICS_DIR = path.join(ROOT, 'server', 'analytics');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

// لیست ماژول‌های analytics روی دیسک
const analyticsModules = fs.readdirSync(ANALYTICS_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.replace(/\.js$/, ''));

// فایل‌های سروری که باید موتورها را require کنند (خود analyticsها را در بر نمی‌گیرد)
function serverReferenceSites() {
  const sites = [];
  const serverDir = path.join(ROOT, 'server');
  const queue = [serverDir];
  const seen = new Set();

  while (queue.length > 0) {
    const dir = queue.pop();
    if (seen.has(dir)) continue;
    seen.add(dir);
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        queue.push(full);
      } else if (ent.name.endsWith('.js')) {
        sites.push(full);
      }
    }
  }
  return sites;
}

console.log('\n🔌 نگهبان اتصال موتورهای هوشمندی (Phase 9.0 Wiring Gate)\n');

check('دایرکتوری server/analytics وجود دارد', fs.existsSync(ANALYTICS_DIR));
check('حداقل ۸ موتور analytics روی دیسک هست', analyticsModules.length >= 8,
  `found=${analyticsModules.length}`);

const sites = serverReferenceSites();
const siteContents = sites.map((f) => ({ file: f, text: readText(f) || '' }));

// ── تحلیل اتصال واقعی (Reachability) ───────────────────────────────────
// یک require از یک ماژول یتیم، مسیر زنده‌ای نیست: اگر school-health-dashboard
// خودش به هیچ routeای وصل نباشد، require کردنِ assessment-intelligence توسط آن
// هیچ چیزی را زنده نمی‌کند. پس گراف require را می‌سازیم و فقط ماژول‌هایی را
// «متصل» می‌دانیم که از یک ریشهٔ زنده (فایل سروری غیر-analytics مثل routes)
// قابل دسترسی باشند.
const moduleNames = new Set(analyticsModules);

// ریشه‌ها: فایل‌های سروری خارج از analytics که یک موتور را require می‌کنند.
function analyticsRequiresOf(text) {
  const out = new Set();
  // require('.../analytics/<mod>') یا require('./<mod>') درون analytics
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const spec = m[1];
    const base = spec.split('/').pop().replace(/\.js$/, '');
    if (moduleNames.has(base)) out.add(base);
  }
  return out;
}

// لبه‌های گراف: از هر فایل سروری به موتورهایی که require می‌کند.
const edges = new Map(); // node -> Set(analytics module)
for (const { text, file } of siteContents) {
  const isAnalytics = file.split(path.sep).includes('analytics');
  // یال از فایل غیر-analytics به موتور (ریشهٔ زنده)
  edges.set(file, analyticsRequiresOf(text));
  if (isAnalytics) {
    const base = path.basename(file, '.js');
    if (moduleNames.has(base)) {
      if (!edges.has(base)) edges.set(base, new Set());
      for (const tgt of analyticsRequiresOf(text)) edges.get(base).add(tgt);
    }
  }
}

// BFS از ریشه‌های زنده (فایل‌های غیر-analytics سرور) درون گراف موتورها.
const live = new Set();
const stack = [];
for (const { file } of siteContents) {
  const isAnalytics = file.split(path.sep).includes('analytics');
  if (isAnalytics) continue;
  for (const tgt of edges.get(file) || []) {
    if (!live.has(tgt)) {
      live.add(tgt);
      stack.push(tgt);
    }
  }
}
while (stack.length > 0) {
  const node = stack.pop();
  for (const tgt of edges.get(node) || []) {
    if (!live.has(tgt)) {
      live.add(tgt);
      stack.push(tgt);
    }
  }
}

const orphans = analyticsModules.filter((m) => !live.has(m));
const wired = analyticsModules.filter((m) => live.has(m));

console.log(`\n  📊 موتورها: ${analyticsModules.length} کل | ${wired.length} متصل | ${orphans.length} یتیم\n`);

if (orphans.length > 0) {
  console.log(`  🚨 موتورهای بدون مصرف‌کنندهٔ رانتایم:\n     ${orphans.join('\n     ')}\n`);
}

check(
  'هیچ موتور analytics ای یتیم نیست (هر کدام حداقل یک require واقعی دارد)',
  orphans.length === 0,
  orphans.length
    ? `${orphans.length} موتور مرده: ${orphans.join(', ')} — این‌ها در گزارش‌ها به‌اشتباه «پیاده‌سازی‌شده» محسوب می‌شوند (F-EI-01).`
    : ''
);

// ۸ موتوری که در F-EI-01 نام برده شده بودند باید حالا متصل باشند
const F_EI_01_ENGINES = [
  'semantic',
  'student-timeline',
  'assessment-intelligence',
  'attendance-intelligence',
  'intervention-case-management',
  'school-health-dashboard',
  'parent-360',
  'teacher-evidence'
];
const stillOrphaned = F_EI_01_ENGINES.filter((m) => orphans.includes(m));
check('تمام ۸ موتور F-EI-01 متصل شدند', stillOrphaned.length === 0,
  stillOrphaned.length ? `باقی‌مانده: ${stillOrphaned.join(', ')}` : '');

console.log(`\nنگهبان اتصال: ${pass} pass / ${fail} fail`);
if (fail) {
  failures.forEach((f) => console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
  process.exit(1);
}
console.log('✅ همهٔ موتورهای هوشمندی مسیر رانتایم دارند.');

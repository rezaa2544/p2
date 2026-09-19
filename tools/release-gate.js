#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/release-gate.js — دروازهٔ انتشار: گردآوریِ شواهد Go/No-Go
   ───────────────────────────────────────────────────────────────────
   مرجع: docs/RELEASE_GATE_CHECKLIST.md (۲۸ ردیف، ۵ دروازه).
   این ابزار «شواهد و روش راستی‌آزمایی» همان چک‌لیست را تولید می‌کند:

     ✅ VERIFIED  — همین‌جا راستی‌آزمایی شد (عدد/سوئیت مرجع)
     ⏳ OWNER     — نیازمند کارفرما/زیرساخت است (پنتست، k6، PG واقعی، …)
     ⚠️ GAP       — شکافِ واقعی در مخزن پیدا شد (باید رفع شود)
     ❌ FAILED    — گیتِ راستی‌آزمایی‌پذیر قرمز شد

   دو سطح:
     --skip-boot  — فقط بررسی‌های ایستا (سریع، بدون سرور)
     پیش‌فرض     — ایستا + سوئیت‌های بوتِ واقعی (سرورِ spawnشده)

   قراردادِ سبزشدگی: خروجِ غیرصفر فقط وقتی است که ❌ باشد؛ ⏳/⚠️ گزارش‌اند
   (آمادگیِ انتشار سندِ تصمیم‌گیری کارفرماست، نه گیتِ سختِ مخزن).

   اجرا: node tools/release-gate.js [--skip-boot] [--json]
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const SKIP_BOOT = process.argv.includes('--skip-boot');
const AS_JSON = process.argv.includes('--json');

const rows = []; /* {gate, id, title, status, evidence} */

function row(gate, id, title, status, evidence){
  rows.push({ gate, id, title, status, evidence });
}

/* ── اجرای فرمان با مهلت و خروجیِ مهارشده ─────────────────────────── */
function run(cmd, args, opts){
  const r = spawnSync(cmd, args, Object.assign({
    cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024
  }, opts || {}));
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

/* «سبزِ کاذب» را دزدیدن نکن: پرشِ سوئیت = شکستِ همان ردیف */
const SKIP_MARKERS = ['رد شد', 'موجود نیست', 'jsdom نصب نیست', 'store موجود'];
function suiteGate(gate, id, title, suite, note){
  if(SKIP_BOOT){ row(gate, id, title, 'SKIP', 'پرش (حالتِ --skip-boot)'); return; }
  const t0 = Date.now();
  const r = run(process.execPath, ['tests/' + suite + '.js']);
  const ms = Date.now() - t0;
  const skipped = SKIP_MARKERS.some(m => r.out.indexOf(m) > -1);
  if(r.code === 0 && !skipped){
    const line = r.out.split('\n').filter(l => /✅|موفق|سبز|green/i.test(l)).pop() || '';
    row(gate, id, title, 'VERIFIED',
      (note ? note + ' · ' : '') + '`node tests/' + suite + '.js` خروجی ۰ در ' + (ms / 1000).toFixed(1) + 's — ' + line.trim().slice(0, 90));
  }else if(r.code === 0 && skipped){
    row(gate, id, title, 'FAILED', 'سوئیت بدون اجرای واقعی سبز شد (skip-marker در خروجی) — store را seed کنید: node server/seed.js');
  }else{
    row(gate, id, title, 'FAILED', '`node tests/' + suite + '.js` خروجی ' + r.code + ' — ' + r.out.split('\n').filter(l => /❌/.test(l)).slice(0, 2).join(' | ').slice(0, 160));
  }
}

/* ── ۰. پیش‌نیاز: store سیدشده (سوئیت‌های بوت به آن نیاز دارند) ────── */
function ensureStore(){
  if(SKIP_BOOT) return true;
  if(fs.existsSync(STORE)) return true;
  const r = run(process.execPath, ['server/seed.js']);
  return r.code === 0 && fs.existsSync(STORE);
}

/* ══ دروازهٔ ۱ — امنیت ═════════════════════════════════════════════ */

function gate1(){
  row(1, '1.1', 'رفع P0/P1 + پنتست', 'OWNER',
    'نیازمند پنتستِ بیرونی و امضای CISO — چارچوب: docs/PEN_TEST_CHECKLIST.md (موجود)؛ سوئیت‌های نفوذِ مخزن: tests/security*.js');

  /* 1.2 — مجوزدهیِ متمرکزِ سطحِ فیلد */
  {
    const r = run(process.execPath, ['tools/check-authz.js']);
    const wp = fs.existsSync(path.join(ROOT, 'authz/write-perms.json'));
    let ops = 0, actions = 0;
    try{
      const wpj = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz/write-perms.json'), 'utf8'));
      ops = Object.keys(wpj.ops || {}).length;
      actions = Object.keys(wpj.actions || {}).length;
    }catch(e){}
    row(1, '1.2', 'مجوزدهی متمرکز سطح فیلد', r.code === 0 && wp ? 'VERIFIED' : 'FAILED',
      '`node tools/check-authz.js` = ' + (r.code === 0 ? '۰ ناهمخوانی' : 'خروجی ' + r.code) + ' · write-perms: ' + ops + ' مجموعه · ' + actions + ' اکشنِ نویسنده');
  }

  suiteGate(1, '1.3', 'IDOR / جدایی مدارس (security2)', 'security2', 'بوتِ سرورِ واقعی + ۲۵ چک ازجمله 0600');
  suiteGate(1, '1.4', 'نگهبان ضد شمارش (server1/S25)', 'server1', 'بوتِ سرورِ واقعی، ۳۱ چک ازجمله enum guard');

  /* 1.5 — سخت‌سازی JWT/OTP */
  {
    const idx = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
    const otp = fs.readFileSync(path.join(ROOT, 'server/otp-store.js'), 'utf8');
    const auth = fs.readFileSync(path.join(ROOT, 'server/auth.js'), 'utf8');
    const checks = {
      'کلید ≥۲۵۶ بیت (fail-fast)': idx.indexOf('shorter than 256 bits') > -1,
      'هش OTP (sha256)': /sha256|createHash/.test(otp),
      '.rotation کلید قبلی': idx.indexOf('PAYESH_JWT_SECRET_PREV') > -1,
      'کوکی HttpOnly': auth.indexOf('HttpOnly') > -1,
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    row(1, '1.5', 'سخت‌سازی JWT/OTP (ایستا)', bad.length ? 'GAP' : 'VERIFIED',
      bad.length ? 'غایب: ' + bad.join('، ') : 'کلید ≥۲۵۶ بیت + هش OTP + rotation + HttpOnly — رفتارِ کامل در server1/server17');
  }

  {
    const r = run(process.execPath, ['tests/secret-scan.js']);
    const m = (r.out.match(/(\d+)\/(\d+) سبز/) || [])[0];
    row(1, '1.6', 'اسکن راز (secret-scan)', r.code === 0 ? 'VERIFIED' : 'FAILED', '`node tests/secret-scan.js` ' + (m || 'خروجی ' + r.code));
  }

  /* 1.7 — TLS fail-fast */
  {
    const idx = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
    const tls = idx.indexOf('production requires TLS') > -1;
    const ca = idx.indexOf('self-signed cert detected') > -1;
    row(1, '1.7', 'TLS الزامی + ردِّ Self-Signed در تولید', tls && ca ? 'VERIFIED' : 'GAP',
      tls && ca ? 'fail-fast در PAYESH_ENV=production (گواهیِ CA الزامی) — server13 می‌سنجد' : 'نشانگرهای fail-fast در server/index.js پیدا نشد');
  }

  suiteGate(1, '1.8', 'سرآیندهای امنیتی (server1/S3)', 'server1', 'CSP بدون unsafe-inline + HSTS + nosniff');
}

/* ══ دروازهٔ ۲ — داده و بازیابی ════════════════════════════════════ */

function gate2(){
  suiteGate(2, '2.1', 'مانور بازیابی (restore drill)', 'server8', 'بکاپ→تغییر→restore→دیسک؛ زمانِ اجرا همین‌جا ثبت می‌شود (دادهٔ دمو ~۵.۷MB)');
  row(2, '2.2', 'WAL/PITR پیوسته', 'OWNER', 'نیازمند PostgreSQL واقعی + باکتِ رمزنگاری‌شده (RPO<۵ دقیقه) — زیرساختِ استقرار');
  row(2, '2.3', 'مهاجرت DDL روی ۵۰GB', 'OWNER', 'نیازمند پایگاهِ پایلوت ۵۰ گیگابایتی و پنجرهٔ مهاجرت — tools/migrate-to-pg.js آماده است');
  suiteGate(2, '2.4', 'موتور تعارض (base_version)', 'server15', 'R95: ۱۸ چک conflict/resolve');
  /* 2.5 — سطوح دسترسی فایل‌ها: security2 می‌سنجد؛ اینجا ایستا هم تأیید می‌کنیم */
  {
    const adm = fs.readFileSync(path.join(ROOT, 'server/admin.js'), 'utf8');
    const aud = fs.readFileSync(path.join(ROOT, 'server/audit.js'), 'utf8');
    const ok = adm.indexOf('0o600') > -1 && aud.indexOf('0o600') > -1;
    row(2, '2.5', 'مجوز 0600 فایل‌های ممیزی/پشتیبان', ok ? 'VERIFIED' : 'GAP',
      ok ? '0o600 در admin.js/audit.js (کد) + سنجشِ زندهٔ mode در security2 (S3-B/C)' : 'نشانگر 0o600 پیدا نشد');
  }
}

/* ══ دروازهٔ ۳ — عملکرد ════════════════════════════════════════════ */

function gate3(){
  const evid = [
    'SLOهای p95 (خواندن <300ms / همگام‌سازی <500ms) نیازمند آزمونِ k6 با ۱۰۰K VU روی استیجینگِ واقعی است (نقشهٔ راه: Wave 18).',
    'شواهدِ مخزنِ موجود: docs/NATIONAL_BASELINE_PART2.md (p95 اندپوینت‌ها)، tests/wave9-performance.js (بلاکِ event-loop بکاپ ~۰٫۶ms)، tests/performance/ (سناریوها).',
  ].join(' ');
  ['3.1 خواندن p95<300ms', '3.2 همگام‌سازی p95<500ms', '3.3 نرخ خطا <0.1٪ (soak ۲۴h)', '3.4 cache hit >80٪', '3.5 spike 10x اولِ مهر', '3.6 نشت حافظه ۲۴h']
    .forEach(t => row(3, t.split(' ')[0], t.split(' ').slice(1).join(' '), 'OWNER', evid));
}

/* ══ دروازهٔ ۴ — عملیات ════════════════════════════════════════════ */

function gate4(){
  ['4.1 داشبورد Prometheus/Grafana', '4.2 زنجیره هشدار P0', '4.3 rollback <۲ دقیقه', '4.5 failover دیتاسنتر']
    .forEach(t => row(4, t.split(' ')[0], t.split(' ').slice(1).join(' '), 'OWNER',
      'نیازمند زیرساختِ استقرار (K8s/مانیتورینگ) — بخشِ عملیاتیِ دروازه، خارج از مخزن'));
  /* 4.4 — liveness/readiness: شکافِ واقعی را صادقانه گزارش کن */
  {
    const idx = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
    const health = idx.indexOf("'/api/health'") > -1;
    const live = idx.indexOf('/api/liveness') > -1;
    const ready = idx.indexOf('/api/readiness') > -1;
    row(4, '4.4', 'Liveness/Readiness برای Kubelet',
      health && !live ? 'GAP' : (live && ready ? 'VERIFIED' : 'GAP'),
      health && !live
        ? 'مخزن `/api/health` دارد (وضعیتِ ردیس/کش — قابلِ استفادهٔ readiness) اما `/api/liveness` و `/api/readiness` وجود ندارند؛ تا استقرارِ K8s یا نگاشتِ Probe به /api/health یا افزودنِ اندپوینت‌ها'
        : 'اندپوینت‌ها موجودند');
  }
}

/* ══ دروازهٔ ۵ — حقوقی و حریم خصوصی ════════════════════════════════ */

function gate5(){
  const idx = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
  {
    const f = path.join(ROOT, 'privacy.html');
    const served = fs.existsSync(f) && idx.indexOf("'/privacy'") > -1;
    row(5, '5.1', 'صفحه سیاست حریم خصوصی', served ? 'VERIFIED' : 'GAP',
      served ? 'privacy.html موجود + روتِ `/privacy` و `/privacy.html` (نیازِ Play Store بند 15.3)' : 'فایل یا روت غایب');
  }
  {
    const f = path.join(ROOT, 'account-deletion.html');
    const served = fs.existsSync(f) && idx.indexOf("'/account-deletion'") > -1;
    row(5, '5.2', 'صفحه/فرآیند حذف حساب', served ? 'VERIFIED' : 'GAP',
      served ? 'account-deletion.html + روت + فرآیندِ سروری apiDeleteAccount (server7 می‌سنجد: ۱۵ چک)' : 'فایل یا روت غایب');
  }
  {
    const dir = path.join(ROOT, 'docs/pilot');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')) : [];
    const pending = [];
    for(const f of files){
      const c = fs.readFileSync(path.join(dir, f), 'utf8');
      const n = (c.match(/\[(شماره[^\]]*|ایمیل[^\]]*)\]/g) || []).length;
      if(n) pending.push(f + ' (' + n + ' placeholder)');
    }
    row(5, '5.3', 'فرم‌های پایلوت (رضایت اولیا/معرفی)',
      pending.length ? 'OWNER' : (files.length ? 'VERIFIED' : 'GAP'),
      files.length
        ? (pending.length ? 'placeholderهای تکمیل‌نشده: ' + pending.join('، ') + ' — تکمیل با کارفرما' : 'سه سندِ docs/pilot بدون placeholder')
        : 'docs/pilot غایب');
  }
  suiteGate(5, '5.4', 'ماسک PII در ممیزی', 'audit', '۴۷ چک ماسک/چرخش/تاب‌آوری');
}

/* ══ فرا-بررسی‌ها — بهداشتِ خودِ دروازه ════════════════════════════ */

function meta(){
  /* W1: ورک‌فلوها YAML معتبر — پارسِ کامل اگر js-yaml در دسترس بود، وگرنه
     بررسی‌های ساختاریِ همان کلاسِ باگ (نشانگرِ تضاد، tab، jobs:) */
  {
    const dir = path.join(ROOT, '.github/workflows');
    let yamlLib = null;
    try{ yamlLib = require('js-yaml'); }catch(e){ yamlLib = null; }
    const bad = [];
    for(const f of fs.readdirSync(dir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))){
      const c = fs.readFileSync(path.join(dir, f), 'utf8');
      const structural = c.indexOf('\n\t') === -1 && !/^<{7}/m.test(c) && /^jobs:/m.test(c);
      let parsed = true;
      if(yamlLib){ try{ yamlLib.load(c, { json: true }); }catch(e){ parsed = false; } }
      if(!structural || !parsed) bad.push(f + (parsed ? '' : ' (پارس)'));
    }
    row('W', 'W1', 'ورک‌فلوهای CI = YAML معتبر', bad.length ? 'FAILED' : 'VERIFIED',
      bad.length ? 'نامعتبر: ' + bad.join('، ') : (yamlLib ? 'پارسِ کامل js-yaml روی همهٔ فایل‌ها سبز' : 'ساختاری سبز (بدون tab/تضاد، دارای jobs:) — پارسِ کامل: اعتبارسنجِ زندهٔ CI گیت‌هاب'));
  }
  /* W2: اکشن‌های بیرونیِ شناخته‌شده (کلاسِ باگِ zaproxy/actions-baseline) */
  {
    const KNOWN = [
      /^actions\/checkout@/, /^actions\/setup-node@/, /^actions\/upload-artifact@/,
      /^zaproxy\/action-baseline@/,
      /^github\/codeql-action\//,
      /^codacy\/codacy-analysis-cli-action@/,
      /^fortify\/github-action@/
    ];
    const dir = path.join(ROOT, '.github/workflows');
    const unknown = [];
    for(const f of fs.readdirSync(dir).filter(f => f.endsWith('.yml'))){
      const c = fs.readFileSync(path.join(dir, f), 'utf8');
      for(const m of c.matchAll(/uses:\s*(\S+)/g)){
        const u = m[1].replace(/['"]/g, '');
        if(u.startsWith('./') || u.startsWith('docker://')) continue;
        if(!KNOWN.some(re => re.test(u))) unknown.push(f + ' → ' + u);
      }
    }
    row('W', 'W2', 'اکشن‌های بیرونیِ ورک‌فلو شناخته‌شده', unknown.length ? 'GAP' : 'VERIFIED',
      unknown.length ? 'بازبینی دستی لازم: ' + unknown.join('، ') + ' (سابقه: zaproxy/actions-baseline ناموجود، شکستِ کل ران با صفر job)' : 'فقط اکشن‌های first-party و zaproxy/action-baseline');
  }
  /* W3: ماتریس Node با engines هم‌خوان */
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/node.js.yml'), 'utf8');
    const eng = (pkg.engines && pkg.engines.node) || '';
    const m = wf.match(/node-version:\s*\[([^\]]+)\]/);
    const matrix = m ? m[1] : '';
    const ok = /22/.test(matrix) && !/18|20/.test(matrix) && eng.indexOf('22') > -1;
    row('W', 'W3', 'ماتریس CI ↔ engines صادقانه', ok ? 'VERIFIED' : 'GAP',
      'engines=' + eng + ' · matrix=[' + matrix.trim() + '] — (18/20 با jsdom 30 سبزِ کاذب می‌دادند)');
  }
  /* W4: node_modules/آلودگی در گیت نباشد */
  {
    const r = run('git', ['ls-files', 'node_modules']);
    row('W', 'W4', 'node_modules در گیت نیست', r.out.trim() === '' ? 'VERIFIED' : 'GAP',
      r.out.trim() === '' ? 'ایندکس تمیز' : 'track شده: ' + r.out.trim().slice(0, 100));
  }
  /* W5: دادهٔ اجرایی در گیت نباشد */
  {
    const r = run('git', ['ls-files', 'server/data']);
    const clean = r.out.trim() === '' || r.out.trim().split('\n').every(f => f.endsWith('.gitkeep'));
    row('W', 'W5', 'دادهٔ اجرایی (server/data) در گیت نیست', clean ? 'VERIFIED' : 'GAP',
      clean ? 'فقط .gitkeep (یا خالی) — store/audit/کلید ignored' : 'track شده: ' + r.out.trim().slice(0, 100));
  }
}

/* ══ گزارش ═════════════════════════════════════════════════════════ */

function main(){
  if(!ensureStore()){
    row(0, '0', 'store سیدشده', 'FAILED', 'node server/seed.js نتوانست store بسازد');
  }else if(!SKIP_BOOT){
    row(0, '0', 'store سیدشده', 'VERIFIED', 'server/data/payesh.json موجود (پیش‌نیازِ سوئیت‌های بوت)');
  }

  gate1(); gate2(); gate3(); gate4(); gate5(); meta();

  const cnt = { VERIFIED: 0, OWNER: 0, GAP: 0, FAILED: 0, SKIP: 0 };
  rows.forEach(r => cnt[r.status]++);
  const exitCode = cnt.FAILED > 0 ? 1 : 0;

  if(AS_JSON){
    console.log(JSON.stringify({ summary: cnt, rows }, null, 2));
  }else{
    const icon = { VERIFIED: '✅', OWNER: '⏳', GAP: '⚠️', FAILED: '❌', SKIP: '⏭️' };
    let lastGate = null;
    for(const r of rows){
      if(r.gate !== lastGate){
        console.log('\n▸ ' + ({ 0: 'پیش‌نیاز', 1: 'دروازهٔ ۱ — امنیت', 2: 'دروازهٔ ۲ — داده و بازیابی', 3: 'دروازهٔ ۳ — عملکرد', 4: 'دروازهٔ ۴ — عملیات', 5: 'دروازهٔ ۵ — حقوقی', W: 'فرا-بررسی‌های دروازه' })[r.gate]);
        lastGate = r.gate;
      }
      console.log('  ' + icon[r.status] + ' ' + r.id + ' ' + r.title + ' — ' + r.evidence);
    }
    console.log('\n────────────────────────────────────────────────────');
    console.log('release-gate: ✅ ' + cnt.VERIFIED + ' راستی‌آزمایی‌شده · ⏳ ' + cnt.OWNER + ' با کارفرما/زیرساخت · ⚠️ ' + cnt.GAP + ' شکاف · ❌ ' + cnt.FAILED + ' قرمز' + (cnt.SKIP ? ' · ⏭️ ' + cnt.SKIP + ' پرش' : ''));
    if(cnt.GAP) console.log('⚠️ شکاف‌ها باید پیش از Go-Live رفع شوند (مستند در docs/RELEASE_GATE_EVIDENCE.md)');
    if(!SKIP_BOOT) console.log('سوئیت‌های بوت روی درختِ فعلی اجرا شدند؛ برای PR-چهکِ سبک: node tools/release-gate.js --skip-boot');
  }
  process.exit(exitCode);
}
main();

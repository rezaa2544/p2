#!/usr/bin/env node
/* رگرسیون SUSPECT-B (باگ‌هانت چت ۵، نشست ۲): دو پرچمِ تولید ناهماهنگ.
   ─────────────────────────────────────────────────────────────
   گیتِ ردیس `NODE_ENV` را می‌خواند و گیتِ TLS ‏`PAYESH_ENV` را؛ اگر فقط
   یکی production باشد رفتارِ readiness/health عوض می‌شود و هیچ‌کس
   نمی‌فهمد. یکپارچه‌سازیِ کامل قراردادِ استقرار را عوض می‌کند (نیازمند
   تأیید Wave 15 — تست‌های T2 و redis-fallback §۶ رفتارِ فعلی را پین
   کرده‌اند)، پس این‌جا ناهماهنگی **بلند** می‌شود: هشدارِ بوت + قانونِ
   متعارف در DEPLOY.md. رفتارِ بوت بی‌تغییر.
   بخشِ زنده با PORT=0 (گذرا — بدونِ تداخلِ پورت) و استورِ موقت. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { checkEnvFlags, mismatchWarning, wafModeWarning } = require('../server/env-flags.js');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* بوتِ فرزند با PORT=0؛ خروجی را تا دیدنِ نشانه یا timeout جمع می‌کند. */
async function bootCapture(extraEnv, waitMs) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-envf-'));
  const storeFile = path.join(d, 's.json');
  fs.copyFileSync(REAL_STORE, storeFile);
  const env = Object.assign({}, process.env, {
    PORT: '0', HOST: '127.0.0.1',
    PAYESH_STORE: storeFile,
    PAYESH_AUDIT: path.join(d, 'a.log'),
    PAYESH_KEY: path.join(d, 'k.key'),
    PAYESH_OTP_FILE: path.join(d, 'otp.json'),
    PAYESH_DEMO_CODE: '1'
  }, extraEnv || {});
  delete env.REDIS_URL;
  const p = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (x) => { out += x; });
  p.stderr.on('data', (x) => { out += x; });
  const t0 = Date.now();
  let exited = null;
  p.on('exit', (c) => { exited = c; });
  while (Date.now() - t0 < (waitMs || 25000)) {
    if (exited !== null || out.indexOf('payesh-server (phase 1') >= 0) break;
    await sleep(200);
  }
  await sleep(400); /* فرصتِ تخلیهٔ stderr */
  try { p.kill('SIGKILL'); } catch (e) {}
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
  return { out, exited };
}

(async () => {
  console.log('\n▸ SUSPECT-B — پرچم‌های تولید ناهماهنگ بلند می‌شوند');

  /* ── ۱) خالص ── */
  chk('E1 هیچ‌کدام: تطابق (dev)', checkEnvFlags({}).mismatch === false);
  chk('E2 فقط NODE_ENV: ناهماهنگ', checkEnvFlags({ NODE_ENV: 'production' }).mismatch === true);
  chk('E3 فقط PAYESH_ENV: ناهماهنگ', checkEnvFlags({ PAYESH_ENV: 'production' }).mismatch === true);
  chk('E4 هر دو: تطابق (prod)', checkEnvFlags({ NODE_ENV: 'production', PAYESH_ENV: 'production' }).mismatch === false);
  const w = mismatchWarning(checkEnvFlags({ NODE_ENV: 'production' }));
  chk('E5 متنِ هشدار هر دو گیت را نام می‌برد',
    /NODE_ENV/.test(w) && /PAYESH_ENV/.test(w) && /Redis/i.test(w) && /TLS/.test(w), w.slice(0, 120));

  /* ── Phase 8.1 (R15): هشدارِ بلندِ WAF در حالتِ report زیرِ تولید ── */
  const wafProd = wafModeWarning({ NODE_ENV: 'production' });
  chk('E12 تولید + WAF=report ⇒ هشدارِ بلند دارد',
    !!wafProd && /PAYESH_WAF_MODE=enforce/.test(wafProd) && /RISK-S-007/.test(wafProd), String(wafProd).slice(0, 140));
  chk('E13 تولید + WAF=enforce ⇒ بدونِ هشدار',
    wafModeWarning({ NODE_ENV: 'production', PAYESH_WAF_MODE: 'enforce' }) === null);
  chk('E14 توسعه ⇒ بدونِ هشدارِ WAF',
    wafModeWarning({ NODE_ENV: 'development' }) === null);

  /* ── ۲) سیم‌کشیِ بوت (فرزندِ زنده) ── */
  const m1 = await bootCapture({ NODE_ENV: 'production' }, 25000);
  chk('E6 بوتِ فقط-NODE_ENV هشدارِ ناهماهنگی می‌دهد', /production-flag mismatch/.test(m1.out), m1.out.slice(0, 200));
  /* Phase 8.1 (R5) contract alignment: this shape (NODE_ENV=production, no
     DATABASE_URL, no REDIS_URL) now dies at the FIRST production gate — the
     PostgreSQL backing-store gate — an equally fail-closed death. The
     cache-gate-specific fail-fast is deterministically covered by
     tests/r5-prod-redis-boot-gate.js shape 1 (NODE_ENV + live PG + no
     REDIS_URL ⇒ [FATAL] Cache readiness failed). */
  chk('E7 همان بوت fail-closed می‌میرد (درگاهِ تولید: PostgreSQL یا Cache)',
    m1.exited !== null && m1.exited !== 0 && /\[FATAL\]/.test(m1.out) && /(Cache readiness|Database readiness|DATABASE_URL required|requires PostgreSQL)/i.test(m1.out), 'exit=' + m1.exited);

  const m2 = await bootCapture({ NODE_ENV: '', PAYESH_ENV: 'production', PAYESH_BEHIND_PROXY: '1' }, 25000);
  chk('E8 بوتِ فقط-PAYESH_ENV هشدارِ ناهماهنگی می‌دهد', /production-flag mismatch/.test(m2.out), m2.out.slice(0, 200));
  /* Phase 8.1 (R5) contract alignment (was already failing at baseline):
     PAYESH_ENV=production without DATABASE_URL and WITHOUT the explicit
     ALLOW_MEMORY_FALLBACK=1 opt-in must NOT boot (P0-1: production never
     serves from the per-process JSON store implicitly). The boots-anyway
     shape — PAYESH_ENV + the explicit opt-in flag — is pinned by
     tests/r5-prod-redis-boot-gate.js shape 4 and server17 T2. */
  chk('E9 بوتِ فقط-PAYESH_ENV بدونِ opt-in صریح نمی‌آید (P0-1 حفظ شده)',
    m2.exited !== null && m2.exited !== 0 && !/payesh-server \(phase 1/.test(m2.out), 'exit=' + m2.exited);

  const m3 = await bootCapture({ NODE_ENV: '', PAYESH_ENV: '' }, 25000);
  chk('E10 بوتِ توسعه بالا می‌آید', m3.out.indexOf('payesh-server (phase 1') >= 0);
  chk('E11 در بوتِ توسعه هشدارِ ناهماهنگی نیست', !/production-flag mismatch/.test(m3.out));

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });

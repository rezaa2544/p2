/* ─────────────────────────────────────────────────────────────
   server3.js — آزمایشِ سر به سر (E2E) «اتصال به سرور»
   ─────────────────────────────────────────────────────────────
   برخلاف server2 که fetch را استاب می‌کند، این آزمون **سرورِ واقعی**
   را spawn می‌کند (server/index.js با store موقت) و کلاینتِ واقعی را
   در jsdom روی همان سرور اجرا می‌کند — فقط یک پل: window.fetch به
   fetchِ واقعیِ نود وصل است + یک قوطیِ کوکی (Node fetch کوکی را
   خودکار نگه نمی‌دارد؛ مرورگر می‌دارد). یعنی:

     مرورگر (jsdom) ⇄ HTTP واقعی ⇄ سرورِ واقعی ⇄ فایلِ store

   سناریو:
     S1  سرور HTML را با nonceِ CSP سرو می‌کند
     S2  کلاینت سرور را تشخیص می‌دهد (DATA_MODE=server, demoMode=false)
     S3  جریانِ واقعیِ ورود: send-code → کدِ دموی بازتاب‌شده → login
         → کوکیِ نشست در قوطی
     S4  /api/auth/me با همان کوکی → همان کاربر
     S5  تغییرِ داده در کلاینت → صفِ آفلاین → flush واقعی →
         رکورد در **فایلِ store سرور** روی disk + آدیت
     S6  خروج → نشست باطل (jti) — کوکیِ همان قوطی بعد از خروج
         روی /me با 401 پاسخ می‌گیرد
     S7  کدِ اشتباه → رد (پیامِ فارسی، ورود نمی‌شود)
   ───────────────────────────────────────────────────────────── */
const { spawn } = require('child_process');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORTS = [8931, 8932, 8933];

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function waitHealth(base, timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    (function tick() {
      const req = http.get(base + '/api/health', (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => resolve(true));
      });
      req.on('error', () => {
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(tick, 300);
      });
    })();
  });
}

async function main() {
  /* ── آماده‌سازی: store موقت + سرورِ واقعی ── */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-e2e-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }); /* پاک‌سازیِ tmp تا /tmp پر نشود */
  const storeFile = path.join(tmp, 'payesh.json');
  const auditFile = path.join(tmp, 'audit.log');
  const keyFile = path.join(tmp, 'jwt.key');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);

  let port = null, srv = null;
  for (const p of PORTS) {
    srv = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        PORT: String(p), HOST: '127.0.0.1',
        PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile,
        PAYESH_KEY: keyFile, PAYESH_DEMO_CODE: '1'
      }),
      stdio: 'ignore'
    });
    const base = 'http://127.0.0.1:' + p;
    if (await waitHealth(base, 12000)) { port = p; break; }
    srv.kill('SIGKILL');
  }
  if (!port) { console.error('FATAL — سرور بالا نیامد'); process.exit(1); }
  const base = 'http://127.0.0.1:' + port;
  console.log('  ⓘ سرورِ واقعی روی ' + base + ' (store موقت: ' + tmp + ')');

  /* ── S1: سرویِ HTML با nonce ── */
  const htmlRes = await fetch(base + '/');
  const html = await htmlRes.text();
  const csp = htmlRes.headers.get('content-security-policy') || '';
  const cspNonce = (csp.match(/'nonce-([A-Za-z0-9+/=]+)'/) || [])[1];
  chk('S1a — سرور HTML را سرو می‌کند', htmlRes.ok && html.length > 100000, String(html.length));
  chk('S1b — CSP با nonce (بدون unsafe-inline)', !!cspNonce && !/unsafe-inline/.test(csp), csp.slice(0, 90));
  chk('S1c — nonceٔ همان درخواست در HTML (جای‌نکهدار نمانده)', !!cspNonce && html.includes('nonce="' + cspNonce + '"') && !html.includes('__PAYESH_NONCE__'));

  /* ── پلِ fetch واقعی + قوطیِ کوکی ── */
  const jar = new Map();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: base + '/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = function (input, opts) {
        const u = new URL(input, base);
        const headers = new Headers(opts && opts.headers);
        if (jar.size) headers.set('Cookie', Array.from(jar.entries()).map(([k, v]) => k + '=' + v).join('; '));
        return fetch(u.toString(), {
          method: (opts && opts.method) || 'GET',
          headers: headers,
          body: opts && opts.body
        }).then(async (res) => {
          try {
            const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
            sc.forEach((c) => {
              const pair = c.split(';')[0];
              const i = pair.indexOf('=');
              const k = pair.slice(0, i).trim();
              const v = pair.slice(i + 1).trim();
              if (v === '' || /Max-Age=0/.test(c)) jar.delete(k); else jar.set(k, v);
            });
          } catch (e) {}
          return res;
        });
      };
    }
  });
  const W = (c) => dom.window.eval(c);

  await sleep(3000);

  /* ── S2: تشخیصِ سرور ── */
  chk('S2a — DATA_MODE=server (از /api/health واقعی)', W('DATA_MODE') === 'server');
  chk('S2b — SYNC.demoMode=false + serverUrl', W('SYNC.demoMode') === false && W('SYNC.serverUrl') === '/api/sync');

  const su = W('db.users.find(function(x){return x.username==="superadmin";})');
  const sid = W('db.schools[0].id');

  /* ── S3: ورودِ واقعی ── */
  W(`(function(){
    document.getElementById('lpn').value=${JSON.stringify(su.phone)};
    document.getElementById('lnid').value=${JSON.stringify(su.national_id)};
    document.querySelector('[data-act="login-code"]').click();
  })()`);
  await sleep(900);
  const demoCode = (W(`document.getElementById('ldemo').textContent`) || '').match(/(\d{4,6})/); /* R101: کد ۶ رقمی شد */
  chk('S3a — کدِ دمو از سرور واقعی بازتاب شد', !!demoCode, W(`(document.getElementById('ldemo')||{}).textContent||''`));
  if (demoCode) {
    W(`document.getElementById('lcode').value=${JSON.stringify(demoCode[1])}`);
    W(`document.querySelector('[data-act="login"]').click()`);
    await sleep(1000);
  }
  chk('S3b — ورود موفق: S.user=superadmin', W('S.user && S.user.username') === 'superadmin');
  chk('S3c — کوکیِ نشست در قوطی (HttpOnly از سرور آمد)', jar.has('payesh_session'));
  chk('S3d — نشستِ محلی هم ذخیره شد', W('Store.get("sms_session_v1")') === 'superadmin');

  /* ── S4: /me با همان کوکی ── */
  const me = await W(`Api.get('/api/auth/me',{raw:true})`);
  chk('S4 — /me با کوکیِ واقعی: همان کاربر', me && me.status < 400 && me.body && me.body.ok && me.body.user && me.body.user.id === W('S.user.id'), JSON.stringify(me));

  /* ── S5: تغییرِ داده → flush واقعی → فایلِ store ── */
  const nid = W(`(function(){ var r = insert('notifications', {school_id:${sid}, title:'e2e', body:'آزمونِ سر به سر', role:'manager'}); return r.id; })()`);
  await sleep(3000);
  chk('S5a — صفِ آفلاین خالی شد (synced)', W('SYNC.queue.length') === 0, 'queue=' + W('SYNC.queue.length'));
  chk('S5b — lastSync تنظیم شد', W('typeof SYNC.lastSync==="string"') === true);
  const disk = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const found = (disk.notifications || []).some((n) => n.id === nid);
  chk('S5c — رکورد در فایلِ store سرور (روی disk)', found, 'id=' + nid);
  const auditTxt = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
  chk('S5d — آدیتِ سرور ثبت شد', /sync/.test(auditTxt));

  /* ── S6: خروج → سلبِ jti (کوکیِ همان قوطی باید 401 بگیرد) ── */
  W(`document.querySelector('[data-act="logout"]').click()`);
  await sleep(800);
  chk('S6a — خروج: S.user=null', W('S.user') === null);
  const meAfter = await fetch(base + '/api/auth/me', { headers: { Cookie: 'payesh_session=' + jar.get('payesh_session') } });
  chk('S6b — کوکیِ قبل از خروج بعد از خروج 401 می‌گیرد (jti)', meAfter.status === 401, String(meAfter.status));

  /* ── S7: کدِ اشتباه → رد ── */
  W(`(function(){
    document.getElementById('lpn').value=${JSON.stringify(su.phone)};
    document.getElementById('lnid').value=${JSON.stringify(su.national_id)};
    document.querySelector('[data-act="login-code"]').click();
  })()`);
  await sleep(900);
  W(`(function(){
    document.getElementById('lcode').value='0000';
    document.querySelector('[data-act="login"]').click();
  })()`);
  await sleep(1000);
  chk('S7a — کدِ اشتباه: ورود نمی‌شود', W('S.user') === null);
  chk('S7b — پیامِ خطا روی فرم', ((W(`(document.getElementById('lerr')||{}).textContent||''`)) || '').includes('کد'));

  /* ── S8: تغییرِ داده در حالتِ خارج (بدون نشست) در حالت سروری صف نمی‌شود ── */
  const qBefore = W('SYNC.queue.length');
  W(`(function(){ insert('notifications', {school_id:${sid}, title:'x', body:'باید صف نشود'}); })()`);
  await sleep(300);
  chk('S8 — عملیاتِ بی‌هویت در حالت سروری وارد صف نمی‌شود', W('SYNC.queue.length') === qBefore, 'queue=' + W('SYNC.queue.length') + ' before=' + qBefore);

  /* ── ختم ── */
  dom.window.close();
  srv.kill('SIGKILL');
  await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log('\n' + '─'.repeat(56));
  const total = okc + failc;
  console.log(`server3 (سر به سرِ واقعی): ${okc}/${total} — ✅ ${okc} · ❌ ${failc}`);
  if (failc) { console.log('فشل:'); fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('همهٔ تست‌های سر به سر سبز ✅');
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

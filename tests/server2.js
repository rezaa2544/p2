/* ─────────────────────────────────────────────────────────────
   server2.js — لایهٔ کلاینتِ «اتصال به سرور» (مرحلهٔ ۱)
   ─────────────────────────────────────────────────────────────
   سه حالتِ کلاینت:
     A) فایلِ محلی (about:blank) → هیچ درخواستی نمی‌رود، آفلاین می‌ماند
     B) سرو از سرور + سرور زنده → DATA_MODE=server، SYNC.demoMode=false
     C) سرو از سرور + سرور مرده → آفلاینِ امن (بدون خطا)
   و جریانِ ورود/خروج با مسیرِ سروری:
     D) ورود موفق → کاربر با id پاسخِ سرور از دادهٔ محلی گرفته می‌شود
     E) خطای سرور → همان پیامِ فارسیِ هم‌شکل با خطاهای محلی
     F) خروج → POST /api/auth/logout (سلبِ نشست در سرور)
     G) نشستِ محلیِ باقی‌مانده + /me بدون کوکی → نشست پاک می‌شود
   fetch در jsdom استاب است — هیچ ترافیک واقعی‌ای وجود ندارد.
   ───────────────────────────────────────────────────────────── */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jres = (obj, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => obj, headers: { get: () => null } });

/* rules: path → {status, body} | {reject:'msg'} | fn(window)=>response */
async function boot(opts) {
  const log = [];
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: opts.url || 'about:blank',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.__log = log;
      w.fetch = function (url, o) {
        const p = String(url).split('?')[0];
        log.push((o && o.method || 'GET') + ' ' + p);
        const rule = (opts.rules || {})[p];
        if (!rule) return Promise.resolve(jres({}, 404));
        if (typeof rule === 'function') return Promise.resolve(rule(w));
        if (rule.reject) return Promise.reject(new Error(rule.reject));
        return Promise.resolve(jres(rule.body || {}, rule.status));
      };
      if (opts.session) w.localStorage.setItem('sms_session_v1', opts.session);
    }
  });
  await sleep(opts.wait || 1700);
  return { dom, W: (c) => dom.window.eval(c), log };
}

function fillLogin(t, code) {
  t.W(`(function(){
    var u=db.users.find(function(x){return x.username==="superadmin";});
    document.getElementById('lpn').value=u.phone;
    document.getElementById('lnid').value=u.national_id;
    document.getElementById('lcode').value=${JSON.stringify(code || '9999')};
  })()`);
}
/* a login responder that returns the superadmin's own id (like the real server) */
function loginOkBySuperadmin() {
  return (w) => jres({ ok: true, user: { id: w.eval('db.users.find(function(x){return x.username==="superadmin";}).id') } });
}

(async () => {
  console.log('\n▸ A — حالت آفلاین (فایل محلی)');
  {
    const t = await boot({ url: 'about:blank', rules: { '/api/health': { body: { ok: true } } } });
    chk('A1 — file://: DATA_MODE باقیِ local', t.W('DATA_MODE') === 'local');
    chk('A2 — file://: هیچ درخواستی نرفت', t.log.length === 0, JSON.stringify(t.log));
    chk('A3 — file://: SYNC.demoMode باقیِ true', t.W('SYNC.demoMode') === true);
    t.dom.window.close();
  }

  console.log('\n▸ B — سرو از سرور، سرور زنده');
  {
    const t = await boot({ url: 'http://localhost/', rules: {
      '/api/health': { body: { ok: true } },
      '/api/auth/me': { status: 401, body: { ok: false, code: 'no_session' } }
    } });
    chk('B1 — /api/health پرسیده شد', t.log.some(x => x.endsWith('/api/health')));
    chk('B2 — DATA_MODE=server', t.W('DATA_MODE') === 'server');
    chk('B3 — SYNC.demoMode=false', t.W('SYNC.demoMode') === false);
    chk('B4 — SYNC.serverUrl=/api/sync', t.W('SYNC.serverUrl') === '/api/sync');
    chk('B5 — /api/auth/me بررسی شد', t.log.some(x => x.endsWith('/api/auth/me')));
    t.dom.window.close();
  }

  console.log('\n▸ C — سرو از سرور، سرور مرده');
  {
    const t = await boot({ url: 'http://localhost/', rules: { '/api/health': { reject: 'offline' } } });
    chk('C1 — DATA_MODE باقیِ local', t.W('DATA_MODE') === 'local');
    chk('C2 — SYNC.demoMode باقیِ true', t.W('SYNC.demoMode') === true);
    chk('C3 — بدون فروپاشی (صفحه سالم)', t.W('db.schools.length') === 6);
    t.dom.window.close();
  }

  console.log('\n▸ D — ورود با مسیرِ سروری (موفق)');
  {
    const t = await boot({ url: 'http://localhost/', rules: {
      '/api/health': { body: { ok: true } },
      '/api/auth/me': { status: 401, body: { ok: false, code: 'no_session' } },
      '/api/auth/login': loginOkBySuperadmin()
    } });
    fillLogin(t);
    t.W(`document.querySelector('[data-act="login"]').click()`);
    await sleep(700);
    const su = t.W('db.users.find(function(x){return x.username==="superadmin";})');
    chk('D1 — S.user = همان حسابِ محلی (با id پاسخِ سرور)', t.W('S.user && S.user.username') === 'superadmin');
    chk('D2 — نشست ذخیره شد', t.W('Store.get("sms_session_v1")') === su.username);
    chk('D3 — روت خانهٔ درست', t.W('S.route') === 'dashboard');
    t.dom.window.close();
  }

  console.log('\n▸ E — ورود: خطای سرور (no_account)');
  {
    const t = await boot({ url: 'http://localhost/', rules: {
      '/api/health': { body: { ok: true } },
      '/api/auth/me': { status: 401, body: { ok: false, code: 'no_session' } },
      '/api/auth/login': { status: 401, body: { ok: false, code: 'no_account' } }
    } });
    fillLogin(t);
    t.W(`document.querySelector('[data-act="login"]').click()`);
    await sleep(700);
    chk('E1 — پیامِ فارسیِ «یافت نشد» روی فرم', ((t.W(`(document.getElementById('lerr')||{}).textContent||''`)) || '').includes('یافت نشد'));
    chk('E2 — S.user باقیِ null', t.W('S.user') === null);
    chk('E3 — نشست ساخته نشد', t.W('Store.get("sms_session_v1")') === null);
    t.dom.window.close();
  }

  console.log('\n▸ F — خروج: POST /api/auth/logout');
  {
    const t = await boot({ url: 'http://localhost/', rules: {
      '/api/health': { body: { ok: true } },
      '/api/auth/me': loginOkBySuperadmin(),
      '/api/auth/login': loginOkBySuperadmin(),
      '/api/auth/logout': { body: { ok: true } }
    } });
    /* bootstrap /me already logged in the superadmin — verify, then log out */
    const loggedIn = t.W('S.user && S.user.username') === 'superadmin';
    t.W(`document.querySelector('[data-act="logout"]').click()`);
    await sleep(600);
    chk('F1 — پیش‌شرط: ورودِ خودکارِ سرور موفق بود', loggedIn);
    chk('F2 — POST /api/auth/logout رفت', t.log.some(x => x === 'POST /api/auth/logout'), t.log.join(' | '));
    chk('F3 — S.user پاک شد', t.W('S.user') === null);
    chk('F4 — نشست محلی پاک شد', t.W('Store.get("sms_session_v1")') === null);
    t.dom.window.close();
  }

  console.log('\n▸ G — نشستِ محلیِ باقی‌مانده + /me بدون کوکی → پاک');
  {
    const t = await boot({ url: 'http://localhost/', session: 'superadmin', rules: {
      '/api/health': { body: { ok: true } },
      '/api/auth/me': { status: 401, body: { ok: false, code: 'no_session' } }
    } });
    chk('G1 — ورودِ خودکارِ دمو برگشت، سرور آن را باطل کرد', t.W('S.user') === null);
    chk('G2 — SESSION_KEY پاک شد', t.W('Store.get("sms_session_v1")') === null);
    t.dom.window.close();
  }

  console.log('\n▸ H — ورود: پاسخ ۲۰۰ ولی بدنهٔ رد (ok:false + user)');
  {
    const t = await boot({ url: 'http://localhost/', rules: {
      '/api/health': { body: { ok: true } },
      '/api/auth/me': { status: 401, body: { ok: false, code: 'no_session' } },
      '/api/auth/login': (w) => jres({ ok: false, code: 'bad_code', user: { id: w.eval('db.users.find(function(x){return x.username==="superadmin";}).id') } }, 200)
    } });
    fillLogin(t, '0000');
    t.W(`document.querySelector('[data-act="login"]').click()`);
    await sleep(700);
    chk('H1 — ردِ بدنه با ۲۰۰ هم معتبر است: S.user نمی‌شود', t.W('S.user') === null);
    chk('H2 — پیامِ خطای بدنه روی فرم', ((t.W(`(document.getElementById('lerr')||{}).textContent||''`)) || '').includes('کد'));
    t.dom.window.close();
  }

  console.log('\n' + '─'.repeat(56));
  const total = okc + failc;
  console.log(`server2 (کلاینتِ اتصال): ${okc}/${total} — ✅ ${okc} · ❌ ${failc}`);
  if (failc) { console.log('فشل:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('همهٔ تست‌های کلاینتِ اتصال سبز ✅');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

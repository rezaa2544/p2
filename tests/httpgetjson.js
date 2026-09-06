/* ─────────────────────────────────────────────────────────────
   httpgetjson.js — قراردادِ تازهٔ httpGetJson (دور ۸۵, P1-2)
   ─────────────────────────────────────────────────────────────
   خروجیِ هم‌شکل و همیشه-resolved: { ok, status, code, serverTime,
   data, error, networkError?, timedOut? }
   H1  200 + JSON      → ok:true + data + error:null + serverTime
   H2  403 + JSON      → ok:false + status:403 + data (تمایز 4xx)
   H3  500 + JSON      → ok:false + status:500 (تمایز 5xx)
   H4  200 + JSON خراب → data:null + error:'bad_json' (بدون کرش)
   H5  خطای شبکه       → resolve (نه reject) + networkError:true
   H6  مهلت (timeout)  → resolve + timedOut:true
   H7  detectServer با سرورِ مرده → DATA_MODE باقیِ local (رفتارِ قدیمی)
   H8  diagProbeHealth با شبکهٔ مرده → پیامِ «وصل به سرور نشد» (همیشه)
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
const jres = (obj, status, date) => ({
  ok: (status || 200) < 400, status: status || 200,
  json: async () => obj,
  headers: { get: (h) => (h === 'Date' ? (date || 'Mon, 07 Sep 2026 12:00:00 GMT') : null) }
});

async function boot(opts) {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: opts.url || 'about:blank',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = function (url, o) {
        const p = String(url).split('?')[0];
        const rule = (opts.rules || {})[p];
        if (!rule) return Promise.resolve(jres({}, 404));
        if (typeof rule === 'function') return Promise.resolve(rule(w, o));
        if (rule.reject) return Promise.reject(new Error(rule.reject));
        if (rule.badJson) return Promise.resolve({ ok: (rule.status || 200) < 400, status: rule.status || 200, json: () => Promise.reject(new Error('unexpected token <')), headers: { get: () => null } });
        return Promise.resolve(jres(rule.body || {}, rule.status, rule.date));
      };
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(opts.wait || 1700);
  return { dom, W };
}
async function callHttpGetJson(W, url, timeoutMs) {
  W(`window.__hgj = null; httpGetJson(${JSON.stringify(url)}, ${timeoutMs || 2500}).then(function(r){ window.__hgj = r; }, function(e){ window.__hgj = 'REJECTED:' + String((e && e.message) || e); });`);
  for (let i = 0; i < 50; i++) { if (W('window.__hgj !== null')) break; await sleep(100); }
  return W('window.__hgj');
}

(async () => {
  console.log('\n▸ P1-2 — قراردادِ تازهٔ httpGetJson (jsdom)');

  /* — H1..H6: شکلِ پاسخ — */
  {
    const t = await boot({ rules: {
      '/h200': { body: { ok: true, hello: 'world' }, date: 'Mon, 07 Sep 2026 12:00:00 GMT' },
      '/h403': { body: { ok: false, code: 'denied' }, status: 403 },
      '/h500': { body: { ok: false, code: 'boom' }, status: 500 },
      '/hbad': { badJson: true, status: 200 },
      '/hnet': { reject: 'connect ECONNREFUSED 127.0.0.1:9999' },
      '/htimeout': (w, o) => new Promise((res, rej) => {
        const s = o && o.signal;
        if (s && s.addEventListener) s.addEventListener('abort', () => rej(new Error('AbortError')));
      })
    } });
    const W = t.W;

    const r1 = await callHttpGetJson(W, '/h200');
    chk('H1 200: ok:true + data + error:null', r1 && r1.ok === true && r1.status === 200 && r1.code === 200 && r1.data && r1.data.hello === 'world' && r1.error === null, JSON.stringify(r1).slice(0, 140));
    chk('H1b serverTime از سرآیندهٔ Date', r1 && r1.serverTime === 'Mon, 07 Sep 2026 12:00:00 GMT', JSON.stringify(r1 && r1.serverTime));

    const r2 = await callHttpGetJson(W, '/h403');
    chk('H2 403: ok:false + status:403 + data (بدون کرش)', r2 && r2.ok === false && r2.status === 403 && r2.code === 403 && r2.data && r2.data.code === 'denied' && r2.error === null, JSON.stringify(r2).slice(0, 140));

    const r3 = await callHttpGetJson(W, '/h500');
    chk('H3 500: ok:false + status:500', r3 && r3.ok === false && r3.status === 500 && r3.data && r3.data.code === 'boom', JSON.stringify(r3).slice(0, 140));

    const r4 = await callHttpGetJson(W, '/hbad');
    chk('H4 JSON خراب: data:null + bad_json (بدون کرش)', r4 && r4.ok === true && r4.data === null && r4.error === 'bad_json', JSON.stringify(r4).slice(0, 140));

    const r5 = await callHttpGetJson(W, '/hnet');
    chk('H5 خطای شبکه: resolve + networkError (نه reject)', r5 && r5.ok === false && r5.status === 0 && r5.data === null && r5.networkError === true && String(r5.error).indexOf('network:') === 0, JSON.stringify(r5).slice(0, 140));

    const r6 = await callHttpGetJson(W, '/htimeout', 200);
    chk('H6 مهلت: resolve + timedOut:true', r6 && r6.ok === false && r6.timedOut === true && String(r6.error).indexOf('timeout:') === 0, JSON.stringify(r6).slice(0, 140));

    t.dom.window.close();
  }

  /* — H7: detectServer با سرورِ مرده (رفتارِ قدیمی) — */
  {
    const t = await boot({ url: 'http://localhost/', rules: {
      '/api/health': { reject: 'connect ECONNREFUSED' },
      '/api/auth/me': { reject: 'connect ECONNREFUSED' }
    } });
    chk('H7 سرورِ مرده: DATA_MODE باقیِ local (بدونِ خطا)', t.W('DATA_MODE') === 'local' && t.W('SYNC.demoMode') === true);
    t.dom.window.close();
  }

  /* — H8: diagProbeHealth با شبکهٔ مرده — پیامِ همیشه — */
  {
    const t = await boot({ url: 'http://localhost/', rules: {
      '/api/health': { reject: 'connect ECONNREFUSED' },
      '/api/auth/me': { reject: 'connect ECONNREFUSED' },
      'x/api/health': { reject: 'connect ECONNREFUSED' }
    } });
    const W = t.W;
    W(`Store.set('payesh_server_url_v1', 'x'); window.__diag = null;
       diagProbeHealth().then(function(r){ window.__diag = r; }, function(e){ window.__diag = { ok:false, msg:'REJECTED' + String(e) }; });`);
    for (let i = 0; i < 50; i++) { if (W('window.__diag !== null')) break; await sleep(100); }
    const d = W('window.__diag');
    chk('H8 diagProbeHealth: «وصل به سرور نشد» با جزئیات', d && d.ok === false && d.probed === true && String(d.msg).indexOf('وصل به سرور نشد:') === 0, JSON.stringify(d).slice(0, 160));
    const rec = W('DIAG_PROBES.health');
    chk('H8b rec با err ذخیره شد (برایِ چکِ api-health)', rec && rec.ok === false && typeof rec.err === 'string' && rec.err.length > 0, JSON.stringify(rec).slice(0, 140));
    t.dom.window.close();
  }

  console.log('\nhttpgetjson: ' + okc + '/' + (okc + failc) + (failc ? ' — شکست: ' + fails.join(' | ') : '  ✅'));
  process.exit(failc ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

/* ─────────────────────────────────────────────────────────────
   deadletter.js — صفِ مردگانِ همگام‌سازی (دور ۸۵, P0-2)
   ─────────────────────────────────────────────────────────────
   سناریوی اصلی: یک op سالم + یک op خراب (جعلِ statusِ leaves)
   در یک دسته. پس از ردِّ خراب، op سالم باید ارسال شود و op خراب
   باید از چرخهٔ ارسال بیرون بماند (rejected).

   D1  حالتِ سروری (DATA_MODE=server, demoMode=false)
   D2  دستهٔ مخلوط: op سالم از صف حذف می‌شود (synced)
   D3  op خراب باقی می‌ماند با وضعیت rejected
   D4  شمارنده‌ها: rejected=1, pending=0
   D5  op سالمِ تازه: ارسال می‌شود و op خراب در بدنه نیست
   D6  ردِّ کل‌دستهٔ 403: همهٔ opها rejected (بدونِ حلقهٔ ابدی)
   D7  401 (نشست): گذرا — op در صف می‌ماند (failed)
   D8  500: گذرا — op در صف می‌ماند (failed)
   D9  duplicate_ignored: از صف حذف می‌شود (synced)
   D10 نشانگر + پنل: «رد شده» با شمارنده نمایش داده می‌شود
   D11 sync-del: حذفِ دستیِ opِ ردشده از صف
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

(async () => {
  console.log('\n▸ P0-2 — dead-letter صفِ همگام‌سازی (jsdom)');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.__bodies = [];      /* بدنهٔ هر POST /api/sync */
      w.__syncMode = 'mixed';
      w.fetch = function (url, o) {
        const p = String(url).split('?')[0];
        if (p === '/api/health') return Promise.resolve(jres({ ok: true }));
        if (p === '/api/auth/me') return Promise.resolve(jres({ ok: false, code: 'no_session' }, 401));
        if (p === '/api/sync') {
          let body = null;
          try { body = o && o.body ? JSON.parse(o.body) : null; } catch (e) {}
          w.__bodies.push(body);
          const mode = w.__syncMode;
          const ops = (body && body.ops) || [];
          if (mode === 'mixed') {
            const results = ops.map(op => {
              const forged = op.c === 'leaves' && op.data && op.data.status === 'approved';
              return forged
                ? { uid: op.uid, ok: false, code: 'field_denied', message: 'تغییر این فیلد برای نقش شما مجاز نیست' }
                : { uid: op.uid, ok: true };
            });
            return Promise.resolve(jres({ results }));
          }
          if (mode === '403') return Promise.resolve(jres({ ok: false, code: 'role_denied', message: 'نقش شما اجازهٔ نوشتن ندارد' }, 403));
          if (mode === '401') return Promise.resolve(jres({ ok: false, code: 'no_session' }, 401));
          if (mode === '500') return Promise.resolve(jres({}, 500));
          if (mode === 'dup') return Promise.resolve(jres({ results: ops.map(op => ({ uid: op.uid, ok: false, code: 'duplicate_ignored', message: 'قبلاً اعمال شده' })) }));
          return Promise.resolve(jres({ results: ops.map(op => ({ uid: op.uid, ok: true })) }));
        }
        return Promise.resolve(jres({}, 404));
      };
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);

  chk('D1 حالتِ سروری', W('DATA_MODE') === 'server' && W('SYNC.demoMode') === false && W('SYNC.serverUrl') === '/api/sync');

  /* آماده‌سازی: کاربر مدیر + صف خاموش تا ارسال را خودمان زمان‌بندی کنیم */
  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' };
     SYNC.online = false;`);
  const uidA = W(`enqueueOp({ t:'upd', c:'grades', id: 3, data:{ score: 10 }, by: 5 }).uid`);
  const uidB = W(`enqueueOp({ t:'upd', c:'leaves', id: 9, data:{ status: 'approved' }, by: 5 }).uid`);
  chk('D1b دو op در صف (سالم + جعلی)', W('SYNC.queue.length') === 2);

  /* — سیکل ۱: دستهٔ مخلوط — */
  W(`SYNC.online = true; window.__dl = false; syncNow(true).then(function(){ window.__dl = true; });`);
  for (let i = 0; i < 40 && !W('window.__dl'); i++) await sleep(100);
  chk('D1c سیکلِ ۱ تمام شد', W('window.__dl') === true);

  chk('D2 op سالم از صف حذف شد', !W(`SYNC.queue.some(function(x){ return x.uid === '${uidA}'; })`));
  const stB = W(`(function(){ var x = SYNC.queue.find(function(y){ return y.uid === '${uidB}'; }); return x ? x.status : null; })()`);
  chk('D3 op خراب باقی مانده با وضعیت rejected', stB === 'rejected', 'st=' + stB);
  const errB = W(`(function(){ var x = SYNC.queue.find(function(y){ return y.uid === '${uidB}'; }); return x ? (x.error || '') : ''; })()`);
  chk('D3b op خراب دلیلِ رد را دارد', typeof errB === 'string' && errB.length > 0, errB);
  chk('D4 شمارنده‌ها: rejected=1 و pending=0', W('rejectedCount()') === 1 && W('pendingCount()') === 0,
      'rej=' + W('rejectedCount()') + ' pend=' + W('pendingCount()'));

  /* — سیکل ۲: op سالمِ تازه باید ردِّ خراب را دور بزند — */
  const uidC = W(`enqueueOp({ t:'upd', c:'grades', id: 4, data:{ score: 12 }, by: 5 }).uid`);
  W(`SYNC.online = true; window.__dl = false; syncNow(true).then(function(){ window.__dl = true; });`);
  for (let i = 0; i < 40 && !W('window.__dl'); i++) await sleep(100);
  const last = W(`window.__bodies[window.__bodies.length - 1]`) || null;
  const sentUids = last ? last.ops.map(o => o.uid) : [];
  chk('D5 op سالمِ تازه ارسال شد', sentUids.indexOf(uidC) > -1, JSON.stringify(sentUids));
  chk('D5b op خراب در بدنهٔ ارسال نبود', sentUids.indexOf(uidB) === -1, JSON.stringify(sentUids));
  chk('D5c op سالم از صف خارج شد', !W(`SYNC.queue.some(function(x){ return x.uid === '${uidC}'; })`));

  /* — سیکل ۳: ردِّ کل‌دسته (403) — بدون حلقهٔ ابدی — */
  W(`__syncMode = '403';`);
  const uidD = W(`enqueueOp({ t:'upd', c:'grades', id: 5, data:{ score: 8 }, by: 5 }).uid`);
  const uidE = W(`enqueueOp({ t:'upd', c:'grades', id: 6, data:{ score: 9 }, by: 5 }).uid`);
  W(`SYNC.online = true; window.__dl = false; syncNow(true).then(function(){ window.__dl = true; });`);
  for (let i = 0; i < 40 && !W('window.__dl'); i++) await sleep(100);
  const st403 = W(`(function(){ var m = {}; ['${uidD}','${uidE}'].forEach(function(u){ var x = SYNC.queue.find(function(y){ return y.uid === u; }); m[u] = x ? x.status : 'gone'; }); return m; })()`);
  chk('D6 ردِّ 403: هر دو op به rejected شدند', st403[uidD] === 'rejected' && st403[uidE] === 'rejected', JSON.stringify(st403));
  chk('D6b صفِ قابلِ ارسال خالی است (حلقهٔ ابدی نیست)', W('pendingCount()') === 0, 'pend=' + W('pendingCount()'));

  /* — سیکل ۴: 401 گذرا — */
  W(`__syncMode = '401';`);
  const uidF = W(`enqueueOp({ t:'upd', c:'grades', id: 7, data:{ score: 7 }, by: 5 }).uid`);
  W(`SYNC.online = true; window.__dl = false; syncNow(true).then(function(){ window.__dl = true; });`);
  for (let i = 0; i < 40 && !W('window.__dl'); i++) await sleep(100);
  chk('D7 401: op در صف می‌ماند (failed، قابلِ تلاش)', W(`(function(){ var x = SYNC.queue.find(function(y){ return y.uid === '${uidF}'; }); return x ? x.status : null; })()`) === 'failed');

  /* — سیکل ۵: 500 گذرا — */
  W(`__syncMode = '500';`);
  const uidG = W(`enqueueOp({ t:'upd', c:'grades', id: 8, data:{ score: 6 }, by: 5 }).uid`);
  W(`SYNC.online = true; window.__dl = false; syncNow(true).then(function(){ window.__dl = true; });`);
  for (let i = 0; i < 40 && !W('window.__dl'); i++) await sleep(100);
  chk('D8 500: op در صف می‌ماند (failed)', W(`(function(){ var x = SYNC.queue.find(function(y){ return y.uid === '${uidG}'; }); return x ? x.status : null; })()`) === 'failed');

  /* — سیکل ۶: duplicate_ignored — */
  W(`__syncMode = 'dup';`);
  const uidH = W(`enqueueOp({ t:'upd', c:'grades', id: 9, data:{ score: 5 }, by: 5 }).uid`);
  W(`SYNC.online = true; window.__dl = false; syncNow(true).then(function(){ window.__dl = true; });`);
  for (let i = 0; i < 40 && !W('window.__dl'); i++) await sleep(100);
  chk('D9 duplicate_ignored: op از صف حذف شد', !W(`SYNC.queue.some(function(x){ return x.uid === '${uidH}'; })`));

  /* — نمایش — */
  const badge = W('syncBadge()');
  chk('D10 نشانگر «رد شده» با شمارنده', badge.indexOf('رد شده') > -1, String(badge).slice(0, 120));
  W('syncPanelModal()');
  await sleep(100);
  const panelHtml = dom.window.document.body.innerHTML;
  chk('D10b پنل: «رد شده» + دکمهٔ حذف', panelHtml.indexOf('رد شده') > -1 && panelHtml.indexOf('data-act="sync-del"') > -1);

  /* — حذف دستی — */
  const before = W('SYNC.queue.length');
  W(`SYNC_ACTIONS['sync-del']({ dataset: { uid: '${uidD}' } });`);
  chk('D11 sync-del: opِ ردشده حذف شد', W('SYNC.queue.length') === before - 1 &&
      !W(`SYNC.queue.some(function(x){ return x.uid === '${uidD}'; })`));

  dom.window.close();
  console.log('\ndeadletter: ' + okc + '/' + (okc + failc) + (failc ? ' — شکست: ' + fails.join(' | ') : '  ✅'));
  process.exit(failc ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
